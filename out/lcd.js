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

var ASM_CONSTS = [function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1, $2, $3) { window.MbedJSHal.C12832.update_display($0, $1, $2, new Uint8Array(Module.HEAPU8.buffer, $3, 4096)); },
 function($0, $1, $2) { window.MbedJSHal.C12832.init($0, $1, $2); },
 function($0) { console.log("TextDisplay putc", $0); }];

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



var debug_table_ii = ["0", "__ZN4mbed10FileHandle4syncEv", "__ZN4mbed10FileHandle6isattyEv", "__ZN4mbed10FileHandle4tellEv", "__ZN4mbed10FileHandle4sizeEv", "__ZN4mbed10FileHandle5fsyncEv", "__ZN4mbed10FileHandle4flenEv", "__ZN4mbed6Stream5closeEv", "__ZN4mbed6Stream4syncEv", "__ZN4mbed6Stream6isattyEv", "__ZN4mbed6Stream4tellEv", "__ZN4mbed6Stream4sizeEv", "__ZN11TextDisplay5_getcEv", "__ZN6C128324rowsEv", "__ZN6C128327columnsEv", "__ZN6C128325widthEv", "__ZN6C128326heightEv", "__ZN15GraphicsDisplay4rowsEv", "__ZN15GraphicsDisplay7columnsEv", "___stdio_close", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_iii = ["0", "__ZN4mbed10FileHandle12set_blockingEb", "__ZNK4mbed10FileHandle4pollEs", "__ZN6C128325_putcEi", "__ZN11TextDisplay5claimEP8_IO_FILE", "__ZN11TextDisplay5_putcEi", "0", "0"];
var debug_table_iiii = ["0", "__ZN4mbed10FileHandle5lseekEii", "__ZN4mbed6Stream4readEPvj", "__ZN4mbed6Stream5writeEPKvj", "__ZN4mbed6Stream4seekEii", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_read", "0", "0", "0", "0", "0"];
var debug_table_v = ["0", "___cxa_pure_virtual", "__ZL25default_terminate_handlerv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev"];
var debug_table_vi = ["0", "__ZN4mbed8FileBaseD2Ev", "__ZN4mbed8FileBaseD0Ev", "__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev", "__ZN4mbed10FileHandleD0Ev", "__ZN4mbed10FileHandle6rewindEv", "__ZN4mbed6StreamD2Ev", "__ZN4mbed6StreamD0Ev", "__ZN4mbed6Stream6rewindEv", "__ZN4mbed6Stream4lockEv", "__ZN4mbed6Stream6unlockEv", "__ZThn4_N4mbed6StreamD1Ev", "__ZThn4_N4mbed6StreamD0Ev", "__ZN6C12832D0Ev", "__ZN6C128326_flushEv", "__ZN6C128323clsEv", "__ZThn4_N6C12832D1Ev", "__ZThn4_N6C12832D0Ev", "__ZN15GraphicsDisplayD0Ev", "__ZN15GraphicsDisplay3clsEv", "__ZThn4_N15GraphicsDisplayD1Ev", "__ZThn4_N15GraphicsDisplayD0Ev", "__ZN11TextDisplayD0Ev", "__ZN11TextDisplay3clsEv", "__ZThn4_N11TextDisplayD1Ev", "__ZThn4_N11TextDisplayD0Ev", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed10FileHandle5lseekEii__async_cb", "__ZN4mbed10FileHandle5fsyncEv__async_cb", "__ZN4mbed10FileHandle4flenEv__async_cb", "__ZN4mbed8FileBaseD2Ev__async_cb_90", "__ZN4mbed8FileBaseD2Ev__async_cb", "__ZN4mbed8FileBaseD2Ev__async_cb_91", "__ZN4mbed8FileBaseD0Ev__async_cb_80", "__ZN4mbed8FileBaseD0Ev__async_cb", "__ZN4mbed8FileBaseD0Ev__async_cb_81", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_11", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb", "__ZN4mbed10FileHandle4tellEv__async_cb", "__ZN4mbed10FileHandle6rewindEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb_98", "__ZN4mbed10FileHandle4sizeEv__async_cb_99", "__ZN4mbed6StreamD2Ev__async_cb", "__ZN4mbed6StreamD2Ev__async_cb_16", "__ZN4mbed6Stream4readEPvj__async_cb", "__ZN4mbed6Stream4readEPvj__async_cb_28", "__ZN4mbed6Stream4readEPvj__async_cb_29", "__ZN4mbed6Stream5writeEPKvj__async_cb", "__ZN4mbed6Stream5writeEPKvj__async_cb_21", "__ZN4mbed6Stream5writeEPKvj__async_cb_22", "__ZThn4_N4mbed6StreamD1Ev__async_cb", "__ZThn4_N4mbed6StreamD1Ev__async_cb_79", "__ZN4mbed6StreamC2EPKc__async_cb_48", "__ZN4mbed6StreamC2EPKc__async_cb", "__ZN4mbed6Stream4putcEi__async_cb", "__ZN4mbed6Stream4putcEi__async_cb_89", "__ZN4mbed6Stream4putcEi__async_cb_87", "__ZN4mbed6Stream4putcEi__async_cb_88", "__ZN4mbed6Stream6printfEPKcz__async_cb", "__ZN4mbed6Stream6printfEPKcz__async_cb_5", "__ZN4mbed6Stream6printfEPKcz__async_cb_2", "__ZN4mbed6Stream6printfEPKcz__async_cb_3", "__ZN4mbed6Stream6printfEPKcz__async_cb_4", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_45", "_mbed_die__async_cb_44", "_mbed_die__async_cb_43", "_mbed_die__async_cb_42", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_printf__async_cb_82", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_17", "_error__async_cb", "_serial_putc__async_cb_71", "_serial_putc__async_cb", "_invoke_ticker__async_cb_93", "_invoke_ticker__async_cb", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_6", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb", "_exit__async_cb", "__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__ZN6C12832D0Ev__async_cb", "__ZN6C128325_putcEi__async_cb", "__ZN6C128325_putcEi__async_cb_1", "__ZN6C128329characterEiii__async_cb", "__ZN6C128329characterEiii__async_cb_7", "__ZN6C128329characterEiii__async_cb_8", "__ZN6C128329characterEiii__async_cb_9", "__ZN6C128324rowsEv__async_cb", "__ZN6C128327columnsEv__async_cb", "__ZThn4_N6C12832D1Ev__async_cb", "__ZThn4_N6C12832D0Ev__async_cb", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_13", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb", "__ZN6C128328print_bmE6Bitmapii__async_cb", "__ZN6C128328print_bmE6Bitmapii__async_cb_18", "__ZN15GraphicsDisplay9characterEiii__async_cb", "__ZN15GraphicsDisplay4rowsEv__async_cb", "__ZN15GraphicsDisplay7columnsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb_85", "__ZN15GraphicsDisplay3clsEv__async_cb_86", "__ZN15GraphicsDisplay4putpEi__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb_47", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_19", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_12", "__ZThn4_N15GraphicsDisplayD1Ev__async_cb", "__ZN15GraphicsDisplayC2EPKc__async_cb_92", "__ZN15GraphicsDisplayC2EPKc__async_cb", "__ZN11TextDisplay5_putcEi__async_cb", "__ZN11TextDisplay5_putcEi__async_cb_72", "__ZN11TextDisplay5_putcEi__async_cb_73", "__ZN11TextDisplay5_putcEi__async_cb_74", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_46", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb", "__ZN11TextDisplay3clsEv__async_cb", "__ZN11TextDisplay3clsEv__async_cb_23", "__ZN11TextDisplay3clsEv__async_cb_24", "__ZN11TextDisplay3clsEv__async_cb_27", "__ZN11TextDisplay3clsEv__async_cb_25", "__ZN11TextDisplay3clsEv__async_cb_26", "__ZThn4_N11TextDisplayD1Ev__async_cb", "__ZN11TextDisplayC2EPKc__async_cb_76", "__ZN11TextDisplayC2EPKc__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb_50", "_main__async_cb_49", "_main__async_cb_58", "_main__async_cb_57", "_main__async_cb_62", "_main__async_cb_56", "_main__async_cb_55", "_main__async_cb_61", "_main__async_cb_54", "_main__async_cb_53", "_main__async_cb_60", "_main__async_cb_52", "_main__async_cb_51", "_main__async_cb_59", "_main__async_cb", "_putc__async_cb_15", "_putc__async_cb", "___overflow__async_cb", "_fclose__async_cb_63", "_fclose__async_cb", "_fflush__async_cb_69", "_fflush__async_cb_68", "_fflush__async_cb_70", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_100", "_vfprintf__async_cb", "_vsnprintf__async_cb", "_sprintf__async_cb", "_vsprintf__async_cb", "_freopen__async_cb", "_freopen__async_cb_66", "_freopen__async_cb_65", "_freopen__async_cb_64", "_fputc__async_cb_20", "_fputc__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__Znaj__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_83", "_abort_message__async_cb", "_abort_message__async_cb_77", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_10", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_84", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_78", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_14", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_97", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_96", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_95", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_75", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 4403
 STACKTOP = STACKTOP + 16 | 0; //@line 4404
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4404
 $1 = sp; //@line 4405
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4412
   $7 = $6 >>> 3; //@line 4413
   $8 = HEAP32[3264] | 0; //@line 4414
   $9 = $8 >>> $7; //@line 4415
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4421
    $16 = 13096 + ($14 << 1 << 2) | 0; //@line 4423
    $17 = $16 + 8 | 0; //@line 4424
    $18 = HEAP32[$17 >> 2] | 0; //@line 4425
    $19 = $18 + 8 | 0; //@line 4426
    $20 = HEAP32[$19 >> 2] | 0; //@line 4427
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3264] = $8 & ~(1 << $14); //@line 4434
     } else {
      if ((HEAP32[3268] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4439
      }
      $27 = $20 + 12 | 0; //@line 4442
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4446
       HEAP32[$17 >> 2] = $20; //@line 4447
       break;
      } else {
       _abort(); //@line 4450
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4455
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4458
    $34 = $18 + $30 + 4 | 0; //@line 4460
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4463
    $$0 = $19; //@line 4464
    STACKTOP = sp; //@line 4465
    return $$0 | 0; //@line 4465
   }
   $37 = HEAP32[3266] | 0; //@line 4467
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4473
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4476
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4479
     $49 = $47 >>> 12 & 16; //@line 4481
     $50 = $47 >>> $49; //@line 4482
     $52 = $50 >>> 5 & 8; //@line 4484
     $54 = $50 >>> $52; //@line 4486
     $56 = $54 >>> 2 & 4; //@line 4488
     $58 = $54 >>> $56; //@line 4490
     $60 = $58 >>> 1 & 2; //@line 4492
     $62 = $58 >>> $60; //@line 4494
     $64 = $62 >>> 1 & 1; //@line 4496
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4499
     $69 = 13096 + ($67 << 1 << 2) | 0; //@line 4501
     $70 = $69 + 8 | 0; //@line 4502
     $71 = HEAP32[$70 >> 2] | 0; //@line 4503
     $72 = $71 + 8 | 0; //@line 4504
     $73 = HEAP32[$72 >> 2] | 0; //@line 4505
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4511
       HEAP32[3264] = $77; //@line 4512
       $98 = $77; //@line 4513
      } else {
       if ((HEAP32[3268] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4518
       }
       $80 = $73 + 12 | 0; //@line 4521
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4525
        HEAP32[$70 >> 2] = $73; //@line 4526
        $98 = $8; //@line 4527
        break;
       } else {
        _abort(); //@line 4530
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4535
     $84 = $83 - $6 | 0; //@line 4536
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4539
     $87 = $71 + $6 | 0; //@line 4540
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4543
     HEAP32[$71 + $83 >> 2] = $84; //@line 4545
     if ($37 | 0) {
      $92 = HEAP32[3269] | 0; //@line 4548
      $93 = $37 >>> 3; //@line 4549
      $95 = 13096 + ($93 << 1 << 2) | 0; //@line 4551
      $96 = 1 << $93; //@line 4552
      if (!($98 & $96)) {
       HEAP32[3264] = $98 | $96; //@line 4557
       $$0199 = $95; //@line 4559
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4559
      } else {
       $101 = $95 + 8 | 0; //@line 4561
       $102 = HEAP32[$101 >> 2] | 0; //@line 4562
       if ((HEAP32[3268] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4566
       } else {
        $$0199 = $102; //@line 4569
        $$pre$phiZ2D = $101; //@line 4569
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4572
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4574
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4576
      HEAP32[$92 + 12 >> 2] = $95; //@line 4578
     }
     HEAP32[3266] = $84; //@line 4580
     HEAP32[3269] = $87; //@line 4581
     $$0 = $72; //@line 4582
     STACKTOP = sp; //@line 4583
     return $$0 | 0; //@line 4583
    }
    $108 = HEAP32[3265] | 0; //@line 4585
    if (!$108) {
     $$0197 = $6; //@line 4588
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4592
     $114 = $112 >>> 12 & 16; //@line 4594
     $115 = $112 >>> $114; //@line 4595
     $117 = $115 >>> 5 & 8; //@line 4597
     $119 = $115 >>> $117; //@line 4599
     $121 = $119 >>> 2 & 4; //@line 4601
     $123 = $119 >>> $121; //@line 4603
     $125 = $123 >>> 1 & 2; //@line 4605
     $127 = $123 >>> $125; //@line 4607
     $129 = $127 >>> 1 & 1; //@line 4609
     $134 = HEAP32[13360 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4614
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4618
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4624
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4627
      $$0193$lcssa$i = $138; //@line 4627
     } else {
      $$01926$i = $134; //@line 4629
      $$01935$i = $138; //@line 4629
      $146 = $143; //@line 4629
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4634
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4635
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4636
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4637
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4643
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4646
        $$0193$lcssa$i = $$$0193$i; //@line 4646
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4649
        $$01935$i = $$$0193$i; //@line 4649
       }
      }
     }
     $157 = HEAP32[3268] | 0; //@line 4653
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4656
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4659
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4662
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4666
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4668
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4672
       $176 = HEAP32[$175 >> 2] | 0; //@line 4673
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4676
        $179 = HEAP32[$178 >> 2] | 0; //@line 4677
        if (!$179) {
         $$3$i = 0; //@line 4680
         break;
        } else {
         $$1196$i = $179; //@line 4683
         $$1198$i = $178; //@line 4683
        }
       } else {
        $$1196$i = $176; //@line 4686
        $$1198$i = $175; //@line 4686
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4689
        $182 = HEAP32[$181 >> 2] | 0; //@line 4690
        if ($182 | 0) {
         $$1196$i = $182; //@line 4693
         $$1198$i = $181; //@line 4693
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4696
        $185 = HEAP32[$184 >> 2] | 0; //@line 4697
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4702
         $$1198$i = $184; //@line 4702
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4707
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4710
        $$3$i = $$1196$i; //@line 4711
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4716
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4719
       }
       $169 = $167 + 12 | 0; //@line 4722
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4726
       }
       $172 = $164 + 8 | 0; //@line 4729
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4733
        HEAP32[$172 >> 2] = $167; //@line 4734
        $$3$i = $164; //@line 4735
        break;
       } else {
        _abort(); //@line 4738
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4747
       $191 = 13360 + ($190 << 2) | 0; //@line 4748
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4753
         if (!$$3$i) {
          HEAP32[3265] = $108 & ~(1 << $190); //@line 4759
          break L73;
         }
        } else {
         if ((HEAP32[3268] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4766
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4774
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3268] | 0; //@line 4784
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4787
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4791
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4793
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4799
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4803
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4805
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4811
       if ($214 | 0) {
        if ((HEAP32[3268] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4817
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4821
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4823
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4831
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4834
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4836
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4839
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4843
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4846
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4848
      if ($37 | 0) {
       $234 = HEAP32[3269] | 0; //@line 4851
       $235 = $37 >>> 3; //@line 4852
       $237 = 13096 + ($235 << 1 << 2) | 0; //@line 4854
       $238 = 1 << $235; //@line 4855
       if (!($8 & $238)) {
        HEAP32[3264] = $8 | $238; //@line 4860
        $$0189$i = $237; //@line 4862
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4862
       } else {
        $242 = $237 + 8 | 0; //@line 4864
        $243 = HEAP32[$242 >> 2] | 0; //@line 4865
        if ((HEAP32[3268] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4869
        } else {
         $$0189$i = $243; //@line 4872
         $$pre$phi$iZ2D = $242; //@line 4872
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4875
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4877
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4879
       HEAP32[$234 + 12 >> 2] = $237; //@line 4881
      }
      HEAP32[3266] = $$0193$lcssa$i; //@line 4883
      HEAP32[3269] = $159; //@line 4884
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4887
     STACKTOP = sp; //@line 4888
     return $$0 | 0; //@line 4888
    }
   } else {
    $$0197 = $6; //@line 4891
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4896
   } else {
    $251 = $0 + 11 | 0; //@line 4898
    $252 = $251 & -8; //@line 4899
    $253 = HEAP32[3265] | 0; //@line 4900
    if (!$253) {
     $$0197 = $252; //@line 4903
    } else {
     $255 = 0 - $252 | 0; //@line 4905
     $256 = $251 >>> 8; //@line 4906
     if (!$256) {
      $$0358$i = 0; //@line 4909
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4913
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4917
       $262 = $256 << $261; //@line 4918
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4921
       $267 = $262 << $265; //@line 4923
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4926
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4931
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4937
      }
     }
     $282 = HEAP32[13360 + ($$0358$i << 2) >> 2] | 0; //@line 4941
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4945
       $$3$i203 = 0; //@line 4945
       $$3350$i = $255; //@line 4945
       label = 81; //@line 4946
      } else {
       $$0342$i = 0; //@line 4953
       $$0347$i = $255; //@line 4953
       $$0353$i = $282; //@line 4953
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4953
       $$0362$i = 0; //@line 4953
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4958
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4963
          $$435113$i = 0; //@line 4963
          $$435712$i = $$0353$i; //@line 4963
          label = 85; //@line 4964
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4967
          $$1348$i = $292; //@line 4967
         }
        } else {
         $$1343$i = $$0342$i; //@line 4970
         $$1348$i = $$0347$i; //@line 4970
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4973
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4976
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4980
        $302 = ($$0353$i | 0) == 0; //@line 4981
        if ($302) {
         $$2355$i = $$1363$i; //@line 4986
         $$3$i203 = $$1343$i; //@line 4986
         $$3350$i = $$1348$i; //@line 4986
         label = 81; //@line 4987
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4990
         $$0347$i = $$1348$i; //@line 4990
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4990
         $$0362$i = $$1363$i; //@line 4990
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 5000
       $309 = $253 & ($306 | 0 - $306); //@line 5003
       if (!$309) {
        $$0197 = $252; //@line 5006
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 5011
       $315 = $313 >>> 12 & 16; //@line 5013
       $316 = $313 >>> $315; //@line 5014
       $318 = $316 >>> 5 & 8; //@line 5016
       $320 = $316 >>> $318; //@line 5018
       $322 = $320 >>> 2 & 4; //@line 5020
       $324 = $320 >>> $322; //@line 5022
       $326 = $324 >>> 1 & 2; //@line 5024
       $328 = $324 >>> $326; //@line 5026
       $330 = $328 >>> 1 & 1; //@line 5028
       $$4$ph$i = 0; //@line 5034
       $$4357$ph$i = HEAP32[13360 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 5034
      } else {
       $$4$ph$i = $$3$i203; //@line 5036
       $$4357$ph$i = $$2355$i; //@line 5036
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 5040
       $$4351$lcssa$i = $$3350$i; //@line 5040
      } else {
       $$414$i = $$4$ph$i; //@line 5042
       $$435113$i = $$3350$i; //@line 5042
       $$435712$i = $$4357$ph$i; //@line 5042
       label = 85; //@line 5043
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 5048
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 5052
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 5053
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 5054
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 5055
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5061
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 5064
        $$4351$lcssa$i = $$$4351$i; //@line 5064
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 5067
        $$435113$i = $$$4351$i; //@line 5067
        label = 85; //@line 5068
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 5074
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3266] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3268] | 0; //@line 5080
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 5083
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 5086
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 5089
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 5093
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 5095
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 5099
         $371 = HEAP32[$370 >> 2] | 0; //@line 5100
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 5103
          $374 = HEAP32[$373 >> 2] | 0; //@line 5104
          if (!$374) {
           $$3372$i = 0; //@line 5107
           break;
          } else {
           $$1370$i = $374; //@line 5110
           $$1374$i = $373; //@line 5110
          }
         } else {
          $$1370$i = $371; //@line 5113
          $$1374$i = $370; //@line 5113
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 5116
          $377 = HEAP32[$376 >> 2] | 0; //@line 5117
          if ($377 | 0) {
           $$1370$i = $377; //@line 5120
           $$1374$i = $376; //@line 5120
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 5123
          $380 = HEAP32[$379 >> 2] | 0; //@line 5124
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 5129
           $$1374$i = $379; //@line 5129
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 5134
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 5137
          $$3372$i = $$1370$i; //@line 5138
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 5143
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 5146
         }
         $364 = $362 + 12 | 0; //@line 5149
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 5153
         }
         $367 = $359 + 8 | 0; //@line 5156
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 5160
          HEAP32[$367 >> 2] = $362; //@line 5161
          $$3372$i = $359; //@line 5162
          break;
         } else {
          _abort(); //@line 5165
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 5173
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 5176
         $386 = 13360 + ($385 << 2) | 0; //@line 5177
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 5182
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 5187
            HEAP32[3265] = $391; //@line 5188
            $475 = $391; //@line 5189
            break L164;
           }
          } else {
           if ((HEAP32[3268] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 5196
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 5204
            if (!$$3372$i) {
             $475 = $253; //@line 5207
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3268] | 0; //@line 5215
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 5218
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 5222
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 5224
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 5230
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 5234
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 5236
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 5242
         if (!$409) {
          $475 = $253; //@line 5245
         } else {
          if ((HEAP32[3268] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 5250
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 5254
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 5256
           $475 = $253; //@line 5257
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 5266
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 5269
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 5271
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 5274
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 5278
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 5281
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 5283
         $428 = $$4351$lcssa$i >>> 3; //@line 5284
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 13096 + ($428 << 1 << 2) | 0; //@line 5288
          $432 = HEAP32[3264] | 0; //@line 5289
          $433 = 1 << $428; //@line 5290
          if (!($432 & $433)) {
           HEAP32[3264] = $432 | $433; //@line 5295
           $$0368$i = $431; //@line 5297
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 5297
          } else {
           $437 = $431 + 8 | 0; //@line 5299
           $438 = HEAP32[$437 >> 2] | 0; //@line 5300
           if ((HEAP32[3268] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 5304
           } else {
            $$0368$i = $438; //@line 5307
            $$pre$phi$i211Z2D = $437; //@line 5307
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 5310
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 5312
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 5314
          HEAP32[$354 + 12 >> 2] = $431; //@line 5316
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 5319
         if (!$444) {
          $$0361$i = 0; //@line 5322
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 5326
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 5330
           $450 = $444 << $449; //@line 5331
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 5334
           $455 = $450 << $453; //@line 5336
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 5339
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5344
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5350
          }
         }
         $469 = 13360 + ($$0361$i << 2) | 0; //@line 5353
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5355
         $471 = $354 + 16 | 0; //@line 5356
         HEAP32[$471 + 4 >> 2] = 0; //@line 5358
         HEAP32[$471 >> 2] = 0; //@line 5359
         $473 = 1 << $$0361$i; //@line 5360
         if (!($475 & $473)) {
          HEAP32[3265] = $475 | $473; //@line 5365
          HEAP32[$469 >> 2] = $354; //@line 5366
          HEAP32[$354 + 24 >> 2] = $469; //@line 5368
          HEAP32[$354 + 12 >> 2] = $354; //@line 5370
          HEAP32[$354 + 8 >> 2] = $354; //@line 5372
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5381
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5381
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5388
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5392
          $494 = HEAP32[$492 >> 2] | 0; //@line 5394
          if (!$494) {
           label = 136; //@line 5397
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5400
           $$0345$i = $494; //@line 5400
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3268] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5407
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5410
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5412
           HEAP32[$354 + 12 >> 2] = $354; //@line 5414
           HEAP32[$354 + 8 >> 2] = $354; //@line 5416
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5421
          $502 = HEAP32[$501 >> 2] | 0; //@line 5422
          $503 = HEAP32[3268] | 0; //@line 5423
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5429
           HEAP32[$501 >> 2] = $354; //@line 5430
           HEAP32[$354 + 8 >> 2] = $502; //@line 5432
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5434
           HEAP32[$354 + 24 >> 2] = 0; //@line 5436
           break;
          } else {
           _abort(); //@line 5439
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5446
       STACKTOP = sp; //@line 5447
       return $$0 | 0; //@line 5447
      } else {
       $$0197 = $252; //@line 5449
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3266] | 0; //@line 5456
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5459
  $515 = HEAP32[3269] | 0; //@line 5460
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5463
   HEAP32[3269] = $517; //@line 5464
   HEAP32[3266] = $514; //@line 5465
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5468
   HEAP32[$515 + $512 >> 2] = $514; //@line 5470
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5473
  } else {
   HEAP32[3266] = 0; //@line 5475
   HEAP32[3269] = 0; //@line 5476
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5479
   $526 = $515 + $512 + 4 | 0; //@line 5481
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5484
  }
  $$0 = $515 + 8 | 0; //@line 5487
  STACKTOP = sp; //@line 5488
  return $$0 | 0; //@line 5488
 }
 $530 = HEAP32[3267] | 0; //@line 5490
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5493
  HEAP32[3267] = $532; //@line 5494
  $533 = HEAP32[3270] | 0; //@line 5495
  $534 = $533 + $$0197 | 0; //@line 5496
  HEAP32[3270] = $534; //@line 5497
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5500
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5503
  $$0 = $533 + 8 | 0; //@line 5505
  STACKTOP = sp; //@line 5506
  return $$0 | 0; //@line 5506
 }
 if (!(HEAP32[3382] | 0)) {
  HEAP32[3384] = 4096; //@line 5511
  HEAP32[3383] = 4096; //@line 5512
  HEAP32[3385] = -1; //@line 5513
  HEAP32[3386] = -1; //@line 5514
  HEAP32[3387] = 0; //@line 5515
  HEAP32[3375] = 0; //@line 5516
  HEAP32[3382] = $1 & -16 ^ 1431655768; //@line 5520
  $548 = 4096; //@line 5521
 } else {
  $548 = HEAP32[3384] | 0; //@line 5524
 }
 $545 = $$0197 + 48 | 0; //@line 5526
 $546 = $$0197 + 47 | 0; //@line 5527
 $547 = $548 + $546 | 0; //@line 5528
 $549 = 0 - $548 | 0; //@line 5529
 $550 = $547 & $549; //@line 5530
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5533
  STACKTOP = sp; //@line 5534
  return $$0 | 0; //@line 5534
 }
 $552 = HEAP32[3374] | 0; //@line 5536
 if ($552 | 0) {
  $554 = HEAP32[3372] | 0; //@line 5539
  $555 = $554 + $550 | 0; //@line 5540
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5545
   STACKTOP = sp; //@line 5546
   return $$0 | 0; //@line 5546
  }
 }
 L244 : do {
  if (!(HEAP32[3375] & 4)) {
   $561 = HEAP32[3270] | 0; //@line 5554
   L246 : do {
    if (!$561) {
     label = 163; //@line 5558
    } else {
     $$0$i$i = 13504; //@line 5560
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5562
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5565
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5574
      if (!$570) {
       label = 163; //@line 5577
       break L246;
      } else {
       $$0$i$i = $570; //@line 5580
      }
     }
     $595 = $547 - $530 & $549; //@line 5584
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5587
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5595
       } else {
        $$723947$i = $595; //@line 5597
        $$748$i = $597; //@line 5597
        label = 180; //@line 5598
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5602
       $$2253$ph$i = $595; //@line 5602
       label = 171; //@line 5603
      }
     } else {
      $$2234243136$i = 0; //@line 5606
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5612
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5615
     } else {
      $574 = $572; //@line 5617
      $575 = HEAP32[3383] | 0; //@line 5618
      $576 = $575 + -1 | 0; //@line 5619
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5627
      $584 = HEAP32[3372] | 0; //@line 5628
      $585 = $$$i + $584 | 0; //@line 5629
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3374] | 0; //@line 5634
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5641
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5645
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5648
        $$748$i = $572; //@line 5648
        label = 180; //@line 5649
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5652
        $$2253$ph$i = $$$i; //@line 5652
        label = 171; //@line 5653
       }
      } else {
       $$2234243136$i = 0; //@line 5656
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5663
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5672
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5675
       $$748$i = $$2247$ph$i; //@line 5675
       label = 180; //@line 5676
       break L244;
      }
     }
     $607 = HEAP32[3384] | 0; //@line 5680
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5684
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5687
      $$748$i = $$2247$ph$i; //@line 5687
      label = 180; //@line 5688
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5694
      $$2234243136$i = 0; //@line 5695
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5699
      $$748$i = $$2247$ph$i; //@line 5699
      label = 180; //@line 5700
      break L244;
     }
    }
   } while (0);
   HEAP32[3375] = HEAP32[3375] | 4; //@line 5707
   $$4236$i = $$2234243136$i; //@line 5708
   label = 178; //@line 5709
  } else {
   $$4236$i = 0; //@line 5711
   label = 178; //@line 5712
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5718
   $621 = _sbrk(0) | 0; //@line 5719
   $627 = $621 - $620 | 0; //@line 5727
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5729
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5737
    $$748$i = $620; //@line 5737
    label = 180; //@line 5738
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3372] | 0) + $$723947$i | 0; //@line 5744
  HEAP32[3372] = $633; //@line 5745
  if ($633 >>> 0 > (HEAP32[3373] | 0) >>> 0) {
   HEAP32[3373] = $633; //@line 5749
  }
  $636 = HEAP32[3270] | 0; //@line 5751
  do {
   if (!$636) {
    $638 = HEAP32[3268] | 0; //@line 5755
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3268] = $$748$i; //@line 5760
    }
    HEAP32[3376] = $$748$i; //@line 5762
    HEAP32[3377] = $$723947$i; //@line 5763
    HEAP32[3379] = 0; //@line 5764
    HEAP32[3273] = HEAP32[3382]; //@line 5766
    HEAP32[3272] = -1; //@line 5767
    HEAP32[3277] = 13096; //@line 5768
    HEAP32[3276] = 13096; //@line 5769
    HEAP32[3279] = 13104; //@line 5770
    HEAP32[3278] = 13104; //@line 5771
    HEAP32[3281] = 13112; //@line 5772
    HEAP32[3280] = 13112; //@line 5773
    HEAP32[3283] = 13120; //@line 5774
    HEAP32[3282] = 13120; //@line 5775
    HEAP32[3285] = 13128; //@line 5776
    HEAP32[3284] = 13128; //@line 5777
    HEAP32[3287] = 13136; //@line 5778
    HEAP32[3286] = 13136; //@line 5779
    HEAP32[3289] = 13144; //@line 5780
    HEAP32[3288] = 13144; //@line 5781
    HEAP32[3291] = 13152; //@line 5782
    HEAP32[3290] = 13152; //@line 5783
    HEAP32[3293] = 13160; //@line 5784
    HEAP32[3292] = 13160; //@line 5785
    HEAP32[3295] = 13168; //@line 5786
    HEAP32[3294] = 13168; //@line 5787
    HEAP32[3297] = 13176; //@line 5788
    HEAP32[3296] = 13176; //@line 5789
    HEAP32[3299] = 13184; //@line 5790
    HEAP32[3298] = 13184; //@line 5791
    HEAP32[3301] = 13192; //@line 5792
    HEAP32[3300] = 13192; //@line 5793
    HEAP32[3303] = 13200; //@line 5794
    HEAP32[3302] = 13200; //@line 5795
    HEAP32[3305] = 13208; //@line 5796
    HEAP32[3304] = 13208; //@line 5797
    HEAP32[3307] = 13216; //@line 5798
    HEAP32[3306] = 13216; //@line 5799
    HEAP32[3309] = 13224; //@line 5800
    HEAP32[3308] = 13224; //@line 5801
    HEAP32[3311] = 13232; //@line 5802
    HEAP32[3310] = 13232; //@line 5803
    HEAP32[3313] = 13240; //@line 5804
    HEAP32[3312] = 13240; //@line 5805
    HEAP32[3315] = 13248; //@line 5806
    HEAP32[3314] = 13248; //@line 5807
    HEAP32[3317] = 13256; //@line 5808
    HEAP32[3316] = 13256; //@line 5809
    HEAP32[3319] = 13264; //@line 5810
    HEAP32[3318] = 13264; //@line 5811
    HEAP32[3321] = 13272; //@line 5812
    HEAP32[3320] = 13272; //@line 5813
    HEAP32[3323] = 13280; //@line 5814
    HEAP32[3322] = 13280; //@line 5815
    HEAP32[3325] = 13288; //@line 5816
    HEAP32[3324] = 13288; //@line 5817
    HEAP32[3327] = 13296; //@line 5818
    HEAP32[3326] = 13296; //@line 5819
    HEAP32[3329] = 13304; //@line 5820
    HEAP32[3328] = 13304; //@line 5821
    HEAP32[3331] = 13312; //@line 5822
    HEAP32[3330] = 13312; //@line 5823
    HEAP32[3333] = 13320; //@line 5824
    HEAP32[3332] = 13320; //@line 5825
    HEAP32[3335] = 13328; //@line 5826
    HEAP32[3334] = 13328; //@line 5827
    HEAP32[3337] = 13336; //@line 5828
    HEAP32[3336] = 13336; //@line 5829
    HEAP32[3339] = 13344; //@line 5830
    HEAP32[3338] = 13344; //@line 5831
    $642 = $$723947$i + -40 | 0; //@line 5832
    $644 = $$748$i + 8 | 0; //@line 5834
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5839
    $650 = $$748$i + $649 | 0; //@line 5840
    $651 = $642 - $649 | 0; //@line 5841
    HEAP32[3270] = $650; //@line 5842
    HEAP32[3267] = $651; //@line 5843
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5846
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5849
    HEAP32[3271] = HEAP32[3386]; //@line 5851
   } else {
    $$024367$i = 13504; //@line 5853
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5855
     $658 = $$024367$i + 4 | 0; //@line 5856
     $659 = HEAP32[$658 >> 2] | 0; //@line 5857
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5861
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5865
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5870
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5884
       $673 = (HEAP32[3267] | 0) + $$723947$i | 0; //@line 5886
       $675 = $636 + 8 | 0; //@line 5888
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5893
       $681 = $636 + $680 | 0; //@line 5894
       $682 = $673 - $680 | 0; //@line 5895
       HEAP32[3270] = $681; //@line 5896
       HEAP32[3267] = $682; //@line 5897
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5900
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5903
       HEAP32[3271] = HEAP32[3386]; //@line 5905
       break;
      }
     }
    }
    $688 = HEAP32[3268] | 0; //@line 5910
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3268] = $$748$i; //@line 5913
     $753 = $$748$i; //@line 5914
    } else {
     $753 = $688; //@line 5916
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5918
    $$124466$i = 13504; //@line 5919
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5924
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5928
     if (!$694) {
      $$0$i$i$i = 13504; //@line 5931
      break;
     } else {
      $$124466$i = $694; //@line 5934
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5943
      $700 = $$124466$i + 4 | 0; //@line 5944
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5947
      $704 = $$748$i + 8 | 0; //@line 5949
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5955
      $712 = $690 + 8 | 0; //@line 5957
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5963
      $722 = $710 + $$0197 | 0; //@line 5967
      $723 = $718 - $710 - $$0197 | 0; //@line 5968
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5971
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3267] | 0) + $723 | 0; //@line 5976
        HEAP32[3267] = $728; //@line 5977
        HEAP32[3270] = $722; //@line 5978
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5981
       } else {
        if ((HEAP32[3269] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3266] | 0) + $723 | 0; //@line 5987
         HEAP32[3266] = $734; //@line 5988
         HEAP32[3269] = $722; //@line 5989
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5992
         HEAP32[$722 + $734 >> 2] = $734; //@line 5994
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5998
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 6002
         $743 = $739 >>> 3; //@line 6003
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 6008
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 6010
           $750 = 13096 + ($743 << 1 << 2) | 0; //@line 6012
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 6018
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 6027
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3264] = HEAP32[3264] & ~(1 << $743); //@line 6037
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 6044
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 6048
             }
             $764 = $748 + 8 | 0; //@line 6051
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 6055
              break;
             }
             _abort(); //@line 6058
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 6063
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 6064
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 6067
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 6069
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 6073
             $783 = $782 + 4 | 0; //@line 6074
             $784 = HEAP32[$783 >> 2] | 0; //@line 6075
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 6078
              if (!$786) {
               $$3$i$i = 0; //@line 6081
               break;
              } else {
               $$1291$i$i = $786; //@line 6084
               $$1293$i$i = $782; //@line 6084
              }
             } else {
              $$1291$i$i = $784; //@line 6087
              $$1293$i$i = $783; //@line 6087
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 6090
              $789 = HEAP32[$788 >> 2] | 0; //@line 6091
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 6094
               $$1293$i$i = $788; //@line 6094
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 6097
              $792 = HEAP32[$791 >> 2] | 0; //@line 6098
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 6103
               $$1293$i$i = $791; //@line 6103
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 6108
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 6111
              $$3$i$i = $$1291$i$i; //@line 6112
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 6117
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 6120
             }
             $776 = $774 + 12 | 0; //@line 6123
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 6127
             }
             $779 = $771 + 8 | 0; //@line 6130
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 6134
              HEAP32[$779 >> 2] = $774; //@line 6135
              $$3$i$i = $771; //@line 6136
              break;
             } else {
              _abort(); //@line 6139
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 6149
           $798 = 13360 + ($797 << 2) | 0; //@line 6150
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 6155
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3265] = HEAP32[3265] & ~(1 << $797); //@line 6164
             break L311;
            } else {
             if ((HEAP32[3268] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 6170
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 6178
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3268] | 0; //@line 6188
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 6191
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 6195
           $815 = $718 + 16 | 0; //@line 6196
           $816 = HEAP32[$815 >> 2] | 0; //@line 6197
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 6203
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 6207
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 6209
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 6215
           if (!$822) {
            break;
           }
           if ((HEAP32[3268] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 6223
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 6227
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 6229
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 6236
         $$0287$i$i = $742 + $723 | 0; //@line 6236
        } else {
         $$0$i17$i = $718; //@line 6238
         $$0287$i$i = $723; //@line 6238
        }
        $830 = $$0$i17$i + 4 | 0; //@line 6240
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 6243
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 6246
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 6248
        $836 = $$0287$i$i >>> 3; //@line 6249
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 13096 + ($836 << 1 << 2) | 0; //@line 6253
         $840 = HEAP32[3264] | 0; //@line 6254
         $841 = 1 << $836; //@line 6255
         do {
          if (!($840 & $841)) {
           HEAP32[3264] = $840 | $841; //@line 6261
           $$0295$i$i = $839; //@line 6263
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 6263
          } else {
           $845 = $839 + 8 | 0; //@line 6265
           $846 = HEAP32[$845 >> 2] | 0; //@line 6266
           if ((HEAP32[3268] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 6270
            $$pre$phi$i19$iZ2D = $845; //@line 6270
            break;
           }
           _abort(); //@line 6273
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 6277
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 6279
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 6281
         HEAP32[$722 + 12 >> 2] = $839; //@line 6283
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 6286
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 6290
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 6294
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 6299
          $858 = $852 << $857; //@line 6300
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 6303
          $863 = $858 << $861; //@line 6305
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 6308
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 6313
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 6319
         }
        } while (0);
        $877 = 13360 + ($$0296$i$i << 2) | 0; //@line 6322
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 6324
        $879 = $722 + 16 | 0; //@line 6325
        HEAP32[$879 + 4 >> 2] = 0; //@line 6327
        HEAP32[$879 >> 2] = 0; //@line 6328
        $881 = HEAP32[3265] | 0; //@line 6329
        $882 = 1 << $$0296$i$i; //@line 6330
        if (!($881 & $882)) {
         HEAP32[3265] = $881 | $882; //@line 6335
         HEAP32[$877 >> 2] = $722; //@line 6336
         HEAP32[$722 + 24 >> 2] = $877; //@line 6338
         HEAP32[$722 + 12 >> 2] = $722; //@line 6340
         HEAP32[$722 + 8 >> 2] = $722; //@line 6342
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6351
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6351
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6358
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6362
         $902 = HEAP32[$900 >> 2] | 0; //@line 6364
         if (!$902) {
          label = 260; //@line 6367
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6370
          $$0289$i$i = $902; //@line 6370
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3268] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6377
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6380
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6382
          HEAP32[$722 + 12 >> 2] = $722; //@line 6384
          HEAP32[$722 + 8 >> 2] = $722; //@line 6386
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6391
         $910 = HEAP32[$909 >> 2] | 0; //@line 6392
         $911 = HEAP32[3268] | 0; //@line 6393
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6399
          HEAP32[$909 >> 2] = $722; //@line 6400
          HEAP32[$722 + 8 >> 2] = $910; //@line 6402
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6404
          HEAP32[$722 + 24 >> 2] = 0; //@line 6406
          break;
         } else {
          _abort(); //@line 6409
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6416
      STACKTOP = sp; //@line 6417
      return $$0 | 0; //@line 6417
     } else {
      $$0$i$i$i = 13504; //@line 6419
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6423
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6428
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6436
    }
    $927 = $923 + -47 | 0; //@line 6438
    $929 = $927 + 8 | 0; //@line 6440
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6446
    $936 = $636 + 16 | 0; //@line 6447
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6449
    $939 = $938 + 8 | 0; //@line 6450
    $940 = $938 + 24 | 0; //@line 6451
    $941 = $$723947$i + -40 | 0; //@line 6452
    $943 = $$748$i + 8 | 0; //@line 6454
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6459
    $949 = $$748$i + $948 | 0; //@line 6460
    $950 = $941 - $948 | 0; //@line 6461
    HEAP32[3270] = $949; //@line 6462
    HEAP32[3267] = $950; //@line 6463
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6466
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6469
    HEAP32[3271] = HEAP32[3386]; //@line 6471
    $956 = $938 + 4 | 0; //@line 6472
    HEAP32[$956 >> 2] = 27; //@line 6473
    HEAP32[$939 >> 2] = HEAP32[3376]; //@line 6474
    HEAP32[$939 + 4 >> 2] = HEAP32[3377]; //@line 6474
    HEAP32[$939 + 8 >> 2] = HEAP32[3378]; //@line 6474
    HEAP32[$939 + 12 >> 2] = HEAP32[3379]; //@line 6474
    HEAP32[3376] = $$748$i; //@line 6475
    HEAP32[3377] = $$723947$i; //@line 6476
    HEAP32[3379] = 0; //@line 6477
    HEAP32[3378] = $939; //@line 6478
    $958 = $940; //@line 6479
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6481
     HEAP32[$958 >> 2] = 7; //@line 6482
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6495
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6498
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6501
     HEAP32[$938 >> 2] = $964; //@line 6502
     $969 = $964 >>> 3; //@line 6503
     if ($964 >>> 0 < 256) {
      $972 = 13096 + ($969 << 1 << 2) | 0; //@line 6507
      $973 = HEAP32[3264] | 0; //@line 6508
      $974 = 1 << $969; //@line 6509
      if (!($973 & $974)) {
       HEAP32[3264] = $973 | $974; //@line 6514
       $$0211$i$i = $972; //@line 6516
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6516
      } else {
       $978 = $972 + 8 | 0; //@line 6518
       $979 = HEAP32[$978 >> 2] | 0; //@line 6519
       if ((HEAP32[3268] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6523
       } else {
        $$0211$i$i = $979; //@line 6526
        $$pre$phi$i$iZ2D = $978; //@line 6526
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6529
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6531
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6533
      HEAP32[$636 + 12 >> 2] = $972; //@line 6535
      break;
     }
     $985 = $964 >>> 8; //@line 6538
     if (!$985) {
      $$0212$i$i = 0; //@line 6541
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6545
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6549
       $991 = $985 << $990; //@line 6550
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6553
       $996 = $991 << $994; //@line 6555
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6558
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6563
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6569
      }
     }
     $1010 = 13360 + ($$0212$i$i << 2) | 0; //@line 6572
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6574
     HEAP32[$636 + 20 >> 2] = 0; //@line 6576
     HEAP32[$936 >> 2] = 0; //@line 6577
     $1013 = HEAP32[3265] | 0; //@line 6578
     $1014 = 1 << $$0212$i$i; //@line 6579
     if (!($1013 & $1014)) {
      HEAP32[3265] = $1013 | $1014; //@line 6584
      HEAP32[$1010 >> 2] = $636; //@line 6585
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6587
      HEAP32[$636 + 12 >> 2] = $636; //@line 6589
      HEAP32[$636 + 8 >> 2] = $636; //@line 6591
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6600
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6600
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6607
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6611
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6613
      if (!$1034) {
       label = 286; //@line 6616
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6619
       $$0207$i$i = $1034; //@line 6619
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3268] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6626
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6629
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6631
       HEAP32[$636 + 12 >> 2] = $636; //@line 6633
       HEAP32[$636 + 8 >> 2] = $636; //@line 6635
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6640
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6641
      $1043 = HEAP32[3268] | 0; //@line 6642
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6648
       HEAP32[$1041 >> 2] = $636; //@line 6649
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6651
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6653
       HEAP32[$636 + 24 >> 2] = 0; //@line 6655
       break;
      } else {
       _abort(); //@line 6658
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3267] | 0; //@line 6665
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6668
   HEAP32[3267] = $1054; //@line 6669
   $1055 = HEAP32[3270] | 0; //@line 6670
   $1056 = $1055 + $$0197 | 0; //@line 6671
   HEAP32[3270] = $1056; //@line 6672
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6675
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6678
   $$0 = $1055 + 8 | 0; //@line 6680
   STACKTOP = sp; //@line 6681
   return $$0 | 0; //@line 6681
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6685
 $$0 = 0; //@line 6686
 STACKTOP = sp; //@line 6687
 return $$0 | 0; //@line 6687
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10839
 STACKTOP = STACKTOP + 560 | 0; //@line 10840
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 10840
 $6 = sp + 8 | 0; //@line 10841
 $7 = sp; //@line 10842
 $8 = sp + 524 | 0; //@line 10843
 $9 = $8; //@line 10844
 $10 = sp + 512 | 0; //@line 10845
 HEAP32[$7 >> 2] = 0; //@line 10846
 $11 = $10 + 12 | 0; //@line 10847
 ___DOUBLE_BITS_677($1) | 0; //@line 10848
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10853
  $$0520 = 1; //@line 10853
  $$0521 = 6316; //@line 10853
 } else {
  $$0471 = $1; //@line 10864
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10864
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 6317 : 6322 : 6319; //@line 10864
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10866
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10875
   $31 = $$0520 + 3 | 0; //@line 10880
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10882
   _out_670($0, $$0521, $$0520); //@line 10883
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 6343 : 6347 : $27 ? 6335 : 6339, 3); //@line 10884
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10886
   $$sink560 = $31; //@line 10887
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10890
   $36 = $35 != 0.0; //@line 10891
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10895
   }
   $39 = $5 | 32; //@line 10897
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10900
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10903
    $44 = $$0520 | 2; //@line 10904
    $46 = 12 - $3 | 0; //@line 10906
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10911
     } else {
      $$0509585 = 8.0; //@line 10913
      $$1508586 = $46; //@line 10913
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10915
       $$0509585 = $$0509585 * 16.0; //@line 10916
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10931
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10936
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10941
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10944
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10947
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10950
     HEAP8[$68 >> 0] = 48; //@line 10951
     $$0511 = $68; //@line 10952
    } else {
     $$0511 = $66; //@line 10954
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10961
    $76 = $$0511 + -2 | 0; //@line 10964
    HEAP8[$76 >> 0] = $5 + 15; //@line 10965
    $77 = ($3 | 0) < 1; //@line 10966
    $79 = ($4 & 8 | 0) == 0; //@line 10968
    $$0523 = $8; //@line 10969
    $$2473 = $$1472; //@line 10969
    while (1) {
     $80 = ~~$$2473; //@line 10971
     $86 = $$0523 + 1 | 0; //@line 10977
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[6351 + $80 >> 0]; //@line 10978
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10981
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10990
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10993
       $$1524 = $$0523 + 2 | 0; //@line 10994
      }
     } else {
      $$1524 = $86; //@line 10997
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 11001
     }
    }
    $$pre693 = $$1524; //@line 11007
    if (!$3) {
     label = 24; //@line 11009
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 11017
      $$sink = $3 + 2 | 0; //@line 11017
     } else {
      label = 24; //@line 11019
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 11023
     $$pre$phi691Z2D = $101; //@line 11024
     $$sink = $101; //@line 11024
    }
    $104 = $11 - $76 | 0; //@line 11028
    $106 = $104 + $44 + $$sink | 0; //@line 11030
    _pad_676($0, 32, $2, $106, $4); //@line 11031
    _out_670($0, $$0521$, $44); //@line 11032
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 11034
    _out_670($0, $8, $$pre$phi691Z2D); //@line 11035
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 11037
    _out_670($0, $76, $104); //@line 11038
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 11040
    $$sink560 = $106; //@line 11041
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 11045
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 11049
    HEAP32[$7 >> 2] = $113; //@line 11050
    $$3 = $35 * 268435456.0; //@line 11051
    $$pr = $113; //@line 11051
   } else {
    $$3 = $35; //@line 11054
    $$pr = HEAP32[$7 >> 2] | 0; //@line 11054
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 11058
   $$0498 = $$561; //@line 11059
   $$4 = $$3; //@line 11059
   do {
    $116 = ~~$$4 >>> 0; //@line 11061
    HEAP32[$$0498 >> 2] = $116; //@line 11062
    $$0498 = $$0498 + 4 | 0; //@line 11063
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 11066
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 11076
    $$1499662 = $$0498; //@line 11076
    $124 = $$pr; //@line 11076
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 11079
     $$0488655 = $$1499662 + -4 | 0; //@line 11080
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 11083
     } else {
      $$0488657 = $$0488655; //@line 11085
      $$0497656 = 0; //@line 11085
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 11088
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 11090
       $131 = tempRet0; //@line 11091
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 11092
       HEAP32[$$0488657 >> 2] = $132; //@line 11094
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 11095
       $$0488657 = $$0488657 + -4 | 0; //@line 11097
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 11107
      } else {
       $138 = $$1482663 + -4 | 0; //@line 11109
       HEAP32[$138 >> 2] = $$0497656; //@line 11110
       $$2483$ph = $138; //@line 11111
      }
     }
     $$2500 = $$1499662; //@line 11114
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 11120
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 11124
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 11130
     HEAP32[$7 >> 2] = $144; //@line 11131
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 11134
      $$1499662 = $$2500; //@line 11134
      $124 = $144; //@line 11134
     } else {
      $$1482$lcssa = $$2483$ph; //@line 11136
      $$1499$lcssa = $$2500; //@line 11136
      $$pr566 = $144; //@line 11136
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 11141
    $$1499$lcssa = $$0498; //@line 11141
    $$pr566 = $$pr; //@line 11141
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 11147
    $150 = ($39 | 0) == 102; //@line 11148
    $$3484650 = $$1482$lcssa; //@line 11149
    $$3501649 = $$1499$lcssa; //@line 11149
    $152 = $$pr566; //@line 11149
    while (1) {
     $151 = 0 - $152 | 0; //@line 11151
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 11153
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 11157
      $161 = 1e9 >>> $154; //@line 11158
      $$0487644 = 0; //@line 11159
      $$1489643 = $$3484650; //@line 11159
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 11161
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 11165
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 11166
       $$1489643 = $$1489643 + 4 | 0; //@line 11167
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 11178
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 11181
       $$4502 = $$3501649; //@line 11181
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 11184
       $$$3484700 = $$$3484; //@line 11185
       $$4502 = $$3501649 + 4 | 0; //@line 11185
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 11192
      $$4502 = $$3501649; //@line 11192
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 11194
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 11201
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 11203
     HEAP32[$7 >> 2] = $152; //@line 11204
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 11209
      $$3501$lcssa = $$$4502; //@line 11209
      break;
     } else {
      $$3484650 = $$$3484700; //@line 11207
      $$3501649 = $$$4502; //@line 11207
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 11214
    $$3501$lcssa = $$1499$lcssa; //@line 11214
   }
   $185 = $$561; //@line 11217
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 11222
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 11223
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 11226
    } else {
     $$0514639 = $189; //@line 11228
     $$0530638 = 10; //@line 11228
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 11230
      $193 = $$0514639 + 1 | 0; //@line 11231
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 11234
       break;
      } else {
       $$0514639 = $193; //@line 11237
      }
     }
    }
   } else {
    $$1515 = 0; //@line 11242
   }
   $198 = ($39 | 0) == 103; //@line 11247
   $199 = ($$540 | 0) != 0; //@line 11248
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 11251
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 11260
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 11263
    $213 = ($209 | 0) % 9 | 0; //@line 11264
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 11267
     $$1531632 = 10; //@line 11267
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 11270
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 11273
       $$1531632 = $215; //@line 11273
      } else {
       $$1531$lcssa = $215; //@line 11275
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 11280
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 11282
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 11283
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 11286
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 11289
     $$4518 = $$1515; //@line 11289
     $$8 = $$3484$lcssa; //@line 11289
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 11294
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 11295
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 11300
     if (!$$0520) {
      $$1467 = $$$564; //@line 11303
      $$1469 = $$543; //@line 11303
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 11306
      $$1467 = $230 ? -$$$564 : $$$564; //@line 11311
      $$1469 = $230 ? -$$543 : $$543; //@line 11311
     }
     $233 = $217 - $218 | 0; //@line 11313
     HEAP32[$212 >> 2] = $233; //@line 11314
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 11318
      HEAP32[$212 >> 2] = $236; //@line 11319
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 11322
       $$sink547625 = $212; //@line 11322
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 11324
        HEAP32[$$sink547625 >> 2] = 0; //@line 11325
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 11328
         HEAP32[$240 >> 2] = 0; //@line 11329
         $$6 = $240; //@line 11330
        } else {
         $$6 = $$5486626; //@line 11332
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 11335
        HEAP32[$238 >> 2] = $242; //@line 11336
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 11339
         $$sink547625 = $238; //@line 11339
        } else {
         $$5486$lcssa = $$6; //@line 11341
         $$sink547$lcssa = $238; //@line 11341
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 11346
       $$sink547$lcssa = $212; //@line 11346
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 11351
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 11352
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 11355
       $$4518 = $247; //@line 11355
       $$8 = $$5486$lcssa; //@line 11355
      } else {
       $$2516621 = $247; //@line 11357
       $$2532620 = 10; //@line 11357
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 11359
        $251 = $$2516621 + 1 | 0; //@line 11360
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 11363
         $$4518 = $251; //@line 11363
         $$8 = $$5486$lcssa; //@line 11363
         break;
        } else {
         $$2516621 = $251; //@line 11366
        }
       }
      }
     } else {
      $$4492 = $212; //@line 11371
      $$4518 = $$1515; //@line 11371
      $$8 = $$3484$lcssa; //@line 11371
     }
    }
    $253 = $$4492 + 4 | 0; //@line 11374
    $$5519$ph = $$4518; //@line 11377
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 11377
    $$9$ph = $$8; //@line 11377
   } else {
    $$5519$ph = $$1515; //@line 11379
    $$7505$ph = $$3501$lcssa; //@line 11379
    $$9$ph = $$3484$lcssa; //@line 11379
   }
   $$7505 = $$7505$ph; //@line 11381
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 11385
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 11388
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 11392
    } else {
     $$lcssa675 = 1; //@line 11394
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 11398
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 11403
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 11411
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 11411
     } else {
      $$0479 = $5 + -2 | 0; //@line 11415
      $$2476 = $$540$ + -1 | 0; //@line 11415
     }
     $267 = $4 & 8; //@line 11417
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 11422
       if (!$270) {
        $$2529 = 9; //@line 11425
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 11430
         $$3533616 = 10; //@line 11430
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 11432
          $275 = $$1528617 + 1 | 0; //@line 11433
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 11439
           break;
          } else {
           $$1528617 = $275; //@line 11437
          }
         }
        } else {
         $$2529 = 0; //@line 11444
        }
       }
      } else {
       $$2529 = 9; //@line 11448
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 11456
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 11458
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 11460
       $$1480 = $$0479; //@line 11463
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 11463
       $$pre$phi698Z2D = 0; //@line 11463
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 11467
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 11469
       $$1480 = $$0479; //@line 11472
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 11472
       $$pre$phi698Z2D = 0; //@line 11472
       break;
      }
     } else {
      $$1480 = $$0479; //@line 11476
      $$3477 = $$2476; //@line 11476
      $$pre$phi698Z2D = $267; //@line 11476
     }
    } else {
     $$1480 = $5; //@line 11480
     $$3477 = $$540; //@line 11480
     $$pre$phi698Z2D = $4 & 8; //@line 11480
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 11483
   $294 = ($292 | 0) != 0 & 1; //@line 11485
   $296 = ($$1480 | 32 | 0) == 102; //@line 11487
   if ($296) {
    $$2513 = 0; //@line 11491
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 11491
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 11494
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11497
    $304 = $11; //@line 11498
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 11503
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 11505
      HEAP8[$308 >> 0] = 48; //@line 11506
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 11511
      } else {
       $$1512$lcssa = $308; //@line 11513
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 11518
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 11525
    $318 = $$1512$lcssa + -2 | 0; //@line 11527
    HEAP8[$318 >> 0] = $$1480; //@line 11528
    $$2513 = $318; //@line 11531
    $$pn = $304 - $318 | 0; //@line 11531
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 11536
   _pad_676($0, 32, $2, $323, $4); //@line 11537
   _out_670($0, $$0521, $$0520); //@line 11538
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 11540
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 11543
    $326 = $8 + 9 | 0; //@line 11544
    $327 = $326; //@line 11545
    $328 = $8 + 8 | 0; //@line 11546
    $$5493600 = $$0496$$9; //@line 11547
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 11550
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 11555
       $$1465 = $328; //@line 11556
      } else {
       $$1465 = $330; //@line 11558
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 11565
       $$0464597 = $330; //@line 11566
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 11568
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 11571
        } else {
         $$1465 = $335; //@line 11573
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 11578
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 11583
     $$5493600 = $$5493600 + 4 | 0; //@line 11584
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 6367, 1); //@line 11594
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 11600
     $$6494592 = $$5493600; //@line 11600
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 11603
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 11608
       $$0463587 = $347; //@line 11609
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 11611
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 11614
        } else {
         $$0463$lcssa = $351; //@line 11616
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 11621
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 11625
      $$6494592 = $$6494592 + 4 | 0; //@line 11626
      $356 = $$4478593 + -9 | 0; //@line 11627
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 11634
       break;
      } else {
       $$4478593 = $356; //@line 11632
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 11639
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 11642
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 11645
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 11648
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 11649
     $365 = $363; //@line 11650
     $366 = 0 - $9 | 0; //@line 11651
     $367 = $8 + 8 | 0; //@line 11652
     $$5605 = $$3477; //@line 11653
     $$7495604 = $$9$ph; //@line 11653
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 11656
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 11659
       $$0 = $367; //@line 11660
      } else {
       $$0 = $369; //@line 11662
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 11667
        _out_670($0, $$0, 1); //@line 11668
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 11672
         break;
        }
        _out_670($0, 6367, 1); //@line 11675
        $$2 = $375; //@line 11676
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 11680
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 11685
        $$1601 = $$0; //@line 11686
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 11688
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 11691
         } else {
          $$2 = $373; //@line 11693
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 11700
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 11703
      $381 = $$5605 - $378 | 0; //@line 11704
      $$7495604 = $$7495604 + 4 | 0; //@line 11705
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 11712
       break;
      } else {
       $$5605 = $381; //@line 11710
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 11717
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 11720
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 11724
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 11727
   $$sink560 = $323; //@line 11728
  }
 } while (0);
 STACKTOP = sp; //@line 11733
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 11733
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 9411
 STACKTOP = STACKTOP + 64 | 0; //@line 9412
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9412
 $5 = sp + 16 | 0; //@line 9413
 $6 = sp; //@line 9414
 $7 = sp + 24 | 0; //@line 9415
 $8 = sp + 8 | 0; //@line 9416
 $9 = sp + 20 | 0; //@line 9417
 HEAP32[$5 >> 2] = $1; //@line 9418
 $10 = ($0 | 0) != 0; //@line 9419
 $11 = $7 + 40 | 0; //@line 9420
 $12 = $11; //@line 9421
 $13 = $7 + 39 | 0; //@line 9422
 $14 = $8 + 4 | 0; //@line 9423
 $$0243 = 0; //@line 9424
 $$0247 = 0; //@line 9424
 $$0269 = 0; //@line 9424
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9433
     $$1248 = -1; //@line 9434
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 9438
     break;
    }
   } else {
    $$1248 = $$0247; //@line 9442
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 9445
  $21 = HEAP8[$20 >> 0] | 0; //@line 9446
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 9449
   break;
  } else {
   $23 = $21; //@line 9452
   $25 = $20; //@line 9452
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 9457
     $27 = $25; //@line 9457
     label = 9; //@line 9458
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 9463
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 9470
   HEAP32[$5 >> 2] = $24; //@line 9471
   $23 = HEAP8[$24 >> 0] | 0; //@line 9473
   $25 = $24; //@line 9473
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 9478
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 9483
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 9486
     $27 = $27 + 2 | 0; //@line 9487
     HEAP32[$5 >> 2] = $27; //@line 9488
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 9495
      break;
     } else {
      $$0249303 = $30; //@line 9492
      label = 9; //@line 9493
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 9503
  if ($10) {
   _out_670($0, $20, $36); //@line 9505
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 9509
   $$0247 = $$1248; //@line 9509
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 9517
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 9518
  if ($43) {
   $$0253 = -1; //@line 9520
   $$1270 = $$0269; //@line 9520
   $$sink = 1; //@line 9520
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 9530
    $$1270 = 1; //@line 9530
    $$sink = 3; //@line 9530
   } else {
    $$0253 = -1; //@line 9532
    $$1270 = $$0269; //@line 9532
    $$sink = 1; //@line 9532
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 9535
  HEAP32[$5 >> 2] = $51; //@line 9536
  $52 = HEAP8[$51 >> 0] | 0; //@line 9537
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 9539
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 9546
   $$lcssa291 = $52; //@line 9546
   $$lcssa292 = $51; //@line 9546
  } else {
   $$0262309 = 0; //@line 9548
   $60 = $52; //@line 9548
   $65 = $51; //@line 9548
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 9553
    $64 = $65 + 1 | 0; //@line 9554
    HEAP32[$5 >> 2] = $64; //@line 9555
    $66 = HEAP8[$64 >> 0] | 0; //@line 9556
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 9558
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 9565
     $$lcssa291 = $66; //@line 9565
     $$lcssa292 = $64; //@line 9565
     break;
    } else {
     $$0262309 = $63; //@line 9568
     $60 = $66; //@line 9568
     $65 = $64; //@line 9568
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 9580
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 9582
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 9587
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9592
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9604
     $$2271 = 1; //@line 9604
     $storemerge274 = $79 + 3 | 0; //@line 9604
    } else {
     label = 23; //@line 9606
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 9610
    if ($$1270 | 0) {
     $$0 = -1; //@line 9613
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9628
     $106 = HEAP32[$105 >> 2] | 0; //@line 9629
     HEAP32[$2 >> 2] = $105 + 4; //@line 9631
     $363 = $106; //@line 9632
    } else {
     $363 = 0; //@line 9634
    }
    $$0259 = $363; //@line 9638
    $$2271 = 0; //@line 9638
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 9638
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 9640
   $109 = ($$0259 | 0) < 0; //@line 9641
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 9646
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 9646
   $$3272 = $$2271; //@line 9646
   $115 = $storemerge274; //@line 9646
  } else {
   $112 = _getint_671($5) | 0; //@line 9648
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 9651
    break;
   }
   $$1260 = $112; //@line 9655
   $$1263 = $$0262$lcssa; //@line 9655
   $$3272 = $$1270; //@line 9655
   $115 = HEAP32[$5 >> 2] | 0; //@line 9655
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 9666
     $156 = _getint_671($5) | 0; //@line 9667
     $$0254 = $156; //@line 9669
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 9669
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 9678
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 9683
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9688
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9695
      $144 = $125 + 4 | 0; //@line 9699
      HEAP32[$5 >> 2] = $144; //@line 9700
      $$0254 = $140; //@line 9701
      $$pre345 = $144; //@line 9701
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 9707
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9722
     $152 = HEAP32[$151 >> 2] | 0; //@line 9723
     HEAP32[$2 >> 2] = $151 + 4; //@line 9725
     $364 = $152; //@line 9726
    } else {
     $364 = 0; //@line 9728
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 9731
    HEAP32[$5 >> 2] = $154; //@line 9732
    $$0254 = $364; //@line 9733
    $$pre345 = $154; //@line 9733
   } else {
    $$0254 = -1; //@line 9735
    $$pre345 = $115; //@line 9735
   }
  } while (0);
  $$0252 = 0; //@line 9738
  $158 = $$pre345; //@line 9738
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 9745
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 9748
   HEAP32[$5 >> 2] = $158; //@line 9749
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (5835 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 9754
   $168 = $167 & 255; //@line 9755
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 9759
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 9766
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 9770
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 9774
     break L1;
    } else {
     label = 50; //@line 9777
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 9782
     $176 = $3 + ($$0253 << 3) | 0; //@line 9784
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 9789
     $182 = $6; //@line 9790
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 9792
     HEAP32[$182 + 4 >> 2] = $181; //@line 9795
     label = 50; //@line 9796
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9800
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9803
    $187 = HEAP32[$5 >> 2] | 0; //@line 9805
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9809
   if ($10) {
    $187 = $158; //@line 9811
   } else {
    $$0243 = 0; //@line 9813
    $$0247 = $$1248; //@line 9813
    $$0269 = $$3272; //@line 9813
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9819
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9825
  $196 = $$1263 & -65537; //@line 9828
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9829
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9837
       $$0243 = 0; //@line 9838
       $$0247 = $$1248; //@line 9838
       $$0269 = $$3272; //@line 9838
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9844
       $$0243 = 0; //@line 9845
       $$0247 = $$1248; //@line 9845
       $$0269 = $$3272; //@line 9845
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9853
       HEAP32[$208 >> 2] = $$1248; //@line 9855
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9858
       $$0243 = 0; //@line 9859
       $$0247 = $$1248; //@line 9859
       $$0269 = $$3272; //@line 9859
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9866
       $$0243 = 0; //@line 9867
       $$0247 = $$1248; //@line 9867
       $$0269 = $$3272; //@line 9867
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9874
       $$0243 = 0; //@line 9875
       $$0247 = $$1248; //@line 9875
       $$0269 = $$3272; //@line 9875
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9881
       $$0243 = 0; //@line 9882
       $$0247 = $$1248; //@line 9882
       $$0269 = $$3272; //@line 9882
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9890
       HEAP32[$220 >> 2] = $$1248; //@line 9892
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9895
       $$0243 = 0; //@line 9896
       $$0247 = $$1248; //@line 9896
       $$0269 = $$3272; //@line 9896
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9901
       $$0247 = $$1248; //@line 9901
       $$0269 = $$3272; //@line 9901
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9911
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9911
     $$3265 = $$1263$ | 8; //@line 9911
     label = 62; //@line 9912
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9916
     $$1255 = $$0254; //@line 9916
     $$3265 = $$1263$; //@line 9916
     label = 62; //@line 9917
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9921
     $244 = HEAP32[$242 >> 2] | 0; //@line 9923
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9926
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9927
     $252 = $12 - $248 | 0; //@line 9931
     $$0228 = $248; //@line 9936
     $$1233 = 0; //@line 9936
     $$1238 = 6299; //@line 9936
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9936
     $$4266 = $$1263$; //@line 9936
     $281 = $244; //@line 9936
     $283 = $247; //@line 9936
     label = 68; //@line 9937
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9941
     $258 = HEAP32[$256 >> 2] | 0; //@line 9943
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9946
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9949
      $264 = tempRet0; //@line 9950
      $265 = $6; //@line 9951
      HEAP32[$265 >> 2] = $263; //@line 9953
      HEAP32[$265 + 4 >> 2] = $264; //@line 9956
      $$0232 = 1; //@line 9957
      $$0237 = 6299; //@line 9957
      $275 = $263; //@line 9957
      $276 = $264; //@line 9957
      label = 67; //@line 9958
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9970
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 6299 : 6301 : 6300; //@line 9970
      $275 = $258; //@line 9970
      $276 = $261; //@line 9970
      label = 67; //@line 9971
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9977
     $$0232 = 0; //@line 9983
     $$0237 = 6299; //@line 9983
     $275 = HEAP32[$197 >> 2] | 0; //@line 9983
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9983
     label = 67; //@line 9984
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9995
     $$2 = $13; //@line 9996
     $$2234 = 0; //@line 9996
     $$2239 = 6299; //@line 9996
     $$2251 = $11; //@line 9996
     $$5 = 1; //@line 9996
     $$6268 = $196; //@line 9996
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 10003
     label = 72; //@line 10004
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 10008
     $$1 = $302 | 0 ? $302 : 6309; //@line 10011
     label = 72; //@line 10012
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 10022
     HEAP32[$14 >> 2] = 0; //@line 10023
     HEAP32[$6 >> 2] = $8; //@line 10024
     $$4258354 = -1; //@line 10025
     $365 = $8; //@line 10025
     label = 76; //@line 10026
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 10030
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 10033
      $$0240$lcssa356 = 0; //@line 10034
      label = 85; //@line 10035
     } else {
      $$4258354 = $$0254; //@line 10037
      $365 = $$pre348; //@line 10037
      label = 76; //@line 10038
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 10045
     $$0247 = $$1248; //@line 10045
     $$0269 = $$3272; //@line 10045
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 10050
     $$2234 = 0; //@line 10050
     $$2239 = 6299; //@line 10050
     $$2251 = $11; //@line 10050
     $$5 = $$0254; //@line 10050
     $$6268 = $$1263$; //@line 10050
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 10056
    $227 = $6; //@line 10057
    $229 = HEAP32[$227 >> 2] | 0; //@line 10059
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 10062
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 10064
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 10070
    $$0228 = $234; //@line 10075
    $$1233 = $or$cond278 ? 0 : 2; //@line 10075
    $$1238 = $or$cond278 ? 6299 : 6299 + ($$1236 >> 4) | 0; //@line 10075
    $$2256 = $$1255; //@line 10075
    $$4266 = $$3265; //@line 10075
    $281 = $229; //@line 10075
    $283 = $232; //@line 10075
    label = 68; //@line 10076
   } else if ((label | 0) == 67) {
    label = 0; //@line 10079
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 10081
    $$1233 = $$0232; //@line 10081
    $$1238 = $$0237; //@line 10081
    $$2256 = $$0254; //@line 10081
    $$4266 = $$1263$; //@line 10081
    $281 = $275; //@line 10081
    $283 = $276; //@line 10081
    label = 68; //@line 10082
   } else if ((label | 0) == 72) {
    label = 0; //@line 10085
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 10086
    $306 = ($305 | 0) == 0; //@line 10087
    $$2 = $$1; //@line 10094
    $$2234 = 0; //@line 10094
    $$2239 = 6299; //@line 10094
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 10094
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 10094
    $$6268 = $196; //@line 10094
   } else if ((label | 0) == 76) {
    label = 0; //@line 10097
    $$0229316 = $365; //@line 10098
    $$0240315 = 0; //@line 10098
    $$1244314 = 0; //@line 10098
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 10100
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 10103
      $$2245 = $$1244314; //@line 10103
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 10106
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 10112
      $$2245 = $320; //@line 10112
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 10116
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 10119
      $$0240315 = $325; //@line 10119
      $$1244314 = $320; //@line 10119
     } else {
      $$0240$lcssa = $325; //@line 10121
      $$2245 = $320; //@line 10121
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 10127
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 10130
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 10133
     label = 85; //@line 10134
    } else {
     $$1230327 = $365; //@line 10136
     $$1241326 = 0; //@line 10136
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 10138
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10141
       label = 85; //@line 10142
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 10145
      $$1241326 = $331 + $$1241326 | 0; //@line 10146
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10149
       label = 85; //@line 10150
       break L97;
      }
      _out_670($0, $9, $331); //@line 10154
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10159
       label = 85; //@line 10160
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 10157
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 10168
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 10174
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 10176
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 10181
   $$2 = $or$cond ? $$0228 : $11; //@line 10186
   $$2234 = $$1233; //@line 10186
   $$2239 = $$1238; //@line 10186
   $$2251 = $11; //@line 10186
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 10186
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 10186
  } else if ((label | 0) == 85) {
   label = 0; //@line 10189
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 10191
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 10194
   $$0247 = $$1248; //@line 10194
   $$0269 = $$3272; //@line 10194
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 10199
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 10201
  $345 = $$$5 + $$2234 | 0; //@line 10202
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 10204
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 10205
  _out_670($0, $$2239, $$2234); //@line 10206
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 10208
  _pad_676($0, 48, $$$5, $343, 0); //@line 10209
  _out_670($0, $$2, $343); //@line 10210
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 10212
  $$0243 = $$2261; //@line 10213
  $$0247 = $$1248; //@line 10213
  $$0269 = $$3272; //@line 10213
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 10221
    } else {
     $$2242302 = 1; //@line 10223
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 10226
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 10229
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 10233
      $356 = $$2242302 + 1 | 0; //@line 10234
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 10237
      } else {
       $$2242$lcssa = $356; //@line 10239
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 10245
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 10251
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 10257
       } else {
        $$0 = 1; //@line 10259
        break;
       }
      }
     } else {
      $$0 = 1; //@line 10264
     }
    }
   } else {
    $$0 = $$1248; //@line 10268
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10272
 return $$0 | 0; //@line 10272
}
function _main() {
 var $$027 = 0, $$1 = 0, $122 = 0, $51 = 0, $81 = 0, $AsyncCtx = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx21 = 0, $AsyncCtx25 = 0, $AsyncCtx29 = 0, $AsyncCtx33 = 0, $AsyncCtx37 = 0, $AsyncCtx41 = 0, $AsyncCtx44 = 0, $AsyncCtx48 = 0, $AsyncCtx51 = 0, $AsyncCtx54 = 0, $AsyncCtx57 = 0, $AsyncCtx9 = 0, $bitmSan3$byval_copy76 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer3 = 0, $vararg_buffer5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3840
 STACKTOP = STACKTOP + 48 | 0; //@line 3841
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3841
 $bitmSan3$byval_copy76 = sp + 32 | 0; //@line 3842
 $vararg_buffer5 = sp + 24 | 0; //@line 3843
 $vararg_buffer3 = sp + 16 | 0; //@line 3844
 $vararg_buffer1 = sp + 8 | 0; //@line 3845
 $vararg_buffer = sp; //@line 3846
 $AsyncCtx13 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3847
 _puts(5733) | 0; //@line 3848
 if (___async) {
  HEAP32[$AsyncCtx13 >> 2] = 148; //@line 3851
  HEAP32[$AsyncCtx13 + 4 >> 2] = $vararg_buffer; //@line 3853
  HEAP32[$AsyncCtx13 + 8 >> 2] = $vararg_buffer; //@line 3855
  HEAP32[$AsyncCtx13 + 12 >> 2] = $vararg_buffer1; //@line 3857
  HEAP32[$AsyncCtx13 + 16 >> 2] = $vararg_buffer1; //@line 3859
  HEAP32[$AsyncCtx13 + 20 >> 2] = $vararg_buffer3; //@line 3861
  HEAP32[$AsyncCtx13 + 24 >> 2] = $vararg_buffer3; //@line 3863
  HEAP32[$AsyncCtx13 + 28 >> 2] = $vararg_buffer5; //@line 3865
  HEAP32[$AsyncCtx13 + 32 >> 2] = $vararg_buffer5; //@line 3867
  sp = STACKTOP; //@line 3868
  STACKTOP = sp; //@line 3869
  return 0; //@line 3869
 }
 _emscripten_free_async_context($AsyncCtx13 | 0); //@line 3871
 $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3872
 _puts(5755) | 0; //@line 3873
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 149; //@line 3876
  HEAP32[$AsyncCtx9 + 4 >> 2] = $vararg_buffer; //@line 3878
  HEAP32[$AsyncCtx9 + 8 >> 2] = $vararg_buffer; //@line 3880
  HEAP32[$AsyncCtx9 + 12 >> 2] = $vararg_buffer1; //@line 3882
  HEAP32[$AsyncCtx9 + 16 >> 2] = $vararg_buffer1; //@line 3884
  HEAP32[$AsyncCtx9 + 20 >> 2] = $vararg_buffer3; //@line 3886
  HEAP32[$AsyncCtx9 + 24 >> 2] = $vararg_buffer3; //@line 3888
  HEAP32[$AsyncCtx9 + 28 >> 2] = $vararg_buffer5; //@line 3890
  HEAP32[$AsyncCtx9 + 32 >> 2] = $vararg_buffer5; //@line 3892
  sp = STACKTOP; //@line 3893
  STACKTOP = sp; //@line 3894
  return 0; //@line 3894
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3896
 __ZN6C128323clsEv(8872); //@line 3897
 $AsyncCtx44 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3898
 HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[255]; //@line 3899
 HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[256]; //@line 3899
 HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[257]; //@line 3899
 HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[258]; //@line 3899
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, 95, 0); //@line 3900
 if (___async) {
  HEAP32[$AsyncCtx44 >> 2] = 150; //@line 3903
  HEAP32[$AsyncCtx44 + 4 >> 2] = $vararg_buffer; //@line 3905
  HEAP32[$AsyncCtx44 + 8 >> 2] = $vararg_buffer; //@line 3907
  HEAP32[$AsyncCtx44 + 12 >> 2] = $vararg_buffer1; //@line 3909
  HEAP32[$AsyncCtx44 + 16 >> 2] = $vararg_buffer1; //@line 3911
  HEAP32[$AsyncCtx44 + 20 >> 2] = $vararg_buffer3; //@line 3913
  HEAP32[$AsyncCtx44 + 24 >> 2] = $vararg_buffer3; //@line 3915
  HEAP32[$AsyncCtx44 + 28 >> 2] = $vararg_buffer5; //@line 3917
  HEAP32[$AsyncCtx44 + 32 >> 2] = $vararg_buffer5; //@line 3919
  sp = STACKTOP; //@line 3920
  STACKTOP = sp; //@line 3921
  return 0; //@line 3921
 }
 _emscripten_free_async_context($AsyncCtx44 | 0); //@line 3923
 __ZN6C1283211copy_to_lcdEv(8872); //@line 3924
 __ZN6C128327setmodeEi(8872, 1); //@line 3925
 $$027 = -15; //@line 3926
 while (1) {
  $AsyncCtx41 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3928
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[259]; //@line 3929
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[260]; //@line 3929
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[261]; //@line 3929
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[262]; //@line 3929
  __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, $$027, 2); //@line 3930
  if (___async) {
   label = 9; //@line 3933
   break;
  }
  _emscripten_free_async_context($AsyncCtx41 | 0); //@line 3936
  $AsyncCtx57 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3937
  _wait(.20000000298023224); //@line 3938
  if (___async) {
   label = 11; //@line 3941
   break;
  }
  _emscripten_free_async_context($AsyncCtx57 | 0); //@line 3944
  __ZN6C1283211copy_to_lcdEv(8872); //@line 3945
  $AsyncCtx37 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3946
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[259]; //@line 3947
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[260]; //@line 3947
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[261]; //@line 3947
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[262]; //@line 3947
  __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, $$027, 2); //@line 3948
  if (___async) {
   label = 13; //@line 3951
   break;
  }
  _emscripten_free_async_context($AsyncCtx37 | 0); //@line 3954
  $51 = $$027 + 3 | 0; //@line 3955
  $AsyncCtx33 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3956
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[263]; //@line 3957
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[264]; //@line 3957
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[265]; //@line 3957
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[266]; //@line 3957
  __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, $51, 2); //@line 3958
  if (___async) {
   label = 15; //@line 3961
   break;
  }
  _emscripten_free_async_context($AsyncCtx33 | 0); //@line 3964
  $AsyncCtx54 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3965
  _wait(.20000000298023224); //@line 3966
  if (___async) {
   label = 17; //@line 3969
   break;
  }
  _emscripten_free_async_context($AsyncCtx54 | 0); //@line 3972
  __ZN6C1283211copy_to_lcdEv(8872); //@line 3973
  $AsyncCtx29 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3974
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[263]; //@line 3975
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[264]; //@line 3975
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[265]; //@line 3975
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[266]; //@line 3975
  __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, $51, 2); //@line 3976
  if (___async) {
   label = 19; //@line 3979
   break;
  }
  _emscripten_free_async_context($AsyncCtx29 | 0); //@line 3982
  $81 = $$027 + 6 | 0; //@line 3983
  $AsyncCtx25 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3984
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 3985
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 3985
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 3985
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 3985
  __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, $81, 2); //@line 3986
  if (___async) {
   label = 21; //@line 3989
   break;
  }
  _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3992
  $AsyncCtx51 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3993
  _wait(.20000000298023224); //@line 3994
  if (___async) {
   label = 23; //@line 3997
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 4000
  __ZN6C1283211copy_to_lcdEv(8872); //@line 4001
  $AsyncCtx21 = _emscripten_alloc_async_context(40, sp) | 0; //@line 4002
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 4003
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 4003
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 4003
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 4003
  __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, $81, 2); //@line 4004
  if (___async) {
   label = 25; //@line 4007
   break;
  }
  _emscripten_free_async_context($AsyncCtx21 | 0); //@line 4010
  if (($$027 | 0) < 66) {
   $$027 = $$027 + 9 | 0; //@line 4014
  } else {
   label = 27; //@line 4016
   break;
  }
 }
 switch (label | 0) {
 case 9:
  {
   HEAP32[$AsyncCtx41 >> 2] = 151; //@line 4022
   HEAP32[$AsyncCtx41 + 4 >> 2] = $$027; //@line 4024
   HEAP32[$AsyncCtx41 + 8 >> 2] = $vararg_buffer; //@line 4026
   HEAP32[$AsyncCtx41 + 12 >> 2] = $vararg_buffer; //@line 4028
   HEAP32[$AsyncCtx41 + 16 >> 2] = $vararg_buffer1; //@line 4030
   HEAP32[$AsyncCtx41 + 20 >> 2] = $vararg_buffer1; //@line 4032
   HEAP32[$AsyncCtx41 + 24 >> 2] = $vararg_buffer3; //@line 4034
   HEAP32[$AsyncCtx41 + 28 >> 2] = $vararg_buffer3; //@line 4036
   HEAP32[$AsyncCtx41 + 32 >> 2] = $vararg_buffer5; //@line 4038
   HEAP32[$AsyncCtx41 + 36 >> 2] = $vararg_buffer5; //@line 4040
   sp = STACKTOP; //@line 4041
   STACKTOP = sp; //@line 4042
   return 0; //@line 4042
  }
 case 11:
  {
   HEAP32[$AsyncCtx57 >> 2] = 152; //@line 4046
   HEAP32[$AsyncCtx57 + 4 >> 2] = $$027; //@line 4048
   HEAP32[$AsyncCtx57 + 8 >> 2] = $vararg_buffer; //@line 4050
   HEAP32[$AsyncCtx57 + 12 >> 2] = $vararg_buffer; //@line 4052
   HEAP32[$AsyncCtx57 + 16 >> 2] = $vararg_buffer1; //@line 4054
   HEAP32[$AsyncCtx57 + 20 >> 2] = $vararg_buffer1; //@line 4056
   HEAP32[$AsyncCtx57 + 24 >> 2] = $vararg_buffer3; //@line 4058
   HEAP32[$AsyncCtx57 + 28 >> 2] = $vararg_buffer3; //@line 4060
   HEAP32[$AsyncCtx57 + 32 >> 2] = $vararg_buffer5; //@line 4062
   HEAP32[$AsyncCtx57 + 36 >> 2] = $vararg_buffer5; //@line 4064
   sp = STACKTOP; //@line 4065
   STACKTOP = sp; //@line 4066
   return 0; //@line 4066
  }
 case 13:
  {
   HEAP32[$AsyncCtx37 >> 2] = 153; //@line 4070
   HEAP32[$AsyncCtx37 + 4 >> 2] = $$027; //@line 4072
   HEAP32[$AsyncCtx37 + 8 >> 2] = $vararg_buffer; //@line 4074
   HEAP32[$AsyncCtx37 + 12 >> 2] = $vararg_buffer; //@line 4076
   HEAP32[$AsyncCtx37 + 16 >> 2] = $vararg_buffer1; //@line 4078
   HEAP32[$AsyncCtx37 + 20 >> 2] = $vararg_buffer1; //@line 4080
   HEAP32[$AsyncCtx37 + 24 >> 2] = $vararg_buffer3; //@line 4082
   HEAP32[$AsyncCtx37 + 28 >> 2] = $vararg_buffer3; //@line 4084
   HEAP32[$AsyncCtx37 + 32 >> 2] = $vararg_buffer5; //@line 4086
   HEAP32[$AsyncCtx37 + 36 >> 2] = $vararg_buffer5; //@line 4088
   sp = STACKTOP; //@line 4089
   STACKTOP = sp; //@line 4090
   return 0; //@line 4090
  }
 case 15:
  {
   HEAP32[$AsyncCtx33 >> 2] = 154; //@line 4094
   HEAP32[$AsyncCtx33 + 4 >> 2] = $$027; //@line 4096
   HEAP32[$AsyncCtx33 + 8 >> 2] = $vararg_buffer; //@line 4098
   HEAP32[$AsyncCtx33 + 12 >> 2] = $vararg_buffer; //@line 4100
   HEAP32[$AsyncCtx33 + 16 >> 2] = $vararg_buffer1; //@line 4102
   HEAP32[$AsyncCtx33 + 20 >> 2] = $vararg_buffer1; //@line 4104
   HEAP32[$AsyncCtx33 + 24 >> 2] = $vararg_buffer3; //@line 4106
   HEAP32[$AsyncCtx33 + 28 >> 2] = $vararg_buffer3; //@line 4108
   HEAP32[$AsyncCtx33 + 32 >> 2] = $vararg_buffer5; //@line 4110
   HEAP32[$AsyncCtx33 + 36 >> 2] = $vararg_buffer5; //@line 4112
   HEAP32[$AsyncCtx33 + 40 >> 2] = $51; //@line 4114
   sp = STACKTOP; //@line 4115
   STACKTOP = sp; //@line 4116
   return 0; //@line 4116
  }
 case 17:
  {
   HEAP32[$AsyncCtx54 >> 2] = 155; //@line 4120
   HEAP32[$AsyncCtx54 + 4 >> 2] = $$027; //@line 4122
   HEAP32[$AsyncCtx54 + 8 >> 2] = $vararg_buffer; //@line 4124
   HEAP32[$AsyncCtx54 + 12 >> 2] = $vararg_buffer; //@line 4126
   HEAP32[$AsyncCtx54 + 16 >> 2] = $vararg_buffer1; //@line 4128
   HEAP32[$AsyncCtx54 + 20 >> 2] = $vararg_buffer1; //@line 4130
   HEAP32[$AsyncCtx54 + 24 >> 2] = $vararg_buffer3; //@line 4132
   HEAP32[$AsyncCtx54 + 28 >> 2] = $vararg_buffer3; //@line 4134
   HEAP32[$AsyncCtx54 + 32 >> 2] = $vararg_buffer5; //@line 4136
   HEAP32[$AsyncCtx54 + 36 >> 2] = $vararg_buffer5; //@line 4138
   HEAP32[$AsyncCtx54 + 40 >> 2] = $51; //@line 4140
   sp = STACKTOP; //@line 4141
   STACKTOP = sp; //@line 4142
   return 0; //@line 4142
  }
 case 19:
  {
   HEAP32[$AsyncCtx29 >> 2] = 156; //@line 4146
   HEAP32[$AsyncCtx29 + 4 >> 2] = $$027; //@line 4148
   HEAP32[$AsyncCtx29 + 8 >> 2] = $vararg_buffer; //@line 4150
   HEAP32[$AsyncCtx29 + 12 >> 2] = $vararg_buffer; //@line 4152
   HEAP32[$AsyncCtx29 + 16 >> 2] = $vararg_buffer1; //@line 4154
   HEAP32[$AsyncCtx29 + 20 >> 2] = $vararg_buffer1; //@line 4156
   HEAP32[$AsyncCtx29 + 24 >> 2] = $vararg_buffer3; //@line 4158
   HEAP32[$AsyncCtx29 + 28 >> 2] = $vararg_buffer3; //@line 4160
   HEAP32[$AsyncCtx29 + 32 >> 2] = $vararg_buffer5; //@line 4162
   HEAP32[$AsyncCtx29 + 36 >> 2] = $vararg_buffer5; //@line 4164
   sp = STACKTOP; //@line 4165
   STACKTOP = sp; //@line 4166
   return 0; //@line 4166
  }
 case 21:
  {
   HEAP32[$AsyncCtx25 >> 2] = 157; //@line 4170
   HEAP32[$AsyncCtx25 + 4 >> 2] = $81; //@line 4172
   HEAP32[$AsyncCtx25 + 8 >> 2] = $vararg_buffer; //@line 4174
   HEAP32[$AsyncCtx25 + 12 >> 2] = $vararg_buffer; //@line 4176
   HEAP32[$AsyncCtx25 + 16 >> 2] = $vararg_buffer1; //@line 4178
   HEAP32[$AsyncCtx25 + 20 >> 2] = $vararg_buffer1; //@line 4180
   HEAP32[$AsyncCtx25 + 24 >> 2] = $vararg_buffer3; //@line 4182
   HEAP32[$AsyncCtx25 + 28 >> 2] = $vararg_buffer3; //@line 4184
   HEAP32[$AsyncCtx25 + 32 >> 2] = $vararg_buffer5; //@line 4186
   HEAP32[$AsyncCtx25 + 36 >> 2] = $vararg_buffer5; //@line 4188
   HEAP32[$AsyncCtx25 + 40 >> 2] = $$027; //@line 4190
   sp = STACKTOP; //@line 4191
   STACKTOP = sp; //@line 4192
   return 0; //@line 4192
  }
 case 23:
  {
   HEAP32[$AsyncCtx51 >> 2] = 158; //@line 4196
   HEAP32[$AsyncCtx51 + 4 >> 2] = $vararg_buffer; //@line 4198
   HEAP32[$AsyncCtx51 + 8 >> 2] = $vararg_buffer; //@line 4200
   HEAP32[$AsyncCtx51 + 12 >> 2] = $vararg_buffer1; //@line 4202
   HEAP32[$AsyncCtx51 + 16 >> 2] = $vararg_buffer1; //@line 4204
   HEAP32[$AsyncCtx51 + 20 >> 2] = $vararg_buffer3; //@line 4206
   HEAP32[$AsyncCtx51 + 24 >> 2] = $vararg_buffer3; //@line 4208
   HEAP32[$AsyncCtx51 + 28 >> 2] = $vararg_buffer5; //@line 4210
   HEAP32[$AsyncCtx51 + 32 >> 2] = $vararg_buffer5; //@line 4212
   HEAP32[$AsyncCtx51 + 36 >> 2] = $81; //@line 4214
   HEAP32[$AsyncCtx51 + 40 >> 2] = $$027; //@line 4216
   sp = STACKTOP; //@line 4217
   STACKTOP = sp; //@line 4218
   return 0; //@line 4218
  }
 case 25:
  {
   HEAP32[$AsyncCtx21 >> 2] = 159; //@line 4222
   HEAP32[$AsyncCtx21 + 4 >> 2] = $vararg_buffer; //@line 4224
   HEAP32[$AsyncCtx21 + 8 >> 2] = $vararg_buffer; //@line 4226
   HEAP32[$AsyncCtx21 + 12 >> 2] = $vararg_buffer1; //@line 4228
   HEAP32[$AsyncCtx21 + 16 >> 2] = $vararg_buffer1; //@line 4230
   HEAP32[$AsyncCtx21 + 20 >> 2] = $vararg_buffer3; //@line 4232
   HEAP32[$AsyncCtx21 + 24 >> 2] = $vararg_buffer3; //@line 4234
   HEAP32[$AsyncCtx21 + 28 >> 2] = $vararg_buffer5; //@line 4236
   HEAP32[$AsyncCtx21 + 32 >> 2] = $vararg_buffer5; //@line 4238
   HEAP32[$AsyncCtx21 + 36 >> 2] = $$027; //@line 4240
   sp = STACKTOP; //@line 4241
   STACKTOP = sp; //@line 4242
   return 0; //@line 4242
  }
 case 27:
  {
   $AsyncCtx17 = _emscripten_alloc_async_context(36, sp) | 0; //@line 4246
   HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 4247
   HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 4247
   HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 4247
   HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 4247
   __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy76, 75, 2); //@line 4248
   if (___async) {
    HEAP32[$AsyncCtx17 >> 2] = 160; //@line 4251
    HEAP32[$AsyncCtx17 + 4 >> 2] = $vararg_buffer; //@line 4253
    HEAP32[$AsyncCtx17 + 8 >> 2] = $vararg_buffer; //@line 4255
    HEAP32[$AsyncCtx17 + 12 >> 2] = $vararg_buffer1; //@line 4257
    HEAP32[$AsyncCtx17 + 16 >> 2] = $vararg_buffer1; //@line 4259
    HEAP32[$AsyncCtx17 + 20 >> 2] = $vararg_buffer3; //@line 4261
    HEAP32[$AsyncCtx17 + 24 >> 2] = $vararg_buffer3; //@line 4263
    HEAP32[$AsyncCtx17 + 28 >> 2] = $vararg_buffer5; //@line 4265
    HEAP32[$AsyncCtx17 + 32 >> 2] = $vararg_buffer5; //@line 4267
    sp = STACKTOP; //@line 4268
    STACKTOP = sp; //@line 4269
    return 0; //@line 4269
   }
   _emscripten_free_async_context($AsyncCtx17 | 0); //@line 4271
   __ZN6C1283211set_auto_upEj(8872, 0); //@line 4272
   $$1 = -20; //@line 4273
   while (1) {
    __ZN6C128326locateEii(8872, 5, $$1); //@line 4276
    __ZN4mbed6Stream6printfEPKcz(8872, 5809, $vararg_buffer) | 0; //@line 4277
    $122 = $$1 + 12 | 0; //@line 4278
    __ZN6C128326locateEii(8872, 5, $122); //@line 4279
    __ZN4mbed6Stream6printfEPKcz(8872, 5815, $vararg_buffer1) | 0; //@line 4280
    __ZN6C1283211copy_to_lcdEv(8872); //@line 4281
    if (($$1 | 0) >= 5) {
     break;
    }
    __ZN6C128326locateEii(8872, 5, $$1); //@line 4285
    $AsyncCtx48 = _emscripten_alloc_async_context(44, sp) | 0; //@line 4286
    _wait(.20000000298023224); //@line 4287
    if (___async) {
     label = 32; //@line 4290
     break;
    }
    _emscripten_free_async_context($AsyncCtx48 | 0); //@line 4293
    __ZN4mbed6Stream6printfEPKcz(8872, 5809, $vararg_buffer3) | 0; //@line 4294
    __ZN6C128326locateEii(8872, 5, $122); //@line 4295
    __ZN4mbed6Stream6printfEPKcz(8872, 5815, $vararg_buffer5) | 0; //@line 4296
    __ZN6C1283211copy_to_lcdEv(8872); //@line 4297
    $$1 = $$1 + 2 | 0; //@line 4299
   }
   if ((label | 0) == 32) {
    HEAP32[$AsyncCtx48 >> 2] = 161; //@line 4302
    HEAP32[$AsyncCtx48 + 4 >> 2] = $vararg_buffer3; //@line 4304
    HEAP32[$AsyncCtx48 + 8 >> 2] = $vararg_buffer3; //@line 4306
    HEAP32[$AsyncCtx48 + 12 >> 2] = $122; //@line 4308
    HEAP32[$AsyncCtx48 + 16 >> 2] = $vararg_buffer5; //@line 4310
    HEAP32[$AsyncCtx48 + 20 >> 2] = $vararg_buffer5; //@line 4312
    HEAP32[$AsyncCtx48 + 24 >> 2] = $$1; //@line 4314
    HEAP32[$AsyncCtx48 + 28 >> 2] = $vararg_buffer; //@line 4316
    HEAP32[$AsyncCtx48 + 32 >> 2] = $vararg_buffer; //@line 4318
    HEAP32[$AsyncCtx48 + 36 >> 2] = $vararg_buffer1; //@line 4320
    HEAP32[$AsyncCtx48 + 40 >> 2] = $vararg_buffer1; //@line 4322
    sp = STACKTOP; //@line 4323
    STACKTOP = sp; //@line 4324
    return 0; //@line 4324
   }
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4326
   _puts(5825) | 0; //@line 4327
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 162; //@line 4330
    sp = STACKTOP; //@line 4331
    STACKTOP = sp; //@line 4332
    return 0; //@line 4332
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4334
    STACKTOP = sp; //@line 4335
    return 0; //@line 4335
   }
   break;
  }
 }
 return 0; //@line 4340
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 6714
 $3 = HEAP32[3268] | 0; //@line 6715
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6718
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6722
 $7 = $6 & 3; //@line 6723
 if (($7 | 0) == 1) {
  _abort(); //@line 6726
 }
 $9 = $6 & -8; //@line 6729
 $10 = $2 + $9 | 0; //@line 6730
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6735
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6741
   $17 = $13 + $9 | 0; //@line 6742
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6745
   }
   if ((HEAP32[3269] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6751
    $106 = HEAP32[$105 >> 2] | 0; //@line 6752
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6756
     $$1382 = $17; //@line 6756
     $114 = $16; //@line 6756
     break;
    }
    HEAP32[3266] = $17; //@line 6759
    HEAP32[$105 >> 2] = $106 & -2; //@line 6761
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6764
    HEAP32[$16 + $17 >> 2] = $17; //@line 6766
    return;
   }
   $21 = $13 >>> 3; //@line 6769
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6773
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6775
    $28 = 13096 + ($21 << 1 << 2) | 0; //@line 6777
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6782
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6789
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3264] = HEAP32[3264] & ~(1 << $21); //@line 6799
     $$1 = $16; //@line 6800
     $$1382 = $17; //@line 6800
     $114 = $16; //@line 6800
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6806
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6810
     }
     $41 = $26 + 8 | 0; //@line 6813
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6817
     } else {
      _abort(); //@line 6819
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6824
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6825
    $$1 = $16; //@line 6826
    $$1382 = $17; //@line 6826
    $114 = $16; //@line 6826
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6830
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6832
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6836
     $60 = $59 + 4 | 0; //@line 6837
     $61 = HEAP32[$60 >> 2] | 0; //@line 6838
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6841
      if (!$63) {
       $$3 = 0; //@line 6844
       break;
      } else {
       $$1387 = $63; //@line 6847
       $$1390 = $59; //@line 6847
      }
     } else {
      $$1387 = $61; //@line 6850
      $$1390 = $60; //@line 6850
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6853
      $66 = HEAP32[$65 >> 2] | 0; //@line 6854
      if ($66 | 0) {
       $$1387 = $66; //@line 6857
       $$1390 = $65; //@line 6857
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6860
      $69 = HEAP32[$68 >> 2] | 0; //@line 6861
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6866
       $$1390 = $68; //@line 6866
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6871
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6874
      $$3 = $$1387; //@line 6875
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6880
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6883
     }
     $53 = $51 + 12 | 0; //@line 6886
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6890
     }
     $56 = $48 + 8 | 0; //@line 6893
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6897
      HEAP32[$56 >> 2] = $51; //@line 6898
      $$3 = $48; //@line 6899
      break;
     } else {
      _abort(); //@line 6902
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6909
    $$1382 = $17; //@line 6909
    $114 = $16; //@line 6909
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6912
    $75 = 13360 + ($74 << 2) | 0; //@line 6913
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6918
      if (!$$3) {
       HEAP32[3265] = HEAP32[3265] & ~(1 << $74); //@line 6925
       $$1 = $16; //@line 6926
       $$1382 = $17; //@line 6926
       $114 = $16; //@line 6926
       break L10;
      }
     } else {
      if ((HEAP32[3268] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6933
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6941
       if (!$$3) {
        $$1 = $16; //@line 6944
        $$1382 = $17; //@line 6944
        $114 = $16; //@line 6944
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3268] | 0; //@line 6952
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6955
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6959
    $92 = $16 + 16 | 0; //@line 6960
    $93 = HEAP32[$92 >> 2] | 0; //@line 6961
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6967
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6971
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6973
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6979
    if (!$99) {
     $$1 = $16; //@line 6982
     $$1382 = $17; //@line 6982
     $114 = $16; //@line 6982
    } else {
     if ((HEAP32[3268] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6987
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6991
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6993
      $$1 = $16; //@line 6994
      $$1382 = $17; //@line 6994
      $114 = $16; //@line 6994
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 7000
   $$1382 = $9; //@line 7000
   $114 = $2; //@line 7000
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 7005
 }
 $115 = $10 + 4 | 0; //@line 7008
 $116 = HEAP32[$115 >> 2] | 0; //@line 7009
 if (!($116 & 1)) {
  _abort(); //@line 7013
 }
 if (!($116 & 2)) {
  if ((HEAP32[3270] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3267] | 0) + $$1382 | 0; //@line 7023
   HEAP32[3267] = $124; //@line 7024
   HEAP32[3270] = $$1; //@line 7025
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 7028
   if (($$1 | 0) != (HEAP32[3269] | 0)) {
    return;
   }
   HEAP32[3269] = 0; //@line 7034
   HEAP32[3266] = 0; //@line 7035
   return;
  }
  if ((HEAP32[3269] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3266] | 0) + $$1382 | 0; //@line 7042
   HEAP32[3266] = $132; //@line 7043
   HEAP32[3269] = $114; //@line 7044
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 7047
   HEAP32[$114 + $132 >> 2] = $132; //@line 7049
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 7053
  $138 = $116 >>> 3; //@line 7054
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 7059
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 7061
    $145 = 13096 + ($138 << 1 << 2) | 0; //@line 7063
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3268] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 7069
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 7076
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3264] = HEAP32[3264] & ~(1 << $138); //@line 7086
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 7092
    } else {
     if ((HEAP32[3268] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 7097
     }
     $160 = $143 + 8 | 0; //@line 7100
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 7104
     } else {
      _abort(); //@line 7106
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 7111
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 7112
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 7115
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 7117
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 7121
      $180 = $179 + 4 | 0; //@line 7122
      $181 = HEAP32[$180 >> 2] | 0; //@line 7123
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 7126
       if (!$183) {
        $$3400 = 0; //@line 7129
        break;
       } else {
        $$1398 = $183; //@line 7132
        $$1402 = $179; //@line 7132
       }
      } else {
       $$1398 = $181; //@line 7135
       $$1402 = $180; //@line 7135
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 7138
       $186 = HEAP32[$185 >> 2] | 0; //@line 7139
       if ($186 | 0) {
        $$1398 = $186; //@line 7142
        $$1402 = $185; //@line 7142
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 7145
       $189 = HEAP32[$188 >> 2] | 0; //@line 7146
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 7151
        $$1402 = $188; //@line 7151
       }
      }
      if ((HEAP32[3268] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 7157
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 7160
       $$3400 = $$1398; //@line 7161
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 7166
      if ((HEAP32[3268] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 7170
      }
      $173 = $170 + 12 | 0; //@line 7173
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 7177
      }
      $176 = $167 + 8 | 0; //@line 7180
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 7184
       HEAP32[$176 >> 2] = $170; //@line 7185
       $$3400 = $167; //@line 7186
       break;
      } else {
       _abort(); //@line 7189
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 7197
     $196 = 13360 + ($195 << 2) | 0; //@line 7198
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 7203
       if (!$$3400) {
        HEAP32[3265] = HEAP32[3265] & ~(1 << $195); //@line 7210
        break L108;
       }
      } else {
       if ((HEAP32[3268] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 7217
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 7225
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3268] | 0; //@line 7235
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 7238
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 7242
     $213 = $10 + 16 | 0; //@line 7243
     $214 = HEAP32[$213 >> 2] | 0; //@line 7244
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 7250
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 7254
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 7256
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 7262
     if ($220 | 0) {
      if ((HEAP32[3268] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 7268
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 7272
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 7274
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 7283
  HEAP32[$114 + $137 >> 2] = $137; //@line 7285
  if (($$1 | 0) == (HEAP32[3269] | 0)) {
   HEAP32[3266] = $137; //@line 7289
   return;
  } else {
   $$2 = $137; //@line 7292
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 7296
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 7299
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 7301
  $$2 = $$1382; //@line 7302
 }
 $235 = $$2 >>> 3; //@line 7304
 if ($$2 >>> 0 < 256) {
  $238 = 13096 + ($235 << 1 << 2) | 0; //@line 7308
  $239 = HEAP32[3264] | 0; //@line 7309
  $240 = 1 << $235; //@line 7310
  if (!($239 & $240)) {
   HEAP32[3264] = $239 | $240; //@line 7315
   $$0403 = $238; //@line 7317
   $$pre$phiZ2D = $238 + 8 | 0; //@line 7317
  } else {
   $244 = $238 + 8 | 0; //@line 7319
   $245 = HEAP32[$244 >> 2] | 0; //@line 7320
   if ((HEAP32[3268] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 7324
   } else {
    $$0403 = $245; //@line 7327
    $$pre$phiZ2D = $244; //@line 7327
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 7330
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 7332
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 7334
  HEAP32[$$1 + 12 >> 2] = $238; //@line 7336
  return;
 }
 $251 = $$2 >>> 8; //@line 7339
 if (!$251) {
  $$0396 = 0; //@line 7342
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7346
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7350
   $257 = $251 << $256; //@line 7351
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7354
   $262 = $257 << $260; //@line 7356
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7359
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7364
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7370
  }
 }
 $276 = 13360 + ($$0396 << 2) | 0; //@line 7373
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7375
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7378
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7379
 $280 = HEAP32[3265] | 0; //@line 7380
 $281 = 1 << $$0396; //@line 7381
 do {
  if (!($280 & $281)) {
   HEAP32[3265] = $280 | $281; //@line 7387
   HEAP32[$276 >> 2] = $$1; //@line 7388
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7390
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7392
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7394
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7402
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7402
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7409
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7413
    $301 = HEAP32[$299 >> 2] | 0; //@line 7415
    if (!$301) {
     label = 121; //@line 7418
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7421
     $$0384 = $301; //@line 7421
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3268] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7428
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7431
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7433
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7435
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7437
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7442
    $309 = HEAP32[$308 >> 2] | 0; //@line 7443
    $310 = HEAP32[3268] | 0; //@line 7444
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7450
     HEAP32[$308 >> 2] = $$1; //@line 7451
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7453
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7455
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7457
     break;
    } else {
     _abort(); //@line 7460
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3272] | 0) + -1 | 0; //@line 7467
 HEAP32[3272] = $319; //@line 7468
 if (!$319) {
  $$0212$in$i = 13512; //@line 7471
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7476
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7482
  }
 }
 HEAP32[3272] = -1; //@line 7485
 return;
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $31 = 0, $33 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $56 = 0, $57 = 0, $6 = 0, $62 = 0, $64 = 0, $65 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 298
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 300
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 302
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 304
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 306
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 308
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 310
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 312
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 314
 $18 = HEAP8[$0 + 36 >> 0] | 0; //@line 316
 $20 = HEAP8[$0 + 37 >> 0] | 0; //@line 318
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 320
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 322
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 324
 if ((HEAP32[$0 + 52 >> 2] | 0) >>> 0 > (HEAP32[___async_retval >> 2] | 0) >>> 0) {
  HEAP32[$4 >> 2] = 0; //@line 331
  $31 = $10 + 64 | 0; //@line 332
  $33 = (HEAP32[$31 >> 2] | 0) + $2 | 0; //@line 334
  HEAP32[$31 >> 2] = $33; //@line 335
  $36 = HEAP32[(HEAP32[$26 >> 2] | 0) + 128 >> 2] | 0; //@line 338
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(60) | 0; //@line 339
  $37 = FUNCTION_TABLE_ii[$36 & 31]($10) | 0; //@line 340
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 343
   $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 344
   HEAP32[$38 >> 2] = $24; //@line 345
   $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 346
   HEAP32[$39 >> 2] = $33; //@line 347
   $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 348
   HEAP32[$40 >> 2] = $14; //@line 349
   $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 350
   HEAP32[$41 >> 2] = $16; //@line 351
   $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 352
   HEAP8[$42 >> 0] = $18; //@line 353
   $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 354
   HEAP32[$43 >> 2] = $31; //@line 355
   $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 356
   HEAP32[$44 >> 2] = $4; //@line 357
   $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 358
   HEAP8[$45 >> 0] = $20; //@line 359
   $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 360
   HEAP32[$46 >> 2] = $10; //@line 361
   $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 362
   HEAP32[$47 >> 2] = $22; //@line 363
   $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 364
   HEAP32[$48 >> 2] = $6; //@line 365
   $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 366
   HEAP32[$49 >> 2] = $8; //@line 367
   $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 368
   HEAP32[$50 >> 2] = $12; //@line 369
   $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 370
   HEAP32[$51 >> 2] = $2; //@line 371
   sp = STACKTOP; //@line 372
   return;
  }
  HEAP32[___async_retval >> 2] = $37; //@line 376
  ___async_unwind = 0; //@line 377
  HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 378
  $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 379
  HEAP32[$38 >> 2] = $24; //@line 380
  $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 381
  HEAP32[$39 >> 2] = $33; //@line 382
  $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 383
  HEAP32[$40 >> 2] = $14; //@line 384
  $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 385
  HEAP32[$41 >> 2] = $16; //@line 386
  $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 387
  HEAP8[$42 >> 0] = $18; //@line 388
  $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 389
  HEAP32[$43 >> 2] = $31; //@line 390
  $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 391
  HEAP32[$44 >> 2] = $4; //@line 392
  $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 393
  HEAP8[$45 >> 0] = $20; //@line 394
  $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 395
  HEAP32[$46 >> 2] = $10; //@line 396
  $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 397
  HEAP32[$47 >> 2] = $22; //@line 398
  $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 399
  HEAP32[$48 >> 2] = $6; //@line 400
  $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 401
  HEAP32[$49 >> 2] = $8; //@line 402
  $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 403
  HEAP32[$50 >> 2] = $12; //@line 404
  $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 405
  HEAP32[$51 >> 2] = $2; //@line 406
  sp = STACKTOP; //@line 407
  return;
 }
 $56 = (HEAP32[$24 >> 2] | 0) + ((Math_imul($14 + -32 | 0, $16) | 0) + 4) | 0; //@line 414
 $57 = HEAP8[$56 >> 0] | 0; //@line 415
 if ($18 << 24 >> 24) {
  if ($20 << 24 >> 24) {
   $62 = (0 >>> 3 & 31) + 1 | 0; //@line 422
   $64 = 1 << 0; //@line 424
   $65 = 0 + $22 | 0; //@line 425
   $75 = HEAP32[(HEAP32[$10 >> 2] | 0) + 120 >> 2] | 0; //@line 435
   $76 = 0 + $8 | 0; //@line 436
   if (!($64 & (HEAPU8[$56 + ($62 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 438
    FUNCTION_TABLE_viiii[$75 & 7]($10, $76, $65, 0); //@line 439
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 442
     $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 443
     HEAP32[$92 >> 2] = 0; //@line 444
     $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 445
     HEAP32[$93 >> 2] = $12; //@line 446
     $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 447
     HEAP32[$94 >> 2] = 0; //@line 448
     $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 449
     HEAP32[$95 >> 2] = $2; //@line 450
     $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 451
     HEAP32[$96 >> 2] = $6; //@line 452
     $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 453
     HEAP32[$97 >> 2] = $62; //@line 454
     $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 455
     HEAP32[$98 >> 2] = $56; //@line 456
     $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 457
     HEAP32[$99 >> 2] = $64; //@line 458
     $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 459
     HEAP32[$100 >> 2] = $10; //@line 460
     $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 461
     HEAP32[$101 >> 2] = $8; //@line 462
     $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 463
     HEAP32[$102 >> 2] = $10; //@line 464
     $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 465
     HEAP32[$103 >> 2] = $65; //@line 466
     $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 467
     HEAP8[$104 >> 0] = $57; //@line 468
     $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 469
     HEAP32[$105 >> 2] = $4; //@line 470
     $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 471
     HEAP32[$106 >> 2] = $22; //@line 472
     sp = STACKTOP; //@line 473
     return;
    }
    ___async_unwind = 0; //@line 476
    HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 477
    $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 478
    HEAP32[$92 >> 2] = 0; //@line 479
    $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 480
    HEAP32[$93 >> 2] = $12; //@line 481
    $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 482
    HEAP32[$94 >> 2] = 0; //@line 483
    $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 484
    HEAP32[$95 >> 2] = $2; //@line 485
    $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 486
    HEAP32[$96 >> 2] = $6; //@line 487
    $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 488
    HEAP32[$97 >> 2] = $62; //@line 489
    $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 490
    HEAP32[$98 >> 2] = $56; //@line 491
    $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 492
    HEAP32[$99 >> 2] = $64; //@line 493
    $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 494
    HEAP32[$100 >> 2] = $10; //@line 495
    $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 496
    HEAP32[$101 >> 2] = $8; //@line 497
    $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 498
    HEAP32[$102 >> 2] = $10; //@line 499
    $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 500
    HEAP32[$103 >> 2] = $65; //@line 501
    $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 502
    HEAP8[$104 >> 0] = $57; //@line 503
    $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 504
    HEAP32[$105 >> 2] = $4; //@line 505
    $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 506
    HEAP32[$106 >> 2] = $22; //@line 507
    sp = STACKTOP; //@line 508
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 511
    FUNCTION_TABLE_viiii[$75 & 7]($10, $76, $65, 1); //@line 512
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 515
     $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 516
     HEAP32[$77 >> 2] = 0; //@line 517
     $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 518
     HEAP32[$78 >> 2] = $12; //@line 519
     $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 520
     HEAP32[$79 >> 2] = 0; //@line 521
     $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 522
     HEAP32[$80 >> 2] = $2; //@line 523
     $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 524
     HEAP32[$81 >> 2] = $6; //@line 525
     $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 526
     HEAP32[$82 >> 2] = $62; //@line 527
     $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 528
     HEAP32[$83 >> 2] = $56; //@line 529
     $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 530
     HEAP32[$84 >> 2] = $64; //@line 531
     $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 532
     HEAP32[$85 >> 2] = $10; //@line 533
     $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 534
     HEAP32[$86 >> 2] = $8; //@line 535
     $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 536
     HEAP32[$87 >> 2] = $10; //@line 537
     $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 538
     HEAP32[$88 >> 2] = $65; //@line 539
     $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 540
     HEAP8[$89 >> 0] = $57; //@line 541
     $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 542
     HEAP32[$90 >> 2] = $4; //@line 543
     $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 544
     HEAP32[$91 >> 2] = $22; //@line 545
     sp = STACKTOP; //@line 546
     return;
    }
    ___async_unwind = 0; //@line 549
    HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 550
    $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 551
    HEAP32[$77 >> 2] = 0; //@line 552
    $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 553
    HEAP32[$78 >> 2] = $12; //@line 554
    $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 555
    HEAP32[$79 >> 2] = 0; //@line 556
    $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 557
    HEAP32[$80 >> 2] = $2; //@line 558
    $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 559
    HEAP32[$81 >> 2] = $6; //@line 560
    $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 561
    HEAP32[$82 >> 2] = $62; //@line 562
    $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 563
    HEAP32[$83 >> 2] = $56; //@line 564
    $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 565
    HEAP32[$84 >> 2] = $64; //@line 566
    $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 567
    HEAP32[$85 >> 2] = $10; //@line 568
    $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 569
    HEAP32[$86 >> 2] = $8; //@line 570
    $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 571
    HEAP32[$87 >> 2] = $10; //@line 572
    $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 573
    HEAP32[$88 >> 2] = $65; //@line 574
    $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 575
    HEAP8[$89 >> 0] = $57; //@line 576
    $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 577
    HEAP32[$90 >> 2] = $4; //@line 578
    $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 579
    HEAP32[$91 >> 2] = $22; //@line 580
    sp = STACKTOP; //@line 581
    return;
   }
  }
 }
 HEAP32[$4 >> 2] = (HEAP32[$4 >> 2] | 0) + ($57 & 255); //@line 589
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13788
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13794
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 13803
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 13808
      $19 = $1 + 44 | 0; //@line 13809
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 13818
      $26 = $1 + 52 | 0; //@line 13819
      $27 = $1 + 53 | 0; //@line 13820
      $28 = $1 + 54 | 0; //@line 13821
      $29 = $0 + 8 | 0; //@line 13822
      $30 = $1 + 24 | 0; //@line 13823
      $$081$off0 = 0; //@line 13824
      $$084 = $0 + 16 | 0; //@line 13824
      $$085$off0 = 0; //@line 13824
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 13828
        label = 20; //@line 13829
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 13832
       HEAP8[$27 >> 0] = 0; //@line 13833
       $AsyncCtx15 = _emscripten_alloc_async_context(52, sp) | 0; //@line 13834
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 13835
       if (___async) {
        label = 12; //@line 13838
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 13841
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 13845
        label = 20; //@line 13846
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 13853
         $$186$off0 = $$085$off0; //@line 13853
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 13862
           label = 20; //@line 13863
           break L10;
          } else {
           $$182$off0 = 1; //@line 13866
           $$186$off0 = $$085$off0; //@line 13866
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 13873
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 13880
          break L10;
         } else {
          $$182$off0 = 1; //@line 13883
          $$186$off0 = 1; //@line 13883
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 13888
       $$084 = $$084 + 8 | 0; //@line 13888
       $$085$off0 = $$186$off0; //@line 13888
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 203; //@line 13891
       HEAP32[$AsyncCtx15 + 4 >> 2] = $26; //@line 13893
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 13895
       HEAP32[$AsyncCtx15 + 12 >> 2] = $27; //@line 13897
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 13899
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 13901
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 13904
       HEAP8[$AsyncCtx15 + 25 >> 0] = $$085$off0 & 1; //@line 13907
       HEAP8[$AsyncCtx15 + 26 >> 0] = $$081$off0 & 1; //@line 13910
       HEAP32[$AsyncCtx15 + 28 >> 2] = $$084; //@line 13912
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 13914
       HEAP32[$AsyncCtx15 + 36 >> 2] = $28; //@line 13916
       HEAP32[$AsyncCtx15 + 40 >> 2] = $13; //@line 13918
       HEAP32[$AsyncCtx15 + 44 >> 2] = $19; //@line 13920
       HEAP32[$AsyncCtx15 + 48 >> 2] = $25; //@line 13922
       sp = STACKTOP; //@line 13923
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13929
         $61 = $1 + 40 | 0; //@line 13930
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13933
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13941
           if ($$283$off0) {
            label = 25; //@line 13943
            break;
           } else {
            $69 = 4; //@line 13946
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13953
        } else {
         $69 = 4; //@line 13955
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13960
      }
      HEAP32[$19 >> 2] = $69; //@line 13962
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13971
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13976
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13977
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13978
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13979
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 204; //@line 13982
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 13984
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 13986
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 13988
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 13990
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 13993
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 13995
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 13997
    sp = STACKTOP; //@line 13998
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 14001
   $81 = $0 + 24 | 0; //@line 14002
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 14006
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 14010
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 14017
       $$2 = $81; //@line 14018
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 14030
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 14031
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 14036
        $136 = $$2 + 8 | 0; //@line 14037
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 14040
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 207; //@line 14045
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 14047
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 14049
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 14051
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 14053
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 14055
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 14057
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 14059
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 14062
       sp = STACKTOP; //@line 14063
       return;
      }
      $104 = $1 + 24 | 0; //@line 14066
      $105 = $1 + 54 | 0; //@line 14067
      $$1 = $81; //@line 14068
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 14084
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 14085
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 14090
       $122 = $$1 + 8 | 0; //@line 14091
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 14094
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 206; //@line 14099
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 14101
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 14103
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 14105
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 14107
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 14109
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 14111
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 14113
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 14115
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 14118
      sp = STACKTOP; //@line 14119
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 14123
    $$0 = $81; //@line 14124
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 14131
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 14132
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 14137
     $100 = $$0 + 8 | 0; //@line 14138
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 14141
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 205; //@line 14146
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 14148
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 14150
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 14152
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 14154
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 14156
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 14158
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 14161
    sp = STACKTOP; //@line 14162
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 7313
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 7314
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 7315
 $d_sroa_0_0_extract_trunc = $b$0; //@line 7316
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 7317
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 7318
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 7320
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 7323
    HEAP32[$rem + 4 >> 2] = 0; //@line 7324
   }
   $_0$1 = 0; //@line 7326
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 7327
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7328
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 7331
    $_0$0 = 0; //@line 7332
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7333
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 7335
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 7336
   $_0$1 = 0; //@line 7337
   $_0$0 = 0; //@line 7338
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7339
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 7342
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 7347
     HEAP32[$rem + 4 >> 2] = 0; //@line 7348
    }
    $_0$1 = 0; //@line 7350
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 7351
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7352
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 7356
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 7357
    }
    $_0$1 = 0; //@line 7359
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 7360
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7361
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 7363
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 7366
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 7367
    }
    $_0$1 = 0; //@line 7369
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 7370
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7371
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 7374
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 7376
    $58 = 31 - $51 | 0; //@line 7377
    $sr_1_ph = $57; //@line 7378
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 7379
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 7380
    $q_sroa_0_1_ph = 0; //@line 7381
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 7382
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 7386
    $_0$0 = 0; //@line 7387
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7388
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 7390
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 7391
   $_0$1 = 0; //@line 7392
   $_0$0 = 0; //@line 7393
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7394
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 7398
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 7400
     $126 = 31 - $119 | 0; //@line 7401
     $130 = $119 - 31 >> 31; //@line 7402
     $sr_1_ph = $125; //@line 7403
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 7404
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 7405
     $q_sroa_0_1_ph = 0; //@line 7406
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 7407
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 7411
     $_0$0 = 0; //@line 7412
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7413
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 7415
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 7416
    $_0$1 = 0; //@line 7417
    $_0$0 = 0; //@line 7418
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7419
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 7421
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 7424
    $89 = 64 - $88 | 0; //@line 7425
    $91 = 32 - $88 | 0; //@line 7426
    $92 = $91 >> 31; //@line 7427
    $95 = $88 - 32 | 0; //@line 7428
    $105 = $95 >> 31; //@line 7429
    $sr_1_ph = $88; //@line 7430
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 7431
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 7432
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 7433
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 7434
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 7438
    HEAP32[$rem + 4 >> 2] = 0; //@line 7439
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 7442
    $_0$0 = $a$0 | 0 | 0; //@line 7443
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7444
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 7446
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 7447
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 7448
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7449
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 7454
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 7455
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 7456
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 7457
  $carry_0_lcssa$1 = 0; //@line 7458
  $carry_0_lcssa$0 = 0; //@line 7459
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 7461
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 7462
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 7463
  $137$1 = tempRet0; //@line 7464
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 7465
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 7466
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 7467
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 7468
  $sr_1202 = $sr_1_ph; //@line 7469
  $carry_0203 = 0; //@line 7470
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 7472
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 7473
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 7474
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 7475
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 7476
   $150$1 = tempRet0; //@line 7477
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 7478
   $carry_0203 = $151$0 & 1; //@line 7479
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 7481
   $r_sroa_1_1200 = tempRet0; //@line 7482
   $sr_1202 = $sr_1202 - 1 | 0; //@line 7483
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 7495
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 7496
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 7497
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 7498
  $carry_0_lcssa$1 = 0; //@line 7499
  $carry_0_lcssa$0 = $carry_0203; //@line 7500
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 7502
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 7503
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 7506
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 7507
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 7509
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 7510
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 7511
}
function __ZN6C128329characterEiii__async_cb_9($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1049
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1053
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1055
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1057
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1059
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1061
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1063
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1065
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1067
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1069
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1071
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1073
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 1075
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1077
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1079
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1080
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 1084
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 1093
    $$043$us$reg2mem$0 = $32; //@line 1093
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 1093
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 1093
    $$reg2mem21$0 = $32 + $30 | 0; //@line 1093
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 1099
   return;
  } else {
   $$04142$us = $79; //@line 1102
   $$043$us$reg2mem$0 = $6; //@line 1102
   $$reg2mem$0 = $12; //@line 1102
   $$reg2mem17$0 = $16; //@line 1102
   $$reg2mem21$0 = $24; //@line 1102
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 1111
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 1114
 $48 = $$04142$us + $20 | 0; //@line 1115
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1117
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 1118
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 1121
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1122
   HEAP32[$64 >> 2] = $$04142$us; //@line 1123
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1124
   HEAP32[$65 >> 2] = $4; //@line 1125
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1126
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1127
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1128
   HEAP32[$67 >> 2] = $8; //@line 1129
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1130
   HEAP32[$68 >> 2] = $10; //@line 1131
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1132
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1133
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1134
   HEAP32[$70 >> 2] = $14; //@line 1135
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1136
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1137
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1138
   HEAP32[$72 >> 2] = $18; //@line 1139
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1140
   HEAP32[$73 >> 2] = $20; //@line 1141
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1142
   HEAP32[$74 >> 2] = $22; //@line 1143
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1144
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1145
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1146
   HEAP8[$76 >> 0] = $26; //@line 1147
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1148
   HEAP32[$77 >> 2] = $28; //@line 1149
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1150
   HEAP32[$78 >> 2] = $30; //@line 1151
   sp = STACKTOP; //@line 1152
   return;
  }
  ___async_unwind = 0; //@line 1155
  HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 1156
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1157
  HEAP32[$64 >> 2] = $$04142$us; //@line 1158
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1159
  HEAP32[$65 >> 2] = $4; //@line 1160
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1161
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1162
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1163
  HEAP32[$67 >> 2] = $8; //@line 1164
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1165
  HEAP32[$68 >> 2] = $10; //@line 1166
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1167
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1168
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1169
  HEAP32[$70 >> 2] = $14; //@line 1170
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1171
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1172
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1173
  HEAP32[$72 >> 2] = $18; //@line 1174
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1175
  HEAP32[$73 >> 2] = $20; //@line 1176
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1177
  HEAP32[$74 >> 2] = $22; //@line 1178
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1179
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1180
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1181
  HEAP8[$76 >> 0] = $26; //@line 1182
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1183
  HEAP32[$77 >> 2] = $28; //@line 1184
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1185
  HEAP32[$78 >> 2] = $30; //@line 1186
  sp = STACKTOP; //@line 1187
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 1190
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 1191
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 1194
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1195
   HEAP32[$49 >> 2] = $$04142$us; //@line 1196
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1197
   HEAP32[$50 >> 2] = $4; //@line 1198
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1199
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1200
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1201
   HEAP32[$52 >> 2] = $8; //@line 1202
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1203
   HEAP32[$53 >> 2] = $10; //@line 1204
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1205
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1206
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1207
   HEAP32[$55 >> 2] = $14; //@line 1208
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1209
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1210
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1211
   HEAP32[$57 >> 2] = $18; //@line 1212
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1213
   HEAP32[$58 >> 2] = $20; //@line 1214
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1215
   HEAP32[$59 >> 2] = $22; //@line 1216
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1217
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1218
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1219
   HEAP8[$61 >> 0] = $26; //@line 1220
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1221
   HEAP32[$62 >> 2] = $28; //@line 1222
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1223
   HEAP32[$63 >> 2] = $30; //@line 1224
   sp = STACKTOP; //@line 1225
   return;
  }
  ___async_unwind = 0; //@line 1228
  HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 1229
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1230
  HEAP32[$49 >> 2] = $$04142$us; //@line 1231
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1232
  HEAP32[$50 >> 2] = $4; //@line 1233
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1234
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1235
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1236
  HEAP32[$52 >> 2] = $8; //@line 1237
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1238
  HEAP32[$53 >> 2] = $10; //@line 1239
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1240
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1241
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1242
  HEAP32[$55 >> 2] = $14; //@line 1243
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1244
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1245
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1246
  HEAP32[$57 >> 2] = $18; //@line 1247
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1248
  HEAP32[$58 >> 2] = $20; //@line 1249
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1250
  HEAP32[$59 >> 2] = $22; //@line 1251
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1252
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1253
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1254
  HEAP8[$61 >> 0] = $26; //@line 1255
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1256
  HEAP32[$62 >> 2] = $28; //@line 1257
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1258
  HEAP32[$63 >> 2] = $30; //@line 1259
  sp = STACKTOP; //@line 1260
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_8($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 827
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 831
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 833
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 835
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 837
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 839
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 841
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 843
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 845
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 847
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 849
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 851
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 853
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 855
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 857
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 858
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 862
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 871
    $$043$us$reg2mem$0 = $32; //@line 871
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 871
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 871
    $$reg2mem21$0 = $32 + $30 | 0; //@line 871
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 877
   return;
  } else {
   $$04142$us = $79; //@line 880
   $$043$us$reg2mem$0 = $6; //@line 880
   $$reg2mem$0 = $12; //@line 880
   $$reg2mem17$0 = $16; //@line 880
   $$reg2mem21$0 = $24; //@line 880
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 889
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 892
 $48 = $$04142$us + $20 | 0; //@line 893
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 895
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 896
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 899
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 900
   HEAP32[$64 >> 2] = $$04142$us; //@line 901
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 902
   HEAP32[$65 >> 2] = $4; //@line 903
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 904
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 905
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 906
   HEAP32[$67 >> 2] = $8; //@line 907
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 908
   HEAP32[$68 >> 2] = $10; //@line 909
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 910
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 911
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 912
   HEAP32[$70 >> 2] = $14; //@line 913
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 914
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 915
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 916
   HEAP32[$72 >> 2] = $18; //@line 917
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 918
   HEAP32[$73 >> 2] = $20; //@line 919
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 920
   HEAP32[$74 >> 2] = $22; //@line 921
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 922
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 923
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 924
   HEAP8[$76 >> 0] = $26; //@line 925
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 926
   HEAP32[$77 >> 2] = $28; //@line 927
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 928
   HEAP32[$78 >> 2] = $30; //@line 929
   sp = STACKTOP; //@line 930
   return;
  }
  ___async_unwind = 0; //@line 933
  HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 934
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 935
  HEAP32[$64 >> 2] = $$04142$us; //@line 936
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 937
  HEAP32[$65 >> 2] = $4; //@line 938
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 939
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 940
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 941
  HEAP32[$67 >> 2] = $8; //@line 942
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 943
  HEAP32[$68 >> 2] = $10; //@line 944
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 945
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 946
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 947
  HEAP32[$70 >> 2] = $14; //@line 948
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 949
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 950
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 951
  HEAP32[$72 >> 2] = $18; //@line 952
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 953
  HEAP32[$73 >> 2] = $20; //@line 954
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 955
  HEAP32[$74 >> 2] = $22; //@line 956
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 957
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 958
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 959
  HEAP8[$76 >> 0] = $26; //@line 960
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 961
  HEAP32[$77 >> 2] = $28; //@line 962
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 963
  HEAP32[$78 >> 2] = $30; //@line 964
  sp = STACKTOP; //@line 965
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 968
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 969
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 972
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 973
   HEAP32[$49 >> 2] = $$04142$us; //@line 974
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 975
   HEAP32[$50 >> 2] = $4; //@line 976
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 977
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 978
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 979
   HEAP32[$52 >> 2] = $8; //@line 980
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 981
   HEAP32[$53 >> 2] = $10; //@line 982
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 983
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 984
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 985
   HEAP32[$55 >> 2] = $14; //@line 986
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 987
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 988
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 989
   HEAP32[$57 >> 2] = $18; //@line 990
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 991
   HEAP32[$58 >> 2] = $20; //@line 992
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 993
   HEAP32[$59 >> 2] = $22; //@line 994
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 995
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 996
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 997
   HEAP8[$61 >> 0] = $26; //@line 998
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 999
   HEAP32[$62 >> 2] = $28; //@line 1000
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1001
   HEAP32[$63 >> 2] = $30; //@line 1002
   sp = STACKTOP; //@line 1003
   return;
  }
  ___async_unwind = 0; //@line 1006
  HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 1007
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1008
  HEAP32[$49 >> 2] = $$04142$us; //@line 1009
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1010
  HEAP32[$50 >> 2] = $4; //@line 1011
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1012
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1013
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1014
  HEAP32[$52 >> 2] = $8; //@line 1015
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1016
  HEAP32[$53 >> 2] = $10; //@line 1017
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1018
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1019
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1020
  HEAP32[$55 >> 2] = $14; //@line 1021
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1022
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1023
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1024
  HEAP32[$57 >> 2] = $18; //@line 1025
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1026
  HEAP32[$58 >> 2] = $20; //@line 1027
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1028
  HEAP32[$59 >> 2] = $22; //@line 1029
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1030
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1031
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1032
  HEAP8[$61 >> 0] = $26; //@line 1033
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1034
  HEAP32[$62 >> 2] = $28; //@line 1035
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1036
  HEAP32[$63 >> 2] = $30; //@line 1037
  sp = STACKTOP; //@line 1038
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1193
 STACKTOP = STACKTOP + 32 | 0; //@line 1194
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1194
 $0 = sp; //@line 1195
 _gpio_init_out($0, 50); //@line 1196
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1199
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1200
  _wait_ms(150); //@line 1201
  if (___async) {
   label = 3; //@line 1204
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1207
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1209
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1210
  _wait_ms(150); //@line 1211
  if (___async) {
   label = 5; //@line 1214
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1217
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1219
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1220
  _wait_ms(150); //@line 1221
  if (___async) {
   label = 7; //@line 1224
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1227
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1229
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1230
  _wait_ms(150); //@line 1231
  if (___async) {
   label = 9; //@line 1234
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1237
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1239
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1240
  _wait_ms(150); //@line 1241
  if (___async) {
   label = 11; //@line 1244
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1247
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1249
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1250
  _wait_ms(150); //@line 1251
  if (___async) {
   label = 13; //@line 1254
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1257
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1259
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1260
  _wait_ms(150); //@line 1261
  if (___async) {
   label = 15; //@line 1264
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1267
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1269
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1270
  _wait_ms(150); //@line 1271
  if (___async) {
   label = 17; //@line 1274
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1277
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1279
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1280
  _wait_ms(400); //@line 1281
  if (___async) {
   label = 19; //@line 1284
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1287
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1289
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1290
  _wait_ms(400); //@line 1291
  if (___async) {
   label = 21; //@line 1294
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1297
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1299
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1300
  _wait_ms(400); //@line 1301
  if (___async) {
   label = 23; //@line 1304
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1307
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1309
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1310
  _wait_ms(400); //@line 1311
  if (___async) {
   label = 25; //@line 1314
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1317
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1319
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1320
  _wait_ms(400); //@line 1321
  if (___async) {
   label = 27; //@line 1324
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1327
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1329
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1330
  _wait_ms(400); //@line 1331
  if (___async) {
   label = 29; //@line 1334
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1337
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1339
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1340
  _wait_ms(400); //@line 1341
  if (___async) {
   label = 31; //@line 1344
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1347
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1349
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1350
  _wait_ms(400); //@line 1351
  if (___async) {
   label = 33; //@line 1354
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1357
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 70; //@line 1361
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1363
   sp = STACKTOP; //@line 1364
   STACKTOP = sp; //@line 1365
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 71; //@line 1369
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1371
   sp = STACKTOP; //@line 1372
   STACKTOP = sp; //@line 1373
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 72; //@line 1377
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1379
   sp = STACKTOP; //@line 1380
   STACKTOP = sp; //@line 1381
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 73; //@line 1385
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1387
   sp = STACKTOP; //@line 1388
   STACKTOP = sp; //@line 1389
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 74; //@line 1393
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1395
   sp = STACKTOP; //@line 1396
   STACKTOP = sp; //@line 1397
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 75; //@line 1401
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1403
   sp = STACKTOP; //@line 1404
   STACKTOP = sp; //@line 1405
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 76; //@line 1409
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1411
   sp = STACKTOP; //@line 1412
   STACKTOP = sp; //@line 1413
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 77; //@line 1417
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1419
   sp = STACKTOP; //@line 1420
   STACKTOP = sp; //@line 1421
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 78; //@line 1425
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1427
   sp = STACKTOP; //@line 1428
   STACKTOP = sp; //@line 1429
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 79; //@line 1433
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1435
   sp = STACKTOP; //@line 1436
   STACKTOP = sp; //@line 1437
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 80; //@line 1441
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1443
   sp = STACKTOP; //@line 1444
   STACKTOP = sp; //@line 1445
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 81; //@line 1449
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1451
   sp = STACKTOP; //@line 1452
   STACKTOP = sp; //@line 1453
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 82; //@line 1457
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1459
   sp = STACKTOP; //@line 1460
   STACKTOP = sp; //@line 1461
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 83; //@line 1465
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1467
   sp = STACKTOP; //@line 1468
   STACKTOP = sp; //@line 1469
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 84; //@line 1473
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1475
   sp = STACKTOP; //@line 1476
   STACKTOP = sp; //@line 1477
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 85; //@line 1481
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1483
   sp = STACKTOP; //@line 1484
   STACKTOP = sp; //@line 1485
   return;
  }
 }
}
function __ZN6C128329characterEiii__async_cb_7($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $39 = 0, $40 = 0, $45 = 0, $47 = 0, $48 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 599
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 605
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 607
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 609
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 613
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 615
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 617
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 619
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 621
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 623
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 625
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 627
 $30 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 630
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 >= ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[$30 + 2 >> 0] | 0) | 0) >>> 0) {
  HEAP32[HEAP32[$0 + 24 >> 2] >> 2] = 0; //@line 637
 }
 $39 = $30 + ((Math_imul($6 + -32 | 0, $8) | 0) + 4) | 0; //@line 642
 $40 = HEAP8[$39 >> 0] | 0; //@line 643
 if ($10 << 24 >> 24) {
  if ($16 << 24 >> 24) {
   $45 = (0 >>> 3 & 31) + 1 | 0; //@line 650
   $47 = 1 << 0; //@line 652
   $48 = 0 + $20 | 0; //@line 653
   $58 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 663
   $59 = 0 + $24 | 0; //@line 664
   if (!($47 & (HEAPU8[$39 + ($45 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 666
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 0); //@line 667
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 670
     $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 671
     HEAP32[$75 >> 2] = 0; //@line 672
     $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 673
     HEAP32[$76 >> 2] = $26; //@line 674
     $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 675
     HEAP32[$77 >> 2] = 0; //@line 676
     $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 677
     HEAP32[$78 >> 2] = $28; //@line 678
     $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 679
     HEAP32[$79 >> 2] = $22; //@line 680
     $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 681
     HEAP32[$80 >> 2] = $45; //@line 682
     $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 683
     HEAP32[$81 >> 2] = $39; //@line 684
     $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 685
     HEAP32[$82 >> 2] = $47; //@line 686
     $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 687
     HEAP32[$83 >> 2] = $18; //@line 688
     $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 689
     HEAP32[$84 >> 2] = $24; //@line 690
     $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 691
     HEAP32[$85 >> 2] = $18; //@line 692
     $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 693
     HEAP32[$86 >> 2] = $48; //@line 694
     $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 695
     HEAP8[$87 >> 0] = $40; //@line 696
     $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 697
     HEAP32[$88 >> 2] = $14; //@line 698
     $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 699
     HEAP32[$89 >> 2] = $20; //@line 700
     sp = STACKTOP; //@line 701
     return;
    }
    ___async_unwind = 0; //@line 704
    HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 705
    $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 706
    HEAP32[$75 >> 2] = 0; //@line 707
    $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 708
    HEAP32[$76 >> 2] = $26; //@line 709
    $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 710
    HEAP32[$77 >> 2] = 0; //@line 711
    $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 712
    HEAP32[$78 >> 2] = $28; //@line 713
    $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 714
    HEAP32[$79 >> 2] = $22; //@line 715
    $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 716
    HEAP32[$80 >> 2] = $45; //@line 717
    $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 718
    HEAP32[$81 >> 2] = $39; //@line 719
    $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 720
    HEAP32[$82 >> 2] = $47; //@line 721
    $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 722
    HEAP32[$83 >> 2] = $18; //@line 723
    $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 724
    HEAP32[$84 >> 2] = $24; //@line 725
    $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 726
    HEAP32[$85 >> 2] = $18; //@line 727
    $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 728
    HEAP32[$86 >> 2] = $48; //@line 729
    $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 730
    HEAP8[$87 >> 0] = $40; //@line 731
    $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 732
    HEAP32[$88 >> 2] = $14; //@line 733
    $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 734
    HEAP32[$89 >> 2] = $20; //@line 735
    sp = STACKTOP; //@line 736
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 739
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 1); //@line 740
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 743
     $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 744
     HEAP32[$60 >> 2] = 0; //@line 745
     $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 746
     HEAP32[$61 >> 2] = $26; //@line 747
     $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 748
     HEAP32[$62 >> 2] = 0; //@line 749
     $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 750
     HEAP32[$63 >> 2] = $28; //@line 751
     $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 752
     HEAP32[$64 >> 2] = $22; //@line 753
     $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 754
     HEAP32[$65 >> 2] = $45; //@line 755
     $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 756
     HEAP32[$66 >> 2] = $39; //@line 757
     $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 758
     HEAP32[$67 >> 2] = $47; //@line 759
     $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 760
     HEAP32[$68 >> 2] = $18; //@line 761
     $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 762
     HEAP32[$69 >> 2] = $24; //@line 763
     $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 764
     HEAP32[$70 >> 2] = $18; //@line 765
     $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 766
     HEAP32[$71 >> 2] = $48; //@line 767
     $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 768
     HEAP8[$72 >> 0] = $40; //@line 769
     $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 770
     HEAP32[$73 >> 2] = $14; //@line 771
     $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 772
     HEAP32[$74 >> 2] = $20; //@line 773
     sp = STACKTOP; //@line 774
     return;
    }
    ___async_unwind = 0; //@line 777
    HEAP32[$ReallocAsyncCtx3 >> 2] = 106; //@line 778
    $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 779
    HEAP32[$60 >> 2] = 0; //@line 780
    $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 781
    HEAP32[$61 >> 2] = $26; //@line 782
    $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 783
    HEAP32[$62 >> 2] = 0; //@line 784
    $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 785
    HEAP32[$63 >> 2] = $28; //@line 786
    $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 787
    HEAP32[$64 >> 2] = $22; //@line 788
    $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 789
    HEAP32[$65 >> 2] = $45; //@line 790
    $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 791
    HEAP32[$66 >> 2] = $39; //@line 792
    $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 793
    HEAP32[$67 >> 2] = $47; //@line 794
    $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 795
    HEAP32[$68 >> 2] = $18; //@line 796
    $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 797
    HEAP32[$69 >> 2] = $24; //@line 798
    $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 799
    HEAP32[$70 >> 2] = $18; //@line 800
    $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 801
    HEAP32[$71 >> 2] = $48; //@line 802
    $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 803
    HEAP8[$72 >> 0] = $40; //@line 804
    $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 805
    HEAP32[$73 >> 2] = $14; //@line 806
    $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 807
    HEAP32[$74 >> 2] = $20; //@line 808
    sp = STACKTOP; //@line 809
    return;
   }
  }
 }
 HEAP32[$14 >> 2] = (HEAP32[$14 >> 2] | 0) + ($40 & 255); //@line 817
 return;
}
function __ZN6C128329characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$04142$us = 0, $$043$us = 0, $10 = 0, $11 = 0, $122 = 0, $123 = 0, $13 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $40 = 0, $42 = 0, $45 = 0, $46 = 0, $5 = 0, $6 = 0, $61 = 0, $70 = 0, $71 = 0, $72 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $87 = 0, $90 = 0, $91 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2098
 if (($3 + -31 | 0) >>> 0 > 96) {
  return;
 }
 $5 = $0 + 48 | 0; //@line 2104
 $6 = HEAP32[$5 >> 2] | 0; //@line 2105
 $8 = HEAPU8[$6 >> 0] | 0; //@line 2107
 $10 = HEAP8[$6 + 1 >> 0] | 0; //@line 2109
 $11 = $10 & 255; //@line 2110
 $13 = HEAP8[$6 + 2 >> 0] | 0; //@line 2112
 $14 = $13 & 255; //@line 2113
 $17 = HEAPU8[$6 + 3 >> 0] | 0; //@line 2116
 $18 = $0 + 60 | 0; //@line 2117
 $20 = (HEAP32[$18 >> 2] | 0) + $11 | 0; //@line 2119
 $23 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 2122
 $AsyncCtx = _emscripten_alloc_async_context(56, sp) | 0; //@line 2123
 $24 = FUNCTION_TABLE_ii[$23 & 31]($0) | 0; //@line 2124
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 104; //@line 2127
  HEAP32[$AsyncCtx + 4 >> 2] = $14; //@line 2129
  HEAP32[$AsyncCtx + 8 >> 2] = $18; //@line 2131
  HEAP32[$AsyncCtx + 12 >> 2] = $17; //@line 2133
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 2135
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 2137
  HEAP32[$AsyncCtx + 24 >> 2] = $11; //@line 2139
  HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 2141
  HEAP32[$AsyncCtx + 32 >> 2] = $8; //@line 2143
  HEAP8[$AsyncCtx + 36 >> 0] = $13; //@line 2145
  HEAP8[$AsyncCtx + 37 >> 0] = $10; //@line 2147
  HEAP32[$AsyncCtx + 40 >> 2] = $2; //@line 2149
  HEAP32[$AsyncCtx + 44 >> 2] = $5; //@line 2151
  HEAP32[$AsyncCtx + 48 >> 2] = $0; //@line 2153
  HEAP32[$AsyncCtx + 52 >> 2] = $20; //@line 2155
  sp = STACKTOP; //@line 2156
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2159
 if ($20 >>> 0 > $24 >>> 0) {
  HEAP32[$18 >> 2] = 0; //@line 2162
  $40 = $0 + 64 | 0; //@line 2163
  $42 = (HEAP32[$40 >> 2] | 0) + $14 | 0; //@line 2165
  HEAP32[$40 >> 2] = $42; //@line 2166
  $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 2169
  $AsyncCtx3 = _emscripten_alloc_async_context(60, sp) | 0; //@line 2170
  $46 = FUNCTION_TABLE_ii[$45 & 31]($0) | 0; //@line 2171
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 105; //@line 2174
   HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 2176
   HEAP32[$AsyncCtx3 + 8 >> 2] = $42; //@line 2178
   HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 2180
   HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 2182
   HEAP8[$AsyncCtx3 + 20 >> 0] = $13; //@line 2184
   HEAP32[$AsyncCtx3 + 24 >> 2] = $40; //@line 2186
   HEAP32[$AsyncCtx3 + 28 >> 2] = $18; //@line 2188
   HEAP8[$AsyncCtx3 + 32 >> 0] = $10; //@line 2190
   HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 2192
   HEAP32[$AsyncCtx3 + 40 >> 2] = $2; //@line 2194
   HEAP32[$AsyncCtx3 + 44 >> 2] = $17; //@line 2196
   HEAP32[$AsyncCtx3 + 48 >> 2] = $1; //@line 2198
   HEAP32[$AsyncCtx3 + 52 >> 2] = $11; //@line 2200
   HEAP32[$AsyncCtx3 + 56 >> 2] = $14; //@line 2202
   sp = STACKTOP; //@line 2203
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2206
  $61 = HEAP32[$5 >> 2] | 0; //@line 2207
  if ($42 >>> 0 < ($46 - (HEAPU8[$61 + 2 >> 0] | 0) | 0) >>> 0) {
   $71 = $61; //@line 2214
  } else {
   HEAP32[$40 >> 2] = 0; //@line 2216
   $71 = $61; //@line 2217
  }
 } else {
  $71 = HEAP32[$5 >> 2] | 0; //@line 2221
 }
 $70 = $71 + ((Math_imul($3 + -32 | 0, $8) | 0) + 4) | 0; //@line 2226
 $72 = HEAP8[$70 >> 0] | 0; //@line 2227
 L15 : do {
  if ($13 << 24 >> 24) {
   if ($10 << 24 >> 24) {
    $$043$us = 0; //@line 2233
    L17 : while (1) {
     $77 = ($$043$us >>> 3 & 31) + 1 | 0; //@line 2237
     $79 = 1 << ($$043$us & 7); //@line 2239
     $80 = $$043$us + $2 | 0; //@line 2240
     $$04142$us = 0; //@line 2241
     while (1) {
      $87 = ($79 & (HEAPU8[$70 + ($77 + (Math_imul($$04142$us, $17) | 0)) >> 0] | 0) | 0) == 0; //@line 2249
      $90 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 2252
      $91 = $$04142$us + $1 | 0; //@line 2253
      if ($87) {
       $AsyncCtx11 = _emscripten_alloc_async_context(64, sp) | 0; //@line 2255
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 0); //@line 2256
       if (___async) {
        label = 18; //@line 2259
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2262
      } else {
       $AsyncCtx7 = _emscripten_alloc_async_context(64, sp) | 0; //@line 2264
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 1); //@line 2265
       if (___async) {
        label = 15; //@line 2268
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2271
      }
      $122 = $$04142$us + 1 | 0; //@line 2273
      if (($122 | 0) == ($11 | 0)) {
       break;
      } else {
       $$04142$us = $122; //@line 2278
      }
     }
     $123 = $$043$us + 1 | 0; //@line 2281
     if (($123 | 0) == ($14 | 0)) {
      break L15;
     } else {
      $$043$us = $123; //@line 2286
     }
    }
    if ((label | 0) == 15) {
     HEAP32[$AsyncCtx7 >> 2] = 106; //@line 2290
     HEAP32[$AsyncCtx7 + 4 >> 2] = $$04142$us; //@line 2292
     HEAP32[$AsyncCtx7 + 8 >> 2] = $11; //@line 2294
     HEAP32[$AsyncCtx7 + 12 >> 2] = $$043$us; //@line 2296
     HEAP32[$AsyncCtx7 + 16 >> 2] = $14; //@line 2298
     HEAP32[$AsyncCtx7 + 20 >> 2] = $17; //@line 2300
     HEAP32[$AsyncCtx7 + 24 >> 2] = $77; //@line 2302
     HEAP32[$AsyncCtx7 + 28 >> 2] = $70; //@line 2304
     HEAP32[$AsyncCtx7 + 32 >> 2] = $79; //@line 2306
     HEAP32[$AsyncCtx7 + 36 >> 2] = $0; //@line 2308
     HEAP32[$AsyncCtx7 + 40 >> 2] = $1; //@line 2310
     HEAP32[$AsyncCtx7 + 44 >> 2] = $0; //@line 2312
     HEAP32[$AsyncCtx7 + 48 >> 2] = $80; //@line 2314
     HEAP8[$AsyncCtx7 + 52 >> 0] = $72; //@line 2316
     HEAP32[$AsyncCtx7 + 56 >> 2] = $18; //@line 2318
     HEAP32[$AsyncCtx7 + 60 >> 2] = $2; //@line 2320
     sp = STACKTOP; //@line 2321
     return;
    } else if ((label | 0) == 18) {
     HEAP32[$AsyncCtx11 >> 2] = 107; //@line 2325
     HEAP32[$AsyncCtx11 + 4 >> 2] = $$04142$us; //@line 2327
     HEAP32[$AsyncCtx11 + 8 >> 2] = $11; //@line 2329
     HEAP32[$AsyncCtx11 + 12 >> 2] = $$043$us; //@line 2331
     HEAP32[$AsyncCtx11 + 16 >> 2] = $14; //@line 2333
     HEAP32[$AsyncCtx11 + 20 >> 2] = $17; //@line 2335
     HEAP32[$AsyncCtx11 + 24 >> 2] = $77; //@line 2337
     HEAP32[$AsyncCtx11 + 28 >> 2] = $70; //@line 2339
     HEAP32[$AsyncCtx11 + 32 >> 2] = $79; //@line 2341
     HEAP32[$AsyncCtx11 + 36 >> 2] = $0; //@line 2343
     HEAP32[$AsyncCtx11 + 40 >> 2] = $1; //@line 2345
     HEAP32[$AsyncCtx11 + 44 >> 2] = $0; //@line 2347
     HEAP32[$AsyncCtx11 + 48 >> 2] = $80; //@line 2349
     HEAP8[$AsyncCtx11 + 52 >> 0] = $72; //@line 2351
     HEAP32[$AsyncCtx11 + 56 >> 2] = $18; //@line 2353
     HEAP32[$AsyncCtx11 + 60 >> 2] = $2; //@line 2355
     sp = STACKTOP; //@line 2356
     return;
    }
   }
  }
 } while (0);
 HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + ($72 & 255); //@line 2365
 return;
}
function __ZN6C128328print_bmE6Bitmapii__async_cb_18($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2285
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2289
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2291
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2293
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2295
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2297
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2299
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2301
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2303
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2305
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2308
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 2311
  $$023$us30 = $66; //@line 2311
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 2311
  label = 3; //@line 2312
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 2314
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 2318
   $26 = $$023$us30 + $6 | 0; //@line 2319
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 2322
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 2327
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 2330
   break;
  }
  $23 = $24 + $12 | 0; //@line 2333
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 2336
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 2338
   $$023$us30 = 0; //@line 2338
   $$reg2mem$0 = $23; //@line 2338
   label = 3; //@line 2339
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 2357
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 2360
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 2362
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 2363
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 2366
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 2367
   HEAP32[$55 >> 2] = $$023$us30; //@line 2368
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 2369
   HEAP32[$56 >> 2] = $4; //@line 2370
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 2371
   HEAP32[$57 >> 2] = $6; //@line 2372
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 2373
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 2374
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 2375
   HEAP32[$59 >> 2] = $10; //@line 2376
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 2377
   HEAP32[$60 >> 2] = $12; //@line 2378
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 2379
   HEAP32[$61 >> 2] = $14; //@line 2380
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 2381
   HEAP32[$62 >> 2] = $16; //@line 2382
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 2383
   HEAP32[$63 >> 2] = $18; //@line 2384
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 2385
   HEAP32[$64 >> 2] = $20; //@line 2386
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 2387
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 2388
   sp = STACKTOP; //@line 2389
   return;
  }
  ___async_unwind = 0; //@line 2392
  HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 2393
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 2394
  HEAP32[$55 >> 2] = $$023$us30; //@line 2395
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 2396
  HEAP32[$56 >> 2] = $4; //@line 2397
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 2398
  HEAP32[$57 >> 2] = $6; //@line 2399
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 2400
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 2401
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 2402
  HEAP32[$59 >> 2] = $10; //@line 2403
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 2404
  HEAP32[$60 >> 2] = $12; //@line 2405
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 2406
  HEAP32[$61 >> 2] = $14; //@line 2407
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 2408
  HEAP32[$62 >> 2] = $16; //@line 2409
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 2410
  HEAP32[$63 >> 2] = $18; //@line 2411
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 2412
  HEAP32[$64 >> 2] = $20; //@line 2413
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 2414
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 2415
  sp = STACKTOP; //@line 2416
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 2419
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 2420
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 2423
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 2424
   HEAP32[$44 >> 2] = $$023$us30; //@line 2425
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 2426
   HEAP32[$45 >> 2] = $4; //@line 2427
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 2428
   HEAP32[$46 >> 2] = $6; //@line 2429
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 2430
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 2431
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 2432
   HEAP32[$48 >> 2] = $10; //@line 2433
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 2434
   HEAP32[$49 >> 2] = $12; //@line 2435
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 2436
   HEAP32[$50 >> 2] = $14; //@line 2437
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 2438
   HEAP32[$51 >> 2] = $16; //@line 2439
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 2440
   HEAP32[$52 >> 2] = $18; //@line 2441
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 2442
   HEAP32[$53 >> 2] = $20; //@line 2443
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 2444
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2445
   sp = STACKTOP; //@line 2446
   return;
  }
  ___async_unwind = 0; //@line 2449
  HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 2450
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 2451
  HEAP32[$44 >> 2] = $$023$us30; //@line 2452
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 2453
  HEAP32[$45 >> 2] = $4; //@line 2454
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 2455
  HEAP32[$46 >> 2] = $6; //@line 2456
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 2457
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 2458
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 2459
  HEAP32[$48 >> 2] = $10; //@line 2460
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 2461
  HEAP32[$49 >> 2] = $12; //@line 2462
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 2463
  HEAP32[$50 >> 2] = $14; //@line 2464
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 2465
  HEAP32[$51 >> 2] = $16; //@line 2466
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 2467
  HEAP32[$52 >> 2] = $18; //@line 2468
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 2469
  HEAP32[$53 >> 2] = $20; //@line 2470
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 2471
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2472
  sp = STACKTOP; //@line 2473
  return;
 }
}
function __ZN6C128328print_bmE6Bitmapii__async_cb($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2087
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2091
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2093
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2095
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2097
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2099
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2101
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2103
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2105
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2107
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2110
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 2113
  $$023$us30 = $66; //@line 2113
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 2113
  label = 3; //@line 2114
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 2116
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 2120
   $26 = $$023$us30 + $6 | 0; //@line 2121
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 2124
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 2129
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 2132
   break;
  }
  $23 = $24 + $12 | 0; //@line 2135
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 2138
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 2140
   $$023$us30 = 0; //@line 2140
   $$reg2mem$0 = $23; //@line 2140
   label = 3; //@line 2141
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 2159
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 2162
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 2164
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 2165
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 2168
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 2169
   HEAP32[$55 >> 2] = $$023$us30; //@line 2170
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 2171
   HEAP32[$56 >> 2] = $4; //@line 2172
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 2173
   HEAP32[$57 >> 2] = $6; //@line 2174
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 2175
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 2176
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 2177
   HEAP32[$59 >> 2] = $10; //@line 2178
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 2179
   HEAP32[$60 >> 2] = $12; //@line 2180
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 2181
   HEAP32[$61 >> 2] = $14; //@line 2182
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 2183
   HEAP32[$62 >> 2] = $16; //@line 2184
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 2185
   HEAP32[$63 >> 2] = $18; //@line 2186
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 2187
   HEAP32[$64 >> 2] = $20; //@line 2188
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 2189
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 2190
   sp = STACKTOP; //@line 2191
   return;
  }
  ___async_unwind = 0; //@line 2194
  HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 2195
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 2196
  HEAP32[$55 >> 2] = $$023$us30; //@line 2197
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 2198
  HEAP32[$56 >> 2] = $4; //@line 2199
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 2200
  HEAP32[$57 >> 2] = $6; //@line 2201
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 2202
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 2203
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 2204
  HEAP32[$59 >> 2] = $10; //@line 2205
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 2206
  HEAP32[$60 >> 2] = $12; //@line 2207
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 2208
  HEAP32[$61 >> 2] = $14; //@line 2209
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 2210
  HEAP32[$62 >> 2] = $16; //@line 2211
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 2212
  HEAP32[$63 >> 2] = $18; //@line 2213
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 2214
  HEAP32[$64 >> 2] = $20; //@line 2215
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 2216
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 2217
  sp = STACKTOP; //@line 2218
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 2221
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 2222
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 2225
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 2226
   HEAP32[$44 >> 2] = $$023$us30; //@line 2227
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 2228
   HEAP32[$45 >> 2] = $4; //@line 2229
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 2230
   HEAP32[$46 >> 2] = $6; //@line 2231
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 2232
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 2233
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 2234
   HEAP32[$48 >> 2] = $10; //@line 2235
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 2236
   HEAP32[$49 >> 2] = $12; //@line 2237
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 2238
   HEAP32[$50 >> 2] = $14; //@line 2239
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 2240
   HEAP32[$51 >> 2] = $16; //@line 2241
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 2242
   HEAP32[$52 >> 2] = $18; //@line 2243
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 2244
   HEAP32[$53 >> 2] = $20; //@line 2245
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 2246
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2247
   sp = STACKTOP; //@line 2248
   return;
  }
  ___async_unwind = 0; //@line 2251
  HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 2252
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 2253
  HEAP32[$44 >> 2] = $$023$us30; //@line 2254
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 2255
  HEAP32[$45 >> 2] = $4; //@line 2256
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 2257
  HEAP32[$46 >> 2] = $6; //@line 2258
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 2259
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 2260
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 2261
  HEAP32[$48 >> 2] = $10; //@line 2262
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 2263
  HEAP32[$49 >> 2] = $12; //@line 2264
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 2265
  HEAP32[$50 >> 2] = $14; //@line 2266
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 2267
  HEAP32[$51 >> 2] = $16; //@line 2268
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 2269
  HEAP32[$52 >> 2] = $18; //@line 2270
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 2271
  HEAP32[$53 >> 2] = $20; //@line 2272
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 2273
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2274
  sp = STACKTOP; //@line 2275
  return;
 }
}
function _freopen($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$pre = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $32 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12211
 STACKTOP = STACKTOP + 32 | 0; //@line 12212
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 12212
 $vararg_buffer3 = sp + 16 | 0; //@line 12213
 $vararg_buffer = sp; //@line 12214
 $3 = ___fmodeflags($1) | 0; //@line 12215
 if ((HEAP32[$2 + 76 >> 2] | 0) > -1) {
  $9 = ___lockfile($2) | 0; //@line 12221
 } else {
  $9 = 0; //@line 12223
 }
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 12225
 _fflush($2) | 0; //@line 12226
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 178; //@line 12229
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 12231
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12233
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12235
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 12237
  HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12239
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 12241
  HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer3; //@line 12243
  HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer3; //@line 12245
  HEAP32[$AsyncCtx + 36 >> 2] = $1; //@line 12247
  sp = STACKTOP; //@line 12248
  STACKTOP = sp; //@line 12249
  return 0; //@line 12249
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12251
 do {
  if (!$0) {
   $$pre = $2 + 60 | 0; //@line 12257
   if ($3 & 524288 | 0) {
    HEAP32[$vararg_buffer >> 2] = HEAP32[$$pre >> 2]; //@line 12260
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 12262
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 12264
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 12265
   }
   HEAP32[$vararg_buffer3 >> 2] = HEAP32[$$pre >> 2]; //@line 12269
   HEAP32[$vararg_buffer3 + 4 >> 2] = 4; //@line 12271
   HEAP32[$vararg_buffer3 + 8 >> 2] = $3 & -524481; //@line 12273
   if ((___syscall_ret(___syscall221(221, $vararg_buffer3 | 0) | 0) | 0) < 0) {
    label = 21; //@line 12278
   } else {
    label = 16; //@line 12280
   }
  } else {
   $27 = _fopen($0, $1) | 0; //@line 12283
   if (!$27) {
    label = 21; //@line 12286
   } else {
    $29 = $27 + 60 | 0; //@line 12288
    $30 = HEAP32[$29 >> 2] | 0; //@line 12289
    $32 = HEAP32[$2 + 60 >> 2] | 0; //@line 12291
    if (($30 | 0) == ($32 | 0)) {
     HEAP32[$29 >> 2] = -1; //@line 12294
    } else {
     if ((___dup3($30, $32, $3 & 524288) | 0) < 0) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 12300
      _fclose($27) | 0; //@line 12301
      if (___async) {
       HEAP32[$AsyncCtx14 >> 2] = 180; //@line 12304
       HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 12306
       sp = STACKTOP; //@line 12307
       STACKTOP = sp; //@line 12308
       return 0; //@line 12308
      } else {
       _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12310
       label = 21; //@line 12311
       break;
      }
     }
    }
    HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$27 >> 2]; //@line 12320
    HEAP32[$2 + 32 >> 2] = HEAP32[$27 + 32 >> 2]; //@line 12324
    HEAP32[$2 + 36 >> 2] = HEAP32[$27 + 36 >> 2]; //@line 12328
    HEAP32[$2 + 40 >> 2] = HEAP32[$27 + 40 >> 2]; //@line 12332
    HEAP32[$2 + 12 >> 2] = HEAP32[$27 + 12 >> 2]; //@line 12336
    $AsyncCtx18 = _emscripten_alloc_async_context(12, sp) | 0; //@line 12337
    _fclose($27) | 0; //@line 12338
    if (___async) {
     HEAP32[$AsyncCtx18 >> 2] = 179; //@line 12341
     HEAP32[$AsyncCtx18 + 4 >> 2] = $9; //@line 12343
     HEAP32[$AsyncCtx18 + 8 >> 2] = $2; //@line 12345
     sp = STACKTOP; //@line 12346
     STACKTOP = sp; //@line 12347
     return 0; //@line 12347
    } else {
     _emscripten_free_async_context($AsyncCtx18 | 0); //@line 12349
     label = 16; //@line 12350
     break;
    }
   }
  }
 } while (0);
 do {
  if ((label | 0) == 16) {
   if (!$9) {
    $$0 = $2; //@line 12360
   } else {
    ___unlockfile($2); //@line 12362
    $$0 = $2; //@line 12363
   }
  } else if ((label | 0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 12367
   _fclose($2) | 0; //@line 12368
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 181; //@line 12371
    HEAP32[$AsyncCtx10 + 4 >> 2] = $2; //@line 12373
    sp = STACKTOP; //@line 12374
    STACKTOP = sp; //@line 12375
    return 0; //@line 12375
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 12377
    $$0 = 0; //@line 12378
    break;
   }
  }
 } while (0);
 STACKTOP = sp; //@line 12383
 return $$0 | 0; //@line 12383
}
function __ZN4mbed6Stream6printfEPKcz($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $$09 = 0, $13 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $36 = 0, $39 = 0, $48 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1021
 STACKTOP = STACKTOP + 4112 | 0; //@line 1022
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(4112); //@line 1022
 $2 = sp; //@line 1023
 $3 = sp + 16 | 0; //@line 1024
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 1027
 $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1028
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1029
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 64; //@line 1032
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1034
  HEAP32[$AsyncCtx + 8 >> 2] = $varargs; //@line 1036
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1038
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 1040
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 1042
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 1044
  sp = STACKTOP; //@line 1045
  STACKTOP = sp; //@line 1046
  return 0; //@line 1046
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1048
 HEAP32[$2 >> 2] = $varargs; //@line 1049
 _memset($3 | 0, 0, 4096) | 0; //@line 1050
 $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1051
 $13 = _vsprintf($3, $1, $2) | 0; //@line 1052
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 65; //@line 1055
  HEAP32[$AsyncCtx12 + 4 >> 2] = $0; //@line 1057
  HEAP32[$AsyncCtx12 + 8 >> 2] = $0; //@line 1059
  HEAP32[$AsyncCtx12 + 12 >> 2] = $3; //@line 1061
  HEAP32[$AsyncCtx12 + 16 >> 2] = $2; //@line 1063
  HEAP32[$AsyncCtx12 + 20 >> 2] = $3; //@line 1065
  sp = STACKTOP; //@line 1066
  STACKTOP = sp; //@line 1067
  return 0; //@line 1067
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1069
 L7 : do {
  if (($13 | 0) > 0) {
   $$09 = 0; //@line 1073
   while (1) {
    $36 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 1077
    $39 = HEAP8[$3 + $$09 >> 0] | 0; //@line 1080
    $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 1081
    FUNCTION_TABLE_iii[$36 & 7]($0, $39) | 0; //@line 1082
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1087
    $48 = $$09 + 1 | 0; //@line 1088
    if (($48 | 0) == ($13 | 0)) {
     break L7;
    } else {
     $$09 = $48; //@line 1093
    }
   }
   HEAP32[$AsyncCtx9 >> 2] = 68; //@line 1096
   HEAP32[$AsyncCtx9 + 4 >> 2] = $$09; //@line 1098
   HEAP32[$AsyncCtx9 + 8 >> 2] = $13; //@line 1100
   HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 1102
   HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 1104
   HEAP32[$AsyncCtx9 + 20 >> 2] = $0; //@line 1106
   HEAP32[$AsyncCtx9 + 24 >> 2] = $3; //@line 1108
   HEAP32[$AsyncCtx9 + 28 >> 2] = $3; //@line 1110
   HEAP32[$AsyncCtx9 + 32 >> 2] = $2; //@line 1112
   sp = STACKTOP; //@line 1113
   STACKTOP = sp; //@line 1114
   return 0; //@line 1114
  }
 } while (0);
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 76 >> 2] | 0; //@line 1119
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1120
 FUNCTION_TABLE_vi[$22 & 255]($0); //@line 1121
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 66; //@line 1124
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1126
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1128
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1130
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 1132
  HEAP32[$AsyncCtx2 + 20 >> 2] = $13; //@line 1134
  sp = STACKTOP; //@line 1135
  STACKTOP = sp; //@line 1136
  return 0; //@line 1136
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1138
 $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1141
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1142
 FUNCTION_TABLE_vi[$30 & 255]($0); //@line 1143
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 67; //@line 1146
  HEAP32[$AsyncCtx5 + 4 >> 2] = $3; //@line 1148
  HEAP32[$AsyncCtx5 + 8 >> 2] = $2; //@line 1150
  HEAP32[$AsyncCtx5 + 12 >> 2] = $13; //@line 1152
  sp = STACKTOP; //@line 1153
  STACKTOP = sp; //@line 1154
  return 0; //@line 1154
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1156
  STACKTOP = sp; //@line 1157
  return $13 | 0; //@line 1157
 }
 return 0; //@line 1159
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_97($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6909
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6911
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6913
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6915
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6917
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6919
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 6922
 $14 = HEAP8[$0 + 25 >> 0] & 1; //@line 6925
 $16 = HEAP8[$0 + 26 >> 0] & 1; //@line 6928
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 6930
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 6932
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 6934
 $24 = HEAP32[$0 + 40 >> 2] | 0; //@line 6936
 $26 = HEAP32[$0 + 44 >> 2] | 0; //@line 6938
 $28 = HEAP32[$0 + 48 >> 2] | 0; //@line 6940
 L2 : do {
  if (!(HEAP8[$22 >> 0] | 0)) {
   do {
    if (!(HEAP8[$6 >> 0] | 0)) {
     $$182$off0 = $16; //@line 6949
     $$186$off0 = $14; //@line 6949
    } else {
     if (!(HEAP8[$2 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $14; //@line 6958
       $$283$off0 = 1; //@line 6958
       label = 13; //@line 6959
       break L2;
      } else {
       $$182$off0 = 1; //@line 6962
       $$186$off0 = $14; //@line 6962
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 6969
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 6976
      break L2;
     } else {
      $$182$off0 = 1; //@line 6979
      $$186$off0 = 1; //@line 6979
     }
    }
   } while (0);
   $30 = $18 + 8 | 0; //@line 6983
   if ($30 >>> 0 < $28 >>> 0) {
    HEAP8[$2 >> 0] = 0; //@line 6986
    HEAP8[$6 >> 0] = 0; //@line 6987
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(52) | 0; //@line 6988
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 6989
    if (!___async) {
     ___async_unwind = 0; //@line 6992
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 203; //@line 6994
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 6996
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 6998
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 7000
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 7002
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 7004
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 7007
    HEAP8[$ReallocAsyncCtx5 + 25 >> 0] = $$186$off0 & 1; //@line 7010
    HEAP8[$ReallocAsyncCtx5 + 26 >> 0] = $$182$off0 & 1; //@line 7013
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $30; //@line 7015
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $20; //@line 7017
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $22; //@line 7019
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $24; //@line 7021
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $26; //@line 7023
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $28; //@line 7025
    sp = STACKTOP; //@line 7026
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 7029
    $$283$off0 = $$182$off0; //@line 7029
    label = 13; //@line 7030
   }
  } else {
   $$085$off0$reg2mem$0 = $14; //@line 7033
   $$283$off0 = $16; //@line 7033
   label = 13; //@line 7034
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$24 >> 2] = $10; //@line 7040
    $59 = $8 + 40 | 0; //@line 7041
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 7044
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$22 >> 0] = 1; //@line 7052
      if ($$283$off0) {
       label = 18; //@line 7054
       break;
      } else {
       $67 = 4; //@line 7057
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 7064
   } else {
    $67 = 4; //@line 7066
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 7071
 }
 HEAP32[$26 >> 2] = $67; //@line 7073
 return;
}
function _main__async_cb_52($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx4 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4124
 STACKTOP = STACKTOP + 16 | 0; //@line 4125
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4125
 $bitmSan3$byval_copy = sp; //@line 4126
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4128
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4130
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4132
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4134
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4136
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4138
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4140
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4142
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4144
 $19 = $18 + 9 | 0; //@line 4145
 if (($18 | 0) < 66) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 4148
  HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[259]; //@line 4149
  HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[260]; //@line 4149
  HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[261]; //@line 4149
  HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[262]; //@line 4149
  __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy, $19, 2); //@line 4150
  if (!___async) {
   ___async_unwind = 0; //@line 4153
  }
  HEAP32[$ReallocAsyncCtx10 >> 2] = 151; //@line 4155
  HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = $19; //@line 4157
  HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $2; //@line 4159
  HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $4; //@line 4161
  HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $6; //@line 4163
  HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $8; //@line 4165
  HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $10; //@line 4167
  HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $12; //@line 4169
  HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $14; //@line 4171
  HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $16; //@line 4173
  sp = STACKTOP; //@line 4174
  STACKTOP = sp; //@line 4175
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 4177
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 4178
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 4178
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 4178
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 4178
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy, 75, 2); //@line 4179
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 160; //@line 4182
  $30 = $ReallocAsyncCtx4 + 4 | 0; //@line 4183
  HEAP32[$30 >> 2] = $2; //@line 4184
  $31 = $ReallocAsyncCtx4 + 8 | 0; //@line 4185
  HEAP32[$31 >> 2] = $4; //@line 4186
  $32 = $ReallocAsyncCtx4 + 12 | 0; //@line 4187
  HEAP32[$32 >> 2] = $6; //@line 4188
  $33 = $ReallocAsyncCtx4 + 16 | 0; //@line 4189
  HEAP32[$33 >> 2] = $8; //@line 4190
  $34 = $ReallocAsyncCtx4 + 20 | 0; //@line 4191
  HEAP32[$34 >> 2] = $10; //@line 4192
  $35 = $ReallocAsyncCtx4 + 24 | 0; //@line 4193
  HEAP32[$35 >> 2] = $12; //@line 4194
  $36 = $ReallocAsyncCtx4 + 28 | 0; //@line 4195
  HEAP32[$36 >> 2] = $14; //@line 4196
  $37 = $ReallocAsyncCtx4 + 32 | 0; //@line 4197
  HEAP32[$37 >> 2] = $16; //@line 4198
  sp = STACKTOP; //@line 4199
  STACKTOP = sp; //@line 4200
  return;
 }
 ___async_unwind = 0; //@line 4202
 HEAP32[$ReallocAsyncCtx4 >> 2] = 160; //@line 4203
 $30 = $ReallocAsyncCtx4 + 4 | 0; //@line 4204
 HEAP32[$30 >> 2] = $2; //@line 4205
 $31 = $ReallocAsyncCtx4 + 8 | 0; //@line 4206
 HEAP32[$31 >> 2] = $4; //@line 4207
 $32 = $ReallocAsyncCtx4 + 12 | 0; //@line 4208
 HEAP32[$32 >> 2] = $6; //@line 4209
 $33 = $ReallocAsyncCtx4 + 16 | 0; //@line 4210
 HEAP32[$33 >> 2] = $8; //@line 4211
 $34 = $ReallocAsyncCtx4 + 20 | 0; //@line 4212
 HEAP32[$34 >> 2] = $10; //@line 4213
 $35 = $ReallocAsyncCtx4 + 24 | 0; //@line 4214
 HEAP32[$35 >> 2] = $12; //@line 4215
 $36 = $ReallocAsyncCtx4 + 28 | 0; //@line 4216
 HEAP32[$36 >> 2] = $14; //@line 4217
 $37 = $ReallocAsyncCtx4 + 32 | 0; //@line 4218
 HEAP32[$37 >> 2] = $16; //@line 4219
 sp = STACKTOP; //@line 4220
 STACKTOP = sp; //@line 4221
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
 sp = STACKTOP; //@line 13626
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13631
 } else {
  $9 = $1 + 52 | 0; //@line 13633
  $10 = HEAP8[$9 >> 0] | 0; //@line 13634
  $11 = $1 + 53 | 0; //@line 13635
  $12 = HEAP8[$11 >> 0] | 0; //@line 13636
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 13639
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 13640
  HEAP8[$9 >> 0] = 0; //@line 13641
  HEAP8[$11 >> 0] = 0; //@line 13642
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 13643
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 13644
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 201; //@line 13647
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 13649
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13651
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13653
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 13655
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 13657
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 13659
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 13661
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 13663
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 13665
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 13667
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 13670
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 13672
   sp = STACKTOP; //@line 13673
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13676
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 13681
    $32 = $0 + 8 | 0; //@line 13682
    $33 = $1 + 54 | 0; //@line 13683
    $$0 = $0 + 24 | 0; //@line 13684
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
     HEAP8[$9 >> 0] = 0; //@line 13717
     HEAP8[$11 >> 0] = 0; //@line 13718
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 13719
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 13720
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13725
     $62 = $$0 + 8 | 0; //@line 13726
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 13729
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 202; //@line 13734
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 13736
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 13738
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 13740
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 13742
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 13744
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 13746
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 13748
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 13750
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 13752
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 13754
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 13756
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 13758
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 13760
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 13763
    sp = STACKTOP; //@line 13764
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 13768
  HEAP8[$11 >> 0] = $12; //@line 13769
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10356
      $10 = HEAP32[$9 >> 2] | 0; //@line 10357
      HEAP32[$2 >> 2] = $9 + 4; //@line 10359
      HEAP32[$0 >> 2] = $10; //@line 10360
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10376
      $17 = HEAP32[$16 >> 2] | 0; //@line 10377
      HEAP32[$2 >> 2] = $16 + 4; //@line 10379
      $20 = $0; //@line 10382
      HEAP32[$20 >> 2] = $17; //@line 10384
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 10387
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10403
      $30 = HEAP32[$29 >> 2] | 0; //@line 10404
      HEAP32[$2 >> 2] = $29 + 4; //@line 10406
      $31 = $0; //@line 10407
      HEAP32[$31 >> 2] = $30; //@line 10409
      HEAP32[$31 + 4 >> 2] = 0; //@line 10412
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10428
      $41 = $40; //@line 10429
      $43 = HEAP32[$41 >> 2] | 0; //@line 10431
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 10434
      HEAP32[$2 >> 2] = $40 + 8; //@line 10436
      $47 = $0; //@line 10437
      HEAP32[$47 >> 2] = $43; //@line 10439
      HEAP32[$47 + 4 >> 2] = $46; //@line 10442
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10458
      $57 = HEAP32[$56 >> 2] | 0; //@line 10459
      HEAP32[$2 >> 2] = $56 + 4; //@line 10461
      $59 = ($57 & 65535) << 16 >> 16; //@line 10463
      $62 = $0; //@line 10466
      HEAP32[$62 >> 2] = $59; //@line 10468
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 10471
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10487
      $72 = HEAP32[$71 >> 2] | 0; //@line 10488
      HEAP32[$2 >> 2] = $71 + 4; //@line 10490
      $73 = $0; //@line 10492
      HEAP32[$73 >> 2] = $72 & 65535; //@line 10494
      HEAP32[$73 + 4 >> 2] = 0; //@line 10497
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10513
      $83 = HEAP32[$82 >> 2] | 0; //@line 10514
      HEAP32[$2 >> 2] = $82 + 4; //@line 10516
      $85 = ($83 & 255) << 24 >> 24; //@line 10518
      $88 = $0; //@line 10521
      HEAP32[$88 >> 2] = $85; //@line 10523
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 10526
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10542
      $98 = HEAP32[$97 >> 2] | 0; //@line 10543
      HEAP32[$2 >> 2] = $97 + 4; //@line 10545
      $99 = $0; //@line 10547
      HEAP32[$99 >> 2] = $98 & 255; //@line 10549
      HEAP32[$99 + 4 >> 2] = 0; //@line 10552
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10568
      $109 = +HEAPF64[$108 >> 3]; //@line 10569
      HEAP32[$2 >> 2] = $108 + 8; //@line 10571
      HEAPF64[$0 >> 3] = $109; //@line 10572
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10588
      $116 = +HEAPF64[$115 >> 3]; //@line 10589
      HEAP32[$2 >> 2] = $115 + 8; //@line 10591
      HEAPF64[$0 >> 3] = $116; //@line 10592
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_96($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6753
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6755
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6757
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6759
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6761
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 6764
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6766
 $15 = $12 + 24 | 0; //@line 6769
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 6774
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 6778
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 6785
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 6796
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 6797
      if (!___async) {
       ___async_unwind = 0; //@line 6800
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 207; //@line 6802
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 6804
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 6806
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 6808
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 6810
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 6812
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 6814
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 6816
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 6819
      sp = STACKTOP; //@line 6820
      return;
     }
     $36 = $4 + 24 | 0; //@line 6823
     $37 = $4 + 54 | 0; //@line 6824
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 6839
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 6840
     if (!___async) {
      ___async_unwind = 0; //@line 6843
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 206; //@line 6845
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 6847
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 6849
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 6851
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 6853
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 6855
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 6857
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 6859
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 6861
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 6864
     sp = STACKTOP; //@line 6865
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 6869
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 6873
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 6874
    if (!___async) {
     ___async_unwind = 0; //@line 6877
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 205; //@line 6879
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 6881
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 6883
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 6885
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 6887
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 6889
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 6891
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 6894
    sp = STACKTOP; //@line 6895
    return;
   }
  }
 } while (0);
 return;
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $$03 = 0, $13 = 0, $14 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $35 = 0, $36 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3555
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 108 >> 2] | 0; //@line 3558
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3559
 FUNCTION_TABLE_viii[$3 & 3]($0, 0, 0); //@line 3560
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 3563
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3565
  sp = STACKTOP; //@line 3566
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3569
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 3572
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3573
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 3574
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 139; //@line 3577
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 3579
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3581
  sp = STACKTOP; //@line 3582
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3585
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 3588
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3589
 $14 = FUNCTION_TABLE_ii[$13 & 31]($0) | 0; //@line 3590
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 140; //@line 3593
  HEAP32[$AsyncCtx5 + 4 >> 2] = $8; //@line 3595
  HEAP32[$AsyncCtx5 + 8 >> 2] = $0; //@line 3597
  HEAP32[$AsyncCtx5 + 12 >> 2] = $0; //@line 3599
  sp = STACKTOP; //@line 3600
  return;
 }
 _emscripten_free_async_context($AsyncCtx5 | 0); //@line 3603
 if ((Math_imul($14, $8) | 0) <= 0) {
  return;
 }
 $$03 = 0; //@line 3609
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3611
  __ZN4mbed6Stream4putcEi($0, 32) | 0; //@line 3612
  if (___async) {
   label = 11; //@line 3615
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 3618
  $24 = $$03 + 1 | 0; //@line 3619
  $27 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 3622
  $AsyncCtx9 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3623
  $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 3624
  if (___async) {
   label = 13; //@line 3627
   break;
  }
  _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3630
  $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 3633
  $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3634
  $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 3635
  if (___async) {
   label = 15; //@line 3638
   break;
  }
  _emscripten_free_async_context($AsyncCtx12 | 0); //@line 3641
  if (($24 | 0) < (Math_imul($36, $28) | 0)) {
   $$03 = $24; //@line 3645
  } else {
   label = 9; //@line 3647
   break;
  }
 }
 if ((label | 0) == 9) {
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 141; //@line 3655
  HEAP32[$AsyncCtx16 + 4 >> 2] = $$03; //@line 3657
  HEAP32[$AsyncCtx16 + 8 >> 2] = $0; //@line 3659
  HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 3661
  HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 3663
  sp = STACKTOP; //@line 3664
  return;
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx9 >> 2] = 142; //@line 3668
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 3670
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 3672
  HEAP32[$AsyncCtx9 + 12 >> 2] = $24; //@line 3674
  HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 3676
  sp = STACKTOP; //@line 3677
  return;
 } else if ((label | 0) == 15) {
  HEAP32[$AsyncCtx12 >> 2] = 143; //@line 3681
  HEAP32[$AsyncCtx12 + 4 >> 2] = $28; //@line 3683
  HEAP32[$AsyncCtx12 + 8 >> 2] = $24; //@line 3685
  HEAP32[$AsyncCtx12 + 12 >> 2] = $0; //@line 3687
  HEAP32[$AsyncCtx12 + 16 >> 2] = $0; //@line 3689
  HEAP32[$AsyncCtx12 + 20 >> 2] = $0; //@line 3691
  sp = STACKTOP; //@line 3692
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 15
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 17
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 19
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 21
 $29 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 22
 if (($29 | 0) == ($4 | 0)) {
  $19 = HEAP32[(HEAP32[$6 >> 2] | 0) + 76 >> 2] | 0; //@line 27
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 28
  FUNCTION_TABLE_vi[$19 & 255]($8); //@line 29
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 32
   $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 33
   HEAP32[$20 >> 2] = $6; //@line 34
   $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 35
   HEAP32[$21 >> 2] = $8; //@line 36
   $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 37
   HEAP32[$22 >> 2] = $14; //@line 38
   $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 39
   HEAP32[$23 >> 2] = $16; //@line 40
   $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 41
   HEAP32[$24 >> 2] = $4; //@line 42
   sp = STACKTOP; //@line 43
   return;
  }
  ___async_unwind = 0; //@line 46
  HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 47
  $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 48
  HEAP32[$20 >> 2] = $6; //@line 49
  $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 50
  HEAP32[$21 >> 2] = $8; //@line 51
  $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 52
  HEAP32[$22 >> 2] = $14; //@line 53
  $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 54
  HEAP32[$23 >> 2] = $16; //@line 55
  $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 56
  HEAP32[$24 >> 2] = $4; //@line 57
  sp = STACKTOP; //@line 58
  return;
 } else {
  $27 = HEAP32[(HEAP32[$10 >> 2] | 0) + 68 >> 2] | 0; //@line 63
  $31 = HEAP8[$12 + $29 >> 0] | 0; //@line 66
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 67
  FUNCTION_TABLE_iii[$27 & 7]($8, $31) | 0; //@line 68
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 68; //@line 71
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 72
   HEAP32[$32 >> 2] = $29; //@line 73
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 74
   HEAP32[$33 >> 2] = $4; //@line 75
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 76
   HEAP32[$34 >> 2] = $6; //@line 77
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 78
   HEAP32[$35 >> 2] = $8; //@line 79
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 80
   HEAP32[$36 >> 2] = $10; //@line 81
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 82
   HEAP32[$37 >> 2] = $12; //@line 83
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 84
   HEAP32[$38 >> 2] = $14; //@line 85
   $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 86
   HEAP32[$39 >> 2] = $16; //@line 87
   sp = STACKTOP; //@line 88
   return;
  }
  ___async_unwind = 0; //@line 91
  HEAP32[$ReallocAsyncCtx4 >> 2] = 68; //@line 92
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 93
  HEAP32[$32 >> 2] = $29; //@line 94
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 95
  HEAP32[$33 >> 2] = $4; //@line 96
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 97
  HEAP32[$34 >> 2] = $6; //@line 98
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 99
  HEAP32[$35 >> 2] = $8; //@line 100
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 101
  HEAP32[$36 >> 2] = $10; //@line 102
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 103
  HEAP32[$37 >> 2] = $12; //@line 104
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 105
  HEAP32[$38 >> 2] = $14; //@line 106
  $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 107
  HEAP32[$39 >> 2] = $16; //@line 108
  sp = STACKTOP; //@line 109
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_5($0) {
 $0 = $0 | 0;
 var $10 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 117
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 119
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 121
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 123
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 125
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 127
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 129
 if (($AsyncRetVal | 0) <= 0) {
  $15 = HEAP32[(HEAP32[$4 >> 2] | 0) + 76 >> 2] | 0; //@line 134
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 135
  FUNCTION_TABLE_vi[$15 & 255]($2); //@line 136
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 139
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 140
   HEAP32[$16 >> 2] = $4; //@line 141
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 142
   HEAP32[$17 >> 2] = $2; //@line 143
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 144
   HEAP32[$18 >> 2] = $6; //@line 145
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 146
   HEAP32[$19 >> 2] = $8; //@line 147
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 148
   HEAP32[$20 >> 2] = $AsyncRetVal; //@line 149
   sp = STACKTOP; //@line 150
   return;
  }
  ___async_unwind = 0; //@line 153
  HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 154
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 155
  HEAP32[$16 >> 2] = $4; //@line 156
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 157
  HEAP32[$17 >> 2] = $2; //@line 158
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 159
  HEAP32[$18 >> 2] = $6; //@line 160
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 161
  HEAP32[$19 >> 2] = $8; //@line 162
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 163
  HEAP32[$20 >> 2] = $AsyncRetVal; //@line 164
  sp = STACKTOP; //@line 165
  return;
 }
 $23 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 170
 $25 = HEAP8[$10 >> 0] | 0; //@line 172
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 173
 FUNCTION_TABLE_iii[$23 & 7]($2, $25) | 0; //@line 174
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 68; //@line 177
  $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 178
  HEAP32[$26 >> 2] = 0; //@line 179
  $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 180
  HEAP32[$27 >> 2] = $AsyncRetVal; //@line 181
  $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 182
  HEAP32[$28 >> 2] = $4; //@line 183
  $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 184
  HEAP32[$29 >> 2] = $2; //@line 185
  $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 186
  HEAP32[$30 >> 2] = $2; //@line 187
  $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 188
  HEAP32[$31 >> 2] = $10; //@line 189
  $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 190
  HEAP32[$32 >> 2] = $6; //@line 191
  $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 192
  HEAP32[$33 >> 2] = $8; //@line 193
  sp = STACKTOP; //@line 194
  return;
 }
 ___async_unwind = 0; //@line 197
 HEAP32[$ReallocAsyncCtx4 >> 2] = 68; //@line 198
 $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 199
 HEAP32[$26 >> 2] = 0; //@line 200
 $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 201
 HEAP32[$27 >> 2] = $AsyncRetVal; //@line 202
 $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 203
 HEAP32[$28 >> 2] = $4; //@line 204
 $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 205
 HEAP32[$29 >> 2] = $2; //@line 206
 $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 207
 HEAP32[$30 >> 2] = $2; //@line 208
 $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 209
 HEAP32[$31 >> 2] = $10; //@line 210
 $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 211
 HEAP32[$32 >> 2] = $6; //@line 212
 $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 213
 HEAP32[$33 >> 2] = $8; //@line 214
 sp = STACKTOP; //@line 215
 return;
}
function __ZN11TextDisplay5_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $12 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $25 = 0, $31 = 0, $32 = 0, $35 = 0, $36 = 0, $45 = 0, $46 = 0, $49 = 0, $5 = 0, $50 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3371
 _emscripten_asm_const_ii(4, $1 | 0) | 0; //@line 3372
 if (($1 | 0) == 10) {
  HEAP16[$0 + 24 >> 1] = 0; //@line 3376
  $5 = $0 + 26 | 0; //@line 3377
  $7 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 3379
  HEAP16[$5 >> 1] = $7; //@line 3380
  $8 = $7 & 65535; //@line 3381
  $11 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 3384
  $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3385
  $12 = FUNCTION_TABLE_ii[$11 & 31]($0) | 0; //@line 3386
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 132; //@line 3389
   HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 3391
   HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 3393
   HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 3395
   sp = STACKTOP; //@line 3396
   return 0; //@line 3397
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3399
  if (($12 | 0) > ($8 | 0)) {
   return $1 | 0; //@line 3402
  }
  HEAP16[$5 >> 1] = 0; //@line 3404
  return $1 | 0; //@line 3405
 }
 $19 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 3409
 $20 = $0 + 24 | 0; //@line 3410
 $22 = HEAPU16[$20 >> 1] | 0; //@line 3412
 $23 = $0 + 26 | 0; //@line 3413
 $25 = HEAPU16[$23 >> 1] | 0; //@line 3415
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3416
 FUNCTION_TABLE_viiii[$19 & 7]($0, $22, $25, $1); //@line 3417
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 133; //@line 3420
  HEAP32[$AsyncCtx3 + 4 >> 2] = $20; //@line 3422
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 3424
  HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 3426
  HEAP32[$AsyncCtx3 + 16 >> 2] = $23; //@line 3428
  sp = STACKTOP; //@line 3429
  return 0; //@line 3430
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3432
 $31 = (HEAP16[$20 >> 1] | 0) + 1 << 16 >> 16; //@line 3434
 HEAP16[$20 >> 1] = $31; //@line 3435
 $32 = $31 & 65535; //@line 3436
 $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 3439
 $AsyncCtx6 = _emscripten_alloc_async_context(28, sp) | 0; //@line 3440
 $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 3441
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 134; //@line 3444
  HEAP32[$AsyncCtx6 + 4 >> 2] = $32; //@line 3446
  HEAP32[$AsyncCtx6 + 8 >> 2] = $1; //@line 3448
  HEAP32[$AsyncCtx6 + 12 >> 2] = $20; //@line 3450
  HEAP32[$AsyncCtx6 + 16 >> 2] = $23; //@line 3452
  HEAP32[$AsyncCtx6 + 20 >> 2] = $0; //@line 3454
  HEAP32[$AsyncCtx6 + 24 >> 2] = $0; //@line 3456
  sp = STACKTOP; //@line 3457
  return 0; //@line 3458
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3460
 if (($36 | 0) > ($32 | 0)) {
  return $1 | 0; //@line 3463
 }
 HEAP16[$20 >> 1] = 0; //@line 3465
 $45 = (HEAP16[$23 >> 1] | 0) + 1 << 16 >> 16; //@line 3467
 HEAP16[$23 >> 1] = $45; //@line 3468
 $46 = $45 & 65535; //@line 3469
 $49 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 3472
 $AsyncCtx10 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3473
 $50 = FUNCTION_TABLE_ii[$49 & 31]($0) | 0; //@line 3474
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 135; //@line 3477
  HEAP32[$AsyncCtx10 + 4 >> 2] = $46; //@line 3479
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 3481
  HEAP32[$AsyncCtx10 + 12 >> 2] = $23; //@line 3483
  sp = STACKTOP; //@line 3484
  return 0; //@line 3485
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3487
 if (($50 | 0) > ($46 | 0)) {
  return $1 | 0; //@line 3490
 }
 HEAP16[$23 >> 1] = 0; //@line 3492
 return $1 | 0; //@line 3493
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9256
 STACKTOP = STACKTOP + 224 | 0; //@line 9257
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 9257
 $3 = sp + 120 | 0; //@line 9258
 $4 = sp + 80 | 0; //@line 9259
 $5 = sp; //@line 9260
 $6 = sp + 136 | 0; //@line 9261
 dest = $4; //@line 9262
 stop = dest + 40 | 0; //@line 9262
 do {
  HEAP32[dest >> 2] = 0; //@line 9262
  dest = dest + 4 | 0; //@line 9262
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 9264
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 9268
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 9275
  } else {
   $43 = 0; //@line 9277
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 9279
  $14 = $13 & 32; //@line 9280
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 9286
  }
  $19 = $0 + 48 | 0; //@line 9288
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 9293
    $24 = HEAP32[$23 >> 2] | 0; //@line 9294
    HEAP32[$23 >> 2] = $6; //@line 9295
    $25 = $0 + 28 | 0; //@line 9296
    HEAP32[$25 >> 2] = $6; //@line 9297
    $26 = $0 + 20 | 0; //@line 9298
    HEAP32[$26 >> 2] = $6; //@line 9299
    HEAP32[$19 >> 2] = 80; //@line 9300
    $28 = $0 + 16 | 0; //@line 9302
    HEAP32[$28 >> 2] = $6 + 80; //@line 9303
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9304
    if (!$24) {
     $$1 = $29; //@line 9307
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 9310
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 9311
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 9312
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 174; //@line 9315
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 9317
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 9319
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 9321
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 9323
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 9325
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 9327
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 9329
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 9331
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 9333
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 9335
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 9337
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 9339
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 9341
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 9343
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 9345
      sp = STACKTOP; //@line 9346
      STACKTOP = sp; //@line 9347
      return 0; //@line 9347
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9349
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 9352
      HEAP32[$23 >> 2] = $24; //@line 9353
      HEAP32[$19 >> 2] = 0; //@line 9354
      HEAP32[$28 >> 2] = 0; //@line 9355
      HEAP32[$25 >> 2] = 0; //@line 9356
      HEAP32[$26 >> 2] = 0; //@line 9357
      $$1 = $$; //@line 9358
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9364
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 9367
  HEAP32[$0 >> 2] = $51 | $14; //@line 9372
  if ($43 | 0) {
   ___unlockfile($0); //@line 9375
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 9377
 }
 STACKTOP = sp; //@line 9379
 return $$0 | 0; //@line 9379
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 13161
 STACKTOP = STACKTOP + 64 | 0; //@line 13162
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 13162
 $4 = sp; //@line 13163
 $5 = HEAP32[$0 >> 2] | 0; //@line 13164
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 13167
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 13169
 HEAP32[$4 >> 2] = $2; //@line 13170
 HEAP32[$4 + 4 >> 2] = $0; //@line 13172
 HEAP32[$4 + 8 >> 2] = $1; //@line 13174
 HEAP32[$4 + 12 >> 2] = $3; //@line 13176
 $14 = $4 + 16 | 0; //@line 13177
 $15 = $4 + 20 | 0; //@line 13178
 $16 = $4 + 24 | 0; //@line 13179
 $17 = $4 + 28 | 0; //@line 13180
 $18 = $4 + 32 | 0; //@line 13181
 $19 = $4 + 40 | 0; //@line 13182
 dest = $14; //@line 13183
 stop = dest + 36 | 0; //@line 13183
 do {
  HEAP32[dest >> 2] = 0; //@line 13183
  dest = dest + 4 | 0; //@line 13183
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 13183
 HEAP8[$14 + 38 >> 0] = 0; //@line 13183
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 13188
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13191
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13192
   FUNCTION_TABLE_viiiiii[$24 & 7]($10, $4, $8, $8, 1, 0); //@line 13193
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 193; //@line 13196
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 13198
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 13200
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 13202
    sp = STACKTOP; //@line 13203
    STACKTOP = sp; //@line 13204
    return 0; //@line 13204
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13206
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 13210
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 13214
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 13217
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 13218
   FUNCTION_TABLE_viiiii[$33 & 7]($10, $4, $8, 1, 0); //@line 13219
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 194; //@line 13222
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 13224
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 13226
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 13228
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 13230
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 13232
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 13234
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 13236
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 13238
    sp = STACKTOP; //@line 13239
    STACKTOP = sp; //@line 13240
    return 0; //@line 13240
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13242
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 13256
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 13264
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 13280
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 13285
  }
 } while (0);
 STACKTOP = sp; //@line 13288
 return $$0 | 0; //@line 13288
}
function __ZN6C128328print_bmE6Bitmapii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$02225 = 0, $$02225$us = 0, $$023$us30 = 0, $10 = 0, $11 = 0, $13 = 0, $27 = 0, $30 = 0, $5 = 0, $53 = 0, $55 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2679
 $5 = HEAP32[$1 + 4 >> 2] | 0; //@line 2681
 if (($5 | 0) <= 0) {
  return;
 }
 $7 = HEAP32[$1 >> 2] | 0; //@line 2686
 $9 = $1 + 12 | 0; //@line 2688
 $10 = $1 + 8 | 0; //@line 2689
 if (($7 | 0) > 0) {
  $$02225$us = 0; //@line 2691
 } else {
  $$02225 = 0; //@line 2693
  do {
   $$02225 = $$02225 + 1 | 0; //@line 2695
  } while (($$02225 | 0) < ($5 | 0));
  return;
 }
 L8 : while (1) {
  $11 = $$02225$us + $3 | 0; //@line 2706
  L10 : do {
   if (($11 | 0) <= 31) {
    $$023$us30 = 0; //@line 2710
    while (1) {
     $13 = $$023$us30 + $2 | 0; //@line 2712
     if (($13 | 0) > 127) {
      break L10;
     }
     $27 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$9 >> 2] | 0) + ((Math_imul(HEAP32[$10 >> 2] | 0, $$02225$us) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 2729
     $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 2732
     if ($27) {
      $AsyncCtx3 = _emscripten_alloc_async_context(48, sp) | 0; //@line 2734
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 0); //@line 2735
      if (___async) {
       label = 10; //@line 2738
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2741
     } else {
      $AsyncCtx = _emscripten_alloc_async_context(48, sp) | 0; //@line 2743
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 1); //@line 2744
      if (___async) {
       label = 7; //@line 2747
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 2750
     }
     $53 = $$023$us30 + 1 | 0; //@line 2752
     if (($53 | 0) < ($7 | 0)) {
      $$023$us30 = $53; //@line 2755
     } else {
      break;
     }
    }
   }
  } while (0);
  $55 = $$02225$us + 1 | 0; //@line 2762
  if (($55 | 0) < ($5 | 0)) {
   $$02225$us = $55; //@line 2765
  } else {
   label = 15; //@line 2767
   break;
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx >> 2] = 114; //@line 2772
  HEAP32[$AsyncCtx + 4 >> 2] = $$023$us30; //@line 2774
  HEAP32[$AsyncCtx + 8 >> 2] = $7; //@line 2776
  HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 2778
  HEAP32[$AsyncCtx + 16 >> 2] = $$02225$us; //@line 2780
  HEAP32[$AsyncCtx + 20 >> 2] = $5; //@line 2782
  HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 2784
  HEAP32[$AsyncCtx + 28 >> 2] = $9; //@line 2786
  HEAP32[$AsyncCtx + 32 >> 2] = $10; //@line 2788
  HEAP32[$AsyncCtx + 36 >> 2] = $0; //@line 2790
  HEAP32[$AsyncCtx + 40 >> 2] = $0; //@line 2792
  HEAP32[$AsyncCtx + 44 >> 2] = $11; //@line 2794
  sp = STACKTOP; //@line 2795
  return;
 } else if ((label | 0) == 10) {
  HEAP32[$AsyncCtx3 >> 2] = 115; //@line 2799
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$023$us30; //@line 2801
  HEAP32[$AsyncCtx3 + 8 >> 2] = $7; //@line 2803
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2805
  HEAP32[$AsyncCtx3 + 16 >> 2] = $$02225$us; //@line 2807
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 2809
  HEAP32[$AsyncCtx3 + 24 >> 2] = $3; //@line 2811
  HEAP32[$AsyncCtx3 + 28 >> 2] = $9; //@line 2813
  HEAP32[$AsyncCtx3 + 32 >> 2] = $10; //@line 2815
  HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 2817
  HEAP32[$AsyncCtx3 + 40 >> 2] = $0; //@line 2819
  HEAP32[$AsyncCtx3 + 44 >> 2] = $11; //@line 2821
  sp = STACKTOP; //@line 2822
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
 $3 = $1 & 255; //@line 9128
 $7 = ($2 | 0) != 0; //@line 9132
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 9136
   $$03555 = $0; //@line 9137
   $$03654 = $2; //@line 9137
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 9142
     $$036$lcssa64 = $$03654; //@line 9142
     label = 6; //@line 9143
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 9146
    $12 = $$03654 + -1 | 0; //@line 9147
    $16 = ($12 | 0) != 0; //@line 9151
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 9154
     $$03654 = $12; //@line 9154
    } else {
     $$035$lcssa = $11; //@line 9156
     $$036$lcssa = $12; //@line 9156
     $$lcssa = $16; //@line 9156
     label = 5; //@line 9157
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 9162
   $$036$lcssa = $2; //@line 9162
   $$lcssa = $7; //@line 9162
   label = 5; //@line 9163
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 9168
   $$036$lcssa64 = $$036$lcssa; //@line 9168
   label = 6; //@line 9169
  } else {
   $$2 = $$035$lcssa; //@line 9171
   $$3 = 0; //@line 9171
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 9177
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 9180
    $$3 = $$036$lcssa64; //@line 9180
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 9182
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 9186
      $$13745 = $$036$lcssa64; //@line 9186
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 9189
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 9198
       $30 = $$13745 + -4 | 0; //@line 9199
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 9202
        $$13745 = $30; //@line 9202
       } else {
        $$0$lcssa = $29; //@line 9204
        $$137$lcssa = $30; //@line 9204
        label = 11; //@line 9205
        break L11;
       }
      }
      $$140 = $$046; //@line 9209
      $$23839 = $$13745; //@line 9209
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 9211
      $$137$lcssa = $$036$lcssa64; //@line 9211
      label = 11; //@line 9212
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 9218
      $$3 = 0; //@line 9218
      break;
     } else {
      $$140 = $$0$lcssa; //@line 9221
      $$23839 = $$137$lcssa; //@line 9221
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 9228
      $$3 = $$23839; //@line 9228
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 9231
     $$23839 = $$23839 + -1 | 0; //@line 9232
     if (!$$23839) {
      $$2 = $35; //@line 9235
      $$3 = 0; //@line 9235
      break;
     } else {
      $$140 = $35; //@line 9238
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 9246
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8899
 do {
  if (!$0) {
   do {
    if (!(HEAP32[335] | 0)) {
     $34 = 0; //@line 8907
    } else {
     $12 = HEAP32[335] | 0; //@line 8909
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8910
     $13 = _fflush($12) | 0; //@line 8911
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 170; //@line 8914
      sp = STACKTOP; //@line 8915
      return 0; //@line 8916
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8918
      $34 = $13; //@line 8919
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8925
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8929
    } else {
     $$02327 = $$02325; //@line 8931
     $$02426 = $34; //@line 8931
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8938
      } else {
       $28 = 0; //@line 8940
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8948
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8949
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8954
       $$1 = $25 | $$02426; //@line 8956
      } else {
       $$1 = $$02426; //@line 8958
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8962
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8965
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8968
       break L9;
      } else {
       $$02327 = $$023; //@line 8971
       $$02426 = $$1; //@line 8971
      }
     }
     HEAP32[$AsyncCtx >> 2] = 171; //@line 8974
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8976
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8978
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8980
     sp = STACKTOP; //@line 8981
     return 0; //@line 8982
    }
   } while (0);
   ___ofl_unlock(); //@line 8985
   $$0 = $$024$lcssa; //@line 8986
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8992
    $5 = ___fflush_unlocked($0) | 0; //@line 8993
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 168; //@line 8996
     sp = STACKTOP; //@line 8997
     return 0; //@line 8998
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 9000
     $$0 = $5; //@line 9001
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 9006
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 9007
   $7 = ___fflush_unlocked($0) | 0; //@line 9008
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 169; //@line 9011
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 9014
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9016
    sp = STACKTOP; //@line 9017
    return 0; //@line 9018
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9020
   if ($phitmp) {
    $$0 = $7; //@line 9022
   } else {
    ___unlockfile($0); //@line 9024
    $$0 = $7; //@line 9025
   }
  }
 } while (0);
 return $$0 | 0; //@line 9029
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13343
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13349
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 13355
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 13358
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 13359
    FUNCTION_TABLE_viiiii[$53 & 7]($50, $1, $2, $3, $4); //@line 13360
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 197; //@line 13363
     sp = STACKTOP; //@line 13364
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13367
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 13375
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 13380
     $19 = $1 + 44 | 0; //@line 13381
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 13387
     HEAP8[$22 >> 0] = 0; //@line 13388
     $23 = $1 + 53 | 0; //@line 13389
     HEAP8[$23 >> 0] = 0; //@line 13390
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 13392
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 13395
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13396
     FUNCTION_TABLE_viiiiii[$28 & 7]($25, $1, $2, $2, 1, $4); //@line 13397
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 196; //@line 13400
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 13402
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13404
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 13406
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13408
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 13410
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 13412
      sp = STACKTOP; //@line 13413
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13416
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 13420
      label = 13; //@line 13421
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 13426
       label = 13; //@line 13427
      } else {
       $$037$off039 = 3; //@line 13429
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 13433
      $39 = $1 + 40 | 0; //@line 13434
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 13437
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 13447
        $$037$off039 = $$037$off038; //@line 13448
       } else {
        $$037$off039 = $$037$off038; //@line 13450
       }
      } else {
       $$037$off039 = $$037$off038; //@line 13453
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 13456
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 13463
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12655
 STACKTOP = STACKTOP + 48 | 0; //@line 12656
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12656
 $vararg_buffer10 = sp + 32 | 0; //@line 12657
 $vararg_buffer7 = sp + 24 | 0; //@line 12658
 $vararg_buffer3 = sp + 16 | 0; //@line 12659
 $vararg_buffer = sp; //@line 12660
 $0 = sp + 36 | 0; //@line 12661
 $1 = ___cxa_get_globals_fast() | 0; //@line 12662
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12665
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12670
   $9 = HEAP32[$7 >> 2] | 0; //@line 12672
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12675
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 8397; //@line 12681
    _abort_message(8347, $vararg_buffer7); //@line 12682
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12691
   } else {
    $22 = $3 + 80 | 0; //@line 12693
   }
   HEAP32[$0 >> 2] = $22; //@line 12695
   $23 = HEAP32[$3 >> 2] | 0; //@line 12696
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12698
   $28 = HEAP32[(HEAP32[52] | 0) + 16 >> 2] | 0; //@line 12701
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12702
   $29 = FUNCTION_TABLE_iiii[$28 & 15](208, $23, $0) | 0; //@line 12703
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 187; //@line 12706
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12708
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12710
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12712
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12714
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12716
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12718
    sp = STACKTOP; //@line 12719
    STACKTOP = sp; //@line 12720
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12722
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 8397; //@line 12724
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12726
    _abort_message(8306, $vararg_buffer3); //@line 12727
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12730
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12733
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12734
   $40 = FUNCTION_TABLE_ii[$39 & 31]($36) | 0; //@line 12735
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 188; //@line 12738
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12740
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12742
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12744
    sp = STACKTOP; //@line 12745
    STACKTOP = sp; //@line 12746
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12748
    HEAP32[$vararg_buffer >> 2] = 8397; //@line 12749
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12751
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12753
    _abort_message(8261, $vararg_buffer); //@line 12754
   }
  }
 }
 _abort_message(8385, $vararg_buffer10); //@line 12759
}
function __ZN4mbed6Stream4readEPvj__async_cb_28($0) {
 $0 = $0 | 0;
 var $$016$lcssa = 0, $10 = 0, $12 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3120
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3122
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3124
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3126
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3128
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3130
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3132
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3134
 if (($AsyncRetVal | 0) == -1) {
  $$016$lcssa = $4; //@line 3137
 } else {
  $20 = $4 + 1 | 0; //@line 3140
  HEAP8[$4 >> 0] = $AsyncRetVal; //@line 3141
  if (($20 | 0) == ($6 | 0)) {
   $$016$lcssa = $6; //@line 3144
  } else {
   $16 = HEAP32[(HEAP32[$12 >> 2] | 0) + 72 >> 2] | 0; //@line 3148
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 3149
   $17 = FUNCTION_TABLE_ii[$16 & 31]($10) | 0; //@line 3150
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 51; //@line 3153
    $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 3154
    HEAP32[$18 >> 2] = $2; //@line 3155
    $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 3156
    HEAP32[$19 >> 2] = $20; //@line 3157
    $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 3158
    HEAP32[$21 >> 2] = $6; //@line 3159
    $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 3160
    HEAP32[$22 >> 2] = $8; //@line 3161
    $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 3162
    HEAP32[$23 >> 2] = $10; //@line 3163
    $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 3164
    HEAP32[$24 >> 2] = $12; //@line 3165
    sp = STACKTOP; //@line 3166
    return;
   }
   HEAP32[___async_retval >> 2] = $17; //@line 3170
   ___async_unwind = 0; //@line 3171
   HEAP32[$ReallocAsyncCtx2 >> 2] = 51; //@line 3172
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 3173
   HEAP32[$18 >> 2] = $2; //@line 3174
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 3175
   HEAP32[$19 >> 2] = $20; //@line 3176
   $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 3177
   HEAP32[$21 >> 2] = $6; //@line 3178
   $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 3179
   HEAP32[$22 >> 2] = $8; //@line 3180
   $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 3181
   HEAP32[$23 >> 2] = $10; //@line 3182
   $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 3183
   HEAP32[$24 >> 2] = $12; //@line 3184
   sp = STACKTOP; //@line 3185
   return;
  }
 }
 $31 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 3191
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 3192
 FUNCTION_TABLE_vi[$31 & 255]($10); //@line 3193
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 3196
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 3197
  HEAP32[$32 >> 2] = $$016$lcssa; //@line 3198
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 3199
  HEAP32[$33 >> 2] = $2; //@line 3200
  sp = STACKTOP; //@line 3201
  return;
 }
 ___async_unwind = 0; //@line 3204
 HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 3205
 $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 3206
 HEAP32[$32 >> 2] = $$016$lcssa; //@line 3207
 $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 3208
 HEAP32[$33 >> 2] = $2; //@line 3209
 sp = STACKTOP; //@line 3210
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_21($0) {
 $0 = $0 | 0;
 var $$1 = 0, $10 = 0, $12 = 0, $17 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2708
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2710
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2712
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2714
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2716
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2718
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2720
 if ((HEAP32[___async_retval >> 2] | 0) == -1) {
  $$1 = $2; //@line 2725
 } else {
  if (($2 | 0) == ($4 | 0)) {
   $$1 = $4; //@line 2729
  } else {
   $17 = HEAP32[(HEAP32[$12 >> 2] | 0) + 68 >> 2] | 0; //@line 2733
   $18 = $2 + 1 | 0; //@line 2734
   $20 = HEAP8[$2 >> 0] | 0; //@line 2736
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 2737
   $21 = FUNCTION_TABLE_iii[$17 & 7]($8, $20) | 0; //@line 2738
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 2741
    $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 2742
    HEAP32[$22 >> 2] = $18; //@line 2743
    $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 2744
    HEAP32[$23 >> 2] = $4; //@line 2745
    $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 2746
    HEAP32[$24 >> 2] = $6; //@line 2747
    $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 2748
    HEAP32[$25 >> 2] = $8; //@line 2749
    $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 2750
    HEAP32[$26 >> 2] = $10; //@line 2751
    $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 2752
    HEAP32[$27 >> 2] = $12; //@line 2753
    sp = STACKTOP; //@line 2754
    return;
   }
   HEAP32[___async_retval >> 2] = $21; //@line 2758
   ___async_unwind = 0; //@line 2759
   HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 2760
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 2761
   HEAP32[$22 >> 2] = $18; //@line 2762
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 2763
   HEAP32[$23 >> 2] = $4; //@line 2764
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 2765
   HEAP32[$24 >> 2] = $6; //@line 2766
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 2767
   HEAP32[$25 >> 2] = $8; //@line 2768
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 2769
   HEAP32[$26 >> 2] = $10; //@line 2770
   $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 2771
   HEAP32[$27 >> 2] = $12; //@line 2772
   sp = STACKTOP; //@line 2773
   return;
  }
 }
 $32 = HEAP32[(HEAP32[$6 >> 2] | 0) + 84 >> 2] | 0; //@line 2779
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 2780
 FUNCTION_TABLE_vi[$32 & 255]($8); //@line 2781
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 2784
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 2785
  HEAP32[$33 >> 2] = $$1; //@line 2786
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 2787
  HEAP32[$34 >> 2] = $10; //@line 2788
  sp = STACKTOP; //@line 2789
  return;
 }
 ___async_unwind = 0; //@line 2792
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 2793
 $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 2794
 HEAP32[$33 >> 2] = $$1; //@line 2795
 $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 2796
 HEAP32[$34 >> 2] = $10; //@line 2797
 sp = STACKTOP; //@line 2798
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7510
 STACKTOP = STACKTOP + 48 | 0; //@line 7511
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7511
 $vararg_buffer3 = sp + 16 | 0; //@line 7512
 $vararg_buffer = sp; //@line 7513
 $3 = sp + 32 | 0; //@line 7514
 $4 = $0 + 28 | 0; //@line 7515
 $5 = HEAP32[$4 >> 2] | 0; //@line 7516
 HEAP32[$3 >> 2] = $5; //@line 7517
 $7 = $0 + 20 | 0; //@line 7519
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7521
 HEAP32[$3 + 4 >> 2] = $9; //@line 7522
 HEAP32[$3 + 8 >> 2] = $1; //@line 7524
 HEAP32[$3 + 12 >> 2] = $2; //@line 7526
 $12 = $9 + $2 | 0; //@line 7527
 $13 = $0 + 60 | 0; //@line 7528
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7531
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7533
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7535
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7537
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7541
  } else {
   $$04756 = 2; //@line 7543
   $$04855 = $12; //@line 7543
   $$04954 = $3; //@line 7543
   $27 = $17; //@line 7543
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7549
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7551
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7552
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7554
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7556
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7558
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7561
    $44 = $$150 + 4 | 0; //@line 7562
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7565
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7568
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7570
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7572
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7574
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7577
     break L1;
    } else {
     $$04756 = $$1; //@line 7580
     $$04954 = $$150; //@line 7580
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7584
   HEAP32[$4 >> 2] = 0; //@line 7585
   HEAP32[$7 >> 2] = 0; //@line 7586
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7589
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7592
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7597
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7603
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7608
  $25 = $20; //@line 7609
  HEAP32[$4 >> 2] = $25; //@line 7610
  HEAP32[$7 >> 2] = $25; //@line 7611
  $$051 = $2; //@line 7612
 }
 STACKTOP = sp; //@line 7614
 return $$051 | 0; //@line 7614
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2622
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2624
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2626
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2628
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2630
 if (($4 | 0) == ($6 | 0)) {
  $26 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 2635
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 2636
  FUNCTION_TABLE_vi[$26 & 255]($2); //@line 2637
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 2640
   $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 2641
   HEAP32[$27 >> 2] = $6; //@line 2642
   $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 2643
   HEAP32[$28 >> 2] = $4; //@line 2644
   sp = STACKTOP; //@line 2645
   return;
  }
  ___async_unwind = 0; //@line 2648
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 2649
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 2650
  HEAP32[$27 >> 2] = $6; //@line 2651
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 2652
  HEAP32[$28 >> 2] = $4; //@line 2653
  sp = STACKTOP; //@line 2654
  return;
 } else {
  $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 2659
  $13 = $4 + 1 | 0; //@line 2660
  $15 = HEAP8[$4 >> 0] | 0; //@line 2662
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 2663
  $16 = FUNCTION_TABLE_iii[$12 & 7]($2, $15) | 0; //@line 2664
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 2667
   $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2668
   HEAP32[$17 >> 2] = $13; //@line 2669
   $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2670
   HEAP32[$18 >> 2] = $6; //@line 2671
   $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2672
   HEAP32[$19 >> 2] = $8; //@line 2673
   $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2674
   HEAP32[$20 >> 2] = $2; //@line 2675
   $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2676
   HEAP32[$21 >> 2] = $4; //@line 2677
   $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 2678
   HEAP32[$22 >> 2] = $2; //@line 2679
   sp = STACKTOP; //@line 2680
   return;
  }
  HEAP32[___async_retval >> 2] = $16; //@line 2684
  ___async_unwind = 0; //@line 2685
  HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 2686
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2687
  HEAP32[$17 >> 2] = $13; //@line 2688
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2689
  HEAP32[$18 >> 2] = $6; //@line 2690
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2691
  HEAP32[$19 >> 2] = $8; //@line 2692
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2693
  HEAP32[$20 >> 2] = $2; //@line 2694
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2695
  HEAP32[$21 >> 2] = $4; //@line 2696
  $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 2697
  HEAP32[$22 >> 2] = $2; //@line 2698
  sp = STACKTOP; //@line 2699
  return;
 }
}
function _freopen__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $12 = 0, $14 = 0, $18 = 0, $2 = 0, $28 = 0, $30 = 0, $31 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4890
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4892
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4894
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4896
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4898
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4902
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4904
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4908
 if (!$12) {
  $$pre = $4 + 60 | 0; //@line 4913
  if ($6 & 524288 | 0) {
   HEAP32[$8 >> 2] = HEAP32[$$pre >> 2]; //@line 4916
   HEAP32[$8 + 4 >> 2] = 2; //@line 4918
   HEAP32[$8 + 8 >> 2] = 1; //@line 4920
   ___syscall221(221, $8 | 0) | 0; //@line 4921
  }
  HEAP32[$14 >> 2] = HEAP32[$$pre >> 2]; //@line 4925
  HEAP32[$14 + 4 >> 2] = 4; //@line 4927
  HEAP32[$14 + 8 >> 2] = $6 & -524481; //@line 4929
  if ((___syscall_ret(___syscall221(221, $14 | 0) | 0) | 0) >= 0) {
   if ($2 | 0) {
    ___unlockfile($4); //@line 4936
   }
   HEAP32[___async_retval >> 2] = $4; //@line 4939
   return;
  }
 } else {
  $28 = _fopen($12, $18) | 0; //@line 4943
  if ($28 | 0) {
   $30 = $28 + 60 | 0; //@line 4946
   $31 = HEAP32[$30 >> 2] | 0; //@line 4947
   $33 = HEAP32[$4 + 60 >> 2] | 0; //@line 4949
   if (($31 | 0) == ($33 | 0)) {
    HEAP32[$30 >> 2] = -1; //@line 4952
   } else {
    if ((___dup3($31, $33, $6 & 524288) | 0) < 0) {
     $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4958
     _fclose($28) | 0; //@line 4959
     if (!___async) {
      ___async_unwind = 0; //@line 4962
     }
     HEAP32[$ReallocAsyncCtx3 >> 2] = 180; //@line 4964
     HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $4; //@line 4966
     sp = STACKTOP; //@line 4967
     return;
    }
   }
   HEAP32[$4 >> 2] = HEAP32[$4 >> 2] & 1 | HEAP32[$28 >> 2]; //@line 4975
   HEAP32[$4 + 32 >> 2] = HEAP32[$28 + 32 >> 2]; //@line 4979
   HEAP32[$4 + 36 >> 2] = HEAP32[$28 + 36 >> 2]; //@line 4983
   HEAP32[$4 + 40 >> 2] = HEAP32[$28 + 40 >> 2]; //@line 4987
   HEAP32[$4 + 12 >> 2] = HEAP32[$28 + 12 >> 2]; //@line 4991
   $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 4992
   _fclose($28) | 0; //@line 4993
   if (!___async) {
    ___async_unwind = 0; //@line 4996
   }
   HEAP32[$ReallocAsyncCtx4 >> 2] = 179; //@line 4998
   HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 5000
   HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 5002
   sp = STACKTOP; //@line 5003
   return;
  }
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5007
 _fclose($4) | 0; //@line 5008
 if (!___async) {
  ___async_unwind = 0; //@line 5011
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 181; //@line 5013
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 5015
 sp = STACKTOP; //@line 5016
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3035
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3037
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3041
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3043
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3045
 if (!(HEAP32[$0 + 8 >> 2] | 0)) {
  $25 = HEAP32[(HEAP32[$10 >> 2] | 0) + 84 >> 2] | 0; //@line 3050
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 3051
  FUNCTION_TABLE_vi[$25 & 255]($2); //@line 3052
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 3055
   $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 3056
   HEAP32[$26 >> 2] = $6; //@line 3057
   $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 3058
   HEAP32[$27 >> 2] = $6; //@line 3059
   sp = STACKTOP; //@line 3060
   return;
  }
  ___async_unwind = 0; //@line 3063
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 3064
  $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 3065
  HEAP32[$26 >> 2] = $6; //@line 3066
  $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 3067
  HEAP32[$27 >> 2] = $6; //@line 3068
  sp = STACKTOP; //@line 3069
  return;
 } else {
  $14 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 3074
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 3075
  $15 = FUNCTION_TABLE_ii[$14 & 31]($2) | 0; //@line 3076
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 51; //@line 3079
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3080
   HEAP32[$16 >> 2] = $6; //@line 3081
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3082
   HEAP32[$17 >> 2] = $6; //@line 3083
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3084
   HEAP32[$18 >> 2] = $8; //@line 3085
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3086
   HEAP32[$19 >> 2] = $10; //@line 3087
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 3088
   HEAP32[$20 >> 2] = $2; //@line 3089
   $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 3090
   HEAP32[$21 >> 2] = $2; //@line 3091
   sp = STACKTOP; //@line 3092
   return;
  }
  HEAP32[___async_retval >> 2] = $15; //@line 3096
  ___async_unwind = 0; //@line 3097
  HEAP32[$ReallocAsyncCtx2 >> 2] = 51; //@line 3098
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3099
  HEAP32[$16 >> 2] = $6; //@line 3100
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3101
  HEAP32[$17 >> 2] = $6; //@line 3102
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3103
  HEAP32[$18 >> 2] = $8; //@line 3104
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3105
  HEAP32[$19 >> 2] = $10; //@line 3106
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 3107
  HEAP32[$20 >> 2] = $2; //@line 3108
  $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 3109
  HEAP32[$21 >> 2] = $2; //@line 3110
  sp = STACKTOP; //@line 3111
  return;
 }
}
function ___fdopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $19 = 0, $2 = 0, $24 = 0, $29 = 0, $31 = 0, $8 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 8554
 STACKTOP = STACKTOP + 64 | 0; //@line 8555
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8555
 $vararg_buffer12 = sp + 40 | 0; //@line 8556
 $vararg_buffer7 = sp + 24 | 0; //@line 8557
 $vararg_buffer3 = sp + 16 | 0; //@line 8558
 $vararg_buffer = sp; //@line 8559
 $2 = sp + 56 | 0; //@line 8560
 if (!(_strchr(5831, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8567
  $$0 = 0; //@line 8568
 } else {
  $8 = _malloc(1156) | 0; //@line 8570
  if (!$8) {
   $$0 = 0; //@line 8573
  } else {
   _memset($8 | 0, 0, 124) | 0; //@line 8575
   if (!(_strchr($1, 43) | 0)) {
    HEAP32[$8 >> 2] = (HEAP8[$1 >> 0] | 0) == 114 ? 8 : 4; //@line 8582
   }
   if (_strchr($1, 101) | 0) {
    HEAP32[$vararg_buffer >> 2] = $0; //@line 8587
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 8589
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 8591
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 8592
   }
   if ((HEAP8[$1 >> 0] | 0) == 97) {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 8597
    HEAP32[$vararg_buffer3 + 4 >> 2] = 3; //@line 8599
    $19 = ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8600
    if (!($19 & 1024)) {
     HEAP32[$vararg_buffer7 >> 2] = $0; //@line 8605
     HEAP32[$vararg_buffer7 + 4 >> 2] = 4; //@line 8607
     HEAP32[$vararg_buffer7 + 8 >> 2] = $19 | 1024; //@line 8609
     ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 8610
    }
    $24 = HEAP32[$8 >> 2] | 128; //@line 8613
    HEAP32[$8 >> 2] = $24; //@line 8614
    $31 = $24; //@line 8615
   } else {
    $31 = HEAP32[$8 >> 2] | 0; //@line 8618
   }
   HEAP32[$8 + 60 >> 2] = $0; //@line 8621
   HEAP32[$8 + 44 >> 2] = $8 + 132; //@line 8624
   HEAP32[$8 + 48 >> 2] = 1024; //@line 8626
   $29 = $8 + 75 | 0; //@line 8627
   HEAP8[$29 >> 0] = -1; //@line 8628
   if (!($31 & 8)) {
    HEAP32[$vararg_buffer12 >> 2] = $0; //@line 8633
    HEAP32[$vararg_buffer12 + 4 >> 2] = 21523; //@line 8635
    HEAP32[$vararg_buffer12 + 8 >> 2] = $2; //@line 8637
    if (!(___syscall54(54, $vararg_buffer12 | 0) | 0)) {
     HEAP8[$29 >> 0] = 10; //@line 8641
    }
   }
   HEAP32[$8 + 32 >> 2] = 10; //@line 8645
   HEAP32[$8 + 36 >> 2] = 5; //@line 8647
   HEAP32[$8 + 40 >> 2] = 6; //@line 8649
   HEAP32[$8 + 12 >> 2] = 19; //@line 8651
   if (!(HEAP32[3389] | 0)) {
    HEAP32[$8 + 76 >> 2] = -1; //@line 8656
   }
   ___ofl_add($8) | 0; //@line 8658
   $$0 = $8; //@line 8659
  }
 }
 STACKTOP = sp; //@line 8662
 return $$0 | 0; //@line 8662
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_14($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1832
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1836
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1838
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1840
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1842
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1844
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1846
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1848
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1850
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1852
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 1855
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1857
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 1861
   $27 = $6 + 24 | 0; //@line 1862
   $28 = $4 + 8 | 0; //@line 1863
   $29 = $6 + 54 | 0; //@line 1864
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
    HEAP8[$10 >> 0] = 0; //@line 1894
    HEAP8[$14 >> 0] = 0; //@line 1895
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1896
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 1897
    if (!___async) {
     ___async_unwind = 0; //@line 1900
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 202; //@line 1902
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 1904
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 1906
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 1908
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1910
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1912
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1914
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1916
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 1918
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 1920
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 1922
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 1924
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 1926
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 1928
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 1931
    sp = STACKTOP; //@line 1932
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1937
 HEAP8[$14 >> 0] = $12; //@line 1938
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1716
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1720
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1722
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1724
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1726
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1728
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1730
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1732
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1734
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1736
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1738
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1740
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1742
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 1745
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1746
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
    HEAP8[$10 >> 0] = 0; //@line 1779
    HEAP8[$14 >> 0] = 0; //@line 1780
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1781
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 1782
    if (!___async) {
     ___async_unwind = 0; //@line 1785
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 202; //@line 1787
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 1789
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 1791
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1793
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1795
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1797
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1799
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1801
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 1803
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 1805
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 1807
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 1809
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 1811
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 1813
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 1816
    sp = STACKTOP; //@line 1817
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1822
 HEAP8[$14 >> 0] = $12; //@line 1823
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 7620
 }
 ret = dest | 0; //@line 7623
 dest_end = dest + num | 0; //@line 7624
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 7628
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7629
   dest = dest + 1 | 0; //@line 7630
   src = src + 1 | 0; //@line 7631
   num = num - 1 | 0; //@line 7632
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 7634
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 7635
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7637
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 7638
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 7639
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 7640
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 7641
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 7642
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 7643
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 7644
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 7645
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 7646
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 7647
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 7648
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 7649
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 7650
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 7651
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 7652
   dest = dest + 64 | 0; //@line 7653
   src = src + 64 | 0; //@line 7654
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7657
   dest = dest + 4 | 0; //@line 7658
   src = src + 4 | 0; //@line 7659
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 7663
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7665
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 7666
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 7667
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 7668
   dest = dest + 4 | 0; //@line 7669
   src = src + 4 | 0; //@line 7670
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7675
  dest = dest + 1 | 0; //@line 7676
  src = src + 1 | 0; //@line 7677
 }
 return ret | 0; //@line 7679
}
function __ZN4mbed6Stream4readEPvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$016$lcssa = 0, $$01617 = 0, $15 = 0, $16 = 0, $25 = 0, $29 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 587
 $3 = $1 + $2 | 0; //@line 588
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 591
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 592
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 593
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 50; //@line 596
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 598
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 600
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 602
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 604
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 606
  sp = STACKTOP; //@line 607
  return 0; //@line 608
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 610
 L4 : do {
  if (!$2) {
   $$016$lcssa = $1; //@line 614
  } else {
   $$01617 = $1; //@line 616
   while (1) {
    $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 620
    $AsyncCtx2 = _emscripten_alloc_async_context(28, sp) | 0; //@line 621
    $16 = FUNCTION_TABLE_ii[$15 & 31]($0) | 0; //@line 622
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 627
    if (($16 | 0) == -1) {
     $$016$lcssa = $$01617; //@line 630
     break L4;
    }
    $25 = $$01617 + 1 | 0; //@line 634
    HEAP8[$$01617 >> 0] = $16; //@line 635
    if (($25 | 0) == ($3 | 0)) {
     $$016$lcssa = $3; //@line 638
     break L4;
    } else {
     $$01617 = $25; //@line 641
    }
   }
   HEAP32[$AsyncCtx2 >> 2] = 51; //@line 644
   HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 646
   HEAP32[$AsyncCtx2 + 8 >> 2] = $$01617; //@line 648
   HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 650
   HEAP32[$AsyncCtx2 + 16 >> 2] = $0; //@line 652
   HEAP32[$AsyncCtx2 + 20 >> 2] = $0; //@line 654
   HEAP32[$AsyncCtx2 + 24 >> 2] = $0; //@line 656
   sp = STACKTOP; //@line 657
   return 0; //@line 658
  }
 } while (0);
 $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 663
 $AsyncCtx5 = _emscripten_alloc_async_context(12, sp) | 0; //@line 664
 FUNCTION_TABLE_vi[$29 & 255]($0); //@line 665
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 52; //@line 668
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$016$lcssa; //@line 670
  HEAP32[$AsyncCtx5 + 8 >> 2] = $1; //@line 672
  sp = STACKTOP; //@line 673
  return 0; //@line 674
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 676
  return $$016$lcssa - $1 | 0; //@line 680
 }
 return 0; //@line 682
}
function _main__async_cb_59($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 4556
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4558
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4560
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4562
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4564
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4566
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4568
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4570
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4572
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4574
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4576
 __ZN4mbed6Stream6printfEPKcz(8872, 5809, $2) | 0; //@line 4577
 __ZN6C128326locateEii(8872, 5, $6); //@line 4578
 __ZN4mbed6Stream6printfEPKcz(8872, 5815, $8) | 0; //@line 4579
 __ZN6C1283211copy_to_lcdEv(8872); //@line 4580
 $22 = $12 + 2 | 0; //@line 4581
 __ZN6C128326locateEii(8872, 5, $22); //@line 4583
 __ZN4mbed6Stream6printfEPKcz(8872, 5809, $14) | 0; //@line 4584
 $23 = $22 + 12 | 0; //@line 4585
 __ZN6C128326locateEii(8872, 5, $23); //@line 4586
 __ZN4mbed6Stream6printfEPKcz(8872, 5815, $18) | 0; //@line 4587
 __ZN6C1283211copy_to_lcdEv(8872); //@line 4588
 if (($22 | 0) < 5) {
  __ZN6C128326locateEii(8872, 5, $22); //@line 4590
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 4591
  _wait(.20000000298023224); //@line 4592
  if (!___async) {
   ___async_unwind = 0; //@line 4595
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 161; //@line 4597
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $2; //@line 4599
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $4; //@line 4601
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $23; //@line 4603
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $8; //@line 4605
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $10; //@line 4607
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = $22; //@line 4609
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $14; //@line 4611
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $16; //@line 4613
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $18; //@line 4615
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $20; //@line 4617
  sp = STACKTOP; //@line 4618
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4621
 _puts(5825) | 0; //@line 4622
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 4625
  sp = STACKTOP; //@line 4626
  return;
 }
 ___async_unwind = 0; //@line 4629
 HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 4630
 sp = STACKTOP; //@line 4631
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12844
 STACKTOP = STACKTOP + 64 | 0; //@line 12845
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12845
 $3 = sp; //@line 12846
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12849
 } else {
  if (!$1) {
   $$2 = 0; //@line 12853
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12855
   $6 = ___dynamic_cast($1, 232, 216, 0) | 0; //@line 12856
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 191; //@line 12859
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12861
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12863
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12865
    sp = STACKTOP; //@line 12866
    STACKTOP = sp; //@line 12867
    return 0; //@line 12867
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12869
   if (!$6) {
    $$2 = 0; //@line 12872
   } else {
    dest = $3 + 4 | 0; //@line 12875
    stop = dest + 52 | 0; //@line 12875
    do {
     HEAP32[dest >> 2] = 0; //@line 12875
     dest = dest + 4 | 0; //@line 12875
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12876
    HEAP32[$3 + 8 >> 2] = $0; //@line 12878
    HEAP32[$3 + 12 >> 2] = -1; //@line 12880
    HEAP32[$3 + 48 >> 2] = 1; //@line 12882
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12885
    $18 = HEAP32[$2 >> 2] | 0; //@line 12886
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12887
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 12888
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 192; //@line 12891
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12893
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12895
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12897
     sp = STACKTOP; //@line 12898
     STACKTOP = sp; //@line 12899
     return 0; //@line 12899
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12901
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12908
     $$0 = 1; //@line 12909
    } else {
     $$0 = 0; //@line 12911
    }
    $$2 = $$0; //@line 12913
   }
  }
 }
 STACKTOP = sp; //@line 12917
 return $$2 | 0; //@line 12917
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 12001
 STACKTOP = STACKTOP + 128 | 0; //@line 12002
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 12002
 $4 = sp + 124 | 0; //@line 12003
 $5 = sp; //@line 12004
 dest = $5; //@line 12005
 src = 1588; //@line 12005
 stop = dest + 124 | 0; //@line 12005
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 12005
  dest = dest + 4 | 0; //@line 12005
  src = src + 4 | 0; //@line 12005
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 12011
   $$015 = 1; //@line 12011
   label = 4; //@line 12012
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 12015
   $$0 = -1; //@line 12016
  }
 } else {
  $$014 = $0; //@line 12019
  $$015 = $1; //@line 12019
  label = 4; //@line 12020
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 12024
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 12026
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 12028
  $14 = $5 + 20 | 0; //@line 12029
  HEAP32[$14 >> 2] = $$014; //@line 12030
  HEAP32[$5 + 44 >> 2] = $$014; //@line 12032
  $16 = $$014 + $$$015 | 0; //@line 12033
  $17 = $5 + 16 | 0; //@line 12034
  HEAP32[$17 >> 2] = $16; //@line 12035
  HEAP32[$5 + 28 >> 2] = $16; //@line 12037
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 12038
  $19 = _vfprintf($5, $2, $3) | 0; //@line 12039
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 175; //@line 12042
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 12044
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 12046
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12048
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 12050
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 12052
   sp = STACKTOP; //@line 12053
   STACKTOP = sp; //@line 12054
   return 0; //@line 12054
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12056
  if (!$$$015) {
   $$0 = $19; //@line 12059
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 12061
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 12066
   $$0 = $19; //@line 12067
  }
 }
 STACKTOP = sp; //@line 12070
 return $$0 | 0; //@line 12070
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 14176
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 14182
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 14186
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 14187
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 14188
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 14189
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 208; //@line 14192
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 14194
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 14196
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 14198
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 14200
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 14202
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 14204
    sp = STACKTOP; //@line 14205
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 14208
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 14212
    $$0 = $0 + 24 | 0; //@line 14213
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 14215
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 14216
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 14221
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 14227
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 14230
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 209; //@line 14235
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 14237
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 14239
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 14241
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 14243
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 14245
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 14247
    sp = STACKTOP; //@line 14248
    return;
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1534
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1538
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1540
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1542
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1544
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1546
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1548
 $16 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1549
 if (($16 | 0) == ($4 | 0)) {
  return;
 }
 $25 = HEAPU16[((128 >>> ($16 & 7) & HEAP8[$6 + ($16 >> 3) >> 0] | 0) == 0 ? $8 : $10) >> 1] | 0; //@line 1564
 $28 = HEAP32[(HEAP32[$12 >> 2] | 0) + 136 >> 2] | 0; //@line 1567
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 1568
 FUNCTION_TABLE_vii[$28 & 7]($14, $25); //@line 1569
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 1572
  $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 1573
  HEAP32[$29 >> 2] = $16; //@line 1574
  $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 1575
  HEAP32[$30 >> 2] = $4; //@line 1576
  $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 1577
  HEAP32[$31 >> 2] = $6; //@line 1578
  $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 1579
  HEAP32[$32 >> 2] = $8; //@line 1580
  $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 1581
  HEAP32[$33 >> 2] = $10; //@line 1582
  $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 1583
  HEAP32[$34 >> 2] = $12; //@line 1584
  $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 1585
  HEAP32[$35 >> 2] = $14; //@line 1586
  sp = STACKTOP; //@line 1587
  return;
 }
 ___async_unwind = 0; //@line 1590
 HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 1591
 $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 1592
 HEAP32[$29 >> 2] = $16; //@line 1593
 $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 1594
 HEAP32[$30 >> 2] = $4; //@line 1595
 $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 1596
 HEAP32[$31 >> 2] = $6; //@line 1597
 $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 1598
 HEAP32[$32 >> 2] = $8; //@line 1599
 $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 1600
 HEAP32[$33 >> 2] = $10; //@line 1601
 $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 1602
 HEAP32[$34 >> 2] = $12; //@line 1603
 $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 1604
 HEAP32[$35 >> 2] = $14; //@line 1605
 sp = STACKTOP; //@line 1606
 return;
}
function __ZN4mbed6Stream5writeEPKvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$1 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $28 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 691
 $3 = $1 + $2 | 0; //@line 692
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 695
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 696
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 697
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 700
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 702
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 704
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 706
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 708
  sp = STACKTOP; //@line 709
  return 0; //@line 710
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 712
 $$0 = $1; //@line 713
 while (1) {
  if (($$0 | 0) == ($3 | 0)) {
   $$1 = $3; //@line 717
   break;
  }
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 722
  $15 = $$0 + 1 | 0; //@line 723
  $17 = HEAP8[$$0 >> 0] | 0; //@line 725
  $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 726
  $18 = FUNCTION_TABLE_iii[$14 & 7]($0, $17) | 0; //@line 727
  if (___async) {
   label = 6; //@line 730
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 733
  if (($18 | 0) == -1) {
   $$1 = $15; //@line 736
   break;
  } else {
   $$0 = $15; //@line 739
  }
 }
 if ((label | 0) == 6) {
  HEAP32[$AsyncCtx3 >> 2] = 54; //@line 743
  HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 745
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 747
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 749
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 751
  HEAP32[$AsyncCtx3 + 20 >> 2] = $1; //@line 753
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 755
  sp = STACKTOP; //@line 756
  return 0; //@line 757
 }
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 761
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 762
 FUNCTION_TABLE_vi[$28 & 255]($0); //@line 763
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 55; //@line 766
  HEAP32[$AsyncCtx7 + 4 >> 2] = $$1; //@line 768
  HEAP32[$AsyncCtx7 + 8 >> 2] = $1; //@line 770
  sp = STACKTOP; //@line 771
  return 0; //@line 772
 } else {
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 774
  return $$1 - $1 | 0; //@line 778
 }
 return 0; //@line 780
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $17 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1641
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1643
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1645
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1647
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1649
 HEAP32[$2 >> 2] = 532; //@line 1650
 HEAP32[$2 + 4 >> 2] = 692; //@line 1652
 $10 = $2 + 4172 | 0; //@line 1653
 HEAP32[$10 >> 2] = $4; //@line 1654
 $11 = $2 + 4176 | 0; //@line 1655
 HEAP32[$11 >> 2] = $6; //@line 1656
 $12 = $2 + 4180 | 0; //@line 1657
 HEAP32[$12 >> 2] = $8; //@line 1658
 _emscripten_asm_const_iiii(3, $4 | 0, $6 | 0, $8 | 0) | 0; //@line 1659
 HEAP32[$2 + 56 >> 2] = 1; //@line 1661
 HEAP32[$2 + 52 >> 2] = 0; //@line 1663
 HEAP32[$2 + 60 >> 2] = 0; //@line 1665
 $17 = $2 + 68 | 0; //@line 1666
 _memset($17 | 0, 0, 4096) | 0; //@line 1667
 $20 = HEAP32[(HEAP32[$2 >> 2] | 0) + 108 >> 2] | 0; //@line 1670
 $ReallocAsyncCtx = _emscripten_realloc_async_context(24) | 0; //@line 1671
 FUNCTION_TABLE_viii[$20 & 3]($2, 0, 0); //@line 1672
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 1675
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 1676
  HEAP32[$21 >> 2] = $2; //@line 1677
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 1678
  HEAP32[$22 >> 2] = $10; //@line 1679
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 1680
  HEAP32[$23 >> 2] = $11; //@line 1681
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 1682
  HEAP32[$24 >> 2] = $12; //@line 1683
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 1684
  HEAP32[$25 >> 2] = $17; //@line 1685
  sp = STACKTOP; //@line 1686
  return;
 }
 ___async_unwind = 0; //@line 1689
 HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 1690
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 1691
 HEAP32[$21 >> 2] = $2; //@line 1692
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 1693
 HEAP32[$22 >> 2] = $10; //@line 1694
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 1695
 HEAP32[$23 >> 2] = $11; //@line 1696
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 1697
 HEAP32[$24 >> 2] = $12; //@line 1698
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 1699
 HEAP32[$25 >> 2] = $17; //@line 1700
 sp = STACKTOP; //@line 1701
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12427
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 12432
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 12437
  } else {
   $20 = $0 & 255; //@line 12439
   $21 = $0 & 255; //@line 12440
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 12446
   } else {
    $26 = $1 + 20 | 0; //@line 12448
    $27 = HEAP32[$26 >> 2] | 0; //@line 12449
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 12455
     HEAP8[$27 >> 0] = $20; //@line 12456
     $34 = $21; //@line 12457
    } else {
     label = 12; //@line 12459
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12464
     $32 = ___overflow($1, $0) | 0; //@line 12465
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 183; //@line 12468
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12470
      sp = STACKTOP; //@line 12471
      return 0; //@line 12472
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12474
      $34 = $32; //@line 12475
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12480
   $$0 = $34; //@line 12481
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12486
   $8 = $0 & 255; //@line 12487
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12493
    $14 = HEAP32[$13 >> 2] | 0; //@line 12494
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12500
     HEAP8[$14 >> 0] = $7; //@line 12501
     $$0 = $8; //@line 12502
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12506
   $19 = ___overflow($1, $0) | 0; //@line 12507
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 182; //@line 12510
    sp = STACKTOP; //@line 12511
    return 0; //@line 12512
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12514
    $$0 = $19; //@line 12515
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12520
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 8332
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 8335
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 8338
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 8341
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 8347
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 8356
     $24 = $13 >>> 2; //@line 8357
     $$090 = 0; //@line 8358
     $$094 = $7; //@line 8358
     while (1) {
      $25 = $$094 >>> 1; //@line 8360
      $26 = $$090 + $25 | 0; //@line 8361
      $27 = $26 << 1; //@line 8362
      $28 = $27 + $23 | 0; //@line 8363
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 8366
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8370
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 8376
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 8384
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 8388
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 8394
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 8399
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 8402
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 8402
      }
     }
     $46 = $27 + $24 | 0; //@line 8405
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 8408
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8412
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 8424
     } else {
      $$4 = 0; //@line 8426
     }
    } else {
     $$4 = 0; //@line 8429
    }
   } else {
    $$4 = 0; //@line 8432
   }
  } else {
   $$4 = 0; //@line 8435
  }
 } while (0);
 return $$4 | 0; //@line 8438
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1458
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1464
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1466
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 1467
 if (($9 | 0) <= 0) {
  return;
 }
 $11 = $6 + 28 | 0; //@line 1472
 $12 = $6 + 30 | 0; //@line 1473
 $22 = HEAPU16[((128 >>> 0 & HEAP8[$8 + 0 >> 0] | 0) == 0 ? $12 : $11) >> 1] | 0; //@line 1484
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 1487
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 1488
 FUNCTION_TABLE_vii[$25 & 7]($6, $22); //@line 1489
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 1492
  $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 1493
  HEAP32[$26 >> 2] = 0; //@line 1494
  $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 1495
  HEAP32[$27 >> 2] = $9; //@line 1496
  $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 1497
  HEAP32[$28 >> 2] = $8; //@line 1498
  $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 1499
  HEAP32[$29 >> 2] = $12; //@line 1500
  $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 1501
  HEAP32[$30 >> 2] = $11; //@line 1502
  $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 1503
  HEAP32[$31 >> 2] = $6; //@line 1504
  $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 1505
  HEAP32[$32 >> 2] = $6; //@line 1506
  sp = STACKTOP; //@line 1507
  return;
 }
 ___async_unwind = 0; //@line 1510
 HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 1511
 $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 1512
 HEAP32[$26 >> 2] = 0; //@line 1513
 $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 1514
 HEAP32[$27 >> 2] = $9; //@line 1515
 $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 1516
 HEAP32[$28 >> 2] = $8; //@line 1517
 $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 1518
 HEAP32[$29 >> 2] = $12; //@line 1519
 $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 1520
 HEAP32[$30 >> 2] = $11; //@line 1521
 $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 1522
 HEAP32[$31 >> 2] = $6; //@line 1523
 $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 1524
 HEAP32[$32 >> 2] = $6; //@line 1525
 sp = STACKTOP; //@line 1526
 return;
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7959
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7964
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7969
  } else {
   $20 = $0 & 255; //@line 7971
   $21 = $0 & 255; //@line 7972
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7978
   } else {
    $26 = $1 + 20 | 0; //@line 7980
    $27 = HEAP32[$26 >> 2] | 0; //@line 7981
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7987
     HEAP8[$27 >> 0] = $20; //@line 7988
     $34 = $21; //@line 7989
    } else {
     label = 12; //@line 7991
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7996
     $32 = ___overflow($1, $0) | 0; //@line 7997
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 164; //@line 8000
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8002
      sp = STACKTOP; //@line 8003
      return 0; //@line 8004
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8006
      $34 = $32; //@line 8007
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 8012
   $$0 = $34; //@line 8013
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 8018
   $8 = $0 & 255; //@line 8019
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 8025
    $14 = HEAP32[$13 >> 2] | 0; //@line 8026
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 8032
     HEAP8[$14 >> 0] = $7; //@line 8033
     $$0 = $8; //@line 8034
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8038
   $19 = ___overflow($1, $0) | 0; //@line 8039
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 163; //@line 8042
    sp = STACKTOP; //@line 8043
    return 0; //@line 8044
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8046
    $$0 = $19; //@line 8047
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8052
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9035
 $1 = $0 + 20 | 0; //@line 9036
 $3 = $0 + 28 | 0; //@line 9038
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 9044
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9045
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 9046
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 172; //@line 9049
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9051
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 9053
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9055
    sp = STACKTOP; //@line 9056
    return 0; //@line 9057
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9059
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 9063
     break;
    } else {
     label = 5; //@line 9066
     break;
    }
   }
  } else {
   label = 5; //@line 9071
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 9075
  $14 = HEAP32[$13 >> 2] | 0; //@line 9076
  $15 = $0 + 8 | 0; //@line 9077
  $16 = HEAP32[$15 >> 2] | 0; //@line 9078
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 9086
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 9087
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 9088
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 173; //@line 9091
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 9093
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 9095
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 9097
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 9099
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 9101
     sp = STACKTOP; //@line 9102
     return 0; //@line 9103
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9105
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 9111
  HEAP32[$3 >> 2] = 0; //@line 9112
  HEAP32[$1 >> 2] = 0; //@line 9113
  HEAP32[$15 >> 2] = 0; //@line 9114
  HEAP32[$13 >> 2] = 0; //@line 9115
  $$0 = 0; //@line 9116
 }
 return $$0 | 0; //@line 9118
}
function _main__async_cb_51($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 4049
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4051
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4053
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4055
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4057
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4059
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4061
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4063
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4065
 __ZN6C1283211set_auto_upEj(8872, 0); //@line 4066
 __ZN6C128326locateEii(8872, 5, -20); //@line 4068
 __ZN4mbed6Stream6printfEPKcz(8872, 5809, $2) | 0; //@line 4069
 $18 = -20 + 12 | 0; //@line 4070
 __ZN6C128326locateEii(8872, 5, $18); //@line 4071
 __ZN4mbed6Stream6printfEPKcz(8872, 5815, $6) | 0; //@line 4072
 __ZN6C1283211copy_to_lcdEv(8872); //@line 4073
 if (-20 < 5) {
  __ZN6C128326locateEii(8872, 5, -20); //@line 4075
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 4076
  _wait(.20000000298023224); //@line 4077
  if (!___async) {
   ___async_unwind = 0; //@line 4080
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 161; //@line 4082
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $10; //@line 4084
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $12; //@line 4086
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $18; //@line 4088
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $14; //@line 4090
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $16; //@line 4092
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = -20; //@line 4094
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $2; //@line 4096
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $4; //@line 4098
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $6; //@line 4100
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $8; //@line 4102
  sp = STACKTOP; //@line 4103
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4106
 _puts(5825) | 0; //@line 4107
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 4110
  sp = STACKTOP; //@line 4111
  return;
 }
 ___async_unwind = 0; //@line 4114
 HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 4115
 sp = STACKTOP; //@line 4116
 return;
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 243
 HEAP32[$0 >> 2] = 328; //@line 244
 $1 = HEAP32[2211] | 0; //@line 245
 do {
  if (!$1) {
   HEAP32[2211] = 8848; //@line 249
  } else {
   if (($1 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 253
    _mbed_assert_internal(2308, 2328, 93); //@line 254
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 38; //@line 257
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 259
     sp = STACKTOP; //@line 260
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 263
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2210] | 0; //@line 274
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2210] = HEAP32[$0 + 4 >> 2]; //@line 279
    break;
   } else {
    $$0$i = $8; //@line 282
   }
   do {
    $12 = $$0$i + 4 | 0; //@line 285
    $$0$i = HEAP32[$12 >> 2] | 0; //@line 286
   } while (($$0$i | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 296
  }
 } while (0);
 $17 = HEAP32[2211] | 0; //@line 299
 do {
  if (!$17) {
   HEAP32[2211] = 8848; //@line 303
  } else {
   if (($17 | 0) != 8848) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 307
    _mbed_assert_internal(2308, 2328, 93); //@line 308
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 39; //@line 311
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 313
     sp = STACKTOP; //@line 314
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 317
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  __ZdlPv($0); //@line 327
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 331
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 332
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 40; //@line 335
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 337
  sp = STACKTOP; //@line 338
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 341
 __ZdlPv($0); //@line 342
 return;
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$019 = 0, $13 = 0, $15 = 0, $16 = 0, $26 = 0, $29 = 0, $37 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3212
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3215
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3216
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3217
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 127; //@line 3220
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3222
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3224
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3226
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3228
  sp = STACKTOP; //@line 3229
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3232
 $13 = Math_imul($4, $3) | 0; //@line 3233
 if (($13 | 0) <= 0) {
  return;
 }
 $15 = $0 + 28 | 0; //@line 3238
 $16 = $0 + 30 | 0; //@line 3239
 $$019 = 0; //@line 3240
 while (1) {
  $26 = HEAPU16[((128 >>> ($$019 & 7) & HEAP8[$5 + ($$019 >> 3) >> 0] | 0) == 0 ? $16 : $15) >> 1] | 0; //@line 3252
  $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3255
  $AsyncCtx3 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3256
  FUNCTION_TABLE_vii[$29 & 7]($0, $26); //@line 3257
  if (___async) {
   label = 7; //@line 3260
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3263
  $37 = $$019 + 1 | 0; //@line 3264
  if (($37 | 0) == ($13 | 0)) {
   label = 5; //@line 3267
   break;
  } else {
   $$019 = $37; //@line 3270
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 128; //@line 3277
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$019; //@line 3279
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 3281
  HEAP32[$AsyncCtx3 + 12 >> 2] = $5; //@line 3283
  HEAP32[$AsyncCtx3 + 16 >> 2] = $16; //@line 3285
  HEAP32[$AsyncCtx3 + 20 >> 2] = $15; //@line 3287
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3289
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 3291
  sp = STACKTOP; //@line 3292
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
 sp = STACKTOP; //@line 2569
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 2570
 __ZN15GraphicsDisplayC2EPKc($0, $6); //@line 2571
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 112; //@line 2574
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2576
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 2578
  HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 2580
  HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 2582
  sp = STACKTOP; //@line 2583
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2586
 HEAP32[$0 >> 2] = 532; //@line 2587
 HEAP32[$0 + 4 >> 2] = 692; //@line 2589
 $12 = $0 + 4172 | 0; //@line 2590
 HEAP32[$12 >> 2] = $1; //@line 2591
 $13 = $0 + 4176 | 0; //@line 2592
 HEAP32[$13 >> 2] = $3; //@line 2593
 $14 = $0 + 4180 | 0; //@line 2594
 HEAP32[$14 >> 2] = $2; //@line 2595
 _emscripten_asm_const_iiii(3, $1 | 0, $3 | 0, $2 | 0) | 0; //@line 2596
 HEAP32[$0 + 56 >> 2] = 1; //@line 2598
 HEAP32[$0 + 52 >> 2] = 0; //@line 2600
 HEAP32[$0 + 60 >> 2] = 0; //@line 2602
 $19 = $0 + 68 | 0; //@line 2603
 _memset($19 | 0, 0, 4096) | 0; //@line 2604
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 108 >> 2] | 0; //@line 2607
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 2608
 FUNCTION_TABLE_viii[$22 & 3]($0, 0, 0); //@line 2609
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 113; //@line 2612
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2614
  HEAP32[$AsyncCtx + 8 >> 2] = $12; //@line 2616
  HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 2618
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 2620
  HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 2622
  sp = STACKTOP; //@line 2623
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2626
  HEAP32[$0 + 48 >> 2] = 2574; //@line 2628
  _emscripten_asm_const_iiiii(2, HEAP32[$12 >> 2] | 0, HEAP32[$13 >> 2] | 0, HEAP32[$14 >> 2] | 0, $19 | 0) | 0; //@line 2632
  return;
 }
}
function __ZN4mbed6Stream4putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $15 = 0, $16 = 0, $21 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 943
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 946
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 947
 FUNCTION_TABLE_vi[$4 & 255]($0); //@line 948
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 60; //@line 951
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 953
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 955
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 957
  sp = STACKTOP; //@line 958
  return 0; //@line 959
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 961
 $9 = HEAP32[$0 + 20 >> 2] | 0; //@line 963
 $AsyncCtx9 = _emscripten_alloc_async_context(16, sp) | 0; //@line 964
 _fflush($9) | 0; //@line 965
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 61; //@line 968
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 970
  HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 972
  HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 974
  sp = STACKTOP; //@line 975
  return 0; //@line 976
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 978
 $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 981
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 982
 $16 = FUNCTION_TABLE_iii[$15 & 7]($0, $1) | 0; //@line 983
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 62; //@line 986
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 988
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 990
  sp = STACKTOP; //@line 991
  return 0; //@line 992
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 994
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 997
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 998
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 999
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 63; //@line 1002
  HEAP32[$AsyncCtx5 + 4 >> 2] = $16; //@line 1004
  sp = STACKTOP; //@line 1005
  return 0; //@line 1006
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1008
  return $16 | 0; //@line 1009
 }
 return 0; //@line 1011
}
function _fclose($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $15 = 0, $21 = 0, $25 = 0, $27 = 0, $28 = 0, $33 = 0, $35 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8801
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $25 = ___lockfile($0) | 0; //@line 8807
 } else {
  $25 = 0; //@line 8809
 }
 ___unlist_locked_file($0); //@line 8811
 $7 = (HEAP32[$0 >> 2] & 1 | 0) != 0; //@line 8814
 if (!$7) {
  $8 = ___ofl_lock() | 0; //@line 8816
  $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 8818
  $$pre = $0 + 56 | 0; //@line 8821
  if ($10 | 0) {
   HEAP32[$10 + 56 >> 2] = HEAP32[$$pre >> 2]; //@line 8825
  }
  $15 = HEAP32[$$pre >> 2] | 0; //@line 8827
  if ($15 | 0) {
   HEAP32[$15 + 52 >> 2] = $10; //@line 8832
  }
  if ((HEAP32[$8 >> 2] | 0) == ($0 | 0)) {
   HEAP32[$8 >> 2] = $15; //@line 8837
  }
  ___ofl_unlock(); //@line 8839
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 8841
 $21 = _fflush($0) | 0; //@line 8842
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 166; //@line 8845
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8847
  HEAP8[$AsyncCtx3 + 8 >> 0] = $7 & 1; //@line 8850
  HEAP32[$AsyncCtx3 + 12 >> 2] = $25; //@line 8852
  sp = STACKTOP; //@line 8853
  return 0; //@line 8854
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8856
 $27 = HEAP32[$0 + 12 >> 2] | 0; //@line 8858
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 8859
 $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 8860
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 167; //@line 8863
  HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 8865
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8867
  HEAP8[$AsyncCtx + 12 >> 0] = $7 & 1; //@line 8870
  HEAP32[$AsyncCtx + 16 >> 2] = $25; //@line 8872
  sp = STACKTOP; //@line 8873
  return 0; //@line 8874
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 8876
 $33 = $28 | $21; //@line 8877
 $35 = HEAP32[$0 + 92 >> 2] | 0; //@line 8879
 if ($35 | 0) {
  _free($35); //@line 8882
 }
 if ($7) {
  if ($25 | 0) {
   ___unlockfile($0); //@line 8887
  }
 } else {
  _free($0); //@line 8890
 }
 return $33 | 0; //@line 8892
}
function __ZN6C128325_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $14 = 0, $15 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1988
 if (($1 | 0) == 10) {
  HEAP32[$0 + 60 >> 2] = 0; //@line 1992
  $4 = $0 + 64 | 0; //@line 1993
  $6 = $0 + 48 | 0; //@line 1995
  $11 = (HEAP32[$4 >> 2] | 0) + (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0; //@line 2000
  HEAP32[$4 >> 2] = $11; //@line 2001
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 2004
  $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2005
  $15 = FUNCTION_TABLE_ii[$14 & 31]($0) | 0; //@line 2006
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 102; //@line 2009
   HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 2011
   HEAP32[$AsyncCtx + 8 >> 2] = $11; //@line 2013
   HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2015
   HEAP32[$AsyncCtx + 16 >> 2] = $4; //@line 2017
   sp = STACKTOP; //@line 2018
   return 0; //@line 2019
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2021
  if ($11 >>> 0 < ($15 - (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
   return $1 | 0; //@line 2029
  }
  HEAP32[$4 >> 2] = 0; //@line 2031
  return $1 | 0; //@line 2032
 } else {
  $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 2036
  $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2038
  $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 2040
  $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2041
  FUNCTION_TABLE_viiii[$28 & 7]($0, $30, $32, $1); //@line 2042
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 103; //@line 2045
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2047
   HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 2049
   sp = STACKTOP; //@line 2050
   return 0; //@line 2051
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2053
  if (!(HEAP32[$0 + 4168 >> 2] | 0)) {
   return $1 | 0; //@line 2058
  }
  _emscripten_asm_const_iiiii(2, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 2067
  return $1 | 0; //@line 2068
 }
 return 0; //@line 2070
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 141
 HEAP32[$0 >> 2] = 328; //@line 142
 $1 = HEAP32[2211] | 0; //@line 143
 do {
  if (!$1) {
   HEAP32[2211] = 8848; //@line 147
  } else {
   if (($1 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 151
    _mbed_assert_internal(2308, 2328, 93); //@line 152
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 35; //@line 155
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 157
     sp = STACKTOP; //@line 158
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 161
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2210] | 0; //@line 172
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2210] = HEAP32[$0 + 4 >> 2]; //@line 177
    break;
   } else {
    $$0 = $8; //@line 180
   }
   do {
    $12 = $$0 + 4 | 0; //@line 183
    $$0 = HEAP32[$12 >> 2] | 0; //@line 184
   } while (($$0 | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 194
  }
 } while (0);
 $17 = HEAP32[2211] | 0; //@line 197
 do {
  if (!$17) {
   HEAP32[2211] = 8848; //@line 201
  } else {
   if (($17 | 0) != 8848) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 205
    _mbed_assert_internal(2308, 2328, 93); //@line 206
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 36; //@line 209
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 211
     sp = STACKTOP; //@line 212
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 215
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 228
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 229
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 37; //@line 232
  sp = STACKTOP; //@line 233
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 236
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $$09$i = 0, $1 = 0, $12 = 0, $18 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1495
 STACKTOP = STACKTOP + 144 | 0; //@line 1496
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 1496
 $1 = sp + 16 | 0; //@line 1497
 $2 = sp; //@line 1498
 HEAP32[$2 >> 2] = $varargs; //@line 1499
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1500
 $3 = _vsnprintf($1, 128, $0, $2) | 0; //@line 1501
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 86; //@line 1504
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1506
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1508
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1510
  sp = STACKTOP; //@line 1511
  STACKTOP = sp; //@line 1512
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1514
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1517
  return;
 }
 if (!(HEAP32[2213] | 0)) {
  _serial_init(8856, 2, 3); //@line 1522
  $$09$i = 0; //@line 1523
 } else {
  $$09$i = 0; //@line 1525
 }
 while (1) {
  $12 = HEAP8[$1 + $$09$i >> 0] | 0; //@line 1530
  $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1531
  _serial_putc(8856, $12); //@line 1532
  if (___async) {
   label = 7; //@line 1535
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1538
  $18 = $$09$i + 1 | 0; //@line 1539
  if (($18 | 0) == ($3 | 0)) {
   label = 9; //@line 1542
   break;
  } else {
   $$09$i = $18; //@line 1545
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 87; //@line 1549
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09$i; //@line 1551
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 1553
  HEAP32[$AsyncCtx2 + 12 >> 2] = $1; //@line 1555
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 1557
  HEAP32[$AsyncCtx2 + 20 >> 2] = $1; //@line 1559
  sp = STACKTOP; //@line 1560
  STACKTOP = sp; //@line 1561
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 1564
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8701
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8707
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8713
   } else {
    $7 = $1 & 255; //@line 8715
    $$03039 = $0; //@line 8716
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8718
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8723
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8726
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8731
      break;
     } else {
      $$03039 = $13; //@line 8734
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8738
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8739
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8747
     $25 = $18; //@line 8747
     while (1) {
      $24 = $25 ^ $17; //@line 8749
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8756
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8759
      $25 = HEAP32[$31 >> 2] | 0; //@line 8760
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8769
       break;
      } else {
       $$02936 = $31; //@line 8767
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8774
    }
   } while (0);
   $38 = $1 & 255; //@line 8777
   $$1 = $$029$lcssa; //@line 8778
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8780
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8786
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8789
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8794
}
function __ZN4mbed8FileBaseD0Ev__async_cb_80($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $23 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5792
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5794
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2210] | 0; //@line 5800
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2210] = HEAP32[$2 + 4 >> 2]; //@line 5805
    break;
   } else {
    $$0$i = $6; //@line 5808
   }
   do {
    $10 = $$0$i + 4 | 0; //@line 5811
    $$0$i = HEAP32[$10 >> 2] | 0; //@line 5812
   } while (($$0$i | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 5822
  }
 } while (0);
 $15 = HEAP32[2211] | 0; //@line 5825
 if (!$15) {
  HEAP32[2211] = 8848; //@line 5828
 } else {
  if (($15 | 0) != 8848) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5832
   _mbed_assert_internal(2308, 2328, 93); //@line 5833
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 39; //@line 5836
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 5837
    HEAP32[$18 >> 2] = $2; //@line 5838
    sp = STACKTOP; //@line 5839
    return;
   }
   ___async_unwind = 0; //@line 5842
   HEAP32[$ReallocAsyncCtx >> 2] = 39; //@line 5843
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 5844
   HEAP32[$18 >> 2] = $2; //@line 5845
   sp = STACKTOP; //@line 5846
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 5854
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5858
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 5859
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 5862
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 5863
  HEAP32[$23 >> 2] = $2; //@line 5864
  sp = STACKTOP; //@line 5865
  return;
 }
 ___async_unwind = 0; //@line 5868
 HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 5869
 $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 5870
 HEAP32[$23 >> 2] = $2; //@line 5871
 sp = STACKTOP; //@line 5872
 return;
}
function _main__async_cb_61($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx7 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4695
 STACKTOP = STACKTOP + 16 | 0; //@line 4696
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4696
 $bitmSan2$byval_copy = sp; //@line 4697
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4699
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4701
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4703
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4705
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4707
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4709
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4711
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4713
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4715
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4717
 __ZN6C1283211copy_to_lcdEv(8872); //@line 4718
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(40) | 0; //@line 4719
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[263]; //@line 4720
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[264]; //@line 4720
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[265]; //@line 4720
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[266]; //@line 4720
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan2$byval_copy, $20, 2); //@line 4721
 if (!___async) {
  ___async_unwind = 0; //@line 4724
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 156; //@line 4726
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 4728
 HEAP32[$ReallocAsyncCtx7 + 8 >> 2] = $4; //@line 4730
 HEAP32[$ReallocAsyncCtx7 + 12 >> 2] = $6; //@line 4732
 HEAP32[$ReallocAsyncCtx7 + 16 >> 2] = $8; //@line 4734
 HEAP32[$ReallocAsyncCtx7 + 20 >> 2] = $10; //@line 4736
 HEAP32[$ReallocAsyncCtx7 + 24 >> 2] = $12; //@line 4738
 HEAP32[$ReallocAsyncCtx7 + 28 >> 2] = $14; //@line 4740
 HEAP32[$ReallocAsyncCtx7 + 32 >> 2] = $16; //@line 4742
 HEAP32[$ReallocAsyncCtx7 + 36 >> 2] = $18; //@line 4744
 sp = STACKTOP; //@line 4745
 STACKTOP = sp; //@line 4746
 return;
}
function _main__async_cb_60($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4638
 STACKTOP = STACKTOP + 16 | 0; //@line 4639
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4639
 $bitmSan3$byval_copy = sp; //@line 4640
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4642
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4644
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4646
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4648
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4650
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4652
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4654
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4656
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4658
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4660
 __ZN6C1283211copy_to_lcdEv(8872); //@line 4661
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(40) | 0; //@line 4662
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 4663
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 4663
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 4663
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 4663
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy, $18, 2); //@line 4664
 if (!___async) {
  ___async_unwind = 0; //@line 4667
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 159; //@line 4669
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 4671
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 4673
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 4675
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 4677
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 4679
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 4681
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 4683
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 4685
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 4687
 sp = STACKTOP; //@line 4688
 STACKTOP = sp; //@line 4689
 return;
}
function _main__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4394
 STACKTOP = STACKTOP + 16 | 0; //@line 4395
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4395
 $bitmSan2$byval_copy = sp; //@line 4396
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4398
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4400
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4402
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4404
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4406
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4408
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4410
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4412
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4414
 $19 = $2 + 3 | 0; //@line 4415
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(44) | 0; //@line 4416
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[263]; //@line 4417
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[264]; //@line 4417
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[265]; //@line 4417
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[266]; //@line 4417
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan2$byval_copy, $19, 2); //@line 4418
 if (!___async) {
  ___async_unwind = 0; //@line 4421
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 154; //@line 4423
 HEAP32[$ReallocAsyncCtx8 + 4 >> 2] = $2; //@line 4425
 HEAP32[$ReallocAsyncCtx8 + 8 >> 2] = $4; //@line 4427
 HEAP32[$ReallocAsyncCtx8 + 12 >> 2] = $6; //@line 4429
 HEAP32[$ReallocAsyncCtx8 + 16 >> 2] = $8; //@line 4431
 HEAP32[$ReallocAsyncCtx8 + 20 >> 2] = $10; //@line 4433
 HEAP32[$ReallocAsyncCtx8 + 24 >> 2] = $12; //@line 4435
 HEAP32[$ReallocAsyncCtx8 + 28 >> 2] = $14; //@line 4437
 HEAP32[$ReallocAsyncCtx8 + 32 >> 2] = $16; //@line 4439
 HEAP32[$ReallocAsyncCtx8 + 36 >> 2] = $18; //@line 4441
 HEAP32[$ReallocAsyncCtx8 + 40 >> 2] = $19; //@line 4443
 sp = STACKTOP; //@line 4444
 STACKTOP = sp; //@line 4445
 return;
}
function _main__async_cb_54($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4282
 STACKTOP = STACKTOP + 16 | 0; //@line 4283
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4283
 $bitmSan3$byval_copy = sp; //@line 4284
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4286
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4288
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4290
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4292
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4294
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4296
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4298
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4300
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4302
 $19 = $2 + 6 | 0; //@line 4303
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(44) | 0; //@line 4304
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 4305
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 4305
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 4305
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 4305
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan3$byval_copy, $19, 2); //@line 4306
 if (!___async) {
  ___async_unwind = 0; //@line 4309
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 157; //@line 4311
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $19; //@line 4313
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $4; //@line 4315
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $6; //@line 4317
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $8; //@line 4319
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $10; //@line 4321
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $12; //@line 4323
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $14; //@line 4325
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $16; //@line 4327
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $18; //@line 4329
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $2; //@line 4331
 sp = STACKTOP; //@line 4332
 STACKTOP = sp; //@line 4333
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 8223
 $4 = HEAP32[$3 >> 2] | 0; //@line 8224
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 8231
   label = 5; //@line 8232
  } else {
   $$1 = 0; //@line 8234
  }
 } else {
  $12 = $4; //@line 8238
  label = 5; //@line 8239
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 8243
   $10 = HEAP32[$9 >> 2] | 0; //@line 8244
   $14 = $10; //@line 8247
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 8252
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 8260
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 8264
       $$141 = $0; //@line 8264
       $$143 = $1; //@line 8264
       $31 = $14; //@line 8264
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 8267
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 8274
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 8279
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 8282
      break L5;
     }
     $$139 = $$038; //@line 8288
     $$141 = $0 + $$038 | 0; //@line 8288
     $$143 = $1 - $$038 | 0; //@line 8288
     $31 = HEAP32[$9 >> 2] | 0; //@line 8288
    } else {
     $$139 = 0; //@line 8290
     $$141 = $0; //@line 8290
     $$143 = $1; //@line 8290
     $31 = $14; //@line 8290
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 8293
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 8296
   $$1 = $$139 + $$143 | 0; //@line 8298
  }
 } while (0);
 return $$1 | 0; //@line 8301
}
function _main__async_cb_58($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4502
 STACKTOP = STACKTOP + 16 | 0; //@line 4503
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4503
 $bitmSan1$byval_copy = sp; //@line 4504
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4506
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4508
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4510
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4512
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4514
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4516
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4518
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4520
 __ZN6C1283211copy_to_lcdEv(8872); //@line 4521
 __ZN6C128327setmodeEi(8872, 1); //@line 4522
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 4523
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[259]; //@line 4524
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[260]; //@line 4524
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[261]; //@line 4524
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[262]; //@line 4524
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan1$byval_copy, -15, 2); //@line 4525
 if (!___async) {
  ___async_unwind = 0; //@line 4528
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 151; //@line 4530
 HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = -15; //@line 4532
 HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $2; //@line 4534
 HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $4; //@line 4536
 HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $6; //@line 4538
 HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $8; //@line 4540
 HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $10; //@line 4542
 HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $12; //@line 4544
 HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $14; //@line 4546
 HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $16; //@line 4548
 sp = STACKTOP; //@line 4549
 STACKTOP = sp; //@line 4550
 return;
}
function _main__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx9 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4752
 STACKTOP = STACKTOP + 16 | 0; //@line 4753
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4753
 $bitmSan1$byval_copy = sp; //@line 4754
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4756
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4758
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4760
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4762
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4764
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4766
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4768
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4770
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4772
 __ZN6C1283211copy_to_lcdEv(8872); //@line 4773
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(40) | 0; //@line 4774
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[259]; //@line 4775
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[260]; //@line 4775
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[261]; //@line 4775
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[262]; //@line 4775
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmSan1$byval_copy, $2, 2); //@line 4776
 if (!___async) {
  ___async_unwind = 0; //@line 4779
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 153; //@line 4781
 HEAP32[$ReallocAsyncCtx9 + 4 >> 2] = $2; //@line 4783
 HEAP32[$ReallocAsyncCtx9 + 8 >> 2] = $4; //@line 4785
 HEAP32[$ReallocAsyncCtx9 + 12 >> 2] = $6; //@line 4787
 HEAP32[$ReallocAsyncCtx9 + 16 >> 2] = $8; //@line 4789
 HEAP32[$ReallocAsyncCtx9 + 20 >> 2] = $10; //@line 4791
 HEAP32[$ReallocAsyncCtx9 + 24 >> 2] = $12; //@line 4793
 HEAP32[$ReallocAsyncCtx9 + 28 >> 2] = $14; //@line 4795
 HEAP32[$ReallocAsyncCtx9 + 32 >> 2] = $16; //@line 4797
 HEAP32[$ReallocAsyncCtx9 + 36 >> 2] = $18; //@line 4799
 sp = STACKTOP; //@line 4800
 STACKTOP = sp; //@line 4801
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
 sp = STACKTOP; //@line 3133
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3136
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3137
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3138
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 125; //@line 3141
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3143
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3145
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3147
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3149
  sp = STACKTOP; //@line 3150
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3153
 $13 = Math_imul($4, $3) | 0; //@line 3154
 if (($13 | 0) <= 0) {
  return;
 }
 $$011 = 0; //@line 3159
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3163
  $19 = HEAP32[$5 + ($$011 << 2) >> 2] | 0; //@line 3165
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3166
  FUNCTION_TABLE_vii[$17 & 7]($0, $19); //@line 3167
  if (___async) {
   label = 7; //@line 3170
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3173
  $25 = $$011 + 1 | 0; //@line 3174
  if (($25 | 0) == ($13 | 0)) {
   label = 5; //@line 3177
   break;
  } else {
   $$011 = $25; //@line 3180
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 126; //@line 3187
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$011; //@line 3189
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 3191
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 3193
  HEAP32[$AsyncCtx3 + 16 >> 2] = $5; //@line 3195
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 3197
  sp = STACKTOP; //@line 3198
  return;
 }
}
function __ZN4mbed6StreamC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 883
 STACKTOP = STACKTOP + 16 | 0; //@line 884
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 884
 $vararg_buffer = sp; //@line 885
 HEAP32[$0 >> 2] = 344; //@line 886
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 888
 __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0 + 4 | 0, $1, 0); //@line 889
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 58; //@line 892
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 894
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 896
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 898
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 900
  sp = STACKTOP; //@line 901
  STACKTOP = sp; //@line 902
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 904
 HEAP32[$0 >> 2] = 420; //@line 905
 HEAP32[$0 + 4 >> 2] = 516; //@line 907
 $8 = $0 + 20 | 0; //@line 908
 HEAP32[$8 >> 2] = 0; //@line 909
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 910
 $9 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, 2062) | 0; //@line 911
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 914
  HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 916
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 918
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 920
  sp = STACKTOP; //@line 921
  STACKTOP = sp; //@line 922
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 924
 HEAP32[$8 >> 2] = $9; //@line 925
 if (!$9) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 930
  _error(2065, $vararg_buffer); //@line 931
  STACKTOP = sp; //@line 932
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($9); //@line 934
  STACKTOP = sp; //@line 935
  return;
 }
}
function __ZN11TextDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $13 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3757
 STACKTOP = STACKTOP + 16 | 0; //@line 3758
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3758
 $vararg_buffer = sp; //@line 3759
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3760
 __ZN4mbed6StreamC2EPKc($0, $1); //@line 3761
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 145; //@line 3764
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3766
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3768
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 3770
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 3772
  sp = STACKTOP; //@line 3773
  STACKTOP = sp; //@line 3774
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3776
 HEAP32[$0 >> 2] = 884; //@line 3777
 HEAP32[$0 + 4 >> 2] = 1012; //@line 3779
 HEAP16[$0 + 26 >> 1] = 0; //@line 3781
 HEAP16[$0 + 24 >> 1] = 0; //@line 3783
 if (!$1) {
  HEAP32[$0 + 32 >> 2] = 0; //@line 3787
  STACKTOP = sp; //@line 3788
  return;
 }
 $12 = (_strlen($1) | 0) + 2 | 0; //@line 3791
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3792
 $13 = __Znaj($12) | 0; //@line 3793
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 146; //@line 3796
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3798
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 3800
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 3802
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 3804
  sp = STACKTOP; //@line 3805
  STACKTOP = sp; //@line 3806
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3808
 HEAP32[$0 + 32 >> 2] = $13; //@line 3810
 HEAP32[$vararg_buffer >> 2] = $1; //@line 3811
 _sprintf($13, 5339, $vararg_buffer) | 0; //@line 3812
 STACKTOP = sp; //@line 3813
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2529
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2533
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2535
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2537
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2539
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2540
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 2547
 $16 = HEAP32[$8 + ($15 << 2) >> 2] | 0; //@line 2549
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2550
 FUNCTION_TABLE_vii[$13 & 7]($10, $16); //@line 2551
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 126; //@line 2554
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2555
  HEAP32[$17 >> 2] = $15; //@line 2556
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2557
  HEAP32[$18 >> 2] = $4; //@line 2558
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2559
  HEAP32[$19 >> 2] = $6; //@line 2560
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2561
  HEAP32[$20 >> 2] = $8; //@line 2562
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2563
  HEAP32[$21 >> 2] = $10; //@line 2564
  sp = STACKTOP; //@line 2565
  return;
 }
 ___async_unwind = 0; //@line 2568
 HEAP32[$ReallocAsyncCtx2 >> 2] = 126; //@line 2569
 $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2570
 HEAP32[$17 >> 2] = $15; //@line 2571
 $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2572
 HEAP32[$18 >> 2] = $4; //@line 2573
 $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2574
 HEAP32[$19 >> 2] = $6; //@line 2575
 $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2576
 HEAP32[$20 >> 2] = $8; //@line 2577
 $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2578
 HEAP32[$21 >> 2] = $10; //@line 2579
 sp = STACKTOP; //@line 2580
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
 sp = STACKTOP; //@line 3057
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3060
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3061
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3062
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 123; //@line 3065
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3067
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3069
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3071
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3073
  sp = STACKTOP; //@line 3074
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3077
 $13 = Math_imul($4, $3) | 0; //@line 3078
 if (($13 | 0) <= 0) {
  return;
 }
 $$010 = 0; //@line 3083
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3087
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3088
  FUNCTION_TABLE_vii[$17 & 7]($0, $5); //@line 3089
  if (___async) {
   label = 7; //@line 3092
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3095
  $23 = $$010 + 1 | 0; //@line 3096
  if (($23 | 0) == ($13 | 0)) {
   label = 5; //@line 3099
   break;
  } else {
   $$010 = $23; //@line 3102
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 124; //@line 3109
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$010; //@line 3111
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 3113
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 3115
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 3117
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 3119
  sp = STACKTOP; //@line 3120
  return;
 }
}
function _main__async_cb_49($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx11 = 0, $bitmTree$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3951
 STACKTOP = STACKTOP + 16 | 0; //@line 3952
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3952
 $bitmTree$byval_copy = sp; //@line 3953
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3955
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3957
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3959
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3961
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3963
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3965
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3967
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3969
 __ZN6C128323clsEv(8872); //@line 3970
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(36) | 0; //@line 3971
 HEAP32[$bitmTree$byval_copy >> 2] = HEAP32[255]; //@line 3972
 HEAP32[$bitmTree$byval_copy + 4 >> 2] = HEAP32[256]; //@line 3972
 HEAP32[$bitmTree$byval_copy + 8 >> 2] = HEAP32[257]; //@line 3972
 HEAP32[$bitmTree$byval_copy + 12 >> 2] = HEAP32[258]; //@line 3972
 __ZN6C128328print_bmE6Bitmapii(8872, $bitmTree$byval_copy, 95, 0); //@line 3973
 if (!___async) {
  ___async_unwind = 0; //@line 3976
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 150; //@line 3978
 HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $2; //@line 3980
 HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $4; //@line 3982
 HEAP32[$ReallocAsyncCtx11 + 12 >> 2] = $6; //@line 3984
 HEAP32[$ReallocAsyncCtx11 + 16 >> 2] = $8; //@line 3986
 HEAP32[$ReallocAsyncCtx11 + 20 >> 2] = $10; //@line 3988
 HEAP32[$ReallocAsyncCtx11 + 24 >> 2] = $12; //@line 3990
 HEAP32[$ReallocAsyncCtx11 + 28 >> 2] = $14; //@line 3992
 HEAP32[$ReallocAsyncCtx11 + 32 >> 2] = $16; //@line 3994
 sp = STACKTOP; //@line 3995
 STACKTOP = sp; //@line 3996
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6624
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6628
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6630
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6632
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6634
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6636
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6638
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6640
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 6643
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6644
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 6660
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 6661
    if (!___async) {
     ___async_unwind = 0; //@line 6664
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 206; //@line 6666
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 6668
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 6670
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 6672
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 6674
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 6676
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 6678
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 6680
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 6682
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 6685
    sp = STACKTOP; //@line 6686
    return;
   }
  }
 } while (0);
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$09 = 0, $11 = 0, $16 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1572
 STACKTOP = STACKTOP + 128 | 0; //@line 1573
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1573
 $2 = sp; //@line 1574
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1575
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1576
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 1579
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1581
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1583
  sp = STACKTOP; //@line 1584
  STACKTOP = sp; //@line 1585
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1587
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1590
  return;
 }
 if (!(HEAP32[2213] | 0)) {
  _serial_init(8856, 2, 3); //@line 1595
  $$09 = 0; //@line 1596
 } else {
  $$09 = 0; //@line 1598
 }
 while (1) {
  $11 = HEAP8[$2 + $$09 >> 0] | 0; //@line 1603
  $AsyncCtx2 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1604
  _serial_putc(8856, $11); //@line 1605
  if (___async) {
   label = 7; //@line 1608
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1611
  $16 = $$09 + 1 | 0; //@line 1612
  if (($16 | 0) == ($3 | 0)) {
   label = 9; //@line 1615
   break;
  } else {
   $$09 = $16; //@line 1618
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 89; //@line 1622
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09; //@line 1624
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 1626
  HEAP32[$AsyncCtx2 + 12 >> 2] = $2; //@line 1628
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 1630
  sp = STACKTOP; //@line 1631
  STACKTOP = sp; //@line 1632
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 1635
  return;
 }
}
function ___dup3($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$sink = 0, $5 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12140
 STACKTOP = STACKTOP + 48 | 0; //@line 12141
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12141
 $vararg_buffer7 = sp + 24 | 0; //@line 12142
 $vararg_buffer3 = sp + 16 | 0; //@line 12143
 $vararg_buffer = sp; //@line 12144
 L1 : do {
  if (($0 | 0) == ($1 | 0)) {
   $$sink = -22; //@line 12148
  } else {
   $5 = ($2 & 524288 | 0) != 0; //@line 12151
   L3 : do {
    if ($5) {
     while (1) {
      HEAP32[$vararg_buffer >> 2] = $0; //@line 12155
      HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 12157
      HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 12159
      $6 = ___syscall330(330, $vararg_buffer | 0) | 0; //@line 12160
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
        $$sink = $6; //@line 12170
        break L1;
       }
      }
     }
    }
   } while (0);
   do {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 12178
    HEAP32[$vararg_buffer3 + 4 >> 2] = $1; //@line 12180
    $7 = ___syscall63(63, $vararg_buffer3 | 0) | 0; //@line 12181
   } while (($7 | 0) == -16);
   if ($5) {
    HEAP32[$vararg_buffer7 >> 2] = $1; //@line 12188
    HEAP32[$vararg_buffer7 + 4 >> 2] = 2; //@line 12190
    HEAP32[$vararg_buffer7 + 8 >> 2] = 1; //@line 12192
    ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 12193
    $$sink = $7; //@line 12194
   } else {
    $$sink = $7; //@line 12196
   }
  }
 } while (0);
 $9 = ___syscall_ret($$sink) | 0; //@line 12200
 STACKTOP = sp; //@line 12201
 return $9 | 0; //@line 12201
}
function __ZN4mbed8FileBaseD2Ev__async_cb_90($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6409
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6411
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2210] | 0; //@line 6417
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2210] = HEAP32[$2 + 4 >> 2]; //@line 6422
    break;
   } else {
    $$0 = $6; //@line 6425
   }
   do {
    $10 = $$0 + 4 | 0; //@line 6428
    $$0 = HEAP32[$10 >> 2] | 0; //@line 6429
   } while (($$0 | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 6439
  }
 } while (0);
 $15 = HEAP32[2211] | 0; //@line 6442
 if (!$15) {
  HEAP32[2211] = 8848; //@line 6445
 } else {
  if (($15 | 0) != 8848) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 6449
   _mbed_assert_internal(2308, 2328, 93); //@line 6450
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 36; //@line 6453
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 6454
    HEAP32[$18 >> 2] = $2; //@line 6455
    sp = STACKTOP; //@line 6456
    return;
   }
   ___async_unwind = 0; //@line 6459
   HEAP32[$ReallocAsyncCtx >> 2] = 36; //@line 6460
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 6461
   HEAP32[$18 >> 2] = $2; //@line 6462
   sp = STACKTOP; //@line 6463
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6474
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 6475
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 37; //@line 6478
  sp = STACKTOP; //@line 6479
  return;
 }
 ___async_unwind = 0; //@line 6482
 HEAP32[$ReallocAsyncCtx3 >> 2] = 37; //@line 6483
 sp = STACKTOP; //@line 6484
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_73($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $16 = 0, $17 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5366
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5370
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5372
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5374
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5376
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5378
 if ((HEAP32[___async_retval >> 2] | 0) > (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[___async_retval >> 2] = $4; //@line 5384
  return;
 }
 HEAP16[$6 >> 1] = 0; //@line 5387
 $16 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 5389
 HEAP16[$8 >> 1] = $16; //@line 5390
 $17 = $16 & 65535; //@line 5391
 $20 = HEAP32[(HEAP32[$10 >> 2] | 0) + 92 >> 2] | 0; //@line 5394
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 5395
 $21 = FUNCTION_TABLE_ii[$20 & 31]($12) | 0; //@line 5396
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 135; //@line 5399
  $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 5400
  HEAP32[$22 >> 2] = $17; //@line 5401
  $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 5402
  HEAP32[$23 >> 2] = $4; //@line 5403
  $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 5404
  HEAP32[$24 >> 2] = $8; //@line 5405
  sp = STACKTOP; //@line 5406
  return;
 }
 HEAP32[___async_retval >> 2] = $21; //@line 5410
 ___async_unwind = 0; //@line 5411
 HEAP32[$ReallocAsyncCtx4 >> 2] = 135; //@line 5412
 $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 5413
 HEAP32[$22 >> 2] = $17; //@line 5414
 $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 5415
 HEAP32[$23 >> 2] = $4; //@line 5416
 $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 5417
 HEAP32[$24 >> 2] = $8; //@line 5418
 sp = STACKTOP; //@line 5419
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb_76($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5579
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5581
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5583
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5585
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5587
 HEAP32[$2 >> 2] = 884; //@line 5588
 HEAP32[$2 + 4 >> 2] = 1012; //@line 5590
 HEAP16[$2 + 26 >> 1] = 0; //@line 5592
 HEAP16[$2 + 24 >> 1] = 0; //@line 5594
 if (!$4) {
  HEAP32[$2 + 32 >> 2] = 0; //@line 5598
  return;
 }
 $15 = (_strlen($4) | 0) + 2 | 0; //@line 5602
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 5603
 $16 = __Znaj($15) | 0; //@line 5604
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 5607
  $17 = $ReallocAsyncCtx + 4 | 0; //@line 5608
  HEAP32[$17 >> 2] = $2; //@line 5609
  $18 = $ReallocAsyncCtx + 8 | 0; //@line 5610
  HEAP32[$18 >> 2] = $6; //@line 5611
  $19 = $ReallocAsyncCtx + 12 | 0; //@line 5612
  HEAP32[$19 >> 2] = $4; //@line 5613
  $20 = $ReallocAsyncCtx + 16 | 0; //@line 5614
  HEAP32[$20 >> 2] = $8; //@line 5615
  sp = STACKTOP; //@line 5616
  return;
 }
 HEAP32[___async_retval >> 2] = $16; //@line 5620
 ___async_unwind = 0; //@line 5621
 HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 5622
 $17 = $ReallocAsyncCtx + 4 | 0; //@line 5623
 HEAP32[$17 >> 2] = $2; //@line 5624
 $18 = $ReallocAsyncCtx + 8 | 0; //@line 5625
 HEAP32[$18 >> 2] = $6; //@line 5626
 $19 = $ReallocAsyncCtx + 12 | 0; //@line 5627
 HEAP32[$19 >> 2] = $4; //@line 5628
 $20 = $ReallocAsyncCtx + 16 | 0; //@line 5629
 HEAP32[$20 >> 2] = $8; //@line 5630
 sp = STACKTOP; //@line 5631
 return;
}
function ___stdio_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$cast = 0, $11 = 0, $18 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7682
 STACKTOP = STACKTOP + 32 | 0; //@line 7683
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7683
 $vararg_buffer = sp; //@line 7684
 $3 = sp + 16 | 0; //@line 7685
 HEAP32[$3 >> 2] = $1; //@line 7686
 $4 = $3 + 4 | 0; //@line 7687
 $5 = $0 + 48 | 0; //@line 7688
 $6 = HEAP32[$5 >> 2] | 0; //@line 7689
 HEAP32[$4 >> 2] = $2 - (($6 | 0) != 0 & 1); //@line 7693
 $11 = $0 + 44 | 0; //@line 7695
 HEAP32[$3 + 8 >> 2] = HEAP32[$11 >> 2]; //@line 7697
 HEAP32[$3 + 12 >> 2] = $6; //@line 7699
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7703
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7705
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7707
 $18 = ___syscall_ret(___syscall145(145, $vararg_buffer | 0) | 0) | 0; //@line 7709
 if (($18 | 0) < 1) {
  HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | $18 & 48 ^ 16; //@line 7716
  $$0 = $18; //@line 7717
 } else {
  $24 = HEAP32[$4 >> 2] | 0; //@line 7719
  if ($18 >>> 0 > $24 >>> 0) {
   $27 = HEAP32[$11 >> 2] | 0; //@line 7723
   $28 = $0 + 4 | 0; //@line 7724
   HEAP32[$28 >> 2] = $27; //@line 7725
   $$cast = $27; //@line 7726
   HEAP32[$0 + 8 >> 2] = $$cast + ($18 - $24); //@line 7729
   if (!(HEAP32[$5 >> 2] | 0)) {
    $$0 = $2; //@line 7733
   } else {
    HEAP32[$28 >> 2] = $$cast + 1; //@line 7736
    HEAP8[$1 + ($2 + -1) >> 0] = HEAP8[$$cast >> 0] | 0; //@line 7740
    $$0 = $2; //@line 7741
   }
  } else {
   $$0 = $18; //@line 7744
  }
 }
 STACKTOP = sp; //@line 7747
 return $$0 | 0; //@line 7747
}
function __ZN4mbed10FileHandle4sizeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $17 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 483
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 486
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 487
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 488
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 491
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 493
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 495
  sp = STACKTOP; //@line 496
  return 0; //@line 497
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 499
 if (($4 | 0) < 0) {
  $$0 = $4; //@line 502
  return $$0 | 0; //@line 503
 }
 $10 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 507
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 508
 $11 = FUNCTION_TABLE_iiii[$10 & 15]($0, 0, 2) | 0; //@line 509
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 46; //@line 512
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 514
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 516
  HEAP32[$AsyncCtx3 + 12 >> 2] = $4; //@line 518
  sp = STACKTOP; //@line 519
  return 0; //@line 520
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 522
 $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 525
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 526
 FUNCTION_TABLE_iiii[$17 & 15]($0, $4, 0) | 0; //@line 527
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 47; //@line 530
  HEAP32[$AsyncCtx6 + 4 >> 2] = $11; //@line 532
  sp = STACKTOP; //@line 533
  return 0; //@line 534
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 536
 $$0 = $11; //@line 537
 return $$0 | 0; //@line 538
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8109
 STACKTOP = STACKTOP + 16 | 0; //@line 8110
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8110
 $2 = sp; //@line 8111
 $3 = $1 & 255; //@line 8112
 HEAP8[$2 >> 0] = $3; //@line 8113
 $4 = $0 + 16 | 0; //@line 8114
 $5 = HEAP32[$4 >> 2] | 0; //@line 8115
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 8122
   label = 4; //@line 8123
  } else {
   $$0 = -1; //@line 8125
  }
 } else {
  $12 = $5; //@line 8128
  label = 4; //@line 8129
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 8133
   $10 = HEAP32[$9 >> 2] | 0; //@line 8134
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 8137
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 8144
     HEAP8[$10 >> 0] = $3; //@line 8145
     $$0 = $13; //@line 8146
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 8151
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8152
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 8153
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 165; //@line 8156
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 8158
    sp = STACKTOP; //@line 8159
    STACKTOP = sp; //@line 8160
    return 0; //@line 8160
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 8162
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 8167
   } else {
    $$0 = -1; //@line 8169
   }
  }
 } while (0);
 STACKTOP = sp; //@line 8173
 return $$0 | 0; //@line 8173
}
function _fflush__async_cb_70($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5182
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5184
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5186
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 5190
  } else {
   $$02327 = $$02325; //@line 5192
   $$02426 = $AsyncRetVal; //@line 5192
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 5199
    } else {
     $16 = 0; //@line 5201
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 5213
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5216
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 5219
     break L3;
    } else {
     $$02327 = $$023; //@line 5222
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5225
   $13 = ___fflush_unlocked($$02327) | 0; //@line 5226
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 5230
    ___async_unwind = 0; //@line 5231
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 171; //@line 5233
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 5235
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 5237
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 5239
   sp = STACKTOP; //@line 5240
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 5244
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 5246
 return;
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $19 = 0, $3 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2908
 $1 = HEAP32[$0 >> 2] | 0; //@line 2909
 $3 = HEAP32[$1 + 140 >> 2] | 0; //@line 2911
 $5 = HEAP32[$1 + 124 >> 2] | 0; //@line 2913
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2914
 $6 = FUNCTION_TABLE_ii[$5 & 31]($0) | 0; //@line 2915
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 119; //@line 2918
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2920
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 2922
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2924
  sp = STACKTOP; //@line 2925
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2928
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 2931
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2932
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 2933
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 120; //@line 2936
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2938
  HEAP32[$AsyncCtx2 + 8 >> 2] = $6; //@line 2940
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 2942
  sp = STACKTOP; //@line 2943
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2946
 $19 = HEAPU16[$0 + 30 >> 1] | 0; //@line 2949
 $AsyncCtx5 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2950
 FUNCTION_TABLE_viiiiii[$3 & 7]($0, 0, 0, $6, $13, $19); //@line 2951
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 121; //@line 2954
  sp = STACKTOP; //@line 2955
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2958
  return;
 }
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 7684
 value = value & 255; //@line 7686
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 7689
   ptr = ptr + 1 | 0; //@line 7690
  }
  aligned_end = end & -4 | 0; //@line 7693
  block_aligned_end = aligned_end - 64 | 0; //@line 7694
  value4 = value | value << 8 | value << 16 | value << 24; //@line 7695
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7698
   HEAP32[ptr + 4 >> 2] = value4; //@line 7699
   HEAP32[ptr + 8 >> 2] = value4; //@line 7700
   HEAP32[ptr + 12 >> 2] = value4; //@line 7701
   HEAP32[ptr + 16 >> 2] = value4; //@line 7702
   HEAP32[ptr + 20 >> 2] = value4; //@line 7703
   HEAP32[ptr + 24 >> 2] = value4; //@line 7704
   HEAP32[ptr + 28 >> 2] = value4; //@line 7705
   HEAP32[ptr + 32 >> 2] = value4; //@line 7706
   HEAP32[ptr + 36 >> 2] = value4; //@line 7707
   HEAP32[ptr + 40 >> 2] = value4; //@line 7708
   HEAP32[ptr + 44 >> 2] = value4; //@line 7709
   HEAP32[ptr + 48 >> 2] = value4; //@line 7710
   HEAP32[ptr + 52 >> 2] = value4; //@line 7711
   HEAP32[ptr + 56 >> 2] = value4; //@line 7712
   HEAP32[ptr + 60 >> 2] = value4; //@line 7713
   ptr = ptr + 64 | 0; //@line 7714
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7718
   ptr = ptr + 4 | 0; //@line 7719
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 7724
  ptr = ptr + 1 | 0; //@line 7725
 }
 return end - num | 0; //@line 7727
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6561
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6565
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6567
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6569
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6571
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6573
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6575
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 6578
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6579
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 6588
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 6589
    if (!___async) {
     ___async_unwind = 0; //@line 6592
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 207; //@line 6594
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 6596
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 6598
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 6600
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 6602
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6604
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 6606
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 6608
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 6611
    sp = STACKTOP; //@line 6612
    return;
   }
  }
 }
 return;
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 350
 HEAP32[$0 >> 2] = 328; //@line 351
 $3 = $0 + 4 | 0; //@line 352
 HEAP32[$3 >> 2] = 0; //@line 353
 HEAP32[$0 + 8 >> 2] = $1; //@line 355
 HEAP32[$0 + 12 >> 2] = $2; //@line 357
 $6 = HEAP32[2211] | 0; //@line 358
 do {
  if (!$6) {
   HEAP32[2211] = 8848; //@line 362
  } else {
   if (($6 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 366
    _mbed_assert_internal(2308, 2328, 93); //@line 367
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 41; //@line 370
     HEAP32[$AsyncCtx3 + 4 >> 2] = $1; //@line 372
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 374
     HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 376
     sp = STACKTOP; //@line 377
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 380
     break;
    }
   }
  }
 } while (0);
 if (!$1) {
  HEAP32[$3 >> 2] = 0; //@line 388
 } else {
  HEAP32[$3 >> 2] = HEAP32[2210]; //@line 391
  HEAP32[2210] = $0; //@line 392
 }
 $14 = HEAP32[2211] | 0; //@line 394
 if (!$14) {
  HEAP32[2211] = 8848; //@line 397
  return;
 }
 if (($14 | 0) == 8848) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 404
 _mbed_assert_internal(2308, 2328, 93); //@line 405
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 408
  sp = STACKTOP; //@line 409
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 412
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5083
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 5093
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 5093
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 5093
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 5097
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 5100
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 5103
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 5111
  } else {
   $20 = 0; //@line 5113
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 5123
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 5127
  HEAP32[___async_retval >> 2] = $$1; //@line 5129
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5132
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 5133
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 5137
  ___async_unwind = 0; //@line 5138
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 171; //@line 5140
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 5142
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 5144
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 5146
 sp = STACKTOP; //@line 5147
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7191
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7193
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7195
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7197
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 7202
  } else {
   $9 = $4 + 4 | 0; //@line 7204
   $10 = HEAP32[$9 >> 2] | 0; //@line 7205
   $11 = $4 + 8 | 0; //@line 7206
   $12 = HEAP32[$11 >> 2] | 0; //@line 7207
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 7211
    HEAP32[$6 >> 2] = 0; //@line 7212
    HEAP32[$2 >> 2] = 0; //@line 7213
    HEAP32[$11 >> 2] = 0; //@line 7214
    HEAP32[$9 >> 2] = 0; //@line 7215
    $$0 = 0; //@line 7216
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 7223
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 7224
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 7225
   if (!___async) {
    ___async_unwind = 0; //@line 7228
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 173; //@line 7230
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 7232
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 7234
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 7236
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 7238
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 7240
   sp = STACKTOP; //@line 7241
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 7246
 return;
}
function _main__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 4339
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4341
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4343
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4345
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4347
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4349
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4351
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4353
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4355
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4357
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4359
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(44) | 0; //@line 4360
 _wait(.20000000298023224); //@line 4361
 if (!___async) {
  ___async_unwind = 0; //@line 4364
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 155; //@line 4366
 HEAP32[$ReallocAsyncCtx14 + 4 >> 2] = $2; //@line 4368
 HEAP32[$ReallocAsyncCtx14 + 8 >> 2] = $4; //@line 4370
 HEAP32[$ReallocAsyncCtx14 + 12 >> 2] = $6; //@line 4372
 HEAP32[$ReallocAsyncCtx14 + 16 >> 2] = $8; //@line 4374
 HEAP32[$ReallocAsyncCtx14 + 20 >> 2] = $10; //@line 4376
 HEAP32[$ReallocAsyncCtx14 + 24 >> 2] = $12; //@line 4378
 HEAP32[$ReallocAsyncCtx14 + 28 >> 2] = $14; //@line 4380
 HEAP32[$ReallocAsyncCtx14 + 32 >> 2] = $16; //@line 4382
 HEAP32[$ReallocAsyncCtx14 + 36 >> 2] = $18; //@line 4384
 HEAP32[$ReallocAsyncCtx14 + 40 >> 2] = $20; //@line 4386
 sp = STACKTOP; //@line 4387
 return;
}
function _main__async_cb_53($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 4227
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4229
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4231
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4233
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4235
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4237
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4239
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4241
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4243
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4245
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4247
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(44) | 0; //@line 4248
 _wait(.20000000298023224); //@line 4249
 if (!___async) {
  ___async_unwind = 0; //@line 4252
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 158; //@line 4254
 HEAP32[$ReallocAsyncCtx13 + 4 >> 2] = $4; //@line 4256
 HEAP32[$ReallocAsyncCtx13 + 8 >> 2] = $6; //@line 4258
 HEAP32[$ReallocAsyncCtx13 + 12 >> 2] = $8; //@line 4260
 HEAP32[$ReallocAsyncCtx13 + 16 >> 2] = $10; //@line 4262
 HEAP32[$ReallocAsyncCtx13 + 20 >> 2] = $12; //@line 4264
 HEAP32[$ReallocAsyncCtx13 + 24 >> 2] = $14; //@line 4266
 HEAP32[$ReallocAsyncCtx13 + 28 >> 2] = $16; //@line 4268
 HEAP32[$ReallocAsyncCtx13 + 32 >> 2] = $18; //@line 4270
 HEAP32[$ReallocAsyncCtx13 + 36 >> 2] = $2; //@line 4272
 HEAP32[$ReallocAsyncCtx13 + 40 >> 2] = $20; //@line 4274
 sp = STACKTOP; //@line 4275
 return;
}
function _fopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $11 = 0, $15 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 8455
 STACKTOP = STACKTOP + 48 | 0; //@line 8456
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 8456
 $vararg_buffer8 = sp + 32 | 0; //@line 8457
 $vararg_buffer3 = sp + 16 | 0; //@line 8458
 $vararg_buffer = sp; //@line 8459
 if (!(_strchr(5831, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8466
  $$0 = 0; //@line 8467
 } else {
  $7 = ___fmodeflags($1) | 0; //@line 8469
  HEAP32[$vararg_buffer >> 2] = $0; //@line 8472
  HEAP32[$vararg_buffer + 4 >> 2] = $7 | 32768; //@line 8474
  HEAP32[$vararg_buffer + 8 >> 2] = 438; //@line 8476
  $11 = ___syscall_ret(___syscall5(5, $vararg_buffer | 0) | 0) | 0; //@line 8478
  if (($11 | 0) < 0) {
   $$0 = 0; //@line 8481
  } else {
   if ($7 & 524288 | 0) {
    HEAP32[$vararg_buffer3 >> 2] = $11; //@line 8486
    HEAP32[$vararg_buffer3 + 4 >> 2] = 2; //@line 8488
    HEAP32[$vararg_buffer3 + 8 >> 2] = 1; //@line 8490
    ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8491
   }
   $15 = ___fdopen($11, $1) | 0; //@line 8493
   if (!$15) {
    HEAP32[$vararg_buffer8 >> 2] = $11; //@line 8496
    ___syscall6(6, $vararg_buffer8 | 0) | 0; //@line 8497
    $$0 = 0; //@line 8498
   } else {
    $$0 = $15; //@line 8500
   }
  }
 }
 STACKTOP = sp; //@line 8504
 return $$0 | 0; //@line 8504
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7079
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7081
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7083
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7085
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 7089
  return;
 }
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 7094
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 7095
 $10 = FUNCTION_TABLE_iiii[$9 & 15]($4, 0, 2) | 0; //@line 7096
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 46; //@line 7099
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 7100
  HEAP32[$11 >> 2] = $2; //@line 7101
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 7102
  HEAP32[$12 >> 2] = $4; //@line 7103
  $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 7104
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 7105
  sp = STACKTOP; //@line 7106
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 7110
 ___async_unwind = 0; //@line 7111
 HEAP32[$ReallocAsyncCtx2 >> 2] = 46; //@line 7112
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 7113
 HEAP32[$11 >> 2] = $2; //@line 7114
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 7115
 HEAP32[$12 >> 2] = $4; //@line 7116
 $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 7117
 HEAP32[$13 >> 2] = $AsyncRetVal; //@line 7118
 sp = STACKTOP; //@line 7119
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11807
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11812
    $$0 = 1; //@line 11813
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11826
     $$0 = 1; //@line 11827
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11831
     $$0 = -1; //@line 11832
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11842
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11846
    $$0 = 2; //@line 11847
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11859
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11865
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11869
    $$0 = 3; //@line 11870
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11880
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11886
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11892
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11896
    $$0 = 4; //@line 11897
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11901
    $$0 = -1; //@line 11902
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11907
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_10($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 1352
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1354
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1356
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1358
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1360
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 1365
  return;
 }
 dest = $2 + 4 | 0; //@line 1369
 stop = dest + 52 | 0; //@line 1369
 do {
  HEAP32[dest >> 2] = 0; //@line 1369
  dest = dest + 4 | 0; //@line 1369
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 1370
 HEAP32[$2 + 8 >> 2] = $4; //@line 1372
 HEAP32[$2 + 12 >> 2] = -1; //@line 1374
 HEAP32[$2 + 48 >> 2] = 1; //@line 1376
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 1379
 $16 = HEAP32[$6 >> 2] | 0; //@line 1380
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1381
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 1382
 if (!___async) {
  ___async_unwind = 0; //@line 1385
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 192; //@line 1387
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1389
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 1391
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 1393
 sp = STACKTOP; //@line 1394
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_95($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6697
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6701
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6703
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6705
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6707
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6709
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 6712
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6713
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 6719
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 6720
   if (!___async) {
    ___async_unwind = 0; //@line 6723
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 205; //@line 6725
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 6727
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 6729
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 6731
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 6733
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 6735
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 6737
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 6740
   sp = STACKTOP; //@line 6741
   return;
  }
 }
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb_48($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3855
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3859
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3861
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3863
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 420; //@line 3864
 HEAP32[$4 + 4 >> 2] = 516; //@line 3866
 $10 = $4 + 20 | 0; //@line 3867
 HEAP32[$10 >> 2] = 0; //@line 3868
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3869
 $11 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($4, 2062) | 0; //@line 3870
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 59; //@line 3873
  $12 = $ReallocAsyncCtx + 4 | 0; //@line 3874
  HEAP32[$12 >> 2] = $10; //@line 3875
  $13 = $ReallocAsyncCtx + 8 | 0; //@line 3876
  HEAP32[$13 >> 2] = $6; //@line 3877
  $14 = $ReallocAsyncCtx + 12 | 0; //@line 3878
  HEAP32[$14 >> 2] = $8; //@line 3879
  sp = STACKTOP; //@line 3880
  return;
 }
 HEAP32[___async_retval >> 2] = $11; //@line 3884
 ___async_unwind = 0; //@line 3885
 HEAP32[$ReallocAsyncCtx >> 2] = 59; //@line 3886
 $12 = $ReallocAsyncCtx + 4 | 0; //@line 3887
 HEAP32[$12 >> 2] = $10; //@line 3888
 $13 = $ReallocAsyncCtx + 8 | 0; //@line 3889
 HEAP32[$13 >> 2] = $6; //@line 3890
 $14 = $ReallocAsyncCtx + 12 | 0; //@line 3891
 HEAP32[$14 >> 2] = $8; //@line 3892
 sp = STACKTOP; //@line 3893
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$$sroa_idx = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1894
 STACKTOP = STACKTOP + 16 | 0; //@line 1895
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1895
 $2 = sp; //@line 1896
 HEAP8[$2 >> 0] = 58; //@line 1897
 $$0$$sroa_idx = $2 + 1 | 0; //@line 1898
 HEAP8[$$0$$sroa_idx >> 0] = $0; //@line 1899
 HEAP8[$$0$$sroa_idx + 1 >> 0] = $0 >> 8; //@line 1899
 HEAP8[$$0$$sroa_idx + 2 >> 0] = $0 >> 16; //@line 1899
 HEAP8[$$0$$sroa_idx + 3 >> 0] = $0 >> 24; //@line 1899
 $3 = _fopen($2, $1) | 0; //@line 1900
 if (!$3) {
  STACKTOP = sp; //@line 1903
  return $3 | 0; //@line 1903
 }
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 28 >> 2] | 0; //@line 1907
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1908
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 1909
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 98; //@line 1912
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1914
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1916
  sp = STACKTOP; //@line 1917
  STACKTOP = sp; //@line 1918
  return 0; //@line 1918
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1920
 if (!$8) {
  STACKTOP = sp; //@line 1923
  return $3 | 0; //@line 1923
 }
 _setbuf($3, 0); //@line 1925
 STACKTOP = sp; //@line 1926
 return $3 | 0; //@line 1926
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 10691
  $8 = $0; //@line 10691
  $9 = $1; //@line 10691
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10693
   $$0914 = $$0914 + -1 | 0; //@line 10697
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 10698
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10699
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 10707
   }
  }
  $$010$lcssa$off0 = $8; //@line 10712
  $$09$lcssa = $$0914; //@line 10712
 } else {
  $$010$lcssa$off0 = $0; //@line 10714
  $$09$lcssa = $2; //@line 10714
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 10718
 } else {
  $$012 = $$010$lcssa$off0; //@line 10720
  $$111 = $$09$lcssa; //@line 10720
  while (1) {
   $26 = $$111 + -1 | 0; //@line 10725
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 10726
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 10730
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 10733
    $$111 = $26; //@line 10733
   }
  }
 }
 return $$1$lcssa | 0; //@line 10737
}
function _main__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 4451
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4453
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4455
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4457
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4459
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4461
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4463
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4465
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4467
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4469
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(40) | 0; //@line 4470
 _wait(.20000000298023224); //@line 4471
 if (!___async) {
  ___async_unwind = 0; //@line 4474
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 152; //@line 4476
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $2; //@line 4478
 HEAP32[$ReallocAsyncCtx15 + 8 >> 2] = $4; //@line 4480
 HEAP32[$ReallocAsyncCtx15 + 12 >> 2] = $6; //@line 4482
 HEAP32[$ReallocAsyncCtx15 + 16 >> 2] = $8; //@line 4484
 HEAP32[$ReallocAsyncCtx15 + 20 >> 2] = $10; //@line 4486
 HEAP32[$ReallocAsyncCtx15 + 24 >> 2] = $12; //@line 4488
 HEAP32[$ReallocAsyncCtx15 + 28 >> 2] = $14; //@line 4490
 HEAP32[$ReallocAsyncCtx15 + 32 >> 2] = $16; //@line 4492
 HEAP32[$ReallocAsyncCtx15 + 36 >> 2] = $18; //@line 4494
 sp = STACKTOP; //@line 4495
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0) {
 $0 = $0 | 0;
 var $1 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1799
 $1 = HEAP32[2216] | 0; //@line 1800
 do {
  if (!$1) {
   HEAP32[2216] = 8868; //@line 1804
  } else {
   if (($1 | 0) != 8868) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1808
    _mbed_assert_internal(2308, 2328, 93); //@line 1809
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 95; //@line 1812
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1814
     sp = STACKTOP; //@line 1815
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1818
     break;
    }
   }
  }
 } while (0);
 if ((HEAP32[459] | 0) == ($0 | 0)) {
  HEAP32[459] = 0; //@line 1827
 }
 if ((HEAP32[460] | 0) == ($0 | 0)) {
  HEAP32[460] = 0; //@line 1832
 }
 if ((HEAP32[461] | 0) == ($0 | 0)) {
  HEAP32[461] = 0; //@line 1837
 }
 $8 = HEAP32[2216] | 0; //@line 1839
 if (!$8) {
  HEAP32[2216] = 8868; //@line 1842
  return;
 }
 if (($8 | 0) == 8868) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1849
 _mbed_assert_internal(2308, 2328, 93); //@line 1850
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 1853
  sp = STACKTOP; //@line 1854
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1857
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $12 = 0, $13 = 0, $3 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3505
 $3 = HEAP32[$0 + 32 >> 2] | 0; //@line 3507
 if (!$3) {
  _fwrite(5196, 85, 1, HEAP32[271] | 0) | 0; //@line 3511
  $$0 = 0; //@line 3512
  return $$0 | 0; //@line 3513
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3515
 $6 = _freopen($3, 5282, $1) | 0; //@line 3516
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 136; //@line 3519
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3521
  sp = STACKTOP; //@line 3522
  return 0; //@line 3523
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3525
 if (!$6) {
  $$0 = 0; //@line 3528
  return $$0 | 0; //@line 3529
 }
 $9 = HEAP32[303] | 0; //@line 3531
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 3534
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3535
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 3536
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 3539
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 3541
  sp = STACKTOP; //@line 3542
  return 0; //@line 3543
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3545
 _setvbuf($9, 0, 1, $13) | 0; //@line 3546
 $$0 = 1; //@line 3547
 return $$0 | 0; //@line 3548
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5446
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5448
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5452
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5454
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5456
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5458
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 5462
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 5465
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 5466
   if (!___async) {
    ___async_unwind = 0; //@line 5469
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 209; //@line 5471
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 5473
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 5475
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 5477
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 5479
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 5481
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 5483
   sp = STACKTOP; //@line 5484
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7837
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7842
   label = 4; //@line 7843
  } else {
   $$01519 = $0; //@line 7845
   $23 = $1; //@line 7845
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7850
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7853
    $23 = $6; //@line 7854
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7858
     label = 4; //@line 7859
     break;
    } else {
     $$01519 = $6; //@line 7862
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7868
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7870
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7878
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7886
  } else {
   $$pn = $$0; //@line 7888
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7890
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7894
     break;
    } else {
     $$pn = $19; //@line 7897
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7902
 }
 return $$sink - $1 | 0; //@line 7905
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 13091
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 13098
   $10 = $1 + 16 | 0; //@line 13099
   $11 = HEAP32[$10 >> 2] | 0; //@line 13100
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 13103
    HEAP32[$1 + 24 >> 2] = $4; //@line 13105
    HEAP32[$1 + 36 >> 2] = 1; //@line 13107
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 13117
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 13122
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 13125
    HEAP8[$1 + 54 >> 0] = 1; //@line 13127
    break;
   }
   $21 = $1 + 24 | 0; //@line 13130
   $22 = HEAP32[$21 >> 2] | 0; //@line 13131
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 13134
    $28 = $4; //@line 13135
   } else {
    $28 = $22; //@line 13137
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 13146
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay4putpEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $15 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2997
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 3000
 $5 = $0 + 36 | 0; //@line 3001
 $7 = HEAP16[$5 >> 1] | 0; //@line 3003
 $8 = $0 + 38 | 0; //@line 3004
 $10 = HEAP16[$8 >> 1] | 0; //@line 3006
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3007
 FUNCTION_TABLE_viiii[$4 & 7]($0, $7, $10, $1); //@line 3008
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 122; //@line 3011
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 3013
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 3015
  HEAP32[$AsyncCtx + 12 >> 2] = $8; //@line 3017
  sp = STACKTOP; //@line 3018
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3021
 $15 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 3023
 HEAP16[$5 >> 1] = $15; //@line 3024
 if ($15 << 16 >> 16 <= (HEAP16[$0 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$5 >> 1] = HEAP16[$0 + 40 >> 1] | 0; //@line 3033
 $22 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 3035
 HEAP16[$8 >> 1] = $22; //@line 3036
 if ($22 << 16 >> 16 <= (HEAP16[$0 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$8 >> 1] = HEAP16[$0 + 44 >> 1] | 0; //@line 3045
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12526
 $1 = HEAP32[303] | 0; //@line 12527
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12533
 } else {
  $19 = 0; //@line 12535
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12541
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12547
    $12 = HEAP32[$11 >> 2] | 0; //@line 12548
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12554
     HEAP8[$12 >> 0] = 10; //@line 12555
     $22 = 0; //@line 12556
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12560
   $17 = ___overflow($1, 10) | 0; //@line 12561
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 184; //@line 12564
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12566
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12568
    sp = STACKTOP; //@line 12569
    return 0; //@line 12570
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12572
    $22 = $17 >> 31; //@line 12574
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12581
 }
 return $22 | 0; //@line 12583
}
function _main__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4002
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4004
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4006
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4008
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4010
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4012
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4014
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4016
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4018
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 4019
 _puts(5755) | 0; //@line 4020
 if (!___async) {
  ___async_unwind = 0; //@line 4023
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 149; //@line 4025
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 4027
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 4029
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 4031
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 4033
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 4035
 HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 4037
 HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 4039
 HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 4041
 sp = STACKTOP; //@line 4042
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_75($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5494
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5500
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5502
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5504
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5506
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 5511
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 5513
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 5514
 if (!___async) {
  ___async_unwind = 0; //@line 5517
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 209; //@line 5519
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 5521
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 5523
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 5525
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 5527
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 5529
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 5531
 sp = STACKTOP; //@line 5532
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_72($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5322
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5324
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5326
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5328
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5330
 $10 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 5332
 HEAP16[$2 >> 1] = $10; //@line 5333
 $14 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 5337
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(28) | 0; //@line 5338
 $15 = FUNCTION_TABLE_ii[$14 & 31]($4) | 0; //@line 5339
 if (!___async) {
  HEAP32[___async_retval >> 2] = $15; //@line 5343
  ___async_unwind = 0; //@line 5344
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 134; //@line 5346
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $10 & 65535; //@line 5348
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 5350
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 5352
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 5354
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 5356
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $4; //@line 5358
 sp = STACKTOP; //@line 5359
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12950
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12959
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12964
      HEAP32[$13 >> 2] = $2; //@line 12965
      $19 = $1 + 40 | 0; //@line 12966
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12969
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12979
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12983
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12990
    }
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6021
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6023
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6025
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6027
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 6029
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 6031
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 8397; //@line 6036
  HEAP32[$4 + 4 >> 2] = $6; //@line 6038
  _abort_message(8306, $4); //@line 6039
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 6042
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 6045
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 6046
 $16 = FUNCTION_TABLE_ii[$15 & 31]($12) | 0; //@line 6047
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 6051
  ___async_unwind = 0; //@line 6052
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 188; //@line 6054
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 6056
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 6058
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 6060
 sp = STACKTOP; //@line 6061
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 11927
 while (1) {
  if ((HEAPU8[6369 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11934
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11937
  if (($7 | 0) == 87) {
   $$01214 = 6457; //@line 11940
   $$115 = 87; //@line 11940
   label = 5; //@line 11941
   break;
  } else {
   $$016 = $7; //@line 11944
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 6457; //@line 11950
  } else {
   $$01214 = 6457; //@line 11952
   $$115 = $$016; //@line 11952
   label = 5; //@line 11953
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11958
   $$113 = $$01214; //@line 11959
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11963
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11970
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11973
    break;
   } else {
    $$01214 = $$113; //@line 11976
    label = 5; //@line 11977
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11984
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5665
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5667
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5669
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5673
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 5677
  label = 4; //@line 5678
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 5683
   label = 4; //@line 5684
  } else {
   $$037$off039 = 3; //@line 5686
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 5690
  $17 = $8 + 40 | 0; //@line 5691
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 5694
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 5704
    $$037$off039 = $$037$off038; //@line 5705
   } else {
    $$037$off039 = $$037$off038; //@line 5707
   }
  } else {
   $$037$off039 = $$037$off038; //@line 5710
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 5713
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_89($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6312
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6314
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6316
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6318
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 6321
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 6322
 $10 = FUNCTION_TABLE_iii[$9 & 7]($2, $4) | 0; //@line 6323
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 6326
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 6327
  HEAP32[$11 >> 2] = $6; //@line 6328
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 6329
  HEAP32[$12 >> 2] = $2; //@line 6330
  sp = STACKTOP; //@line 6331
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 6335
 ___async_unwind = 0; //@line 6336
 HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 6337
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 6338
 HEAP32[$11 >> 2] = $6; //@line 6339
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 6340
 HEAP32[$12 >> 2] = $2; //@line 6341
 sp = STACKTOP; //@line 6342
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 14613
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14615
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14619
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14621
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14623
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14625
 HEAP32[$2 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 14626
 _memset($6 | 0, 0, 4096) | 0; //@line 14627
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 14628
 $13 = _vsprintf($6, $8, $2) | 0; //@line 14629
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 14633
  ___async_unwind = 0; //@line 14634
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 65; //@line 14636
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 14638
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 14640
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 14642
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 14644
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $6; //@line 14646
 sp = STACKTOP; //@line 14647
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_25($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2918
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2920
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2922
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2924
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2926
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2928
 $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 2931
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 2932
 $13 = FUNCTION_TABLE_ii[$12 & 31]($4) | 0; //@line 2933
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 2937
  ___async_unwind = 0; //@line 2938
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 143; //@line 2940
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $AsyncRetVal; //@line 2942
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 2944
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 2946
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 2948
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $4; //@line 2950
 sp = STACKTOP; //@line 2951
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1744
 $2 = $0 + 12 | 0; //@line 1746
 $3 = HEAP32[$2 >> 2] | 0; //@line 1747
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1751
   _mbed_assert_internal(2219, 2224, 528); //@line 1752
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 93; //@line 1755
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1757
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1759
    sp = STACKTOP; //@line 1760
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1763
    $8 = HEAP32[$2 >> 2] | 0; //@line 1765
    break;
   }
  } else {
   $8 = $3; //@line 1769
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1772
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1774
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 1775
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 1778
  sp = STACKTOP; //@line 1779
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1782
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12783
 STACKTOP = STACKTOP + 16 | 0; //@line 12784
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12784
 $1 = sp; //@line 12785
 HEAP32[$1 >> 2] = $varargs; //@line 12786
 $2 = HEAP32[271] | 0; //@line 12787
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12788
 _vfprintf($2, $0, $1) | 0; //@line 12789
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 189; //@line 12792
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12794
  sp = STACKTOP; //@line 12795
  STACKTOP = sp; //@line 12796
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12798
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12799
 _fputc(10, $2) | 0; //@line 12800
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 190; //@line 12803
  sp = STACKTOP; //@line 12804
  STACKTOP = sp; //@line 12805
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12807
  _abort(); //@line 12808
 }
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3779
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3783
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3785
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3787
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3789
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3790
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 3797
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3798
 FUNCTION_TABLE_vii[$13 & 7]($8, $10); //@line 3799
 if (!___async) {
  ___async_unwind = 0; //@line 3802
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 124; //@line 3804
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 3806
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3808
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3810
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3812
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3814
 sp = STACKTOP; //@line 3815
 return;
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5916
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5918
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5920
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5922
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5924
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[2213] | 0)) {
  _serial_init(8856, 2, 3); //@line 5932
 }
 $12 = HEAP8[$6 >> 0] | 0; //@line 5935
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5936
 _serial_putc(8856, $12); //@line 5937
 if (!___async) {
  ___async_unwind = 0; //@line 5940
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 87; //@line 5942
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 5944
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 5946
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 5948
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 5950
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 5952
 sp = STACKTOP; //@line 5953
 return;
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11758
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11758
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11759
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 11760
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 11769
    $$016 = $9; //@line 11772
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 11772
   } else {
    $$016 = $0; //@line 11774
    $storemerge = 0; //@line 11774
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 11776
   $$0 = $$016; //@line 11777
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 11781
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 11787
   HEAP32[tempDoublePtr >> 2] = $2; //@line 11790
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 11790
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 11791
  }
 }
 return +$$0;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14395
 STACKTOP = STACKTOP + 16 | 0; //@line 14396
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 14396
 $3 = sp; //@line 14397
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 14399
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 14402
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 14403
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 14404
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 213; //@line 14407
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 14409
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 14411
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 14413
  sp = STACKTOP; //@line 14414
  STACKTOP = sp; //@line 14415
  return 0; //@line 14415
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 14417
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 14421
 }
 STACKTOP = sp; //@line 14423
 return $8 & 1 | 0; //@line 14423
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2487
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2493
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2495
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2496
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 2503
 $14 = HEAP32[$8 >> 2] | 0; //@line 2504
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2505
 FUNCTION_TABLE_vii[$13 & 7]($6, $14); //@line 2506
 if (!___async) {
  ___async_unwind = 0; //@line 2509
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 126; //@line 2511
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 2513
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 2515
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2517
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2519
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 2521
 sp = STACKTOP; //@line 2522
 return;
}
function __ZN15GraphicsDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3324
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3325
 __ZN11TextDisplayC2EPKc($0, $1); //@line 3326
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 130; //@line 3329
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3331
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 3333
  sp = STACKTOP; //@line 3334
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3337
 HEAP32[$0 >> 2] = 708; //@line 3338
 HEAP32[$0 + 4 >> 2] = 868; //@line 3340
 __ZN11TextDisplay10foregroundEt($0, -1); //@line 3341
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 116 >> 2] | 0; //@line 3344
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3345
 FUNCTION_TABLE_vii[$7 & 7]($0, 0); //@line 3346
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 131; //@line 3349
  sp = STACKTOP; //@line 3350
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3353
  return;
 }
}
function _mbed_error_printf__async_cb_82($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5960
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5964
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5966
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5968
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5970
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5971
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $14 = HEAP8[$10 + $12 >> 0] | 0; //@line 5978
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5979
 _serial_putc(8856, $14); //@line 5980
 if (!___async) {
  ___async_unwind = 0; //@line 5983
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 87; //@line 5985
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 5987
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 5989
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5991
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 5993
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 5995
 sp = STACKTOP; //@line 5996
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
 sp = STACKTOP; //@line 13306
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13312
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 13315
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13318
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13319
   FUNCTION_TABLE_viiiiii[$13 & 7]($10, $1, $2, $3, $4, $5); //@line 13320
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 195; //@line 13323
    sp = STACKTOP; //@line 13324
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13327
    break;
   }
  }
 } while (0);
 return;
}
function __ZN11TextDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2819
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2821
 $5 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 2824
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 2825
 $6 = FUNCTION_TABLE_ii[$5 & 31]($2) | 0; //@line 2826
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 139; //@line 2829
  $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 2830
  HEAP32[$7 >> 2] = $2; //@line 2831
  $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 2832
  HEAP32[$8 >> 2] = $2; //@line 2833
  sp = STACKTOP; //@line 2834
  return;
 }
 HEAP32[___async_retval >> 2] = $6; //@line 2838
 ___async_unwind = 0; //@line 2839
 HEAP32[$ReallocAsyncCtx2 >> 2] = 139; //@line 2840
 $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 2841
 HEAP32[$7 >> 2] = $2; //@line 2842
 $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 2843
 HEAP32[$8 >> 2] = $2; //@line 2844
 sp = STACKTOP; //@line 2845
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1271
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1279
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1281
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1283
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1285
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1287
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1289
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1291
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 1302
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 1303
 HEAP32[$10 >> 2] = 0; //@line 1304
 HEAP32[$12 >> 2] = 0; //@line 1305
 HEAP32[$14 >> 2] = 0; //@line 1306
 HEAP32[$2 >> 2] = 0; //@line 1307
 $33 = HEAP32[$16 >> 2] | 0; //@line 1308
 HEAP32[$16 >> 2] = $33 | $18; //@line 1313
 if ($20 | 0) {
  ___unlockfile($22); //@line 1316
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 1319
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_46($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3680
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3682
 if (!(HEAP32[___async_retval >> 2] | 0)) {
  HEAP8[___async_retval >> 0] = 0; //@line 3689
  return;
 }
 $5 = HEAP32[303] | 0; //@line 3692
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 3695
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 3696
 $9 = FUNCTION_TABLE_ii[$8 & 31]($2) | 0; //@line 3697
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 137; //@line 3700
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 3701
  HEAP32[$10 >> 2] = $5; //@line 3702
  sp = STACKTOP; //@line 3703
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 3707
 ___async_unwind = 0; //@line 3708
 HEAP32[$ReallocAsyncCtx >> 2] = 137; //@line 3709
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 3710
 HEAP32[$10 >> 2] = $5; //@line 3711
 sp = STACKTOP; //@line 3712
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3738
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3744
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3746
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3747
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 3754
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3755
 FUNCTION_TABLE_vii[$13 & 7]($6, $8); //@line 3756
 if (!___async) {
  ___async_unwind = 0; //@line 3759
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 124; //@line 3761
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 3763
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 3765
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3767
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $6; //@line 3769
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $8; //@line 3771
 sp = STACKTOP; //@line 3772
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_27($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2998
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3002
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3004
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3006
 $9 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3007
 $12 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 3010
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 3011
 $13 = FUNCTION_TABLE_ii[$12 & 31]($6) | 0; //@line 3012
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 3016
  ___async_unwind = 0; //@line 3017
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 142; //@line 3019
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $4; //@line 3021
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 3023
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $9; //@line 3025
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 3027
 sp = STACKTOP; //@line 3028
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_98($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7125
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7129
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7131
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7133
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 16 >> 2] | 0; //@line 7136
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 7137
 FUNCTION_TABLE_iiii[$10 & 15]($4, $6, 0) | 0; //@line 7138
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 47; //@line 7141
  $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 7142
  HEAP32[$11 >> 2] = $AsyncRetVal; //@line 7143
  sp = STACKTOP; //@line 7144
  return;
 }
 ___async_unwind = 0; //@line 7147
 HEAP32[$ReallocAsyncCtx3 >> 2] = 47; //@line 7148
 $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 7149
 HEAP32[$11 >> 2] = $AsyncRetVal; //@line 7150
 sp = STACKTOP; //@line 7151
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
 sp = STACKTOP; //@line 14305
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 14307
 $8 = $7 >> 8; //@line 14308
 if (!($7 & 1)) {
  $$0 = $8; //@line 14312
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 14317
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 14319
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 14322
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14327
 FUNCTION_TABLE_viiiiii[$17 & 7]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 14328
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 211; //@line 14331
  sp = STACKTOP; //@line 14332
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 14335
  return;
 }
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12588
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 12590
 while (1) {
  $2 = _malloc($$) | 0; //@line 12592
  if ($2 | 0) {
   $$lcssa = $2; //@line 12595
   label = 7; //@line 12596
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 12599
  if (!$4) {
   $$lcssa = 0; //@line 12602
   label = 7; //@line 12603
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12606
  FUNCTION_TABLE_v[$4 & 3](); //@line 12607
  if (___async) {
   label = 5; //@line 12610
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12613
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 185; //@line 12616
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 12618
  sp = STACKTOP; //@line 12619
  return 0; //@line 12620
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 12623
 }
 return 0; //@line 12625
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13475
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13481
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 13484
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 13487
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13488
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 13489
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 198; //@line 13492
    sp = STACKTOP; //@line 13493
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13496
    break;
   }
  }
 } while (0);
 return;
}
function _fclose__async_cb_63($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4841
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4843
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 4846
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4848
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4850
 $9 = HEAP32[$2 + 12 >> 2] | 0; //@line 4852
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 4853
 $10 = FUNCTION_TABLE_ii[$9 & 31]($2) | 0; //@line 4854
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 4858
  ___async_unwind = 0; //@line 4859
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 167; //@line 4861
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $AsyncRetVal; //@line 4863
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 4865
 HEAP8[$ReallocAsyncCtx + 12 >> 0] = $4 & 1; //@line 4868
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 4870
 sp = STACKTOP; //@line 4871
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2006
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2008
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2010
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2012
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[2213] | 0)) {
  _serial_init(8856, 2, 3); //@line 2020
 }
 $10 = HEAP8[$4 >> 0] | 0; //@line 2023
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 2024
 _serial_putc(8856, $10); //@line 2025
 if (!___async) {
  ___async_unwind = 0; //@line 2028
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 89; //@line 2030
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 2032
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 2034
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 2036
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 2038
 sp = STACKTOP; //@line 2039
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14347
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 14349
 $7 = $6 >> 8; //@line 14350
 if (!($6 & 1)) {
  $$0 = $7; //@line 14354
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 14359
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 14361
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 14364
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14369
 FUNCTION_TABLE_viiiii[$16 & 7]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 14370
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 212; //@line 14373
  sp = STACKTOP; //@line 14374
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 14377
  return;
 }
}
function __ZN11TextDisplay3clsEv__async_cb_26($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2958
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2962
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2964
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2966
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2968
 if (($4 | 0) >= (Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0)) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 2976
 __ZN4mbed6Stream4putcEi($6, 32) | 0; //@line 2977
 if (!___async) {
  ___async_unwind = 0; //@line 2980
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 141; //@line 2982
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 2984
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $8; //@line 2986
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $10; //@line 2988
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $6; //@line 2990
 sp = STACKTOP; //@line 2991
 return;
}
function ___dynamic_cast__async_cb_84($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6110
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6112
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6114
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6120
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 6135
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 6151
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 6156
    break;
   }
  default:
   {
    $$0 = 0; //@line 6160
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 6165
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14262
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 14264
 $6 = $5 >> 8; //@line 14265
 if (!($5 & 1)) {
  $$0 = $6; //@line 14269
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 14274
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 14276
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 14279
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14284
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 14285
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 210; //@line 14288
  sp = STACKTOP; //@line 14289
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 14292
  return;
 }
}
function _mbed_error_vfprintf__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2046
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2050
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2052
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2054
 $10 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2055
 if (($10 | 0) == ($4 | 0)) {
  return;
 }
 $12 = HEAP8[$8 + $10 >> 0] | 0; //@line 2062
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 2063
 _serial_putc(8856, $12); //@line 2064
 if (!___async) {
  ___async_unwind = 0; //@line 2067
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 89; //@line 2069
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $10; //@line 2071
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2073
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2075
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2077
 sp = STACKTOP; //@line 2078
 return;
}
function __ZThn4_N4mbed6StreamD1Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 841
 $1 = $0 + -4 | 0; //@line 842
 HEAP32[$1 >> 2] = 420; //@line 843
 $2 = $1 + 4 | 0; //@line 844
 HEAP32[$2 >> 2] = 516; //@line 845
 $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 847
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 848
 _fclose($4) | 0; //@line 849
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 852
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 854
  sp = STACKTOP; //@line 855
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 858
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 859
 __ZN4mbed8FileBaseD2Ev($2); //@line 860
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 57; //@line 863
  sp = STACKTOP; //@line 864
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 867
  return;
 }
}
function __ZN15GraphicsDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6171
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6175
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6177
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6179
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 128 >> 2] | 0; //@line 6182
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 6183
 $11 = FUNCTION_TABLE_ii[$10 & 31]($4) | 0; //@line 6184
 if (!___async) {
  HEAP32[___async_retval >> 2] = $11; //@line 6188
  ___async_unwind = 0; //@line 6189
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 120; //@line 6191
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 6193
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 6195
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 6197
 sp = STACKTOP; //@line 6198
 return;
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_11($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1406
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1410
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1412
 if (!(HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[$4 >> 2] = 0; //@line 1415
 } else {
  HEAP32[$4 >> 2] = HEAP32[2210]; //@line 1418
  HEAP32[2210] = $6; //@line 1419
 }
 $9 = HEAP32[2211] | 0; //@line 1421
 if (!$9) {
  HEAP32[2211] = 8848; //@line 1424
  return;
 }
 if (($9 | 0) == 8848) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1431
 _mbed_assert_internal(2308, 2328, 93); //@line 1432
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 42; //@line 1435
  sp = STACKTOP; //@line 1436
  return;
 }
 ___async_unwind = 0; //@line 1439
 HEAP32[$ReallocAsyncCtx >> 2] = 42; //@line 1440
 sp = STACKTOP; //@line 1441
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 10756
 STACKTOP = STACKTOP + 256 | 0; //@line 10757
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 10757
 $5 = sp; //@line 10758
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 10764
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 10768
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 10771
   $$011 = $9; //@line 10772
   do {
    _out_670($0, $5, 256); //@line 10774
    $$011 = $$011 + -256 | 0; //@line 10775
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 10784
  } else {
   $$0$lcssa = $9; //@line 10786
  }
  _out_670($0, $5, $$0$lcssa); //@line 10788
 }
 STACKTOP = sp; //@line 10790
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 249
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 251
 if ((HEAP32[459] | 0) == ($2 | 0)) {
  HEAP32[459] = 0; //@line 255
 }
 if ((HEAP32[460] | 0) == ($2 | 0)) {
  HEAP32[460] = 0; //@line 260
 }
 if ((HEAP32[461] | 0) == ($2 | 0)) {
  HEAP32[461] = 0; //@line 265
 }
 $6 = HEAP32[2216] | 0; //@line 267
 if (!$6) {
  HEAP32[2216] = 8868; //@line 270
  return;
 }
 if (($6 | 0) == 8868) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 277
 _mbed_assert_internal(2308, 2328, 93); //@line 278
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 281
  sp = STACKTOP; //@line 282
  return;
 }
 ___async_unwind = 0; //@line 285
 HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 286
 sp = STACKTOP; //@line 287
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_87($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6272
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6276
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6278
 $8 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 6281
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 6282
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 6283
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 6286
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 6287
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 6288
  sp = STACKTOP; //@line 6289
  return;
 }
 ___async_unwind = 0; //@line 6292
 HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 6293
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 6294
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 6295
 sp = STACKTOP; //@line 6296
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2851
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2853
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2855
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2857
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 2860
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 2861
 $9 = FUNCTION_TABLE_ii[$8 & 31]($4) | 0; //@line 2862
 if (!___async) {
  HEAP32[___async_retval >> 2] = $9; //@line 2866
  ___async_unwind = 0; //@line 2867
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 140; //@line 2869
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $AsyncRetVal; //@line 2871
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 2873
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 2875
 sp = STACKTOP; //@line 2876
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 14653
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14657
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14659
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14661
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14663
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 14666
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 14667
 FUNCTION_TABLE_vi[$13 & 255]($4); //@line 14668
 if (!___async) {
  ___async_unwind = 0; //@line 14671
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 14673
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 14675
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $8; //@line 14677
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $10; //@line 14679
 sp = STACKTOP; //@line 14680
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7621
 STACKTOP = STACKTOP + 32 | 0; //@line 7622
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7622
 $vararg_buffer = sp; //@line 7623
 $3 = sp + 20 | 0; //@line 7624
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7628
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7630
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7632
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7634
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7636
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7641
  $10 = -1; //@line 7642
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7645
 }
 STACKTOP = sp; //@line 7647
 return $10 | 0; //@line 7647
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1166
 STACKTOP = STACKTOP + 16 | 0; //@line 1167
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1167
 $vararg_buffer = sp; //@line 1168
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1169
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1171
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1173
 _mbed_error_printf(2096, $vararg_buffer); //@line 1174
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1175
 _mbed_die(); //@line 1176
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 69; //@line 1179
  sp = STACKTOP; //@line 1180
  STACKTOP = sp; //@line 1181
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1183
  STACKTOP = sp; //@line 1184
  return;
 }
}
function __ZN4mbed6StreamD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 543
 HEAP32[$0 >> 2] = 420; //@line 544
 HEAP32[$0 + 4 >> 2] = 516; //@line 546
 $3 = HEAP32[$0 + 20 >> 2] | 0; //@line 548
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 549
 _fclose($3) | 0; //@line 550
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 553
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 555
  sp = STACKTOP; //@line 556
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 559
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 561
 __ZN4mbed8FileBaseD2Ev($0 + 4 | 0); //@line 562
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 49; //@line 565
  sp = STACKTOP; //@line 566
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 569
  return;
 }
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12097
 STACKTOP = STACKTOP + 16 | 0; //@line 12098
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12098
 $2 = sp; //@line 12099
 HEAP32[$2 >> 2] = $varargs; //@line 12100
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12101
 $3 = _vsprintf($0, $1, $2) | 0; //@line 12102
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 176; //@line 12105
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12107
  sp = STACKTOP; //@line 12108
  STACKTOP = sp; //@line 12109
  return 0; //@line 12109
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12111
  STACKTOP = sp; //@line 12112
  return $3 | 0; //@line 12112
 }
 return 0; //@line 12114
}
function __ZN11TextDisplay3clsEv__async_cb_24($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2882
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2886
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2888
 if ((Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0) <= 0) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 2896
 __ZN4mbed6Stream4putcEi($4, 32) | 0; //@line 2897
 if (!___async) {
  ___async_unwind = 0; //@line 2900
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 141; //@line 2902
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = 0; //@line 2904
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 2906
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $4; //@line 2908
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $4; //@line 2910
 sp = STACKTOP; //@line 2911
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 13028
 $5 = HEAP32[$4 >> 2] | 0; //@line 13029
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 13033
   HEAP32[$1 + 24 >> 2] = $3; //@line 13035
   HEAP32[$1 + 36 >> 2] = 1; //@line 13037
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 13041
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 13044
    HEAP32[$1 + 24 >> 2] = 2; //@line 13046
    HEAP8[$1 + 54 >> 0] = 1; //@line 13048
    break;
   }
   $10 = $1 + 24 | 0; //@line 13051
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 13055
   }
  }
 } while (0);
 return;
}
function _error($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1642
 STACKTOP = STACKTOP + 16 | 0; //@line 1643
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1643
 $1 = sp; //@line 1644
 if (HEAP8[13644] | 0) {
  STACKTOP = sp; //@line 1648
  return;
 }
 HEAP8[13644] = 1; //@line 1650
 HEAP32[$1 >> 2] = $varargs; //@line 1651
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1652
 _mbed_error_vfprintf($0, $1); //@line 1653
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 1656
  sp = STACKTOP; //@line 1657
  STACKTOP = sp; //@line 1658
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1660
  _emscripten_alloc_async_context(4, sp) | 0; //@line 1661
  _exit(1); //@line 1662
 }
}
function __ZN15GraphicsDisplay3clsEv__async_cb_85($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6204
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6206
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6208
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6210
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6212
 $10 = HEAPU16[$2 + 30 >> 1] | 0; //@line 6215
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6216
 FUNCTION_TABLE_viiiiii[$6 & 7]($2, 0, 0, $4, $AsyncRetVal, $10); //@line 6217
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 121; //@line 6220
  sp = STACKTOP; //@line 6221
  return;
 }
 ___async_unwind = 0; //@line 6224
 HEAP32[$ReallocAsyncCtx3 >> 2] = 121; //@line 6225
 sp = STACKTOP; //@line 6226
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $7 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5760
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5762
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 5767
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5771
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 5772
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 5775
  $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 5776
  HEAP32[$7 >> 2] = $2; //@line 5777
  sp = STACKTOP; //@line 5778
  return;
 }
 ___async_unwind = 0; //@line 5781
 HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 5782
 $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 5783
 HEAP32[$7 >> 2] = $2; //@line 5784
 sp = STACKTOP; //@line 5785
 return;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_92($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6502
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6504
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6506
 HEAP32[$2 >> 2] = 708; //@line 6507
 HEAP32[$2 + 4 >> 2] = 868; //@line 6509
 __ZN11TextDisplay10foregroundEt($4, -1); //@line 6510
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 116 >> 2] | 0; //@line 6513
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6514
 FUNCTION_TABLE_vii[$8 & 7]($4, 0); //@line 6515
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 6518
  sp = STACKTOP; //@line 6519
  return;
 }
 ___async_unwind = 0; //@line 6522
 HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 6523
 sp = STACKTOP; //@line 6524
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14512
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14514
 $3 = _malloc($2) | 0; //@line 14515
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 14518
  if (!$5) {
   $$lcssa = 0; //@line 14521
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 14523
   FUNCTION_TABLE_v[$5 & 3](); //@line 14524
   if (!___async) {
    ___async_unwind = 0; //@line 14527
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 185; //@line 14529
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 14531
   sp = STACKTOP; //@line 14532
   return;
  }
 } else {
  $$lcssa = $3; //@line 14536
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 14539
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 13578
 STACKTOP = STACKTOP + 16 | 0; //@line 13579
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13579
 $vararg_buffer = sp; //@line 13580
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 13581
 FUNCTION_TABLE_v[$0 & 3](); //@line 13582
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 200; //@line 13585
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 13587
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 13589
  sp = STACKTOP; //@line 13590
  STACKTOP = sp; //@line 13591
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13593
  _abort_message(8688, $vararg_buffer); //@line 13594
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7802
 $3 = HEAP8[$1 >> 0] | 0; //@line 7803
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7808
  $$lcssa8 = $2; //@line 7808
 } else {
  $$011 = $1; //@line 7810
  $$0710 = $0; //@line 7810
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7812
   $$011 = $$011 + 1 | 0; //@line 7813
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7814
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7815
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7820
  $$lcssa8 = $8; //@line 7820
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7830
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1716
 $2 = HEAP32[303] | 0; //@line 1717
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1718
 _putc($1, $2) | 0; //@line 1719
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 91; //@line 1722
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1724
  sp = STACKTOP; //@line 1725
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1728
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1729
 _fflush($2) | 0; //@line 1730
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 92; //@line 1733
  sp = STACKTOP; //@line 1734
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1737
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7754
 STACKTOP = STACKTOP + 32 | 0; //@line 7755
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7755
 $vararg_buffer = sp; //@line 7756
 HEAP32[$0 + 36 >> 2] = 5; //@line 7759
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7767
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7769
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7771
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7776
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7779
 STACKTOP = sp; //@line 7780
 return $14 | 0; //@line 7780
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 3632
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3634
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3636
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 3637
 _wait_ms(150); //@line 3638
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 71; //@line 3641
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 3642
  HEAP32[$4 >> 2] = $2; //@line 3643
  sp = STACKTOP; //@line 3644
  return;
 }
 ___async_unwind = 0; //@line 3647
 HEAP32[$ReallocAsyncCtx15 >> 2] = 71; //@line 3648
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 3649
 HEAP32[$4 >> 2] = $2; //@line 3650
 sp = STACKTOP; //@line 3651
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 3607
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3609
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3611
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 3612
 _wait_ms(150); //@line 3613
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 72; //@line 3616
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 3617
  HEAP32[$4 >> 2] = $2; //@line 3618
  sp = STACKTOP; //@line 3619
  return;
 }
 ___async_unwind = 0; //@line 3622
 HEAP32[$ReallocAsyncCtx14 >> 2] = 72; //@line 3623
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 3624
 HEAP32[$4 >> 2] = $2; //@line 3625
 sp = STACKTOP; //@line 3626
 return;
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 3582
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3584
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3586
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 3587
 _wait_ms(150); //@line 3588
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 73; //@line 3591
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 3592
  HEAP32[$4 >> 2] = $2; //@line 3593
  sp = STACKTOP; //@line 3594
  return;
 }
 ___async_unwind = 0; //@line 3597
 HEAP32[$ReallocAsyncCtx13 >> 2] = 73; //@line 3598
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 3599
 HEAP32[$4 >> 2] = $2; //@line 3600
 sp = STACKTOP; //@line 3601
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 3557
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3559
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3561
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 3562
 _wait_ms(150); //@line 3563
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 74; //@line 3566
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 3567
  HEAP32[$4 >> 2] = $2; //@line 3568
  sp = STACKTOP; //@line 3569
  return;
 }
 ___async_unwind = 0; //@line 3572
 HEAP32[$ReallocAsyncCtx12 >> 2] = 74; //@line 3573
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 3574
 HEAP32[$4 >> 2] = $2; //@line 3575
 sp = STACKTOP; //@line 3576
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 3532
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3534
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3536
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 3537
 _wait_ms(150); //@line 3538
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 75; //@line 3541
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 3542
  HEAP32[$4 >> 2] = $2; //@line 3543
  sp = STACKTOP; //@line 3544
  return;
 }
 ___async_unwind = 0; //@line 3547
 HEAP32[$ReallocAsyncCtx11 >> 2] = 75; //@line 3548
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 3549
 HEAP32[$4 >> 2] = $2; //@line 3550
 sp = STACKTOP; //@line 3551
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 3507
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3509
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3511
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 3512
 _wait_ms(150); //@line 3513
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 76; //@line 3516
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 3517
  HEAP32[$4 >> 2] = $2; //@line 3518
  sp = STACKTOP; //@line 3519
  return;
 }
 ___async_unwind = 0; //@line 3522
 HEAP32[$ReallocAsyncCtx10 >> 2] = 76; //@line 3523
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 3524
 HEAP32[$4 >> 2] = $2; //@line 3525
 sp = STACKTOP; //@line 3526
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 3257
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3259
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3261
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 3262
 _wait_ms(150); //@line 3263
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 70; //@line 3266
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 3267
  HEAP32[$4 >> 2] = $2; //@line 3268
  sp = STACKTOP; //@line 3269
  return;
 }
 ___async_unwind = 0; //@line 3272
 HEAP32[$ReallocAsyncCtx16 >> 2] = 70; //@line 3273
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 3274
 HEAP32[$4 >> 2] = $2; //@line 3275
 sp = STACKTOP; //@line 3276
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6244
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6246
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6248
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6250
 $8 = HEAP32[$2 + 20 >> 2] | 0; //@line 6252
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 6253
 _fflush($8) | 0; //@line 6254
 if (!___async) {
  ___async_unwind = 0; //@line 6257
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 61; //@line 6259
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 6261
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 6263
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 6265
 sp = STACKTOP; //@line 6266
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3482
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3484
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3486
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 3487
 _wait_ms(150); //@line 3488
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 77; //@line 3491
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 3492
  HEAP32[$4 >> 2] = $2; //@line 3493
  sp = STACKTOP; //@line 3494
  return;
 }
 ___async_unwind = 0; //@line 3497
 HEAP32[$ReallocAsyncCtx9 >> 2] = 77; //@line 3498
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 3499
 HEAP32[$4 >> 2] = $2; //@line 3500
 sp = STACKTOP; //@line 3501
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 3457
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3459
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3461
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 3462
 _wait_ms(400); //@line 3463
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 78; //@line 3466
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 3467
  HEAP32[$4 >> 2] = $2; //@line 3468
  sp = STACKTOP; //@line 3469
  return;
 }
 ___async_unwind = 0; //@line 3472
 HEAP32[$ReallocAsyncCtx8 >> 2] = 78; //@line 3473
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 3474
 HEAP32[$4 >> 2] = $2; //@line 3475
 sp = STACKTOP; //@line 3476
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3432
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3434
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3436
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 3437
 _wait_ms(400); //@line 3438
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 79; //@line 3441
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 3442
  HEAP32[$4 >> 2] = $2; //@line 3443
  sp = STACKTOP; //@line 3444
  return;
 }
 ___async_unwind = 0; //@line 3447
 HEAP32[$ReallocAsyncCtx7 >> 2] = 79; //@line 3448
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 3449
 HEAP32[$4 >> 2] = $2; //@line 3450
 sp = STACKTOP; //@line 3451
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3407
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3409
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3411
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 3412
 _wait_ms(400); //@line 3413
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 80; //@line 3416
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 3417
  HEAP32[$4 >> 2] = $2; //@line 3418
  sp = STACKTOP; //@line 3419
  return;
 }
 ___async_unwind = 0; //@line 3422
 HEAP32[$ReallocAsyncCtx6 >> 2] = 80; //@line 3423
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 3424
 HEAP32[$4 >> 2] = $2; //@line 3425
 sp = STACKTOP; //@line 3426
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3382
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3384
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3386
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 3387
 _wait_ms(400); //@line 3388
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 81; //@line 3391
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 3392
  HEAP32[$4 >> 2] = $2; //@line 3393
  sp = STACKTOP; //@line 3394
  return;
 }
 ___async_unwind = 0; //@line 3397
 HEAP32[$ReallocAsyncCtx5 >> 2] = 81; //@line 3398
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 3399
 HEAP32[$4 >> 2] = $2; //@line 3400
 sp = STACKTOP; //@line 3401
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3357
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3359
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3361
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 3362
 _wait_ms(400); //@line 3363
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 82; //@line 3366
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 3367
  HEAP32[$4 >> 2] = $2; //@line 3368
  sp = STACKTOP; //@line 3369
  return;
 }
 ___async_unwind = 0; //@line 3372
 HEAP32[$ReallocAsyncCtx4 >> 2] = 82; //@line 3373
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 3374
 HEAP32[$4 >> 2] = $2; //@line 3375
 sp = STACKTOP; //@line 3376
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3332
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3334
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3336
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 3337
 _wait_ms(400); //@line 3338
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 3341
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 3342
  HEAP32[$4 >> 2] = $2; //@line 3343
  sp = STACKTOP; //@line 3344
  return;
 }
 ___async_unwind = 0; //@line 3347
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 3348
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 3349
 HEAP32[$4 >> 2] = $2; //@line 3350
 sp = STACKTOP; //@line 3351
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3307
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3309
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3311
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 3312
 _wait_ms(400); //@line 3313
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 3316
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 3317
  HEAP32[$4 >> 2] = $2; //@line 3318
  sp = STACKTOP; //@line 3319
  return;
 }
 ___async_unwind = 0; //@line 3322
 HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 3323
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 3324
 HEAP32[$4 >> 2] = $2; //@line 3325
 sp = STACKTOP; //@line 3326
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3282
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3284
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3286
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 3287
 _wait_ms(400); //@line 3288
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 3291
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 3292
  HEAP32[$4 >> 2] = $2; //@line 3293
  sp = STACKTOP; //@line 3294
  return;
 }
 ___async_unwind = 0; //@line 3297
 HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 3298
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 3299
 HEAP32[$4 >> 2] = $2; //@line 3300
 sp = STACKTOP; //@line 3301
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 7735
 newDynamicTop = oldDynamicTop + increment | 0; //@line 7736
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 7740
  ___setErrNo(12); //@line 7741
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 7745
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 7749
   ___setErrNo(12); //@line 7750
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 7754
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 10617
 } else {
  $$056 = $2; //@line 10619
  $15 = $1; //@line 10619
  $8 = $0; //@line 10619
  while (1) {
   $14 = $$056 + -1 | 0; //@line 10627
   HEAP8[$14 >> 0] = HEAPU8[6351 + ($8 & 15) >> 0] | 0 | $3; //@line 10628
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 10629
   $15 = tempRet0; //@line 10630
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 10635
    break;
   } else {
    $$056 = $14; //@line 10638
   }
  }
 }
 return $$05$lcssa | 0; //@line 10642
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7925
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7927
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7933
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7934
  if ($phitmp) {
   $13 = $11; //@line 7936
  } else {
   ___unlockfile($3); //@line 7938
   $13 = $11; //@line 7939
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7943
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7947
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7950
 }
 return $15 | 0; //@line 7952
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 13543
 $0 = ___cxa_get_globals_fast() | 0; //@line 13544
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 13547
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 13551
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 13563
    _emscripten_alloc_async_context(4, sp) | 0; //@line 13564
    __ZSt11__terminatePFvvE($16); //@line 13565
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 13570
 _emscripten_alloc_async_context(4, sp) | 0; //@line 13571
 __ZSt11__terminatePFvvE($17); //@line 13572
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3902
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3904
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3906
 $8 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 3908
 HEAP16[$2 >> 1] = $8; //@line 3909
 if ($8 << 16 >> 16 <= (HEAP16[$4 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$2 >> 1] = HEAP16[$4 + 40 >> 1] | 0; //@line 3918
 $15 = (HEAP16[$6 >> 1] | 0) + 1 << 16 >> 16; //@line 3920
 HEAP16[$6 >> 1] = $15; //@line 3921
 if ($15 << 16 >> 16 <= (HEAP16[$4 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$6 >> 1] = HEAP16[$4 + 44 >> 1] | 0; //@line 3930
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 8180
 $3 = HEAP8[$1 >> 0] | 0; //@line 8182
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 8186
 $7 = HEAP32[$0 >> 2] | 0; //@line 8187
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 8192
  HEAP32[$0 + 4 >> 2] = 0; //@line 8194
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 8196
  HEAP32[$0 + 28 >> 2] = $14; //@line 8198
  HEAP32[$0 + 20 >> 2] = $14; //@line 8200
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 8206
  $$0 = 0; //@line 8207
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 8210
  $$0 = -1; //@line 8211
 }
 return $$0 | 0; //@line 8213
}
function __ZN6C128327columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2399
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 2402
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2403
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 2404
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 2407
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2409
  sp = STACKTOP; //@line 2410
  return 0; //@line 2411
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2413
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0 | 0; //@line 2420
 }
 return 0; //@line 2422
}
function __ZN6C128324rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2371
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 2374
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2375
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 2376
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 108; //@line 2379
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2381
  sp = STACKTOP; //@line 2382
  return 0; //@line 2383
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2385
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0 | 0; //@line 2392
 }
 return 0; //@line 2394
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 10654
 } else {
  $$06 = $2; //@line 10656
  $11 = $1; //@line 10656
  $7 = $0; //@line 10656
  while (1) {
   $10 = $$06 + -1 | 0; //@line 10661
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 10662
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 10663
   $11 = tempRet0; //@line 10664
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 10669
    break;
   } else {
    $$06 = $10; //@line 10672
   }
  }
 }
 return $$0$lcssa | 0; //@line 10676
}
function ___fmodeflags($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $2 = 0, $3 = 0, $6 = 0, $9 = 0;
 $2 = (_strchr($0, 43) | 0) == 0; //@line 8524
 $3 = HEAP8[$0 >> 0] | 0; //@line 8525
 $$0 = $2 ? $3 << 24 >> 24 != 114 & 1 : 2; //@line 8528
 $6 = (_strchr($0, 120) | 0) == 0; //@line 8530
 $$0$ = $6 ? $$0 : $$0 | 128; //@line 8532
 $9 = (_strchr($0, 101) | 0) == 0; //@line 8534
 $$2 = $9 ? $$0$ : $$0$ | 524288; //@line 8536
 $$2$ = $3 << 24 >> 24 == 114 ? $$2 : $$2 | 64; //@line 8539
 $$4 = $3 << 24 >> 24 == 119 ? $$2$ | 512 : $$2$; //@line 8542
 return ($3 << 24 >> 24 == 97 ? $$4 | 1024 : $$4) | 0; //@line 8546
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14428
 do {
  if (!$0) {
   $3 = 0; //@line 14432
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14434
   $2 = ___dynamic_cast($0, 232, 288, 0) | 0; //@line 14435
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 214; //@line 14438
    sp = STACKTOP; //@line 14439
    return 0; //@line 14440
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 14442
    $3 = ($2 | 0) != 0 & 1; //@line 14445
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 14450
}
function __ZN4mbed8FileBaseD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6382
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6384
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6392
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 6393
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 37; //@line 6396
  sp = STACKTOP; //@line 6397
  return;
 }
 ___async_unwind = 0; //@line 6400
 HEAP32[$ReallocAsyncCtx3 >> 2] = 37; //@line 6401
 sp = STACKTOP; //@line 6402
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 10298
 } else {
  $$04 = 0; //@line 10300
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 10303
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 10307
   $12 = $7 + 1 | 0; //@line 10308
   HEAP32[$0 >> 2] = $12; //@line 10309
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 10315
    break;
   } else {
    $$04 = $11; //@line 10318
   }
  }
 }
 return $$0$lcssa | 0; //@line 10322
}
function __ZN15GraphicsDisplay9characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2842
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 148 >> 2] | 0; //@line 2845
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2850
 FUNCTION_TABLE_viiiiii[$6 & 7]($0, $1 << 3, $2 << 3, 8, 8, 4402 + ($3 + -31 << 3) | 0); //@line 2851
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 116; //@line 2854
  sp = STACKTOP; //@line 2855
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2858
  return;
 }
}
function _invoke_ticker__async_cb_93($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6536
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 6542
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 6543
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6544
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 6545
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 94; //@line 6548
  sp = STACKTOP; //@line 6549
  return;
 }
 ___async_unwind = 0; //@line 6552
 HEAP32[$ReallocAsyncCtx >> 2] = 94; //@line 6553
 sp = STACKTOP; //@line 6554
 return;
}
function __ZN4mbed10FileHandle5lseekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 59
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 62
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 63
 $6 = FUNCTION_TABLE_iiii[$5 & 15]($0, $1, $2) | 0; //@line 64
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 32; //@line 67
  sp = STACKTOP; //@line 68
  return 0; //@line 69
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 71
  return $6 | 0; //@line 72
 }
 return 0; //@line 74
}
function __ZN15GraphicsDisplay7columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2886
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 2889
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2890
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 2891
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 118; //@line 2894
  sp = STACKTOP; //@line 2895
  return 0; //@line 2896
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2898
  return ($4 | 0) / 8 | 0 | 0; //@line 2900
 }
 return 0; //@line 2902
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2865
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 2868
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2869
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 2870
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 117; //@line 2873
  sp = STACKTOP; //@line 2874
  return 0; //@line 2875
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2877
  return ($4 | 0) / 8 | 0 | 0; //@line 2879
 }
 return 0; //@line 2881
}
function __ZN4mbed10FileHandle4tellEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 443
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 446
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 447
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 448
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 451
  sp = STACKTOP; //@line 452
  return 0; //@line 453
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 455
  return $4 | 0; //@line 456
 }
 return 0; //@line 458
}
function _fclose__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4810
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 4813
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4815
 $10 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 4818
 $12 = HEAP32[$4 + 92 >> 2] | 0; //@line 4820
 if ($12 | 0) {
  _free($12); //@line 4823
 }
 if ($6) {
  if ($8 | 0) {
   ___unlockfile($4); //@line 4828
  }
 } else {
  _free($4); //@line 4831
 }
 HEAP32[___async_retval >> 2] = $10; //@line 4834
 return;
}
function __ZN4mbed10FileHandle4flenEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 99
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 102
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 103
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 104
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 107
  sp = STACKTOP; //@line 108
  return 0; //@line 109
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 111
  return $4 | 0; //@line 112
 }
 return 0; //@line 114
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14560
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14562
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 < ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
  $16 = ___async_retval; //@line 14572
  HEAP32[$16 >> 2] = $6; //@line 14573
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 14576
 $16 = ___async_retval; //@line 14577
 HEAP32[$16 >> 2] = $6; //@line 14578
 return;
}
function __ZN4mbed10FileHandle5fsyncEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 79
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 82
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 83
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 84
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 87
  sp = STACKTOP; //@line 88
  return 0; //@line 89
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 91
  return $4 | 0; //@line 92
 }
 return 0; //@line 94
}
function __ZN6C128325_putcEi__async_cb_1($0) {
 $0 = $0 | 0;
 var $16 = 0, $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14586
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14588
 if (!(HEAP32[$2 + 4168 >> 2] | 0)) {
  $16 = ___async_retval; //@line 14593
  HEAP32[$16 >> 2] = $4; //@line 14594
  return;
 }
 _emscripten_asm_const_iiiii(2, HEAP32[$2 + 4172 >> 2] | 0, HEAP32[$2 + 4176 >> 2] | 0, HEAP32[$2 + 4180 >> 2] | 0, $2 + 68 | 0) | 0; //@line 14604
 $16 = ___async_retval; //@line 14605
 HEAP32[$16 >> 2] = $4; //@line 14606
 return;
}
function ___fflush_unlocked__async_cb_100($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7256
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7258
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7260
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7262
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 7264
 HEAP32[$4 >> 2] = 0; //@line 7265
 HEAP32[$6 >> 2] = 0; //@line 7266
 HEAP32[$8 >> 2] = 0; //@line 7267
 HEAP32[$10 >> 2] = 0; //@line 7268
 HEAP32[___async_retval >> 2] = 0; //@line 7270
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1973
 $3 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 1976
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1977
 __ZN4mbed8FileBaseD2Ev($3); //@line 1978
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 1981
  sp = STACKTOP; //@line 1982
  return;
 }
 ___async_unwind = 0; //@line 1985
 HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 1986
 sp = STACKTOP; //@line 1987
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5725
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5727
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5728
 __ZN4mbed8FileBaseD2Ev($2); //@line 5729
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 57; //@line 5732
  sp = STACKTOP; //@line 5733
  return;
 }
 ___async_unwind = 0; //@line 5736
 HEAP32[$ReallocAsyncCtx2 >> 2] = 57; //@line 5737
 sp = STACKTOP; //@line 5738
 return;
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12121
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12122
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 12123
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 177; //@line 12126
  sp = STACKTOP; //@line 12127
  return 0; //@line 12128
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12130
  return $3 | 0; //@line 12131
 }
 return 0; //@line 12133
}
function ___unlist_locked_file($0) {
 $0 = $0 | 0;
 var $$pre = 0, $$sink = 0, $10 = 0, $5 = 0;
 if (HEAP32[$0 + 68 >> 2] | 0) {
  $5 = HEAP32[$0 + 116 >> 2] | 0; //@line 8063
  $$pre = $0 + 112 | 0; //@line 8066
  if ($5 | 0) {
   HEAP32[$5 + 112 >> 2] = HEAP32[$$pre >> 2]; //@line 8070
  }
  $10 = HEAP32[$$pre >> 2] | 0; //@line 8072
  if (!$10) {
   $$sink = (___pthread_self_699() | 0) + 232 | 0; //@line 8077
  } else {
   $$sink = $10 + 116 | 0; //@line 8080
  }
  HEAP32[$$sink >> 2] = $5; //@line 8082
 }
 return;
}
function __ZThn4_N6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2542
 $1 = $0 + -4 | 0; //@line 2543
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2544
 __ZN4mbed6StreamD2Ev($1); //@line 2545
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 2548
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2550
  sp = STACKTOP; //@line 2551
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2554
  __ZdlPv($1); //@line 2555
  return;
 }
}
function _serial_putc__async_cb_71($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5282
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5284
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5285
 _fflush($2) | 0; //@line 5286
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 92; //@line 5289
  sp = STACKTOP; //@line 5290
  return;
 }
 ___async_unwind = 0; //@line 5293
 HEAP32[$ReallocAsyncCtx >> 2] = 92; //@line 5294
 sp = STACKTOP; //@line 5295
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3834
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3838
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $AsyncRetVal; //@line 3839
 if (!$AsyncRetVal) {
  HEAP32[$4 >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 3844
  _error(2065, $4); //@line 3845
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($AsyncRetVal); //@line 3848
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
 $5 = $1 & 65535; //@line 2970
 HEAP16[$0 + 36 >> 1] = $5; //@line 2972
 $7 = $2 & 65535; //@line 2973
 HEAP16[$0 + 38 >> 1] = $7; //@line 2975
 HEAP16[$0 + 40 >> 1] = $5; //@line 2977
 HEAP16[$0 + 42 >> 1] = $1 + 65535 + $3; //@line 2982
 HEAP16[$0 + 44 >> 1] = $7; //@line 2984
 HEAP16[$0 + 46 >> 1] = $2 + 65535 + $4; //@line 2989
 return;
}
function __ZN4mbed10FileHandle6rewindEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 463
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 466
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 467
 FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 0) | 0; //@line 468
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 471
  sp = STACKTOP; //@line 472
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 475
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 7586
 ___async_unwind = 1; //@line 7587
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 7593
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 7597
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 7601
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 7603
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1622
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1624
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1626
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1628
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] = 2574; //@line 1630
 _emscripten_asm_const_iiiii(2, HEAP32[$4 >> 2] | 0, HEAP32[$6 >> 2] | 0, HEAP32[$8 >> 2] | 0, $10 | 0) | 0; //@line 1634
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7491
 STACKTOP = STACKTOP + 16 | 0; //@line 7492
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7492
 $vararg_buffer = sp; //@line 7493
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7497
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7499
 STACKTOP = sp; //@line 7500
 return $5 | 0; //@line 7500
}
function _freopen__async_cb_65($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5030
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5032
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5033
 _fclose($2) | 0; //@line 5034
 if (!___async) {
  ___async_unwind = 0; //@line 5037
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 181; //@line 5039
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 5041
 sp = STACKTOP; //@line 5042
 return;
}
function __ZN6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1966
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1967
 __ZN4mbed6StreamD2Ev($0); //@line 1968
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 101; //@line 1971
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1973
  sp = STACKTOP; //@line 1974
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1977
  __ZdlPv($0); //@line 1978
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 7528
 STACKTOP = STACKTOP + 16 | 0; //@line 7529
 $rem = __stackBase__ | 0; //@line 7530
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 7531
 STACKTOP = __stackBase__; //@line 7532
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 7533
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 7298
 if ((ret | 0) < 8) return ret | 0; //@line 7299
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 7300
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 7301
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 7302
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 7303
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 7304
}
function __Znaj($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12630
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12631
 $1 = __Znwj($0) | 0; //@line 12632
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 186; //@line 12635
  sp = STACKTOP; //@line 12636
  return 0; //@line 12637
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12639
  return $1 | 0; //@line 12640
 }
 return 0; //@line 12642
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 12764
 STACKTOP = STACKTOP + 16 | 0; //@line 12765
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12765
 if (!(_pthread_once(13632, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[3409] | 0) | 0; //@line 12771
  STACKTOP = sp; //@line 12772
  return $3 | 0; //@line 12772
 } else {
  _abort_message(8536, sp); //@line 12774
 }
 return 0; //@line 12777
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12932
 }
 return;
}
function _exit($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1863
 do {
  if ($0 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1867
   _mbed_die(); //@line 1868
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 97; //@line 1871
    sp = STACKTOP; //@line 1872
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1875
    break;
   }
  }
 } while (0);
 while (1) {}
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
  HEAP8[($2 << 7) + $1 + ($0 + 68) >> 0] = ($3 | 0) != 0 & 1; //@line 2473
  return;
 }
 $17 = ($2 << 7) + $1 + ($0 + 68) | 0; //@line 2479
 if (($3 | 0) != 1) {
  return;
 }
 HEAP8[$17 >> 0] = HEAP8[$17 >> 0] ^ 1; //@line 2485
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 12080
 $6 = HEAP32[$5 >> 2] | 0; //@line 12081
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 12082
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 12084
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 12086
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 12089
 return $2 | 0; //@line 12090
}
function __ZL25default_terminate_handlerv__async_cb_83($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6069
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6071
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6073
 HEAP32[$2 >> 2] = 8397; //@line 6074
 HEAP32[$2 + 4 >> 2] = $4; //@line 6076
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 6078
 _abort_message(8261, $2); //@line 6079
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3817
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3818
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(8872, 9, 7, 8, 6, 18, 5729); //@line 3819
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 147; //@line 3822
  sp = STACKTOP; //@line 3823
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3826
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5637
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5639
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5640
 _fputc(10, $2) | 0; //@line 5641
 if (!___async) {
  ___async_unwind = 0; //@line 5644
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 190; //@line 5646
 sp = STACKTOP; //@line 5647
 return;
}
function _setvbuf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = $0 + 75 | 0; //@line 12402
 HEAP8[$4 >> 0] = -1; //@line 12403
 switch ($2 | 0) {
 case 2:
  {
   HEAP32[$0 + 48 >> 2] = 0; //@line 12407
   break;
  }
 case 1:
  {
   HEAP8[$4 >> 0] = 10; //@line 12411
   break;
  }
 default:
  {}
 }
 HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 64; //@line 12419
 return 0; //@line 12420
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5562
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5564
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5568
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 32 >> 2] = $AsyncRetVal; //@line 5570
 HEAP32[$4 >> 2] = $6; //@line 5571
 _sprintf($AsyncRetVal, 5339, $4) | 0; //@line 5572
 return;
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3299
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3301
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 3302
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 129; //@line 3305
  sp = STACKTOP; //@line 3306
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3309
  return;
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14468
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 14471
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 14476
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 14479
 return;
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3731
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3733
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 3734
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 144; //@line 3737
  sp = STACKTOP; //@line 3738
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3741
  return;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 13526
 STACKTOP = STACKTOP + 16 | 0; //@line 13527
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13527
 _free($0); //@line 13529
 if (!(_pthread_setspecific(HEAP32[3409] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13534
  return;
 } else {
  _abort_message(8635, sp); //@line 13536
 }
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1327
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 1338
  $$0 = 1; //@line 1339
 } else {
  $$0 = 0; //@line 1341
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 1345
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1931
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1935
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 1936
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 99; //@line 1939
  sp = STACKTOP; //@line 1940
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1943
  return;
 }
}
function __ZThn4_N6C12832D1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2525
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2527
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 2528
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 2531
  sp = STACKTOP; //@line 2532
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2535
  return;
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1695
 HEAP32[$0 >> 2] = $1; //@line 1696
 HEAP32[2213] = 1; //@line 1697
 $4 = $0; //@line 1698
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1703
 $10 = 8856; //@line 1704
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1706
 HEAP32[$10 + 4 >> 2] = $9; //@line 1709
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13008
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1950
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1951
 _emscripten_sleep($0 | 0); //@line 1952
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 100; //@line 1955
  sp = STACKTOP; //@line 1956
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1959
  return;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 13511
 STACKTOP = STACKTOP + 16 | 0; //@line 13512
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13512
 if (!(_pthread_key_create(13636, 199) | 0)) {
  STACKTOP = sp; //@line 13517
  return;
 } else {
  _abort_message(8585, sp); //@line 13519
 }
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 13072
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 13076
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 7562
 HEAP32[new_frame + 4 >> 2] = sp; //@line 7564
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 7566
 ___async_cur_frame = new_frame; //@line 7567
 return ___async_cur_frame + 8 | 0; //@line 7568
}
function ___ofl_add($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0;
 $1 = ___ofl_lock() | 0; //@line 8668
 HEAP32[$0 + 56 >> 2] = HEAP32[$1 >> 2]; //@line 8671
 $4 = HEAP32[$1 >> 2] | 0; //@line 8672
 if ($4 | 0) {
  HEAP32[$4 + 52 >> 2] = $0; //@line 8676
 }
 HEAP32[$1 >> 2] = $0; //@line 8678
 ___ofl_unlock(); //@line 8679
 return $0 | 0; //@line 8680
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 230
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 234
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 237
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 7551
  return low << bits; //@line 7552
 }
 tempRet0 = low << bits - 32; //@line 7554
 return 0; //@line 7555
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 7540
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 7541
 }
 tempRet0 = 0; //@line 7543
 return high >>> bits - 32 | 0; //@line 7544
}
function __ZN11TextDisplay5_putcEi__async_cb_74($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5429
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 5436
 }
 HEAP32[___async_retval >> 2] = $4; //@line 5439
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5305
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 5312
 }
 HEAP32[___async_retval >> 2] = $4; //@line 5315
 return;
}
function _fflush__async_cb_68($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5160
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 5162
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5165
 return;
}
function __ZN6C128323clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = $0 + 68 | 0; //@line 2428
 _memset($1 | 0, 0, 4096) | 0; //@line 2429
 _emscripten_asm_const_iiiii(2, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $1 | 0) | 0; //@line 2436
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 3725
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 3728
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 3731
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 5547
 } else {
  $$0 = -1; //@line 5549
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 5552
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5891
 if (HEAP32[___async_retval >> 2] | 0) {
  _setbuf($4, 0); //@line 5896
 }
 HEAP32[___async_retval >> 2] = $4; //@line 5899
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 8310
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 8316
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 8320
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 7824
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 7574
 stackRestore(___async_cur_frame | 0); //@line 7575
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 7576
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2602
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 2603
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2605
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1954
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1955
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1957
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11739
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11739
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11741
 return $1 | 0; //@line 11742
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1671
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1677
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 1678
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7657
  $$0 = -1; //@line 7658
 } else {
  $$0 = $0; //@line 7660
 }
 return $$0 | 0; //@line 7662
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 7291
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 7292
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 7293
}
function __ZN6C128326heightEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 128; //@line 2513
   break;
  }
 default:
  {
   $$0 = 32; //@line 2517
  }
 }
 return $$0 | 0; //@line 2520
}
function __ZN6C128325widthEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 32; //@line 2496
   break;
  }
 default:
  {
   $$0 = 128; //@line 2500
  }
 }
 return $$0 | 0; //@line 2503
}
function _freopen__async_cb_66($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5052
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile($4); //@line 5055
 }
 HEAP32[___async_retval >> 2] = $4; //@line 5058
 return;
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0; //@line 6366
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 7283
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 7285
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 7817
}
function __ZN6C128324rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0; //@line 6014
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
 _setvbuf(HEAP32[$0 + 4 >> 2] | 0, 0, 1, HEAP32[___async_retval >> 2] | 0) | 0; //@line 3671
 HEAP8[___async_retval >> 0] = 1; //@line 3674
 return;
}
function __ZN6C1283211copy_to_lcdEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(2, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 2647
 return;
}
function __ZN6C128326_flushEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(2, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 2083
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 7810
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 10799
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10802
 }
 return $$0 | 0; //@line 10804
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8511
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8516
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 7775
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 7520
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7912
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7916
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 6096
 return;
}
function __ZN11TextDisplay6locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP16[$0 + 24 >> 1] = $1; //@line 3704
 HEAP16[$0 + 26 >> 1] = $2; //@line 3707
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_22($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 2813
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 7581
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 7582
}
function __ZN6C128326locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP32[$0 + 60 >> 2] = $1; //@line 2446
 HEAP32[$0 + 64 >> 2] = $2; //@line 2448
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_29($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 3225
 return;
}
function dynCall_viii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 FUNCTION_TABLE_viii[index & 3](a1 | 0, a2 | 0, a3 | 0); //@line 7803
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 7172
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13611
 __ZdlPv($0); //@line 13612
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13294
 __ZdlPv($0); //@line 13295
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 8446
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 8448
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 14500
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12822
 __ZdlPv($0); //@line 12823
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 10284
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
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 7184
 return;
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 7768
}
function b88(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(7); //@line 8065
}
function b87(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 8062
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 13019
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[3410] | 0; //@line 14384
 HEAP32[3410] = $0 + 0; //@line 14386
 return $0 | 0; //@line 14388
}
function __ZN4mbed10FileHandle5lseekEii__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5909
 return;
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6376
 return;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14489
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[428] | 0; //@line 13601
 HEAP32[428] = $0 + 0; //@line 13603
 return $0 | 0; //@line 13605
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4881
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
 FUNCTION_TABLE_vii[index & 7](a1 | 0, a2 | 0); //@line 7796
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_3($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 12 >> 2]; //@line 14694
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_99($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 7161
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 7608
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_78($0) {
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
 HEAP32[$0 + 4168 >> 2] = ($1 | 0) != 0 & 1; //@line 2667
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_88($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 6306
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b85(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(7); //@line 8059
}
function b84(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(6); //@line 8056
}
function b83(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(5); //@line 8053
}
function b82(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 8050
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 10747
}
function _fflush__async_cb_69($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5175
 return;
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5754
 return;
}
function _fputc__async_cb_20($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2615
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5264
 return;
}
function _putc__async_cb_15($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1967
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 31](a1 | 0) | 0; //@line 7761
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1451
 return;
}
function __ZN11TextDisplay10foregroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 28 >> 1] = $1; //@line 3716
 return;
}
function __ZN11TextDisplay10backgroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 30 >> 1] = $1; //@line 3725
 return;
}
function b24(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(15); //@line 7891
 return 0; //@line 7891
}
function b23(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(14); //@line 7888
 return 0; //@line 7888
}
function b22(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(13); //@line 7885
 return 0; //@line 7885
}
function b21(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(12); //@line 7882
 return 0; //@line 7882
}
function b20(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(11); //@line 7879
 return 0; //@line 7879
}
function _error__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_realloc_async_context(4) | 0; //@line 3238
 _exit(1); //@line 3239
}
function b19(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 7876
 return 0; //@line 7876
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(8688, HEAP32[$0 + 4 >> 2] | 0); //@line 3660
}
function _setbuf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _setvbuf($0, $1, $1 | 0 ? 0 : 2, 1024) | 0; //@line 12392
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb_81($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5881
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 7789
}
function b80(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(7); //@line 8047
}
function b79(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 8044
}
function __ZN6C128327setmodeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 52 >> 2] = $1; //@line 2656
 return;
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 14548
 return;
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0 | 0;
 _setbuf($0, 0); //@line 1887
 return;
}
function __ZN4mbed6Stream4seekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return 0; //@line 788
}
function __ZN6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 3824
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11992
}
function _freopen__async_cb_64($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 5024
 return;
}
function b17(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(7); //@line 7873
 return 0; //@line 7873
}
function b16(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(6); //@line 7870
 return 0; //@line 7870
}
function b15(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(0); //@line 7867
 return 0; //@line 7867
}
function __ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 3944
 return;
}
function b77(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(3); //@line 8041
}
function b76(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(0); //@line 8038
}
function __ZNK4mbed10FileHandle4pollEs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return 17; //@line 128
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
 FUNCTION_TABLE_v[index & 3](); //@line 7782
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7789
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_ii(31); //@line 7864
 return 0; //@line 7864
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_ii(30); //@line 7861
 return 0; //@line 7861
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_ii(29); //@line 7858
 return 0; //@line 7858
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_ii(28); //@line 7855
 return 0; //@line 7855
}
function __ZThn4_N15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 3317
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_ii(27); //@line 7852
 return 0; //@line 7852
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_ii(26); //@line 7849
 return 0; //@line 7849
}
function b7(p0) {
 p0 = p0 | 0;
 nullFunc_ii(25); //@line 7846
 return 0; //@line 7846
}
function b6(p0) {
 p0 = p0 | 0;
 nullFunc_ii(24); //@line 7843
 return 0; //@line 7843
}
function b5(p0) {
 p0 = p0 | 0;
 nullFunc_ii(23); //@line 7840
 return 0; //@line 7840
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(22); //@line 7837
 return 0; //@line 7837
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(21); //@line 7834
 return 0; //@line 7834
}
function b2(p0) {
 p0 = p0 | 0;
 nullFunc_ii(20); //@line 7831
 return 0; //@line 7831
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 7828
 return 0; //@line 7828
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 3749
}
function __ZN15GraphicsDisplay9characterEiii__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(13620); //@line 8685
 return 13628; //@line 8686
}
function __ZN4mbed11NonCopyableINS_10FileHandleEED2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 438
}
function __ZN15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2833
}
function b74(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(7); //@line 8035
}
function b73(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(6); //@line 8032
}
function b72(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(5); //@line 8029
}
function b71(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 8026
}
function __ZThn4_N4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 875
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandleD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 425
}
function _abort_message__async_cb_77($0) {
 $0 = $0 | 0;
 _abort(); //@line 5654
}
function __ZN4mbed10FileHandle4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 432
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
 ___cxa_pure_virtual(); //@line 7897
}
function __ZThn4_N15GraphicsDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandle6rewindEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_86($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 3361
}
function __ZN4mbed6Stream6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 806
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb_79($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 577
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 794
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 11913
}
function __ZN4mbed6Stream4tellEv($0) {
 $0 = $0 | 0;
 return 0; //@line 812
}
function __ZN4mbed6Stream4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 800
}
function __ZN4mbed6Stream4sizeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 824
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11919
}
function ___pthread_self_699() {
 return _pthread_self() | 0; //@line 8096
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb_91($0) {
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
 _free($0); //@line 12648
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb_16($0) {
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
 ___unlock(13620); //@line 8691
 return;
}
function __ZN11TextDisplay5_getcEv($0) {
 $0 = $0 | 0;
 return -1;
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 8023
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 8020
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 8017
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 8014
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 8011
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 8008
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 8005
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 8002
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 7999
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 7996
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 7993
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 7990
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 7987
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 7984
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 7981
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 7978
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 7975
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 7972
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 7969
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 7966
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 7963
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 7960
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 7957
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 7954
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 7951
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 7948
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 7945
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 7942
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 7939
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 7936
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 7933
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 7930
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 7927
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 7924
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 7921
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 7918
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 7915
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 7912
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 7909
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 7906
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 7903
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 7673
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 8102
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
 nullFunc_vi(0); //@line 7900
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
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _exit__async_cb($0) {
 $0 = $0 | 0;
 while (1) {}
}
function ___errno_location() {
 return 13616; //@line 7667
}
function __ZSt9terminatev__async_cb_67($0) {
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
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _pthread_self() {
 return 1344; //@line 7794
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function _error__async_cb_30($0) {
 $0 = $0 | 0;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b26() {
 nullFunc_v(0); //@line 7894
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,__ZN4mbed10FileHandle4syncEv,__ZN4mbed10FileHandle6isattyEv,__ZN4mbed10FileHandle4tellEv,__ZN4mbed10FileHandle4sizeEv,__ZN4mbed10FileHandle5fsyncEv,__ZN4mbed10FileHandle4flenEv,__ZN4mbed6Stream5closeEv,__ZN4mbed6Stream4syncEv,__ZN4mbed6Stream6isattyEv,__ZN4mbed6Stream4tellEv,__ZN4mbed6Stream4sizeEv,__ZN11TextDisplay5_getcEv,__ZN6C128324rowsEv,__ZN6C128327columnsEv,__ZN6C128325widthEv,__ZN6C128326heightEv,__ZN15GraphicsDisplay4rowsEv,__ZN15GraphicsDisplay7columnsEv,___stdio_close,b2,b3,b4,b5,b6,b7,b8,b9,b10
,b11,b12,b13];
var FUNCTION_TABLE_iii = [b15,__ZN4mbed10FileHandle12set_blockingEb,__ZNK4mbed10FileHandle4pollEs,__ZN6C128325_putcEi,__ZN11TextDisplay5claimEP8_IO_FILE,__ZN11TextDisplay5_putcEi,b16,b17];
var FUNCTION_TABLE_iiii = [b19,__ZN4mbed10FileHandle5lseekEii,__ZN4mbed6Stream4readEPvj,__ZN4mbed6Stream5writeEPKvj,__ZN4mbed6Stream4seekEii,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_read,b20,b21,b22,b23,b24];
var FUNCTION_TABLE_v = [b26,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b28,__ZN4mbed8FileBaseD2Ev,__ZN4mbed8FileBaseD0Ev,__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev,__ZN4mbed10FileHandleD0Ev,__ZN4mbed10FileHandle6rewindEv,__ZN4mbed6StreamD2Ev,__ZN4mbed6StreamD0Ev,__ZN4mbed6Stream6rewindEv,__ZN4mbed6Stream4lockEv,__ZN4mbed6Stream6unlockEv,__ZThn4_N4mbed6StreamD1Ev,__ZThn4_N4mbed6StreamD0Ev,__ZN6C12832D0Ev,__ZN6C128326_flushEv,__ZN6C128323clsEv,__ZThn4_N6C12832D1Ev,__ZThn4_N6C12832D0Ev,__ZN15GraphicsDisplayD0Ev,__ZN15GraphicsDisplay3clsEv,__ZThn4_N15GraphicsDisplayD1Ev,__ZThn4_N15GraphicsDisplayD0Ev,__ZN11TextDisplayD0Ev,__ZN11TextDisplay3clsEv,__ZThn4_N11TextDisplayD1Ev,__ZThn4_N11TextDisplayD0Ev,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev
,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_90,__ZN4mbed8FileBaseD2Ev__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_91,__ZN4mbed8FileBaseD0Ev__async_cb_80,__ZN4mbed8FileBaseD0Ev__async_cb,__ZN4mbed8FileBaseD0Ev__async_cb_81,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_11,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb,__ZN4mbed10FileHandle4tellEv__async_cb,__ZN4mbed10FileHandle6rewindEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_98,__ZN4mbed10FileHandle4sizeEv__async_cb_99,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD2Ev__async_cb_16,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_28,__ZN4mbed6Stream4readEPvj__async_cb_29,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_21,__ZN4mbed6Stream5writeEPKvj__async_cb_22,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD1Ev__async_cb_79,__ZN4mbed6StreamC2EPKc__async_cb_48
,__ZN4mbed6StreamC2EPKc__async_cb,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_89,__ZN4mbed6Stream4putcEi__async_cb_87,__ZN4mbed6Stream4putcEi__async_cb_88,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_5,__ZN4mbed6Stream6printfEPKcz__async_cb_2,__ZN4mbed6Stream6printfEPKcz__async_cb_3,__ZN4mbed6Stream6printfEPKcz__async_cb_4,_mbed_assert_internal__async_cb,_mbed_die__async_cb_45,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_printf__async_cb_82,_mbed_error_vfprintf__async_cb
,_mbed_error_vfprintf__async_cb_17,_error__async_cb,_serial_putc__async_cb_71,_serial_putc__async_cb,_invoke_ticker__async_cb_93,_invoke_ticker__async_cb,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_6,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb,_exit__async_cb,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,_wait_ms__async_cb,__ZN6C12832D0Ev__async_cb,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_1,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_7,__ZN6C128329characterEiii__async_cb_8,__ZN6C128329characterEiii__async_cb_9,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_13,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb_18,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb
,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_85,__ZN15GraphicsDisplay3clsEv__async_cb_86,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_47,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_19,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_12,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_92,__ZN15GraphicsDisplayC2EPKc__async_cb,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_72,__ZN11TextDisplay5_putcEi__async_cb_73,__ZN11TextDisplay5_putcEi__async_cb_74,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_46,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_23,__ZN11TextDisplay3clsEv__async_cb_24,__ZN11TextDisplay3clsEv__async_cb_27,__ZN11TextDisplay3clsEv__async_cb_25,__ZN11TextDisplay3clsEv__async_cb_26,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_76,__ZN11TextDisplayC2EPKc__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_50
,_main__async_cb_49,_main__async_cb_58,_main__async_cb_57,_main__async_cb_62,_main__async_cb_56,_main__async_cb_55,_main__async_cb_61,_main__async_cb_54,_main__async_cb_53,_main__async_cb_60,_main__async_cb_52,_main__async_cb_51,_main__async_cb_59,_main__async_cb,_putc__async_cb_15,_putc__async_cb,___overflow__async_cb,_fclose__async_cb_63,_fclose__async_cb,_fflush__async_cb_69,_fflush__async_cb_68,_fflush__async_cb_70,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_100,_vfprintf__async_cb,_vsnprintf__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_freopen__async_cb
,_freopen__async_cb_66,_freopen__async_cb_65,_freopen__async_cb_64,_fputc__async_cb_20,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_83,_abort_message__async_cb,_abort_message__async_cb_77,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_10,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_84,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_78,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_14,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_97,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_96,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_95,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_75
,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52
,b53,b54,b55,b56,b57,b58,b59,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69];
var FUNCTION_TABLE_vii = [b71,__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE,__ZN11TextDisplay10foregroundEt,__ZN11TextDisplay10backgroundEt,__ZN15GraphicsDisplay4putpEi,b72,b73,b74];
var FUNCTION_TABLE_viii = [b76,__ZN6C128326locateEii,__ZN11TextDisplay6locateEii,b77];
var FUNCTION_TABLE_viiii = [b79,__ZN6C128329characterEiii,__ZN6C128325pixelEiii,__ZN15GraphicsDisplay9characterEiii,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b80];
var FUNCTION_TABLE_viiiii = [b82,__ZN15GraphicsDisplay6windowEiiii,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b83,b84,b85];
var FUNCTION_TABLE_viiiiii = [b87,__ZN15GraphicsDisplay4fillEiiiii,__ZN15GraphicsDisplay4blitEiiiiPKi,__ZN15GraphicsDisplay7blitbitEiiiiPKc,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b88];

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
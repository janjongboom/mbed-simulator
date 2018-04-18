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
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1, $2, $3) { MbedJSHal.gpio.init_pwmout($0, $1, $2, $3); },
 function($0) { return MbedJSHal.gpio.read($0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5104;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "pwmout.js.mem";





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



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
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



var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0", "0"];
var debug_table_vi = ["0", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb_5", "_mbed_die__async_cb_4", "_mbed_die__async_cb_3", "_mbed_die__async_cb_2", "_mbed_die__async_cb", "_invoke_ticker__async_cb_20", "_invoke_ticker__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "_main__async_cb", "_fflush__async_cb_18", "_fflush__async_cb_17", "_fflush__async_cb_19", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_22", "_vfprintf__async_cb", "_printf__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_21", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_1", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_23", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "0"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "0"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "0"];
function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vi: " + debug_table_vi[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

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

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var ___lock=env.___lock;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 643
 STACKTOP = STACKTOP + 16 | 0; //@line 644
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 644
 $1 = sp; //@line 645
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 652
   $7 = $6 >>> 3; //@line 653
   $8 = HEAP32[872] | 0; //@line 654
   $9 = $8 >>> $7; //@line 655
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 661
    $16 = 3528 + ($14 << 1 << 2) | 0; //@line 663
    $17 = $16 + 8 | 0; //@line 664
    $18 = HEAP32[$17 >> 2] | 0; //@line 665
    $19 = $18 + 8 | 0; //@line 666
    $20 = HEAP32[$19 >> 2] | 0; //@line 667
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[872] = $8 & ~(1 << $14); //@line 674
     } else {
      if ((HEAP32[876] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 679
      }
      $27 = $20 + 12 | 0; //@line 682
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 686
       HEAP32[$17 >> 2] = $20; //@line 687
       break;
      } else {
       _abort(); //@line 690
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 695
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 698
    $34 = $18 + $30 + 4 | 0; //@line 700
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 703
    $$0 = $19; //@line 704
    STACKTOP = sp; //@line 705
    return $$0 | 0; //@line 705
   }
   $37 = HEAP32[874] | 0; //@line 707
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 713
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 716
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 719
     $49 = $47 >>> 12 & 16; //@line 721
     $50 = $47 >>> $49; //@line 722
     $52 = $50 >>> 5 & 8; //@line 724
     $54 = $50 >>> $52; //@line 726
     $56 = $54 >>> 2 & 4; //@line 728
     $58 = $54 >>> $56; //@line 730
     $60 = $58 >>> 1 & 2; //@line 732
     $62 = $58 >>> $60; //@line 734
     $64 = $62 >>> 1 & 1; //@line 736
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 739
     $69 = 3528 + ($67 << 1 << 2) | 0; //@line 741
     $70 = $69 + 8 | 0; //@line 742
     $71 = HEAP32[$70 >> 2] | 0; //@line 743
     $72 = $71 + 8 | 0; //@line 744
     $73 = HEAP32[$72 >> 2] | 0; //@line 745
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 751
       HEAP32[872] = $77; //@line 752
       $98 = $77; //@line 753
      } else {
       if ((HEAP32[876] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 758
       }
       $80 = $73 + 12 | 0; //@line 761
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 765
        HEAP32[$70 >> 2] = $73; //@line 766
        $98 = $8; //@line 767
        break;
       } else {
        _abort(); //@line 770
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 775
     $84 = $83 - $6 | 0; //@line 776
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 779
     $87 = $71 + $6 | 0; //@line 780
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 783
     HEAP32[$71 + $83 >> 2] = $84; //@line 785
     if ($37 | 0) {
      $92 = HEAP32[877] | 0; //@line 788
      $93 = $37 >>> 3; //@line 789
      $95 = 3528 + ($93 << 1 << 2) | 0; //@line 791
      $96 = 1 << $93; //@line 792
      if (!($98 & $96)) {
       HEAP32[872] = $98 | $96; //@line 797
       $$0199 = $95; //@line 799
       $$pre$phiZ2D = $95 + 8 | 0; //@line 799
      } else {
       $101 = $95 + 8 | 0; //@line 801
       $102 = HEAP32[$101 >> 2] | 0; //@line 802
       if ((HEAP32[876] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 806
       } else {
        $$0199 = $102; //@line 809
        $$pre$phiZ2D = $101; //@line 809
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 812
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 814
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 816
      HEAP32[$92 + 12 >> 2] = $95; //@line 818
     }
     HEAP32[874] = $84; //@line 820
     HEAP32[877] = $87; //@line 821
     $$0 = $72; //@line 822
     STACKTOP = sp; //@line 823
     return $$0 | 0; //@line 823
    }
    $108 = HEAP32[873] | 0; //@line 825
    if (!$108) {
     $$0197 = $6; //@line 828
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 832
     $114 = $112 >>> 12 & 16; //@line 834
     $115 = $112 >>> $114; //@line 835
     $117 = $115 >>> 5 & 8; //@line 837
     $119 = $115 >>> $117; //@line 839
     $121 = $119 >>> 2 & 4; //@line 841
     $123 = $119 >>> $121; //@line 843
     $125 = $123 >>> 1 & 2; //@line 845
     $127 = $123 >>> $125; //@line 847
     $129 = $127 >>> 1 & 1; //@line 849
     $134 = HEAP32[3792 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 854
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 858
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 864
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 867
      $$0193$lcssa$i = $138; //@line 867
     } else {
      $$01926$i = $134; //@line 869
      $$01935$i = $138; //@line 869
      $146 = $143; //@line 869
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 874
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 875
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 876
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 877
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 883
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 886
        $$0193$lcssa$i = $$$0193$i; //@line 886
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 889
        $$01935$i = $$$0193$i; //@line 889
       }
      }
     }
     $157 = HEAP32[876] | 0; //@line 893
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 896
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 899
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 902
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 906
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 908
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 912
       $176 = HEAP32[$175 >> 2] | 0; //@line 913
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 916
        $179 = HEAP32[$178 >> 2] | 0; //@line 917
        if (!$179) {
         $$3$i = 0; //@line 920
         break;
        } else {
         $$1196$i = $179; //@line 923
         $$1198$i = $178; //@line 923
        }
       } else {
        $$1196$i = $176; //@line 926
        $$1198$i = $175; //@line 926
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 929
        $182 = HEAP32[$181 >> 2] | 0; //@line 930
        if ($182 | 0) {
         $$1196$i = $182; //@line 933
         $$1198$i = $181; //@line 933
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 936
        $185 = HEAP32[$184 >> 2] | 0; //@line 937
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 942
         $$1198$i = $184; //@line 942
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 947
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 950
        $$3$i = $$1196$i; //@line 951
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 956
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 959
       }
       $169 = $167 + 12 | 0; //@line 962
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 966
       }
       $172 = $164 + 8 | 0; //@line 969
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 973
        HEAP32[$172 >> 2] = $167; //@line 974
        $$3$i = $164; //@line 975
        break;
       } else {
        _abort(); //@line 978
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 987
       $191 = 3792 + ($190 << 2) | 0; //@line 988
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 993
         if (!$$3$i) {
          HEAP32[873] = $108 & ~(1 << $190); //@line 999
          break L73;
         }
        } else {
         if ((HEAP32[876] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1006
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1014
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[876] | 0; //@line 1024
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1027
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1031
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1033
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1039
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1043
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1045
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1051
       if ($214 | 0) {
        if ((HEAP32[876] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1057
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1061
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1063
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1071
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1074
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1076
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1079
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1083
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1086
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1088
      if ($37 | 0) {
       $234 = HEAP32[877] | 0; //@line 1091
       $235 = $37 >>> 3; //@line 1092
       $237 = 3528 + ($235 << 1 << 2) | 0; //@line 1094
       $238 = 1 << $235; //@line 1095
       if (!($8 & $238)) {
        HEAP32[872] = $8 | $238; //@line 1100
        $$0189$i = $237; //@line 1102
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1102
       } else {
        $242 = $237 + 8 | 0; //@line 1104
        $243 = HEAP32[$242 >> 2] | 0; //@line 1105
        if ((HEAP32[876] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1109
        } else {
         $$0189$i = $243; //@line 1112
         $$pre$phi$iZ2D = $242; //@line 1112
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1115
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1117
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1119
       HEAP32[$234 + 12 >> 2] = $237; //@line 1121
      }
      HEAP32[874] = $$0193$lcssa$i; //@line 1123
      HEAP32[877] = $159; //@line 1124
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1127
     STACKTOP = sp; //@line 1128
     return $$0 | 0; //@line 1128
    }
   } else {
    $$0197 = $6; //@line 1131
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1136
   } else {
    $251 = $0 + 11 | 0; //@line 1138
    $252 = $251 & -8; //@line 1139
    $253 = HEAP32[873] | 0; //@line 1140
    if (!$253) {
     $$0197 = $252; //@line 1143
    } else {
     $255 = 0 - $252 | 0; //@line 1145
     $256 = $251 >>> 8; //@line 1146
     if (!$256) {
      $$0358$i = 0; //@line 1149
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1153
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1157
       $262 = $256 << $261; //@line 1158
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1161
       $267 = $262 << $265; //@line 1163
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1166
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1171
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 1177
      }
     }
     $282 = HEAP32[3792 + ($$0358$i << 2) >> 2] | 0; //@line 1181
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 1185
       $$3$i203 = 0; //@line 1185
       $$3350$i = $255; //@line 1185
       label = 81; //@line 1186
      } else {
       $$0342$i = 0; //@line 1193
       $$0347$i = $255; //@line 1193
       $$0353$i = $282; //@line 1193
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 1193
       $$0362$i = 0; //@line 1193
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 1198
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 1203
          $$435113$i = 0; //@line 1203
          $$435712$i = $$0353$i; //@line 1203
          label = 85; //@line 1204
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 1207
          $$1348$i = $292; //@line 1207
         }
        } else {
         $$1343$i = $$0342$i; //@line 1210
         $$1348$i = $$0347$i; //@line 1210
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 1213
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 1216
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 1220
        $302 = ($$0353$i | 0) == 0; //@line 1221
        if ($302) {
         $$2355$i = $$1363$i; //@line 1226
         $$3$i203 = $$1343$i; //@line 1226
         $$3350$i = $$1348$i; //@line 1226
         label = 81; //@line 1227
         break;
        } else {
         $$0342$i = $$1343$i; //@line 1230
         $$0347$i = $$1348$i; //@line 1230
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 1230
         $$0362$i = $$1363$i; //@line 1230
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 1240
       $309 = $253 & ($306 | 0 - $306); //@line 1243
       if (!$309) {
        $$0197 = $252; //@line 1246
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 1251
       $315 = $313 >>> 12 & 16; //@line 1253
       $316 = $313 >>> $315; //@line 1254
       $318 = $316 >>> 5 & 8; //@line 1256
       $320 = $316 >>> $318; //@line 1258
       $322 = $320 >>> 2 & 4; //@line 1260
       $324 = $320 >>> $322; //@line 1262
       $326 = $324 >>> 1 & 2; //@line 1264
       $328 = $324 >>> $326; //@line 1266
       $330 = $328 >>> 1 & 1; //@line 1268
       $$4$ph$i = 0; //@line 1274
       $$4357$ph$i = HEAP32[3792 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 1274
      } else {
       $$4$ph$i = $$3$i203; //@line 1276
       $$4357$ph$i = $$2355$i; //@line 1276
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 1280
       $$4351$lcssa$i = $$3350$i; //@line 1280
      } else {
       $$414$i = $$4$ph$i; //@line 1282
       $$435113$i = $$3350$i; //@line 1282
       $$435712$i = $$4357$ph$i; //@line 1282
       label = 85; //@line 1283
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 1288
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 1292
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 1293
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 1294
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 1295
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1301
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 1304
        $$4351$lcssa$i = $$$4351$i; //@line 1304
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 1307
        $$435113$i = $$$4351$i; //@line 1307
        label = 85; //@line 1308
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 1314
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[874] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[876] | 0; //@line 1320
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 1323
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 1326
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 1329
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 1333
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 1335
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 1339
         $371 = HEAP32[$370 >> 2] | 0; //@line 1340
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 1343
          $374 = HEAP32[$373 >> 2] | 0; //@line 1344
          if (!$374) {
           $$3372$i = 0; //@line 1347
           break;
          } else {
           $$1370$i = $374; //@line 1350
           $$1374$i = $373; //@line 1350
          }
         } else {
          $$1370$i = $371; //@line 1353
          $$1374$i = $370; //@line 1353
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 1356
          $377 = HEAP32[$376 >> 2] | 0; //@line 1357
          if ($377 | 0) {
           $$1370$i = $377; //@line 1360
           $$1374$i = $376; //@line 1360
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 1363
          $380 = HEAP32[$379 >> 2] | 0; //@line 1364
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 1369
           $$1374$i = $379; //@line 1369
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 1374
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 1377
          $$3372$i = $$1370$i; //@line 1378
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 1383
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 1386
         }
         $364 = $362 + 12 | 0; //@line 1389
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 1393
         }
         $367 = $359 + 8 | 0; //@line 1396
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 1400
          HEAP32[$367 >> 2] = $362; //@line 1401
          $$3372$i = $359; //@line 1402
          break;
         } else {
          _abort(); //@line 1405
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 1413
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 1416
         $386 = 3792 + ($385 << 2) | 0; //@line 1417
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 1422
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 1427
            HEAP32[873] = $391; //@line 1428
            $475 = $391; //@line 1429
            break L164;
           }
          } else {
           if ((HEAP32[876] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 1436
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 1444
            if (!$$3372$i) {
             $475 = $253; //@line 1447
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[876] | 0; //@line 1455
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 1458
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 1462
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 1464
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 1470
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 1474
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 1476
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 1482
         if (!$409) {
          $475 = $253; //@line 1485
         } else {
          if ((HEAP32[876] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 1490
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 1494
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 1496
           $475 = $253; //@line 1497
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 1506
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 1509
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 1511
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 1514
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 1518
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 1521
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 1523
         $428 = $$4351$lcssa$i >>> 3; //@line 1524
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 3528 + ($428 << 1 << 2) | 0; //@line 1528
          $432 = HEAP32[872] | 0; //@line 1529
          $433 = 1 << $428; //@line 1530
          if (!($432 & $433)) {
           HEAP32[872] = $432 | $433; //@line 1535
           $$0368$i = $431; //@line 1537
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 1537
          } else {
           $437 = $431 + 8 | 0; //@line 1539
           $438 = HEAP32[$437 >> 2] | 0; //@line 1540
           if ((HEAP32[876] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 1544
           } else {
            $$0368$i = $438; //@line 1547
            $$pre$phi$i211Z2D = $437; //@line 1547
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 1550
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 1552
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 1554
          HEAP32[$354 + 12 >> 2] = $431; //@line 1556
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 1559
         if (!$444) {
          $$0361$i = 0; //@line 1562
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 1566
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 1570
           $450 = $444 << $449; //@line 1571
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 1574
           $455 = $450 << $453; //@line 1576
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 1579
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 1584
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 1590
          }
         }
         $469 = 3792 + ($$0361$i << 2) | 0; //@line 1593
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 1595
         $471 = $354 + 16 | 0; //@line 1596
         HEAP32[$471 + 4 >> 2] = 0; //@line 1598
         HEAP32[$471 >> 2] = 0; //@line 1599
         $473 = 1 << $$0361$i; //@line 1600
         if (!($475 & $473)) {
          HEAP32[873] = $475 | $473; //@line 1605
          HEAP32[$469 >> 2] = $354; //@line 1606
          HEAP32[$354 + 24 >> 2] = $469; //@line 1608
          HEAP32[$354 + 12 >> 2] = $354; //@line 1610
          HEAP32[$354 + 8 >> 2] = $354; //@line 1612
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 1621
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 1621
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 1628
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 1632
          $494 = HEAP32[$492 >> 2] | 0; //@line 1634
          if (!$494) {
           label = 136; //@line 1637
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 1640
           $$0345$i = $494; //@line 1640
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[876] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 1647
          } else {
           HEAP32[$492 >> 2] = $354; //@line 1650
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 1652
           HEAP32[$354 + 12 >> 2] = $354; //@line 1654
           HEAP32[$354 + 8 >> 2] = $354; //@line 1656
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 1661
          $502 = HEAP32[$501 >> 2] | 0; //@line 1662
          $503 = HEAP32[876] | 0; //@line 1663
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 1669
           HEAP32[$501 >> 2] = $354; //@line 1670
           HEAP32[$354 + 8 >> 2] = $502; //@line 1672
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 1674
           HEAP32[$354 + 24 >> 2] = 0; //@line 1676
           break;
          } else {
           _abort(); //@line 1679
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 1686
       STACKTOP = sp; //@line 1687
       return $$0 | 0; //@line 1687
      } else {
       $$0197 = $252; //@line 1689
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[874] | 0; //@line 1696
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 1699
  $515 = HEAP32[877] | 0; //@line 1700
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 1703
   HEAP32[877] = $517; //@line 1704
   HEAP32[874] = $514; //@line 1705
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 1708
   HEAP32[$515 + $512 >> 2] = $514; //@line 1710
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 1713
  } else {
   HEAP32[874] = 0; //@line 1715
   HEAP32[877] = 0; //@line 1716
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 1719
   $526 = $515 + $512 + 4 | 0; //@line 1721
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 1724
  }
  $$0 = $515 + 8 | 0; //@line 1727
  STACKTOP = sp; //@line 1728
  return $$0 | 0; //@line 1728
 }
 $530 = HEAP32[875] | 0; //@line 1730
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 1733
  HEAP32[875] = $532; //@line 1734
  $533 = HEAP32[878] | 0; //@line 1735
  $534 = $533 + $$0197 | 0; //@line 1736
  HEAP32[878] = $534; //@line 1737
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 1740
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 1743
  $$0 = $533 + 8 | 0; //@line 1745
  STACKTOP = sp; //@line 1746
  return $$0 | 0; //@line 1746
 }
 if (!(HEAP32[990] | 0)) {
  HEAP32[992] = 4096; //@line 1751
  HEAP32[991] = 4096; //@line 1752
  HEAP32[993] = -1; //@line 1753
  HEAP32[994] = -1; //@line 1754
  HEAP32[995] = 0; //@line 1755
  HEAP32[983] = 0; //@line 1756
  HEAP32[990] = $1 & -16 ^ 1431655768; //@line 1760
  $548 = 4096; //@line 1761
 } else {
  $548 = HEAP32[992] | 0; //@line 1764
 }
 $545 = $$0197 + 48 | 0; //@line 1766
 $546 = $$0197 + 47 | 0; //@line 1767
 $547 = $548 + $546 | 0; //@line 1768
 $549 = 0 - $548 | 0; //@line 1769
 $550 = $547 & $549; //@line 1770
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 1773
  STACKTOP = sp; //@line 1774
  return $$0 | 0; //@line 1774
 }
 $552 = HEAP32[982] | 0; //@line 1776
 if ($552 | 0) {
  $554 = HEAP32[980] | 0; //@line 1779
  $555 = $554 + $550 | 0; //@line 1780
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 1785
   STACKTOP = sp; //@line 1786
   return $$0 | 0; //@line 1786
  }
 }
 L244 : do {
  if (!(HEAP32[983] & 4)) {
   $561 = HEAP32[878] | 0; //@line 1794
   L246 : do {
    if (!$561) {
     label = 163; //@line 1798
    } else {
     $$0$i$i = 3936; //@line 1800
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 1802
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 1805
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 1814
      if (!$570) {
       label = 163; //@line 1817
       break L246;
      } else {
       $$0$i$i = $570; //@line 1820
      }
     }
     $595 = $547 - $530 & $549; //@line 1824
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 1827
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 1835
       } else {
        $$723947$i = $595; //@line 1837
        $$748$i = $597; //@line 1837
        label = 180; //@line 1838
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 1842
       $$2253$ph$i = $595; //@line 1842
       label = 171; //@line 1843
      }
     } else {
      $$2234243136$i = 0; //@line 1846
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 1852
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 1855
     } else {
      $574 = $572; //@line 1857
      $575 = HEAP32[991] | 0; //@line 1858
      $576 = $575 + -1 | 0; //@line 1859
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 1867
      $584 = HEAP32[980] | 0; //@line 1868
      $585 = $$$i + $584 | 0; //@line 1869
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[982] | 0; //@line 1874
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 1881
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 1885
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 1888
        $$748$i = $572; //@line 1888
        label = 180; //@line 1889
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 1892
        $$2253$ph$i = $$$i; //@line 1892
        label = 171; //@line 1893
       }
      } else {
       $$2234243136$i = 0; //@line 1896
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 1903
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 1912
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 1915
       $$748$i = $$2247$ph$i; //@line 1915
       label = 180; //@line 1916
       break L244;
      }
     }
     $607 = HEAP32[992] | 0; //@line 1920
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 1924
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 1927
      $$748$i = $$2247$ph$i; //@line 1927
      label = 180; //@line 1928
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 1934
      $$2234243136$i = 0; //@line 1935
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 1939
      $$748$i = $$2247$ph$i; //@line 1939
      label = 180; //@line 1940
      break L244;
     }
    }
   } while (0);
   HEAP32[983] = HEAP32[983] | 4; //@line 1947
   $$4236$i = $$2234243136$i; //@line 1948
   label = 178; //@line 1949
  } else {
   $$4236$i = 0; //@line 1951
   label = 178; //@line 1952
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 1958
   $621 = _sbrk(0) | 0; //@line 1959
   $627 = $621 - $620 | 0; //@line 1967
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 1969
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 1977
    $$748$i = $620; //@line 1977
    label = 180; //@line 1978
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[980] | 0) + $$723947$i | 0; //@line 1984
  HEAP32[980] = $633; //@line 1985
  if ($633 >>> 0 > (HEAP32[981] | 0) >>> 0) {
   HEAP32[981] = $633; //@line 1989
  }
  $636 = HEAP32[878] | 0; //@line 1991
  do {
   if (!$636) {
    $638 = HEAP32[876] | 0; //@line 1995
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[876] = $$748$i; //@line 2000
    }
    HEAP32[984] = $$748$i; //@line 2002
    HEAP32[985] = $$723947$i; //@line 2003
    HEAP32[987] = 0; //@line 2004
    HEAP32[881] = HEAP32[990]; //@line 2006
    HEAP32[880] = -1; //@line 2007
    HEAP32[885] = 3528; //@line 2008
    HEAP32[884] = 3528; //@line 2009
    HEAP32[887] = 3536; //@line 2010
    HEAP32[886] = 3536; //@line 2011
    HEAP32[889] = 3544; //@line 2012
    HEAP32[888] = 3544; //@line 2013
    HEAP32[891] = 3552; //@line 2014
    HEAP32[890] = 3552; //@line 2015
    HEAP32[893] = 3560; //@line 2016
    HEAP32[892] = 3560; //@line 2017
    HEAP32[895] = 3568; //@line 2018
    HEAP32[894] = 3568; //@line 2019
    HEAP32[897] = 3576; //@line 2020
    HEAP32[896] = 3576; //@line 2021
    HEAP32[899] = 3584; //@line 2022
    HEAP32[898] = 3584; //@line 2023
    HEAP32[901] = 3592; //@line 2024
    HEAP32[900] = 3592; //@line 2025
    HEAP32[903] = 3600; //@line 2026
    HEAP32[902] = 3600; //@line 2027
    HEAP32[905] = 3608; //@line 2028
    HEAP32[904] = 3608; //@line 2029
    HEAP32[907] = 3616; //@line 2030
    HEAP32[906] = 3616; //@line 2031
    HEAP32[909] = 3624; //@line 2032
    HEAP32[908] = 3624; //@line 2033
    HEAP32[911] = 3632; //@line 2034
    HEAP32[910] = 3632; //@line 2035
    HEAP32[913] = 3640; //@line 2036
    HEAP32[912] = 3640; //@line 2037
    HEAP32[915] = 3648; //@line 2038
    HEAP32[914] = 3648; //@line 2039
    HEAP32[917] = 3656; //@line 2040
    HEAP32[916] = 3656; //@line 2041
    HEAP32[919] = 3664; //@line 2042
    HEAP32[918] = 3664; //@line 2043
    HEAP32[921] = 3672; //@line 2044
    HEAP32[920] = 3672; //@line 2045
    HEAP32[923] = 3680; //@line 2046
    HEAP32[922] = 3680; //@line 2047
    HEAP32[925] = 3688; //@line 2048
    HEAP32[924] = 3688; //@line 2049
    HEAP32[927] = 3696; //@line 2050
    HEAP32[926] = 3696; //@line 2051
    HEAP32[929] = 3704; //@line 2052
    HEAP32[928] = 3704; //@line 2053
    HEAP32[931] = 3712; //@line 2054
    HEAP32[930] = 3712; //@line 2055
    HEAP32[933] = 3720; //@line 2056
    HEAP32[932] = 3720; //@line 2057
    HEAP32[935] = 3728; //@line 2058
    HEAP32[934] = 3728; //@line 2059
    HEAP32[937] = 3736; //@line 2060
    HEAP32[936] = 3736; //@line 2061
    HEAP32[939] = 3744; //@line 2062
    HEAP32[938] = 3744; //@line 2063
    HEAP32[941] = 3752; //@line 2064
    HEAP32[940] = 3752; //@line 2065
    HEAP32[943] = 3760; //@line 2066
    HEAP32[942] = 3760; //@line 2067
    HEAP32[945] = 3768; //@line 2068
    HEAP32[944] = 3768; //@line 2069
    HEAP32[947] = 3776; //@line 2070
    HEAP32[946] = 3776; //@line 2071
    $642 = $$723947$i + -40 | 0; //@line 2072
    $644 = $$748$i + 8 | 0; //@line 2074
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2079
    $650 = $$748$i + $649 | 0; //@line 2080
    $651 = $642 - $649 | 0; //@line 2081
    HEAP32[878] = $650; //@line 2082
    HEAP32[875] = $651; //@line 2083
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2086
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2089
    HEAP32[879] = HEAP32[994]; //@line 2091
   } else {
    $$024367$i = 3936; //@line 2093
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2095
     $658 = $$024367$i + 4 | 0; //@line 2096
     $659 = HEAP32[$658 >> 2] | 0; //@line 2097
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2101
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2105
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2110
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2124
       $673 = (HEAP32[875] | 0) + $$723947$i | 0; //@line 2126
       $675 = $636 + 8 | 0; //@line 2128
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2133
       $681 = $636 + $680 | 0; //@line 2134
       $682 = $673 - $680 | 0; //@line 2135
       HEAP32[878] = $681; //@line 2136
       HEAP32[875] = $682; //@line 2137
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2140
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2143
       HEAP32[879] = HEAP32[994]; //@line 2145
       break;
      }
     }
    }
    $688 = HEAP32[876] | 0; //@line 2150
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[876] = $$748$i; //@line 2153
     $753 = $$748$i; //@line 2154
    } else {
     $753 = $688; //@line 2156
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2158
    $$124466$i = 3936; //@line 2159
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2164
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2168
     if (!$694) {
      $$0$i$i$i = 3936; //@line 2171
      break;
     } else {
      $$124466$i = $694; //@line 2174
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 2183
      $700 = $$124466$i + 4 | 0; //@line 2184
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 2187
      $704 = $$748$i + 8 | 0; //@line 2189
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 2195
      $712 = $690 + 8 | 0; //@line 2197
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 2203
      $722 = $710 + $$0197 | 0; //@line 2207
      $723 = $718 - $710 - $$0197 | 0; //@line 2208
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 2211
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[875] | 0) + $723 | 0; //@line 2216
        HEAP32[875] = $728; //@line 2217
        HEAP32[878] = $722; //@line 2218
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 2221
       } else {
        if ((HEAP32[877] | 0) == ($718 | 0)) {
         $734 = (HEAP32[874] | 0) + $723 | 0; //@line 2227
         HEAP32[874] = $734; //@line 2228
         HEAP32[877] = $722; //@line 2229
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 2232
         HEAP32[$722 + $734 >> 2] = $734; //@line 2234
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 2238
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 2242
         $743 = $739 >>> 3; //@line 2243
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 2248
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 2250
           $750 = 3528 + ($743 << 1 << 2) | 0; //@line 2252
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 2258
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 2267
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[872] = HEAP32[872] & ~(1 << $743); //@line 2277
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 2284
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 2288
             }
             $764 = $748 + 8 | 0; //@line 2291
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 2295
              break;
             }
             _abort(); //@line 2298
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 2303
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 2304
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 2307
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 2309
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 2313
             $783 = $782 + 4 | 0; //@line 2314
             $784 = HEAP32[$783 >> 2] | 0; //@line 2315
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 2318
              if (!$786) {
               $$3$i$i = 0; //@line 2321
               break;
              } else {
               $$1291$i$i = $786; //@line 2324
               $$1293$i$i = $782; //@line 2324
              }
             } else {
              $$1291$i$i = $784; //@line 2327
              $$1293$i$i = $783; //@line 2327
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 2330
              $789 = HEAP32[$788 >> 2] | 0; //@line 2331
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 2334
               $$1293$i$i = $788; //@line 2334
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 2337
              $792 = HEAP32[$791 >> 2] | 0; //@line 2338
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 2343
               $$1293$i$i = $791; //@line 2343
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 2348
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 2351
              $$3$i$i = $$1291$i$i; //@line 2352
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 2357
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 2360
             }
             $776 = $774 + 12 | 0; //@line 2363
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 2367
             }
             $779 = $771 + 8 | 0; //@line 2370
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 2374
              HEAP32[$779 >> 2] = $774; //@line 2375
              $$3$i$i = $771; //@line 2376
              break;
             } else {
              _abort(); //@line 2379
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 2389
           $798 = 3792 + ($797 << 2) | 0; //@line 2390
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 2395
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[873] = HEAP32[873] & ~(1 << $797); //@line 2404
             break L311;
            } else {
             if ((HEAP32[876] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 2410
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 2418
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[876] | 0; //@line 2428
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 2431
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 2435
           $815 = $718 + 16 | 0; //@line 2436
           $816 = HEAP32[$815 >> 2] | 0; //@line 2437
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 2443
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 2447
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 2449
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 2455
           if (!$822) {
            break;
           }
           if ((HEAP32[876] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 2463
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 2467
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 2469
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 2476
         $$0287$i$i = $742 + $723 | 0; //@line 2476
        } else {
         $$0$i17$i = $718; //@line 2478
         $$0287$i$i = $723; //@line 2478
        }
        $830 = $$0$i17$i + 4 | 0; //@line 2480
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 2483
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 2486
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 2488
        $836 = $$0287$i$i >>> 3; //@line 2489
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 3528 + ($836 << 1 << 2) | 0; //@line 2493
         $840 = HEAP32[872] | 0; //@line 2494
         $841 = 1 << $836; //@line 2495
         do {
          if (!($840 & $841)) {
           HEAP32[872] = $840 | $841; //@line 2501
           $$0295$i$i = $839; //@line 2503
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 2503
          } else {
           $845 = $839 + 8 | 0; //@line 2505
           $846 = HEAP32[$845 >> 2] | 0; //@line 2506
           if ((HEAP32[876] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 2510
            $$pre$phi$i19$iZ2D = $845; //@line 2510
            break;
           }
           _abort(); //@line 2513
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 2517
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 2519
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 2521
         HEAP32[$722 + 12 >> 2] = $839; //@line 2523
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 2526
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 2530
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 2534
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 2539
          $858 = $852 << $857; //@line 2540
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 2543
          $863 = $858 << $861; //@line 2545
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 2548
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 2553
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 2559
         }
        } while (0);
        $877 = 3792 + ($$0296$i$i << 2) | 0; //@line 2562
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 2564
        $879 = $722 + 16 | 0; //@line 2565
        HEAP32[$879 + 4 >> 2] = 0; //@line 2567
        HEAP32[$879 >> 2] = 0; //@line 2568
        $881 = HEAP32[873] | 0; //@line 2569
        $882 = 1 << $$0296$i$i; //@line 2570
        if (!($881 & $882)) {
         HEAP32[873] = $881 | $882; //@line 2575
         HEAP32[$877 >> 2] = $722; //@line 2576
         HEAP32[$722 + 24 >> 2] = $877; //@line 2578
         HEAP32[$722 + 12 >> 2] = $722; //@line 2580
         HEAP32[$722 + 8 >> 2] = $722; //@line 2582
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 2591
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 2591
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 2598
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 2602
         $902 = HEAP32[$900 >> 2] | 0; //@line 2604
         if (!$902) {
          label = 260; //@line 2607
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 2610
          $$0289$i$i = $902; //@line 2610
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[876] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 2617
         } else {
          HEAP32[$900 >> 2] = $722; //@line 2620
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 2622
          HEAP32[$722 + 12 >> 2] = $722; //@line 2624
          HEAP32[$722 + 8 >> 2] = $722; //@line 2626
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 2631
         $910 = HEAP32[$909 >> 2] | 0; //@line 2632
         $911 = HEAP32[876] | 0; //@line 2633
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 2639
          HEAP32[$909 >> 2] = $722; //@line 2640
          HEAP32[$722 + 8 >> 2] = $910; //@line 2642
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 2644
          HEAP32[$722 + 24 >> 2] = 0; //@line 2646
          break;
         } else {
          _abort(); //@line 2649
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 2656
      STACKTOP = sp; //@line 2657
      return $$0 | 0; //@line 2657
     } else {
      $$0$i$i$i = 3936; //@line 2659
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 2663
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 2668
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 2676
    }
    $927 = $923 + -47 | 0; //@line 2678
    $929 = $927 + 8 | 0; //@line 2680
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 2686
    $936 = $636 + 16 | 0; //@line 2687
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 2689
    $939 = $938 + 8 | 0; //@line 2690
    $940 = $938 + 24 | 0; //@line 2691
    $941 = $$723947$i + -40 | 0; //@line 2692
    $943 = $$748$i + 8 | 0; //@line 2694
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 2699
    $949 = $$748$i + $948 | 0; //@line 2700
    $950 = $941 - $948 | 0; //@line 2701
    HEAP32[878] = $949; //@line 2702
    HEAP32[875] = $950; //@line 2703
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 2706
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 2709
    HEAP32[879] = HEAP32[994]; //@line 2711
    $956 = $938 + 4 | 0; //@line 2712
    HEAP32[$956 >> 2] = 27; //@line 2713
    HEAP32[$939 >> 2] = HEAP32[984]; //@line 2714
    HEAP32[$939 + 4 >> 2] = HEAP32[985]; //@line 2714
    HEAP32[$939 + 8 >> 2] = HEAP32[986]; //@line 2714
    HEAP32[$939 + 12 >> 2] = HEAP32[987]; //@line 2714
    HEAP32[984] = $$748$i; //@line 2715
    HEAP32[985] = $$723947$i; //@line 2716
    HEAP32[987] = 0; //@line 2717
    HEAP32[986] = $939; //@line 2718
    $958 = $940; //@line 2719
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 2721
     HEAP32[$958 >> 2] = 7; //@line 2722
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 2735
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 2738
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 2741
     HEAP32[$938 >> 2] = $964; //@line 2742
     $969 = $964 >>> 3; //@line 2743
     if ($964 >>> 0 < 256) {
      $972 = 3528 + ($969 << 1 << 2) | 0; //@line 2747
      $973 = HEAP32[872] | 0; //@line 2748
      $974 = 1 << $969; //@line 2749
      if (!($973 & $974)) {
       HEAP32[872] = $973 | $974; //@line 2754
       $$0211$i$i = $972; //@line 2756
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 2756
      } else {
       $978 = $972 + 8 | 0; //@line 2758
       $979 = HEAP32[$978 >> 2] | 0; //@line 2759
       if ((HEAP32[876] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 2763
       } else {
        $$0211$i$i = $979; //@line 2766
        $$pre$phi$i$iZ2D = $978; //@line 2766
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 2769
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 2771
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 2773
      HEAP32[$636 + 12 >> 2] = $972; //@line 2775
      break;
     }
     $985 = $964 >>> 8; //@line 2778
     if (!$985) {
      $$0212$i$i = 0; //@line 2781
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 2785
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 2789
       $991 = $985 << $990; //@line 2790
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 2793
       $996 = $991 << $994; //@line 2795
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 2798
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 2803
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 2809
      }
     }
     $1010 = 3792 + ($$0212$i$i << 2) | 0; //@line 2812
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 2814
     HEAP32[$636 + 20 >> 2] = 0; //@line 2816
     HEAP32[$936 >> 2] = 0; //@line 2817
     $1013 = HEAP32[873] | 0; //@line 2818
     $1014 = 1 << $$0212$i$i; //@line 2819
     if (!($1013 & $1014)) {
      HEAP32[873] = $1013 | $1014; //@line 2824
      HEAP32[$1010 >> 2] = $636; //@line 2825
      HEAP32[$636 + 24 >> 2] = $1010; //@line 2827
      HEAP32[$636 + 12 >> 2] = $636; //@line 2829
      HEAP32[$636 + 8 >> 2] = $636; //@line 2831
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 2840
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 2840
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 2847
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 2851
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 2853
      if (!$1034) {
       label = 286; //@line 2856
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 2859
       $$0207$i$i = $1034; //@line 2859
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[876] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 2866
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 2869
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 2871
       HEAP32[$636 + 12 >> 2] = $636; //@line 2873
       HEAP32[$636 + 8 >> 2] = $636; //@line 2875
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 2880
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 2881
      $1043 = HEAP32[876] | 0; //@line 2882
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 2888
       HEAP32[$1041 >> 2] = $636; //@line 2889
       HEAP32[$636 + 8 >> 2] = $1042; //@line 2891
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 2893
       HEAP32[$636 + 24 >> 2] = 0; //@line 2895
       break;
      } else {
       _abort(); //@line 2898
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[875] | 0; //@line 2905
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 2908
   HEAP32[875] = $1054; //@line 2909
   $1055 = HEAP32[878] | 0; //@line 2910
   $1056 = $1055 + $$0197 | 0; //@line 2911
   HEAP32[878] = $1056; //@line 2912
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 2915
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 2918
   $$0 = $1055 + 8 | 0; //@line 2920
   STACKTOP = sp; //@line 2921
   return $$0 | 0; //@line 2921
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 2925
 $$0 = 0; //@line 2926
 STACKTOP = sp; //@line 2927
 return $$0 | 0; //@line 2927
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6242
 STACKTOP = STACKTOP + 560 | 0; //@line 6243
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 6243
 $6 = sp + 8 | 0; //@line 6244
 $7 = sp; //@line 6245
 $8 = sp + 524 | 0; //@line 6246
 $9 = $8; //@line 6247
 $10 = sp + 512 | 0; //@line 6248
 HEAP32[$7 >> 2] = 0; //@line 6249
 $11 = $10 + 12 | 0; //@line 6250
 ___DOUBLE_BITS_677($1) | 0; //@line 6251
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 6256
  $$0520 = 1; //@line 6256
  $$0521 = 1346; //@line 6256
 } else {
  $$0471 = $1; //@line 6267
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 6267
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1347 : 1352 : 1349; //@line 6267
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 6269
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 6278
   $31 = $$0520 + 3 | 0; //@line 6283
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 6285
   _out_670($0, $$0521, $$0520); //@line 6286
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1373 : 1377 : $27 ? 1365 : 1369, 3); //@line 6287
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 6289
   $$sink560 = $31; //@line 6290
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 6293
   $36 = $35 != 0.0; //@line 6294
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 6298
   }
   $39 = $5 | 32; //@line 6300
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 6303
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 6306
    $44 = $$0520 | 2; //@line 6307
    $46 = 12 - $3 | 0; //@line 6309
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 6314
     } else {
      $$0509585 = 8.0; //@line 6316
      $$1508586 = $46; //@line 6316
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 6318
       $$0509585 = $$0509585 * 16.0; //@line 6319
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 6334
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 6339
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 6344
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 6347
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 6350
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 6353
     HEAP8[$68 >> 0] = 48; //@line 6354
     $$0511 = $68; //@line 6355
    } else {
     $$0511 = $66; //@line 6357
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 6364
    $76 = $$0511 + -2 | 0; //@line 6367
    HEAP8[$76 >> 0] = $5 + 15; //@line 6368
    $77 = ($3 | 0) < 1; //@line 6369
    $79 = ($4 & 8 | 0) == 0; //@line 6371
    $$0523 = $8; //@line 6372
    $$2473 = $$1472; //@line 6372
    while (1) {
     $80 = ~~$$2473; //@line 6374
     $86 = $$0523 + 1 | 0; //@line 6380
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1381 + $80 >> 0]; //@line 6381
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 6384
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 6393
      } else {
       HEAP8[$86 >> 0] = 46; //@line 6396
       $$1524 = $$0523 + 2 | 0; //@line 6397
      }
     } else {
      $$1524 = $86; //@line 6400
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 6404
     }
    }
    $$pre693 = $$1524; //@line 6410
    if (!$3) {
     label = 24; //@line 6412
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 6420
      $$sink = $3 + 2 | 0; //@line 6420
     } else {
      label = 24; //@line 6422
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 6426
     $$pre$phi691Z2D = $101; //@line 6427
     $$sink = $101; //@line 6427
    }
    $104 = $11 - $76 | 0; //@line 6431
    $106 = $104 + $44 + $$sink | 0; //@line 6433
    _pad_676($0, 32, $2, $106, $4); //@line 6434
    _out_670($0, $$0521$, $44); //@line 6435
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 6437
    _out_670($0, $8, $$pre$phi691Z2D); //@line 6438
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 6440
    _out_670($0, $76, $104); //@line 6441
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 6443
    $$sink560 = $106; //@line 6444
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 6448
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 6452
    HEAP32[$7 >> 2] = $113; //@line 6453
    $$3 = $35 * 268435456.0; //@line 6454
    $$pr = $113; //@line 6454
   } else {
    $$3 = $35; //@line 6457
    $$pr = HEAP32[$7 >> 2] | 0; //@line 6457
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 6461
   $$0498 = $$561; //@line 6462
   $$4 = $$3; //@line 6462
   do {
    $116 = ~~$$4 >>> 0; //@line 6464
    HEAP32[$$0498 >> 2] = $116; //@line 6465
    $$0498 = $$0498 + 4 | 0; //@line 6466
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 6469
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 6479
    $$1499662 = $$0498; //@line 6479
    $124 = $$pr; //@line 6479
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 6482
     $$0488655 = $$1499662 + -4 | 0; //@line 6483
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 6486
     } else {
      $$0488657 = $$0488655; //@line 6488
      $$0497656 = 0; //@line 6488
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 6491
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 6493
       $131 = tempRet0; //@line 6494
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6495
       HEAP32[$$0488657 >> 2] = $132; //@line 6497
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6498
       $$0488657 = $$0488657 + -4 | 0; //@line 6500
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 6510
      } else {
       $138 = $$1482663 + -4 | 0; //@line 6512
       HEAP32[$138 >> 2] = $$0497656; //@line 6513
       $$2483$ph = $138; //@line 6514
      }
     }
     $$2500 = $$1499662; //@line 6517
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 6523
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 6527
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 6533
     HEAP32[$7 >> 2] = $144; //@line 6534
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 6537
      $$1499662 = $$2500; //@line 6537
      $124 = $144; //@line 6537
     } else {
      $$1482$lcssa = $$2483$ph; //@line 6539
      $$1499$lcssa = $$2500; //@line 6539
      $$pr566 = $144; //@line 6539
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 6544
    $$1499$lcssa = $$0498; //@line 6544
    $$pr566 = $$pr; //@line 6544
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 6550
    $150 = ($39 | 0) == 102; //@line 6551
    $$3484650 = $$1482$lcssa; //@line 6552
    $$3501649 = $$1499$lcssa; //@line 6552
    $152 = $$pr566; //@line 6552
    while (1) {
     $151 = 0 - $152 | 0; //@line 6554
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 6556
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 6560
      $161 = 1e9 >>> $154; //@line 6561
      $$0487644 = 0; //@line 6562
      $$1489643 = $$3484650; //@line 6562
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 6564
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 6568
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 6569
       $$1489643 = $$1489643 + 4 | 0; //@line 6570
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6581
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 6584
       $$4502 = $$3501649; //@line 6584
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 6587
       $$$3484700 = $$$3484; //@line 6588
       $$4502 = $$3501649 + 4 | 0; //@line 6588
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6595
      $$4502 = $$3501649; //@line 6595
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 6597
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 6604
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 6606
     HEAP32[$7 >> 2] = $152; //@line 6607
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 6612
      $$3501$lcssa = $$$4502; //@line 6612
      break;
     } else {
      $$3484650 = $$$3484700; //@line 6610
      $$3501649 = $$$4502; //@line 6610
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 6617
    $$3501$lcssa = $$1499$lcssa; //@line 6617
   }
   $185 = $$561; //@line 6620
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 6625
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 6626
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 6629
    } else {
     $$0514639 = $189; //@line 6631
     $$0530638 = 10; //@line 6631
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 6633
      $193 = $$0514639 + 1 | 0; //@line 6634
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 6637
       break;
      } else {
       $$0514639 = $193; //@line 6640
      }
     }
    }
   } else {
    $$1515 = 0; //@line 6645
   }
   $198 = ($39 | 0) == 103; //@line 6650
   $199 = ($$540 | 0) != 0; //@line 6651
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 6654
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 6663
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 6666
    $213 = ($209 | 0) % 9 | 0; //@line 6667
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 6670
     $$1531632 = 10; //@line 6670
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 6673
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 6676
       $$1531632 = $215; //@line 6676
      } else {
       $$1531$lcssa = $215; //@line 6678
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 6683
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 6685
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 6686
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 6689
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 6692
     $$4518 = $$1515; //@line 6692
     $$8 = $$3484$lcssa; //@line 6692
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 6697
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 6698
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 6703
     if (!$$0520) {
      $$1467 = $$$564; //@line 6706
      $$1469 = $$543; //@line 6706
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 6709
      $$1467 = $230 ? -$$$564 : $$$564; //@line 6714
      $$1469 = $230 ? -$$543 : $$543; //@line 6714
     }
     $233 = $217 - $218 | 0; //@line 6716
     HEAP32[$212 >> 2] = $233; //@line 6717
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 6721
      HEAP32[$212 >> 2] = $236; //@line 6722
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 6725
       $$sink547625 = $212; //@line 6725
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 6727
        HEAP32[$$sink547625 >> 2] = 0; //@line 6728
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 6731
         HEAP32[$240 >> 2] = 0; //@line 6732
         $$6 = $240; //@line 6733
        } else {
         $$6 = $$5486626; //@line 6735
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 6738
        HEAP32[$238 >> 2] = $242; //@line 6739
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 6742
         $$sink547625 = $238; //@line 6742
        } else {
         $$5486$lcssa = $$6; //@line 6744
         $$sink547$lcssa = $238; //@line 6744
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 6749
       $$sink547$lcssa = $212; //@line 6749
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 6754
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 6755
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 6758
       $$4518 = $247; //@line 6758
       $$8 = $$5486$lcssa; //@line 6758
      } else {
       $$2516621 = $247; //@line 6760
       $$2532620 = 10; //@line 6760
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 6762
        $251 = $$2516621 + 1 | 0; //@line 6763
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 6766
         $$4518 = $251; //@line 6766
         $$8 = $$5486$lcssa; //@line 6766
         break;
        } else {
         $$2516621 = $251; //@line 6769
        }
       }
      }
     } else {
      $$4492 = $212; //@line 6774
      $$4518 = $$1515; //@line 6774
      $$8 = $$3484$lcssa; //@line 6774
     }
    }
    $253 = $$4492 + 4 | 0; //@line 6777
    $$5519$ph = $$4518; //@line 6780
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 6780
    $$9$ph = $$8; //@line 6780
   } else {
    $$5519$ph = $$1515; //@line 6782
    $$7505$ph = $$3501$lcssa; //@line 6782
    $$9$ph = $$3484$lcssa; //@line 6782
   }
   $$7505 = $$7505$ph; //@line 6784
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 6788
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 6791
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 6795
    } else {
     $$lcssa675 = 1; //@line 6797
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 6801
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 6806
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 6814
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 6814
     } else {
      $$0479 = $5 + -2 | 0; //@line 6818
      $$2476 = $$540$ + -1 | 0; //@line 6818
     }
     $267 = $4 & 8; //@line 6820
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 6825
       if (!$270) {
        $$2529 = 9; //@line 6828
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 6833
         $$3533616 = 10; //@line 6833
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 6835
          $275 = $$1528617 + 1 | 0; //@line 6836
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 6842
           break;
          } else {
           $$1528617 = $275; //@line 6840
          }
         }
        } else {
         $$2529 = 0; //@line 6847
        }
       }
      } else {
       $$2529 = 9; //@line 6851
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 6859
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 6861
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 6863
       $$1480 = $$0479; //@line 6866
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 6866
       $$pre$phi698Z2D = 0; //@line 6866
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 6870
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 6872
       $$1480 = $$0479; //@line 6875
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 6875
       $$pre$phi698Z2D = 0; //@line 6875
       break;
      }
     } else {
      $$1480 = $$0479; //@line 6879
      $$3477 = $$2476; //@line 6879
      $$pre$phi698Z2D = $267; //@line 6879
     }
    } else {
     $$1480 = $5; //@line 6883
     $$3477 = $$540; //@line 6883
     $$pre$phi698Z2D = $4 & 8; //@line 6883
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 6886
   $294 = ($292 | 0) != 0 & 1; //@line 6888
   $296 = ($$1480 | 32 | 0) == 102; //@line 6890
   if ($296) {
    $$2513 = 0; //@line 6894
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 6894
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 6897
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 6900
    $304 = $11; //@line 6901
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 6906
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 6908
      HEAP8[$308 >> 0] = 48; //@line 6909
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 6914
      } else {
       $$1512$lcssa = $308; //@line 6916
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 6921
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 6928
    $318 = $$1512$lcssa + -2 | 0; //@line 6930
    HEAP8[$318 >> 0] = $$1480; //@line 6931
    $$2513 = $318; //@line 6934
    $$pn = $304 - $318 | 0; //@line 6934
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 6939
   _pad_676($0, 32, $2, $323, $4); //@line 6940
   _out_670($0, $$0521, $$0520); //@line 6941
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 6943
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 6946
    $326 = $8 + 9 | 0; //@line 6947
    $327 = $326; //@line 6948
    $328 = $8 + 8 | 0; //@line 6949
    $$5493600 = $$0496$$9; //@line 6950
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 6953
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 6958
       $$1465 = $328; //@line 6959
      } else {
       $$1465 = $330; //@line 6961
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 6968
       $$0464597 = $330; //@line 6969
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 6971
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 6974
        } else {
         $$1465 = $335; //@line 6976
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 6981
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 6986
     $$5493600 = $$5493600 + 4 | 0; //@line 6987
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1397, 1); //@line 6997
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 7003
     $$6494592 = $$5493600; //@line 7003
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 7006
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 7011
       $$0463587 = $347; //@line 7012
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 7014
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 7017
        } else {
         $$0463$lcssa = $351; //@line 7019
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 7024
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 7028
      $$6494592 = $$6494592 + 4 | 0; //@line 7029
      $356 = $$4478593 + -9 | 0; //@line 7030
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 7037
       break;
      } else {
       $$4478593 = $356; //@line 7035
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 7042
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 7045
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 7048
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 7051
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 7052
     $365 = $363; //@line 7053
     $366 = 0 - $9 | 0; //@line 7054
     $367 = $8 + 8 | 0; //@line 7055
     $$5605 = $$3477; //@line 7056
     $$7495604 = $$9$ph; //@line 7056
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 7059
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 7062
       $$0 = $367; //@line 7063
      } else {
       $$0 = $369; //@line 7065
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 7070
        _out_670($0, $$0, 1); //@line 7071
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 7075
         break;
        }
        _out_670($0, 1397, 1); //@line 7078
        $$2 = $375; //@line 7079
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 7083
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 7088
        $$1601 = $$0; //@line 7089
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 7091
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 7094
         } else {
          $$2 = $373; //@line 7096
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 7103
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 7106
      $381 = $$5605 - $378 | 0; //@line 7107
      $$7495604 = $$7495604 + 4 | 0; //@line 7108
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 7115
       break;
      } else {
       $$5605 = $381; //@line 7113
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 7120
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 7123
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 7127
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 7130
   $$sink560 = $323; //@line 7131
  }
 } while (0);
 STACKTOP = sp; //@line 7136
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 7136
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 4814
 STACKTOP = STACKTOP + 64 | 0; //@line 4815
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 4815
 $5 = sp + 16 | 0; //@line 4816
 $6 = sp; //@line 4817
 $7 = sp + 24 | 0; //@line 4818
 $8 = sp + 8 | 0; //@line 4819
 $9 = sp + 20 | 0; //@line 4820
 HEAP32[$5 >> 2] = $1; //@line 4821
 $10 = ($0 | 0) != 0; //@line 4822
 $11 = $7 + 40 | 0; //@line 4823
 $12 = $11; //@line 4824
 $13 = $7 + 39 | 0; //@line 4825
 $14 = $8 + 4 | 0; //@line 4826
 $$0243 = 0; //@line 4827
 $$0247 = 0; //@line 4827
 $$0269 = 0; //@line 4827
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 4836
     $$1248 = -1; //@line 4837
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 4841
     break;
    }
   } else {
    $$1248 = $$0247; //@line 4845
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 4848
  $21 = HEAP8[$20 >> 0] | 0; //@line 4849
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 4852
   break;
  } else {
   $23 = $21; //@line 4855
   $25 = $20; //@line 4855
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 4860
     $27 = $25; //@line 4860
     label = 9; //@line 4861
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 4866
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 4873
   HEAP32[$5 >> 2] = $24; //@line 4874
   $23 = HEAP8[$24 >> 0] | 0; //@line 4876
   $25 = $24; //@line 4876
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 4881
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 4886
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 4889
     $27 = $27 + 2 | 0; //@line 4890
     HEAP32[$5 >> 2] = $27; //@line 4891
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 4898
      break;
     } else {
      $$0249303 = $30; //@line 4895
      label = 9; //@line 4896
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 4906
  if ($10) {
   _out_670($0, $20, $36); //@line 4908
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 4912
   $$0247 = $$1248; //@line 4912
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 4920
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 4921
  if ($43) {
   $$0253 = -1; //@line 4923
   $$1270 = $$0269; //@line 4923
   $$sink = 1; //@line 4923
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 4933
    $$1270 = 1; //@line 4933
    $$sink = 3; //@line 4933
   } else {
    $$0253 = -1; //@line 4935
    $$1270 = $$0269; //@line 4935
    $$sink = 1; //@line 4935
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 4938
  HEAP32[$5 >> 2] = $51; //@line 4939
  $52 = HEAP8[$51 >> 0] | 0; //@line 4940
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 4942
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 4949
   $$lcssa291 = $52; //@line 4949
   $$lcssa292 = $51; //@line 4949
  } else {
   $$0262309 = 0; //@line 4951
   $60 = $52; //@line 4951
   $65 = $51; //@line 4951
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 4956
    $64 = $65 + 1 | 0; //@line 4957
    HEAP32[$5 >> 2] = $64; //@line 4958
    $66 = HEAP8[$64 >> 0] | 0; //@line 4959
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 4961
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 4968
     $$lcssa291 = $66; //@line 4968
     $$lcssa292 = $64; //@line 4968
     break;
    } else {
     $$0262309 = $63; //@line 4971
     $60 = $66; //@line 4971
     $65 = $64; //@line 4971
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 4983
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 4985
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 4990
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 4995
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 5007
     $$2271 = 1; //@line 5007
     $storemerge274 = $79 + 3 | 0; //@line 5007
    } else {
     label = 23; //@line 5009
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 5013
    if ($$1270 | 0) {
     $$0 = -1; //@line 5016
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5031
     $106 = HEAP32[$105 >> 2] | 0; //@line 5032
     HEAP32[$2 >> 2] = $105 + 4; //@line 5034
     $363 = $106; //@line 5035
    } else {
     $363 = 0; //@line 5037
    }
    $$0259 = $363; //@line 5041
    $$2271 = 0; //@line 5041
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 5041
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 5043
   $109 = ($$0259 | 0) < 0; //@line 5044
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 5049
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 5049
   $$3272 = $$2271; //@line 5049
   $115 = $storemerge274; //@line 5049
  } else {
   $112 = _getint_671($5) | 0; //@line 5051
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 5054
    break;
   }
   $$1260 = $112; //@line 5058
   $$1263 = $$0262$lcssa; //@line 5058
   $$3272 = $$1270; //@line 5058
   $115 = HEAP32[$5 >> 2] | 0; //@line 5058
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 5069
     $156 = _getint_671($5) | 0; //@line 5070
     $$0254 = $156; //@line 5072
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 5072
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 5081
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 5086
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 5091
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 5098
      $144 = $125 + 4 | 0; //@line 5102
      HEAP32[$5 >> 2] = $144; //@line 5103
      $$0254 = $140; //@line 5104
      $$pre345 = $144; //@line 5104
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 5110
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5125
     $152 = HEAP32[$151 >> 2] | 0; //@line 5126
     HEAP32[$2 >> 2] = $151 + 4; //@line 5128
     $364 = $152; //@line 5129
    } else {
     $364 = 0; //@line 5131
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 5134
    HEAP32[$5 >> 2] = $154; //@line 5135
    $$0254 = $364; //@line 5136
    $$pre345 = $154; //@line 5136
   } else {
    $$0254 = -1; //@line 5138
    $$pre345 = $115; //@line 5138
   }
  } while (0);
  $$0252 = 0; //@line 5141
  $158 = $$pre345; //@line 5141
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 5148
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 5151
   HEAP32[$5 >> 2] = $158; //@line 5152
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (865 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 5157
   $168 = $167 & 255; //@line 5158
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 5162
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 5169
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 5173
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 5177
     break L1;
    } else {
     label = 50; //@line 5180
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 5185
     $176 = $3 + ($$0253 << 3) | 0; //@line 5187
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 5192
     $182 = $6; //@line 5193
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 5195
     HEAP32[$182 + 4 >> 2] = $181; //@line 5198
     label = 50; //@line 5199
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 5203
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 5206
    $187 = HEAP32[$5 >> 2] | 0; //@line 5208
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 5212
   if ($10) {
    $187 = $158; //@line 5214
   } else {
    $$0243 = 0; //@line 5216
    $$0247 = $$1248; //@line 5216
    $$0269 = $$3272; //@line 5216
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 5222
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 5228
  $196 = $$1263 & -65537; //@line 5231
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 5232
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5240
       $$0243 = 0; //@line 5241
       $$0247 = $$1248; //@line 5241
       $$0269 = $$3272; //@line 5241
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5247
       $$0243 = 0; //@line 5248
       $$0247 = $$1248; //@line 5248
       $$0269 = $$3272; //@line 5248
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 5256
       HEAP32[$208 >> 2] = $$1248; //@line 5258
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 5261
       $$0243 = 0; //@line 5262
       $$0247 = $$1248; //@line 5262
       $$0269 = $$3272; //@line 5262
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 5269
       $$0243 = 0; //@line 5270
       $$0247 = $$1248; //@line 5270
       $$0269 = $$3272; //@line 5270
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 5277
       $$0243 = 0; //@line 5278
       $$0247 = $$1248; //@line 5278
       $$0269 = $$3272; //@line 5278
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5284
       $$0243 = 0; //@line 5285
       $$0247 = $$1248; //@line 5285
       $$0269 = $$3272; //@line 5285
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 5293
       HEAP32[$220 >> 2] = $$1248; //@line 5295
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 5298
       $$0243 = 0; //@line 5299
       $$0247 = $$1248; //@line 5299
       $$0269 = $$3272; //@line 5299
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 5304
       $$0247 = $$1248; //@line 5304
       $$0269 = $$3272; //@line 5304
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 5314
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 5314
     $$3265 = $$1263$ | 8; //@line 5314
     label = 62; //@line 5315
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 5319
     $$1255 = $$0254; //@line 5319
     $$3265 = $$1263$; //@line 5319
     label = 62; //@line 5320
     break;
    }
   case 111:
    {
     $242 = $6; //@line 5324
     $244 = HEAP32[$242 >> 2] | 0; //@line 5326
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 5329
     $248 = _fmt_o($244, $247, $11) | 0; //@line 5330
     $252 = $12 - $248 | 0; //@line 5334
     $$0228 = $248; //@line 5339
     $$1233 = 0; //@line 5339
     $$1238 = 1329; //@line 5339
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 5339
     $$4266 = $$1263$; //@line 5339
     $281 = $244; //@line 5339
     $283 = $247; //@line 5339
     label = 68; //@line 5340
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 5344
     $258 = HEAP32[$256 >> 2] | 0; //@line 5346
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 5349
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 5352
      $264 = tempRet0; //@line 5353
      $265 = $6; //@line 5354
      HEAP32[$265 >> 2] = $263; //@line 5356
      HEAP32[$265 + 4 >> 2] = $264; //@line 5359
      $$0232 = 1; //@line 5360
      $$0237 = 1329; //@line 5360
      $275 = $263; //@line 5360
      $276 = $264; //@line 5360
      label = 67; //@line 5361
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 5373
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1329 : 1331 : 1330; //@line 5373
      $275 = $258; //@line 5373
      $276 = $261; //@line 5373
      label = 67; //@line 5374
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 5380
     $$0232 = 0; //@line 5386
     $$0237 = 1329; //@line 5386
     $275 = HEAP32[$197 >> 2] | 0; //@line 5386
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 5386
     label = 67; //@line 5387
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 5398
     $$2 = $13; //@line 5399
     $$2234 = 0; //@line 5399
     $$2239 = 1329; //@line 5399
     $$2251 = $11; //@line 5399
     $$5 = 1; //@line 5399
     $$6268 = $196; //@line 5399
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 5406
     label = 72; //@line 5407
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 5411
     $$1 = $302 | 0 ? $302 : 1339; //@line 5414
     label = 72; //@line 5415
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 5425
     HEAP32[$14 >> 2] = 0; //@line 5426
     HEAP32[$6 >> 2] = $8; //@line 5427
     $$4258354 = -1; //@line 5428
     $365 = $8; //@line 5428
     label = 76; //@line 5429
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 5433
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 5436
      $$0240$lcssa356 = 0; //@line 5437
      label = 85; //@line 5438
     } else {
      $$4258354 = $$0254; //@line 5440
      $365 = $$pre348; //@line 5440
      label = 76; //@line 5441
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 5448
     $$0247 = $$1248; //@line 5448
     $$0269 = $$3272; //@line 5448
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 5453
     $$2234 = 0; //@line 5453
     $$2239 = 1329; //@line 5453
     $$2251 = $11; //@line 5453
     $$5 = $$0254; //@line 5453
     $$6268 = $$1263$; //@line 5453
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 5459
    $227 = $6; //@line 5460
    $229 = HEAP32[$227 >> 2] | 0; //@line 5462
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 5465
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 5467
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 5473
    $$0228 = $234; //@line 5478
    $$1233 = $or$cond278 ? 0 : 2; //@line 5478
    $$1238 = $or$cond278 ? 1329 : 1329 + ($$1236 >> 4) | 0; //@line 5478
    $$2256 = $$1255; //@line 5478
    $$4266 = $$3265; //@line 5478
    $281 = $229; //@line 5478
    $283 = $232; //@line 5478
    label = 68; //@line 5479
   } else if ((label | 0) == 67) {
    label = 0; //@line 5482
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 5484
    $$1233 = $$0232; //@line 5484
    $$1238 = $$0237; //@line 5484
    $$2256 = $$0254; //@line 5484
    $$4266 = $$1263$; //@line 5484
    $281 = $275; //@line 5484
    $283 = $276; //@line 5484
    label = 68; //@line 5485
   } else if ((label | 0) == 72) {
    label = 0; //@line 5488
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 5489
    $306 = ($305 | 0) == 0; //@line 5490
    $$2 = $$1; //@line 5497
    $$2234 = 0; //@line 5497
    $$2239 = 1329; //@line 5497
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 5497
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 5497
    $$6268 = $196; //@line 5497
   } else if ((label | 0) == 76) {
    label = 0; //@line 5500
    $$0229316 = $365; //@line 5501
    $$0240315 = 0; //@line 5501
    $$1244314 = 0; //@line 5501
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 5503
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 5506
      $$2245 = $$1244314; //@line 5506
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 5509
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 5515
      $$2245 = $320; //@line 5515
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 5519
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 5522
      $$0240315 = $325; //@line 5522
      $$1244314 = $320; //@line 5522
     } else {
      $$0240$lcssa = $325; //@line 5524
      $$2245 = $320; //@line 5524
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 5530
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 5533
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 5536
     label = 85; //@line 5537
    } else {
     $$1230327 = $365; //@line 5539
     $$1241326 = 0; //@line 5539
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 5541
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5544
       label = 85; //@line 5545
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 5548
      $$1241326 = $331 + $$1241326 | 0; //@line 5549
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5552
       label = 85; //@line 5553
       break L97;
      }
      _out_670($0, $9, $331); //@line 5557
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5562
       label = 85; //@line 5563
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 5560
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 5571
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 5577
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 5579
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 5584
   $$2 = $or$cond ? $$0228 : $11; //@line 5589
   $$2234 = $$1233; //@line 5589
   $$2239 = $$1238; //@line 5589
   $$2251 = $11; //@line 5589
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 5589
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 5589
  } else if ((label | 0) == 85) {
   label = 0; //@line 5592
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 5594
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 5597
   $$0247 = $$1248; //@line 5597
   $$0269 = $$3272; //@line 5597
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 5602
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 5604
  $345 = $$$5 + $$2234 | 0; //@line 5605
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 5607
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 5608
  _out_670($0, $$2239, $$2234); //@line 5609
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 5611
  _pad_676($0, 48, $$$5, $343, 0); //@line 5612
  _out_670($0, $$2, $343); //@line 5613
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 5615
  $$0243 = $$2261; //@line 5616
  $$0247 = $$1248; //@line 5616
  $$0269 = $$3272; //@line 5616
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 5624
    } else {
     $$2242302 = 1; //@line 5626
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 5629
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 5632
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 5636
      $356 = $$2242302 + 1 | 0; //@line 5637
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 5640
      } else {
       $$2242$lcssa = $356; //@line 5642
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 5648
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 5654
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 5660
       } else {
        $$0 = 1; //@line 5662
        break;
       }
      }
     } else {
      $$0 = 1; //@line 5667
     }
    }
   } else {
    $$0 = $$1248; //@line 5671
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5675
 return $$0 | 0; //@line 5675
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 2954
 $3 = HEAP32[876] | 0; //@line 2955
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 2958
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 2962
 $7 = $6 & 3; //@line 2963
 if (($7 | 0) == 1) {
  _abort(); //@line 2966
 }
 $9 = $6 & -8; //@line 2969
 $10 = $2 + $9 | 0; //@line 2970
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 2975
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 2981
   $17 = $13 + $9 | 0; //@line 2982
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 2985
   }
   if ((HEAP32[877] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 2991
    $106 = HEAP32[$105 >> 2] | 0; //@line 2992
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 2996
     $$1382 = $17; //@line 2996
     $114 = $16; //@line 2996
     break;
    }
    HEAP32[874] = $17; //@line 2999
    HEAP32[$105 >> 2] = $106 & -2; //@line 3001
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3004
    HEAP32[$16 + $17 >> 2] = $17; //@line 3006
    return;
   }
   $21 = $13 >>> 3; //@line 3009
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3013
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3015
    $28 = 3528 + ($21 << 1 << 2) | 0; //@line 3017
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3022
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3029
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[872] = HEAP32[872] & ~(1 << $21); //@line 3039
     $$1 = $16; //@line 3040
     $$1382 = $17; //@line 3040
     $114 = $16; //@line 3040
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3046
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3050
     }
     $41 = $26 + 8 | 0; //@line 3053
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3057
     } else {
      _abort(); //@line 3059
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3064
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3065
    $$1 = $16; //@line 3066
    $$1382 = $17; //@line 3066
    $114 = $16; //@line 3066
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3070
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3072
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3076
     $60 = $59 + 4 | 0; //@line 3077
     $61 = HEAP32[$60 >> 2] | 0; //@line 3078
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3081
      if (!$63) {
       $$3 = 0; //@line 3084
       break;
      } else {
       $$1387 = $63; //@line 3087
       $$1390 = $59; //@line 3087
      }
     } else {
      $$1387 = $61; //@line 3090
      $$1390 = $60; //@line 3090
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3093
      $66 = HEAP32[$65 >> 2] | 0; //@line 3094
      if ($66 | 0) {
       $$1387 = $66; //@line 3097
       $$1390 = $65; //@line 3097
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3100
      $69 = HEAP32[$68 >> 2] | 0; //@line 3101
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3106
       $$1390 = $68; //@line 3106
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3111
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3114
      $$3 = $$1387; //@line 3115
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3120
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3123
     }
     $53 = $51 + 12 | 0; //@line 3126
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3130
     }
     $56 = $48 + 8 | 0; //@line 3133
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3137
      HEAP32[$56 >> 2] = $51; //@line 3138
      $$3 = $48; //@line 3139
      break;
     } else {
      _abort(); //@line 3142
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3149
    $$1382 = $17; //@line 3149
    $114 = $16; //@line 3149
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3152
    $75 = 3792 + ($74 << 2) | 0; //@line 3153
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3158
      if (!$$3) {
       HEAP32[873] = HEAP32[873] & ~(1 << $74); //@line 3165
       $$1 = $16; //@line 3166
       $$1382 = $17; //@line 3166
       $114 = $16; //@line 3166
       break L10;
      }
     } else {
      if ((HEAP32[876] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 3173
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 3181
       if (!$$3) {
        $$1 = $16; //@line 3184
        $$1382 = $17; //@line 3184
        $114 = $16; //@line 3184
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[876] | 0; //@line 3192
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 3195
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 3199
    $92 = $16 + 16 | 0; //@line 3200
    $93 = HEAP32[$92 >> 2] | 0; //@line 3201
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 3207
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 3211
       HEAP32[$93 + 24 >> 2] = $$3; //@line 3213
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 3219
    if (!$99) {
     $$1 = $16; //@line 3222
     $$1382 = $17; //@line 3222
     $114 = $16; //@line 3222
    } else {
     if ((HEAP32[876] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 3227
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 3231
      HEAP32[$99 + 24 >> 2] = $$3; //@line 3233
      $$1 = $16; //@line 3234
      $$1382 = $17; //@line 3234
      $114 = $16; //@line 3234
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 3240
   $$1382 = $9; //@line 3240
   $114 = $2; //@line 3240
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 3245
 }
 $115 = $10 + 4 | 0; //@line 3248
 $116 = HEAP32[$115 >> 2] | 0; //@line 3249
 if (!($116 & 1)) {
  _abort(); //@line 3253
 }
 if (!($116 & 2)) {
  if ((HEAP32[878] | 0) == ($10 | 0)) {
   $124 = (HEAP32[875] | 0) + $$1382 | 0; //@line 3263
   HEAP32[875] = $124; //@line 3264
   HEAP32[878] = $$1; //@line 3265
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 3268
   if (($$1 | 0) != (HEAP32[877] | 0)) {
    return;
   }
   HEAP32[877] = 0; //@line 3274
   HEAP32[874] = 0; //@line 3275
   return;
  }
  if ((HEAP32[877] | 0) == ($10 | 0)) {
   $132 = (HEAP32[874] | 0) + $$1382 | 0; //@line 3282
   HEAP32[874] = $132; //@line 3283
   HEAP32[877] = $114; //@line 3284
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 3287
   HEAP32[$114 + $132 >> 2] = $132; //@line 3289
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 3293
  $138 = $116 >>> 3; //@line 3294
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 3299
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 3301
    $145 = 3528 + ($138 << 1 << 2) | 0; //@line 3303
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[876] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 3309
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 3316
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[872] = HEAP32[872] & ~(1 << $138); //@line 3326
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 3332
    } else {
     if ((HEAP32[876] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 3337
     }
     $160 = $143 + 8 | 0; //@line 3340
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 3344
     } else {
      _abort(); //@line 3346
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 3351
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 3352
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 3355
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 3357
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 3361
      $180 = $179 + 4 | 0; //@line 3362
      $181 = HEAP32[$180 >> 2] | 0; //@line 3363
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 3366
       if (!$183) {
        $$3400 = 0; //@line 3369
        break;
       } else {
        $$1398 = $183; //@line 3372
        $$1402 = $179; //@line 3372
       }
      } else {
       $$1398 = $181; //@line 3375
       $$1402 = $180; //@line 3375
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 3378
       $186 = HEAP32[$185 >> 2] | 0; //@line 3379
       if ($186 | 0) {
        $$1398 = $186; //@line 3382
        $$1402 = $185; //@line 3382
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 3385
       $189 = HEAP32[$188 >> 2] | 0; //@line 3386
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 3391
        $$1402 = $188; //@line 3391
       }
      }
      if ((HEAP32[876] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 3397
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 3400
       $$3400 = $$1398; //@line 3401
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 3406
      if ((HEAP32[876] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 3410
      }
      $173 = $170 + 12 | 0; //@line 3413
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 3417
      }
      $176 = $167 + 8 | 0; //@line 3420
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 3424
       HEAP32[$176 >> 2] = $170; //@line 3425
       $$3400 = $167; //@line 3426
       break;
      } else {
       _abort(); //@line 3429
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 3437
     $196 = 3792 + ($195 << 2) | 0; //@line 3438
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 3443
       if (!$$3400) {
        HEAP32[873] = HEAP32[873] & ~(1 << $195); //@line 3450
        break L108;
       }
      } else {
       if ((HEAP32[876] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 3457
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 3465
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[876] | 0; //@line 3475
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 3478
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 3482
     $213 = $10 + 16 | 0; //@line 3483
     $214 = HEAP32[$213 >> 2] | 0; //@line 3484
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 3490
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 3494
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 3496
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 3502
     if ($220 | 0) {
      if ((HEAP32[876] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 3508
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 3512
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 3514
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 3523
  HEAP32[$114 + $137 >> 2] = $137; //@line 3525
  if (($$1 | 0) == (HEAP32[877] | 0)) {
   HEAP32[874] = $137; //@line 3529
   return;
  } else {
   $$2 = $137; //@line 3532
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 3536
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 3539
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 3541
  $$2 = $$1382; //@line 3542
 }
 $235 = $$2 >>> 3; //@line 3544
 if ($$2 >>> 0 < 256) {
  $238 = 3528 + ($235 << 1 << 2) | 0; //@line 3548
  $239 = HEAP32[872] | 0; //@line 3549
  $240 = 1 << $235; //@line 3550
  if (!($239 & $240)) {
   HEAP32[872] = $239 | $240; //@line 3555
   $$0403 = $238; //@line 3557
   $$pre$phiZ2D = $238 + 8 | 0; //@line 3557
  } else {
   $244 = $238 + 8 | 0; //@line 3559
   $245 = HEAP32[$244 >> 2] | 0; //@line 3560
   if ((HEAP32[876] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 3564
   } else {
    $$0403 = $245; //@line 3567
    $$pre$phiZ2D = $244; //@line 3567
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 3570
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 3572
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 3574
  HEAP32[$$1 + 12 >> 2] = $238; //@line 3576
  return;
 }
 $251 = $$2 >>> 8; //@line 3579
 if (!$251) {
  $$0396 = 0; //@line 3582
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 3586
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 3590
   $257 = $251 << $256; //@line 3591
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 3594
   $262 = $257 << $260; //@line 3596
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 3599
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 3604
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 3610
  }
 }
 $276 = 3792 + ($$0396 << 2) | 0; //@line 3613
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 3615
 HEAP32[$$1 + 20 >> 2] = 0; //@line 3618
 HEAP32[$$1 + 16 >> 2] = 0; //@line 3619
 $280 = HEAP32[873] | 0; //@line 3620
 $281 = 1 << $$0396; //@line 3621
 do {
  if (!($280 & $281)) {
   HEAP32[873] = $280 | $281; //@line 3627
   HEAP32[$276 >> 2] = $$1; //@line 3628
   HEAP32[$$1 + 24 >> 2] = $276; //@line 3630
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 3632
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 3634
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 3642
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 3642
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 3649
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 3653
    $301 = HEAP32[$299 >> 2] | 0; //@line 3655
    if (!$301) {
     label = 121; //@line 3658
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 3661
     $$0384 = $301; //@line 3661
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[876] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 3668
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 3671
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 3673
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 3675
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 3677
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 3682
    $309 = HEAP32[$308 >> 2] | 0; //@line 3683
    $310 = HEAP32[876] | 0; //@line 3684
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 3690
     HEAP32[$308 >> 2] = $$1; //@line 3691
     HEAP32[$$1 + 8 >> 2] = $309; //@line 3693
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 3695
     HEAP32[$$1 + 24 >> 2] = 0; //@line 3697
     break;
    } else {
     _abort(); //@line 3700
    }
   }
  }
 } while (0);
 $319 = (HEAP32[880] | 0) + -1 | 0; //@line 3707
 HEAP32[880] = $319; //@line 3708
 if (!$319) {
  $$0212$in$i = 3944; //@line 3711
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 3716
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 3722
  }
 }
 HEAP32[880] = -1; //@line 3725
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 9327
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 9328
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 9329
 $d_sroa_0_0_extract_trunc = $b$0; //@line 9330
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 9331
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 9332
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 9334
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9337
    HEAP32[$rem + 4 >> 2] = 0; //@line 9338
   }
   $_0$1 = 0; //@line 9340
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9341
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9342
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 9345
    $_0$0 = 0; //@line 9346
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9347
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9349
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 9350
   $_0$1 = 0; //@line 9351
   $_0$0 = 0; //@line 9352
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9353
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 9356
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9361
     HEAP32[$rem + 4 >> 2] = 0; //@line 9362
    }
    $_0$1 = 0; //@line 9364
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9365
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9366
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 9370
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 9371
    }
    $_0$1 = 0; //@line 9373
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 9374
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9375
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 9377
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 9380
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 9381
    }
    $_0$1 = 0; //@line 9383
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 9384
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9385
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9388
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 9390
    $58 = 31 - $51 | 0; //@line 9391
    $sr_1_ph = $57; //@line 9392
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 9393
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 9394
    $q_sroa_0_1_ph = 0; //@line 9395
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 9396
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 9400
    $_0$0 = 0; //@line 9401
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9402
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9404
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9405
   $_0$1 = 0; //@line 9406
   $_0$0 = 0; //@line 9407
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9408
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9412
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 9414
     $126 = 31 - $119 | 0; //@line 9415
     $130 = $119 - 31 >> 31; //@line 9416
     $sr_1_ph = $125; //@line 9417
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 9418
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 9419
     $q_sroa_0_1_ph = 0; //@line 9420
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 9421
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 9425
     $_0$0 = 0; //@line 9426
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9427
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 9429
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9430
    $_0$1 = 0; //@line 9431
    $_0$0 = 0; //@line 9432
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9433
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 9435
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9438
    $89 = 64 - $88 | 0; //@line 9439
    $91 = 32 - $88 | 0; //@line 9440
    $92 = $91 >> 31; //@line 9441
    $95 = $88 - 32 | 0; //@line 9442
    $105 = $95 >> 31; //@line 9443
    $sr_1_ph = $88; //@line 9444
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 9445
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 9446
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 9447
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 9448
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 9452
    HEAP32[$rem + 4 >> 2] = 0; //@line 9453
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9456
    $_0$0 = $a$0 | 0 | 0; //@line 9457
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9458
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 9460
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 9461
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 9462
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9463
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 9468
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 9469
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 9470
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 9471
  $carry_0_lcssa$1 = 0; //@line 9472
  $carry_0_lcssa$0 = 0; //@line 9473
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 9475
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 9476
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 9477
  $137$1 = tempRet0; //@line 9478
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 9479
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 9480
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 9481
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 9482
  $sr_1202 = $sr_1_ph; //@line 9483
  $carry_0203 = 0; //@line 9484
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 9486
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 9487
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 9488
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 9489
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 9490
   $150$1 = tempRet0; //@line 9491
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 9492
   $carry_0203 = $151$0 & 1; //@line 9493
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 9495
   $r_sroa_1_1200 = tempRet0; //@line 9496
   $sr_1202 = $sr_1202 - 1 | 0; //@line 9497
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 9509
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 9510
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 9511
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 9512
  $carry_0_lcssa$1 = 0; //@line 9513
  $carry_0_lcssa$0 = $carry_0203; //@line 9514
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 9516
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 9517
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 9520
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 9521
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 9523
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 9524
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9525
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 82
 STACKTOP = STACKTOP + 32 | 0; //@line 83
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 83
 $0 = sp; //@line 84
 _gpio_init_out($0, 50); //@line 85
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 88
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 89
  _wait_ms(150); //@line 90
  if (___async) {
   label = 3; //@line 93
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 96
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 98
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 99
  _wait_ms(150); //@line 100
  if (___async) {
   label = 5; //@line 103
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 106
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 108
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 109
  _wait_ms(150); //@line 110
  if (___async) {
   label = 7; //@line 113
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 116
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 118
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 119
  _wait_ms(150); //@line 120
  if (___async) {
   label = 9; //@line 123
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 126
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 128
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 129
  _wait_ms(150); //@line 130
  if (___async) {
   label = 11; //@line 133
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 136
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 138
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 139
  _wait_ms(150); //@line 140
  if (___async) {
   label = 13; //@line 143
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 146
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 148
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 149
  _wait_ms(150); //@line 150
  if (___async) {
   label = 15; //@line 153
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 156
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 158
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 159
  _wait_ms(150); //@line 160
  if (___async) {
   label = 17; //@line 163
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 166
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 168
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 169
  _wait_ms(400); //@line 170
  if (___async) {
   label = 19; //@line 173
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 176
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 178
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 179
  _wait_ms(400); //@line 180
  if (___async) {
   label = 21; //@line 183
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 186
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 188
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 189
  _wait_ms(400); //@line 190
  if (___async) {
   label = 23; //@line 193
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 196
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 198
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 199
  _wait_ms(400); //@line 200
  if (___async) {
   label = 25; //@line 203
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 206
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 208
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 209
  _wait_ms(400); //@line 210
  if (___async) {
   label = 27; //@line 213
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 216
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 218
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 219
  _wait_ms(400); //@line 220
  if (___async) {
   label = 29; //@line 223
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 226
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 228
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 229
  _wait_ms(400); //@line 230
  if (___async) {
   label = 31; //@line 233
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 236
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 238
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 239
  _wait_ms(400); //@line 240
  if (___async) {
   label = 33; //@line 243
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 246
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 7; //@line 250
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 252
   sp = STACKTOP; //@line 253
   STACKTOP = sp; //@line 254
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 8; //@line 258
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 260
   sp = STACKTOP; //@line 261
   STACKTOP = sp; //@line 262
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 9; //@line 266
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 268
   sp = STACKTOP; //@line 269
   STACKTOP = sp; //@line 270
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 10; //@line 274
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 276
   sp = STACKTOP; //@line 277
   STACKTOP = sp; //@line 278
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 11; //@line 282
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 284
   sp = STACKTOP; //@line 285
   STACKTOP = sp; //@line 286
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 12; //@line 290
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 292
   sp = STACKTOP; //@line 293
   STACKTOP = sp; //@line 294
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 13; //@line 298
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 300
   sp = STACKTOP; //@line 301
   STACKTOP = sp; //@line 302
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 14; //@line 306
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 308
   sp = STACKTOP; //@line 309
   STACKTOP = sp; //@line 310
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 15; //@line 314
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 316
   sp = STACKTOP; //@line 317
   STACKTOP = sp; //@line 318
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 16; //@line 322
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 324
   sp = STACKTOP; //@line 325
   STACKTOP = sp; //@line 326
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 17; //@line 330
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 332
   sp = STACKTOP; //@line 333
   STACKTOP = sp; //@line 334
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 18; //@line 338
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 340
   sp = STACKTOP; //@line 341
   STACKTOP = sp; //@line 342
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 19; //@line 346
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 348
   sp = STACKTOP; //@line 349
   STACKTOP = sp; //@line 350
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 20; //@line 354
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 356
   sp = STACKTOP; //@line 357
   STACKTOP = sp; //@line 358
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 21; //@line 362
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 364
   sp = STACKTOP; //@line 365
   STACKTOP = sp; //@line 366
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 22; //@line 370
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 372
   sp = STACKTOP; //@line 373
   STACKTOP = sp; //@line 374
   return;
  }
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5759
      $10 = HEAP32[$9 >> 2] | 0; //@line 5760
      HEAP32[$2 >> 2] = $9 + 4; //@line 5762
      HEAP32[$0 >> 2] = $10; //@line 5763
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5779
      $17 = HEAP32[$16 >> 2] | 0; //@line 5780
      HEAP32[$2 >> 2] = $16 + 4; //@line 5782
      $20 = $0; //@line 5785
      HEAP32[$20 >> 2] = $17; //@line 5787
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 5790
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5806
      $30 = HEAP32[$29 >> 2] | 0; //@line 5807
      HEAP32[$2 >> 2] = $29 + 4; //@line 5809
      $31 = $0; //@line 5810
      HEAP32[$31 >> 2] = $30; //@line 5812
      HEAP32[$31 + 4 >> 2] = 0; //@line 5815
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5831
      $41 = $40; //@line 5832
      $43 = HEAP32[$41 >> 2] | 0; //@line 5834
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 5837
      HEAP32[$2 >> 2] = $40 + 8; //@line 5839
      $47 = $0; //@line 5840
      HEAP32[$47 >> 2] = $43; //@line 5842
      HEAP32[$47 + 4 >> 2] = $46; //@line 5845
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5861
      $57 = HEAP32[$56 >> 2] | 0; //@line 5862
      HEAP32[$2 >> 2] = $56 + 4; //@line 5864
      $59 = ($57 & 65535) << 16 >> 16; //@line 5866
      $62 = $0; //@line 5869
      HEAP32[$62 >> 2] = $59; //@line 5871
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 5874
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5890
      $72 = HEAP32[$71 >> 2] | 0; //@line 5891
      HEAP32[$2 >> 2] = $71 + 4; //@line 5893
      $73 = $0; //@line 5895
      HEAP32[$73 >> 2] = $72 & 65535; //@line 5897
      HEAP32[$73 + 4 >> 2] = 0; //@line 5900
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5916
      $83 = HEAP32[$82 >> 2] | 0; //@line 5917
      HEAP32[$2 >> 2] = $82 + 4; //@line 5919
      $85 = ($83 & 255) << 24 >> 24; //@line 5921
      $88 = $0; //@line 5924
      HEAP32[$88 >> 2] = $85; //@line 5926
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 5929
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5945
      $98 = HEAP32[$97 >> 2] | 0; //@line 5946
      HEAP32[$2 >> 2] = $97 + 4; //@line 5948
      $99 = $0; //@line 5950
      HEAP32[$99 >> 2] = $98 & 255; //@line 5952
      HEAP32[$99 + 4 >> 2] = 0; //@line 5955
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5971
      $109 = +HEAPF64[$108 >> 3]; //@line 5972
      HEAP32[$2 >> 2] = $108 + 8; //@line 5974
      HEAPF64[$0 >> 3] = $109; //@line 5975
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5991
      $116 = +HEAPF64[$115 >> 3]; //@line 5992
      HEAP32[$2 >> 2] = $115 + 8; //@line 5994
      HEAPF64[$0 >> 3] = $116; //@line 5995
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
 sp = STACKTOP; //@line 4659
 STACKTOP = STACKTOP + 224 | 0; //@line 4660
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 4660
 $3 = sp + 120 | 0; //@line 4661
 $4 = sp + 80 | 0; //@line 4662
 $5 = sp; //@line 4663
 $6 = sp + 136 | 0; //@line 4664
 dest = $4; //@line 4665
 stop = dest + 40 | 0; //@line 4665
 do {
  HEAP32[dest >> 2] = 0; //@line 4665
  dest = dest + 4 | 0; //@line 4665
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 4667
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 4671
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 4678
  } else {
   $43 = 0; //@line 4680
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 4682
  $14 = $13 & 32; //@line 4683
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 4689
  }
  $19 = $0 + 48 | 0; //@line 4691
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 4696
    $24 = HEAP32[$23 >> 2] | 0; //@line 4697
    HEAP32[$23 >> 2] = $6; //@line 4698
    $25 = $0 + 28 | 0; //@line 4699
    HEAP32[$25 >> 2] = $6; //@line 4700
    $26 = $0 + 20 | 0; //@line 4701
    HEAP32[$26 >> 2] = $6; //@line 4702
    HEAP32[$19 >> 2] = 80; //@line 4703
    $28 = $0 + 16 | 0; //@line 4705
    HEAP32[$28 >> 2] = $6 + 80; //@line 4706
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 4707
    if (!$24) {
     $$1 = $29; //@line 4710
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 4713
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 4714
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 4715
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 34; //@line 4718
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 4720
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 4722
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 4724
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 4726
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 4728
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 4730
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 4732
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 4734
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 4736
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 4738
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 4740
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 4742
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 4744
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 4746
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 4748
      sp = STACKTOP; //@line 4749
      STACKTOP = sp; //@line 4750
      return 0; //@line 4750
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 4752
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 4755
      HEAP32[$23 >> 2] = $24; //@line 4756
      HEAP32[$19 >> 2] = 0; //@line 4757
      HEAP32[$28 >> 2] = 0; //@line 4758
      HEAP32[$25 >> 2] = 0; //@line 4759
      HEAP32[$26 >> 2] = 0; //@line 4760
      $$1 = $$; //@line 4761
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 4767
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 4770
  HEAP32[$0 >> 2] = $51 | $14; //@line 4775
  if ($43 | 0) {
   ___unlockfile($0); //@line 4778
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 4780
 }
 STACKTOP = sp; //@line 4782
 return $$0 | 0; //@line 4782
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7777
 STACKTOP = STACKTOP + 64 | 0; //@line 7778
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7778
 $4 = sp; //@line 7779
 $5 = HEAP32[$0 >> 2] | 0; //@line 7780
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 7783
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 7785
 HEAP32[$4 >> 2] = $2; //@line 7786
 HEAP32[$4 + 4 >> 2] = $0; //@line 7788
 HEAP32[$4 + 8 >> 2] = $1; //@line 7790
 HEAP32[$4 + 12 >> 2] = $3; //@line 7792
 $14 = $4 + 16 | 0; //@line 7793
 $15 = $4 + 20 | 0; //@line 7794
 $16 = $4 + 24 | 0; //@line 7795
 $17 = $4 + 28 | 0; //@line 7796
 $18 = $4 + 32 | 0; //@line 7797
 $19 = $4 + 40 | 0; //@line 7798
 dest = $14; //@line 7799
 stop = dest + 36 | 0; //@line 7799
 do {
  HEAP32[dest >> 2] = 0; //@line 7799
  dest = dest + 4 | 0; //@line 7799
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 7799
 HEAP8[$14 + 38 >> 0] = 0; //@line 7799
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 7804
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7807
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7808
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 7809
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 38; //@line 7812
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 7814
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 7816
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 7818
    sp = STACKTOP; //@line 7819
    STACKTOP = sp; //@line 7820
    return 0; //@line 7820
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7822
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 7826
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 7830
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 7833
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 7834
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 7835
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 39; //@line 7838
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 7840
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 7842
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 7844
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 7846
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 7848
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 7850
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 7852
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 7854
    sp = STACKTOP; //@line 7855
    STACKTOP = sp; //@line 7856
    return 0; //@line 7856
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7858
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 7872
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 7880
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 7896
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 7901
  }
 } while (0);
 STACKTOP = sp; //@line 7904
 return $$0 | 0; //@line 7904
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 4531
 $7 = ($2 | 0) != 0; //@line 4535
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 4539
   $$03555 = $0; //@line 4540
   $$03654 = $2; //@line 4540
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 4545
     $$036$lcssa64 = $$03654; //@line 4545
     label = 6; //@line 4546
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 4549
    $12 = $$03654 + -1 | 0; //@line 4550
    $16 = ($12 | 0) != 0; //@line 4554
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 4557
     $$03654 = $12; //@line 4557
    } else {
     $$035$lcssa = $11; //@line 4559
     $$036$lcssa = $12; //@line 4559
     $$lcssa = $16; //@line 4559
     label = 5; //@line 4560
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 4565
   $$036$lcssa = $2; //@line 4565
   $$lcssa = $7; //@line 4565
   label = 5; //@line 4566
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 4571
   $$036$lcssa64 = $$036$lcssa; //@line 4571
   label = 6; //@line 4572
  } else {
   $$2 = $$035$lcssa; //@line 4574
   $$3 = 0; //@line 4574
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 4580
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 4583
    $$3 = $$036$lcssa64; //@line 4583
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 4585
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 4589
      $$13745 = $$036$lcssa64; //@line 4589
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 4592
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 4601
       $30 = $$13745 + -4 | 0; //@line 4602
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 4605
        $$13745 = $30; //@line 4605
       } else {
        $$0$lcssa = $29; //@line 4607
        $$137$lcssa = $30; //@line 4607
        label = 11; //@line 4608
        break L11;
       }
      }
      $$140 = $$046; //@line 4612
      $$23839 = $$13745; //@line 4612
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 4614
      $$137$lcssa = $$036$lcssa64; //@line 4614
      label = 11; //@line 4615
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 4621
      $$3 = 0; //@line 4621
      break;
     } else {
      $$140 = $$0$lcssa; //@line 4624
      $$23839 = $$137$lcssa; //@line 4624
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 4631
      $$3 = $$23839; //@line 4631
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 4634
     $$23839 = $$23839 + -1 | 0; //@line 4635
     if (!$$23839) {
      $$2 = $35; //@line 4638
      $$3 = 0; //@line 4638
      break;
     } else {
      $$140 = $35; //@line 4641
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 4649
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 4302
 do {
  if (!$0) {
   do {
    if (!(HEAP32[56] | 0)) {
     $34 = 0; //@line 4310
    } else {
     $12 = HEAP32[56] | 0; //@line 4312
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4313
     $13 = _fflush($12) | 0; //@line 4314
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 30; //@line 4317
      sp = STACKTOP; //@line 4318
      return 0; //@line 4319
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 4321
      $34 = $13; //@line 4322
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 4328
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 4332
    } else {
     $$02327 = $$02325; //@line 4334
     $$02426 = $34; //@line 4334
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 4341
      } else {
       $28 = 0; //@line 4343
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4351
       $25 = ___fflush_unlocked($$02327) | 0; //@line 4352
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 4357
       $$1 = $25 | $$02426; //@line 4359
      } else {
       $$1 = $$02426; //@line 4361
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 4365
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 4368
      if (!$$023) {
       $$024$lcssa = $$1; //@line 4371
       break L9;
      } else {
       $$02327 = $$023; //@line 4374
       $$02426 = $$1; //@line 4374
      }
     }
     HEAP32[$AsyncCtx >> 2] = 31; //@line 4377
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 4379
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 4381
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 4383
     sp = STACKTOP; //@line 4384
     return 0; //@line 4385
    }
   } while (0);
   ___ofl_unlock(); //@line 4388
   $$0 = $$024$lcssa; //@line 4389
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4395
    $5 = ___fflush_unlocked($0) | 0; //@line 4396
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 28; //@line 4399
     sp = STACKTOP; //@line 4400
     return 0; //@line 4401
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4403
     $$0 = $5; //@line 4404
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 4409
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4410
   $7 = ___fflush_unlocked($0) | 0; //@line 4411
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 29; //@line 4414
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 4417
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4419
    sp = STACKTOP; //@line 4420
    return 0; //@line 4421
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4423
   if ($phitmp) {
    $$0 = $7; //@line 4425
   } else {
    ___unlockfile($0); //@line 4427
    $$0 = $7; //@line 4428
   }
  }
 } while (0);
 return $$0 | 0; //@line 4432
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7959
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7965
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 7971
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 7974
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7975
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 7976
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 42; //@line 7979
     sp = STACKTOP; //@line 7980
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7983
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 7991
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 7996
     $19 = $1 + 44 | 0; //@line 7997
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 8003
     HEAP8[$22 >> 0] = 0; //@line 8004
     $23 = $1 + 53 | 0; //@line 8005
     HEAP8[$23 >> 0] = 0; //@line 8006
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 8008
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 8011
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 8012
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 8013
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 41; //@line 8016
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 8018
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8020
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 8022
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 8024
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 8026
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 8028
      sp = STACKTOP; //@line 8029
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 8032
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 8036
      label = 13; //@line 8037
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 8042
       label = 13; //@line 8043
      } else {
       $$037$off039 = 3; //@line 8045
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 8049
      $39 = $1 + 40 | 0; //@line 8050
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 8053
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 8063
        $$037$off039 = $$037$off038; //@line 8064
       } else {
        $$037$off039 = $$037$off038; //@line 8066
       }
      } else {
       $$037$off039 = $$037$off038; //@line 8069
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 8072
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 8079
   }
  }
 } while (0);
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3750
 STACKTOP = STACKTOP + 48 | 0; //@line 3751
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3751
 $vararg_buffer3 = sp + 16 | 0; //@line 3752
 $vararg_buffer = sp; //@line 3753
 $3 = sp + 32 | 0; //@line 3754
 $4 = $0 + 28 | 0; //@line 3755
 $5 = HEAP32[$4 >> 2] | 0; //@line 3756
 HEAP32[$3 >> 2] = $5; //@line 3757
 $7 = $0 + 20 | 0; //@line 3759
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 3761
 HEAP32[$3 + 4 >> 2] = $9; //@line 3762
 HEAP32[$3 + 8 >> 2] = $1; //@line 3764
 HEAP32[$3 + 12 >> 2] = $2; //@line 3766
 $12 = $9 + $2 | 0; //@line 3767
 $13 = $0 + 60 | 0; //@line 3768
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 3771
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 3773
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 3775
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 3777
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 3781
  } else {
   $$04756 = 2; //@line 3783
   $$04855 = $12; //@line 3783
   $$04954 = $3; //@line 3783
   $27 = $17; //@line 3783
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 3789
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 3791
    $38 = $27 >>> 0 > $37 >>> 0; //@line 3792
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 3794
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 3796
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 3798
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 3801
    $44 = $$150 + 4 | 0; //@line 3802
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 3805
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 3808
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 3810
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 3812
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 3814
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 3817
     break L1;
    } else {
     $$04756 = $$1; //@line 3820
     $$04954 = $$150; //@line 3820
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 3824
   HEAP32[$4 >> 2] = 0; //@line 3825
   HEAP32[$7 >> 2] = 0; //@line 3826
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 3829
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 3832
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 3837
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 3843
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 3848
  $25 = $20; //@line 3849
  HEAP32[$4 >> 2] = $25; //@line 3850
  HEAP32[$7 >> 2] = $25; //@line 3851
  $$051 = $2; //@line 3852
 }
 STACKTOP = sp; //@line 3854
 return $$051 | 0; //@line 3854
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 9634
 }
 ret = dest | 0; //@line 9637
 dest_end = dest + num | 0; //@line 9638
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 9642
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9643
   dest = dest + 1 | 0; //@line 9644
   src = src + 1 | 0; //@line 9645
   num = num - 1 | 0; //@line 9646
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 9648
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 9649
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9651
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 9652
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 9653
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 9654
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 9655
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 9656
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 9657
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 9658
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 9659
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 9660
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 9661
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 9662
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 9663
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 9664
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 9665
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 9666
   dest = dest + 64 | 0; //@line 9667
   src = src + 64 | 0; //@line 9668
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9671
   dest = dest + 4 | 0; //@line 9672
   src = src + 4 | 0; //@line 9673
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 9677
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9679
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 9680
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 9681
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 9682
   dest = dest + 4 | 0; //@line 9683
   src = src + 4 | 0; //@line 9684
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9689
  dest = dest + 1 | 0; //@line 9690
  src = src + 1 | 0; //@line 9691
 }
 return ret | 0; //@line 9693
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7460
 STACKTOP = STACKTOP + 64 | 0; //@line 7461
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7461
 $3 = sp; //@line 7462
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 7465
 } else {
  if (!$1) {
   $$2 = 0; //@line 7469
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 7471
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 7472
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 36; //@line 7475
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 7477
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7479
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 7481
    sp = STACKTOP; //@line 7482
    STACKTOP = sp; //@line 7483
    return 0; //@line 7483
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7485
   if (!$6) {
    $$2 = 0; //@line 7488
   } else {
    dest = $3 + 4 | 0; //@line 7491
    stop = dest + 52 | 0; //@line 7491
    do {
     HEAP32[dest >> 2] = 0; //@line 7491
     dest = dest + 4 | 0; //@line 7491
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 7492
    HEAP32[$3 + 8 >> 2] = $0; //@line 7494
    HEAP32[$3 + 12 >> 2] = -1; //@line 7496
    HEAP32[$3 + 48 >> 2] = 1; //@line 7498
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 7501
    $18 = HEAP32[$2 >> 2] | 0; //@line 7502
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7503
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 7504
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 37; //@line 7507
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 7509
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7511
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7513
     sp = STACKTOP; //@line 7514
     STACKTOP = sp; //@line 7515
     return 0; //@line 7515
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7517
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 7524
     $$0 = 1; //@line 7525
    } else {
     $$0 = 0; //@line 7527
    }
    $$2 = $$0; //@line 7529
   }
  }
 }
 STACKTOP = sp; //@line 7533
 return $$2 | 0; //@line 7533
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 4167
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 4170
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 4173
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 4176
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 4182
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 4191
     $24 = $13 >>> 2; //@line 4192
     $$090 = 0; //@line 4193
     $$094 = $7; //@line 4193
     while (1) {
      $25 = $$094 >>> 1; //@line 4195
      $26 = $$090 + $25 | 0; //@line 4196
      $27 = $26 << 1; //@line 4197
      $28 = $27 + $23 | 0; //@line 4198
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 4201
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4205
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 4211
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 4219
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 4223
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 4229
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 4234
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 4237
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 4237
      }
     }
     $46 = $27 + $24 | 0; //@line 4240
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 4243
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4247
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 4259
     } else {
      $$4 = 0; //@line 4261
     }
    } else {
     $$4 = 0; //@line 4264
    }
   } else {
    $$4 = 0; //@line 4267
   }
  } else {
   $$4 = 0; //@line 4270
  }
 } while (0);
 return $$4 | 0; //@line 4273
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4438
 $1 = $0 + 20 | 0; //@line 4439
 $3 = $0 + 28 | 0; //@line 4441
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 4447
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4448
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 4449
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 4452
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 4454
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 4456
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 4458
    sp = STACKTOP; //@line 4459
    return 0; //@line 4460
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4462
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 4466
     break;
    } else {
     label = 5; //@line 4469
     break;
    }
   }
  } else {
   label = 5; //@line 4474
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 4478
  $14 = HEAP32[$13 >> 2] | 0; //@line 4479
  $15 = $0 + 8 | 0; //@line 4480
  $16 = HEAP32[$15 >> 2] | 0; //@line 4481
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 4489
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4490
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 4491
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 33; //@line 4494
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4496
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 4498
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 4500
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 4502
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 4504
     sp = STACKTOP; //@line 4505
     return 0; //@line 4506
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4508
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 4514
  HEAP32[$3 >> 2] = 0; //@line 4515
  HEAP32[$1 >> 2] = 0; //@line 4516
  HEAP32[$15 >> 2] = 0; //@line 4517
  HEAP32[$13 >> 2] = 0; //@line 4518
  $$0 = 0; //@line 4519
 }
 return $$0 | 0; //@line 4521
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 4058
 $4 = HEAP32[$3 >> 2] | 0; //@line 4059
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 4066
   label = 5; //@line 4067
  } else {
   $$1 = 0; //@line 4069
  }
 } else {
  $12 = $4; //@line 4073
  label = 5; //@line 4074
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 4078
   $10 = HEAP32[$9 >> 2] | 0; //@line 4079
   $14 = $10; //@line 4082
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 4087
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 4095
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 4099
       $$141 = $0; //@line 4099
       $$143 = $1; //@line 4099
       $31 = $14; //@line 4099
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 4102
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 4109
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 4114
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 4117
      break L5;
     }
     $$139 = $$038; //@line 4123
     $$141 = $0 + $$038 | 0; //@line 4123
     $$143 = $1 - $$038 | 0; //@line 4123
     $31 = HEAP32[$9 >> 2] | 0; //@line 4123
    } else {
     $$139 = 0; //@line 4125
     $$141 = $0; //@line 4125
     $$143 = $1; //@line 4125
     $31 = $14; //@line 4125
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 4128
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 4131
   $$1 = $$139 + $$143 | 0; //@line 4133
  }
 } while (0);
 return $$1 | 0; //@line 4136
}
function _fflush__async_cb_19($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8782
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8784
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8786
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 8790
  } else {
   $$02327 = $$02325; //@line 8792
   $$02426 = $AsyncRetVal; //@line 8792
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 8799
    } else {
     $16 = 0; //@line 8801
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 8813
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8816
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 8819
     break L3;
    } else {
     $$02327 = $$023; //@line 8822
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8825
   $13 = ___fflush_unlocked($$02327) | 0; //@line 8826
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 8830
    ___async_unwind = 0; //@line 8831
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 8833
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 8835
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 8837
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 8839
   sp = STACKTOP; //@line 8840
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 8844
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 8846
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 9698
 value = value & 255; //@line 9700
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 9703
   ptr = ptr + 1 | 0; //@line 9704
  }
  aligned_end = end & -4 | 0; //@line 9707
  block_aligned_end = aligned_end - 64 | 0; //@line 9708
  value4 = value | value << 8 | value << 16 | value << 24; //@line 9709
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9712
   HEAP32[ptr + 4 >> 2] = value4; //@line 9713
   HEAP32[ptr + 8 >> 2] = value4; //@line 9714
   HEAP32[ptr + 12 >> 2] = value4; //@line 9715
   HEAP32[ptr + 16 >> 2] = value4; //@line 9716
   HEAP32[ptr + 20 >> 2] = value4; //@line 9717
   HEAP32[ptr + 24 >> 2] = value4; //@line 9718
   HEAP32[ptr + 28 >> 2] = value4; //@line 9719
   HEAP32[ptr + 32 >> 2] = value4; //@line 9720
   HEAP32[ptr + 36 >> 2] = value4; //@line 9721
   HEAP32[ptr + 40 >> 2] = value4; //@line 9722
   HEAP32[ptr + 44 >> 2] = value4; //@line 9723
   HEAP32[ptr + 48 >> 2] = value4; //@line 9724
   HEAP32[ptr + 52 >> 2] = value4; //@line 9725
   HEAP32[ptr + 56 >> 2] = value4; //@line 9726
   HEAP32[ptr + 60 >> 2] = value4; //@line 9727
   ptr = ptr + 64 | 0; //@line 9728
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9732
   ptr = ptr + 4 | 0; //@line 9733
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 9738
  ptr = ptr + 1 | 0; //@line 9739
 }
 return end - num | 0; //@line 9741
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8683
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 8693
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 8693
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 8693
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 8697
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 8700
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 8703
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 8711
  } else {
   $20 = 0; //@line 8713
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 8723
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 8727
  HEAP32[___async_retval >> 2] = $$1; //@line 8729
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8732
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 8733
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 8737
  ___async_unwind = 0; //@line 8738
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 8740
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 8742
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 8744
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 8746
 sp = STACKTOP; //@line 8747
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9046
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9048
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9050
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9052
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 9057
  } else {
   $9 = $4 + 4 | 0; //@line 9059
   $10 = HEAP32[$9 >> 2] | 0; //@line 9060
   $11 = $4 + 8 | 0; //@line 9061
   $12 = HEAP32[$11 >> 2] | 0; //@line 9062
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 9066
    HEAP32[$6 >> 2] = 0; //@line 9067
    HEAP32[$2 >> 2] = 0; //@line 9068
    HEAP32[$11 >> 2] = 0; //@line 9069
    HEAP32[$9 >> 2] = 0; //@line 9070
    $$0 = 0; //@line 9071
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 9078
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9079
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 9080
   if (!___async) {
    ___async_unwind = 0; //@line 9083
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 9085
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 9087
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 9089
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 9091
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 9093
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 9095
   sp = STACKTOP; //@line 9096
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 9101
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 7210
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 7215
    $$0 = 1; //@line 7216
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 7229
     $$0 = 1; //@line 7230
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 7234
     $$0 = -1; //@line 7235
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 7245
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 7249
    $$0 = 2; //@line 7250
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 7262
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 7268
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 7272
    $$0 = 3; //@line 7273
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 7283
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 7289
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 7295
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 7299
    $$0 = 4; //@line 7300
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 7304
    $$0 = -1; //@line 7305
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7310
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_21($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8997
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8999
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9001
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9003
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9005
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 9010
  return;
 }
 dest = $2 + 4 | 0; //@line 9014
 stop = dest + 52 | 0; //@line 9014
 do {
  HEAP32[dest >> 2] = 0; //@line 9014
  dest = dest + 4 | 0; //@line 9014
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 9015
 HEAP32[$2 + 8 >> 2] = $4; //@line 9017
 HEAP32[$2 + 12 >> 2] = -1; //@line 9019
 HEAP32[$2 + 48 >> 2] = 1; //@line 9021
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 9024
 $16 = HEAP32[$6 >> 2] | 0; //@line 9025
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 9026
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 9027
 if (!___async) {
  ___async_unwind = 0; //@line 9030
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 9032
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 9034
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 9036
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 9038
 sp = STACKTOP; //@line 9039
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 6094
  $8 = $0; //@line 6094
  $9 = $1; //@line 6094
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 6096
   $$0914 = $$0914 + -1 | 0; //@line 6100
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 6101
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 6102
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 6110
   }
  }
  $$010$lcssa$off0 = $8; //@line 6115
  $$09$lcssa = $$0914; //@line 6115
 } else {
  $$010$lcssa$off0 = $0; //@line 6117
  $$09$lcssa = $2; //@line 6117
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 6121
 } else {
  $$012 = $$010$lcssa$off0; //@line 6123
  $$111 = $$09$lcssa; //@line 6123
  while (1) {
   $26 = $$111 + -1 | 0; //@line 6128
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 6129
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 6133
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 6136
    $$111 = $26; //@line 6136
   }
  }
 }
 return $$1$lcssa | 0; //@line 6140
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $8 = 0.0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9197
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9199
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9201
 if (+_pwmout_read(3480) == 1.0) {
  if (!(HEAP8[3484] | 0)) {
   HEAP8[3484] = 1; //@line 9208
  }
  _pwmout_write(3480, 0.0); //@line 9210
 }
 $8 = +_pwmout_read(3480) + .1; //@line 9215
 if (!(HEAP8[3484] | 0)) {
  HEAP8[3484] = 1; //@line 9219
 }
 _pwmout_write(3480, $8); //@line 9221
 HEAPF64[$2 >> 3] = +_pwmout_read(3480); //@line 9224
 _printf(848, $2) | 0; //@line 9225
 $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 9226
 _wait(.20000000298023224); //@line 9227
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 9230
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 9231
  HEAP32[$13 >> 2] = $2; //@line 9232
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 9233
  HEAP32[$14 >> 2] = $4; //@line 9234
  sp = STACKTOP; //@line 9235
  return;
 }
 ___async_unwind = 0; //@line 9238
 HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 9239
 $13 = $ReallocAsyncCtx + 4 | 0; //@line 9240
 HEAP32[$13 >> 2] = $2; //@line 9241
 $14 = $ReallocAsyncCtx + 8 | 0; //@line 9242
 HEAP32[$14 >> 2] = $4; //@line 9243
 sp = STACKTOP; //@line 9244
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 7707
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 7714
   $10 = $1 + 16 | 0; //@line 7715
   $11 = HEAP32[$10 >> 2] | 0; //@line 7716
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 7719
    HEAP32[$1 + 24 >> 2] = $4; //@line 7721
    HEAP32[$1 + 36 >> 2] = 1; //@line 7723
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 7733
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 7738
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 7741
    HEAP8[$1 + 54 >> 0] = 1; //@line 7743
    break;
   }
   $21 = $1 + 24 | 0; //@line 7746
   $22 = HEAP32[$21 >> 2] | 0; //@line 7747
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 7750
    $28 = $4; //@line 7751
   } else {
    $28 = $22; //@line 7753
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 7762
   }
  }
 } while (0);
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7566
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 7575
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 7580
      HEAP32[$13 >> 2] = $2; //@line 7581
      $19 = $1 + 40 | 0; //@line 7582
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 7585
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7595
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 7599
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 7606
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9136
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9138
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9140
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9144
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 9148
  label = 4; //@line 9149
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 9154
   label = 4; //@line 9155
  } else {
   $$037$off039 = 3; //@line 9157
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 9161
  $17 = $8 + 40 | 0; //@line 9162
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 9165
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 9175
    $$037$off039 = $$037$off038; //@line 9176
   } else {
    $$037$off039 = $$037$off038; //@line 9178
   }
  } else {
   $$037$off039 = $$037$off038; //@line 9181
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 9184
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 7330
 while (1) {
  if ((HEAPU8[1399 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 7337
   break;
  }
  $7 = $$016 + 1 | 0; //@line 7340
  if (($7 | 0) == 87) {
   $$01214 = 1487; //@line 7343
   $$115 = 87; //@line 7343
   label = 5; //@line 7344
   break;
  } else {
   $$016 = $7; //@line 7347
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 1487; //@line 7353
  } else {
   $$01214 = 1487; //@line 7355
   $$115 = $$016; //@line 7355
   label = 5; //@line 7356
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 7361
   $$113 = $$01214; //@line 7362
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 7366
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 7373
   if (!$$115) {
    $$012$lcssa = $$113; //@line 7376
    break;
   } else {
    $$01214 = $$113; //@line 7379
    label = 5; //@line 7380
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 7387
}
function _main() {
 var $3 = 0.0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 537
 STACKTOP = STACKTOP + 16 | 0; //@line 538
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 538
 $vararg_buffer = sp; //@line 539
 while (1) {
  $3 = +_pwmout_read(3480) + .1; //@line 544
  if (!(HEAP8[3484] | 0)) {
   HEAP8[3484] = 1; //@line 548
  }
  _pwmout_write(3480, $3); //@line 550
  HEAPF64[$vararg_buffer >> 3] = +_pwmout_read(3480); //@line 553
  _printf(848, $vararg_buffer) | 0; //@line 554
  $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 555
  _wait(.20000000298023224); //@line 556
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 561
  if (!(+_pwmout_read(3480) == 1.0)) {
   continue;
  }
  if (!(HEAP8[3484] | 0)) {
   HEAP8[3484] = 1; //@line 570
  }
  _pwmout_write(3480, 0.0); //@line 572
 }
 HEAP32[$AsyncCtx >> 2] = 27; //@line 574
 HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 576
 HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 578
 sp = STACKTOP; //@line 579
 STACKTOP = sp; //@line 580
 return 0; //@line 580
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 441
 $2 = $0 + 12 | 0; //@line 443
 $3 = HEAP32[$2 >> 2] | 0; //@line 444
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 448
   _mbed_assert_internal(759, 764, 528); //@line 449
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 23; //@line 452
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 454
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 456
    sp = STACKTOP; //@line 457
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 460
    $8 = HEAP32[$2 >> 2] | 0; //@line 462
    break;
   }
  } else {
   $8 = $3; //@line 466
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 469
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 471
 FUNCTION_TABLE_vi[$7 & 63]($0); //@line 472
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 24; //@line 475
  sp = STACKTOP; //@line 476
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 479
  return;
 }
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 7161
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 7161
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 7162
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 7163
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 7172
    $$016 = $9; //@line 7175
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 7175
   } else {
    $$016 = $0; //@line 7177
    $storemerge = 0; //@line 7177
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 7179
   $$0 = $$016; //@line 7180
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 7184
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 7190
   HEAP32[tempDoublePtr >> 2] = $2; //@line 7193
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 7193
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 7194
  }
 }
 return +$$0;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8130
 STACKTOP = STACKTOP + 16 | 0; //@line 8131
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8131
 $3 = sp; //@line 8132
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8134
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 8137
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8138
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 8139
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 8142
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 8144
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8146
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8148
  sp = STACKTOP; //@line 8149
  STACKTOP = sp; //@line 8150
  return 0; //@line 8150
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 8152
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 8156
 }
 STACKTOP = sp; //@line 8158
 return $8 & 1 | 0; //@line 8158
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8862
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8870
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8872
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8874
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8876
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8878
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8880
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 8882
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 8893
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 8894
 HEAP32[$10 >> 2] = 0; //@line 8895
 HEAP32[$12 >> 2] = 0; //@line 8896
 HEAP32[$14 >> 2] = 0; //@line 8897
 HEAP32[$2 >> 2] = 0; //@line 8898
 $33 = HEAP32[$16 >> 2] | 0; //@line 8899
 HEAP32[$16 >> 2] = $33 | $18; //@line 8904
 if ($20 | 0) {
  ___unlockfile($22); //@line 8907
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 8910
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
 sp = STACKTOP; //@line 7922
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7928
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 7931
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7934
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7935
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 7936
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 40; //@line 7939
    sp = STACKTOP; //@line 7940
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7943
    break;
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8091
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 8097
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 8100
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 8103
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8104
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 8105
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 43; //@line 8108
    sp = STACKTOP; //@line 8109
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8112
    break;
   }
  }
 } while (0);
 return;
}
function ___dynamic_cast__async_cb_1($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8221
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8223
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8225
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8231
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 8246
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 8262
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 8267
    break;
   }
  default:
   {
    $$0 = 0; //@line 8271
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 8276
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 6159
 STACKTOP = STACKTOP + 256 | 0; //@line 6160
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 6160
 $5 = sp; //@line 6161
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 6167
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 6171
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 6174
   $$011 = $9; //@line 6175
   do {
    _out_670($0, $5, 256); //@line 6177
    $$011 = $$011 + -256 | 0; //@line 6178
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 6187
  } else {
   $$0$lcssa = $9; //@line 6189
  }
  _out_670($0, $5, $$0$lcssa); //@line 6191
 }
 STACKTOP = sp; //@line 6193
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3861
 STACKTOP = STACKTOP + 32 | 0; //@line 3862
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 3862
 $vararg_buffer = sp; //@line 3863
 $3 = sp + 20 | 0; //@line 3864
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 3868
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 3870
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 3872
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 3874
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 3876
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 3881
  $10 = -1; //@line 3882
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 3885
 }
 STACKTOP = sp; //@line 3887
 return $10 | 0; //@line 3887
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7401
 STACKTOP = STACKTOP + 16 | 0; //@line 7402
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7402
 $1 = sp; //@line 7403
 HEAP32[$1 >> 2] = $varargs; //@line 7404
 $2 = HEAP32[24] | 0; //@line 7405
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7406
 $3 = _vfprintf($2, $0, $1) | 0; //@line 7407
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 7410
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7412
  sp = STACKTOP; //@line 7413
  STACKTOP = sp; //@line 7414
  return 0; //@line 7414
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7416
  STACKTOP = sp; //@line 7417
  return $3 | 0; //@line 7417
 }
 return 0; //@line 7419
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 55
 STACKTOP = STACKTOP + 16 | 0; //@line 56
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 56
 $vararg_buffer = sp; //@line 57
 HEAP32[$vararg_buffer >> 2] = $0; //@line 58
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 60
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 62
 _mbed_error_printf(552, $vararg_buffer); //@line 63
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 64
 _mbed_die(); //@line 65
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 6; //@line 68
  sp = STACKTOP; //@line 69
  STACKTOP = sp; //@line 70
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 72
  STACKTOP = sp; //@line 73
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 7644
 $5 = HEAP32[$4 >> 2] | 0; //@line 7645
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 7649
   HEAP32[$1 + 24 >> 2] = $3; //@line 7651
   HEAP32[$1 + 36 >> 2] = 1; //@line 7653
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 7657
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 7660
    HEAP32[$1 + 24 >> 2] = 2; //@line 7662
    HEAP8[$1 + 54 >> 0] = 1; //@line 7664
    break;
   }
   $10 = $1 + 24 | 0; //@line 7667
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 7671
   }
  }
 } while (0);
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 3968
 $3 = HEAP8[$1 >> 0] | 0; //@line 3969
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 3974
  $$lcssa8 = $2; //@line 3974
 } else {
  $$011 = $1; //@line 3976
  $$0710 = $0; //@line 3976
  do {
   $$0710 = $$0710 + 1 | 0; //@line 3978
   $$011 = $$011 + 1 | 0; //@line 3979
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 3980
   $9 = HEAP8[$$011 >> 0] | 0; //@line 3981
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 3986
  $$lcssa8 = $8; //@line 3986
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 3996
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3920
 STACKTOP = STACKTOP + 32 | 0; //@line 3921
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 3921
 $vararg_buffer = sp; //@line 3922
 HEAP32[$0 + 36 >> 2] = 4; //@line 3925
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 3933
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 3935
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 3937
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 3942
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 3945
 STACKTOP = sp; //@line 3946
 return $14 | 0; //@line 3946
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 8607
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8609
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8611
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 8612
 _wait_ms(150); //@line 8613
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 8616
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 8617
  HEAP32[$4 >> 2] = $2; //@line 8618
  sp = STACKTOP; //@line 8619
  return;
 }
 ___async_unwind = 0; //@line 8622
 HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 8623
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 8624
 HEAP32[$4 >> 2] = $2; //@line 8625
 sp = STACKTOP; //@line 8626
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8582
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8584
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8586
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 8587
 _wait_ms(150); //@line 8588
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 8591
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 8592
  HEAP32[$4 >> 2] = $2; //@line 8593
  sp = STACKTOP; //@line 8594
  return;
 }
 ___async_unwind = 0; //@line 8597
 HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 8598
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 8599
 HEAP32[$4 >> 2] = $2; //@line 8600
 sp = STACKTOP; //@line 8601
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 8557
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8559
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8561
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 8562
 _wait_ms(150); //@line 8563
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8566
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8567
  HEAP32[$4 >> 2] = $2; //@line 8568
  sp = STACKTOP; //@line 8569
  return;
 }
 ___async_unwind = 0; //@line 8572
 HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8573
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8574
 HEAP32[$4 >> 2] = $2; //@line 8575
 sp = STACKTOP; //@line 8576
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 8532
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8534
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8536
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 8537
 _wait_ms(150); //@line 8538
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8541
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8542
  HEAP32[$4 >> 2] = $2; //@line 8543
  sp = STACKTOP; //@line 8544
  return;
 }
 ___async_unwind = 0; //@line 8547
 HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8548
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8549
 HEAP32[$4 >> 2] = $2; //@line 8550
 sp = STACKTOP; //@line 8551
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 8657
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8659
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8661
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 8662
 _wait_ms(150); //@line 8663
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 8666
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 8667
  HEAP32[$4 >> 2] = $2; //@line 8668
  sp = STACKTOP; //@line 8669
  return;
 }
 ___async_unwind = 0; //@line 8672
 HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 8673
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 8674
 HEAP32[$4 >> 2] = $2; //@line 8675
 sp = STACKTOP; //@line 8676
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 8632
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8634
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8636
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 8637
 _wait_ms(150); //@line 8638
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 8641
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 8642
  HEAP32[$4 >> 2] = $2; //@line 8643
  sp = STACKTOP; //@line 8644
  return;
 }
 ___async_unwind = 0; //@line 8647
 HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 8648
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 8649
 HEAP32[$4 >> 2] = $2; //@line 8650
 sp = STACKTOP; //@line 8651
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 8282
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8284
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8286
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 8287
 _wait_ms(150); //@line 8288
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 8291
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8292
  HEAP32[$4 >> 2] = $2; //@line 8293
  sp = STACKTOP; //@line 8294
  return;
 }
 ___async_unwind = 0; //@line 8297
 HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 8298
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8299
 HEAP32[$4 >> 2] = $2; //@line 8300
 sp = STACKTOP; //@line 8301
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 8507
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8509
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8511
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 8512
 _wait_ms(150); //@line 8513
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8516
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8517
  HEAP32[$4 >> 2] = $2; //@line 8518
  sp = STACKTOP; //@line 8519
  return;
 }
 ___async_unwind = 0; //@line 8522
 HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8523
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8524
 HEAP32[$4 >> 2] = $2; //@line 8525
 sp = STACKTOP; //@line 8526
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8482
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8484
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8486
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 8487
 _wait_ms(400); //@line 8488
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8491
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8492
  HEAP32[$4 >> 2] = $2; //@line 8493
  sp = STACKTOP; //@line 8494
  return;
 }
 ___async_unwind = 0; //@line 8497
 HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8498
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8499
 HEAP32[$4 >> 2] = $2; //@line 8500
 sp = STACKTOP; //@line 8501
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 8457
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8459
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8461
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 8462
 _wait_ms(400); //@line 8463
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8466
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8467
  HEAP32[$4 >> 2] = $2; //@line 8468
  sp = STACKTOP; //@line 8469
  return;
 }
 ___async_unwind = 0; //@line 8472
 HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8473
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8474
 HEAP32[$4 >> 2] = $2; //@line 8475
 sp = STACKTOP; //@line 8476
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 8432
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8434
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8436
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 8437
 _wait_ms(400); //@line 8438
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8441
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8442
  HEAP32[$4 >> 2] = $2; //@line 8443
  sp = STACKTOP; //@line 8444
  return;
 }
 ___async_unwind = 0; //@line 8447
 HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8448
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8449
 HEAP32[$4 >> 2] = $2; //@line 8450
 sp = STACKTOP; //@line 8451
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8407
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8409
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8411
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 8412
 _wait_ms(400); //@line 8413
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8416
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8417
  HEAP32[$4 >> 2] = $2; //@line 8418
  sp = STACKTOP; //@line 8419
  return;
 }
 ___async_unwind = 0; //@line 8422
 HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8423
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8424
 HEAP32[$4 >> 2] = $2; //@line 8425
 sp = STACKTOP; //@line 8426
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8382
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8384
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8386
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 8387
 _wait_ms(400); //@line 8388
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 8391
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8392
  HEAP32[$4 >> 2] = $2; //@line 8393
  sp = STACKTOP; //@line 8394
  return;
 }
 ___async_unwind = 0; //@line 8397
 HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 8398
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8399
 HEAP32[$4 >> 2] = $2; //@line 8400
 sp = STACKTOP; //@line 8401
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8357
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8359
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8361
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 8362
 _wait_ms(400); //@line 8363
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 8366
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8367
  HEAP32[$4 >> 2] = $2; //@line 8368
  sp = STACKTOP; //@line 8369
  return;
 }
 ___async_unwind = 0; //@line 8372
 HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 8373
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8374
 HEAP32[$4 >> 2] = $2; //@line 8375
 sp = STACKTOP; //@line 8376
 return;
}
function _mbed_die__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8332
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8334
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8336
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 8337
 _wait_ms(400); //@line 8338
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8341
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8342
  HEAP32[$4 >> 2] = $2; //@line 8343
  sp = STACKTOP; //@line 8344
  return;
 }
 ___async_unwind = 0; //@line 8347
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8348
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8349
 HEAP32[$4 >> 2] = $2; //@line 8350
 sp = STACKTOP; //@line 8351
 return;
}
function _mbed_die__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8307
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8309
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8311
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8312
 _wait_ms(400); //@line 8313
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 8316
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 8317
  HEAP32[$4 >> 2] = $2; //@line 8318
  sp = STACKTOP; //@line 8319
  return;
 }
 ___async_unwind = 0; //@line 8322
 HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 8323
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 8324
 HEAP32[$4 >> 2] = $2; //@line 8325
 sp = STACKTOP; //@line 8326
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 9749
 newDynamicTop = oldDynamicTop + increment | 0; //@line 9750
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 9754
  ___setErrNo(12); //@line 9755
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 9759
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 9763
   ___setErrNo(12); //@line 9764
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 9768
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 6020
 } else {
  $$056 = $2; //@line 6022
  $15 = $1; //@line 6022
  $8 = $0; //@line 6022
  while (1) {
   $14 = $$056 + -1 | 0; //@line 6030
   HEAP8[$14 >> 0] = HEAPU8[1381 + ($8 & 15) >> 0] | 0 | $3; //@line 6031
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 6032
   $15 = tempRet0; //@line 6033
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 6038
    break;
   } else {
    $$056 = $14; //@line 6041
   }
  }
 }
 return $$05$lcssa | 0; //@line 6045
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 4015
 $3 = HEAP8[$1 >> 0] | 0; //@line 4017
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 4021
 $7 = HEAP32[$0 >> 2] | 0; //@line 4022
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 4027
  HEAP32[$0 + 4 >> 2] = 0; //@line 4029
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 4031
  HEAP32[$0 + 28 >> 2] = $14; //@line 4033
  HEAP32[$0 + 20 >> 2] = $14; //@line 4035
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4041
  $$0 = 0; //@line 4042
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 4045
  $$0 = -1; //@line 4046
 }
 return $$0 | 0; //@line 4048
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 6057
 } else {
  $$06 = $2; //@line 6059
  $11 = $1; //@line 6059
  $7 = $0; //@line 6059
  while (1) {
   $10 = $$06 + -1 | 0; //@line 6064
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 6065
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 6066
   $11 = tempRet0; //@line 6067
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 6072
    break;
   } else {
    $$06 = $10; //@line 6075
   }
  }
 }
 return $$0$lcssa | 0; //@line 6079
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8163
 do {
  if (!$0) {
   $3 = 0; //@line 8167
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8169
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 8170
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 45; //@line 8173
    sp = STACKTOP; //@line 8174
    return 0; //@line 8175
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8177
    $3 = ($2 | 0) != 0 & 1; //@line 8180
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 8185
}
function _invoke_ticker__async_cb_20($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8934
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 8940
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 8941
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8942
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 8943
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 8946
  sp = STACKTOP; //@line 8947
  return;
 }
 ___async_unwind = 0; //@line 8950
 HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 8951
 sp = STACKTOP; //@line 8952
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 5701
 } else {
  $$04 = 0; //@line 5703
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 5706
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 5710
   $12 = $7 + 1 | 0; //@line 5711
   HEAP32[$0 >> 2] = $12; //@line 5712
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 5718
    break;
   } else {
    $$04 = $11; //@line 5721
   }
  }
 }
 return $$0$lcssa | 0; //@line 5725
}
function ___fflush_unlocked__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9111
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9113
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9115
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9117
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 9119
 HEAP32[$4 >> 2] = 0; //@line 9120
 HEAP32[$6 >> 2] = 0; //@line 9121
 HEAP32[$8 >> 2] = 0; //@line 9122
 HEAP32[$10 >> 2] = 0; //@line 9123
 HEAP32[___async_retval >> 2] = 0; //@line 9125
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 9600
 ___async_unwind = 1; //@line 9601
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 9607
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 9611
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 9615
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9617
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3731
 STACKTOP = STACKTOP + 16 | 0; //@line 3732
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3732
 $vararg_buffer = sp; //@line 3733
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 3737
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 3739
 STACKTOP = sp; //@line 3740
 return $5 | 0; //@line 3740
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 9542
 STACKTOP = STACKTOP + 16 | 0; //@line 9543
 $rem = __stackBase__ | 0; //@line 9544
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 9545
 STACKTOP = __stackBase__; //@line 9546
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 9547
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 9312
 if ((ret | 0) < 8) return ret | 0; //@line 9313
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 9314
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 9315
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 9316
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 9317
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 9318
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7548
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8972
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8983
  $$0 = 1; //@line 8984
 } else {
  $$0 = 0; //@line 8986
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 8990
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 496
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 500
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 501
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 504
  sp = STACKTOP; //@line 505
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 508
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7624
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 515
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 516
 _emscripten_sleep($0 | 0); //@line 517
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 520
  sp = STACKTOP; //@line 521
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 524
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 7688
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 7692
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 9576
 HEAP32[new_frame + 4 >> 2] = sp; //@line 9578
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 9580
 ___async_cur_frame = new_frame; //@line 9581
 return ___async_cur_frame + 8 | 0; //@line 9582
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 9265
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 9269
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 9272
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 9565
  return low << bits; //@line 9566
 }
 tempRet0 = low << bits - 32; //@line 9568
 return 0; //@line 9569
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 9554
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 9555
 }
 tempRet0 = 0; //@line 9557
 return high >>> bits - 32 | 0; //@line 9558
}
function _fflush__async_cb_17($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8760
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 8762
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 8765
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
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 4145
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 4151
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 4155
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 9810
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 9588
 stackRestore(___async_cur_frame | 0); //@line 9589
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9590
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 7142
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 7142
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 7144
 return $1 | 0; //@line 7145
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 3897
  $$0 = -1; //@line 3898
 } else {
  $$0 = $0; //@line 3900
 }
 return $$0 | 0; //@line 3902
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 391
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 397
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 398
 return;
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 9305
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 9306
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 9307
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 9297
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 9299
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 9803
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 9796
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 6202
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 6205
 }
 return $$0 | 0; //@line 6207
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 9782
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 9534
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 8207
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 9595
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 9596
}
function _pwmout_init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 413
 _emscripten_asm_const_iiiii(2, $0 | 0, $1 | 0, 20, 0) | 0; //@line 414
 return;
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 4281
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 4283
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7910
 __ZdlPv($0); //@line 7911
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7438
 __ZdlPv($0); //@line 7439
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
  ___fwritex($1, $2, $0) | 0; //@line 5687
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 8964
 return;
}
function b35(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 9901
}
function b34(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 9898
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 7635
}
function _pwmout_write($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, ~~($1 * 1024.0) | 0) | 0; //@line 425
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 9622
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_23($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b32(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 9895
}
function b31(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 9892
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 6150
}
function _fflush__async_cb_18($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8775
 return;
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9284
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 9775
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 9826
 return 0; //@line 9826
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 9823
 return 0; //@line 9823
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(5); //@line 9820
 return 0; //@line 9820
}
function b3(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 9817
 return 0; //@line 9817
}
function _pwmout_read($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(3, HEAP32[$0 >> 2] | 0) | 0) * .0009765625);
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 9789
}
function b29(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 9889
}
function b28(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 9886
}
function __GLOBAL__sub_I_main_cpp() {
 HEAP8[3484] = 0; //@line 531
 _pwmout_init(3480, 9); //@line 532
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 7395
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 3955
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 9814
 return 0; //@line 9814
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(4052); //@line 4288
 return 4060; //@line 4289
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
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 7316
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 7322
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 7425
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function ___ofl_unlock() {
 ___unlock(4052); //@line 4294
 return;
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 3913
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 4008
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(63); //@line 9883
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(62); //@line 9880
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(61); //@line 9877
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(60); //@line 9874
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(59); //@line 9871
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(58); //@line 9868
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(57); //@line 9865
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(56); //@line 9862
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(55); //@line 9859
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(54); //@line 9856
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(53); //@line 9853
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(52); //@line 9850
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(51); //@line 9847
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(50); //@line 9844
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(49); //@line 9841
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(48); //@line 9838
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_vi(47); //@line 9835
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_vi(46); //@line 9832
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 9829
}
function _sleep_manager_lock_deep_sleep_internal() {
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 4048; //@line 3907
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
function _core_util_critical_section_exit() {
 return;
}
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _pthread_self() {
 return 228; //@line 3960
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,___stdio_close];
var FUNCTION_TABLE_iiii = [b3,___stdout_write,___stdio_seek,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b4,b5,b6];
var FUNCTION_TABLE_vi = [b8,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_assert_internal__async_cb,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb_3,_mbed_die__async_cb_2,_mbed_die__async_cb,_invoke_ticker__async_cb_20,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,_main__async_cb,_fflush__async_cb_18
,_fflush__async_cb_17,_fflush__async_cb_19,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_22,_vfprintf__async_cb,_printf__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_21,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_1,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_23,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b9,b10,b11,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21
,b22,b23,b24,b25,b26];
var FUNCTION_TABLE_viiii = [b28,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b29];
var FUNCTION_TABLE_viiiii = [b31,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b32];
var FUNCTION_TABLE_viiiiii = [b34,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b35];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
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






//# sourceMappingURL=pwmout.js.map
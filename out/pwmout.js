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
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1, $2, $3) { MbedJSHal.gpio.init_pwmout($0, $1, $2, $3); },
 function($0) { return MbedJSHal.gpio.read($0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5680;
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



var debug_table_i = ["0"];
var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0"];
var debug_table_v = ["0"];
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_30", "_mbed_vtracef__async_cb_20", "_mbed_vtracef__async_cb_21", "_mbed_vtracef__async_cb_22", "_mbed_vtracef__async_cb_29", "_mbed_vtracef__async_cb_23", "_mbed_vtracef__async_cb_28", "_mbed_vtracef__async_cb_24", "_mbed_vtracef__async_cb_25", "_mbed_vtracef__async_cb_26", "_mbed_vtracef__async_cb_27", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb_5", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_4", "_mbed_error_vfprintf__async_cb_3", "_serial_putc__async_cb_33", "_serial_putc__async_cb", "_invoke_ticker__async_cb_31", "_invoke_ticker__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "_main__async_cb", "_putc__async_cb_32", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_37", "_fflush__async_cb_36", "_fflush__async_cb_38", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_34", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_printf__async_cb", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_1", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_35", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "0"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "0"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "0"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
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
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
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
 sp = STACKTOP; //@line 1614
 STACKTOP = STACKTOP + 16 | 0; //@line 1615
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1615
 $1 = sp; //@line 1616
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1623
   $7 = $6 >>> 3; //@line 1624
   $8 = HEAP32[1015] | 0; //@line 1625
   $9 = $8 >>> $7; //@line 1626
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1632
    $16 = 4100 + ($14 << 1 << 2) | 0; //@line 1634
    $17 = $16 + 8 | 0; //@line 1635
    $18 = HEAP32[$17 >> 2] | 0; //@line 1636
    $19 = $18 + 8 | 0; //@line 1637
    $20 = HEAP32[$19 >> 2] | 0; //@line 1638
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1015] = $8 & ~(1 << $14); //@line 1645
     } else {
      if ((HEAP32[1019] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1650
      }
      $27 = $20 + 12 | 0; //@line 1653
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1657
       HEAP32[$17 >> 2] = $20; //@line 1658
       break;
      } else {
       _abort(); //@line 1661
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1666
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1669
    $34 = $18 + $30 + 4 | 0; //@line 1671
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1674
    $$0 = $19; //@line 1675
    STACKTOP = sp; //@line 1676
    return $$0 | 0; //@line 1676
   }
   $37 = HEAP32[1017] | 0; //@line 1678
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1684
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1687
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1690
     $49 = $47 >>> 12 & 16; //@line 1692
     $50 = $47 >>> $49; //@line 1693
     $52 = $50 >>> 5 & 8; //@line 1695
     $54 = $50 >>> $52; //@line 1697
     $56 = $54 >>> 2 & 4; //@line 1699
     $58 = $54 >>> $56; //@line 1701
     $60 = $58 >>> 1 & 2; //@line 1703
     $62 = $58 >>> $60; //@line 1705
     $64 = $62 >>> 1 & 1; //@line 1707
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1710
     $69 = 4100 + ($67 << 1 << 2) | 0; //@line 1712
     $70 = $69 + 8 | 0; //@line 1713
     $71 = HEAP32[$70 >> 2] | 0; //@line 1714
     $72 = $71 + 8 | 0; //@line 1715
     $73 = HEAP32[$72 >> 2] | 0; //@line 1716
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1722
       HEAP32[1015] = $77; //@line 1723
       $98 = $77; //@line 1724
      } else {
       if ((HEAP32[1019] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1729
       }
       $80 = $73 + 12 | 0; //@line 1732
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1736
        HEAP32[$70 >> 2] = $73; //@line 1737
        $98 = $8; //@line 1738
        break;
       } else {
        _abort(); //@line 1741
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1746
     $84 = $83 - $6 | 0; //@line 1747
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1750
     $87 = $71 + $6 | 0; //@line 1751
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1754
     HEAP32[$71 + $83 >> 2] = $84; //@line 1756
     if ($37 | 0) {
      $92 = HEAP32[1020] | 0; //@line 1759
      $93 = $37 >>> 3; //@line 1760
      $95 = 4100 + ($93 << 1 << 2) | 0; //@line 1762
      $96 = 1 << $93; //@line 1763
      if (!($98 & $96)) {
       HEAP32[1015] = $98 | $96; //@line 1768
       $$0199 = $95; //@line 1770
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1770
      } else {
       $101 = $95 + 8 | 0; //@line 1772
       $102 = HEAP32[$101 >> 2] | 0; //@line 1773
       if ((HEAP32[1019] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1777
       } else {
        $$0199 = $102; //@line 1780
        $$pre$phiZ2D = $101; //@line 1780
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1783
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1785
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1787
      HEAP32[$92 + 12 >> 2] = $95; //@line 1789
     }
     HEAP32[1017] = $84; //@line 1791
     HEAP32[1020] = $87; //@line 1792
     $$0 = $72; //@line 1793
     STACKTOP = sp; //@line 1794
     return $$0 | 0; //@line 1794
    }
    $108 = HEAP32[1016] | 0; //@line 1796
    if (!$108) {
     $$0197 = $6; //@line 1799
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1803
     $114 = $112 >>> 12 & 16; //@line 1805
     $115 = $112 >>> $114; //@line 1806
     $117 = $115 >>> 5 & 8; //@line 1808
     $119 = $115 >>> $117; //@line 1810
     $121 = $119 >>> 2 & 4; //@line 1812
     $123 = $119 >>> $121; //@line 1814
     $125 = $123 >>> 1 & 2; //@line 1816
     $127 = $123 >>> $125; //@line 1818
     $129 = $127 >>> 1 & 1; //@line 1820
     $134 = HEAP32[4364 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1825
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1829
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1835
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1838
      $$0193$lcssa$i = $138; //@line 1838
     } else {
      $$01926$i = $134; //@line 1840
      $$01935$i = $138; //@line 1840
      $146 = $143; //@line 1840
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1845
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1846
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1847
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1848
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1854
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1857
        $$0193$lcssa$i = $$$0193$i; //@line 1857
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1860
        $$01935$i = $$$0193$i; //@line 1860
       }
      }
     }
     $157 = HEAP32[1019] | 0; //@line 1864
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1867
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1870
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1873
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1877
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1879
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1883
       $176 = HEAP32[$175 >> 2] | 0; //@line 1884
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1887
        $179 = HEAP32[$178 >> 2] | 0; //@line 1888
        if (!$179) {
         $$3$i = 0; //@line 1891
         break;
        } else {
         $$1196$i = $179; //@line 1894
         $$1198$i = $178; //@line 1894
        }
       } else {
        $$1196$i = $176; //@line 1897
        $$1198$i = $175; //@line 1897
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1900
        $182 = HEAP32[$181 >> 2] | 0; //@line 1901
        if ($182 | 0) {
         $$1196$i = $182; //@line 1904
         $$1198$i = $181; //@line 1904
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1907
        $185 = HEAP32[$184 >> 2] | 0; //@line 1908
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1913
         $$1198$i = $184; //@line 1913
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1918
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1921
        $$3$i = $$1196$i; //@line 1922
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1927
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1930
       }
       $169 = $167 + 12 | 0; //@line 1933
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1937
       }
       $172 = $164 + 8 | 0; //@line 1940
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1944
        HEAP32[$172 >> 2] = $167; //@line 1945
        $$3$i = $164; //@line 1946
        break;
       } else {
        _abort(); //@line 1949
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1958
       $191 = 4364 + ($190 << 2) | 0; //@line 1959
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1964
         if (!$$3$i) {
          HEAP32[1016] = $108 & ~(1 << $190); //@line 1970
          break L73;
         }
        } else {
         if ((HEAP32[1019] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1977
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1985
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1019] | 0; //@line 1995
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1998
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 2002
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 2004
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 2010
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2014
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2016
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2022
       if ($214 | 0) {
        if ((HEAP32[1019] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2028
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2032
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2034
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2042
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2045
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2047
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2050
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2054
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2057
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2059
      if ($37 | 0) {
       $234 = HEAP32[1020] | 0; //@line 2062
       $235 = $37 >>> 3; //@line 2063
       $237 = 4100 + ($235 << 1 << 2) | 0; //@line 2065
       $238 = 1 << $235; //@line 2066
       if (!($8 & $238)) {
        HEAP32[1015] = $8 | $238; //@line 2071
        $$0189$i = $237; //@line 2073
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2073
       } else {
        $242 = $237 + 8 | 0; //@line 2075
        $243 = HEAP32[$242 >> 2] | 0; //@line 2076
        if ((HEAP32[1019] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2080
        } else {
         $$0189$i = $243; //@line 2083
         $$pre$phi$iZ2D = $242; //@line 2083
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2086
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2088
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2090
       HEAP32[$234 + 12 >> 2] = $237; //@line 2092
      }
      HEAP32[1017] = $$0193$lcssa$i; //@line 2094
      HEAP32[1020] = $159; //@line 2095
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2098
     STACKTOP = sp; //@line 2099
     return $$0 | 0; //@line 2099
    }
   } else {
    $$0197 = $6; //@line 2102
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2107
   } else {
    $251 = $0 + 11 | 0; //@line 2109
    $252 = $251 & -8; //@line 2110
    $253 = HEAP32[1016] | 0; //@line 2111
    if (!$253) {
     $$0197 = $252; //@line 2114
    } else {
     $255 = 0 - $252 | 0; //@line 2116
     $256 = $251 >>> 8; //@line 2117
     if (!$256) {
      $$0358$i = 0; //@line 2120
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2124
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2128
       $262 = $256 << $261; //@line 2129
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2132
       $267 = $262 << $265; //@line 2134
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2137
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2142
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2148
      }
     }
     $282 = HEAP32[4364 + ($$0358$i << 2) >> 2] | 0; //@line 2152
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2156
       $$3$i203 = 0; //@line 2156
       $$3350$i = $255; //@line 2156
       label = 81; //@line 2157
      } else {
       $$0342$i = 0; //@line 2164
       $$0347$i = $255; //@line 2164
       $$0353$i = $282; //@line 2164
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2164
       $$0362$i = 0; //@line 2164
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2169
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2174
          $$435113$i = 0; //@line 2174
          $$435712$i = $$0353$i; //@line 2174
          label = 85; //@line 2175
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2178
          $$1348$i = $292; //@line 2178
         }
        } else {
         $$1343$i = $$0342$i; //@line 2181
         $$1348$i = $$0347$i; //@line 2181
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2184
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2187
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2191
        $302 = ($$0353$i | 0) == 0; //@line 2192
        if ($302) {
         $$2355$i = $$1363$i; //@line 2197
         $$3$i203 = $$1343$i; //@line 2197
         $$3350$i = $$1348$i; //@line 2197
         label = 81; //@line 2198
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2201
         $$0347$i = $$1348$i; //@line 2201
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2201
         $$0362$i = $$1363$i; //@line 2201
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2211
       $309 = $253 & ($306 | 0 - $306); //@line 2214
       if (!$309) {
        $$0197 = $252; //@line 2217
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2222
       $315 = $313 >>> 12 & 16; //@line 2224
       $316 = $313 >>> $315; //@line 2225
       $318 = $316 >>> 5 & 8; //@line 2227
       $320 = $316 >>> $318; //@line 2229
       $322 = $320 >>> 2 & 4; //@line 2231
       $324 = $320 >>> $322; //@line 2233
       $326 = $324 >>> 1 & 2; //@line 2235
       $328 = $324 >>> $326; //@line 2237
       $330 = $328 >>> 1 & 1; //@line 2239
       $$4$ph$i = 0; //@line 2245
       $$4357$ph$i = HEAP32[4364 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2245
      } else {
       $$4$ph$i = $$3$i203; //@line 2247
       $$4357$ph$i = $$2355$i; //@line 2247
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2251
       $$4351$lcssa$i = $$3350$i; //@line 2251
      } else {
       $$414$i = $$4$ph$i; //@line 2253
       $$435113$i = $$3350$i; //@line 2253
       $$435712$i = $$4357$ph$i; //@line 2253
       label = 85; //@line 2254
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2259
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2263
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2264
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2265
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2266
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2272
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2275
        $$4351$lcssa$i = $$$4351$i; //@line 2275
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2278
        $$435113$i = $$$4351$i; //@line 2278
        label = 85; //@line 2279
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2285
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1017] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1019] | 0; //@line 2291
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2294
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2297
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2300
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2304
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2306
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2310
         $371 = HEAP32[$370 >> 2] | 0; //@line 2311
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2314
          $374 = HEAP32[$373 >> 2] | 0; //@line 2315
          if (!$374) {
           $$3372$i = 0; //@line 2318
           break;
          } else {
           $$1370$i = $374; //@line 2321
           $$1374$i = $373; //@line 2321
          }
         } else {
          $$1370$i = $371; //@line 2324
          $$1374$i = $370; //@line 2324
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2327
          $377 = HEAP32[$376 >> 2] | 0; //@line 2328
          if ($377 | 0) {
           $$1370$i = $377; //@line 2331
           $$1374$i = $376; //@line 2331
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2334
          $380 = HEAP32[$379 >> 2] | 0; //@line 2335
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2340
           $$1374$i = $379; //@line 2340
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2345
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2348
          $$3372$i = $$1370$i; //@line 2349
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2354
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2357
         }
         $364 = $362 + 12 | 0; //@line 2360
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2364
         }
         $367 = $359 + 8 | 0; //@line 2367
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2371
          HEAP32[$367 >> 2] = $362; //@line 2372
          $$3372$i = $359; //@line 2373
          break;
         } else {
          _abort(); //@line 2376
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2384
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2387
         $386 = 4364 + ($385 << 2) | 0; //@line 2388
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2393
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2398
            HEAP32[1016] = $391; //@line 2399
            $475 = $391; //@line 2400
            break L164;
           }
          } else {
           if ((HEAP32[1019] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2407
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2415
            if (!$$3372$i) {
             $475 = $253; //@line 2418
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1019] | 0; //@line 2426
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2429
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2433
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2435
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2441
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2445
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2447
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2453
         if (!$409) {
          $475 = $253; //@line 2456
         } else {
          if ((HEAP32[1019] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2461
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2465
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2467
           $475 = $253; //@line 2468
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2477
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2480
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2482
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2485
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2489
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2492
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2494
         $428 = $$4351$lcssa$i >>> 3; //@line 2495
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4100 + ($428 << 1 << 2) | 0; //@line 2499
          $432 = HEAP32[1015] | 0; //@line 2500
          $433 = 1 << $428; //@line 2501
          if (!($432 & $433)) {
           HEAP32[1015] = $432 | $433; //@line 2506
           $$0368$i = $431; //@line 2508
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2508
          } else {
           $437 = $431 + 8 | 0; //@line 2510
           $438 = HEAP32[$437 >> 2] | 0; //@line 2511
           if ((HEAP32[1019] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2515
           } else {
            $$0368$i = $438; //@line 2518
            $$pre$phi$i211Z2D = $437; //@line 2518
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2521
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2523
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2525
          HEAP32[$354 + 12 >> 2] = $431; //@line 2527
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2530
         if (!$444) {
          $$0361$i = 0; //@line 2533
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2537
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2541
           $450 = $444 << $449; //@line 2542
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2545
           $455 = $450 << $453; //@line 2547
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2550
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2555
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2561
          }
         }
         $469 = 4364 + ($$0361$i << 2) | 0; //@line 2564
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2566
         $471 = $354 + 16 | 0; //@line 2567
         HEAP32[$471 + 4 >> 2] = 0; //@line 2569
         HEAP32[$471 >> 2] = 0; //@line 2570
         $473 = 1 << $$0361$i; //@line 2571
         if (!($475 & $473)) {
          HEAP32[1016] = $475 | $473; //@line 2576
          HEAP32[$469 >> 2] = $354; //@line 2577
          HEAP32[$354 + 24 >> 2] = $469; //@line 2579
          HEAP32[$354 + 12 >> 2] = $354; //@line 2581
          HEAP32[$354 + 8 >> 2] = $354; //@line 2583
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2592
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2592
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2599
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2603
          $494 = HEAP32[$492 >> 2] | 0; //@line 2605
          if (!$494) {
           label = 136; //@line 2608
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2611
           $$0345$i = $494; //@line 2611
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1019] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2618
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2621
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2623
           HEAP32[$354 + 12 >> 2] = $354; //@line 2625
           HEAP32[$354 + 8 >> 2] = $354; //@line 2627
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2632
          $502 = HEAP32[$501 >> 2] | 0; //@line 2633
          $503 = HEAP32[1019] | 0; //@line 2634
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2640
           HEAP32[$501 >> 2] = $354; //@line 2641
           HEAP32[$354 + 8 >> 2] = $502; //@line 2643
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2645
           HEAP32[$354 + 24 >> 2] = 0; //@line 2647
           break;
          } else {
           _abort(); //@line 2650
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2657
       STACKTOP = sp; //@line 2658
       return $$0 | 0; //@line 2658
      } else {
       $$0197 = $252; //@line 2660
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1017] | 0; //@line 2667
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2670
  $515 = HEAP32[1020] | 0; //@line 2671
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2674
   HEAP32[1020] = $517; //@line 2675
   HEAP32[1017] = $514; //@line 2676
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2679
   HEAP32[$515 + $512 >> 2] = $514; //@line 2681
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2684
  } else {
   HEAP32[1017] = 0; //@line 2686
   HEAP32[1020] = 0; //@line 2687
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2690
   $526 = $515 + $512 + 4 | 0; //@line 2692
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2695
  }
  $$0 = $515 + 8 | 0; //@line 2698
  STACKTOP = sp; //@line 2699
  return $$0 | 0; //@line 2699
 }
 $530 = HEAP32[1018] | 0; //@line 2701
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2704
  HEAP32[1018] = $532; //@line 2705
  $533 = HEAP32[1021] | 0; //@line 2706
  $534 = $533 + $$0197 | 0; //@line 2707
  HEAP32[1021] = $534; //@line 2708
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2711
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2714
  $$0 = $533 + 8 | 0; //@line 2716
  STACKTOP = sp; //@line 2717
  return $$0 | 0; //@line 2717
 }
 if (!(HEAP32[1133] | 0)) {
  HEAP32[1135] = 4096; //@line 2722
  HEAP32[1134] = 4096; //@line 2723
  HEAP32[1136] = -1; //@line 2724
  HEAP32[1137] = -1; //@line 2725
  HEAP32[1138] = 0; //@line 2726
  HEAP32[1126] = 0; //@line 2727
  HEAP32[1133] = $1 & -16 ^ 1431655768; //@line 2731
  $548 = 4096; //@line 2732
 } else {
  $548 = HEAP32[1135] | 0; //@line 2735
 }
 $545 = $$0197 + 48 | 0; //@line 2737
 $546 = $$0197 + 47 | 0; //@line 2738
 $547 = $548 + $546 | 0; //@line 2739
 $549 = 0 - $548 | 0; //@line 2740
 $550 = $547 & $549; //@line 2741
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2744
  STACKTOP = sp; //@line 2745
  return $$0 | 0; //@line 2745
 }
 $552 = HEAP32[1125] | 0; //@line 2747
 if ($552 | 0) {
  $554 = HEAP32[1123] | 0; //@line 2750
  $555 = $554 + $550 | 0; //@line 2751
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2756
   STACKTOP = sp; //@line 2757
   return $$0 | 0; //@line 2757
  }
 }
 L244 : do {
  if (!(HEAP32[1126] & 4)) {
   $561 = HEAP32[1021] | 0; //@line 2765
   L246 : do {
    if (!$561) {
     label = 163; //@line 2769
    } else {
     $$0$i$i = 4508; //@line 2771
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2773
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2776
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2785
      if (!$570) {
       label = 163; //@line 2788
       break L246;
      } else {
       $$0$i$i = $570; //@line 2791
      }
     }
     $595 = $547 - $530 & $549; //@line 2795
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2798
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2806
       } else {
        $$723947$i = $595; //@line 2808
        $$748$i = $597; //@line 2808
        label = 180; //@line 2809
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2813
       $$2253$ph$i = $595; //@line 2813
       label = 171; //@line 2814
      }
     } else {
      $$2234243136$i = 0; //@line 2817
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2823
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2826
     } else {
      $574 = $572; //@line 2828
      $575 = HEAP32[1134] | 0; //@line 2829
      $576 = $575 + -1 | 0; //@line 2830
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2838
      $584 = HEAP32[1123] | 0; //@line 2839
      $585 = $$$i + $584 | 0; //@line 2840
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1125] | 0; //@line 2845
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2852
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2856
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2859
        $$748$i = $572; //@line 2859
        label = 180; //@line 2860
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2863
        $$2253$ph$i = $$$i; //@line 2863
        label = 171; //@line 2864
       }
      } else {
       $$2234243136$i = 0; //@line 2867
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2874
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2883
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2886
       $$748$i = $$2247$ph$i; //@line 2886
       label = 180; //@line 2887
       break L244;
      }
     }
     $607 = HEAP32[1135] | 0; //@line 2891
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2895
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2898
      $$748$i = $$2247$ph$i; //@line 2898
      label = 180; //@line 2899
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2905
      $$2234243136$i = 0; //@line 2906
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2910
      $$748$i = $$2247$ph$i; //@line 2910
      label = 180; //@line 2911
      break L244;
     }
    }
   } while (0);
   HEAP32[1126] = HEAP32[1126] | 4; //@line 2918
   $$4236$i = $$2234243136$i; //@line 2919
   label = 178; //@line 2920
  } else {
   $$4236$i = 0; //@line 2922
   label = 178; //@line 2923
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2929
   $621 = _sbrk(0) | 0; //@line 2930
   $627 = $621 - $620 | 0; //@line 2938
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2940
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2948
    $$748$i = $620; //@line 2948
    label = 180; //@line 2949
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1123] | 0) + $$723947$i | 0; //@line 2955
  HEAP32[1123] = $633; //@line 2956
  if ($633 >>> 0 > (HEAP32[1124] | 0) >>> 0) {
   HEAP32[1124] = $633; //@line 2960
  }
  $636 = HEAP32[1021] | 0; //@line 2962
  do {
   if (!$636) {
    $638 = HEAP32[1019] | 0; //@line 2966
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1019] = $$748$i; //@line 2971
    }
    HEAP32[1127] = $$748$i; //@line 2973
    HEAP32[1128] = $$723947$i; //@line 2974
    HEAP32[1130] = 0; //@line 2975
    HEAP32[1024] = HEAP32[1133]; //@line 2977
    HEAP32[1023] = -1; //@line 2978
    HEAP32[1028] = 4100; //@line 2979
    HEAP32[1027] = 4100; //@line 2980
    HEAP32[1030] = 4108; //@line 2981
    HEAP32[1029] = 4108; //@line 2982
    HEAP32[1032] = 4116; //@line 2983
    HEAP32[1031] = 4116; //@line 2984
    HEAP32[1034] = 4124; //@line 2985
    HEAP32[1033] = 4124; //@line 2986
    HEAP32[1036] = 4132; //@line 2987
    HEAP32[1035] = 4132; //@line 2988
    HEAP32[1038] = 4140; //@line 2989
    HEAP32[1037] = 4140; //@line 2990
    HEAP32[1040] = 4148; //@line 2991
    HEAP32[1039] = 4148; //@line 2992
    HEAP32[1042] = 4156; //@line 2993
    HEAP32[1041] = 4156; //@line 2994
    HEAP32[1044] = 4164; //@line 2995
    HEAP32[1043] = 4164; //@line 2996
    HEAP32[1046] = 4172; //@line 2997
    HEAP32[1045] = 4172; //@line 2998
    HEAP32[1048] = 4180; //@line 2999
    HEAP32[1047] = 4180; //@line 3000
    HEAP32[1050] = 4188; //@line 3001
    HEAP32[1049] = 4188; //@line 3002
    HEAP32[1052] = 4196; //@line 3003
    HEAP32[1051] = 4196; //@line 3004
    HEAP32[1054] = 4204; //@line 3005
    HEAP32[1053] = 4204; //@line 3006
    HEAP32[1056] = 4212; //@line 3007
    HEAP32[1055] = 4212; //@line 3008
    HEAP32[1058] = 4220; //@line 3009
    HEAP32[1057] = 4220; //@line 3010
    HEAP32[1060] = 4228; //@line 3011
    HEAP32[1059] = 4228; //@line 3012
    HEAP32[1062] = 4236; //@line 3013
    HEAP32[1061] = 4236; //@line 3014
    HEAP32[1064] = 4244; //@line 3015
    HEAP32[1063] = 4244; //@line 3016
    HEAP32[1066] = 4252; //@line 3017
    HEAP32[1065] = 4252; //@line 3018
    HEAP32[1068] = 4260; //@line 3019
    HEAP32[1067] = 4260; //@line 3020
    HEAP32[1070] = 4268; //@line 3021
    HEAP32[1069] = 4268; //@line 3022
    HEAP32[1072] = 4276; //@line 3023
    HEAP32[1071] = 4276; //@line 3024
    HEAP32[1074] = 4284; //@line 3025
    HEAP32[1073] = 4284; //@line 3026
    HEAP32[1076] = 4292; //@line 3027
    HEAP32[1075] = 4292; //@line 3028
    HEAP32[1078] = 4300; //@line 3029
    HEAP32[1077] = 4300; //@line 3030
    HEAP32[1080] = 4308; //@line 3031
    HEAP32[1079] = 4308; //@line 3032
    HEAP32[1082] = 4316; //@line 3033
    HEAP32[1081] = 4316; //@line 3034
    HEAP32[1084] = 4324; //@line 3035
    HEAP32[1083] = 4324; //@line 3036
    HEAP32[1086] = 4332; //@line 3037
    HEAP32[1085] = 4332; //@line 3038
    HEAP32[1088] = 4340; //@line 3039
    HEAP32[1087] = 4340; //@line 3040
    HEAP32[1090] = 4348; //@line 3041
    HEAP32[1089] = 4348; //@line 3042
    $642 = $$723947$i + -40 | 0; //@line 3043
    $644 = $$748$i + 8 | 0; //@line 3045
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3050
    $650 = $$748$i + $649 | 0; //@line 3051
    $651 = $642 - $649 | 0; //@line 3052
    HEAP32[1021] = $650; //@line 3053
    HEAP32[1018] = $651; //@line 3054
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3057
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3060
    HEAP32[1022] = HEAP32[1137]; //@line 3062
   } else {
    $$024367$i = 4508; //@line 3064
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3066
     $658 = $$024367$i + 4 | 0; //@line 3067
     $659 = HEAP32[$658 >> 2] | 0; //@line 3068
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3072
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3076
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3081
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3095
       $673 = (HEAP32[1018] | 0) + $$723947$i | 0; //@line 3097
       $675 = $636 + 8 | 0; //@line 3099
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3104
       $681 = $636 + $680 | 0; //@line 3105
       $682 = $673 - $680 | 0; //@line 3106
       HEAP32[1021] = $681; //@line 3107
       HEAP32[1018] = $682; //@line 3108
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3111
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3114
       HEAP32[1022] = HEAP32[1137]; //@line 3116
       break;
      }
     }
    }
    $688 = HEAP32[1019] | 0; //@line 3121
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1019] = $$748$i; //@line 3124
     $753 = $$748$i; //@line 3125
    } else {
     $753 = $688; //@line 3127
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3129
    $$124466$i = 4508; //@line 3130
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3135
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3139
     if (!$694) {
      $$0$i$i$i = 4508; //@line 3142
      break;
     } else {
      $$124466$i = $694; //@line 3145
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3154
      $700 = $$124466$i + 4 | 0; //@line 3155
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3158
      $704 = $$748$i + 8 | 0; //@line 3160
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3166
      $712 = $690 + 8 | 0; //@line 3168
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3174
      $722 = $710 + $$0197 | 0; //@line 3178
      $723 = $718 - $710 - $$0197 | 0; //@line 3179
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3182
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1018] | 0) + $723 | 0; //@line 3187
        HEAP32[1018] = $728; //@line 3188
        HEAP32[1021] = $722; //@line 3189
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3192
       } else {
        if ((HEAP32[1020] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1017] | 0) + $723 | 0; //@line 3198
         HEAP32[1017] = $734; //@line 3199
         HEAP32[1020] = $722; //@line 3200
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3203
         HEAP32[$722 + $734 >> 2] = $734; //@line 3205
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3209
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3213
         $743 = $739 >>> 3; //@line 3214
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3219
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3221
           $750 = 4100 + ($743 << 1 << 2) | 0; //@line 3223
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3229
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3238
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1015] = HEAP32[1015] & ~(1 << $743); //@line 3248
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3255
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3259
             }
             $764 = $748 + 8 | 0; //@line 3262
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3266
              break;
             }
             _abort(); //@line 3269
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3274
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3275
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3278
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3280
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3284
             $783 = $782 + 4 | 0; //@line 3285
             $784 = HEAP32[$783 >> 2] | 0; //@line 3286
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3289
              if (!$786) {
               $$3$i$i = 0; //@line 3292
               break;
              } else {
               $$1291$i$i = $786; //@line 3295
               $$1293$i$i = $782; //@line 3295
              }
             } else {
              $$1291$i$i = $784; //@line 3298
              $$1293$i$i = $783; //@line 3298
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3301
              $789 = HEAP32[$788 >> 2] | 0; //@line 3302
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3305
               $$1293$i$i = $788; //@line 3305
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3308
              $792 = HEAP32[$791 >> 2] | 0; //@line 3309
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3314
               $$1293$i$i = $791; //@line 3314
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3319
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3322
              $$3$i$i = $$1291$i$i; //@line 3323
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3328
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3331
             }
             $776 = $774 + 12 | 0; //@line 3334
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3338
             }
             $779 = $771 + 8 | 0; //@line 3341
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3345
              HEAP32[$779 >> 2] = $774; //@line 3346
              $$3$i$i = $771; //@line 3347
              break;
             } else {
              _abort(); //@line 3350
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3360
           $798 = 4364 + ($797 << 2) | 0; //@line 3361
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3366
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1016] = HEAP32[1016] & ~(1 << $797); //@line 3375
             break L311;
            } else {
             if ((HEAP32[1019] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3381
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3389
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1019] | 0; //@line 3399
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3402
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3406
           $815 = $718 + 16 | 0; //@line 3407
           $816 = HEAP32[$815 >> 2] | 0; //@line 3408
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3414
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3418
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3420
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3426
           if (!$822) {
            break;
           }
           if ((HEAP32[1019] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3434
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3438
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3440
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3447
         $$0287$i$i = $742 + $723 | 0; //@line 3447
        } else {
         $$0$i17$i = $718; //@line 3449
         $$0287$i$i = $723; //@line 3449
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3451
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3454
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3457
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3459
        $836 = $$0287$i$i >>> 3; //@line 3460
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4100 + ($836 << 1 << 2) | 0; //@line 3464
         $840 = HEAP32[1015] | 0; //@line 3465
         $841 = 1 << $836; //@line 3466
         do {
          if (!($840 & $841)) {
           HEAP32[1015] = $840 | $841; //@line 3472
           $$0295$i$i = $839; //@line 3474
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3474
          } else {
           $845 = $839 + 8 | 0; //@line 3476
           $846 = HEAP32[$845 >> 2] | 0; //@line 3477
           if ((HEAP32[1019] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3481
            $$pre$phi$i19$iZ2D = $845; //@line 3481
            break;
           }
           _abort(); //@line 3484
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3488
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3490
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3492
         HEAP32[$722 + 12 >> 2] = $839; //@line 3494
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3497
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3501
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3505
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3510
          $858 = $852 << $857; //@line 3511
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3514
          $863 = $858 << $861; //@line 3516
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3519
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3524
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3530
         }
        } while (0);
        $877 = 4364 + ($$0296$i$i << 2) | 0; //@line 3533
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3535
        $879 = $722 + 16 | 0; //@line 3536
        HEAP32[$879 + 4 >> 2] = 0; //@line 3538
        HEAP32[$879 >> 2] = 0; //@line 3539
        $881 = HEAP32[1016] | 0; //@line 3540
        $882 = 1 << $$0296$i$i; //@line 3541
        if (!($881 & $882)) {
         HEAP32[1016] = $881 | $882; //@line 3546
         HEAP32[$877 >> 2] = $722; //@line 3547
         HEAP32[$722 + 24 >> 2] = $877; //@line 3549
         HEAP32[$722 + 12 >> 2] = $722; //@line 3551
         HEAP32[$722 + 8 >> 2] = $722; //@line 3553
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3562
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3562
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3569
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3573
         $902 = HEAP32[$900 >> 2] | 0; //@line 3575
         if (!$902) {
          label = 260; //@line 3578
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3581
          $$0289$i$i = $902; //@line 3581
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1019] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3588
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3591
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3593
          HEAP32[$722 + 12 >> 2] = $722; //@line 3595
          HEAP32[$722 + 8 >> 2] = $722; //@line 3597
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3602
         $910 = HEAP32[$909 >> 2] | 0; //@line 3603
         $911 = HEAP32[1019] | 0; //@line 3604
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3610
          HEAP32[$909 >> 2] = $722; //@line 3611
          HEAP32[$722 + 8 >> 2] = $910; //@line 3613
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3615
          HEAP32[$722 + 24 >> 2] = 0; //@line 3617
          break;
         } else {
          _abort(); //@line 3620
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3627
      STACKTOP = sp; //@line 3628
      return $$0 | 0; //@line 3628
     } else {
      $$0$i$i$i = 4508; //@line 3630
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3634
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3639
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3647
    }
    $927 = $923 + -47 | 0; //@line 3649
    $929 = $927 + 8 | 0; //@line 3651
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3657
    $936 = $636 + 16 | 0; //@line 3658
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3660
    $939 = $938 + 8 | 0; //@line 3661
    $940 = $938 + 24 | 0; //@line 3662
    $941 = $$723947$i + -40 | 0; //@line 3663
    $943 = $$748$i + 8 | 0; //@line 3665
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3670
    $949 = $$748$i + $948 | 0; //@line 3671
    $950 = $941 - $948 | 0; //@line 3672
    HEAP32[1021] = $949; //@line 3673
    HEAP32[1018] = $950; //@line 3674
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3677
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3680
    HEAP32[1022] = HEAP32[1137]; //@line 3682
    $956 = $938 + 4 | 0; //@line 3683
    HEAP32[$956 >> 2] = 27; //@line 3684
    HEAP32[$939 >> 2] = HEAP32[1127]; //@line 3685
    HEAP32[$939 + 4 >> 2] = HEAP32[1128]; //@line 3685
    HEAP32[$939 + 8 >> 2] = HEAP32[1129]; //@line 3685
    HEAP32[$939 + 12 >> 2] = HEAP32[1130]; //@line 3685
    HEAP32[1127] = $$748$i; //@line 3686
    HEAP32[1128] = $$723947$i; //@line 3687
    HEAP32[1130] = 0; //@line 3688
    HEAP32[1129] = $939; //@line 3689
    $958 = $940; //@line 3690
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3692
     HEAP32[$958 >> 2] = 7; //@line 3693
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3706
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3709
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3712
     HEAP32[$938 >> 2] = $964; //@line 3713
     $969 = $964 >>> 3; //@line 3714
     if ($964 >>> 0 < 256) {
      $972 = 4100 + ($969 << 1 << 2) | 0; //@line 3718
      $973 = HEAP32[1015] | 0; //@line 3719
      $974 = 1 << $969; //@line 3720
      if (!($973 & $974)) {
       HEAP32[1015] = $973 | $974; //@line 3725
       $$0211$i$i = $972; //@line 3727
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3727
      } else {
       $978 = $972 + 8 | 0; //@line 3729
       $979 = HEAP32[$978 >> 2] | 0; //@line 3730
       if ((HEAP32[1019] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3734
       } else {
        $$0211$i$i = $979; //@line 3737
        $$pre$phi$i$iZ2D = $978; //@line 3737
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3740
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3742
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3744
      HEAP32[$636 + 12 >> 2] = $972; //@line 3746
      break;
     }
     $985 = $964 >>> 8; //@line 3749
     if (!$985) {
      $$0212$i$i = 0; //@line 3752
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3756
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3760
       $991 = $985 << $990; //@line 3761
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3764
       $996 = $991 << $994; //@line 3766
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3769
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3774
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3780
      }
     }
     $1010 = 4364 + ($$0212$i$i << 2) | 0; //@line 3783
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3785
     HEAP32[$636 + 20 >> 2] = 0; //@line 3787
     HEAP32[$936 >> 2] = 0; //@line 3788
     $1013 = HEAP32[1016] | 0; //@line 3789
     $1014 = 1 << $$0212$i$i; //@line 3790
     if (!($1013 & $1014)) {
      HEAP32[1016] = $1013 | $1014; //@line 3795
      HEAP32[$1010 >> 2] = $636; //@line 3796
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3798
      HEAP32[$636 + 12 >> 2] = $636; //@line 3800
      HEAP32[$636 + 8 >> 2] = $636; //@line 3802
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3811
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3811
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3818
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3822
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3824
      if (!$1034) {
       label = 286; //@line 3827
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3830
       $$0207$i$i = $1034; //@line 3830
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1019] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3837
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3840
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3842
       HEAP32[$636 + 12 >> 2] = $636; //@line 3844
       HEAP32[$636 + 8 >> 2] = $636; //@line 3846
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3851
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3852
      $1043 = HEAP32[1019] | 0; //@line 3853
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3859
       HEAP32[$1041 >> 2] = $636; //@line 3860
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3862
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3864
       HEAP32[$636 + 24 >> 2] = 0; //@line 3866
       break;
      } else {
       _abort(); //@line 3869
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1018] | 0; //@line 3876
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3879
   HEAP32[1018] = $1054; //@line 3880
   $1055 = HEAP32[1021] | 0; //@line 3881
   $1056 = $1055 + $$0197 | 0; //@line 3882
   HEAP32[1021] = $1056; //@line 3883
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3886
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3889
   $$0 = $1055 + 8 | 0; //@line 3891
   STACKTOP = sp; //@line 3892
   return $$0 | 0; //@line 3892
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3896
 $$0 = 0; //@line 3897
 STACKTOP = sp; //@line 3898
 return $$0 | 0; //@line 3898
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7620
 STACKTOP = STACKTOP + 560 | 0; //@line 7621
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 7621
 $6 = sp + 8 | 0; //@line 7622
 $7 = sp; //@line 7623
 $8 = sp + 524 | 0; //@line 7624
 $9 = $8; //@line 7625
 $10 = sp + 512 | 0; //@line 7626
 HEAP32[$7 >> 2] = 0; //@line 7627
 $11 = $10 + 12 | 0; //@line 7628
 ___DOUBLE_BITS_677($1) | 0; //@line 7629
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 7634
  $$0520 = 1; //@line 7634
  $$0521 = 1902; //@line 7634
 } else {
  $$0471 = $1; //@line 7645
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 7645
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1903 : 1908 : 1905; //@line 7645
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 7647
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 7656
   $31 = $$0520 + 3 | 0; //@line 7661
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 7663
   _out_670($0, $$0521, $$0520); //@line 7664
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1929 : 1933 : $27 ? 1921 : 1925, 3); //@line 7665
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 7667
   $$sink560 = $31; //@line 7668
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 7671
   $36 = $35 != 0.0; //@line 7672
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 7676
   }
   $39 = $5 | 32; //@line 7678
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 7681
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 7684
    $44 = $$0520 | 2; //@line 7685
    $46 = 12 - $3 | 0; //@line 7687
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 7692
     } else {
      $$0509585 = 8.0; //@line 7694
      $$1508586 = $46; //@line 7694
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 7696
       $$0509585 = $$0509585 * 16.0; //@line 7697
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 7712
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 7717
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 7722
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 7725
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7728
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 7731
     HEAP8[$68 >> 0] = 48; //@line 7732
     $$0511 = $68; //@line 7733
    } else {
     $$0511 = $66; //@line 7735
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 7742
    $76 = $$0511 + -2 | 0; //@line 7745
    HEAP8[$76 >> 0] = $5 + 15; //@line 7746
    $77 = ($3 | 0) < 1; //@line 7747
    $79 = ($4 & 8 | 0) == 0; //@line 7749
    $$0523 = $8; //@line 7750
    $$2473 = $$1472; //@line 7750
    while (1) {
     $80 = ~~$$2473; //@line 7752
     $86 = $$0523 + 1 | 0; //@line 7758
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1937 + $80 >> 0]; //@line 7759
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 7762
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 7771
      } else {
       HEAP8[$86 >> 0] = 46; //@line 7774
       $$1524 = $$0523 + 2 | 0; //@line 7775
      }
     } else {
      $$1524 = $86; //@line 7778
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 7782
     }
    }
    $$pre693 = $$1524; //@line 7788
    if (!$3) {
     label = 24; //@line 7790
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 7798
      $$sink = $3 + 2 | 0; //@line 7798
     } else {
      label = 24; //@line 7800
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 7804
     $$pre$phi691Z2D = $101; //@line 7805
     $$sink = $101; //@line 7805
    }
    $104 = $11 - $76 | 0; //@line 7809
    $106 = $104 + $44 + $$sink | 0; //@line 7811
    _pad_676($0, 32, $2, $106, $4); //@line 7812
    _out_670($0, $$0521$, $44); //@line 7813
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 7815
    _out_670($0, $8, $$pre$phi691Z2D); //@line 7816
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 7818
    _out_670($0, $76, $104); //@line 7819
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 7821
    $$sink560 = $106; //@line 7822
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 7826
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 7830
    HEAP32[$7 >> 2] = $113; //@line 7831
    $$3 = $35 * 268435456.0; //@line 7832
    $$pr = $113; //@line 7832
   } else {
    $$3 = $35; //@line 7835
    $$pr = HEAP32[$7 >> 2] | 0; //@line 7835
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 7839
   $$0498 = $$561; //@line 7840
   $$4 = $$3; //@line 7840
   do {
    $116 = ~~$$4 >>> 0; //@line 7842
    HEAP32[$$0498 >> 2] = $116; //@line 7843
    $$0498 = $$0498 + 4 | 0; //@line 7844
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 7847
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 7857
    $$1499662 = $$0498; //@line 7857
    $124 = $$pr; //@line 7857
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 7860
     $$0488655 = $$1499662 + -4 | 0; //@line 7861
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 7864
     } else {
      $$0488657 = $$0488655; //@line 7866
      $$0497656 = 0; //@line 7866
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 7869
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 7871
       $131 = tempRet0; //@line 7872
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7873
       HEAP32[$$0488657 >> 2] = $132; //@line 7875
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7876
       $$0488657 = $$0488657 + -4 | 0; //@line 7878
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 7888
      } else {
       $138 = $$1482663 + -4 | 0; //@line 7890
       HEAP32[$138 >> 2] = $$0497656; //@line 7891
       $$2483$ph = $138; //@line 7892
      }
     }
     $$2500 = $$1499662; //@line 7895
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 7901
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 7905
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 7911
     HEAP32[$7 >> 2] = $144; //@line 7912
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 7915
      $$1499662 = $$2500; //@line 7915
      $124 = $144; //@line 7915
     } else {
      $$1482$lcssa = $$2483$ph; //@line 7917
      $$1499$lcssa = $$2500; //@line 7917
      $$pr566 = $144; //@line 7917
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 7922
    $$1499$lcssa = $$0498; //@line 7922
    $$pr566 = $$pr; //@line 7922
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 7928
    $150 = ($39 | 0) == 102; //@line 7929
    $$3484650 = $$1482$lcssa; //@line 7930
    $$3501649 = $$1499$lcssa; //@line 7930
    $152 = $$pr566; //@line 7930
    while (1) {
     $151 = 0 - $152 | 0; //@line 7932
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 7934
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 7938
      $161 = 1e9 >>> $154; //@line 7939
      $$0487644 = 0; //@line 7940
      $$1489643 = $$3484650; //@line 7940
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 7942
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 7946
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 7947
       $$1489643 = $$1489643 + 4 | 0; //@line 7948
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7959
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 7962
       $$4502 = $$3501649; //@line 7962
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 7965
       $$$3484700 = $$$3484; //@line 7966
       $$4502 = $$3501649 + 4 | 0; //@line 7966
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7973
      $$4502 = $$3501649; //@line 7973
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 7975
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 7982
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 7984
     HEAP32[$7 >> 2] = $152; //@line 7985
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 7990
      $$3501$lcssa = $$$4502; //@line 7990
      break;
     } else {
      $$3484650 = $$$3484700; //@line 7988
      $$3501649 = $$$4502; //@line 7988
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 7995
    $$3501$lcssa = $$1499$lcssa; //@line 7995
   }
   $185 = $$561; //@line 7998
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8003
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8004
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8007
    } else {
     $$0514639 = $189; //@line 8009
     $$0530638 = 10; //@line 8009
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8011
      $193 = $$0514639 + 1 | 0; //@line 8012
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8015
       break;
      } else {
       $$0514639 = $193; //@line 8018
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8023
   }
   $198 = ($39 | 0) == 103; //@line 8028
   $199 = ($$540 | 0) != 0; //@line 8029
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8032
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8041
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8044
    $213 = ($209 | 0) % 9 | 0; //@line 8045
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8048
     $$1531632 = 10; //@line 8048
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8051
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8054
       $$1531632 = $215; //@line 8054
      } else {
       $$1531$lcssa = $215; //@line 8056
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8061
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8063
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8064
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8067
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8070
     $$4518 = $$1515; //@line 8070
     $$8 = $$3484$lcssa; //@line 8070
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8075
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8076
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8081
     if (!$$0520) {
      $$1467 = $$$564; //@line 8084
      $$1469 = $$543; //@line 8084
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8087
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8092
      $$1469 = $230 ? -$$543 : $$543; //@line 8092
     }
     $233 = $217 - $218 | 0; //@line 8094
     HEAP32[$212 >> 2] = $233; //@line 8095
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8099
      HEAP32[$212 >> 2] = $236; //@line 8100
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8103
       $$sink547625 = $212; //@line 8103
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8105
        HEAP32[$$sink547625 >> 2] = 0; //@line 8106
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8109
         HEAP32[$240 >> 2] = 0; //@line 8110
         $$6 = $240; //@line 8111
        } else {
         $$6 = $$5486626; //@line 8113
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8116
        HEAP32[$238 >> 2] = $242; //@line 8117
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8120
         $$sink547625 = $238; //@line 8120
        } else {
         $$5486$lcssa = $$6; //@line 8122
         $$sink547$lcssa = $238; //@line 8122
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8127
       $$sink547$lcssa = $212; //@line 8127
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8132
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8133
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8136
       $$4518 = $247; //@line 8136
       $$8 = $$5486$lcssa; //@line 8136
      } else {
       $$2516621 = $247; //@line 8138
       $$2532620 = 10; //@line 8138
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8140
        $251 = $$2516621 + 1 | 0; //@line 8141
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8144
         $$4518 = $251; //@line 8144
         $$8 = $$5486$lcssa; //@line 8144
         break;
        } else {
         $$2516621 = $251; //@line 8147
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8152
      $$4518 = $$1515; //@line 8152
      $$8 = $$3484$lcssa; //@line 8152
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8155
    $$5519$ph = $$4518; //@line 8158
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8158
    $$9$ph = $$8; //@line 8158
   } else {
    $$5519$ph = $$1515; //@line 8160
    $$7505$ph = $$3501$lcssa; //@line 8160
    $$9$ph = $$3484$lcssa; //@line 8160
   }
   $$7505 = $$7505$ph; //@line 8162
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8166
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8169
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8173
    } else {
     $$lcssa675 = 1; //@line 8175
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8179
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8184
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8192
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8192
     } else {
      $$0479 = $5 + -2 | 0; //@line 8196
      $$2476 = $$540$ + -1 | 0; //@line 8196
     }
     $267 = $4 & 8; //@line 8198
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8203
       if (!$270) {
        $$2529 = 9; //@line 8206
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8211
         $$3533616 = 10; //@line 8211
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8213
          $275 = $$1528617 + 1 | 0; //@line 8214
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8220
           break;
          } else {
           $$1528617 = $275; //@line 8218
          }
         }
        } else {
         $$2529 = 0; //@line 8225
        }
       }
      } else {
       $$2529 = 9; //@line 8229
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8237
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8239
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8241
       $$1480 = $$0479; //@line 8244
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8244
       $$pre$phi698Z2D = 0; //@line 8244
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8248
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8250
       $$1480 = $$0479; //@line 8253
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8253
       $$pre$phi698Z2D = 0; //@line 8253
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8257
      $$3477 = $$2476; //@line 8257
      $$pre$phi698Z2D = $267; //@line 8257
     }
    } else {
     $$1480 = $5; //@line 8261
     $$3477 = $$540; //@line 8261
     $$pre$phi698Z2D = $4 & 8; //@line 8261
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8264
   $294 = ($292 | 0) != 0 & 1; //@line 8266
   $296 = ($$1480 | 32 | 0) == 102; //@line 8268
   if ($296) {
    $$2513 = 0; //@line 8272
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8272
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8275
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8278
    $304 = $11; //@line 8279
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8284
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8286
      HEAP8[$308 >> 0] = 48; //@line 8287
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8292
      } else {
       $$1512$lcssa = $308; //@line 8294
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8299
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8306
    $318 = $$1512$lcssa + -2 | 0; //@line 8308
    HEAP8[$318 >> 0] = $$1480; //@line 8309
    $$2513 = $318; //@line 8312
    $$pn = $304 - $318 | 0; //@line 8312
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8317
   _pad_676($0, 32, $2, $323, $4); //@line 8318
   _out_670($0, $$0521, $$0520); //@line 8319
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8321
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8324
    $326 = $8 + 9 | 0; //@line 8325
    $327 = $326; //@line 8326
    $328 = $8 + 8 | 0; //@line 8327
    $$5493600 = $$0496$$9; //@line 8328
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8331
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8336
       $$1465 = $328; //@line 8337
      } else {
       $$1465 = $330; //@line 8339
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8346
       $$0464597 = $330; //@line 8347
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8349
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8352
        } else {
         $$1465 = $335; //@line 8354
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8359
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8364
     $$5493600 = $$5493600 + 4 | 0; //@line 8365
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1953, 1); //@line 8375
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8381
     $$6494592 = $$5493600; //@line 8381
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8384
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8389
       $$0463587 = $347; //@line 8390
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8392
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8395
        } else {
         $$0463$lcssa = $351; //@line 8397
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8402
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8406
      $$6494592 = $$6494592 + 4 | 0; //@line 8407
      $356 = $$4478593 + -9 | 0; //@line 8408
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8415
       break;
      } else {
       $$4478593 = $356; //@line 8413
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8420
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8423
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8426
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8429
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8430
     $365 = $363; //@line 8431
     $366 = 0 - $9 | 0; //@line 8432
     $367 = $8 + 8 | 0; //@line 8433
     $$5605 = $$3477; //@line 8434
     $$7495604 = $$9$ph; //@line 8434
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8437
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8440
       $$0 = $367; //@line 8441
      } else {
       $$0 = $369; //@line 8443
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8448
        _out_670($0, $$0, 1); //@line 8449
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 8453
         break;
        }
        _out_670($0, 1953, 1); //@line 8456
        $$2 = $375; //@line 8457
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 8461
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 8466
        $$1601 = $$0; //@line 8467
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 8469
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 8472
         } else {
          $$2 = $373; //@line 8474
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 8481
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 8484
      $381 = $$5605 - $378 | 0; //@line 8485
      $$7495604 = $$7495604 + 4 | 0; //@line 8486
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 8493
       break;
      } else {
       $$5605 = $381; //@line 8491
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 8498
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 8501
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 8505
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 8508
   $$sink560 = $323; //@line 8509
  }
 } while (0);
 STACKTOP = sp; //@line 8514
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 8514
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6192
 STACKTOP = STACKTOP + 64 | 0; //@line 6193
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6193
 $5 = sp + 16 | 0; //@line 6194
 $6 = sp; //@line 6195
 $7 = sp + 24 | 0; //@line 6196
 $8 = sp + 8 | 0; //@line 6197
 $9 = sp + 20 | 0; //@line 6198
 HEAP32[$5 >> 2] = $1; //@line 6199
 $10 = ($0 | 0) != 0; //@line 6200
 $11 = $7 + 40 | 0; //@line 6201
 $12 = $11; //@line 6202
 $13 = $7 + 39 | 0; //@line 6203
 $14 = $8 + 4 | 0; //@line 6204
 $$0243 = 0; //@line 6205
 $$0247 = 0; //@line 6205
 $$0269 = 0; //@line 6205
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6214
     $$1248 = -1; //@line 6215
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6219
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6223
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6226
  $21 = HEAP8[$20 >> 0] | 0; //@line 6227
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6230
   break;
  } else {
   $23 = $21; //@line 6233
   $25 = $20; //@line 6233
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6238
     $27 = $25; //@line 6238
     label = 9; //@line 6239
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6244
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6251
   HEAP32[$5 >> 2] = $24; //@line 6252
   $23 = HEAP8[$24 >> 0] | 0; //@line 6254
   $25 = $24; //@line 6254
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6259
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6264
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6267
     $27 = $27 + 2 | 0; //@line 6268
     HEAP32[$5 >> 2] = $27; //@line 6269
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6276
      break;
     } else {
      $$0249303 = $30; //@line 6273
      label = 9; //@line 6274
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6284
  if ($10) {
   _out_670($0, $20, $36); //@line 6286
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6290
   $$0247 = $$1248; //@line 6290
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6298
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6299
  if ($43) {
   $$0253 = -1; //@line 6301
   $$1270 = $$0269; //@line 6301
   $$sink = 1; //@line 6301
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6311
    $$1270 = 1; //@line 6311
    $$sink = 3; //@line 6311
   } else {
    $$0253 = -1; //@line 6313
    $$1270 = $$0269; //@line 6313
    $$sink = 1; //@line 6313
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6316
  HEAP32[$5 >> 2] = $51; //@line 6317
  $52 = HEAP8[$51 >> 0] | 0; //@line 6318
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6320
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6327
   $$lcssa291 = $52; //@line 6327
   $$lcssa292 = $51; //@line 6327
  } else {
   $$0262309 = 0; //@line 6329
   $60 = $52; //@line 6329
   $65 = $51; //@line 6329
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6334
    $64 = $65 + 1 | 0; //@line 6335
    HEAP32[$5 >> 2] = $64; //@line 6336
    $66 = HEAP8[$64 >> 0] | 0; //@line 6337
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6339
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6346
     $$lcssa291 = $66; //@line 6346
     $$lcssa292 = $64; //@line 6346
     break;
    } else {
     $$0262309 = $63; //@line 6349
     $60 = $66; //@line 6349
     $65 = $64; //@line 6349
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6361
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6363
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6368
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6373
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6385
     $$2271 = 1; //@line 6385
     $storemerge274 = $79 + 3 | 0; //@line 6385
    } else {
     label = 23; //@line 6387
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6391
    if ($$1270 | 0) {
     $$0 = -1; //@line 6394
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6409
     $106 = HEAP32[$105 >> 2] | 0; //@line 6410
     HEAP32[$2 >> 2] = $105 + 4; //@line 6412
     $363 = $106; //@line 6413
    } else {
     $363 = 0; //@line 6415
    }
    $$0259 = $363; //@line 6419
    $$2271 = 0; //@line 6419
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6419
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6421
   $109 = ($$0259 | 0) < 0; //@line 6422
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6427
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6427
   $$3272 = $$2271; //@line 6427
   $115 = $storemerge274; //@line 6427
  } else {
   $112 = _getint_671($5) | 0; //@line 6429
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6432
    break;
   }
   $$1260 = $112; //@line 6436
   $$1263 = $$0262$lcssa; //@line 6436
   $$3272 = $$1270; //@line 6436
   $115 = HEAP32[$5 >> 2] | 0; //@line 6436
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6447
     $156 = _getint_671($5) | 0; //@line 6448
     $$0254 = $156; //@line 6450
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 6450
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 6459
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 6464
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6469
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6476
      $144 = $125 + 4 | 0; //@line 6480
      HEAP32[$5 >> 2] = $144; //@line 6481
      $$0254 = $140; //@line 6482
      $$pre345 = $144; //@line 6482
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 6488
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6503
     $152 = HEAP32[$151 >> 2] | 0; //@line 6504
     HEAP32[$2 >> 2] = $151 + 4; //@line 6506
     $364 = $152; //@line 6507
    } else {
     $364 = 0; //@line 6509
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 6512
    HEAP32[$5 >> 2] = $154; //@line 6513
    $$0254 = $364; //@line 6514
    $$pre345 = $154; //@line 6514
   } else {
    $$0254 = -1; //@line 6516
    $$pre345 = $115; //@line 6516
   }
  } while (0);
  $$0252 = 0; //@line 6519
  $158 = $$pre345; //@line 6519
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 6526
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 6529
   HEAP32[$5 >> 2] = $158; //@line 6530
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1421 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 6535
   $168 = $167 & 255; //@line 6536
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 6540
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 6547
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 6551
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 6555
     break L1;
    } else {
     label = 50; //@line 6558
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 6563
     $176 = $3 + ($$0253 << 3) | 0; //@line 6565
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 6570
     $182 = $6; //@line 6571
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 6573
     HEAP32[$182 + 4 >> 2] = $181; //@line 6576
     label = 50; //@line 6577
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 6581
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 6584
    $187 = HEAP32[$5 >> 2] | 0; //@line 6586
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 6590
   if ($10) {
    $187 = $158; //@line 6592
   } else {
    $$0243 = 0; //@line 6594
    $$0247 = $$1248; //@line 6594
    $$0269 = $$3272; //@line 6594
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 6600
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 6606
  $196 = $$1263 & -65537; //@line 6609
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 6610
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6618
       $$0243 = 0; //@line 6619
       $$0247 = $$1248; //@line 6619
       $$0269 = $$3272; //@line 6619
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6625
       $$0243 = 0; //@line 6626
       $$0247 = $$1248; //@line 6626
       $$0269 = $$3272; //@line 6626
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 6634
       HEAP32[$208 >> 2] = $$1248; //@line 6636
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6639
       $$0243 = 0; //@line 6640
       $$0247 = $$1248; //@line 6640
       $$0269 = $$3272; //@line 6640
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 6647
       $$0243 = 0; //@line 6648
       $$0247 = $$1248; //@line 6648
       $$0269 = $$3272; //@line 6648
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 6655
       $$0243 = 0; //@line 6656
       $$0247 = $$1248; //@line 6656
       $$0269 = $$3272; //@line 6656
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6662
       $$0243 = 0; //@line 6663
       $$0247 = $$1248; //@line 6663
       $$0269 = $$3272; //@line 6663
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 6671
       HEAP32[$220 >> 2] = $$1248; //@line 6673
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6676
       $$0243 = 0; //@line 6677
       $$0247 = $$1248; //@line 6677
       $$0269 = $$3272; //@line 6677
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 6682
       $$0247 = $$1248; //@line 6682
       $$0269 = $$3272; //@line 6682
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 6692
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 6692
     $$3265 = $$1263$ | 8; //@line 6692
     label = 62; //@line 6693
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 6697
     $$1255 = $$0254; //@line 6697
     $$3265 = $$1263$; //@line 6697
     label = 62; //@line 6698
     break;
    }
   case 111:
    {
     $242 = $6; //@line 6702
     $244 = HEAP32[$242 >> 2] | 0; //@line 6704
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 6707
     $248 = _fmt_o($244, $247, $11) | 0; //@line 6708
     $252 = $12 - $248 | 0; //@line 6712
     $$0228 = $248; //@line 6717
     $$1233 = 0; //@line 6717
     $$1238 = 1885; //@line 6717
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 6717
     $$4266 = $$1263$; //@line 6717
     $281 = $244; //@line 6717
     $283 = $247; //@line 6717
     label = 68; //@line 6718
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 6722
     $258 = HEAP32[$256 >> 2] | 0; //@line 6724
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 6727
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 6730
      $264 = tempRet0; //@line 6731
      $265 = $6; //@line 6732
      HEAP32[$265 >> 2] = $263; //@line 6734
      HEAP32[$265 + 4 >> 2] = $264; //@line 6737
      $$0232 = 1; //@line 6738
      $$0237 = 1885; //@line 6738
      $275 = $263; //@line 6738
      $276 = $264; //@line 6738
      label = 67; //@line 6739
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 6751
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1885 : 1887 : 1886; //@line 6751
      $275 = $258; //@line 6751
      $276 = $261; //@line 6751
      label = 67; //@line 6752
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 6758
     $$0232 = 0; //@line 6764
     $$0237 = 1885; //@line 6764
     $275 = HEAP32[$197 >> 2] | 0; //@line 6764
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 6764
     label = 67; //@line 6765
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 6776
     $$2 = $13; //@line 6777
     $$2234 = 0; //@line 6777
     $$2239 = 1885; //@line 6777
     $$2251 = $11; //@line 6777
     $$5 = 1; //@line 6777
     $$6268 = $196; //@line 6777
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 6784
     label = 72; //@line 6785
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 6789
     $$1 = $302 | 0 ? $302 : 1895; //@line 6792
     label = 72; //@line 6793
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 6803
     HEAP32[$14 >> 2] = 0; //@line 6804
     HEAP32[$6 >> 2] = $8; //@line 6805
     $$4258354 = -1; //@line 6806
     $365 = $8; //@line 6806
     label = 76; //@line 6807
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 6811
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 6814
      $$0240$lcssa356 = 0; //@line 6815
      label = 85; //@line 6816
     } else {
      $$4258354 = $$0254; //@line 6818
      $365 = $$pre348; //@line 6818
      label = 76; //@line 6819
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 6826
     $$0247 = $$1248; //@line 6826
     $$0269 = $$3272; //@line 6826
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 6831
     $$2234 = 0; //@line 6831
     $$2239 = 1885; //@line 6831
     $$2251 = $11; //@line 6831
     $$5 = $$0254; //@line 6831
     $$6268 = $$1263$; //@line 6831
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 6837
    $227 = $6; //@line 6838
    $229 = HEAP32[$227 >> 2] | 0; //@line 6840
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 6843
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 6845
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 6851
    $$0228 = $234; //@line 6856
    $$1233 = $or$cond278 ? 0 : 2; //@line 6856
    $$1238 = $or$cond278 ? 1885 : 1885 + ($$1236 >> 4) | 0; //@line 6856
    $$2256 = $$1255; //@line 6856
    $$4266 = $$3265; //@line 6856
    $281 = $229; //@line 6856
    $283 = $232; //@line 6856
    label = 68; //@line 6857
   } else if ((label | 0) == 67) {
    label = 0; //@line 6860
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 6862
    $$1233 = $$0232; //@line 6862
    $$1238 = $$0237; //@line 6862
    $$2256 = $$0254; //@line 6862
    $$4266 = $$1263$; //@line 6862
    $281 = $275; //@line 6862
    $283 = $276; //@line 6862
    label = 68; //@line 6863
   } else if ((label | 0) == 72) {
    label = 0; //@line 6866
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 6867
    $306 = ($305 | 0) == 0; //@line 6868
    $$2 = $$1; //@line 6875
    $$2234 = 0; //@line 6875
    $$2239 = 1885; //@line 6875
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 6875
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 6875
    $$6268 = $196; //@line 6875
   } else if ((label | 0) == 76) {
    label = 0; //@line 6878
    $$0229316 = $365; //@line 6879
    $$0240315 = 0; //@line 6879
    $$1244314 = 0; //@line 6879
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 6881
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 6884
      $$2245 = $$1244314; //@line 6884
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 6887
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 6893
      $$2245 = $320; //@line 6893
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 6897
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 6900
      $$0240315 = $325; //@line 6900
      $$1244314 = $320; //@line 6900
     } else {
      $$0240$lcssa = $325; //@line 6902
      $$2245 = $320; //@line 6902
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 6908
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 6911
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 6914
     label = 85; //@line 6915
    } else {
     $$1230327 = $365; //@line 6917
     $$1241326 = 0; //@line 6917
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 6919
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6922
       label = 85; //@line 6923
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 6926
      $$1241326 = $331 + $$1241326 | 0; //@line 6927
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6930
       label = 85; //@line 6931
       break L97;
      }
      _out_670($0, $9, $331); //@line 6935
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6940
       label = 85; //@line 6941
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 6938
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 6949
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 6955
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 6957
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 6962
   $$2 = $or$cond ? $$0228 : $11; //@line 6967
   $$2234 = $$1233; //@line 6967
   $$2239 = $$1238; //@line 6967
   $$2251 = $11; //@line 6967
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 6967
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 6967
  } else if ((label | 0) == 85) {
   label = 0; //@line 6970
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 6972
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 6975
   $$0247 = $$1248; //@line 6975
   $$0269 = $$3272; //@line 6975
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 6980
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 6982
  $345 = $$$5 + $$2234 | 0; //@line 6983
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 6985
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 6986
  _out_670($0, $$2239, $$2234); //@line 6987
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 6989
  _pad_676($0, 48, $$$5, $343, 0); //@line 6990
  _out_670($0, $$2, $343); //@line 6991
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 6993
  $$0243 = $$2261; //@line 6994
  $$0247 = $$1248; //@line 6994
  $$0269 = $$3272; //@line 6994
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7002
    } else {
     $$2242302 = 1; //@line 7004
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7007
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7010
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7014
      $356 = $$2242302 + 1 | 0; //@line 7015
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7018
      } else {
       $$2242$lcssa = $356; //@line 7020
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7026
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7032
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7038
       } else {
        $$0 = 1; //@line 7040
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7045
     }
    }
   } else {
    $$0 = $$1248; //@line 7049
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7053
 return $$0 | 0; //@line 7053
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 192
 STACKTOP = STACKTOP + 96 | 0; //@line 193
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 193
 $vararg_buffer23 = sp + 72 | 0; //@line 194
 $vararg_buffer20 = sp + 64 | 0; //@line 195
 $vararg_buffer18 = sp + 56 | 0; //@line 196
 $vararg_buffer15 = sp + 48 | 0; //@line 197
 $vararg_buffer12 = sp + 40 | 0; //@line 198
 $vararg_buffer9 = sp + 32 | 0; //@line 199
 $vararg_buffer6 = sp + 24 | 0; //@line 200
 $vararg_buffer3 = sp + 16 | 0; //@line 201
 $vararg_buffer1 = sp + 8 | 0; //@line 202
 $vararg_buffer = sp; //@line 203
 $4 = sp + 80 | 0; //@line 204
 $5 = HEAP32[37] | 0; //@line 205
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 209
   FUNCTION_TABLE_v[$5 & 0](); //@line 210
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 9; //@line 213
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 215
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 217
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer20; //@line 219
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer20; //@line 221
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer3; //@line 223
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer3; //@line 225
    HEAP32[$AsyncCtx + 28 >> 2] = $4; //@line 227
    HEAP32[$AsyncCtx + 32 >> 2] = $3; //@line 229
    HEAP32[$AsyncCtx + 36 >> 2] = $2; //@line 231
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer1; //@line 233
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer1; //@line 235
    HEAP8[$AsyncCtx + 48 >> 0] = $0; //@line 237
    HEAP32[$AsyncCtx + 52 >> 2] = $1; //@line 239
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer15; //@line 241
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer15; //@line 243
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer18; //@line 245
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer18; //@line 247
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer9; //@line 249
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer9; //@line 251
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer12; //@line 253
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer12; //@line 255
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer6; //@line 257
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer6; //@line 259
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer23; //@line 261
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer23; //@line 263
    sp = STACKTOP; //@line 264
    STACKTOP = sp; //@line 265
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 267
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 270
    break;
   }
  }
 } while (0);
 $34 = HEAP32[28] | 0; //@line 275
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 279
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[25] | 0; //@line 285
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 292
       break;
      }
     }
     $43 = HEAP32[26] | 0; //@line 296
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 300
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 305
      } else {
       label = 11; //@line 307
      }
     }
    } else {
     label = 11; //@line 311
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 315
   }
   if (!((HEAP32[35] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 327
    break;
   }
   $54 = HEAPU8[96] | 0; //@line 331
   $55 = $0 & 255; //@line 332
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 337
    $$lobit = $59 >>> 6; //@line 338
    $60 = $$lobit & 255; //@line 339
    $64 = ($54 & 32 | 0) == 0; //@line 343
    $65 = HEAP32[29] | 0; //@line 344
    $66 = HEAP32[28] | 0; //@line 345
    $67 = $0 << 24 >> 24 == 1; //@line 346
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 350
      _vsnprintf($66, $65, $2, $3) | 0; //@line 351
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 10; //@line 354
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 357
       sp = STACKTOP; //@line 358
       STACKTOP = sp; //@line 359
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 361
      $69 = HEAP32[36] | 0; //@line 362
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[35] | 0; //@line 366
       $74 = HEAP32[28] | 0; //@line 367
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 368
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 369
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 13; //@line 372
        sp = STACKTOP; //@line 373
        STACKTOP = sp; //@line 374
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 376
        break;
       }
      }
      $71 = HEAP32[28] | 0; //@line 380
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 381
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 382
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 11; //@line 385
       sp = STACKTOP; //@line 386
       STACKTOP = sp; //@line 387
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 389
      $72 = HEAP32[36] | 0; //@line 390
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 391
      FUNCTION_TABLE_vi[$72 & 127](993); //@line 392
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 12; //@line 395
       sp = STACKTOP; //@line 396
       STACKTOP = sp; //@line 397
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 399
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 406
       $$1143 = $66; //@line 406
       $$1145 = $65; //@line 406
       $$3154 = 0; //@line 406
       label = 38; //@line 407
      } else {
       if ($64) {
        $$0142 = $66; //@line 410
        $$0144 = $65; //@line 410
       } else {
        $76 = _snprintf($66, $65, 995, $vararg_buffer) | 0; //@line 412
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 414
        $78 = ($$ | 0) > 0; //@line 415
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 420
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 420
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 424
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1013; //@line 430
          label = 35; //@line 431
          break;
         }
        case 1:
         {
          $$sink = 1019; //@line 435
          label = 35; //@line 436
          break;
         }
        case 3:
         {
          $$sink = 1007; //@line 440
          label = 35; //@line 441
          break;
         }
        case 7:
         {
          $$sink = 1001; //@line 445
          label = 35; //@line 446
          break;
         }
        default:
         {
          $$0141 = 0; //@line 450
          $$1152 = 0; //@line 450
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 454
         $$0141 = $60 & 1; //@line 457
         $$1152 = _snprintf($$0142, $$0144, 1025, $vararg_buffer1) | 0; //@line 457
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 460
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 462
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 464
         $$1$off0 = $extract$t159; //@line 469
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 469
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 469
         $$3154 = $$1152; //@line 469
         label = 38; //@line 470
        } else {
         $$1$off0 = $extract$t159; //@line 472
         $$1143 = $$0142; //@line 472
         $$1145 = $$0144; //@line 472
         $$3154 = $$1152$; //@line 472
         label = 38; //@line 473
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 486
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 487
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 488
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 14; //@line 491
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 493
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 495
           HEAP8[$AsyncCtx60 + 12 >> 0] = $$1$off0 & 1; //@line 498
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer23; //@line 500
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer23; //@line 502
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer3; //@line 504
           HEAP32[$AsyncCtx60 + 28 >> 2] = $$1143; //@line 506
           HEAP32[$AsyncCtx60 + 32 >> 2] = $$1145; //@line 508
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer3; //@line 510
           HEAP32[$AsyncCtx60 + 40 >> 2] = $4; //@line 512
           HEAP32[$AsyncCtx60 + 44 >> 2] = $2; //@line 514
           HEAP32[$AsyncCtx60 + 48 >> 2] = $3; //@line 516
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer15; //@line 518
           HEAP32[$AsyncCtx60 + 56 >> 2] = $1; //@line 520
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer15; //@line 522
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer18; //@line 524
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer18; //@line 526
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer9; //@line 528
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer9; //@line 530
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer12; //@line 532
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer12; //@line 534
           HEAP32[$AsyncCtx60 + 88 >> 2] = $55; //@line 536
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer6; //@line 538
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer6; //@line 540
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 542
           sp = STACKTOP; //@line 543
           STACKTOP = sp; //@line 544
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 546
          $125 = HEAP32[33] | 0; //@line 551
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 552
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 553
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 15; //@line 556
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer3; //@line 558
           HEAP32[$AsyncCtx38 + 8 >> 2] = $$1143; //@line 560
           HEAP32[$AsyncCtx38 + 12 >> 2] = $$1145; //@line 562
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer3; //@line 564
           HEAP32[$AsyncCtx38 + 20 >> 2] = $4; //@line 566
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer20; //@line 568
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer20; //@line 570
           HEAP32[$AsyncCtx38 + 32 >> 2] = $2; //@line 572
           HEAP32[$AsyncCtx38 + 36 >> 2] = $3; //@line 574
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer15; //@line 576
           HEAP32[$AsyncCtx38 + 44 >> 2] = $1; //@line 578
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer15; //@line 580
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer18; //@line 582
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer18; //@line 584
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer9; //@line 586
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer9; //@line 588
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer12; //@line 590
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer12; //@line 592
           HEAP32[$AsyncCtx38 + 76 >> 2] = $55; //@line 594
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer6; //@line 596
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer6; //@line 598
           HEAP8[$AsyncCtx38 + 88 >> 0] = $$1$off0 & 1; //@line 601
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer23; //@line 603
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer23; //@line 605
           sp = STACKTOP; //@line 606
           STACKTOP = sp; //@line 607
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 609
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 610
           $151 = _snprintf($$1143, $$1145, 1025, $vararg_buffer3) | 0; //@line 611
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 613
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 618
            $$3147 = $$1145 - $$10 | 0; //@line 618
            label = 44; //@line 619
            break;
           } else {
            $$3147168 = $$1145; //@line 622
            $$3169 = $$1143; //@line 622
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 627
          $$3147 = $$1145; //@line 627
          label = 44; //@line 628
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 634
          $$3169 = $$3; //@line 634
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 639
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 645
          $$5156 = _snprintf($$3169, $$3147168, 1028, $vararg_buffer6) | 0; //@line 647
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 651
          $$5156 = _snprintf($$3169, $$3147168, 1043, $vararg_buffer9) | 0; //@line 653
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 657
          $$5156 = _snprintf($$3169, $$3147168, 1058, $vararg_buffer12) | 0; //@line 659
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 663
          $$5156 = _snprintf($$3169, $$3147168, 1073, $vararg_buffer15) | 0; //@line 665
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1088, $vararg_buffer18) | 0; //@line 670
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 674
        $168 = $$3169 + $$5156$ | 0; //@line 676
        $169 = $$3147168 - $$5156$ | 0; //@line 677
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 681
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 682
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 16; //@line 685
          HEAP32[$AsyncCtx56 + 4 >> 2] = $169; //@line 687
          HEAP32[$AsyncCtx56 + 8 >> 2] = $168; //@line 689
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer20; //@line 691
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer20; //@line 693
          HEAP8[$AsyncCtx56 + 20 >> 0] = $$1$off0 & 1; //@line 696
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer23; //@line 698
          HEAP32[$AsyncCtx56 + 28 >> 2] = $vararg_buffer23; //@line 700
          sp = STACKTOP; //@line 701
          STACKTOP = sp; //@line 702
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 704
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 706
         $181 = $168 + $$13 | 0; //@line 708
         $182 = $169 - $$13 | 0; //@line 709
         if (($$13 | 0) > 0) {
          $184 = HEAP32[34] | 0; //@line 712
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 717
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 718
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 17; //@line 721
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 723
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 725
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 727
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 729
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 732
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 734
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 736
             sp = STACKTOP; //@line 737
             STACKTOP = sp; //@line 738
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 740
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 741
             $194 = _snprintf($181, $182, 1025, $vararg_buffer20) | 0; //@line 742
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 744
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 749
              $$6150 = $182 - $$18 | 0; //@line 749
              $$9 = $$18; //@line 749
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 756
            $$6150 = $182; //@line 756
            $$9 = $$13; //@line 756
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1103, $vararg_buffer23) | 0; //@line 765
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[35] | 0; //@line 771
      $202 = HEAP32[28] | 0; //@line 772
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 773
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 774
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 18; //@line 777
       sp = STACKTOP; //@line 778
       STACKTOP = sp; //@line 779
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 781
       break;
      }
     }
    } while (0);
    HEAP32[32] = HEAP32[30]; //@line 787
   }
  }
 } while (0);
 $204 = HEAP32[38] | 0; //@line 791
 if (!$204) {
  STACKTOP = sp; //@line 794
  return;
 }
 $206 = HEAP32[39] | 0; //@line 796
 HEAP32[39] = 0; //@line 797
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 798
 FUNCTION_TABLE_v[$204 & 0](); //@line 799
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 19; //@line 802
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 804
  sp = STACKTOP; //@line 805
  STACKTOP = sp; //@line 806
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 808
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 811
 } else {
  STACKTOP = sp; //@line 813
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 816
  $$pre = HEAP32[38] | 0; //@line 817
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 818
  FUNCTION_TABLE_v[$$pre & 0](); //@line 819
  if (___async) {
   label = 70; //@line 822
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 825
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 828
  } else {
   label = 72; //@line 830
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 20; //@line 835
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 837
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 839
  sp = STACKTOP; //@line 840
  STACKTOP = sp; //@line 841
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 844
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11326
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11328
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11332
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11334
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11336
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11338
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11340
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11342
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11344
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11346
 $24 = HEAP8[$0 + 48 >> 0] | 0; //@line 11350
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11352
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11354
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11356
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11358
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11360
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11362
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11364
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11366
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 11368
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 11370
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 11372
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 11374
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 11376
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 11379
 $53 = HEAP32[28] | 0; //@line 11380
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 11384
   do {
    if ($24 << 24 >> 24 > -1 & ($26 | 0) != 0) {
     $57 = HEAP32[25] | 0; //@line 11390
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $26) | 0) {
       $$0$i = 1; //@line 11397
       break;
      }
     }
     $62 = HEAP32[26] | 0; //@line 11401
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 11405
     } else {
      if (!(_strstr($62, $26) | 0)) {
       $$0$i = 1; //@line 11410
      } else {
       label = 9; //@line 11412
      }
     }
    } else {
     label = 9; //@line 11416
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 11420
   }
   if (!((HEAP32[35] | 0) != 0 & ((($26 | 0) == 0 | (($18 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 11432
    break;
   }
   $73 = HEAPU8[96] | 0; //@line 11436
   $74 = $24 & 255; //@line 11437
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 11442
    $$lobit = $78 >>> 6; //@line 11443
    $79 = $$lobit & 255; //@line 11444
    $83 = ($73 & 32 | 0) == 0; //@line 11448
    $84 = HEAP32[29] | 0; //@line 11449
    $85 = HEAP32[28] | 0; //@line 11450
    $86 = $24 << 24 >> 24 == 1; //@line 11451
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 11454
     _vsnprintf($85, $84, $18, $16) | 0; //@line 11455
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 11458
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 11459
      $$expand_i1_val = $86 & 1; //@line 11460
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 11461
      sp = STACKTOP; //@line 11462
      return;
     }
     ___async_unwind = 0; //@line 11465
     HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 11466
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 11467
     $$expand_i1_val = $86 & 1; //@line 11468
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 11469
     sp = STACKTOP; //@line 11470
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 11476
     $$1143 = $85; //@line 11476
     $$1145 = $84; //@line 11476
     $$3154 = 0; //@line 11476
     label = 28; //@line 11477
    } else {
     if ($83) {
      $$0142 = $85; //@line 11480
      $$0144 = $84; //@line 11480
     } else {
      $89 = _snprintf($85, $84, 995, $2) | 0; //@line 11482
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 11484
      $91 = ($$ | 0) > 0; //@line 11485
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 11490
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 11490
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 11494
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1013; //@line 11500
        label = 25; //@line 11501
        break;
       }
      case 1:
       {
        $$sink = 1019; //@line 11505
        label = 25; //@line 11506
        break;
       }
      case 3:
       {
        $$sink = 1007; //@line 11510
        label = 25; //@line 11511
        break;
       }
      case 7:
       {
        $$sink = 1001; //@line 11515
        label = 25; //@line 11516
        break;
       }
      default:
       {
        $$0141 = 0; //@line 11520
        $$1152 = 0; //@line 11520
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$20 >> 2] = $$sink; //@line 11524
       $$0141 = $79 & 1; //@line 11527
       $$1152 = _snprintf($$0142, $$0144, 1025, $20) | 0; //@line 11527
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 11530
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 11532
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 11534
       $$1$off0 = $extract$t159; //@line 11539
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 11539
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 11539
       $$3154 = $$1152; //@line 11539
       label = 28; //@line 11540
      } else {
       $$1$off0 = $extract$t159; //@line 11542
       $$1143 = $$0142; //@line 11542
       $$1145 = $$0144; //@line 11542
       $$3154 = $$1152$; //@line 11542
       label = 28; //@line 11543
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
      HEAP32[$14 >> 2] = HEAP32[$16 >> 2]; //@line 11554
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 11555
      $108 = _vsnprintf(0, 0, $18, $14) | 0; //@line 11556
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 11559
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 11560
       HEAP32[$109 >> 2] = $6; //@line 11561
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 11562
       HEAP32[$110 >> 2] = $8; //@line 11563
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 11564
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 11565
       HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 11566
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 11567
       HEAP32[$112 >> 2] = $48; //@line 11568
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 11569
       HEAP32[$113 >> 2] = $50; //@line 11570
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 11571
       HEAP32[$114 >> 2] = $10; //@line 11572
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 11573
       HEAP32[$115 >> 2] = $$1143; //@line 11574
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 11575
       HEAP32[$116 >> 2] = $$1145; //@line 11576
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 11577
       HEAP32[$117 >> 2] = $12; //@line 11578
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 11579
       HEAP32[$118 >> 2] = $14; //@line 11580
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 11581
       HEAP32[$119 >> 2] = $18; //@line 11582
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 11583
       HEAP32[$120 >> 2] = $16; //@line 11584
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 11585
       HEAP32[$121 >> 2] = $28; //@line 11586
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 11587
       HEAP32[$122 >> 2] = $26; //@line 11588
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 11589
       HEAP32[$123 >> 2] = $30; //@line 11590
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 11591
       HEAP32[$124 >> 2] = $32; //@line 11592
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 11593
       HEAP32[$125 >> 2] = $34; //@line 11594
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 11595
       HEAP32[$126 >> 2] = $36; //@line 11596
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 11597
       HEAP32[$127 >> 2] = $38; //@line 11598
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 11599
       HEAP32[$128 >> 2] = $40; //@line 11600
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 11601
       HEAP32[$129 >> 2] = $42; //@line 11602
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 11603
       HEAP32[$130 >> 2] = $74; //@line 11604
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 11605
       HEAP32[$131 >> 2] = $44; //@line 11606
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 11607
       HEAP32[$132 >> 2] = $46; //@line 11608
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 11609
       HEAP32[$133 >> 2] = $$3154; //@line 11610
       sp = STACKTOP; //@line 11611
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 11615
      ___async_unwind = 0; //@line 11616
      HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 11617
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 11618
      HEAP32[$109 >> 2] = $6; //@line 11619
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 11620
      HEAP32[$110 >> 2] = $8; //@line 11621
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 11622
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 11623
      HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 11624
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 11625
      HEAP32[$112 >> 2] = $48; //@line 11626
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 11627
      HEAP32[$113 >> 2] = $50; //@line 11628
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 11629
      HEAP32[$114 >> 2] = $10; //@line 11630
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 11631
      HEAP32[$115 >> 2] = $$1143; //@line 11632
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 11633
      HEAP32[$116 >> 2] = $$1145; //@line 11634
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 11635
      HEAP32[$117 >> 2] = $12; //@line 11636
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 11637
      HEAP32[$118 >> 2] = $14; //@line 11638
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 11639
      HEAP32[$119 >> 2] = $18; //@line 11640
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 11641
      HEAP32[$120 >> 2] = $16; //@line 11642
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 11643
      HEAP32[$121 >> 2] = $28; //@line 11644
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 11645
      HEAP32[$122 >> 2] = $26; //@line 11646
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 11647
      HEAP32[$123 >> 2] = $30; //@line 11648
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 11649
      HEAP32[$124 >> 2] = $32; //@line 11650
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 11651
      HEAP32[$125 >> 2] = $34; //@line 11652
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 11653
      HEAP32[$126 >> 2] = $36; //@line 11654
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 11655
      HEAP32[$127 >> 2] = $38; //@line 11656
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 11657
      HEAP32[$128 >> 2] = $40; //@line 11658
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 11659
      HEAP32[$129 >> 2] = $42; //@line 11660
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 11661
      HEAP32[$130 >> 2] = $74; //@line 11662
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 11663
      HEAP32[$131 >> 2] = $44; //@line 11664
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 11665
      HEAP32[$132 >> 2] = $46; //@line 11666
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 11667
      HEAP32[$133 >> 2] = $$3154; //@line 11668
      sp = STACKTOP; //@line 11669
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 11674
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$44 >> 2] = $26; //@line 11680
        $$5156 = _snprintf($$1143, $$1145, 1028, $44) | 0; //@line 11682
        break;
       }
      case 1:
       {
        HEAP32[$36 >> 2] = $26; //@line 11686
        $$5156 = _snprintf($$1143, $$1145, 1043, $36) | 0; //@line 11688
        break;
       }
      case 3:
       {
        HEAP32[$40 >> 2] = $26; //@line 11692
        $$5156 = _snprintf($$1143, $$1145, 1058, $40) | 0; //@line 11694
        break;
       }
      case 7:
       {
        HEAP32[$28 >> 2] = $26; //@line 11698
        $$5156 = _snprintf($$1143, $$1145, 1073, $28) | 0; //@line 11700
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1088, $32) | 0; //@line 11705
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 11709
      $147 = $$1143 + $$5156$ | 0; //@line 11711
      $148 = $$1145 - $$5156$ | 0; //@line 11712
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 11716
       $150 = _vsnprintf($147, $148, $18, $16) | 0; //@line 11717
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11720
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 11721
        HEAP32[$151 >> 2] = $148; //@line 11722
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 11723
        HEAP32[$152 >> 2] = $147; //@line 11724
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 11725
        HEAP32[$153 >> 2] = $6; //@line 11726
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 11727
        HEAP32[$154 >> 2] = $8; //@line 11728
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 11729
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 11730
        HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 11731
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 11732
        HEAP32[$156 >> 2] = $48; //@line 11733
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 11734
        HEAP32[$157 >> 2] = $50; //@line 11735
        sp = STACKTOP; //@line 11736
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 11740
       ___async_unwind = 0; //@line 11741
       HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11742
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 11743
       HEAP32[$151 >> 2] = $148; //@line 11744
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 11745
       HEAP32[$152 >> 2] = $147; //@line 11746
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 11747
       HEAP32[$153 >> 2] = $6; //@line 11748
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 11749
       HEAP32[$154 >> 2] = $8; //@line 11750
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 11751
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 11752
       HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 11753
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 11754
       HEAP32[$156 >> 2] = $48; //@line 11755
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 11756
       HEAP32[$157 >> 2] = $50; //@line 11757
       sp = STACKTOP; //@line 11758
       return;
      }
     }
    }
    $159 = HEAP32[35] | 0; //@line 11763
    $160 = HEAP32[28] | 0; //@line 11764
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11765
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 11766
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11769
     sp = STACKTOP; //@line 11770
     return;
    }
    ___async_unwind = 0; //@line 11773
    HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11774
    sp = STACKTOP; //@line 11775
    return;
   }
  }
 } while (0);
 $161 = HEAP32[38] | 0; //@line 11780
 if (!$161) {
  return;
 }
 $163 = HEAP32[39] | 0; //@line 11785
 HEAP32[39] = 0; //@line 11786
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11787
 FUNCTION_TABLE_v[$161 & 0](); //@line 11788
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11791
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 11792
  HEAP32[$164 >> 2] = $163; //@line 11793
  sp = STACKTOP; //@line 11794
  return;
 }
 ___async_unwind = 0; //@line 11797
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11798
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 11799
 HEAP32[$164 >> 2] = $163; //@line 11800
 sp = STACKTOP; //@line 11801
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3925
 $3 = HEAP32[1019] | 0; //@line 3926
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3929
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3933
 $7 = $6 & 3; //@line 3934
 if (($7 | 0) == 1) {
  _abort(); //@line 3937
 }
 $9 = $6 & -8; //@line 3940
 $10 = $2 + $9 | 0; //@line 3941
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3946
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3952
   $17 = $13 + $9 | 0; //@line 3953
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3956
   }
   if ((HEAP32[1020] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3962
    $106 = HEAP32[$105 >> 2] | 0; //@line 3963
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3967
     $$1382 = $17; //@line 3967
     $114 = $16; //@line 3967
     break;
    }
    HEAP32[1017] = $17; //@line 3970
    HEAP32[$105 >> 2] = $106 & -2; //@line 3972
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3975
    HEAP32[$16 + $17 >> 2] = $17; //@line 3977
    return;
   }
   $21 = $13 >>> 3; //@line 3980
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3984
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3986
    $28 = 4100 + ($21 << 1 << 2) | 0; //@line 3988
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3993
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4000
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1015] = HEAP32[1015] & ~(1 << $21); //@line 4010
     $$1 = $16; //@line 4011
     $$1382 = $17; //@line 4011
     $114 = $16; //@line 4011
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4017
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4021
     }
     $41 = $26 + 8 | 0; //@line 4024
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4028
     } else {
      _abort(); //@line 4030
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4035
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4036
    $$1 = $16; //@line 4037
    $$1382 = $17; //@line 4037
    $114 = $16; //@line 4037
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4041
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4043
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4047
     $60 = $59 + 4 | 0; //@line 4048
     $61 = HEAP32[$60 >> 2] | 0; //@line 4049
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4052
      if (!$63) {
       $$3 = 0; //@line 4055
       break;
      } else {
       $$1387 = $63; //@line 4058
       $$1390 = $59; //@line 4058
      }
     } else {
      $$1387 = $61; //@line 4061
      $$1390 = $60; //@line 4061
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4064
      $66 = HEAP32[$65 >> 2] | 0; //@line 4065
      if ($66 | 0) {
       $$1387 = $66; //@line 4068
       $$1390 = $65; //@line 4068
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4071
      $69 = HEAP32[$68 >> 2] | 0; //@line 4072
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4077
       $$1390 = $68; //@line 4077
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4082
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4085
      $$3 = $$1387; //@line 4086
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4091
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4094
     }
     $53 = $51 + 12 | 0; //@line 4097
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4101
     }
     $56 = $48 + 8 | 0; //@line 4104
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4108
      HEAP32[$56 >> 2] = $51; //@line 4109
      $$3 = $48; //@line 4110
      break;
     } else {
      _abort(); //@line 4113
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4120
    $$1382 = $17; //@line 4120
    $114 = $16; //@line 4120
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4123
    $75 = 4364 + ($74 << 2) | 0; //@line 4124
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4129
      if (!$$3) {
       HEAP32[1016] = HEAP32[1016] & ~(1 << $74); //@line 4136
       $$1 = $16; //@line 4137
       $$1382 = $17; //@line 4137
       $114 = $16; //@line 4137
       break L10;
      }
     } else {
      if ((HEAP32[1019] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4144
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4152
       if (!$$3) {
        $$1 = $16; //@line 4155
        $$1382 = $17; //@line 4155
        $114 = $16; //@line 4155
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1019] | 0; //@line 4163
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4166
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4170
    $92 = $16 + 16 | 0; //@line 4171
    $93 = HEAP32[$92 >> 2] | 0; //@line 4172
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4178
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4182
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4184
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4190
    if (!$99) {
     $$1 = $16; //@line 4193
     $$1382 = $17; //@line 4193
     $114 = $16; //@line 4193
    } else {
     if ((HEAP32[1019] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4198
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4202
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4204
      $$1 = $16; //@line 4205
      $$1382 = $17; //@line 4205
      $114 = $16; //@line 4205
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4211
   $$1382 = $9; //@line 4211
   $114 = $2; //@line 4211
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4216
 }
 $115 = $10 + 4 | 0; //@line 4219
 $116 = HEAP32[$115 >> 2] | 0; //@line 4220
 if (!($116 & 1)) {
  _abort(); //@line 4224
 }
 if (!($116 & 2)) {
  if ((HEAP32[1021] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1018] | 0) + $$1382 | 0; //@line 4234
   HEAP32[1018] = $124; //@line 4235
   HEAP32[1021] = $$1; //@line 4236
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4239
   if (($$1 | 0) != (HEAP32[1020] | 0)) {
    return;
   }
   HEAP32[1020] = 0; //@line 4245
   HEAP32[1017] = 0; //@line 4246
   return;
  }
  if ((HEAP32[1020] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1017] | 0) + $$1382 | 0; //@line 4253
   HEAP32[1017] = $132; //@line 4254
   HEAP32[1020] = $114; //@line 4255
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4258
   HEAP32[$114 + $132 >> 2] = $132; //@line 4260
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4264
  $138 = $116 >>> 3; //@line 4265
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4270
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4272
    $145 = 4100 + ($138 << 1 << 2) | 0; //@line 4274
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1019] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4280
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4287
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1015] = HEAP32[1015] & ~(1 << $138); //@line 4297
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4303
    } else {
     if ((HEAP32[1019] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4308
     }
     $160 = $143 + 8 | 0; //@line 4311
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4315
     } else {
      _abort(); //@line 4317
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4322
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4323
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4326
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4328
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4332
      $180 = $179 + 4 | 0; //@line 4333
      $181 = HEAP32[$180 >> 2] | 0; //@line 4334
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4337
       if (!$183) {
        $$3400 = 0; //@line 4340
        break;
       } else {
        $$1398 = $183; //@line 4343
        $$1402 = $179; //@line 4343
       }
      } else {
       $$1398 = $181; //@line 4346
       $$1402 = $180; //@line 4346
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4349
       $186 = HEAP32[$185 >> 2] | 0; //@line 4350
       if ($186 | 0) {
        $$1398 = $186; //@line 4353
        $$1402 = $185; //@line 4353
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4356
       $189 = HEAP32[$188 >> 2] | 0; //@line 4357
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4362
        $$1402 = $188; //@line 4362
       }
      }
      if ((HEAP32[1019] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4368
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4371
       $$3400 = $$1398; //@line 4372
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4377
      if ((HEAP32[1019] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4381
      }
      $173 = $170 + 12 | 0; //@line 4384
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4388
      }
      $176 = $167 + 8 | 0; //@line 4391
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4395
       HEAP32[$176 >> 2] = $170; //@line 4396
       $$3400 = $167; //@line 4397
       break;
      } else {
       _abort(); //@line 4400
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4408
     $196 = 4364 + ($195 << 2) | 0; //@line 4409
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4414
       if (!$$3400) {
        HEAP32[1016] = HEAP32[1016] & ~(1 << $195); //@line 4421
        break L108;
       }
      } else {
       if ((HEAP32[1019] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4428
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4436
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1019] | 0; //@line 4446
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4449
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4453
     $213 = $10 + 16 | 0; //@line 4454
     $214 = HEAP32[$213 >> 2] | 0; //@line 4455
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4461
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4465
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4467
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4473
     if ($220 | 0) {
      if ((HEAP32[1019] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4479
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4483
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4485
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4494
  HEAP32[$114 + $137 >> 2] = $137; //@line 4496
  if (($$1 | 0) == (HEAP32[1020] | 0)) {
   HEAP32[1017] = $137; //@line 4500
   return;
  } else {
   $$2 = $137; //@line 4503
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4507
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4510
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4512
  $$2 = $$1382; //@line 4513
 }
 $235 = $$2 >>> 3; //@line 4515
 if ($$2 >>> 0 < 256) {
  $238 = 4100 + ($235 << 1 << 2) | 0; //@line 4519
  $239 = HEAP32[1015] | 0; //@line 4520
  $240 = 1 << $235; //@line 4521
  if (!($239 & $240)) {
   HEAP32[1015] = $239 | $240; //@line 4526
   $$0403 = $238; //@line 4528
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4528
  } else {
   $244 = $238 + 8 | 0; //@line 4530
   $245 = HEAP32[$244 >> 2] | 0; //@line 4531
   if ((HEAP32[1019] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4535
   } else {
    $$0403 = $245; //@line 4538
    $$pre$phiZ2D = $244; //@line 4538
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4541
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4543
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4545
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4547
  return;
 }
 $251 = $$2 >>> 8; //@line 4550
 if (!$251) {
  $$0396 = 0; //@line 4553
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4557
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4561
   $257 = $251 << $256; //@line 4562
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4565
   $262 = $257 << $260; //@line 4567
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4570
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4575
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4581
  }
 }
 $276 = 4364 + ($$0396 << 2) | 0; //@line 4584
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4586
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4589
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4590
 $280 = HEAP32[1016] | 0; //@line 4591
 $281 = 1 << $$0396; //@line 4592
 do {
  if (!($280 & $281)) {
   HEAP32[1016] = $280 | $281; //@line 4598
   HEAP32[$276 >> 2] = $$1; //@line 4599
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4601
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4603
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4605
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4613
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4613
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4620
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4624
    $301 = HEAP32[$299 >> 2] | 0; //@line 4626
    if (!$301) {
     label = 121; //@line 4629
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4632
     $$0384 = $301; //@line 4632
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1019] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4639
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4642
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4644
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4646
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4648
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4653
    $309 = HEAP32[$308 >> 2] | 0; //@line 4654
    $310 = HEAP32[1019] | 0; //@line 4655
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4661
     HEAP32[$308 >> 2] = $$1; //@line 4662
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4664
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4666
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4668
     break;
    } else {
     _abort(); //@line 4671
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1023] | 0) + -1 | 0; //@line 4678
 HEAP32[1023] = $319; //@line 4679
 if (!$319) {
  $$0212$in$i = 4516; //@line 4682
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4687
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4693
  }
 }
 HEAP32[1023] = -1; //@line 4696
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9036
 STACKTOP = STACKTOP + 1056 | 0; //@line 9037
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 9037
 $2 = sp + 1024 | 0; //@line 9038
 $3 = sp; //@line 9039
 HEAP32[$2 >> 2] = 0; //@line 9040
 HEAP32[$2 + 4 >> 2] = 0; //@line 9040
 HEAP32[$2 + 8 >> 2] = 0; //@line 9040
 HEAP32[$2 + 12 >> 2] = 0; //@line 9040
 HEAP32[$2 + 16 >> 2] = 0; //@line 9040
 HEAP32[$2 + 20 >> 2] = 0; //@line 9040
 HEAP32[$2 + 24 >> 2] = 0; //@line 9040
 HEAP32[$2 + 28 >> 2] = 0; //@line 9040
 $4 = HEAP8[$1 >> 0] | 0; //@line 9041
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 9045
   $$0185$ph$lcssa327 = -1; //@line 9045
   $$0187219$ph325326 = 0; //@line 9045
   $$1176$ph$ph$lcssa208 = 1; //@line 9045
   $$1186$ph$lcssa = -1; //@line 9045
   label = 26; //@line 9046
  } else {
   $$0187263 = 0; //@line 9048
   $10 = $4; //@line 9048
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 9054
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 9062
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 9065
    $$0187263 = $$0187263 + 1 | 0; //@line 9066
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9069
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9071
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9079
   if ($23) {
    $$0183$ph260 = 0; //@line 9081
    $$0185$ph259 = -1; //@line 9081
    $130 = 1; //@line 9081
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9083
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9083
     $131 = $130; //@line 9083
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9085
      $132 = $131; //@line 9085
      L10 : while (1) {
       $$0179242 = 1; //@line 9087
       $25 = $132; //@line 9087
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9091
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9093
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9099
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9103
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9108
         $$0185$ph$lcssa = $$0185$ph259; //@line 9108
         break L6;
        } else {
         $25 = $27; //@line 9106
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9112
       $132 = $37 + 1 | 0; //@line 9113
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9118
        $$0185$ph$lcssa = $$0185$ph259; //@line 9118
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9116
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9123
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9127
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9132
       $$0185$ph$lcssa = $$0185$ph259; //@line 9132
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9130
       $$0183$ph197$ph253 = $25; //@line 9130
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9137
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9142
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9142
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9140
      $$0185$ph259 = $$0183$ph197248; //@line 9140
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9147
     $$1186$ph238 = -1; //@line 9147
     $133 = 1; //@line 9147
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9149
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9149
      $135 = $133; //@line 9149
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9151
       $134 = $135; //@line 9151
       L25 : while (1) {
        $$1180222 = 1; //@line 9153
        $52 = $134; //@line 9153
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9157
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9159
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9165
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 9169
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9174
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9174
          $$0187219$ph325326 = $$0187263; //@line 9174
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9174
          $$1186$ph$lcssa = $$1186$ph238; //@line 9174
          label = 26; //@line 9175
          break L1;
         } else {
          $52 = $45; //@line 9172
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 9179
        $134 = $56 + 1 | 0; //@line 9180
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9185
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9185
         $$0187219$ph325326 = $$0187263; //@line 9185
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9185
         $$1186$ph$lcssa = $$1186$ph238; //@line 9185
         label = 26; //@line 9186
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 9183
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 9191
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 9195
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9200
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9200
        $$0187219$ph325326 = $$0187263; //@line 9200
        $$1176$ph$ph$lcssa208 = $60; //@line 9200
        $$1186$ph$lcssa = $$1186$ph238; //@line 9200
        label = 26; //@line 9201
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 9198
        $$1184$ph193$ph232 = $52; //@line 9198
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 9206
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9211
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9211
       $$0187219$ph325326 = $$0187263; //@line 9211
       $$1176$ph$ph$lcssa208 = 1; //@line 9211
       $$1186$ph$lcssa = $$1184$ph193227; //@line 9211
       label = 26; //@line 9212
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 9209
       $$1186$ph238 = $$1184$ph193227; //@line 9209
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9217
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9217
     $$0187219$ph325326 = $$0187263; //@line 9217
     $$1176$ph$ph$lcssa208 = 1; //@line 9217
     $$1186$ph$lcssa = -1; //@line 9217
     label = 26; //@line 9218
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 9221
    $$0185$ph$lcssa327 = -1; //@line 9221
    $$0187219$ph325326 = $$0187263; //@line 9221
    $$1176$ph$ph$lcssa208 = 1; //@line 9221
    $$1186$ph$lcssa = -1; //@line 9221
    label = 26; //@line 9222
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 9230
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 9231
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 9232
   $70 = $$1186$$0185 + 1 | 0; //@line 9234
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 9239
    $$3178 = $$1176$$0175; //@line 9239
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 9242
    $$0168 = 0; //@line 9246
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 9246
   }
   $78 = $$0187219$ph325326 | 63; //@line 9248
   $79 = $$0187219$ph325326 + -1 | 0; //@line 9249
   $80 = ($$0168 | 0) != 0; //@line 9250
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 9251
   $$0166 = $0; //@line 9252
   $$0169 = 0; //@line 9252
   $$0170 = $0; //@line 9252
   while (1) {
    $83 = $$0166; //@line 9255
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 9260
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 9264
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 9271
        break L35;
       } else {
        $$3173 = $86; //@line 9274
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 9279
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 9283
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 9295
      $$2181$sink = $$0187219$ph325326; //@line 9295
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 9300
      if ($105 | 0) {
       $$0169$be = 0; //@line 9308
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 9308
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 9312
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 9314
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 9318
       } else {
        $$3182221 = $111; //@line 9320
        $$pr = $113; //@line 9320
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 9328
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 9330
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 9333
          break L54;
         } else {
          $$3182221 = $118; //@line 9336
         }
        }
        $$0169$be = 0; //@line 9340
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 9340
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 9347
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 9350
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 9359
        $$2181$sink = $$3178; //@line 9359
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 9366
    $$0169 = $$0169$be; //@line 9366
    $$0170 = $$3173; //@line 9366
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9370
 return $$3 | 0; //@line 9370
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 13075
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 13076
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 13077
 $d_sroa_0_0_extract_trunc = $b$0; //@line 13078
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 13079
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 13080
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 13082
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13085
    HEAP32[$rem + 4 >> 2] = 0; //@line 13086
   }
   $_0$1 = 0; //@line 13088
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13089
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13090
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 13093
    $_0$0 = 0; //@line 13094
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13095
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13097
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 13098
   $_0$1 = 0; //@line 13099
   $_0$0 = 0; //@line 13100
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13101
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 13104
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13109
     HEAP32[$rem + 4 >> 2] = 0; //@line 13110
    }
    $_0$1 = 0; //@line 13112
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13113
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13114
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 13118
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 13119
    }
    $_0$1 = 0; //@line 13121
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 13122
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13123
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 13125
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 13128
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 13129
    }
    $_0$1 = 0; //@line 13131
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 13132
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13133
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13136
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 13138
    $58 = 31 - $51 | 0; //@line 13139
    $sr_1_ph = $57; //@line 13140
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 13141
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 13142
    $q_sroa_0_1_ph = 0; //@line 13143
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 13144
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 13148
    $_0$0 = 0; //@line 13149
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13150
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13152
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13153
   $_0$1 = 0; //@line 13154
   $_0$0 = 0; //@line 13155
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13156
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13160
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 13162
     $126 = 31 - $119 | 0; //@line 13163
     $130 = $119 - 31 >> 31; //@line 13164
     $sr_1_ph = $125; //@line 13165
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 13166
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 13167
     $q_sroa_0_1_ph = 0; //@line 13168
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 13169
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 13173
     $_0$0 = 0; //@line 13174
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13175
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 13177
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13178
    $_0$1 = 0; //@line 13179
    $_0$0 = 0; //@line 13180
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13181
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 13183
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13186
    $89 = 64 - $88 | 0; //@line 13187
    $91 = 32 - $88 | 0; //@line 13188
    $92 = $91 >> 31; //@line 13189
    $95 = $88 - 32 | 0; //@line 13190
    $105 = $95 >> 31; //@line 13191
    $sr_1_ph = $88; //@line 13192
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 13193
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 13194
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 13195
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 13196
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 13200
    HEAP32[$rem + 4 >> 2] = 0; //@line 13201
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13204
    $_0$0 = $a$0 | 0 | 0; //@line 13205
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13206
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 13208
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 13209
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 13210
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13211
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 13216
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 13217
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 13218
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 13219
  $carry_0_lcssa$1 = 0; //@line 13220
  $carry_0_lcssa$0 = 0; //@line 13221
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 13223
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 13224
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 13225
  $137$1 = tempRet0; //@line 13226
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 13227
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 13228
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 13229
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 13230
  $sr_1202 = $sr_1_ph; //@line 13231
  $carry_0203 = 0; //@line 13232
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 13234
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 13235
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 13236
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 13237
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 13238
   $150$1 = tempRet0; //@line 13239
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 13240
   $carry_0203 = $151$0 & 1; //@line 13241
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 13243
   $r_sroa_1_1200 = tempRet0; //@line 13244
   $sr_1202 = $sr_1202 - 1 | 0; //@line 13245
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 13257
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 13258
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 13259
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 13260
  $carry_0_lcssa$1 = 0; //@line 13261
  $carry_0_lcssa$0 = $carry_0203; //@line 13262
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 13264
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 13265
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 13268
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 13269
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 13271
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 13272
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13273
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 884
 STACKTOP = STACKTOP + 32 | 0; //@line 885
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 885
 $0 = sp; //@line 886
 _gpio_init_out($0, 50); //@line 887
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 890
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 891
  _wait_ms(150); //@line 892
  if (___async) {
   label = 3; //@line 895
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 898
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 900
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 901
  _wait_ms(150); //@line 902
  if (___async) {
   label = 5; //@line 905
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 908
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 910
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 911
  _wait_ms(150); //@line 912
  if (___async) {
   label = 7; //@line 915
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 918
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 920
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 921
  _wait_ms(150); //@line 922
  if (___async) {
   label = 9; //@line 925
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 928
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 930
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 931
  _wait_ms(150); //@line 932
  if (___async) {
   label = 11; //@line 935
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 938
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 940
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 941
  _wait_ms(150); //@line 942
  if (___async) {
   label = 13; //@line 945
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 948
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 950
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 951
  _wait_ms(150); //@line 952
  if (___async) {
   label = 15; //@line 955
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 958
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 960
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 961
  _wait_ms(150); //@line 962
  if (___async) {
   label = 17; //@line 965
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 968
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 970
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 971
  _wait_ms(400); //@line 972
  if (___async) {
   label = 19; //@line 975
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 978
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 980
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 981
  _wait_ms(400); //@line 982
  if (___async) {
   label = 21; //@line 985
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 988
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 990
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 991
  _wait_ms(400); //@line 992
  if (___async) {
   label = 23; //@line 995
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 998
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1000
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1001
  _wait_ms(400); //@line 1002
  if (___async) {
   label = 25; //@line 1005
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1008
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1010
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1011
  _wait_ms(400); //@line 1012
  if (___async) {
   label = 27; //@line 1015
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1018
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1020
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1021
  _wait_ms(400); //@line 1022
  if (___async) {
   label = 29; //@line 1025
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1028
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1030
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1031
  _wait_ms(400); //@line 1032
  if (___async) {
   label = 31; //@line 1035
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1038
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1040
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1041
  _wait_ms(400); //@line 1042
  if (___async) {
   label = 33; //@line 1045
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1048
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 22; //@line 1052
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1054
   sp = STACKTOP; //@line 1055
   STACKTOP = sp; //@line 1056
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 23; //@line 1060
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1062
   sp = STACKTOP; //@line 1063
   STACKTOP = sp; //@line 1064
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 24; //@line 1068
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1070
   sp = STACKTOP; //@line 1071
   STACKTOP = sp; //@line 1072
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 25; //@line 1076
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1078
   sp = STACKTOP; //@line 1079
   STACKTOP = sp; //@line 1080
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 26; //@line 1084
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1086
   sp = STACKTOP; //@line 1087
   STACKTOP = sp; //@line 1088
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 27; //@line 1092
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1094
   sp = STACKTOP; //@line 1095
   STACKTOP = sp; //@line 1096
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 28; //@line 1100
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1102
   sp = STACKTOP; //@line 1103
   STACKTOP = sp; //@line 1104
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 29; //@line 1108
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1110
   sp = STACKTOP; //@line 1111
   STACKTOP = sp; //@line 1112
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 30; //@line 1116
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1118
   sp = STACKTOP; //@line 1119
   STACKTOP = sp; //@line 1120
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 31; //@line 1124
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1126
   sp = STACKTOP; //@line 1127
   STACKTOP = sp; //@line 1128
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 32; //@line 1132
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1134
   sp = STACKTOP; //@line 1135
   STACKTOP = sp; //@line 1136
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 33; //@line 1140
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1142
   sp = STACKTOP; //@line 1143
   STACKTOP = sp; //@line 1144
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 34; //@line 1148
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1150
   sp = STACKTOP; //@line 1151
   STACKTOP = sp; //@line 1152
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 35; //@line 1156
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1158
   sp = STACKTOP; //@line 1159
   STACKTOP = sp; //@line 1160
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 36; //@line 1164
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1166
   sp = STACKTOP; //@line 1167
   STACKTOP = sp; //@line 1168
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 37; //@line 1172
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1174
   sp = STACKTOP; //@line 1175
   STACKTOP = sp; //@line 1176
   return;
  }
 }
}
function _mbed_vtracef__async_cb_23($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $26 = 0, $30 = 0, $34 = 0, $38 = 0, $4 = 0, $40 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11889
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11891
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11893
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11895
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11901
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11903
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11905
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11907
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11909
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11911
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11915
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11919
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11923
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11927
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11929
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 11934
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 11936
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 11938
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 11941
 $50 = _snprintf($4, $6, 1025, $2) | 0; //@line 11942
 $$10 = ($50 | 0) >= ($6 | 0) ? 0 : $50; //@line 11944
 $53 = $4 + $$10 | 0; //@line 11946
 $54 = $6 - $$10 | 0; //@line 11947
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 11951
   $$3169 = $53; //@line 11951
   label = 4; //@line 11952
  }
 } else {
  $$3147168 = $6; //@line 11955
  $$3169 = $4; //@line 11955
  label = 4; //@line 11956
 }
 if ((label | 0) == 4) {
  $56 = $38 + -2 | 0; //@line 11959
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$40 >> 2] = $22; //@line 11965
    $$5156 = _snprintf($$3169, $$3147168, 1028, $40) | 0; //@line 11967
    break;
   }
  case 1:
   {
    HEAP32[$30 >> 2] = $22; //@line 11971
    $$5156 = _snprintf($$3169, $$3147168, 1043, $30) | 0; //@line 11973
    break;
   }
  case 3:
   {
    HEAP32[$34 >> 2] = $22; //@line 11977
    $$5156 = _snprintf($$3169, $$3147168, 1058, $34) | 0; //@line 11979
    break;
   }
  case 7:
   {
    HEAP32[$20 >> 2] = $22; //@line 11983
    $$5156 = _snprintf($$3169, $$3147168, 1073, $20) | 0; //@line 11985
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1088, $26) | 0; //@line 11990
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 11994
  $67 = $$3169 + $$5156$ | 0; //@line 11996
  $68 = $$3147168 - $$5156$ | 0; //@line 11997
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 12001
   $70 = _vsnprintf($67, $68, $16, $18) | 0; //@line 12002
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12005
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12006
    HEAP32[$71 >> 2] = $68; //@line 12007
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12008
    HEAP32[$72 >> 2] = $67; //@line 12009
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12010
    HEAP32[$73 >> 2] = $12; //@line 12011
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12012
    HEAP32[$74 >> 2] = $14; //@line 12013
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12014
    $$expand_i1_val = $44 & 1; //@line 12015
    HEAP8[$75 >> 0] = $$expand_i1_val; //@line 12016
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12017
    HEAP32[$76 >> 2] = $46; //@line 12018
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12019
    HEAP32[$77 >> 2] = $48; //@line 12020
    sp = STACKTOP; //@line 12021
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 12025
   ___async_unwind = 0; //@line 12026
   HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12027
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12028
   HEAP32[$71 >> 2] = $68; //@line 12029
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12030
   HEAP32[$72 >> 2] = $67; //@line 12031
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12032
   HEAP32[$73 >> 2] = $12; //@line 12033
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12034
   HEAP32[$74 >> 2] = $14; //@line 12035
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12036
   $$expand_i1_val = $44 & 1; //@line 12037
   HEAP8[$75 >> 0] = $$expand_i1_val; //@line 12038
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12039
   HEAP32[$76 >> 2] = $46; //@line 12040
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12041
   HEAP32[$77 >> 2] = $48; //@line 12042
   sp = STACKTOP; //@line 12043
   return;
  }
 }
 $79 = HEAP32[35] | 0; //@line 12047
 $80 = HEAP32[28] | 0; //@line 12048
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12049
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 12050
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12053
  sp = STACKTOP; //@line 12054
  return;
 }
 ___async_unwind = 0; //@line 12057
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12058
 sp = STACKTOP; //@line 12059
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7137
      $10 = HEAP32[$9 >> 2] | 0; //@line 7138
      HEAP32[$2 >> 2] = $9 + 4; //@line 7140
      HEAP32[$0 >> 2] = $10; //@line 7141
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7157
      $17 = HEAP32[$16 >> 2] | 0; //@line 7158
      HEAP32[$2 >> 2] = $16 + 4; //@line 7160
      $20 = $0; //@line 7163
      HEAP32[$20 >> 2] = $17; //@line 7165
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7168
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7184
      $30 = HEAP32[$29 >> 2] | 0; //@line 7185
      HEAP32[$2 >> 2] = $29 + 4; //@line 7187
      $31 = $0; //@line 7188
      HEAP32[$31 >> 2] = $30; //@line 7190
      HEAP32[$31 + 4 >> 2] = 0; //@line 7193
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7209
      $41 = $40; //@line 7210
      $43 = HEAP32[$41 >> 2] | 0; //@line 7212
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7215
      HEAP32[$2 >> 2] = $40 + 8; //@line 7217
      $47 = $0; //@line 7218
      HEAP32[$47 >> 2] = $43; //@line 7220
      HEAP32[$47 + 4 >> 2] = $46; //@line 7223
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7239
      $57 = HEAP32[$56 >> 2] | 0; //@line 7240
      HEAP32[$2 >> 2] = $56 + 4; //@line 7242
      $59 = ($57 & 65535) << 16 >> 16; //@line 7244
      $62 = $0; //@line 7247
      HEAP32[$62 >> 2] = $59; //@line 7249
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7252
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7268
      $72 = HEAP32[$71 >> 2] | 0; //@line 7269
      HEAP32[$2 >> 2] = $71 + 4; //@line 7271
      $73 = $0; //@line 7273
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7275
      HEAP32[$73 + 4 >> 2] = 0; //@line 7278
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7294
      $83 = HEAP32[$82 >> 2] | 0; //@line 7295
      HEAP32[$2 >> 2] = $82 + 4; //@line 7297
      $85 = ($83 & 255) << 24 >> 24; //@line 7299
      $88 = $0; //@line 7302
      HEAP32[$88 >> 2] = $85; //@line 7304
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7307
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7323
      $98 = HEAP32[$97 >> 2] | 0; //@line 7324
      HEAP32[$2 >> 2] = $97 + 4; //@line 7326
      $99 = $0; //@line 7328
      HEAP32[$99 >> 2] = $98 & 255; //@line 7330
      HEAP32[$99 + 4 >> 2] = 0; //@line 7333
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7349
      $109 = +HEAPF64[$108 >> 3]; //@line 7350
      HEAP32[$2 >> 2] = $108 + 8; //@line 7352
      HEAPF64[$0 >> 3] = $109; //@line 7353
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7369
      $116 = +HEAPF64[$115 >> 3]; //@line 7370
      HEAP32[$2 >> 2] = $115 + 8; //@line 7372
      HEAPF64[$0 >> 3] = $116; //@line 7373
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
 sp = STACKTOP; //@line 6037
 STACKTOP = STACKTOP + 224 | 0; //@line 6038
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6038
 $3 = sp + 120 | 0; //@line 6039
 $4 = sp + 80 | 0; //@line 6040
 $5 = sp; //@line 6041
 $6 = sp + 136 | 0; //@line 6042
 dest = $4; //@line 6043
 stop = dest + 40 | 0; //@line 6043
 do {
  HEAP32[dest >> 2] = 0; //@line 6043
  dest = dest + 4 | 0; //@line 6043
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6045
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6049
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6056
  } else {
   $43 = 0; //@line 6058
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6060
  $14 = $13 & 32; //@line 6061
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6067
  }
  $19 = $0 + 48 | 0; //@line 6069
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6074
    $24 = HEAP32[$23 >> 2] | 0; //@line 6075
    HEAP32[$23 >> 2] = $6; //@line 6076
    $25 = $0 + 28 | 0; //@line 6077
    HEAP32[$25 >> 2] = $6; //@line 6078
    $26 = $0 + 20 | 0; //@line 6079
    HEAP32[$26 >> 2] = $6; //@line 6080
    HEAP32[$19 >> 2] = 80; //@line 6081
    $28 = $0 + 16 | 0; //@line 6083
    HEAP32[$28 >> 2] = $6 + 80; //@line 6084
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6085
    if (!$24) {
     $$1 = $29; //@line 6088
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6091
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6092
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6093
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 58; //@line 6096
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6098
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6100
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6102
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6104
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6106
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6108
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6110
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6112
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6114
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6116
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6118
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6120
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6122
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6124
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6126
      sp = STACKTOP; //@line 6127
      STACKTOP = sp; //@line 6128
      return 0; //@line 6128
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6130
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6133
      HEAP32[$23 >> 2] = $24; //@line 6134
      HEAP32[$19 >> 2] = 0; //@line 6135
      HEAP32[$28 >> 2] = 0; //@line 6136
      HEAP32[$25 >> 2] = 0; //@line 6137
      HEAP32[$26 >> 2] = 0; //@line 6138
      $$1 = $$; //@line 6139
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6145
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6148
  HEAP32[$0 >> 2] = $51 | $14; //@line 6153
  if ($43 | 0) {
   ___unlockfile($0); //@line 6156
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6158
 }
 STACKTOP = sp; //@line 6160
 return $$0 | 0; //@line 6160
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9976
 STACKTOP = STACKTOP + 64 | 0; //@line 9977
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9977
 $4 = sp; //@line 9978
 $5 = HEAP32[$0 >> 2] | 0; //@line 9979
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 9982
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 9984
 HEAP32[$4 >> 2] = $2; //@line 9985
 HEAP32[$4 + 4 >> 2] = $0; //@line 9987
 HEAP32[$4 + 8 >> 2] = $1; //@line 9989
 HEAP32[$4 + 12 >> 2] = $3; //@line 9991
 $14 = $4 + 16 | 0; //@line 9992
 $15 = $4 + 20 | 0; //@line 9993
 $16 = $4 + 24 | 0; //@line 9994
 $17 = $4 + 28 | 0; //@line 9995
 $18 = $4 + 32 | 0; //@line 9996
 $19 = $4 + 40 | 0; //@line 9997
 dest = $14; //@line 9998
 stop = dest + 36 | 0; //@line 9998
 do {
  HEAP32[dest >> 2] = 0; //@line 9998
  dest = dest + 4 | 0; //@line 9998
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 9998
 HEAP8[$14 + 38 >> 0] = 0; //@line 9998
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10003
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10006
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10007
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10008
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 65; //@line 10011
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10013
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10015
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10017
    sp = STACKTOP; //@line 10018
    STACKTOP = sp; //@line 10019
    return 0; //@line 10019
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10021
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10025
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10029
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10032
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10033
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10034
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 66; //@line 10037
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10039
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10041
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10043
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10045
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10047
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10049
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10051
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10053
    sp = STACKTOP; //@line 10054
    STACKTOP = sp; //@line 10055
    return 0; //@line 10055
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10057
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10071
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10079
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10095
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10100
  }
 } while (0);
 STACKTOP = sp; //@line 10103
 return $$0 | 0; //@line 10103
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 5909
 $7 = ($2 | 0) != 0; //@line 5913
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 5917
   $$03555 = $0; //@line 5918
   $$03654 = $2; //@line 5918
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 5923
     $$036$lcssa64 = $$03654; //@line 5923
     label = 6; //@line 5924
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 5927
    $12 = $$03654 + -1 | 0; //@line 5928
    $16 = ($12 | 0) != 0; //@line 5932
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 5935
     $$03654 = $12; //@line 5935
    } else {
     $$035$lcssa = $11; //@line 5937
     $$036$lcssa = $12; //@line 5937
     $$lcssa = $16; //@line 5937
     label = 5; //@line 5938
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 5943
   $$036$lcssa = $2; //@line 5943
   $$lcssa = $7; //@line 5943
   label = 5; //@line 5944
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 5949
   $$036$lcssa64 = $$036$lcssa; //@line 5949
   label = 6; //@line 5950
  } else {
   $$2 = $$035$lcssa; //@line 5952
   $$3 = 0; //@line 5952
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 5958
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 5961
    $$3 = $$036$lcssa64; //@line 5961
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 5963
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 5967
      $$13745 = $$036$lcssa64; //@line 5967
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 5970
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 5979
       $30 = $$13745 + -4 | 0; //@line 5980
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 5983
        $$13745 = $30; //@line 5983
       } else {
        $$0$lcssa = $29; //@line 5985
        $$137$lcssa = $30; //@line 5985
        label = 11; //@line 5986
        break L11;
       }
      }
      $$140 = $$046; //@line 5990
      $$23839 = $$13745; //@line 5990
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 5992
      $$137$lcssa = $$036$lcssa64; //@line 5992
      label = 11; //@line 5993
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 5999
      $$3 = 0; //@line 5999
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6002
      $$23839 = $$137$lcssa; //@line 6002
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6009
      $$3 = $$23839; //@line 6009
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6012
     $$23839 = $$23839 + -1 | 0; //@line 6013
     if (!$$23839) {
      $$2 = $35; //@line 6016
      $$3 = 0; //@line 6016
      break;
     } else {
      $$140 = $35; //@line 6019
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6027
}
function _mbed_vtracef__async_cb_28($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12219
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12221
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12225
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12227
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 12230
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12232
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12234
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12236
 $$13 = ($AsyncRetVal | 0) >= ($2 | 0) ? 0 : $AsyncRetVal; //@line 12238
 $18 = (HEAP32[$0 + 8 >> 2] | 0) + $$13 | 0; //@line 12240
 $19 = $2 - $$13 | 0; //@line 12241
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[34] | 0; //@line 12245
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $10 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1103, $12) | 0; //@line 12257
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 12260
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 12261
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 12264
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 12265
    HEAP32[$24 >> 2] = $6; //@line 12266
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 12267
    HEAP32[$25 >> 2] = $18; //@line 12268
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 12269
    HEAP32[$26 >> 2] = $19; //@line 12270
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 12271
    HEAP32[$27 >> 2] = $8; //@line 12272
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 12273
    $$expand_i1_val = $10 & 1; //@line 12274
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 12275
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 12276
    HEAP32[$29 >> 2] = $12; //@line 12277
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 12278
    HEAP32[$30 >> 2] = $14; //@line 12279
    sp = STACKTOP; //@line 12280
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 12284
   ___async_unwind = 0; //@line 12285
   HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 12286
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 12287
   HEAP32[$24 >> 2] = $6; //@line 12288
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 12289
   HEAP32[$25 >> 2] = $18; //@line 12290
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 12291
   HEAP32[$26 >> 2] = $19; //@line 12292
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 12293
   HEAP32[$27 >> 2] = $8; //@line 12294
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 12295
   $$expand_i1_val = $10 & 1; //@line 12296
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 12297
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 12298
   HEAP32[$29 >> 2] = $12; //@line 12299
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 12300
   HEAP32[$30 >> 2] = $14; //@line 12301
   sp = STACKTOP; //@line 12302
   return;
  }
 } while (0);
 $34 = HEAP32[35] | 0; //@line 12306
 $35 = HEAP32[28] | 0; //@line 12307
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12308
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 12309
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12312
  sp = STACKTOP; //@line 12313
  return;
 }
 ___async_unwind = 0; //@line 12316
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12317
 sp = STACKTOP; //@line 12318
 return;
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5680
 do {
  if (!$0) {
   do {
    if (!(HEAP32[72] | 0)) {
     $34 = 0; //@line 5688
    } else {
     $12 = HEAP32[72] | 0; //@line 5690
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5691
     $13 = _fflush($12) | 0; //@line 5692
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 54; //@line 5695
      sp = STACKTOP; //@line 5696
      return 0; //@line 5697
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5699
      $34 = $13; //@line 5700
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5706
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5710
    } else {
     $$02327 = $$02325; //@line 5712
     $$02426 = $34; //@line 5712
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5719
      } else {
       $28 = 0; //@line 5721
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5729
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5730
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5735
       $$1 = $25 | $$02426; //@line 5737
      } else {
       $$1 = $$02426; //@line 5739
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5743
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5746
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5749
       break L9;
      } else {
       $$02327 = $$023; //@line 5752
       $$02426 = $$1; //@line 5752
      }
     }
     HEAP32[$AsyncCtx >> 2] = 55; //@line 5755
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5757
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5759
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5761
     sp = STACKTOP; //@line 5762
     return 0; //@line 5763
    }
   } while (0);
   ___ofl_unlock(); //@line 5766
   $$0 = $$024$lcssa; //@line 5767
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5773
    $5 = ___fflush_unlocked($0) | 0; //@line 5774
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 52; //@line 5777
     sp = STACKTOP; //@line 5778
     return 0; //@line 5779
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5781
     $$0 = $5; //@line 5782
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5787
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5788
   $7 = ___fflush_unlocked($0) | 0; //@line 5789
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 53; //@line 5792
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 5795
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5797
    sp = STACKTOP; //@line 5798
    return 0; //@line 5799
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5801
   if ($phitmp) {
    $$0 = $7; //@line 5803
   } else {
    ___unlockfile($0); //@line 5805
    $$0 = $7; //@line 5806
   }
  }
 } while (0);
 return $$0 | 0; //@line 5810
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10158
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10164
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10170
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10173
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10174
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10175
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 69; //@line 10178
     sp = STACKTOP; //@line 10179
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10182
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10190
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10195
     $19 = $1 + 44 | 0; //@line 10196
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10202
     HEAP8[$22 >> 0] = 0; //@line 10203
     $23 = $1 + 53 | 0; //@line 10204
     HEAP8[$23 >> 0] = 0; //@line 10205
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10207
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10210
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10211
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10212
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 68; //@line 10215
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10217
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10219
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10221
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10223
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10225
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10227
      sp = STACKTOP; //@line 10228
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10231
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10235
      label = 13; //@line 10236
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10241
       label = 13; //@line 10242
      } else {
       $$037$off039 = 3; //@line 10244
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10248
      $39 = $1 + 40 | 0; //@line 10249
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10252
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10262
        $$037$off039 = $$037$off038; //@line 10263
       } else {
        $$037$off039 = $$037$off038; //@line 10265
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10268
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10271
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10278
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_29($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12328
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12330
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12332
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 12335
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12337
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12339
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12341
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12343
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12345
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12347
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12349
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12351
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12353
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12355
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12357
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12359
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12361
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12363
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12365
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12367
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 12369
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 12371
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 12373
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 12375
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 12377
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 12379
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 12385
 $56 = HEAP32[33] | 0; //@line 12386
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 12387
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 12388
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 12392
  ___async_unwind = 0; //@line 12393
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 15; //@line 12395
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $12; //@line 12397
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $14; //@line 12399
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $16; //@line 12401
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $18; //@line 12403
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $20; //@line 12405
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $2; //@line 12407
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $4; //@line 12409
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $22; //@line 12411
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $24; //@line 12413
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $26; //@line 12415
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $28; //@line 12417
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 12419
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $32; //@line 12421
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $34; //@line 12423
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $36; //@line 12425
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $38; //@line 12427
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $40; //@line 12429
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $42; //@line 12431
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $44; //@line 12433
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $46; //@line 12435
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $48; //@line 12437
 HEAP8[$ReallocAsyncCtx5 + 88 >> 0] = $6 & 1; //@line 12440
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $8; //@line 12442
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $10; //@line 12444
 sp = STACKTOP; //@line 12445
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10536
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10538
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10540
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10542
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1010] | 0)) {
  _serial_init(4044, 2, 3); //@line 10550
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 10552
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10558
  _serial_putc(4044, $9 << 24 >> 24); //@line 10559
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 10562
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 10563
   HEAP32[$18 >> 2] = 0; //@line 10564
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 10565
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 10566
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 10567
   HEAP32[$20 >> 2] = $2; //@line 10568
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 10569
   HEAP8[$21 >> 0] = $9; //@line 10570
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 10571
   HEAP32[$22 >> 2] = $4; //@line 10572
   sp = STACKTOP; //@line 10573
   return;
  }
  ___async_unwind = 0; //@line 10576
  HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 10577
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 10578
  HEAP32[$18 >> 2] = 0; //@line 10579
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 10580
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 10581
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 10582
  HEAP32[$20 >> 2] = $2; //@line 10583
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 10584
  HEAP8[$21 >> 0] = $9; //@line 10585
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 10586
  HEAP32[$22 >> 2] = $4; //@line 10587
  sp = STACKTOP; //@line 10588
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 10591
  _serial_putc(4044, 13); //@line 10592
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 10595
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 10596
   HEAP8[$12 >> 0] = $9; //@line 10597
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 10598
   HEAP32[$13 >> 2] = 0; //@line 10599
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 10600
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 10601
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 10602
   HEAP32[$15 >> 2] = $2; //@line 10603
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 10604
   HEAP32[$16 >> 2] = $4; //@line 10605
   sp = STACKTOP; //@line 10606
   return;
  }
  ___async_unwind = 0; //@line 10609
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 10610
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 10611
  HEAP8[$12 >> 0] = $9; //@line 10612
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 10613
  HEAP32[$13 >> 2] = 0; //@line 10614
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 10615
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 10616
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 10617
  HEAP32[$15 >> 2] = $2; //@line 10618
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 10619
  HEAP32[$16 >> 2] = $4; //@line 10620
  sp = STACKTOP; //@line 10621
  return;
 }
}
function _mbed_error_vfprintf__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10629
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10633
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10635
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10639
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 10640
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 10646
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10652
  _serial_putc(4044, $13 << 24 >> 24); //@line 10653
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 10656
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 10657
   HEAP32[$22 >> 2] = $12; //@line 10658
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 10659
   HEAP32[$23 >> 2] = $4; //@line 10660
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 10661
   HEAP32[$24 >> 2] = $6; //@line 10662
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 10663
   HEAP8[$25 >> 0] = $13; //@line 10664
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 10665
   HEAP32[$26 >> 2] = $10; //@line 10666
   sp = STACKTOP; //@line 10667
   return;
  }
  ___async_unwind = 0; //@line 10670
  HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 10671
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 10672
  HEAP32[$22 >> 2] = $12; //@line 10673
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 10674
  HEAP32[$23 >> 2] = $4; //@line 10675
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 10676
  HEAP32[$24 >> 2] = $6; //@line 10677
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 10678
  HEAP8[$25 >> 0] = $13; //@line 10679
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 10680
  HEAP32[$26 >> 2] = $10; //@line 10681
  sp = STACKTOP; //@line 10682
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 10685
  _serial_putc(4044, 13); //@line 10686
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 10689
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 10690
   HEAP8[$16 >> 0] = $13; //@line 10691
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 10692
   HEAP32[$17 >> 2] = $12; //@line 10693
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 10694
   HEAP32[$18 >> 2] = $4; //@line 10695
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 10696
   HEAP32[$19 >> 2] = $6; //@line 10697
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 10698
   HEAP32[$20 >> 2] = $10; //@line 10699
   sp = STACKTOP; //@line 10700
   return;
  }
  ___async_unwind = 0; //@line 10703
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 10704
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 10705
  HEAP8[$16 >> 0] = $13; //@line 10706
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 10707
  HEAP32[$17 >> 2] = $12; //@line 10708
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 10709
  HEAP32[$18 >> 2] = $4; //@line 10710
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 10711
  HEAP32[$19 >> 2] = $6; //@line 10712
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 10713
  HEAP32[$20 >> 2] = $10; //@line 10714
  sp = STACKTOP; //@line 10715
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4721
 STACKTOP = STACKTOP + 48 | 0; //@line 4722
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4722
 $vararg_buffer3 = sp + 16 | 0; //@line 4723
 $vararg_buffer = sp; //@line 4724
 $3 = sp + 32 | 0; //@line 4725
 $4 = $0 + 28 | 0; //@line 4726
 $5 = HEAP32[$4 >> 2] | 0; //@line 4727
 HEAP32[$3 >> 2] = $5; //@line 4728
 $7 = $0 + 20 | 0; //@line 4730
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4732
 HEAP32[$3 + 4 >> 2] = $9; //@line 4733
 HEAP32[$3 + 8 >> 2] = $1; //@line 4735
 HEAP32[$3 + 12 >> 2] = $2; //@line 4737
 $12 = $9 + $2 | 0; //@line 4738
 $13 = $0 + 60 | 0; //@line 4739
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4742
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4744
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4746
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4748
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4752
  } else {
   $$04756 = 2; //@line 4754
   $$04855 = $12; //@line 4754
   $$04954 = $3; //@line 4754
   $27 = $17; //@line 4754
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4760
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4762
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4763
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4765
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4767
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4769
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4772
    $44 = $$150 + 4 | 0; //@line 4773
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4776
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4779
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4781
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4783
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4785
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4788
     break L1;
    } else {
     $$04756 = $$1; //@line 4791
     $$04954 = $$150; //@line 4791
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4795
   HEAP32[$4 >> 2] = 0; //@line 4796
   HEAP32[$7 >> 2] = 0; //@line 4797
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4800
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4803
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4808
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4814
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4819
  $25 = $20; //@line 4820
  HEAP32[$4 >> 2] = $25; //@line 4821
  HEAP32[$7 >> 2] = $25; //@line 4822
  $$051 = $2; //@line 4823
 }
 STACKTOP = sp; //@line 4825
 return $$051 | 0; //@line 4825
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1208
 STACKTOP = STACKTOP + 128 | 0; //@line 1209
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1209
 $2 = sp; //@line 1210
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1211
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1212
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 1215
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1217
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1219
  sp = STACKTOP; //@line 1220
  STACKTOP = sp; //@line 1221
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1223
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1226
  return;
 }
 if (!(HEAP32[1010] | 0)) {
  _serial_init(4044, 2, 3); //@line 1231
  $$01213 = 0; //@line 1232
  $$014 = 0; //@line 1232
 } else {
  $$01213 = 0; //@line 1234
  $$014 = 0; //@line 1234
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1238
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1243
   _serial_putc(4044, 13); //@line 1244
   if (___async) {
    label = 8; //@line 1247
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1250
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1253
  _serial_putc(4044, $$01213 << 24 >> 24); //@line 1254
  if (___async) {
   label = 11; //@line 1257
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1260
  $24 = $$014 + 1 | 0; //@line 1261
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1264
   break;
  } else {
   $$014 = $24; //@line 1267
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 40; //@line 1271
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1273
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1275
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1277
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1279
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1281
  sp = STACKTOP; //@line 1282
  STACKTOP = sp; //@line 1283
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 41; //@line 1286
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1288
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1290
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1292
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1294
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1296
  sp = STACKTOP; //@line 1297
  STACKTOP = sp; //@line 1298
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1301
  return;
 }
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 13382
 }
 ret = dest | 0; //@line 13385
 dest_end = dest + num | 0; //@line 13386
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 13390
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13391
   dest = dest + 1 | 0; //@line 13392
   src = src + 1 | 0; //@line 13393
   num = num - 1 | 0; //@line 13394
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 13396
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 13397
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13399
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 13400
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 13401
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 13402
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 13403
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 13404
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 13405
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 13406
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 13407
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 13408
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 13409
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 13410
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 13411
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 13412
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 13413
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 13414
   dest = dest + 64 | 0; //@line 13415
   src = src + 64 | 0; //@line 13416
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13419
   dest = dest + 4 | 0; //@line 13420
   src = src + 4 | 0; //@line 13421
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 13425
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13427
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 13428
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 13429
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 13430
   dest = dest + 4 | 0; //@line 13431
   src = src + 4 | 0; //@line 13432
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13437
  dest = dest + 1 | 0; //@line 13438
  src = src + 1 | 0; //@line 13439
 }
 return ret | 0; //@line 13441
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9659
 STACKTOP = STACKTOP + 64 | 0; //@line 9660
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9660
 $3 = sp; //@line 9661
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9664
 } else {
  if (!$1) {
   $$2 = 0; //@line 9668
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9670
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 9671
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 63; //@line 9674
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9676
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9678
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9680
    sp = STACKTOP; //@line 9681
    STACKTOP = sp; //@line 9682
    return 0; //@line 9682
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9684
   if (!$6) {
    $$2 = 0; //@line 9687
   } else {
    dest = $3 + 4 | 0; //@line 9690
    stop = dest + 52 | 0; //@line 9690
    do {
     HEAP32[dest >> 2] = 0; //@line 9690
     dest = dest + 4 | 0; //@line 9690
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9691
    HEAP32[$3 + 8 >> 2] = $0; //@line 9693
    HEAP32[$3 + 12 >> 2] = -1; //@line 9695
    HEAP32[$3 + 48 >> 2] = 1; //@line 9697
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9700
    $18 = HEAP32[$2 >> 2] | 0; //@line 9701
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9702
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9703
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 64; //@line 9706
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9708
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9710
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9712
     sp = STACKTOP; //@line 9713
     STACKTOP = sp; //@line 9714
     return 0; //@line 9714
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9716
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 9723
     $$0 = 1; //@line 9724
    } else {
     $$0 = 0; //@line 9726
    }
    $$2 = $$0; //@line 9728
   }
  }
 }
 STACKTOP = sp; //@line 9732
 return $$2 | 0; //@line 9732
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 9442
 STACKTOP = STACKTOP + 128 | 0; //@line 9443
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 9443
 $4 = sp + 124 | 0; //@line 9444
 $5 = sp; //@line 9445
 dest = $5; //@line 9446
 src = 536; //@line 9446
 stop = dest + 124 | 0; //@line 9446
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9446
  dest = dest + 4 | 0; //@line 9446
  src = src + 4 | 0; //@line 9446
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 9452
   $$015 = 1; //@line 9452
   label = 4; //@line 9453
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9456
   $$0 = -1; //@line 9457
  }
 } else {
  $$014 = $0; //@line 9460
  $$015 = $1; //@line 9460
  label = 4; //@line 9461
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 9465
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 9467
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 9469
  $14 = $5 + 20 | 0; //@line 9470
  HEAP32[$14 >> 2] = $$014; //@line 9471
  HEAP32[$5 + 44 >> 2] = $$014; //@line 9473
  $16 = $$014 + $$$015 | 0; //@line 9474
  $17 = $5 + 16 | 0; //@line 9475
  HEAP32[$17 >> 2] = $16; //@line 9476
  HEAP32[$5 + 28 >> 2] = $16; //@line 9478
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 9479
  $19 = _vfprintf($5, $2, $3) | 0; //@line 9480
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 60; //@line 9483
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 9485
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 9487
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9489
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 9491
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 9493
   sp = STACKTOP; //@line 9494
   STACKTOP = sp; //@line 9495
   return 0; //@line 9495
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9497
  if (!$$$015) {
   $$0 = $19; //@line 9500
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 9502
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9507
   $$0 = $19; //@line 9508
  }
 }
 STACKTOP = sp; //@line 9511
 return $$0 | 0; //@line 9511
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 5431
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 5434
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 5437
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 5440
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 5446
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 5455
     $24 = $13 >>> 2; //@line 5456
     $$090 = 0; //@line 5457
     $$094 = $7; //@line 5457
     while (1) {
      $25 = $$094 >>> 1; //@line 5459
      $26 = $$090 + $25 | 0; //@line 5460
      $27 = $26 << 1; //@line 5461
      $28 = $27 + $23 | 0; //@line 5462
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 5465
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5469
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 5475
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 5483
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 5487
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 5493
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 5498
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 5501
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 5501
      }
     }
     $46 = $27 + $24 | 0; //@line 5504
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 5507
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5511
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 5523
     } else {
      $$4 = 0; //@line 5525
     }
    } else {
     $$4 = 0; //@line 5528
    }
   } else {
    $$4 = 0; //@line 5531
   }
  } else {
   $$4 = 0; //@line 5534
  }
 } while (0);
 return $$4 | 0; //@line 5537
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5096
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5101
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5106
  } else {
   $20 = $0 & 255; //@line 5108
   $21 = $0 & 255; //@line 5109
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5115
   } else {
    $26 = $1 + 20 | 0; //@line 5117
    $27 = HEAP32[$26 >> 2] | 0; //@line 5118
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5124
     HEAP8[$27 >> 0] = $20; //@line 5125
     $34 = $21; //@line 5126
    } else {
     label = 12; //@line 5128
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5133
     $32 = ___overflow($1, $0) | 0; //@line 5134
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 50; //@line 5137
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5139
      sp = STACKTOP; //@line 5140
      return 0; //@line 5141
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5143
      $34 = $32; //@line 5144
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5149
   $$0 = $34; //@line 5150
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5155
   $8 = $0 & 255; //@line 5156
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5162
    $14 = HEAP32[$13 >> 2] | 0; //@line 5163
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5169
     HEAP8[$14 >> 0] = $7; //@line 5170
     $$0 = $8; //@line 5171
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5175
   $19 = ___overflow($1, $0) | 0; //@line 5176
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 49; //@line 5179
    sp = STACKTOP; //@line 5180
    return 0; //@line 5181
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5183
    $$0 = $19; //@line 5184
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5189
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5816
 $1 = $0 + 20 | 0; //@line 5817
 $3 = $0 + 28 | 0; //@line 5819
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 5825
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5826
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 5827
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 56; //@line 5830
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5832
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 5834
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5836
    sp = STACKTOP; //@line 5837
    return 0; //@line 5838
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5840
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 5844
     break;
    } else {
     label = 5; //@line 5847
     break;
    }
   }
  } else {
   label = 5; //@line 5852
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 5856
  $14 = HEAP32[$13 >> 2] | 0; //@line 5857
  $15 = $0 + 8 | 0; //@line 5858
  $16 = HEAP32[$15 >> 2] | 0; //@line 5859
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5867
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 5868
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 5869
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 57; //@line 5872
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5874
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5876
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5878
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5880
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5882
     sp = STACKTOP; //@line 5883
     return 0; //@line 5884
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5886
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 5892
  HEAP32[$3 >> 2] = 0; //@line 5893
  HEAP32[$1 >> 2] = 0; //@line 5894
  HEAP32[$15 >> 2] = 0; //@line 5895
  HEAP32[$13 >> 2] = 0; //@line 5896
  $$0 = 0; //@line 5897
 }
 return $$0 | 0; //@line 5899
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 68
 STACKTOP = STACKTOP + 48 | 0; //@line 69
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 69
 $vararg_buffer12 = sp + 32 | 0; //@line 70
 $vararg_buffer8 = sp + 24 | 0; //@line 71
 $vararg_buffer4 = sp + 16 | 0; //@line 72
 $vararg_buffer = sp; //@line 73
 $6 = $4 & 255; //@line 74
 $7 = $5 & 255; //@line 75
 HEAP32[$vararg_buffer >> 2] = $2; //@line 76
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 78
 HEAP32[$vararg_buffer + 8 >> 2] = $6; //@line 80
 HEAP32[$vararg_buffer + 12 >> 2] = $7; //@line 82
 _mbed_tracef(16, 740, 768, $vararg_buffer); //@line 83
 _emscripten_asm_const_i(0) | 0; //@line 84
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 86
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 89
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 91
  _mbed_tracef(16, 740, 850, $vararg_buffer4); //@line 92
  STACKTOP = sp; //@line 93
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 96
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 99
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 101
  _mbed_tracef(16, 740, 897, $vararg_buffer8); //@line 102
  STACKTOP = sp; //@line 103
  return;
 }
 $16 = HEAP32[$0 + 692 >> 2] | 0; //@line 106
 if (($16 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 110
  HEAP8[$0 + 782 >> 0] = $2; //@line 113
  HEAP8[$0 + 781 >> 0] = -35; //@line 115
  HEAP8[$0 + 780 >> 0] = -5; //@line 117
  HEAP8[$0 + 783 >> 0] = 1; //@line 119
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(1) | 0; //@line 122
  STACKTOP = sp; //@line 123
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $16; //@line 125
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 127
  _mbed_tracef(16, 740, 944, $vararg_buffer12); //@line 128
  STACKTOP = sp; //@line 129
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 5580
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 5586
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 5592
   } else {
    $7 = $1 & 255; //@line 5594
    $$03039 = $0; //@line 5595
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 5597
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 5602
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 5605
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 5610
      break;
     } else {
      $$03039 = $13; //@line 5613
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 5617
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 5618
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 5626
     $25 = $18; //@line 5626
     while (1) {
      $24 = $25 ^ $17; //@line 5628
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 5635
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 5638
      $25 = HEAP32[$31 >> 2] | 0; //@line 5639
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 5648
       break;
      } else {
       $$02936 = $31; //@line 5646
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 5653
    }
   } while (0);
   $38 = $1 & 255; //@line 5656
   $$1 = $$029$lcssa; //@line 5657
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 5659
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 5665
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 5668
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 5673
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 5322
 $4 = HEAP32[$3 >> 2] | 0; //@line 5323
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 5330
   label = 5; //@line 5331
  } else {
   $$1 = 0; //@line 5333
  }
 } else {
  $12 = $4; //@line 5337
  label = 5; //@line 5338
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 5342
   $10 = HEAP32[$9 >> 2] | 0; //@line 5343
   $14 = $10; //@line 5346
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5351
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5359
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5363
       $$141 = $0; //@line 5363
       $$143 = $1; //@line 5363
       $31 = $14; //@line 5363
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5366
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5373
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5378
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5381
      break L5;
     }
     $$139 = $$038; //@line 5387
     $$141 = $0 + $$038 | 0; //@line 5387
     $$143 = $1 - $$038 | 0; //@line 5387
     $31 = HEAP32[$9 >> 2] | 0; //@line 5387
    } else {
     $$139 = 0; //@line 5389
     $$141 = $0; //@line 5389
     $$143 = $1; //@line 5389
     $31 = $14; //@line 5389
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5392
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5395
   $$1 = $$139 + $$143 | 0; //@line 5397
  }
 } while (0);
 return $$1 | 0; //@line 5400
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5208
 STACKTOP = STACKTOP + 16 | 0; //@line 5209
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5209
 $2 = sp; //@line 5210
 $3 = $1 & 255; //@line 5211
 HEAP8[$2 >> 0] = $3; //@line 5212
 $4 = $0 + 16 | 0; //@line 5213
 $5 = HEAP32[$4 >> 2] | 0; //@line 5214
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 5221
   label = 4; //@line 5222
  } else {
   $$0 = -1; //@line 5224
  }
 } else {
  $12 = $5; //@line 5227
  label = 4; //@line 5228
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 5232
   $10 = HEAP32[$9 >> 2] | 0; //@line 5233
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 5236
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 5243
     HEAP8[$10 >> 0] = $3; //@line 5244
     $$0 = $13; //@line 5245
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5250
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5251
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 5252
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 51; //@line 5255
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 5257
    sp = STACKTOP; //@line 5258
    STACKTOP = sp; //@line 5259
    return 0; //@line 5259
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 5261
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 5266
   } else {
    $$0 = -1; //@line 5268
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5272
 return $$0 | 0; //@line 5272
}
function _fflush__async_cb_38($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12962
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12964
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 12966
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 12970
  } else {
   $$02327 = $$02325; //@line 12972
   $$02426 = $AsyncRetVal; //@line 12972
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 12979
    } else {
     $16 = 0; //@line 12981
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 12993
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 12996
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 12999
     break L3;
    } else {
     $$02327 = $$023; //@line 13002
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13005
   $13 = ___fflush_unlocked($$02327) | 0; //@line 13006
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 13010
    ___async_unwind = 0; //@line 13011
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 13013
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 13015
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 13017
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 13019
   sp = STACKTOP; //@line 13020
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 13024
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 13026
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 13446
 value = value & 255; //@line 13448
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 13451
   ptr = ptr + 1 | 0; //@line 13452
  }
  aligned_end = end & -4 | 0; //@line 13455
  block_aligned_end = aligned_end - 64 | 0; //@line 13456
  value4 = value | value << 8 | value << 16 | value << 24; //@line 13457
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13460
   HEAP32[ptr + 4 >> 2] = value4; //@line 13461
   HEAP32[ptr + 8 >> 2] = value4; //@line 13462
   HEAP32[ptr + 12 >> 2] = value4; //@line 13463
   HEAP32[ptr + 16 >> 2] = value4; //@line 13464
   HEAP32[ptr + 20 >> 2] = value4; //@line 13465
   HEAP32[ptr + 24 >> 2] = value4; //@line 13466
   HEAP32[ptr + 28 >> 2] = value4; //@line 13467
   HEAP32[ptr + 32 >> 2] = value4; //@line 13468
   HEAP32[ptr + 36 >> 2] = value4; //@line 13469
   HEAP32[ptr + 40 >> 2] = value4; //@line 13470
   HEAP32[ptr + 44 >> 2] = value4; //@line 13471
   HEAP32[ptr + 48 >> 2] = value4; //@line 13472
   HEAP32[ptr + 52 >> 2] = value4; //@line 13473
   HEAP32[ptr + 56 >> 2] = value4; //@line 13474
   HEAP32[ptr + 60 >> 2] = value4; //@line 13475
   ptr = ptr + 64 | 0; //@line 13476
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13480
   ptr = ptr + 4 | 0; //@line 13481
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 13486
  ptr = ptr + 1 | 0; //@line 13487
 }
 return end - num | 0; //@line 13489
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12863
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12873
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12873
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12873
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 12877
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 12880
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 12883
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 12891
  } else {
   $20 = 0; //@line 12893
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 12903
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 12907
  HEAP32[___async_retval >> 2] = $$1; //@line 12909
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12912
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 12913
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 12917
  ___async_unwind = 0; //@line 12918
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 12920
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 12922
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 12924
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 12926
 sp = STACKTOP; //@line 12927
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12671
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12673
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12675
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12677
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 12682
  } else {
   $9 = $4 + 4 | 0; //@line 12684
   $10 = HEAP32[$9 >> 2] | 0; //@line 12685
   $11 = $4 + 8 | 0; //@line 12686
   $12 = HEAP32[$11 >> 2] | 0; //@line 12687
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 12691
    HEAP32[$6 >> 2] = 0; //@line 12692
    HEAP32[$2 >> 2] = 0; //@line 12693
    HEAP32[$11 >> 2] = 0; //@line 12694
    HEAP32[$9 >> 2] = 0; //@line 12695
    $$0 = 0; //@line 12696
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 12703
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12704
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 12705
   if (!___async) {
    ___async_unwind = 0; //@line 12708
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 57; //@line 12710
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 12712
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 12714
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 12716
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 12718
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 12720
   sp = STACKTOP; //@line 12721
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12726
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_1($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10416
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10418
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10420
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10422
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10424
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 10429
  return;
 }
 dest = $2 + 4 | 0; //@line 10433
 stop = dest + 52 | 0; //@line 10433
 do {
  HEAP32[dest >> 2] = 0; //@line 10433
  dest = dest + 4 | 0; //@line 10433
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 10434
 HEAP32[$2 + 8 >> 2] = $4; //@line 10436
 HEAP32[$2 + 12 >> 2] = -1; //@line 10438
 HEAP32[$2 + 48 >> 2] = 1; //@line 10440
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 10443
 $16 = HEAP32[$6 >> 2] | 0; //@line 10444
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 10445
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 10446
 if (!___async) {
  ___async_unwind = 0; //@line 10449
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 64; //@line 10451
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 10453
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 10455
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 10457
 sp = STACKTOP; //@line 10458
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 8588
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 8593
    $$0 = 1; //@line 8594
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 8607
     $$0 = 1; //@line 8608
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8612
     $$0 = -1; //@line 8613
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 8623
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 8627
    $$0 = 2; //@line 8628
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 8640
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 8646
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 8650
    $$0 = 3; //@line 8651
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 8661
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 8667
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 8673
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 8677
    $$0 = 4; //@line 8678
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8682
    $$0 = -1; //@line 8683
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8688
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 7472
  $8 = $0; //@line 7472
  $9 = $1; //@line 7472
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7474
   $$0914 = $$0914 + -1 | 0; //@line 7478
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 7479
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7480
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 7488
   }
  }
  $$010$lcssa$off0 = $8; //@line 7493
  $$09$lcssa = $$0914; //@line 7493
 } else {
  $$010$lcssa$off0 = $0; //@line 7495
  $$09$lcssa = $2; //@line 7495
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 7499
 } else {
  $$012 = $$010$lcssa$off0; //@line 7501
  $$111 = $$09$lcssa; //@line 7501
  while (1) {
   $26 = $$111 + -1 | 0; //@line 7506
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 7507
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 7511
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 7514
    $$111 = $26; //@line 7514
   }
  }
 }
 return $$1$lcssa | 0; //@line 7518
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $8 = 0.0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12617
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12619
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12621
 if (+_pwmout_read(4052) == 1.0) {
  if (!(HEAP8[4056] | 0)) {
   HEAP8[4056] = 1; //@line 12628
  }
  _pwmout_write(4052, 0.0); //@line 12630
 }
 $8 = +_pwmout_read(4052) + .1; //@line 12635
 if (!(HEAP8[4056] | 0)) {
  HEAP8[4056] = 1; //@line 12639
 }
 _pwmout_write(4052, $8); //@line 12641
 HEAPF64[$2 >> 3] = +_pwmout_read(4052); //@line 12644
 _printf(1404, $2) | 0; //@line 12645
 $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 12646
 _wait(.20000000298023224); //@line 12647
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 12650
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 12651
  HEAP32[$13 >> 2] = $2; //@line 12652
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 12653
  HEAP32[$14 >> 2] = $4; //@line 12654
  sp = STACKTOP; //@line 12655
  return;
 }
 ___async_unwind = 0; //@line 12658
 HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 12659
 $13 = $ReallocAsyncCtx + 4 | 0; //@line 12660
 HEAP32[$13 >> 2] = $2; //@line 12661
 $14 = $ReallocAsyncCtx + 8 | 0; //@line 12662
 HEAP32[$14 >> 2] = $4; //@line 12663
 sp = STACKTOP; //@line 12664
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 4974
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 4979
   label = 4; //@line 4980
  } else {
   $$01519 = $0; //@line 4982
   $23 = $1; //@line 4982
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 4987
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 4990
    $23 = $6; //@line 4991
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 4995
     label = 4; //@line 4996
     break;
    } else {
     $$01519 = $6; //@line 4999
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 5005
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 5007
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 5015
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 5023
  } else {
   $$pn = $$0; //@line 5025
   while (1) {
    $19 = $$pn + 1 | 0; //@line 5027
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 5031
     break;
    } else {
     $$pn = $19; //@line 5034
    }
   }
  }
  $$sink = $$1$lcssa; //@line 5039
 }
 return $$sink - $1 | 0; //@line 5042
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 9906
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 9913
   $10 = $1 + 16 | 0; //@line 9914
   $11 = HEAP32[$10 >> 2] | 0; //@line 9915
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 9918
    HEAP32[$1 + 24 >> 2] = $4; //@line 9920
    HEAP32[$1 + 36 >> 2] = 1; //@line 9922
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 9932
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 9937
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 9940
    HEAP8[$1 + 54 >> 0] = 1; //@line 9942
    break;
   }
   $21 = $1 + 24 | 0; //@line 9945
   $22 = HEAP32[$21 >> 2] | 0; //@line 9946
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 9949
    $28 = $4; //@line 9950
   } else {
    $28 = $22; //@line 9952
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 9961
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_24($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12066
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12068
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12070
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12072
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 12077
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12079
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 12084
 $16 = _snprintf($4, $6, 1025, $2) | 0; //@line 12085
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 12087
 $19 = $4 + $$18 | 0; //@line 12089
 $20 = $6 - $$18 | 0; //@line 12090
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1103, $12) | 0; //@line 12098
  }
 }
 $23 = HEAP32[35] | 0; //@line 12101
 $24 = HEAP32[28] | 0; //@line 12102
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12103
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 12104
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12107
  sp = STACKTOP; //@line 12108
  return;
 }
 ___async_unwind = 0; //@line 12111
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12112
 sp = STACKTOP; //@line 12113
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9561
 $1 = HEAP32[40] | 0; //@line 9562
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9568
 } else {
  $19 = 0; //@line 9570
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9576
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9582
    $12 = HEAP32[$11 >> 2] | 0; //@line 9583
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9589
     HEAP8[$12 >> 0] = 10; //@line 9590
     $22 = 0; //@line 9591
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9595
   $17 = ___overflow($1, 10) | 0; //@line 9596
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 62; //@line 9599
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9601
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9603
    sp = STACKTOP; //@line 9604
    return 0; //@line 9605
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9607
    $22 = $17 >> 31; //@line 9609
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9616
 }
 return $22 | 0; //@line 9618
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10475
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10477
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10479
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10483
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 10487
  label = 4; //@line 10488
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 10493
   label = 4; //@line 10494
  } else {
   $$037$off039 = 3; //@line 10496
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 10500
  $17 = $8 + 40 | 0; //@line 10501
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 10504
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 10514
    $$037$off039 = $$037$off038; //@line 10515
   } else {
    $$037$off039 = $$037$off038; //@line 10517
   }
  } else {
   $$037$off039 = $$037$off038; //@line 10520
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 10523
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9765
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 9774
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 9779
      HEAP32[$13 >> 2] = $2; //@line 9780
      $19 = $1 + 40 | 0; //@line 9781
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 9784
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9794
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 9798
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 9805
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
 $$016 = 0; //@line 8708
 while (1) {
  if ((HEAPU8[1955 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 8715
   break;
  }
  $7 = $$016 + 1 | 0; //@line 8718
  if (($7 | 0) == 87) {
   $$01214 = 2043; //@line 8721
   $$115 = 87; //@line 8721
   label = 5; //@line 8722
   break;
  } else {
   $$016 = $7; //@line 8725
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2043; //@line 8731
  } else {
   $$01214 = 2043; //@line 8733
   $$115 = $$016; //@line 8733
   label = 5; //@line 8734
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 8739
   $$113 = $$01214; //@line 8740
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 8744
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 8751
   if (!$$115) {
    $$012$lcssa = $$113; //@line 8754
    break;
   } else {
    $$01214 = $$113; //@line 8757
    label = 5; //@line 8758
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 8765
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 8781
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 8785
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 8788
   if (!$5) {
    $$0 = 0; //@line 8791
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 8797
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 8803
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 8810
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 8817
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 8824
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 8831
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 8838
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 8842
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8852
}
function _main() {
 var $3 = 0.0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1508
 STACKTOP = STACKTOP + 16 | 0; //@line 1509
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1509
 $vararg_buffer = sp; //@line 1510
 while (1) {
  $3 = +_pwmout_read(4052) + .1; //@line 1515
  if (!(HEAP8[4056] | 0)) {
   HEAP8[4056] = 1; //@line 1519
  }
  _pwmout_write(4052, $3); //@line 1521
  HEAPF64[$vararg_buffer >> 3] = +_pwmout_read(4052); //@line 1524
  _printf(1404, $vararg_buffer) | 0; //@line 1525
  $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1526
  _wait(.20000000298023224); //@line 1527
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1532
  if (!(+_pwmout_read(4052) == 1.0)) {
   continue;
  }
  if (!(HEAP8[4056] | 0)) {
   HEAP8[4056] = 1; //@line 1541
  }
  _pwmout_write(4052, 0.0); //@line 1543
 }
 HEAP32[$AsyncCtx >> 2] = 48; //@line 1545
 HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 1547
 HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1549
 sp = STACKTOP; //@line 1550
 STACKTOP = sp; //@line 1551
 return 0; //@line 1551
}
function _mbed_vtracef__async_cb_30($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12451
 $3 = HEAP32[36] | 0; //@line 12455
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[28] | 0; //@line 12459
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12460
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 12461
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 12464
   sp = STACKTOP; //@line 12465
   return;
  }
  ___async_unwind = 0; //@line 12468
  HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 12469
  sp = STACKTOP; //@line 12470
  return;
 } else {
  $6 = HEAP32[35] | 0; //@line 12473
  $7 = HEAP32[28] | 0; //@line 12474
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 12475
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 12476
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 12479
   sp = STACKTOP; //@line 12480
   return;
  }
  ___async_unwind = 0; //@line 12483
  HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 12484
  sp = STACKTOP; //@line 12485
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 8977
 $32 = $0 + 3 | 0; //@line 8991
 $33 = HEAP8[$32 >> 0] | 0; //@line 8992
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 8994
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 8999
  $$sink21$lcssa = $32; //@line 8999
 } else {
  $$sink2123 = $32; //@line 9001
  $39 = $35; //@line 9001
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 9004
   $41 = HEAP8[$40 >> 0] | 0; //@line 9005
   $39 = $39 << 8 | $41 & 255; //@line 9007
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 9012
    $$sink21$lcssa = $40; //@line 9012
    break;
   } else {
    $$sink2123 = $40; //@line 9015
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 9022
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1412
 $2 = $0 + 12 | 0; //@line 1414
 $3 = HEAP32[$2 >> 2] | 0; //@line 1415
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1419
   _mbed_assert_internal(1315, 1320, 528); //@line 1420
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 44; //@line 1423
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1425
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1427
    sp = STACKTOP; //@line 1428
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1431
    $8 = HEAP32[$2 >> 2] | 0; //@line 1433
    break;
   }
  } else {
   $8 = $3; //@line 1437
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1440
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1442
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1443
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 1446
  sp = STACKTOP; //@line 1447
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1450
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 8911
 $23 = $0 + 2 | 0; //@line 8920
 $24 = HEAP8[$23 >> 0] | 0; //@line 8921
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 8924
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 8929
  $$lcssa = $24; //@line 8929
 } else {
  $$01618 = $23; //@line 8931
  $$019 = $27; //@line 8931
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 8933
   $31 = HEAP8[$30 >> 0] | 0; //@line 8934
   $$019 = ($$019 | $31 & 255) << 8; //@line 8937
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 8942
    $$lcssa = $31; //@line 8942
    break;
   } else {
    $$01618 = $30; //@line 8945
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 8952
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10329
 STACKTOP = STACKTOP + 16 | 0; //@line 10330
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10330
 $3 = sp; //@line 10331
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 10333
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 10336
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10337
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 10338
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 71; //@line 10341
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10343
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10345
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10347
  sp = STACKTOP; //@line 10348
  STACKTOP = sp; //@line 10349
  return 0; //@line 10349
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10351
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 10355
 }
 STACKTOP = sp; //@line 10357
 return $8 & 1 | 0; //@line 10357
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8539
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8539
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8540
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 8541
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 8550
    $$016 = $9; //@line 8553
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 8553
   } else {
    $$016 = $0; //@line 8555
    $storemerge = 0; //@line 8555
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 8557
   $$0 = $$016; //@line 8558
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 8562
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 8568
   HEAP32[tempDoublePtr >> 2] = $2; //@line 8571
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 8571
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 8572
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10823
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10831
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10833
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10835
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10837
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10839
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10841
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10843
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 10854
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 10855
 HEAP32[$10 >> 2] = 0; //@line 10856
 HEAP32[$12 >> 2] = 0; //@line 10857
 HEAP32[$14 >> 2] = 0; //@line 10858
 HEAP32[$2 >> 2] = 0; //@line 10859
 $33 = HEAP32[$16 >> 2] | 0; //@line 10860
 HEAP32[$16 >> 2] = $33 | $18; //@line 10865
 if ($20 | 0) {
  ___unlockfile($22); //@line 10868
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 10871
 return;
}
function _mbed_vtracef__async_cb_27($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12182
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12186
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 12191
 $$pre = HEAP32[38] | 0; //@line 12192
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12193
 FUNCTION_TABLE_v[$$pre & 0](); //@line 12194
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12197
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 12198
  HEAP32[$6 >> 2] = $4; //@line 12199
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 12200
  HEAP32[$7 >> 2] = $5; //@line 12201
  sp = STACKTOP; //@line 12202
  return;
 }
 ___async_unwind = 0; //@line 12205
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12206
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 12207
 HEAP32[$6 >> 2] = $4; //@line 12208
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 12209
 HEAP32[$7 >> 2] = $5; //@line 12210
 sp = STACKTOP; //@line 12211
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
 sp = STACKTOP; //@line 10121
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10127
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10130
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10133
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10134
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10135
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 67; //@line 10138
    sp = STACKTOP; //@line 10139
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10142
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_26($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12149
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12151
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 12156
 $$pre = HEAP32[38] | 0; //@line 12157
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12158
 FUNCTION_TABLE_v[$$pre & 0](); //@line 12159
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12162
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 12163
  HEAP32[$5 >> 2] = $2; //@line 12164
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 12165
  HEAP32[$6 >> 2] = $4; //@line 12166
  sp = STACKTOP; //@line 12167
  return;
 }
 ___async_unwind = 0; //@line 12170
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12171
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 12172
 HEAP32[$5 >> 2] = $2; //@line 12173
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 12174
 HEAP32[$6 >> 2] = $4; //@line 12175
 sp = STACKTOP; //@line 12176
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10290
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10296
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10299
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10302
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10303
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10304
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 70; //@line 10307
    sp = STACKTOP; //@line 10308
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10311
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_error_vfprintf__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10722
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 10724
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10726
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10728
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10730
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10732
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10734
 _serial_putc(4044, $2 << 24 >> 24); //@line 10735
 if (!___async) {
  ___async_unwind = 0; //@line 10738
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 10740
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 10742
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 10744
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 10746
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 10748
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 10750
 sp = STACKTOP; //@line 10751
 return;
}
function ___dynamic_cast__async_cb_35($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12789
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12791
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12793
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12799
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 12814
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 12830
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 12835
    break;
   }
  default:
   {
    $$0 = 0; //@line 12839
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12844
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 7537
 STACKTOP = STACKTOP + 256 | 0; //@line 7538
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 7538
 $5 = sp; //@line 7539
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 7545
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 7549
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 7552
   $$011 = $9; //@line 7553
   do {
    _out_670($0, $5, 256); //@line 7555
    $$011 = $$011 + -256 | 0; //@line 7556
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 7565
  } else {
   $$0$lcssa = $9; //@line 7567
  }
  _out_670($0, $5, $$0$lcssa); //@line 7569
 }
 STACKTOP = sp; //@line 7571
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4832
 STACKTOP = STACKTOP + 32 | 0; //@line 4833
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4833
 $vararg_buffer = sp; //@line 4834
 $3 = sp + 20 | 0; //@line 4835
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4839
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4841
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4843
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4845
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4847
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4852
  $10 = -1; //@line 4853
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4856
 }
 STACKTOP = sp; //@line 4858
 return $10 | 0; //@line 4858
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 857
 STACKTOP = STACKTOP + 16 | 0; //@line 858
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 858
 $vararg_buffer = sp; //@line 859
 HEAP32[$vararg_buffer >> 2] = $0; //@line 860
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 862
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 864
 _mbed_error_printf(1108, $vararg_buffer); //@line 865
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 866
 _mbed_die(); //@line 867
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 21; //@line 870
  sp = STACKTOP; //@line 871
  STACKTOP = sp; //@line 872
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 874
  STACKTOP = sp; //@line 875
  return;
 }
}
function _mbed_vtracef__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12119
 HEAP32[32] = HEAP32[30]; //@line 12121
 $2 = HEAP32[38] | 0; //@line 12122
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 12127
 HEAP32[39] = 0; //@line 12128
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12129
 FUNCTION_TABLE_v[$2 & 0](); //@line 12130
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12133
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12134
  HEAP32[$5 >> 2] = $4; //@line 12135
  sp = STACKTOP; //@line 12136
  return;
 }
 ___async_unwind = 0; //@line 12139
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12140
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12141
 HEAP32[$5 >> 2] = $4; //@line 12142
 sp = STACKTOP; //@line 12143
 return;
}
function _mbed_vtracef__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11855
 HEAP32[32] = HEAP32[30]; //@line 11857
 $2 = HEAP32[38] | 0; //@line 11858
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11863
 HEAP32[39] = 0; //@line 11864
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11865
 FUNCTION_TABLE_v[$2 & 0](); //@line 11866
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11869
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11870
  HEAP32[$5 >> 2] = $4; //@line 11871
  sp = STACKTOP; //@line 11872
  return;
 }
 ___async_unwind = 0; //@line 11875
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11876
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11877
 HEAP32[$5 >> 2] = $4; //@line 11878
 sp = STACKTOP; //@line 11879
 return;
}
function _mbed_vtracef__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11825
 HEAP32[32] = HEAP32[30]; //@line 11827
 $2 = HEAP32[38] | 0; //@line 11828
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11833
 HEAP32[39] = 0; //@line 11834
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11835
 FUNCTION_TABLE_v[$2 & 0](); //@line 11836
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11839
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11840
  HEAP32[$5 >> 2] = $4; //@line 11841
  sp = STACKTOP; //@line 11842
  return;
 }
 ___async_unwind = 0; //@line 11845
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11846
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11847
 HEAP32[$5 >> 2] = $4; //@line 11848
 sp = STACKTOP; //@line 11849
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9416
 STACKTOP = STACKTOP + 16 | 0; //@line 9417
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9417
 $3 = sp; //@line 9418
 HEAP32[$3 >> 2] = $varargs; //@line 9419
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9420
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 9421
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 9424
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9426
  sp = STACKTOP; //@line 9427
  STACKTOP = sp; //@line 9428
  return 0; //@line 9428
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9430
  STACKTOP = sp; //@line 9431
  return $4 | 0; //@line 9431
 }
 return 0; //@line 9433
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9537
 STACKTOP = STACKTOP + 16 | 0; //@line 9538
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9538
 $1 = sp; //@line 9539
 HEAP32[$1 >> 2] = $varargs; //@line 9540
 $2 = HEAP32[40] | 0; //@line 9541
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9542
 $3 = _vfprintf($2, $0, $1) | 0; //@line 9543
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 61; //@line 9546
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9548
  sp = STACKTOP; //@line 9549
  STACKTOP = sp; //@line 9550
  return 0; //@line 9550
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9552
  STACKTOP = sp; //@line 9553
  return $3 | 0; //@line 9553
 }
 return 0; //@line 9555
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 9843
 $5 = HEAP32[$4 >> 2] | 0; //@line 9844
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 9848
   HEAP32[$1 + 24 >> 2] = $3; //@line 9850
   HEAP32[$1 + 36 >> 2] = 1; //@line 9852
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 9856
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 9859
    HEAP32[$1 + 24 >> 2] = 2; //@line 9861
    HEAP8[$1 + 54 >> 0] = 1; //@line 9863
    break;
   }
   $10 = $1 + 24 | 0; //@line 9866
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 9870
   }
  }
 } while (0);
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 4939
 $3 = HEAP8[$1 >> 0] | 0; //@line 4940
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 4945
  $$lcssa8 = $2; //@line 4945
 } else {
  $$011 = $1; //@line 4947
  $$0710 = $0; //@line 4947
  do {
   $$0710 = $$0710 + 1 | 0; //@line 4949
   $$011 = $$011 + 1 | 0; //@line 4950
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 4951
   $9 = HEAP8[$$011 >> 0] | 0; //@line 4952
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 4957
  $$lcssa8 = $8; //@line 4957
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 4967
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1384
 $2 = HEAP32[40] | 0; //@line 1385
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1386
 _putc($1, $2) | 0; //@line 1387
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 42; //@line 1390
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1392
  sp = STACKTOP; //@line 1393
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1396
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1397
 _fflush($2) | 0; //@line 1398
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 1401
  sp = STACKTOP; //@line 1402
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1405
  return;
 }
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 11271
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11273
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11275
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 11276
 _wait_ms(150); //@line 11277
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 23; //@line 11280
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11281
  HEAP32[$4 >> 2] = $2; //@line 11282
  sp = STACKTOP; //@line 11283
  return;
 }
 ___async_unwind = 0; //@line 11286
 HEAP32[$ReallocAsyncCtx15 >> 2] = 23; //@line 11287
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11288
 HEAP32[$4 >> 2] = $2; //@line 11289
 sp = STACKTOP; //@line 11290
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 11246
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11248
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11250
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 11251
 _wait_ms(150); //@line 11252
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 24; //@line 11255
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11256
  HEAP32[$4 >> 2] = $2; //@line 11257
  sp = STACKTOP; //@line 11258
  return;
 }
 ___async_unwind = 0; //@line 11261
 HEAP32[$ReallocAsyncCtx14 >> 2] = 24; //@line 11262
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11263
 HEAP32[$4 >> 2] = $2; //@line 11264
 sp = STACKTOP; //@line 11265
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 11221
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11223
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11225
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 11226
 _wait_ms(150); //@line 11227
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 25; //@line 11230
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11231
  HEAP32[$4 >> 2] = $2; //@line 11232
  sp = STACKTOP; //@line 11233
  return;
 }
 ___async_unwind = 0; //@line 11236
 HEAP32[$ReallocAsyncCtx13 >> 2] = 25; //@line 11237
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11238
 HEAP32[$4 >> 2] = $2; //@line 11239
 sp = STACKTOP; //@line 11240
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 11196
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11198
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11200
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 11201
 _wait_ms(150); //@line 11202
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 26; //@line 11205
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11206
  HEAP32[$4 >> 2] = $2; //@line 11207
  sp = STACKTOP; //@line 11208
  return;
 }
 ___async_unwind = 0; //@line 11211
 HEAP32[$ReallocAsyncCtx12 >> 2] = 26; //@line 11212
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11213
 HEAP32[$4 >> 2] = $2; //@line 11214
 sp = STACKTOP; //@line 11215
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 11171
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11173
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11175
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 11176
 _wait_ms(150); //@line 11177
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 27; //@line 11180
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11181
  HEAP32[$4 >> 2] = $2; //@line 11182
  sp = STACKTOP; //@line 11183
  return;
 }
 ___async_unwind = 0; //@line 11186
 HEAP32[$ReallocAsyncCtx11 >> 2] = 27; //@line 11187
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11188
 HEAP32[$4 >> 2] = $2; //@line 11189
 sp = STACKTOP; //@line 11190
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 11146
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11148
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11150
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 11151
 _wait_ms(150); //@line 11152
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 28; //@line 11155
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11156
  HEAP32[$4 >> 2] = $2; //@line 11157
  sp = STACKTOP; //@line 11158
  return;
 }
 ___async_unwind = 0; //@line 11161
 HEAP32[$ReallocAsyncCtx10 >> 2] = 28; //@line 11162
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11163
 HEAP32[$4 >> 2] = $2; //@line 11164
 sp = STACKTOP; //@line 11165
 return;
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 9381
  } else {
   $$01318 = $0; //@line 9383
   $$01417 = $2; //@line 9383
   $$019 = $1; //@line 9383
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 9385
    $5 = HEAP8[$$019 >> 0] | 0; //@line 9386
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 9391
    if (!$$01417) {
     $14 = 0; //@line 9396
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 9399
     $$019 = $$019 + 1 | 0; //@line 9399
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 9405
  }
 } while (0);
 return $14 | 0; //@line 9408
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 10896
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10898
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10900
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 10901
 _wait_ms(150); //@line 10902
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 22; //@line 10905
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 10906
  HEAP32[$4 >> 2] = $2; //@line 10907
  sp = STACKTOP; //@line 10908
  return;
 }
 ___async_unwind = 0; //@line 10911
 HEAP32[$ReallocAsyncCtx16 >> 2] = 22; //@line 10912
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 10913
 HEAP32[$4 >> 2] = $2; //@line 10914
 sp = STACKTOP; //@line 10915
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4891
 STACKTOP = STACKTOP + 32 | 0; //@line 4892
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4892
 $vararg_buffer = sp; //@line 4893
 HEAP32[$0 + 36 >> 2] = 5; //@line 4896
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4904
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4906
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4908
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4913
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4916
 STACKTOP = sp; //@line 4917
 return $14 | 0; //@line 4917
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11121
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11123
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11125
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 11126
 _wait_ms(150); //@line 11127
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 11130
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11131
  HEAP32[$4 >> 2] = $2; //@line 11132
  sp = STACKTOP; //@line 11133
  return;
 }
 ___async_unwind = 0; //@line 11136
 HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 11137
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11138
 HEAP32[$4 >> 2] = $2; //@line 11139
 sp = STACKTOP; //@line 11140
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11096
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11098
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11100
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11101
 _wait_ms(400); //@line 11102
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 30; //@line 11105
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11106
  HEAP32[$4 >> 2] = $2; //@line 11107
  sp = STACKTOP; //@line 11108
  return;
 }
 ___async_unwind = 0; //@line 11111
 HEAP32[$ReallocAsyncCtx8 >> 2] = 30; //@line 11112
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11113
 HEAP32[$4 >> 2] = $2; //@line 11114
 sp = STACKTOP; //@line 11115
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11071
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11073
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11075
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 11076
 _wait_ms(400); //@line 11077
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 31; //@line 11080
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11081
  HEAP32[$4 >> 2] = $2; //@line 11082
  sp = STACKTOP; //@line 11083
  return;
 }
 ___async_unwind = 0; //@line 11086
 HEAP32[$ReallocAsyncCtx7 >> 2] = 31; //@line 11087
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11088
 HEAP32[$4 >> 2] = $2; //@line 11089
 sp = STACKTOP; //@line 11090
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 11046
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11048
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11050
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 11051
 _wait_ms(400); //@line 11052
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 32; //@line 11055
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11056
  HEAP32[$4 >> 2] = $2; //@line 11057
  sp = STACKTOP; //@line 11058
  return;
 }
 ___async_unwind = 0; //@line 11061
 HEAP32[$ReallocAsyncCtx6 >> 2] = 32; //@line 11062
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11063
 HEAP32[$4 >> 2] = $2; //@line 11064
 sp = STACKTOP; //@line 11065
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11021
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11023
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11025
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 11026
 _wait_ms(400); //@line 11027
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 33; //@line 11030
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11031
  HEAP32[$4 >> 2] = $2; //@line 11032
  sp = STACKTOP; //@line 11033
  return;
 }
 ___async_unwind = 0; //@line 11036
 HEAP32[$ReallocAsyncCtx5 >> 2] = 33; //@line 11037
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11038
 HEAP32[$4 >> 2] = $2; //@line 11039
 sp = STACKTOP; //@line 11040
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 10996
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10998
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11000
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 11001
 _wait_ms(400); //@line 11002
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 11005
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11006
  HEAP32[$4 >> 2] = $2; //@line 11007
  sp = STACKTOP; //@line 11008
  return;
 }
 ___async_unwind = 0; //@line 11011
 HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 11012
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11013
 HEAP32[$4 >> 2] = $2; //@line 11014
 sp = STACKTOP; //@line 11015
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10971
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10973
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10975
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 10976
 _wait_ms(400); //@line 10977
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 35; //@line 10980
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 10981
  HEAP32[$4 >> 2] = $2; //@line 10982
  sp = STACKTOP; //@line 10983
  return;
 }
 ___async_unwind = 0; //@line 10986
 HEAP32[$ReallocAsyncCtx3 >> 2] = 35; //@line 10987
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 10988
 HEAP32[$4 >> 2] = $2; //@line 10989
 sp = STACKTOP; //@line 10990
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10946
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10948
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10950
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 10951
 _wait_ms(400); //@line 10952
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 36; //@line 10955
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 10956
  HEAP32[$4 >> 2] = $2; //@line 10957
  sp = STACKTOP; //@line 10958
  return;
 }
 ___async_unwind = 0; //@line 10961
 HEAP32[$ReallocAsyncCtx2 >> 2] = 36; //@line 10962
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 10963
 HEAP32[$4 >> 2] = $2; //@line 10964
 sp = STACKTOP; //@line 10965
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10921
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10923
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10925
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 10926
 _wait_ms(400); //@line 10927
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 10930
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 10931
  HEAP32[$4 >> 2] = $2; //@line 10932
  sp = STACKTOP; //@line 10933
  return;
 }
 ___async_unwind = 0; //@line 10936
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 10937
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 10938
 HEAP32[$4 >> 2] = $2; //@line 10939
 sp = STACKTOP; //@line 10940
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 154
 STACKTOP = STACKTOP + 16 | 0; //@line 155
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 155
 $3 = sp; //@line 156
 HEAP32[$3 >> 2] = $varargs; //@line 157
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 158
 _mbed_vtracef($0, $1, $2, $3); //@line 159
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 8; //@line 162
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 164
  sp = STACKTOP; //@line 165
  STACKTOP = sp; //@line 166
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 168
  STACKTOP = sp; //@line 169
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1185
 STACKTOP = STACKTOP + 16 | 0; //@line 1186
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1186
 $1 = sp; //@line 1187
 HEAP32[$1 >> 2] = $varargs; //@line 1188
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1189
 _mbed_error_vfprintf($0, $1); //@line 1190
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 1193
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1195
  sp = STACKTOP; //@line 1196
  STACKTOP = sp; //@line 1197
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1199
  STACKTOP = sp; //@line 1200
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 13497
 newDynamicTop = oldDynamicTop + increment | 0; //@line 13498
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 13502
  ___setErrNo(12); //@line 13503
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 13507
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 13511
   ___setErrNo(12); //@line 13512
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 13516
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 5062
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 5064
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5070
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5071
  if ($phitmp) {
   $13 = $11; //@line 5073
  } else {
   ___unlockfile($3); //@line 5075
   $13 = $11; //@line 5076
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5080
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5084
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5087
 }
 return $15 | 0; //@line 5089
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7398
 } else {
  $$056 = $2; //@line 7400
  $15 = $1; //@line 7400
  $8 = $0; //@line 7400
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7408
   HEAP8[$14 >> 0] = HEAPU8[1937 + ($8 & 15) >> 0] | 0 | $3; //@line 7409
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7410
   $15 = tempRet0; //@line 7411
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7416
    break;
   } else {
    $$056 = $14; //@line 7419
   }
  }
 }
 return $$05$lcssa | 0; //@line 7423
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 5279
 $3 = HEAP8[$1 >> 0] | 0; //@line 5281
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 5285
 $7 = HEAP32[$0 >> 2] | 0; //@line 5286
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 5291
  HEAP32[$0 + 4 >> 2] = 0; //@line 5293
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 5295
  HEAP32[$0 + 28 >> 2] = $14; //@line 5297
  HEAP32[$0 + 20 >> 2] = $14; //@line 5299
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5305
  $$0 = 0; //@line 5306
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 5309
  $$0 = -1; //@line 5310
 }
 return $$0 | 0; //@line 5312
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 8866
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 8869
 $$sink17$sink = $0; //@line 8869
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 8871
  $12 = HEAP8[$11 >> 0] | 0; //@line 8872
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 8880
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 8885
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 8890
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7435
 } else {
  $$06 = $2; //@line 7437
  $11 = $1; //@line 7437
  $7 = $0; //@line 7437
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7442
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7443
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7444
   $11 = tempRet0; //@line 7445
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 7450
    break;
   } else {
    $$06 = $10; //@line 7453
   }
  }
 }
 return $$0$lcssa | 0; //@line 7457
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10362
 do {
  if (!$0) {
   $3 = 0; //@line 10366
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10368
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 10369
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 72; //@line 10372
    sp = STACKTOP; //@line 10373
    return 0; //@line 10374
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10376
    $3 = ($2 | 0) != 0 & 1; //@line 10379
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 10384
}
function _invoke_ticker__async_cb_31($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12498
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 12504
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 12505
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12506
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 12507
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 45; //@line 12510
  sp = STACKTOP; //@line 12511
  return;
 }
 ___async_unwind = 0; //@line 12514
 HEAP32[$ReallocAsyncCtx >> 2] = 45; //@line 12515
 sp = STACKTOP; //@line 12516
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7079
 } else {
  $$04 = 0; //@line 7081
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7084
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7088
   $12 = $7 + 1 | 0; //@line 7089
   HEAP32[$0 >> 2] = $12; //@line 7090
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7096
    break;
   } else {
    $$04 = $11; //@line 7099
   }
  }
 }
 return $$0$lcssa | 0; //@line 7103
}
function ___fflush_unlocked__async_cb_34($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12736
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12738
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12740
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12742
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 12744
 HEAP32[$4 >> 2] = 0; //@line 12745
 HEAP32[$6 >> 2] = 0; //@line 12746
 HEAP32[$8 >> 2] = 0; //@line 12747
 HEAP32[$10 >> 2] = 0; //@line 12748
 HEAP32[___async_retval >> 2] = 0; //@line 12750
 return;
}
function _mbed_vtracef__async_cb_20($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11807
 $1 = HEAP32[36] | 0; //@line 11808
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 11809
 FUNCTION_TABLE_vi[$1 & 127](993); //@line 11810
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 11813
  sp = STACKTOP; //@line 11814
  return;
 }
 ___async_unwind = 0; //@line 11817
 HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 11818
 sp = STACKTOP; //@line 11819
 return;
}
function _serial_putc__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12597
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12599
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12600
 _fflush($2) | 0; //@line 12601
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 12604
  sp = STACKTOP; //@line 12605
  return;
 }
 ___async_unwind = 0; //@line 12608
 HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 12609
 sp = STACKTOP; //@line 12610
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 13348
 ___async_unwind = 1; //@line 13349
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 13355
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 13359
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 13363
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13365
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4702
 STACKTOP = STACKTOP + 16 | 0; //@line 4703
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4703
 $vararg_buffer = sp; //@line 4704
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4708
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4710
 STACKTOP = sp; //@line 4711
 return $5 | 0; //@line 4711
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 13290
 STACKTOP = STACKTOP + 16 | 0; //@line 13291
 $rem = __stackBase__ | 0; //@line 13292
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 13293
 STACKTOP = __stackBase__; //@line 13294
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 13295
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 13060
 if ((ret | 0) < 8) return ret | 0; //@line 13061
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 13062
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 13063
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 13064
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 13065
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 13066
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9747
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 9521
 $6 = HEAP32[$5 >> 2] | 0; //@line 9522
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 9523
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 9525
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 9527
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 9530
 return $2 | 0; //@line 9531
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10391
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 10402
  $$0 = 1; //@line 10403
 } else {
  $$0 = 0; //@line 10405
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 10409
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10770
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 10773
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 10778
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 10781
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1467
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1471
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 1472
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 46; //@line 1475
  sp = STACKTOP; //@line 1476
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1479
  return;
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1363
 HEAP32[$0 >> 2] = $1; //@line 1364
 HEAP32[1010] = 1; //@line 1365
 $4 = $0; //@line 1366
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1371
 $10 = 4044; //@line 1372
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1374
 HEAP32[$10 + 4 >> 2] = $9; //@line 1377
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9823
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1486
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1487
 _emscripten_sleep($0 | 0); //@line 1488
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 1491
  sp = STACKTOP; //@line 1492
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1495
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 135
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 136
 _puts($0) | 0; //@line 137
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 140
  sp = STACKTOP; //@line 141
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 144
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
  $7 = $1 + 28 | 0; //@line 9887
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 9891
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 13324
 HEAP32[new_frame + 4 >> 2] = sp; //@line 13326
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 13328
 ___async_cur_frame = new_frame; //@line 13329
 return ___async_cur_frame + 8 | 0; //@line 13330
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 12578
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 12582
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 12585
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 13313
  return low << bits; //@line 13314
 }
 tempRet0 = low << bits - 32; //@line 13316
 return 0; //@line 13317
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 13302
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 13303
 }
 tempRet0 = 0; //@line 13305
 return high >>> bits - 32 | 0; //@line 13306
}
function _fflush__async_cb_36($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12940
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12942
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12945
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 10884
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 10887
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 10890
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 10796
 } else {
  $$0 = -1; //@line 10798
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 10801
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 5409
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 5415
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 5419
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 13572
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 13336
 stackRestore(___async_cur_frame | 0); //@line 13337
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13338
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12550
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 12551
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12553
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1309
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1315
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 1316
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8520
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8520
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8522
 return $1 | 0; //@line 8523
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 13053
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 13054
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 13055
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4868
  $$0 = -1; //@line 4869
 } else {
  $$0 = $0; //@line 4871
 }
 return $$0 | 0; //@line 4873
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 13045
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 13047
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 13565
}
function _handle_lora_downlink($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5); //@line 56
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 13558
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 5554
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 5559
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 7580
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 7583
 }
 return $$0 | 0; //@line 7585
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 13537
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 13282
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 12775
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 5049
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 5053
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 13343
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 13344
}
function _pwmout_init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1331
 _emscripten_asm_const_iiiii(4, $0 | 0, $1 | 0, 20, 0) | 0; //@line 1332
 return;
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10109
 __ZdlPv($0); //@line 10110
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 5545
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 5547
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9637
 __ZdlPv($0); //@line 9638
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 12856
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
  ___fwritex($1, $2, $0) | 0; //@line 7065
 }
 return;
}
function b75(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 13777
}
function b74(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 13774
}
function _pwmout_write($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, ~~($1 * 1024.0) | 0) | 0; //@line 1343
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 9834
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 13370
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b72(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 13771
}
function b71(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 13768
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2($0) {
 $0 = $0 | 0;
 return;
}
function _fflush__async_cb_37($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12955
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 7528
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12528
 return;
}
function _putc__async_cb_32($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12563
 return;
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 10813
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 13530
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 13588
 return 0; //@line 13588
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 13585
 return 0; //@line 13585
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 13582
 return 0; //@line 13582
}
function _pwmout_read($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(5, HEAP32[$0 >> 2] | 0) | 0) * .0009765625);
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 13551
}
function b69(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 13765
}
function b68(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 13762
}
function __GLOBAL__sub_I_main_cpp() {
 HEAP8[4056] = 0; //@line 1502
 _pwmout_init(4052, 9); //@line 1503
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 8773
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 13523
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 13544
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 4926
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 13579
 return 0; //@line 13579
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
 ___lock(4624); //@line 5564
 return 4632; //@line 5565
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
 return _pthread_self() | 0; //@line 8694
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 8700
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function b1() {
 nullFunc_i(0); //@line 13576
 return 0; //@line 13576
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9624
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
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(4624); //@line 5570
 return;
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 13759
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 13756
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 13753
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 13750
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 13747
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 13744
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 13741
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 13738
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 13735
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 13732
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 13729
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 13726
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 13723
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 13720
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 13717
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 13714
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 13711
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 13708
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 13705
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 13702
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 13699
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(106); //@line 13696
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(105); //@line 13693
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(104); //@line 13690
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(103); //@line 13687
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(102); //@line 13684
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(101); //@line 13681
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(100); //@line 13678
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(99); //@line 13675
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(98); //@line 13672
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(97); //@line 13669
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(96); //@line 13666
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(95); //@line 13663
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(94); //@line 13660
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(93); //@line 13657
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(92); //@line 13654
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(91); //@line 13651
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(90); //@line 13648
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(89); //@line 13645
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(88); //@line 13642
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(87); //@line 13639
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(86); //@line 13636
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(85); //@line 13633
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(84); //@line 13630
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(83); //@line 13627
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(82); //@line 13624
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(81); //@line 13621
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(80); //@line 13618
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(79); //@line 13615
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(78); //@line 13612
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(77); //@line 13609
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(76); //@line 13606
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(75); //@line 13603
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(74); //@line 13600
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(73); //@line 13597
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4884
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5201
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 13594
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _sleep_manager_lock_deep_sleep_internal() {
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
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 4620; //@line 4878
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
 return 292; //@line 4931
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 13591
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_30,_mbed_vtracef__async_cb_20,_mbed_vtracef__async_cb_21,_mbed_vtracef__async_cb_22,_mbed_vtracef__async_cb_29,_mbed_vtracef__async_cb_23,_mbed_vtracef__async_cb_28,_mbed_vtracef__async_cb_24,_mbed_vtracef__async_cb_25,_mbed_vtracef__async_cb_26,_mbed_vtracef__async_cb_27,_mbed_assert_internal__async_cb,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13
,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_4,_mbed_error_vfprintf__async_cb_3,_serial_putc__async_cb_33,_serial_putc__async_cb,_invoke_ticker__async_cb_31,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,_main__async_cb,_putc__async_cb_32,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_37,_fflush__async_cb_36,_fflush__async_cb_38,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_34,_vfprintf__async_cb
,_snprintf__async_cb,_vsnprintf__async_cb,_printf__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_1,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_35,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27
,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57
,b58,b59,b60,b61,b62,b63,b64,b65,b66];
var FUNCTION_TABLE_viiii = [b68,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b69];
var FUNCTION_TABLE_viiiii = [b71,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b72];
var FUNCTION_TABLE_viiiiii = [b74,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b75];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
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
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

STATICTOP = STATIC_BASE + 5248;
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
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0"];
var debug_table_vi = ["0", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb_5", "_mbed_die__async_cb_4", "_mbed_die__async_cb_3", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_printf__async_cb_26", "_serial_putc__async_cb_19", "_serial_putc__async_cb", "_invoke_ticker__async_cb_2", "_invoke_ticker__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "_main__async_cb", "_putc__async_cb_20", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_22", "_fflush__async_cb_21", "_fflush__async_cb_23", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_25", "_vfprintf__async_cb", "_vsnprintf__async_cb", "_printf__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_24", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_18", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 766
 STACKTOP = STACKTOP + 16 | 0; //@line 767
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 767
 $1 = sp; //@line 768
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 775
   $7 = $6 >>> 3; //@line 776
   $8 = HEAP32[907] | 0; //@line 777
   $9 = $8 >>> $7; //@line 778
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 784
    $16 = 3668 + ($14 << 1 << 2) | 0; //@line 786
    $17 = $16 + 8 | 0; //@line 787
    $18 = HEAP32[$17 >> 2] | 0; //@line 788
    $19 = $18 + 8 | 0; //@line 789
    $20 = HEAP32[$19 >> 2] | 0; //@line 790
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[907] = $8 & ~(1 << $14); //@line 797
     } else {
      if ((HEAP32[911] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 802
      }
      $27 = $20 + 12 | 0; //@line 805
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 809
       HEAP32[$17 >> 2] = $20; //@line 810
       break;
      } else {
       _abort(); //@line 813
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 818
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 821
    $34 = $18 + $30 + 4 | 0; //@line 823
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 826
    $$0 = $19; //@line 827
    STACKTOP = sp; //@line 828
    return $$0 | 0; //@line 828
   }
   $37 = HEAP32[909] | 0; //@line 830
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 836
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 839
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 842
     $49 = $47 >>> 12 & 16; //@line 844
     $50 = $47 >>> $49; //@line 845
     $52 = $50 >>> 5 & 8; //@line 847
     $54 = $50 >>> $52; //@line 849
     $56 = $54 >>> 2 & 4; //@line 851
     $58 = $54 >>> $56; //@line 853
     $60 = $58 >>> 1 & 2; //@line 855
     $62 = $58 >>> $60; //@line 857
     $64 = $62 >>> 1 & 1; //@line 859
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 862
     $69 = 3668 + ($67 << 1 << 2) | 0; //@line 864
     $70 = $69 + 8 | 0; //@line 865
     $71 = HEAP32[$70 >> 2] | 0; //@line 866
     $72 = $71 + 8 | 0; //@line 867
     $73 = HEAP32[$72 >> 2] | 0; //@line 868
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 874
       HEAP32[907] = $77; //@line 875
       $98 = $77; //@line 876
      } else {
       if ((HEAP32[911] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 881
       }
       $80 = $73 + 12 | 0; //@line 884
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 888
        HEAP32[$70 >> 2] = $73; //@line 889
        $98 = $8; //@line 890
        break;
       } else {
        _abort(); //@line 893
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 898
     $84 = $83 - $6 | 0; //@line 899
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 902
     $87 = $71 + $6 | 0; //@line 903
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 906
     HEAP32[$71 + $83 >> 2] = $84; //@line 908
     if ($37 | 0) {
      $92 = HEAP32[912] | 0; //@line 911
      $93 = $37 >>> 3; //@line 912
      $95 = 3668 + ($93 << 1 << 2) | 0; //@line 914
      $96 = 1 << $93; //@line 915
      if (!($98 & $96)) {
       HEAP32[907] = $98 | $96; //@line 920
       $$0199 = $95; //@line 922
       $$pre$phiZ2D = $95 + 8 | 0; //@line 922
      } else {
       $101 = $95 + 8 | 0; //@line 924
       $102 = HEAP32[$101 >> 2] | 0; //@line 925
       if ((HEAP32[911] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 929
       } else {
        $$0199 = $102; //@line 932
        $$pre$phiZ2D = $101; //@line 932
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 935
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 937
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 939
      HEAP32[$92 + 12 >> 2] = $95; //@line 941
     }
     HEAP32[909] = $84; //@line 943
     HEAP32[912] = $87; //@line 944
     $$0 = $72; //@line 945
     STACKTOP = sp; //@line 946
     return $$0 | 0; //@line 946
    }
    $108 = HEAP32[908] | 0; //@line 948
    if (!$108) {
     $$0197 = $6; //@line 951
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 955
     $114 = $112 >>> 12 & 16; //@line 957
     $115 = $112 >>> $114; //@line 958
     $117 = $115 >>> 5 & 8; //@line 960
     $119 = $115 >>> $117; //@line 962
     $121 = $119 >>> 2 & 4; //@line 964
     $123 = $119 >>> $121; //@line 966
     $125 = $123 >>> 1 & 2; //@line 968
     $127 = $123 >>> $125; //@line 970
     $129 = $127 >>> 1 & 1; //@line 972
     $134 = HEAP32[3932 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 977
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 981
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 987
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 990
      $$0193$lcssa$i = $138; //@line 990
     } else {
      $$01926$i = $134; //@line 992
      $$01935$i = $138; //@line 992
      $146 = $143; //@line 992
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 997
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 998
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 999
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1000
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1006
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1009
        $$0193$lcssa$i = $$$0193$i; //@line 1009
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1012
        $$01935$i = $$$0193$i; //@line 1012
       }
      }
     }
     $157 = HEAP32[911] | 0; //@line 1016
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1019
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1022
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1025
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1029
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1031
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1035
       $176 = HEAP32[$175 >> 2] | 0; //@line 1036
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1039
        $179 = HEAP32[$178 >> 2] | 0; //@line 1040
        if (!$179) {
         $$3$i = 0; //@line 1043
         break;
        } else {
         $$1196$i = $179; //@line 1046
         $$1198$i = $178; //@line 1046
        }
       } else {
        $$1196$i = $176; //@line 1049
        $$1198$i = $175; //@line 1049
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1052
        $182 = HEAP32[$181 >> 2] | 0; //@line 1053
        if ($182 | 0) {
         $$1196$i = $182; //@line 1056
         $$1198$i = $181; //@line 1056
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1059
        $185 = HEAP32[$184 >> 2] | 0; //@line 1060
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1065
         $$1198$i = $184; //@line 1065
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1070
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1073
        $$3$i = $$1196$i; //@line 1074
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1079
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1082
       }
       $169 = $167 + 12 | 0; //@line 1085
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1089
       }
       $172 = $164 + 8 | 0; //@line 1092
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1096
        HEAP32[$172 >> 2] = $167; //@line 1097
        $$3$i = $164; //@line 1098
        break;
       } else {
        _abort(); //@line 1101
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1110
       $191 = 3932 + ($190 << 2) | 0; //@line 1111
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1116
         if (!$$3$i) {
          HEAP32[908] = $108 & ~(1 << $190); //@line 1122
          break L73;
         }
        } else {
         if ((HEAP32[911] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1129
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1137
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[911] | 0; //@line 1147
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1150
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1154
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1156
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1162
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1166
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1168
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1174
       if ($214 | 0) {
        if ((HEAP32[911] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1180
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1184
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1186
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1194
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1197
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1199
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1202
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1206
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1209
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1211
      if ($37 | 0) {
       $234 = HEAP32[912] | 0; //@line 1214
       $235 = $37 >>> 3; //@line 1215
       $237 = 3668 + ($235 << 1 << 2) | 0; //@line 1217
       $238 = 1 << $235; //@line 1218
       if (!($8 & $238)) {
        HEAP32[907] = $8 | $238; //@line 1223
        $$0189$i = $237; //@line 1225
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1225
       } else {
        $242 = $237 + 8 | 0; //@line 1227
        $243 = HEAP32[$242 >> 2] | 0; //@line 1228
        if ((HEAP32[911] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1232
        } else {
         $$0189$i = $243; //@line 1235
         $$pre$phi$iZ2D = $242; //@line 1235
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1238
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1240
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1242
       HEAP32[$234 + 12 >> 2] = $237; //@line 1244
      }
      HEAP32[909] = $$0193$lcssa$i; //@line 1246
      HEAP32[912] = $159; //@line 1247
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1250
     STACKTOP = sp; //@line 1251
     return $$0 | 0; //@line 1251
    }
   } else {
    $$0197 = $6; //@line 1254
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1259
   } else {
    $251 = $0 + 11 | 0; //@line 1261
    $252 = $251 & -8; //@line 1262
    $253 = HEAP32[908] | 0; //@line 1263
    if (!$253) {
     $$0197 = $252; //@line 1266
    } else {
     $255 = 0 - $252 | 0; //@line 1268
     $256 = $251 >>> 8; //@line 1269
     if (!$256) {
      $$0358$i = 0; //@line 1272
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1276
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1280
       $262 = $256 << $261; //@line 1281
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1284
       $267 = $262 << $265; //@line 1286
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1289
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1294
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 1300
      }
     }
     $282 = HEAP32[3932 + ($$0358$i << 2) >> 2] | 0; //@line 1304
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 1308
       $$3$i203 = 0; //@line 1308
       $$3350$i = $255; //@line 1308
       label = 81; //@line 1309
      } else {
       $$0342$i = 0; //@line 1316
       $$0347$i = $255; //@line 1316
       $$0353$i = $282; //@line 1316
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 1316
       $$0362$i = 0; //@line 1316
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 1321
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 1326
          $$435113$i = 0; //@line 1326
          $$435712$i = $$0353$i; //@line 1326
          label = 85; //@line 1327
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 1330
          $$1348$i = $292; //@line 1330
         }
        } else {
         $$1343$i = $$0342$i; //@line 1333
         $$1348$i = $$0347$i; //@line 1333
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 1336
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 1339
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 1343
        $302 = ($$0353$i | 0) == 0; //@line 1344
        if ($302) {
         $$2355$i = $$1363$i; //@line 1349
         $$3$i203 = $$1343$i; //@line 1349
         $$3350$i = $$1348$i; //@line 1349
         label = 81; //@line 1350
         break;
        } else {
         $$0342$i = $$1343$i; //@line 1353
         $$0347$i = $$1348$i; //@line 1353
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 1353
         $$0362$i = $$1363$i; //@line 1353
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 1363
       $309 = $253 & ($306 | 0 - $306); //@line 1366
       if (!$309) {
        $$0197 = $252; //@line 1369
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 1374
       $315 = $313 >>> 12 & 16; //@line 1376
       $316 = $313 >>> $315; //@line 1377
       $318 = $316 >>> 5 & 8; //@line 1379
       $320 = $316 >>> $318; //@line 1381
       $322 = $320 >>> 2 & 4; //@line 1383
       $324 = $320 >>> $322; //@line 1385
       $326 = $324 >>> 1 & 2; //@line 1387
       $328 = $324 >>> $326; //@line 1389
       $330 = $328 >>> 1 & 1; //@line 1391
       $$4$ph$i = 0; //@line 1397
       $$4357$ph$i = HEAP32[3932 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 1397
      } else {
       $$4$ph$i = $$3$i203; //@line 1399
       $$4357$ph$i = $$2355$i; //@line 1399
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 1403
       $$4351$lcssa$i = $$3350$i; //@line 1403
      } else {
       $$414$i = $$4$ph$i; //@line 1405
       $$435113$i = $$3350$i; //@line 1405
       $$435712$i = $$4357$ph$i; //@line 1405
       label = 85; //@line 1406
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 1411
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 1415
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 1416
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 1417
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 1418
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1424
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 1427
        $$4351$lcssa$i = $$$4351$i; //@line 1427
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 1430
        $$435113$i = $$$4351$i; //@line 1430
        label = 85; //@line 1431
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 1437
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[909] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[911] | 0; //@line 1443
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 1446
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 1449
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 1452
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 1456
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 1458
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 1462
         $371 = HEAP32[$370 >> 2] | 0; //@line 1463
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 1466
          $374 = HEAP32[$373 >> 2] | 0; //@line 1467
          if (!$374) {
           $$3372$i = 0; //@line 1470
           break;
          } else {
           $$1370$i = $374; //@line 1473
           $$1374$i = $373; //@line 1473
          }
         } else {
          $$1370$i = $371; //@line 1476
          $$1374$i = $370; //@line 1476
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 1479
          $377 = HEAP32[$376 >> 2] | 0; //@line 1480
          if ($377 | 0) {
           $$1370$i = $377; //@line 1483
           $$1374$i = $376; //@line 1483
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 1486
          $380 = HEAP32[$379 >> 2] | 0; //@line 1487
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 1492
           $$1374$i = $379; //@line 1492
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 1497
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 1500
          $$3372$i = $$1370$i; //@line 1501
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 1506
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 1509
         }
         $364 = $362 + 12 | 0; //@line 1512
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 1516
         }
         $367 = $359 + 8 | 0; //@line 1519
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 1523
          HEAP32[$367 >> 2] = $362; //@line 1524
          $$3372$i = $359; //@line 1525
          break;
         } else {
          _abort(); //@line 1528
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 1536
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 1539
         $386 = 3932 + ($385 << 2) | 0; //@line 1540
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 1545
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 1550
            HEAP32[908] = $391; //@line 1551
            $475 = $391; //@line 1552
            break L164;
           }
          } else {
           if ((HEAP32[911] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 1559
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 1567
            if (!$$3372$i) {
             $475 = $253; //@line 1570
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[911] | 0; //@line 1578
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 1581
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 1585
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 1587
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 1593
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 1597
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 1599
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 1605
         if (!$409) {
          $475 = $253; //@line 1608
         } else {
          if ((HEAP32[911] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 1613
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 1617
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 1619
           $475 = $253; //@line 1620
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 1629
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 1632
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 1634
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 1637
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 1641
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 1644
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 1646
         $428 = $$4351$lcssa$i >>> 3; //@line 1647
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 3668 + ($428 << 1 << 2) | 0; //@line 1651
          $432 = HEAP32[907] | 0; //@line 1652
          $433 = 1 << $428; //@line 1653
          if (!($432 & $433)) {
           HEAP32[907] = $432 | $433; //@line 1658
           $$0368$i = $431; //@line 1660
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 1660
          } else {
           $437 = $431 + 8 | 0; //@line 1662
           $438 = HEAP32[$437 >> 2] | 0; //@line 1663
           if ((HEAP32[911] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 1667
           } else {
            $$0368$i = $438; //@line 1670
            $$pre$phi$i211Z2D = $437; //@line 1670
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 1673
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 1675
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 1677
          HEAP32[$354 + 12 >> 2] = $431; //@line 1679
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 1682
         if (!$444) {
          $$0361$i = 0; //@line 1685
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 1689
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 1693
           $450 = $444 << $449; //@line 1694
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 1697
           $455 = $450 << $453; //@line 1699
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 1702
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 1707
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 1713
          }
         }
         $469 = 3932 + ($$0361$i << 2) | 0; //@line 1716
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 1718
         $471 = $354 + 16 | 0; //@line 1719
         HEAP32[$471 + 4 >> 2] = 0; //@line 1721
         HEAP32[$471 >> 2] = 0; //@line 1722
         $473 = 1 << $$0361$i; //@line 1723
         if (!($475 & $473)) {
          HEAP32[908] = $475 | $473; //@line 1728
          HEAP32[$469 >> 2] = $354; //@line 1729
          HEAP32[$354 + 24 >> 2] = $469; //@line 1731
          HEAP32[$354 + 12 >> 2] = $354; //@line 1733
          HEAP32[$354 + 8 >> 2] = $354; //@line 1735
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 1744
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 1744
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 1751
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 1755
          $494 = HEAP32[$492 >> 2] | 0; //@line 1757
          if (!$494) {
           label = 136; //@line 1760
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 1763
           $$0345$i = $494; //@line 1763
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[911] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 1770
          } else {
           HEAP32[$492 >> 2] = $354; //@line 1773
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 1775
           HEAP32[$354 + 12 >> 2] = $354; //@line 1777
           HEAP32[$354 + 8 >> 2] = $354; //@line 1779
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 1784
          $502 = HEAP32[$501 >> 2] | 0; //@line 1785
          $503 = HEAP32[911] | 0; //@line 1786
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 1792
           HEAP32[$501 >> 2] = $354; //@line 1793
           HEAP32[$354 + 8 >> 2] = $502; //@line 1795
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 1797
           HEAP32[$354 + 24 >> 2] = 0; //@line 1799
           break;
          } else {
           _abort(); //@line 1802
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 1809
       STACKTOP = sp; //@line 1810
       return $$0 | 0; //@line 1810
      } else {
       $$0197 = $252; //@line 1812
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[909] | 0; //@line 1819
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 1822
  $515 = HEAP32[912] | 0; //@line 1823
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 1826
   HEAP32[912] = $517; //@line 1827
   HEAP32[909] = $514; //@line 1828
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 1831
   HEAP32[$515 + $512 >> 2] = $514; //@line 1833
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 1836
  } else {
   HEAP32[909] = 0; //@line 1838
   HEAP32[912] = 0; //@line 1839
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 1842
   $526 = $515 + $512 + 4 | 0; //@line 1844
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 1847
  }
  $$0 = $515 + 8 | 0; //@line 1850
  STACKTOP = sp; //@line 1851
  return $$0 | 0; //@line 1851
 }
 $530 = HEAP32[910] | 0; //@line 1853
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 1856
  HEAP32[910] = $532; //@line 1857
  $533 = HEAP32[913] | 0; //@line 1858
  $534 = $533 + $$0197 | 0; //@line 1859
  HEAP32[913] = $534; //@line 1860
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 1863
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 1866
  $$0 = $533 + 8 | 0; //@line 1868
  STACKTOP = sp; //@line 1869
  return $$0 | 0; //@line 1869
 }
 if (!(HEAP32[1025] | 0)) {
  HEAP32[1027] = 4096; //@line 1874
  HEAP32[1026] = 4096; //@line 1875
  HEAP32[1028] = -1; //@line 1876
  HEAP32[1029] = -1; //@line 1877
  HEAP32[1030] = 0; //@line 1878
  HEAP32[1018] = 0; //@line 1879
  HEAP32[1025] = $1 & -16 ^ 1431655768; //@line 1883
  $548 = 4096; //@line 1884
 } else {
  $548 = HEAP32[1027] | 0; //@line 1887
 }
 $545 = $$0197 + 48 | 0; //@line 1889
 $546 = $$0197 + 47 | 0; //@line 1890
 $547 = $548 + $546 | 0; //@line 1891
 $549 = 0 - $548 | 0; //@line 1892
 $550 = $547 & $549; //@line 1893
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 1896
  STACKTOP = sp; //@line 1897
  return $$0 | 0; //@line 1897
 }
 $552 = HEAP32[1017] | 0; //@line 1899
 if ($552 | 0) {
  $554 = HEAP32[1015] | 0; //@line 1902
  $555 = $554 + $550 | 0; //@line 1903
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 1908
   STACKTOP = sp; //@line 1909
   return $$0 | 0; //@line 1909
  }
 }
 L244 : do {
  if (!(HEAP32[1018] & 4)) {
   $561 = HEAP32[913] | 0; //@line 1917
   L246 : do {
    if (!$561) {
     label = 163; //@line 1921
    } else {
     $$0$i$i = 4076; //@line 1923
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 1925
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 1928
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 1937
      if (!$570) {
       label = 163; //@line 1940
       break L246;
      } else {
       $$0$i$i = $570; //@line 1943
      }
     }
     $595 = $547 - $530 & $549; //@line 1947
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 1950
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 1958
       } else {
        $$723947$i = $595; //@line 1960
        $$748$i = $597; //@line 1960
        label = 180; //@line 1961
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 1965
       $$2253$ph$i = $595; //@line 1965
       label = 171; //@line 1966
      }
     } else {
      $$2234243136$i = 0; //@line 1969
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 1975
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 1978
     } else {
      $574 = $572; //@line 1980
      $575 = HEAP32[1026] | 0; //@line 1981
      $576 = $575 + -1 | 0; //@line 1982
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 1990
      $584 = HEAP32[1015] | 0; //@line 1991
      $585 = $$$i + $584 | 0; //@line 1992
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1017] | 0; //@line 1997
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2004
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2008
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2011
        $$748$i = $572; //@line 2011
        label = 180; //@line 2012
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2015
        $$2253$ph$i = $$$i; //@line 2015
        label = 171; //@line 2016
       }
      } else {
       $$2234243136$i = 0; //@line 2019
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2026
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2035
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2038
       $$748$i = $$2247$ph$i; //@line 2038
       label = 180; //@line 2039
       break L244;
      }
     }
     $607 = HEAP32[1027] | 0; //@line 2043
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2047
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2050
      $$748$i = $$2247$ph$i; //@line 2050
      label = 180; //@line 2051
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2057
      $$2234243136$i = 0; //@line 2058
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2062
      $$748$i = $$2247$ph$i; //@line 2062
      label = 180; //@line 2063
      break L244;
     }
    }
   } while (0);
   HEAP32[1018] = HEAP32[1018] | 4; //@line 2070
   $$4236$i = $$2234243136$i; //@line 2071
   label = 178; //@line 2072
  } else {
   $$4236$i = 0; //@line 2074
   label = 178; //@line 2075
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2081
   $621 = _sbrk(0) | 0; //@line 2082
   $627 = $621 - $620 | 0; //@line 2090
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2092
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2100
    $$748$i = $620; //@line 2100
    label = 180; //@line 2101
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1015] | 0) + $$723947$i | 0; //@line 2107
  HEAP32[1015] = $633; //@line 2108
  if ($633 >>> 0 > (HEAP32[1016] | 0) >>> 0) {
   HEAP32[1016] = $633; //@line 2112
  }
  $636 = HEAP32[913] | 0; //@line 2114
  do {
   if (!$636) {
    $638 = HEAP32[911] | 0; //@line 2118
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[911] = $$748$i; //@line 2123
    }
    HEAP32[1019] = $$748$i; //@line 2125
    HEAP32[1020] = $$723947$i; //@line 2126
    HEAP32[1022] = 0; //@line 2127
    HEAP32[916] = HEAP32[1025]; //@line 2129
    HEAP32[915] = -1; //@line 2130
    HEAP32[920] = 3668; //@line 2131
    HEAP32[919] = 3668; //@line 2132
    HEAP32[922] = 3676; //@line 2133
    HEAP32[921] = 3676; //@line 2134
    HEAP32[924] = 3684; //@line 2135
    HEAP32[923] = 3684; //@line 2136
    HEAP32[926] = 3692; //@line 2137
    HEAP32[925] = 3692; //@line 2138
    HEAP32[928] = 3700; //@line 2139
    HEAP32[927] = 3700; //@line 2140
    HEAP32[930] = 3708; //@line 2141
    HEAP32[929] = 3708; //@line 2142
    HEAP32[932] = 3716; //@line 2143
    HEAP32[931] = 3716; //@line 2144
    HEAP32[934] = 3724; //@line 2145
    HEAP32[933] = 3724; //@line 2146
    HEAP32[936] = 3732; //@line 2147
    HEAP32[935] = 3732; //@line 2148
    HEAP32[938] = 3740; //@line 2149
    HEAP32[937] = 3740; //@line 2150
    HEAP32[940] = 3748; //@line 2151
    HEAP32[939] = 3748; //@line 2152
    HEAP32[942] = 3756; //@line 2153
    HEAP32[941] = 3756; //@line 2154
    HEAP32[944] = 3764; //@line 2155
    HEAP32[943] = 3764; //@line 2156
    HEAP32[946] = 3772; //@line 2157
    HEAP32[945] = 3772; //@line 2158
    HEAP32[948] = 3780; //@line 2159
    HEAP32[947] = 3780; //@line 2160
    HEAP32[950] = 3788; //@line 2161
    HEAP32[949] = 3788; //@line 2162
    HEAP32[952] = 3796; //@line 2163
    HEAP32[951] = 3796; //@line 2164
    HEAP32[954] = 3804; //@line 2165
    HEAP32[953] = 3804; //@line 2166
    HEAP32[956] = 3812; //@line 2167
    HEAP32[955] = 3812; //@line 2168
    HEAP32[958] = 3820; //@line 2169
    HEAP32[957] = 3820; //@line 2170
    HEAP32[960] = 3828; //@line 2171
    HEAP32[959] = 3828; //@line 2172
    HEAP32[962] = 3836; //@line 2173
    HEAP32[961] = 3836; //@line 2174
    HEAP32[964] = 3844; //@line 2175
    HEAP32[963] = 3844; //@line 2176
    HEAP32[966] = 3852; //@line 2177
    HEAP32[965] = 3852; //@line 2178
    HEAP32[968] = 3860; //@line 2179
    HEAP32[967] = 3860; //@line 2180
    HEAP32[970] = 3868; //@line 2181
    HEAP32[969] = 3868; //@line 2182
    HEAP32[972] = 3876; //@line 2183
    HEAP32[971] = 3876; //@line 2184
    HEAP32[974] = 3884; //@line 2185
    HEAP32[973] = 3884; //@line 2186
    HEAP32[976] = 3892; //@line 2187
    HEAP32[975] = 3892; //@line 2188
    HEAP32[978] = 3900; //@line 2189
    HEAP32[977] = 3900; //@line 2190
    HEAP32[980] = 3908; //@line 2191
    HEAP32[979] = 3908; //@line 2192
    HEAP32[982] = 3916; //@line 2193
    HEAP32[981] = 3916; //@line 2194
    $642 = $$723947$i + -40 | 0; //@line 2195
    $644 = $$748$i + 8 | 0; //@line 2197
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2202
    $650 = $$748$i + $649 | 0; //@line 2203
    $651 = $642 - $649 | 0; //@line 2204
    HEAP32[913] = $650; //@line 2205
    HEAP32[910] = $651; //@line 2206
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2209
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2212
    HEAP32[914] = HEAP32[1029]; //@line 2214
   } else {
    $$024367$i = 4076; //@line 2216
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2218
     $658 = $$024367$i + 4 | 0; //@line 2219
     $659 = HEAP32[$658 >> 2] | 0; //@line 2220
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2224
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2228
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2233
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2247
       $673 = (HEAP32[910] | 0) + $$723947$i | 0; //@line 2249
       $675 = $636 + 8 | 0; //@line 2251
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2256
       $681 = $636 + $680 | 0; //@line 2257
       $682 = $673 - $680 | 0; //@line 2258
       HEAP32[913] = $681; //@line 2259
       HEAP32[910] = $682; //@line 2260
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2263
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2266
       HEAP32[914] = HEAP32[1029]; //@line 2268
       break;
      }
     }
    }
    $688 = HEAP32[911] | 0; //@line 2273
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[911] = $$748$i; //@line 2276
     $753 = $$748$i; //@line 2277
    } else {
     $753 = $688; //@line 2279
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2281
    $$124466$i = 4076; //@line 2282
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2287
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2291
     if (!$694) {
      $$0$i$i$i = 4076; //@line 2294
      break;
     } else {
      $$124466$i = $694; //@line 2297
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 2306
      $700 = $$124466$i + 4 | 0; //@line 2307
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 2310
      $704 = $$748$i + 8 | 0; //@line 2312
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 2318
      $712 = $690 + 8 | 0; //@line 2320
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 2326
      $722 = $710 + $$0197 | 0; //@line 2330
      $723 = $718 - $710 - $$0197 | 0; //@line 2331
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 2334
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[910] | 0) + $723 | 0; //@line 2339
        HEAP32[910] = $728; //@line 2340
        HEAP32[913] = $722; //@line 2341
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 2344
       } else {
        if ((HEAP32[912] | 0) == ($718 | 0)) {
         $734 = (HEAP32[909] | 0) + $723 | 0; //@line 2350
         HEAP32[909] = $734; //@line 2351
         HEAP32[912] = $722; //@line 2352
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 2355
         HEAP32[$722 + $734 >> 2] = $734; //@line 2357
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 2361
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 2365
         $743 = $739 >>> 3; //@line 2366
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 2371
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 2373
           $750 = 3668 + ($743 << 1 << 2) | 0; //@line 2375
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 2381
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 2390
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[907] = HEAP32[907] & ~(1 << $743); //@line 2400
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 2407
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 2411
             }
             $764 = $748 + 8 | 0; //@line 2414
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 2418
              break;
             }
             _abort(); //@line 2421
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 2426
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 2427
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 2430
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 2432
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 2436
             $783 = $782 + 4 | 0; //@line 2437
             $784 = HEAP32[$783 >> 2] | 0; //@line 2438
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 2441
              if (!$786) {
               $$3$i$i = 0; //@line 2444
               break;
              } else {
               $$1291$i$i = $786; //@line 2447
               $$1293$i$i = $782; //@line 2447
              }
             } else {
              $$1291$i$i = $784; //@line 2450
              $$1293$i$i = $783; //@line 2450
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 2453
              $789 = HEAP32[$788 >> 2] | 0; //@line 2454
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 2457
               $$1293$i$i = $788; //@line 2457
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 2460
              $792 = HEAP32[$791 >> 2] | 0; //@line 2461
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 2466
               $$1293$i$i = $791; //@line 2466
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 2471
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 2474
              $$3$i$i = $$1291$i$i; //@line 2475
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 2480
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 2483
             }
             $776 = $774 + 12 | 0; //@line 2486
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 2490
             }
             $779 = $771 + 8 | 0; //@line 2493
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 2497
              HEAP32[$779 >> 2] = $774; //@line 2498
              $$3$i$i = $771; //@line 2499
              break;
             } else {
              _abort(); //@line 2502
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 2512
           $798 = 3932 + ($797 << 2) | 0; //@line 2513
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 2518
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[908] = HEAP32[908] & ~(1 << $797); //@line 2527
             break L311;
            } else {
             if ((HEAP32[911] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 2533
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 2541
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[911] | 0; //@line 2551
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 2554
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 2558
           $815 = $718 + 16 | 0; //@line 2559
           $816 = HEAP32[$815 >> 2] | 0; //@line 2560
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 2566
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 2570
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 2572
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 2578
           if (!$822) {
            break;
           }
           if ((HEAP32[911] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 2586
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 2590
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 2592
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 2599
         $$0287$i$i = $742 + $723 | 0; //@line 2599
        } else {
         $$0$i17$i = $718; //@line 2601
         $$0287$i$i = $723; //@line 2601
        }
        $830 = $$0$i17$i + 4 | 0; //@line 2603
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 2606
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 2609
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 2611
        $836 = $$0287$i$i >>> 3; //@line 2612
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 3668 + ($836 << 1 << 2) | 0; //@line 2616
         $840 = HEAP32[907] | 0; //@line 2617
         $841 = 1 << $836; //@line 2618
         do {
          if (!($840 & $841)) {
           HEAP32[907] = $840 | $841; //@line 2624
           $$0295$i$i = $839; //@line 2626
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 2626
          } else {
           $845 = $839 + 8 | 0; //@line 2628
           $846 = HEAP32[$845 >> 2] | 0; //@line 2629
           if ((HEAP32[911] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 2633
            $$pre$phi$i19$iZ2D = $845; //@line 2633
            break;
           }
           _abort(); //@line 2636
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 2640
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 2642
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 2644
         HEAP32[$722 + 12 >> 2] = $839; //@line 2646
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 2649
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 2653
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 2657
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 2662
          $858 = $852 << $857; //@line 2663
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 2666
          $863 = $858 << $861; //@line 2668
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 2671
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 2676
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 2682
         }
        } while (0);
        $877 = 3932 + ($$0296$i$i << 2) | 0; //@line 2685
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 2687
        $879 = $722 + 16 | 0; //@line 2688
        HEAP32[$879 + 4 >> 2] = 0; //@line 2690
        HEAP32[$879 >> 2] = 0; //@line 2691
        $881 = HEAP32[908] | 0; //@line 2692
        $882 = 1 << $$0296$i$i; //@line 2693
        if (!($881 & $882)) {
         HEAP32[908] = $881 | $882; //@line 2698
         HEAP32[$877 >> 2] = $722; //@line 2699
         HEAP32[$722 + 24 >> 2] = $877; //@line 2701
         HEAP32[$722 + 12 >> 2] = $722; //@line 2703
         HEAP32[$722 + 8 >> 2] = $722; //@line 2705
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 2714
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 2714
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 2721
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 2725
         $902 = HEAP32[$900 >> 2] | 0; //@line 2727
         if (!$902) {
          label = 260; //@line 2730
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 2733
          $$0289$i$i = $902; //@line 2733
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[911] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 2740
         } else {
          HEAP32[$900 >> 2] = $722; //@line 2743
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 2745
          HEAP32[$722 + 12 >> 2] = $722; //@line 2747
          HEAP32[$722 + 8 >> 2] = $722; //@line 2749
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 2754
         $910 = HEAP32[$909 >> 2] | 0; //@line 2755
         $911 = HEAP32[911] | 0; //@line 2756
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 2762
          HEAP32[$909 >> 2] = $722; //@line 2763
          HEAP32[$722 + 8 >> 2] = $910; //@line 2765
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 2767
          HEAP32[$722 + 24 >> 2] = 0; //@line 2769
          break;
         } else {
          _abort(); //@line 2772
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 2779
      STACKTOP = sp; //@line 2780
      return $$0 | 0; //@line 2780
     } else {
      $$0$i$i$i = 4076; //@line 2782
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 2786
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 2791
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 2799
    }
    $927 = $923 + -47 | 0; //@line 2801
    $929 = $927 + 8 | 0; //@line 2803
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 2809
    $936 = $636 + 16 | 0; //@line 2810
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 2812
    $939 = $938 + 8 | 0; //@line 2813
    $940 = $938 + 24 | 0; //@line 2814
    $941 = $$723947$i + -40 | 0; //@line 2815
    $943 = $$748$i + 8 | 0; //@line 2817
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 2822
    $949 = $$748$i + $948 | 0; //@line 2823
    $950 = $941 - $948 | 0; //@line 2824
    HEAP32[913] = $949; //@line 2825
    HEAP32[910] = $950; //@line 2826
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 2829
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 2832
    HEAP32[914] = HEAP32[1029]; //@line 2834
    $956 = $938 + 4 | 0; //@line 2835
    HEAP32[$956 >> 2] = 27; //@line 2836
    HEAP32[$939 >> 2] = HEAP32[1019]; //@line 2837
    HEAP32[$939 + 4 >> 2] = HEAP32[1020]; //@line 2837
    HEAP32[$939 + 8 >> 2] = HEAP32[1021]; //@line 2837
    HEAP32[$939 + 12 >> 2] = HEAP32[1022]; //@line 2837
    HEAP32[1019] = $$748$i; //@line 2838
    HEAP32[1020] = $$723947$i; //@line 2839
    HEAP32[1022] = 0; //@line 2840
    HEAP32[1021] = $939; //@line 2841
    $958 = $940; //@line 2842
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 2844
     HEAP32[$958 >> 2] = 7; //@line 2845
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 2858
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 2861
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 2864
     HEAP32[$938 >> 2] = $964; //@line 2865
     $969 = $964 >>> 3; //@line 2866
     if ($964 >>> 0 < 256) {
      $972 = 3668 + ($969 << 1 << 2) | 0; //@line 2870
      $973 = HEAP32[907] | 0; //@line 2871
      $974 = 1 << $969; //@line 2872
      if (!($973 & $974)) {
       HEAP32[907] = $973 | $974; //@line 2877
       $$0211$i$i = $972; //@line 2879
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 2879
      } else {
       $978 = $972 + 8 | 0; //@line 2881
       $979 = HEAP32[$978 >> 2] | 0; //@line 2882
       if ((HEAP32[911] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 2886
       } else {
        $$0211$i$i = $979; //@line 2889
        $$pre$phi$i$iZ2D = $978; //@line 2889
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 2892
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 2894
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 2896
      HEAP32[$636 + 12 >> 2] = $972; //@line 2898
      break;
     }
     $985 = $964 >>> 8; //@line 2901
     if (!$985) {
      $$0212$i$i = 0; //@line 2904
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 2908
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 2912
       $991 = $985 << $990; //@line 2913
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 2916
       $996 = $991 << $994; //@line 2918
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 2921
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 2926
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 2932
      }
     }
     $1010 = 3932 + ($$0212$i$i << 2) | 0; //@line 2935
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 2937
     HEAP32[$636 + 20 >> 2] = 0; //@line 2939
     HEAP32[$936 >> 2] = 0; //@line 2940
     $1013 = HEAP32[908] | 0; //@line 2941
     $1014 = 1 << $$0212$i$i; //@line 2942
     if (!($1013 & $1014)) {
      HEAP32[908] = $1013 | $1014; //@line 2947
      HEAP32[$1010 >> 2] = $636; //@line 2948
      HEAP32[$636 + 24 >> 2] = $1010; //@line 2950
      HEAP32[$636 + 12 >> 2] = $636; //@line 2952
      HEAP32[$636 + 8 >> 2] = $636; //@line 2954
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 2963
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 2963
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 2970
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 2974
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 2976
      if (!$1034) {
       label = 286; //@line 2979
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 2982
       $$0207$i$i = $1034; //@line 2982
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[911] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 2989
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 2992
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 2994
       HEAP32[$636 + 12 >> 2] = $636; //@line 2996
       HEAP32[$636 + 8 >> 2] = $636; //@line 2998
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3003
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3004
      $1043 = HEAP32[911] | 0; //@line 3005
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3011
       HEAP32[$1041 >> 2] = $636; //@line 3012
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3014
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3016
       HEAP32[$636 + 24 >> 2] = 0; //@line 3018
       break;
      } else {
       _abort(); //@line 3021
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[910] | 0; //@line 3028
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3031
   HEAP32[910] = $1054; //@line 3032
   $1055 = HEAP32[913] | 0; //@line 3033
   $1056 = $1055 + $$0197 | 0; //@line 3034
   HEAP32[913] = $1056; //@line 3035
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3038
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3041
   $$0 = $1055 + 8 | 0; //@line 3043
   STACKTOP = sp; //@line 3044
   return $$0 | 0; //@line 3044
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3048
 $$0 = 0; //@line 3049
 STACKTOP = sp; //@line 3050
 return $$0 | 0; //@line 3050
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6536
 STACKTOP = STACKTOP + 560 | 0; //@line 6537
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 6537
 $6 = sp + 8 | 0; //@line 6538
 $7 = sp; //@line 6539
 $8 = sp + 524 | 0; //@line 6540
 $9 = $8; //@line 6541
 $10 = sp + 512 | 0; //@line 6542
 HEAP32[$7 >> 2] = 0; //@line 6543
 $11 = $10 + 12 | 0; //@line 6544
 ___DOUBLE_BITS_677($1) | 0; //@line 6545
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 6550
  $$0520 = 1; //@line 6550
  $$0521 = 1470; //@line 6550
 } else {
  $$0471 = $1; //@line 6561
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 6561
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1471 : 1476 : 1473; //@line 6561
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 6563
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 6572
   $31 = $$0520 + 3 | 0; //@line 6577
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 6579
   _out_670($0, $$0521, $$0520); //@line 6580
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1497 : 1501 : $27 ? 1489 : 1493, 3); //@line 6581
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 6583
   $$sink560 = $31; //@line 6584
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 6587
   $36 = $35 != 0.0; //@line 6588
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 6592
   }
   $39 = $5 | 32; //@line 6594
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 6597
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 6600
    $44 = $$0520 | 2; //@line 6601
    $46 = 12 - $3 | 0; //@line 6603
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 6608
     } else {
      $$0509585 = 8.0; //@line 6610
      $$1508586 = $46; //@line 6610
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 6612
       $$0509585 = $$0509585 * 16.0; //@line 6613
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 6628
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 6633
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 6638
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 6641
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 6644
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 6647
     HEAP8[$68 >> 0] = 48; //@line 6648
     $$0511 = $68; //@line 6649
    } else {
     $$0511 = $66; //@line 6651
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 6658
    $76 = $$0511 + -2 | 0; //@line 6661
    HEAP8[$76 >> 0] = $5 + 15; //@line 6662
    $77 = ($3 | 0) < 1; //@line 6663
    $79 = ($4 & 8 | 0) == 0; //@line 6665
    $$0523 = $8; //@line 6666
    $$2473 = $$1472; //@line 6666
    while (1) {
     $80 = ~~$$2473; //@line 6668
     $86 = $$0523 + 1 | 0; //@line 6674
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1505 + $80 >> 0]; //@line 6675
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 6678
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 6687
      } else {
       HEAP8[$86 >> 0] = 46; //@line 6690
       $$1524 = $$0523 + 2 | 0; //@line 6691
      }
     } else {
      $$1524 = $86; //@line 6694
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 6698
     }
    }
    $$pre693 = $$1524; //@line 6704
    if (!$3) {
     label = 24; //@line 6706
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 6714
      $$sink = $3 + 2 | 0; //@line 6714
     } else {
      label = 24; //@line 6716
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 6720
     $$pre$phi691Z2D = $101; //@line 6721
     $$sink = $101; //@line 6721
    }
    $104 = $11 - $76 | 0; //@line 6725
    $106 = $104 + $44 + $$sink | 0; //@line 6727
    _pad_676($0, 32, $2, $106, $4); //@line 6728
    _out_670($0, $$0521$, $44); //@line 6729
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 6731
    _out_670($0, $8, $$pre$phi691Z2D); //@line 6732
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 6734
    _out_670($0, $76, $104); //@line 6735
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 6737
    $$sink560 = $106; //@line 6738
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 6742
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 6746
    HEAP32[$7 >> 2] = $113; //@line 6747
    $$3 = $35 * 268435456.0; //@line 6748
    $$pr = $113; //@line 6748
   } else {
    $$3 = $35; //@line 6751
    $$pr = HEAP32[$7 >> 2] | 0; //@line 6751
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 6755
   $$0498 = $$561; //@line 6756
   $$4 = $$3; //@line 6756
   do {
    $116 = ~~$$4 >>> 0; //@line 6758
    HEAP32[$$0498 >> 2] = $116; //@line 6759
    $$0498 = $$0498 + 4 | 0; //@line 6760
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 6763
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 6773
    $$1499662 = $$0498; //@line 6773
    $124 = $$pr; //@line 6773
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 6776
     $$0488655 = $$1499662 + -4 | 0; //@line 6777
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 6780
     } else {
      $$0488657 = $$0488655; //@line 6782
      $$0497656 = 0; //@line 6782
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 6785
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 6787
       $131 = tempRet0; //@line 6788
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6789
       HEAP32[$$0488657 >> 2] = $132; //@line 6791
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6792
       $$0488657 = $$0488657 + -4 | 0; //@line 6794
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 6804
      } else {
       $138 = $$1482663 + -4 | 0; //@line 6806
       HEAP32[$138 >> 2] = $$0497656; //@line 6807
       $$2483$ph = $138; //@line 6808
      }
     }
     $$2500 = $$1499662; //@line 6811
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 6817
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 6821
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 6827
     HEAP32[$7 >> 2] = $144; //@line 6828
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 6831
      $$1499662 = $$2500; //@line 6831
      $124 = $144; //@line 6831
     } else {
      $$1482$lcssa = $$2483$ph; //@line 6833
      $$1499$lcssa = $$2500; //@line 6833
      $$pr566 = $144; //@line 6833
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 6838
    $$1499$lcssa = $$0498; //@line 6838
    $$pr566 = $$pr; //@line 6838
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 6844
    $150 = ($39 | 0) == 102; //@line 6845
    $$3484650 = $$1482$lcssa; //@line 6846
    $$3501649 = $$1499$lcssa; //@line 6846
    $152 = $$pr566; //@line 6846
    while (1) {
     $151 = 0 - $152 | 0; //@line 6848
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 6850
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 6854
      $161 = 1e9 >>> $154; //@line 6855
      $$0487644 = 0; //@line 6856
      $$1489643 = $$3484650; //@line 6856
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 6858
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 6862
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 6863
       $$1489643 = $$1489643 + 4 | 0; //@line 6864
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6875
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 6878
       $$4502 = $$3501649; //@line 6878
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 6881
       $$$3484700 = $$$3484; //@line 6882
       $$4502 = $$3501649 + 4 | 0; //@line 6882
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6889
      $$4502 = $$3501649; //@line 6889
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 6891
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 6898
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 6900
     HEAP32[$7 >> 2] = $152; //@line 6901
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 6906
      $$3501$lcssa = $$$4502; //@line 6906
      break;
     } else {
      $$3484650 = $$$3484700; //@line 6904
      $$3501649 = $$$4502; //@line 6904
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 6911
    $$3501$lcssa = $$1499$lcssa; //@line 6911
   }
   $185 = $$561; //@line 6914
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 6919
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 6920
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 6923
    } else {
     $$0514639 = $189; //@line 6925
     $$0530638 = 10; //@line 6925
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 6927
      $193 = $$0514639 + 1 | 0; //@line 6928
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 6931
       break;
      } else {
       $$0514639 = $193; //@line 6934
      }
     }
    }
   } else {
    $$1515 = 0; //@line 6939
   }
   $198 = ($39 | 0) == 103; //@line 6944
   $199 = ($$540 | 0) != 0; //@line 6945
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 6948
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 6957
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 6960
    $213 = ($209 | 0) % 9 | 0; //@line 6961
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 6964
     $$1531632 = 10; //@line 6964
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 6967
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 6970
       $$1531632 = $215; //@line 6970
      } else {
       $$1531$lcssa = $215; //@line 6972
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 6977
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 6979
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 6980
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 6983
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 6986
     $$4518 = $$1515; //@line 6986
     $$8 = $$3484$lcssa; //@line 6986
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 6991
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 6992
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 6997
     if (!$$0520) {
      $$1467 = $$$564; //@line 7000
      $$1469 = $$543; //@line 7000
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 7003
      $$1467 = $230 ? -$$$564 : $$$564; //@line 7008
      $$1469 = $230 ? -$$543 : $$543; //@line 7008
     }
     $233 = $217 - $218 | 0; //@line 7010
     HEAP32[$212 >> 2] = $233; //@line 7011
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 7015
      HEAP32[$212 >> 2] = $236; //@line 7016
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 7019
       $$sink547625 = $212; //@line 7019
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 7021
        HEAP32[$$sink547625 >> 2] = 0; //@line 7022
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 7025
         HEAP32[$240 >> 2] = 0; //@line 7026
         $$6 = $240; //@line 7027
        } else {
         $$6 = $$5486626; //@line 7029
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 7032
        HEAP32[$238 >> 2] = $242; //@line 7033
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 7036
         $$sink547625 = $238; //@line 7036
        } else {
         $$5486$lcssa = $$6; //@line 7038
         $$sink547$lcssa = $238; //@line 7038
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 7043
       $$sink547$lcssa = $212; //@line 7043
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 7048
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 7049
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 7052
       $$4518 = $247; //@line 7052
       $$8 = $$5486$lcssa; //@line 7052
      } else {
       $$2516621 = $247; //@line 7054
       $$2532620 = 10; //@line 7054
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 7056
        $251 = $$2516621 + 1 | 0; //@line 7057
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 7060
         $$4518 = $251; //@line 7060
         $$8 = $$5486$lcssa; //@line 7060
         break;
        } else {
         $$2516621 = $251; //@line 7063
        }
       }
      }
     } else {
      $$4492 = $212; //@line 7068
      $$4518 = $$1515; //@line 7068
      $$8 = $$3484$lcssa; //@line 7068
     }
    }
    $253 = $$4492 + 4 | 0; //@line 7071
    $$5519$ph = $$4518; //@line 7074
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 7074
    $$9$ph = $$8; //@line 7074
   } else {
    $$5519$ph = $$1515; //@line 7076
    $$7505$ph = $$3501$lcssa; //@line 7076
    $$9$ph = $$3484$lcssa; //@line 7076
   }
   $$7505 = $$7505$ph; //@line 7078
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 7082
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 7085
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 7089
    } else {
     $$lcssa675 = 1; //@line 7091
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 7095
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 7100
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 7108
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 7108
     } else {
      $$0479 = $5 + -2 | 0; //@line 7112
      $$2476 = $$540$ + -1 | 0; //@line 7112
     }
     $267 = $4 & 8; //@line 7114
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 7119
       if (!$270) {
        $$2529 = 9; //@line 7122
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 7127
         $$3533616 = 10; //@line 7127
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 7129
          $275 = $$1528617 + 1 | 0; //@line 7130
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 7136
           break;
          } else {
           $$1528617 = $275; //@line 7134
          }
         }
        } else {
         $$2529 = 0; //@line 7141
        }
       }
      } else {
       $$2529 = 9; //@line 7145
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 7153
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 7155
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 7157
       $$1480 = $$0479; //@line 7160
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 7160
       $$pre$phi698Z2D = 0; //@line 7160
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 7164
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 7166
       $$1480 = $$0479; //@line 7169
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 7169
       $$pre$phi698Z2D = 0; //@line 7169
       break;
      }
     } else {
      $$1480 = $$0479; //@line 7173
      $$3477 = $$2476; //@line 7173
      $$pre$phi698Z2D = $267; //@line 7173
     }
    } else {
     $$1480 = $5; //@line 7177
     $$3477 = $$540; //@line 7177
     $$pre$phi698Z2D = $4 & 8; //@line 7177
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 7180
   $294 = ($292 | 0) != 0 & 1; //@line 7182
   $296 = ($$1480 | 32 | 0) == 102; //@line 7184
   if ($296) {
    $$2513 = 0; //@line 7188
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 7188
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 7191
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7194
    $304 = $11; //@line 7195
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 7200
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 7202
      HEAP8[$308 >> 0] = 48; //@line 7203
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 7208
      } else {
       $$1512$lcssa = $308; //@line 7210
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 7215
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 7222
    $318 = $$1512$lcssa + -2 | 0; //@line 7224
    HEAP8[$318 >> 0] = $$1480; //@line 7225
    $$2513 = $318; //@line 7228
    $$pn = $304 - $318 | 0; //@line 7228
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 7233
   _pad_676($0, 32, $2, $323, $4); //@line 7234
   _out_670($0, $$0521, $$0520); //@line 7235
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 7237
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 7240
    $326 = $8 + 9 | 0; //@line 7241
    $327 = $326; //@line 7242
    $328 = $8 + 8 | 0; //@line 7243
    $$5493600 = $$0496$$9; //@line 7244
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 7247
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 7252
       $$1465 = $328; //@line 7253
      } else {
       $$1465 = $330; //@line 7255
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 7262
       $$0464597 = $330; //@line 7263
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 7265
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 7268
        } else {
         $$1465 = $335; //@line 7270
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 7275
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 7280
     $$5493600 = $$5493600 + 4 | 0; //@line 7281
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1521, 1); //@line 7291
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 7297
     $$6494592 = $$5493600; //@line 7297
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 7300
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 7305
       $$0463587 = $347; //@line 7306
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 7308
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 7311
        } else {
         $$0463$lcssa = $351; //@line 7313
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 7318
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 7322
      $$6494592 = $$6494592 + 4 | 0; //@line 7323
      $356 = $$4478593 + -9 | 0; //@line 7324
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 7331
       break;
      } else {
       $$4478593 = $356; //@line 7329
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 7336
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 7339
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 7342
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 7345
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 7346
     $365 = $363; //@line 7347
     $366 = 0 - $9 | 0; //@line 7348
     $367 = $8 + 8 | 0; //@line 7349
     $$5605 = $$3477; //@line 7350
     $$7495604 = $$9$ph; //@line 7350
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 7353
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 7356
       $$0 = $367; //@line 7357
      } else {
       $$0 = $369; //@line 7359
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 7364
        _out_670($0, $$0, 1); //@line 7365
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 7369
         break;
        }
        _out_670($0, 1521, 1); //@line 7372
        $$2 = $375; //@line 7373
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 7377
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 7382
        $$1601 = $$0; //@line 7383
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 7385
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 7388
         } else {
          $$2 = $373; //@line 7390
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 7397
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 7400
      $381 = $$5605 - $378 | 0; //@line 7401
      $$7495604 = $$7495604 + 4 | 0; //@line 7402
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 7409
       break;
      } else {
       $$5605 = $381; //@line 7407
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 7414
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 7417
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 7421
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 7424
   $$sink560 = $323; //@line 7425
  }
 } while (0);
 STACKTOP = sp; //@line 7430
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 7430
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 5108
 STACKTOP = STACKTOP + 64 | 0; //@line 5109
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 5109
 $5 = sp + 16 | 0; //@line 5110
 $6 = sp; //@line 5111
 $7 = sp + 24 | 0; //@line 5112
 $8 = sp + 8 | 0; //@line 5113
 $9 = sp + 20 | 0; //@line 5114
 HEAP32[$5 >> 2] = $1; //@line 5115
 $10 = ($0 | 0) != 0; //@line 5116
 $11 = $7 + 40 | 0; //@line 5117
 $12 = $11; //@line 5118
 $13 = $7 + 39 | 0; //@line 5119
 $14 = $8 + 4 | 0; //@line 5120
 $$0243 = 0; //@line 5121
 $$0247 = 0; //@line 5121
 $$0269 = 0; //@line 5121
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 5130
     $$1248 = -1; //@line 5131
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 5135
     break;
    }
   } else {
    $$1248 = $$0247; //@line 5139
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 5142
  $21 = HEAP8[$20 >> 0] | 0; //@line 5143
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 5146
   break;
  } else {
   $23 = $21; //@line 5149
   $25 = $20; //@line 5149
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 5154
     $27 = $25; //@line 5154
     label = 9; //@line 5155
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 5160
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 5167
   HEAP32[$5 >> 2] = $24; //@line 5168
   $23 = HEAP8[$24 >> 0] | 0; //@line 5170
   $25 = $24; //@line 5170
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 5175
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 5180
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 5183
     $27 = $27 + 2 | 0; //@line 5184
     HEAP32[$5 >> 2] = $27; //@line 5185
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 5192
      break;
     } else {
      $$0249303 = $30; //@line 5189
      label = 9; //@line 5190
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 5200
  if ($10) {
   _out_670($0, $20, $36); //@line 5202
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 5206
   $$0247 = $$1248; //@line 5206
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 5214
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 5215
  if ($43) {
   $$0253 = -1; //@line 5217
   $$1270 = $$0269; //@line 5217
   $$sink = 1; //@line 5217
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 5227
    $$1270 = 1; //@line 5227
    $$sink = 3; //@line 5227
   } else {
    $$0253 = -1; //@line 5229
    $$1270 = $$0269; //@line 5229
    $$sink = 1; //@line 5229
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 5232
  HEAP32[$5 >> 2] = $51; //@line 5233
  $52 = HEAP8[$51 >> 0] | 0; //@line 5234
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 5236
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 5243
   $$lcssa291 = $52; //@line 5243
   $$lcssa292 = $51; //@line 5243
  } else {
   $$0262309 = 0; //@line 5245
   $60 = $52; //@line 5245
   $65 = $51; //@line 5245
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 5250
    $64 = $65 + 1 | 0; //@line 5251
    HEAP32[$5 >> 2] = $64; //@line 5252
    $66 = HEAP8[$64 >> 0] | 0; //@line 5253
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 5255
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 5262
     $$lcssa291 = $66; //@line 5262
     $$lcssa292 = $64; //@line 5262
     break;
    } else {
     $$0262309 = $63; //@line 5265
     $60 = $66; //@line 5265
     $65 = $64; //@line 5265
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 5277
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 5279
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 5284
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 5289
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 5301
     $$2271 = 1; //@line 5301
     $storemerge274 = $79 + 3 | 0; //@line 5301
    } else {
     label = 23; //@line 5303
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 5307
    if ($$1270 | 0) {
     $$0 = -1; //@line 5310
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5325
     $106 = HEAP32[$105 >> 2] | 0; //@line 5326
     HEAP32[$2 >> 2] = $105 + 4; //@line 5328
     $363 = $106; //@line 5329
    } else {
     $363 = 0; //@line 5331
    }
    $$0259 = $363; //@line 5335
    $$2271 = 0; //@line 5335
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 5335
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 5337
   $109 = ($$0259 | 0) < 0; //@line 5338
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 5343
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 5343
   $$3272 = $$2271; //@line 5343
   $115 = $storemerge274; //@line 5343
  } else {
   $112 = _getint_671($5) | 0; //@line 5345
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 5348
    break;
   }
   $$1260 = $112; //@line 5352
   $$1263 = $$0262$lcssa; //@line 5352
   $$3272 = $$1270; //@line 5352
   $115 = HEAP32[$5 >> 2] | 0; //@line 5352
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 5363
     $156 = _getint_671($5) | 0; //@line 5364
     $$0254 = $156; //@line 5366
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 5366
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 5375
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 5380
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 5385
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 5392
      $144 = $125 + 4 | 0; //@line 5396
      HEAP32[$5 >> 2] = $144; //@line 5397
      $$0254 = $140; //@line 5398
      $$pre345 = $144; //@line 5398
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 5404
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5419
     $152 = HEAP32[$151 >> 2] | 0; //@line 5420
     HEAP32[$2 >> 2] = $151 + 4; //@line 5422
     $364 = $152; //@line 5423
    } else {
     $364 = 0; //@line 5425
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 5428
    HEAP32[$5 >> 2] = $154; //@line 5429
    $$0254 = $364; //@line 5430
    $$pre345 = $154; //@line 5430
   } else {
    $$0254 = -1; //@line 5432
    $$pre345 = $115; //@line 5432
   }
  } while (0);
  $$0252 = 0; //@line 5435
  $158 = $$pre345; //@line 5435
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 5442
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 5445
   HEAP32[$5 >> 2] = $158; //@line 5446
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (989 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 5451
   $168 = $167 & 255; //@line 5452
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 5456
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 5463
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 5467
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 5471
     break L1;
    } else {
     label = 50; //@line 5474
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 5479
     $176 = $3 + ($$0253 << 3) | 0; //@line 5481
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 5486
     $182 = $6; //@line 5487
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 5489
     HEAP32[$182 + 4 >> 2] = $181; //@line 5492
     label = 50; //@line 5493
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 5497
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 5500
    $187 = HEAP32[$5 >> 2] | 0; //@line 5502
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 5506
   if ($10) {
    $187 = $158; //@line 5508
   } else {
    $$0243 = 0; //@line 5510
    $$0247 = $$1248; //@line 5510
    $$0269 = $$3272; //@line 5510
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 5516
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 5522
  $196 = $$1263 & -65537; //@line 5525
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 5526
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5534
       $$0243 = 0; //@line 5535
       $$0247 = $$1248; //@line 5535
       $$0269 = $$3272; //@line 5535
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5541
       $$0243 = 0; //@line 5542
       $$0247 = $$1248; //@line 5542
       $$0269 = $$3272; //@line 5542
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 5550
       HEAP32[$208 >> 2] = $$1248; //@line 5552
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 5555
       $$0243 = 0; //@line 5556
       $$0247 = $$1248; //@line 5556
       $$0269 = $$3272; //@line 5556
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 5563
       $$0243 = 0; //@line 5564
       $$0247 = $$1248; //@line 5564
       $$0269 = $$3272; //@line 5564
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 5571
       $$0243 = 0; //@line 5572
       $$0247 = $$1248; //@line 5572
       $$0269 = $$3272; //@line 5572
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5578
       $$0243 = 0; //@line 5579
       $$0247 = $$1248; //@line 5579
       $$0269 = $$3272; //@line 5579
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 5587
       HEAP32[$220 >> 2] = $$1248; //@line 5589
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 5592
       $$0243 = 0; //@line 5593
       $$0247 = $$1248; //@line 5593
       $$0269 = $$3272; //@line 5593
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 5598
       $$0247 = $$1248; //@line 5598
       $$0269 = $$3272; //@line 5598
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 5608
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 5608
     $$3265 = $$1263$ | 8; //@line 5608
     label = 62; //@line 5609
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 5613
     $$1255 = $$0254; //@line 5613
     $$3265 = $$1263$; //@line 5613
     label = 62; //@line 5614
     break;
    }
   case 111:
    {
     $242 = $6; //@line 5618
     $244 = HEAP32[$242 >> 2] | 0; //@line 5620
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 5623
     $248 = _fmt_o($244, $247, $11) | 0; //@line 5624
     $252 = $12 - $248 | 0; //@line 5628
     $$0228 = $248; //@line 5633
     $$1233 = 0; //@line 5633
     $$1238 = 1453; //@line 5633
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 5633
     $$4266 = $$1263$; //@line 5633
     $281 = $244; //@line 5633
     $283 = $247; //@line 5633
     label = 68; //@line 5634
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 5638
     $258 = HEAP32[$256 >> 2] | 0; //@line 5640
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 5643
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 5646
      $264 = tempRet0; //@line 5647
      $265 = $6; //@line 5648
      HEAP32[$265 >> 2] = $263; //@line 5650
      HEAP32[$265 + 4 >> 2] = $264; //@line 5653
      $$0232 = 1; //@line 5654
      $$0237 = 1453; //@line 5654
      $275 = $263; //@line 5654
      $276 = $264; //@line 5654
      label = 67; //@line 5655
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 5667
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1453 : 1455 : 1454; //@line 5667
      $275 = $258; //@line 5667
      $276 = $261; //@line 5667
      label = 67; //@line 5668
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 5674
     $$0232 = 0; //@line 5680
     $$0237 = 1453; //@line 5680
     $275 = HEAP32[$197 >> 2] | 0; //@line 5680
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 5680
     label = 67; //@line 5681
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 5692
     $$2 = $13; //@line 5693
     $$2234 = 0; //@line 5693
     $$2239 = 1453; //@line 5693
     $$2251 = $11; //@line 5693
     $$5 = 1; //@line 5693
     $$6268 = $196; //@line 5693
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 5700
     label = 72; //@line 5701
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 5705
     $$1 = $302 | 0 ? $302 : 1463; //@line 5708
     label = 72; //@line 5709
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 5719
     HEAP32[$14 >> 2] = 0; //@line 5720
     HEAP32[$6 >> 2] = $8; //@line 5721
     $$4258354 = -1; //@line 5722
     $365 = $8; //@line 5722
     label = 76; //@line 5723
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 5727
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 5730
      $$0240$lcssa356 = 0; //@line 5731
      label = 85; //@line 5732
     } else {
      $$4258354 = $$0254; //@line 5734
      $365 = $$pre348; //@line 5734
      label = 76; //@line 5735
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 5742
     $$0247 = $$1248; //@line 5742
     $$0269 = $$3272; //@line 5742
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 5747
     $$2234 = 0; //@line 5747
     $$2239 = 1453; //@line 5747
     $$2251 = $11; //@line 5747
     $$5 = $$0254; //@line 5747
     $$6268 = $$1263$; //@line 5747
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 5753
    $227 = $6; //@line 5754
    $229 = HEAP32[$227 >> 2] | 0; //@line 5756
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 5759
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 5761
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 5767
    $$0228 = $234; //@line 5772
    $$1233 = $or$cond278 ? 0 : 2; //@line 5772
    $$1238 = $or$cond278 ? 1453 : 1453 + ($$1236 >> 4) | 0; //@line 5772
    $$2256 = $$1255; //@line 5772
    $$4266 = $$3265; //@line 5772
    $281 = $229; //@line 5772
    $283 = $232; //@line 5772
    label = 68; //@line 5773
   } else if ((label | 0) == 67) {
    label = 0; //@line 5776
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 5778
    $$1233 = $$0232; //@line 5778
    $$1238 = $$0237; //@line 5778
    $$2256 = $$0254; //@line 5778
    $$4266 = $$1263$; //@line 5778
    $281 = $275; //@line 5778
    $283 = $276; //@line 5778
    label = 68; //@line 5779
   } else if ((label | 0) == 72) {
    label = 0; //@line 5782
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 5783
    $306 = ($305 | 0) == 0; //@line 5784
    $$2 = $$1; //@line 5791
    $$2234 = 0; //@line 5791
    $$2239 = 1453; //@line 5791
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 5791
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 5791
    $$6268 = $196; //@line 5791
   } else if ((label | 0) == 76) {
    label = 0; //@line 5794
    $$0229316 = $365; //@line 5795
    $$0240315 = 0; //@line 5795
    $$1244314 = 0; //@line 5795
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 5797
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 5800
      $$2245 = $$1244314; //@line 5800
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 5803
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 5809
      $$2245 = $320; //@line 5809
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 5813
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 5816
      $$0240315 = $325; //@line 5816
      $$1244314 = $320; //@line 5816
     } else {
      $$0240$lcssa = $325; //@line 5818
      $$2245 = $320; //@line 5818
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 5824
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 5827
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 5830
     label = 85; //@line 5831
    } else {
     $$1230327 = $365; //@line 5833
     $$1241326 = 0; //@line 5833
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 5835
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5838
       label = 85; //@line 5839
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 5842
      $$1241326 = $331 + $$1241326 | 0; //@line 5843
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5846
       label = 85; //@line 5847
       break L97;
      }
      _out_670($0, $9, $331); //@line 5851
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5856
       label = 85; //@line 5857
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 5854
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 5865
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 5871
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 5873
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 5878
   $$2 = $or$cond ? $$0228 : $11; //@line 5883
   $$2234 = $$1233; //@line 5883
   $$2239 = $$1238; //@line 5883
   $$2251 = $11; //@line 5883
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 5883
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 5883
  } else if ((label | 0) == 85) {
   label = 0; //@line 5886
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 5888
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 5891
   $$0247 = $$1248; //@line 5891
   $$0269 = $$3272; //@line 5891
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 5896
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 5898
  $345 = $$$5 + $$2234 | 0; //@line 5899
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 5901
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 5902
  _out_670($0, $$2239, $$2234); //@line 5903
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 5905
  _pad_676($0, 48, $$$5, $343, 0); //@line 5906
  _out_670($0, $$2, $343); //@line 5907
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 5909
  $$0243 = $$2261; //@line 5910
  $$0247 = $$1248; //@line 5910
  $$0269 = $$3272; //@line 5910
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 5918
    } else {
     $$2242302 = 1; //@line 5920
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 5923
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 5926
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 5930
      $356 = $$2242302 + 1 | 0; //@line 5931
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 5934
      } else {
       $$2242$lcssa = $356; //@line 5936
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 5942
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 5948
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 5954
       } else {
        $$0 = 1; //@line 5956
        break;
       }
      }
     } else {
      $$0 = 1; //@line 5961
     }
    }
   } else {
    $$0 = $$1248; //@line 5965
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5969
 return $$0 | 0; //@line 5969
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3077
 $3 = HEAP32[911] | 0; //@line 3078
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3081
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3085
 $7 = $6 & 3; //@line 3086
 if (($7 | 0) == 1) {
  _abort(); //@line 3089
 }
 $9 = $6 & -8; //@line 3092
 $10 = $2 + $9 | 0; //@line 3093
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3098
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3104
   $17 = $13 + $9 | 0; //@line 3105
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3108
   }
   if ((HEAP32[912] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3114
    $106 = HEAP32[$105 >> 2] | 0; //@line 3115
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3119
     $$1382 = $17; //@line 3119
     $114 = $16; //@line 3119
     break;
    }
    HEAP32[909] = $17; //@line 3122
    HEAP32[$105 >> 2] = $106 & -2; //@line 3124
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3127
    HEAP32[$16 + $17 >> 2] = $17; //@line 3129
    return;
   }
   $21 = $13 >>> 3; //@line 3132
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3136
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3138
    $28 = 3668 + ($21 << 1 << 2) | 0; //@line 3140
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3145
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3152
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[907] = HEAP32[907] & ~(1 << $21); //@line 3162
     $$1 = $16; //@line 3163
     $$1382 = $17; //@line 3163
     $114 = $16; //@line 3163
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3169
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3173
     }
     $41 = $26 + 8 | 0; //@line 3176
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3180
     } else {
      _abort(); //@line 3182
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3187
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3188
    $$1 = $16; //@line 3189
    $$1382 = $17; //@line 3189
    $114 = $16; //@line 3189
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3193
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3195
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3199
     $60 = $59 + 4 | 0; //@line 3200
     $61 = HEAP32[$60 >> 2] | 0; //@line 3201
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3204
      if (!$63) {
       $$3 = 0; //@line 3207
       break;
      } else {
       $$1387 = $63; //@line 3210
       $$1390 = $59; //@line 3210
      }
     } else {
      $$1387 = $61; //@line 3213
      $$1390 = $60; //@line 3213
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3216
      $66 = HEAP32[$65 >> 2] | 0; //@line 3217
      if ($66 | 0) {
       $$1387 = $66; //@line 3220
       $$1390 = $65; //@line 3220
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3223
      $69 = HEAP32[$68 >> 2] | 0; //@line 3224
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3229
       $$1390 = $68; //@line 3229
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3234
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3237
      $$3 = $$1387; //@line 3238
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3243
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3246
     }
     $53 = $51 + 12 | 0; //@line 3249
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3253
     }
     $56 = $48 + 8 | 0; //@line 3256
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3260
      HEAP32[$56 >> 2] = $51; //@line 3261
      $$3 = $48; //@line 3262
      break;
     } else {
      _abort(); //@line 3265
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3272
    $$1382 = $17; //@line 3272
    $114 = $16; //@line 3272
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3275
    $75 = 3932 + ($74 << 2) | 0; //@line 3276
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3281
      if (!$$3) {
       HEAP32[908] = HEAP32[908] & ~(1 << $74); //@line 3288
       $$1 = $16; //@line 3289
       $$1382 = $17; //@line 3289
       $114 = $16; //@line 3289
       break L10;
      }
     } else {
      if ((HEAP32[911] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 3296
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 3304
       if (!$$3) {
        $$1 = $16; //@line 3307
        $$1382 = $17; //@line 3307
        $114 = $16; //@line 3307
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[911] | 0; //@line 3315
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 3318
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 3322
    $92 = $16 + 16 | 0; //@line 3323
    $93 = HEAP32[$92 >> 2] | 0; //@line 3324
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 3330
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 3334
       HEAP32[$93 + 24 >> 2] = $$3; //@line 3336
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 3342
    if (!$99) {
     $$1 = $16; //@line 3345
     $$1382 = $17; //@line 3345
     $114 = $16; //@line 3345
    } else {
     if ((HEAP32[911] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 3350
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 3354
      HEAP32[$99 + 24 >> 2] = $$3; //@line 3356
      $$1 = $16; //@line 3357
      $$1382 = $17; //@line 3357
      $114 = $16; //@line 3357
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 3363
   $$1382 = $9; //@line 3363
   $114 = $2; //@line 3363
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 3368
 }
 $115 = $10 + 4 | 0; //@line 3371
 $116 = HEAP32[$115 >> 2] | 0; //@line 3372
 if (!($116 & 1)) {
  _abort(); //@line 3376
 }
 if (!($116 & 2)) {
  if ((HEAP32[913] | 0) == ($10 | 0)) {
   $124 = (HEAP32[910] | 0) + $$1382 | 0; //@line 3386
   HEAP32[910] = $124; //@line 3387
   HEAP32[913] = $$1; //@line 3388
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 3391
   if (($$1 | 0) != (HEAP32[912] | 0)) {
    return;
   }
   HEAP32[912] = 0; //@line 3397
   HEAP32[909] = 0; //@line 3398
   return;
  }
  if ((HEAP32[912] | 0) == ($10 | 0)) {
   $132 = (HEAP32[909] | 0) + $$1382 | 0; //@line 3405
   HEAP32[909] = $132; //@line 3406
   HEAP32[912] = $114; //@line 3407
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 3410
   HEAP32[$114 + $132 >> 2] = $132; //@line 3412
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 3416
  $138 = $116 >>> 3; //@line 3417
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 3422
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 3424
    $145 = 3668 + ($138 << 1 << 2) | 0; //@line 3426
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[911] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 3432
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 3439
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[907] = HEAP32[907] & ~(1 << $138); //@line 3449
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 3455
    } else {
     if ((HEAP32[911] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 3460
     }
     $160 = $143 + 8 | 0; //@line 3463
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 3467
     } else {
      _abort(); //@line 3469
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 3474
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 3475
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 3478
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 3480
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 3484
      $180 = $179 + 4 | 0; //@line 3485
      $181 = HEAP32[$180 >> 2] | 0; //@line 3486
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 3489
       if (!$183) {
        $$3400 = 0; //@line 3492
        break;
       } else {
        $$1398 = $183; //@line 3495
        $$1402 = $179; //@line 3495
       }
      } else {
       $$1398 = $181; //@line 3498
       $$1402 = $180; //@line 3498
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 3501
       $186 = HEAP32[$185 >> 2] | 0; //@line 3502
       if ($186 | 0) {
        $$1398 = $186; //@line 3505
        $$1402 = $185; //@line 3505
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 3508
       $189 = HEAP32[$188 >> 2] | 0; //@line 3509
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 3514
        $$1402 = $188; //@line 3514
       }
      }
      if ((HEAP32[911] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 3520
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 3523
       $$3400 = $$1398; //@line 3524
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 3529
      if ((HEAP32[911] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 3533
      }
      $173 = $170 + 12 | 0; //@line 3536
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 3540
      }
      $176 = $167 + 8 | 0; //@line 3543
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 3547
       HEAP32[$176 >> 2] = $170; //@line 3548
       $$3400 = $167; //@line 3549
       break;
      } else {
       _abort(); //@line 3552
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 3560
     $196 = 3932 + ($195 << 2) | 0; //@line 3561
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 3566
       if (!$$3400) {
        HEAP32[908] = HEAP32[908] & ~(1 << $195); //@line 3573
        break L108;
       }
      } else {
       if ((HEAP32[911] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 3580
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 3588
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[911] | 0; //@line 3598
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 3601
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 3605
     $213 = $10 + 16 | 0; //@line 3606
     $214 = HEAP32[$213 >> 2] | 0; //@line 3607
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 3613
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 3617
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 3619
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 3625
     if ($220 | 0) {
      if ((HEAP32[911] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 3631
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 3635
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 3637
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 3646
  HEAP32[$114 + $137 >> 2] = $137; //@line 3648
  if (($$1 | 0) == (HEAP32[912] | 0)) {
   HEAP32[909] = $137; //@line 3652
   return;
  } else {
   $$2 = $137; //@line 3655
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 3659
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 3662
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 3664
  $$2 = $$1382; //@line 3665
 }
 $235 = $$2 >>> 3; //@line 3667
 if ($$2 >>> 0 < 256) {
  $238 = 3668 + ($235 << 1 << 2) | 0; //@line 3671
  $239 = HEAP32[907] | 0; //@line 3672
  $240 = 1 << $235; //@line 3673
  if (!($239 & $240)) {
   HEAP32[907] = $239 | $240; //@line 3678
   $$0403 = $238; //@line 3680
   $$pre$phiZ2D = $238 + 8 | 0; //@line 3680
  } else {
   $244 = $238 + 8 | 0; //@line 3682
   $245 = HEAP32[$244 >> 2] | 0; //@line 3683
   if ((HEAP32[911] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 3687
   } else {
    $$0403 = $245; //@line 3690
    $$pre$phiZ2D = $244; //@line 3690
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 3693
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 3695
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 3697
  HEAP32[$$1 + 12 >> 2] = $238; //@line 3699
  return;
 }
 $251 = $$2 >>> 8; //@line 3702
 if (!$251) {
  $$0396 = 0; //@line 3705
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 3709
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 3713
   $257 = $251 << $256; //@line 3714
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 3717
   $262 = $257 << $260; //@line 3719
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 3722
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 3727
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 3733
  }
 }
 $276 = 3932 + ($$0396 << 2) | 0; //@line 3736
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 3738
 HEAP32[$$1 + 20 >> 2] = 0; //@line 3741
 HEAP32[$$1 + 16 >> 2] = 0; //@line 3742
 $280 = HEAP32[908] | 0; //@line 3743
 $281 = 1 << $$0396; //@line 3744
 do {
  if (!($280 & $281)) {
   HEAP32[908] = $280 | $281; //@line 3750
   HEAP32[$276 >> 2] = $$1; //@line 3751
   HEAP32[$$1 + 24 >> 2] = $276; //@line 3753
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 3755
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 3757
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 3765
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 3765
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 3772
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 3776
    $301 = HEAP32[$299 >> 2] | 0; //@line 3778
    if (!$301) {
     label = 121; //@line 3781
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 3784
     $$0384 = $301; //@line 3784
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[911] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 3791
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 3794
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 3796
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 3798
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 3800
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 3805
    $309 = HEAP32[$308 >> 2] | 0; //@line 3806
    $310 = HEAP32[911] | 0; //@line 3807
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 3813
     HEAP32[$308 >> 2] = $$1; //@line 3814
     HEAP32[$$1 + 8 >> 2] = $309; //@line 3816
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 3818
     HEAP32[$$1 + 24 >> 2] = 0; //@line 3820
     break;
    } else {
     _abort(); //@line 3823
    }
   }
  }
 } while (0);
 $319 = (HEAP32[915] | 0) + -1 | 0; //@line 3830
 HEAP32[915] = $319; //@line 3831
 if (!$319) {
  $$0212$in$i = 4084; //@line 3834
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 3839
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 3845
  }
 }
 HEAP32[915] = -1; //@line 3848
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 9904
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 9905
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 9906
 $d_sroa_0_0_extract_trunc = $b$0; //@line 9907
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 9908
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 9909
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 9911
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9914
    HEAP32[$rem + 4 >> 2] = 0; //@line 9915
   }
   $_0$1 = 0; //@line 9917
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9918
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9919
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 9922
    $_0$0 = 0; //@line 9923
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9924
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9926
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 9927
   $_0$1 = 0; //@line 9928
   $_0$0 = 0; //@line 9929
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9930
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 9933
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9938
     HEAP32[$rem + 4 >> 2] = 0; //@line 9939
    }
    $_0$1 = 0; //@line 9941
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9942
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9943
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 9947
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 9948
    }
    $_0$1 = 0; //@line 9950
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 9951
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9952
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 9954
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 9957
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 9958
    }
    $_0$1 = 0; //@line 9960
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 9961
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9962
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9965
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 9967
    $58 = 31 - $51 | 0; //@line 9968
    $sr_1_ph = $57; //@line 9969
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 9970
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 9971
    $q_sroa_0_1_ph = 0; //@line 9972
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 9973
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 9977
    $_0$0 = 0; //@line 9978
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9979
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9981
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9982
   $_0$1 = 0; //@line 9983
   $_0$0 = 0; //@line 9984
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9985
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9989
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 9991
     $126 = 31 - $119 | 0; //@line 9992
     $130 = $119 - 31 >> 31; //@line 9993
     $sr_1_ph = $125; //@line 9994
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 9995
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 9996
     $q_sroa_0_1_ph = 0; //@line 9997
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 9998
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 10002
     $_0$0 = 0; //@line 10003
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10004
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 10006
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 10007
    $_0$1 = 0; //@line 10008
    $_0$0 = 0; //@line 10009
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10010
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 10012
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 10015
    $89 = 64 - $88 | 0; //@line 10016
    $91 = 32 - $88 | 0; //@line 10017
    $92 = $91 >> 31; //@line 10018
    $95 = $88 - 32 | 0; //@line 10019
    $105 = $95 >> 31; //@line 10020
    $sr_1_ph = $88; //@line 10021
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 10022
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 10023
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 10024
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 10025
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 10029
    HEAP32[$rem + 4 >> 2] = 0; //@line 10030
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 10033
    $_0$0 = $a$0 | 0 | 0; //@line 10034
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10035
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 10037
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 10038
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 10039
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10040
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 10045
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 10046
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 10047
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 10048
  $carry_0_lcssa$1 = 0; //@line 10049
  $carry_0_lcssa$0 = 0; //@line 10050
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 10052
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 10053
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 10054
  $137$1 = tempRet0; //@line 10055
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 10056
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 10057
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 10058
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 10059
  $sr_1202 = $sr_1_ph; //@line 10060
  $carry_0203 = 0; //@line 10061
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 10063
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 10064
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 10065
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 10066
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 10067
   $150$1 = tempRet0; //@line 10068
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 10069
   $carry_0203 = $151$0 & 1; //@line 10070
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 10072
   $r_sroa_1_1200 = tempRet0; //@line 10073
   $sr_1202 = $sr_1202 - 1 | 0; //@line 10074
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 10086
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 10087
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 10088
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 10089
  $carry_0_lcssa$1 = 0; //@line 10090
  $carry_0_lcssa$0 = $carry_0203; //@line 10091
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 10093
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 10094
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 10097
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 10098
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 10100
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 10101
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10102
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6053
      $10 = HEAP32[$9 >> 2] | 0; //@line 6054
      HEAP32[$2 >> 2] = $9 + 4; //@line 6056
      HEAP32[$0 >> 2] = $10; //@line 6057
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6073
      $17 = HEAP32[$16 >> 2] | 0; //@line 6074
      HEAP32[$2 >> 2] = $16 + 4; //@line 6076
      $20 = $0; //@line 6079
      HEAP32[$20 >> 2] = $17; //@line 6081
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 6084
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6100
      $30 = HEAP32[$29 >> 2] | 0; //@line 6101
      HEAP32[$2 >> 2] = $29 + 4; //@line 6103
      $31 = $0; //@line 6104
      HEAP32[$31 >> 2] = $30; //@line 6106
      HEAP32[$31 + 4 >> 2] = 0; //@line 6109
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 6125
      $41 = $40; //@line 6126
      $43 = HEAP32[$41 >> 2] | 0; //@line 6128
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 6131
      HEAP32[$2 >> 2] = $40 + 8; //@line 6133
      $47 = $0; //@line 6134
      HEAP32[$47 >> 2] = $43; //@line 6136
      HEAP32[$47 + 4 >> 2] = $46; //@line 6139
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6155
      $57 = HEAP32[$56 >> 2] | 0; //@line 6156
      HEAP32[$2 >> 2] = $56 + 4; //@line 6158
      $59 = ($57 & 65535) << 16 >> 16; //@line 6160
      $62 = $0; //@line 6163
      HEAP32[$62 >> 2] = $59; //@line 6165
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 6168
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6184
      $72 = HEAP32[$71 >> 2] | 0; //@line 6185
      HEAP32[$2 >> 2] = $71 + 4; //@line 6187
      $73 = $0; //@line 6189
      HEAP32[$73 >> 2] = $72 & 65535; //@line 6191
      HEAP32[$73 + 4 >> 2] = 0; //@line 6194
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6210
      $83 = HEAP32[$82 >> 2] | 0; //@line 6211
      HEAP32[$2 >> 2] = $82 + 4; //@line 6213
      $85 = ($83 & 255) << 24 >> 24; //@line 6215
      $88 = $0; //@line 6218
      HEAP32[$88 >> 2] = $85; //@line 6220
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 6223
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6239
      $98 = HEAP32[$97 >> 2] | 0; //@line 6240
      HEAP32[$2 >> 2] = $97 + 4; //@line 6242
      $99 = $0; //@line 6244
      HEAP32[$99 >> 2] = $98 & 255; //@line 6246
      HEAP32[$99 + 4 >> 2] = 0; //@line 6249
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 6265
      $109 = +HEAPF64[$108 >> 3]; //@line 6266
      HEAP32[$2 >> 2] = $108 + 8; //@line 6268
      HEAPF64[$0 >> 3] = $109; //@line 6269
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 6285
      $116 = +HEAPF64[$115 >> 3]; //@line 6286
      HEAP32[$2 >> 2] = $115 + 8; //@line 6288
      HEAPF64[$0 >> 3] = $116; //@line 6289
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
 sp = STACKTOP; //@line 4953
 STACKTOP = STACKTOP + 224 | 0; //@line 4954
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 4954
 $3 = sp + 120 | 0; //@line 4955
 $4 = sp + 80 | 0; //@line 4956
 $5 = sp; //@line 4957
 $6 = sp + 136 | 0; //@line 4958
 dest = $4; //@line 4959
 stop = dest + 40 | 0; //@line 4959
 do {
  HEAP32[dest >> 2] = 0; //@line 4959
  dest = dest + 4 | 0; //@line 4959
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 4961
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 4965
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 4972
  } else {
   $43 = 0; //@line 4974
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 4976
  $14 = $13 & 32; //@line 4977
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 4983
  }
  $19 = $0 + 48 | 0; //@line 4985
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 4990
    $24 = HEAP32[$23 >> 2] | 0; //@line 4991
    HEAP32[$23 >> 2] = $6; //@line 4992
    $25 = $0 + 28 | 0; //@line 4993
    HEAP32[$25 >> 2] = $6; //@line 4994
    $26 = $0 + 20 | 0; //@line 4995
    HEAP32[$26 >> 2] = $6; //@line 4996
    HEAP32[$19 >> 2] = 80; //@line 4997
    $28 = $0 + 16 | 0; //@line 4999
    HEAP32[$28 >> 2] = $6 + 80; //@line 5000
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 5001
    if (!$24) {
     $$1 = $29; //@line 5004
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 5007
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 5008
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 5009
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 41; //@line 5012
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 5014
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 5016
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 5018
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 5020
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 5022
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 5024
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 5026
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 5028
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 5030
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 5032
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 5034
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 5036
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 5038
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 5040
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 5042
      sp = STACKTOP; //@line 5043
      STACKTOP = sp; //@line 5044
      return 0; //@line 5044
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5046
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 5049
      HEAP32[$23 >> 2] = $24; //@line 5050
      HEAP32[$19 >> 2] = 0; //@line 5051
      HEAP32[$28 >> 2] = 0; //@line 5052
      HEAP32[$25 >> 2] = 0; //@line 5053
      HEAP32[$26 >> 2] = 0; //@line 5054
      $$1 = $$; //@line 5055
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 5061
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 5064
  HEAP32[$0 >> 2] = $51 | $14; //@line 5069
  if ($43 | 0) {
   ___unlockfile($0); //@line 5072
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 5074
 }
 STACKTOP = sp; //@line 5076
 return $$0 | 0; //@line 5076
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8169
 STACKTOP = STACKTOP + 64 | 0; //@line 8170
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8170
 $4 = sp; //@line 8171
 $5 = HEAP32[$0 >> 2] | 0; //@line 8172
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 8175
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 8177
 HEAP32[$4 >> 2] = $2; //@line 8178
 HEAP32[$4 + 4 >> 2] = $0; //@line 8180
 HEAP32[$4 + 8 >> 2] = $1; //@line 8182
 HEAP32[$4 + 12 >> 2] = $3; //@line 8184
 $14 = $4 + 16 | 0; //@line 8185
 $15 = $4 + 20 | 0; //@line 8186
 $16 = $4 + 24 | 0; //@line 8187
 $17 = $4 + 28 | 0; //@line 8188
 $18 = $4 + 32 | 0; //@line 8189
 $19 = $4 + 40 | 0; //@line 8190
 dest = $14; //@line 8191
 stop = dest + 36 | 0; //@line 8191
 do {
  HEAP32[dest >> 2] = 0; //@line 8191
  dest = dest + 4 | 0; //@line 8191
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 8191
 HEAP8[$14 + 38 >> 0] = 0; //@line 8191
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 8196
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 8199
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8200
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 8201
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 46; //@line 8204
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 8206
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 8208
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 8210
    sp = STACKTOP; //@line 8211
    STACKTOP = sp; //@line 8212
    return 0; //@line 8212
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8214
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 8218
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 8222
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 8225
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 8226
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 8227
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 47; //@line 8230
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 8232
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 8234
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 8236
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 8238
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 8240
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 8242
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 8244
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 8246
    sp = STACKTOP; //@line 8247
    STACKTOP = sp; //@line 8248
    return 0; //@line 8248
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8250
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 8264
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 8272
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 8288
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 8293
  }
 } while (0);
 STACKTOP = sp; //@line 8296
 return $$0 | 0; //@line 8296
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 4825
 $7 = ($2 | 0) != 0; //@line 4829
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 4833
   $$03555 = $0; //@line 4834
   $$03654 = $2; //@line 4834
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 4839
     $$036$lcssa64 = $$03654; //@line 4839
     label = 6; //@line 4840
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 4843
    $12 = $$03654 + -1 | 0; //@line 4844
    $16 = ($12 | 0) != 0; //@line 4848
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 4851
     $$03654 = $12; //@line 4851
    } else {
     $$035$lcssa = $11; //@line 4853
     $$036$lcssa = $12; //@line 4853
     $$lcssa = $16; //@line 4853
     label = 5; //@line 4854
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 4859
   $$036$lcssa = $2; //@line 4859
   $$lcssa = $7; //@line 4859
   label = 5; //@line 4860
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 4865
   $$036$lcssa64 = $$036$lcssa; //@line 4865
   label = 6; //@line 4866
  } else {
   $$2 = $$035$lcssa; //@line 4868
   $$3 = 0; //@line 4868
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 4874
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 4877
    $$3 = $$036$lcssa64; //@line 4877
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 4879
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 4883
      $$13745 = $$036$lcssa64; //@line 4883
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 4886
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 4895
       $30 = $$13745 + -4 | 0; //@line 4896
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 4899
        $$13745 = $30; //@line 4899
       } else {
        $$0$lcssa = $29; //@line 4901
        $$137$lcssa = $30; //@line 4901
        label = 11; //@line 4902
        break L11;
       }
      }
      $$140 = $$046; //@line 4906
      $$23839 = $$13745; //@line 4906
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 4908
      $$137$lcssa = $$036$lcssa64; //@line 4908
      label = 11; //@line 4909
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 4915
      $$3 = 0; //@line 4915
      break;
     } else {
      $$140 = $$0$lcssa; //@line 4918
      $$23839 = $$137$lcssa; //@line 4918
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 4925
      $$3 = $$23839; //@line 4925
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 4928
     $$23839 = $$23839 + -1 | 0; //@line 4929
     if (!$$23839) {
      $$2 = $35; //@line 4932
      $$3 = 0; //@line 4932
      break;
     } else {
      $$140 = $35; //@line 4935
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 4943
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 4596
 do {
  if (!$0) {
   do {
    if (!(HEAP32[56] | 0)) {
     $34 = 0; //@line 4604
    } else {
     $12 = HEAP32[56] | 0; //@line 4606
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4607
     $13 = _fflush($12) | 0; //@line 4608
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 37; //@line 4611
      sp = STACKTOP; //@line 4612
      return 0; //@line 4613
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 4615
      $34 = $13; //@line 4616
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 4622
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 4626
    } else {
     $$02327 = $$02325; //@line 4628
     $$02426 = $34; //@line 4628
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 4635
      } else {
       $28 = 0; //@line 4637
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4645
       $25 = ___fflush_unlocked($$02327) | 0; //@line 4646
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 4651
       $$1 = $25 | $$02426; //@line 4653
      } else {
       $$1 = $$02426; //@line 4655
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 4659
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 4662
      if (!$$023) {
       $$024$lcssa = $$1; //@line 4665
       break L9;
      } else {
       $$02327 = $$023; //@line 4668
       $$02426 = $$1; //@line 4668
      }
     }
     HEAP32[$AsyncCtx >> 2] = 38; //@line 4671
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 4673
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 4675
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 4677
     sp = STACKTOP; //@line 4678
     return 0; //@line 4679
    }
   } while (0);
   ___ofl_unlock(); //@line 4682
   $$0 = $$024$lcssa; //@line 4683
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4689
    $5 = ___fflush_unlocked($0) | 0; //@line 4690
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 35; //@line 4693
     sp = STACKTOP; //@line 4694
     return 0; //@line 4695
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4697
     $$0 = $5; //@line 4698
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 4703
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4704
   $7 = ___fflush_unlocked($0) | 0; //@line 4705
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 36; //@line 4708
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 4711
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4713
    sp = STACKTOP; //@line 4714
    return 0; //@line 4715
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4717
   if ($phitmp) {
    $$0 = $7; //@line 4719
   } else {
    ___unlockfile($0); //@line 4721
    $$0 = $7; //@line 4722
   }
  }
 } while (0);
 return $$0 | 0; //@line 4726
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8351
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 8357
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 8363
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 8366
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8367
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 8368
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 50; //@line 8371
     sp = STACKTOP; //@line 8372
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8375
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 8383
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 8388
     $19 = $1 + 44 | 0; //@line 8389
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 8395
     HEAP8[$22 >> 0] = 0; //@line 8396
     $23 = $1 + 53 | 0; //@line 8397
     HEAP8[$23 >> 0] = 0; //@line 8398
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 8400
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 8403
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 8404
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 8405
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 49; //@line 8408
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 8410
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8412
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 8414
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 8416
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 8418
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 8420
      sp = STACKTOP; //@line 8421
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 8424
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 8428
      label = 13; //@line 8429
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 8434
       label = 13; //@line 8435
      } else {
       $$037$off039 = 3; //@line 8437
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 8441
      $39 = $1 + 40 | 0; //@line 8442
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 8445
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 8455
        $$037$off039 = $$037$off038; //@line 8456
       } else {
        $$037$off039 = $$037$off038; //@line 8458
       }
      } else {
       $$037$off039 = $$037$off038; //@line 8461
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 8464
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 8471
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
 sp = STACKTOP; //@line 3873
 STACKTOP = STACKTOP + 48 | 0; //@line 3874
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3874
 $vararg_buffer3 = sp + 16 | 0; //@line 3875
 $vararg_buffer = sp; //@line 3876
 $3 = sp + 32 | 0; //@line 3877
 $4 = $0 + 28 | 0; //@line 3878
 $5 = HEAP32[$4 >> 2] | 0; //@line 3879
 HEAP32[$3 >> 2] = $5; //@line 3880
 $7 = $0 + 20 | 0; //@line 3882
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 3884
 HEAP32[$3 + 4 >> 2] = $9; //@line 3885
 HEAP32[$3 + 8 >> 2] = $1; //@line 3887
 HEAP32[$3 + 12 >> 2] = $2; //@line 3889
 $12 = $9 + $2 | 0; //@line 3890
 $13 = $0 + 60 | 0; //@line 3891
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 3894
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 3896
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 3898
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 3900
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 3904
  } else {
   $$04756 = 2; //@line 3906
   $$04855 = $12; //@line 3906
   $$04954 = $3; //@line 3906
   $27 = $17; //@line 3906
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 3912
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 3914
    $38 = $27 >>> 0 > $37 >>> 0; //@line 3915
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 3917
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 3919
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 3921
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 3924
    $44 = $$150 + 4 | 0; //@line 3925
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 3928
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 3931
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 3933
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 3935
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 3937
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 3940
     break L1;
    } else {
     $$04756 = $$1; //@line 3943
     $$04954 = $$150; //@line 3943
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 3947
   HEAP32[$4 >> 2] = 0; //@line 3948
   HEAP32[$7 >> 2] = 0; //@line 3949
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 3952
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 3955
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 3960
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 3966
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 3971
  $25 = $20; //@line 3972
  HEAP32[$4 >> 2] = $25; //@line 3973
  HEAP32[$7 >> 2] = $25; //@line 3974
  $$051 = $2; //@line 3975
 }
 STACKTOP = sp; //@line 3977
 return $$051 | 0; //@line 3977
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 10211
 }
 ret = dest | 0; //@line 10214
 dest_end = dest + num | 0; //@line 10215
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 10219
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 10220
   dest = dest + 1 | 0; //@line 10221
   src = src + 1 | 0; //@line 10222
   num = num - 1 | 0; //@line 10223
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 10225
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 10226
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 10228
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 10229
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 10230
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 10231
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 10232
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 10233
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 10234
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 10235
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 10236
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 10237
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 10238
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 10239
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 10240
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 10241
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 10242
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 10243
   dest = dest + 64 | 0; //@line 10244
   src = src + 64 | 0; //@line 10245
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 10248
   dest = dest + 4 | 0; //@line 10249
   src = src + 4 | 0; //@line 10250
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 10254
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 10256
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 10257
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 10258
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 10259
   dest = dest + 4 | 0; //@line 10260
   src = src + 4 | 0; //@line 10261
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 10266
  dest = dest + 1 | 0; //@line 10267
  src = src + 1 | 0; //@line 10268
 }
 return ret | 0; //@line 10270
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7852
 STACKTOP = STACKTOP + 64 | 0; //@line 7853
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7853
 $3 = sp; //@line 7854
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 7857
 } else {
  if (!$1) {
   $$2 = 0; //@line 7861
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 7863
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 7864
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 44; //@line 7867
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 7869
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7871
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 7873
    sp = STACKTOP; //@line 7874
    STACKTOP = sp; //@line 7875
    return 0; //@line 7875
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7877
   if (!$6) {
    $$2 = 0; //@line 7880
   } else {
    dest = $3 + 4 | 0; //@line 7883
    stop = dest + 52 | 0; //@line 7883
    do {
     HEAP32[dest >> 2] = 0; //@line 7883
     dest = dest + 4 | 0; //@line 7883
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 7884
    HEAP32[$3 + 8 >> 2] = $0; //@line 7886
    HEAP32[$3 + 12 >> 2] = -1; //@line 7888
    HEAP32[$3 + 48 >> 2] = 1; //@line 7890
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 7893
    $18 = HEAP32[$2 >> 2] | 0; //@line 7894
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7895
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 7896
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 45; //@line 7899
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 7901
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7903
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7905
     sp = STACKTOP; //@line 7906
     STACKTOP = sp; //@line 7907
     return 0; //@line 7907
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7909
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 7916
     $$0 = 1; //@line 7917
    } else {
     $$0 = 0; //@line 7919
    }
    $$2 = $$0; //@line 7921
   }
  }
 }
 STACKTOP = sp; //@line 7925
 return $$2 | 0; //@line 7925
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 7698
 STACKTOP = STACKTOP + 128 | 0; //@line 7699
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 7699
 $4 = sp + 124 | 0; //@line 7700
 $5 = sp; //@line 7701
 dest = $5; //@line 7702
 src = 472; //@line 7702
 stop = dest + 124 | 0; //@line 7702
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7702
  dest = dest + 4 | 0; //@line 7702
  src = src + 4 | 0; //@line 7702
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 7708
   $$015 = 1; //@line 7708
   label = 4; //@line 7709
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 7712
   $$0 = -1; //@line 7713
  }
 } else {
  $$014 = $0; //@line 7716
  $$015 = $1; //@line 7716
  label = 4; //@line 7717
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 7721
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 7723
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 7725
  $14 = $5 + 20 | 0; //@line 7726
  HEAP32[$14 >> 2] = $$014; //@line 7727
  HEAP32[$5 + 44 >> 2] = $$014; //@line 7729
  $16 = $$014 + $$$015 | 0; //@line 7730
  $17 = $5 + 16 | 0; //@line 7731
  HEAP32[$17 >> 2] = $16; //@line 7732
  HEAP32[$5 + 28 >> 2] = $16; //@line 7734
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 7735
  $19 = _vfprintf($5, $2, $3) | 0; //@line 7736
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 42; //@line 7739
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 7741
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 7743
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 7745
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 7747
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 7749
   sp = STACKTOP; //@line 7750
   STACKTOP = sp; //@line 7751
   return 0; //@line 7751
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7753
  if (!$$$015) {
   $$0 = $19; //@line 7756
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 7758
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 7763
   $$0 = $19; //@line 7764
  }
 }
 STACKTOP = sp; //@line 7767
 return $$0 | 0; //@line 7767
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 4461
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 4464
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 4467
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 4470
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 4476
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 4485
     $24 = $13 >>> 2; //@line 4486
     $$090 = 0; //@line 4487
     $$094 = $7; //@line 4487
     while (1) {
      $25 = $$094 >>> 1; //@line 4489
      $26 = $$090 + $25 | 0; //@line 4490
      $27 = $26 << 1; //@line 4491
      $28 = $27 + $23 | 0; //@line 4492
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 4495
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4499
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 4505
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 4513
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 4517
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 4523
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 4528
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 4531
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 4531
      }
     }
     $46 = $27 + $24 | 0; //@line 4534
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 4537
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4541
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 4553
     } else {
      $$4 = 0; //@line 4555
     }
    } else {
     $$4 = 0; //@line 4558
    }
   } else {
    $$4 = 0; //@line 4561
   }
  } else {
   $$4 = 0; //@line 4564
  }
 } while (0);
 return $$4 | 0; //@line 4567
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4126
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 4131
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 4136
  } else {
   $20 = $0 & 255; //@line 4138
   $21 = $0 & 255; //@line 4139
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 4145
   } else {
    $26 = $1 + 20 | 0; //@line 4147
    $27 = HEAP32[$26 >> 2] | 0; //@line 4148
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 4154
     HEAP8[$27 >> 0] = $20; //@line 4155
     $34 = $21; //@line 4156
    } else {
     label = 12; //@line 4158
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4163
     $32 = ___overflow($1, $0) | 0; //@line 4164
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 33; //@line 4167
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 4169
      sp = STACKTOP; //@line 4170
      return 0; //@line 4171
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 4173
      $34 = $32; //@line 4174
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 4179
   $$0 = $34; //@line 4180
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 4185
   $8 = $0 & 255; //@line 4186
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 4192
    $14 = HEAP32[$13 >> 2] | 0; //@line 4193
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 4199
     HEAP8[$14 >> 0] = $7; //@line 4200
     $$0 = $8; //@line 4201
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4205
   $19 = ___overflow($1, $0) | 0; //@line 4206
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 32; //@line 4209
    sp = STACKTOP; //@line 4210
    return 0; //@line 4211
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4213
    $$0 = $19; //@line 4214
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 4219
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4732
 $1 = $0 + 20 | 0; //@line 4733
 $3 = $0 + 28 | 0; //@line 4735
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 4741
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4742
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 4743
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 39; //@line 4746
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 4748
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 4750
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 4752
    sp = STACKTOP; //@line 4753
    return 0; //@line 4754
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4756
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 4760
     break;
    } else {
     label = 5; //@line 4763
     break;
    }
   }
  } else {
   label = 5; //@line 4768
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 4772
  $14 = HEAP32[$13 >> 2] | 0; //@line 4773
  $15 = $0 + 8 | 0; //@line 4774
  $16 = HEAP32[$15 >> 2] | 0; //@line 4775
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 4783
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4784
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 4785
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 40; //@line 4788
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4790
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 4792
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 4794
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 4796
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 4798
     sp = STACKTOP; //@line 4799
     return 0; //@line 4800
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4802
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 4808
  HEAP32[$3 >> 2] = 0; //@line 4809
  HEAP32[$1 >> 2] = 0; //@line 4810
  HEAP32[$15 >> 2] = 0; //@line 4811
  HEAP32[$13 >> 2] = 0; //@line 4812
  $$0 = 0; //@line 4813
 }
 return $$0 | 0; //@line 4815
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $$09$i = 0, $1 = 0, $12 = 0, $18 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 384
 STACKTOP = STACKTOP + 144 | 0; //@line 385
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 385
 $1 = sp + 16 | 0; //@line 386
 $2 = sp; //@line 387
 HEAP32[$2 >> 2] = $varargs; //@line 388
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 389
 $3 = _vsnprintf($1, 128, $0, $2) | 0; //@line 390
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 393
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 395
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 397
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 399
  sp = STACKTOP; //@line 400
  STACKTOP = sp; //@line 401
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 403
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 406
  return;
 }
 if (!(HEAP32[902] | 0)) {
  _serial_init(3612, 2, 3); //@line 411
  $$09$i = 0; //@line 412
 } else {
  $$09$i = 0; //@line 414
 }
 while (1) {
  $12 = HEAP8[$1 + $$09$i >> 0] | 0; //@line 419
  $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 420
  _serial_putc(3612, $12); //@line 421
  if (___async) {
   label = 7; //@line 424
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 427
  $18 = $$09$i + 1 | 0; //@line 428
  if (($18 | 0) == ($3 | 0)) {
   label = 9; //@line 431
   break;
  } else {
   $$09$i = $18; //@line 434
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 24; //@line 438
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09$i; //@line 440
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 442
  HEAP32[$AsyncCtx2 + 12 >> 2] = $1; //@line 444
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 446
  HEAP32[$AsyncCtx2 + 20 >> 2] = $1; //@line 448
  sp = STACKTOP; //@line 449
  STACKTOP = sp; //@line 450
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 453
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 4352
 $4 = HEAP32[$3 >> 2] | 0; //@line 4353
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 4360
   label = 5; //@line 4361
  } else {
   $$1 = 0; //@line 4363
  }
 } else {
  $12 = $4; //@line 4367
  label = 5; //@line 4368
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 4372
   $10 = HEAP32[$9 >> 2] | 0; //@line 4373
   $14 = $10; //@line 4376
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 4381
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 4389
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 4393
       $$141 = $0; //@line 4393
       $$143 = $1; //@line 4393
       $31 = $14; //@line 4393
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 4396
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 4403
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 4408
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 4411
      break L5;
     }
     $$139 = $$038; //@line 4417
     $$141 = $0 + $$038 | 0; //@line 4417
     $$143 = $1 - $$038 | 0; //@line 4417
     $31 = HEAP32[$9 >> 2] | 0; //@line 4417
    } else {
     $$139 = 0; //@line 4419
     $$141 = $0; //@line 4419
     $$143 = $1; //@line 4419
     $31 = $14; //@line 4419
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 4422
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 4425
   $$1 = $$139 + $$143 | 0; //@line 4427
  }
 } while (0);
 return $$1 | 0; //@line 4430
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4238
 STACKTOP = STACKTOP + 16 | 0; //@line 4239
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4239
 $2 = sp; //@line 4240
 $3 = $1 & 255; //@line 4241
 HEAP8[$2 >> 0] = $3; //@line 4242
 $4 = $0 + 16 | 0; //@line 4243
 $5 = HEAP32[$4 >> 2] | 0; //@line 4244
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 4251
   label = 4; //@line 4252
  } else {
   $$0 = -1; //@line 4254
  }
 } else {
  $12 = $5; //@line 4257
  label = 4; //@line 4258
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 4262
   $10 = HEAP32[$9 >> 2] | 0; //@line 4263
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 4266
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 4273
     HEAP8[$10 >> 0] = $3; //@line 4274
     $$0 = $13; //@line 4275
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 4280
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4281
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 4282
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 34; //@line 4285
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 4287
    sp = STACKTOP; //@line 4288
    STACKTOP = sp; //@line 4289
    return 0; //@line 4289
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 4291
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 4296
   } else {
    $$0 = -1; //@line 4298
   }
  }
 } while (0);
 STACKTOP = sp; //@line 4302
 return $$0 | 0; //@line 4302
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 10275
 value = value & 255; //@line 10277
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 10280
   ptr = ptr + 1 | 0; //@line 10281
  }
  aligned_end = end & -4 | 0; //@line 10284
  block_aligned_end = aligned_end - 64 | 0; //@line 10285
  value4 = value | value << 8 | value << 16 | value << 24; //@line 10286
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 10289
   HEAP32[ptr + 4 >> 2] = value4; //@line 10290
   HEAP32[ptr + 8 >> 2] = value4; //@line 10291
   HEAP32[ptr + 12 >> 2] = value4; //@line 10292
   HEAP32[ptr + 16 >> 2] = value4; //@line 10293
   HEAP32[ptr + 20 >> 2] = value4; //@line 10294
   HEAP32[ptr + 24 >> 2] = value4; //@line 10295
   HEAP32[ptr + 28 >> 2] = value4; //@line 10296
   HEAP32[ptr + 32 >> 2] = value4; //@line 10297
   HEAP32[ptr + 36 >> 2] = value4; //@line 10298
   HEAP32[ptr + 40 >> 2] = value4; //@line 10299
   HEAP32[ptr + 44 >> 2] = value4; //@line 10300
   HEAP32[ptr + 48 >> 2] = value4; //@line 10301
   HEAP32[ptr + 52 >> 2] = value4; //@line 10302
   HEAP32[ptr + 56 >> 2] = value4; //@line 10303
   HEAP32[ptr + 60 >> 2] = value4; //@line 10304
   ptr = ptr + 64 | 0; //@line 10305
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 10309
   ptr = ptr + 4 | 0; //@line 10310
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 10315
  ptr = ptr + 1 | 0; //@line 10316
 }
 return end - num | 0; //@line 10318
}
function _fflush__async_cb_23($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9521
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9523
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 9525
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 9529
  } else {
   $$02327 = $$02325; //@line 9531
   $$02426 = $AsyncRetVal; //@line 9531
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 9538
    } else {
     $16 = 0; //@line 9540
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 9552
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 9555
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 9558
     break L3;
    } else {
     $$02327 = $$023; //@line 9561
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 9564
   $13 = ___fflush_unlocked($$02327) | 0; //@line 9565
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 9569
    ___async_unwind = 0; //@line 9570
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 9572
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 9574
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 9576
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 9578
   sp = STACKTOP; //@line 9579
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 9583
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 9585
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9422
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 9432
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 9432
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 9432
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 9436
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 9439
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 9442
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 9450
  } else {
   $20 = 0; //@line 9452
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 9462
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 9466
  HEAP32[___async_retval >> 2] = $$1; //@line 9468
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 9471
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 9472
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 9476
  ___async_unwind = 0; //@line 9477
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 9479
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 9481
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 9483
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 9485
 sp = STACKTOP; //@line 9486
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9673
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9675
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9677
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9679
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 9684
  } else {
   $9 = $4 + 4 | 0; //@line 9686
   $10 = HEAP32[$9 >> 2] | 0; //@line 9687
   $11 = $4 + 8 | 0; //@line 9688
   $12 = HEAP32[$11 >> 2] | 0; //@line 9689
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 9693
    HEAP32[$6 >> 2] = 0; //@line 9694
    HEAP32[$2 >> 2] = 0; //@line 9695
    HEAP32[$11 >> 2] = 0; //@line 9696
    HEAP32[$9 >> 2] = 0; //@line 9697
    $$0 = 0; //@line 9698
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 9705
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9706
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 9707
   if (!___async) {
    ___async_unwind = 0; //@line 9710
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 9712
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 9714
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 9716
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 9718
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 9720
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 9722
   sp = STACKTOP; //@line 9723
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 9728
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 7504
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 7509
    $$0 = 1; //@line 7510
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 7523
     $$0 = 1; //@line 7524
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 7528
     $$0 = -1; //@line 7529
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 7539
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 7543
    $$0 = 2; //@line 7544
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 7556
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 7562
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 7566
    $$0 = 3; //@line 7567
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 7577
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 7583
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 7589
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 7593
    $$0 = 4; //@line 7594
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 7598
    $$0 = -1; //@line 7599
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7604
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_24($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9618
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9620
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9622
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9624
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9626
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 9631
  return;
 }
 dest = $2 + 4 | 0; //@line 9635
 stop = dest + 52 | 0; //@line 9635
 do {
  HEAP32[dest >> 2] = 0; //@line 9635
  dest = dest + 4 | 0; //@line 9635
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 9636
 HEAP32[$2 + 8 >> 2] = $4; //@line 9638
 HEAP32[$2 + 12 >> 2] = -1; //@line 9640
 HEAP32[$2 + 48 >> 2] = 1; //@line 9642
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 9645
 $16 = HEAP32[$6 >> 2] | 0; //@line 9646
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 9647
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 9648
 if (!___async) {
  ___async_unwind = 0; //@line 9651
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 45; //@line 9653
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 9655
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 9657
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 9659
 sp = STACKTOP; //@line 9660
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 6388
  $8 = $0; //@line 6388
  $9 = $1; //@line 6388
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 6390
   $$0914 = $$0914 + -1 | 0; //@line 6394
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 6395
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 6396
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 6404
   }
  }
  $$010$lcssa$off0 = $8; //@line 6409
  $$09$lcssa = $$0914; //@line 6409
 } else {
  $$010$lcssa$off0 = $0; //@line 6411
  $$09$lcssa = $2; //@line 6411
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 6415
 } else {
  $$012 = $$010$lcssa$off0; //@line 6417
  $$111 = $$09$lcssa; //@line 6417
  while (1) {
   $26 = $$111 + -1 | 0; //@line 6422
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 6423
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 6427
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 6430
    $$111 = $26; //@line 6430
   }
  }
 }
 return $$1$lcssa | 0; //@line 6434
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $8 = 0.0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9368
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9370
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9372
 if (+_pwmout_read(3620) == 1.0) {
  if (!(HEAP8[3624] | 0)) {
   HEAP8[3624] = 1; //@line 9379
  }
  _pwmout_write(3620, 0.0); //@line 9381
 }
 $8 = +_pwmout_read(3620) + .1; //@line 9386
 if (!(HEAP8[3624] | 0)) {
  HEAP8[3624] = 1; //@line 9390
 }
 _pwmout_write(3620, $8); //@line 9392
 HEAPF64[$2 >> 3] = +_pwmout_read(3620); //@line 9395
 _printf(972, $2) | 0; //@line 9396
 $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 9397
 _wait(.20000000298023224); //@line 9398
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 9401
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 9402
  HEAP32[$13 >> 2] = $2; //@line 9403
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 9404
  HEAP32[$14 >> 2] = $4; //@line 9405
  sp = STACKTOP; //@line 9406
  return;
 }
 ___async_unwind = 0; //@line 9409
 HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 9410
 $13 = $ReallocAsyncCtx + 4 | 0; //@line 9411
 HEAP32[$13 >> 2] = $2; //@line 9412
 $14 = $ReallocAsyncCtx + 8 | 0; //@line 9413
 HEAP32[$14 >> 2] = $4; //@line 9414
 sp = STACKTOP; //@line 9415
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 8099
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 8106
   $10 = $1 + 16 | 0; //@line 8107
   $11 = HEAP32[$10 >> 2] | 0; //@line 8108
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 8111
    HEAP32[$1 + 24 >> 2] = $4; //@line 8113
    HEAP32[$1 + 36 >> 2] = 1; //@line 8115
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 8125
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 8130
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 8133
    HEAP8[$1 + 54 >> 0] = 1; //@line 8135
    break;
   }
   $21 = $1 + 24 | 0; //@line 8138
   $22 = HEAP32[$21 >> 2] | 0; //@line 8139
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 8142
    $28 = $4; //@line 8143
   } else {
    $28 = $22; //@line 8145
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 8154
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7958
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 7967
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 7972
      HEAP32[$13 >> 2] = $2; //@line 7973
      $19 = $1 + 40 | 0; //@line 7974
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 7977
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7987
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 7991
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 7998
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8593
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8595
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8597
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8601
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 8605
  label = 4; //@line 8606
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 8611
   label = 4; //@line 8612
  } else {
   $$037$off039 = 3; //@line 8614
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 8618
  $17 = $8 + 40 | 0; //@line 8619
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 8622
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 8632
    $$037$off039 = $$037$off038; //@line 8633
   } else {
    $$037$off039 = $$037$off038; //@line 8635
   }
  } else {
   $$037$off039 = $$037$off038; //@line 8638
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 8641
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 7624
 while (1) {
  if ((HEAPU8[1523 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 7631
   break;
  }
  $7 = $$016 + 1 | 0; //@line 7634
  if (($7 | 0) == 87) {
   $$01214 = 1611; //@line 7637
   $$115 = 87; //@line 7637
   label = 5; //@line 7638
   break;
  } else {
   $$016 = $7; //@line 7641
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 1611; //@line 7647
  } else {
   $$01214 = 1611; //@line 7649
   $$115 = $$016; //@line 7649
   label = 5; //@line 7650
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 7655
   $$113 = $$01214; //@line 7656
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 7660
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 7667
   if (!$$115) {
    $$012$lcssa = $$113; //@line 7670
    break;
   } else {
    $$01214 = $$113; //@line 7673
    label = 5; //@line 7674
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 7681
}
function _main() {
 var $3 = 0.0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 660
 STACKTOP = STACKTOP + 16 | 0; //@line 661
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 661
 $vararg_buffer = sp; //@line 662
 while (1) {
  $3 = +_pwmout_read(3620) + .1; //@line 667
  if (!(HEAP8[3624] | 0)) {
   HEAP8[3624] = 1; //@line 671
  }
  _pwmout_write(3620, $3); //@line 673
  HEAPF64[$vararg_buffer >> 3] = +_pwmout_read(3620); //@line 676
  _printf(972, $vararg_buffer) | 0; //@line 677
  $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 678
  _wait(.20000000298023224); //@line 679
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 684
  if (!(+_pwmout_read(3620) == 1.0)) {
   continue;
  }
  if (!(HEAP8[3624] | 0)) {
   HEAP8[3624] = 1; //@line 693
  }
  _pwmout_write(3620, 0.0); //@line 695
 }
 HEAP32[$AsyncCtx >> 2] = 31; //@line 697
 HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 699
 HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 701
 sp = STACKTOP; //@line 702
 STACKTOP = sp; //@line 703
 return 0; //@line 703
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 564
 $2 = $0 + 12 | 0; //@line 566
 $3 = HEAP32[$2 >> 2] | 0; //@line 567
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 571
   _mbed_assert_internal(883, 888, 528); //@line 572
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 27; //@line 575
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 577
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 579
    sp = STACKTOP; //@line 580
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 583
    $8 = HEAP32[$2 >> 2] | 0; //@line 585
    break;
   }
  } else {
   $8 = $3; //@line 589
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 592
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 594
 FUNCTION_TABLE_vi[$7 & 63]($0); //@line 595
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 598
  sp = STACKTOP; //@line 599
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 602
  return;
 }
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9781
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9783
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9785
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9787
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9789
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[902] | 0)) {
  _serial_init(3612, 2, 3); //@line 9797
 }
 $12 = HEAP8[$6 >> 0] | 0; //@line 9800
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9801
 _serial_putc(3612, $12); //@line 9802
 if (!___async) {
  ___async_unwind = 0; //@line 9805
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 9807
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 9809
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 9811
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 9813
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 9815
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 9817
 sp = STACKTOP; //@line 9818
 return;
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 7455
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 7455
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 7456
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 7457
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 7466
    $$016 = $9; //@line 7469
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 7469
   } else {
    $$016 = $0; //@line 7471
    $storemerge = 0; //@line 7471
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 7473
   $$0 = $$016; //@line 7474
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 7478
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 7484
   HEAP32[tempDoublePtr >> 2] = $2; //@line 7487
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 7487
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 7488
  }
 }
 return +$$0;
}
function _mbed_error_printf__async_cb_26($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9825
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9829
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9831
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9833
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9835
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 9836
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $14 = HEAP8[$10 + $12 >> 0] | 0; //@line 9843
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9844
 _serial_putc(3612, $14); //@line 9845
 if (!___async) {
  ___async_unwind = 0; //@line 9848
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 9850
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 9852
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 9854
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 9856
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 9858
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 9860
 sp = STACKTOP; //@line 9861
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8522
 STACKTOP = STACKTOP + 16 | 0; //@line 8523
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8523
 $3 = sp; //@line 8524
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8526
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 8529
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8530
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 8531
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 8534
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 8536
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8538
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8540
  sp = STACKTOP; //@line 8541
  STACKTOP = sp; //@line 8542
  return 0; //@line 8542
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 8544
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 8548
 }
 STACKTOP = sp; //@line 8550
 return $8 & 1 | 0; //@line 8550
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9223
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9231
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9233
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9235
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9237
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9239
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9241
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 9243
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 9254
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 9255
 HEAP32[$10 >> 2] = 0; //@line 9256
 HEAP32[$12 >> 2] = 0; //@line 9257
 HEAP32[$14 >> 2] = 0; //@line 9258
 HEAP32[$2 >> 2] = 0; //@line 9259
 $33 = HEAP32[$16 >> 2] | 0; //@line 9260
 HEAP32[$16 >> 2] = $33 | $18; //@line 9265
 if ($20 | 0) {
  ___unlockfile($22); //@line 9268
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 9271
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
 sp = STACKTOP; //@line 8314
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 8320
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 8323
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 8326
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8327
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 8328
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 48; //@line 8331
    sp = STACKTOP; //@line 8332
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8335
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
 sp = STACKTOP; //@line 8483
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 8489
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 8492
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 8495
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8496
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 8497
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 51; //@line 8500
    sp = STACKTOP; //@line 8501
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8504
    break;
   }
  }
 } while (0);
 return;
}
function ___dynamic_cast__async_cb_18($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9158
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9160
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9162
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9168
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 9183
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 9199
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 9204
    break;
   }
  default:
   {
    $$0 = 0; //@line 9208
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 9213
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 6453
 STACKTOP = STACKTOP + 256 | 0; //@line 6454
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 6454
 $5 = sp; //@line 6455
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 6461
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 6465
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 6468
   $$011 = $9; //@line 6469
   do {
    _out_670($0, $5, 256); //@line 6471
    $$011 = $$011 + -256 | 0; //@line 6472
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 6481
  } else {
   $$0$lcssa = $9; //@line 6483
  }
  _out_670($0, $5, $$0$lcssa); //@line 6485
 }
 STACKTOP = sp; //@line 6487
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3984
 STACKTOP = STACKTOP + 32 | 0; //@line 3985
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 3985
 $vararg_buffer = sp; //@line 3986
 $3 = sp + 20 | 0; //@line 3987
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 3991
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 3993
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 3995
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 3997
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 3999
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4004
  $10 = -1; //@line 4005
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4008
 }
 STACKTOP = sp; //@line 4010
 return $10 | 0; //@line 4010
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7793
 STACKTOP = STACKTOP + 16 | 0; //@line 7794
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7794
 $1 = sp; //@line 7795
 HEAP32[$1 >> 2] = $varargs; //@line 7796
 $2 = HEAP32[24] | 0; //@line 7797
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7798
 $3 = _vfprintf($2, $0, $1) | 0; //@line 7799
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 7802
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7804
  sp = STACKTOP; //@line 7805
  STACKTOP = sp; //@line 7806
  return 0; //@line 7806
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7808
  STACKTOP = sp; //@line 7809
  return $3 | 0; //@line 7809
 }
 return 0; //@line 7811
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
 _mbed_error_printf(676, $vararg_buffer); //@line 63
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
 $4 = $1 + 16 | 0; //@line 8036
 $5 = HEAP32[$4 >> 2] | 0; //@line 8037
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 8041
   HEAP32[$1 + 24 >> 2] = $3; //@line 8043
   HEAP32[$1 + 36 >> 2] = 1; //@line 8045
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 8049
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 8052
    HEAP32[$1 + 24 >> 2] = 2; //@line 8054
    HEAP8[$1 + 54 >> 0] = 1; //@line 8056
    break;
   }
   $10 = $1 + 24 | 0; //@line 8059
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 8063
   }
  }
 } while (0);
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 4091
 $3 = HEAP8[$1 >> 0] | 0; //@line 4092
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 4097
  $$lcssa8 = $2; //@line 4097
 } else {
  $$011 = $1; //@line 4099
  $$0710 = $0; //@line 4099
  do {
   $$0710 = $$0710 + 1 | 0; //@line 4101
   $$011 = $$011 + 1 | 0; //@line 4102
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 4103
   $9 = HEAP8[$$011 >> 0] | 0; //@line 4104
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 4109
  $$lcssa8 = $8; //@line 4109
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 4119
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4043
 STACKTOP = STACKTOP + 32 | 0; //@line 4044
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4044
 $vararg_buffer = sp; //@line 4045
 HEAP32[$0 + 36 >> 2] = 5; //@line 4048
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4056
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4058
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4060
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4065
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4068
 STACKTOP = sp; //@line 4069
 return $14 | 0; //@line 4069
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 536
 $2 = HEAP32[24] | 0; //@line 537
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 538
 _putc($1, $2) | 0; //@line 539
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 25; //@line 542
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 544
  sp = STACKTOP; //@line 545
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 548
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 549
 _fflush($2) | 0; //@line 550
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 553
  sp = STACKTOP; //@line 554
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 557
  return;
 }
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 9020
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9022
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9024
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 9025
 _wait_ms(150); //@line 9026
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 9029
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9030
  HEAP32[$4 >> 2] = $2; //@line 9031
  sp = STACKTOP; //@line 9032
  return;
 }
 ___async_unwind = 0; //@line 9035
 HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 9036
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9037
 HEAP32[$4 >> 2] = $2; //@line 9038
 sp = STACKTOP; //@line 9039
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8995
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8997
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8999
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 9000
 _wait_ms(150); //@line 9001
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 9004
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9005
  HEAP32[$4 >> 2] = $2; //@line 9006
  sp = STACKTOP; //@line 9007
  return;
 }
 ___async_unwind = 0; //@line 9010
 HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 9011
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9012
 HEAP32[$4 >> 2] = $2; //@line 9013
 sp = STACKTOP; //@line 9014
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 8970
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8972
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8974
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 8975
 _wait_ms(150); //@line 8976
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8979
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8980
  HEAP32[$4 >> 2] = $2; //@line 8981
  sp = STACKTOP; //@line 8982
  return;
 }
 ___async_unwind = 0; //@line 8985
 HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8986
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8987
 HEAP32[$4 >> 2] = $2; //@line 8988
 sp = STACKTOP; //@line 8989
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 8945
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8947
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8949
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 8950
 _wait_ms(150); //@line 8951
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8954
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8955
  HEAP32[$4 >> 2] = $2; //@line 8956
  sp = STACKTOP; //@line 8957
  return;
 }
 ___async_unwind = 0; //@line 8960
 HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8961
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8962
 HEAP32[$4 >> 2] = $2; //@line 8963
 sp = STACKTOP; //@line 8964
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 9070
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9072
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9074
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 9075
 _wait_ms(150); //@line 9076
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 9079
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9080
  HEAP32[$4 >> 2] = $2; //@line 9081
  sp = STACKTOP; //@line 9082
  return;
 }
 ___async_unwind = 0; //@line 9085
 HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 9086
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9087
 HEAP32[$4 >> 2] = $2; //@line 9088
 sp = STACKTOP; //@line 9089
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 9045
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9047
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9049
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 9050
 _wait_ms(150); //@line 9051
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 9054
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9055
  HEAP32[$4 >> 2] = $2; //@line 9056
  sp = STACKTOP; //@line 9057
  return;
 }
 ___async_unwind = 0; //@line 9060
 HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 9061
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9062
 HEAP32[$4 >> 2] = $2; //@line 9063
 sp = STACKTOP; //@line 9064
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 8695
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8697
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8699
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 8700
 _wait_ms(150); //@line 8701
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 8704
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8705
  HEAP32[$4 >> 2] = $2; //@line 8706
  sp = STACKTOP; //@line 8707
  return;
 }
 ___async_unwind = 0; //@line 8710
 HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 8711
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8712
 HEAP32[$4 >> 2] = $2; //@line 8713
 sp = STACKTOP; //@line 8714
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 8920
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8922
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8924
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 8925
 _wait_ms(150); //@line 8926
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8929
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8930
  HEAP32[$4 >> 2] = $2; //@line 8931
  sp = STACKTOP; //@line 8932
  return;
 }
 ___async_unwind = 0; //@line 8935
 HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8936
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8937
 HEAP32[$4 >> 2] = $2; //@line 8938
 sp = STACKTOP; //@line 8939
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8895
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8897
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8899
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 8900
 _wait_ms(400); //@line 8901
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8904
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8905
  HEAP32[$4 >> 2] = $2; //@line 8906
  sp = STACKTOP; //@line 8907
  return;
 }
 ___async_unwind = 0; //@line 8910
 HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8911
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8912
 HEAP32[$4 >> 2] = $2; //@line 8913
 sp = STACKTOP; //@line 8914
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 8870
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8872
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8874
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 8875
 _wait_ms(400); //@line 8876
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8879
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8880
  HEAP32[$4 >> 2] = $2; //@line 8881
  sp = STACKTOP; //@line 8882
  return;
 }
 ___async_unwind = 0; //@line 8885
 HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8886
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8887
 HEAP32[$4 >> 2] = $2; //@line 8888
 sp = STACKTOP; //@line 8889
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 8845
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8847
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8849
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 8850
 _wait_ms(400); //@line 8851
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8854
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8855
  HEAP32[$4 >> 2] = $2; //@line 8856
  sp = STACKTOP; //@line 8857
  return;
 }
 ___async_unwind = 0; //@line 8860
 HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8861
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8862
 HEAP32[$4 >> 2] = $2; //@line 8863
 sp = STACKTOP; //@line 8864
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8820
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8822
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8824
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 8825
 _wait_ms(400); //@line 8826
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8829
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8830
  HEAP32[$4 >> 2] = $2; //@line 8831
  sp = STACKTOP; //@line 8832
  return;
 }
 ___async_unwind = 0; //@line 8835
 HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8836
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8837
 HEAP32[$4 >> 2] = $2; //@line 8838
 sp = STACKTOP; //@line 8839
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8795
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8797
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8799
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 8800
 _wait_ms(400); //@line 8801
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 8804
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8805
  HEAP32[$4 >> 2] = $2; //@line 8806
  sp = STACKTOP; //@line 8807
  return;
 }
 ___async_unwind = 0; //@line 8810
 HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 8811
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8812
 HEAP32[$4 >> 2] = $2; //@line 8813
 sp = STACKTOP; //@line 8814
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8770
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8772
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8774
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 8775
 _wait_ms(400); //@line 8776
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 8779
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8780
  HEAP32[$4 >> 2] = $2; //@line 8781
  sp = STACKTOP; //@line 8782
  return;
 }
 ___async_unwind = 0; //@line 8785
 HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 8786
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8787
 HEAP32[$4 >> 2] = $2; //@line 8788
 sp = STACKTOP; //@line 8789
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8745
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8747
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8749
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 8750
 _wait_ms(400); //@line 8751
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8754
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8755
  HEAP32[$4 >> 2] = $2; //@line 8756
  sp = STACKTOP; //@line 8757
  return;
 }
 ___async_unwind = 0; //@line 8760
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8761
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8762
 HEAP32[$4 >> 2] = $2; //@line 8763
 sp = STACKTOP; //@line 8764
 return;
}
function _mbed_die__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8720
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8722
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8724
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8725
 _wait_ms(400); //@line 8726
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 8729
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 8730
  HEAP32[$4 >> 2] = $2; //@line 8731
  sp = STACKTOP; //@line 8732
  return;
 }
 ___async_unwind = 0; //@line 8735
 HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 8736
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 8737
 HEAP32[$4 >> 2] = $2; //@line 8738
 sp = STACKTOP; //@line 8739
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 10326
 newDynamicTop = oldDynamicTop + increment | 0; //@line 10327
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 10331
  ___setErrNo(12); //@line 10332
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 10336
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 10340
   ___setErrNo(12); //@line 10341
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 10345
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 6314
 } else {
  $$056 = $2; //@line 6316
  $15 = $1; //@line 6316
  $8 = $0; //@line 6316
  while (1) {
   $14 = $$056 + -1 | 0; //@line 6324
   HEAP8[$14 >> 0] = HEAPU8[1505 + ($8 & 15) >> 0] | 0 | $3; //@line 6325
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 6326
   $15 = tempRet0; //@line 6327
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 6332
    break;
   } else {
    $$056 = $14; //@line 6335
   }
  }
 }
 return $$05$lcssa | 0; //@line 6339
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 4309
 $3 = HEAP8[$1 >> 0] | 0; //@line 4311
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 4315
 $7 = HEAP32[$0 >> 2] | 0; //@line 4316
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 4321
  HEAP32[$0 + 4 >> 2] = 0; //@line 4323
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 4325
  HEAP32[$0 + 28 >> 2] = $14; //@line 4327
  HEAP32[$0 + 20 >> 2] = $14; //@line 4329
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4335
  $$0 = 0; //@line 4336
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 4339
  $$0 = -1; //@line 4340
 }
 return $$0 | 0; //@line 4342
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 6351
 } else {
  $$06 = $2; //@line 6353
  $11 = $1; //@line 6353
  $7 = $0; //@line 6353
  while (1) {
   $10 = $$06 + -1 | 0; //@line 6358
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 6359
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 6360
   $11 = tempRet0; //@line 6361
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 6366
    break;
   } else {
    $$06 = $10; //@line 6369
   }
  }
 }
 return $$0$lcssa | 0; //@line 6373
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8555
 do {
  if (!$0) {
   $3 = 0; //@line 8559
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8561
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 8562
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 53; //@line 8565
    sp = STACKTOP; //@line 8566
    return 0; //@line 8567
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8569
    $3 = ($2 | 0) != 0 & 1; //@line 8572
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 8577
}
function _invoke_ticker__async_cb_2($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8671
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 8677
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 8678
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8679
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 8680
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 8683
  sp = STACKTOP; //@line 8684
  return;
 }
 ___async_unwind = 0; //@line 8687
 HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 8688
 sp = STACKTOP; //@line 8689
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 5995
 } else {
  $$04 = 0; //@line 5997
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 6000
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 6004
   $12 = $7 + 1 | 0; //@line 6005
   HEAP32[$0 >> 2] = $12; //@line 6006
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 6012
    break;
   } else {
    $$04 = $11; //@line 6015
   }
  }
 }
 return $$0$lcssa | 0; //@line 6019
}
function ___fflush_unlocked__async_cb_25($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9738
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9740
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9742
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9744
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 9746
 HEAP32[$4 >> 2] = 0; //@line 9747
 HEAP32[$6 >> 2] = 0; //@line 9748
 HEAP32[$8 >> 2] = 0; //@line 9749
 HEAP32[$10 >> 2] = 0; //@line 9750
 HEAP32[___async_retval >> 2] = 0; //@line 9752
 return;
}
function _serial_putc__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9289
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9291
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9292
 _fflush($2) | 0; //@line 9293
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 26; //@line 9296
  sp = STACKTOP; //@line 9297
  return;
 }
 ___async_unwind = 0; //@line 9300
 HEAP32[$ReallocAsyncCtx >> 2] = 26; //@line 9301
 sp = STACKTOP; //@line 9302
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 10177
 ___async_unwind = 1; //@line 10178
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 10184
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 10188
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 10192
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 10194
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3854
 STACKTOP = STACKTOP + 16 | 0; //@line 3855
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3855
 $vararg_buffer = sp; //@line 3856
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 3860
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 3862
 STACKTOP = sp; //@line 3863
 return $5 | 0; //@line 3863
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 10119
 STACKTOP = STACKTOP + 16 | 0; //@line 10120
 $rem = __stackBase__ | 0; //@line 10121
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 10122
 STACKTOP = __stackBase__; //@line 10123
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 10124
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 9889
 if ((ret | 0) < 8) return ret | 0; //@line 9890
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 9891
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 9892
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 9893
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 9894
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 9895
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7940
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 7777
 $6 = HEAP32[$5 >> 2] | 0; //@line 7778
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 7779
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 7781
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 7783
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 7786
 return $2 | 0; //@line 7787
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9321
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 9324
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9329
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9332
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9593
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 9604
  $$0 = 1; //@line 9605
 } else {
  $$0 = 0; //@line 9607
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 9611
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 619
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 623
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 624
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 29; //@line 627
  sp = STACKTOP; //@line 628
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 631
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 8016
 }
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 515
 HEAP32[$0 >> 2] = $1; //@line 516
 HEAP32[902] = 1; //@line 517
 $4 = $0; //@line 518
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 523
 $10 = 3612; //@line 524
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 526
 HEAP32[$10 + 4 >> 2] = $9; //@line 529
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 638
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 639
 _emscripten_sleep($0 | 0); //@line 640
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 30; //@line 643
  sp = STACKTOP; //@line 644
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 647
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
  $7 = $1 + 28 | 0; //@line 8080
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 8084
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 10153
 HEAP32[new_frame + 4 >> 2] = sp; //@line 10155
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 10157
 ___async_cur_frame = new_frame; //@line 10158
 return ___async_cur_frame + 8 | 0; //@line 10159
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 10142
  return low << bits; //@line 10143
 }
 tempRet0 = low << bits - 32; //@line 10145
 return 0; //@line 10146
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 9767
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 9771
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 9774
 return;
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 10131
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 10132
 }
 tempRet0 = 0; //@line 10134
 return high >>> bits - 32 | 0; //@line 10135
}
function _fflush__async_cb_21($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9499
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 9501
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9504
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
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 9104
 } else {
  $$0 = -1; //@line 9106
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 9109
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 4439
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 4445
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 4449
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 10387
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 10165
 stackRestore(___async_cur_frame | 0); //@line 10166
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 10167
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9348
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 9349
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9351
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 7436
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 7436
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 7438
 return $1 | 0; //@line 7439
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4020
  $$0 = -1; //@line 4021
 } else {
  $$0 = $0; //@line 4023
 }
 return $$0 | 0; //@line 4025
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 461
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 467
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 468
 return;
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 9882
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 9883
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 9884
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 9874
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 9876
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 10380
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 10373
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 6496
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 6499
 }
 return $$0 | 0; //@line 6501
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 10359
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 10111
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 9144
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 10172
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 10173
}
function _pwmout_init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 483
 _emscripten_asm_const_iiiii(2, $0 | 0, $1 | 0, 20, 0) | 0; //@line 484
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
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 4575
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 4577
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 8302
 __ZdlPv($0); //@line 8303
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7830
 __ZdlPv($0); //@line 7831
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
  ___fwritex($1, $2, $0) | 0; //@line 5981
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 8659
 return;
}
function b26(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 10451
}
function b25(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 10448
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 8027
}
function _pwmout_write($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, ~~($1 * 1024.0) | 0) | 0; //@line 495
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 10199
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b23(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 10445
}
function b22(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 10442
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 6444
}
function _fflush__async_cb_22($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9514
 return;
}
function _putc__async_cb_20($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9361
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 10352
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9121
 return;
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 10400
 return 0; //@line 10400
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 10397
 return 0; //@line 10397
}
function b3(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 10394
 return 0; //@line 10394
}
function _pwmout_read($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(3, HEAP32[$0 >> 2] | 0) | 0) * .0009765625);
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 10366
}
function b20(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 10439
}
function b19(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 10436
}
function __GLOBAL__sub_I_main_cpp() {
 HEAP8[3624] = 0; //@line 654
 _pwmout_init(3620, 9); //@line 655
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 7689
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 4078
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 10391
 return 0; //@line 10391
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
 ___lock(4192); //@line 4582
 return 4200; //@line 4583
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
 return _pthread_self() | 0; //@line 7610
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 7616
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 7817
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
 ___unlock(4192); //@line 4588
 return;
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(63); //@line 10433
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(62); //@line 10430
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(61); //@line 10427
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(60); //@line 10424
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(59); //@line 10421
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(58); //@line 10418
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(57); //@line 10415
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_vi(56); //@line 10412
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4036
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 4231
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_vi(55); //@line 10409
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_vi(54); //@line 10406
}
function b7(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 10403
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
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 4188; //@line 4030
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
 return 228; //@line 4083
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
var FUNCTION_TABLE_iiii = [b3,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b4,b5];
var FUNCTION_TABLE_vi = [b7,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_assert_internal__async_cb,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb_3,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_printf__async_cb_26,_serial_putc__async_cb_19,_serial_putc__async_cb,_invoke_ticker__async_cb_2,_invoke_ticker__async_cb
,_wait__async_cb,_wait_ms__async_cb,_main__async_cb,_putc__async_cb_20,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_22,_fflush__async_cb_21,_fflush__async_cb_23,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_25,_vfprintf__async_cb,_vsnprintf__async_cb,_printf__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_24,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_18,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b8,b9,b10,b11,b12
,b13,b14,b15,b16,b17];
var FUNCTION_TABLE_viiii = [b19,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b20];
var FUNCTION_TABLE_viiiii = [b22,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b23];
var FUNCTION_TABLE_viiiiii = [b25,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b26];

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
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
 function($0) { console.log("TextDisplay putc", $0); },
 function($0, $1, $2) { window.MbedJSHal.sht31.init($0, $1, $2); },
 function($0) { return window.MbedJSHal.sht31.read_temperature($0); },
 function($0) { return window.MbedJSHal.sht31.read_humidity($0); }];

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

STATICTOP = STATIC_BASE + 15408;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "temperature.js.mem";





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
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN4mbed8FileBaseD2Ev", "__ZN4mbed8FileBaseD0Ev", "__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev", "__ZN4mbed10FileHandleD0Ev", "__ZN4mbed10FileHandle6rewindEv", "__ZN4mbed6StreamD2Ev", "__ZN4mbed6StreamD0Ev", "__ZN4mbed6Stream6rewindEv", "__ZN4mbed6Stream4lockEv", "__ZN4mbed6Stream6unlockEv", "__ZThn4_N4mbed6StreamD1Ev", "__ZThn4_N4mbed6StreamD0Ev", "__ZN6C12832D0Ev", "__ZN6C128326_flushEv", "__ZN6C128323clsEv", "__ZThn4_N6C12832D1Ev", "__ZThn4_N6C12832D0Ev", "__ZN15GraphicsDisplayD0Ev", "__ZN15GraphicsDisplay3clsEv", "__ZThn4_N15GraphicsDisplayD1Ev", "__ZThn4_N15GraphicsDisplayD0Ev", "__ZN11TextDisplayD0Ev", "__ZN11TextDisplay3clsEv", "__ZThn4_N11TextDisplayD1Ev", "__ZThn4_N11TextDisplayD0Ev", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed10FileHandle5lseekEii__async_cb", "__ZN4mbed10FileHandle5fsyncEv__async_cb", "__ZN4mbed10FileHandle4flenEv__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_52", "_mbed_vtracef__async_cb_42", "_mbed_vtracef__async_cb_43", "_mbed_vtracef__async_cb_44", "_mbed_vtracef__async_cb_51", "_mbed_vtracef__async_cb_45", "_mbed_vtracef__async_cb_50", "_mbed_vtracef__async_cb_46", "_mbed_vtracef__async_cb_47", "_mbed_vtracef__async_cb_48", "_mbed_vtracef__async_cb_49", "__ZN4mbed8FileBaseD2Ev__async_cb_85", "__ZN4mbed8FileBaseD2Ev__async_cb", "__ZN4mbed8FileBaseD2Ev__async_cb_86", "__ZN4mbed8FileBaseD0Ev__async_cb_22", "__ZN4mbed8FileBaseD0Ev__async_cb", "__ZN4mbed8FileBaseD0Ev__async_cb_23", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_68", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb", "__ZN4mbed10FileHandle4tellEv__async_cb", "__ZN4mbed10FileHandle6rewindEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb_24", "__ZN4mbed10FileHandle4sizeEv__async_cb_25", "__ZN4mbed6StreamD2Ev__async_cb", "__ZN4mbed6StreamD2Ev__async_cb_5", "__ZN4mbed6Stream4readEPvj__async_cb", "__ZN4mbed6Stream4readEPvj__async_cb_39", "__ZN4mbed6Stream4readEPvj__async_cb_40", "__ZN4mbed6Stream5writeEPKvj__async_cb", "__ZN4mbed6Stream5writeEPKvj__async_cb_28", "__ZN4mbed6Stream5writeEPKvj__async_cb_29", "__ZThn4_N4mbed6StreamD1Ev__async_cb", "__ZThn4_N4mbed6StreamD1Ev__async_cb_96", "__ZN4mbed6StreamC2EPKc__async_cb_75", "__ZN4mbed6StreamC2EPKc__async_cb", "__ZN4mbed6StreamC2EPKc__async_cb_76", "__ZN4mbed6Stream4putcEi__async_cb", "__ZN4mbed6Stream4putcEi__async_cb_38", "__ZN4mbed6Stream4putcEi__async_cb_36", "__ZN4mbed6Stream4putcEi__async_cb_37", "__ZN4mbed6Stream6printfEPKcz__async_cb", "__ZN4mbed6Stream6printfEPKcz__async_cb_56", "__ZN4mbed6Stream6printfEPKcz__async_cb_53", "__ZN4mbed6Stream6printfEPKcz__async_cb_54", "__ZN4mbed6Stream6printfEPKcz__async_cb_55", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_20", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_82", "_mbed_error_vfprintf__async_cb_81", "_mbed_error__async_cb_77", "___WFI__async_cb", "_serial_putc__async_cb_84", "_serial_putc__async_cb", "_invoke_ticker__async_cb_98", "_invoke_ticker__async_cb", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_70", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb", "_exit__async_cb", "__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__ZN6C12832D0Ev__async_cb", "__ZN6C128325_putcEi__async_cb", "__ZN6C128325_putcEi__async_cb_69", "__ZN6C128329characterEiii__async_cb", "__ZN6C128329characterEiii__async_cb_65", "__ZN6C128329characterEiii__async_cb_66", "__ZN6C128329characterEiii__async_cb_67", "__ZN6C128324rowsEv__async_cb", "__ZN6C128327columnsEv__async_cb", "__ZThn4_N6C12832D1Ev__async_cb", "__ZThn4_N6C12832D0Ev__async_cb", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_59", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb", "__ZN15GraphicsDisplay9characterEiii__async_cb", "__ZN15GraphicsDisplay4rowsEv__async_cb", "__ZN15GraphicsDisplay7columnsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb_79", "__ZN15GraphicsDisplay3clsEv__async_cb_80", "__ZN15GraphicsDisplay4putpEi__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb_58", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_35", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_21", "__ZThn4_N15GraphicsDisplayD1Ev__async_cb", "__ZN15GraphicsDisplayC2EPKc__async_cb_95", "__ZN15GraphicsDisplayC2EPKc__async_cb", "__ZN11TextDisplay5_putcEi__async_cb", "__ZN11TextDisplay5_putcEi__async_cb_71", "__ZN11TextDisplay5_putcEi__async_cb_72", "__ZN11TextDisplay5_putcEi__async_cb_73", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_57", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb", "__ZN11TextDisplay3clsEv__async_cb", "__ZN11TextDisplay3clsEv__async_cb_30", "__ZN11TextDisplay3clsEv__async_cb_31", "__ZN11TextDisplay3clsEv__async_cb_34", "__ZN11TextDisplay3clsEv__async_cb_32", "__ZN11TextDisplay3clsEv__async_cb_33", "__ZThn4_N11TextDisplayD1Ev__async_cb", "__ZN11TextDisplayC2EPKc__async_cb_41", "__ZN11TextDisplayC2EPKc__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb", "_main__async_cb_90", "_putc__async_cb_60", "_putc__async_cb", "___overflow__async_cb", "_fclose__async_cb_97", "_fclose__async_cb", "_fflush__async_cb_88", "_fflush__async_cb_87", "_fflush__async_cb_89", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_4", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_sprintf__async_cb", "_vsprintf__async_cb", "_freopen__async_cb", "_freopen__async_cb_64", "_freopen__async_cb_63", "_freopen__async_cb_62", "_fputc__async_cb_27", "_fputc__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__Znaj__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_78", "_abort_message__async_cb", "_abort_message__async_cb_26", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_3", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_74", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_93", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_92", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_91", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_83", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 4756
 STACKTOP = STACKTOP + 16 | 0; //@line 4757
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4757
 $1 = sp; //@line 4758
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4765
   $7 = $6 >>> 3; //@line 4766
   $8 = HEAP32[3441] | 0; //@line 4767
   $9 = $8 >>> $7; //@line 4768
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4774
    $16 = 13804 + ($14 << 1 << 2) | 0; //@line 4776
    $17 = $16 + 8 | 0; //@line 4777
    $18 = HEAP32[$17 >> 2] | 0; //@line 4778
    $19 = $18 + 8 | 0; //@line 4779
    $20 = HEAP32[$19 >> 2] | 0; //@line 4780
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3441] = $8 & ~(1 << $14); //@line 4787
     } else {
      if ((HEAP32[3445] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4792
      }
      $27 = $20 + 12 | 0; //@line 4795
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4799
       HEAP32[$17 >> 2] = $20; //@line 4800
       break;
      } else {
       _abort(); //@line 4803
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4808
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4811
    $34 = $18 + $30 + 4 | 0; //@line 4813
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4816
    $$0 = $19; //@line 4817
    STACKTOP = sp; //@line 4818
    return $$0 | 0; //@line 4818
   }
   $37 = HEAP32[3443] | 0; //@line 4820
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4826
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4829
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4832
     $49 = $47 >>> 12 & 16; //@line 4834
     $50 = $47 >>> $49; //@line 4835
     $52 = $50 >>> 5 & 8; //@line 4837
     $54 = $50 >>> $52; //@line 4839
     $56 = $54 >>> 2 & 4; //@line 4841
     $58 = $54 >>> $56; //@line 4843
     $60 = $58 >>> 1 & 2; //@line 4845
     $62 = $58 >>> $60; //@line 4847
     $64 = $62 >>> 1 & 1; //@line 4849
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4852
     $69 = 13804 + ($67 << 1 << 2) | 0; //@line 4854
     $70 = $69 + 8 | 0; //@line 4855
     $71 = HEAP32[$70 >> 2] | 0; //@line 4856
     $72 = $71 + 8 | 0; //@line 4857
     $73 = HEAP32[$72 >> 2] | 0; //@line 4858
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4864
       HEAP32[3441] = $77; //@line 4865
       $98 = $77; //@line 4866
      } else {
       if ((HEAP32[3445] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4871
       }
       $80 = $73 + 12 | 0; //@line 4874
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4878
        HEAP32[$70 >> 2] = $73; //@line 4879
        $98 = $8; //@line 4880
        break;
       } else {
        _abort(); //@line 4883
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4888
     $84 = $83 - $6 | 0; //@line 4889
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4892
     $87 = $71 + $6 | 0; //@line 4893
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4896
     HEAP32[$71 + $83 >> 2] = $84; //@line 4898
     if ($37 | 0) {
      $92 = HEAP32[3446] | 0; //@line 4901
      $93 = $37 >>> 3; //@line 4902
      $95 = 13804 + ($93 << 1 << 2) | 0; //@line 4904
      $96 = 1 << $93; //@line 4905
      if (!($98 & $96)) {
       HEAP32[3441] = $98 | $96; //@line 4910
       $$0199 = $95; //@line 4912
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4912
      } else {
       $101 = $95 + 8 | 0; //@line 4914
       $102 = HEAP32[$101 >> 2] | 0; //@line 4915
       if ((HEAP32[3445] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4919
       } else {
        $$0199 = $102; //@line 4922
        $$pre$phiZ2D = $101; //@line 4922
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4925
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4927
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4929
      HEAP32[$92 + 12 >> 2] = $95; //@line 4931
     }
     HEAP32[3443] = $84; //@line 4933
     HEAP32[3446] = $87; //@line 4934
     $$0 = $72; //@line 4935
     STACKTOP = sp; //@line 4936
     return $$0 | 0; //@line 4936
    }
    $108 = HEAP32[3442] | 0; //@line 4938
    if (!$108) {
     $$0197 = $6; //@line 4941
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4945
     $114 = $112 >>> 12 & 16; //@line 4947
     $115 = $112 >>> $114; //@line 4948
     $117 = $115 >>> 5 & 8; //@line 4950
     $119 = $115 >>> $117; //@line 4952
     $121 = $119 >>> 2 & 4; //@line 4954
     $123 = $119 >>> $121; //@line 4956
     $125 = $123 >>> 1 & 2; //@line 4958
     $127 = $123 >>> $125; //@line 4960
     $129 = $127 >>> 1 & 1; //@line 4962
     $134 = HEAP32[14068 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4967
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4971
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4977
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4980
      $$0193$lcssa$i = $138; //@line 4980
     } else {
      $$01926$i = $134; //@line 4982
      $$01935$i = $138; //@line 4982
      $146 = $143; //@line 4982
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4987
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4988
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4989
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4990
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4996
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4999
        $$0193$lcssa$i = $$$0193$i; //@line 4999
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 5002
        $$01935$i = $$$0193$i; //@line 5002
       }
      }
     }
     $157 = HEAP32[3445] | 0; //@line 5006
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5009
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 5012
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5015
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 5019
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 5021
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 5025
       $176 = HEAP32[$175 >> 2] | 0; //@line 5026
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 5029
        $179 = HEAP32[$178 >> 2] | 0; //@line 5030
        if (!$179) {
         $$3$i = 0; //@line 5033
         break;
        } else {
         $$1196$i = $179; //@line 5036
         $$1198$i = $178; //@line 5036
        }
       } else {
        $$1196$i = $176; //@line 5039
        $$1198$i = $175; //@line 5039
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 5042
        $182 = HEAP32[$181 >> 2] | 0; //@line 5043
        if ($182 | 0) {
         $$1196$i = $182; //@line 5046
         $$1198$i = $181; //@line 5046
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 5049
        $185 = HEAP32[$184 >> 2] | 0; //@line 5050
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 5055
         $$1198$i = $184; //@line 5055
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 5060
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 5063
        $$3$i = $$1196$i; //@line 5064
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 5069
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 5072
       }
       $169 = $167 + 12 | 0; //@line 5075
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 5079
       }
       $172 = $164 + 8 | 0; //@line 5082
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 5086
        HEAP32[$172 >> 2] = $167; //@line 5087
        $$3$i = $164; //@line 5088
        break;
       } else {
        _abort(); //@line 5091
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 5100
       $191 = 14068 + ($190 << 2) | 0; //@line 5101
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 5106
         if (!$$3$i) {
          HEAP32[3442] = $108 & ~(1 << $190); //@line 5112
          break L73;
         }
        } else {
         if ((HEAP32[3445] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 5119
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 5127
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3445] | 0; //@line 5137
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 5140
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 5144
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 5146
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 5152
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 5156
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 5158
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 5164
       if ($214 | 0) {
        if ((HEAP32[3445] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 5170
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 5174
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 5176
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 5184
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 5187
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 5189
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 5192
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 5196
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 5199
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 5201
      if ($37 | 0) {
       $234 = HEAP32[3446] | 0; //@line 5204
       $235 = $37 >>> 3; //@line 5205
       $237 = 13804 + ($235 << 1 << 2) | 0; //@line 5207
       $238 = 1 << $235; //@line 5208
       if (!($8 & $238)) {
        HEAP32[3441] = $8 | $238; //@line 5213
        $$0189$i = $237; //@line 5215
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 5215
       } else {
        $242 = $237 + 8 | 0; //@line 5217
        $243 = HEAP32[$242 >> 2] | 0; //@line 5218
        if ((HEAP32[3445] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 5222
        } else {
         $$0189$i = $243; //@line 5225
         $$pre$phi$iZ2D = $242; //@line 5225
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 5228
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 5230
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 5232
       HEAP32[$234 + 12 >> 2] = $237; //@line 5234
      }
      HEAP32[3443] = $$0193$lcssa$i; //@line 5236
      HEAP32[3446] = $159; //@line 5237
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 5240
     STACKTOP = sp; //@line 5241
     return $$0 | 0; //@line 5241
    }
   } else {
    $$0197 = $6; //@line 5244
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 5249
   } else {
    $251 = $0 + 11 | 0; //@line 5251
    $252 = $251 & -8; //@line 5252
    $253 = HEAP32[3442] | 0; //@line 5253
    if (!$253) {
     $$0197 = $252; //@line 5256
    } else {
     $255 = 0 - $252 | 0; //@line 5258
     $256 = $251 >>> 8; //@line 5259
     if (!$256) {
      $$0358$i = 0; //@line 5262
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 5266
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 5270
       $262 = $256 << $261; //@line 5271
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 5274
       $267 = $262 << $265; //@line 5276
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 5279
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 5284
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 5290
      }
     }
     $282 = HEAP32[14068 + ($$0358$i << 2) >> 2] | 0; //@line 5294
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 5298
       $$3$i203 = 0; //@line 5298
       $$3350$i = $255; //@line 5298
       label = 81; //@line 5299
      } else {
       $$0342$i = 0; //@line 5306
       $$0347$i = $255; //@line 5306
       $$0353$i = $282; //@line 5306
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 5306
       $$0362$i = 0; //@line 5306
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 5311
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 5316
          $$435113$i = 0; //@line 5316
          $$435712$i = $$0353$i; //@line 5316
          label = 85; //@line 5317
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 5320
          $$1348$i = $292; //@line 5320
         }
        } else {
         $$1343$i = $$0342$i; //@line 5323
         $$1348$i = $$0347$i; //@line 5323
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 5326
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 5329
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 5333
        $302 = ($$0353$i | 0) == 0; //@line 5334
        if ($302) {
         $$2355$i = $$1363$i; //@line 5339
         $$3$i203 = $$1343$i; //@line 5339
         $$3350$i = $$1348$i; //@line 5339
         label = 81; //@line 5340
         break;
        } else {
         $$0342$i = $$1343$i; //@line 5343
         $$0347$i = $$1348$i; //@line 5343
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 5343
         $$0362$i = $$1363$i; //@line 5343
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 5353
       $309 = $253 & ($306 | 0 - $306); //@line 5356
       if (!$309) {
        $$0197 = $252; //@line 5359
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 5364
       $315 = $313 >>> 12 & 16; //@line 5366
       $316 = $313 >>> $315; //@line 5367
       $318 = $316 >>> 5 & 8; //@line 5369
       $320 = $316 >>> $318; //@line 5371
       $322 = $320 >>> 2 & 4; //@line 5373
       $324 = $320 >>> $322; //@line 5375
       $326 = $324 >>> 1 & 2; //@line 5377
       $328 = $324 >>> $326; //@line 5379
       $330 = $328 >>> 1 & 1; //@line 5381
       $$4$ph$i = 0; //@line 5387
       $$4357$ph$i = HEAP32[14068 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 5387
      } else {
       $$4$ph$i = $$3$i203; //@line 5389
       $$4357$ph$i = $$2355$i; //@line 5389
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 5393
       $$4351$lcssa$i = $$3350$i; //@line 5393
      } else {
       $$414$i = $$4$ph$i; //@line 5395
       $$435113$i = $$3350$i; //@line 5395
       $$435712$i = $$4357$ph$i; //@line 5395
       label = 85; //@line 5396
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 5401
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 5405
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 5406
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 5407
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 5408
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5414
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 5417
        $$4351$lcssa$i = $$$4351$i; //@line 5417
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 5420
        $$435113$i = $$$4351$i; //@line 5420
        label = 85; //@line 5421
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 5427
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3443] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3445] | 0; //@line 5433
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 5436
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 5439
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 5442
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 5446
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 5448
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 5452
         $371 = HEAP32[$370 >> 2] | 0; //@line 5453
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 5456
          $374 = HEAP32[$373 >> 2] | 0; //@line 5457
          if (!$374) {
           $$3372$i = 0; //@line 5460
           break;
          } else {
           $$1370$i = $374; //@line 5463
           $$1374$i = $373; //@line 5463
          }
         } else {
          $$1370$i = $371; //@line 5466
          $$1374$i = $370; //@line 5466
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 5469
          $377 = HEAP32[$376 >> 2] | 0; //@line 5470
          if ($377 | 0) {
           $$1370$i = $377; //@line 5473
           $$1374$i = $376; //@line 5473
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 5476
          $380 = HEAP32[$379 >> 2] | 0; //@line 5477
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 5482
           $$1374$i = $379; //@line 5482
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 5487
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 5490
          $$3372$i = $$1370$i; //@line 5491
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 5496
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 5499
         }
         $364 = $362 + 12 | 0; //@line 5502
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 5506
         }
         $367 = $359 + 8 | 0; //@line 5509
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 5513
          HEAP32[$367 >> 2] = $362; //@line 5514
          $$3372$i = $359; //@line 5515
          break;
         } else {
          _abort(); //@line 5518
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 5526
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 5529
         $386 = 14068 + ($385 << 2) | 0; //@line 5530
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 5535
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 5540
            HEAP32[3442] = $391; //@line 5541
            $475 = $391; //@line 5542
            break L164;
           }
          } else {
           if ((HEAP32[3445] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 5549
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 5557
            if (!$$3372$i) {
             $475 = $253; //@line 5560
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3445] | 0; //@line 5568
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 5571
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 5575
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 5577
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 5583
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 5587
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 5589
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 5595
         if (!$409) {
          $475 = $253; //@line 5598
         } else {
          if ((HEAP32[3445] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 5603
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 5607
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 5609
           $475 = $253; //@line 5610
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 5619
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 5622
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 5624
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 5627
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 5631
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 5634
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 5636
         $428 = $$4351$lcssa$i >>> 3; //@line 5637
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 13804 + ($428 << 1 << 2) | 0; //@line 5641
          $432 = HEAP32[3441] | 0; //@line 5642
          $433 = 1 << $428; //@line 5643
          if (!($432 & $433)) {
           HEAP32[3441] = $432 | $433; //@line 5648
           $$0368$i = $431; //@line 5650
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 5650
          } else {
           $437 = $431 + 8 | 0; //@line 5652
           $438 = HEAP32[$437 >> 2] | 0; //@line 5653
           if ((HEAP32[3445] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 5657
           } else {
            $$0368$i = $438; //@line 5660
            $$pre$phi$i211Z2D = $437; //@line 5660
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 5663
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 5665
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 5667
          HEAP32[$354 + 12 >> 2] = $431; //@line 5669
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 5672
         if (!$444) {
          $$0361$i = 0; //@line 5675
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 5679
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 5683
           $450 = $444 << $449; //@line 5684
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 5687
           $455 = $450 << $453; //@line 5689
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 5692
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5697
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5703
          }
         }
         $469 = 14068 + ($$0361$i << 2) | 0; //@line 5706
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5708
         $471 = $354 + 16 | 0; //@line 5709
         HEAP32[$471 + 4 >> 2] = 0; //@line 5711
         HEAP32[$471 >> 2] = 0; //@line 5712
         $473 = 1 << $$0361$i; //@line 5713
         if (!($475 & $473)) {
          HEAP32[3442] = $475 | $473; //@line 5718
          HEAP32[$469 >> 2] = $354; //@line 5719
          HEAP32[$354 + 24 >> 2] = $469; //@line 5721
          HEAP32[$354 + 12 >> 2] = $354; //@line 5723
          HEAP32[$354 + 8 >> 2] = $354; //@line 5725
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5734
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5734
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5741
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5745
          $494 = HEAP32[$492 >> 2] | 0; //@line 5747
          if (!$494) {
           label = 136; //@line 5750
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5753
           $$0345$i = $494; //@line 5753
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3445] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5760
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5763
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5765
           HEAP32[$354 + 12 >> 2] = $354; //@line 5767
           HEAP32[$354 + 8 >> 2] = $354; //@line 5769
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5774
          $502 = HEAP32[$501 >> 2] | 0; //@line 5775
          $503 = HEAP32[3445] | 0; //@line 5776
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5782
           HEAP32[$501 >> 2] = $354; //@line 5783
           HEAP32[$354 + 8 >> 2] = $502; //@line 5785
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5787
           HEAP32[$354 + 24 >> 2] = 0; //@line 5789
           break;
          } else {
           _abort(); //@line 5792
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5799
       STACKTOP = sp; //@line 5800
       return $$0 | 0; //@line 5800
      } else {
       $$0197 = $252; //@line 5802
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3443] | 0; //@line 5809
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5812
  $515 = HEAP32[3446] | 0; //@line 5813
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5816
   HEAP32[3446] = $517; //@line 5817
   HEAP32[3443] = $514; //@line 5818
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5821
   HEAP32[$515 + $512 >> 2] = $514; //@line 5823
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5826
  } else {
   HEAP32[3443] = 0; //@line 5828
   HEAP32[3446] = 0; //@line 5829
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5832
   $526 = $515 + $512 + 4 | 0; //@line 5834
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5837
  }
  $$0 = $515 + 8 | 0; //@line 5840
  STACKTOP = sp; //@line 5841
  return $$0 | 0; //@line 5841
 }
 $530 = HEAP32[3444] | 0; //@line 5843
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5846
  HEAP32[3444] = $532; //@line 5847
  $533 = HEAP32[3447] | 0; //@line 5848
  $534 = $533 + $$0197 | 0; //@line 5849
  HEAP32[3447] = $534; //@line 5850
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5853
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5856
  $$0 = $533 + 8 | 0; //@line 5858
  STACKTOP = sp; //@line 5859
  return $$0 | 0; //@line 5859
 }
 if (!(HEAP32[3559] | 0)) {
  HEAP32[3561] = 4096; //@line 5864
  HEAP32[3560] = 4096; //@line 5865
  HEAP32[3562] = -1; //@line 5866
  HEAP32[3563] = -1; //@line 5867
  HEAP32[3564] = 0; //@line 5868
  HEAP32[3552] = 0; //@line 5869
  HEAP32[3559] = $1 & -16 ^ 1431655768; //@line 5873
  $548 = 4096; //@line 5874
 } else {
  $548 = HEAP32[3561] | 0; //@line 5877
 }
 $545 = $$0197 + 48 | 0; //@line 5879
 $546 = $$0197 + 47 | 0; //@line 5880
 $547 = $548 + $546 | 0; //@line 5881
 $549 = 0 - $548 | 0; //@line 5882
 $550 = $547 & $549; //@line 5883
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5886
  STACKTOP = sp; //@line 5887
  return $$0 | 0; //@line 5887
 }
 $552 = HEAP32[3551] | 0; //@line 5889
 if ($552 | 0) {
  $554 = HEAP32[3549] | 0; //@line 5892
  $555 = $554 + $550 | 0; //@line 5893
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5898
   STACKTOP = sp; //@line 5899
   return $$0 | 0; //@line 5899
  }
 }
 L244 : do {
  if (!(HEAP32[3552] & 4)) {
   $561 = HEAP32[3447] | 0; //@line 5907
   L246 : do {
    if (!$561) {
     label = 163; //@line 5911
    } else {
     $$0$i$i = 14212; //@line 5913
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5915
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5918
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5927
      if (!$570) {
       label = 163; //@line 5930
       break L246;
      } else {
       $$0$i$i = $570; //@line 5933
      }
     }
     $595 = $547 - $530 & $549; //@line 5937
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5940
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5948
       } else {
        $$723947$i = $595; //@line 5950
        $$748$i = $597; //@line 5950
        label = 180; //@line 5951
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5955
       $$2253$ph$i = $595; //@line 5955
       label = 171; //@line 5956
      }
     } else {
      $$2234243136$i = 0; //@line 5959
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5965
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5968
     } else {
      $574 = $572; //@line 5970
      $575 = HEAP32[3560] | 0; //@line 5971
      $576 = $575 + -1 | 0; //@line 5972
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5980
      $584 = HEAP32[3549] | 0; //@line 5981
      $585 = $$$i + $584 | 0; //@line 5982
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3551] | 0; //@line 5987
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5994
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5998
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 6001
        $$748$i = $572; //@line 6001
        label = 180; //@line 6002
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 6005
        $$2253$ph$i = $$$i; //@line 6005
        label = 171; //@line 6006
       }
      } else {
       $$2234243136$i = 0; //@line 6009
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 6016
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 6025
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 6028
       $$748$i = $$2247$ph$i; //@line 6028
       label = 180; //@line 6029
       break L244;
      }
     }
     $607 = HEAP32[3561] | 0; //@line 6033
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 6037
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 6040
      $$748$i = $$2247$ph$i; //@line 6040
      label = 180; //@line 6041
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 6047
      $$2234243136$i = 0; //@line 6048
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 6052
      $$748$i = $$2247$ph$i; //@line 6052
      label = 180; //@line 6053
      break L244;
     }
    }
   } while (0);
   HEAP32[3552] = HEAP32[3552] | 4; //@line 6060
   $$4236$i = $$2234243136$i; //@line 6061
   label = 178; //@line 6062
  } else {
   $$4236$i = 0; //@line 6064
   label = 178; //@line 6065
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 6071
   $621 = _sbrk(0) | 0; //@line 6072
   $627 = $621 - $620 | 0; //@line 6080
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 6082
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 6090
    $$748$i = $620; //@line 6090
    label = 180; //@line 6091
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3549] | 0) + $$723947$i | 0; //@line 6097
  HEAP32[3549] = $633; //@line 6098
  if ($633 >>> 0 > (HEAP32[3550] | 0) >>> 0) {
   HEAP32[3550] = $633; //@line 6102
  }
  $636 = HEAP32[3447] | 0; //@line 6104
  do {
   if (!$636) {
    $638 = HEAP32[3445] | 0; //@line 6108
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3445] = $$748$i; //@line 6113
    }
    HEAP32[3553] = $$748$i; //@line 6115
    HEAP32[3554] = $$723947$i; //@line 6116
    HEAP32[3556] = 0; //@line 6117
    HEAP32[3450] = HEAP32[3559]; //@line 6119
    HEAP32[3449] = -1; //@line 6120
    HEAP32[3454] = 13804; //@line 6121
    HEAP32[3453] = 13804; //@line 6122
    HEAP32[3456] = 13812; //@line 6123
    HEAP32[3455] = 13812; //@line 6124
    HEAP32[3458] = 13820; //@line 6125
    HEAP32[3457] = 13820; //@line 6126
    HEAP32[3460] = 13828; //@line 6127
    HEAP32[3459] = 13828; //@line 6128
    HEAP32[3462] = 13836; //@line 6129
    HEAP32[3461] = 13836; //@line 6130
    HEAP32[3464] = 13844; //@line 6131
    HEAP32[3463] = 13844; //@line 6132
    HEAP32[3466] = 13852; //@line 6133
    HEAP32[3465] = 13852; //@line 6134
    HEAP32[3468] = 13860; //@line 6135
    HEAP32[3467] = 13860; //@line 6136
    HEAP32[3470] = 13868; //@line 6137
    HEAP32[3469] = 13868; //@line 6138
    HEAP32[3472] = 13876; //@line 6139
    HEAP32[3471] = 13876; //@line 6140
    HEAP32[3474] = 13884; //@line 6141
    HEAP32[3473] = 13884; //@line 6142
    HEAP32[3476] = 13892; //@line 6143
    HEAP32[3475] = 13892; //@line 6144
    HEAP32[3478] = 13900; //@line 6145
    HEAP32[3477] = 13900; //@line 6146
    HEAP32[3480] = 13908; //@line 6147
    HEAP32[3479] = 13908; //@line 6148
    HEAP32[3482] = 13916; //@line 6149
    HEAP32[3481] = 13916; //@line 6150
    HEAP32[3484] = 13924; //@line 6151
    HEAP32[3483] = 13924; //@line 6152
    HEAP32[3486] = 13932; //@line 6153
    HEAP32[3485] = 13932; //@line 6154
    HEAP32[3488] = 13940; //@line 6155
    HEAP32[3487] = 13940; //@line 6156
    HEAP32[3490] = 13948; //@line 6157
    HEAP32[3489] = 13948; //@line 6158
    HEAP32[3492] = 13956; //@line 6159
    HEAP32[3491] = 13956; //@line 6160
    HEAP32[3494] = 13964; //@line 6161
    HEAP32[3493] = 13964; //@line 6162
    HEAP32[3496] = 13972; //@line 6163
    HEAP32[3495] = 13972; //@line 6164
    HEAP32[3498] = 13980; //@line 6165
    HEAP32[3497] = 13980; //@line 6166
    HEAP32[3500] = 13988; //@line 6167
    HEAP32[3499] = 13988; //@line 6168
    HEAP32[3502] = 13996; //@line 6169
    HEAP32[3501] = 13996; //@line 6170
    HEAP32[3504] = 14004; //@line 6171
    HEAP32[3503] = 14004; //@line 6172
    HEAP32[3506] = 14012; //@line 6173
    HEAP32[3505] = 14012; //@line 6174
    HEAP32[3508] = 14020; //@line 6175
    HEAP32[3507] = 14020; //@line 6176
    HEAP32[3510] = 14028; //@line 6177
    HEAP32[3509] = 14028; //@line 6178
    HEAP32[3512] = 14036; //@line 6179
    HEAP32[3511] = 14036; //@line 6180
    HEAP32[3514] = 14044; //@line 6181
    HEAP32[3513] = 14044; //@line 6182
    HEAP32[3516] = 14052; //@line 6183
    HEAP32[3515] = 14052; //@line 6184
    $642 = $$723947$i + -40 | 0; //@line 6185
    $644 = $$748$i + 8 | 0; //@line 6187
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 6192
    $650 = $$748$i + $649 | 0; //@line 6193
    $651 = $642 - $649 | 0; //@line 6194
    HEAP32[3447] = $650; //@line 6195
    HEAP32[3444] = $651; //@line 6196
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 6199
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 6202
    HEAP32[3448] = HEAP32[3563]; //@line 6204
   } else {
    $$024367$i = 14212; //@line 6206
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 6208
     $658 = $$024367$i + 4 | 0; //@line 6209
     $659 = HEAP32[$658 >> 2] | 0; //@line 6210
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 6214
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 6218
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 6223
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 6237
       $673 = (HEAP32[3444] | 0) + $$723947$i | 0; //@line 6239
       $675 = $636 + 8 | 0; //@line 6241
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 6246
       $681 = $636 + $680 | 0; //@line 6247
       $682 = $673 - $680 | 0; //@line 6248
       HEAP32[3447] = $681; //@line 6249
       HEAP32[3444] = $682; //@line 6250
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 6253
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 6256
       HEAP32[3448] = HEAP32[3563]; //@line 6258
       break;
      }
     }
    }
    $688 = HEAP32[3445] | 0; //@line 6263
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3445] = $$748$i; //@line 6266
     $753 = $$748$i; //@line 6267
    } else {
     $753 = $688; //@line 6269
    }
    $690 = $$748$i + $$723947$i | 0; //@line 6271
    $$124466$i = 14212; //@line 6272
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 6277
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 6281
     if (!$694) {
      $$0$i$i$i = 14212; //@line 6284
      break;
     } else {
      $$124466$i = $694; //@line 6287
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 6296
      $700 = $$124466$i + 4 | 0; //@line 6297
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 6300
      $704 = $$748$i + 8 | 0; //@line 6302
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 6308
      $712 = $690 + 8 | 0; //@line 6310
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 6316
      $722 = $710 + $$0197 | 0; //@line 6320
      $723 = $718 - $710 - $$0197 | 0; //@line 6321
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 6324
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3444] | 0) + $723 | 0; //@line 6329
        HEAP32[3444] = $728; //@line 6330
        HEAP32[3447] = $722; //@line 6331
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 6334
       } else {
        if ((HEAP32[3446] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3443] | 0) + $723 | 0; //@line 6340
         HEAP32[3443] = $734; //@line 6341
         HEAP32[3446] = $722; //@line 6342
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 6345
         HEAP32[$722 + $734 >> 2] = $734; //@line 6347
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 6351
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 6355
         $743 = $739 >>> 3; //@line 6356
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 6361
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 6363
           $750 = 13804 + ($743 << 1 << 2) | 0; //@line 6365
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 6371
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 6380
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3441] = HEAP32[3441] & ~(1 << $743); //@line 6390
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 6397
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 6401
             }
             $764 = $748 + 8 | 0; //@line 6404
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 6408
              break;
             }
             _abort(); //@line 6411
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 6416
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 6417
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 6420
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 6422
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 6426
             $783 = $782 + 4 | 0; //@line 6427
             $784 = HEAP32[$783 >> 2] | 0; //@line 6428
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 6431
              if (!$786) {
               $$3$i$i = 0; //@line 6434
               break;
              } else {
               $$1291$i$i = $786; //@line 6437
               $$1293$i$i = $782; //@line 6437
              }
             } else {
              $$1291$i$i = $784; //@line 6440
              $$1293$i$i = $783; //@line 6440
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 6443
              $789 = HEAP32[$788 >> 2] | 0; //@line 6444
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 6447
               $$1293$i$i = $788; //@line 6447
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 6450
              $792 = HEAP32[$791 >> 2] | 0; //@line 6451
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 6456
               $$1293$i$i = $791; //@line 6456
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 6461
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 6464
              $$3$i$i = $$1291$i$i; //@line 6465
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 6470
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 6473
             }
             $776 = $774 + 12 | 0; //@line 6476
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 6480
             }
             $779 = $771 + 8 | 0; //@line 6483
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 6487
              HEAP32[$779 >> 2] = $774; //@line 6488
              $$3$i$i = $771; //@line 6489
              break;
             } else {
              _abort(); //@line 6492
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 6502
           $798 = 14068 + ($797 << 2) | 0; //@line 6503
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 6508
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3442] = HEAP32[3442] & ~(1 << $797); //@line 6517
             break L311;
            } else {
             if ((HEAP32[3445] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 6523
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 6531
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3445] | 0; //@line 6541
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 6544
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 6548
           $815 = $718 + 16 | 0; //@line 6549
           $816 = HEAP32[$815 >> 2] | 0; //@line 6550
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 6556
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 6560
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 6562
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 6568
           if (!$822) {
            break;
           }
           if ((HEAP32[3445] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 6576
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 6580
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 6582
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 6589
         $$0287$i$i = $742 + $723 | 0; //@line 6589
        } else {
         $$0$i17$i = $718; //@line 6591
         $$0287$i$i = $723; //@line 6591
        }
        $830 = $$0$i17$i + 4 | 0; //@line 6593
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 6596
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 6599
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 6601
        $836 = $$0287$i$i >>> 3; //@line 6602
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 13804 + ($836 << 1 << 2) | 0; //@line 6606
         $840 = HEAP32[3441] | 0; //@line 6607
         $841 = 1 << $836; //@line 6608
         do {
          if (!($840 & $841)) {
           HEAP32[3441] = $840 | $841; //@line 6614
           $$0295$i$i = $839; //@line 6616
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 6616
          } else {
           $845 = $839 + 8 | 0; //@line 6618
           $846 = HEAP32[$845 >> 2] | 0; //@line 6619
           if ((HEAP32[3445] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 6623
            $$pre$phi$i19$iZ2D = $845; //@line 6623
            break;
           }
           _abort(); //@line 6626
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 6630
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 6632
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 6634
         HEAP32[$722 + 12 >> 2] = $839; //@line 6636
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 6639
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 6643
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 6647
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 6652
          $858 = $852 << $857; //@line 6653
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 6656
          $863 = $858 << $861; //@line 6658
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 6661
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 6666
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 6672
         }
        } while (0);
        $877 = 14068 + ($$0296$i$i << 2) | 0; //@line 6675
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 6677
        $879 = $722 + 16 | 0; //@line 6678
        HEAP32[$879 + 4 >> 2] = 0; //@line 6680
        HEAP32[$879 >> 2] = 0; //@line 6681
        $881 = HEAP32[3442] | 0; //@line 6682
        $882 = 1 << $$0296$i$i; //@line 6683
        if (!($881 & $882)) {
         HEAP32[3442] = $881 | $882; //@line 6688
         HEAP32[$877 >> 2] = $722; //@line 6689
         HEAP32[$722 + 24 >> 2] = $877; //@line 6691
         HEAP32[$722 + 12 >> 2] = $722; //@line 6693
         HEAP32[$722 + 8 >> 2] = $722; //@line 6695
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6704
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6704
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6711
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6715
         $902 = HEAP32[$900 >> 2] | 0; //@line 6717
         if (!$902) {
          label = 260; //@line 6720
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6723
          $$0289$i$i = $902; //@line 6723
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3445] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6730
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6733
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6735
          HEAP32[$722 + 12 >> 2] = $722; //@line 6737
          HEAP32[$722 + 8 >> 2] = $722; //@line 6739
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6744
         $910 = HEAP32[$909 >> 2] | 0; //@line 6745
         $911 = HEAP32[3445] | 0; //@line 6746
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6752
          HEAP32[$909 >> 2] = $722; //@line 6753
          HEAP32[$722 + 8 >> 2] = $910; //@line 6755
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6757
          HEAP32[$722 + 24 >> 2] = 0; //@line 6759
          break;
         } else {
          _abort(); //@line 6762
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6769
      STACKTOP = sp; //@line 6770
      return $$0 | 0; //@line 6770
     } else {
      $$0$i$i$i = 14212; //@line 6772
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6776
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6781
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6789
    }
    $927 = $923 + -47 | 0; //@line 6791
    $929 = $927 + 8 | 0; //@line 6793
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6799
    $936 = $636 + 16 | 0; //@line 6800
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6802
    $939 = $938 + 8 | 0; //@line 6803
    $940 = $938 + 24 | 0; //@line 6804
    $941 = $$723947$i + -40 | 0; //@line 6805
    $943 = $$748$i + 8 | 0; //@line 6807
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6812
    $949 = $$748$i + $948 | 0; //@line 6813
    $950 = $941 - $948 | 0; //@line 6814
    HEAP32[3447] = $949; //@line 6815
    HEAP32[3444] = $950; //@line 6816
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6819
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6822
    HEAP32[3448] = HEAP32[3563]; //@line 6824
    $956 = $938 + 4 | 0; //@line 6825
    HEAP32[$956 >> 2] = 27; //@line 6826
    HEAP32[$939 >> 2] = HEAP32[3553]; //@line 6827
    HEAP32[$939 + 4 >> 2] = HEAP32[3554]; //@line 6827
    HEAP32[$939 + 8 >> 2] = HEAP32[3555]; //@line 6827
    HEAP32[$939 + 12 >> 2] = HEAP32[3556]; //@line 6827
    HEAP32[3553] = $$748$i; //@line 6828
    HEAP32[3554] = $$723947$i; //@line 6829
    HEAP32[3556] = 0; //@line 6830
    HEAP32[3555] = $939; //@line 6831
    $958 = $940; //@line 6832
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6834
     HEAP32[$958 >> 2] = 7; //@line 6835
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6848
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6851
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6854
     HEAP32[$938 >> 2] = $964; //@line 6855
     $969 = $964 >>> 3; //@line 6856
     if ($964 >>> 0 < 256) {
      $972 = 13804 + ($969 << 1 << 2) | 0; //@line 6860
      $973 = HEAP32[3441] | 0; //@line 6861
      $974 = 1 << $969; //@line 6862
      if (!($973 & $974)) {
       HEAP32[3441] = $973 | $974; //@line 6867
       $$0211$i$i = $972; //@line 6869
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6869
      } else {
       $978 = $972 + 8 | 0; //@line 6871
       $979 = HEAP32[$978 >> 2] | 0; //@line 6872
       if ((HEAP32[3445] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6876
       } else {
        $$0211$i$i = $979; //@line 6879
        $$pre$phi$i$iZ2D = $978; //@line 6879
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6882
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6884
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6886
      HEAP32[$636 + 12 >> 2] = $972; //@line 6888
      break;
     }
     $985 = $964 >>> 8; //@line 6891
     if (!$985) {
      $$0212$i$i = 0; //@line 6894
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6898
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6902
       $991 = $985 << $990; //@line 6903
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6906
       $996 = $991 << $994; //@line 6908
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6911
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6916
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6922
      }
     }
     $1010 = 14068 + ($$0212$i$i << 2) | 0; //@line 6925
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6927
     HEAP32[$636 + 20 >> 2] = 0; //@line 6929
     HEAP32[$936 >> 2] = 0; //@line 6930
     $1013 = HEAP32[3442] | 0; //@line 6931
     $1014 = 1 << $$0212$i$i; //@line 6932
     if (!($1013 & $1014)) {
      HEAP32[3442] = $1013 | $1014; //@line 6937
      HEAP32[$1010 >> 2] = $636; //@line 6938
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6940
      HEAP32[$636 + 12 >> 2] = $636; //@line 6942
      HEAP32[$636 + 8 >> 2] = $636; //@line 6944
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6953
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6953
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6960
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6964
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6966
      if (!$1034) {
       label = 286; //@line 6969
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6972
       $$0207$i$i = $1034; //@line 6972
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3445] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6979
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6982
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6984
       HEAP32[$636 + 12 >> 2] = $636; //@line 6986
       HEAP32[$636 + 8 >> 2] = $636; //@line 6988
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6993
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6994
      $1043 = HEAP32[3445] | 0; //@line 6995
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 7001
       HEAP32[$1041 >> 2] = $636; //@line 7002
       HEAP32[$636 + 8 >> 2] = $1042; //@line 7004
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 7006
       HEAP32[$636 + 24 >> 2] = 0; //@line 7008
       break;
      } else {
       _abort(); //@line 7011
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3444] | 0; //@line 7018
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 7021
   HEAP32[3444] = $1054; //@line 7022
   $1055 = HEAP32[3447] | 0; //@line 7023
   $1056 = $1055 + $$0197 | 0; //@line 7024
   HEAP32[3447] = $1056; //@line 7025
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 7028
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 7031
   $$0 = $1055 + 8 | 0; //@line 7033
   STACKTOP = sp; //@line 7034
   return $$0 | 0; //@line 7034
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 7038
 $$0 = 0; //@line 7039
 STACKTOP = sp; //@line 7040
 return $$0 | 0; //@line 7040
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11192
 STACKTOP = STACKTOP + 560 | 0; //@line 11193
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 11193
 $6 = sp + 8 | 0; //@line 11194
 $7 = sp; //@line 11195
 $8 = sp + 524 | 0; //@line 11196
 $9 = $8; //@line 11197
 $10 = sp + 512 | 0; //@line 11198
 HEAP32[$7 >> 2] = 0; //@line 11199
 $11 = $10 + 12 | 0; //@line 11200
 ___DOUBLE_BITS_677($1) | 0; //@line 11201
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 11206
  $$0520 = 1; //@line 11206
  $$0521 = 6837; //@line 11206
 } else {
  $$0471 = $1; //@line 11217
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 11217
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 6838 : 6843 : 6840; //@line 11217
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 11219
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 11228
   $31 = $$0520 + 3 | 0; //@line 11233
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 11235
   _out_670($0, $$0521, $$0520); //@line 11236
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 6864 : 6868 : $27 ? 6856 : 6860, 3); //@line 11237
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 11239
   $$sink560 = $31; //@line 11240
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 11243
   $36 = $35 != 0.0; //@line 11244
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 11248
   }
   $39 = $5 | 32; //@line 11250
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 11253
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 11256
    $44 = $$0520 | 2; //@line 11257
    $46 = 12 - $3 | 0; //@line 11259
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 11264
     } else {
      $$0509585 = 8.0; //@line 11266
      $$1508586 = $46; //@line 11266
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 11268
       $$0509585 = $$0509585 * 16.0; //@line 11269
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 11284
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 11289
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 11294
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 11297
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11300
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 11303
     HEAP8[$68 >> 0] = 48; //@line 11304
     $$0511 = $68; //@line 11305
    } else {
     $$0511 = $66; //@line 11307
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 11314
    $76 = $$0511 + -2 | 0; //@line 11317
    HEAP8[$76 >> 0] = $5 + 15; //@line 11318
    $77 = ($3 | 0) < 1; //@line 11319
    $79 = ($4 & 8 | 0) == 0; //@line 11321
    $$0523 = $8; //@line 11322
    $$2473 = $$1472; //@line 11322
    while (1) {
     $80 = ~~$$2473; //@line 11324
     $86 = $$0523 + 1 | 0; //@line 11330
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[6872 + $80 >> 0]; //@line 11331
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 11334
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 11343
      } else {
       HEAP8[$86 >> 0] = 46; //@line 11346
       $$1524 = $$0523 + 2 | 0; //@line 11347
      }
     } else {
      $$1524 = $86; //@line 11350
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 11354
     }
    }
    $$pre693 = $$1524; //@line 11360
    if (!$3) {
     label = 24; //@line 11362
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 11370
      $$sink = $3 + 2 | 0; //@line 11370
     } else {
      label = 24; //@line 11372
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 11376
     $$pre$phi691Z2D = $101; //@line 11377
     $$sink = $101; //@line 11377
    }
    $104 = $11 - $76 | 0; //@line 11381
    $106 = $104 + $44 + $$sink | 0; //@line 11383
    _pad_676($0, 32, $2, $106, $4); //@line 11384
    _out_670($0, $$0521$, $44); //@line 11385
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 11387
    _out_670($0, $8, $$pre$phi691Z2D); //@line 11388
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 11390
    _out_670($0, $76, $104); //@line 11391
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 11393
    $$sink560 = $106; //@line 11394
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 11398
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 11402
    HEAP32[$7 >> 2] = $113; //@line 11403
    $$3 = $35 * 268435456.0; //@line 11404
    $$pr = $113; //@line 11404
   } else {
    $$3 = $35; //@line 11407
    $$pr = HEAP32[$7 >> 2] | 0; //@line 11407
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 11411
   $$0498 = $$561; //@line 11412
   $$4 = $$3; //@line 11412
   do {
    $116 = ~~$$4 >>> 0; //@line 11414
    HEAP32[$$0498 >> 2] = $116; //@line 11415
    $$0498 = $$0498 + 4 | 0; //@line 11416
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 11419
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 11429
    $$1499662 = $$0498; //@line 11429
    $124 = $$pr; //@line 11429
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 11432
     $$0488655 = $$1499662 + -4 | 0; //@line 11433
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 11436
     } else {
      $$0488657 = $$0488655; //@line 11438
      $$0497656 = 0; //@line 11438
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 11441
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 11443
       $131 = tempRet0; //@line 11444
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 11445
       HEAP32[$$0488657 >> 2] = $132; //@line 11447
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 11448
       $$0488657 = $$0488657 + -4 | 0; //@line 11450
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 11460
      } else {
       $138 = $$1482663 + -4 | 0; //@line 11462
       HEAP32[$138 >> 2] = $$0497656; //@line 11463
       $$2483$ph = $138; //@line 11464
      }
     }
     $$2500 = $$1499662; //@line 11467
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 11473
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 11477
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 11483
     HEAP32[$7 >> 2] = $144; //@line 11484
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 11487
      $$1499662 = $$2500; //@line 11487
      $124 = $144; //@line 11487
     } else {
      $$1482$lcssa = $$2483$ph; //@line 11489
      $$1499$lcssa = $$2500; //@line 11489
      $$pr566 = $144; //@line 11489
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 11494
    $$1499$lcssa = $$0498; //@line 11494
    $$pr566 = $$pr; //@line 11494
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 11500
    $150 = ($39 | 0) == 102; //@line 11501
    $$3484650 = $$1482$lcssa; //@line 11502
    $$3501649 = $$1499$lcssa; //@line 11502
    $152 = $$pr566; //@line 11502
    while (1) {
     $151 = 0 - $152 | 0; //@line 11504
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 11506
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 11510
      $161 = 1e9 >>> $154; //@line 11511
      $$0487644 = 0; //@line 11512
      $$1489643 = $$3484650; //@line 11512
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 11514
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 11518
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 11519
       $$1489643 = $$1489643 + 4 | 0; //@line 11520
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 11531
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 11534
       $$4502 = $$3501649; //@line 11534
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 11537
       $$$3484700 = $$$3484; //@line 11538
       $$4502 = $$3501649 + 4 | 0; //@line 11538
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 11545
      $$4502 = $$3501649; //@line 11545
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 11547
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 11554
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 11556
     HEAP32[$7 >> 2] = $152; //@line 11557
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 11562
      $$3501$lcssa = $$$4502; //@line 11562
      break;
     } else {
      $$3484650 = $$$3484700; //@line 11560
      $$3501649 = $$$4502; //@line 11560
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 11567
    $$3501$lcssa = $$1499$lcssa; //@line 11567
   }
   $185 = $$561; //@line 11570
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 11575
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 11576
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 11579
    } else {
     $$0514639 = $189; //@line 11581
     $$0530638 = 10; //@line 11581
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 11583
      $193 = $$0514639 + 1 | 0; //@line 11584
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 11587
       break;
      } else {
       $$0514639 = $193; //@line 11590
      }
     }
    }
   } else {
    $$1515 = 0; //@line 11595
   }
   $198 = ($39 | 0) == 103; //@line 11600
   $199 = ($$540 | 0) != 0; //@line 11601
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 11604
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 11613
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 11616
    $213 = ($209 | 0) % 9 | 0; //@line 11617
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 11620
     $$1531632 = 10; //@line 11620
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 11623
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 11626
       $$1531632 = $215; //@line 11626
      } else {
       $$1531$lcssa = $215; //@line 11628
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 11633
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 11635
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 11636
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 11639
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 11642
     $$4518 = $$1515; //@line 11642
     $$8 = $$3484$lcssa; //@line 11642
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 11647
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 11648
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 11653
     if (!$$0520) {
      $$1467 = $$$564; //@line 11656
      $$1469 = $$543; //@line 11656
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 11659
      $$1467 = $230 ? -$$$564 : $$$564; //@line 11664
      $$1469 = $230 ? -$$543 : $$543; //@line 11664
     }
     $233 = $217 - $218 | 0; //@line 11666
     HEAP32[$212 >> 2] = $233; //@line 11667
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 11671
      HEAP32[$212 >> 2] = $236; //@line 11672
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 11675
       $$sink547625 = $212; //@line 11675
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 11677
        HEAP32[$$sink547625 >> 2] = 0; //@line 11678
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 11681
         HEAP32[$240 >> 2] = 0; //@line 11682
         $$6 = $240; //@line 11683
        } else {
         $$6 = $$5486626; //@line 11685
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 11688
        HEAP32[$238 >> 2] = $242; //@line 11689
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 11692
         $$sink547625 = $238; //@line 11692
        } else {
         $$5486$lcssa = $$6; //@line 11694
         $$sink547$lcssa = $238; //@line 11694
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 11699
       $$sink547$lcssa = $212; //@line 11699
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 11704
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 11705
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 11708
       $$4518 = $247; //@line 11708
       $$8 = $$5486$lcssa; //@line 11708
      } else {
       $$2516621 = $247; //@line 11710
       $$2532620 = 10; //@line 11710
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 11712
        $251 = $$2516621 + 1 | 0; //@line 11713
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 11716
         $$4518 = $251; //@line 11716
         $$8 = $$5486$lcssa; //@line 11716
         break;
        } else {
         $$2516621 = $251; //@line 11719
        }
       }
      }
     } else {
      $$4492 = $212; //@line 11724
      $$4518 = $$1515; //@line 11724
      $$8 = $$3484$lcssa; //@line 11724
     }
    }
    $253 = $$4492 + 4 | 0; //@line 11727
    $$5519$ph = $$4518; //@line 11730
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 11730
    $$9$ph = $$8; //@line 11730
   } else {
    $$5519$ph = $$1515; //@line 11732
    $$7505$ph = $$3501$lcssa; //@line 11732
    $$9$ph = $$3484$lcssa; //@line 11732
   }
   $$7505 = $$7505$ph; //@line 11734
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 11738
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 11741
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 11745
    } else {
     $$lcssa675 = 1; //@line 11747
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 11751
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 11756
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 11764
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 11764
     } else {
      $$0479 = $5 + -2 | 0; //@line 11768
      $$2476 = $$540$ + -1 | 0; //@line 11768
     }
     $267 = $4 & 8; //@line 11770
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 11775
       if (!$270) {
        $$2529 = 9; //@line 11778
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 11783
         $$3533616 = 10; //@line 11783
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 11785
          $275 = $$1528617 + 1 | 0; //@line 11786
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 11792
           break;
          } else {
           $$1528617 = $275; //@line 11790
          }
         }
        } else {
         $$2529 = 0; //@line 11797
        }
       }
      } else {
       $$2529 = 9; //@line 11801
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 11809
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 11811
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 11813
       $$1480 = $$0479; //@line 11816
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 11816
       $$pre$phi698Z2D = 0; //@line 11816
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 11820
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 11822
       $$1480 = $$0479; //@line 11825
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 11825
       $$pre$phi698Z2D = 0; //@line 11825
       break;
      }
     } else {
      $$1480 = $$0479; //@line 11829
      $$3477 = $$2476; //@line 11829
      $$pre$phi698Z2D = $267; //@line 11829
     }
    } else {
     $$1480 = $5; //@line 11833
     $$3477 = $$540; //@line 11833
     $$pre$phi698Z2D = $4 & 8; //@line 11833
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 11836
   $294 = ($292 | 0) != 0 & 1; //@line 11838
   $296 = ($$1480 | 32 | 0) == 102; //@line 11840
   if ($296) {
    $$2513 = 0; //@line 11844
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 11844
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 11847
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11850
    $304 = $11; //@line 11851
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 11856
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 11858
      HEAP8[$308 >> 0] = 48; //@line 11859
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 11864
      } else {
       $$1512$lcssa = $308; //@line 11866
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 11871
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 11878
    $318 = $$1512$lcssa + -2 | 0; //@line 11880
    HEAP8[$318 >> 0] = $$1480; //@line 11881
    $$2513 = $318; //@line 11884
    $$pn = $304 - $318 | 0; //@line 11884
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 11889
   _pad_676($0, 32, $2, $323, $4); //@line 11890
   _out_670($0, $$0521, $$0520); //@line 11891
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 11893
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 11896
    $326 = $8 + 9 | 0; //@line 11897
    $327 = $326; //@line 11898
    $328 = $8 + 8 | 0; //@line 11899
    $$5493600 = $$0496$$9; //@line 11900
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 11903
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 11908
       $$1465 = $328; //@line 11909
      } else {
       $$1465 = $330; //@line 11911
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 11918
       $$0464597 = $330; //@line 11919
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 11921
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 11924
        } else {
         $$1465 = $335; //@line 11926
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 11931
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 11936
     $$5493600 = $$5493600 + 4 | 0; //@line 11937
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 6888, 1); //@line 11947
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 11953
     $$6494592 = $$5493600; //@line 11953
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 11956
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 11961
       $$0463587 = $347; //@line 11962
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 11964
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 11967
        } else {
         $$0463$lcssa = $351; //@line 11969
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 11974
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 11978
      $$6494592 = $$6494592 + 4 | 0; //@line 11979
      $356 = $$4478593 + -9 | 0; //@line 11980
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 11987
       break;
      } else {
       $$4478593 = $356; //@line 11985
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 11992
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 11995
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 11998
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 12001
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 12002
     $365 = $363; //@line 12003
     $366 = 0 - $9 | 0; //@line 12004
     $367 = $8 + 8 | 0; //@line 12005
     $$5605 = $$3477; //@line 12006
     $$7495604 = $$9$ph; //@line 12006
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 12009
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 12012
       $$0 = $367; //@line 12013
      } else {
       $$0 = $369; //@line 12015
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 12020
        _out_670($0, $$0, 1); //@line 12021
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 12025
         break;
        }
        _out_670($0, 6888, 1); //@line 12028
        $$2 = $375; //@line 12029
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 12033
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 12038
        $$1601 = $$0; //@line 12039
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 12041
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 12044
         } else {
          $$2 = $373; //@line 12046
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 12053
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 12056
      $381 = $$5605 - $378 | 0; //@line 12057
      $$7495604 = $$7495604 + 4 | 0; //@line 12058
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 12065
       break;
      } else {
       $$5605 = $381; //@line 12063
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 12070
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 12073
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 12077
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 12080
   $$sink560 = $323; //@line 12081
  }
 } while (0);
 STACKTOP = sp; //@line 12086
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 12086
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 9764
 STACKTOP = STACKTOP + 64 | 0; //@line 9765
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9765
 $5 = sp + 16 | 0; //@line 9766
 $6 = sp; //@line 9767
 $7 = sp + 24 | 0; //@line 9768
 $8 = sp + 8 | 0; //@line 9769
 $9 = sp + 20 | 0; //@line 9770
 HEAP32[$5 >> 2] = $1; //@line 9771
 $10 = ($0 | 0) != 0; //@line 9772
 $11 = $7 + 40 | 0; //@line 9773
 $12 = $11; //@line 9774
 $13 = $7 + 39 | 0; //@line 9775
 $14 = $8 + 4 | 0; //@line 9776
 $$0243 = 0; //@line 9777
 $$0247 = 0; //@line 9777
 $$0269 = 0; //@line 9777
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9786
     $$1248 = -1; //@line 9787
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 9791
     break;
    }
   } else {
    $$1248 = $$0247; //@line 9795
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 9798
  $21 = HEAP8[$20 >> 0] | 0; //@line 9799
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 9802
   break;
  } else {
   $23 = $21; //@line 9805
   $25 = $20; //@line 9805
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 9810
     $27 = $25; //@line 9810
     label = 9; //@line 9811
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 9816
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 9823
   HEAP32[$5 >> 2] = $24; //@line 9824
   $23 = HEAP8[$24 >> 0] | 0; //@line 9826
   $25 = $24; //@line 9826
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 9831
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 9836
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 9839
     $27 = $27 + 2 | 0; //@line 9840
     HEAP32[$5 >> 2] = $27; //@line 9841
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 9848
      break;
     } else {
      $$0249303 = $30; //@line 9845
      label = 9; //@line 9846
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 9856
  if ($10) {
   _out_670($0, $20, $36); //@line 9858
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 9862
   $$0247 = $$1248; //@line 9862
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 9870
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 9871
  if ($43) {
   $$0253 = -1; //@line 9873
   $$1270 = $$0269; //@line 9873
   $$sink = 1; //@line 9873
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 9883
    $$1270 = 1; //@line 9883
    $$sink = 3; //@line 9883
   } else {
    $$0253 = -1; //@line 9885
    $$1270 = $$0269; //@line 9885
    $$sink = 1; //@line 9885
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 9888
  HEAP32[$5 >> 2] = $51; //@line 9889
  $52 = HEAP8[$51 >> 0] | 0; //@line 9890
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 9892
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 9899
   $$lcssa291 = $52; //@line 9899
   $$lcssa292 = $51; //@line 9899
  } else {
   $$0262309 = 0; //@line 9901
   $60 = $52; //@line 9901
   $65 = $51; //@line 9901
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 9906
    $64 = $65 + 1 | 0; //@line 9907
    HEAP32[$5 >> 2] = $64; //@line 9908
    $66 = HEAP8[$64 >> 0] | 0; //@line 9909
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 9911
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 9918
     $$lcssa291 = $66; //@line 9918
     $$lcssa292 = $64; //@line 9918
     break;
    } else {
     $$0262309 = $63; //@line 9921
     $60 = $66; //@line 9921
     $65 = $64; //@line 9921
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 9933
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 9935
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 9940
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9945
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9957
     $$2271 = 1; //@line 9957
     $storemerge274 = $79 + 3 | 0; //@line 9957
    } else {
     label = 23; //@line 9959
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 9963
    if ($$1270 | 0) {
     $$0 = -1; //@line 9966
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9981
     $106 = HEAP32[$105 >> 2] | 0; //@line 9982
     HEAP32[$2 >> 2] = $105 + 4; //@line 9984
     $363 = $106; //@line 9985
    } else {
     $363 = 0; //@line 9987
    }
    $$0259 = $363; //@line 9991
    $$2271 = 0; //@line 9991
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 9991
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 9993
   $109 = ($$0259 | 0) < 0; //@line 9994
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 9999
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 9999
   $$3272 = $$2271; //@line 9999
   $115 = $storemerge274; //@line 9999
  } else {
   $112 = _getint_671($5) | 0; //@line 10001
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 10004
    break;
   }
   $$1260 = $112; //@line 10008
   $$1263 = $$0262$lcssa; //@line 10008
   $$3272 = $$1270; //@line 10008
   $115 = HEAP32[$5 >> 2] | 0; //@line 10008
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 10019
     $156 = _getint_671($5) | 0; //@line 10020
     $$0254 = $156; //@line 10022
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 10022
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 10031
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 10036
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 10041
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 10048
      $144 = $125 + 4 | 0; //@line 10052
      HEAP32[$5 >> 2] = $144; //@line 10053
      $$0254 = $140; //@line 10054
      $$pre345 = $144; //@line 10054
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 10060
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10075
     $152 = HEAP32[$151 >> 2] | 0; //@line 10076
     HEAP32[$2 >> 2] = $151 + 4; //@line 10078
     $364 = $152; //@line 10079
    } else {
     $364 = 0; //@line 10081
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 10084
    HEAP32[$5 >> 2] = $154; //@line 10085
    $$0254 = $364; //@line 10086
    $$pre345 = $154; //@line 10086
   } else {
    $$0254 = -1; //@line 10088
    $$pre345 = $115; //@line 10088
   }
  } while (0);
  $$0252 = 0; //@line 10091
  $158 = $$pre345; //@line 10091
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 10098
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 10101
   HEAP32[$5 >> 2] = $158; //@line 10102
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (6356 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 10107
   $168 = $167 & 255; //@line 10108
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 10112
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 10119
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 10123
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 10127
     break L1;
    } else {
     label = 50; //@line 10130
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 10135
     $176 = $3 + ($$0253 << 3) | 0; //@line 10137
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 10142
     $182 = $6; //@line 10143
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 10145
     HEAP32[$182 + 4 >> 2] = $181; //@line 10148
     label = 50; //@line 10149
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 10153
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 10156
    $187 = HEAP32[$5 >> 2] | 0; //@line 10158
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 10162
   if ($10) {
    $187 = $158; //@line 10164
   } else {
    $$0243 = 0; //@line 10166
    $$0247 = $$1248; //@line 10166
    $$0269 = $$3272; //@line 10166
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 10172
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 10178
  $196 = $$1263 & -65537; //@line 10181
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 10182
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10190
       $$0243 = 0; //@line 10191
       $$0247 = $$1248; //@line 10191
       $$0269 = $$3272; //@line 10191
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10197
       $$0243 = 0; //@line 10198
       $$0247 = $$1248; //@line 10198
       $$0269 = $$3272; //@line 10198
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 10206
       HEAP32[$208 >> 2] = $$1248; //@line 10208
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 10211
       $$0243 = 0; //@line 10212
       $$0247 = $$1248; //@line 10212
       $$0269 = $$3272; //@line 10212
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 10219
       $$0243 = 0; //@line 10220
       $$0247 = $$1248; //@line 10220
       $$0269 = $$3272; //@line 10220
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 10227
       $$0243 = 0; //@line 10228
       $$0247 = $$1248; //@line 10228
       $$0269 = $$3272; //@line 10228
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10234
       $$0243 = 0; //@line 10235
       $$0247 = $$1248; //@line 10235
       $$0269 = $$3272; //@line 10235
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 10243
       HEAP32[$220 >> 2] = $$1248; //@line 10245
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 10248
       $$0243 = 0; //@line 10249
       $$0247 = $$1248; //@line 10249
       $$0269 = $$3272; //@line 10249
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 10254
       $$0247 = $$1248; //@line 10254
       $$0269 = $$3272; //@line 10254
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 10264
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 10264
     $$3265 = $$1263$ | 8; //@line 10264
     label = 62; //@line 10265
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 10269
     $$1255 = $$0254; //@line 10269
     $$3265 = $$1263$; //@line 10269
     label = 62; //@line 10270
     break;
    }
   case 111:
    {
     $242 = $6; //@line 10274
     $244 = HEAP32[$242 >> 2] | 0; //@line 10276
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 10279
     $248 = _fmt_o($244, $247, $11) | 0; //@line 10280
     $252 = $12 - $248 | 0; //@line 10284
     $$0228 = $248; //@line 10289
     $$1233 = 0; //@line 10289
     $$1238 = 6820; //@line 10289
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 10289
     $$4266 = $$1263$; //@line 10289
     $281 = $244; //@line 10289
     $283 = $247; //@line 10289
     label = 68; //@line 10290
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 10294
     $258 = HEAP32[$256 >> 2] | 0; //@line 10296
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 10299
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 10302
      $264 = tempRet0; //@line 10303
      $265 = $6; //@line 10304
      HEAP32[$265 >> 2] = $263; //@line 10306
      HEAP32[$265 + 4 >> 2] = $264; //@line 10309
      $$0232 = 1; //@line 10310
      $$0237 = 6820; //@line 10310
      $275 = $263; //@line 10310
      $276 = $264; //@line 10310
      label = 67; //@line 10311
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 10323
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 6820 : 6822 : 6821; //@line 10323
      $275 = $258; //@line 10323
      $276 = $261; //@line 10323
      label = 67; //@line 10324
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 10330
     $$0232 = 0; //@line 10336
     $$0237 = 6820; //@line 10336
     $275 = HEAP32[$197 >> 2] | 0; //@line 10336
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 10336
     label = 67; //@line 10337
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 10348
     $$2 = $13; //@line 10349
     $$2234 = 0; //@line 10349
     $$2239 = 6820; //@line 10349
     $$2251 = $11; //@line 10349
     $$5 = 1; //@line 10349
     $$6268 = $196; //@line 10349
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 10356
     label = 72; //@line 10357
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 10361
     $$1 = $302 | 0 ? $302 : 6830; //@line 10364
     label = 72; //@line 10365
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 10375
     HEAP32[$14 >> 2] = 0; //@line 10376
     HEAP32[$6 >> 2] = $8; //@line 10377
     $$4258354 = -1; //@line 10378
     $365 = $8; //@line 10378
     label = 76; //@line 10379
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 10383
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 10386
      $$0240$lcssa356 = 0; //@line 10387
      label = 85; //@line 10388
     } else {
      $$4258354 = $$0254; //@line 10390
      $365 = $$pre348; //@line 10390
      label = 76; //@line 10391
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 10398
     $$0247 = $$1248; //@line 10398
     $$0269 = $$3272; //@line 10398
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 10403
     $$2234 = 0; //@line 10403
     $$2239 = 6820; //@line 10403
     $$2251 = $11; //@line 10403
     $$5 = $$0254; //@line 10403
     $$6268 = $$1263$; //@line 10403
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 10409
    $227 = $6; //@line 10410
    $229 = HEAP32[$227 >> 2] | 0; //@line 10412
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 10415
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 10417
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 10423
    $$0228 = $234; //@line 10428
    $$1233 = $or$cond278 ? 0 : 2; //@line 10428
    $$1238 = $or$cond278 ? 6820 : 6820 + ($$1236 >> 4) | 0; //@line 10428
    $$2256 = $$1255; //@line 10428
    $$4266 = $$3265; //@line 10428
    $281 = $229; //@line 10428
    $283 = $232; //@line 10428
    label = 68; //@line 10429
   } else if ((label | 0) == 67) {
    label = 0; //@line 10432
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 10434
    $$1233 = $$0232; //@line 10434
    $$1238 = $$0237; //@line 10434
    $$2256 = $$0254; //@line 10434
    $$4266 = $$1263$; //@line 10434
    $281 = $275; //@line 10434
    $283 = $276; //@line 10434
    label = 68; //@line 10435
   } else if ((label | 0) == 72) {
    label = 0; //@line 10438
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 10439
    $306 = ($305 | 0) == 0; //@line 10440
    $$2 = $$1; //@line 10447
    $$2234 = 0; //@line 10447
    $$2239 = 6820; //@line 10447
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 10447
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 10447
    $$6268 = $196; //@line 10447
   } else if ((label | 0) == 76) {
    label = 0; //@line 10450
    $$0229316 = $365; //@line 10451
    $$0240315 = 0; //@line 10451
    $$1244314 = 0; //@line 10451
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 10453
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 10456
      $$2245 = $$1244314; //@line 10456
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 10459
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 10465
      $$2245 = $320; //@line 10465
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 10469
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 10472
      $$0240315 = $325; //@line 10472
      $$1244314 = $320; //@line 10472
     } else {
      $$0240$lcssa = $325; //@line 10474
      $$2245 = $320; //@line 10474
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 10480
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 10483
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 10486
     label = 85; //@line 10487
    } else {
     $$1230327 = $365; //@line 10489
     $$1241326 = 0; //@line 10489
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 10491
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10494
       label = 85; //@line 10495
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 10498
      $$1241326 = $331 + $$1241326 | 0; //@line 10499
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10502
       label = 85; //@line 10503
       break L97;
      }
      _out_670($0, $9, $331); //@line 10507
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10512
       label = 85; //@line 10513
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 10510
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 10521
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 10527
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 10529
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 10534
   $$2 = $or$cond ? $$0228 : $11; //@line 10539
   $$2234 = $$1233; //@line 10539
   $$2239 = $$1238; //@line 10539
   $$2251 = $11; //@line 10539
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 10539
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 10539
  } else if ((label | 0) == 85) {
   label = 0; //@line 10542
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 10544
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 10547
   $$0247 = $$1248; //@line 10547
   $$0269 = $$3272; //@line 10547
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 10552
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 10554
  $345 = $$$5 + $$2234 | 0; //@line 10555
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 10557
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 10558
  _out_670($0, $$2239, $$2234); //@line 10559
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 10561
  _pad_676($0, 48, $$$5, $343, 0); //@line 10562
  _out_670($0, $$2, $343); //@line 10563
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 10565
  $$0243 = $$2261; //@line 10566
  $$0247 = $$1248; //@line 10566
  $$0269 = $$3272; //@line 10566
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 10574
    } else {
     $$2242302 = 1; //@line 10576
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 10579
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 10582
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 10586
      $356 = $$2242302 + 1 | 0; //@line 10587
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 10590
      } else {
       $$2242$lcssa = $356; //@line 10592
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 10598
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 10604
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 10610
       } else {
        $$0 = 1; //@line 10612
        break;
       }
      }
     } else {
      $$0 = 1; //@line 10617
     }
    }
   } else {
    $$0 = $$1248; //@line 10621
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10625
 return $$0 | 0; //@line 10625
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
    HEAP8[$AsyncCtx + 4 >> 0] = $0; //@line 314
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 316
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 318
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer20; //@line 320
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer20; //@line 322
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer3; //@line 324
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer3; //@line 326
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer18; //@line 328
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer18; //@line 330
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 332
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer15; //@line 334
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer15; //@line 336
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer23; //@line 338
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer23; //@line 340
    HEAP32[$AsyncCtx + 60 >> 2] = $4; //@line 342
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer12; //@line 344
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer12; //@line 346
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer9; //@line 348
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer9; //@line 350
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer6; //@line 352
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer6; //@line 354
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer; //@line 356
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer; //@line 358
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer1; //@line 360
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer1; //@line 362
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
      FUNCTION_TABLE_vi[$72 & 255](2125); //@line 491
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
        $76 = _snprintf($66, $65, 2127, $vararg_buffer) | 0; //@line 511
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
          $$sink = 2145; //@line 529
          label = 35; //@line 530
          break;
         }
        case 1:
         {
          $$sink = 2151; //@line 534
          label = 35; //@line 535
          break;
         }
        case 3:
         {
          $$sink = 2139; //@line 539
          label = 35; //@line 540
          break;
         }
        case 7:
         {
          $$sink = 2133; //@line 544
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
         $$1152 = _snprintf($$0142, $$0144, 2157, $vararg_buffer1) | 0; //@line 556
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
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 592
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 594
           HEAP32[$AsyncCtx60 + 12 >> 2] = $2; //@line 596
           HEAP32[$AsyncCtx60 + 16 >> 2] = $3; //@line 598
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer3; //@line 600
           HEAP32[$AsyncCtx60 + 24 >> 2] = $$1143; //@line 602
           HEAP32[$AsyncCtx60 + 28 >> 2] = $$1145; //@line 604
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer3; //@line 606
           HEAP32[$AsyncCtx60 + 36 >> 2] = $4; //@line 608
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer18; //@line 610
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer18; //@line 612
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer15; //@line 614
           HEAP32[$AsyncCtx60 + 52 >> 2] = $1; //@line 616
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer15; //@line 618
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer23; //@line 620
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer23; //@line 622
           HEAP8[$AsyncCtx60 + 68 >> 0] = $$1$off0 & 1; //@line 625
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer12; //@line 627
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer12; //@line 629
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer9; //@line 631
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer9; //@line 633
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer6; //@line 635
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer6; //@line 637
           HEAP32[$AsyncCtx60 + 96 >> 2] = $55; //@line 639
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 641
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
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer20; //@line 657
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer20; //@line 659
           HEAP32[$AsyncCtx38 + 12 >> 2] = $2; //@line 661
           HEAP32[$AsyncCtx38 + 16 >> 2] = $3; //@line 663
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer3; //@line 665
           HEAP32[$AsyncCtx38 + 24 >> 2] = $$1143; //@line 667
           HEAP32[$AsyncCtx38 + 28 >> 2] = $$1145; //@line 669
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer3; //@line 671
           HEAP32[$AsyncCtx38 + 36 >> 2] = $4; //@line 673
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer18; //@line 675
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer18; //@line 677
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer15; //@line 679
           HEAP32[$AsyncCtx38 + 52 >> 2] = $1; //@line 681
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer15; //@line 683
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer23; //@line 685
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer23; //@line 687
           HEAP8[$AsyncCtx38 + 68 >> 0] = $$1$off0 & 1; //@line 690
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer12; //@line 692
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer12; //@line 694
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer9; //@line 696
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer9; //@line 698
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer6; //@line 700
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer6; //@line 702
           HEAP32[$AsyncCtx38 + 96 >> 2] = $55; //@line 704
           sp = STACKTOP; //@line 705
           STACKTOP = sp; //@line 706
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 708
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 709
           $151 = _snprintf($$1143, $$1145, 2157, $vararg_buffer3) | 0; //@line 710
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
          $$5156 = _snprintf($$3169, $$3147168, 2160, $vararg_buffer6) | 0; //@line 746
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 750
          $$5156 = _snprintf($$3169, $$3147168, 2175, $vararg_buffer9) | 0; //@line 752
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 756
          $$5156 = _snprintf($$3169, $$3147168, 2190, $vararg_buffer12) | 0; //@line 758
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 762
          $$5156 = _snprintf($$3169, $$3147168, 2205, $vararg_buffer15) | 0; //@line 764
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 2220, $vararg_buffer18) | 0; //@line 769
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
          HEAP32[$AsyncCtx56 + 12 >> 2] = $169; //@line 790
          HEAP32[$AsyncCtx56 + 16 >> 2] = $168; //@line 792
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 794
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer23; //@line 796
          HEAP8[$AsyncCtx56 + 28 >> 0] = $$1$off0 & 1; //@line 799
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
             $194 = _snprintf($181, $182, 2157, $vararg_buffer20) | 0; //@line 841
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
           _snprintf($$6, $$6150, 2235, $vararg_buffer23) | 0; //@line 864
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
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $48 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4430
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 4432
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4434
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4436
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4438
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4440
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4442
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4444
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4446
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4448
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4450
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4452
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4454
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4456
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 4458
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 4460
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 4462
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 4464
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 4466
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 4468
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 4470
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 4472
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 4474
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 4478
 HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 4483
 $53 = HEAP32[84] | 0; //@line 4484
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 4488
   do {
    if ($2 << 24 >> 24 > -1 & ($20 | 0) != 0) {
     $57 = HEAP32[81] | 0; //@line 4494
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $20) | 0) {
       $$0$i = 1; //@line 4501
       break;
      }
     }
     $62 = HEAP32[82] | 0; //@line 4505
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 4509
     } else {
      if (!(_strstr($62, $20) | 0)) {
       $$0$i = 1; //@line 4514
      } else {
       label = 9; //@line 4516
      }
     }
    } else {
     label = 9; //@line 4520
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 4524
   }
   if (!((HEAP32[91] | 0) != 0 & ((($20 | 0) == 0 | (($4 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 4536
    break;
   }
   $73 = HEAPU8[320] | 0; //@line 4540
   $74 = $2 & 255; //@line 4541
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 4546
    $$lobit = $78 >>> 6; //@line 4547
    $79 = $$lobit & 255; //@line 4548
    $83 = ($73 & 32 | 0) == 0; //@line 4552
    $84 = HEAP32[85] | 0; //@line 4553
    $85 = HEAP32[84] | 0; //@line 4554
    $86 = $2 << 24 >> 24 == 1; //@line 4555
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 4558
     _vsnprintf($85, $84, $4, $6) | 0; //@line 4559
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 39; //@line 4562
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 4563
      $$expand_i1_val = $86 & 1; //@line 4564
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 4565
      sp = STACKTOP; //@line 4566
      return;
     }
     ___async_unwind = 0; //@line 4569
     HEAP32[$ReallocAsyncCtx12 >> 2] = 39; //@line 4570
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 4571
     $$expand_i1_val = $86 & 1; //@line 4572
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 4573
     sp = STACKTOP; //@line 4574
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 4580
     $$1143 = $85; //@line 4580
     $$1145 = $84; //@line 4580
     $$3154 = 0; //@line 4580
     label = 28; //@line 4581
    } else {
     if ($83) {
      $$0142 = $85; //@line 4584
      $$0144 = $84; //@line 4584
     } else {
      $89 = _snprintf($85, $84, 2127, $44) | 0; //@line 4586
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 4588
      $91 = ($$ | 0) > 0; //@line 4589
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 4594
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 4594
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 4598
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 2145; //@line 4604
        label = 25; //@line 4605
        break;
       }
      case 1:
       {
        $$sink = 2151; //@line 4609
        label = 25; //@line 4610
        break;
       }
      case 3:
       {
        $$sink = 2139; //@line 4614
        label = 25; //@line 4615
        break;
       }
      case 7:
       {
        $$sink = 2133; //@line 4619
        label = 25; //@line 4620
        break;
       }
      default:
       {
        $$0141 = 0; //@line 4624
        $$1152 = 0; //@line 4624
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$48 >> 2] = $$sink; //@line 4628
       $$0141 = $79 & 1; //@line 4631
       $$1152 = _snprintf($$0142, $$0144, 2157, $48) | 0; //@line 4631
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 4634
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 4636
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 4638
       $$1$off0 = $extract$t159; //@line 4643
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 4643
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 4643
       $$3154 = $$1152; //@line 4643
       label = 28; //@line 4644
      } else {
       $$1$off0 = $extract$t159; //@line 4646
       $$1143 = $$0142; //@line 4646
       $$1145 = $$0144; //@line 4646
       $$3154 = $$1152$; //@line 4646
       label = 28; //@line 4647
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
      HEAP32[$30 >> 2] = HEAP32[$6 >> 2]; //@line 4658
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 4659
      $108 = _vsnprintf(0, 0, $4, $30) | 0; //@line 4660
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 43; //@line 4663
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 4664
       HEAP32[$109 >> 2] = $8; //@line 4665
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 4666
       HEAP32[$110 >> 2] = $10; //@line 4667
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 4668
       HEAP32[$111 >> 2] = $4; //@line 4669
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 4670
       HEAP32[$112 >> 2] = $6; //@line 4671
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 4672
       HEAP32[$113 >> 2] = $12; //@line 4673
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 4674
       HEAP32[$114 >> 2] = $$1143; //@line 4675
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 4676
       HEAP32[$115 >> 2] = $$1145; //@line 4677
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 4678
       HEAP32[$116 >> 2] = $14; //@line 4679
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 4680
       HEAP32[$117 >> 2] = $30; //@line 4681
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 4682
       HEAP32[$118 >> 2] = $16; //@line 4683
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 4684
       HEAP32[$119 >> 2] = $18; //@line 4685
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 4686
       HEAP32[$120 >> 2] = $22; //@line 4687
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 4688
       HEAP32[$121 >> 2] = $20; //@line 4689
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 4690
       HEAP32[$122 >> 2] = $24; //@line 4691
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 4692
       HEAP32[$123 >> 2] = $26; //@line 4693
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 4694
       HEAP32[$124 >> 2] = $28; //@line 4695
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 4696
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 4697
       HEAP8[$125 >> 0] = $$1$off0$expand_i1_val; //@line 4698
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 4699
       HEAP32[$126 >> 2] = $32; //@line 4700
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 4701
       HEAP32[$127 >> 2] = $34; //@line 4702
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 4703
       HEAP32[$128 >> 2] = $36; //@line 4704
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 4705
       HEAP32[$129 >> 2] = $38; //@line 4706
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 4707
       HEAP32[$130 >> 2] = $40; //@line 4708
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 4709
       HEAP32[$131 >> 2] = $42; //@line 4710
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 4711
       HEAP32[$132 >> 2] = $74; //@line 4712
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 4713
       HEAP32[$133 >> 2] = $$3154; //@line 4714
       sp = STACKTOP; //@line 4715
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 4719
      ___async_unwind = 0; //@line 4720
      HEAP32[$ReallocAsyncCtx11 >> 2] = 43; //@line 4721
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 4722
      HEAP32[$109 >> 2] = $8; //@line 4723
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 4724
      HEAP32[$110 >> 2] = $10; //@line 4725
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 4726
      HEAP32[$111 >> 2] = $4; //@line 4727
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 4728
      HEAP32[$112 >> 2] = $6; //@line 4729
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 4730
      HEAP32[$113 >> 2] = $12; //@line 4731
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 4732
      HEAP32[$114 >> 2] = $$1143; //@line 4733
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 4734
      HEAP32[$115 >> 2] = $$1145; //@line 4735
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 4736
      HEAP32[$116 >> 2] = $14; //@line 4737
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 4738
      HEAP32[$117 >> 2] = $30; //@line 4739
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 4740
      HEAP32[$118 >> 2] = $16; //@line 4741
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 4742
      HEAP32[$119 >> 2] = $18; //@line 4743
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 4744
      HEAP32[$120 >> 2] = $22; //@line 4745
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 4746
      HEAP32[$121 >> 2] = $20; //@line 4747
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 4748
      HEAP32[$122 >> 2] = $24; //@line 4749
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 4750
      HEAP32[$123 >> 2] = $26; //@line 4751
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 4752
      HEAP32[$124 >> 2] = $28; //@line 4753
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 4754
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 4755
      HEAP8[$125 >> 0] = $$1$off0$expand_i1_val; //@line 4756
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 4757
      HEAP32[$126 >> 2] = $32; //@line 4758
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 4759
      HEAP32[$127 >> 2] = $34; //@line 4760
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 4761
      HEAP32[$128 >> 2] = $36; //@line 4762
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 4763
      HEAP32[$129 >> 2] = $38; //@line 4764
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 4765
      HEAP32[$130 >> 2] = $40; //@line 4766
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 4767
      HEAP32[$131 >> 2] = $42; //@line 4768
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 4769
      HEAP32[$132 >> 2] = $74; //@line 4770
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 4771
      HEAP32[$133 >> 2] = $$3154; //@line 4772
      sp = STACKTOP; //@line 4773
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 4778
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$40 >> 2] = $20; //@line 4784
        $$5156 = _snprintf($$1143, $$1145, 2160, $40) | 0; //@line 4786
        break;
       }
      case 1:
       {
        HEAP32[$36 >> 2] = $20; //@line 4790
        $$5156 = _snprintf($$1143, $$1145, 2175, $36) | 0; //@line 4792
        break;
       }
      case 3:
       {
        HEAP32[$32 >> 2] = $20; //@line 4796
        $$5156 = _snprintf($$1143, $$1145, 2190, $32) | 0; //@line 4798
        break;
       }
      case 7:
       {
        HEAP32[$22 >> 2] = $20; //@line 4802
        $$5156 = _snprintf($$1143, $$1145, 2205, $22) | 0; //@line 4804
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 2220, $16) | 0; //@line 4809
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 4813
      $147 = $$1143 + $$5156$ | 0; //@line 4815
      $148 = $$1145 - $$5156$ | 0; //@line 4816
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 4820
       $150 = _vsnprintf($147, $148, $4, $6) | 0; //@line 4821
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 4824
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 4825
        HEAP32[$151 >> 2] = $8; //@line 4826
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 4827
        HEAP32[$152 >> 2] = $10; //@line 4828
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 4829
        HEAP32[$153 >> 2] = $148; //@line 4830
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 4831
        HEAP32[$154 >> 2] = $147; //@line 4832
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 4833
        HEAP32[$155 >> 2] = $26; //@line 4834
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 4835
        HEAP32[$156 >> 2] = $28; //@line 4836
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 4837
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 4838
        HEAP8[$157 >> 0] = $$1$off0$expand_i1_val18; //@line 4839
        sp = STACKTOP; //@line 4840
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 4844
       ___async_unwind = 0; //@line 4845
       HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 4846
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 4847
       HEAP32[$151 >> 2] = $8; //@line 4848
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 4849
       HEAP32[$152 >> 2] = $10; //@line 4850
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 4851
       HEAP32[$153 >> 2] = $148; //@line 4852
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 4853
       HEAP32[$154 >> 2] = $147; //@line 4854
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 4855
       HEAP32[$155 >> 2] = $26; //@line 4856
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 4857
       HEAP32[$156 >> 2] = $28; //@line 4858
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 4859
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 4860
       HEAP8[$157 >> 0] = $$1$off0$expand_i1_val18; //@line 4861
       sp = STACKTOP; //@line 4862
       return;
      }
     }
    }
    $159 = HEAP32[91] | 0; //@line 4867
    $160 = HEAP32[84] | 0; //@line 4868
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 4869
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 4870
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 4873
     sp = STACKTOP; //@line 4874
     return;
    }
    ___async_unwind = 0; //@line 4877
    HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 4878
    sp = STACKTOP; //@line 4879
    return;
   }
  }
 } while (0);
 $161 = HEAP32[94] | 0; //@line 4884
 if (!$161) {
  return;
 }
 $163 = HEAP32[95] | 0; //@line 4889
 HEAP32[95] = 0; //@line 4890
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 4891
 FUNCTION_TABLE_v[$161 & 3](); //@line 4892
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 4895
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 4896
  HEAP32[$164 >> 2] = $163; //@line 4897
  sp = STACKTOP; //@line 4898
  return;
 }
 ___async_unwind = 0; //@line 4901
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 4902
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 4903
 HEAP32[$164 >> 2] = $163; //@line 4904
 sp = STACKTOP; //@line 4905
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 7067
 $3 = HEAP32[3445] | 0; //@line 7068
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 7071
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 7075
 $7 = $6 & 3; //@line 7076
 if (($7 | 0) == 1) {
  _abort(); //@line 7079
 }
 $9 = $6 & -8; //@line 7082
 $10 = $2 + $9 | 0; //@line 7083
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 7088
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 7094
   $17 = $13 + $9 | 0; //@line 7095
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 7098
   }
   if ((HEAP32[3446] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 7104
    $106 = HEAP32[$105 >> 2] | 0; //@line 7105
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 7109
     $$1382 = $17; //@line 7109
     $114 = $16; //@line 7109
     break;
    }
    HEAP32[3443] = $17; //@line 7112
    HEAP32[$105 >> 2] = $106 & -2; //@line 7114
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 7117
    HEAP32[$16 + $17 >> 2] = $17; //@line 7119
    return;
   }
   $21 = $13 >>> 3; //@line 7122
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 7126
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 7128
    $28 = 13804 + ($21 << 1 << 2) | 0; //@line 7130
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 7135
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7142
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3441] = HEAP32[3441] & ~(1 << $21); //@line 7152
     $$1 = $16; //@line 7153
     $$1382 = $17; //@line 7153
     $114 = $16; //@line 7153
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 7159
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 7163
     }
     $41 = $26 + 8 | 0; //@line 7166
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 7170
     } else {
      _abort(); //@line 7172
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 7177
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 7178
    $$1 = $16; //@line 7179
    $$1382 = $17; //@line 7179
    $114 = $16; //@line 7179
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 7183
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 7185
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 7189
     $60 = $59 + 4 | 0; //@line 7190
     $61 = HEAP32[$60 >> 2] | 0; //@line 7191
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 7194
      if (!$63) {
       $$3 = 0; //@line 7197
       break;
      } else {
       $$1387 = $63; //@line 7200
       $$1390 = $59; //@line 7200
      }
     } else {
      $$1387 = $61; //@line 7203
      $$1390 = $60; //@line 7203
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 7206
      $66 = HEAP32[$65 >> 2] | 0; //@line 7207
      if ($66 | 0) {
       $$1387 = $66; //@line 7210
       $$1390 = $65; //@line 7210
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 7213
      $69 = HEAP32[$68 >> 2] | 0; //@line 7214
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 7219
       $$1390 = $68; //@line 7219
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 7224
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 7227
      $$3 = $$1387; //@line 7228
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 7233
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 7236
     }
     $53 = $51 + 12 | 0; //@line 7239
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7243
     }
     $56 = $48 + 8 | 0; //@line 7246
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 7250
      HEAP32[$56 >> 2] = $51; //@line 7251
      $$3 = $48; //@line 7252
      break;
     } else {
      _abort(); //@line 7255
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 7262
    $$1382 = $17; //@line 7262
    $114 = $16; //@line 7262
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 7265
    $75 = 14068 + ($74 << 2) | 0; //@line 7266
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 7271
      if (!$$3) {
       HEAP32[3442] = HEAP32[3442] & ~(1 << $74); //@line 7278
       $$1 = $16; //@line 7279
       $$1382 = $17; //@line 7279
       $114 = $16; //@line 7279
       break L10;
      }
     } else {
      if ((HEAP32[3445] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 7286
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 7294
       if (!$$3) {
        $$1 = $16; //@line 7297
        $$1382 = $17; //@line 7297
        $114 = $16; //@line 7297
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3445] | 0; //@line 7305
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 7308
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 7312
    $92 = $16 + 16 | 0; //@line 7313
    $93 = HEAP32[$92 >> 2] | 0; //@line 7314
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 7320
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 7324
       HEAP32[$93 + 24 >> 2] = $$3; //@line 7326
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 7332
    if (!$99) {
     $$1 = $16; //@line 7335
     $$1382 = $17; //@line 7335
     $114 = $16; //@line 7335
    } else {
     if ((HEAP32[3445] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 7340
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 7344
      HEAP32[$99 + 24 >> 2] = $$3; //@line 7346
      $$1 = $16; //@line 7347
      $$1382 = $17; //@line 7347
      $114 = $16; //@line 7347
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 7353
   $$1382 = $9; //@line 7353
   $114 = $2; //@line 7353
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 7358
 }
 $115 = $10 + 4 | 0; //@line 7361
 $116 = HEAP32[$115 >> 2] | 0; //@line 7362
 if (!($116 & 1)) {
  _abort(); //@line 7366
 }
 if (!($116 & 2)) {
  if ((HEAP32[3447] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3444] | 0) + $$1382 | 0; //@line 7376
   HEAP32[3444] = $124; //@line 7377
   HEAP32[3447] = $$1; //@line 7378
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 7381
   if (($$1 | 0) != (HEAP32[3446] | 0)) {
    return;
   }
   HEAP32[3446] = 0; //@line 7387
   HEAP32[3443] = 0; //@line 7388
   return;
  }
  if ((HEAP32[3446] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3443] | 0) + $$1382 | 0; //@line 7395
   HEAP32[3443] = $132; //@line 7396
   HEAP32[3446] = $114; //@line 7397
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 7400
   HEAP32[$114 + $132 >> 2] = $132; //@line 7402
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 7406
  $138 = $116 >>> 3; //@line 7407
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 7412
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 7414
    $145 = 13804 + ($138 << 1 << 2) | 0; //@line 7416
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3445] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 7422
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 7429
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3441] = HEAP32[3441] & ~(1 << $138); //@line 7439
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 7445
    } else {
     if ((HEAP32[3445] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 7450
     }
     $160 = $143 + 8 | 0; //@line 7453
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 7457
     } else {
      _abort(); //@line 7459
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 7464
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 7465
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 7468
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 7470
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 7474
      $180 = $179 + 4 | 0; //@line 7475
      $181 = HEAP32[$180 >> 2] | 0; //@line 7476
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 7479
       if (!$183) {
        $$3400 = 0; //@line 7482
        break;
       } else {
        $$1398 = $183; //@line 7485
        $$1402 = $179; //@line 7485
       }
      } else {
       $$1398 = $181; //@line 7488
       $$1402 = $180; //@line 7488
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 7491
       $186 = HEAP32[$185 >> 2] | 0; //@line 7492
       if ($186 | 0) {
        $$1398 = $186; //@line 7495
        $$1402 = $185; //@line 7495
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 7498
       $189 = HEAP32[$188 >> 2] | 0; //@line 7499
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 7504
        $$1402 = $188; //@line 7504
       }
      }
      if ((HEAP32[3445] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 7510
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 7513
       $$3400 = $$1398; //@line 7514
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 7519
      if ((HEAP32[3445] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 7523
      }
      $173 = $170 + 12 | 0; //@line 7526
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 7530
      }
      $176 = $167 + 8 | 0; //@line 7533
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 7537
       HEAP32[$176 >> 2] = $170; //@line 7538
       $$3400 = $167; //@line 7539
       break;
      } else {
       _abort(); //@line 7542
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 7550
     $196 = 14068 + ($195 << 2) | 0; //@line 7551
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 7556
       if (!$$3400) {
        HEAP32[3442] = HEAP32[3442] & ~(1 << $195); //@line 7563
        break L108;
       }
      } else {
       if ((HEAP32[3445] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 7570
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 7578
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3445] | 0; //@line 7588
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 7591
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 7595
     $213 = $10 + 16 | 0; //@line 7596
     $214 = HEAP32[$213 >> 2] | 0; //@line 7597
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 7603
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 7607
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 7609
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 7615
     if ($220 | 0) {
      if ((HEAP32[3445] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 7621
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 7625
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 7627
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 7636
  HEAP32[$114 + $137 >> 2] = $137; //@line 7638
  if (($$1 | 0) == (HEAP32[3446] | 0)) {
   HEAP32[3443] = $137; //@line 7642
   return;
  } else {
   $$2 = $137; //@line 7645
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 7649
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 7652
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 7654
  $$2 = $$1382; //@line 7655
 }
 $235 = $$2 >>> 3; //@line 7657
 if ($$2 >>> 0 < 256) {
  $238 = 13804 + ($235 << 1 << 2) | 0; //@line 7661
  $239 = HEAP32[3441] | 0; //@line 7662
  $240 = 1 << $235; //@line 7663
  if (!($239 & $240)) {
   HEAP32[3441] = $239 | $240; //@line 7668
   $$0403 = $238; //@line 7670
   $$pre$phiZ2D = $238 + 8 | 0; //@line 7670
  } else {
   $244 = $238 + 8 | 0; //@line 7672
   $245 = HEAP32[$244 >> 2] | 0; //@line 7673
   if ((HEAP32[3445] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 7677
   } else {
    $$0403 = $245; //@line 7680
    $$pre$phiZ2D = $244; //@line 7680
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 7683
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 7685
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 7687
  HEAP32[$$1 + 12 >> 2] = $238; //@line 7689
  return;
 }
 $251 = $$2 >>> 8; //@line 7692
 if (!$251) {
  $$0396 = 0; //@line 7695
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7699
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7703
   $257 = $251 << $256; //@line 7704
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7707
   $262 = $257 << $260; //@line 7709
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7712
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7717
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7723
  }
 }
 $276 = 14068 + ($$0396 << 2) | 0; //@line 7726
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7728
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7731
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7732
 $280 = HEAP32[3442] | 0; //@line 7733
 $281 = 1 << $$0396; //@line 7734
 do {
  if (!($280 & $281)) {
   HEAP32[3442] = $280 | $281; //@line 7740
   HEAP32[$276 >> 2] = $$1; //@line 7741
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7743
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7745
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7747
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7755
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7755
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7762
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7766
    $301 = HEAP32[$299 >> 2] | 0; //@line 7768
    if (!$301) {
     label = 121; //@line 7771
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7774
     $$0384 = $301; //@line 7774
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3445] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7781
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7784
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7786
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7788
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7790
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7795
    $309 = HEAP32[$308 >> 2] | 0; //@line 7796
    $310 = HEAP32[3445] | 0; //@line 7797
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7803
     HEAP32[$308 >> 2] = $$1; //@line 7804
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7806
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7808
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7810
     break;
    } else {
     _abort(); //@line 7813
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3449] | 0) + -1 | 0; //@line 7820
 HEAP32[3449] = $319; //@line 7821
 if (!$319) {
  $$0212$in$i = 14220; //@line 7824
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7829
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7835
  }
 }
 HEAP32[3449] = -1; //@line 7838
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12608
 STACKTOP = STACKTOP + 1056 | 0; //@line 12609
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 12609
 $2 = sp + 1024 | 0; //@line 12610
 $3 = sp; //@line 12611
 HEAP32[$2 >> 2] = 0; //@line 12612
 HEAP32[$2 + 4 >> 2] = 0; //@line 12612
 HEAP32[$2 + 8 >> 2] = 0; //@line 12612
 HEAP32[$2 + 12 >> 2] = 0; //@line 12612
 HEAP32[$2 + 16 >> 2] = 0; //@line 12612
 HEAP32[$2 + 20 >> 2] = 0; //@line 12612
 HEAP32[$2 + 24 >> 2] = 0; //@line 12612
 HEAP32[$2 + 28 >> 2] = 0; //@line 12612
 $4 = HEAP8[$1 >> 0] | 0; //@line 12613
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 12617
   $$0185$ph$lcssa327 = -1; //@line 12617
   $$0187219$ph325326 = 0; //@line 12617
   $$1176$ph$ph$lcssa208 = 1; //@line 12617
   $$1186$ph$lcssa = -1; //@line 12617
   label = 26; //@line 12618
  } else {
   $$0187263 = 0; //@line 12620
   $10 = $4; //@line 12620
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 12626
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 12634
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 12637
    $$0187263 = $$0187263 + 1 | 0; //@line 12638
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 12641
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 12643
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 12651
   if ($23) {
    $$0183$ph260 = 0; //@line 12653
    $$0185$ph259 = -1; //@line 12653
    $130 = 1; //@line 12653
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 12655
     $$0183$ph197$ph253 = $$0183$ph260; //@line 12655
     $131 = $130; //@line 12655
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 12657
      $132 = $131; //@line 12657
      L10 : while (1) {
       $$0179242 = 1; //@line 12659
       $25 = $132; //@line 12659
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 12663
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 12665
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 12671
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 12675
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 12680
         $$0185$ph$lcssa = $$0185$ph259; //@line 12680
         break L6;
        } else {
         $25 = $27; //@line 12678
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 12684
       $132 = $37 + 1 | 0; //@line 12685
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 12690
        $$0185$ph$lcssa = $$0185$ph259; //@line 12690
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 12688
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 12695
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 12699
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 12704
       $$0185$ph$lcssa = $$0185$ph259; //@line 12704
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 12702
       $$0183$ph197$ph253 = $25; //@line 12702
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 12709
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 12714
      $$0185$ph$lcssa = $$0183$ph197248; //@line 12714
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 12712
      $$0185$ph259 = $$0183$ph197248; //@line 12712
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 12719
     $$1186$ph238 = -1; //@line 12719
     $133 = 1; //@line 12719
     while (1) {
      $$1176$ph$ph233 = 1; //@line 12721
      $$1184$ph193$ph232 = $$1184$ph239; //@line 12721
      $135 = $133; //@line 12721
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 12723
       $134 = $135; //@line 12723
       L25 : while (1) {
        $$1180222 = 1; //@line 12725
        $52 = $134; //@line 12725
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 12729
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 12731
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 12737
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 12741
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12746
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12746
          $$0187219$ph325326 = $$0187263; //@line 12746
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 12746
          $$1186$ph$lcssa = $$1186$ph238; //@line 12746
          label = 26; //@line 12747
          break L1;
         } else {
          $52 = $45; //@line 12744
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 12751
        $134 = $56 + 1 | 0; //@line 12752
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12757
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12757
         $$0187219$ph325326 = $$0187263; //@line 12757
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 12757
         $$1186$ph$lcssa = $$1186$ph238; //@line 12757
         label = 26; //@line 12758
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 12755
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 12763
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 12767
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12772
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12772
        $$0187219$ph325326 = $$0187263; //@line 12772
        $$1176$ph$ph$lcssa208 = $60; //@line 12772
        $$1186$ph$lcssa = $$1186$ph238; //@line 12772
        label = 26; //@line 12773
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 12770
        $$1184$ph193$ph232 = $52; //@line 12770
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 12778
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12783
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12783
       $$0187219$ph325326 = $$0187263; //@line 12783
       $$1176$ph$ph$lcssa208 = 1; //@line 12783
       $$1186$ph$lcssa = $$1184$ph193227; //@line 12783
       label = 26; //@line 12784
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 12781
       $$1186$ph238 = $$1184$ph193227; //@line 12781
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12789
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12789
     $$0187219$ph325326 = $$0187263; //@line 12789
     $$1176$ph$ph$lcssa208 = 1; //@line 12789
     $$1186$ph$lcssa = -1; //@line 12789
     label = 26; //@line 12790
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 12793
    $$0185$ph$lcssa327 = -1; //@line 12793
    $$0187219$ph325326 = $$0187263; //@line 12793
    $$1176$ph$ph$lcssa208 = 1; //@line 12793
    $$1186$ph$lcssa = -1; //@line 12793
    label = 26; //@line 12794
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 12802
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 12803
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 12804
   $70 = $$1186$$0185 + 1 | 0; //@line 12806
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 12811
    $$3178 = $$1176$$0175; //@line 12811
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 12814
    $$0168 = 0; //@line 12818
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 12818
   }
   $78 = $$0187219$ph325326 | 63; //@line 12820
   $79 = $$0187219$ph325326 + -1 | 0; //@line 12821
   $80 = ($$0168 | 0) != 0; //@line 12822
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 12823
   $$0166 = $0; //@line 12824
   $$0169 = 0; //@line 12824
   $$0170 = $0; //@line 12824
   while (1) {
    $83 = $$0166; //@line 12827
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 12832
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 12836
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 12843
        break L35;
       } else {
        $$3173 = $86; //@line 12846
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 12851
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 12855
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 12867
      $$2181$sink = $$0187219$ph325326; //@line 12867
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 12872
      if ($105 | 0) {
       $$0169$be = 0; //@line 12880
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 12880
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 12884
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 12886
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 12890
       } else {
        $$3182221 = $111; //@line 12892
        $$pr = $113; //@line 12892
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 12900
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 12902
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 12905
          break L54;
         } else {
          $$3182221 = $118; //@line 12908
         }
        }
        $$0169$be = 0; //@line 12912
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 12912
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 12919
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 12922
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 12931
        $$2181$sink = $$3178; //@line 12931
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 12938
    $$0169 = $$0169$be; //@line 12938
    $$0170 = $$3173; //@line 12938
   }
  }
 } while (0);
 STACKTOP = sp; //@line 12942
 return $$3 | 0; //@line 12942
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $31 = 0, $33 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $56 = 0, $57 = 0, $6 = 0, $62 = 0, $64 = 0, $65 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6497
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6499
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6501
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6503
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6505
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 6507
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6509
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6511
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6513
 $18 = HEAP8[$0 + 36 >> 0] | 0; //@line 6515
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6517
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6519
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6521
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 6525
 if ((HEAP32[$0 + 52 >> 2] | 0) >>> 0 > (HEAP32[___async_retval >> 2] | 0) >>> 0) {
  HEAP32[$20 >> 2] = 0; //@line 6530
  $31 = $12 + 64 | 0; //@line 6531
  $33 = (HEAP32[$31 >> 2] | 0) + $22 | 0; //@line 6533
  HEAP32[$31 >> 2] = $33; //@line 6534
  $36 = HEAP32[(HEAP32[$24 >> 2] | 0) + 132 >> 2] | 0; //@line 6537
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(60) | 0; //@line 6538
  $37 = FUNCTION_TABLE_ii[$36 & 31]($12) | 0; //@line 6539
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 6542
   $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 6543
   HEAP32[$38 >> 2] = $2; //@line 6544
   $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 6545
   HEAP32[$39 >> 2] = $33; //@line 6546
   $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 6547
   HEAP32[$40 >> 2] = $14; //@line 6548
   $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 6549
   HEAP32[$41 >> 2] = $16; //@line 6550
   $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 6551
   HEAP8[$42 >> 0] = $18; //@line 6552
   $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 6553
   HEAP32[$43 >> 2] = $31; //@line 6554
   $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 6555
   HEAP32[$44 >> 2] = $20; //@line 6556
   $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 6557
   HEAP8[$45 >> 0] = $10; //@line 6558
   $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 6559
   HEAP32[$46 >> 2] = $12; //@line 6560
   $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 6561
   HEAP32[$47 >> 2] = $8; //@line 6562
   $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 6563
   HEAP32[$48 >> 2] = $4; //@line 6564
   $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 6565
   HEAP32[$49 >> 2] = $6; //@line 6566
   $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 6567
   HEAP32[$50 >> 2] = $28; //@line 6568
   $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 6569
   HEAP32[$51 >> 2] = $22; //@line 6570
   sp = STACKTOP; //@line 6571
   return;
  }
  HEAP32[___async_retval >> 2] = $37; //@line 6575
  ___async_unwind = 0; //@line 6576
  HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 6577
  $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 6578
  HEAP32[$38 >> 2] = $2; //@line 6579
  $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 6580
  HEAP32[$39 >> 2] = $33; //@line 6581
  $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 6582
  HEAP32[$40 >> 2] = $14; //@line 6583
  $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 6584
  HEAP32[$41 >> 2] = $16; //@line 6585
  $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 6586
  HEAP8[$42 >> 0] = $18; //@line 6587
  $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 6588
  HEAP32[$43 >> 2] = $31; //@line 6589
  $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 6590
  HEAP32[$44 >> 2] = $20; //@line 6591
  $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 6592
  HEAP8[$45 >> 0] = $10; //@line 6593
  $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 6594
  HEAP32[$46 >> 2] = $12; //@line 6595
  $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 6596
  HEAP32[$47 >> 2] = $8; //@line 6597
  $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 6598
  HEAP32[$48 >> 2] = $4; //@line 6599
  $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 6600
  HEAP32[$49 >> 2] = $6; //@line 6601
  $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 6602
  HEAP32[$50 >> 2] = $28; //@line 6603
  $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 6604
  HEAP32[$51 >> 2] = $22; //@line 6605
  sp = STACKTOP; //@line 6606
  return;
 }
 $56 = (HEAP32[$2 >> 2] | 0) + ((Math_imul($14 + -32 | 0, $16) | 0) + 4) | 0; //@line 6613
 $57 = HEAP8[$56 >> 0] | 0; //@line 6614
 if ($18 << 24 >> 24) {
  if ($10 << 24 >> 24) {
   $62 = (0 >>> 3 & 31) + 1 | 0; //@line 6621
   $64 = 1 << 0; //@line 6623
   $65 = 0 + $8 | 0; //@line 6624
   $75 = HEAP32[(HEAP32[$12 >> 2] | 0) + 124 >> 2] | 0; //@line 6634
   $76 = 0 + $6 | 0; //@line 6635
   if (!($64 & (HEAPU8[$56 + ($62 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 6637
    FUNCTION_TABLE_viiii[$75 & 7]($12, $76, $65, 0); //@line 6638
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 6641
     $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 6642
     HEAP32[$92 >> 2] = 0; //@line 6643
     $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 6644
     HEAP32[$93 >> 2] = $28; //@line 6645
     $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 6646
     HEAP32[$94 >> 2] = 0; //@line 6647
     $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 6648
     HEAP32[$95 >> 2] = $22; //@line 6649
     $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 6650
     HEAP32[$96 >> 2] = $4; //@line 6651
     $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 6652
     HEAP32[$97 >> 2] = $62; //@line 6653
     $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 6654
     HEAP32[$98 >> 2] = $56; //@line 6655
     $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 6656
     HEAP32[$99 >> 2] = $64; //@line 6657
     $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 6658
     HEAP32[$100 >> 2] = $12; //@line 6659
     $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 6660
     HEAP32[$101 >> 2] = $6; //@line 6661
     $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 6662
     HEAP32[$102 >> 2] = $12; //@line 6663
     $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 6664
     HEAP32[$103 >> 2] = $65; //@line 6665
     $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 6666
     HEAP8[$104 >> 0] = $57; //@line 6667
     $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 6668
     HEAP32[$105 >> 2] = $20; //@line 6669
     $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 6670
     HEAP32[$106 >> 2] = $8; //@line 6671
     sp = STACKTOP; //@line 6672
     return;
    }
    ___async_unwind = 0; //@line 6675
    HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 6676
    $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 6677
    HEAP32[$92 >> 2] = 0; //@line 6678
    $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 6679
    HEAP32[$93 >> 2] = $28; //@line 6680
    $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 6681
    HEAP32[$94 >> 2] = 0; //@line 6682
    $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 6683
    HEAP32[$95 >> 2] = $22; //@line 6684
    $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 6685
    HEAP32[$96 >> 2] = $4; //@line 6686
    $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 6687
    HEAP32[$97 >> 2] = $62; //@line 6688
    $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 6689
    HEAP32[$98 >> 2] = $56; //@line 6690
    $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 6691
    HEAP32[$99 >> 2] = $64; //@line 6692
    $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 6693
    HEAP32[$100 >> 2] = $12; //@line 6694
    $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 6695
    HEAP32[$101 >> 2] = $6; //@line 6696
    $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 6697
    HEAP32[$102 >> 2] = $12; //@line 6698
    $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 6699
    HEAP32[$103 >> 2] = $65; //@line 6700
    $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 6701
    HEAP8[$104 >> 0] = $57; //@line 6702
    $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 6703
    HEAP32[$105 >> 2] = $20; //@line 6704
    $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 6705
    HEAP32[$106 >> 2] = $8; //@line 6706
    sp = STACKTOP; //@line 6707
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 6710
    FUNCTION_TABLE_viiii[$75 & 7]($12, $76, $65, 1); //@line 6711
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 6714
     $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 6715
     HEAP32[$77 >> 2] = 0; //@line 6716
     $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 6717
     HEAP32[$78 >> 2] = $28; //@line 6718
     $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 6719
     HEAP32[$79 >> 2] = 0; //@line 6720
     $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 6721
     HEAP32[$80 >> 2] = $22; //@line 6722
     $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 6723
     HEAP32[$81 >> 2] = $4; //@line 6724
     $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 6725
     HEAP32[$82 >> 2] = $62; //@line 6726
     $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 6727
     HEAP32[$83 >> 2] = $56; //@line 6728
     $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 6729
     HEAP32[$84 >> 2] = $64; //@line 6730
     $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 6731
     HEAP32[$85 >> 2] = $12; //@line 6732
     $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 6733
     HEAP32[$86 >> 2] = $6; //@line 6734
     $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 6735
     HEAP32[$87 >> 2] = $12; //@line 6736
     $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 6737
     HEAP32[$88 >> 2] = $65; //@line 6738
     $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 6739
     HEAP8[$89 >> 0] = $57; //@line 6740
     $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 6741
     HEAP32[$90 >> 2] = $20; //@line 6742
     $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 6743
     HEAP32[$91 >> 2] = $8; //@line 6744
     sp = STACKTOP; //@line 6745
     return;
    }
    ___async_unwind = 0; //@line 6748
    HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 6749
    $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 6750
    HEAP32[$77 >> 2] = 0; //@line 6751
    $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 6752
    HEAP32[$78 >> 2] = $28; //@line 6753
    $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 6754
    HEAP32[$79 >> 2] = 0; //@line 6755
    $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 6756
    HEAP32[$80 >> 2] = $22; //@line 6757
    $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 6758
    HEAP32[$81 >> 2] = $4; //@line 6759
    $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 6760
    HEAP32[$82 >> 2] = $62; //@line 6761
    $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 6762
    HEAP32[$83 >> 2] = $56; //@line 6763
    $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 6764
    HEAP32[$84 >> 2] = $64; //@line 6765
    $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 6766
    HEAP32[$85 >> 2] = $12; //@line 6767
    $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 6768
    HEAP32[$86 >> 2] = $6; //@line 6769
    $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 6770
    HEAP32[$87 >> 2] = $12; //@line 6771
    $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 6772
    HEAP32[$88 >> 2] = $65; //@line 6773
    $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 6774
    HEAP8[$89 >> 0] = $57; //@line 6775
    $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 6776
    HEAP32[$90 >> 2] = $20; //@line 6777
    $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 6778
    HEAP32[$91 >> 2] = $8; //@line 6779
    sp = STACKTOP; //@line 6780
    return;
   }
  }
 }
 HEAP32[$20 >> 2] = (HEAP32[$20 >> 2] | 0) + ($57 & 255); //@line 6788
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 9620
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 9621
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 9622
 $d_sroa_0_0_extract_trunc = $b$0; //@line 9623
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 9624
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 9625
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 9627
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9630
    HEAP32[$rem + 4 >> 2] = 0; //@line 9631
   }
   $_0$1 = 0; //@line 9633
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9634
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9635
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 9638
    $_0$0 = 0; //@line 9639
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9640
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9642
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 9643
   $_0$1 = 0; //@line 9644
   $_0$0 = 0; //@line 9645
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9646
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 9649
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9654
     HEAP32[$rem + 4 >> 2] = 0; //@line 9655
    }
    $_0$1 = 0; //@line 9657
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9658
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9659
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 9663
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 9664
    }
    $_0$1 = 0; //@line 9666
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 9667
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9668
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 9670
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 9673
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 9674
    }
    $_0$1 = 0; //@line 9676
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 9677
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9678
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9681
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 9683
    $58 = 31 - $51 | 0; //@line 9684
    $sr_1_ph = $57; //@line 9685
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 9686
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 9687
    $q_sroa_0_1_ph = 0; //@line 9688
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 9689
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 9693
    $_0$0 = 0; //@line 9694
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9695
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9697
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9698
   $_0$1 = 0; //@line 9699
   $_0$0 = 0; //@line 9700
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9701
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9705
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 9707
     $126 = 31 - $119 | 0; //@line 9708
     $130 = $119 - 31 >> 31; //@line 9709
     $sr_1_ph = $125; //@line 9710
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 9711
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 9712
     $q_sroa_0_1_ph = 0; //@line 9713
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 9714
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 9718
     $_0$0 = 0; //@line 9719
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9720
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 9722
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9723
    $_0$1 = 0; //@line 9724
    $_0$0 = 0; //@line 9725
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9726
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 9728
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9731
    $89 = 64 - $88 | 0; //@line 9732
    $91 = 32 - $88 | 0; //@line 9733
    $92 = $91 >> 31; //@line 9734
    $95 = $88 - 32 | 0; //@line 9735
    $105 = $95 >> 31; //@line 9736
    $sr_1_ph = $88; //@line 9737
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 9738
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 9739
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 9740
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 9741
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 9745
    HEAP32[$rem + 4 >> 2] = 0; //@line 9746
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9749
    $_0$0 = $a$0 | 0 | 0; //@line 9750
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9751
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 9753
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 9754
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 9755
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9756
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 9761
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 9762
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 9763
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 9764
  $carry_0_lcssa$1 = 0; //@line 9765
  $carry_0_lcssa$0 = 0; //@line 9766
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 9768
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 9769
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 9770
  $137$1 = tempRet0; //@line 9771
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 9772
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 9773
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 9774
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 9775
  $sr_1202 = $sr_1_ph; //@line 9776
  $carry_0203 = 0; //@line 9777
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 9779
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 9780
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 9781
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 9782
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 9783
   $150$1 = tempRet0; //@line 9784
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 9785
   $carry_0203 = $151$0 & 1; //@line 9786
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 9788
   $r_sroa_1_1200 = tempRet0; //@line 9789
   $sr_1202 = $sr_1202 - 1 | 0; //@line 9790
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 9802
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 9803
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 9804
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 9805
  $carry_0_lcssa$1 = 0; //@line 9806
  $carry_0_lcssa$0 = $carry_0203; //@line 9807
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 9809
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 9810
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 9813
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 9814
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 9816
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 9817
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9818
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1266
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 1272
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 1281
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 1286
      $19 = $1 + 44 | 0; //@line 1287
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 1296
      $26 = $1 + 52 | 0; //@line 1297
      $27 = $1 + 53 | 0; //@line 1298
      $28 = $1 + 54 | 0; //@line 1299
      $29 = $0 + 8 | 0; //@line 1300
      $30 = $1 + 24 | 0; //@line 1301
      $$081$off0 = 0; //@line 1302
      $$084 = $0 + 16 | 0; //@line 1302
      $$085$off0 = 0; //@line 1302
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 1306
        label = 20; //@line 1307
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 1310
       HEAP8[$27 >> 0] = 0; //@line 1311
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 1312
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 1313
       if (___async) {
        label = 12; //@line 1316
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1319
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 1323
        label = 20; //@line 1324
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 1331
         $$186$off0 = $$085$off0; //@line 1331
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 1340
           label = 20; //@line 1341
           break L10;
          } else {
           $$182$off0 = 1; //@line 1344
           $$186$off0 = $$085$off0; //@line 1344
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 1351
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 1358
          break L10;
         } else {
          $$182$off0 = 1; //@line 1361
          $$186$off0 = 1; //@line 1361
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 1366
       $$084 = $$084 + 8 | 0; //@line 1366
       $$085$off0 = $$186$off0; //@line 1366
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 206; //@line 1369
       HEAP32[$AsyncCtx15 + 4 >> 2] = $26; //@line 1371
       HEAP32[$AsyncCtx15 + 8 >> 2] = $27; //@line 1373
       HEAP32[$AsyncCtx15 + 12 >> 2] = $1; //@line 1375
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 1377
       HEAP8[$AsyncCtx15 + 20 >> 0] = $4 & 1; //@line 1380
       HEAP32[$AsyncCtx15 + 24 >> 2] = $25; //@line 1382
       HEAP32[$AsyncCtx15 + 28 >> 2] = $28; //@line 1384
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 1386
       HEAP32[$AsyncCtx15 + 36 >> 2] = $30; //@line 1388
       HEAP8[$AsyncCtx15 + 40 >> 0] = $$085$off0 & 1; //@line 1391
       HEAP8[$AsyncCtx15 + 41 >> 0] = $$081$off0 & 1; //@line 1394
       HEAP32[$AsyncCtx15 + 44 >> 2] = $$084; //@line 1396
       HEAP32[$AsyncCtx15 + 48 >> 2] = $13; //@line 1398
       HEAP32[$AsyncCtx15 + 52 >> 2] = $19; //@line 1400
       sp = STACKTOP; //@line 1401
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 1407
         $61 = $1 + 40 | 0; //@line 1408
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 1411
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 1419
           if ($$283$off0) {
            label = 25; //@line 1421
            break;
           } else {
            $69 = 4; //@line 1424
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 1431
        } else {
         $69 = 4; //@line 1433
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 1438
      }
      HEAP32[$19 >> 2] = $69; //@line 1440
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 1449
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 1454
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 1455
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1456
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 1457
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 207; //@line 1460
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 1462
    HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 1464
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 1466
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 1468
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 1471
    HEAP32[$AsyncCtx11 + 24 >> 2] = $72; //@line 1473
    HEAP32[$AsyncCtx11 + 28 >> 2] = $73; //@line 1475
    sp = STACKTOP; //@line 1476
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1479
   $81 = $0 + 24 | 0; //@line 1480
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 1484
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 1488
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 1495
       $$2 = $81; //@line 1496
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 1508
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 1509
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 1514
        $136 = $$2 + 8 | 0; //@line 1515
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 1518
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 210; //@line 1523
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 1525
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 1527
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 1529
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 1531
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 1533
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 1535
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 1537
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 1540
       sp = STACKTOP; //@line 1541
       return;
      }
      $104 = $1 + 24 | 0; //@line 1544
      $105 = $1 + 54 | 0; //@line 1545
      $$1 = $81; //@line 1546
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 1562
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 1563
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1568
       $122 = $$1 + 8 | 0; //@line 1569
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 1572
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 209; //@line 1577
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 1579
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 1581
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 1583
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 1585
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 1587
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 1589
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 1591
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 1593
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 1596
      sp = STACKTOP; //@line 1597
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 1601
    $$0 = $81; //@line 1602
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1609
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 1610
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1615
     $100 = $$0 + 8 | 0; //@line 1616
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 1619
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 208; //@line 1624
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 1626
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 1628
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 1630
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 1632
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1634
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 1636
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 1639
    sp = STACKTOP; //@line 1640
    return;
   }
  }
 } while (0);
 return;
}
function __ZN6C128329characterEiii__async_cb_67($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7248
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7252
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7254
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7256
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7258
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7260
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7262
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7264
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7266
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7268
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7270
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 7272
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 7274
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 7276
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 7278
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 7279
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 7283
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 7292
    $$043$us$reg2mem$0 = $32; //@line 7292
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 7292
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 7292
    $$reg2mem21$0 = $32 + $30 | 0; //@line 7292
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 7298
   return;
  } else {
   $$04142$us = $79; //@line 7301
   $$043$us$reg2mem$0 = $6; //@line 7301
   $$reg2mem$0 = $12; //@line 7301
   $$reg2mem17$0 = $16; //@line 7301
   $$reg2mem21$0 = $24; //@line 7301
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 7310
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 7313
 $48 = $$04142$us + $20 | 0; //@line 7314
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 7316
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 7317
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 7320
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 7321
   HEAP32[$64 >> 2] = $$04142$us; //@line 7322
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 7323
   HEAP32[$65 >> 2] = $4; //@line 7324
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 7325
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 7326
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 7327
   HEAP32[$67 >> 2] = $8; //@line 7328
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 7329
   HEAP32[$68 >> 2] = $10; //@line 7330
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 7331
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 7332
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 7333
   HEAP32[$70 >> 2] = $14; //@line 7334
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 7335
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 7336
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 7337
   HEAP32[$72 >> 2] = $18; //@line 7338
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 7339
   HEAP32[$73 >> 2] = $20; //@line 7340
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 7341
   HEAP32[$74 >> 2] = $22; //@line 7342
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 7343
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 7344
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 7345
   HEAP8[$76 >> 0] = $26; //@line 7346
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 7347
   HEAP32[$77 >> 2] = $28; //@line 7348
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 7349
   HEAP32[$78 >> 2] = $30; //@line 7350
   sp = STACKTOP; //@line 7351
   return;
  }
  ___async_unwind = 0; //@line 7354
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 7355
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 7356
  HEAP32[$64 >> 2] = $$04142$us; //@line 7357
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 7358
  HEAP32[$65 >> 2] = $4; //@line 7359
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 7360
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 7361
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 7362
  HEAP32[$67 >> 2] = $8; //@line 7363
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 7364
  HEAP32[$68 >> 2] = $10; //@line 7365
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 7366
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 7367
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 7368
  HEAP32[$70 >> 2] = $14; //@line 7369
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 7370
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 7371
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 7372
  HEAP32[$72 >> 2] = $18; //@line 7373
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 7374
  HEAP32[$73 >> 2] = $20; //@line 7375
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 7376
  HEAP32[$74 >> 2] = $22; //@line 7377
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 7378
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 7379
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 7380
  HEAP8[$76 >> 0] = $26; //@line 7381
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 7382
  HEAP32[$77 >> 2] = $28; //@line 7383
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 7384
  HEAP32[$78 >> 2] = $30; //@line 7385
  sp = STACKTOP; //@line 7386
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 7389
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 7390
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 7393
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 7394
   HEAP32[$49 >> 2] = $$04142$us; //@line 7395
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 7396
   HEAP32[$50 >> 2] = $4; //@line 7397
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 7398
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 7399
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 7400
   HEAP32[$52 >> 2] = $8; //@line 7401
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 7402
   HEAP32[$53 >> 2] = $10; //@line 7403
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 7404
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 7405
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 7406
   HEAP32[$55 >> 2] = $14; //@line 7407
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 7408
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 7409
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 7410
   HEAP32[$57 >> 2] = $18; //@line 7411
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 7412
   HEAP32[$58 >> 2] = $20; //@line 7413
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 7414
   HEAP32[$59 >> 2] = $22; //@line 7415
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 7416
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 7417
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 7418
   HEAP8[$61 >> 0] = $26; //@line 7419
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 7420
   HEAP32[$62 >> 2] = $28; //@line 7421
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 7422
   HEAP32[$63 >> 2] = $30; //@line 7423
   sp = STACKTOP; //@line 7424
   return;
  }
  ___async_unwind = 0; //@line 7427
  HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 7428
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 7429
  HEAP32[$49 >> 2] = $$04142$us; //@line 7430
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 7431
  HEAP32[$50 >> 2] = $4; //@line 7432
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 7433
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 7434
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 7435
  HEAP32[$52 >> 2] = $8; //@line 7436
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 7437
  HEAP32[$53 >> 2] = $10; //@line 7438
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 7439
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 7440
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 7441
  HEAP32[$55 >> 2] = $14; //@line 7442
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 7443
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 7444
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 7445
  HEAP32[$57 >> 2] = $18; //@line 7446
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 7447
  HEAP32[$58 >> 2] = $20; //@line 7448
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 7449
  HEAP32[$59 >> 2] = $22; //@line 7450
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 7451
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 7452
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 7453
  HEAP8[$61 >> 0] = $26; //@line 7454
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 7455
  HEAP32[$62 >> 2] = $28; //@line 7456
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 7457
  HEAP32[$63 >> 2] = $30; //@line 7458
  sp = STACKTOP; //@line 7459
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_66($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7026
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7030
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7032
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7034
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7036
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7038
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7040
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7042
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7044
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7046
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7048
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 7050
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 7052
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 7054
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 7056
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 7057
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 7061
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 7070
    $$043$us$reg2mem$0 = $32; //@line 7070
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 7070
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 7070
    $$reg2mem21$0 = $32 + $30 | 0; //@line 7070
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 7076
   return;
  } else {
   $$04142$us = $79; //@line 7079
   $$043$us$reg2mem$0 = $6; //@line 7079
   $$reg2mem$0 = $12; //@line 7079
   $$reg2mem17$0 = $16; //@line 7079
   $$reg2mem21$0 = $24; //@line 7079
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 7088
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 7091
 $48 = $$04142$us + $20 | 0; //@line 7092
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 7094
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 7095
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 7098
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 7099
   HEAP32[$64 >> 2] = $$04142$us; //@line 7100
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 7101
   HEAP32[$65 >> 2] = $4; //@line 7102
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 7103
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 7104
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 7105
   HEAP32[$67 >> 2] = $8; //@line 7106
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 7107
   HEAP32[$68 >> 2] = $10; //@line 7108
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 7109
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 7110
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 7111
   HEAP32[$70 >> 2] = $14; //@line 7112
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 7113
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 7114
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 7115
   HEAP32[$72 >> 2] = $18; //@line 7116
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 7117
   HEAP32[$73 >> 2] = $20; //@line 7118
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 7119
   HEAP32[$74 >> 2] = $22; //@line 7120
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 7121
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 7122
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 7123
   HEAP8[$76 >> 0] = $26; //@line 7124
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 7125
   HEAP32[$77 >> 2] = $28; //@line 7126
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 7127
   HEAP32[$78 >> 2] = $30; //@line 7128
   sp = STACKTOP; //@line 7129
   return;
  }
  ___async_unwind = 0; //@line 7132
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 7133
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 7134
  HEAP32[$64 >> 2] = $$04142$us; //@line 7135
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 7136
  HEAP32[$65 >> 2] = $4; //@line 7137
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 7138
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 7139
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 7140
  HEAP32[$67 >> 2] = $8; //@line 7141
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 7142
  HEAP32[$68 >> 2] = $10; //@line 7143
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 7144
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 7145
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 7146
  HEAP32[$70 >> 2] = $14; //@line 7147
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 7148
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 7149
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 7150
  HEAP32[$72 >> 2] = $18; //@line 7151
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 7152
  HEAP32[$73 >> 2] = $20; //@line 7153
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 7154
  HEAP32[$74 >> 2] = $22; //@line 7155
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 7156
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 7157
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 7158
  HEAP8[$76 >> 0] = $26; //@line 7159
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 7160
  HEAP32[$77 >> 2] = $28; //@line 7161
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 7162
  HEAP32[$78 >> 2] = $30; //@line 7163
  sp = STACKTOP; //@line 7164
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 7167
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 7168
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 7171
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 7172
   HEAP32[$49 >> 2] = $$04142$us; //@line 7173
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 7174
   HEAP32[$50 >> 2] = $4; //@line 7175
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 7176
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 7177
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 7178
   HEAP32[$52 >> 2] = $8; //@line 7179
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 7180
   HEAP32[$53 >> 2] = $10; //@line 7181
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 7182
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 7183
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 7184
   HEAP32[$55 >> 2] = $14; //@line 7185
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 7186
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 7187
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 7188
   HEAP32[$57 >> 2] = $18; //@line 7189
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 7190
   HEAP32[$58 >> 2] = $20; //@line 7191
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 7192
   HEAP32[$59 >> 2] = $22; //@line 7193
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 7194
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 7195
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 7196
   HEAP8[$61 >> 0] = $26; //@line 7197
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 7198
   HEAP32[$62 >> 2] = $28; //@line 7199
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 7200
   HEAP32[$63 >> 2] = $30; //@line 7201
   sp = STACKTOP; //@line 7202
   return;
  }
  ___async_unwind = 0; //@line 7205
  HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 7206
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 7207
  HEAP32[$49 >> 2] = $$04142$us; //@line 7208
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 7209
  HEAP32[$50 >> 2] = $4; //@line 7210
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 7211
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 7212
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 7213
  HEAP32[$52 >> 2] = $8; //@line 7214
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 7215
  HEAP32[$53 >> 2] = $10; //@line 7216
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 7217
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 7218
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 7219
  HEAP32[$55 >> 2] = $14; //@line 7220
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 7221
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 7222
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 7223
  HEAP32[$57 >> 2] = $18; //@line 7224
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 7225
  HEAP32[$58 >> 2] = $20; //@line 7226
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 7227
  HEAP32[$59 >> 2] = $22; //@line 7228
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 7229
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 7230
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 7231
  HEAP8[$61 >> 0] = $26; //@line 7232
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 7233
  HEAP32[$62 >> 2] = $28; //@line 7234
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 7235
  HEAP32[$63 >> 2] = $30; //@line 7236
  sp = STACKTOP; //@line 7237
  return;
 }
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
function __ZN6C128329characterEiii__async_cb_65($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $39 = 0, $40 = 0, $45 = 0, $47 = 0, $48 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6798
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6804
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6806
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 6808
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6812
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 6814
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6816
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6818
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6820
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6822
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6824
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 6826
 $30 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 6829
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 >= ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[$30 + 2 >> 0] | 0) | 0) >>> 0) {
  HEAP32[HEAP32[$0 + 24 >> 2] >> 2] = 0; //@line 6836
 }
 $39 = $30 + ((Math_imul($6 + -32 | 0, $8) | 0) + 4) | 0; //@line 6841
 $40 = HEAP8[$39 >> 0] | 0; //@line 6842
 if ($10 << 24 >> 24) {
  if ($16 << 24 >> 24) {
   $45 = (0 >>> 3 & 31) + 1 | 0; //@line 6849
   $47 = 1 << 0; //@line 6851
   $48 = 0 + $20 | 0; //@line 6852
   $58 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 6862
   $59 = 0 + $24 | 0; //@line 6863
   if (!($47 & (HEAPU8[$39 + ($45 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 6865
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 0); //@line 6866
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 6869
     $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 6870
     HEAP32[$75 >> 2] = 0; //@line 6871
     $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 6872
     HEAP32[$76 >> 2] = $26; //@line 6873
     $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 6874
     HEAP32[$77 >> 2] = 0; //@line 6875
     $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 6876
     HEAP32[$78 >> 2] = $28; //@line 6877
     $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 6878
     HEAP32[$79 >> 2] = $22; //@line 6879
     $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 6880
     HEAP32[$80 >> 2] = $45; //@line 6881
     $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 6882
     HEAP32[$81 >> 2] = $39; //@line 6883
     $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 6884
     HEAP32[$82 >> 2] = $47; //@line 6885
     $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 6886
     HEAP32[$83 >> 2] = $18; //@line 6887
     $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 6888
     HEAP32[$84 >> 2] = $24; //@line 6889
     $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 6890
     HEAP32[$85 >> 2] = $18; //@line 6891
     $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 6892
     HEAP32[$86 >> 2] = $48; //@line 6893
     $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 6894
     HEAP8[$87 >> 0] = $40; //@line 6895
     $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 6896
     HEAP32[$88 >> 2] = $14; //@line 6897
     $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 6898
     HEAP32[$89 >> 2] = $20; //@line 6899
     sp = STACKTOP; //@line 6900
     return;
    }
    ___async_unwind = 0; //@line 6903
    HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 6904
    $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 6905
    HEAP32[$75 >> 2] = 0; //@line 6906
    $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 6907
    HEAP32[$76 >> 2] = $26; //@line 6908
    $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 6909
    HEAP32[$77 >> 2] = 0; //@line 6910
    $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 6911
    HEAP32[$78 >> 2] = $28; //@line 6912
    $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 6913
    HEAP32[$79 >> 2] = $22; //@line 6914
    $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 6915
    HEAP32[$80 >> 2] = $45; //@line 6916
    $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 6917
    HEAP32[$81 >> 2] = $39; //@line 6918
    $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 6919
    HEAP32[$82 >> 2] = $47; //@line 6920
    $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 6921
    HEAP32[$83 >> 2] = $18; //@line 6922
    $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 6923
    HEAP32[$84 >> 2] = $24; //@line 6924
    $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 6925
    HEAP32[$85 >> 2] = $18; //@line 6926
    $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 6927
    HEAP32[$86 >> 2] = $48; //@line 6928
    $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 6929
    HEAP8[$87 >> 0] = $40; //@line 6930
    $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 6931
    HEAP32[$88 >> 2] = $14; //@line 6932
    $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 6933
    HEAP32[$89 >> 2] = $20; //@line 6934
    sp = STACKTOP; //@line 6935
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 6938
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 1); //@line 6939
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 6942
     $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 6943
     HEAP32[$60 >> 2] = 0; //@line 6944
     $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 6945
     HEAP32[$61 >> 2] = $26; //@line 6946
     $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 6947
     HEAP32[$62 >> 2] = 0; //@line 6948
     $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 6949
     HEAP32[$63 >> 2] = $28; //@line 6950
     $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 6951
     HEAP32[$64 >> 2] = $22; //@line 6952
     $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 6953
     HEAP32[$65 >> 2] = $45; //@line 6954
     $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 6955
     HEAP32[$66 >> 2] = $39; //@line 6956
     $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 6957
     HEAP32[$67 >> 2] = $47; //@line 6958
     $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 6959
     HEAP32[$68 >> 2] = $18; //@line 6960
     $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 6961
     HEAP32[$69 >> 2] = $24; //@line 6962
     $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 6963
     HEAP32[$70 >> 2] = $18; //@line 6964
     $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 6965
     HEAP32[$71 >> 2] = $48; //@line 6966
     $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 6967
     HEAP8[$72 >> 0] = $40; //@line 6968
     $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 6969
     HEAP32[$73 >> 2] = $14; //@line 6970
     $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 6971
     HEAP32[$74 >> 2] = $20; //@line 6972
     sp = STACKTOP; //@line 6973
     return;
    }
    ___async_unwind = 0; //@line 6976
    HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 6977
    $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 6978
    HEAP32[$60 >> 2] = 0; //@line 6979
    $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 6980
    HEAP32[$61 >> 2] = $26; //@line 6981
    $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 6982
    HEAP32[$62 >> 2] = 0; //@line 6983
    $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 6984
    HEAP32[$63 >> 2] = $28; //@line 6985
    $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 6986
    HEAP32[$64 >> 2] = $22; //@line 6987
    $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 6988
    HEAP32[$65 >> 2] = $45; //@line 6989
    $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 6990
    HEAP32[$66 >> 2] = $39; //@line 6991
    $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 6992
    HEAP32[$67 >> 2] = $47; //@line 6993
    $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 6994
    HEAP32[$68 >> 2] = $18; //@line 6995
    $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 6996
    HEAP32[$69 >> 2] = $24; //@line 6997
    $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 6998
    HEAP32[$70 >> 2] = $18; //@line 6999
    $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 7000
    HEAP32[$71 >> 2] = $48; //@line 7001
    $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 7002
    HEAP8[$72 >> 0] = $40; //@line 7003
    $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 7004
    HEAP32[$73 >> 2] = $14; //@line 7005
    $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 7006
    HEAP32[$74 >> 2] = $20; //@line 7007
    sp = STACKTOP; //@line 7008
    return;
   }
  }
 }
 HEAP32[$14 >> 2] = (HEAP32[$14 >> 2] | 0) + ($40 & 255); //@line 7016
 return;
}
function __ZN6C128329characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$04142$us = 0, $$043$us = 0, $10 = 0, $11 = 0, $122 = 0, $123 = 0, $13 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $40 = 0, $42 = 0, $45 = 0, $46 = 0, $5 = 0, $6 = 0, $61 = 0, $70 = 0, $71 = 0, $72 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $87 = 0, $90 = 0, $91 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3066
 if (($3 + -31 | 0) >>> 0 > 96) {
  return;
 }
 $5 = $0 + 48 | 0; //@line 3072
 $6 = HEAP32[$5 >> 2] | 0; //@line 3073
 $8 = HEAPU8[$6 >> 0] | 0; //@line 3075
 $10 = HEAP8[$6 + 1 >> 0] | 0; //@line 3077
 $11 = $10 & 255; //@line 3078
 $13 = HEAP8[$6 + 2 >> 0] | 0; //@line 3080
 $14 = $13 & 255; //@line 3081
 $17 = HEAPU8[$6 + 3 >> 0] | 0; //@line 3084
 $18 = $0 + 60 | 0; //@line 3085
 $20 = (HEAP32[$18 >> 2] | 0) + $11 | 0; //@line 3087
 $23 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3090
 $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 3091
 $24 = FUNCTION_TABLE_ii[$23 & 31]($0) | 0; //@line 3092
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 121; //@line 3095
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 3097
  HEAP32[$AsyncCtx + 8 >> 2] = $17; //@line 3099
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 3101
  HEAP32[$AsyncCtx + 16 >> 2] = $2; //@line 3103
  HEAP8[$AsyncCtx + 20 >> 0] = $10; //@line 3105
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 3107
  HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 3109
  HEAP32[$AsyncCtx + 32 >> 2] = $8; //@line 3111
  HEAP8[$AsyncCtx + 36 >> 0] = $13; //@line 3113
  HEAP32[$AsyncCtx + 40 >> 2] = $18; //@line 3115
  HEAP32[$AsyncCtx + 44 >> 2] = $14; //@line 3117
  HEAP32[$AsyncCtx + 48 >> 2] = $0; //@line 3119
  HEAP32[$AsyncCtx + 52 >> 2] = $20; //@line 3121
  HEAP32[$AsyncCtx + 56 >> 2] = $11; //@line 3123
  sp = STACKTOP; //@line 3124
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3127
 if ($20 >>> 0 > $24 >>> 0) {
  HEAP32[$18 >> 2] = 0; //@line 3130
  $40 = $0 + 64 | 0; //@line 3131
  $42 = (HEAP32[$40 >> 2] | 0) + $14 | 0; //@line 3133
  HEAP32[$40 >> 2] = $42; //@line 3134
  $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3137
  $AsyncCtx3 = _emscripten_alloc_async_context(60, sp) | 0; //@line 3138
  $46 = FUNCTION_TABLE_ii[$45 & 31]($0) | 0; //@line 3139
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 122; //@line 3142
   HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 3144
   HEAP32[$AsyncCtx3 + 8 >> 2] = $42; //@line 3146
   HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 3148
   HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 3150
   HEAP8[$AsyncCtx3 + 20 >> 0] = $13; //@line 3152
   HEAP32[$AsyncCtx3 + 24 >> 2] = $40; //@line 3154
   HEAP32[$AsyncCtx3 + 28 >> 2] = $18; //@line 3156
   HEAP8[$AsyncCtx3 + 32 >> 0] = $10; //@line 3158
   HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 3160
   HEAP32[$AsyncCtx3 + 40 >> 2] = $2; //@line 3162
   HEAP32[$AsyncCtx3 + 44 >> 2] = $17; //@line 3164
   HEAP32[$AsyncCtx3 + 48 >> 2] = $1; //@line 3166
   HEAP32[$AsyncCtx3 + 52 >> 2] = $11; //@line 3168
   HEAP32[$AsyncCtx3 + 56 >> 2] = $14; //@line 3170
   sp = STACKTOP; //@line 3171
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3174
  $61 = HEAP32[$5 >> 2] | 0; //@line 3175
  if ($42 >>> 0 < ($46 - (HEAPU8[$61 + 2 >> 0] | 0) | 0) >>> 0) {
   $71 = $61; //@line 3182
  } else {
   HEAP32[$40 >> 2] = 0; //@line 3184
   $71 = $61; //@line 3185
  }
 } else {
  $71 = HEAP32[$5 >> 2] | 0; //@line 3189
 }
 $70 = $71 + ((Math_imul($3 + -32 | 0, $8) | 0) + 4) | 0; //@line 3194
 $72 = HEAP8[$70 >> 0] | 0; //@line 3195
 L15 : do {
  if ($13 << 24 >> 24) {
   if ($10 << 24 >> 24) {
    $$043$us = 0; //@line 3201
    L17 : while (1) {
     $77 = ($$043$us >>> 3 & 31) + 1 | 0; //@line 3205
     $79 = 1 << ($$043$us & 7); //@line 3207
     $80 = $$043$us + $2 | 0; //@line 3208
     $$04142$us = 0; //@line 3209
     while (1) {
      $87 = ($79 & (HEAPU8[$70 + ($77 + (Math_imul($$04142$us, $17) | 0)) >> 0] | 0) | 0) == 0; //@line 3217
      $90 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 3220
      $91 = $$04142$us + $1 | 0; //@line 3221
      if ($87) {
       $AsyncCtx11 = _emscripten_alloc_async_context(64, sp) | 0; //@line 3223
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 0); //@line 3224
       if (___async) {
        label = 18; //@line 3227
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3230
      } else {
       $AsyncCtx7 = _emscripten_alloc_async_context(64, sp) | 0; //@line 3232
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 1); //@line 3233
       if (___async) {
        label = 15; //@line 3236
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3239
      }
      $122 = $$04142$us + 1 | 0; //@line 3241
      if (($122 | 0) == ($11 | 0)) {
       break;
      } else {
       $$04142$us = $122; //@line 3246
      }
     }
     $123 = $$043$us + 1 | 0; //@line 3249
     if (($123 | 0) == ($14 | 0)) {
      break L15;
     } else {
      $$043$us = $123; //@line 3254
     }
    }
    if ((label | 0) == 15) {
     HEAP32[$AsyncCtx7 >> 2] = 123; //@line 3258
     HEAP32[$AsyncCtx7 + 4 >> 2] = $$04142$us; //@line 3260
     HEAP32[$AsyncCtx7 + 8 >> 2] = $11; //@line 3262
     HEAP32[$AsyncCtx7 + 12 >> 2] = $$043$us; //@line 3264
     HEAP32[$AsyncCtx7 + 16 >> 2] = $14; //@line 3266
     HEAP32[$AsyncCtx7 + 20 >> 2] = $17; //@line 3268
     HEAP32[$AsyncCtx7 + 24 >> 2] = $77; //@line 3270
     HEAP32[$AsyncCtx7 + 28 >> 2] = $70; //@line 3272
     HEAP32[$AsyncCtx7 + 32 >> 2] = $79; //@line 3274
     HEAP32[$AsyncCtx7 + 36 >> 2] = $0; //@line 3276
     HEAP32[$AsyncCtx7 + 40 >> 2] = $1; //@line 3278
     HEAP32[$AsyncCtx7 + 44 >> 2] = $0; //@line 3280
     HEAP32[$AsyncCtx7 + 48 >> 2] = $80; //@line 3282
     HEAP8[$AsyncCtx7 + 52 >> 0] = $72; //@line 3284
     HEAP32[$AsyncCtx7 + 56 >> 2] = $18; //@line 3286
     HEAP32[$AsyncCtx7 + 60 >> 2] = $2; //@line 3288
     sp = STACKTOP; //@line 3289
     return;
    } else if ((label | 0) == 18) {
     HEAP32[$AsyncCtx11 >> 2] = 124; //@line 3293
     HEAP32[$AsyncCtx11 + 4 >> 2] = $$04142$us; //@line 3295
     HEAP32[$AsyncCtx11 + 8 >> 2] = $11; //@line 3297
     HEAP32[$AsyncCtx11 + 12 >> 2] = $$043$us; //@line 3299
     HEAP32[$AsyncCtx11 + 16 >> 2] = $14; //@line 3301
     HEAP32[$AsyncCtx11 + 20 >> 2] = $17; //@line 3303
     HEAP32[$AsyncCtx11 + 24 >> 2] = $77; //@line 3305
     HEAP32[$AsyncCtx11 + 28 >> 2] = $70; //@line 3307
     HEAP32[$AsyncCtx11 + 32 >> 2] = $79; //@line 3309
     HEAP32[$AsyncCtx11 + 36 >> 2] = $0; //@line 3311
     HEAP32[$AsyncCtx11 + 40 >> 2] = $1; //@line 3313
     HEAP32[$AsyncCtx11 + 44 >> 2] = $0; //@line 3315
     HEAP32[$AsyncCtx11 + 48 >> 2] = $80; //@line 3317
     HEAP8[$AsyncCtx11 + 52 >> 0] = $72; //@line 3319
     HEAP32[$AsyncCtx11 + 56 >> 2] = $18; //@line 3321
     HEAP32[$AsyncCtx11 + 60 >> 2] = $2; //@line 3323
     sp = STACKTOP; //@line 3324
     return;
    }
   }
  }
 } while (0);
 HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + ($72 & 255); //@line 3333
 return;
}
function _mbed_vtracef__async_cb_45($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $2 = 0, $20 = 0, $24 = 0, $26 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $40 = 0, $44 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4993
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4995
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4997
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4999
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5001
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5003
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5005
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5007
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5013
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 5017
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 5019
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 5023
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 5025
 $34 = HEAP8[$0 + 68 >> 0] & 1; //@line 5028
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 5030
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 5034
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 5038
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 5042
 HEAP32[$10 >> 2] = HEAP32[___async_retval >> 2]; //@line 5045
 $50 = _snprintf($12, $14, 2157, $10) | 0; //@line 5046
 $$10 = ($50 | 0) >= ($14 | 0) ? 0 : $50; //@line 5048
 $53 = $12 + $$10 | 0; //@line 5050
 $54 = $14 - $$10 | 0; //@line 5051
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 5055
   $$3169 = $53; //@line 5055
   label = 4; //@line 5056
  }
 } else {
  $$3147168 = $14; //@line 5059
  $$3169 = $12; //@line 5059
  label = 4; //@line 5060
 }
 if ((label | 0) == 4) {
  $56 = $48 + -2 | 0; //@line 5063
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$44 >> 2] = $26; //@line 5069
    $$5156 = _snprintf($$3169, $$3147168, 2160, $44) | 0; //@line 5071
    break;
   }
  case 1:
   {
    HEAP32[$40 >> 2] = $26; //@line 5075
    $$5156 = _snprintf($$3169, $$3147168, 2175, $40) | 0; //@line 5077
    break;
   }
  case 3:
   {
    HEAP32[$36 >> 2] = $26; //@line 5081
    $$5156 = _snprintf($$3169, $$3147168, 2190, $36) | 0; //@line 5083
    break;
   }
  case 7:
   {
    HEAP32[$24 >> 2] = $26; //@line 5087
    $$5156 = _snprintf($$3169, $$3147168, 2205, $24) | 0; //@line 5089
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 2220, $20) | 0; //@line 5094
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 5098
  $67 = $$3169 + $$5156$ | 0; //@line 5100
  $68 = $$3147168 - $$5156$ | 0; //@line 5101
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 5105
   $70 = _vsnprintf($67, $68, $6, $8) | 0; //@line 5106
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 5109
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 5110
    HEAP32[$71 >> 2] = $2; //@line 5111
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 5112
    HEAP32[$72 >> 2] = $4; //@line 5113
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 5114
    HEAP32[$73 >> 2] = $68; //@line 5115
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 5116
    HEAP32[$74 >> 2] = $67; //@line 5117
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 5118
    HEAP32[$75 >> 2] = $30; //@line 5119
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 5120
    HEAP32[$76 >> 2] = $32; //@line 5121
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 5122
    $$expand_i1_val = $34 & 1; //@line 5123
    HEAP8[$77 >> 0] = $$expand_i1_val; //@line 5124
    sp = STACKTOP; //@line 5125
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 5129
   ___async_unwind = 0; //@line 5130
   HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 5131
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 5132
   HEAP32[$71 >> 2] = $2; //@line 5133
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 5134
   HEAP32[$72 >> 2] = $4; //@line 5135
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 5136
   HEAP32[$73 >> 2] = $68; //@line 5137
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 5138
   HEAP32[$74 >> 2] = $67; //@line 5139
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 5140
   HEAP32[$75 >> 2] = $30; //@line 5141
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 5142
   HEAP32[$76 >> 2] = $32; //@line 5143
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 5144
   $$expand_i1_val = $34 & 1; //@line 5145
   HEAP8[$77 >> 0] = $$expand_i1_val; //@line 5146
   sp = STACKTOP; //@line 5147
   return;
  }
 }
 $79 = HEAP32[91] | 0; //@line 5151
 $80 = HEAP32[84] | 0; //@line 5152
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 5153
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 5154
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 5157
  sp = STACKTOP; //@line 5158
  return;
 }
 ___async_unwind = 0; //@line 5161
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 5162
 sp = STACKTOP; //@line 5163
 return;
}
function _freopen($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$pre = 0, $11 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $32 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13224
 STACKTOP = STACKTOP + 32 | 0; //@line 13225
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 13225
 $vararg_buffer3 = sp + 16 | 0; //@line 13226
 $vararg_buffer = sp; //@line 13227
 $3 = ___fmodeflags($1) | 0; //@line 13228
 if ((HEAP32[$2 + 76 >> 2] | 0) > -1) {
  $11 = ___lockfile($2) | 0; //@line 13234
 } else {
  $11 = 0; //@line 13236
 }
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 13238
 _fflush($2) | 0; //@line 13239
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 181; //@line 13242
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13244
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 13246
  HEAP32[$AsyncCtx + 12 >> 2] = $11; //@line 13248
  HEAP32[$AsyncCtx + 16 >> 2] = $2; //@line 13250
  HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer3; //@line 13252
  HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer3; //@line 13254
  HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer; //@line 13256
  HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer; //@line 13258
  HEAP32[$AsyncCtx + 36 >> 2] = $1; //@line 13260
  sp = STACKTOP; //@line 13261
  STACKTOP = sp; //@line 13262
  return 0; //@line 13262
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13264
 do {
  if (!$0) {
   $$pre = $2 + 60 | 0; //@line 13270
   if ($3 & 524288 | 0) {
    HEAP32[$vararg_buffer >> 2] = HEAP32[$$pre >> 2]; //@line 13273
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 13275
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 13277
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 13278
   }
   HEAP32[$vararg_buffer3 >> 2] = HEAP32[$$pre >> 2]; //@line 13282
   HEAP32[$vararg_buffer3 + 4 >> 2] = 4; //@line 13284
   HEAP32[$vararg_buffer3 + 8 >> 2] = $3 & -524481; //@line 13286
   if ((___syscall_ret(___syscall221(221, $vararg_buffer3 | 0) | 0) | 0) < 0) {
    label = 21; //@line 13291
   } else {
    label = 16; //@line 13293
   }
  } else {
   $27 = _fopen($0, $1) | 0; //@line 13296
   if (!$27) {
    label = 21; //@line 13299
   } else {
    $29 = $27 + 60 | 0; //@line 13301
    $30 = HEAP32[$29 >> 2] | 0; //@line 13302
    $32 = HEAP32[$2 + 60 >> 2] | 0; //@line 13304
    if (($30 | 0) == ($32 | 0)) {
     HEAP32[$29 >> 2] = -1; //@line 13307
    } else {
     if ((___dup3($30, $32, $3 & 524288) | 0) < 0) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 13313
      _fclose($27) | 0; //@line 13314
      if (___async) {
       HEAP32[$AsyncCtx14 >> 2] = 183; //@line 13317
       HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 13319
       sp = STACKTOP; //@line 13320
       STACKTOP = sp; //@line 13321
       return 0; //@line 13321
      } else {
       _emscripten_free_async_context($AsyncCtx14 | 0); //@line 13323
       label = 21; //@line 13324
       break;
      }
     }
    }
    HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$27 >> 2]; //@line 13333
    HEAP32[$2 + 32 >> 2] = HEAP32[$27 + 32 >> 2]; //@line 13337
    HEAP32[$2 + 36 >> 2] = HEAP32[$27 + 36 >> 2]; //@line 13341
    HEAP32[$2 + 40 >> 2] = HEAP32[$27 + 40 >> 2]; //@line 13345
    HEAP32[$2 + 12 >> 2] = HEAP32[$27 + 12 >> 2]; //@line 13349
    $AsyncCtx18 = _emscripten_alloc_async_context(12, sp) | 0; //@line 13350
    _fclose($27) | 0; //@line 13351
    if (___async) {
     HEAP32[$AsyncCtx18 >> 2] = 182; //@line 13354
     HEAP32[$AsyncCtx18 + 4 >> 2] = $11; //@line 13356
     HEAP32[$AsyncCtx18 + 8 >> 2] = $2; //@line 13358
     sp = STACKTOP; //@line 13359
     STACKTOP = sp; //@line 13360
     return 0; //@line 13360
    } else {
     _emscripten_free_async_context($AsyncCtx18 | 0); //@line 13362
     label = 16; //@line 13363
     break;
    }
   }
  }
 } while (0);
 do {
  if ((label | 0) == 16) {
   if (!$11) {
    $$0 = $2; //@line 13373
   } else {
    ___unlockfile($2); //@line 13375
    $$0 = $2; //@line 13376
   }
  } else if ((label | 0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 13380
   _fclose($2) | 0; //@line 13381
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 184; //@line 13384
    HEAP32[$AsyncCtx10 + 4 >> 2] = $2; //@line 13386
    sp = STACKTOP; //@line 13387
    STACKTOP = sp; //@line 13388
    return 0; //@line 13388
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 13390
    $$0 = 0; //@line 13391
    break;
   }
  }
 } while (0);
 STACKTOP = sp; //@line 13396
 return $$0 | 0; //@line 13396
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9173
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9175
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9177
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9179
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9181
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 9184
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9186
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9188
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9190
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9192
 $20 = HEAP8[$0 + 40 >> 0] & 1; //@line 9195
 $22 = HEAP8[$0 + 41 >> 0] & 1; //@line 9198
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 9200
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 9202
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 9204
 L2 : do {
  if (!(HEAP8[$14 >> 0] | 0)) {
   do {
    if (!(HEAP8[$4 >> 0] | 0)) {
     $$182$off0 = $22; //@line 9213
     $$186$off0 = $20; //@line 9213
    } else {
     if (!(HEAP8[$2 >> 0] | 0)) {
      if (!(HEAP32[$16 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $20; //@line 9222
       $$283$off0 = 1; //@line 9222
       label = 13; //@line 9223
       break L2;
      } else {
       $$182$off0 = 1; //@line 9226
       $$186$off0 = $20; //@line 9226
       break;
      }
     }
     if ((HEAP32[$18 >> 2] | 0) == 1) {
      label = 18; //@line 9233
      break L2;
     }
     if (!(HEAP32[$16 >> 2] & 2)) {
      label = 18; //@line 9240
      break L2;
     } else {
      $$182$off0 = 1; //@line 9243
      $$186$off0 = 1; //@line 9243
     }
    }
   } while (0);
   $30 = $24 + 8 | 0; //@line 9247
   if ($30 >>> 0 < $12 >>> 0) {
    HEAP8[$2 >> 0] = 0; //@line 9250
    HEAP8[$4 >> 0] = 0; //@line 9251
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 9252
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $6, $8, $8, 1, $10); //@line 9253
    if (!___async) {
     ___async_unwind = 0; //@line 9256
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 206; //@line 9258
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 9260
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 9262
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 9264
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 9266
    HEAP8[$ReallocAsyncCtx5 + 20 >> 0] = $10 & 1; //@line 9269
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 9271
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 9273
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 9275
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 9277
    HEAP8[$ReallocAsyncCtx5 + 40 >> 0] = $$186$off0 & 1; //@line 9280
    HEAP8[$ReallocAsyncCtx5 + 41 >> 0] = $$182$off0 & 1; //@line 9283
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $30; //@line 9285
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 9287
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 9289
    sp = STACKTOP; //@line 9290
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 9293
    $$283$off0 = $$182$off0; //@line 9293
    label = 13; //@line 9294
   }
  } else {
   $$085$off0$reg2mem$0 = $20; //@line 9297
   $$283$off0 = $22; //@line 9297
   label = 13; //@line 9298
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$26 >> 2] = $8; //@line 9304
    $59 = $6 + 40 | 0; //@line 9305
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 9308
    if ((HEAP32[$6 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$18 >> 2] | 0) == 2) {
      HEAP8[$14 >> 0] = 1; //@line 9316
      if ($$283$off0) {
       label = 18; //@line 9318
       break;
      } else {
       $67 = 4; //@line 9321
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 9328
   } else {
    $67 = 4; //@line 9330
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 9335
 }
 HEAP32[$28 >> 2] = $67; //@line 9337
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5686
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5690
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5692
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5694
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5696
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5698
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5700
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5702
 $29 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5703
 if (($29 | 0) == ($4 | 0)) {
  $19 = HEAP32[(HEAP32[$6 >> 2] | 0) + 80 >> 2] | 0; //@line 5708
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5709
  FUNCTION_TABLE_vi[$19 & 255]($8); //@line 5710
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 5713
   $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 5714
   HEAP32[$20 >> 2] = $6; //@line 5715
   $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 5716
   HEAP32[$21 >> 2] = $8; //@line 5717
   $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 5718
   HEAP32[$22 >> 2] = $14; //@line 5719
   $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 5720
   HEAP32[$23 >> 2] = $16; //@line 5721
   $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 5722
   HEAP32[$24 >> 2] = $4; //@line 5723
   sp = STACKTOP; //@line 5724
   return;
  }
  ___async_unwind = 0; //@line 5727
  HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 5728
  $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 5729
  HEAP32[$20 >> 2] = $6; //@line 5730
  $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 5731
  HEAP32[$21 >> 2] = $8; //@line 5732
  $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 5733
  HEAP32[$22 >> 2] = $14; //@line 5734
  $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 5735
  HEAP32[$23 >> 2] = $16; //@line 5736
  $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 5737
  HEAP32[$24 >> 2] = $4; //@line 5738
  sp = STACKTOP; //@line 5739
  return;
 } else {
  $27 = HEAP32[(HEAP32[$10 >> 2] | 0) + 72 >> 2] | 0; //@line 5744
  $31 = HEAP8[$12 + $29 >> 0] | 0; //@line 5747
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 5748
  FUNCTION_TABLE_iii[$27 & 7]($8, $31) | 0; //@line 5749
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 5752
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 5753
   HEAP32[$32 >> 2] = $29; //@line 5754
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 5755
   HEAP32[$33 >> 2] = $4; //@line 5756
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 5757
   HEAP32[$34 >> 2] = $6; //@line 5758
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 5759
   HEAP32[$35 >> 2] = $8; //@line 5760
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 5761
   HEAP32[$36 >> 2] = $10; //@line 5762
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 5763
   HEAP32[$37 >> 2] = $12; //@line 5764
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 5765
   HEAP32[$38 >> 2] = $14; //@line 5766
   $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 5767
   HEAP32[$39 >> 2] = $16; //@line 5768
   sp = STACKTOP; //@line 5769
   return;
  }
  ___async_unwind = 0; //@line 5772
  HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 5773
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 5774
  HEAP32[$32 >> 2] = $29; //@line 5775
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 5776
  HEAP32[$33 >> 2] = $4; //@line 5777
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 5778
  HEAP32[$34 >> 2] = $6; //@line 5779
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 5780
  HEAP32[$35 >> 2] = $8; //@line 5781
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 5782
  HEAP32[$36 >> 2] = $10; //@line 5783
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 5784
  HEAP32[$37 >> 2] = $12; //@line 5785
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 5786
  HEAP32[$38 >> 2] = $14; //@line 5787
  $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 5788
  HEAP32[$39 >> 2] = $16; //@line 5789
  sp = STACKTOP; //@line 5790
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10709
      $10 = HEAP32[$9 >> 2] | 0; //@line 10710
      HEAP32[$2 >> 2] = $9 + 4; //@line 10712
      HEAP32[$0 >> 2] = $10; //@line 10713
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10729
      $17 = HEAP32[$16 >> 2] | 0; //@line 10730
      HEAP32[$2 >> 2] = $16 + 4; //@line 10732
      $20 = $0; //@line 10735
      HEAP32[$20 >> 2] = $17; //@line 10737
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 10740
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10756
      $30 = HEAP32[$29 >> 2] | 0; //@line 10757
      HEAP32[$2 >> 2] = $29 + 4; //@line 10759
      $31 = $0; //@line 10760
      HEAP32[$31 >> 2] = $30; //@line 10762
      HEAP32[$31 + 4 >> 2] = 0; //@line 10765
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10781
      $41 = $40; //@line 10782
      $43 = HEAP32[$41 >> 2] | 0; //@line 10784
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 10787
      HEAP32[$2 >> 2] = $40 + 8; //@line 10789
      $47 = $0; //@line 10790
      HEAP32[$47 >> 2] = $43; //@line 10792
      HEAP32[$47 + 4 >> 2] = $46; //@line 10795
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10811
      $57 = HEAP32[$56 >> 2] | 0; //@line 10812
      HEAP32[$2 >> 2] = $56 + 4; //@line 10814
      $59 = ($57 & 65535) << 16 >> 16; //@line 10816
      $62 = $0; //@line 10819
      HEAP32[$62 >> 2] = $59; //@line 10821
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 10824
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10840
      $72 = HEAP32[$71 >> 2] | 0; //@line 10841
      HEAP32[$2 >> 2] = $71 + 4; //@line 10843
      $73 = $0; //@line 10845
      HEAP32[$73 >> 2] = $72 & 65535; //@line 10847
      HEAP32[$73 + 4 >> 2] = 0; //@line 10850
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10866
      $83 = HEAP32[$82 >> 2] | 0; //@line 10867
      HEAP32[$2 >> 2] = $82 + 4; //@line 10869
      $85 = ($83 & 255) << 24 >> 24; //@line 10871
      $88 = $0; //@line 10874
      HEAP32[$88 >> 2] = $85; //@line 10876
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 10879
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10895
      $98 = HEAP32[$97 >> 2] | 0; //@line 10896
      HEAP32[$2 >> 2] = $97 + 4; //@line 10898
      $99 = $0; //@line 10900
      HEAP32[$99 >> 2] = $98 & 255; //@line 10902
      HEAP32[$99 + 4 >> 2] = 0; //@line 10905
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10921
      $109 = +HEAPF64[$108 >> 3]; //@line 10922
      HEAP32[$2 >> 2] = $108 + 8; //@line 10924
      HEAPF64[$0 >> 3] = $109; //@line 10925
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10941
      $116 = +HEAPF64[$115 >> 3]; //@line 10942
      HEAP32[$2 >> 2] = $115 + 8; //@line 10944
      HEAPF64[$0 >> 3] = $116; //@line 10945
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_93($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9017
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9019
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9021
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9023
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9025
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 9028
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9032
 $15 = $4 + 24 | 0; //@line 9033
 do {
  if ((HEAP32[$0 + 24 >> 2] | 0) > 1) {
   $18 = HEAP32[$4 + 8 >> 2] | 0; //@line 9038
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 9042
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 9049
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 9060
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 9061
      if (!___async) {
       ___async_unwind = 0; //@line 9064
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 210; //@line 9066
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 9068
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 9070
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 9072
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 9074
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 9076
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 9078
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 9080
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 9083
      sp = STACKTOP; //@line 9084
      return;
     }
     $36 = $2 + 24 | 0; //@line 9087
     $37 = $2 + 54 | 0; //@line 9088
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 9103
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 9104
     if (!___async) {
      ___async_unwind = 0; //@line 9107
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 209; //@line 9109
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 9111
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $14; //@line 9113
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 9115
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 9117
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 9119
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 9121
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 9123
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 9125
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 9128
     sp = STACKTOP; //@line 9129
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 9133
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 9137
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 9138
    if (!___async) {
     ___async_unwind = 0; //@line 9141
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 208; //@line 9143
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 9145
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $14; //@line 9147
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 9149
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 9151
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 9153
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 9155
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 9158
    sp = STACKTOP; //@line 9159
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
 sp = STACKTOP; //@line 1104
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 1109
 } else {
  $9 = $1 + 52 | 0; //@line 1111
  $10 = HEAP8[$9 >> 0] | 0; //@line 1112
  $11 = $1 + 53 | 0; //@line 1113
  $12 = HEAP8[$11 >> 0] | 0; //@line 1114
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 1117
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 1118
  HEAP8[$9 >> 0] = 0; //@line 1119
  HEAP8[$11 >> 0] = 0; //@line 1120
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 1121
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 1122
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 204; //@line 1125
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 1127
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1129
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 1131
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 1133
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 1135
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 1137
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 1139
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 1141
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 1143
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 1145
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 1148
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 1150
   sp = STACKTOP; //@line 1151
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1154
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 1159
    $32 = $0 + 8 | 0; //@line 1160
    $33 = $1 + 54 | 0; //@line 1161
    $$0 = $0 + 24 | 0; //@line 1162
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
     HEAP8[$9 >> 0] = 0; //@line 1195
     HEAP8[$11 >> 0] = 0; //@line 1196
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 1197
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 1198
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1203
     $62 = $$0 + 8 | 0; //@line 1204
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 1207
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 205; //@line 1212
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 1214
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 1216
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 1218
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 1220
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 1222
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 1224
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 1226
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 1228
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 1230
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 1232
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 1234
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 1236
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 1238
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 1241
    sp = STACKTOP; //@line 1242
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 1246
  HEAP8[$11 >> 0] = $12; //@line 1247
 }
 return;
}
function _print_error_report($0) {
 $0 = $0 | 0;
 var $1 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $6 = 0, $vararg_buffer = 0, $vararg_buffer11 = 0, $vararg_buffer14 = 0, $vararg_buffer17 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer26 = 0, $vararg_buffer29 = 0, $vararg_buffer32 = 0, $vararg_buffer35 = 0, $vararg_buffer38 = 0, $vararg_buffer45 = 0, $vararg_buffer5 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 2420
 STACKTOP = STACKTOP + 144 | 0; //@line 2421
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 2421
 $vararg_buffer45 = sp + 136 | 0; //@line 2422
 $vararg_buffer38 = sp + 112 | 0; //@line 2423
 $vararg_buffer35 = sp + 104 | 0; //@line 2424
 $vararg_buffer32 = sp + 96 | 0; //@line 2425
 $vararg_buffer29 = sp + 88 | 0; //@line 2426
 $vararg_buffer26 = sp + 80 | 0; //@line 2427
 $vararg_buffer23 = sp + 72 | 0; //@line 2428
 $vararg_buffer20 = sp + 64 | 0; //@line 2429
 $vararg_buffer17 = sp + 56 | 0; //@line 2430
 $vararg_buffer14 = sp + 48 | 0; //@line 2431
 $vararg_buffer11 = sp + 40 | 0; //@line 2432
 $vararg_buffer8 = sp + 32 | 0; //@line 2433
 $vararg_buffer5 = sp + 24 | 0; //@line 2434
 $vararg_buffer = sp; //@line 2436
 $1 = HEAP32[2343] | 0; //@line 2437
 $6 = ($1 & 1610612736 | 0) == 1610612736 ? 0 - $1 | 0 : $1 & 65535; //@line 2442
 HEAP32[$vararg_buffer >> 2] = $1; //@line 2445
 HEAP32[$vararg_buffer + 4 >> 2] = $6; //@line 2447
 HEAP32[$vararg_buffer + 8 >> 2] = $1 >>> 16 & 255; //@line 2449
 _mbed_error_printf(2525, $vararg_buffer); //@line 2450
 if (($6 + -317 | 0) >>> 0 < 4) {
  _mbed_error_printf($0, sp + 16 | 0); //@line 2454
  HEAP32[$vararg_buffer5 >> 2] = HEAP32[2345]; //@line 2456
  _mbed_error_printf(2606, $vararg_buffer5); //@line 2457
  _mbed_error_printf(2868, $vararg_buffer45); //@line 2458
  STACKTOP = sp; //@line 2459
  return;
 }
 switch ($6 | 0) {
 case 305:
  {
   HEAP32[$vararg_buffer8 >> 2] = HEAP32[2345]; //@line 2464
   _mbed_error_printf(2623, $vararg_buffer8); //@line 2465
   break;
  }
 case 306:
  {
   HEAP32[$vararg_buffer11 >> 2] = HEAP32[2345]; //@line 2470
   _mbed_error_printf(2644, $vararg_buffer11); //@line 2471
   break;
  }
 case 307:
  {
   HEAP32[$vararg_buffer14 >> 2] = HEAP32[2345]; //@line 2476
   _mbed_error_printf(2659, $vararg_buffer14); //@line 2477
   break;
  }
 case 308:
  {
   HEAP32[$vararg_buffer17 >> 2] = HEAP32[2345]; //@line 2482
   _mbed_error_printf(2673, $vararg_buffer17); //@line 2483
   break;
  }
 case 309:
  {
   HEAP32[$vararg_buffer20 >> 2] = HEAP32[2345]; //@line 2488
   _mbed_error_printf(2691, $vararg_buffer20); //@line 2489
   break;
  }
 case 311:
  {
   HEAP32[$vararg_buffer23 >> 2] = HEAP32[2345]; //@line 2494
   _mbed_error_printf(2710, $vararg_buffer23); //@line 2495
   break;
  }
 case 310:
  {
   HEAP32[$vararg_buffer26 >> 2] = HEAP32[2345]; //@line 2500
   _mbed_error_printf(2729, $vararg_buffer26); //@line 2501
   break;
  }
 case 312:
  {
   HEAP32[$vararg_buffer29 >> 2] = HEAP32[2345]; //@line 2506
   _mbed_error_printf(2743, $vararg_buffer29); //@line 2507
   break;
  }
 default:
  {}
 }
 HEAP32[$vararg_buffer32 >> 2] = 0; //@line 2513
 _mbed_error_printf($0, $vararg_buffer32); //@line 2514
 HEAP32[$vararg_buffer35 >> 2] = HEAP32[2344]; //@line 2516
 _mbed_error_printf(2764, $vararg_buffer35); //@line 2517
 $22 = HEAP32[2346] | 0; //@line 2519
 $23 = HEAP32[2347] | 0; //@line 2520
 $24 = HEAP32[2348] | 0; //@line 2521
 $25 = HEAP32[2349] | 0; //@line 2522
 HEAP32[$vararg_buffer38 >> 2] = HEAP32[2345]; //@line 2523
 HEAP32[$vararg_buffer38 + 4 >> 2] = $22; //@line 2525
 HEAP32[$vararg_buffer38 + 8 >> 2] = $23; //@line 2527
 HEAP32[$vararg_buffer38 + 12 >> 2] = $24; //@line 2529
 HEAP32[$vararg_buffer38 + 16 >> 2] = $25; //@line 2531
 _mbed_error_printf(2780, $vararg_buffer38); //@line 2532
 _mbed_error_printf(2868, $vararg_buffer45); //@line 2533
 STACKTOP = sp; //@line 2534
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5798
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5800
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5802
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5804
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5806
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5808
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5810
 if (($AsyncRetVal | 0) <= 0) {
  $15 = HEAP32[(HEAP32[$4 >> 2] | 0) + 80 >> 2] | 0; //@line 5815
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5816
  FUNCTION_TABLE_vi[$15 & 255]($2); //@line 5817
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 5820
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 5821
   HEAP32[$16 >> 2] = $4; //@line 5822
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 5823
   HEAP32[$17 >> 2] = $2; //@line 5824
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 5825
   HEAP32[$18 >> 2] = $6; //@line 5826
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 5827
   HEAP32[$19 >> 2] = $8; //@line 5828
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 5829
   HEAP32[$20 >> 2] = $AsyncRetVal; //@line 5830
   sp = STACKTOP; //@line 5831
   return;
  }
  ___async_unwind = 0; //@line 5834
  HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 5835
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 5836
  HEAP32[$16 >> 2] = $4; //@line 5837
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 5838
  HEAP32[$17 >> 2] = $2; //@line 5839
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 5840
  HEAP32[$18 >> 2] = $6; //@line 5841
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 5842
  HEAP32[$19 >> 2] = $8; //@line 5843
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 5844
  HEAP32[$20 >> 2] = $AsyncRetVal; //@line 5845
  sp = STACKTOP; //@line 5846
  return;
 }
 $23 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 5851
 $25 = HEAP8[$10 >> 0] | 0; //@line 5853
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 5854
 FUNCTION_TABLE_iii[$23 & 7]($2, $25) | 0; //@line 5855
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 5858
  $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 5859
  HEAP32[$26 >> 2] = 0; //@line 5860
  $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 5861
  HEAP32[$27 >> 2] = $AsyncRetVal; //@line 5862
  $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 5863
  HEAP32[$28 >> 2] = $4; //@line 5864
  $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 5865
  HEAP32[$29 >> 2] = $2; //@line 5866
  $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 5867
  HEAP32[$30 >> 2] = $2; //@line 5868
  $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 5869
  HEAP32[$31 >> 2] = $10; //@line 5870
  $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 5871
  HEAP32[$32 >> 2] = $6; //@line 5872
  $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 5873
  HEAP32[$33 >> 2] = $8; //@line 5874
  sp = STACKTOP; //@line 5875
  return;
 }
 ___async_unwind = 0; //@line 5878
 HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 5879
 $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 5880
 HEAP32[$26 >> 2] = 0; //@line 5881
 $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 5882
 HEAP32[$27 >> 2] = $AsyncRetVal; //@line 5883
 $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 5884
 HEAP32[$28 >> 2] = $4; //@line 5885
 $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 5886
 HEAP32[$29 >> 2] = $2; //@line 5887
 $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 5888
 HEAP32[$30 >> 2] = $2; //@line 5889
 $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 5890
 HEAP32[$31 >> 2] = $10; //@line 5891
 $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 5892
 HEAP32[$32 >> 2] = $6; //@line 5893
 $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 5894
 HEAP32[$33 >> 2] = $8; //@line 5895
 sp = STACKTOP; //@line 5896
 return;
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $$03 = 0, $13 = 0, $14 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $35 = 0, $36 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4330
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 112 >> 2] | 0; //@line 4333
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4334
 FUNCTION_TABLE_viii[$3 & 3]($0, 0, 0); //@line 4335
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 153; //@line 4338
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4340
  sp = STACKTOP; //@line 4341
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4344
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4347
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4348
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 4349
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 154; //@line 4352
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 4354
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 4356
  sp = STACKTOP; //@line 4357
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4360
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4363
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4364
 $14 = FUNCTION_TABLE_ii[$13 & 31]($0) | 0; //@line 4365
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 155; //@line 4368
  HEAP32[$AsyncCtx5 + 4 >> 2] = $8; //@line 4370
  HEAP32[$AsyncCtx5 + 8 >> 2] = $0; //@line 4372
  HEAP32[$AsyncCtx5 + 12 >> 2] = $0; //@line 4374
  sp = STACKTOP; //@line 4375
  return;
 }
 _emscripten_free_async_context($AsyncCtx5 | 0); //@line 4378
 if ((Math_imul($14, $8) | 0) <= 0) {
  return;
 }
 $$03 = 0; //@line 4384
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4386
  __ZN4mbed6Stream4putcEi($0, 32) | 0; //@line 4387
  if (___async) {
   label = 11; //@line 4390
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 4393
  $24 = $$03 + 1 | 0; //@line 4394
  $27 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4397
  $AsyncCtx9 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4398
  $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 4399
  if (___async) {
   label = 13; //@line 4402
   break;
  }
  _emscripten_free_async_context($AsyncCtx9 | 0); //@line 4405
  $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4408
  $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4409
  $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 4410
  if (___async) {
   label = 15; //@line 4413
   break;
  }
  _emscripten_free_async_context($AsyncCtx12 | 0); //@line 4416
  if (($24 | 0) < (Math_imul($36, $28) | 0)) {
   $$03 = $24; //@line 4420
  } else {
   label = 9; //@line 4422
   break;
  }
 }
 if ((label | 0) == 9) {
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 156; //@line 4430
  HEAP32[$AsyncCtx16 + 4 >> 2] = $$03; //@line 4432
  HEAP32[$AsyncCtx16 + 8 >> 2] = $0; //@line 4434
  HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 4436
  HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 4438
  sp = STACKTOP; //@line 4439
  return;
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx9 >> 2] = 157; //@line 4443
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 4445
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 4447
  HEAP32[$AsyncCtx9 + 12 >> 2] = $24; //@line 4449
  HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 4451
  sp = STACKTOP; //@line 4452
  return;
 } else if ((label | 0) == 15) {
  HEAP32[$AsyncCtx12 >> 2] = 158; //@line 4456
  HEAP32[$AsyncCtx12 + 4 >> 2] = $28; //@line 4458
  HEAP32[$AsyncCtx12 + 8 >> 2] = $24; //@line 4460
  HEAP32[$AsyncCtx12 + 12 >> 2] = $0; //@line 4462
  HEAP32[$AsyncCtx12 + 16 >> 2] = $0; //@line 4464
  HEAP32[$AsyncCtx12 + 20 >> 2] = $0; //@line 4466
  sp = STACKTOP; //@line 4467
  return;
 }
}
function __ZN11TextDisplay5_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $12 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $25 = 0, $31 = 0, $32 = 0, $35 = 0, $36 = 0, $45 = 0, $46 = 0, $49 = 0, $5 = 0, $50 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4146
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 4147
 if (($1 | 0) == 10) {
  HEAP16[$0 + 24 >> 1] = 0; //@line 4151
  $5 = $0 + 26 | 0; //@line 4152
  $7 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 4154
  HEAP16[$5 >> 1] = $7; //@line 4155
  $8 = $7 & 65535; //@line 4156
  $11 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4159
  $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4160
  $12 = FUNCTION_TABLE_ii[$11 & 31]($0) | 0; //@line 4161
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 147; //@line 4164
   HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 4166
   HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 4168
   HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 4170
   sp = STACKTOP; //@line 4171
   return 0; //@line 4172
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4174
  if (($12 | 0) > ($8 | 0)) {
   return $1 | 0; //@line 4177
  }
  HEAP16[$5 >> 1] = 0; //@line 4179
  return $1 | 0; //@line 4180
 }
 $19 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 4184
 $20 = $0 + 24 | 0; //@line 4185
 $22 = HEAPU16[$20 >> 1] | 0; //@line 4187
 $23 = $0 + 26 | 0; //@line 4188
 $25 = HEAPU16[$23 >> 1] | 0; //@line 4190
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4191
 FUNCTION_TABLE_viiii[$19 & 7]($0, $22, $25, $1); //@line 4192
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 148; //@line 4195
  HEAP32[$AsyncCtx3 + 4 >> 2] = $20; //@line 4197
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4199
  HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 4201
  HEAP32[$AsyncCtx3 + 16 >> 2] = $23; //@line 4203
  sp = STACKTOP; //@line 4204
  return 0; //@line 4205
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4207
 $31 = (HEAP16[$20 >> 1] | 0) + 1 << 16 >> 16; //@line 4209
 HEAP16[$20 >> 1] = $31; //@line 4210
 $32 = $31 & 65535; //@line 4211
 $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4214
 $AsyncCtx6 = _emscripten_alloc_async_context(28, sp) | 0; //@line 4215
 $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 4216
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 149; //@line 4219
  HEAP32[$AsyncCtx6 + 4 >> 2] = $32; //@line 4221
  HEAP32[$AsyncCtx6 + 8 >> 2] = $1; //@line 4223
  HEAP32[$AsyncCtx6 + 12 >> 2] = $20; //@line 4225
  HEAP32[$AsyncCtx6 + 16 >> 2] = $23; //@line 4227
  HEAP32[$AsyncCtx6 + 20 >> 2] = $0; //@line 4229
  HEAP32[$AsyncCtx6 + 24 >> 2] = $0; //@line 4231
  sp = STACKTOP; //@line 4232
  return 0; //@line 4233
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4235
 if (($36 | 0) > ($32 | 0)) {
  return $1 | 0; //@line 4238
 }
 HEAP16[$20 >> 1] = 0; //@line 4240
 $45 = (HEAP16[$23 >> 1] | 0) + 1 << 16 >> 16; //@line 4242
 HEAP16[$23 >> 1] = $45; //@line 4243
 $46 = $45 & 65535; //@line 4244
 $49 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4247
 $AsyncCtx10 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4248
 $50 = FUNCTION_TABLE_ii[$49 & 31]($0) | 0; //@line 4249
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 150; //@line 4252
  HEAP32[$AsyncCtx10 + 4 >> 2] = $46; //@line 4254
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 4256
  HEAP32[$AsyncCtx10 + 12 >> 2] = $23; //@line 4258
  sp = STACKTOP; //@line 4259
  return 0; //@line 4260
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 4262
 if (($50 | 0) > ($46 | 0)) {
  return $1 | 0; //@line 4265
 }
 HEAP16[$23 >> 1] = 0; //@line 4267
 return $1 | 0; //@line 4268
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9609
 STACKTOP = STACKTOP + 224 | 0; //@line 9610
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 9610
 $3 = sp + 120 | 0; //@line 9611
 $4 = sp + 80 | 0; //@line 9612
 $5 = sp; //@line 9613
 $6 = sp + 136 | 0; //@line 9614
 dest = $4; //@line 9615
 stop = dest + 40 | 0; //@line 9615
 do {
  HEAP32[dest >> 2] = 0; //@line 9615
  dest = dest + 4 | 0; //@line 9615
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 9617
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 9621
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 9628
  } else {
   $43 = 0; //@line 9630
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 9632
  $14 = $13 & 32; //@line 9633
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 9639
  }
  $19 = $0 + 48 | 0; //@line 9641
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 9646
    $24 = HEAP32[$23 >> 2] | 0; //@line 9647
    HEAP32[$23 >> 2] = $6; //@line 9648
    $25 = $0 + 28 | 0; //@line 9649
    HEAP32[$25 >> 2] = $6; //@line 9650
    $26 = $0 + 20 | 0; //@line 9651
    HEAP32[$26 >> 2] = $6; //@line 9652
    HEAP32[$19 >> 2] = 80; //@line 9653
    $28 = $0 + 16 | 0; //@line 9655
    HEAP32[$28 >> 2] = $6 + 80; //@line 9656
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9657
    if (!$24) {
     $$1 = $29; //@line 9660
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 9663
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 9664
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 9665
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 176; //@line 9668
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 9670
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 9672
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 9674
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 9676
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 9678
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 9680
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 9682
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 9684
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 9686
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 9688
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 9690
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 9692
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 9694
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 9696
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 9698
      sp = STACKTOP; //@line 9699
      STACKTOP = sp; //@line 9700
      return 0; //@line 9700
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9702
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 9705
      HEAP32[$23 >> 2] = $24; //@line 9706
      HEAP32[$19 >> 2] = 0; //@line 9707
      HEAP32[$28 >> 2] = 0; //@line 9708
      HEAP32[$25 >> 2] = 0; //@line 9709
      HEAP32[$26 >> 2] = 0; //@line 9710
      $$1 = $$; //@line 9711
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9717
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 9720
  HEAP32[$0 >> 2] = $51 | $14; //@line 9725
  if ($43 | 0) {
   ___unlockfile($0); //@line 9728
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 9730
 }
 STACKTOP = sp; //@line 9732
 return $$0 | 0; //@line 9732
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 639
 STACKTOP = STACKTOP + 64 | 0; //@line 640
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 640
 $4 = sp; //@line 641
 $5 = HEAP32[$0 >> 2] | 0; //@line 642
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 645
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 647
 HEAP32[$4 >> 2] = $2; //@line 648
 HEAP32[$4 + 4 >> 2] = $0; //@line 650
 HEAP32[$4 + 8 >> 2] = $1; //@line 652
 HEAP32[$4 + 12 >> 2] = $3; //@line 654
 $14 = $4 + 16 | 0; //@line 655
 $15 = $4 + 20 | 0; //@line 656
 $16 = $4 + 24 | 0; //@line 657
 $17 = $4 + 28 | 0; //@line 658
 $18 = $4 + 32 | 0; //@line 659
 $19 = $4 + 40 | 0; //@line 660
 dest = $14; //@line 661
 stop = dest + 36 | 0; //@line 661
 do {
  HEAP32[dest >> 2] = 0; //@line 661
  dest = dest + 4 | 0; //@line 661
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 661
 HEAP8[$14 + 38 >> 0] = 0; //@line 661
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 666
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 669
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 670
   FUNCTION_TABLE_viiiiii[$24 & 7]($10, $4, $8, $8, 1, 0); //@line 671
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 196; //@line 674
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 676
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 678
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 680
    sp = STACKTOP; //@line 681
    STACKTOP = sp; //@line 682
    return 0; //@line 682
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 684
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 688
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 692
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 695
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 696
   FUNCTION_TABLE_viiiii[$33 & 7]($10, $4, $8, 1, 0); //@line 697
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 197; //@line 700
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 702
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 704
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 706
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 708
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 710
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 712
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 714
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 716
    sp = STACKTOP; //@line 717
    STACKTOP = sp; //@line 718
    return 0; //@line 718
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 720
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 734
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 742
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 758
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 763
  }
 } while (0);
 STACKTOP = sp; //@line 766
 return $$0 | 0; //@line 766
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 9481
 $7 = ($2 | 0) != 0; //@line 9485
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 9489
   $$03555 = $0; //@line 9490
   $$03654 = $2; //@line 9490
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 9495
     $$036$lcssa64 = $$03654; //@line 9495
     label = 6; //@line 9496
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 9499
    $12 = $$03654 + -1 | 0; //@line 9500
    $16 = ($12 | 0) != 0; //@line 9504
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 9507
     $$03654 = $12; //@line 9507
    } else {
     $$035$lcssa = $11; //@line 9509
     $$036$lcssa = $12; //@line 9509
     $$lcssa = $16; //@line 9509
     label = 5; //@line 9510
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 9515
   $$036$lcssa = $2; //@line 9515
   $$lcssa = $7; //@line 9515
   label = 5; //@line 9516
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 9521
   $$036$lcssa64 = $$036$lcssa; //@line 9521
   label = 6; //@line 9522
  } else {
   $$2 = $$035$lcssa; //@line 9524
   $$3 = 0; //@line 9524
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 9530
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 9533
    $$3 = $$036$lcssa64; //@line 9533
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 9535
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 9539
      $$13745 = $$036$lcssa64; //@line 9539
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 9542
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 9551
       $30 = $$13745 + -4 | 0; //@line 9552
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 9555
        $$13745 = $30; //@line 9555
       } else {
        $$0$lcssa = $29; //@line 9557
        $$137$lcssa = $30; //@line 9557
        label = 11; //@line 9558
        break L11;
       }
      }
      $$140 = $$046; //@line 9562
      $$23839 = $$13745; //@line 9562
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 9564
      $$137$lcssa = $$036$lcssa64; //@line 9564
      label = 11; //@line 9565
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 9571
      $$3 = 0; //@line 9571
      break;
     } else {
      $$140 = $$0$lcssa; //@line 9574
      $$23839 = $$137$lcssa; //@line 9574
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 9581
      $$3 = $$23839; //@line 9581
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 9584
     $$23839 = $$23839 + -1 | 0; //@line 9585
     if (!$$23839) {
      $$2 = $35; //@line 9588
      $$3 = 0; //@line 9588
      break;
     } else {
      $$140 = $35; //@line 9591
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 9599
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 9252
 do {
  if (!$0) {
   do {
    if (!(HEAP32[341] | 0)) {
     $34 = 0; //@line 9260
    } else {
     $12 = HEAP32[341] | 0; //@line 9262
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9263
     $13 = _fflush($12) | 0; //@line 9264
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 172; //@line 9267
      sp = STACKTOP; //@line 9268
      return 0; //@line 9269
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 9271
      $34 = $13; //@line 9272
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 9278
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 9282
    } else {
     $$02327 = $$02325; //@line 9284
     $$02426 = $34; //@line 9284
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 9291
      } else {
       $28 = 0; //@line 9293
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9301
       $25 = ___fflush_unlocked($$02327) | 0; //@line 9302
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 9307
       $$1 = $25 | $$02426; //@line 9309
      } else {
       $$1 = $$02426; //@line 9311
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 9315
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 9318
      if (!$$023) {
       $$024$lcssa = $$1; //@line 9321
       break L9;
      } else {
       $$02327 = $$023; //@line 9324
       $$02426 = $$1; //@line 9324
      }
     }
     HEAP32[$AsyncCtx >> 2] = 173; //@line 9327
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 9329
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 9331
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 9333
     sp = STACKTOP; //@line 9334
     return 0; //@line 9335
    }
   } while (0);
   ___ofl_unlock(); //@line 9338
   $$0 = $$024$lcssa; //@line 9339
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9345
    $5 = ___fflush_unlocked($0) | 0; //@line 9346
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 170; //@line 9349
     sp = STACKTOP; //@line 9350
     return 0; //@line 9351
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 9353
     $$0 = $5; //@line 9354
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 9359
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 9360
   $7 = ___fflush_unlocked($0) | 0; //@line 9361
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 171; //@line 9364
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 9367
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9369
    sp = STACKTOP; //@line 9370
    return 0; //@line 9371
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9373
   if ($phitmp) {
    $$0 = $7; //@line 9375
   } else {
    ___unlockfile($0); //@line 9377
    $$0 = $7; //@line 9378
   }
  }
 } while (0);
 return $$0 | 0; //@line 9382
}
function _mbed_vtracef__async_cb_50($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5323
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5325
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5327
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5329
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5333
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5335
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 5338
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5340
 $$13 = ($AsyncRetVal | 0) >= ($6 | 0) ? 0 : $AsyncRetVal; //@line 5342
 $18 = (HEAP32[$0 + 16 >> 2] | 0) + $$13 | 0; //@line 5344
 $19 = $6 - $$13 | 0; //@line 5345
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[90] | 0; //@line 5349
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $14 ^ 1) {
     break;
    }
    _snprintf($18, $19, 2235, $10) | 0; //@line 5361
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 5364
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 5365
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 46; //@line 5368
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 5369
    HEAP32[$24 >> 2] = $2; //@line 5370
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 5371
    HEAP32[$25 >> 2] = $18; //@line 5372
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 5373
    HEAP32[$26 >> 2] = $19; //@line 5374
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 5375
    HEAP32[$27 >> 2] = $4; //@line 5376
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 5377
    $$expand_i1_val = $14 & 1; //@line 5378
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 5379
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 5380
    HEAP32[$29 >> 2] = $10; //@line 5381
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 5382
    HEAP32[$30 >> 2] = $12; //@line 5383
    sp = STACKTOP; //@line 5384
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 5388
   ___async_unwind = 0; //@line 5389
   HEAP32[$ReallocAsyncCtx6 >> 2] = 46; //@line 5390
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 5391
   HEAP32[$24 >> 2] = $2; //@line 5392
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 5393
   HEAP32[$25 >> 2] = $18; //@line 5394
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 5395
   HEAP32[$26 >> 2] = $19; //@line 5396
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 5397
   HEAP32[$27 >> 2] = $4; //@line 5398
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 5399
   $$expand_i1_val = $14 & 1; //@line 5400
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 5401
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 5402
   HEAP32[$29 >> 2] = $10; //@line 5403
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 5404
   HEAP32[$30 >> 2] = $12; //@line 5405
   sp = STACKTOP; //@line 5406
   return;
  }
 } while (0);
 $34 = HEAP32[91] | 0; //@line 5410
 $35 = HEAP32[84] | 0; //@line 5411
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 5412
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 5413
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 5416
  sp = STACKTOP; //@line 5417
  return;
 }
 ___async_unwind = 0; //@line 5420
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 5421
 sp = STACKTOP; //@line 5422
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 821
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 827
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 833
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 836
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 837
    FUNCTION_TABLE_viiiii[$53 & 7]($50, $1, $2, $3, $4); //@line 838
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 200; //@line 841
     sp = STACKTOP; //@line 842
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 845
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 853
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 858
     $19 = $1 + 44 | 0; //@line 859
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 865
     HEAP8[$22 >> 0] = 0; //@line 866
     $23 = $1 + 53 | 0; //@line 867
     HEAP8[$23 >> 0] = 0; //@line 868
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 870
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 873
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 874
     FUNCTION_TABLE_viiiiii[$28 & 7]($25, $1, $2, $2, 1, $4); //@line 875
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 199; //@line 878
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 880
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 882
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 884
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 886
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 888
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 890
      sp = STACKTOP; //@line 891
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 894
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 898
      label = 13; //@line 899
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 904
       label = 13; //@line 905
      } else {
       $$037$off039 = 3; //@line 907
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 911
      $39 = $1 + 40 | 0; //@line 912
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 915
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 925
        $$037$off039 = $$037$off038; //@line 926
       } else {
        $$037$off039 = $$037$off038; //@line 928
       }
      } else {
       $$037$off039 = $$037$off038; //@line 931
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 934
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 941
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_51($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5432
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5434
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5436
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5438
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5440
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5442
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5444
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5446
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5448
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5450
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5452
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5454
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 5456
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 5458
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 5460
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 5462
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 5464
 $34 = HEAP8[$0 + 68 >> 0] & 1; //@line 5467
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 5469
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 5471
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 5473
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 5475
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 5477
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 5479
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 5481
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 5483
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 5489
 $56 = HEAP32[89] | 0; //@line 5490
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 5491
 $57 = FUNCTION_TABLE_ii[$56 & 31]($55) | 0; //@line 5492
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 5496
  ___async_unwind = 0; //@line 5497
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 5499
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 5501
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 5503
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 5505
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 5507
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 5509
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 5511
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 5513
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 5515
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 5517
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 5519
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 5521
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 5523
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 5525
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 5527
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 5529
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 5531
 HEAP8[$ReallocAsyncCtx5 + 68 >> 0] = $34 & 1; //@line 5534
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 5536
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 5538
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 5540
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 5542
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $44; //@line 5544
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 5546
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $48; //@line 5548
 sp = STACKTOP; //@line 5549
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_39($0) {
 $0 = $0 | 0;
 var $$016$lcssa = 0, $10 = 0, $12 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4215
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4217
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4219
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4221
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4223
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4225
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4227
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4229
 if (($AsyncRetVal | 0) == -1) {
  $$016$lcssa = $4; //@line 4232
 } else {
  $20 = $4 + 1 | 0; //@line 4235
  HEAP8[$4 >> 0] = $AsyncRetVal; //@line 4236
  if (($20 | 0) == ($6 | 0)) {
   $$016$lcssa = $6; //@line 4239
  } else {
   $16 = HEAP32[(HEAP32[$12 >> 2] | 0) + 76 >> 2] | 0; //@line 4243
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 4244
   $17 = FUNCTION_TABLE_ii[$16 & 31]($10) | 0; //@line 4245
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 4248
    $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 4249
    HEAP32[$18 >> 2] = $2; //@line 4250
    $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 4251
    HEAP32[$19 >> 2] = $20; //@line 4252
    $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 4253
    HEAP32[$21 >> 2] = $6; //@line 4254
    $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 4255
    HEAP32[$22 >> 2] = $8; //@line 4256
    $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 4257
    HEAP32[$23 >> 2] = $10; //@line 4258
    $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 4259
    HEAP32[$24 >> 2] = $12; //@line 4260
    sp = STACKTOP; //@line 4261
    return;
   }
   HEAP32[___async_retval >> 2] = $17; //@line 4265
   ___async_unwind = 0; //@line 4266
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 4267
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 4268
   HEAP32[$18 >> 2] = $2; //@line 4269
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 4270
   HEAP32[$19 >> 2] = $20; //@line 4271
   $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 4272
   HEAP32[$21 >> 2] = $6; //@line 4273
   $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 4274
   HEAP32[$22 >> 2] = $8; //@line 4275
   $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 4276
   HEAP32[$23 >> 2] = $10; //@line 4277
   $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 4278
   HEAP32[$24 >> 2] = $12; //@line 4279
   sp = STACKTOP; //@line 4280
   return;
  }
 }
 $31 = HEAP32[(HEAP32[$8 >> 2] | 0) + 88 >> 2] | 0; //@line 4286
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 4287
 FUNCTION_TABLE_vi[$31 & 255]($10); //@line 4288
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 4291
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 4292
  HEAP32[$32 >> 2] = $$016$lcssa; //@line 4293
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 4294
  HEAP32[$33 >> 2] = $2; //@line 4295
  sp = STACKTOP; //@line 4296
  return;
 }
 ___async_unwind = 0; //@line 4299
 HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 4300
 $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 4301
 HEAP32[$32 >> 2] = $$016$lcssa; //@line 4302
 $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 4303
 HEAP32[$33 >> 2] = $2; //@line 4304
 sp = STACKTOP; //@line 4305
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 133
 STACKTOP = STACKTOP + 48 | 0; //@line 134
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 134
 $vararg_buffer10 = sp + 32 | 0; //@line 135
 $vararg_buffer7 = sp + 24 | 0; //@line 136
 $vararg_buffer3 = sp + 16 | 0; //@line 137
 $vararg_buffer = sp; //@line 138
 $0 = sp + 36 | 0; //@line 139
 $1 = ___cxa_get_globals_fast() | 0; //@line 140
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 143
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 148
   $9 = HEAP32[$7 >> 2] | 0; //@line 150
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 153
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 8918; //@line 159
    _abort_message(8868, $vararg_buffer7); //@line 160
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 169
   } else {
    $22 = $3 + 80 | 0; //@line 171
   }
   HEAP32[$0 >> 2] = $22; //@line 173
   $23 = HEAP32[$3 >> 2] | 0; //@line 174
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 176
   $28 = HEAP32[(HEAP32[52] | 0) + 16 >> 2] | 0; //@line 179
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 180
   $29 = FUNCTION_TABLE_iiii[$28 & 15](208, $23, $0) | 0; //@line 181
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 190; //@line 184
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 186
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 188
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 190
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 192
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 194
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 196
    sp = STACKTOP; //@line 197
    STACKTOP = sp; //@line 198
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 200
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 8918; //@line 202
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 204
    _abort_message(8827, $vararg_buffer3); //@line 205
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 208
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 211
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 212
   $40 = FUNCTION_TABLE_ii[$39 & 31]($36) | 0; //@line 213
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 191; //@line 216
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 218
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 220
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 222
    sp = STACKTOP; //@line 223
    STACKTOP = sp; //@line 224
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 226
    HEAP32[$vararg_buffer >> 2] = 8918; //@line 227
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 229
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 231
    _abort_message(8782, $vararg_buffer); //@line 232
   }
  }
 }
 _abort_message(8906, $vararg_buffer10); //@line 237
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_28($0) {
 $0 = $0 | 0;
 var $$1 = 0, $10 = 0, $12 = 0, $17 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3535
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3537
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3539
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3541
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3543
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3545
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3547
 if ((HEAP32[___async_retval >> 2] | 0) == -1) {
  $$1 = $2; //@line 3552
 } else {
  if (($2 | 0) == ($4 | 0)) {
   $$1 = $4; //@line 3556
  } else {
   $17 = HEAP32[(HEAP32[$12 >> 2] | 0) + 72 >> 2] | 0; //@line 3560
   $18 = $2 + 1 | 0; //@line 3561
   $20 = HEAP8[$2 >> 0] | 0; //@line 3563
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 3564
   $21 = FUNCTION_TABLE_iii[$17 & 7]($8, $20) | 0; //@line 3565
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 3568
    $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 3569
    HEAP32[$22 >> 2] = $18; //@line 3570
    $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 3571
    HEAP32[$23 >> 2] = $4; //@line 3572
    $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 3573
    HEAP32[$24 >> 2] = $6; //@line 3574
    $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 3575
    HEAP32[$25 >> 2] = $8; //@line 3576
    $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 3577
    HEAP32[$26 >> 2] = $10; //@line 3578
    $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 3579
    HEAP32[$27 >> 2] = $12; //@line 3580
    sp = STACKTOP; //@line 3581
    return;
   }
   HEAP32[___async_retval >> 2] = $21; //@line 3585
   ___async_unwind = 0; //@line 3586
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 3587
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 3588
   HEAP32[$22 >> 2] = $18; //@line 3589
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 3590
   HEAP32[$23 >> 2] = $4; //@line 3591
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 3592
   HEAP32[$24 >> 2] = $6; //@line 3593
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 3594
   HEAP32[$25 >> 2] = $8; //@line 3595
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 3596
   HEAP32[$26 >> 2] = $10; //@line 3597
   $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 3598
   HEAP32[$27 >> 2] = $12; //@line 3599
   sp = STACKTOP; //@line 3600
   return;
  }
 }
 $32 = HEAP32[(HEAP32[$6 >> 2] | 0) + 88 >> 2] | 0; //@line 3606
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 3607
 FUNCTION_TABLE_vi[$32 & 255]($8); //@line 3608
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 3611
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 3612
  HEAP32[$33 >> 2] = $$1; //@line 3613
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 3614
  HEAP32[$34 >> 2] = $10; //@line 3615
  sp = STACKTOP; //@line 3616
  return;
 }
 ___async_unwind = 0; //@line 3619
 HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 3620
 $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 3621
 HEAP32[$33 >> 2] = $$1; //@line 3622
 $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 3623
 HEAP32[$34 >> 2] = $10; //@line 3624
 sp = STACKTOP; //@line 3625
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8075
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8077
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8079
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8081
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[2384] | 0)) {
  _serial_init(9540, 2, 3); //@line 8089
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 8091
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 8097
  _serial_putc(9540, $9 << 24 >> 24); //@line 8098
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 8101
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 8102
   HEAP32[$18 >> 2] = 0; //@line 8103
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 8104
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 8105
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 8106
   HEAP32[$20 >> 2] = $2; //@line 8107
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 8108
   HEAP8[$21 >> 0] = $9; //@line 8109
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 8110
   HEAP32[$22 >> 2] = $4; //@line 8111
   sp = STACKTOP; //@line 8112
   return;
  }
  ___async_unwind = 0; //@line 8115
  HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 8116
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 8117
  HEAP32[$18 >> 2] = 0; //@line 8118
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 8119
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 8120
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 8121
  HEAP32[$20 >> 2] = $2; //@line 8122
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 8123
  HEAP8[$21 >> 0] = $9; //@line 8124
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 8125
  HEAP32[$22 >> 2] = $4; //@line 8126
  sp = STACKTOP; //@line 8127
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 8130
  _serial_putc(9540, 13); //@line 8131
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 8134
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 8135
   HEAP8[$12 >> 0] = $9; //@line 8136
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 8137
   HEAP32[$13 >> 2] = 0; //@line 8138
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 8139
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 8140
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 8141
   HEAP32[$15 >> 2] = $2; //@line 8142
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 8143
   HEAP32[$16 >> 2] = $4; //@line 8144
   sp = STACKTOP; //@line 8145
   return;
  }
  ___async_unwind = 0; //@line 8148
  HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 8149
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 8150
  HEAP8[$12 >> 0] = $9; //@line 8151
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 8152
  HEAP32[$13 >> 2] = 0; //@line 8153
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 8154
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 8155
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 8156
  HEAP32[$15 >> 2] = $2; //@line 8157
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 8158
  HEAP32[$16 >> 2] = $4; //@line 8159
  sp = STACKTOP; //@line 8160
  return;
 }
}
function _mbed_error_vfprintf__async_cb_81($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8168
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8172
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8174
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8178
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 8179
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 8185
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 8191
  _serial_putc(9540, $13 << 24 >> 24); //@line 8192
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 8195
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 8196
   HEAP32[$22 >> 2] = $12; //@line 8197
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 8198
   HEAP32[$23 >> 2] = $4; //@line 8199
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 8200
   HEAP32[$24 >> 2] = $6; //@line 8201
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 8202
   HEAP8[$25 >> 0] = $13; //@line 8203
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 8204
   HEAP32[$26 >> 2] = $10; //@line 8205
   sp = STACKTOP; //@line 8206
   return;
  }
  ___async_unwind = 0; //@line 8209
  HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 8210
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 8211
  HEAP32[$22 >> 2] = $12; //@line 8212
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 8213
  HEAP32[$23 >> 2] = $4; //@line 8214
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 8215
  HEAP32[$24 >> 2] = $6; //@line 8216
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 8217
  HEAP8[$25 >> 0] = $13; //@line 8218
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 8219
  HEAP32[$26 >> 2] = $10; //@line 8220
  sp = STACKTOP; //@line 8221
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 8224
  _serial_putc(9540, 13); //@line 8225
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 8228
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 8229
   HEAP8[$16 >> 0] = $13; //@line 8230
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 8231
   HEAP32[$17 >> 2] = $12; //@line 8232
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 8233
   HEAP32[$18 >> 2] = $4; //@line 8234
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 8235
   HEAP32[$19 >> 2] = $6; //@line 8236
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 8237
   HEAP32[$20 >> 2] = $10; //@line 8238
   sp = STACKTOP; //@line 8239
   return;
  }
  ___async_unwind = 0; //@line 8242
  HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 8243
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 8244
  HEAP8[$16 >> 0] = $13; //@line 8245
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 8246
  HEAP32[$17 >> 2] = $12; //@line 8247
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 8248
  HEAP32[$18 >> 2] = $4; //@line 8249
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 8250
  HEAP32[$19 >> 2] = $6; //@line 8251
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 8252
  HEAP32[$20 >> 2] = $10; //@line 8253
  sp = STACKTOP; //@line 8254
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7863
 STACKTOP = STACKTOP + 48 | 0; //@line 7864
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7864
 $vararg_buffer3 = sp + 16 | 0; //@line 7865
 $vararg_buffer = sp; //@line 7866
 $3 = sp + 32 | 0; //@line 7867
 $4 = $0 + 28 | 0; //@line 7868
 $5 = HEAP32[$4 >> 2] | 0; //@line 7869
 HEAP32[$3 >> 2] = $5; //@line 7870
 $7 = $0 + 20 | 0; //@line 7872
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7874
 HEAP32[$3 + 4 >> 2] = $9; //@line 7875
 HEAP32[$3 + 8 >> 2] = $1; //@line 7877
 HEAP32[$3 + 12 >> 2] = $2; //@line 7879
 $12 = $9 + $2 | 0; //@line 7880
 $13 = $0 + 60 | 0; //@line 7881
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7884
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7886
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7888
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7890
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7894
  } else {
   $$04756 = 2; //@line 7896
   $$04855 = $12; //@line 7896
   $$04954 = $3; //@line 7896
   $27 = $17; //@line 7896
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7902
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7904
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7905
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7907
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7909
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7911
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7914
    $44 = $$150 + 4 | 0; //@line 7915
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7918
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7921
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7923
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7925
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7927
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7930
     break L1;
    } else {
     $$04756 = $$1; //@line 7933
     $$04954 = $$150; //@line 7933
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7937
   HEAP32[$4 >> 2] = 0; //@line 7938
   HEAP32[$7 >> 2] = 0; //@line 7939
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7942
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7945
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7950
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7956
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7961
  $25 = $20; //@line 7962
  HEAP32[$4 >> 2] = $25; //@line 7963
  HEAP32[$7 >> 2] = $25; //@line 7964
  $$051 = $2; //@line 7965
 }
 STACKTOP = sp; //@line 7967
 return $$051 | 0; //@line 7967
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3449
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3451
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3453
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3455
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3457
 if (($4 | 0) == ($6 | 0)) {
  $26 = HEAP32[(HEAP32[$8 >> 2] | 0) + 88 >> 2] | 0; //@line 3462
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 3463
  FUNCTION_TABLE_vi[$26 & 255]($2); //@line 3464
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 3467
   $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 3468
   HEAP32[$27 >> 2] = $6; //@line 3469
   $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 3470
   HEAP32[$28 >> 2] = $4; //@line 3471
   sp = STACKTOP; //@line 3472
   return;
  }
  ___async_unwind = 0; //@line 3475
  HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 3476
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 3477
  HEAP32[$27 >> 2] = $6; //@line 3478
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 3479
  HEAP32[$28 >> 2] = $4; //@line 3480
  sp = STACKTOP; //@line 3481
  return;
 } else {
  $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 3486
  $13 = $4 + 1 | 0; //@line 3487
  $15 = HEAP8[$4 >> 0] | 0; //@line 3489
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 3490
  $16 = FUNCTION_TABLE_iii[$12 & 7]($2, $15) | 0; //@line 3491
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 3494
   $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 3495
   HEAP32[$17 >> 2] = $13; //@line 3496
   $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 3497
   HEAP32[$18 >> 2] = $6; //@line 3498
   $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 3499
   HEAP32[$19 >> 2] = $8; //@line 3500
   $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 3501
   HEAP32[$20 >> 2] = $2; //@line 3502
   $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 3503
   HEAP32[$21 >> 2] = $4; //@line 3504
   $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 3505
   HEAP32[$22 >> 2] = $2; //@line 3506
   sp = STACKTOP; //@line 3507
   return;
  }
  HEAP32[___async_retval >> 2] = $16; //@line 3511
  ___async_unwind = 0; //@line 3512
  HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 3513
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 3514
  HEAP32[$17 >> 2] = $13; //@line 3515
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 3516
  HEAP32[$18 >> 2] = $6; //@line 3517
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 3518
  HEAP32[$19 >> 2] = $8; //@line 3519
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 3520
  HEAP32[$20 >> 2] = $2; //@line 3521
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 3522
  HEAP32[$21 >> 2] = $4; //@line 3523
  $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 3524
  HEAP32[$22 >> 2] = $2; //@line 3525
  sp = STACKTOP; //@line 3526
  return;
 }
}
function _freopen__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $14 = 0, $18 = 0, $2 = 0, $28 = 0, $30 = 0, $31 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6284
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6286
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6288
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6290
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6292
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6294
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6298
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6302
 if (!$4) {
  $$pre = $8 + 60 | 0; //@line 6307
  if ($2 & 524288 | 0) {
   HEAP32[$14 >> 2] = HEAP32[$$pre >> 2]; //@line 6310
   HEAP32[$14 + 4 >> 2] = 2; //@line 6312
   HEAP32[$14 + 8 >> 2] = 1; //@line 6314
   ___syscall221(221, $14 | 0) | 0; //@line 6315
  }
  HEAP32[$10 >> 2] = HEAP32[$$pre >> 2]; //@line 6319
  HEAP32[$10 + 4 >> 2] = 4; //@line 6321
  HEAP32[$10 + 8 >> 2] = $2 & -524481; //@line 6323
  if ((___syscall_ret(___syscall221(221, $10 | 0) | 0) | 0) >= 0) {
   if ($6 | 0) {
    ___unlockfile($8); //@line 6330
   }
   HEAP32[___async_retval >> 2] = $8; //@line 6333
   return;
  }
 } else {
  $28 = _fopen($4, $18) | 0; //@line 6337
  if ($28 | 0) {
   $30 = $28 + 60 | 0; //@line 6340
   $31 = HEAP32[$30 >> 2] | 0; //@line 6341
   $33 = HEAP32[$8 + 60 >> 2] | 0; //@line 6343
   if (($31 | 0) == ($33 | 0)) {
    HEAP32[$30 >> 2] = -1; //@line 6346
   } else {
    if ((___dup3($31, $33, $2 & 524288) | 0) < 0) {
     $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 6352
     _fclose($28) | 0; //@line 6353
     if (!___async) {
      ___async_unwind = 0; //@line 6356
     }
     HEAP32[$ReallocAsyncCtx3 >> 2] = 183; //@line 6358
     HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $8; //@line 6360
     sp = STACKTOP; //@line 6361
     return;
    }
   }
   HEAP32[$8 >> 2] = HEAP32[$8 >> 2] & 1 | HEAP32[$28 >> 2]; //@line 6369
   HEAP32[$8 + 32 >> 2] = HEAP32[$28 + 32 >> 2]; //@line 6373
   HEAP32[$8 + 36 >> 2] = HEAP32[$28 + 36 >> 2]; //@line 6377
   HEAP32[$8 + 40 >> 2] = HEAP32[$28 + 40 >> 2]; //@line 6381
   HEAP32[$8 + 12 >> 2] = HEAP32[$28 + 12 >> 2]; //@line 6385
   $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 6386
   _fclose($28) | 0; //@line 6387
   if (!___async) {
    ___async_unwind = 0; //@line 6390
   }
   HEAP32[$ReallocAsyncCtx4 >> 2] = 182; //@line 6392
   HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $6; //@line 6394
   HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $8; //@line 6396
   sp = STACKTOP; //@line 6397
   return;
  }
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6401
 _fclose($8) | 0; //@line 6402
 if (!___async) {
  ___async_unwind = 0; //@line 6405
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 184; //@line 6407
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 6409
 sp = STACKTOP; //@line 6410
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4130
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4132
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4136
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4138
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4140
 if (!(HEAP32[$0 + 8 >> 2] | 0)) {
  $25 = HEAP32[(HEAP32[$10 >> 2] | 0) + 88 >> 2] | 0; //@line 4145
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 4146
  FUNCTION_TABLE_vi[$25 & 255]($2); //@line 4147
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 4150
   $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 4151
   HEAP32[$26 >> 2] = $6; //@line 4152
   $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 4153
   HEAP32[$27 >> 2] = $6; //@line 4154
   sp = STACKTOP; //@line 4155
   return;
  }
  ___async_unwind = 0; //@line 4158
  HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 4159
  $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 4160
  HEAP32[$26 >> 2] = $6; //@line 4161
  $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 4162
  HEAP32[$27 >> 2] = $6; //@line 4163
  sp = STACKTOP; //@line 4164
  return;
 } else {
  $14 = HEAP32[(HEAP32[$2 >> 2] | 0) + 76 >> 2] | 0; //@line 4169
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 4170
  $15 = FUNCTION_TABLE_ii[$14 & 31]($2) | 0; //@line 4171
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 4174
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4175
   HEAP32[$16 >> 2] = $6; //@line 4176
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4177
   HEAP32[$17 >> 2] = $6; //@line 4178
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4179
   HEAP32[$18 >> 2] = $8; //@line 4180
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4181
   HEAP32[$19 >> 2] = $10; //@line 4182
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4183
   HEAP32[$20 >> 2] = $2; //@line 4184
   $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 4185
   HEAP32[$21 >> 2] = $2; //@line 4186
   sp = STACKTOP; //@line 4187
   return;
  }
  HEAP32[___async_retval >> 2] = $15; //@line 4191
  ___async_unwind = 0; //@line 4192
  HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 4193
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4194
  HEAP32[$16 >> 2] = $6; //@line 4195
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4196
  HEAP32[$17 >> 2] = $6; //@line 4197
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4198
  HEAP32[$18 >> 2] = $8; //@line 4199
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4200
  HEAP32[$19 >> 2] = $10; //@line 4201
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4202
  HEAP32[$20 >> 2] = $2; //@line 4203
  $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 4204
  HEAP32[$21 >> 2] = $2; //@line 4205
  sp = STACKTOP; //@line 4206
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
 if (!(HEAP32[2384] | 0)) {
  _serial_init(9540, 2, 3); //@line 2342
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
   _serial_putc(9540, 13); //@line 2355
   if (___async) {
    label = 8; //@line 2358
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2361
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2364
  _serial_putc(9540, $$01213 << 24 >> 24); //@line 2365
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
 sp = STACKTOP; //@line 8907
 STACKTOP = STACKTOP + 64 | 0; //@line 8908
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8908
 $vararg_buffer12 = sp + 40 | 0; //@line 8909
 $vararg_buffer7 = sp + 24 | 0; //@line 8910
 $vararg_buffer3 = sp + 16 | 0; //@line 8911
 $vararg_buffer = sp; //@line 8912
 $2 = sp + 56 | 0; //@line 8913
 if (!(_strchr(6352, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8920
  $$0 = 0; //@line 8921
 } else {
  $8 = _malloc(1156) | 0; //@line 8923
  if (!$8) {
   $$0 = 0; //@line 8926
  } else {
   _memset($8 | 0, 0, 124) | 0; //@line 8928
   if (!(_strchr($1, 43) | 0)) {
    HEAP32[$8 >> 2] = (HEAP8[$1 >> 0] | 0) == 114 ? 8 : 4; //@line 8935
   }
   if (_strchr($1, 101) | 0) {
    HEAP32[$vararg_buffer >> 2] = $0; //@line 8940
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 8942
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 8944
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 8945
   }
   if ((HEAP8[$1 >> 0] | 0) == 97) {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 8950
    HEAP32[$vararg_buffer3 + 4 >> 2] = 3; //@line 8952
    $19 = ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8953
    if (!($19 & 1024)) {
     HEAP32[$vararg_buffer7 >> 2] = $0; //@line 8958
     HEAP32[$vararg_buffer7 + 4 >> 2] = 4; //@line 8960
     HEAP32[$vararg_buffer7 + 8 >> 2] = $19 | 1024; //@line 8962
     ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 8963
    }
    $24 = HEAP32[$8 >> 2] | 128; //@line 8966
    HEAP32[$8 >> 2] = $24; //@line 8967
    $31 = $24; //@line 8968
   } else {
    $31 = HEAP32[$8 >> 2] | 0; //@line 8971
   }
   HEAP32[$8 + 60 >> 2] = $0; //@line 8974
   HEAP32[$8 + 44 >> 2] = $8 + 132; //@line 8977
   HEAP32[$8 + 48 >> 2] = 1024; //@line 8979
   $29 = $8 + 75 | 0; //@line 8980
   HEAP8[$29 >> 0] = -1; //@line 8981
   if (!($31 & 8)) {
    HEAP32[$vararg_buffer12 >> 2] = $0; //@line 8986
    HEAP32[$vararg_buffer12 + 4 >> 2] = 21523; //@line 8988
    HEAP32[$vararg_buffer12 + 8 >> 2] = $2; //@line 8990
    if (!(___syscall54(54, $vararg_buffer12 | 0) | 0)) {
     HEAP8[$29 >> 0] = 10; //@line 8994
    }
   }
   HEAP32[$8 + 32 >> 2] = 10; //@line 8998
   HEAP32[$8 + 36 >> 2] = 5; //@line 9000
   HEAP32[$8 + 40 >> 2] = 6; //@line 9002
   HEAP32[$8 + 12 >> 2] = 20; //@line 9004
   if (!(HEAP32[3566] | 0)) {
    HEAP32[$8 + 76 >> 2] = -1; //@line 9009
   }
   ___ofl_add($8) | 0; //@line 9011
   $$0 = $8; //@line 9012
  }
 }
 STACKTOP = sp; //@line 9015
 return $$0 | 0; //@line 9015
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2060
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2064
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2066
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2068
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2070
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2072
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2074
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2076
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2078
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2080
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 2083
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2085
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 2089
   $27 = $6 + 24 | 0; //@line 2090
   $28 = $4 + 8 | 0; //@line 2091
   $29 = $6 + 54 | 0; //@line 2092
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
    HEAP8[$10 >> 0] = 0; //@line 2122
    HEAP8[$14 >> 0] = 0; //@line 2123
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2124
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 2125
    if (!___async) {
     ___async_unwind = 0; //@line 2128
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 205; //@line 2130
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 2132
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 2134
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 2136
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2138
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2140
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2142
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2144
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 2146
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 2148
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 2150
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 2152
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 2154
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 2156
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 2159
    sp = STACKTOP; //@line 2160
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2165
 HEAP8[$14 >> 0] = $12; //@line 2166
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1944
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1948
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1950
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1952
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1954
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1956
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1958
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1960
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1962
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1964
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1966
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1968
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1970
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 1973
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1974
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
    HEAP8[$10 >> 0] = 0; //@line 2007
    HEAP8[$14 >> 0] = 0; //@line 2008
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2009
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 2010
    if (!___async) {
     ___async_unwind = 0; //@line 2013
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 205; //@line 2015
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 2017
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2019
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2021
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2023
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2025
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2027
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2029
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 2031
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 2033
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 2035
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 2037
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 2039
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 2041
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 2044
    sp = STACKTOP; //@line 2045
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2050
 HEAP8[$14 >> 0] = $12; //@line 2051
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 9927
 }
 ret = dest | 0; //@line 9930
 dest_end = dest + num | 0; //@line 9931
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 9935
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9936
   dest = dest + 1 | 0; //@line 9937
   src = src + 1 | 0; //@line 9938
   num = num - 1 | 0; //@line 9939
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 9941
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 9942
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9944
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 9945
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 9946
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 9947
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 9948
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 9949
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 9950
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 9951
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 9952
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 9953
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 9954
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 9955
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 9956
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 9957
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 9958
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 9959
   dest = dest + 64 | 0; //@line 9960
   src = src + 64 | 0; //@line 9961
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9964
   dest = dest + 4 | 0; //@line 9965
   src = src + 4 | 0; //@line 9966
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 9970
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9972
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 9973
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 9974
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 9975
   dest = dest + 4 | 0; //@line 9976
   src = src + 4 | 0; //@line 9977
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9982
  dest = dest + 1 | 0; //@line 9983
  src = src + 1 | 0; //@line 9984
 }
 return ret | 0; //@line 9986
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
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 13014
 STACKTOP = STACKTOP + 128 | 0; //@line 13015
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 13015
 $4 = sp + 124 | 0; //@line 13016
 $5 = sp; //@line 13017
 dest = $5; //@line 13018
 src = 1612; //@line 13018
 stop = dest + 124 | 0; //@line 13018
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13018
  dest = dest + 4 | 0; //@line 13018
  src = src + 4 | 0; //@line 13018
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 13024
   $$015 = 1; //@line 13024
   label = 4; //@line 13025
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 13028
   $$0 = -1; //@line 13029
  }
 } else {
  $$014 = $0; //@line 13032
  $$015 = $1; //@line 13032
  label = 4; //@line 13033
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 13037
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 13039
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 13041
  $14 = $5 + 20 | 0; //@line 13042
  HEAP32[$14 >> 2] = $$014; //@line 13043
  HEAP32[$5 + 44 >> 2] = $$014; //@line 13045
  $16 = $$014 + $$$015 | 0; //@line 13046
  $17 = $5 + 16 | 0; //@line 13047
  HEAP32[$17 >> 2] = $16; //@line 13048
  HEAP32[$5 + 28 >> 2] = $16; //@line 13050
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 13051
  $19 = _vfprintf($5, $2, $3) | 0; //@line 13052
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 178; //@line 13055
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 13057
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 13059
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 13061
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 13063
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 13065
   sp = STACKTOP; //@line 13066
   STACKTOP = sp; //@line 13067
   return 0; //@line 13067
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13069
  if (!$$$015) {
   $$0 = $19; //@line 13072
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 13074
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 13079
   $$0 = $19; //@line 13080
  }
 }
 STACKTOP = sp; //@line 13083
 return $$0 | 0; //@line 13083
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_21($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3053
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3057
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3059
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3061
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3063
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3065
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3067
 $16 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3068
 if (($16 | 0) == ($4 | 0)) {
  return;
 }
 $25 = HEAPU16[((128 >>> ($16 & 7) & HEAP8[$6 + ($16 >> 3) >> 0] | 0) == 0 ? $8 : $10) >> 1] | 0; //@line 3083
 $28 = HEAP32[(HEAP32[$12 >> 2] | 0) + 140 >> 2] | 0; //@line 3086
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 3087
 FUNCTION_TABLE_vii[$28 & 7]($14, $25); //@line 3088
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 3091
  $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 3092
  HEAP32[$29 >> 2] = $16; //@line 3093
  $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 3094
  HEAP32[$30 >> 2] = $4; //@line 3095
  $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 3096
  HEAP32[$31 >> 2] = $6; //@line 3097
  $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 3098
  HEAP32[$32 >> 2] = $8; //@line 3099
  $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 3100
  HEAP32[$33 >> 2] = $10; //@line 3101
  $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 3102
  HEAP32[$34 >> 2] = $12; //@line 3103
  $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 3104
  HEAP32[$35 >> 2] = $14; //@line 3105
  sp = STACKTOP; //@line 3106
  return;
 }
 ___async_unwind = 0; //@line 3109
 HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 3110
 $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 3111
 HEAP32[$29 >> 2] = $16; //@line 3112
 $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 3113
 HEAP32[$30 >> 2] = $4; //@line 3114
 $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 3115
 HEAP32[$31 >> 2] = $6; //@line 3116
 $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 3117
 HEAP32[$32 >> 2] = $8; //@line 3118
 $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 3119
 HEAP32[$33 >> 2] = $10; //@line 3120
 $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 3121
 HEAP32[$34 >> 2] = $12; //@line 3122
 $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 3123
 HEAP32[$35 >> 2] = $14; //@line 3124
 sp = STACKTOP; //@line 3125
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1654
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 1660
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 1664
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 1665
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1666
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 1667
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 211; //@line 1670
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 1672
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1674
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 1676
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 1678
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 1680
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 1682
    sp = STACKTOP; //@line 1683
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1686
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 1690
    $$0 = $0 + 24 | 0; //@line 1691
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1693
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 1694
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1699
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 1705
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 1708
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 212; //@line 1713
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 1715
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 1717
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 1719
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 1721
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 1723
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 1725
    sp = STACKTOP; //@line 1726
    return;
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 322
 STACKTOP = STACKTOP + 64 | 0; //@line 323
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 323
 $3 = sp; //@line 324
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 327
 } else {
  if (!$1) {
   $$2 = 0; //@line 331
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 333
   $6 = ___dynamic_cast($1, 232, 216, 0) | 0; //@line 334
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 194; //@line 337
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 339
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 341
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 343
    sp = STACKTOP; //@line 344
    STACKTOP = sp; //@line 345
    return 0; //@line 345
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 347
   if (!$6) {
    $$2 = 0; //@line 350
   } else {
    dest = $3 + 4 | 0; //@line 353
    stop = dest + 52 | 0; //@line 353
    do {
     HEAP32[dest >> 2] = 0; //@line 353
     dest = dest + 4 | 0; //@line 353
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 354
    HEAP32[$3 + 8 >> 2] = $0; //@line 356
    HEAP32[$3 + 12 >> 2] = -1; //@line 358
    HEAP32[$3 + 48 >> 2] = 1; //@line 360
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 363
    $18 = HEAP32[$2 >> 2] | 0; //@line 364
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 365
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 366
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 195; //@line 369
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 371
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 373
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 375
     sp = STACKTOP; //@line 376
     STACKTOP = sp; //@line 377
     return 0; //@line 377
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 379
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 386
     $$0 = 1; //@line 387
    } else {
     $$0 = 0; //@line 389
    }
    $$2 = $$0; //@line 391
   }
  }
 }
 STACKTOP = sp; //@line 395
 return $$2 | 0; //@line 395
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_59($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $17 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6143
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6145
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6147
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6149
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6151
 HEAP32[$2 >> 2] = 608; //@line 6152
 HEAP32[$2 + 4 >> 2] = 772; //@line 6154
 $10 = $2 + 4172 | 0; //@line 6155
 HEAP32[$10 >> 2] = $4; //@line 6156
 $11 = $2 + 4176 | 0; //@line 6157
 HEAP32[$11 >> 2] = $6; //@line 6158
 $12 = $2 + 4180 | 0; //@line 6159
 HEAP32[$12 >> 2] = $8; //@line 6160
 _emscripten_asm_const_iiii(5, $4 | 0, $6 | 0, $8 | 0) | 0; //@line 6161
 HEAP32[$2 + 56 >> 2] = 1; //@line 6163
 HEAP32[$2 + 52 >> 2] = 0; //@line 6165
 HEAP32[$2 + 60 >> 2] = 0; //@line 6167
 $17 = $2 + 68 | 0; //@line 6168
 _memset($17 | 0, 0, 4096) | 0; //@line 6169
 $20 = HEAP32[(HEAP32[$2 >> 2] | 0) + 112 >> 2] | 0; //@line 6172
 $ReallocAsyncCtx = _emscripten_realloc_async_context(24) | 0; //@line 6173
 FUNCTION_TABLE_viii[$20 & 3]($2, 0, 0); //@line 6174
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 6177
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 6178
  HEAP32[$21 >> 2] = $2; //@line 6179
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 6180
  HEAP32[$22 >> 2] = $10; //@line 6181
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 6182
  HEAP32[$23 >> 2] = $11; //@line 6183
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 6184
  HEAP32[$24 >> 2] = $12; //@line 6185
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 6186
  HEAP32[$25 >> 2] = $17; //@line 6187
  sp = STACKTOP; //@line 6188
  return;
 }
 ___async_unwind = 0; //@line 6191
 HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 6192
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 6193
 HEAP32[$21 >> 2] = $2; //@line 6194
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 6195
 HEAP32[$22 >> 2] = $10; //@line 6196
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 6197
 HEAP32[$23 >> 2] = $11; //@line 6198
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 6199
 HEAP32[$24 >> 2] = $12; //@line 6200
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 6201
 HEAP32[$25 >> 2] = $17; //@line 6202
 sp = STACKTOP; //@line 6203
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13440
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 13445
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 13450
  } else {
   $20 = $0 & 255; //@line 13452
   $21 = $0 & 255; //@line 13453
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 13459
   } else {
    $26 = $1 + 20 | 0; //@line 13461
    $27 = HEAP32[$26 >> 2] | 0; //@line 13462
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 13468
     HEAP8[$27 >> 0] = $20; //@line 13469
     $34 = $21; //@line 13470
    } else {
     label = 12; //@line 13472
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 13477
     $32 = ___overflow($1, $0) | 0; //@line 13478
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 186; //@line 13481
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 13483
      sp = STACKTOP; //@line 13484
      return 0; //@line 13485
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 13487
      $34 = $32; //@line 13488
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 13493
   $$0 = $34; //@line 13494
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 13499
   $8 = $0 & 255; //@line 13500
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 13506
    $14 = HEAP32[$13 >> 2] | 0; //@line 13507
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 13513
     HEAP8[$14 >> 0] = $7; //@line 13514
     $$0 = $8; //@line 13515
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 13519
   $19 = ___overflow($1, $0) | 0; //@line 13520
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 185; //@line 13523
    sp = STACKTOP; //@line 13524
    return 0; //@line 13525
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13527
    $$0 = $19; //@line 13528
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 13533
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 8685
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 8688
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 8691
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 8694
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 8700
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 8709
     $24 = $13 >>> 2; //@line 8710
     $$090 = 0; //@line 8711
     $$094 = $7; //@line 8711
     while (1) {
      $25 = $$094 >>> 1; //@line 8713
      $26 = $$090 + $25 | 0; //@line 8714
      $27 = $26 << 1; //@line 8715
      $28 = $27 + $23 | 0; //@line 8716
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 8719
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8723
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 8729
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 8737
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 8741
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 8747
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 8752
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 8755
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 8755
      }
     }
     $46 = $27 + $24 | 0; //@line 8758
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 8761
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8765
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 8777
     } else {
      $$4 = 0; //@line 8779
     }
    } else {
     $$4 = 0; //@line 8782
    }
   } else {
    $$4 = 0; //@line 8785
   }
  } else {
   $$4 = 0; //@line 8788
  }
 } while (0);
 return $$4 | 0; //@line 8791
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2977
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2983
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2985
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2986
 if (($9 | 0) <= 0) {
  return;
 }
 $11 = $6 + 28 | 0; //@line 2991
 $12 = $6 + 30 | 0; //@line 2992
 $22 = HEAPU16[((128 >>> 0 & HEAP8[$8 + 0 >> 0] | 0) == 0 ? $12 : $11) >> 1] | 0; //@line 3003
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 3006
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 3007
 FUNCTION_TABLE_vii[$25 & 7]($6, $22); //@line 3008
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 3011
  $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 3012
  HEAP32[$26 >> 2] = 0; //@line 3013
  $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 3014
  HEAP32[$27 >> 2] = $9; //@line 3015
  $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 3016
  HEAP32[$28 >> 2] = $8; //@line 3017
  $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 3018
  HEAP32[$29 >> 2] = $12; //@line 3019
  $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 3020
  HEAP32[$30 >> 2] = $11; //@line 3021
  $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 3022
  HEAP32[$31 >> 2] = $6; //@line 3023
  $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 3024
  HEAP32[$32 >> 2] = $6; //@line 3025
  sp = STACKTOP; //@line 3026
  return;
 }
 ___async_unwind = 0; //@line 3029
 HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 3030
 $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 3031
 HEAP32[$26 >> 2] = 0; //@line 3032
 $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 3033
 HEAP32[$27 >> 2] = $9; //@line 3034
 $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 3035
 HEAP32[$28 >> 2] = $8; //@line 3036
 $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 3037
 HEAP32[$29 >> 2] = $12; //@line 3038
 $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 3039
 HEAP32[$30 >> 2] = $11; //@line 3040
 $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 3041
 HEAP32[$31 >> 2] = $6; //@line 3042
 $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 3043
 HEAP32[$32 >> 2] = $6; //@line 3044
 sp = STACKTOP; //@line 3045
 return;
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8312
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 8317
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 8322
  } else {
   $20 = $0 & 255; //@line 8324
   $21 = $0 & 255; //@line 8325
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 8331
   } else {
    $26 = $1 + 20 | 0; //@line 8333
    $27 = HEAP32[$26 >> 2] | 0; //@line 8334
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 8340
     HEAP8[$27 >> 0] = $20; //@line 8341
     $34 = $21; //@line 8342
    } else {
     label = 12; //@line 8344
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8349
     $32 = ___overflow($1, $0) | 0; //@line 8350
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 166; //@line 8353
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8355
      sp = STACKTOP; //@line 8356
      return 0; //@line 8357
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8359
      $34 = $32; //@line 8360
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 8365
   $$0 = $34; //@line 8366
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 8371
   $8 = $0 & 255; //@line 8372
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 8378
    $14 = HEAP32[$13 >> 2] | 0; //@line 8379
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 8385
     HEAP8[$14 >> 0] = $7; //@line 8386
     $$0 = $8; //@line 8387
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8391
   $19 = ___overflow($1, $0) | 0; //@line 8392
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 165; //@line 8395
    sp = STACKTOP; //@line 8396
    return 0; //@line 8397
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8399
    $$0 = $19; //@line 8400
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8405
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9388
 $1 = $0 + 20 | 0; //@line 9389
 $3 = $0 + 28 | 0; //@line 9391
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 9397
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9398
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 9399
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 174; //@line 9402
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9404
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 9406
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9408
    sp = STACKTOP; //@line 9409
    return 0; //@line 9410
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9412
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 9416
     break;
    } else {
     label = 5; //@line 9419
     break;
    }
   }
  } else {
   label = 5; //@line 9424
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 9428
  $14 = HEAP32[$13 >> 2] | 0; //@line 9429
  $15 = $0 + 8 | 0; //@line 9430
  $16 = HEAP32[$15 >> 2] | 0; //@line 9431
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 9439
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 9440
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 9441
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 175; //@line 9444
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 9446
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 9448
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 9450
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 9452
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 9454
     sp = STACKTOP; //@line 9455
     return 0; //@line 9456
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9458
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 9464
  HEAP32[$3 >> 2] = 0; //@line 9465
  HEAP32[$1 >> 2] = 0; //@line 9466
  HEAP32[$15 >> 2] = 0; //@line 9467
  HEAP32[$13 >> 2] = 0; //@line 9468
  $$0 = 0; //@line 9469
 }
 return $$0 | 0; //@line 9471
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1052
 HEAP32[$0 >> 2] = 392; //@line 1053
 $1 = HEAP32[2341] | 0; //@line 1054
 do {
  if (!$1) {
   HEAP32[2341] = 9368; //@line 1058
  } else {
   if (($1 | 0) != 9368) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1062
    _mbed_assert_internal(3023, 3043, 93); //@line 1063
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
   $8 = HEAP32[2340] | 0; //@line 1083
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2340] = HEAP32[$0 + 4 >> 2]; //@line 1088
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
 $17 = HEAP32[2341] | 0; //@line 1108
 do {
  if (!$17) {
   HEAP32[2341] = 9368; //@line 1112
  } else {
   if (($17 | 0) != 9368) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1116
    _mbed_assert_internal(3023, 3043, 93); //@line 1117
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
 sp = STACKTOP; //@line 3987
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3990
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3991
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3992
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 142; //@line 3995
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3997
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3999
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 4001
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 4003
  sp = STACKTOP; //@line 4004
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4007
 $13 = Math_imul($4, $3) | 0; //@line 4008
 if (($13 | 0) <= 0) {
  return;
 }
 $15 = $0 + 28 | 0; //@line 4013
 $16 = $0 + 30 | 0; //@line 4014
 $$019 = 0; //@line 4015
 while (1) {
  $26 = HEAPU16[((128 >>> ($$019 & 7) & HEAP8[$5 + ($$019 >> 3) >> 0] | 0) == 0 ? $16 : $15) >> 1] | 0; //@line 4027
  $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 4030
  $AsyncCtx3 = _emscripten_alloc_async_context(32, sp) | 0; //@line 4031
  FUNCTION_TABLE_vii[$29 & 7]($0, $26); //@line 4032
  if (___async) {
   label = 7; //@line 4035
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4038
  $37 = $$019 + 1 | 0; //@line 4039
  if (($37 | 0) == ($13 | 0)) {
   label = 5; //@line 4042
   break;
  } else {
   $$019 = $37; //@line 4045
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 143; //@line 4052
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$019; //@line 4054
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 4056
  HEAP32[$AsyncCtx3 + 12 >> 2] = $5; //@line 4058
  HEAP32[$AsyncCtx3 + 16 >> 2] = $16; //@line 4060
  HEAP32[$AsyncCtx3 + 20 >> 2] = $15; //@line 4062
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 4064
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 4066
  sp = STACKTOP; //@line 4067
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
 _mbed_tracef(16, 1872, 1900, $vararg_buffer); //@line 92
 _emscripten_asm_const_i(0) | 0; //@line 93
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 95
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 98
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 100
  _mbed_tracef(16, 1872, 1982, $vararg_buffer4); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 105
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 108
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 110
  _mbed_tracef(16, 1872, 2029, $vararg_buffer8); //@line 111
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
  _mbed_tracef(16, 1872, 2076, $vararg_buffer12); //@line 137
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
 sp = STACKTOP; //@line 3537
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3538
 __ZN15GraphicsDisplayC2EPKc($0, $6); //@line 3539
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 129; //@line 3542
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3544
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3546
  HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 3548
  HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 3550
  sp = STACKTOP; //@line 3551
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3554
 HEAP32[$0 >> 2] = 608; //@line 3555
 HEAP32[$0 + 4 >> 2] = 772; //@line 3557
 $12 = $0 + 4172 | 0; //@line 3558
 HEAP32[$12 >> 2] = $1; //@line 3559
 $13 = $0 + 4176 | 0; //@line 3560
 HEAP32[$13 >> 2] = $3; //@line 3561
 $14 = $0 + 4180 | 0; //@line 3562
 HEAP32[$14 >> 2] = $2; //@line 3563
 _emscripten_asm_const_iiii(5, $1 | 0, $3 | 0, $2 | 0) | 0; //@line 3564
 HEAP32[$0 + 56 >> 2] = 1; //@line 3566
 HEAP32[$0 + 52 >> 2] = 0; //@line 3568
 HEAP32[$0 + 60 >> 2] = 0; //@line 3570
 $19 = $0 + 68 | 0; //@line 3571
 _memset($19 | 0, 0, 4096) | 0; //@line 3572
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 112 >> 2] | 0; //@line 3575
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 3576
 FUNCTION_TABLE_viii[$22 & 3]($0, 0, 0); //@line 3577
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 130; //@line 3580
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3582
  HEAP32[$AsyncCtx + 8 >> 2] = $12; //@line 3584
  HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 3586
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 3588
  HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 3590
  sp = STACKTOP; //@line 3591
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3594
  HEAP32[$0 + 48 >> 2] = 3289; //@line 3596
  _emscripten_asm_const_iiiii(4, HEAP32[$12 >> 2] | 0, HEAP32[$13 >> 2] | 0, HEAP32[$14 >> 2] | 0, $19 | 0) | 0; //@line 3600
  return;
 }
}
function _fclose($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $15 = 0, $21 = 0, $25 = 0, $27 = 0, $28 = 0, $33 = 0, $35 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9154
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $25 = ___lockfile($0) | 0; //@line 9160
 } else {
  $25 = 0; //@line 9162
 }
 ___unlist_locked_file($0); //@line 9164
 $7 = (HEAP32[$0 >> 2] & 1 | 0) != 0; //@line 9167
 if (!$7) {
  $8 = ___ofl_lock() | 0; //@line 9169
  $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 9171
  $$pre = $0 + 56 | 0; //@line 9174
  if ($10 | 0) {
   HEAP32[$10 + 56 >> 2] = HEAP32[$$pre >> 2]; //@line 9178
  }
  $15 = HEAP32[$$pre >> 2] | 0; //@line 9180
  if ($15 | 0) {
   HEAP32[$15 + 52 >> 2] = $10; //@line 9185
  }
  if ((HEAP32[$8 >> 2] | 0) == ($0 | 0)) {
   HEAP32[$8 >> 2] = $15; //@line 9190
  }
  ___ofl_unlock(); //@line 9192
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9194
 $21 = _fflush($0) | 0; //@line 9195
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 168; //@line 9198
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 9200
  HEAP8[$AsyncCtx3 + 8 >> 0] = $7 & 1; //@line 9203
  HEAP32[$AsyncCtx3 + 12 >> 2] = $25; //@line 9205
  sp = STACKTOP; //@line 9206
  return 0; //@line 9207
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9209
 $27 = HEAP32[$0 + 12 >> 2] | 0; //@line 9211
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 9212
 $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 9213
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 169; //@line 9216
  HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 9218
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 9220
  HEAP8[$AsyncCtx + 12 >> 0] = $7 & 1; //@line 9223
  HEAP32[$AsyncCtx + 16 >> 2] = $25; //@line 9225
  sp = STACKTOP; //@line 9226
  return 0; //@line 9227
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9229
 $33 = $28 | $21; //@line 9230
 $35 = HEAP32[$0 + 92 >> 2] | 0; //@line 9232
 if ($35 | 0) {
  _free($35); //@line 9235
 }
 if ($7) {
  if ($25 | 0) {
   ___unlockfile($0); //@line 9240
  }
 } else {
  _free($0); //@line 9243
 }
 return $33 | 0; //@line 9245
}
function __ZN6C128325_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $14 = 0, $15 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2956
 if (($1 | 0) == 10) {
  HEAP32[$0 + 60 >> 2] = 0; //@line 2960
  $4 = $0 + 64 | 0; //@line 2961
  $6 = $0 + 48 | 0; //@line 2963
  $11 = (HEAP32[$4 >> 2] | 0) + (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0; //@line 2968
  HEAP32[$4 >> 2] = $11; //@line 2969
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 2972
  $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2973
  $15 = FUNCTION_TABLE_ii[$14 & 31]($0) | 0; //@line 2974
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 119; //@line 2977
   HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 2979
   HEAP32[$AsyncCtx + 8 >> 2] = $11; //@line 2981
   HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2983
   HEAP32[$AsyncCtx + 16 >> 2] = $4; //@line 2985
   sp = STACKTOP; //@line 2986
   return 0; //@line 2987
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2989
  if ($11 >>> 0 < ($15 - (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
   return $1 | 0; //@line 2997
  }
  HEAP32[$4 >> 2] = 0; //@line 2999
  return $1 | 0; //@line 3000
 } else {
  $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 3004
  $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3006
  $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3008
  $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3009
  FUNCTION_TABLE_viiii[$28 & 7]($0, $30, $32, $1); //@line 3010
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 120; //@line 3013
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3015
   HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3017
   sp = STACKTOP; //@line 3018
   return 0; //@line 3019
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3021
  if (!(HEAP32[$0 + 4168 >> 2] | 0)) {
   return $1 | 0; //@line 3026
  }
  _emscripten_asm_const_iiiii(4, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 3035
  return $1 | 0; //@line 3036
 }
 return 0; //@line 3038
}
function _main() {
 var $4 = 0.0, $5 = 0.0, $AsyncCtx = 0, $AsyncCtx6 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, sp = 0;
 sp = STACKTOP; //@line 4638
 STACKTOP = STACKTOP + 16 | 0; //@line 4639
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4639
 $vararg_buffer1 = sp + 8 | 0; //@line 4640
 $vararg_buffer = sp; //@line 4641
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4642
 _puts(6216) | 0; //@line 4643
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 163; //@line 4646
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 4648
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 4650
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer1; //@line 4652
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer1; //@line 4654
  sp = STACKTOP; //@line 4655
  STACKTOP = sp; //@line 4656
  return 0; //@line 4656
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4658
 while (1) {
  __ZN6C128323clsEv(9556); //@line 4660
  $4 = +__ZN5Sht3115readTemperatureEv(14353); //@line 4661
  $5 = +__ZN5Sht3112readHumidityEv(14353); //@line 4662
  __ZN6C128326locateEii(9556, 3, 3); //@line 4663
  HEAPF64[$vararg_buffer >> 3] = $4; //@line 4665
  __ZN4mbed6Stream6printfEPKcz(9556, 6280, $vararg_buffer) | 0; //@line 4666
  __ZN6C128326locateEii(9556, 3, 13); //@line 4667
  HEAPF64[$vararg_buffer1 >> 3] = $5; //@line 4669
  __ZN4mbed6Stream6printfEPKcz(9556, 6300, $vararg_buffer1) | 0; //@line 4670
  _emscripten_asm_const_iii(2, HEAP32[3435] | 0, $4 > 25.0 | 0) | 0; //@line 4674
  $AsyncCtx6 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4675
  _wait(.5); //@line 4676
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4681
 }
 HEAP32[$AsyncCtx6 >> 2] = 164; //@line 4683
 HEAP32[$AsyncCtx6 + 4 >> 2] = $vararg_buffer; //@line 4685
 HEAP32[$AsyncCtx6 + 8 >> 2] = $vararg_buffer; //@line 4687
 HEAP32[$AsyncCtx6 + 12 >> 2] = $vararg_buffer1; //@line 4689
 HEAP32[$AsyncCtx6 + 16 >> 2] = $vararg_buffer1; //@line 4691
 sp = STACKTOP; //@line 4692
 STACKTOP = sp; //@line 4693
 return 0; //@line 4693
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 950
 HEAP32[$0 >> 2] = 392; //@line 951
 $1 = HEAP32[2341] | 0; //@line 952
 do {
  if (!$1) {
   HEAP32[2341] = 9368; //@line 956
  } else {
   if (($1 | 0) != 9368) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 960
    _mbed_assert_internal(3023, 3043, 93); //@line 961
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
   $8 = HEAP32[2340] | 0; //@line 981
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2340] = HEAP32[$0 + 4 >> 2]; //@line 986
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
 $17 = HEAP32[2341] | 0; //@line 1006
 do {
  if (!$17) {
   HEAP32[2341] = 9368; //@line 1010
  } else {
   if (($17 | 0) != 9368) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1014
    _mbed_assert_internal(3023, 3043, 93); //@line 1015
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
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 9054
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 9060
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 9066
   } else {
    $7 = $1 & 255; //@line 9068
    $$03039 = $0; //@line 9069
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 9071
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 9076
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 9079
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 9084
      break;
     } else {
      $$03039 = $13; //@line 9087
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 9091
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 9092
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 9100
     $25 = $18; //@line 9100
     while (1) {
      $24 = $25 ^ $17; //@line 9102
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 9109
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 9112
      $25 = HEAP32[$31 >> 2] | 0; //@line 9113
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 9122
       break;
      } else {
       $$02936 = $31; //@line 9120
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 9127
    }
   } while (0);
   $38 = $1 & 255; //@line 9130
   $$1 = $$029$lcssa; //@line 9131
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 9133
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 9139
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 9142
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 9147
}
function __ZN4mbed8FileBaseD0Ev__async_cb_22($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $23 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3181
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3183
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2340] | 0; //@line 3189
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2340] = HEAP32[$2 + 4 >> 2]; //@line 3194
    break;
   } else {
    $$0$i = $6; //@line 3197
   }
   do {
    $10 = $$0$i + 4 | 0; //@line 3200
    $$0$i = HEAP32[$10 >> 2] | 0; //@line 3201
   } while (($$0$i | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 3211
  }
 } while (0);
 $15 = HEAP32[2341] | 0; //@line 3214
 if (!$15) {
  HEAP32[2341] = 9368; //@line 3217
 } else {
  if (($15 | 0) != 9368) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 3221
   _mbed_assert_internal(3023, 3043, 93); //@line 3222
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 3225
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 3226
    HEAP32[$18 >> 2] = $2; //@line 3227
    sp = STACKTOP; //@line 3228
    return;
   }
   ___async_unwind = 0; //@line 3231
   HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 3232
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 3233
   HEAP32[$18 >> 2] = $2; //@line 3234
   sp = STACKTOP; //@line 3235
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 3243
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 3247
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 3248
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 3251
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 3252
  HEAP32[$23 >> 2] = $2; //@line 3253
  sp = STACKTOP; //@line 3254
  return;
 }
 ___async_unwind = 0; //@line 3257
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 3258
 $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 3259
 HEAP32[$23 >> 2] = $2; //@line 3260
 sp = STACKTOP; //@line 3261
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 8576
 $4 = HEAP32[$3 >> 2] | 0; //@line 8577
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 8584
   label = 5; //@line 8585
  } else {
   $$1 = 0; //@line 8587
  }
 } else {
  $12 = $4; //@line 8591
  label = 5; //@line 8592
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 8596
   $10 = HEAP32[$9 >> 2] | 0; //@line 8597
   $14 = $10; //@line 8600
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 8605
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 8613
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 8617
       $$141 = $0; //@line 8617
       $$143 = $1; //@line 8617
       $31 = $14; //@line 8617
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 8620
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 8627
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 8632
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 8635
      break L5;
     }
     $$139 = $$038; //@line 8641
     $$141 = $0 + $$038 | 0; //@line 8641
     $$143 = $1 - $$038 | 0; //@line 8641
     $31 = HEAP32[$9 >> 2] | 0; //@line 8641
    } else {
     $$139 = 0; //@line 8643
     $$141 = $0; //@line 8643
     $$143 = $1; //@line 8643
     $31 = $14; //@line 8643
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 8646
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 8649
   $$1 = $$139 + $$143 | 0; //@line 8651
  }
 } while (0);
 return $$1 | 0; //@line 8654
}
function _main__async_cb_90($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0.0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8762
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8764
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8766
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8768
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8770
 __ZN6C128323clsEv(9556); //@line 8771
 $9 = +__ZN5Sht3115readTemperatureEv(14353); //@line 8772
 $10 = +__ZN5Sht3112readHumidityEv(14353); //@line 8773
 __ZN6C128326locateEii(9556, 3, 3); //@line 8774
 HEAPF64[$2 >> 3] = $9; //@line 8776
 __ZN4mbed6Stream6printfEPKcz(9556, 6280, $2) | 0; //@line 8777
 __ZN6C128326locateEii(9556, 3, 13); //@line 8778
 HEAPF64[$6 >> 3] = $10; //@line 8780
 __ZN4mbed6Stream6printfEPKcz(9556, 6300, $6) | 0; //@line 8781
 _emscripten_asm_const_iii(2, HEAP32[3435] | 0, $9 > 25.0 | 0) | 0; //@line 8785
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 8786
 _wait(.5); //@line 8787
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 8790
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 8791
  HEAP32[$16 >> 2] = $2; //@line 8792
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 8793
  HEAP32[$17 >> 2] = $4; //@line 8794
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 8795
  HEAP32[$18 >> 2] = $6; //@line 8796
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 8797
  HEAP32[$19 >> 2] = $8; //@line 8798
  sp = STACKTOP; //@line 8799
  return;
 }
 ___async_unwind = 0; //@line 8802
 HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 8803
 $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 8804
 HEAP32[$16 >> 2] = $2; //@line 8805
 $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 8806
 HEAP32[$17 >> 2] = $4; //@line 8807
 $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 8808
 HEAP32[$18 >> 2] = $6; //@line 8809
 $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 8810
 HEAP32[$19 >> 2] = $8; //@line 8811
 sp = STACKTOP; //@line 8812
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0.0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8705
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8707
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8709
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8711
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8713
 __ZN6C128323clsEv(9556); //@line 8714
 $9 = +__ZN5Sht3115readTemperatureEv(14353); //@line 8715
 $10 = +__ZN5Sht3112readHumidityEv(14353); //@line 8716
 __ZN6C128326locateEii(9556, 3, 3); //@line 8717
 HEAPF64[$2 >> 3] = $9; //@line 8719
 __ZN4mbed6Stream6printfEPKcz(9556, 6280, $2) | 0; //@line 8720
 __ZN6C128326locateEii(9556, 3, 13); //@line 8721
 HEAPF64[$6 >> 3] = $10; //@line 8723
 __ZN4mbed6Stream6printfEPKcz(9556, 6300, $6) | 0; //@line 8724
 _emscripten_asm_const_iii(2, HEAP32[3435] | 0, $9 > 25.0 | 0) | 0; //@line 8728
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 8729
 _wait(.5); //@line 8730
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 8733
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 8734
  HEAP32[$16 >> 2] = $2; //@line 8735
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 8736
  HEAP32[$17 >> 2] = $4; //@line 8737
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 8738
  HEAP32[$18 >> 2] = $6; //@line 8739
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 8740
  HEAP32[$19 >> 2] = $8; //@line 8741
  sp = STACKTOP; //@line 8742
  return;
 }
 ___async_unwind = 0; //@line 8745
 HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 8746
 $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 8747
 HEAP32[$16 >> 2] = $2; //@line 8748
 $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 8749
 HEAP32[$17 >> 2] = $4; //@line 8750
 $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 8751
 HEAP32[$18 >> 2] = $6; //@line 8752
 $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 8753
 HEAP32[$19 >> 2] = $8; //@line 8754
 sp = STACKTOP; //@line 8755
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
 sp = STACKTOP; //@line 3908
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3911
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3912
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3913
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 3916
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3918
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3920
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3922
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3924
  sp = STACKTOP; //@line 3925
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3928
 $13 = Math_imul($4, $3) | 0; //@line 3929
 if (($13 | 0) <= 0) {
  return;
 }
 $$011 = 0; //@line 3934
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 3938
  $19 = HEAP32[$5 + ($$011 << 2) >> 2] | 0; //@line 3940
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3941
  FUNCTION_TABLE_vii[$17 & 7]($0, $19); //@line 3942
  if (___async) {
   label = 7; //@line 3945
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3948
  $25 = $$011 + 1 | 0; //@line 3949
  if (($25 | 0) == ($13 | 0)) {
   label = 5; //@line 3952
   break;
  } else {
   $$011 = $25; //@line 3955
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 141; //@line 3962
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$011; //@line 3964
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 3966
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 3968
  HEAP32[$AsyncCtx3 + 16 >> 2] = $5; //@line 3970
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 3972
  sp = STACKTOP; //@line 3973
  return;
 }
}
function __ZN11TextDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $13 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4532
 STACKTOP = STACKTOP + 16 | 0; //@line 4533
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4533
 $vararg_buffer = sp; //@line 4534
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4535
 __ZN4mbed6StreamC2EPKc($0, $1); //@line 4536
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 160; //@line 4539
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4541
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 4543
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 4545
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 4547
  sp = STACKTOP; //@line 4548
  STACKTOP = sp; //@line 4549
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4551
 HEAP32[$0 >> 2] = 968; //@line 4552
 HEAP32[$0 + 4 >> 2] = 1100; //@line 4554
 HEAP16[$0 + 26 >> 1] = 0; //@line 4556
 HEAP16[$0 + 24 >> 1] = 0; //@line 4558
 if (!$1) {
  HEAP32[$0 + 32 >> 2] = 0; //@line 4562
  STACKTOP = sp; //@line 4563
  return;
 }
 $12 = (_strlen($1) | 0) + 2 | 0; //@line 4566
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4567
 $13 = __Znaj($12) | 0; //@line 4568
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 161; //@line 4571
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4573
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 4575
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 4577
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 4579
  sp = STACKTOP; //@line 4580
  STACKTOP = sp; //@line 4581
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4583
 HEAP32[$0 + 32 >> 2] = $13; //@line 4585
 HEAP32[$vararg_buffer >> 2] = $1; //@line 4586
 _sprintf($13, 6054, $vararg_buffer) | 0; //@line 4587
 STACKTOP = sp; //@line 4588
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3928
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3932
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3934
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3936
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3938
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3939
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 3946
 $16 = HEAP32[$8 + ($15 << 2) >> 2] | 0; //@line 3948
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3949
 FUNCTION_TABLE_vii[$13 & 7]($10, $16); //@line 3950
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 3953
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 3954
  HEAP32[$17 >> 2] = $15; //@line 3955
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 3956
  HEAP32[$18 >> 2] = $4; //@line 3957
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 3958
  HEAP32[$19 >> 2] = $6; //@line 3959
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 3960
  HEAP32[$20 >> 2] = $8; //@line 3961
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 3962
  HEAP32[$21 >> 2] = $10; //@line 3963
  sp = STACKTOP; //@line 3964
  return;
 }
 ___async_unwind = 0; //@line 3967
 HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 3968
 $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 3969
 HEAP32[$17 >> 2] = $15; //@line 3970
 $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 3971
 HEAP32[$18 >> 2] = $4; //@line 3972
 $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 3973
 HEAP32[$19 >> 2] = $6; //@line 3974
 $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 3975
 HEAP32[$20 >> 2] = $8; //@line 3976
 $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 3977
 HEAP32[$21 >> 2] = $10; //@line 3978
 sp = STACKTOP; //@line 3979
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
 sp = STACKTOP; //@line 3832
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3835
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3836
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3837
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 3840
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3842
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3844
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3846
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3848
  sp = STACKTOP; //@line 3849
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3852
 $13 = Math_imul($4, $3) | 0; //@line 3853
 if (($13 | 0) <= 0) {
  return;
 }
 $$010 = 0; //@line 3858
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 3862
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3863
  FUNCTION_TABLE_vii[$17 & 7]($0, $5); //@line 3864
  if (___async) {
   label = 7; //@line 3867
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3870
  $23 = $$010 + 1 | 0; //@line 3871
  if (($23 | 0) == ($13 | 0)) {
   label = 5; //@line 3874
   break;
  } else {
   $$010 = $23; //@line 3877
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 139; //@line 3884
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$010; //@line 3886
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 3888
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 3890
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 3892
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 3894
  sp = STACKTOP; //@line 3895
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_91($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8888
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8892
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8894
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8896
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8898
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8900
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8902
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8904
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 8907
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 8908
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 8924
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 8925
    if (!___async) {
     ___async_unwind = 0; //@line 8928
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 209; //@line 8930
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 8932
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 8934
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 8936
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 8938
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 8940
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 8942
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 8944
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 8946
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 8949
    sp = STACKTOP; //@line 8950
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
 sp = STACKTOP; //@line 13153
 STACKTOP = STACKTOP + 48 | 0; //@line 13154
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 13154
 $vararg_buffer7 = sp + 24 | 0; //@line 13155
 $vararg_buffer3 = sp + 16 | 0; //@line 13156
 $vararg_buffer = sp; //@line 13157
 L1 : do {
  if (($0 | 0) == ($1 | 0)) {
   $$sink = -22; //@line 13161
  } else {
   $5 = ($2 & 524288 | 0) != 0; //@line 13164
   L3 : do {
    if ($5) {
     while (1) {
      HEAP32[$vararg_buffer >> 2] = $0; //@line 13168
      HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 13170
      HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 13172
      $6 = ___syscall330(330, $vararg_buffer | 0) | 0; //@line 13173
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
        $$sink = $6; //@line 13183
        break L1;
       }
      }
     }
    }
   } while (0);
   do {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 13191
    HEAP32[$vararg_buffer3 + 4 >> 2] = $1; //@line 13193
    $7 = ___syscall63(63, $vararg_buffer3 | 0) | 0; //@line 13194
   } while (($7 | 0) == -16);
   if ($5) {
    HEAP32[$vararg_buffer7 >> 2] = $1; //@line 13201
    HEAP32[$vararg_buffer7 + 4 >> 2] = 2; //@line 13203
    HEAP32[$vararg_buffer7 + 8 >> 2] = 1; //@line 13205
    ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 13206
    $$sink = $7; //@line 13207
   } else {
    $$sink = $7; //@line 13209
   }
  }
 } while (0);
 $9 = ___syscall_ret($$sink) | 0; //@line 13213
 STACKTOP = sp; //@line 13214
 return $9 | 0; //@line 13214
}
function __ZN4mbed8FileBaseD2Ev__async_cb_85($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8441
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8443
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2340] | 0; //@line 8449
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2340] = HEAP32[$2 + 4 >> 2]; //@line 8454
    break;
   } else {
    $$0 = $6; //@line 8457
   }
   do {
    $10 = $$0 + 4 | 0; //@line 8460
    $$0 = HEAP32[$10 >> 2] | 0; //@line 8461
   } while (($$0 | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 8471
  }
 } while (0);
 $15 = HEAP32[2341] | 0; //@line 8474
 if (!$15) {
  HEAP32[2341] = 9368; //@line 8477
 } else {
  if (($15 | 0) != 9368) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8481
   _mbed_assert_internal(3023, 3043, 93); //@line 8482
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 8485
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 8486
    HEAP32[$18 >> 2] = $2; //@line 8487
    sp = STACKTOP; //@line 8488
    return;
   }
   ___async_unwind = 0; //@line 8491
   HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 8492
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 8493
   HEAP32[$18 >> 2] = $2; //@line 8494
   sp = STACKTOP; //@line 8495
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 8506
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 8507
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 8510
  sp = STACKTOP; //@line 8511
  return;
 }
 ___async_unwind = 0; //@line 8514
 HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 8515
 sp = STACKTOP; //@line 8516
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
function __ZN11TextDisplay5_putcEi__async_cb_72($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $16 = 0, $17 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7698
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7702
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7704
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7706
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7708
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7710
 if ((HEAP32[___async_retval >> 2] | 0) > (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[___async_retval >> 2] = $4; //@line 7716
  return;
 }
 HEAP16[$6 >> 1] = 0; //@line 7719
 $16 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 7721
 HEAP16[$8 >> 1] = $16; //@line 7722
 $17 = $16 & 65535; //@line 7723
 $20 = HEAP32[(HEAP32[$10 >> 2] | 0) + 96 >> 2] | 0; //@line 7726
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 7727
 $21 = FUNCTION_TABLE_ii[$20 & 31]($12) | 0; //@line 7728
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 150; //@line 7731
  $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 7732
  HEAP32[$22 >> 2] = $17; //@line 7733
  $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 7734
  HEAP32[$23 >> 2] = $4; //@line 7735
  $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 7736
  HEAP32[$24 >> 2] = $8; //@line 7737
  sp = STACKTOP; //@line 7738
  return;
 }
 HEAP32[___async_retval >> 2] = $21; //@line 7742
 ___async_unwind = 0; //@line 7743
 HEAP32[$ReallocAsyncCtx4 >> 2] = 150; //@line 7744
 $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 7745
 HEAP32[$22 >> 2] = $17; //@line 7746
 $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 7747
 HEAP32[$23 >> 2] = $4; //@line 7748
 $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 7749
 HEAP32[$24 >> 2] = $8; //@line 7750
 sp = STACKTOP; //@line 7751
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb_41($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4353
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4355
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4357
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4359
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4361
 HEAP32[$2 >> 2] = 968; //@line 4362
 HEAP32[$2 + 4 >> 2] = 1100; //@line 4364
 HEAP16[$2 + 26 >> 1] = 0; //@line 4366
 HEAP16[$2 + 24 >> 1] = 0; //@line 4368
 if (!$4) {
  HEAP32[$2 + 32 >> 2] = 0; //@line 4372
  return;
 }
 $15 = (_strlen($4) | 0) + 2 | 0; //@line 4376
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 4377
 $16 = __Znaj($15) | 0; //@line 4378
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 4381
  $17 = $ReallocAsyncCtx + 4 | 0; //@line 4382
  HEAP32[$17 >> 2] = $2; //@line 4383
  $18 = $ReallocAsyncCtx + 8 | 0; //@line 4384
  HEAP32[$18 >> 2] = $6; //@line 4385
  $19 = $ReallocAsyncCtx + 12 | 0; //@line 4386
  HEAP32[$19 >> 2] = $4; //@line 4387
  $20 = $ReallocAsyncCtx + 16 | 0; //@line 4388
  HEAP32[$20 >> 2] = $8; //@line 4389
  sp = STACKTOP; //@line 4390
  return;
 }
 HEAP32[___async_retval >> 2] = $16; //@line 4394
 ___async_unwind = 0; //@line 4395
 HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 4396
 $17 = $ReallocAsyncCtx + 4 | 0; //@line 4397
 HEAP32[$17 >> 2] = $2; //@line 4398
 $18 = $ReallocAsyncCtx + 8 | 0; //@line 4399
 HEAP32[$18 >> 2] = $6; //@line 4400
 $19 = $ReallocAsyncCtx + 12 | 0; //@line 4401
 HEAP32[$19 >> 2] = $4; //@line 4402
 $20 = $ReallocAsyncCtx + 16 | 0; //@line 4403
 HEAP32[$20 >> 2] = $8; //@line 4404
 sp = STACKTOP; //@line 4405
 return;
}
function ___stdio_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$cast = 0, $11 = 0, $18 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8035
 STACKTOP = STACKTOP + 32 | 0; //@line 8036
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8036
 $vararg_buffer = sp; //@line 8037
 $3 = sp + 16 | 0; //@line 8038
 HEAP32[$3 >> 2] = $1; //@line 8039
 $4 = $3 + 4 | 0; //@line 8040
 $5 = $0 + 48 | 0; //@line 8041
 $6 = HEAP32[$5 >> 2] | 0; //@line 8042
 HEAP32[$4 >> 2] = $2 - (($6 | 0) != 0 & 1); //@line 8046
 $11 = $0 + 44 | 0; //@line 8048
 HEAP32[$3 + 8 >> 2] = HEAP32[$11 >> 2]; //@line 8050
 HEAP32[$3 + 12 >> 2] = $6; //@line 8052
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 8056
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 8058
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 8060
 $18 = ___syscall_ret(___syscall145(145, $vararg_buffer | 0) | 0) | 0; //@line 8062
 if (($18 | 0) < 1) {
  HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | $18 & 48 ^ 16; //@line 8069
  $$0 = $18; //@line 8070
 } else {
  $24 = HEAP32[$4 >> 2] | 0; //@line 8072
  if ($18 >>> 0 > $24 >>> 0) {
   $27 = HEAP32[$11 >> 2] | 0; //@line 8076
   $28 = $0 + 4 | 0; //@line 8077
   HEAP32[$28 >> 2] = $27; //@line 8078
   $$cast = $27; //@line 8079
   HEAP32[$0 + 8 >> 2] = $$cast + ($18 - $24); //@line 8082
   if (!(HEAP32[$5 >> 2] | 0)) {
    $$0 = $2; //@line 8086
   } else {
    HEAP32[$28 >> 2] = $$cast + 1; //@line 8089
    HEAP8[$1 + ($2 + -1) >> 0] = HEAP8[$$cast >> 0] | 0; //@line 8093
    $$0 = $2; //@line 8094
   }
  } else {
   $$0 = $18; //@line 8097
  }
 }
 STACKTOP = sp; //@line 8100
 return $$0 | 0; //@line 8100
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8462
 STACKTOP = STACKTOP + 16 | 0; //@line 8463
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8463
 $2 = sp; //@line 8464
 $3 = $1 & 255; //@line 8465
 HEAP8[$2 >> 0] = $3; //@line 8466
 $4 = $0 + 16 | 0; //@line 8467
 $5 = HEAP32[$4 >> 2] | 0; //@line 8468
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 8475
   label = 4; //@line 8476
  } else {
   $$0 = -1; //@line 8478
  }
 } else {
  $12 = $5; //@line 8481
  label = 4; //@line 8482
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 8486
   $10 = HEAP32[$9 >> 2] | 0; //@line 8487
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 8490
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 8497
     HEAP8[$10 >> 0] = $3; //@line 8498
     $$0 = $13; //@line 8499
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 8504
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8505
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 8506
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 167; //@line 8509
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 8511
    sp = STACKTOP; //@line 8512
    STACKTOP = sp; //@line 8513
    return 0; //@line 8513
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 8515
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 8520
   } else {
    $$0 = -1; //@line 8522
   }
  }
 } while (0);
 STACKTOP = sp; //@line 8526
 return $$0 | 0; //@line 8526
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 9991
 value = value & 255; //@line 9993
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 9996
   ptr = ptr + 1 | 0; //@line 9997
  }
  aligned_end = end & -4 | 0; //@line 10000
  block_aligned_end = aligned_end - 64 | 0; //@line 10001
  value4 = value | value << 8 | value << 16 | value << 24; //@line 10002
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 10005
   HEAP32[ptr + 4 >> 2] = value4; //@line 10006
   HEAP32[ptr + 8 >> 2] = value4; //@line 10007
   HEAP32[ptr + 12 >> 2] = value4; //@line 10008
   HEAP32[ptr + 16 >> 2] = value4; //@line 10009
   HEAP32[ptr + 20 >> 2] = value4; //@line 10010
   HEAP32[ptr + 24 >> 2] = value4; //@line 10011
   HEAP32[ptr + 28 >> 2] = value4; //@line 10012
   HEAP32[ptr + 32 >> 2] = value4; //@line 10013
   HEAP32[ptr + 36 >> 2] = value4; //@line 10014
   HEAP32[ptr + 40 >> 2] = value4; //@line 10015
   HEAP32[ptr + 44 >> 2] = value4; //@line 10016
   HEAP32[ptr + 48 >> 2] = value4; //@line 10017
   HEAP32[ptr + 52 >> 2] = value4; //@line 10018
   HEAP32[ptr + 56 >> 2] = value4; //@line 10019
   HEAP32[ptr + 60 >> 2] = value4; //@line 10020
   ptr = ptr + 64 | 0; //@line 10021
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 10025
   ptr = ptr + 4 | 0; //@line 10026
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 10031
  ptr = ptr + 1 | 0; //@line 10032
 }
 return end - num | 0; //@line 10034
}
function _mbed_error($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $5 = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2543
 STACKTOP = STACKTOP + 32 | 0; //@line 2544
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2544
 $5 = sp; //@line 2545
 if ((HEAP8[14352] | 0) == 1) {
  while (1) {}
 }
 HEAP8[14352] = 1; //@line 2554
 HEAP32[2351] = (HEAP32[2351] | 0) + 1; //@line 2557
 HEAP32[$5 >> 2] = ($0 | 0) > -1 ? -2130771711 : $0; //@line 2558
 HEAP32[$5 + 4 >> 2] = _llvm_returnaddress(0) | 0; //@line 2562
 HEAP32[$5 + 8 >> 2] = $2; //@line 2564
 HEAP32[2343] = HEAP32[$5 >> 2]; //@line 2565
 HEAP32[2344] = HEAP32[$5 + 4 >> 2]; //@line 2565
 HEAP32[2345] = HEAP32[$5 + 8 >> 2]; //@line 2565
 HEAP32[2346] = HEAP32[$5 + 12 >> 2]; //@line 2565
 HEAP32[2347] = HEAP32[$5 + 16 >> 2]; //@line 2565
 HEAP32[2348] = HEAP32[$5 + 20 >> 2]; //@line 2565
 HEAP32[2349] = HEAP32[$5 + 24 >> 2]; //@line 2565
 HEAP32[2350] = HEAP32[$5 + 28 >> 2]; //@line 2565
 _mbed_error_hist_put($5) | 0; //@line 2566
 HEAP8[14352] = 0; //@line 2567
 _print_error_report($1); //@line 2568
 if (!(_core_util_is_isr_active() | 0)) {
  if (_core_util_are_interrupts_enabled() | 0) {
   _emscripten_alloc_async_context(4, sp) | 0; //@line 2573
   _exit(1); //@line 2574
  }
 }
 while (1) {
  $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2579
  ___WFI(); //@line 2580
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2585
 }
 HEAP32[$AsyncCtx2 >> 2] = 106; //@line 2587
 sp = STACKTOP; //@line 2588
 STACKTOP = sp; //@line 2589
 return 0; //@line 2589
}
function _fflush__async_cb_89($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8634
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8636
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8638
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 8642
  } else {
   $$02327 = $$02325; //@line 8644
   $$02426 = $AsyncRetVal; //@line 8644
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 8651
    } else {
     $16 = 0; //@line 8653
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 8665
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8668
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 8671
     break L3;
    } else {
     $$02327 = $$023; //@line 8674
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8677
   $13 = ___fflush_unlocked($$02327) | 0; //@line 8678
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 8682
    ___async_unwind = 0; //@line 8683
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 173; //@line 8685
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 8687
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 8689
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 8691
   sp = STACKTOP; //@line 8692
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 8696
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 8698
 return;
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $19 = 0, $3 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3683
 $1 = HEAP32[$0 >> 2] | 0; //@line 3684
 $3 = HEAP32[$1 + 144 >> 2] | 0; //@line 3686
 $5 = HEAP32[$1 + 128 >> 2] | 0; //@line 3688
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3689
 $6 = FUNCTION_TABLE_ii[$5 & 31]($0) | 0; //@line 3690
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 134; //@line 3693
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3695
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 3697
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 3699
  sp = STACKTOP; //@line 3700
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3703
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3706
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3707
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 3708
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 135; //@line 3711
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 3713
  HEAP32[$AsyncCtx2 + 8 >> 2] = $6; //@line 3715
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 3717
  sp = STACKTOP; //@line 3718
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3721
 $19 = HEAPU16[$0 + 30 >> 1] | 0; //@line 3724
 $AsyncCtx5 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3725
 FUNCTION_TABLE_viiiiii[$3 & 7]($0, 0, 0, $6, $13, $19); //@line 3726
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 136; //@line 3729
  sp = STACKTOP; //@line 3730
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 3733
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
 $6 = HEAP32[2341] | 0; //@line 1167
 do {
  if (!$6) {
   HEAP32[2341] = 9368; //@line 1171
  } else {
   if (($6 | 0) != 9368) {
    $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1175
    _mbed_assert_internal(3023, 3043, 93); //@line 1176
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
  HEAP32[$3 >> 2] = HEAP32[2340]; //@line 1200
  HEAP32[2340] = $0; //@line 1201
 }
 $14 = HEAP32[2341] | 0; //@line 1203
 if (!$14) {
  HEAP32[2341] = 9368; //@line 1206
  return;
 }
 if (($14 | 0) == 9368) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1213
 _mbed_assert_internal(3023, 3043, 93); //@line 1214
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
 sp = STACKTOP; //@line 8825
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8829
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8831
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8833
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8835
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8837
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8839
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 8842
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 8843
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 8852
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 8853
    if (!___async) {
     ___async_unwind = 0; //@line 8856
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 210; //@line 8858
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 8860
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 8862
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 8864
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 8866
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8868
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 8870
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 8872
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 8875
    sp = STACKTOP; //@line 8876
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8535
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 8545
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 8545
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 8545
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 8549
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 8552
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 8555
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 8563
  } else {
   $20 = 0; //@line 8565
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 8575
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 8579
  HEAP32[___async_retval >> 2] = $$1; //@line 8581
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8584
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 8585
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 8589
  ___async_unwind = 0; //@line 8590
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 173; //@line 8592
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 8594
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 8596
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 8598
 sp = STACKTOP; //@line 8599
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
 $7 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, 2454) | 0; //@line 1713
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
 _mbed_error(-2147417831, 2457, 0, 0, 0) | 0; //@line 1730
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
 sp = STACKTOP; //@line 2448
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2450
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2452
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2454
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 2459
  } else {
   $9 = $4 + 4 | 0; //@line 2461
   $10 = HEAP32[$9 >> 2] | 0; //@line 2462
   $11 = $4 + 8 | 0; //@line 2463
   $12 = HEAP32[$11 >> 2] | 0; //@line 2464
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 2468
    HEAP32[$6 >> 2] = 0; //@line 2469
    HEAP32[$2 >> 2] = 0; //@line 2470
    HEAP32[$11 >> 2] = 0; //@line 2471
    HEAP32[$9 >> 2] = 0; //@line 2472
    $$0 = 0; //@line 2473
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 2480
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2481
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 2482
   if (!___async) {
    ___async_unwind = 0; //@line 2485
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 175; //@line 2487
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 2489
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2491
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 2493
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 2495
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 2497
   sp = STACKTOP; //@line 2498
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2503
 return;
}
function _fopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $11 = 0, $15 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 8808
 STACKTOP = STACKTOP + 48 | 0; //@line 8809
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 8809
 $vararg_buffer8 = sp + 32 | 0; //@line 8810
 $vararg_buffer3 = sp + 16 | 0; //@line 8811
 $vararg_buffer = sp; //@line 8812
 if (!(_strchr(6352, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8819
  $$0 = 0; //@line 8820
 } else {
  $7 = ___fmodeflags($1) | 0; //@line 8822
  HEAP32[$vararg_buffer >> 2] = $0; //@line 8825
  HEAP32[$vararg_buffer + 4 >> 2] = $7 | 32768; //@line 8827
  HEAP32[$vararg_buffer + 8 >> 2] = 438; //@line 8829
  $11 = ___syscall_ret(___syscall5(5, $vararg_buffer | 0) | 0) | 0; //@line 8831
  if (($11 | 0) < 0) {
   $$0 = 0; //@line 8834
  } else {
   if ($7 & 524288 | 0) {
    HEAP32[$vararg_buffer3 >> 2] = $11; //@line 8839
    HEAP32[$vararg_buffer3 + 4 >> 2] = 2; //@line 8841
    HEAP32[$vararg_buffer3 + 8 >> 2] = 1; //@line 8843
    ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8844
   }
   $15 = ___fdopen($11, $1) | 0; //@line 8846
   if (!$15) {
    HEAP32[$vararg_buffer8 >> 2] = $11; //@line 8849
    ___syscall6(6, $vararg_buffer8 | 0) | 0; //@line 8850
    $$0 = 0; //@line 8851
   } else {
    $$0 = $15; //@line 8853
   }
  }
 }
 STACKTOP = sp; //@line 8857
 return $$0 | 0; //@line 8857
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3296
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3298
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3300
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3302
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3306
  return;
 }
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 3311
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 3312
 $10 = FUNCTION_TABLE_iiii[$9 & 15]($4, 0, 2) | 0; //@line 3313
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 3316
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 3317
  HEAP32[$11 >> 2] = $2; //@line 3318
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 3319
  HEAP32[$12 >> 2] = $4; //@line 3320
  $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 3321
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 3322
  sp = STACKTOP; //@line 3323
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 3327
 ___async_unwind = 0; //@line 3328
 HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 3329
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 3330
 HEAP32[$11 >> 2] = $2; //@line 3331
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 3332
 HEAP32[$12 >> 2] = $4; //@line 3333
 $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 3334
 HEAP32[$13 >> 2] = $AsyncRetVal; //@line 3335
 sp = STACKTOP; //@line 3336
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 12160
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 12165
    $$0 = 1; //@line 12166
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 12179
     $$0 = 1; //@line 12180
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 12184
     $$0 = -1; //@line 12185
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 12195
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 12199
    $$0 = 2; //@line 12200
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 12212
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 12218
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 12222
    $$0 = 3; //@line 12223
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 12233
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 12239
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 12245
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 12249
    $$0 = 4; //@line 12250
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 12254
    $$0 = -1; //@line 12255
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12260
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 2199
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2201
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2203
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2205
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2207
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 2212
  return;
 }
 dest = $2 + 4 | 0; //@line 2216
 stop = dest + 52 | 0; //@line 2216
 do {
  HEAP32[dest >> 2] = 0; //@line 2216
  dest = dest + 4 | 0; //@line 2216
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 2217
 HEAP32[$2 + 8 >> 2] = $4; //@line 2219
 HEAP32[$2 + 12 >> 2] = -1; //@line 2221
 HEAP32[$2 + 48 >> 2] = 1; //@line 2223
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 2226
 $16 = HEAP32[$6 >> 2] | 0; //@line 2227
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2228
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 2229
 if (!___async) {
  ___async_unwind = 0; //@line 2232
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 195; //@line 2234
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 2236
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 2238
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 2240
 sp = STACKTOP; //@line 2241
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_92($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8961
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8965
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8967
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8969
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8971
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8973
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 8976
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 8977
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 8983
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 8984
   if (!___async) {
    ___async_unwind = 0; //@line 8987
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 208; //@line 8989
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 8991
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 8993
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 8995
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 8997
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 8999
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 9001
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 9004
   sp = STACKTOP; //@line 9005
   return;
  }
 }
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$$sroa_idx = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2862
 STACKTOP = STACKTOP + 16 | 0; //@line 2863
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2863
 $2 = sp; //@line 2864
 HEAP8[$2 >> 0] = 58; //@line 2865
 $$0$$sroa_idx = $2 + 1 | 0; //@line 2866
 HEAP8[$$0$$sroa_idx >> 0] = $0; //@line 2867
 HEAP8[$$0$$sroa_idx + 1 >> 0] = $0 >> 8; //@line 2867
 HEAP8[$$0$$sroa_idx + 2 >> 0] = $0 >> 16; //@line 2867
 HEAP8[$$0$$sroa_idx + 3 >> 0] = $0 >> 24; //@line 2867
 $3 = _fopen($2, $1) | 0; //@line 2868
 if (!$3) {
  STACKTOP = sp; //@line 2871
  return $3 | 0; //@line 2871
 }
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 28 >> 2] | 0; //@line 2875
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2876
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 2877
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 115; //@line 2880
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2882
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 2884
  sp = STACKTOP; //@line 2885
  STACKTOP = sp; //@line 2886
  return 0; //@line 2886
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2888
 if (!$8) {
  STACKTOP = sp; //@line 2891
  return $3 | 0; //@line 2891
 }
 _setbuf($3, 0); //@line 2893
 STACKTOP = sp; //@line 2894
 return $3 | 0; //@line 2894
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 11044
  $8 = $0; //@line 11044
  $9 = $1; //@line 11044
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 11046
   $$0914 = $$0914 + -1 | 0; //@line 11050
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 11051
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 11052
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 11060
   }
  }
  $$010$lcssa$off0 = $8; //@line 11065
  $$09$lcssa = $$0914; //@line 11065
 } else {
  $$010$lcssa$off0 = $0; //@line 11067
  $$09$lcssa = $2; //@line 11067
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 11071
 } else {
  $$012 = $$010$lcssa$off0; //@line 11073
  $$111 = $$09$lcssa; //@line 11073
  while (1) {
   $26 = $$111 + -1 | 0; //@line 11078
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 11079
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 11083
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 11086
    $$111 = $26; //@line 11086
   }
  }
 }
 return $$1$lcssa | 0; //@line 11090
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0) {
 $0 = $0 | 0;
 var $1 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2767
 $1 = HEAP32[2387] | 0; //@line 2768
 do {
  if (!$1) {
   HEAP32[2387] = 9552; //@line 2772
  } else {
   if (($1 | 0) != 9552) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2776
    _mbed_assert_internal(3023, 3043, 93); //@line 2777
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 112; //@line 2780
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2782
     sp = STACKTOP; //@line 2783
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2786
     break;
    }
   }
  }
 } while (0);
 if ((HEAP32[465] | 0) == ($0 | 0)) {
  HEAP32[465] = 0; //@line 2795
 }
 if ((HEAP32[466] | 0) == ($0 | 0)) {
  HEAP32[466] = 0; //@line 2800
 }
 if ((HEAP32[467] | 0) == ($0 | 0)) {
  HEAP32[467] = 0; //@line 2805
 }
 $8 = HEAP32[2387] | 0; //@line 2807
 if (!$8) {
  HEAP32[2387] = 9552; //@line 2810
  return;
 }
 if (($8 | 0) == 9552) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2817
 _mbed_assert_internal(3023, 3043, 93); //@line 2818
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 113; //@line 2821
  sp = STACKTOP; //@line 2822
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2825
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $12 = 0, $13 = 0, $3 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4280
 $3 = HEAP32[$0 + 32 >> 2] | 0; //@line 4282
 if (!$3) {
  _fwrite(5911, 85, 1, HEAP32[277] | 0) | 0; //@line 4286
  $$0 = 0; //@line 4287
  return $$0 | 0; //@line 4288
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4290
 $6 = _freopen($3, 5997, $1) | 0; //@line 4291
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 151; //@line 4294
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4296
  sp = STACKTOP; //@line 4297
  return 0; //@line 4298
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4300
 if (!$6) {
  $$0 = 0; //@line 4303
  return $$0 | 0; //@line 4304
 }
 $9 = HEAP32[309] | 0; //@line 4306
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4309
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4310
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 4311
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 152; //@line 4314
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 4316
  sp = STACKTOP; //@line 4317
  return 0; //@line 4318
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4320
 _setvbuf($9, 0, 1, $13) | 0; //@line 4321
 $$0 = 1; //@line 4322
 return $$0 | 0; //@line 4323
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8297
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8299
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8303
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8305
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8307
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8309
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 8313
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 8316
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 8317
   if (!___async) {
    ___async_unwind = 0; //@line 8320
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 212; //@line 8322
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8324
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 8326
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 8328
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 8330
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8332
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 8334
   sp = STACKTOP; //@line 8335
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 8190
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 8195
   label = 4; //@line 8196
  } else {
   $$01519 = $0; //@line 8198
   $23 = $1; //@line 8198
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 8203
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 8206
    $23 = $6; //@line 8207
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 8211
     label = 4; //@line 8212
     break;
    } else {
     $$01519 = $6; //@line 8215
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 8221
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 8223
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 8231
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 8239
  } else {
   $$pn = $$0; //@line 8241
   while (1) {
    $19 = $$pn + 1 | 0; //@line 8243
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 8247
     break;
    } else {
     $$pn = $19; //@line 8250
    }
   }
  }
  $$sink = $$1$lcssa; //@line 8255
 }
 return $$sink - $1 | 0; //@line 8258
}
function __ZN15GraphicsDisplay4putpEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $15 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3772
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 3775
 $5 = $0 + 36 | 0; //@line 3776
 $7 = HEAP16[$5 >> 1] | 0; //@line 3778
 $8 = $0 + 38 | 0; //@line 3779
 $10 = HEAP16[$8 >> 1] | 0; //@line 3781
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3782
 FUNCTION_TABLE_viiii[$4 & 7]($0, $7, $10, $1); //@line 3783
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 3786
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 3788
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 3790
  HEAP32[$AsyncCtx + 12 >> 2] = $8; //@line 3792
  sp = STACKTOP; //@line 3793
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3796
 $15 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 3798
 HEAP16[$5 >> 1] = $15; //@line 3799
 if ($15 << 16 >> 16 <= (HEAP16[$0 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$5 >> 1] = HEAP16[$0 + 40 >> 1] | 0; //@line 3808
 $22 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 3810
 HEAP16[$8 >> 1] = $22; //@line 3811
 if ($22 << 16 >> 16 <= (HEAP16[$0 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$8 >> 1] = HEAP16[$0 + 44 >> 1] | 0; //@line 3820
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 569
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 576
   $10 = $1 + 16 | 0; //@line 577
   $11 = HEAP32[$10 >> 2] | 0; //@line 578
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 581
    HEAP32[$1 + 24 >> 2] = $4; //@line 583
    HEAP32[$1 + 36 >> 2] = 1; //@line 585
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 595
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 600
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 603
    HEAP8[$1 + 54 >> 0] = 1; //@line 605
    break;
   }
   $21 = $1 + 24 | 0; //@line 608
   $22 = HEAP32[$21 >> 2] | 0; //@line 609
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 612
    $28 = $4; //@line 613
   } else {
    $28 = $22; //@line 615
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 624
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_46($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5170
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5172
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5174
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5176
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 5181
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5183
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 5188
 $16 = _snprintf($4, $6, 2157, $2) | 0; //@line 5189
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 5191
 $19 = $4 + $$18 | 0; //@line 5193
 $20 = $6 - $$18 | 0; //@line 5194
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 2235, $12) | 0; //@line 5202
  }
 }
 $23 = HEAP32[91] | 0; //@line 5205
 $24 = HEAP32[84] | 0; //@line 5206
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 5207
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 5208
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 5211
  sp = STACKTOP; //@line 5212
  return;
 }
 ___async_unwind = 0; //@line 5215
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 5216
 sp = STACKTOP; //@line 5217
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_83($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8345
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8351
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8353
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8355
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8357
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 8362
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 8364
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 8365
 if (!___async) {
  ___async_unwind = 0; //@line 8368
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 212; //@line 8370
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 8372
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 8374
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 8376
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 8378
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 8380
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 8382
 sp = STACKTOP; //@line 8383
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4
 $1 = HEAP32[309] | 0; //@line 5
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 11
 } else {
  $19 = 0; //@line 13
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 19
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 25
    $12 = HEAP32[$11 >> 2] | 0; //@line 26
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 32
     HEAP8[$12 >> 0] = 10; //@line 33
     $22 = 0; //@line 34
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 38
   $17 = ___overflow($1, 10) | 0; //@line 39
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 187; //@line 42
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 44
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 46
    sp = STACKTOP; //@line 47
    return 0; //@line 48
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 50
    $22 = $17 >> 31; //@line 52
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 59
 }
 return $22 | 0; //@line 61
}
function __ZN11TextDisplay5_putcEi__async_cb_71($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7654
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7656
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7658
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7660
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7662
 $10 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 7664
 HEAP16[$2 >> 1] = $10; //@line 7665
 $14 = HEAP32[(HEAP32[$4 >> 2] | 0) + 100 >> 2] | 0; //@line 7669
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(28) | 0; //@line 7670
 $15 = FUNCTION_TABLE_ii[$14 & 31]($4) | 0; //@line 7671
 if (!___async) {
  HEAP32[___async_retval >> 2] = $15; //@line 7675
  ___async_unwind = 0; //@line 7676
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 149; //@line 7678
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $10 & 65535; //@line 7680
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 7682
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 7684
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 7686
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 7688
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $4; //@line 7690
 sp = STACKTOP; //@line 7691
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7934
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7936
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7938
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7940
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 7942
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 7944
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 8918; //@line 7949
  HEAP32[$4 + 4 >> 2] = $6; //@line 7951
  _abort_message(8827, $4); //@line 7952
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 7955
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 7958
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 7959
 $16 = FUNCTION_TABLE_ii[$15 & 31]($12) | 0; //@line 7960
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 7964
  ___async_unwind = 0; //@line 7965
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 191; //@line 7967
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 7969
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 7971
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 7973
 sp = STACKTOP; //@line 7974
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 12280
 while (1) {
  if ((HEAPU8[6890 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 12287
   break;
  }
  $7 = $$016 + 1 | 0; //@line 12290
  if (($7 | 0) == 87) {
   $$01214 = 6978; //@line 12293
   $$115 = 87; //@line 12293
   label = 5; //@line 12294
   break;
  } else {
   $$016 = $7; //@line 12297
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 6978; //@line 12303
  } else {
   $$01214 = 6978; //@line 12305
   $$115 = $$016; //@line 12305
   label = 5; //@line 12306
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 12311
   $$113 = $$01214; //@line 12312
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 12316
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 12323
   if (!$$115) {
    $$012$lcssa = $$113; //@line 12326
    break;
   } else {
    $$01214 = $$113; //@line 12329
    label = 5; //@line 12330
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 12337
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7782
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7784
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7786
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7790
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 7794
  label = 4; //@line 7795
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 7800
   label = 4; //@line 7801
  } else {
   $$037$off039 = 3; //@line 7803
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 7807
  $17 = $8 + 40 | 0; //@line 7808
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 7811
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 7821
    $$037$off039 = $$037$off038; //@line 7822
   } else {
    $$037$off039 = $$037$off038; //@line 7824
   }
  } else {
   $$037$off039 = $$037$off038; //@line 7827
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 7830
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 428
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 437
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 442
      HEAP32[$13 >> 2] = $2; //@line 443
      $19 = $1 + 40 | 0; //@line 444
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 447
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 457
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 461
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 468
    }
   }
  }
 } while (0);
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 12353
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 12357
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 12360
   if (!$5) {
    $$0 = 0; //@line 12363
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 12369
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 12375
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 12382
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 12389
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 12396
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 12403
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 12410
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 12414
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 12424
}
function __ZN4mbed6Stream4putcEi__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4053
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4055
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4057
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4059
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 4062
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 4063
 $10 = FUNCTION_TABLE_iii[$9 & 7]($2, $4) | 0; //@line 4064
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 4067
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 4068
  HEAP32[$11 >> 2] = $6; //@line 4069
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 4070
  HEAP32[$12 >> 2] = $2; //@line 4071
  sp = STACKTOP; //@line 4072
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 4076
 ___async_unwind = 0; //@line 4077
 HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 4078
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 4079
 HEAP32[$11 >> 2] = $6; //@line 4080
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 4081
 HEAP32[$12 >> 2] = $2; //@line 4082
 sp = STACKTOP; //@line 4083
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 12549
 $32 = $0 + 3 | 0; //@line 12563
 $33 = HEAP8[$32 >> 0] | 0; //@line 12564
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 12566
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 12571
  $$sink21$lcssa = $32; //@line 12571
 } else {
  $$sink2123 = $32; //@line 12573
  $39 = $35; //@line 12573
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 12576
   $41 = HEAP8[$40 >> 0] | 0; //@line 12577
   $39 = $39 << 8 | $41 & 255; //@line 12579
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 12584
    $$sink21$lcssa = $40; //@line 12584
    break;
   } else {
    $$sink2123 = $40; //@line 12587
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 12594
}
function __ZN11TextDisplay3clsEv__async_cb_32($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3769
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3771
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3773
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3775
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3777
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3779
 $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 3782
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 3783
 $13 = FUNCTION_TABLE_ii[$12 & 31]($4) | 0; //@line 3784
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 3788
  ___async_unwind = 0; //@line 3789
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 158; //@line 3791
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $AsyncRetVal; //@line 3793
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 3795
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 3797
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 3799
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $4; //@line 3801
 sp = STACKTOP; //@line 3802
 return;
}
function _mbed_vtracef__async_cb_52($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5555
 $3 = HEAP32[92] | 0; //@line 5559
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[84] | 0; //@line 5563
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5564
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 5565
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 5568
   sp = STACKTOP; //@line 5569
   return;
  }
  ___async_unwind = 0; //@line 5572
  HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 5573
  sp = STACKTOP; //@line 5574
  return;
 } else {
  $6 = HEAP32[91] | 0; //@line 5577
  $7 = HEAP32[84] | 0; //@line 5578
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 5579
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 5580
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 42; //@line 5583
   sp = STACKTOP; //@line 5584
   return;
  }
  ___async_unwind = 0; //@line 5587
  HEAP32[$ReallocAsyncCtx4 >> 2] = 42; //@line 5588
  sp = STACKTOP; //@line 5589
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2702
 $2 = $0 + 12 | 0; //@line 2704
 $3 = HEAP32[$2 >> 2] | 0; //@line 2705
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2709
   _mbed_assert_internal(2934, 2939, 528); //@line 2710
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 110; //@line 2713
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2715
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2717
    sp = STACKTOP; //@line 2718
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2721
    $8 = HEAP32[$2 >> 2] | 0; //@line 2723
    break;
   }
  } else {
   $8 = $3; //@line 2727
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2730
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2732
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 2733
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 2736
  sp = STACKTOP; //@line 2737
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2740
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5597
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5599
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5603
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5605
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5607
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5609
 HEAP32[$2 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 5610
 _memset($6 | 0, 0, 4096) | 0; //@line 5611
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 5612
 $13 = _vsprintf($6, $8, $2) | 0; //@line 5613
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 5617
  ___async_unwind = 0; //@line 5618
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 81; //@line 5620
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 5622
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 5624
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 5626
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 5628
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $6; //@line 5630
 sp = STACKTOP; //@line 5631
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_58($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5996
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6000
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6002
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6004
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6006
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 6007
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 6014
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6015
 FUNCTION_TABLE_vii[$13 & 7]($8, $10); //@line 6016
 if (!___async) {
  ___async_unwind = 0; //@line 6019
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 139; //@line 6021
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 6023
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 6025
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 6027
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 6029
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 6031
 sp = STACKTOP; //@line 6032
 return;
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 12483
 $23 = $0 + 2 | 0; //@line 12492
 $24 = HEAP8[$23 >> 0] | 0; //@line 12493
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 12496
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 12501
  $$lcssa = $24; //@line 12501
 } else {
  $$01618 = $23; //@line 12503
  $$019 = $27; //@line 12503
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 12505
   $31 = HEAP8[$30 >> 0] | 0; //@line 12506
   $$019 = ($$019 | $31 & 255) << 8; //@line 12509
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 12514
    $$lcssa = $31; //@line 12514
    break;
   } else {
    $$01618 = $30; //@line 12517
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 12524
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 12111
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 12111
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 12112
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 12113
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 12122
    $$016 = $9; //@line 12125
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 12125
   } else {
    $$016 = $0; //@line 12127
    $storemerge = 0; //@line 12127
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 12129
   $$0 = $$016; //@line 12130
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 12134
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 12140
   HEAP32[tempDoublePtr >> 2] = $2; //@line 12143
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 12143
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 12144
  }
 }
 return +$$0;
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 261
 STACKTOP = STACKTOP + 16 | 0; //@line 262
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 262
 $1 = sp; //@line 263
 HEAP32[$1 >> 2] = $varargs; //@line 264
 $2 = HEAP32[277] | 0; //@line 265
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 266
 _vfprintf($2, $0, $1) | 0; //@line 267
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 192; //@line 270
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 272
  sp = STACKTOP; //@line 273
  STACKTOP = sp; //@line 274
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 276
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 277
 _fputc(10, $2) | 0; //@line 278
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 193; //@line 281
  sp = STACKTOP; //@line 282
  STACKTOP = sp; //@line 283
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 285
  _abort(); //@line 286
 }
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3886
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3892
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3894
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3895
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 3902
 $14 = HEAP32[$8 >> 2] | 0; //@line 3903
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3904
 FUNCTION_TABLE_vii[$13 & 7]($6, $14); //@line 3905
 if (!___async) {
  ___async_unwind = 0; //@line 3908
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 3910
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 3912
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 3914
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3916
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3918
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 3920
 sp = STACKTOP; //@line 3921
 return;
}
function __ZN15GraphicsDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4099
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4100
 __ZN11TextDisplayC2EPKc($0, $1); //@line 4101
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 145; //@line 4104
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4106
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4108
  sp = STACKTOP; //@line 4109
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4112
 HEAP32[$0 >> 2] = 788; //@line 4113
 HEAP32[$0 + 4 >> 2] = 952; //@line 4115
 __ZN11TextDisplay10foregroundEt($0, -1); //@line 4116
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 4119
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4120
 FUNCTION_TABLE_vii[$7 & 7]($0, 0); //@line 4121
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 146; //@line 4124
  sp = STACKTOP; //@line 4125
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4128
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1873
 STACKTOP = STACKTOP + 16 | 0; //@line 1874
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1874
 $3 = sp; //@line 1875
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 1877
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1880
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1881
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 1882
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 216; //@line 1885
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 1887
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1889
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1891
  sp = STACKTOP; //@line 1892
  STACKTOP = sp; //@line 1893
  return 0; //@line 1893
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1895
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 1899
 }
 STACKTOP = sp; //@line 1901
 return $8 & 1 | 0; //@line 1901
}
function __ZN11TextDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3670
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3672
 $5 = HEAP32[(HEAP32[$2 >> 2] | 0) + 100 >> 2] | 0; //@line 3675
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 3676
 $6 = FUNCTION_TABLE_ii[$5 & 31]($2) | 0; //@line 3677
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 154; //@line 3680
  $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 3681
  HEAP32[$7 >> 2] = $2; //@line 3682
  $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 3683
  HEAP32[$8 >> 2] = $2; //@line 3684
  sp = STACKTOP; //@line 3685
  return;
 }
 HEAP32[___async_retval >> 2] = $6; //@line 3689
 ___async_unwind = 0; //@line 3690
 HEAP32[$ReallocAsyncCtx2 >> 2] = 154; //@line 3691
 $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 3692
 HEAP32[$7 >> 2] = $2; //@line 3693
 $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 3694
 HEAP32[$8 >> 2] = $2; //@line 3695
 sp = STACKTOP; //@line 3696
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6042
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6050
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6052
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6054
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6056
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6058
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6060
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6062
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 6073
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 6074
 HEAP32[$10 >> 2] = 0; //@line 6075
 HEAP32[$12 >> 2] = 0; //@line 6076
 HEAP32[$14 >> 2] = 0; //@line 6077
 HEAP32[$2 >> 2] = 0; //@line 6078
 $33 = HEAP32[$16 >> 2] | 0; //@line 6079
 HEAP32[$16 >> 2] = $33 | $18; //@line 6084
 if ($20 | 0) {
  ___unlockfile($22); //@line 6087
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 6090
 return;
}
function _mbed_vtracef__async_cb_49($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5286
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5290
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 5295
 $$pre = HEAP32[94] | 0; //@line 5296
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 5297
 FUNCTION_TABLE_v[$$pre & 3](); //@line 5298
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 5301
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 5302
  HEAP32[$6 >> 2] = $4; //@line 5303
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 5304
  HEAP32[$7 >> 2] = $5; //@line 5305
  sp = STACKTOP; //@line 5306
  return;
 }
 ___async_unwind = 0; //@line 5309
 HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 5310
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 5311
 HEAP32[$6 >> 2] = $4; //@line 5312
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 5313
 HEAP32[$7 >> 2] = $5; //@line 5314
 sp = STACKTOP; //@line 5315
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5916
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5918
 if (!(HEAP32[___async_retval >> 2] | 0)) {
  HEAP8[___async_retval >> 0] = 0; //@line 5925
  return;
 }
 $5 = HEAP32[309] | 0; //@line 5928
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 100 >> 2] | 0; //@line 5931
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5932
 $9 = FUNCTION_TABLE_ii[$8 & 31]($2) | 0; //@line 5933
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 152; //@line 5936
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 5937
  HEAP32[$10 >> 2] = $5; //@line 5938
  sp = STACKTOP; //@line 5939
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 5943
 ___async_unwind = 0; //@line 5944
 HEAP32[$ReallocAsyncCtx >> 2] = 152; //@line 5945
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 5946
 HEAP32[$10 >> 2] = $5; //@line 5947
 sp = STACKTOP; //@line 5948
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
 sp = STACKTOP; //@line 784
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 790
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 793
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 796
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 797
   FUNCTION_TABLE_viiiiii[$13 & 7]($10, $1, $2, $3, $4, $5); //@line 798
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 198; //@line 801
    sp = STACKTOP; //@line 802
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 805
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_48($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5253
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5255
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 5260
 $$pre = HEAP32[94] | 0; //@line 5261
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 5262
 FUNCTION_TABLE_v[$$pre & 3](); //@line 5263
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 5266
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 5267
  HEAP32[$5 >> 2] = $2; //@line 5268
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 5269
  HEAP32[$6 >> 2] = $4; //@line 5270
  sp = STACKTOP; //@line 5271
  return;
 }
 ___async_unwind = 0; //@line 5274
 HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 5275
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 5276
 HEAP32[$5 >> 2] = $2; //@line 5277
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 5278
 HEAP32[$6 >> 2] = $4; //@line 5279
 sp = STACKTOP; //@line 5280
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5955
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5961
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5963
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 5964
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 5971
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5972
 FUNCTION_TABLE_vii[$13 & 7]($6, $8); //@line 5973
 if (!___async) {
  ___async_unwind = 0; //@line 5976
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 139; //@line 5978
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 5980
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 5982
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5984
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $6; //@line 5986
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $8; //@line 5988
 sp = STACKTOP; //@line 5989
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_34($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3849
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3853
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3855
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3857
 $9 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3858
 $12 = HEAP32[(HEAP32[$4 >> 2] | 0) + 100 >> 2] | 0; //@line 3861
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 3862
 $13 = FUNCTION_TABLE_ii[$12 & 31]($6) | 0; //@line 3863
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 3867
  ___async_unwind = 0; //@line 3868
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 157; //@line 3870
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $4; //@line 3872
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 3874
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $9; //@line 3876
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 3878
 sp = STACKTOP; //@line 3879
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_24($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3342
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3346
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3348
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3350
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 16 >> 2] | 0; //@line 3353
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 3354
 FUNCTION_TABLE_iiii[$10 & 15]($4, $6, 0) | 0; //@line 3355
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 62; //@line 3358
  $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 3359
  HEAP32[$11 >> 2] = $AsyncRetVal; //@line 3360
  sp = STACKTOP; //@line 3361
  return;
 }
 ___async_unwind = 0; //@line 3364
 HEAP32[$ReallocAsyncCtx3 >> 2] = 62; //@line 3365
 $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 3366
 HEAP32[$11 >> 2] = $AsyncRetVal; //@line 3367
 sp = STACKTOP; //@line 3368
 return;
}
function _fclose__async_cb_97($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9477
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9479
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 9482
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9484
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9486
 $9 = HEAP32[$2 + 12 >> 2] | 0; //@line 9488
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 9489
 $10 = FUNCTION_TABLE_ii[$9 & 31]($2) | 0; //@line 9490
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 9494
  ___async_unwind = 0; //@line 9495
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 169; //@line 9497
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $AsyncRetVal; //@line 9499
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 9501
 HEAP8[$ReallocAsyncCtx + 12 >> 0] = $4 & 1; //@line 9504
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 9506
 sp = STACKTOP; //@line 9507
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
 sp = STACKTOP; //@line 1783
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 1785
 $8 = $7 >> 8; //@line 1786
 if (!($7 & 1)) {
  $$0 = $8; //@line 1790
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 1795
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 1797
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 1800
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1805
 FUNCTION_TABLE_viiiiii[$17 & 7]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 1806
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 214; //@line 1809
  sp = STACKTOP; //@line 1810
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1813
  return;
 }
}
function __ZN4mbed6StreamC2EPKc__async_cb_75($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7875
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7879
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 488; //@line 7880
 HEAP32[$4 + 4 >> 2] = 588; //@line 7882
 $6 = $4 + 20 | 0; //@line 7883
 HEAP32[$6 >> 2] = 0; //@line 7884
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 7885
 $7 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($4, 2454) | 0; //@line 7886
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 7889
  $8 = $ReallocAsyncCtx + 4 | 0; //@line 7890
  HEAP32[$8 >> 2] = $6; //@line 7891
  sp = STACKTOP; //@line 7892
  return;
 }
 HEAP32[___async_retval >> 2] = $7; //@line 7896
 ___async_unwind = 0; //@line 7897
 HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 7898
 $8 = $ReallocAsyncCtx + 4 | 0; //@line 7899
 HEAP32[$8 >> 2] = $6; //@line 7900
 sp = STACKTOP; //@line 7901
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 953
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 959
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 962
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 965
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 966
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 967
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 201; //@line 970
    sp = STACKTOP; //@line 971
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 974
    break;
   }
  }
 } while (0);
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_33($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3809
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3813
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3815
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3817
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3819
 if (($4 | 0) >= (Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0)) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 3827
 __ZN4mbed6Stream4putcEi($6, 32) | 0; //@line 3828
 if (!___async) {
  ___async_unwind = 0; //@line 3831
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 156; //@line 3833
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 3835
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $8; //@line 3837
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $10; //@line 3839
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $6; //@line 3841
 sp = STACKTOP; //@line 3842
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
function ___dynamic_cast__async_cb_3($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2356
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2358
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2360
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2366
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 2381
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 2397
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 2402
    break;
   }
  default:
   {
    $$0 = 0; //@line 2406
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2411
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1825
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 1827
 $7 = $6 >> 8; //@line 1828
 if (!($6 & 1)) {
  $$0 = $7; //@line 1832
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 1837
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 1839
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 1842
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1847
 FUNCTION_TABLE_viiiii[$16 & 7]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 1848
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 215; //@line 1851
  sp = STACKTOP; //@line 1852
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1855
  return;
 }
}
function _mbed_error_vfprintf__async_cb_82($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8261
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 8263
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8265
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8267
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8269
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8271
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 8273
 _serial_putc(9540, $2 << 24 >> 24); //@line 8274
 if (!___async) {
  ___async_unwind = 0; //@line 8277
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 8279
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 8281
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 8283
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 8285
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 8287
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 8289
 sp = STACKTOP; //@line 8290
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_70($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7589
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7591
 if ((HEAP32[465] | 0) == ($2 | 0)) {
  HEAP32[465] = 0; //@line 7595
 }
 if ((HEAP32[466] | 0) == ($2 | 0)) {
  HEAP32[466] = 0; //@line 7600
 }
 if ((HEAP32[467] | 0) == ($2 | 0)) {
  HEAP32[467] = 0; //@line 7605
 }
 $6 = HEAP32[2387] | 0; //@line 7607
 if (!$6) {
  HEAP32[2387] = 9552; //@line 7610
  return;
 }
 if (($6 | 0) == 9552) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7617
 _mbed_assert_internal(3023, 3043, 93); //@line 7618
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 7621
  sp = STACKTOP; //@line 7622
  return;
 }
 ___async_unwind = 0; //@line 7625
 HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 7626
 sp = STACKTOP; //@line 7627
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1740
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 1742
 $6 = $5 >> 8; //@line 1743
 if (!($5 & 1)) {
  $$0 = $6; //@line 1747
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 1752
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 1754
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 1757
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1762
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 1763
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 213; //@line 1766
  sp = STACKTOP; //@line 1767
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1770
  return;
 }
}
function __ZN15GraphicsDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8007
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8011
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8013
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8015
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 132 >> 2] | 0; //@line 8018
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 8019
 $11 = FUNCTION_TABLE_ii[$10 & 31]($4) | 0; //@line 8020
 if (!___async) {
  HEAP32[___async_retval >> 2] = $11; //@line 8024
  ___async_unwind = 0; //@line 8025
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 135; //@line 8027
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 8029
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 8031
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 8033
 sp = STACKTOP; //@line 8034
 return;
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 66
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 68
 while (1) {
  $2 = _malloc($$) | 0; //@line 70
  if ($2 | 0) {
   $$lcssa = $2; //@line 73
   label = 7; //@line 74
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 77
  if (!$4) {
   $$lcssa = 0; //@line 80
   label = 7; //@line 81
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 84
  FUNCTION_TABLE_v[$4 & 3](); //@line 85
  if (___async) {
   label = 5; //@line 88
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 91
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 188; //@line 94
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 96
  sp = STACKTOP; //@line 97
  return 0; //@line 98
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 101
 }
 return 0; //@line 103
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_68($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7478
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7482
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7484
 if (!(HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[$4 >> 2] = 0; //@line 7487
 } else {
  HEAP32[$4 >> 2] = HEAP32[2340]; //@line 7490
  HEAP32[2340] = $6; //@line 7491
 }
 $9 = HEAP32[2341] | 0; //@line 7493
 if (!$9) {
  HEAP32[2341] = 9368; //@line 7496
  return;
 }
 if (($9 | 0) == 9368) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7503
 _mbed_assert_internal(3023, 3043, 93); //@line 7504
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 57; //@line 7507
  sp = STACKTOP; //@line 7508
  return;
 }
 ___async_unwind = 0; //@line 7511
 HEAP32[$ReallocAsyncCtx >> 2] = 57; //@line 7512
 sp = STACKTOP; //@line 7513
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 11109
 STACKTOP = STACKTOP + 256 | 0; //@line 11110
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 11110
 $5 = sp; //@line 11111
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 11117
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 11121
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 11124
   $$011 = $9; //@line 11125
   do {
    _out_670($0, $5, 256); //@line 11127
    $$011 = $$011 + -256 | 0; //@line 11128
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 11137
  } else {
   $$0$lcssa = $9; //@line 11139
  }
  _out_670($0, $5, $$0$lcssa); //@line 11141
 }
 STACKTOP = sp; //@line 11143
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_36($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4013
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4017
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4019
 $8 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 4022
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4023
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 4024
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 79; //@line 4027
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 4028
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 4029
  sp = STACKTOP; //@line 4030
  return;
 }
 ___async_unwind = 0; //@line 4033
 HEAP32[$ReallocAsyncCtx3 >> 2] = 79; //@line 4034
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 4035
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 4036
 sp = STACKTOP; //@line 4037
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3702
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3704
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3706
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3708
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 3711
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 3712
 $9 = FUNCTION_TABLE_ii[$8 & 31]($4) | 0; //@line 3713
 if (!___async) {
  HEAP32[___async_retval >> 2] = $9; //@line 3717
  ___async_unwind = 0; //@line 3718
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 155; //@line 3720
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $AsyncRetVal; //@line 3722
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 3724
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 3726
 sp = STACKTOP; //@line 3727
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_53($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5637
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5641
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5643
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5645
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5647
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 5650
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 5651
 FUNCTION_TABLE_vi[$13 & 255]($4); //@line 5652
 if (!___async) {
  ___async_unwind = 0; //@line 5655
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 5657
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 5659
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $8; //@line 5661
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $10; //@line 5663
 sp = STACKTOP; //@line 5664
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
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7974
 STACKTOP = STACKTOP + 32 | 0; //@line 7975
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7975
 $vararg_buffer = sp; //@line 7976
 $3 = sp + 20 | 0; //@line 7977
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7981
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7983
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7985
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7987
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7989
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7994
  $10 = -1; //@line 7995
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7998
 }
 STACKTOP = sp; //@line 8000
 return $10 | 0; //@line 8000
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
 _mbed_error_printf(2476, $vararg_buffer); //@line 1976
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
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12988
 STACKTOP = STACKTOP + 16 | 0; //@line 12989
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12989
 $3 = sp; //@line 12990
 HEAP32[$3 >> 2] = $varargs; //@line 12991
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12992
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 12993
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 177; //@line 12996
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12998
  sp = STACKTOP; //@line 12999
  STACKTOP = sp; //@line 13000
  return 0; //@line 13000
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13002
  STACKTOP = sp; //@line 13003
  return $4 | 0; //@line 13003
 }
 return 0; //@line 13005
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13110
 STACKTOP = STACKTOP + 16 | 0; //@line 13111
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13111
 $2 = sp; //@line 13112
 HEAP32[$2 >> 2] = $varargs; //@line 13113
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 13114
 $3 = _vsprintf($0, $1, $2) | 0; //@line 13115
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 179; //@line 13118
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 13120
  sp = STACKTOP; //@line 13121
  STACKTOP = sp; //@line 13122
  return 0; //@line 13122
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13124
  STACKTOP = sp; //@line 13125
  return $3 | 0; //@line 13125
 }
 return 0; //@line 13127
}
function __ZN11TextDisplay3clsEv__async_cb_31($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3733
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3737
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3739
 if ((Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0) <= 0) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 3747
 __ZN4mbed6Stream4putcEi($4, 32) | 0; //@line 3748
 if (!___async) {
  ___async_unwind = 0; //@line 3751
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 156; //@line 3753
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = 0; //@line 3755
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 3757
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $4; //@line 3759
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $4; //@line 3761
 sp = STACKTOP; //@line 3762
 return;
}
function _mbed_vtracef__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 5223
 HEAP32[88] = HEAP32[86]; //@line 5225
 $2 = HEAP32[94] | 0; //@line 5226
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 5231
 HEAP32[95] = 0; //@line 5232
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 5233
 FUNCTION_TABLE_v[$2 & 3](); //@line 5234
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 5237
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 5238
  HEAP32[$5 >> 2] = $4; //@line 5239
  sp = STACKTOP; //@line 5240
  return;
 }
 ___async_unwind = 0; //@line 5243
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 5244
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 5245
 HEAP32[$5 >> 2] = $4; //@line 5246
 sp = STACKTOP; //@line 5247
 return;
}
function _mbed_vtracef__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 4959
 HEAP32[88] = HEAP32[86]; //@line 4961
 $2 = HEAP32[94] | 0; //@line 4962
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 4967
 HEAP32[95] = 0; //@line 4968
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 4969
 FUNCTION_TABLE_v[$2 & 3](); //@line 4970
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 4973
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 4974
  HEAP32[$5 >> 2] = $4; //@line 4975
  sp = STACKTOP; //@line 4976
  return;
 }
 ___async_unwind = 0; //@line 4979
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 4980
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 4981
 HEAP32[$5 >> 2] = $4; //@line 4982
 sp = STACKTOP; //@line 4983
 return;
}
function _mbed_vtracef__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 4929
 HEAP32[88] = HEAP32[86]; //@line 4931
 $2 = HEAP32[94] | 0; //@line 4932
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 4937
 HEAP32[95] = 0; //@line 4938
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 4939
 FUNCTION_TABLE_v[$2 & 3](); //@line 4940
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 4943
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 4944
  HEAP32[$5 >> 2] = $4; //@line 4945
  sp = STACKTOP; //@line 4946
  return;
 }
 ___async_unwind = 0; //@line 4949
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 4950
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 4951
 HEAP32[$5 >> 2] = $4; //@line 4952
 sp = STACKTOP; //@line 4953
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_79($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8040
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8042
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8044
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8046
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8048
 $10 = HEAPU16[$2 + 30 >> 1] | 0; //@line 8051
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 8052
 FUNCTION_TABLE_viiiiii[$6 & 7]($2, 0, 0, $4, $AsyncRetVal, $10); //@line 8053
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 136; //@line 8056
  sp = STACKTOP; //@line 8057
  return;
 }
 ___async_unwind = 0; //@line 8060
 HEAP32[$ReallocAsyncCtx3 >> 2] = 136; //@line 8061
 sp = STACKTOP; //@line 8062
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $7 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3149
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3151
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 3156
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 3160
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 3161
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 3164
  $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 3165
  HEAP32[$7 >> 2] = $2; //@line 3166
  sp = STACKTOP; //@line 3167
  return;
 }
 ___async_unwind = 0; //@line 3170
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 3171
 $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 3172
 HEAP32[$7 >> 2] = $2; //@line 3173
 sp = STACKTOP; //@line 3174
 return;
}
function _mbed_error_hist_put($0) {
 $0 = $0 | 0;
 var $$0 = 0, $3 = 0, $5 = 0;
 if (!$0) {
  $$0 = -2130771711; //@line 2597
  return $$0 | 0; //@line 2598
 }
 $3 = (HEAP32[149] | 0) + 1 | 0; //@line 2601
 HEAP32[149] = $3; //@line 2602
 $5 = 9408 + ((($3 | 0) % 4 | 0) << 5) | 0; //@line 2604
 HEAP32[$5 >> 2] = HEAP32[$0 >> 2]; //@line 2605
 HEAP32[$5 + 4 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2605
 HEAP32[$5 + 8 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 2605
 HEAP32[$5 + 12 >> 2] = HEAP32[$0 + 12 >> 2]; //@line 2605
 HEAP32[$5 + 16 >> 2] = HEAP32[$0 + 16 >> 2]; //@line 2605
 HEAP32[$5 + 20 >> 2] = HEAP32[$0 + 20 >> 2]; //@line 2605
 HEAP32[$5 + 24 >> 2] = HEAP32[$0 + 24 >> 2]; //@line 2605
 HEAP32[$5 + 28 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 2605
 $$0 = 0; //@line 2606
 return $$0 | 0; //@line 2607
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 506
 $5 = HEAP32[$4 >> 2] | 0; //@line 507
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 511
   HEAP32[$1 + 24 >> 2] = $3; //@line 513
   HEAP32[$1 + 36 >> 2] = 1; //@line 515
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 519
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 522
    HEAP32[$1 + 24 >> 2] = 2; //@line 524
    HEAP8[$1 + 54 >> 0] = 1; //@line 526
    break;
   }
   $10 = $1 + 24 | 0; //@line 529
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 533
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_95($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9358
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9360
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9362
 HEAP32[$2 >> 2] = 788; //@line 9363
 HEAP32[$2 + 4 >> 2] = 952; //@line 9365
 __ZN11TextDisplay10foregroundEt($4, -1); //@line 9366
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 120 >> 2] | 0; //@line 9369
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9370
 FUNCTION_TABLE_vii[$8 & 7]($4, 0); //@line 9371
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 9374
  sp = STACKTOP; //@line 9375
  return;
 }
 ___async_unwind = 0; //@line 9378
 HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 9379
 sp = STACKTOP; //@line 9380
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2298
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2300
 $3 = _malloc($2) | 0; //@line 2301
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 2304
  if (!$5) {
   $$lcssa = 0; //@line 2307
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2309
   FUNCTION_TABLE_v[$5 & 3](); //@line 2310
   if (!___async) {
    ___async_unwind = 0; //@line 2313
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 188; //@line 2315
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 2317
   sp = STACKTOP; //@line 2318
   return;
  }
 } else {
  $$lcssa = $3; //@line 2322
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 2325
 return;
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2674
 $2 = HEAP32[309] | 0; //@line 2675
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2676
 _putc($1, $2) | 0; //@line 2677
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 108; //@line 2680
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2682
  sp = STACKTOP; //@line 2683
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2686
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2687
 _fflush($2) | 0; //@line 2688
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 2691
  sp = STACKTOP; //@line 2692
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2695
  return;
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 8155
 $3 = HEAP8[$1 >> 0] | 0; //@line 8156
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 8161
  $$lcssa8 = $2; //@line 8161
 } else {
  $$011 = $1; //@line 8163
  $$0710 = $0; //@line 8163
  do {
   $$0710 = $$0710 + 1 | 0; //@line 8165
   $$011 = $$011 + 1 | 0; //@line 8166
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 8167
   $9 = HEAP8[$$011 >> 0] | 0; //@line 8168
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 8173
  $$lcssa8 = $8; //@line 8173
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 8183
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 12953
  } else {
   $$01318 = $0; //@line 12955
   $$01417 = $2; //@line 12955
   $$019 = $1; //@line 12955
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 12957
    $5 = HEAP8[$$019 >> 0] | 0; //@line 12958
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 12963
    if (!$$01417) {
     $14 = 0; //@line 12968
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 12971
     $$019 = $$019 + 1 | 0; //@line 12971
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 12977
  }
 } while (0);
 return $14 | 0; //@line 12980
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1056
 STACKTOP = STACKTOP + 16 | 0; //@line 1057
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1057
 $vararg_buffer = sp; //@line 1058
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1059
 FUNCTION_TABLE_v[$0 & 3](); //@line 1060
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 203; //@line 1063
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 1065
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1067
  sp = STACKTOP; //@line 1068
  STACKTOP = sp; //@line 1069
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1071
  _abort_message(9209, $vararg_buffer); //@line 1072
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8107
 STACKTOP = STACKTOP + 32 | 0; //@line 8108
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8108
 $vararg_buffer = sp; //@line 8109
 HEAP32[$0 + 36 >> 2] = 5; //@line 8112
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 8120
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 8122
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 8124
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 8129
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 8132
 STACKTOP = sp; //@line 8133
 return $14 | 0; //@line 8133
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 2944
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2946
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2948
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 2949
 _wait_ms(150); //@line 2950
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 87; //@line 2953
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2954
  HEAP32[$4 >> 2] = $2; //@line 2955
  sp = STACKTOP; //@line 2956
  return;
 }
 ___async_unwind = 0; //@line 2959
 HEAP32[$ReallocAsyncCtx15 >> 2] = 87; //@line 2960
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2961
 HEAP32[$4 >> 2] = $2; //@line 2962
 sp = STACKTOP; //@line 2963
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 2919
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2921
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2923
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 2924
 _wait_ms(150); //@line 2925
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 88; //@line 2928
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2929
  HEAP32[$4 >> 2] = $2; //@line 2930
  sp = STACKTOP; //@line 2931
  return;
 }
 ___async_unwind = 0; //@line 2934
 HEAP32[$ReallocAsyncCtx14 >> 2] = 88; //@line 2935
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2936
 HEAP32[$4 >> 2] = $2; //@line 2937
 sp = STACKTOP; //@line 2938
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 2894
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2896
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2898
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 2899
 _wait_ms(150); //@line 2900
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 89; //@line 2903
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2904
  HEAP32[$4 >> 2] = $2; //@line 2905
  sp = STACKTOP; //@line 2906
  return;
 }
 ___async_unwind = 0; //@line 2909
 HEAP32[$ReallocAsyncCtx13 >> 2] = 89; //@line 2910
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2911
 HEAP32[$4 >> 2] = $2; //@line 2912
 sp = STACKTOP; //@line 2913
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 2869
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2871
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2873
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2874
 _wait_ms(150); //@line 2875
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 90; //@line 2878
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2879
  HEAP32[$4 >> 2] = $2; //@line 2880
  sp = STACKTOP; //@line 2881
  return;
 }
 ___async_unwind = 0; //@line 2884
 HEAP32[$ReallocAsyncCtx12 >> 2] = 90; //@line 2885
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2886
 HEAP32[$4 >> 2] = $2; //@line 2887
 sp = STACKTOP; //@line 2888
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 2844
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2846
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2848
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 2849
 _wait_ms(150); //@line 2850
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 91; //@line 2853
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2854
  HEAP32[$4 >> 2] = $2; //@line 2855
  sp = STACKTOP; //@line 2856
  return;
 }
 ___async_unwind = 0; //@line 2859
 HEAP32[$ReallocAsyncCtx11 >> 2] = 91; //@line 2860
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2861
 HEAP32[$4 >> 2] = $2; //@line 2862
 sp = STACKTOP; //@line 2863
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2819
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2821
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2823
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 2824
 _wait_ms(150); //@line 2825
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 2828
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2829
  HEAP32[$4 >> 2] = $2; //@line 2830
  sp = STACKTOP; //@line 2831
  return;
 }
 ___async_unwind = 0; //@line 2834
 HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 2835
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2836
 HEAP32[$4 >> 2] = $2; //@line 2837
 sp = STACKTOP; //@line 2838
 return;
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
 sp = STACKTOP; //@line 2569
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2571
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2573
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 2574
 _wait_ms(150); //@line 2575
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 86; //@line 2578
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 2579
  HEAP32[$4 >> 2] = $2; //@line 2580
  sp = STACKTOP; //@line 2581
  return;
 }
 ___async_unwind = 0; //@line 2584
 HEAP32[$ReallocAsyncCtx16 >> 2] = 86; //@line 2585
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 2586
 HEAP32[$4 >> 2] = $2; //@line 2587
 sp = STACKTOP; //@line 2588
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7848
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7852
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $AsyncRetVal; //@line 7853
 if ($AsyncRetVal | 0) {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($AsyncRetVal); //@line 7856
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 7859
 _mbed_error(-2147417831, 2457, 0, 0, 0) | 0; //@line 7860
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 75; //@line 7863
  sp = STACKTOP; //@line 7864
  return;
 }
 ___async_unwind = 0; //@line 7867
 HEAP32[$ReallocAsyncCtx3 >> 2] = 75; //@line 7868
 sp = STACKTOP; //@line 7869
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3985
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3987
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3989
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3991
 $8 = HEAP32[$2 + 20 >> 2] | 0; //@line 3993
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 3994
 _fflush($8) | 0; //@line 3995
 if (!___async) {
  ___async_unwind = 0; //@line 3998
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 77; //@line 4000
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 4002
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 4004
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 4006
 sp = STACKTOP; //@line 4007
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2619
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2621
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2623
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2624
 _wait_ms(400); //@line 2625
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2628
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 2629
  HEAP32[$4 >> 2] = $2; //@line 2630
  sp = STACKTOP; //@line 2631
  return;
 }
 ___async_unwind = 0; //@line 2634
 HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2635
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 2636
 HEAP32[$4 >> 2] = $2; //@line 2637
 sp = STACKTOP; //@line 2638
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2794
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2796
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2798
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 2799
 _wait_ms(150); //@line 2800
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 93; //@line 2803
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2804
  HEAP32[$4 >> 2] = $2; //@line 2805
  sp = STACKTOP; //@line 2806
  return;
 }
 ___async_unwind = 0; //@line 2809
 HEAP32[$ReallocAsyncCtx9 >> 2] = 93; //@line 2810
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2811
 HEAP32[$4 >> 2] = $2; //@line 2812
 sp = STACKTOP; //@line 2813
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2769
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2771
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2773
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2774
 _wait_ms(400); //@line 2775
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 94; //@line 2778
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2779
  HEAP32[$4 >> 2] = $2; //@line 2780
  sp = STACKTOP; //@line 2781
  return;
 }
 ___async_unwind = 0; //@line 2784
 HEAP32[$ReallocAsyncCtx8 >> 2] = 94; //@line 2785
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2786
 HEAP32[$4 >> 2] = $2; //@line 2787
 sp = STACKTOP; //@line 2788
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2744
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2746
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2748
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 2749
 _wait_ms(400); //@line 2750
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 2753
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2754
  HEAP32[$4 >> 2] = $2; //@line 2755
  sp = STACKTOP; //@line 2756
  return;
 }
 ___async_unwind = 0; //@line 2759
 HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 2760
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2761
 HEAP32[$4 >> 2] = $2; //@line 2762
 sp = STACKTOP; //@line 2763
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2719
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2721
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2723
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 2724
 _wait_ms(400); //@line 2725
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 96; //@line 2728
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2729
  HEAP32[$4 >> 2] = $2; //@line 2730
  sp = STACKTOP; //@line 2731
  return;
 }
 ___async_unwind = 0; //@line 2734
 HEAP32[$ReallocAsyncCtx6 >> 2] = 96; //@line 2735
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2736
 HEAP32[$4 >> 2] = $2; //@line 2737
 sp = STACKTOP; //@line 2738
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2694
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2696
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2698
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 2699
 _wait_ms(400); //@line 2700
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 97; //@line 2703
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2704
  HEAP32[$4 >> 2] = $2; //@line 2705
  sp = STACKTOP; //@line 2706
  return;
 }
 ___async_unwind = 0; //@line 2709
 HEAP32[$ReallocAsyncCtx5 >> 2] = 97; //@line 2710
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2711
 HEAP32[$4 >> 2] = $2; //@line 2712
 sp = STACKTOP; //@line 2713
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2669
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2671
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2673
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 2674
 _wait_ms(400); //@line 2675
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 98; //@line 2678
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 2679
  HEAP32[$4 >> 2] = $2; //@line 2680
  sp = STACKTOP; //@line 2681
  return;
 }
 ___async_unwind = 0; //@line 2684
 HEAP32[$ReallocAsyncCtx4 >> 2] = 98; //@line 2685
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 2686
 HEAP32[$4 >> 2] = $2; //@line 2687
 sp = STACKTOP; //@line 2688
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2644
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2646
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2648
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 2649
 _wait_ms(400); //@line 2650
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 2653
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 2654
  HEAP32[$4 >> 2] = $2; //@line 2655
  sp = STACKTOP; //@line 2656
  return;
 }
 ___async_unwind = 0; //@line 2659
 HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 2660
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 2661
 HEAP32[$4 >> 2] = $2; //@line 2662
 sp = STACKTOP; //@line 2663
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2594
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2596
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2598
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2599
 _wait_ms(400); //@line 2600
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 2603
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 2604
  HEAP32[$4 >> 2] = $2; //@line 2605
  sp = STACKTOP; //@line 2606
  return;
 }
 ___async_unwind = 0; //@line 2609
 HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 2610
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 2611
 HEAP32[$4 >> 2] = $2; //@line 2612
 sp = STACKTOP; //@line 2613
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
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4619
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4620
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(9556, 9, 7, 8, 6, 18, 6212); //@line 4621
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 162; //@line 4624
  sp = STACKTOP; //@line 4625
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4628
  __ZN5Sht31C2E7PinNameS0_(14353, 10, 11); //@line 4629
  HEAP32[3435] = 0; //@line 4630
  HEAP32[3436] = 0; //@line 4630
  HEAP32[3437] = 0; //@line 4630
  HEAP32[3438] = 0; //@line 4630
  HEAP32[3439] = 0; //@line 4630
  HEAP32[3440] = 0; //@line 4630
  _gpio_init_out(13740, 50); //@line 4631
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 10042
 newDynamicTop = oldDynamicTop + increment | 0; //@line 10043
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 10047
  ___setErrNo(12); //@line 10048
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 10052
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 10056
   ___setErrNo(12); //@line 10057
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 10061
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 10970
 } else {
  $$056 = $2; //@line 10972
  $15 = $1; //@line 10972
  $8 = $0; //@line 10972
  while (1) {
   $14 = $$056 + -1 | 0; //@line 10980
   HEAP8[$14 >> 0] = HEAPU8[6872 + ($8 & 15) >> 0] | 0 | $3; //@line 10981
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 10982
   $15 = tempRet0; //@line 10983
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 10988
    break;
   } else {
    $$056 = $14; //@line 10991
   }
  }
 }
 return $$05$lcssa | 0; //@line 10995
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 8278
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 8280
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 8286
  $11 = ___fwritex($0, $4, $3) | 0; //@line 8287
  if ($phitmp) {
   $13 = $11; //@line 8289
  } else {
   ___unlockfile($3); //@line 8291
   $13 = $11; //@line 8292
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 8296
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 8300
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 8303
 }
 return $15 | 0; //@line 8305
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6212
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6214
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6216
 $8 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 6218
 HEAP16[$2 >> 1] = $8; //@line 6219
 if ($8 << 16 >> 16 <= (HEAP16[$4 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$2 >> 1] = HEAP16[$4 + 40 >> 1] | 0; //@line 6228
 $15 = (HEAP16[$6 >> 1] | 0) + 1 << 16 >> 16; //@line 6230
 HEAP16[$6 >> 1] = $15; //@line 6231
 if ($15 << 16 >> 16 <= (HEAP16[$4 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$6 >> 1] = HEAP16[$4 + 44 >> 1] | 0; //@line 6240
 return;
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 1021
 $0 = ___cxa_get_globals_fast() | 0; //@line 1022
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 1025
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 1029
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 1041
    _emscripten_alloc_async_context(4, sp) | 0; //@line 1042
    __ZSt11__terminatePFvvE($16); //@line 1043
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 1048
 _emscripten_alloc_async_context(4, sp) | 0; //@line 1049
 __ZSt11__terminatePFvvE($17); //@line 1050
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 8533
 $3 = HEAP8[$1 >> 0] | 0; //@line 8535
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 8539
 $7 = HEAP32[$0 >> 2] | 0; //@line 8540
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 8545
  HEAP32[$0 + 4 >> 2] = 0; //@line 8547
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 8549
  HEAP32[$0 + 28 >> 2] = $14; //@line 8551
  HEAP32[$0 + 20 >> 2] = $14; //@line 8553
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 8559
  $$0 = 0; //@line 8560
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 8563
  $$0 = -1; //@line 8564
 }
 return $$0 | 0; //@line 8566
}
function __ZN6C128327columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3367
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3370
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3371
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3372
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 126; //@line 3375
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3377
  sp = STACKTOP; //@line 3378
  return 0; //@line 3379
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3381
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0 | 0; //@line 3388
 }
 return 0; //@line 3390
}
function __ZN6C128324rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3339
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3342
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3343
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3344
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 125; //@line 3347
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3349
  sp = STACKTOP; //@line 3350
  return 0; //@line 3351
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3353
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0 | 0; //@line 3360
 }
 return 0; //@line 3362
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 12438
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 12441
 $$sink17$sink = $0; //@line 12441
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 12443
  $12 = HEAP8[$11 >> 0] | 0; //@line 12444
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 12452
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 12457
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 12462
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 11007
 } else {
  $$06 = $2; //@line 11009
  $11 = $1; //@line 11009
  $7 = $0; //@line 11009
  while (1) {
   $10 = $$06 + -1 | 0; //@line 11014
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 11015
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 11016
   $11 = tempRet0; //@line 11017
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 11022
    break;
   } else {
    $$06 = $10; //@line 11025
   }
  }
 }
 return $$0$lcssa | 0; //@line 11029
}
function ___fmodeflags($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $2 = 0, $3 = 0, $6 = 0, $9 = 0;
 $2 = (_strchr($0, 43) | 0) == 0; //@line 8877
 $3 = HEAP8[$0 >> 0] | 0; //@line 8878
 $$0 = $2 ? $3 << 24 >> 24 != 114 & 1 : 2; //@line 8881
 $6 = (_strchr($0, 120) | 0) == 0; //@line 8883
 $$0$ = $6 ? $$0 : $$0 | 128; //@line 8885
 $9 = (_strchr($0, 101) | 0) == 0; //@line 8887
 $$2 = $9 ? $$0$ : $$0$ | 524288; //@line 8889
 $$2$ = $3 << 24 >> 24 == 114 ? $$2 : $$2 | 64; //@line 8892
 $$4 = $3 << 24 >> 24 == 119 ? $$2$ | 512 : $$2$; //@line 8895
 return ($3 << 24 >> 24 == 97 ? $$4 | 1024 : $$4) | 0; //@line 8899
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1906
 do {
  if (!$0) {
   $3 = 0; //@line 1910
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1912
   $2 = ___dynamic_cast($0, 232, 288, 0) | 0; //@line 1913
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 217; //@line 1916
    sp = STACKTOP; //@line 1917
    return 0; //@line 1918
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1920
    $3 = ($2 | 0) != 0 & 1; //@line 1923
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 1928
}
function __ZN4mbed8FileBaseD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8414
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8416
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 8424
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 8425
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 8428
  sp = STACKTOP; //@line 8429
  return;
 }
 ___async_unwind = 0; //@line 8432
 HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 8433
 sp = STACKTOP; //@line 8434
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 10651
 } else {
  $$04 = 0; //@line 10653
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 10656
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 10660
   $12 = $7 + 1 | 0; //@line 10661
   HEAP32[$0 >> 2] = $12; //@line 10662
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 10668
    break;
   } else {
    $$04 = $11; //@line 10671
   }
  }
 }
 return $$0$lcssa | 0; //@line 10675
}
function _invoke_ticker__async_cb_98($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9541
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 9547
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 9548
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9549
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 9550
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 111; //@line 9553
  sp = STACKTOP; //@line 9554
  return;
 }
 ___async_unwind = 0; //@line 9557
 HEAP32[$ReallocAsyncCtx >> 2] = 111; //@line 9558
 sp = STACKTOP; //@line 9559
 return;
}
function __ZN15GraphicsDisplay9characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3617
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 152 >> 2] | 0; //@line 3620
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3625
 FUNCTION_TABLE_viiiiii[$6 & 7]($0, $1 << 3, $2 << 3, 8, 8, 5117 + ($3 + -31 << 3) | 0); //@line 3626
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 131; //@line 3629
  sp = STACKTOP; //@line 3630
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3633
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
 sp = STACKTOP; //@line 3661
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3664
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3665
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3666
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 133; //@line 3669
  sp = STACKTOP; //@line 3670
  return 0; //@line 3671
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3673
  return ($4 | 0) / 8 | 0 | 0; //@line 3675
 }
 return 0; //@line 3677
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3640
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3643
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3644
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3645
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 132; //@line 3648
  sp = STACKTOP; //@line 3649
  return 0; //@line 3650
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3652
  return ($4 | 0) / 8 | 0 | 0; //@line 3654
 }
 return 0; //@line 3656
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
function _fclose__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9446
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 9449
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9451
 $10 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 9454
 $12 = HEAP32[$4 + 92 >> 2] | 0; //@line 9456
 if ($12 | 0) {
  _free($12); //@line 9459
 }
 if ($6) {
  if ($8 | 0) {
   ___unlockfile($4); //@line 9464
  }
 } else {
  _free($4); //@line 9467
 }
 HEAP32[___async_retval >> 2] = $10; //@line 9470
 return;
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
 sp = STACKTOP; //@line 2533
 $3 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 2536
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2537
 __ZN4mbed8FileBaseD2Ev($3); //@line 2538
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 2541
  sp = STACKTOP; //@line 2542
  return;
 }
 ___async_unwind = 0; //@line 2545
 HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 2546
 sp = STACKTOP; //@line 2547
 return;
}
function ___fflush_unlocked__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2513
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2515
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2517
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2519
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 2521
 HEAP32[$4 >> 2] = 0; //@line 2522
 HEAP32[$6 >> 2] = 0; //@line 2523
 HEAP32[$8 >> 2] = 0; //@line 2524
 HEAP32[$10 >> 2] = 0; //@line 2525
 HEAP32[___async_retval >> 2] = 0; //@line 2527
 return;
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7525
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7527
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 < ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
  $16 = ___async_retval; //@line 7537
  HEAP32[$16 >> 2] = $6; //@line 7538
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 7541
 $16 = ___async_retval; //@line 7542
 HEAP32[$16 >> 2] = $6; //@line 7543
 return;
}
function __ZN6C128325_putcEi__async_cb_69($0) {
 $0 = $0 | 0;
 var $16 = 0, $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7551
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7553
 if (!(HEAP32[$2 + 4168 >> 2] | 0)) {
  $16 = ___async_retval; //@line 7558
  HEAP32[$16 >> 2] = $4; //@line 7559
  return;
 }
 _emscripten_asm_const_iiiii(4, HEAP32[$2 + 4172 >> 2] | 0, HEAP32[$2 + 4176 >> 2] | 0, HEAP32[$2 + 4180 >> 2] | 0, $2 + 68 | 0) | 0; //@line 7569
 $16 = ___async_retval; //@line 7570
 HEAP32[$16 >> 2] = $4; //@line 7571
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9386
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9388
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 9389
 __ZN4mbed8FileBaseD2Ev($2); //@line 9390
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 9393
  sp = STACKTOP; //@line 9394
  return;
 }
 ___async_unwind = 0; //@line 9397
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 9398
 sp = STACKTOP; //@line 9399
 return;
}
function _mbed_vtracef__async_cb_42($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4911
 $1 = HEAP32[92] | 0; //@line 4912
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 4913
 FUNCTION_TABLE_vi[$1 & 255](2125); //@line 4914
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 4917
  sp = STACKTOP; //@line 4918
  return;
 }
 ___async_unwind = 0; //@line 4921
 HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 4922
 sp = STACKTOP; //@line 4923
 return;
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13134
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13135
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 13136
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 180; //@line 13139
  sp = STACKTOP; //@line 13140
  return 0; //@line 13141
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13143
  return $3 | 0; //@line 13144
 }
 return 0; //@line 13146
}
function ___unlist_locked_file($0) {
 $0 = $0 | 0;
 var $$pre = 0, $$sink = 0, $10 = 0, $5 = 0;
 if (HEAP32[$0 + 68 >> 2] | 0) {
  $5 = HEAP32[$0 + 116 >> 2] | 0; //@line 8416
  $$pre = $0 + 112 | 0; //@line 8419
  if ($5 | 0) {
   HEAP32[$5 + 112 >> 2] = HEAP32[$$pre >> 2]; //@line 8423
  }
  $10 = HEAP32[$$pre >> 2] | 0; //@line 8425
  if (!$10) {
   $$sink = (___pthread_self_699() | 0) + 232 | 0; //@line 8430
  } else {
   $$sink = $10 + 116 | 0; //@line 8433
  }
  HEAP32[$$sink >> 2] = $5; //@line 8435
 }
 return;
}
function __ZThn4_N6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3510
 $1 = $0 + -4 | 0; //@line 3511
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3512
 __ZN4mbed6StreamD2Ev($1); //@line 3513
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 128; //@line 3516
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3518
  sp = STACKTOP; //@line 3519
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3522
  __ZdlPv($1); //@line 3523
  return;
 }
}
function _serial_putc__async_cb_84($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8395
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8397
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8398
 _fflush($2) | 0; //@line 8399
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 8402
  sp = STACKTOP; //@line 8403
  return;
 }
 ___async_unwind = 0; //@line 8406
 HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 8407
 sp = STACKTOP; //@line 8408
 return;
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
function __ZN15GraphicsDisplay6windowEiiii($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $5 = 0, $7 = 0;
 $5 = $1 & 65535; //@line 3745
 HEAP16[$0 + 36 >> 1] = $5; //@line 3747
 $7 = $2 & 65535; //@line 3748
 HEAP16[$0 + 38 >> 1] = $7; //@line 3750
 HEAP16[$0 + 40 >> 1] = $5; //@line 3752
 HEAP16[$0 + 42 >> 1] = $1 + 65535 + $3; //@line 3757
 HEAP16[$0 + 44 >> 1] = $7; //@line 3759
 HEAP16[$0 + 46 >> 1] = $2 + 65535 + $4; //@line 3764
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 9893
 ___async_unwind = 1; //@line 9894
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 9900
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 9904
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 9908
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9910
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6124
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6126
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6128
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6130
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] = 3289; //@line 6132
 _emscripten_asm_const_iiiii(4, HEAP32[$4 >> 2] | 0, HEAP32[$6 >> 2] | 0, HEAP32[$8 >> 2] | 0, $10 | 0) | 0; //@line 6136
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7844
 STACKTOP = STACKTOP + 16 | 0; //@line 7845
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7845
 $vararg_buffer = sp; //@line 7846
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7850
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7852
 STACKTOP = sp; //@line 7853
 return $5 | 0; //@line 7853
}
function _freopen__async_cb_63($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6424
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6426
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6427
 _fclose($2) | 0; //@line 6428
 if (!___async) {
  ___async_unwind = 0; //@line 6431
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 184; //@line 6433
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 6435
 sp = STACKTOP; //@line 6436
 return;
}
function __ZN6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2934
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2935
 __ZN4mbed6StreamD2Ev($0); //@line 2936
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 118; //@line 2939
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2941
  sp = STACKTOP; //@line 2942
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2945
  __ZdlPv($0); //@line 2946
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 9835
 STACKTOP = STACKTOP + 16 | 0; //@line 9836
 $rem = __stackBase__ | 0; //@line 9837
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 9838
 STACKTOP = __stackBase__; //@line 9839
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 9840
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 9605
 if ((ret | 0) < 8) return ret | 0; //@line 9606
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 9607
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 9608
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 9609
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 9610
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 9611
}
function _exit($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2831
 do {
  if ($0 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2835
   _mbed_die(); //@line 2836
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 2839
    sp = STACKTOP; //@line 2840
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2843
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
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 410
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
  HEAP8[($2 << 7) + $1 + ($0 + 68) >> 0] = ($3 | 0) != 0 & 1; //@line 3441
  return;
 }
 $17 = ($2 << 7) + $1 + ($0 + 68) | 0; //@line 3447
 if (($3 | 0) != 1) {
  return;
 }
 HEAP8[$17 >> 0] = HEAP8[$17 >> 0] ^ 1; //@line 3453
 return;
}
function __Znaj($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 108
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 109
 $1 = __Znwj($0) | 0; //@line 110
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 189; //@line 113
  sp = STACKTOP; //@line 114
  return 0; //@line 115
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 117
  return $1 | 0; //@line 118
 }
 return 0; //@line 120
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 242
 STACKTOP = STACKTOP + 16 | 0; //@line 243
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 243
 if (!(_pthread_once(14340, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[3586] | 0) | 0; //@line 249
  STACKTOP = sp; //@line 250
  return $3 | 0; //@line 250
 } else {
  _abort_message(9057, sp); //@line 252
 }
 return 0; //@line 255
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 13093
 $6 = HEAP32[$5 >> 2] | 0; //@line 13094
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 13095
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 13097
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 13099
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 13102
 return $2 | 0; //@line 13103
}
function __ZL25default_terminate_handlerv__async_cb_78($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7982
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7984
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7986
 HEAP32[$2 >> 2] = 8918; //@line 7987
 HEAP32[$2 + 4 >> 2] = $4; //@line 7989
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 7991
 _abort_message(8782, $2); //@line 7992
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3384
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3386
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3387
 _fputc(10, $2) | 0; //@line 3388
 if (!___async) {
  ___async_unwind = 0; //@line 3391
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 193; //@line 3393
 sp = STACKTOP; //@line 3394
 return;
}
function _setvbuf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = $0 + 75 | 0; //@line 13415
 HEAP8[$4 >> 0] = -1; //@line 13416
 switch ($2 | 0) {
 case 2:
  {
   HEAP32[$0 + 48 >> 2] = 0; //@line 13420
   break;
  }
 case 1:
  {
   HEAP8[$4 >> 0] = 10; //@line 13424
   break;
  }
 default:
  {}
 }
 HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 64; //@line 13432
 return 0; //@line 13433
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4336
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4338
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4342
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 32 >> 2] = $AsyncRetVal; //@line 4344
 HEAP32[$4 >> 2] = $6; //@line 4345
 _sprintf($AsyncRetVal, 6054, $4) | 0; //@line 4346
 return;
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4074
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4076
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 4077
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 144; //@line 4080
  sp = STACKTOP; //@line 4081
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4084
  return;
 }
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4506
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4508
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 4509
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 159; //@line 4512
  sp = STACKTOP; //@line 4513
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4516
  return;
 }
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2899
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2903
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 2904
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 116; //@line 2907
  sp = STACKTOP; //@line 2908
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2911
  return;
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4102
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 4105
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 4110
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 4113
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2174
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 2185
  $$0 = 1; //@line 2186
 } else {
  $$0 = 0; //@line 2188
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 2192
 return;
}
function __ZThn4_N6C12832D1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3493
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3495
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 3496
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 127; //@line 3499
  sp = STACKTOP; //@line 3500
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3503
  return;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 1004
 STACKTOP = STACKTOP + 16 | 0; //@line 1005
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1005
 _free($0); //@line 1007
 if (!(_pthread_setspecific(HEAP32[3586] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 1012
  return;
 } else {
  _abort_message(9156, sp); //@line 1014
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 2653
 HEAP32[$0 >> 2] = $1; //@line 2654
 HEAP32[2384] = 1; //@line 2655
 $4 = $0; //@line 2656
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 2661
 $10 = 9540; //@line 2662
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 2664
 HEAP32[$10 + 4 >> 2] = $9; //@line 2667
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 486
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2918
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2919
 _emscripten_sleep($0 | 0); //@line 2920
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 117; //@line 2923
  sp = STACKTOP; //@line 2924
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2927
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
function _mbed_error__async_cb_77($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7919
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 7920
 ___WFI(); //@line 7921
 if (!___async) {
  ___async_unwind = 0; //@line 7924
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 106; //@line 7926
 sp = STACKTOP; //@line 7927
 return;
}
function ___WFI() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2611
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2612
 _wait_ms(100); //@line 2613
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 2616
  sp = STACKTOP; //@line 2617
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2620
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
  $7 = $1 + 28 | 0; //@line 550
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 554
  }
 }
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 __ZN5Sht31C2E7PinNameS0_(14353, 10, 11); //@line 7999
 HEAP32[3435] = 0; //@line 8000
 HEAP32[3436] = 0; //@line 8000
 HEAP32[3437] = 0; //@line 8000
 HEAP32[3438] = 0; //@line 8000
 HEAP32[3439] = 0; //@line 8000
 HEAP32[3440] = 0; //@line 8000
 _gpio_init_out(13740, 50); //@line 8001
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 9869
 HEAP32[new_frame + 4 >> 2] = sp; //@line 9871
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 9873
 ___async_cur_frame = new_frame; //@line 9874
 return ___async_cur_frame + 8 | 0; //@line 9875
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 989
 STACKTOP = STACKTOP + 16 | 0; //@line 990
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 990
 if (!(_pthread_key_create(14344, 202) | 0)) {
  STACKTOP = sp; //@line 995
  return;
 } else {
  _abort_message(9106, sp); //@line 997
 }
}
function ___ofl_add($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0;
 $1 = ___ofl_lock() | 0; //@line 9021
 HEAP32[$0 + 56 >> 2] = HEAP32[$1 >> 2]; //@line 9024
 $4 = HEAP32[$1 >> 2] | 0; //@line 9025
 if ($4 | 0) {
  HEAP32[$4 + 52 >> 2] = $0; //@line 9029
 }
 HEAP32[$1 >> 2] = $0; //@line 9031
 ___ofl_unlock(); //@line 9032
 return $0 | 0; //@line 9033
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 2285
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 2289
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 2292
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 9858
  return low << bits; //@line 9859
 }
 tempRet0 = low << bits - 32; //@line 9861
 return 0; //@line 9862
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 9847
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 9848
 }
 tempRet0 = 0; //@line 9850
 return high >>> bits - 32 | 0; //@line 9851
}
function __ZN11TextDisplay5_putcEi__async_cb_73($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7761
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 7768
 }
 HEAP32[___async_retval >> 2] = $4; //@line 7771
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7637
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 7644
 }
 HEAP32[___async_retval >> 2] = $4; //@line 7647
 return;
}
function _fflush__async_cb_87($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8612
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 8614
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 8617
 return;
}
function __ZN6C128323clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = $0 + 68 | 0; //@line 3396
 _memset($1 | 0, 0, 4096) | 0; //@line 3397
 _emscripten_asm_const_iiiii(4, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $1 | 0) | 0; //@line 3404
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 6480
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 6483
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 6486
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 9431
 } else {
  $$0 = -1; //@line 9433
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 9436
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2433
 if (HEAP32[___async_retval >> 2] | 0) {
  _setbuf($4, 0); //@line 2438
 }
 HEAP32[___async_retval >> 2] = $4; //@line 2441
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 8663
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 8669
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 8673
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 10138
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 9881
 stackRestore(___async_cur_frame | 0); //@line 9882
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9883
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3411
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 3412
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3414
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6250
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 6251
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 6253
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 12092
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 12092
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 12094
 return $1 | 0; //@line 12095
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2629
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2635
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2636
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 8010
  $$0 = -1; //@line 8011
 } else {
  $$0 = $0; //@line 8013
 }
 return $$0 | 0; //@line 8015
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 9598
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 9599
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 9600
}
function __ZN6C128326heightEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 128; //@line 3481
   break;
  }
 default:
  {
   $$0 = 32; //@line 3485
  }
 }
 return $$0 | 0; //@line 3488
}
function __ZN6C128325widthEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 32; //@line 3464
   break;
  }
 default:
  {
   $$0 = 128; //@line 3468
  }
 }
 return $$0 | 0; //@line 3471
}
function _freopen__async_cb_64($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6446
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile($4); //@line 6449
 }
 HEAP32[___async_retval >> 2] = $4; //@line 6452
 return;
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0; //@line 3664
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 9590
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 9592
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 10131
}
function __ZN6C128324rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0; //@line 6114
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
 _setvbuf(HEAP32[$0 + 4 >> 2] | 0, 0, 1, HEAP32[___async_retval >> 2] | 0) | 0; //@line 5907
 HEAP8[___async_retval >> 0] = 1; //@line 5910
 return;
}
function __ZN6C128326_flushEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(4, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 3051
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 10124
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 11152
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 11155
 }
 return $$0 | 0; //@line 11157
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8864
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8869
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 10089
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 9827
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 8265
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 8269
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 2342
 return;
}
function __ZN11TextDisplay6locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP16[$0 + 24 >> 1] = $1; //@line 4479
 HEAP16[$0 + 26 >> 1] = $2; //@line 4482
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_29($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 3640
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 9888
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 9889
}
function __ZN6C128326locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP32[$0 + 60 >> 2] = $1; //@line 3414
 HEAP32[$0 + 64 >> 2] = $2; //@line 3416
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_40($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 4320
 return;
}
function dynCall_viii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 FUNCTION_TABLE_viii[index & 3](a1 | 0, a2 | 0, a3 | 0); //@line 10117
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN5Sht31C2E7PinNameS0_($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(7, $0 | 0, $1 | 0, $2 | 0) | 0; //@line 4596
 return;
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 9416
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 8799
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 8801
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 1089
 __ZdlPv($0); //@line 1090
 return;
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 2270
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 772
 __ZdlPv($0); //@line 773
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 10637
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
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 9577
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 300
 __ZdlPv($0); //@line 301
 return;
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 10082
}
function b86(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(7); //@line 10370
}
function b85(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 10367
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 497
}
function __ZN4mbed10FileHandle5lseekEii__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2563
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[3587] | 0; //@line 1862
 HEAP32[3587] = $0 + 0; //@line 1864
 return $0 | 0; //@line 1866
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3280
 return;
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9517
 return;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4123
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[434] | 0; //@line 1079
 HEAP32[434] = $0 + 0; //@line 1081
 return $0 | 0; //@line 1083
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 7](a1 | 0, a2 | 0); //@line 10110
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_54($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 12 >> 2]; //@line 5678
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_25($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 3378
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 9915
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_74($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_37($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 4047
 return;
}
function b83(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(7); //@line 10364
}
function b82(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(6); //@line 10361
}
function b81(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(5); //@line 10358
}
function b80(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 10355
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 11100
}
function _fflush__async_cb_88($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8627
 return;
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3290
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9529
 return;
}
function _fputc__async_cb_27($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3424
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 31](a1 | 0) | 0; //@line 10075
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3436
 return;
}
function _putc__async_cb_60($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6263
 return;
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3135
 return;
}
function __ZN11TextDisplay10foregroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 28 >> 1] = $1; //@line 4491
 return;
}
function __ZN11TextDisplay10backgroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 30 >> 1] = $1; //@line 4500
 return;
}
function b25(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(15); //@line 10205
 return 0; //@line 10205
}
function b24(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(14); //@line 10202
 return 0; //@line 10202
}
function b23(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(13); //@line 10199
 return 0; //@line 10199
}
function b22(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(12); //@line 10196
 return 0; //@line 10196
}
function b21(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(11); //@line 10193
 return 0; //@line 10193
}
function b20(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 10190
 return 0; //@line 10190
}
function __ZN4mbed10FileHandle12set_blockingEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ($1 ? 0 : -25) | 0; //@line 209
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(9209, HEAP32[$0 + 4 >> 2] | 0); //@line 4414
}
function _setbuf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _setvbuf($0, $1, $1 | 0 ? 0 : 2, 1024) | 0; //@line 13405
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 10103
}
function __ZN5Sht3115readTemperatureEv($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(8, $0 | 0) | 0) / 100.0);
}
function __ZN4mbed8FileBaseD0Ev__async_cb_23($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 3270
 return;
}
function b78(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(7); //@line 10352
}
function b77(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 10349
}
function __ZN5Sht3112readHumidityEv($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(9, $0 | 0) | 0) / 100.0);
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 6461
 return;
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0 | 0;
 _setbuf($0, 0); //@line 2855
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
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 9346
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 12345
}
function b18(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(7); //@line 10187
 return 0; //@line 10187
}
function b17(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(6); //@line 10184
 return 0; //@line 10184
}
function b16(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(0); //@line 10181
 return 0; //@line 10181
}
function _freopen__async_cb_62($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 6418
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 10068
}
function __ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function b75(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(3); //@line 10346
}
function b74(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(0); //@line 10343
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
 FUNCTION_TABLE_v[index & 3](); //@line 10096
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_ii(31); //@line 10178
 return 0; //@line 10178
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_ii(30); //@line 10175
 return 0; //@line 10175
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_ii(29); //@line 10172
 return 0; //@line 10172
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_ii(28); //@line 10169
 return 0; //@line 10169
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_ii(27); //@line 10166
 return 0; //@line 10166
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 8142
}
function __ZNK4mbed10FileHandle11is_blockingEv($0) {
 $0 = $0 | 0;
 return 1; //@line 215
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_ii(26); //@line 10163
 return 0; //@line 10163
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_ii(25); //@line 10160
 return 0; //@line 10160
}
function b7(p0) {
 p0 = p0 | 0;
 nullFunc_ii(24); //@line 10157
 return 0; //@line 10157
}
function b6(p0) {
 p0 = p0 | 0;
 nullFunc_ii(23); //@line 10154
 return 0; //@line 10154
}
function b5(p0) {
 p0 = p0 | 0;
 nullFunc_ii(22); //@line 10151
 return 0; //@line 10151
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(21); //@line 10148
 return 0; //@line 10148
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 10145
 return 0; //@line 10145
}
function __ZThn4_N15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4092
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4524
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1247
}
function __ZN15GraphicsDisplay9characterEiii__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b72(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(7); //@line 10340
}
function b71(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(6); //@line 10337
}
function b70(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(5); //@line 10334
}
function b69(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 10331
}
function ___ofl_lock() {
 ___lock(14328); //@line 9038
 return 14336; //@line 9039
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
 _llvm_trap(); //@line 3608
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
function _abort_message__async_cb_26($0) {
 $0 = $0 | 0;
 _abort(); //@line 3401
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
 ___cxa_pure_virtual(); //@line 10211
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
function __ZN15GraphicsDisplay3clsEv__async_cb_80($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4136
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1386
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1603
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb_96($0) {
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
 return _pthread_self() | 0; //@line 12266
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 12272
}
function ___pthread_self_699() {
 return _pthread_self() | 0; //@line 8449
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb_86($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb_76($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function b1() {
 nullFunc_i(0); //@line 10142
 return 0; //@line 10142
}
function _core_util_are_interrupts_enabled() {
 return 1; //@line 2747
}
function __ZN4mbed6StreamD2Ev__async_cb_5($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 126
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
 ___unlock(14328); //@line 9044
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
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 10328
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 10325
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 10322
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 10319
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 10316
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 10313
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 10310
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 10307
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 10304
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 10301
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 10298
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 10295
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 10292
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 10289
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 10286
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 10283
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 10280
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 10277
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 10274
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 10271
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 10268
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 10265
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 10262
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 10259
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 10256
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 10253
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 10250
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 10247
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 10244
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 10241
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 10238
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 10235
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 10232
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 10229
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 10226
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 10223
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 10220
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 10217
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 8026
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 8455
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 10214
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
 return 0; //@line 2752
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
 return 14324; //@line 8020
}
function __ZSt9terminatev__async_cb_61($0) {
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
 return 1368; //@line 8147
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
 nullFunc_v(0); //@line 10208
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,__ZN4mbed10FileHandle4syncEv,__ZN4mbed10FileHandle6isattyEv,__ZN4mbed10FileHandle4tellEv,__ZN4mbed10FileHandle4sizeEv,__ZN4mbed10FileHandle5fsyncEv,__ZN4mbed10FileHandle4flenEv,__ZNK4mbed10FileHandle11is_blockingEv,__ZN4mbed6Stream5closeEv,__ZN4mbed6Stream4syncEv,__ZN4mbed6Stream6isattyEv,__ZN4mbed6Stream4tellEv,__ZN4mbed6Stream4sizeEv,__ZN11TextDisplay5_getcEv,__ZN6C128324rowsEv,__ZN6C128327columnsEv,__ZN6C128325widthEv,__ZN6C128326heightEv,__ZN15GraphicsDisplay4rowsEv,__ZN15GraphicsDisplay7columnsEv,___stdio_close,b4,b5,b6,b7,b8,b9,b10,b11
,b12,b13,b14];
var FUNCTION_TABLE_iii = [b16,__ZN4mbed10FileHandle12set_blockingEb,__ZNK4mbed10FileHandle4pollEs,__ZN6C128325_putcEi,__ZN11TextDisplay5claimEP8_IO_FILE,__ZN11TextDisplay5_putcEi,b17,b18];
var FUNCTION_TABLE_iiii = [b20,__ZN4mbed10FileHandle5lseekEii,__ZN4mbed6Stream4readEPvj,__ZN4mbed6Stream5writeEPKvj,__ZN4mbed6Stream4seekEii,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_read,b21,b22,b23,b24,b25];
var FUNCTION_TABLE_v = [b27,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b29,_mbed_trace_default_print,__ZN4mbed8FileBaseD2Ev,__ZN4mbed8FileBaseD0Ev,__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev,__ZN4mbed10FileHandleD0Ev,__ZN4mbed10FileHandle6rewindEv,__ZN4mbed6StreamD2Ev,__ZN4mbed6StreamD0Ev,__ZN4mbed6Stream6rewindEv,__ZN4mbed6Stream4lockEv,__ZN4mbed6Stream6unlockEv,__ZThn4_N4mbed6StreamD1Ev,__ZThn4_N4mbed6StreamD0Ev,__ZN6C12832D0Ev,__ZN6C128326_flushEv,__ZN6C128323clsEv,__ZThn4_N6C12832D1Ev,__ZThn4_N6C12832D0Ev,__ZN15GraphicsDisplayD0Ev,__ZN15GraphicsDisplay3clsEv,__ZThn4_N15GraphicsDisplayD1Ev,__ZThn4_N15GraphicsDisplayD0Ev,__ZN11TextDisplayD0Ev,__ZN11TextDisplay3clsEv,__ZThn4_N11TextDisplayD1Ev,__ZThn4_N11TextDisplayD0Ev,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev
,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_52,_mbed_vtracef__async_cb_42,_mbed_vtracef__async_cb_43,_mbed_vtracef__async_cb_44,_mbed_vtracef__async_cb_51,_mbed_vtracef__async_cb_45,_mbed_vtracef__async_cb_50,_mbed_vtracef__async_cb_46,_mbed_vtracef__async_cb_47,_mbed_vtracef__async_cb_48,_mbed_vtracef__async_cb_49,__ZN4mbed8FileBaseD2Ev__async_cb_85,__ZN4mbed8FileBaseD2Ev__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_86,__ZN4mbed8FileBaseD0Ev__async_cb_22,__ZN4mbed8FileBaseD0Ev__async_cb,__ZN4mbed8FileBaseD0Ev__async_cb_23,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_68,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb,__ZN4mbed10FileHandle4tellEv__async_cb
,__ZN4mbed10FileHandle6rewindEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_24,__ZN4mbed10FileHandle4sizeEv__async_cb_25,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD2Ev__async_cb_5,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_39,__ZN4mbed6Stream4readEPvj__async_cb_40,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_28,__ZN4mbed6Stream5writeEPKvj__async_cb_29,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD1Ev__async_cb_96,__ZN4mbed6StreamC2EPKc__async_cb_75,__ZN4mbed6StreamC2EPKc__async_cb,__ZN4mbed6StreamC2EPKc__async_cb_76,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_38,__ZN4mbed6Stream4putcEi__async_cb_36,__ZN4mbed6Stream4putcEi__async_cb_37,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_56,__ZN4mbed6Stream6printfEPKcz__async_cb_53,__ZN4mbed6Stream6printfEPKcz__async_cb_54,__ZN4mbed6Stream6printfEPKcz__async_cb_55,_mbed_assert_internal__async_cb,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18
,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_82,_mbed_error_vfprintf__async_cb_81,_mbed_error__async_cb_77,___WFI__async_cb,_serial_putc__async_cb_84,_serial_putc__async_cb,_invoke_ticker__async_cb_98,_invoke_ticker__async_cb,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_70,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb,_exit__async_cb,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,_wait_ms__async_cb,__ZN6C12832D0Ev__async_cb
,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_69,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_65,__ZN6C128329characterEiii__async_cb_66,__ZN6C128329characterEiii__async_cb_67,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_59,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_79,__ZN15GraphicsDisplay3clsEv__async_cb_80,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_58,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_35,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_21,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_95,__ZN15GraphicsDisplayC2EPKc__async_cb,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_71
,__ZN11TextDisplay5_putcEi__async_cb_72,__ZN11TextDisplay5_putcEi__async_cb_73,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_57,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_30,__ZN11TextDisplay3clsEv__async_cb_31,__ZN11TextDisplay3clsEv__async_cb_34,__ZN11TextDisplay3clsEv__async_cb_32,__ZN11TextDisplay3clsEv__async_cb_33,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_41,__ZN11TextDisplayC2EPKc__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb,_main__async_cb_90,_putc__async_cb_60,_putc__async_cb,___overflow__async_cb,_fclose__async_cb_97,_fclose__async_cb,_fflush__async_cb_88,_fflush__async_cb_87,_fflush__async_cb_89,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_4,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb
,_sprintf__async_cb,_vsprintf__async_cb,_freopen__async_cb,_freopen__async_cb_64,_freopen__async_cb_63,_freopen__async_cb_62,_fputc__async_cb_27,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_78,_abort_message__async_cb,_abort_message__async_cb_26,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_3,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_74,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_93,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_92
,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_91,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_83,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50
,b51,b52,b53,b54,b55,b56,b57,b58,b59,b60,b61,b62,b63,b64,b65,b66,b67];
var FUNCTION_TABLE_vii = [b69,__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE,__ZN11TextDisplay10foregroundEt,__ZN11TextDisplay10backgroundEt,__ZN15GraphicsDisplay4putpEi,b70,b71,b72];
var FUNCTION_TABLE_viii = [b74,__ZN6C128326locateEii,__ZN11TextDisplay6locateEii,b75];
var FUNCTION_TABLE_viiii = [b77,__ZN6C128329characterEiii,__ZN6C128325pixelEiii,__ZN15GraphicsDisplay9characterEiii,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b78];
var FUNCTION_TABLE_viiiii = [b80,__ZN15GraphicsDisplay6windowEiiii,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b81,b82,b83];
var FUNCTION_TABLE_viiiiii = [b85,__ZN15GraphicsDisplay4fillEiiiii,__ZN15GraphicsDisplay4blitEiiiiPKi,__ZN15GraphicsDisplay7blitbitEiiiiPKc,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b86];

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






//# sourceMappingURL=temperature.js.map
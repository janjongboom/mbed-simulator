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

var ASM_CONSTS = [function() { return Date.now(); },
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

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 15360;
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
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN4mbed8FileBaseD2Ev", "__ZN4mbed8FileBaseD0Ev", "__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev", "__ZN4mbed10FileHandleD0Ev", "__ZN4mbed10FileHandle6rewindEv", "__ZN4mbed6StreamD2Ev", "__ZN4mbed6StreamD0Ev", "__ZN4mbed6Stream6rewindEv", "__ZN4mbed6Stream4lockEv", "__ZN4mbed6Stream6unlockEv", "__ZThn4_N4mbed6StreamD1Ev", "__ZThn4_N4mbed6StreamD0Ev", "__ZN6C12832D0Ev", "__ZN6C128326_flushEv", "__ZN6C128323clsEv", "__ZThn4_N6C12832D1Ev", "__ZThn4_N6C12832D0Ev", "__ZN15GraphicsDisplayD0Ev", "__ZN15GraphicsDisplay3clsEv", "__ZThn4_N15GraphicsDisplayD1Ev", "__ZThn4_N15GraphicsDisplayD0Ev", "__ZN11TextDisplayD0Ev", "__ZN11TextDisplay3clsEv", "__ZThn4_N11TextDisplayD1Ev", "__ZThn4_N11TextDisplayD0Ev", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed10FileHandle5lseekEii__async_cb", "__ZN4mbed10FileHandle5fsyncEv__async_cb", "__ZN4mbed10FileHandle4flenEv__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_59", "_mbed_vtracef__async_cb_49", "_mbed_vtracef__async_cb_50", "_mbed_vtracef__async_cb_51", "_mbed_vtracef__async_cb_58", "_mbed_vtracef__async_cb_52", "_mbed_vtracef__async_cb_57", "_mbed_vtracef__async_cb_53", "_mbed_vtracef__async_cb_54", "_mbed_vtracef__async_cb_55", "_mbed_vtracef__async_cb_56", "__ZN4mbed8FileBaseD2Ev__async_cb_8", "__ZN4mbed8FileBaseD2Ev__async_cb", "__ZN4mbed8FileBaseD2Ev__async_cb_9", "__ZN4mbed8FileBaseD0Ev__async_cb_41", "__ZN4mbed8FileBaseD0Ev__async_cb", "__ZN4mbed8FileBaseD0Ev__async_cb_42", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_35", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb", "__ZN4mbed10FileHandle4tellEv__async_cb", "__ZN4mbed10FileHandle6rewindEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb_38", "__ZN4mbed10FileHandle4sizeEv__async_cb_39", "__ZN4mbed6StreamD2Ev__async_cb", "__ZN4mbed6StreamD2Ev__async_cb_27", "__ZN4mbed6Stream4readEPvj__async_cb", "__ZN4mbed6Stream4readEPvj__async_cb_81", "__ZN4mbed6Stream4readEPvj__async_cb_82", "__ZN4mbed6Stream5writeEPKvj__async_cb", "__ZN4mbed6Stream5writeEPKvj__async_cb_60", "__ZN4mbed6Stream5writeEPKvj__async_cb_61", "__ZThn4_N4mbed6StreamD1Ev__async_cb", "__ZThn4_N4mbed6StreamD1Ev__async_cb_28", "__ZN4mbed6StreamC2EPKc__async_cb_10", "__ZN4mbed6StreamC2EPKc__async_cb", "__ZN4mbed6StreamC2EPKc__async_cb_11", "__ZN4mbed6Stream4putcEi__async_cb", "__ZN4mbed6Stream4putcEi__async_cb_16", "__ZN4mbed6Stream4putcEi__async_cb_14", "__ZN4mbed6Stream4putcEi__async_cb_15", "__ZN4mbed6Stream6printfEPKcz__async_cb", "__ZN4mbed6Stream6printfEPKcz__async_cb_25", "__ZN4mbed6Stream6printfEPKcz__async_cb_22", "__ZN4mbed6Stream6printfEPKcz__async_cb_23", "__ZN4mbed6Stream6printfEPKcz__async_cb_24", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_97", "_mbed_die__async_cb_96", "_mbed_die__async_cb_95", "_mbed_die__async_cb_94", "_mbed_die__async_cb_93", "_mbed_die__async_cb_92", "_mbed_die__async_cb_91", "_mbed_die__async_cb_90", "_mbed_die__async_cb_89", "_mbed_die__async_cb_88", "_mbed_die__async_cb_87", "_mbed_die__async_cb_86", "_mbed_die__async_cb_85", "_mbed_die__async_cb_84", "_mbed_die__async_cb_83", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_69", "_mbed_error_vfprintf__async_cb_68", "_mbed_error__async_cb_78", "___WFI__async_cb", "_serial_putc__async_cb_72", "_serial_putc__async_cb", "_invoke_ticker__async_cb_67", "_invoke_ticker__async_cb", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_77", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb", "_exit__async_cb", "__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__ZN6C12832D0Ev__async_cb", "__ZN6C128325_putcEi__async_cb", "__ZN6C128325_putcEi__async_cb_46", "__ZN6C128329characterEiii__async_cb", "__ZN6C128329characterEiii__async_cb_17", "__ZN6C128329characterEiii__async_cb_18", "__ZN6C128329characterEiii__async_cb_19", "__ZN6C128324rowsEv__async_cb", "__ZN6C128327columnsEv__async_cb", "__ZThn4_N6C12832D1Ev__async_cb", "__ZThn4_N6C12832D0Ev__async_cb", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_1", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb", "__ZN15GraphicsDisplay9characterEiii__async_cb", "__ZN15GraphicsDisplay4rowsEv__async_cb", "__ZN15GraphicsDisplay7columnsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb_47", "__ZN15GraphicsDisplay3clsEv__async_cb_48", "__ZN15GraphicsDisplay4putpEi__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb_12", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_98", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_79", "__ZThn4_N15GraphicsDisplayD1Ev__async_cb", "__ZN15GraphicsDisplayC2EPKc__async_cb_62", "__ZN15GraphicsDisplayC2EPKc__async_cb", "__ZN11TextDisplay5_putcEi__async_cb", "__ZN11TextDisplay5_putcEi__async_cb_32", "__ZN11TextDisplay5_putcEi__async_cb_33", "__ZN11TextDisplay5_putcEi__async_cb_34", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_13", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb", "__ZN11TextDisplay3clsEv__async_cb", "__ZN11TextDisplay3clsEv__async_cb_2", "__ZN11TextDisplay3clsEv__async_cb_3", "__ZN11TextDisplay3clsEv__async_cb_6", "__ZN11TextDisplay3clsEv__async_cb_4", "__ZN11TextDisplay3clsEv__async_cb_5", "__ZThn4_N11TextDisplayD1Ev__async_cb", "__ZN11TextDisplayC2EPKc__async_cb_70", "__ZN11TextDisplayC2EPKc__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb", "_main__async_cb_21", "_putc__async_cb_76", "_putc__async_cb", "___overflow__async_cb", "_fclose__async_cb_7", "_fclose__async_cb", "_fflush__async_cb_44", "_fflush__async_cb_43", "_fflush__async_cb_45", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_37", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_sprintf__async_cb", "_vsprintf__async_cb", "_freopen__async_cb", "_freopen__async_cb_31", "_freopen__async_cb_30", "_freopen__async_cb_29", "_fputc__async_cb_20", "_fputc__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__Znaj__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_71", "_abort_message__async_cb", "_abort_message__async_cb_75", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_80", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_73", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_26", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_74", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_66", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_65", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_64", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_63", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_40", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 4755
 STACKTOP = STACKTOP + 16 | 0; //@line 4756
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4756
 $1 = sp; //@line 4757
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4764
   $7 = $6 >>> 3; //@line 4765
   $8 = HEAP32[3431] | 0; //@line 4766
   $9 = $8 >>> $7; //@line 4767
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4773
    $16 = 13764 + ($14 << 1 << 2) | 0; //@line 4775
    $17 = $16 + 8 | 0; //@line 4776
    $18 = HEAP32[$17 >> 2] | 0; //@line 4777
    $19 = $18 + 8 | 0; //@line 4778
    $20 = HEAP32[$19 >> 2] | 0; //@line 4779
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3431] = $8 & ~(1 << $14); //@line 4786
     } else {
      if ((HEAP32[3435] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4791
      }
      $27 = $20 + 12 | 0; //@line 4794
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4798
       HEAP32[$17 >> 2] = $20; //@line 4799
       break;
      } else {
       _abort(); //@line 4802
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4807
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4810
    $34 = $18 + $30 + 4 | 0; //@line 4812
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4815
    $$0 = $19; //@line 4816
    STACKTOP = sp; //@line 4817
    return $$0 | 0; //@line 4817
   }
   $37 = HEAP32[3433] | 0; //@line 4819
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4825
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4828
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4831
     $49 = $47 >>> 12 & 16; //@line 4833
     $50 = $47 >>> $49; //@line 4834
     $52 = $50 >>> 5 & 8; //@line 4836
     $54 = $50 >>> $52; //@line 4838
     $56 = $54 >>> 2 & 4; //@line 4840
     $58 = $54 >>> $56; //@line 4842
     $60 = $58 >>> 1 & 2; //@line 4844
     $62 = $58 >>> $60; //@line 4846
     $64 = $62 >>> 1 & 1; //@line 4848
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4851
     $69 = 13764 + ($67 << 1 << 2) | 0; //@line 4853
     $70 = $69 + 8 | 0; //@line 4854
     $71 = HEAP32[$70 >> 2] | 0; //@line 4855
     $72 = $71 + 8 | 0; //@line 4856
     $73 = HEAP32[$72 >> 2] | 0; //@line 4857
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4863
       HEAP32[3431] = $77; //@line 4864
       $98 = $77; //@line 4865
      } else {
       if ((HEAP32[3435] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4870
       }
       $80 = $73 + 12 | 0; //@line 4873
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4877
        HEAP32[$70 >> 2] = $73; //@line 4878
        $98 = $8; //@line 4879
        break;
       } else {
        _abort(); //@line 4882
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4887
     $84 = $83 - $6 | 0; //@line 4888
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4891
     $87 = $71 + $6 | 0; //@line 4892
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4895
     HEAP32[$71 + $83 >> 2] = $84; //@line 4897
     if ($37 | 0) {
      $92 = HEAP32[3436] | 0; //@line 4900
      $93 = $37 >>> 3; //@line 4901
      $95 = 13764 + ($93 << 1 << 2) | 0; //@line 4903
      $96 = 1 << $93; //@line 4904
      if (!($98 & $96)) {
       HEAP32[3431] = $98 | $96; //@line 4909
       $$0199 = $95; //@line 4911
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4911
      } else {
       $101 = $95 + 8 | 0; //@line 4913
       $102 = HEAP32[$101 >> 2] | 0; //@line 4914
       if ((HEAP32[3435] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4918
       } else {
        $$0199 = $102; //@line 4921
        $$pre$phiZ2D = $101; //@line 4921
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4924
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4926
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4928
      HEAP32[$92 + 12 >> 2] = $95; //@line 4930
     }
     HEAP32[3433] = $84; //@line 4932
     HEAP32[3436] = $87; //@line 4933
     $$0 = $72; //@line 4934
     STACKTOP = sp; //@line 4935
     return $$0 | 0; //@line 4935
    }
    $108 = HEAP32[3432] | 0; //@line 4937
    if (!$108) {
     $$0197 = $6; //@line 4940
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4944
     $114 = $112 >>> 12 & 16; //@line 4946
     $115 = $112 >>> $114; //@line 4947
     $117 = $115 >>> 5 & 8; //@line 4949
     $119 = $115 >>> $117; //@line 4951
     $121 = $119 >>> 2 & 4; //@line 4953
     $123 = $119 >>> $121; //@line 4955
     $125 = $123 >>> 1 & 2; //@line 4957
     $127 = $123 >>> $125; //@line 4959
     $129 = $127 >>> 1 & 1; //@line 4961
     $134 = HEAP32[14028 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4966
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4970
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4976
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4979
      $$0193$lcssa$i = $138; //@line 4979
     } else {
      $$01926$i = $134; //@line 4981
      $$01935$i = $138; //@line 4981
      $146 = $143; //@line 4981
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4986
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4987
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4988
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4989
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4995
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4998
        $$0193$lcssa$i = $$$0193$i; //@line 4998
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 5001
        $$01935$i = $$$0193$i; //@line 5001
       }
      }
     }
     $157 = HEAP32[3435] | 0; //@line 5005
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5008
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 5011
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5014
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 5018
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 5020
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 5024
       $176 = HEAP32[$175 >> 2] | 0; //@line 5025
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 5028
        $179 = HEAP32[$178 >> 2] | 0; //@line 5029
        if (!$179) {
         $$3$i = 0; //@line 5032
         break;
        } else {
         $$1196$i = $179; //@line 5035
         $$1198$i = $178; //@line 5035
        }
       } else {
        $$1196$i = $176; //@line 5038
        $$1198$i = $175; //@line 5038
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 5041
        $182 = HEAP32[$181 >> 2] | 0; //@line 5042
        if ($182 | 0) {
         $$1196$i = $182; //@line 5045
         $$1198$i = $181; //@line 5045
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 5048
        $185 = HEAP32[$184 >> 2] | 0; //@line 5049
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 5054
         $$1198$i = $184; //@line 5054
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 5059
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 5062
        $$3$i = $$1196$i; //@line 5063
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 5068
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 5071
       }
       $169 = $167 + 12 | 0; //@line 5074
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 5078
       }
       $172 = $164 + 8 | 0; //@line 5081
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 5085
        HEAP32[$172 >> 2] = $167; //@line 5086
        $$3$i = $164; //@line 5087
        break;
       } else {
        _abort(); //@line 5090
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 5099
       $191 = 14028 + ($190 << 2) | 0; //@line 5100
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 5105
         if (!$$3$i) {
          HEAP32[3432] = $108 & ~(1 << $190); //@line 5111
          break L73;
         }
        } else {
         if ((HEAP32[3435] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 5118
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 5126
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3435] | 0; //@line 5136
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 5139
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 5143
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 5145
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 5151
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 5155
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 5157
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 5163
       if ($214 | 0) {
        if ((HEAP32[3435] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 5169
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 5173
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 5175
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 5183
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 5186
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 5188
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 5191
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 5195
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 5198
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 5200
      if ($37 | 0) {
       $234 = HEAP32[3436] | 0; //@line 5203
       $235 = $37 >>> 3; //@line 5204
       $237 = 13764 + ($235 << 1 << 2) | 0; //@line 5206
       $238 = 1 << $235; //@line 5207
       if (!($8 & $238)) {
        HEAP32[3431] = $8 | $238; //@line 5212
        $$0189$i = $237; //@line 5214
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 5214
       } else {
        $242 = $237 + 8 | 0; //@line 5216
        $243 = HEAP32[$242 >> 2] | 0; //@line 5217
        if ((HEAP32[3435] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 5221
        } else {
         $$0189$i = $243; //@line 5224
         $$pre$phi$iZ2D = $242; //@line 5224
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 5227
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 5229
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 5231
       HEAP32[$234 + 12 >> 2] = $237; //@line 5233
      }
      HEAP32[3433] = $$0193$lcssa$i; //@line 5235
      HEAP32[3436] = $159; //@line 5236
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 5239
     STACKTOP = sp; //@line 5240
     return $$0 | 0; //@line 5240
    }
   } else {
    $$0197 = $6; //@line 5243
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 5248
   } else {
    $251 = $0 + 11 | 0; //@line 5250
    $252 = $251 & -8; //@line 5251
    $253 = HEAP32[3432] | 0; //@line 5252
    if (!$253) {
     $$0197 = $252; //@line 5255
    } else {
     $255 = 0 - $252 | 0; //@line 5257
     $256 = $251 >>> 8; //@line 5258
     if (!$256) {
      $$0358$i = 0; //@line 5261
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 5265
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 5269
       $262 = $256 << $261; //@line 5270
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 5273
       $267 = $262 << $265; //@line 5275
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 5278
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 5283
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 5289
      }
     }
     $282 = HEAP32[14028 + ($$0358$i << 2) >> 2] | 0; //@line 5293
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 5297
       $$3$i203 = 0; //@line 5297
       $$3350$i = $255; //@line 5297
       label = 81; //@line 5298
      } else {
       $$0342$i = 0; //@line 5305
       $$0347$i = $255; //@line 5305
       $$0353$i = $282; //@line 5305
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 5305
       $$0362$i = 0; //@line 5305
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 5310
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 5315
          $$435113$i = 0; //@line 5315
          $$435712$i = $$0353$i; //@line 5315
          label = 85; //@line 5316
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 5319
          $$1348$i = $292; //@line 5319
         }
        } else {
         $$1343$i = $$0342$i; //@line 5322
         $$1348$i = $$0347$i; //@line 5322
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 5325
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 5328
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 5332
        $302 = ($$0353$i | 0) == 0; //@line 5333
        if ($302) {
         $$2355$i = $$1363$i; //@line 5338
         $$3$i203 = $$1343$i; //@line 5338
         $$3350$i = $$1348$i; //@line 5338
         label = 81; //@line 5339
         break;
        } else {
         $$0342$i = $$1343$i; //@line 5342
         $$0347$i = $$1348$i; //@line 5342
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 5342
         $$0362$i = $$1363$i; //@line 5342
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 5352
       $309 = $253 & ($306 | 0 - $306); //@line 5355
       if (!$309) {
        $$0197 = $252; //@line 5358
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 5363
       $315 = $313 >>> 12 & 16; //@line 5365
       $316 = $313 >>> $315; //@line 5366
       $318 = $316 >>> 5 & 8; //@line 5368
       $320 = $316 >>> $318; //@line 5370
       $322 = $320 >>> 2 & 4; //@line 5372
       $324 = $320 >>> $322; //@line 5374
       $326 = $324 >>> 1 & 2; //@line 5376
       $328 = $324 >>> $326; //@line 5378
       $330 = $328 >>> 1 & 1; //@line 5380
       $$4$ph$i = 0; //@line 5386
       $$4357$ph$i = HEAP32[14028 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 5386
      } else {
       $$4$ph$i = $$3$i203; //@line 5388
       $$4357$ph$i = $$2355$i; //@line 5388
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 5392
       $$4351$lcssa$i = $$3350$i; //@line 5392
      } else {
       $$414$i = $$4$ph$i; //@line 5394
       $$435113$i = $$3350$i; //@line 5394
       $$435712$i = $$4357$ph$i; //@line 5394
       label = 85; //@line 5395
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 5400
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 5404
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 5405
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 5406
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 5407
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5413
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 5416
        $$4351$lcssa$i = $$$4351$i; //@line 5416
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 5419
        $$435113$i = $$$4351$i; //@line 5419
        label = 85; //@line 5420
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 5426
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3433] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3435] | 0; //@line 5432
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 5435
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 5438
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 5441
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 5445
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 5447
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 5451
         $371 = HEAP32[$370 >> 2] | 0; //@line 5452
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 5455
          $374 = HEAP32[$373 >> 2] | 0; //@line 5456
          if (!$374) {
           $$3372$i = 0; //@line 5459
           break;
          } else {
           $$1370$i = $374; //@line 5462
           $$1374$i = $373; //@line 5462
          }
         } else {
          $$1370$i = $371; //@line 5465
          $$1374$i = $370; //@line 5465
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 5468
          $377 = HEAP32[$376 >> 2] | 0; //@line 5469
          if ($377 | 0) {
           $$1370$i = $377; //@line 5472
           $$1374$i = $376; //@line 5472
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 5475
          $380 = HEAP32[$379 >> 2] | 0; //@line 5476
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 5481
           $$1374$i = $379; //@line 5481
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 5486
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 5489
          $$3372$i = $$1370$i; //@line 5490
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 5495
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 5498
         }
         $364 = $362 + 12 | 0; //@line 5501
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 5505
         }
         $367 = $359 + 8 | 0; //@line 5508
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 5512
          HEAP32[$367 >> 2] = $362; //@line 5513
          $$3372$i = $359; //@line 5514
          break;
         } else {
          _abort(); //@line 5517
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 5525
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 5528
         $386 = 14028 + ($385 << 2) | 0; //@line 5529
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 5534
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 5539
            HEAP32[3432] = $391; //@line 5540
            $475 = $391; //@line 5541
            break L164;
           }
          } else {
           if ((HEAP32[3435] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 5548
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 5556
            if (!$$3372$i) {
             $475 = $253; //@line 5559
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3435] | 0; //@line 5567
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 5570
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 5574
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 5576
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 5582
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 5586
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 5588
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 5594
         if (!$409) {
          $475 = $253; //@line 5597
         } else {
          if ((HEAP32[3435] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 5602
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 5606
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 5608
           $475 = $253; //@line 5609
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 5618
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 5621
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 5623
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 5626
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 5630
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 5633
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 5635
         $428 = $$4351$lcssa$i >>> 3; //@line 5636
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 13764 + ($428 << 1 << 2) | 0; //@line 5640
          $432 = HEAP32[3431] | 0; //@line 5641
          $433 = 1 << $428; //@line 5642
          if (!($432 & $433)) {
           HEAP32[3431] = $432 | $433; //@line 5647
           $$0368$i = $431; //@line 5649
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 5649
          } else {
           $437 = $431 + 8 | 0; //@line 5651
           $438 = HEAP32[$437 >> 2] | 0; //@line 5652
           if ((HEAP32[3435] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 5656
           } else {
            $$0368$i = $438; //@line 5659
            $$pre$phi$i211Z2D = $437; //@line 5659
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 5662
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 5664
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 5666
          HEAP32[$354 + 12 >> 2] = $431; //@line 5668
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 5671
         if (!$444) {
          $$0361$i = 0; //@line 5674
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 5678
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 5682
           $450 = $444 << $449; //@line 5683
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 5686
           $455 = $450 << $453; //@line 5688
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 5691
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5696
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5702
          }
         }
         $469 = 14028 + ($$0361$i << 2) | 0; //@line 5705
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5707
         $471 = $354 + 16 | 0; //@line 5708
         HEAP32[$471 + 4 >> 2] = 0; //@line 5710
         HEAP32[$471 >> 2] = 0; //@line 5711
         $473 = 1 << $$0361$i; //@line 5712
         if (!($475 & $473)) {
          HEAP32[3432] = $475 | $473; //@line 5717
          HEAP32[$469 >> 2] = $354; //@line 5718
          HEAP32[$354 + 24 >> 2] = $469; //@line 5720
          HEAP32[$354 + 12 >> 2] = $354; //@line 5722
          HEAP32[$354 + 8 >> 2] = $354; //@line 5724
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5733
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5733
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5740
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5744
          $494 = HEAP32[$492 >> 2] | 0; //@line 5746
          if (!$494) {
           label = 136; //@line 5749
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5752
           $$0345$i = $494; //@line 5752
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3435] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5759
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5762
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5764
           HEAP32[$354 + 12 >> 2] = $354; //@line 5766
           HEAP32[$354 + 8 >> 2] = $354; //@line 5768
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5773
          $502 = HEAP32[$501 >> 2] | 0; //@line 5774
          $503 = HEAP32[3435] | 0; //@line 5775
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5781
           HEAP32[$501 >> 2] = $354; //@line 5782
           HEAP32[$354 + 8 >> 2] = $502; //@line 5784
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5786
           HEAP32[$354 + 24 >> 2] = 0; //@line 5788
           break;
          } else {
           _abort(); //@line 5791
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5798
       STACKTOP = sp; //@line 5799
       return $$0 | 0; //@line 5799
      } else {
       $$0197 = $252; //@line 5801
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3433] | 0; //@line 5808
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5811
  $515 = HEAP32[3436] | 0; //@line 5812
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5815
   HEAP32[3436] = $517; //@line 5816
   HEAP32[3433] = $514; //@line 5817
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5820
   HEAP32[$515 + $512 >> 2] = $514; //@line 5822
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5825
  } else {
   HEAP32[3433] = 0; //@line 5827
   HEAP32[3436] = 0; //@line 5828
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5831
   $526 = $515 + $512 + 4 | 0; //@line 5833
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5836
  }
  $$0 = $515 + 8 | 0; //@line 5839
  STACKTOP = sp; //@line 5840
  return $$0 | 0; //@line 5840
 }
 $530 = HEAP32[3434] | 0; //@line 5842
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5845
  HEAP32[3434] = $532; //@line 5846
  $533 = HEAP32[3437] | 0; //@line 5847
  $534 = $533 + $$0197 | 0; //@line 5848
  HEAP32[3437] = $534; //@line 5849
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5852
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5855
  $$0 = $533 + 8 | 0; //@line 5857
  STACKTOP = sp; //@line 5858
  return $$0 | 0; //@line 5858
 }
 if (!(HEAP32[3549] | 0)) {
  HEAP32[3551] = 4096; //@line 5863
  HEAP32[3550] = 4096; //@line 5864
  HEAP32[3552] = -1; //@line 5865
  HEAP32[3553] = -1; //@line 5866
  HEAP32[3554] = 0; //@line 5867
  HEAP32[3542] = 0; //@line 5868
  HEAP32[3549] = $1 & -16 ^ 1431655768; //@line 5872
  $548 = 4096; //@line 5873
 } else {
  $548 = HEAP32[3551] | 0; //@line 5876
 }
 $545 = $$0197 + 48 | 0; //@line 5878
 $546 = $$0197 + 47 | 0; //@line 5879
 $547 = $548 + $546 | 0; //@line 5880
 $549 = 0 - $548 | 0; //@line 5881
 $550 = $547 & $549; //@line 5882
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5885
  STACKTOP = sp; //@line 5886
  return $$0 | 0; //@line 5886
 }
 $552 = HEAP32[3541] | 0; //@line 5888
 if ($552 | 0) {
  $554 = HEAP32[3539] | 0; //@line 5891
  $555 = $554 + $550 | 0; //@line 5892
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5897
   STACKTOP = sp; //@line 5898
   return $$0 | 0; //@line 5898
  }
 }
 L244 : do {
  if (!(HEAP32[3542] & 4)) {
   $561 = HEAP32[3437] | 0; //@line 5906
   L246 : do {
    if (!$561) {
     label = 163; //@line 5910
    } else {
     $$0$i$i = 14172; //@line 5912
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5914
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5917
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5926
      if (!$570) {
       label = 163; //@line 5929
       break L246;
      } else {
       $$0$i$i = $570; //@line 5932
      }
     }
     $595 = $547 - $530 & $549; //@line 5936
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5939
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5947
       } else {
        $$723947$i = $595; //@line 5949
        $$748$i = $597; //@line 5949
        label = 180; //@line 5950
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5954
       $$2253$ph$i = $595; //@line 5954
       label = 171; //@line 5955
      }
     } else {
      $$2234243136$i = 0; //@line 5958
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5964
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5967
     } else {
      $574 = $572; //@line 5969
      $575 = HEAP32[3550] | 0; //@line 5970
      $576 = $575 + -1 | 0; //@line 5971
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5979
      $584 = HEAP32[3539] | 0; //@line 5980
      $585 = $$$i + $584 | 0; //@line 5981
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3541] | 0; //@line 5986
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5993
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5997
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 6000
        $$748$i = $572; //@line 6000
        label = 180; //@line 6001
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 6004
        $$2253$ph$i = $$$i; //@line 6004
        label = 171; //@line 6005
       }
      } else {
       $$2234243136$i = 0; //@line 6008
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 6015
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 6024
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 6027
       $$748$i = $$2247$ph$i; //@line 6027
       label = 180; //@line 6028
       break L244;
      }
     }
     $607 = HEAP32[3551] | 0; //@line 6032
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 6036
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 6039
      $$748$i = $$2247$ph$i; //@line 6039
      label = 180; //@line 6040
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 6046
      $$2234243136$i = 0; //@line 6047
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 6051
      $$748$i = $$2247$ph$i; //@line 6051
      label = 180; //@line 6052
      break L244;
     }
    }
   } while (0);
   HEAP32[3542] = HEAP32[3542] | 4; //@line 6059
   $$4236$i = $$2234243136$i; //@line 6060
   label = 178; //@line 6061
  } else {
   $$4236$i = 0; //@line 6063
   label = 178; //@line 6064
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 6070
   $621 = _sbrk(0) | 0; //@line 6071
   $627 = $621 - $620 | 0; //@line 6079
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 6081
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 6089
    $$748$i = $620; //@line 6089
    label = 180; //@line 6090
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3539] | 0) + $$723947$i | 0; //@line 6096
  HEAP32[3539] = $633; //@line 6097
  if ($633 >>> 0 > (HEAP32[3540] | 0) >>> 0) {
   HEAP32[3540] = $633; //@line 6101
  }
  $636 = HEAP32[3437] | 0; //@line 6103
  do {
   if (!$636) {
    $638 = HEAP32[3435] | 0; //@line 6107
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3435] = $$748$i; //@line 6112
    }
    HEAP32[3543] = $$748$i; //@line 6114
    HEAP32[3544] = $$723947$i; //@line 6115
    HEAP32[3546] = 0; //@line 6116
    HEAP32[3440] = HEAP32[3549]; //@line 6118
    HEAP32[3439] = -1; //@line 6119
    HEAP32[3444] = 13764; //@line 6120
    HEAP32[3443] = 13764; //@line 6121
    HEAP32[3446] = 13772; //@line 6122
    HEAP32[3445] = 13772; //@line 6123
    HEAP32[3448] = 13780; //@line 6124
    HEAP32[3447] = 13780; //@line 6125
    HEAP32[3450] = 13788; //@line 6126
    HEAP32[3449] = 13788; //@line 6127
    HEAP32[3452] = 13796; //@line 6128
    HEAP32[3451] = 13796; //@line 6129
    HEAP32[3454] = 13804; //@line 6130
    HEAP32[3453] = 13804; //@line 6131
    HEAP32[3456] = 13812; //@line 6132
    HEAP32[3455] = 13812; //@line 6133
    HEAP32[3458] = 13820; //@line 6134
    HEAP32[3457] = 13820; //@line 6135
    HEAP32[3460] = 13828; //@line 6136
    HEAP32[3459] = 13828; //@line 6137
    HEAP32[3462] = 13836; //@line 6138
    HEAP32[3461] = 13836; //@line 6139
    HEAP32[3464] = 13844; //@line 6140
    HEAP32[3463] = 13844; //@line 6141
    HEAP32[3466] = 13852; //@line 6142
    HEAP32[3465] = 13852; //@line 6143
    HEAP32[3468] = 13860; //@line 6144
    HEAP32[3467] = 13860; //@line 6145
    HEAP32[3470] = 13868; //@line 6146
    HEAP32[3469] = 13868; //@line 6147
    HEAP32[3472] = 13876; //@line 6148
    HEAP32[3471] = 13876; //@line 6149
    HEAP32[3474] = 13884; //@line 6150
    HEAP32[3473] = 13884; //@line 6151
    HEAP32[3476] = 13892; //@line 6152
    HEAP32[3475] = 13892; //@line 6153
    HEAP32[3478] = 13900; //@line 6154
    HEAP32[3477] = 13900; //@line 6155
    HEAP32[3480] = 13908; //@line 6156
    HEAP32[3479] = 13908; //@line 6157
    HEAP32[3482] = 13916; //@line 6158
    HEAP32[3481] = 13916; //@line 6159
    HEAP32[3484] = 13924; //@line 6160
    HEAP32[3483] = 13924; //@line 6161
    HEAP32[3486] = 13932; //@line 6162
    HEAP32[3485] = 13932; //@line 6163
    HEAP32[3488] = 13940; //@line 6164
    HEAP32[3487] = 13940; //@line 6165
    HEAP32[3490] = 13948; //@line 6166
    HEAP32[3489] = 13948; //@line 6167
    HEAP32[3492] = 13956; //@line 6168
    HEAP32[3491] = 13956; //@line 6169
    HEAP32[3494] = 13964; //@line 6170
    HEAP32[3493] = 13964; //@line 6171
    HEAP32[3496] = 13972; //@line 6172
    HEAP32[3495] = 13972; //@line 6173
    HEAP32[3498] = 13980; //@line 6174
    HEAP32[3497] = 13980; //@line 6175
    HEAP32[3500] = 13988; //@line 6176
    HEAP32[3499] = 13988; //@line 6177
    HEAP32[3502] = 13996; //@line 6178
    HEAP32[3501] = 13996; //@line 6179
    HEAP32[3504] = 14004; //@line 6180
    HEAP32[3503] = 14004; //@line 6181
    HEAP32[3506] = 14012; //@line 6182
    HEAP32[3505] = 14012; //@line 6183
    $642 = $$723947$i + -40 | 0; //@line 6184
    $644 = $$748$i + 8 | 0; //@line 6186
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 6191
    $650 = $$748$i + $649 | 0; //@line 6192
    $651 = $642 - $649 | 0; //@line 6193
    HEAP32[3437] = $650; //@line 6194
    HEAP32[3434] = $651; //@line 6195
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 6198
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 6201
    HEAP32[3438] = HEAP32[3553]; //@line 6203
   } else {
    $$024367$i = 14172; //@line 6205
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 6207
     $658 = $$024367$i + 4 | 0; //@line 6208
     $659 = HEAP32[$658 >> 2] | 0; //@line 6209
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 6213
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 6217
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 6222
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 6236
       $673 = (HEAP32[3434] | 0) + $$723947$i | 0; //@line 6238
       $675 = $636 + 8 | 0; //@line 6240
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 6245
       $681 = $636 + $680 | 0; //@line 6246
       $682 = $673 - $680 | 0; //@line 6247
       HEAP32[3437] = $681; //@line 6248
       HEAP32[3434] = $682; //@line 6249
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 6252
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 6255
       HEAP32[3438] = HEAP32[3553]; //@line 6257
       break;
      }
     }
    }
    $688 = HEAP32[3435] | 0; //@line 6262
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3435] = $$748$i; //@line 6265
     $753 = $$748$i; //@line 6266
    } else {
     $753 = $688; //@line 6268
    }
    $690 = $$748$i + $$723947$i | 0; //@line 6270
    $$124466$i = 14172; //@line 6271
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 6276
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 6280
     if (!$694) {
      $$0$i$i$i = 14172; //@line 6283
      break;
     } else {
      $$124466$i = $694; //@line 6286
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 6295
      $700 = $$124466$i + 4 | 0; //@line 6296
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 6299
      $704 = $$748$i + 8 | 0; //@line 6301
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 6307
      $712 = $690 + 8 | 0; //@line 6309
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 6315
      $722 = $710 + $$0197 | 0; //@line 6319
      $723 = $718 - $710 - $$0197 | 0; //@line 6320
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 6323
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3434] | 0) + $723 | 0; //@line 6328
        HEAP32[3434] = $728; //@line 6329
        HEAP32[3437] = $722; //@line 6330
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 6333
       } else {
        if ((HEAP32[3436] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3433] | 0) + $723 | 0; //@line 6339
         HEAP32[3433] = $734; //@line 6340
         HEAP32[3436] = $722; //@line 6341
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 6344
         HEAP32[$722 + $734 >> 2] = $734; //@line 6346
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 6350
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 6354
         $743 = $739 >>> 3; //@line 6355
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 6360
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 6362
           $750 = 13764 + ($743 << 1 << 2) | 0; //@line 6364
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 6370
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 6379
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3431] = HEAP32[3431] & ~(1 << $743); //@line 6389
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 6396
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 6400
             }
             $764 = $748 + 8 | 0; //@line 6403
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 6407
              break;
             }
             _abort(); //@line 6410
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 6415
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 6416
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 6419
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 6421
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 6425
             $783 = $782 + 4 | 0; //@line 6426
             $784 = HEAP32[$783 >> 2] | 0; //@line 6427
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 6430
              if (!$786) {
               $$3$i$i = 0; //@line 6433
               break;
              } else {
               $$1291$i$i = $786; //@line 6436
               $$1293$i$i = $782; //@line 6436
              }
             } else {
              $$1291$i$i = $784; //@line 6439
              $$1293$i$i = $783; //@line 6439
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 6442
              $789 = HEAP32[$788 >> 2] | 0; //@line 6443
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 6446
               $$1293$i$i = $788; //@line 6446
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 6449
              $792 = HEAP32[$791 >> 2] | 0; //@line 6450
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 6455
               $$1293$i$i = $791; //@line 6455
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 6460
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 6463
              $$3$i$i = $$1291$i$i; //@line 6464
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 6469
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 6472
             }
             $776 = $774 + 12 | 0; //@line 6475
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 6479
             }
             $779 = $771 + 8 | 0; //@line 6482
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 6486
              HEAP32[$779 >> 2] = $774; //@line 6487
              $$3$i$i = $771; //@line 6488
              break;
             } else {
              _abort(); //@line 6491
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 6501
           $798 = 14028 + ($797 << 2) | 0; //@line 6502
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 6507
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3432] = HEAP32[3432] & ~(1 << $797); //@line 6516
             break L311;
            } else {
             if ((HEAP32[3435] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 6522
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 6530
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3435] | 0; //@line 6540
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 6543
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 6547
           $815 = $718 + 16 | 0; //@line 6548
           $816 = HEAP32[$815 >> 2] | 0; //@line 6549
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 6555
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 6559
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 6561
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 6567
           if (!$822) {
            break;
           }
           if ((HEAP32[3435] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 6575
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 6579
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 6581
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 6588
         $$0287$i$i = $742 + $723 | 0; //@line 6588
        } else {
         $$0$i17$i = $718; //@line 6590
         $$0287$i$i = $723; //@line 6590
        }
        $830 = $$0$i17$i + 4 | 0; //@line 6592
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 6595
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 6598
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 6600
        $836 = $$0287$i$i >>> 3; //@line 6601
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 13764 + ($836 << 1 << 2) | 0; //@line 6605
         $840 = HEAP32[3431] | 0; //@line 6606
         $841 = 1 << $836; //@line 6607
         do {
          if (!($840 & $841)) {
           HEAP32[3431] = $840 | $841; //@line 6613
           $$0295$i$i = $839; //@line 6615
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 6615
          } else {
           $845 = $839 + 8 | 0; //@line 6617
           $846 = HEAP32[$845 >> 2] | 0; //@line 6618
           if ((HEAP32[3435] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 6622
            $$pre$phi$i19$iZ2D = $845; //@line 6622
            break;
           }
           _abort(); //@line 6625
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 6629
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 6631
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 6633
         HEAP32[$722 + 12 >> 2] = $839; //@line 6635
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 6638
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 6642
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 6646
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 6651
          $858 = $852 << $857; //@line 6652
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 6655
          $863 = $858 << $861; //@line 6657
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 6660
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 6665
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 6671
         }
        } while (0);
        $877 = 14028 + ($$0296$i$i << 2) | 0; //@line 6674
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 6676
        $879 = $722 + 16 | 0; //@line 6677
        HEAP32[$879 + 4 >> 2] = 0; //@line 6679
        HEAP32[$879 >> 2] = 0; //@line 6680
        $881 = HEAP32[3432] | 0; //@line 6681
        $882 = 1 << $$0296$i$i; //@line 6682
        if (!($881 & $882)) {
         HEAP32[3432] = $881 | $882; //@line 6687
         HEAP32[$877 >> 2] = $722; //@line 6688
         HEAP32[$722 + 24 >> 2] = $877; //@line 6690
         HEAP32[$722 + 12 >> 2] = $722; //@line 6692
         HEAP32[$722 + 8 >> 2] = $722; //@line 6694
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6703
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6703
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6710
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6714
         $902 = HEAP32[$900 >> 2] | 0; //@line 6716
         if (!$902) {
          label = 260; //@line 6719
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6722
          $$0289$i$i = $902; //@line 6722
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3435] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6729
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6732
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6734
          HEAP32[$722 + 12 >> 2] = $722; //@line 6736
          HEAP32[$722 + 8 >> 2] = $722; //@line 6738
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6743
         $910 = HEAP32[$909 >> 2] | 0; //@line 6744
         $911 = HEAP32[3435] | 0; //@line 6745
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6751
          HEAP32[$909 >> 2] = $722; //@line 6752
          HEAP32[$722 + 8 >> 2] = $910; //@line 6754
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6756
          HEAP32[$722 + 24 >> 2] = 0; //@line 6758
          break;
         } else {
          _abort(); //@line 6761
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6768
      STACKTOP = sp; //@line 6769
      return $$0 | 0; //@line 6769
     } else {
      $$0$i$i$i = 14172; //@line 6771
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6775
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6780
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6788
    }
    $927 = $923 + -47 | 0; //@line 6790
    $929 = $927 + 8 | 0; //@line 6792
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6798
    $936 = $636 + 16 | 0; //@line 6799
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6801
    $939 = $938 + 8 | 0; //@line 6802
    $940 = $938 + 24 | 0; //@line 6803
    $941 = $$723947$i + -40 | 0; //@line 6804
    $943 = $$748$i + 8 | 0; //@line 6806
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6811
    $949 = $$748$i + $948 | 0; //@line 6812
    $950 = $941 - $948 | 0; //@line 6813
    HEAP32[3437] = $949; //@line 6814
    HEAP32[3434] = $950; //@line 6815
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6818
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6821
    HEAP32[3438] = HEAP32[3553]; //@line 6823
    $956 = $938 + 4 | 0; //@line 6824
    HEAP32[$956 >> 2] = 27; //@line 6825
    HEAP32[$939 >> 2] = HEAP32[3543]; //@line 6826
    HEAP32[$939 + 4 >> 2] = HEAP32[3544]; //@line 6826
    HEAP32[$939 + 8 >> 2] = HEAP32[3545]; //@line 6826
    HEAP32[$939 + 12 >> 2] = HEAP32[3546]; //@line 6826
    HEAP32[3543] = $$748$i; //@line 6827
    HEAP32[3544] = $$723947$i; //@line 6828
    HEAP32[3546] = 0; //@line 6829
    HEAP32[3545] = $939; //@line 6830
    $958 = $940; //@line 6831
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6833
     HEAP32[$958 >> 2] = 7; //@line 6834
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6847
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6850
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6853
     HEAP32[$938 >> 2] = $964; //@line 6854
     $969 = $964 >>> 3; //@line 6855
     if ($964 >>> 0 < 256) {
      $972 = 13764 + ($969 << 1 << 2) | 0; //@line 6859
      $973 = HEAP32[3431] | 0; //@line 6860
      $974 = 1 << $969; //@line 6861
      if (!($973 & $974)) {
       HEAP32[3431] = $973 | $974; //@line 6866
       $$0211$i$i = $972; //@line 6868
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6868
      } else {
       $978 = $972 + 8 | 0; //@line 6870
       $979 = HEAP32[$978 >> 2] | 0; //@line 6871
       if ((HEAP32[3435] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6875
       } else {
        $$0211$i$i = $979; //@line 6878
        $$pre$phi$i$iZ2D = $978; //@line 6878
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6881
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6883
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6885
      HEAP32[$636 + 12 >> 2] = $972; //@line 6887
      break;
     }
     $985 = $964 >>> 8; //@line 6890
     if (!$985) {
      $$0212$i$i = 0; //@line 6893
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6897
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6901
       $991 = $985 << $990; //@line 6902
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6905
       $996 = $991 << $994; //@line 6907
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6910
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6915
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6921
      }
     }
     $1010 = 14028 + ($$0212$i$i << 2) | 0; //@line 6924
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6926
     HEAP32[$636 + 20 >> 2] = 0; //@line 6928
     HEAP32[$936 >> 2] = 0; //@line 6929
     $1013 = HEAP32[3432] | 0; //@line 6930
     $1014 = 1 << $$0212$i$i; //@line 6931
     if (!($1013 & $1014)) {
      HEAP32[3432] = $1013 | $1014; //@line 6936
      HEAP32[$1010 >> 2] = $636; //@line 6937
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6939
      HEAP32[$636 + 12 >> 2] = $636; //@line 6941
      HEAP32[$636 + 8 >> 2] = $636; //@line 6943
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6952
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6952
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6959
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6963
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6965
      if (!$1034) {
       label = 286; //@line 6968
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6971
       $$0207$i$i = $1034; //@line 6971
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3435] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6978
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6981
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6983
       HEAP32[$636 + 12 >> 2] = $636; //@line 6985
       HEAP32[$636 + 8 >> 2] = $636; //@line 6987
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6992
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6993
      $1043 = HEAP32[3435] | 0; //@line 6994
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 7000
       HEAP32[$1041 >> 2] = $636; //@line 7001
       HEAP32[$636 + 8 >> 2] = $1042; //@line 7003
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 7005
       HEAP32[$636 + 24 >> 2] = 0; //@line 7007
       break;
      } else {
       _abort(); //@line 7010
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3434] | 0; //@line 7017
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 7020
   HEAP32[3434] = $1054; //@line 7021
   $1055 = HEAP32[3437] | 0; //@line 7022
   $1056 = $1055 + $$0197 | 0; //@line 7023
   HEAP32[3437] = $1056; //@line 7024
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 7027
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 7030
   $$0 = $1055 + 8 | 0; //@line 7032
   STACKTOP = sp; //@line 7033
   return $$0 | 0; //@line 7033
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 7037
 $$0 = 0; //@line 7038
 STACKTOP = sp; //@line 7039
 return $$0 | 0; //@line 7039
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11191
 STACKTOP = STACKTOP + 560 | 0; //@line 11192
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 11192
 $6 = sp + 8 | 0; //@line 11193
 $7 = sp; //@line 11194
 $8 = sp + 524 | 0; //@line 11195
 $9 = $8; //@line 11196
 $10 = sp + 512 | 0; //@line 11197
 HEAP32[$7 >> 2] = 0; //@line 11198
 $11 = $10 + 12 | 0; //@line 11199
 ___DOUBLE_BITS_677($1) | 0; //@line 11200
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 11205
  $$0520 = 1; //@line 11205
  $$0521 = 6796; //@line 11205
 } else {
  $$0471 = $1; //@line 11216
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 11216
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 6797 : 6802 : 6799; //@line 11216
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 11218
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 11227
   $31 = $$0520 + 3 | 0; //@line 11232
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 11234
   _out_670($0, $$0521, $$0520); //@line 11235
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 6823 : 6827 : $27 ? 6815 : 6819, 3); //@line 11236
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 11238
   $$sink560 = $31; //@line 11239
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 11242
   $36 = $35 != 0.0; //@line 11243
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 11247
   }
   $39 = $5 | 32; //@line 11249
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 11252
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 11255
    $44 = $$0520 | 2; //@line 11256
    $46 = 12 - $3 | 0; //@line 11258
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 11263
     } else {
      $$0509585 = 8.0; //@line 11265
      $$1508586 = $46; //@line 11265
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 11267
       $$0509585 = $$0509585 * 16.0; //@line 11268
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 11283
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 11288
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 11293
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 11296
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11299
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 11302
     HEAP8[$68 >> 0] = 48; //@line 11303
     $$0511 = $68; //@line 11304
    } else {
     $$0511 = $66; //@line 11306
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 11313
    $76 = $$0511 + -2 | 0; //@line 11316
    HEAP8[$76 >> 0] = $5 + 15; //@line 11317
    $77 = ($3 | 0) < 1; //@line 11318
    $79 = ($4 & 8 | 0) == 0; //@line 11320
    $$0523 = $8; //@line 11321
    $$2473 = $$1472; //@line 11321
    while (1) {
     $80 = ~~$$2473; //@line 11323
     $86 = $$0523 + 1 | 0; //@line 11329
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[6831 + $80 >> 0]; //@line 11330
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 11333
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 11342
      } else {
       HEAP8[$86 >> 0] = 46; //@line 11345
       $$1524 = $$0523 + 2 | 0; //@line 11346
      }
     } else {
      $$1524 = $86; //@line 11349
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 11353
     }
    }
    $$pre693 = $$1524; //@line 11359
    if (!$3) {
     label = 24; //@line 11361
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 11369
      $$sink = $3 + 2 | 0; //@line 11369
     } else {
      label = 24; //@line 11371
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 11375
     $$pre$phi691Z2D = $101; //@line 11376
     $$sink = $101; //@line 11376
    }
    $104 = $11 - $76 | 0; //@line 11380
    $106 = $104 + $44 + $$sink | 0; //@line 11382
    _pad_676($0, 32, $2, $106, $4); //@line 11383
    _out_670($0, $$0521$, $44); //@line 11384
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 11386
    _out_670($0, $8, $$pre$phi691Z2D); //@line 11387
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 11389
    _out_670($0, $76, $104); //@line 11390
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 11392
    $$sink560 = $106; //@line 11393
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 11397
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 11401
    HEAP32[$7 >> 2] = $113; //@line 11402
    $$3 = $35 * 268435456.0; //@line 11403
    $$pr = $113; //@line 11403
   } else {
    $$3 = $35; //@line 11406
    $$pr = HEAP32[$7 >> 2] | 0; //@line 11406
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 11410
   $$0498 = $$561; //@line 11411
   $$4 = $$3; //@line 11411
   do {
    $116 = ~~$$4 >>> 0; //@line 11413
    HEAP32[$$0498 >> 2] = $116; //@line 11414
    $$0498 = $$0498 + 4 | 0; //@line 11415
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 11418
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 11428
    $$1499662 = $$0498; //@line 11428
    $124 = $$pr; //@line 11428
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 11431
     $$0488655 = $$1499662 + -4 | 0; //@line 11432
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 11435
     } else {
      $$0488657 = $$0488655; //@line 11437
      $$0497656 = 0; //@line 11437
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 11440
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 11442
       $131 = tempRet0; //@line 11443
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 11444
       HEAP32[$$0488657 >> 2] = $132; //@line 11446
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 11447
       $$0488657 = $$0488657 + -4 | 0; //@line 11449
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 11459
      } else {
       $138 = $$1482663 + -4 | 0; //@line 11461
       HEAP32[$138 >> 2] = $$0497656; //@line 11462
       $$2483$ph = $138; //@line 11463
      }
     }
     $$2500 = $$1499662; //@line 11466
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 11472
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 11476
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 11482
     HEAP32[$7 >> 2] = $144; //@line 11483
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 11486
      $$1499662 = $$2500; //@line 11486
      $124 = $144; //@line 11486
     } else {
      $$1482$lcssa = $$2483$ph; //@line 11488
      $$1499$lcssa = $$2500; //@line 11488
      $$pr566 = $144; //@line 11488
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 11493
    $$1499$lcssa = $$0498; //@line 11493
    $$pr566 = $$pr; //@line 11493
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 11499
    $150 = ($39 | 0) == 102; //@line 11500
    $$3484650 = $$1482$lcssa; //@line 11501
    $$3501649 = $$1499$lcssa; //@line 11501
    $152 = $$pr566; //@line 11501
    while (1) {
     $151 = 0 - $152 | 0; //@line 11503
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 11505
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 11509
      $161 = 1e9 >>> $154; //@line 11510
      $$0487644 = 0; //@line 11511
      $$1489643 = $$3484650; //@line 11511
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 11513
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 11517
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 11518
       $$1489643 = $$1489643 + 4 | 0; //@line 11519
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 11530
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 11533
       $$4502 = $$3501649; //@line 11533
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 11536
       $$$3484700 = $$$3484; //@line 11537
       $$4502 = $$3501649 + 4 | 0; //@line 11537
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 11544
      $$4502 = $$3501649; //@line 11544
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 11546
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 11553
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 11555
     HEAP32[$7 >> 2] = $152; //@line 11556
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 11561
      $$3501$lcssa = $$$4502; //@line 11561
      break;
     } else {
      $$3484650 = $$$3484700; //@line 11559
      $$3501649 = $$$4502; //@line 11559
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 11566
    $$3501$lcssa = $$1499$lcssa; //@line 11566
   }
   $185 = $$561; //@line 11569
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 11574
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 11575
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 11578
    } else {
     $$0514639 = $189; //@line 11580
     $$0530638 = 10; //@line 11580
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 11582
      $193 = $$0514639 + 1 | 0; //@line 11583
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 11586
       break;
      } else {
       $$0514639 = $193; //@line 11589
      }
     }
    }
   } else {
    $$1515 = 0; //@line 11594
   }
   $198 = ($39 | 0) == 103; //@line 11599
   $199 = ($$540 | 0) != 0; //@line 11600
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 11603
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 11612
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 11615
    $213 = ($209 | 0) % 9 | 0; //@line 11616
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 11619
     $$1531632 = 10; //@line 11619
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 11622
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 11625
       $$1531632 = $215; //@line 11625
      } else {
       $$1531$lcssa = $215; //@line 11627
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 11632
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 11634
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 11635
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 11638
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 11641
     $$4518 = $$1515; //@line 11641
     $$8 = $$3484$lcssa; //@line 11641
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 11646
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 11647
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 11652
     if (!$$0520) {
      $$1467 = $$$564; //@line 11655
      $$1469 = $$543; //@line 11655
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 11658
      $$1467 = $230 ? -$$$564 : $$$564; //@line 11663
      $$1469 = $230 ? -$$543 : $$543; //@line 11663
     }
     $233 = $217 - $218 | 0; //@line 11665
     HEAP32[$212 >> 2] = $233; //@line 11666
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 11670
      HEAP32[$212 >> 2] = $236; //@line 11671
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 11674
       $$sink547625 = $212; //@line 11674
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 11676
        HEAP32[$$sink547625 >> 2] = 0; //@line 11677
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 11680
         HEAP32[$240 >> 2] = 0; //@line 11681
         $$6 = $240; //@line 11682
        } else {
         $$6 = $$5486626; //@line 11684
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 11687
        HEAP32[$238 >> 2] = $242; //@line 11688
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 11691
         $$sink547625 = $238; //@line 11691
        } else {
         $$5486$lcssa = $$6; //@line 11693
         $$sink547$lcssa = $238; //@line 11693
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 11698
       $$sink547$lcssa = $212; //@line 11698
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 11703
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 11704
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 11707
       $$4518 = $247; //@line 11707
       $$8 = $$5486$lcssa; //@line 11707
      } else {
       $$2516621 = $247; //@line 11709
       $$2532620 = 10; //@line 11709
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 11711
        $251 = $$2516621 + 1 | 0; //@line 11712
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 11715
         $$4518 = $251; //@line 11715
         $$8 = $$5486$lcssa; //@line 11715
         break;
        } else {
         $$2516621 = $251; //@line 11718
        }
       }
      }
     } else {
      $$4492 = $212; //@line 11723
      $$4518 = $$1515; //@line 11723
      $$8 = $$3484$lcssa; //@line 11723
     }
    }
    $253 = $$4492 + 4 | 0; //@line 11726
    $$5519$ph = $$4518; //@line 11729
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 11729
    $$9$ph = $$8; //@line 11729
   } else {
    $$5519$ph = $$1515; //@line 11731
    $$7505$ph = $$3501$lcssa; //@line 11731
    $$9$ph = $$3484$lcssa; //@line 11731
   }
   $$7505 = $$7505$ph; //@line 11733
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 11737
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 11740
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 11744
    } else {
     $$lcssa675 = 1; //@line 11746
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 11750
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 11755
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 11763
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 11763
     } else {
      $$0479 = $5 + -2 | 0; //@line 11767
      $$2476 = $$540$ + -1 | 0; //@line 11767
     }
     $267 = $4 & 8; //@line 11769
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 11774
       if (!$270) {
        $$2529 = 9; //@line 11777
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 11782
         $$3533616 = 10; //@line 11782
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 11784
          $275 = $$1528617 + 1 | 0; //@line 11785
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 11791
           break;
          } else {
           $$1528617 = $275; //@line 11789
          }
         }
        } else {
         $$2529 = 0; //@line 11796
        }
       }
      } else {
       $$2529 = 9; //@line 11800
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 11808
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 11810
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 11812
       $$1480 = $$0479; //@line 11815
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 11815
       $$pre$phi698Z2D = 0; //@line 11815
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 11819
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 11821
       $$1480 = $$0479; //@line 11824
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 11824
       $$pre$phi698Z2D = 0; //@line 11824
       break;
      }
     } else {
      $$1480 = $$0479; //@line 11828
      $$3477 = $$2476; //@line 11828
      $$pre$phi698Z2D = $267; //@line 11828
     }
    } else {
     $$1480 = $5; //@line 11832
     $$3477 = $$540; //@line 11832
     $$pre$phi698Z2D = $4 & 8; //@line 11832
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 11835
   $294 = ($292 | 0) != 0 & 1; //@line 11837
   $296 = ($$1480 | 32 | 0) == 102; //@line 11839
   if ($296) {
    $$2513 = 0; //@line 11843
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 11843
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 11846
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11849
    $304 = $11; //@line 11850
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 11855
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 11857
      HEAP8[$308 >> 0] = 48; //@line 11858
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 11863
      } else {
       $$1512$lcssa = $308; //@line 11865
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 11870
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 11877
    $318 = $$1512$lcssa + -2 | 0; //@line 11879
    HEAP8[$318 >> 0] = $$1480; //@line 11880
    $$2513 = $318; //@line 11883
    $$pn = $304 - $318 | 0; //@line 11883
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 11888
   _pad_676($0, 32, $2, $323, $4); //@line 11889
   _out_670($0, $$0521, $$0520); //@line 11890
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 11892
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 11895
    $326 = $8 + 9 | 0; //@line 11896
    $327 = $326; //@line 11897
    $328 = $8 + 8 | 0; //@line 11898
    $$5493600 = $$0496$$9; //@line 11899
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 11902
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 11907
       $$1465 = $328; //@line 11908
      } else {
       $$1465 = $330; //@line 11910
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 11917
       $$0464597 = $330; //@line 11918
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 11920
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 11923
        } else {
         $$1465 = $335; //@line 11925
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 11930
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 11935
     $$5493600 = $$5493600 + 4 | 0; //@line 11936
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 6847, 1); //@line 11946
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 11952
     $$6494592 = $$5493600; //@line 11952
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 11955
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 11960
       $$0463587 = $347; //@line 11961
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 11963
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 11966
        } else {
         $$0463$lcssa = $351; //@line 11968
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 11973
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 11977
      $$6494592 = $$6494592 + 4 | 0; //@line 11978
      $356 = $$4478593 + -9 | 0; //@line 11979
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 11986
       break;
      } else {
       $$4478593 = $356; //@line 11984
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 11991
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 11994
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 11997
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 12000
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 12001
     $365 = $363; //@line 12002
     $366 = 0 - $9 | 0; //@line 12003
     $367 = $8 + 8 | 0; //@line 12004
     $$5605 = $$3477; //@line 12005
     $$7495604 = $$9$ph; //@line 12005
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 12008
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 12011
       $$0 = $367; //@line 12012
      } else {
       $$0 = $369; //@line 12014
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 12019
        _out_670($0, $$0, 1); //@line 12020
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 12024
         break;
        }
        _out_670($0, 6847, 1); //@line 12027
        $$2 = $375; //@line 12028
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 12032
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 12037
        $$1601 = $$0; //@line 12038
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 12040
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 12043
         } else {
          $$2 = $373; //@line 12045
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 12052
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 12055
      $381 = $$5605 - $378 | 0; //@line 12056
      $$7495604 = $$7495604 + 4 | 0; //@line 12057
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 12064
       break;
      } else {
       $$5605 = $381; //@line 12062
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 12069
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 12072
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 12076
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 12079
   $$sink560 = $323; //@line 12080
  }
 } while (0);
 STACKTOP = sp; //@line 12085
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 12085
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 9763
 STACKTOP = STACKTOP + 64 | 0; //@line 9764
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9764
 $5 = sp + 16 | 0; //@line 9765
 $6 = sp; //@line 9766
 $7 = sp + 24 | 0; //@line 9767
 $8 = sp + 8 | 0; //@line 9768
 $9 = sp + 20 | 0; //@line 9769
 HEAP32[$5 >> 2] = $1; //@line 9770
 $10 = ($0 | 0) != 0; //@line 9771
 $11 = $7 + 40 | 0; //@line 9772
 $12 = $11; //@line 9773
 $13 = $7 + 39 | 0; //@line 9774
 $14 = $8 + 4 | 0; //@line 9775
 $$0243 = 0; //@line 9776
 $$0247 = 0; //@line 9776
 $$0269 = 0; //@line 9776
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9785
     $$1248 = -1; //@line 9786
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 9790
     break;
    }
   } else {
    $$1248 = $$0247; //@line 9794
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 9797
  $21 = HEAP8[$20 >> 0] | 0; //@line 9798
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 9801
   break;
  } else {
   $23 = $21; //@line 9804
   $25 = $20; //@line 9804
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 9809
     $27 = $25; //@line 9809
     label = 9; //@line 9810
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 9815
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 9822
   HEAP32[$5 >> 2] = $24; //@line 9823
   $23 = HEAP8[$24 >> 0] | 0; //@line 9825
   $25 = $24; //@line 9825
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 9830
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 9835
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 9838
     $27 = $27 + 2 | 0; //@line 9839
     HEAP32[$5 >> 2] = $27; //@line 9840
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 9847
      break;
     } else {
      $$0249303 = $30; //@line 9844
      label = 9; //@line 9845
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 9855
  if ($10) {
   _out_670($0, $20, $36); //@line 9857
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 9861
   $$0247 = $$1248; //@line 9861
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 9869
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 9870
  if ($43) {
   $$0253 = -1; //@line 9872
   $$1270 = $$0269; //@line 9872
   $$sink = 1; //@line 9872
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 9882
    $$1270 = 1; //@line 9882
    $$sink = 3; //@line 9882
   } else {
    $$0253 = -1; //@line 9884
    $$1270 = $$0269; //@line 9884
    $$sink = 1; //@line 9884
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 9887
  HEAP32[$5 >> 2] = $51; //@line 9888
  $52 = HEAP8[$51 >> 0] | 0; //@line 9889
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 9891
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 9898
   $$lcssa291 = $52; //@line 9898
   $$lcssa292 = $51; //@line 9898
  } else {
   $$0262309 = 0; //@line 9900
   $60 = $52; //@line 9900
   $65 = $51; //@line 9900
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 9905
    $64 = $65 + 1 | 0; //@line 9906
    HEAP32[$5 >> 2] = $64; //@line 9907
    $66 = HEAP8[$64 >> 0] | 0; //@line 9908
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 9910
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 9917
     $$lcssa291 = $66; //@line 9917
     $$lcssa292 = $64; //@line 9917
     break;
    } else {
     $$0262309 = $63; //@line 9920
     $60 = $66; //@line 9920
     $65 = $64; //@line 9920
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 9932
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 9934
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 9939
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9944
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9956
     $$2271 = 1; //@line 9956
     $storemerge274 = $79 + 3 | 0; //@line 9956
    } else {
     label = 23; //@line 9958
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 9962
    if ($$1270 | 0) {
     $$0 = -1; //@line 9965
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9980
     $106 = HEAP32[$105 >> 2] | 0; //@line 9981
     HEAP32[$2 >> 2] = $105 + 4; //@line 9983
     $363 = $106; //@line 9984
    } else {
     $363 = 0; //@line 9986
    }
    $$0259 = $363; //@line 9990
    $$2271 = 0; //@line 9990
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 9990
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 9992
   $109 = ($$0259 | 0) < 0; //@line 9993
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 9998
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 9998
   $$3272 = $$2271; //@line 9998
   $115 = $storemerge274; //@line 9998
  } else {
   $112 = _getint_671($5) | 0; //@line 10000
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 10003
    break;
   }
   $$1260 = $112; //@line 10007
   $$1263 = $$0262$lcssa; //@line 10007
   $$3272 = $$1270; //@line 10007
   $115 = HEAP32[$5 >> 2] | 0; //@line 10007
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 10018
     $156 = _getint_671($5) | 0; //@line 10019
     $$0254 = $156; //@line 10021
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 10021
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 10030
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 10035
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 10040
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 10047
      $144 = $125 + 4 | 0; //@line 10051
      HEAP32[$5 >> 2] = $144; //@line 10052
      $$0254 = $140; //@line 10053
      $$pre345 = $144; //@line 10053
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 10059
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10074
     $152 = HEAP32[$151 >> 2] | 0; //@line 10075
     HEAP32[$2 >> 2] = $151 + 4; //@line 10077
     $364 = $152; //@line 10078
    } else {
     $364 = 0; //@line 10080
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 10083
    HEAP32[$5 >> 2] = $154; //@line 10084
    $$0254 = $364; //@line 10085
    $$pre345 = $154; //@line 10085
   } else {
    $$0254 = -1; //@line 10087
    $$pre345 = $115; //@line 10087
   }
  } while (0);
  $$0252 = 0; //@line 10090
  $158 = $$pre345; //@line 10090
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 10097
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 10100
   HEAP32[$5 >> 2] = $158; //@line 10101
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (6315 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 10106
   $168 = $167 & 255; //@line 10107
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 10111
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 10118
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 10122
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 10126
     break L1;
    } else {
     label = 50; //@line 10129
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 10134
     $176 = $3 + ($$0253 << 3) | 0; //@line 10136
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 10141
     $182 = $6; //@line 10142
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 10144
     HEAP32[$182 + 4 >> 2] = $181; //@line 10147
     label = 50; //@line 10148
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 10152
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 10155
    $187 = HEAP32[$5 >> 2] | 0; //@line 10157
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 10161
   if ($10) {
    $187 = $158; //@line 10163
   } else {
    $$0243 = 0; //@line 10165
    $$0247 = $$1248; //@line 10165
    $$0269 = $$3272; //@line 10165
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 10171
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 10177
  $196 = $$1263 & -65537; //@line 10180
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 10181
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10189
       $$0243 = 0; //@line 10190
       $$0247 = $$1248; //@line 10190
       $$0269 = $$3272; //@line 10190
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10196
       $$0243 = 0; //@line 10197
       $$0247 = $$1248; //@line 10197
       $$0269 = $$3272; //@line 10197
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 10205
       HEAP32[$208 >> 2] = $$1248; //@line 10207
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 10210
       $$0243 = 0; //@line 10211
       $$0247 = $$1248; //@line 10211
       $$0269 = $$3272; //@line 10211
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 10218
       $$0243 = 0; //@line 10219
       $$0247 = $$1248; //@line 10219
       $$0269 = $$3272; //@line 10219
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 10226
       $$0243 = 0; //@line 10227
       $$0247 = $$1248; //@line 10227
       $$0269 = $$3272; //@line 10227
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10233
       $$0243 = 0; //@line 10234
       $$0247 = $$1248; //@line 10234
       $$0269 = $$3272; //@line 10234
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 10242
       HEAP32[$220 >> 2] = $$1248; //@line 10244
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 10247
       $$0243 = 0; //@line 10248
       $$0247 = $$1248; //@line 10248
       $$0269 = $$3272; //@line 10248
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 10253
       $$0247 = $$1248; //@line 10253
       $$0269 = $$3272; //@line 10253
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 10263
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 10263
     $$3265 = $$1263$ | 8; //@line 10263
     label = 62; //@line 10264
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 10268
     $$1255 = $$0254; //@line 10268
     $$3265 = $$1263$; //@line 10268
     label = 62; //@line 10269
     break;
    }
   case 111:
    {
     $242 = $6; //@line 10273
     $244 = HEAP32[$242 >> 2] | 0; //@line 10275
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 10278
     $248 = _fmt_o($244, $247, $11) | 0; //@line 10279
     $252 = $12 - $248 | 0; //@line 10283
     $$0228 = $248; //@line 10288
     $$1233 = 0; //@line 10288
     $$1238 = 6779; //@line 10288
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 10288
     $$4266 = $$1263$; //@line 10288
     $281 = $244; //@line 10288
     $283 = $247; //@line 10288
     label = 68; //@line 10289
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 10293
     $258 = HEAP32[$256 >> 2] | 0; //@line 10295
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 10298
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 10301
      $264 = tempRet0; //@line 10302
      $265 = $6; //@line 10303
      HEAP32[$265 >> 2] = $263; //@line 10305
      HEAP32[$265 + 4 >> 2] = $264; //@line 10308
      $$0232 = 1; //@line 10309
      $$0237 = 6779; //@line 10309
      $275 = $263; //@line 10309
      $276 = $264; //@line 10309
      label = 67; //@line 10310
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 10322
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 6779 : 6781 : 6780; //@line 10322
      $275 = $258; //@line 10322
      $276 = $261; //@line 10322
      label = 67; //@line 10323
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 10329
     $$0232 = 0; //@line 10335
     $$0237 = 6779; //@line 10335
     $275 = HEAP32[$197 >> 2] | 0; //@line 10335
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 10335
     label = 67; //@line 10336
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 10347
     $$2 = $13; //@line 10348
     $$2234 = 0; //@line 10348
     $$2239 = 6779; //@line 10348
     $$2251 = $11; //@line 10348
     $$5 = 1; //@line 10348
     $$6268 = $196; //@line 10348
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 10355
     label = 72; //@line 10356
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 10360
     $$1 = $302 | 0 ? $302 : 6789; //@line 10363
     label = 72; //@line 10364
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 10374
     HEAP32[$14 >> 2] = 0; //@line 10375
     HEAP32[$6 >> 2] = $8; //@line 10376
     $$4258354 = -1; //@line 10377
     $365 = $8; //@line 10377
     label = 76; //@line 10378
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 10382
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 10385
      $$0240$lcssa356 = 0; //@line 10386
      label = 85; //@line 10387
     } else {
      $$4258354 = $$0254; //@line 10389
      $365 = $$pre348; //@line 10389
      label = 76; //@line 10390
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 10397
     $$0247 = $$1248; //@line 10397
     $$0269 = $$3272; //@line 10397
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 10402
     $$2234 = 0; //@line 10402
     $$2239 = 6779; //@line 10402
     $$2251 = $11; //@line 10402
     $$5 = $$0254; //@line 10402
     $$6268 = $$1263$; //@line 10402
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 10408
    $227 = $6; //@line 10409
    $229 = HEAP32[$227 >> 2] | 0; //@line 10411
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 10414
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 10416
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 10422
    $$0228 = $234; //@line 10427
    $$1233 = $or$cond278 ? 0 : 2; //@line 10427
    $$1238 = $or$cond278 ? 6779 : 6779 + ($$1236 >> 4) | 0; //@line 10427
    $$2256 = $$1255; //@line 10427
    $$4266 = $$3265; //@line 10427
    $281 = $229; //@line 10427
    $283 = $232; //@line 10427
    label = 68; //@line 10428
   } else if ((label | 0) == 67) {
    label = 0; //@line 10431
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 10433
    $$1233 = $$0232; //@line 10433
    $$1238 = $$0237; //@line 10433
    $$2256 = $$0254; //@line 10433
    $$4266 = $$1263$; //@line 10433
    $281 = $275; //@line 10433
    $283 = $276; //@line 10433
    label = 68; //@line 10434
   } else if ((label | 0) == 72) {
    label = 0; //@line 10437
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 10438
    $306 = ($305 | 0) == 0; //@line 10439
    $$2 = $$1; //@line 10446
    $$2234 = 0; //@line 10446
    $$2239 = 6779; //@line 10446
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 10446
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 10446
    $$6268 = $196; //@line 10446
   } else if ((label | 0) == 76) {
    label = 0; //@line 10449
    $$0229316 = $365; //@line 10450
    $$0240315 = 0; //@line 10450
    $$1244314 = 0; //@line 10450
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 10452
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 10455
      $$2245 = $$1244314; //@line 10455
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 10458
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 10464
      $$2245 = $320; //@line 10464
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 10468
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 10471
      $$0240315 = $325; //@line 10471
      $$1244314 = $320; //@line 10471
     } else {
      $$0240$lcssa = $325; //@line 10473
      $$2245 = $320; //@line 10473
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 10479
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 10482
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 10485
     label = 85; //@line 10486
    } else {
     $$1230327 = $365; //@line 10488
     $$1241326 = 0; //@line 10488
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 10490
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10493
       label = 85; //@line 10494
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 10497
      $$1241326 = $331 + $$1241326 | 0; //@line 10498
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10501
       label = 85; //@line 10502
       break L97;
      }
      _out_670($0, $9, $331); //@line 10506
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 10511
       label = 85; //@line 10512
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 10509
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 10520
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 10526
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 10528
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 10533
   $$2 = $or$cond ? $$0228 : $11; //@line 10538
   $$2234 = $$1233; //@line 10538
   $$2239 = $$1238; //@line 10538
   $$2251 = $11; //@line 10538
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 10538
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 10538
  } else if ((label | 0) == 85) {
   label = 0; //@line 10541
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 10543
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 10546
   $$0247 = $$1248; //@line 10546
   $$0269 = $$3272; //@line 10546
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 10551
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 10553
  $345 = $$$5 + $$2234 | 0; //@line 10554
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 10556
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 10557
  _out_670($0, $$2239, $$2234); //@line 10558
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 10560
  _pad_676($0, 48, $$$5, $343, 0); //@line 10561
  _out_670($0, $$2, $343); //@line 10562
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 10564
  $$0243 = $$2261; //@line 10565
  $$0247 = $$1248; //@line 10565
  $$0269 = $$3272; //@line 10565
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 10573
    } else {
     $$2242302 = 1; //@line 10575
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 10578
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 10581
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 10585
      $356 = $$2242302 + 1 | 0; //@line 10586
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 10589
      } else {
       $$2242$lcssa = $356; //@line 10591
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 10597
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 10603
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 10609
       } else {
        $$0 = 1; //@line 10611
        break;
       }
      }
     } else {
      $$0 = 1; //@line 10616
     }
    }
   } else {
    $$0 = $$1248; //@line 10620
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10624
 return $$0 | 0; //@line 10624
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 290
 STACKTOP = STACKTOP + 96 | 0; //@line 291
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 291
 $vararg_buffer23 = sp + 72 | 0; //@line 292
 $vararg_buffer20 = sp + 64 | 0; //@line 293
 $vararg_buffer18 = sp + 56 | 0; //@line 294
 $vararg_buffer15 = sp + 48 | 0; //@line 295
 $vararg_buffer12 = sp + 40 | 0; //@line 296
 $vararg_buffer9 = sp + 32 | 0; //@line 297
 $vararg_buffer6 = sp + 24 | 0; //@line 298
 $vararg_buffer3 = sp + 16 | 0; //@line 299
 $vararg_buffer1 = sp + 8 | 0; //@line 300
 $vararg_buffer = sp; //@line 301
 $4 = sp + 80 | 0; //@line 302
 $5 = HEAP32[93] | 0; //@line 303
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 307
   FUNCTION_TABLE_v[$5 & 3](); //@line 308
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 38; //@line 311
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer18; //@line 313
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer18; //@line 315
    HEAP8[$AsyncCtx + 12 >> 0] = $0; //@line 317
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 319
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer15; //@line 321
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer15; //@line 323
    HEAP32[$AsyncCtx + 28 >> 2] = $2; //@line 325
    HEAP32[$AsyncCtx + 32 >> 2] = $3; //@line 327
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer6; //@line 329
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer6; //@line 331
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer12; //@line 333
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer12; //@line 335
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer9; //@line 337
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer9; //@line 339
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer20; //@line 341
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer20; //@line 343
    HEAP32[$AsyncCtx + 68 >> 2] = $4; //@line 345
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer1; //@line 347
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer1; //@line 349
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer; //@line 351
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer; //@line 353
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer3; //@line 355
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer3; //@line 357
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer23; //@line 359
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer23; //@line 361
    sp = STACKTOP; //@line 362
    STACKTOP = sp; //@line 363
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 365
    HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 368
    break;
   }
  }
 } while (0);
 $34 = HEAP32[84] | 0; //@line 373
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 377
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[81] | 0; //@line 383
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 390
       break;
      }
     }
     $43 = HEAP32[82] | 0; //@line 394
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 398
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 403
      } else {
       label = 11; //@line 405
      }
     }
    } else {
     label = 11; //@line 409
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 413
   }
   if (!((HEAP32[91] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 425
    break;
   }
   $54 = HEAPU8[320] | 0; //@line 429
   $55 = $0 & 255; //@line 430
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 435
    $$lobit = $59 >>> 6; //@line 436
    $60 = $$lobit & 255; //@line 437
    $64 = ($54 & 32 | 0) == 0; //@line 441
    $65 = HEAP32[85] | 0; //@line 442
    $66 = HEAP32[84] | 0; //@line 443
    $67 = $0 << 24 >> 24 == 1; //@line 444
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 448
      _vsnprintf($66, $65, $2, $3) | 0; //@line 449
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 39; //@line 452
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 455
       sp = STACKTOP; //@line 456
       STACKTOP = sp; //@line 457
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 459
      $69 = HEAP32[92] | 0; //@line 460
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[91] | 0; //@line 464
       $74 = HEAP32[84] | 0; //@line 465
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 466
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 467
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 42; //@line 470
        sp = STACKTOP; //@line 471
        STACKTOP = sp; //@line 472
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 474
        break;
       }
      }
      $71 = HEAP32[84] | 0; //@line 478
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 479
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 480
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 40; //@line 483
       sp = STACKTOP; //@line 484
       STACKTOP = sp; //@line 485
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 487
      $72 = HEAP32[92] | 0; //@line 488
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 489
      FUNCTION_TABLE_vi[$72 & 255](2084); //@line 490
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 41; //@line 493
       sp = STACKTOP; //@line 494
       STACKTOP = sp; //@line 495
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 497
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 504
       $$1143 = $66; //@line 504
       $$1145 = $65; //@line 504
       $$3154 = 0; //@line 504
       label = 38; //@line 505
      } else {
       if ($64) {
        $$0142 = $66; //@line 508
        $$0144 = $65; //@line 508
       } else {
        $76 = _snprintf($66, $65, 2086, $vararg_buffer) | 0; //@line 510
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 512
        $78 = ($$ | 0) > 0; //@line 513
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 518
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 518
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 522
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 2104; //@line 528
          label = 35; //@line 529
          break;
         }
        case 1:
         {
          $$sink = 2110; //@line 533
          label = 35; //@line 534
          break;
         }
        case 3:
         {
          $$sink = 2098; //@line 538
          label = 35; //@line 539
          break;
         }
        case 7:
         {
          $$sink = 2092; //@line 543
          label = 35; //@line 544
          break;
         }
        default:
         {
          $$0141 = 0; //@line 548
          $$1152 = 0; //@line 548
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 552
         $$0141 = $60 & 1; //@line 555
         $$1152 = _snprintf($$0142, $$0144, 2116, $vararg_buffer1) | 0; //@line 555
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 558
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 560
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 562
         $$1$off0 = $extract$t159; //@line 567
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 567
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 567
         $$3154 = $$1152; //@line 567
         label = 38; //@line 568
        } else {
         $$1$off0 = $extract$t159; //@line 570
         $$1143 = $$0142; //@line 570
         $$1145 = $$0144; //@line 570
         $$3154 = $$1152$; //@line 570
         label = 38; //@line 571
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 584
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 585
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 586
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 43; //@line 589
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer18; //@line 591
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer18; //@line 593
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer15; //@line 595
           HEAP32[$AsyncCtx60 + 16 >> 2] = $1; //@line 597
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer15; //@line 599
           HEAP32[$AsyncCtx60 + 24 >> 2] = $2; //@line 601
           HEAP32[$AsyncCtx60 + 28 >> 2] = $3; //@line 603
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer6; //@line 605
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer6; //@line 607
           HEAP32[$AsyncCtx60 + 40 >> 2] = $$1143; //@line 609
           HEAP32[$AsyncCtx60 + 44 >> 2] = $$1145; //@line 611
           HEAP32[$AsyncCtx60 + 48 >> 2] = $55; //@line 613
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer12; //@line 615
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer12; //@line 617
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer9; //@line 619
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer9; //@line 621
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer20; //@line 623
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer20; //@line 625
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer3; //@line 627
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer3; //@line 629
           HEAP32[$AsyncCtx60 + 84 >> 2] = $4; //@line 631
           HEAP8[$AsyncCtx60 + 88 >> 0] = $$1$off0 & 1; //@line 634
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer23; //@line 636
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer23; //@line 638
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 640
           sp = STACKTOP; //@line 641
           STACKTOP = sp; //@line 642
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 644
          $125 = HEAP32[89] | 0; //@line 649
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 650
          $126 = FUNCTION_TABLE_ii[$125 & 31](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 651
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 44; //@line 654
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer18; //@line 656
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer18; //@line 658
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer15; //@line 660
           HEAP32[$AsyncCtx38 + 16 >> 2] = $1; //@line 662
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer15; //@line 664
           HEAP32[$AsyncCtx38 + 24 >> 2] = $2; //@line 666
           HEAP32[$AsyncCtx38 + 28 >> 2] = $3; //@line 668
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer6; //@line 670
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer6; //@line 672
           HEAP32[$AsyncCtx38 + 40 >> 2] = $$1143; //@line 674
           HEAP32[$AsyncCtx38 + 44 >> 2] = $$1145; //@line 676
           HEAP32[$AsyncCtx38 + 48 >> 2] = $55; //@line 678
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer12; //@line 680
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer12; //@line 682
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer9; //@line 684
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer9; //@line 686
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer20; //@line 688
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer20; //@line 690
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer3; //@line 692
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer3; //@line 694
           HEAP32[$AsyncCtx38 + 84 >> 2] = $4; //@line 696
           HEAP8[$AsyncCtx38 + 88 >> 0] = $$1$off0 & 1; //@line 699
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer23; //@line 701
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer23; //@line 703
           sp = STACKTOP; //@line 704
           STACKTOP = sp; //@line 705
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 707
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 708
           $151 = _snprintf($$1143, $$1145, 2116, $vararg_buffer3) | 0; //@line 709
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 711
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 716
            $$3147 = $$1145 - $$10 | 0; //@line 716
            label = 44; //@line 717
            break;
           } else {
            $$3147168 = $$1145; //@line 720
            $$3169 = $$1143; //@line 720
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 725
          $$3147 = $$1145; //@line 725
          label = 44; //@line 726
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 732
          $$3169 = $$3; //@line 732
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 737
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 743
          $$5156 = _snprintf($$3169, $$3147168, 2119, $vararg_buffer6) | 0; //@line 745
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 749
          $$5156 = _snprintf($$3169, $$3147168, 2134, $vararg_buffer9) | 0; //@line 751
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 755
          $$5156 = _snprintf($$3169, $$3147168, 2149, $vararg_buffer12) | 0; //@line 757
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 761
          $$5156 = _snprintf($$3169, $$3147168, 2164, $vararg_buffer15) | 0; //@line 763
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 2179, $vararg_buffer18) | 0; //@line 768
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 772
        $168 = $$3169 + $$5156$ | 0; //@line 774
        $169 = $$3147168 - $$5156$ | 0; //@line 775
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 779
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 780
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 45; //@line 783
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 785
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 787
          HEAP32[$AsyncCtx56 + 12 >> 2] = $169; //@line 789
          HEAP32[$AsyncCtx56 + 16 >> 2] = $168; //@line 791
          HEAP8[$AsyncCtx56 + 20 >> 0] = $$1$off0 & 1; //@line 794
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer23; //@line 796
          HEAP32[$AsyncCtx56 + 28 >> 2] = $vararg_buffer23; //@line 798
          sp = STACKTOP; //@line 799
          STACKTOP = sp; //@line 800
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 802
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 804
         $181 = $168 + $$13 | 0; //@line 806
         $182 = $169 - $$13 | 0; //@line 807
         if (($$13 | 0) > 0) {
          $184 = HEAP32[90] | 0; //@line 810
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 815
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 816
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 46; //@line 819
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 821
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 823
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 825
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 827
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 830
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 832
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 834
             sp = STACKTOP; //@line 835
             STACKTOP = sp; //@line 836
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 838
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 839
             $194 = _snprintf($181, $182, 2116, $vararg_buffer20) | 0; //@line 840
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 842
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 847
              $$6150 = $182 - $$18 | 0; //@line 847
              $$9 = $$18; //@line 847
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 854
            $$6150 = $182; //@line 854
            $$9 = $$13; //@line 854
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 2194, $vararg_buffer23) | 0; //@line 863
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[91] | 0; //@line 869
      $202 = HEAP32[84] | 0; //@line 870
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 871
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 872
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 47; //@line 875
       sp = STACKTOP; //@line 876
       STACKTOP = sp; //@line 877
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 879
       break;
      }
     }
    } while (0);
    HEAP32[88] = HEAP32[86]; //@line 885
   }
  }
 } while (0);
 $204 = HEAP32[94] | 0; //@line 889
 if (!$204) {
  STACKTOP = sp; //@line 892
  return;
 }
 $206 = HEAP32[95] | 0; //@line 894
 HEAP32[95] = 0; //@line 895
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 896
 FUNCTION_TABLE_v[$204 & 3](); //@line 897
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 48; //@line 900
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 902
  sp = STACKTOP; //@line 903
  STACKTOP = sp; //@line 904
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 906
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 909
 } else {
  STACKTOP = sp; //@line 911
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 914
  $$pre = HEAP32[94] | 0; //@line 915
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 916
  FUNCTION_TABLE_v[$$pre & 3](); //@line 917
  if (___async) {
   label = 70; //@line 920
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 923
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 926
  } else {
   label = 72; //@line 928
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 49; //@line 933
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 935
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 937
  sp = STACKTOP; //@line 938
  STACKTOP = sp; //@line 939
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 942
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $40 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5575
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5577
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5579
 $6 = HEAP8[$0 + 12 >> 0] | 0; //@line 5581
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5583
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5585
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5587
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5589
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5591
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5593
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5595
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5597
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 5599
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 5601
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 5603
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 5605
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 5607
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 5609
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 5611
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 5615
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 5619
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 5621
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 5623
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 5625
 HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 5628
 $53 = HEAP32[84] | 0; //@line 5629
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 5633
   do {
    if ($6 << 24 >> 24 > -1 & ($8 | 0) != 0) {
     $57 = HEAP32[81] | 0; //@line 5639
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $8) | 0) {
       $$0$i = 1; //@line 5646
       break;
      }
     }
     $62 = HEAP32[82] | 0; //@line 5650
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 5654
     } else {
      if (!(_strstr($62, $8) | 0)) {
       $$0$i = 1; //@line 5659
      } else {
       label = 9; //@line 5661
      }
     }
    } else {
     label = 9; //@line 5665
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 5669
   }
   if (!((HEAP32[91] | 0) != 0 & ((($8 | 0) == 0 | (($14 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 5681
    break;
   }
   $73 = HEAPU8[320] | 0; //@line 5685
   $74 = $6 & 255; //@line 5686
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 5691
    $$lobit = $78 >>> 6; //@line 5692
    $79 = $$lobit & 255; //@line 5693
    $83 = ($73 & 32 | 0) == 0; //@line 5697
    $84 = HEAP32[85] | 0; //@line 5698
    $85 = HEAP32[84] | 0; //@line 5699
    $86 = $6 << 24 >> 24 == 1; //@line 5700
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 5703
     _vsnprintf($85, $84, $14, $16) | 0; //@line 5704
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 39; //@line 5707
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 5708
      $$expand_i1_val = $86 & 1; //@line 5709
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 5710
      sp = STACKTOP; //@line 5711
      return;
     }
     ___async_unwind = 0; //@line 5714
     HEAP32[$ReallocAsyncCtx12 >> 2] = 39; //@line 5715
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 5716
     $$expand_i1_val = $86 & 1; //@line 5717
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 5718
     sp = STACKTOP; //@line 5719
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 5725
     $$1143 = $85; //@line 5725
     $$1145 = $84; //@line 5725
     $$3154 = 0; //@line 5725
     label = 28; //@line 5726
    } else {
     if ($83) {
      $$0142 = $85; //@line 5729
      $$0144 = $84; //@line 5729
     } else {
      $89 = _snprintf($85, $84, 2086, $40) | 0; //@line 5731
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 5733
      $91 = ($$ | 0) > 0; //@line 5734
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 5739
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 5739
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 5743
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 2104; //@line 5749
        label = 25; //@line 5750
        break;
       }
      case 1:
       {
        $$sink = 2110; //@line 5754
        label = 25; //@line 5755
        break;
       }
      case 3:
       {
        $$sink = 2098; //@line 5759
        label = 25; //@line 5760
        break;
       }
      case 7:
       {
        $$sink = 2092; //@line 5764
        label = 25; //@line 5765
        break;
       }
      default:
       {
        $$0141 = 0; //@line 5769
        $$1152 = 0; //@line 5769
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$36 >> 2] = $$sink; //@line 5773
       $$0141 = $79 & 1; //@line 5776
       $$1152 = _snprintf($$0142, $$0144, 2116, $36) | 0; //@line 5776
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 5779
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 5781
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 5783
       $$1$off0 = $extract$t159; //@line 5788
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 5788
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 5788
       $$3154 = $$1152; //@line 5788
       label = 28; //@line 5789
      } else {
       $$1$off0 = $extract$t159; //@line 5791
       $$1143 = $$0142; //@line 5791
       $$1145 = $$0144; //@line 5791
       $$3154 = $$1152$; //@line 5791
       label = 28; //@line 5792
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
      HEAP32[$34 >> 2] = HEAP32[$16 >> 2]; //@line 5803
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 5804
      $108 = _vsnprintf(0, 0, $14, $34) | 0; //@line 5805
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 43; //@line 5808
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 5809
       HEAP32[$109 >> 2] = $2; //@line 5810
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 5811
       HEAP32[$110 >> 2] = $4; //@line 5812
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 5813
       HEAP32[$111 >> 2] = $10; //@line 5814
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 5815
       HEAP32[$112 >> 2] = $8; //@line 5816
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 5817
       HEAP32[$113 >> 2] = $12; //@line 5818
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 5819
       HEAP32[$114 >> 2] = $14; //@line 5820
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 5821
       HEAP32[$115 >> 2] = $16; //@line 5822
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 5823
       HEAP32[$116 >> 2] = $18; //@line 5824
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 5825
       HEAP32[$117 >> 2] = $20; //@line 5826
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 5827
       HEAP32[$118 >> 2] = $$1143; //@line 5828
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 5829
       HEAP32[$119 >> 2] = $$1145; //@line 5830
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 5831
       HEAP32[$120 >> 2] = $74; //@line 5832
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 5833
       HEAP32[$121 >> 2] = $22; //@line 5834
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 5835
       HEAP32[$122 >> 2] = $24; //@line 5836
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 5837
       HEAP32[$123 >> 2] = $26; //@line 5838
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 5839
       HEAP32[$124 >> 2] = $28; //@line 5840
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 5841
       HEAP32[$125 >> 2] = $30; //@line 5842
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 5843
       HEAP32[$126 >> 2] = $32; //@line 5844
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 5845
       HEAP32[$127 >> 2] = $44; //@line 5846
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 5847
       HEAP32[$128 >> 2] = $46; //@line 5848
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 5849
       HEAP32[$129 >> 2] = $34; //@line 5850
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 5851
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 5852
       HEAP8[$130 >> 0] = $$1$off0$expand_i1_val; //@line 5853
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 5854
       HEAP32[$131 >> 2] = $48; //@line 5855
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 5856
       HEAP32[$132 >> 2] = $50; //@line 5857
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 5858
       HEAP32[$133 >> 2] = $$3154; //@line 5859
       sp = STACKTOP; //@line 5860
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 5864
      ___async_unwind = 0; //@line 5865
      HEAP32[$ReallocAsyncCtx11 >> 2] = 43; //@line 5866
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 5867
      HEAP32[$109 >> 2] = $2; //@line 5868
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 5869
      HEAP32[$110 >> 2] = $4; //@line 5870
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 5871
      HEAP32[$111 >> 2] = $10; //@line 5872
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 5873
      HEAP32[$112 >> 2] = $8; //@line 5874
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 5875
      HEAP32[$113 >> 2] = $12; //@line 5876
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 5877
      HEAP32[$114 >> 2] = $14; //@line 5878
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 5879
      HEAP32[$115 >> 2] = $16; //@line 5880
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 5881
      HEAP32[$116 >> 2] = $18; //@line 5882
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 5883
      HEAP32[$117 >> 2] = $20; //@line 5884
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 5885
      HEAP32[$118 >> 2] = $$1143; //@line 5886
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 5887
      HEAP32[$119 >> 2] = $$1145; //@line 5888
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 5889
      HEAP32[$120 >> 2] = $74; //@line 5890
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 5891
      HEAP32[$121 >> 2] = $22; //@line 5892
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 5893
      HEAP32[$122 >> 2] = $24; //@line 5894
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 5895
      HEAP32[$123 >> 2] = $26; //@line 5896
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 5897
      HEAP32[$124 >> 2] = $28; //@line 5898
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 5899
      HEAP32[$125 >> 2] = $30; //@line 5900
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 5901
      HEAP32[$126 >> 2] = $32; //@line 5902
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 5903
      HEAP32[$127 >> 2] = $44; //@line 5904
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 5905
      HEAP32[$128 >> 2] = $46; //@line 5906
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 5907
      HEAP32[$129 >> 2] = $34; //@line 5908
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 5909
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 5910
      HEAP8[$130 >> 0] = $$1$off0$expand_i1_val; //@line 5911
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 5912
      HEAP32[$131 >> 2] = $48; //@line 5913
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 5914
      HEAP32[$132 >> 2] = $50; //@line 5915
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 5916
      HEAP32[$133 >> 2] = $$3154; //@line 5917
      sp = STACKTOP; //@line 5918
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 5923
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$18 >> 2] = $8; //@line 5929
        $$5156 = _snprintf($$1143, $$1145, 2119, $18) | 0; //@line 5931
        break;
       }
      case 1:
       {
        HEAP32[$26 >> 2] = $8; //@line 5935
        $$5156 = _snprintf($$1143, $$1145, 2134, $26) | 0; //@line 5937
        break;
       }
      case 3:
       {
        HEAP32[$22 >> 2] = $8; //@line 5941
        $$5156 = _snprintf($$1143, $$1145, 2149, $22) | 0; //@line 5943
        break;
       }
      case 7:
       {
        HEAP32[$10 >> 2] = $8; //@line 5947
        $$5156 = _snprintf($$1143, $$1145, 2164, $10) | 0; //@line 5949
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 2179, $2) | 0; //@line 5954
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 5958
      $147 = $$1143 + $$5156$ | 0; //@line 5960
      $148 = $$1145 - $$5156$ | 0; //@line 5961
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 5965
       $150 = _vsnprintf($147, $148, $14, $16) | 0; //@line 5966
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 5969
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 5970
        HEAP32[$151 >> 2] = $30; //@line 5971
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 5972
        HEAP32[$152 >> 2] = $32; //@line 5973
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 5974
        HEAP32[$153 >> 2] = $148; //@line 5975
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 5976
        HEAP32[$154 >> 2] = $147; //@line 5977
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 5978
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 5979
        HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 5980
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 5981
        HEAP32[$156 >> 2] = $48; //@line 5982
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 5983
        HEAP32[$157 >> 2] = $50; //@line 5984
        sp = STACKTOP; //@line 5985
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 5989
       ___async_unwind = 0; //@line 5990
       HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 5991
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 5992
       HEAP32[$151 >> 2] = $30; //@line 5993
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 5994
       HEAP32[$152 >> 2] = $32; //@line 5995
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 5996
       HEAP32[$153 >> 2] = $148; //@line 5997
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 5998
       HEAP32[$154 >> 2] = $147; //@line 5999
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 6000
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 6001
       HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 6002
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 6003
       HEAP32[$156 >> 2] = $48; //@line 6004
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 6005
       HEAP32[$157 >> 2] = $50; //@line 6006
       sp = STACKTOP; //@line 6007
       return;
      }
     }
    }
    $159 = HEAP32[91] | 0; //@line 6012
    $160 = HEAP32[84] | 0; //@line 6013
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 6014
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 6015
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6018
     sp = STACKTOP; //@line 6019
     return;
    }
    ___async_unwind = 0; //@line 6022
    HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6023
    sp = STACKTOP; //@line 6024
    return;
   }
  }
 } while (0);
 $161 = HEAP32[94] | 0; //@line 6029
 if (!$161) {
  return;
 }
 $163 = HEAP32[95] | 0; //@line 6034
 HEAP32[95] = 0; //@line 6035
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6036
 FUNCTION_TABLE_v[$161 & 3](); //@line 6037
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6040
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 6041
  HEAP32[$164 >> 2] = $163; //@line 6042
  sp = STACKTOP; //@line 6043
  return;
 }
 ___async_unwind = 0; //@line 6046
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6047
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 6048
 HEAP32[$164 >> 2] = $163; //@line 6049
 sp = STACKTOP; //@line 6050
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 7066
 $3 = HEAP32[3435] | 0; //@line 7067
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 7070
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 7074
 $7 = $6 & 3; //@line 7075
 if (($7 | 0) == 1) {
  _abort(); //@line 7078
 }
 $9 = $6 & -8; //@line 7081
 $10 = $2 + $9 | 0; //@line 7082
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 7087
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 7093
   $17 = $13 + $9 | 0; //@line 7094
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 7097
   }
   if ((HEAP32[3436] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 7103
    $106 = HEAP32[$105 >> 2] | 0; //@line 7104
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 7108
     $$1382 = $17; //@line 7108
     $114 = $16; //@line 7108
     break;
    }
    HEAP32[3433] = $17; //@line 7111
    HEAP32[$105 >> 2] = $106 & -2; //@line 7113
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 7116
    HEAP32[$16 + $17 >> 2] = $17; //@line 7118
    return;
   }
   $21 = $13 >>> 3; //@line 7121
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 7125
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 7127
    $28 = 13764 + ($21 << 1 << 2) | 0; //@line 7129
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 7134
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7141
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3431] = HEAP32[3431] & ~(1 << $21); //@line 7151
     $$1 = $16; //@line 7152
     $$1382 = $17; //@line 7152
     $114 = $16; //@line 7152
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 7158
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 7162
     }
     $41 = $26 + 8 | 0; //@line 7165
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 7169
     } else {
      _abort(); //@line 7171
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 7176
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 7177
    $$1 = $16; //@line 7178
    $$1382 = $17; //@line 7178
    $114 = $16; //@line 7178
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 7182
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 7184
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 7188
     $60 = $59 + 4 | 0; //@line 7189
     $61 = HEAP32[$60 >> 2] | 0; //@line 7190
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 7193
      if (!$63) {
       $$3 = 0; //@line 7196
       break;
      } else {
       $$1387 = $63; //@line 7199
       $$1390 = $59; //@line 7199
      }
     } else {
      $$1387 = $61; //@line 7202
      $$1390 = $60; //@line 7202
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 7205
      $66 = HEAP32[$65 >> 2] | 0; //@line 7206
      if ($66 | 0) {
       $$1387 = $66; //@line 7209
       $$1390 = $65; //@line 7209
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 7212
      $69 = HEAP32[$68 >> 2] | 0; //@line 7213
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 7218
       $$1390 = $68; //@line 7218
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 7223
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 7226
      $$3 = $$1387; //@line 7227
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 7232
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 7235
     }
     $53 = $51 + 12 | 0; //@line 7238
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7242
     }
     $56 = $48 + 8 | 0; //@line 7245
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 7249
      HEAP32[$56 >> 2] = $51; //@line 7250
      $$3 = $48; //@line 7251
      break;
     } else {
      _abort(); //@line 7254
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 7261
    $$1382 = $17; //@line 7261
    $114 = $16; //@line 7261
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 7264
    $75 = 14028 + ($74 << 2) | 0; //@line 7265
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 7270
      if (!$$3) {
       HEAP32[3432] = HEAP32[3432] & ~(1 << $74); //@line 7277
       $$1 = $16; //@line 7278
       $$1382 = $17; //@line 7278
       $114 = $16; //@line 7278
       break L10;
      }
     } else {
      if ((HEAP32[3435] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 7285
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 7293
       if (!$$3) {
        $$1 = $16; //@line 7296
        $$1382 = $17; //@line 7296
        $114 = $16; //@line 7296
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3435] | 0; //@line 7304
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 7307
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 7311
    $92 = $16 + 16 | 0; //@line 7312
    $93 = HEAP32[$92 >> 2] | 0; //@line 7313
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 7319
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 7323
       HEAP32[$93 + 24 >> 2] = $$3; //@line 7325
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 7331
    if (!$99) {
     $$1 = $16; //@line 7334
     $$1382 = $17; //@line 7334
     $114 = $16; //@line 7334
    } else {
     if ((HEAP32[3435] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 7339
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 7343
      HEAP32[$99 + 24 >> 2] = $$3; //@line 7345
      $$1 = $16; //@line 7346
      $$1382 = $17; //@line 7346
      $114 = $16; //@line 7346
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 7352
   $$1382 = $9; //@line 7352
   $114 = $2; //@line 7352
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 7357
 }
 $115 = $10 + 4 | 0; //@line 7360
 $116 = HEAP32[$115 >> 2] | 0; //@line 7361
 if (!($116 & 1)) {
  _abort(); //@line 7365
 }
 if (!($116 & 2)) {
  if ((HEAP32[3437] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3434] | 0) + $$1382 | 0; //@line 7375
   HEAP32[3434] = $124; //@line 7376
   HEAP32[3437] = $$1; //@line 7377
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 7380
   if (($$1 | 0) != (HEAP32[3436] | 0)) {
    return;
   }
   HEAP32[3436] = 0; //@line 7386
   HEAP32[3433] = 0; //@line 7387
   return;
  }
  if ((HEAP32[3436] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3433] | 0) + $$1382 | 0; //@line 7394
   HEAP32[3433] = $132; //@line 7395
   HEAP32[3436] = $114; //@line 7396
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 7399
   HEAP32[$114 + $132 >> 2] = $132; //@line 7401
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 7405
  $138 = $116 >>> 3; //@line 7406
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 7411
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 7413
    $145 = 13764 + ($138 << 1 << 2) | 0; //@line 7415
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3435] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 7421
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 7428
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3431] = HEAP32[3431] & ~(1 << $138); //@line 7438
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 7444
    } else {
     if ((HEAP32[3435] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 7449
     }
     $160 = $143 + 8 | 0; //@line 7452
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 7456
     } else {
      _abort(); //@line 7458
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 7463
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 7464
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 7467
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 7469
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 7473
      $180 = $179 + 4 | 0; //@line 7474
      $181 = HEAP32[$180 >> 2] | 0; //@line 7475
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 7478
       if (!$183) {
        $$3400 = 0; //@line 7481
        break;
       } else {
        $$1398 = $183; //@line 7484
        $$1402 = $179; //@line 7484
       }
      } else {
       $$1398 = $181; //@line 7487
       $$1402 = $180; //@line 7487
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 7490
       $186 = HEAP32[$185 >> 2] | 0; //@line 7491
       if ($186 | 0) {
        $$1398 = $186; //@line 7494
        $$1402 = $185; //@line 7494
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 7497
       $189 = HEAP32[$188 >> 2] | 0; //@line 7498
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 7503
        $$1402 = $188; //@line 7503
       }
      }
      if ((HEAP32[3435] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 7509
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 7512
       $$3400 = $$1398; //@line 7513
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 7518
      if ((HEAP32[3435] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 7522
      }
      $173 = $170 + 12 | 0; //@line 7525
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 7529
      }
      $176 = $167 + 8 | 0; //@line 7532
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 7536
       HEAP32[$176 >> 2] = $170; //@line 7537
       $$3400 = $167; //@line 7538
       break;
      } else {
       _abort(); //@line 7541
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 7549
     $196 = 14028 + ($195 << 2) | 0; //@line 7550
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 7555
       if (!$$3400) {
        HEAP32[3432] = HEAP32[3432] & ~(1 << $195); //@line 7562
        break L108;
       }
      } else {
       if ((HEAP32[3435] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 7569
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 7577
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3435] | 0; //@line 7587
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 7590
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 7594
     $213 = $10 + 16 | 0; //@line 7595
     $214 = HEAP32[$213 >> 2] | 0; //@line 7596
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 7602
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 7606
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 7608
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 7614
     if ($220 | 0) {
      if ((HEAP32[3435] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 7620
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 7624
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 7626
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 7635
  HEAP32[$114 + $137 >> 2] = $137; //@line 7637
  if (($$1 | 0) == (HEAP32[3436] | 0)) {
   HEAP32[3433] = $137; //@line 7641
   return;
  } else {
   $$2 = $137; //@line 7644
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 7648
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 7651
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 7653
  $$2 = $$1382; //@line 7654
 }
 $235 = $$2 >>> 3; //@line 7656
 if ($$2 >>> 0 < 256) {
  $238 = 13764 + ($235 << 1 << 2) | 0; //@line 7660
  $239 = HEAP32[3431] | 0; //@line 7661
  $240 = 1 << $235; //@line 7662
  if (!($239 & $240)) {
   HEAP32[3431] = $239 | $240; //@line 7667
   $$0403 = $238; //@line 7669
   $$pre$phiZ2D = $238 + 8 | 0; //@line 7669
  } else {
   $244 = $238 + 8 | 0; //@line 7671
   $245 = HEAP32[$244 >> 2] | 0; //@line 7672
   if ((HEAP32[3435] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 7676
   } else {
    $$0403 = $245; //@line 7679
    $$pre$phiZ2D = $244; //@line 7679
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 7682
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 7684
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 7686
  HEAP32[$$1 + 12 >> 2] = $238; //@line 7688
  return;
 }
 $251 = $$2 >>> 8; //@line 7691
 if (!$251) {
  $$0396 = 0; //@line 7694
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7698
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7702
   $257 = $251 << $256; //@line 7703
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7706
   $262 = $257 << $260; //@line 7708
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7711
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7716
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7722
  }
 }
 $276 = 14028 + ($$0396 << 2) | 0; //@line 7725
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7727
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7730
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7731
 $280 = HEAP32[3432] | 0; //@line 7732
 $281 = 1 << $$0396; //@line 7733
 do {
  if (!($280 & $281)) {
   HEAP32[3432] = $280 | $281; //@line 7739
   HEAP32[$276 >> 2] = $$1; //@line 7740
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7742
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7744
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7746
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7754
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7754
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7761
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7765
    $301 = HEAP32[$299 >> 2] | 0; //@line 7767
    if (!$301) {
     label = 121; //@line 7770
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7773
     $$0384 = $301; //@line 7773
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3435] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7780
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7783
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7785
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7787
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7789
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7794
    $309 = HEAP32[$308 >> 2] | 0; //@line 7795
    $310 = HEAP32[3435] | 0; //@line 7796
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7802
     HEAP32[$308 >> 2] = $$1; //@line 7803
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7805
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7807
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7809
     break;
    } else {
     _abort(); //@line 7812
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3439] | 0) + -1 | 0; //@line 7819
 HEAP32[3439] = $319; //@line 7820
 if (!$319) {
  $$0212$in$i = 14180; //@line 7823
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7828
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7834
  }
 }
 HEAP32[3439] = -1; //@line 7837
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12607
 STACKTOP = STACKTOP + 1056 | 0; //@line 12608
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 12608
 $2 = sp + 1024 | 0; //@line 12609
 $3 = sp; //@line 12610
 HEAP32[$2 >> 2] = 0; //@line 12611
 HEAP32[$2 + 4 >> 2] = 0; //@line 12611
 HEAP32[$2 + 8 >> 2] = 0; //@line 12611
 HEAP32[$2 + 12 >> 2] = 0; //@line 12611
 HEAP32[$2 + 16 >> 2] = 0; //@line 12611
 HEAP32[$2 + 20 >> 2] = 0; //@line 12611
 HEAP32[$2 + 24 >> 2] = 0; //@line 12611
 HEAP32[$2 + 28 >> 2] = 0; //@line 12611
 $4 = HEAP8[$1 >> 0] | 0; //@line 12612
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 12616
   $$0185$ph$lcssa327 = -1; //@line 12616
   $$0187219$ph325326 = 0; //@line 12616
   $$1176$ph$ph$lcssa208 = 1; //@line 12616
   $$1186$ph$lcssa = -1; //@line 12616
   label = 26; //@line 12617
  } else {
   $$0187263 = 0; //@line 12619
   $10 = $4; //@line 12619
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 12625
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 12633
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 12636
    $$0187263 = $$0187263 + 1 | 0; //@line 12637
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 12640
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 12642
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 12650
   if ($23) {
    $$0183$ph260 = 0; //@line 12652
    $$0185$ph259 = -1; //@line 12652
    $130 = 1; //@line 12652
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 12654
     $$0183$ph197$ph253 = $$0183$ph260; //@line 12654
     $131 = $130; //@line 12654
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 12656
      $132 = $131; //@line 12656
      L10 : while (1) {
       $$0179242 = 1; //@line 12658
       $25 = $132; //@line 12658
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 12662
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 12664
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 12670
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 12674
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 12679
         $$0185$ph$lcssa = $$0185$ph259; //@line 12679
         break L6;
        } else {
         $25 = $27; //@line 12677
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 12683
       $132 = $37 + 1 | 0; //@line 12684
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 12689
        $$0185$ph$lcssa = $$0185$ph259; //@line 12689
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 12687
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 12694
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 12698
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 12703
       $$0185$ph$lcssa = $$0185$ph259; //@line 12703
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 12701
       $$0183$ph197$ph253 = $25; //@line 12701
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 12708
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 12713
      $$0185$ph$lcssa = $$0183$ph197248; //@line 12713
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 12711
      $$0185$ph259 = $$0183$ph197248; //@line 12711
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 12718
     $$1186$ph238 = -1; //@line 12718
     $133 = 1; //@line 12718
     while (1) {
      $$1176$ph$ph233 = 1; //@line 12720
      $$1184$ph193$ph232 = $$1184$ph239; //@line 12720
      $135 = $133; //@line 12720
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 12722
       $134 = $135; //@line 12722
       L25 : while (1) {
        $$1180222 = 1; //@line 12724
        $52 = $134; //@line 12724
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 12728
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 12730
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 12736
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 12740
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12745
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12745
          $$0187219$ph325326 = $$0187263; //@line 12745
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 12745
          $$1186$ph$lcssa = $$1186$ph238; //@line 12745
          label = 26; //@line 12746
          break L1;
         } else {
          $52 = $45; //@line 12743
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 12750
        $134 = $56 + 1 | 0; //@line 12751
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12756
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12756
         $$0187219$ph325326 = $$0187263; //@line 12756
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 12756
         $$1186$ph$lcssa = $$1186$ph238; //@line 12756
         label = 26; //@line 12757
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 12754
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 12762
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 12766
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12771
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12771
        $$0187219$ph325326 = $$0187263; //@line 12771
        $$1176$ph$ph$lcssa208 = $60; //@line 12771
        $$1186$ph$lcssa = $$1186$ph238; //@line 12771
        label = 26; //@line 12772
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 12769
        $$1184$ph193$ph232 = $52; //@line 12769
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 12777
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12782
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12782
       $$0187219$ph325326 = $$0187263; //@line 12782
       $$1176$ph$ph$lcssa208 = 1; //@line 12782
       $$1186$ph$lcssa = $$1184$ph193227; //@line 12782
       label = 26; //@line 12783
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 12780
       $$1186$ph238 = $$1184$ph193227; //@line 12780
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 12788
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 12788
     $$0187219$ph325326 = $$0187263; //@line 12788
     $$1176$ph$ph$lcssa208 = 1; //@line 12788
     $$1186$ph$lcssa = -1; //@line 12788
     label = 26; //@line 12789
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 12792
    $$0185$ph$lcssa327 = -1; //@line 12792
    $$0187219$ph325326 = $$0187263; //@line 12792
    $$1176$ph$ph$lcssa208 = 1; //@line 12792
    $$1186$ph$lcssa = -1; //@line 12792
    label = 26; //@line 12793
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 12801
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 12802
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 12803
   $70 = $$1186$$0185 + 1 | 0; //@line 12805
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 12810
    $$3178 = $$1176$$0175; //@line 12810
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 12813
    $$0168 = 0; //@line 12817
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 12817
   }
   $78 = $$0187219$ph325326 | 63; //@line 12819
   $79 = $$0187219$ph325326 + -1 | 0; //@line 12820
   $80 = ($$0168 | 0) != 0; //@line 12821
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 12822
   $$0166 = $0; //@line 12823
   $$0169 = 0; //@line 12823
   $$0170 = $0; //@line 12823
   while (1) {
    $83 = $$0166; //@line 12826
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 12831
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 12835
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 12842
        break L35;
       } else {
        $$3173 = $86; //@line 12845
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 12850
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 12854
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 12866
      $$2181$sink = $$0187219$ph325326; //@line 12866
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 12871
      if ($105 | 0) {
       $$0169$be = 0; //@line 12879
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 12879
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 12883
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 12885
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 12889
       } else {
        $$3182221 = $111; //@line 12891
        $$pr = $113; //@line 12891
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 12899
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 12901
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 12904
          break L54;
         } else {
          $$3182221 = $118; //@line 12907
         }
        }
        $$0169$be = 0; //@line 12911
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 12911
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 12918
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 12921
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 12930
        $$2181$sink = $$3178; //@line 12930
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 12937
    $$0169 = $$0169$be; //@line 12937
    $$0170 = $$3173; //@line 12937
   }
  }
 } while (0);
 STACKTOP = sp; //@line 12941
 return $$3 | 0; //@line 12941
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $31 = 0, $33 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $56 = 0, $57 = 0, $6 = 0, $62 = 0, $64 = 0, $65 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2796
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2798
 $4 = HEAP8[$0 + 8 >> 0] | 0; //@line 2800
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2802
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2804
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2806
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2808
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2810
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2812
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2814
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2816
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2818
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2820
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 2824
 if ((HEAP32[$0 + 52 >> 2] | 0) >>> 0 > (HEAP32[___async_retval >> 2] | 0) >>> 0) {
  HEAP32[$2 >> 2] = 0; //@line 2829
  $31 = $6 + 64 | 0; //@line 2830
  $33 = (HEAP32[$31 >> 2] | 0) + $20 | 0; //@line 2832
  HEAP32[$31 >> 2] = $33; //@line 2833
  $36 = HEAP32[(HEAP32[$28 >> 2] | 0) + 132 >> 2] | 0; //@line 2836
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(60) | 0; //@line 2837
  $37 = FUNCTION_TABLE_ii[$36 & 31]($6) | 0; //@line 2838
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 2841
   $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 2842
   HEAP32[$38 >> 2] = $22; //@line 2843
   $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 2844
   HEAP32[$39 >> 2] = $33; //@line 2845
   $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 2846
   HEAP32[$40 >> 2] = $8; //@line 2847
   $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 2848
   HEAP32[$41 >> 2] = $10; //@line 2849
   $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 2850
   HEAP8[$42 >> 0] = $12; //@line 2851
   $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 2852
   HEAP32[$43 >> 2] = $31; //@line 2853
   $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 2854
   HEAP32[$44 >> 2] = $2; //@line 2855
   $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 2856
   HEAP8[$45 >> 0] = $4; //@line 2857
   $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 2858
   HEAP32[$46 >> 2] = $6; //@line 2859
   $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 2860
   HEAP32[$47 >> 2] = $18; //@line 2861
   $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 2862
   HEAP32[$48 >> 2] = $14; //@line 2863
   $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 2864
   HEAP32[$49 >> 2] = $16; //@line 2865
   $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 2866
   HEAP32[$50 >> 2] = $24; //@line 2867
   $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 2868
   HEAP32[$51 >> 2] = $20; //@line 2869
   sp = STACKTOP; //@line 2870
   return;
  }
  HEAP32[___async_retval >> 2] = $37; //@line 2874
  ___async_unwind = 0; //@line 2875
  HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 2876
  $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 2877
  HEAP32[$38 >> 2] = $22; //@line 2878
  $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 2879
  HEAP32[$39 >> 2] = $33; //@line 2880
  $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 2881
  HEAP32[$40 >> 2] = $8; //@line 2882
  $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 2883
  HEAP32[$41 >> 2] = $10; //@line 2884
  $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 2885
  HEAP8[$42 >> 0] = $12; //@line 2886
  $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 2887
  HEAP32[$43 >> 2] = $31; //@line 2888
  $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 2889
  HEAP32[$44 >> 2] = $2; //@line 2890
  $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 2891
  HEAP8[$45 >> 0] = $4; //@line 2892
  $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 2893
  HEAP32[$46 >> 2] = $6; //@line 2894
  $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 2895
  HEAP32[$47 >> 2] = $18; //@line 2896
  $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 2897
  HEAP32[$48 >> 2] = $14; //@line 2898
  $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 2899
  HEAP32[$49 >> 2] = $16; //@line 2900
  $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 2901
  HEAP32[$50 >> 2] = $24; //@line 2902
  $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 2903
  HEAP32[$51 >> 2] = $20; //@line 2904
  sp = STACKTOP; //@line 2905
  return;
 }
 $56 = (HEAP32[$22 >> 2] | 0) + ((Math_imul($8 + -32 | 0, $10) | 0) + 4) | 0; //@line 2912
 $57 = HEAP8[$56 >> 0] | 0; //@line 2913
 if ($12 << 24 >> 24) {
  if ($4 << 24 >> 24) {
   $62 = (0 >>> 3 & 31) + 1 | 0; //@line 2920
   $64 = 1 << 0; //@line 2922
   $65 = 0 + $18 | 0; //@line 2923
   $75 = HEAP32[(HEAP32[$6 >> 2] | 0) + 124 >> 2] | 0; //@line 2933
   $76 = 0 + $16 | 0; //@line 2934
   if (!($64 & (HEAPU8[$56 + ($62 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 2936
    FUNCTION_TABLE_viiii[$75 & 7]($6, $76, $65, 0); //@line 2937
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 2940
     $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 2941
     HEAP32[$92 >> 2] = 0; //@line 2942
     $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 2943
     HEAP32[$93 >> 2] = $24; //@line 2944
     $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 2945
     HEAP32[$94 >> 2] = 0; //@line 2946
     $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 2947
     HEAP32[$95 >> 2] = $20; //@line 2948
     $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 2949
     HEAP32[$96 >> 2] = $14; //@line 2950
     $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 2951
     HEAP32[$97 >> 2] = $62; //@line 2952
     $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 2953
     HEAP32[$98 >> 2] = $56; //@line 2954
     $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 2955
     HEAP32[$99 >> 2] = $64; //@line 2956
     $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 2957
     HEAP32[$100 >> 2] = $6; //@line 2958
     $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 2959
     HEAP32[$101 >> 2] = $16; //@line 2960
     $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 2961
     HEAP32[$102 >> 2] = $6; //@line 2962
     $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 2963
     HEAP32[$103 >> 2] = $65; //@line 2964
     $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 2965
     HEAP8[$104 >> 0] = $57; //@line 2966
     $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 2967
     HEAP32[$105 >> 2] = $2; //@line 2968
     $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 2969
     HEAP32[$106 >> 2] = $18; //@line 2970
     sp = STACKTOP; //@line 2971
     return;
    }
    ___async_unwind = 0; //@line 2974
    HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 2975
    $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 2976
    HEAP32[$92 >> 2] = 0; //@line 2977
    $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 2978
    HEAP32[$93 >> 2] = $24; //@line 2979
    $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 2980
    HEAP32[$94 >> 2] = 0; //@line 2981
    $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 2982
    HEAP32[$95 >> 2] = $20; //@line 2983
    $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 2984
    HEAP32[$96 >> 2] = $14; //@line 2985
    $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 2986
    HEAP32[$97 >> 2] = $62; //@line 2987
    $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 2988
    HEAP32[$98 >> 2] = $56; //@line 2989
    $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 2990
    HEAP32[$99 >> 2] = $64; //@line 2991
    $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 2992
    HEAP32[$100 >> 2] = $6; //@line 2993
    $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 2994
    HEAP32[$101 >> 2] = $16; //@line 2995
    $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 2996
    HEAP32[$102 >> 2] = $6; //@line 2997
    $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 2998
    HEAP32[$103 >> 2] = $65; //@line 2999
    $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 3000
    HEAP8[$104 >> 0] = $57; //@line 3001
    $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 3002
    HEAP32[$105 >> 2] = $2; //@line 3003
    $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 3004
    HEAP32[$106 >> 2] = $18; //@line 3005
    sp = STACKTOP; //@line 3006
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 3009
    FUNCTION_TABLE_viiii[$75 & 7]($6, $76, $65, 1); //@line 3010
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3013
     $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 3014
     HEAP32[$77 >> 2] = 0; //@line 3015
     $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 3016
     HEAP32[$78 >> 2] = $24; //@line 3017
     $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 3018
     HEAP32[$79 >> 2] = 0; //@line 3019
     $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 3020
     HEAP32[$80 >> 2] = $20; //@line 3021
     $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 3022
     HEAP32[$81 >> 2] = $14; //@line 3023
     $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 3024
     HEAP32[$82 >> 2] = $62; //@line 3025
     $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 3026
     HEAP32[$83 >> 2] = $56; //@line 3027
     $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 3028
     HEAP32[$84 >> 2] = $64; //@line 3029
     $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 3030
     HEAP32[$85 >> 2] = $6; //@line 3031
     $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 3032
     HEAP32[$86 >> 2] = $16; //@line 3033
     $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 3034
     HEAP32[$87 >> 2] = $6; //@line 3035
     $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 3036
     HEAP32[$88 >> 2] = $65; //@line 3037
     $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 3038
     HEAP8[$89 >> 0] = $57; //@line 3039
     $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 3040
     HEAP32[$90 >> 2] = $2; //@line 3041
     $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 3042
     HEAP32[$91 >> 2] = $18; //@line 3043
     sp = STACKTOP; //@line 3044
     return;
    }
    ___async_unwind = 0; //@line 3047
    HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3048
    $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 3049
    HEAP32[$77 >> 2] = 0; //@line 3050
    $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 3051
    HEAP32[$78 >> 2] = $24; //@line 3052
    $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 3053
    HEAP32[$79 >> 2] = 0; //@line 3054
    $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 3055
    HEAP32[$80 >> 2] = $20; //@line 3056
    $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 3057
    HEAP32[$81 >> 2] = $14; //@line 3058
    $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 3059
    HEAP32[$82 >> 2] = $62; //@line 3060
    $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 3061
    HEAP32[$83 >> 2] = $56; //@line 3062
    $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 3063
    HEAP32[$84 >> 2] = $64; //@line 3064
    $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 3065
    HEAP32[$85 >> 2] = $6; //@line 3066
    $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 3067
    HEAP32[$86 >> 2] = $16; //@line 3068
    $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 3069
    HEAP32[$87 >> 2] = $6; //@line 3070
    $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 3071
    HEAP32[$88 >> 2] = $65; //@line 3072
    $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 3073
    HEAP8[$89 >> 0] = $57; //@line 3074
    $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 3075
    HEAP32[$90 >> 2] = $2; //@line 3076
    $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 3077
    HEAP32[$91 >> 2] = $18; //@line 3078
    sp = STACKTOP; //@line 3079
    return;
   }
  }
 }
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + ($57 & 255); //@line 3087
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
       HEAP32[$AsyncCtx15 + 4 >> 2] = $28; //@line 1371
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 1373
       HEAP8[$AsyncCtx15 + 12 >> 0] = $$081$off0 & 1; //@line 1376
       HEAP8[$AsyncCtx15 + 13 >> 0] = $$085$off0 & 1; //@line 1379
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 1381
       HEAP32[$AsyncCtx15 + 20 >> 2] = $13; //@line 1383
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 1385
       HEAP32[$AsyncCtx15 + 28 >> 2] = $19; //@line 1387
       HEAP32[$AsyncCtx15 + 32 >> 2] = $27; //@line 1389
       HEAP32[$AsyncCtx15 + 36 >> 2] = $26; //@line 1391
       HEAP32[$AsyncCtx15 + 40 >> 2] = $25; //@line 1393
       HEAP8[$AsyncCtx15 + 44 >> 0] = $4 & 1; //@line 1396
       HEAP32[$AsyncCtx15 + 48 >> 2] = $29; //@line 1398
       HEAP32[$AsyncCtx15 + 52 >> 2] = $$084; //@line 1400
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
    HEAP32[$AsyncCtx11 + 12 >> 2] = $73; //@line 1466
    HEAP32[$AsyncCtx11 + 16 >> 2] = $2; //@line 1468
    HEAP32[$AsyncCtx11 + 20 >> 2] = $3; //@line 1470
    HEAP8[$AsyncCtx11 + 24 >> 0] = $4 & 1; //@line 1473
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 1475
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
function __ZN6C128329characterEiii__async_cb_19($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3547
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3551
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3553
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3555
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3557
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3559
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3561
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3563
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3565
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3567
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3569
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3571
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 3573
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3575
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3577
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3578
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 3582
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 3591
    $$043$us$reg2mem$0 = $32; //@line 3591
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 3591
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 3591
    $$reg2mem21$0 = $32 + $30 | 0; //@line 3591
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 3597
   return;
  } else {
   $$04142$us = $79; //@line 3600
   $$043$us$reg2mem$0 = $6; //@line 3600
   $$reg2mem$0 = $12; //@line 3600
   $$reg2mem17$0 = $16; //@line 3600
   $$reg2mem21$0 = $24; //@line 3600
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 3609
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 3612
 $48 = $$04142$us + $20 | 0; //@line 3613
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 3615
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 3616
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3619
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 3620
   HEAP32[$64 >> 2] = $$04142$us; //@line 3621
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 3622
   HEAP32[$65 >> 2] = $4; //@line 3623
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 3624
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 3625
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 3626
   HEAP32[$67 >> 2] = $8; //@line 3627
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 3628
   HEAP32[$68 >> 2] = $10; //@line 3629
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 3630
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 3631
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 3632
   HEAP32[$70 >> 2] = $14; //@line 3633
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 3634
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 3635
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 3636
   HEAP32[$72 >> 2] = $18; //@line 3637
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 3638
   HEAP32[$73 >> 2] = $20; //@line 3639
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 3640
   HEAP32[$74 >> 2] = $22; //@line 3641
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 3642
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 3643
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 3644
   HEAP8[$76 >> 0] = $26; //@line 3645
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 3646
   HEAP32[$77 >> 2] = $28; //@line 3647
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 3648
   HEAP32[$78 >> 2] = $30; //@line 3649
   sp = STACKTOP; //@line 3650
   return;
  }
  ___async_unwind = 0; //@line 3653
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3654
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 3655
  HEAP32[$64 >> 2] = $$04142$us; //@line 3656
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 3657
  HEAP32[$65 >> 2] = $4; //@line 3658
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 3659
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 3660
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 3661
  HEAP32[$67 >> 2] = $8; //@line 3662
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 3663
  HEAP32[$68 >> 2] = $10; //@line 3664
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 3665
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 3666
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 3667
  HEAP32[$70 >> 2] = $14; //@line 3668
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 3669
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 3670
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 3671
  HEAP32[$72 >> 2] = $18; //@line 3672
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 3673
  HEAP32[$73 >> 2] = $20; //@line 3674
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 3675
  HEAP32[$74 >> 2] = $22; //@line 3676
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 3677
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 3678
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 3679
  HEAP8[$76 >> 0] = $26; //@line 3680
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 3681
  HEAP32[$77 >> 2] = $28; //@line 3682
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 3683
  HEAP32[$78 >> 2] = $30; //@line 3684
  sp = STACKTOP; //@line 3685
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 3688
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 3689
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3692
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 3693
   HEAP32[$49 >> 2] = $$04142$us; //@line 3694
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 3695
   HEAP32[$50 >> 2] = $4; //@line 3696
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 3697
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 3698
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 3699
   HEAP32[$52 >> 2] = $8; //@line 3700
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 3701
   HEAP32[$53 >> 2] = $10; //@line 3702
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 3703
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 3704
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 3705
   HEAP32[$55 >> 2] = $14; //@line 3706
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 3707
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 3708
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 3709
   HEAP32[$57 >> 2] = $18; //@line 3710
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 3711
   HEAP32[$58 >> 2] = $20; //@line 3712
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 3713
   HEAP32[$59 >> 2] = $22; //@line 3714
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 3715
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 3716
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 3717
   HEAP8[$61 >> 0] = $26; //@line 3718
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 3719
   HEAP32[$62 >> 2] = $28; //@line 3720
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 3721
   HEAP32[$63 >> 2] = $30; //@line 3722
   sp = STACKTOP; //@line 3723
   return;
  }
  ___async_unwind = 0; //@line 3726
  HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3727
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 3728
  HEAP32[$49 >> 2] = $$04142$us; //@line 3729
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 3730
  HEAP32[$50 >> 2] = $4; //@line 3731
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 3732
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 3733
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 3734
  HEAP32[$52 >> 2] = $8; //@line 3735
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 3736
  HEAP32[$53 >> 2] = $10; //@line 3737
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 3738
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 3739
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 3740
  HEAP32[$55 >> 2] = $14; //@line 3741
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 3742
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 3743
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 3744
  HEAP32[$57 >> 2] = $18; //@line 3745
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 3746
  HEAP32[$58 >> 2] = $20; //@line 3747
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 3748
  HEAP32[$59 >> 2] = $22; //@line 3749
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 3750
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 3751
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 3752
  HEAP8[$61 >> 0] = $26; //@line 3753
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 3754
  HEAP32[$62 >> 2] = $28; //@line 3755
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 3756
  HEAP32[$63 >> 2] = $30; //@line 3757
  sp = STACKTOP; //@line 3758
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_18($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3325
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3329
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3331
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3333
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3335
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3337
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3339
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3341
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3343
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3345
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3347
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3349
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 3351
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3353
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3355
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3356
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 3360
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 3369
    $$043$us$reg2mem$0 = $32; //@line 3369
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 3369
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 3369
    $$reg2mem21$0 = $32 + $30 | 0; //@line 3369
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 3375
   return;
  } else {
   $$04142$us = $79; //@line 3378
   $$043$us$reg2mem$0 = $6; //@line 3378
   $$reg2mem$0 = $12; //@line 3378
   $$reg2mem17$0 = $16; //@line 3378
   $$reg2mem21$0 = $24; //@line 3378
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 3387
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 3390
 $48 = $$04142$us + $20 | 0; //@line 3391
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 3393
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 3394
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3397
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 3398
   HEAP32[$64 >> 2] = $$04142$us; //@line 3399
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 3400
   HEAP32[$65 >> 2] = $4; //@line 3401
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 3402
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 3403
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 3404
   HEAP32[$67 >> 2] = $8; //@line 3405
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 3406
   HEAP32[$68 >> 2] = $10; //@line 3407
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 3408
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 3409
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 3410
   HEAP32[$70 >> 2] = $14; //@line 3411
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 3412
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 3413
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 3414
   HEAP32[$72 >> 2] = $18; //@line 3415
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 3416
   HEAP32[$73 >> 2] = $20; //@line 3417
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 3418
   HEAP32[$74 >> 2] = $22; //@line 3419
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 3420
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 3421
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 3422
   HEAP8[$76 >> 0] = $26; //@line 3423
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 3424
   HEAP32[$77 >> 2] = $28; //@line 3425
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 3426
   HEAP32[$78 >> 2] = $30; //@line 3427
   sp = STACKTOP; //@line 3428
   return;
  }
  ___async_unwind = 0; //@line 3431
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3432
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 3433
  HEAP32[$64 >> 2] = $$04142$us; //@line 3434
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 3435
  HEAP32[$65 >> 2] = $4; //@line 3436
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 3437
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 3438
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 3439
  HEAP32[$67 >> 2] = $8; //@line 3440
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 3441
  HEAP32[$68 >> 2] = $10; //@line 3442
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 3443
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 3444
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 3445
  HEAP32[$70 >> 2] = $14; //@line 3446
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 3447
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 3448
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 3449
  HEAP32[$72 >> 2] = $18; //@line 3450
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 3451
  HEAP32[$73 >> 2] = $20; //@line 3452
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 3453
  HEAP32[$74 >> 2] = $22; //@line 3454
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 3455
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 3456
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 3457
  HEAP8[$76 >> 0] = $26; //@line 3458
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 3459
  HEAP32[$77 >> 2] = $28; //@line 3460
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 3461
  HEAP32[$78 >> 2] = $30; //@line 3462
  sp = STACKTOP; //@line 3463
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 3466
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 3467
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3470
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 3471
   HEAP32[$49 >> 2] = $$04142$us; //@line 3472
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 3473
   HEAP32[$50 >> 2] = $4; //@line 3474
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 3475
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 3476
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 3477
   HEAP32[$52 >> 2] = $8; //@line 3478
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 3479
   HEAP32[$53 >> 2] = $10; //@line 3480
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 3481
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 3482
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 3483
   HEAP32[$55 >> 2] = $14; //@line 3484
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 3485
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 3486
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 3487
   HEAP32[$57 >> 2] = $18; //@line 3488
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 3489
   HEAP32[$58 >> 2] = $20; //@line 3490
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 3491
   HEAP32[$59 >> 2] = $22; //@line 3492
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 3493
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 3494
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 3495
   HEAP8[$61 >> 0] = $26; //@line 3496
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 3497
   HEAP32[$62 >> 2] = $28; //@line 3498
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 3499
   HEAP32[$63 >> 2] = $30; //@line 3500
   sp = STACKTOP; //@line 3501
   return;
  }
  ___async_unwind = 0; //@line 3504
  HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3505
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 3506
  HEAP32[$49 >> 2] = $$04142$us; //@line 3507
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 3508
  HEAP32[$50 >> 2] = $4; //@line 3509
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 3510
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 3511
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 3512
  HEAP32[$52 >> 2] = $8; //@line 3513
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 3514
  HEAP32[$53 >> 2] = $10; //@line 3515
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 3516
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 3517
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 3518
  HEAP32[$55 >> 2] = $14; //@line 3519
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 3520
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 3521
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 3522
  HEAP32[$57 >> 2] = $18; //@line 3523
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 3524
  HEAP32[$58 >> 2] = $20; //@line 3525
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 3526
  HEAP32[$59 >> 2] = $22; //@line 3527
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 3528
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 3529
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 3530
  HEAP8[$61 >> 0] = $26; //@line 3531
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 3532
  HEAP32[$62 >> 2] = $28; //@line 3533
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 3534
  HEAP32[$63 >> 2] = $30; //@line 3535
  sp = STACKTOP; //@line 3536
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1994
 STACKTOP = STACKTOP + 32 | 0; //@line 1995
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1995
 $0 = sp; //@line 1996
 _gpio_init_out($0, 50); //@line 1997
 while (1) {
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2000
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2001
  _wait_ms(150); //@line 2002
  if (___async) {
   label = 3; //@line 2005
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2008
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2010
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2011
  _wait_ms(150); //@line 2012
  if (___async) {
   label = 5; //@line 2015
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2018
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2020
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2021
  _wait_ms(150); //@line 2022
  if (___async) {
   label = 7; //@line 2025
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2028
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2030
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2031
  _wait_ms(150); //@line 2032
  if (___async) {
   label = 9; //@line 2035
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2038
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2040
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2041
  _wait_ms(150); //@line 2042
  if (___async) {
   label = 11; //@line 2045
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2048
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2050
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2051
  _wait_ms(150); //@line 2052
  if (___async) {
   label = 13; //@line 2055
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2058
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2060
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2061
  _wait_ms(150); //@line 2062
  if (___async) {
   label = 15; //@line 2065
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2068
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2070
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2071
  _wait_ms(150); //@line 2072
  if (___async) {
   label = 17; //@line 2075
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2078
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2080
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2081
  _wait_ms(400); //@line 2082
  if (___async) {
   label = 19; //@line 2085
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2088
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2090
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2091
  _wait_ms(400); //@line 2092
  if (___async) {
   label = 21; //@line 2095
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2098
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2100
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2101
  _wait_ms(400); //@line 2102
  if (___async) {
   label = 23; //@line 2105
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2108
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2110
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2111
  _wait_ms(400); //@line 2112
  if (___async) {
   label = 25; //@line 2115
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2118
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2120
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2121
  _wait_ms(400); //@line 2122
  if (___async) {
   label = 27; //@line 2125
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2128
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2130
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2131
  _wait_ms(400); //@line 2132
  if (___async) {
   label = 29; //@line 2135
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2138
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2140
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2141
  _wait_ms(400); //@line 2142
  if (___async) {
   label = 31; //@line 2145
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2148
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2150
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2151
  _wait_ms(400); //@line 2152
  if (___async) {
   label = 33; //@line 2155
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2158
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 86; //@line 2162
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2164
   sp = STACKTOP; //@line 2165
   STACKTOP = sp; //@line 2166
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 87; //@line 2170
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2172
   sp = STACKTOP; //@line 2173
   STACKTOP = sp; //@line 2174
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 88; //@line 2178
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2180
   sp = STACKTOP; //@line 2181
   STACKTOP = sp; //@line 2182
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 89; //@line 2186
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2188
   sp = STACKTOP; //@line 2189
   STACKTOP = sp; //@line 2190
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 90; //@line 2194
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2196
   sp = STACKTOP; //@line 2197
   STACKTOP = sp; //@line 2198
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 91; //@line 2202
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2204
   sp = STACKTOP; //@line 2205
   STACKTOP = sp; //@line 2206
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 92; //@line 2210
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2212
   sp = STACKTOP; //@line 2213
   STACKTOP = sp; //@line 2214
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 93; //@line 2218
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2220
   sp = STACKTOP; //@line 2221
   STACKTOP = sp; //@line 2222
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 94; //@line 2226
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2228
   sp = STACKTOP; //@line 2229
   STACKTOP = sp; //@line 2230
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 95; //@line 2234
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2236
   sp = STACKTOP; //@line 2237
   STACKTOP = sp; //@line 2238
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 96; //@line 2242
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2244
   sp = STACKTOP; //@line 2245
   STACKTOP = sp; //@line 2246
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 97; //@line 2250
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2252
   sp = STACKTOP; //@line 2253
   STACKTOP = sp; //@line 2254
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 98; //@line 2258
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2260
   sp = STACKTOP; //@line 2261
   STACKTOP = sp; //@line 2262
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 99; //@line 2266
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2268
   sp = STACKTOP; //@line 2269
   STACKTOP = sp; //@line 2270
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 100; //@line 2274
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2276
   sp = STACKTOP; //@line 2277
   STACKTOP = sp; //@line 2278
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 101; //@line 2282
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2284
   sp = STACKTOP; //@line 2285
   STACKTOP = sp; //@line 2286
   return;
  }
 }
}
function __ZN6C128329characterEiii__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $39 = 0, $40 = 0, $45 = 0, $47 = 0, $48 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3097
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3103
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3105
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 3107
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3111
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 3113
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3115
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3117
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3119
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3121
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3123
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3125
 $30 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3128
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 >= ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[$30 + 2 >> 0] | 0) | 0) >>> 0) {
  HEAP32[HEAP32[$0 + 24 >> 2] >> 2] = 0; //@line 3135
 }
 $39 = $30 + ((Math_imul($6 + -32 | 0, $8) | 0) + 4) | 0; //@line 3140
 $40 = HEAP8[$39 >> 0] | 0; //@line 3141
 if ($10 << 24 >> 24) {
  if ($16 << 24 >> 24) {
   $45 = (0 >>> 3 & 31) + 1 | 0; //@line 3148
   $47 = 1 << 0; //@line 3150
   $48 = 0 + $20 | 0; //@line 3151
   $58 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 3161
   $59 = 0 + $24 | 0; //@line 3162
   if (!($47 & (HEAPU8[$39 + ($45 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 3164
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 0); //@line 3165
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3168
     $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 3169
     HEAP32[$75 >> 2] = 0; //@line 3170
     $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 3171
     HEAP32[$76 >> 2] = $26; //@line 3172
     $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 3173
     HEAP32[$77 >> 2] = 0; //@line 3174
     $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 3175
     HEAP32[$78 >> 2] = $28; //@line 3176
     $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 3177
     HEAP32[$79 >> 2] = $22; //@line 3178
     $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 3179
     HEAP32[$80 >> 2] = $45; //@line 3180
     $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 3181
     HEAP32[$81 >> 2] = $39; //@line 3182
     $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 3183
     HEAP32[$82 >> 2] = $47; //@line 3184
     $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 3185
     HEAP32[$83 >> 2] = $18; //@line 3186
     $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 3187
     HEAP32[$84 >> 2] = $24; //@line 3188
     $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 3189
     HEAP32[$85 >> 2] = $18; //@line 3190
     $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 3191
     HEAP32[$86 >> 2] = $48; //@line 3192
     $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 3193
     HEAP8[$87 >> 0] = $40; //@line 3194
     $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 3195
     HEAP32[$88 >> 2] = $14; //@line 3196
     $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 3197
     HEAP32[$89 >> 2] = $20; //@line 3198
     sp = STACKTOP; //@line 3199
     return;
    }
    ___async_unwind = 0; //@line 3202
    HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3203
    $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 3204
    HEAP32[$75 >> 2] = 0; //@line 3205
    $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 3206
    HEAP32[$76 >> 2] = $26; //@line 3207
    $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 3208
    HEAP32[$77 >> 2] = 0; //@line 3209
    $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 3210
    HEAP32[$78 >> 2] = $28; //@line 3211
    $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 3212
    HEAP32[$79 >> 2] = $22; //@line 3213
    $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 3214
    HEAP32[$80 >> 2] = $45; //@line 3215
    $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 3216
    HEAP32[$81 >> 2] = $39; //@line 3217
    $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 3218
    HEAP32[$82 >> 2] = $47; //@line 3219
    $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 3220
    HEAP32[$83 >> 2] = $18; //@line 3221
    $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 3222
    HEAP32[$84 >> 2] = $24; //@line 3223
    $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 3224
    HEAP32[$85 >> 2] = $18; //@line 3225
    $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 3226
    HEAP32[$86 >> 2] = $48; //@line 3227
    $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 3228
    HEAP8[$87 >> 0] = $40; //@line 3229
    $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 3230
    HEAP32[$88 >> 2] = $14; //@line 3231
    $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 3232
    HEAP32[$89 >> 2] = $20; //@line 3233
    sp = STACKTOP; //@line 3234
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 3237
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 1); //@line 3238
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3241
     $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 3242
     HEAP32[$60 >> 2] = 0; //@line 3243
     $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 3244
     HEAP32[$61 >> 2] = $26; //@line 3245
     $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 3246
     HEAP32[$62 >> 2] = 0; //@line 3247
     $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 3248
     HEAP32[$63 >> 2] = $28; //@line 3249
     $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 3250
     HEAP32[$64 >> 2] = $22; //@line 3251
     $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 3252
     HEAP32[$65 >> 2] = $45; //@line 3253
     $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 3254
     HEAP32[$66 >> 2] = $39; //@line 3255
     $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 3256
     HEAP32[$67 >> 2] = $47; //@line 3257
     $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 3258
     HEAP32[$68 >> 2] = $18; //@line 3259
     $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 3260
     HEAP32[$69 >> 2] = $24; //@line 3261
     $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 3262
     HEAP32[$70 >> 2] = $18; //@line 3263
     $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 3264
     HEAP32[$71 >> 2] = $48; //@line 3265
     $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 3266
     HEAP8[$72 >> 0] = $40; //@line 3267
     $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 3268
     HEAP32[$73 >> 2] = $14; //@line 3269
     $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 3270
     HEAP32[$74 >> 2] = $20; //@line 3271
     sp = STACKTOP; //@line 3272
     return;
    }
    ___async_unwind = 0; //@line 3275
    HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3276
    $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 3277
    HEAP32[$60 >> 2] = 0; //@line 3278
    $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 3279
    HEAP32[$61 >> 2] = $26; //@line 3280
    $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 3281
    HEAP32[$62 >> 2] = 0; //@line 3282
    $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 3283
    HEAP32[$63 >> 2] = $28; //@line 3284
    $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 3285
    HEAP32[$64 >> 2] = $22; //@line 3286
    $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 3287
    HEAP32[$65 >> 2] = $45; //@line 3288
    $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 3289
    HEAP32[$66 >> 2] = $39; //@line 3290
    $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 3291
    HEAP32[$67 >> 2] = $47; //@line 3292
    $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 3293
    HEAP32[$68 >> 2] = $18; //@line 3294
    $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 3295
    HEAP32[$69 >> 2] = $24; //@line 3296
    $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 3297
    HEAP32[$70 >> 2] = $18; //@line 3298
    $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 3299
    HEAP32[$71 >> 2] = $48; //@line 3300
    $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 3301
    HEAP8[$72 >> 0] = $40; //@line 3302
    $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 3303
    HEAP32[$73 >> 2] = $14; //@line 3304
    $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 3305
    HEAP32[$74 >> 2] = $20; //@line 3306
    sp = STACKTOP; //@line 3307
    return;
   }
  }
 }
 HEAP32[$14 >> 2] = (HEAP32[$14 >> 2] | 0) + ($40 & 255); //@line 3315
 return;
}
function __ZN6C128329characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$04142$us = 0, $$043$us = 0, $10 = 0, $11 = 0, $122 = 0, $123 = 0, $13 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $40 = 0, $42 = 0, $45 = 0, $46 = 0, $5 = 0, $6 = 0, $61 = 0, $70 = 0, $71 = 0, $72 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $87 = 0, $90 = 0, $91 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3065
 if (($3 + -31 | 0) >>> 0 > 96) {
  return;
 }
 $5 = $0 + 48 | 0; //@line 3071
 $6 = HEAP32[$5 >> 2] | 0; //@line 3072
 $8 = HEAPU8[$6 >> 0] | 0; //@line 3074
 $10 = HEAP8[$6 + 1 >> 0] | 0; //@line 3076
 $11 = $10 & 255; //@line 3077
 $13 = HEAP8[$6 + 2 >> 0] | 0; //@line 3079
 $14 = $13 & 255; //@line 3080
 $17 = HEAPU8[$6 + 3 >> 0] | 0; //@line 3083
 $18 = $0 + 60 | 0; //@line 3084
 $20 = (HEAP32[$18 >> 2] | 0) + $11 | 0; //@line 3086
 $23 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3089
 $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 3090
 $24 = FUNCTION_TABLE_ii[$23 & 31]($0) | 0; //@line 3091
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 121; //@line 3094
  HEAP32[$AsyncCtx + 4 >> 2] = $18; //@line 3096
  HEAP8[$AsyncCtx + 8 >> 0] = $10; //@line 3098
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3100
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 3102
  HEAP32[$AsyncCtx + 20 >> 2] = $8; //@line 3104
  HEAP8[$AsyncCtx + 24 >> 0] = $13; //@line 3106
  HEAP32[$AsyncCtx + 28 >> 2] = $17; //@line 3108
  HEAP32[$AsyncCtx + 32 >> 2] = $1; //@line 3110
  HEAP32[$AsyncCtx + 36 >> 2] = $2; //@line 3112
  HEAP32[$AsyncCtx + 40 >> 2] = $14; //@line 3114
  HEAP32[$AsyncCtx + 44 >> 2] = $5; //@line 3116
  HEAP32[$AsyncCtx + 48 >> 2] = $11; //@line 3118
  HEAP32[$AsyncCtx + 52 >> 2] = $20; //@line 3120
  HEAP32[$AsyncCtx + 56 >> 2] = $0; //@line 3122
  sp = STACKTOP; //@line 3123
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3126
 if ($20 >>> 0 > $24 >>> 0) {
  HEAP32[$18 >> 2] = 0; //@line 3129
  $40 = $0 + 64 | 0; //@line 3130
  $42 = (HEAP32[$40 >> 2] | 0) + $14 | 0; //@line 3132
  HEAP32[$40 >> 2] = $42; //@line 3133
  $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3136
  $AsyncCtx3 = _emscripten_alloc_async_context(60, sp) | 0; //@line 3137
  $46 = FUNCTION_TABLE_ii[$45 & 31]($0) | 0; //@line 3138
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 122; //@line 3141
   HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 3143
   HEAP32[$AsyncCtx3 + 8 >> 2] = $42; //@line 3145
   HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 3147
   HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 3149
   HEAP8[$AsyncCtx3 + 20 >> 0] = $13; //@line 3151
   HEAP32[$AsyncCtx3 + 24 >> 2] = $40; //@line 3153
   HEAP32[$AsyncCtx3 + 28 >> 2] = $18; //@line 3155
   HEAP8[$AsyncCtx3 + 32 >> 0] = $10; //@line 3157
   HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 3159
   HEAP32[$AsyncCtx3 + 40 >> 2] = $2; //@line 3161
   HEAP32[$AsyncCtx3 + 44 >> 2] = $17; //@line 3163
   HEAP32[$AsyncCtx3 + 48 >> 2] = $1; //@line 3165
   HEAP32[$AsyncCtx3 + 52 >> 2] = $11; //@line 3167
   HEAP32[$AsyncCtx3 + 56 >> 2] = $14; //@line 3169
   sp = STACKTOP; //@line 3170
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3173
  $61 = HEAP32[$5 >> 2] | 0; //@line 3174
  if ($42 >>> 0 < ($46 - (HEAPU8[$61 + 2 >> 0] | 0) | 0) >>> 0) {
   $71 = $61; //@line 3181
  } else {
   HEAP32[$40 >> 2] = 0; //@line 3183
   $71 = $61; //@line 3184
  }
 } else {
  $71 = HEAP32[$5 >> 2] | 0; //@line 3188
 }
 $70 = $71 + ((Math_imul($3 + -32 | 0, $8) | 0) + 4) | 0; //@line 3193
 $72 = HEAP8[$70 >> 0] | 0; //@line 3194
 L15 : do {
  if ($13 << 24 >> 24) {
   if ($10 << 24 >> 24) {
    $$043$us = 0; //@line 3200
    L17 : while (1) {
     $77 = ($$043$us >>> 3 & 31) + 1 | 0; //@line 3204
     $79 = 1 << ($$043$us & 7); //@line 3206
     $80 = $$043$us + $2 | 0; //@line 3207
     $$04142$us = 0; //@line 3208
     while (1) {
      $87 = ($79 & (HEAPU8[$70 + ($77 + (Math_imul($$04142$us, $17) | 0)) >> 0] | 0) | 0) == 0; //@line 3216
      $90 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 3219
      $91 = $$04142$us + $1 | 0; //@line 3220
      if ($87) {
       $AsyncCtx11 = _emscripten_alloc_async_context(64, sp) | 0; //@line 3222
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 0); //@line 3223
       if (___async) {
        label = 18; //@line 3226
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3229
      } else {
       $AsyncCtx7 = _emscripten_alloc_async_context(64, sp) | 0; //@line 3231
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 1); //@line 3232
       if (___async) {
        label = 15; //@line 3235
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3238
      }
      $122 = $$04142$us + 1 | 0; //@line 3240
      if (($122 | 0) == ($11 | 0)) {
       break;
      } else {
       $$04142$us = $122; //@line 3245
      }
     }
     $123 = $$043$us + 1 | 0; //@line 3248
     if (($123 | 0) == ($14 | 0)) {
      break L15;
     } else {
      $$043$us = $123; //@line 3253
     }
    }
    if ((label | 0) == 15) {
     HEAP32[$AsyncCtx7 >> 2] = 123; //@line 3257
     HEAP32[$AsyncCtx7 + 4 >> 2] = $$04142$us; //@line 3259
     HEAP32[$AsyncCtx7 + 8 >> 2] = $11; //@line 3261
     HEAP32[$AsyncCtx7 + 12 >> 2] = $$043$us; //@line 3263
     HEAP32[$AsyncCtx7 + 16 >> 2] = $14; //@line 3265
     HEAP32[$AsyncCtx7 + 20 >> 2] = $17; //@line 3267
     HEAP32[$AsyncCtx7 + 24 >> 2] = $77; //@line 3269
     HEAP32[$AsyncCtx7 + 28 >> 2] = $70; //@line 3271
     HEAP32[$AsyncCtx7 + 32 >> 2] = $79; //@line 3273
     HEAP32[$AsyncCtx7 + 36 >> 2] = $0; //@line 3275
     HEAP32[$AsyncCtx7 + 40 >> 2] = $1; //@line 3277
     HEAP32[$AsyncCtx7 + 44 >> 2] = $0; //@line 3279
     HEAP32[$AsyncCtx7 + 48 >> 2] = $80; //@line 3281
     HEAP8[$AsyncCtx7 + 52 >> 0] = $72; //@line 3283
     HEAP32[$AsyncCtx7 + 56 >> 2] = $18; //@line 3285
     HEAP32[$AsyncCtx7 + 60 >> 2] = $2; //@line 3287
     sp = STACKTOP; //@line 3288
     return;
    } else if ((label | 0) == 18) {
     HEAP32[$AsyncCtx11 >> 2] = 124; //@line 3292
     HEAP32[$AsyncCtx11 + 4 >> 2] = $$04142$us; //@line 3294
     HEAP32[$AsyncCtx11 + 8 >> 2] = $11; //@line 3296
     HEAP32[$AsyncCtx11 + 12 >> 2] = $$043$us; //@line 3298
     HEAP32[$AsyncCtx11 + 16 >> 2] = $14; //@line 3300
     HEAP32[$AsyncCtx11 + 20 >> 2] = $17; //@line 3302
     HEAP32[$AsyncCtx11 + 24 >> 2] = $77; //@line 3304
     HEAP32[$AsyncCtx11 + 28 >> 2] = $70; //@line 3306
     HEAP32[$AsyncCtx11 + 32 >> 2] = $79; //@line 3308
     HEAP32[$AsyncCtx11 + 36 >> 2] = $0; //@line 3310
     HEAP32[$AsyncCtx11 + 40 >> 2] = $1; //@line 3312
     HEAP32[$AsyncCtx11 + 44 >> 2] = $0; //@line 3314
     HEAP32[$AsyncCtx11 + 48 >> 2] = $80; //@line 3316
     HEAP8[$AsyncCtx11 + 52 >> 0] = $72; //@line 3318
     HEAP32[$AsyncCtx11 + 56 >> 2] = $18; //@line 3320
     HEAP32[$AsyncCtx11 + 60 >> 2] = $2; //@line 3322
     sp = STACKTOP; //@line 3323
     return;
    }
   }
  }
 } while (0);
 HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + ($72 & 255); //@line 3332
 return;
}
function _mbed_vtracef__async_cb_52($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $30 = 0, $34 = 0, $36 = 0, $38 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6138
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6140
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6144
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6146
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6150
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6152
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6154
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6158
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6160
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6162
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6164
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 6168
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 6172
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 6174
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 6176
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 6183
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 6185
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 6187
 HEAP32[$38 >> 2] = HEAP32[___async_retval >> 2]; //@line 6190
 $50 = _snprintf($20, $22, 2116, $38) | 0; //@line 6191
 $$10 = ($50 | 0) >= ($22 | 0) ? 0 : $50; //@line 6193
 $53 = $20 + $$10 | 0; //@line 6195
 $54 = $22 - $$10 | 0; //@line 6196
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 6200
   $$3169 = $53; //@line 6200
   label = 4; //@line 6201
  }
 } else {
  $$3147168 = $22; //@line 6204
  $$3169 = $20; //@line 6204
  label = 4; //@line 6205
 }
 if ((label | 0) == 4) {
  $56 = $24 + -2 | 0; //@line 6208
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$16 >> 2] = $8; //@line 6214
    $$5156 = _snprintf($$3169, $$3147168, 2119, $16) | 0; //@line 6216
    break;
   }
  case 1:
   {
    HEAP32[$30 >> 2] = $8; //@line 6220
    $$5156 = _snprintf($$3169, $$3147168, 2134, $30) | 0; //@line 6222
    break;
   }
  case 3:
   {
    HEAP32[$26 >> 2] = $8; //@line 6226
    $$5156 = _snprintf($$3169, $$3147168, 2149, $26) | 0; //@line 6228
    break;
   }
  case 7:
   {
    HEAP32[$6 >> 2] = $8; //@line 6232
    $$5156 = _snprintf($$3169, $$3147168, 2164, $6) | 0; //@line 6234
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 2179, $2) | 0; //@line 6239
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 6243
  $67 = $$3169 + $$5156$ | 0; //@line 6245
  $68 = $$3147168 - $$5156$ | 0; //@line 6246
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 6250
   $70 = _vsnprintf($67, $68, $12, $14) | 0; //@line 6251
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 6254
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 6255
    HEAP32[$71 >> 2] = $34; //@line 6256
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 6257
    HEAP32[$72 >> 2] = $36; //@line 6258
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 6259
    HEAP32[$73 >> 2] = $68; //@line 6260
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 6261
    HEAP32[$74 >> 2] = $67; //@line 6262
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 6263
    $$expand_i1_val = $44 & 1; //@line 6264
    HEAP8[$75 >> 0] = $$expand_i1_val; //@line 6265
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 6266
    HEAP32[$76 >> 2] = $46; //@line 6267
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 6268
    HEAP32[$77 >> 2] = $48; //@line 6269
    sp = STACKTOP; //@line 6270
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 6274
   ___async_unwind = 0; //@line 6275
   HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 6276
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 6277
   HEAP32[$71 >> 2] = $34; //@line 6278
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 6279
   HEAP32[$72 >> 2] = $36; //@line 6280
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 6281
   HEAP32[$73 >> 2] = $68; //@line 6282
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 6283
   HEAP32[$74 >> 2] = $67; //@line 6284
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 6285
   $$expand_i1_val = $44 & 1; //@line 6286
   HEAP8[$75 >> 0] = $$expand_i1_val; //@line 6287
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 6288
   HEAP32[$76 >> 2] = $46; //@line 6289
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 6290
   HEAP32[$77 >> 2] = $48; //@line 6291
   sp = STACKTOP; //@line 6292
   return;
  }
 }
 $79 = HEAP32[91] | 0; //@line 6296
 $80 = HEAP32[84] | 0; //@line 6297
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 6298
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 6299
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6302
  sp = STACKTOP; //@line 6303
  return;
 }
 ___async_unwind = 0; //@line 6306
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6307
 sp = STACKTOP; //@line 6308
 return;
}
function _freopen($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$pre = 0, $17 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $32 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13223
 STACKTOP = STACKTOP + 32 | 0; //@line 13224
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 13224
 $vararg_buffer3 = sp + 16 | 0; //@line 13225
 $vararg_buffer = sp; //@line 13226
 $3 = ___fmodeflags($1) | 0; //@line 13227
 if ((HEAP32[$2 + 76 >> 2] | 0) > -1) {
  $17 = ___lockfile($2) | 0; //@line 13233
 } else {
  $17 = 0; //@line 13235
 }
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 13237
 _fflush($2) | 0; //@line 13238
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 181; //@line 13241
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 13243
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 13245
  HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 13247
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13249
  HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 13251
  HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 13253
  HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer3; //@line 13255
  HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer3; //@line 13257
  HEAP32[$AsyncCtx + 36 >> 2] = $17; //@line 13259
  sp = STACKTOP; //@line 13260
  STACKTOP = sp; //@line 13261
  return 0; //@line 13261
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13263
 do {
  if (!$0) {
   $$pre = $2 + 60 | 0; //@line 13269
   if ($3 & 524288 | 0) {
    HEAP32[$vararg_buffer >> 2] = HEAP32[$$pre >> 2]; //@line 13272
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 13274
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 13276
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 13277
   }
   HEAP32[$vararg_buffer3 >> 2] = HEAP32[$$pre >> 2]; //@line 13281
   HEAP32[$vararg_buffer3 + 4 >> 2] = 4; //@line 13283
   HEAP32[$vararg_buffer3 + 8 >> 2] = $3 & -524481; //@line 13285
   if ((___syscall_ret(___syscall221(221, $vararg_buffer3 | 0) | 0) | 0) < 0) {
    label = 21; //@line 13290
   } else {
    label = 16; //@line 13292
   }
  } else {
   $27 = _fopen($0, $1) | 0; //@line 13295
   if (!$27) {
    label = 21; //@line 13298
   } else {
    $29 = $27 + 60 | 0; //@line 13300
    $30 = HEAP32[$29 >> 2] | 0; //@line 13301
    $32 = HEAP32[$2 + 60 >> 2] | 0; //@line 13303
    if (($30 | 0) == ($32 | 0)) {
     HEAP32[$29 >> 2] = -1; //@line 13306
    } else {
     if ((___dup3($30, $32, $3 & 524288) | 0) < 0) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 13312
      _fclose($27) | 0; //@line 13313
      if (___async) {
       HEAP32[$AsyncCtx14 >> 2] = 183; //@line 13316
       HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 13318
       sp = STACKTOP; //@line 13319
       STACKTOP = sp; //@line 13320
       return 0; //@line 13320
      } else {
       _emscripten_free_async_context($AsyncCtx14 | 0); //@line 13322
       label = 21; //@line 13323
       break;
      }
     }
    }
    HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$27 >> 2]; //@line 13332
    HEAP32[$2 + 32 >> 2] = HEAP32[$27 + 32 >> 2]; //@line 13336
    HEAP32[$2 + 36 >> 2] = HEAP32[$27 + 36 >> 2]; //@line 13340
    HEAP32[$2 + 40 >> 2] = HEAP32[$27 + 40 >> 2]; //@line 13344
    HEAP32[$2 + 12 >> 2] = HEAP32[$27 + 12 >> 2]; //@line 13348
    $AsyncCtx18 = _emscripten_alloc_async_context(12, sp) | 0; //@line 13349
    _fclose($27) | 0; //@line 13350
    if (___async) {
     HEAP32[$AsyncCtx18 >> 2] = 182; //@line 13353
     HEAP32[$AsyncCtx18 + 4 >> 2] = $17; //@line 13355
     HEAP32[$AsyncCtx18 + 8 >> 2] = $2; //@line 13357
     sp = STACKTOP; //@line 13358
     STACKTOP = sp; //@line 13359
     return 0; //@line 13359
    } else {
     _emscripten_free_async_context($AsyncCtx18 | 0); //@line 13361
     label = 16; //@line 13362
     break;
    }
   }
  }
 } while (0);
 do {
  if ((label | 0) == 16) {
   if (!$17) {
    $$0 = $2; //@line 13372
   } else {
    ___unlockfile($2); //@line 13374
    $$0 = $2; //@line 13375
   }
  } else if ((label | 0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 13379
   _fclose($2) | 0; //@line 13380
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 184; //@line 13383
    HEAP32[$AsyncCtx10 + 4 >> 2] = $2; //@line 13385
    sp = STACKTOP; //@line 13386
    STACKTOP = sp; //@line 13387
    return 0; //@line 13387
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 13389
    $$0 = 0; //@line 13390
    break;
   }
  }
 } while (0);
 STACKTOP = sp; //@line 13395
 return $$0 | 0; //@line 13395
}
function __ZN4mbed6Stream6printfEPKcz($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $$09 = 0, $13 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $36 = 0, $39 = 0, $48 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1822
 STACKTOP = STACKTOP + 4112 | 0; //@line 1823
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(4112); //@line 1823
 $2 = sp; //@line 1824
 $3 = sp + 16 | 0; //@line 1825
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1828
 $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1829
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1830
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 80; //@line 1833
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1835
  HEAP32[$AsyncCtx + 8 >> 2] = $varargs; //@line 1837
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1839
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 1841
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 1843
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 1845
  sp = STACKTOP; //@line 1846
  STACKTOP = sp; //@line 1847
  return 0; //@line 1847
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1849
 HEAP32[$2 >> 2] = $varargs; //@line 1850
 _memset($3 | 0, 0, 4096) | 0; //@line 1851
 $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1852
 $13 = _vsprintf($3, $1, $2) | 0; //@line 1853
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 81; //@line 1856
  HEAP32[$AsyncCtx12 + 4 >> 2] = $0; //@line 1858
  HEAP32[$AsyncCtx12 + 8 >> 2] = $0; //@line 1860
  HEAP32[$AsyncCtx12 + 12 >> 2] = $3; //@line 1862
  HEAP32[$AsyncCtx12 + 16 >> 2] = $2; //@line 1864
  HEAP32[$AsyncCtx12 + 20 >> 2] = $3; //@line 1866
  sp = STACKTOP; //@line 1867
  STACKTOP = sp; //@line 1868
  return 0; //@line 1868
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1870
 L7 : do {
  if (($13 | 0) > 0) {
   $$09 = 0; //@line 1874
   while (1) {
    $36 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 1878
    $39 = HEAP8[$3 + $$09 >> 0] | 0; //@line 1881
    $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 1882
    FUNCTION_TABLE_iii[$36 & 7]($0, $39) | 0; //@line 1883
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1888
    $48 = $$09 + 1 | 0; //@line 1889
    if (($48 | 0) == ($13 | 0)) {
     break L7;
    } else {
     $$09 = $48; //@line 1894
    }
   }
   HEAP32[$AsyncCtx9 >> 2] = 84; //@line 1897
   HEAP32[$AsyncCtx9 + 4 >> 2] = $$09; //@line 1899
   HEAP32[$AsyncCtx9 + 8 >> 2] = $13; //@line 1901
   HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 1903
   HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 1905
   HEAP32[$AsyncCtx9 + 20 >> 2] = $0; //@line 1907
   HEAP32[$AsyncCtx9 + 24 >> 2] = $3; //@line 1909
   HEAP32[$AsyncCtx9 + 28 >> 2] = $3; //@line 1911
   HEAP32[$AsyncCtx9 + 32 >> 2] = $2; //@line 1913
   sp = STACKTOP; //@line 1914
   STACKTOP = sp; //@line 1915
   return 0; //@line 1915
  }
 } while (0);
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 1920
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1921
 FUNCTION_TABLE_vi[$22 & 255]($0); //@line 1922
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 82; //@line 1925
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1927
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1929
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1931
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 1933
  HEAP32[$AsyncCtx2 + 20 >> 2] = $13; //@line 1935
  sp = STACKTOP; //@line 1936
  STACKTOP = sp; //@line 1937
  return 0; //@line 1937
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1939
 $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1942
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1943
 FUNCTION_TABLE_vi[$30 & 255]($0); //@line 1944
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 83; //@line 1947
  HEAP32[$AsyncCtx5 + 4 >> 2] = $3; //@line 1949
  HEAP32[$AsyncCtx5 + 8 >> 2] = $2; //@line 1951
  HEAP32[$AsyncCtx5 + 12 >> 2] = $13; //@line 1953
  sp = STACKTOP; //@line 1954
  STACKTOP = sp; //@line 1955
  return 0; //@line 1955
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1957
  STACKTOP = sp; //@line 1958
  return $13 | 0; //@line 1958
 }
 return 0; //@line 1960
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_66($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7392
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7394
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7396
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 7399
 $8 = HEAP8[$0 + 13 >> 0] & 1; //@line 7402
 $10 = HEAP32[$0 + 16 >> 2] | 0; //@line 7404
 $12 = HEAP32[$0 + 20 >> 2] | 0; //@line 7406
 $14 = HEAP32[$0 + 24 >> 2] | 0; //@line 7408
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 7410
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 7412
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7414
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 7416
 $24 = HEAP8[$0 + 44 >> 0] & 1; //@line 7419
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 7421
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 7423
 L2 : do {
  if (!(HEAP8[$2 >> 0] | 0)) {
   do {
    if (!(HEAP8[$18 >> 0] | 0)) {
     $$182$off0 = $6; //@line 7432
     $$186$off0 = $8; //@line 7432
    } else {
     if (!(HEAP8[$20 >> 0] | 0)) {
      if (!(HEAP32[$26 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $8; //@line 7441
       $$283$off0 = 1; //@line 7441
       label = 13; //@line 7442
       break L2;
      } else {
       $$182$off0 = 1; //@line 7445
       $$186$off0 = $8; //@line 7445
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 7452
      break L2;
     }
     if (!(HEAP32[$26 >> 2] & 2)) {
      label = 18; //@line 7459
      break L2;
     } else {
      $$182$off0 = 1; //@line 7462
      $$186$off0 = 1; //@line 7462
     }
    }
   } while (0);
   $30 = $28 + 8 | 0; //@line 7466
   if ($30 >>> 0 < $22 >>> 0) {
    HEAP8[$20 >> 0] = 0; //@line 7469
    HEAP8[$18 >> 0] = 0; //@line 7470
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 7471
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $14, $10, $10, 1, $24); //@line 7472
    if (!___async) {
     ___async_unwind = 0; //@line 7475
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 206; //@line 7477
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 7479
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 7481
    HEAP8[$ReallocAsyncCtx5 + 12 >> 0] = $$182$off0 & 1; //@line 7484
    HEAP8[$ReallocAsyncCtx5 + 13 >> 0] = $$186$off0 & 1; //@line 7487
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $10; //@line 7489
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $12; //@line 7491
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 7493
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 7495
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 7497
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 7499
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 7501
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $24 & 1; //@line 7504
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 7506
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $30; //@line 7508
    sp = STACKTOP; //@line 7509
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 7512
    $$283$off0 = $$182$off0; //@line 7512
    label = 13; //@line 7513
   }
  } else {
   $$085$off0$reg2mem$0 = $8; //@line 7516
   $$283$off0 = $6; //@line 7516
   label = 13; //@line 7517
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$12 >> 2] = $10; //@line 7523
    $59 = $14 + 40 | 0; //@line 7524
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 7527
    if ((HEAP32[$14 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$2 >> 0] = 1; //@line 7535
      if ($$283$off0) {
       label = 18; //@line 7537
       break;
      } else {
       $67 = 4; //@line 7540
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 7547
   } else {
    $67 = 4; //@line 7549
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 7554
 }
 HEAP32[$16 >> 2] = $67; //@line 7556
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_24($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4050
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4054
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4056
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4058
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4060
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4062
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4064
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4066
 $29 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4067
 if (($29 | 0) == ($4 | 0)) {
  $19 = HEAP32[(HEAP32[$6 >> 2] | 0) + 80 >> 2] | 0; //@line 4072
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4073
  FUNCTION_TABLE_vi[$19 & 255]($8); //@line 4074
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 4077
   $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 4078
   HEAP32[$20 >> 2] = $6; //@line 4079
   $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 4080
   HEAP32[$21 >> 2] = $8; //@line 4081
   $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 4082
   HEAP32[$22 >> 2] = $14; //@line 4083
   $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 4084
   HEAP32[$23 >> 2] = $16; //@line 4085
   $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 4086
   HEAP32[$24 >> 2] = $4; //@line 4087
   sp = STACKTOP; //@line 4088
   return;
  }
  ___async_unwind = 0; //@line 4091
  HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 4092
  $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 4093
  HEAP32[$20 >> 2] = $6; //@line 4094
  $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 4095
  HEAP32[$21 >> 2] = $8; //@line 4096
  $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 4097
  HEAP32[$22 >> 2] = $14; //@line 4098
  $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 4099
  HEAP32[$23 >> 2] = $16; //@line 4100
  $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 4101
  HEAP32[$24 >> 2] = $4; //@line 4102
  sp = STACKTOP; //@line 4103
  return;
 } else {
  $27 = HEAP32[(HEAP32[$10 >> 2] | 0) + 72 >> 2] | 0; //@line 4108
  $31 = HEAP8[$12 + $29 >> 0] | 0; //@line 4111
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 4112
  FUNCTION_TABLE_iii[$27 & 7]($8, $31) | 0; //@line 4113
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 4116
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 4117
   HEAP32[$32 >> 2] = $29; //@line 4118
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 4119
   HEAP32[$33 >> 2] = $4; //@line 4120
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 4121
   HEAP32[$34 >> 2] = $6; //@line 4122
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 4123
   HEAP32[$35 >> 2] = $8; //@line 4124
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 4125
   HEAP32[$36 >> 2] = $10; //@line 4126
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 4127
   HEAP32[$37 >> 2] = $12; //@line 4128
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 4129
   HEAP32[$38 >> 2] = $14; //@line 4130
   $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 4131
   HEAP32[$39 >> 2] = $16; //@line 4132
   sp = STACKTOP; //@line 4133
   return;
  }
  ___async_unwind = 0; //@line 4136
  HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 4137
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 4138
  HEAP32[$32 >> 2] = $29; //@line 4139
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 4140
  HEAP32[$33 >> 2] = $4; //@line 4141
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 4142
  HEAP32[$34 >> 2] = $6; //@line 4143
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 4144
  HEAP32[$35 >> 2] = $8; //@line 4145
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 4146
  HEAP32[$36 >> 2] = $10; //@line 4147
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 4148
  HEAP32[$37 >> 2] = $12; //@line 4149
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 4150
  HEAP32[$38 >> 2] = $14; //@line 4151
  $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 4152
  HEAP32[$39 >> 2] = $16; //@line 4153
  sp = STACKTOP; //@line 4154
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10708
      $10 = HEAP32[$9 >> 2] | 0; //@line 10709
      HEAP32[$2 >> 2] = $9 + 4; //@line 10711
      HEAP32[$0 >> 2] = $10; //@line 10712
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10728
      $17 = HEAP32[$16 >> 2] | 0; //@line 10729
      HEAP32[$2 >> 2] = $16 + 4; //@line 10731
      $20 = $0; //@line 10734
      HEAP32[$20 >> 2] = $17; //@line 10736
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 10739
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10755
      $30 = HEAP32[$29 >> 2] | 0; //@line 10756
      HEAP32[$2 >> 2] = $29 + 4; //@line 10758
      $31 = $0; //@line 10759
      HEAP32[$31 >> 2] = $30; //@line 10761
      HEAP32[$31 + 4 >> 2] = 0; //@line 10764
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10780
      $41 = $40; //@line 10781
      $43 = HEAP32[$41 >> 2] | 0; //@line 10783
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 10786
      HEAP32[$2 >> 2] = $40 + 8; //@line 10788
      $47 = $0; //@line 10789
      HEAP32[$47 >> 2] = $43; //@line 10791
      HEAP32[$47 + 4 >> 2] = $46; //@line 10794
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10810
      $57 = HEAP32[$56 >> 2] | 0; //@line 10811
      HEAP32[$2 >> 2] = $56 + 4; //@line 10813
      $59 = ($57 & 65535) << 16 >> 16; //@line 10815
      $62 = $0; //@line 10818
      HEAP32[$62 >> 2] = $59; //@line 10820
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 10823
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10839
      $72 = HEAP32[$71 >> 2] | 0; //@line 10840
      HEAP32[$2 >> 2] = $71 + 4; //@line 10842
      $73 = $0; //@line 10844
      HEAP32[$73 >> 2] = $72 & 65535; //@line 10846
      HEAP32[$73 + 4 >> 2] = 0; //@line 10849
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10865
      $83 = HEAP32[$82 >> 2] | 0; //@line 10866
      HEAP32[$2 >> 2] = $82 + 4; //@line 10868
      $85 = ($83 & 255) << 24 >> 24; //@line 10870
      $88 = $0; //@line 10873
      HEAP32[$88 >> 2] = $85; //@line 10875
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 10878
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10894
      $98 = HEAP32[$97 >> 2] | 0; //@line 10895
      HEAP32[$2 >> 2] = $97 + 4; //@line 10897
      $99 = $0; //@line 10899
      HEAP32[$99 >> 2] = $98 & 255; //@line 10901
      HEAP32[$99 + 4 >> 2] = 0; //@line 10904
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10920
      $109 = +HEAPF64[$108 >> 3]; //@line 10921
      HEAP32[$2 >> 2] = $108 + 8; //@line 10923
      HEAPF64[$0 >> 3] = $109; //@line 10924
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10940
      $116 = +HEAPF64[$115 >> 3]; //@line 10941
      HEAP32[$2 >> 2] = $115 + 8; //@line 10943
      HEAPF64[$0 >> 3] = $116; //@line 10944
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_65($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7236
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7238
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7240
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7242
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7244
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7246
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 7249
 $15 = $4 + 24 | 0; //@line 7252
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$4 + 8 >> 2] | 0; //@line 7257
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 7261
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 7268
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 7279
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $8, $10, $12); //@line 7280
      if (!___async) {
       ___async_unwind = 0; //@line 7283
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 210; //@line 7285
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 7287
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 7289
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 7291
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 7293
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 7295
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $8; //@line 7297
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $10; //@line 7299
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $12 & 1; //@line 7302
      sp = STACKTOP; //@line 7303
      return;
     }
     $36 = $2 + 24 | 0; //@line 7306
     $37 = $2 + 54 | 0; //@line 7307
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 7322
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $8, $10, $12); //@line 7323
     if (!___async) {
      ___async_unwind = 0; //@line 7326
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 209; //@line 7328
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 7330
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 7332
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 7334
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 7336
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 7338
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 7340
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $8; //@line 7342
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $10; //@line 7344
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $12 & 1; //@line 7347
     sp = STACKTOP; //@line 7348
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 7352
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 7356
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $8, $10, $12); //@line 7357
    if (!___async) {
     ___async_unwind = 0; //@line 7360
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 208; //@line 7362
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 7364
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 7366
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 7368
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 7370
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $8; //@line 7372
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $10; //@line 7374
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $12 & 1; //@line 7377
    sp = STACKTOP; //@line 7378
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
 sp = STACKTOP; //@line 2419
 STACKTOP = STACKTOP + 144 | 0; //@line 2420
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 2420
 $vararg_buffer45 = sp + 136 | 0; //@line 2421
 $vararg_buffer38 = sp + 112 | 0; //@line 2422
 $vararg_buffer35 = sp + 104 | 0; //@line 2423
 $vararg_buffer32 = sp + 96 | 0; //@line 2424
 $vararg_buffer29 = sp + 88 | 0; //@line 2425
 $vararg_buffer26 = sp + 80 | 0; //@line 2426
 $vararg_buffer23 = sp + 72 | 0; //@line 2427
 $vararg_buffer20 = sp + 64 | 0; //@line 2428
 $vararg_buffer17 = sp + 56 | 0; //@line 2429
 $vararg_buffer14 = sp + 48 | 0; //@line 2430
 $vararg_buffer11 = sp + 40 | 0; //@line 2431
 $vararg_buffer8 = sp + 32 | 0; //@line 2432
 $vararg_buffer5 = sp + 24 | 0; //@line 2433
 $vararg_buffer = sp; //@line 2435
 $1 = HEAP32[2333] | 0; //@line 2436
 $6 = ($1 & 1610612736 | 0) == 1610612736 ? 0 - $1 | 0 : $1 & 65535; //@line 2441
 HEAP32[$vararg_buffer >> 2] = $1; //@line 2444
 HEAP32[$vararg_buffer + 4 >> 2] = $6; //@line 2446
 HEAP32[$vararg_buffer + 8 >> 2] = $1 >>> 16 & 255; //@line 2448
 _mbed_error_printf(2484, $vararg_buffer); //@line 2449
 if (($6 + -317 | 0) >>> 0 < 4) {
  _mbed_error_printf($0, sp + 16 | 0); //@line 2453
  HEAP32[$vararg_buffer5 >> 2] = HEAP32[2335]; //@line 2455
  _mbed_error_printf(2565, $vararg_buffer5); //@line 2456
  _mbed_error_printf(2827, $vararg_buffer45); //@line 2457
  STACKTOP = sp; //@line 2458
  return;
 }
 switch ($6 | 0) {
 case 305:
  {
   HEAP32[$vararg_buffer8 >> 2] = HEAP32[2335]; //@line 2463
   _mbed_error_printf(2582, $vararg_buffer8); //@line 2464
   break;
  }
 case 306:
  {
   HEAP32[$vararg_buffer11 >> 2] = HEAP32[2335]; //@line 2469
   _mbed_error_printf(2603, $vararg_buffer11); //@line 2470
   break;
  }
 case 307:
  {
   HEAP32[$vararg_buffer14 >> 2] = HEAP32[2335]; //@line 2475
   _mbed_error_printf(2618, $vararg_buffer14); //@line 2476
   break;
  }
 case 308:
  {
   HEAP32[$vararg_buffer17 >> 2] = HEAP32[2335]; //@line 2481
   _mbed_error_printf(2632, $vararg_buffer17); //@line 2482
   break;
  }
 case 309:
  {
   HEAP32[$vararg_buffer20 >> 2] = HEAP32[2335]; //@line 2487
   _mbed_error_printf(2650, $vararg_buffer20); //@line 2488
   break;
  }
 case 311:
  {
   HEAP32[$vararg_buffer23 >> 2] = HEAP32[2335]; //@line 2493
   _mbed_error_printf(2669, $vararg_buffer23); //@line 2494
   break;
  }
 case 310:
  {
   HEAP32[$vararg_buffer26 >> 2] = HEAP32[2335]; //@line 2499
   _mbed_error_printf(2688, $vararg_buffer26); //@line 2500
   break;
  }
 case 312:
  {
   HEAP32[$vararg_buffer29 >> 2] = HEAP32[2335]; //@line 2505
   _mbed_error_printf(2702, $vararg_buffer29); //@line 2506
   break;
  }
 default:
  {}
 }
 HEAP32[$vararg_buffer32 >> 2] = 0; //@line 2512
 _mbed_error_printf($0, $vararg_buffer32); //@line 2513
 HEAP32[$vararg_buffer35 >> 2] = HEAP32[2334]; //@line 2515
 _mbed_error_printf(2723, $vararg_buffer35); //@line 2516
 $22 = HEAP32[2336] | 0; //@line 2518
 $23 = HEAP32[2337] | 0; //@line 2519
 $24 = HEAP32[2338] | 0; //@line 2520
 $25 = HEAP32[2339] | 0; //@line 2521
 HEAP32[$vararg_buffer38 >> 2] = HEAP32[2335]; //@line 2522
 HEAP32[$vararg_buffer38 + 4 >> 2] = $22; //@line 2524
 HEAP32[$vararg_buffer38 + 8 >> 2] = $23; //@line 2526
 HEAP32[$vararg_buffer38 + 12 >> 2] = $24; //@line 2528
 HEAP32[$vararg_buffer38 + 16 >> 2] = $25; //@line 2530
 _mbed_error_printf(2739, $vararg_buffer38); //@line 2531
 _mbed_error_printf(2827, $vararg_buffer45); //@line 2532
 STACKTOP = sp; //@line 2533
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_25($0) {
 $0 = $0 | 0;
 var $10 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4162
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4164
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4166
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4168
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4170
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4172
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4174
 if (($AsyncRetVal | 0) <= 0) {
  $15 = HEAP32[(HEAP32[$4 >> 2] | 0) + 80 >> 2] | 0; //@line 4179
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4180
  FUNCTION_TABLE_vi[$15 & 255]($2); //@line 4181
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 4184
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4185
   HEAP32[$16 >> 2] = $4; //@line 4186
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4187
   HEAP32[$17 >> 2] = $2; //@line 4188
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4189
   HEAP32[$18 >> 2] = $6; //@line 4190
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4191
   HEAP32[$19 >> 2] = $8; //@line 4192
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4193
   HEAP32[$20 >> 2] = $AsyncRetVal; //@line 4194
   sp = STACKTOP; //@line 4195
   return;
  }
  ___async_unwind = 0; //@line 4198
  HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 4199
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4200
  HEAP32[$16 >> 2] = $4; //@line 4201
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4202
  HEAP32[$17 >> 2] = $2; //@line 4203
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4204
  HEAP32[$18 >> 2] = $6; //@line 4205
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4206
  HEAP32[$19 >> 2] = $8; //@line 4207
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4208
  HEAP32[$20 >> 2] = $AsyncRetVal; //@line 4209
  sp = STACKTOP; //@line 4210
  return;
 }
 $23 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 4215
 $25 = HEAP8[$10 >> 0] | 0; //@line 4217
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 4218
 FUNCTION_TABLE_iii[$23 & 7]($2, $25) | 0; //@line 4219
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 4222
  $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 4223
  HEAP32[$26 >> 2] = 0; //@line 4224
  $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 4225
  HEAP32[$27 >> 2] = $AsyncRetVal; //@line 4226
  $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 4227
  HEAP32[$28 >> 2] = $4; //@line 4228
  $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 4229
  HEAP32[$29 >> 2] = $2; //@line 4230
  $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 4231
  HEAP32[$30 >> 2] = $2; //@line 4232
  $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 4233
  HEAP32[$31 >> 2] = $10; //@line 4234
  $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 4235
  HEAP32[$32 >> 2] = $6; //@line 4236
  $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 4237
  HEAP32[$33 >> 2] = $8; //@line 4238
  sp = STACKTOP; //@line 4239
  return;
 }
 ___async_unwind = 0; //@line 4242
 HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 4243
 $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 4244
 HEAP32[$26 >> 2] = 0; //@line 4245
 $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 4246
 HEAP32[$27 >> 2] = $AsyncRetVal; //@line 4247
 $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 4248
 HEAP32[$28 >> 2] = $4; //@line 4249
 $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 4250
 HEAP32[$29 >> 2] = $2; //@line 4251
 $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 4252
 HEAP32[$30 >> 2] = $2; //@line 4253
 $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 4254
 HEAP32[$31 >> 2] = $10; //@line 4255
 $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 4256
 HEAP32[$32 >> 2] = $6; //@line 4257
 $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 4258
 HEAP32[$33 >> 2] = $8; //@line 4259
 sp = STACKTOP; //@line 4260
 return;
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $$03 = 0, $13 = 0, $14 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $35 = 0, $36 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4329
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 112 >> 2] | 0; //@line 4332
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4333
 FUNCTION_TABLE_viii[$3 & 3]($0, 0, 0); //@line 4334
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 153; //@line 4337
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4339
  sp = STACKTOP; //@line 4340
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4343
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4346
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4347
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 4348
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 154; //@line 4351
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 4353
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 4355
  sp = STACKTOP; //@line 4356
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4359
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4362
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4363
 $14 = FUNCTION_TABLE_ii[$13 & 31]($0) | 0; //@line 4364
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 155; //@line 4367
  HEAP32[$AsyncCtx5 + 4 >> 2] = $8; //@line 4369
  HEAP32[$AsyncCtx5 + 8 >> 2] = $0; //@line 4371
  HEAP32[$AsyncCtx5 + 12 >> 2] = $0; //@line 4373
  sp = STACKTOP; //@line 4374
  return;
 }
 _emscripten_free_async_context($AsyncCtx5 | 0); //@line 4377
 if ((Math_imul($14, $8) | 0) <= 0) {
  return;
 }
 $$03 = 0; //@line 4383
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4385
  __ZN4mbed6Stream4putcEi($0, 32) | 0; //@line 4386
  if (___async) {
   label = 11; //@line 4389
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 4392
  $24 = $$03 + 1 | 0; //@line 4393
  $27 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4396
  $AsyncCtx9 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4397
  $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 4398
  if (___async) {
   label = 13; //@line 4401
   break;
  }
  _emscripten_free_async_context($AsyncCtx9 | 0); //@line 4404
  $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4407
  $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4408
  $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 4409
  if (___async) {
   label = 15; //@line 4412
   break;
  }
  _emscripten_free_async_context($AsyncCtx12 | 0); //@line 4415
  if (($24 | 0) < (Math_imul($36, $28) | 0)) {
   $$03 = $24; //@line 4419
  } else {
   label = 9; //@line 4421
   break;
  }
 }
 if ((label | 0) == 9) {
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 156; //@line 4429
  HEAP32[$AsyncCtx16 + 4 >> 2] = $$03; //@line 4431
  HEAP32[$AsyncCtx16 + 8 >> 2] = $0; //@line 4433
  HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 4435
  HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 4437
  sp = STACKTOP; //@line 4438
  return;
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx9 >> 2] = 157; //@line 4442
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 4444
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 4446
  HEAP32[$AsyncCtx9 + 12 >> 2] = $24; //@line 4448
  HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 4450
  sp = STACKTOP; //@line 4451
  return;
 } else if ((label | 0) == 15) {
  HEAP32[$AsyncCtx12 >> 2] = 158; //@line 4455
  HEAP32[$AsyncCtx12 + 4 >> 2] = $28; //@line 4457
  HEAP32[$AsyncCtx12 + 8 >> 2] = $24; //@line 4459
  HEAP32[$AsyncCtx12 + 12 >> 2] = $0; //@line 4461
  HEAP32[$AsyncCtx12 + 16 >> 2] = $0; //@line 4463
  HEAP32[$AsyncCtx12 + 20 >> 2] = $0; //@line 4465
  sp = STACKTOP; //@line 4466
  return;
 }
}
function __ZN11TextDisplay5_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $12 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $25 = 0, $31 = 0, $32 = 0, $35 = 0, $36 = 0, $45 = 0, $46 = 0, $49 = 0, $5 = 0, $50 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4145
 _emscripten_asm_const_ii(5, $1 | 0) | 0; //@line 4146
 if (($1 | 0) == 10) {
  HEAP16[$0 + 24 >> 1] = 0; //@line 4150
  $5 = $0 + 26 | 0; //@line 4151
  $7 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 4153
  HEAP16[$5 >> 1] = $7; //@line 4154
  $8 = $7 & 65535; //@line 4155
  $11 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4158
  $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4159
  $12 = FUNCTION_TABLE_ii[$11 & 31]($0) | 0; //@line 4160
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 147; //@line 4163
   HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 4165
   HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 4167
   HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 4169
   sp = STACKTOP; //@line 4170
   return 0; //@line 4171
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4173
  if (($12 | 0) > ($8 | 0)) {
   return $1 | 0; //@line 4176
  }
  HEAP16[$5 >> 1] = 0; //@line 4178
  return $1 | 0; //@line 4179
 }
 $19 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 4183
 $20 = $0 + 24 | 0; //@line 4184
 $22 = HEAPU16[$20 >> 1] | 0; //@line 4186
 $23 = $0 + 26 | 0; //@line 4187
 $25 = HEAPU16[$23 >> 1] | 0; //@line 4189
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4190
 FUNCTION_TABLE_viiii[$19 & 7]($0, $22, $25, $1); //@line 4191
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 148; //@line 4194
  HEAP32[$AsyncCtx3 + 4 >> 2] = $20; //@line 4196
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4198
  HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 4200
  HEAP32[$AsyncCtx3 + 16 >> 2] = $23; //@line 4202
  sp = STACKTOP; //@line 4203
  return 0; //@line 4204
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4206
 $31 = (HEAP16[$20 >> 1] | 0) + 1 << 16 >> 16; //@line 4208
 HEAP16[$20 >> 1] = $31; //@line 4209
 $32 = $31 & 65535; //@line 4210
 $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4213
 $AsyncCtx6 = _emscripten_alloc_async_context(28, sp) | 0; //@line 4214
 $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 4215
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 149; //@line 4218
  HEAP32[$AsyncCtx6 + 4 >> 2] = $32; //@line 4220
  HEAP32[$AsyncCtx6 + 8 >> 2] = $1; //@line 4222
  HEAP32[$AsyncCtx6 + 12 >> 2] = $20; //@line 4224
  HEAP32[$AsyncCtx6 + 16 >> 2] = $23; //@line 4226
  HEAP32[$AsyncCtx6 + 20 >> 2] = $0; //@line 4228
  HEAP32[$AsyncCtx6 + 24 >> 2] = $0; //@line 4230
  sp = STACKTOP; //@line 4231
  return 0; //@line 4232
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4234
 if (($36 | 0) > ($32 | 0)) {
  return $1 | 0; //@line 4237
 }
 HEAP16[$20 >> 1] = 0; //@line 4239
 $45 = (HEAP16[$23 >> 1] | 0) + 1 << 16 >> 16; //@line 4241
 HEAP16[$23 >> 1] = $45; //@line 4242
 $46 = $45 & 65535; //@line 4243
 $49 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4246
 $AsyncCtx10 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4247
 $50 = FUNCTION_TABLE_ii[$49 & 31]($0) | 0; //@line 4248
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 150; //@line 4251
  HEAP32[$AsyncCtx10 + 4 >> 2] = $46; //@line 4253
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 4255
  HEAP32[$AsyncCtx10 + 12 >> 2] = $23; //@line 4257
  sp = STACKTOP; //@line 4258
  return 0; //@line 4259
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 4261
 if (($50 | 0) > ($46 | 0)) {
  return $1 | 0; //@line 4264
 }
 HEAP16[$23 >> 1] = 0; //@line 4266
 return $1 | 0; //@line 4267
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9608
 STACKTOP = STACKTOP + 224 | 0; //@line 9609
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 9609
 $3 = sp + 120 | 0; //@line 9610
 $4 = sp + 80 | 0; //@line 9611
 $5 = sp; //@line 9612
 $6 = sp + 136 | 0; //@line 9613
 dest = $4; //@line 9614
 stop = dest + 40 | 0; //@line 9614
 do {
  HEAP32[dest >> 2] = 0; //@line 9614
  dest = dest + 4 | 0; //@line 9614
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 9616
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 9620
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 9627
  } else {
   $43 = 0; //@line 9629
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 9631
  $14 = $13 & 32; //@line 9632
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 9638
  }
  $19 = $0 + 48 | 0; //@line 9640
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 9645
    $24 = HEAP32[$23 >> 2] | 0; //@line 9646
    HEAP32[$23 >> 2] = $6; //@line 9647
    $25 = $0 + 28 | 0; //@line 9648
    HEAP32[$25 >> 2] = $6; //@line 9649
    $26 = $0 + 20 | 0; //@line 9650
    HEAP32[$26 >> 2] = $6; //@line 9651
    HEAP32[$19 >> 2] = 80; //@line 9652
    $28 = $0 + 16 | 0; //@line 9654
    HEAP32[$28 >> 2] = $6 + 80; //@line 9655
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9656
    if (!$24) {
     $$1 = $29; //@line 9659
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 9662
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 9663
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 9664
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 176; //@line 9667
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 9669
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 9671
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 9673
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 9675
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 9677
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 9679
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 9681
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 9683
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 9685
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 9687
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 9689
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 9691
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 9693
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 9695
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 9697
      sp = STACKTOP; //@line 9698
      STACKTOP = sp; //@line 9699
      return 0; //@line 9699
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9701
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 9704
      HEAP32[$23 >> 2] = $24; //@line 9705
      HEAP32[$19 >> 2] = 0; //@line 9706
      HEAP32[$28 >> 2] = 0; //@line 9707
      HEAP32[$25 >> 2] = 0; //@line 9708
      HEAP32[$26 >> 2] = 0; //@line 9709
      $$1 = $$; //@line 9710
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9716
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 9719
  HEAP32[$0 >> 2] = $51 | $14; //@line 9724
  if ($43 | 0) {
   ___unlockfile($0); //@line 9727
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 9729
 }
 STACKTOP = sp; //@line 9731
 return $$0 | 0; //@line 9731
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
 $3 = $1 & 255; //@line 9480
 $7 = ($2 | 0) != 0; //@line 9484
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 9488
   $$03555 = $0; //@line 9489
   $$03654 = $2; //@line 9489
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 9494
     $$036$lcssa64 = $$03654; //@line 9494
     label = 6; //@line 9495
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 9498
    $12 = $$03654 + -1 | 0; //@line 9499
    $16 = ($12 | 0) != 0; //@line 9503
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 9506
     $$03654 = $12; //@line 9506
    } else {
     $$035$lcssa = $11; //@line 9508
     $$036$lcssa = $12; //@line 9508
     $$lcssa = $16; //@line 9508
     label = 5; //@line 9509
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 9514
   $$036$lcssa = $2; //@line 9514
   $$lcssa = $7; //@line 9514
   label = 5; //@line 9515
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 9520
   $$036$lcssa64 = $$036$lcssa; //@line 9520
   label = 6; //@line 9521
  } else {
   $$2 = $$035$lcssa; //@line 9523
   $$3 = 0; //@line 9523
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 9529
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 9532
    $$3 = $$036$lcssa64; //@line 9532
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 9534
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 9538
      $$13745 = $$036$lcssa64; //@line 9538
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 9541
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 9550
       $30 = $$13745 + -4 | 0; //@line 9551
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 9554
        $$13745 = $30; //@line 9554
       } else {
        $$0$lcssa = $29; //@line 9556
        $$137$lcssa = $30; //@line 9556
        label = 11; //@line 9557
        break L11;
       }
      }
      $$140 = $$046; //@line 9561
      $$23839 = $$13745; //@line 9561
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 9563
      $$137$lcssa = $$036$lcssa64; //@line 9563
      label = 11; //@line 9564
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 9570
      $$3 = 0; //@line 9570
      break;
     } else {
      $$140 = $$0$lcssa; //@line 9573
      $$23839 = $$137$lcssa; //@line 9573
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 9580
      $$3 = $$23839; //@line 9580
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 9583
     $$23839 = $$23839 + -1 | 0; //@line 9584
     if (!$$23839) {
      $$2 = $35; //@line 9587
      $$3 = 0; //@line 9587
      break;
     } else {
      $$140 = $35; //@line 9590
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 9598
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 9251
 do {
  if (!$0) {
   do {
    if (!(HEAP32[341] | 0)) {
     $34 = 0; //@line 9259
    } else {
     $12 = HEAP32[341] | 0; //@line 9261
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9262
     $13 = _fflush($12) | 0; //@line 9263
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 172; //@line 9266
      sp = STACKTOP; //@line 9267
      return 0; //@line 9268
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 9270
      $34 = $13; //@line 9271
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 9277
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 9281
    } else {
     $$02327 = $$02325; //@line 9283
     $$02426 = $34; //@line 9283
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 9290
      } else {
       $28 = 0; //@line 9292
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9300
       $25 = ___fflush_unlocked($$02327) | 0; //@line 9301
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 9306
       $$1 = $25 | $$02426; //@line 9308
      } else {
       $$1 = $$02426; //@line 9310
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 9314
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 9317
      if (!$$023) {
       $$024$lcssa = $$1; //@line 9320
       break L9;
      } else {
       $$02327 = $$023; //@line 9323
       $$02426 = $$1; //@line 9323
      }
     }
     HEAP32[$AsyncCtx >> 2] = 173; //@line 9326
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 9328
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 9330
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 9332
     sp = STACKTOP; //@line 9333
     return 0; //@line 9334
    }
   } while (0);
   ___ofl_unlock(); //@line 9337
   $$0 = $$024$lcssa; //@line 9338
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9344
    $5 = ___fflush_unlocked($0) | 0; //@line 9345
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 170; //@line 9348
     sp = STACKTOP; //@line 9349
     return 0; //@line 9350
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 9352
     $$0 = $5; //@line 9353
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 9358
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 9359
   $7 = ___fflush_unlocked($0) | 0; //@line 9360
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 171; //@line 9363
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 9366
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9368
    sp = STACKTOP; //@line 9369
    return 0; //@line 9370
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9372
   if ($phitmp) {
    $$0 = $7; //@line 9374
   } else {
    ___unlockfile($0); //@line 9376
    $$0 = $7; //@line 9377
   }
  }
 } while (0);
 return $$0 | 0; //@line 9381
}
function _mbed_vtracef__async_cb_57($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 6468
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6470
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6472
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6474
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 6479
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6481
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6483
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6485
 $$13 = ($AsyncRetVal | 0) >= ($6 | 0) ? 0 : $AsyncRetVal; //@line 6487
 $18 = (HEAP32[$0 + 16 >> 2] | 0) + $$13 | 0; //@line 6489
 $19 = $6 - $$13 | 0; //@line 6490
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[90] | 0; //@line 6494
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $10 ^ 1) {
     break;
    }
    _snprintf($18, $19, 2194, $12) | 0; //@line 6506
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 6509
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 6510
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 46; //@line 6513
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 6514
    HEAP32[$24 >> 2] = $2; //@line 6515
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 6516
    HEAP32[$25 >> 2] = $18; //@line 6517
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 6518
    HEAP32[$26 >> 2] = $19; //@line 6519
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 6520
    HEAP32[$27 >> 2] = $4; //@line 6521
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 6522
    $$expand_i1_val = $10 & 1; //@line 6523
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 6524
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 6525
    HEAP32[$29 >> 2] = $12; //@line 6526
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 6527
    HEAP32[$30 >> 2] = $14; //@line 6528
    sp = STACKTOP; //@line 6529
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 6533
   ___async_unwind = 0; //@line 6534
   HEAP32[$ReallocAsyncCtx6 >> 2] = 46; //@line 6535
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 6536
   HEAP32[$24 >> 2] = $2; //@line 6537
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 6538
   HEAP32[$25 >> 2] = $18; //@line 6539
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 6540
   HEAP32[$26 >> 2] = $19; //@line 6541
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 6542
   HEAP32[$27 >> 2] = $4; //@line 6543
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 6544
   $$expand_i1_val = $10 & 1; //@line 6545
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 6546
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 6547
   HEAP32[$29 >> 2] = $12; //@line 6548
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 6549
   HEAP32[$30 >> 2] = $14; //@line 6550
   sp = STACKTOP; //@line 6551
   return;
  }
 } while (0);
 $34 = HEAP32[91] | 0; //@line 6555
 $35 = HEAP32[84] | 0; //@line 6556
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 6557
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 6558
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6561
  sp = STACKTOP; //@line 6562
  return;
 }
 ___async_unwind = 0; //@line 6565
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6566
 sp = STACKTOP; //@line 6567
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
function _mbed_vtracef__async_cb_58($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 6577
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6579
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6581
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6583
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6585
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6587
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6589
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6591
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6593
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6595
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6597
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6599
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6601
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6603
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 6605
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 6607
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 6609
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 6611
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 6613
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 6615
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 6617
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 6619
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 6622
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 6624
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 6626
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 6628
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 6634
 $56 = HEAP32[89] | 0; //@line 6635
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 6636
 $57 = FUNCTION_TABLE_ii[$56 & 31]($55) | 0; //@line 6637
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 6641
  ___async_unwind = 0; //@line 6642
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 6644
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 6646
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 6648
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 6650
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 6652
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 6654
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 6656
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 6658
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 6660
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 6662
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 6664
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 6666
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 6668
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 6670
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 6672
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 6674
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 6676
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $34; //@line 6678
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 6680
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 6682
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 6684
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 6686
 HEAP8[$ReallocAsyncCtx5 + 88 >> 0] = $44 & 1; //@line 6689
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 6691
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $48; //@line 6693
 sp = STACKTOP; //@line 6694
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_81($0) {
 $0 = $0 | 0;
 var $$016$lcssa = 0, $10 = 0, $12 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8953
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8955
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8957
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8959
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8961
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8963
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8965
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8967
 if (($AsyncRetVal | 0) == -1) {
  $$016$lcssa = $4; //@line 8970
 } else {
  $20 = $4 + 1 | 0; //@line 8973
  HEAP8[$4 >> 0] = $AsyncRetVal; //@line 8974
  if (($20 | 0) == ($6 | 0)) {
   $$016$lcssa = $6; //@line 8977
  } else {
   $16 = HEAP32[(HEAP32[$12 >> 2] | 0) + 76 >> 2] | 0; //@line 8981
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 8982
   $17 = FUNCTION_TABLE_ii[$16 & 31]($10) | 0; //@line 8983
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 8986
    $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 8987
    HEAP32[$18 >> 2] = $2; //@line 8988
    $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 8989
    HEAP32[$19 >> 2] = $20; //@line 8990
    $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 8991
    HEAP32[$21 >> 2] = $6; //@line 8992
    $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 8993
    HEAP32[$22 >> 2] = $8; //@line 8994
    $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 8995
    HEAP32[$23 >> 2] = $10; //@line 8996
    $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 8997
    HEAP32[$24 >> 2] = $12; //@line 8998
    sp = STACKTOP; //@line 8999
    return;
   }
   HEAP32[___async_retval >> 2] = $17; //@line 9003
   ___async_unwind = 0; //@line 9004
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 9005
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 9006
   HEAP32[$18 >> 2] = $2; //@line 9007
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 9008
   HEAP32[$19 >> 2] = $20; //@line 9009
   $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 9010
   HEAP32[$21 >> 2] = $6; //@line 9011
   $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 9012
   HEAP32[$22 >> 2] = $8; //@line 9013
   $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 9014
   HEAP32[$23 >> 2] = $10; //@line 9015
   $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 9016
   HEAP32[$24 >> 2] = $12; //@line 9017
   sp = STACKTOP; //@line 9018
   return;
  }
 }
 $31 = HEAP32[(HEAP32[$8 >> 2] | 0) + 88 >> 2] | 0; //@line 9024
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 9025
 FUNCTION_TABLE_vi[$31 & 255]($10); //@line 9026
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 9029
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 9030
  HEAP32[$32 >> 2] = $$016$lcssa; //@line 9031
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 9032
  HEAP32[$33 >> 2] = $2; //@line 9033
  sp = STACKTOP; //@line 9034
  return;
 }
 ___async_unwind = 0; //@line 9037
 HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 9038
 $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 9039
 HEAP32[$32 >> 2] = $$016$lcssa; //@line 9040
 $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 9041
 HEAP32[$33 >> 2] = $2; //@line 9042
 sp = STACKTOP; //@line 9043
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
    HEAP32[$vararg_buffer7 >> 2] = 8877; //@line 159
    _abort_message(8827, $vararg_buffer7); //@line 160
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
    HEAP32[$vararg_buffer3 >> 2] = 8877; //@line 202
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 204
    _abort_message(8786, $vararg_buffer3); //@line 205
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
    HEAP32[$vararg_buffer >> 2] = 8877; //@line 227
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 229
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 231
    _abort_message(8741, $vararg_buffer); //@line 232
   }
  }
 }
 _abort_message(8865, $vararg_buffer10); //@line 237
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_60($0) {
 $0 = $0 | 0;
 var $$1 = 0, $10 = 0, $12 = 0, $17 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6828
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6830
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6832
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6834
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6836
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6838
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6840
 if ((HEAP32[___async_retval >> 2] | 0) == -1) {
  $$1 = $2; //@line 6845
 } else {
  if (($2 | 0) == ($4 | 0)) {
   $$1 = $4; //@line 6849
  } else {
   $17 = HEAP32[(HEAP32[$12 >> 2] | 0) + 72 >> 2] | 0; //@line 6853
   $18 = $2 + 1 | 0; //@line 6854
   $20 = HEAP8[$2 >> 0] | 0; //@line 6856
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 6857
   $21 = FUNCTION_TABLE_iii[$17 & 7]($8, $20) | 0; //@line 6858
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 6861
    $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 6862
    HEAP32[$22 >> 2] = $18; //@line 6863
    $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 6864
    HEAP32[$23 >> 2] = $4; //@line 6865
    $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 6866
    HEAP32[$24 >> 2] = $6; //@line 6867
    $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 6868
    HEAP32[$25 >> 2] = $8; //@line 6869
    $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 6870
    HEAP32[$26 >> 2] = $10; //@line 6871
    $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 6872
    HEAP32[$27 >> 2] = $12; //@line 6873
    sp = STACKTOP; //@line 6874
    return;
   }
   HEAP32[___async_retval >> 2] = $21; //@line 6878
   ___async_unwind = 0; //@line 6879
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 6880
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 6881
   HEAP32[$22 >> 2] = $18; //@line 6882
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 6883
   HEAP32[$23 >> 2] = $4; //@line 6884
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 6885
   HEAP32[$24 >> 2] = $6; //@line 6886
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 6887
   HEAP32[$25 >> 2] = $8; //@line 6888
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 6889
   HEAP32[$26 >> 2] = $10; //@line 6890
   $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 6891
   HEAP32[$27 >> 2] = $12; //@line 6892
   sp = STACKTOP; //@line 6893
   return;
  }
 }
 $32 = HEAP32[(HEAP32[$6 >> 2] | 0) + 88 >> 2] | 0; //@line 6899
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 6900
 FUNCTION_TABLE_vi[$32 & 255]($8); //@line 6901
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 6904
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 6905
  HEAP32[$33 >> 2] = $$1; //@line 6906
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 6907
  HEAP32[$34 >> 2] = $10; //@line 6908
  sp = STACKTOP; //@line 6909
  return;
 }
 ___async_unwind = 0; //@line 6912
 HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 6913
 $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 6914
 HEAP32[$33 >> 2] = $$1; //@line 6915
 $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 6916
 HEAP32[$34 >> 2] = $10; //@line 6917
 sp = STACKTOP; //@line 6918
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7593
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7595
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7597
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7599
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[2374] | 0)) {
  _serial_init(9500, 2, 3); //@line 7607
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 7609
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 7615
  _serial_putc(9500, $9 << 24 >> 24); //@line 7616
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 7619
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 7620
   HEAP32[$18 >> 2] = 0; //@line 7621
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 7622
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 7623
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 7624
   HEAP32[$20 >> 2] = $2; //@line 7625
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 7626
   HEAP8[$21 >> 0] = $9; //@line 7627
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 7628
   HEAP32[$22 >> 2] = $4; //@line 7629
   sp = STACKTOP; //@line 7630
   return;
  }
  ___async_unwind = 0; //@line 7633
  HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 7634
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 7635
  HEAP32[$18 >> 2] = 0; //@line 7636
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 7637
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 7638
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 7639
  HEAP32[$20 >> 2] = $2; //@line 7640
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 7641
  HEAP8[$21 >> 0] = $9; //@line 7642
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 7643
  HEAP32[$22 >> 2] = $4; //@line 7644
  sp = STACKTOP; //@line 7645
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 7648
  _serial_putc(9500, 13); //@line 7649
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 7652
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 7653
   HEAP8[$12 >> 0] = $9; //@line 7654
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 7655
   HEAP32[$13 >> 2] = 0; //@line 7656
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 7657
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 7658
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 7659
   HEAP32[$15 >> 2] = $2; //@line 7660
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 7661
   HEAP32[$16 >> 2] = $4; //@line 7662
   sp = STACKTOP; //@line 7663
   return;
  }
  ___async_unwind = 0; //@line 7666
  HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 7667
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 7668
  HEAP8[$12 >> 0] = $9; //@line 7669
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 7670
  HEAP32[$13 >> 2] = 0; //@line 7671
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 7672
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 7673
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 7674
  HEAP32[$15 >> 2] = $2; //@line 7675
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 7676
  HEAP32[$16 >> 2] = $4; //@line 7677
  sp = STACKTOP; //@line 7678
  return;
 }
}
function _mbed_error_vfprintf__async_cb_68($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7686
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7690
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7692
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7696
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 7697
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 7703
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 7709
  _serial_putc(9500, $13 << 24 >> 24); //@line 7710
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 7713
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 7714
   HEAP32[$22 >> 2] = $12; //@line 7715
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 7716
   HEAP32[$23 >> 2] = $4; //@line 7717
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 7718
   HEAP32[$24 >> 2] = $6; //@line 7719
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 7720
   HEAP8[$25 >> 0] = $13; //@line 7721
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 7722
   HEAP32[$26 >> 2] = $10; //@line 7723
   sp = STACKTOP; //@line 7724
   return;
  }
  ___async_unwind = 0; //@line 7727
  HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 7728
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 7729
  HEAP32[$22 >> 2] = $12; //@line 7730
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 7731
  HEAP32[$23 >> 2] = $4; //@line 7732
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 7733
  HEAP32[$24 >> 2] = $6; //@line 7734
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 7735
  HEAP8[$25 >> 0] = $13; //@line 7736
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 7737
  HEAP32[$26 >> 2] = $10; //@line 7738
  sp = STACKTOP; //@line 7739
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 7742
  _serial_putc(9500, 13); //@line 7743
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 7746
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 7747
   HEAP8[$16 >> 0] = $13; //@line 7748
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 7749
   HEAP32[$17 >> 2] = $12; //@line 7750
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 7751
   HEAP32[$18 >> 2] = $4; //@line 7752
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 7753
   HEAP32[$19 >> 2] = $6; //@line 7754
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 7755
   HEAP32[$20 >> 2] = $10; //@line 7756
   sp = STACKTOP; //@line 7757
   return;
  }
  ___async_unwind = 0; //@line 7760
  HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 7761
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 7762
  HEAP8[$16 >> 0] = $13; //@line 7763
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 7764
  HEAP32[$17 >> 2] = $12; //@line 7765
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 7766
  HEAP32[$18 >> 2] = $4; //@line 7767
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 7768
  HEAP32[$19 >> 2] = $6; //@line 7769
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 7770
  HEAP32[$20 >> 2] = $10; //@line 7771
  sp = STACKTOP; //@line 7772
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7862
 STACKTOP = STACKTOP + 48 | 0; //@line 7863
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7863
 $vararg_buffer3 = sp + 16 | 0; //@line 7864
 $vararg_buffer = sp; //@line 7865
 $3 = sp + 32 | 0; //@line 7866
 $4 = $0 + 28 | 0; //@line 7867
 $5 = HEAP32[$4 >> 2] | 0; //@line 7868
 HEAP32[$3 >> 2] = $5; //@line 7869
 $7 = $0 + 20 | 0; //@line 7871
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7873
 HEAP32[$3 + 4 >> 2] = $9; //@line 7874
 HEAP32[$3 + 8 >> 2] = $1; //@line 7876
 HEAP32[$3 + 12 >> 2] = $2; //@line 7878
 $12 = $9 + $2 | 0; //@line 7879
 $13 = $0 + 60 | 0; //@line 7880
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7883
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7885
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7887
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7889
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7893
  } else {
   $$04756 = 2; //@line 7895
   $$04855 = $12; //@line 7895
   $$04954 = $3; //@line 7895
   $27 = $17; //@line 7895
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7901
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7903
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7904
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7906
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7908
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7910
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7913
    $44 = $$150 + 4 | 0; //@line 7914
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7917
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7920
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7922
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7924
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7926
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7929
     break L1;
    } else {
     $$04756 = $$1; //@line 7932
     $$04954 = $$150; //@line 7932
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7936
   HEAP32[$4 >> 2] = 0; //@line 7937
   HEAP32[$7 >> 2] = 0; //@line 7938
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7941
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7944
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7949
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7955
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7960
  $25 = $20; //@line 7961
  HEAP32[$4 >> 2] = $25; //@line 7962
  HEAP32[$7 >> 2] = $25; //@line 7963
  $$051 = $2; //@line 7964
 }
 STACKTOP = sp; //@line 7966
 return $$051 | 0; //@line 7966
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6742
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6744
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6746
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6748
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6750
 if (($4 | 0) == ($6 | 0)) {
  $26 = HEAP32[(HEAP32[$8 >> 2] | 0) + 88 >> 2] | 0; //@line 6755
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 6756
  FUNCTION_TABLE_vi[$26 & 255]($2); //@line 6757
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 6760
   $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 6761
   HEAP32[$27 >> 2] = $6; //@line 6762
   $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 6763
   HEAP32[$28 >> 2] = $4; //@line 6764
   sp = STACKTOP; //@line 6765
   return;
  }
  ___async_unwind = 0; //@line 6768
  HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 6769
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 6770
  HEAP32[$27 >> 2] = $6; //@line 6771
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 6772
  HEAP32[$28 >> 2] = $4; //@line 6773
  sp = STACKTOP; //@line 6774
  return;
 } else {
  $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 6779
  $13 = $4 + 1 | 0; //@line 6780
  $15 = HEAP8[$4 >> 0] | 0; //@line 6782
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 6783
  $16 = FUNCTION_TABLE_iii[$12 & 7]($2, $15) | 0; //@line 6784
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 6787
   $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 6788
   HEAP32[$17 >> 2] = $13; //@line 6789
   $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 6790
   HEAP32[$18 >> 2] = $6; //@line 6791
   $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 6792
   HEAP32[$19 >> 2] = $8; //@line 6793
   $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 6794
   HEAP32[$20 >> 2] = $2; //@line 6795
   $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 6796
   HEAP32[$21 >> 2] = $4; //@line 6797
   $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 6798
   HEAP32[$22 >> 2] = $2; //@line 6799
   sp = STACKTOP; //@line 6800
   return;
  }
  HEAP32[___async_retval >> 2] = $16; //@line 6804
  ___async_unwind = 0; //@line 6805
  HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 6806
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 6807
  HEAP32[$17 >> 2] = $13; //@line 6808
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 6809
  HEAP32[$18 >> 2] = $6; //@line 6810
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 6811
  HEAP32[$19 >> 2] = $8; //@line 6812
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 6813
  HEAP32[$20 >> 2] = $2; //@line 6814
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 6815
  HEAP32[$21 >> 2] = $4; //@line 6816
  $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 6817
  HEAP32[$22 >> 2] = $2; //@line 6818
  sp = STACKTOP; //@line 6819
  return;
 }
}
function _freopen__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $14 = 0, $18 = 0, $2 = 0, $28 = 0, $30 = 0, $31 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4385
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4387
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4389
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4391
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4393
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4395
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4399
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4403
 if (!$2) {
  $$pre = $6 + 60 | 0; //@line 4408
  if ($4 & 524288 | 0) {
   HEAP32[$10 >> 2] = HEAP32[$$pre >> 2]; //@line 4411
   HEAP32[$10 + 4 >> 2] = 2; //@line 4413
   HEAP32[$10 + 8 >> 2] = 1; //@line 4415
   ___syscall221(221, $10 | 0) | 0; //@line 4416
  }
  HEAP32[$14 >> 2] = HEAP32[$$pre >> 2]; //@line 4420
  HEAP32[$14 + 4 >> 2] = 4; //@line 4422
  HEAP32[$14 + 8 >> 2] = $4 & -524481; //@line 4424
  if ((___syscall_ret(___syscall221(221, $14 | 0) | 0) | 0) >= 0) {
   if ($18 | 0) {
    ___unlockfile($6); //@line 4431
   }
   HEAP32[___async_retval >> 2] = $6; //@line 4434
   return;
  }
 } else {
  $28 = _fopen($2, $8) | 0; //@line 4438
  if ($28 | 0) {
   $30 = $28 + 60 | 0; //@line 4441
   $31 = HEAP32[$30 >> 2] | 0; //@line 4442
   $33 = HEAP32[$6 + 60 >> 2] | 0; //@line 4444
   if (($31 | 0) == ($33 | 0)) {
    HEAP32[$30 >> 2] = -1; //@line 4447
   } else {
    if ((___dup3($31, $33, $4 & 524288) | 0) < 0) {
     $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4453
     _fclose($28) | 0; //@line 4454
     if (!___async) {
      ___async_unwind = 0; //@line 4457
     }
     HEAP32[$ReallocAsyncCtx3 >> 2] = 183; //@line 4459
     HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 4461
     sp = STACKTOP; //@line 4462
     return;
    }
   }
   HEAP32[$6 >> 2] = HEAP32[$6 >> 2] & 1 | HEAP32[$28 >> 2]; //@line 4470
   HEAP32[$6 + 32 >> 2] = HEAP32[$28 + 32 >> 2]; //@line 4474
   HEAP32[$6 + 36 >> 2] = HEAP32[$28 + 36 >> 2]; //@line 4478
   HEAP32[$6 + 40 >> 2] = HEAP32[$28 + 40 >> 2]; //@line 4482
   HEAP32[$6 + 12 >> 2] = HEAP32[$28 + 12 >> 2]; //@line 4486
   $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 4487
   _fclose($28) | 0; //@line 4488
   if (!___async) {
    ___async_unwind = 0; //@line 4491
   }
   HEAP32[$ReallocAsyncCtx4 >> 2] = 182; //@line 4493
   HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $18; //@line 4495
   HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 4497
   sp = STACKTOP; //@line 4498
   return;
  }
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 4502
 _fclose($6) | 0; //@line 4503
 if (!___async) {
  ___async_unwind = 0; //@line 4506
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 184; //@line 4508
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $6; //@line 4510
 sp = STACKTOP; //@line 4511
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8868
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8870
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8874
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8876
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8878
 if (!(HEAP32[$0 + 8 >> 2] | 0)) {
  $25 = HEAP32[(HEAP32[$10 >> 2] | 0) + 88 >> 2] | 0; //@line 8883
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 8884
  FUNCTION_TABLE_vi[$25 & 255]($2); //@line 8885
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 8888
   $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 8889
   HEAP32[$26 >> 2] = $6; //@line 8890
   $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 8891
   HEAP32[$27 >> 2] = $6; //@line 8892
   sp = STACKTOP; //@line 8893
   return;
  }
  ___async_unwind = 0; //@line 8896
  HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 8897
  $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 8898
  HEAP32[$26 >> 2] = $6; //@line 8899
  $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 8900
  HEAP32[$27 >> 2] = $6; //@line 8901
  sp = STACKTOP; //@line 8902
  return;
 } else {
  $14 = HEAP32[(HEAP32[$2 >> 2] | 0) + 76 >> 2] | 0; //@line 8907
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 8908
  $15 = FUNCTION_TABLE_ii[$14 & 31]($2) | 0; //@line 8909
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 8912
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 8913
   HEAP32[$16 >> 2] = $6; //@line 8914
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 8915
   HEAP32[$17 >> 2] = $6; //@line 8916
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 8917
   HEAP32[$18 >> 2] = $8; //@line 8918
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 8919
   HEAP32[$19 >> 2] = $10; //@line 8920
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 8921
   HEAP32[$20 >> 2] = $2; //@line 8922
   $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 8923
   HEAP32[$21 >> 2] = $2; //@line 8924
   sp = STACKTOP; //@line 8925
   return;
  }
  HEAP32[___async_retval >> 2] = $15; //@line 8929
  ___async_unwind = 0; //@line 8930
  HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 8931
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 8932
  HEAP32[$16 >> 2] = $6; //@line 8933
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 8934
  HEAP32[$17 >> 2] = $6; //@line 8935
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 8936
  HEAP32[$18 >> 2] = $8; //@line 8937
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 8938
  HEAP32[$19 >> 2] = $10; //@line 8939
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 8940
  HEAP32[$20 >> 2] = $2; //@line 8941
  $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 8942
  HEAP32[$21 >> 2] = $2; //@line 8943
  sp = STACKTOP; //@line 8944
  return;
 }
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 2318
 STACKTOP = STACKTOP + 128 | 0; //@line 2319
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2319
 $2 = sp; //@line 2320
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2321
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2322
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 2325
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2327
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2329
  sp = STACKTOP; //@line 2330
  STACKTOP = sp; //@line 2331
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2333
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2336
  return;
 }
 if (!(HEAP32[2374] | 0)) {
  _serial_init(9500, 2, 3); //@line 2341
  $$01213 = 0; //@line 2342
  $$014 = 0; //@line 2342
 } else {
  $$01213 = 0; //@line 2344
  $$014 = 0; //@line 2344
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2348
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2353
   _serial_putc(9500, 13); //@line 2354
   if (___async) {
    label = 8; //@line 2357
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2360
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2363
  _serial_putc(9500, $$01213 << 24 >> 24); //@line 2364
  if (___async) {
   label = 11; //@line 2367
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2370
  $24 = $$014 + 1 | 0; //@line 2371
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2374
   break;
  } else {
   $$014 = $24; //@line 2377
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 104; //@line 2381
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2383
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2385
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2387
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2389
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2391
  sp = STACKTOP; //@line 2392
  STACKTOP = sp; //@line 2393
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 105; //@line 2396
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2398
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2400
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2402
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2404
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2406
  sp = STACKTOP; //@line 2407
  STACKTOP = sp; //@line 2408
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2411
  return;
 }
}
function ___fdopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $19 = 0, $2 = 0, $24 = 0, $29 = 0, $31 = 0, $8 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 8906
 STACKTOP = STACKTOP + 64 | 0; //@line 8907
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8907
 $vararg_buffer12 = sp + 40 | 0; //@line 8908
 $vararg_buffer7 = sp + 24 | 0; //@line 8909
 $vararg_buffer3 = sp + 16 | 0; //@line 8910
 $vararg_buffer = sp; //@line 8911
 $2 = sp + 56 | 0; //@line 8912
 if (!(_strchr(6311, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8919
  $$0 = 0; //@line 8920
 } else {
  $8 = _malloc(1156) | 0; //@line 8922
  if (!$8) {
   $$0 = 0; //@line 8925
  } else {
   _memset($8 | 0, 0, 124) | 0; //@line 8927
   if (!(_strchr($1, 43) | 0)) {
    HEAP32[$8 >> 2] = (HEAP8[$1 >> 0] | 0) == 114 ? 8 : 4; //@line 8934
   }
   if (_strchr($1, 101) | 0) {
    HEAP32[$vararg_buffer >> 2] = $0; //@line 8939
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 8941
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 8943
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 8944
   }
   if ((HEAP8[$1 >> 0] | 0) == 97) {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 8949
    HEAP32[$vararg_buffer3 + 4 >> 2] = 3; //@line 8951
    $19 = ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8952
    if (!($19 & 1024)) {
     HEAP32[$vararg_buffer7 >> 2] = $0; //@line 8957
     HEAP32[$vararg_buffer7 + 4 >> 2] = 4; //@line 8959
     HEAP32[$vararg_buffer7 + 8 >> 2] = $19 | 1024; //@line 8961
     ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 8962
    }
    $24 = HEAP32[$8 >> 2] | 128; //@line 8965
    HEAP32[$8 >> 2] = $24; //@line 8966
    $31 = $24; //@line 8967
   } else {
    $31 = HEAP32[$8 >> 2] | 0; //@line 8970
   }
   HEAP32[$8 + 60 >> 2] = $0; //@line 8973
   HEAP32[$8 + 44 >> 2] = $8 + 132; //@line 8976
   HEAP32[$8 + 48 >> 2] = 1024; //@line 8978
   $29 = $8 + 75 | 0; //@line 8979
   HEAP8[$29 >> 0] = -1; //@line 8980
   if (!($31 & 8)) {
    HEAP32[$vararg_buffer12 >> 2] = $0; //@line 8985
    HEAP32[$vararg_buffer12 + 4 >> 2] = 21523; //@line 8987
    HEAP32[$vararg_buffer12 + 8 >> 2] = $2; //@line 8989
    if (!(___syscall54(54, $vararg_buffer12 | 0) | 0)) {
     HEAP8[$29 >> 0] = 10; //@line 8993
    }
   }
   HEAP32[$8 + 32 >> 2] = 10; //@line 8997
   HEAP32[$8 + 36 >> 2] = 5; //@line 8999
   HEAP32[$8 + 40 >> 2] = 6; //@line 9001
   HEAP32[$8 + 12 >> 2] = 20; //@line 9003
   if (!(HEAP32[3556] | 0)) {
    HEAP32[$8 + 76 >> 2] = -1; //@line 9008
   }
   ___ofl_add($8) | 0; //@line 9010
   $$0 = $8; //@line 9011
  }
 }
 STACKTOP = sp; //@line 9014
 return $$0 | 0; //@line 9014
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_74($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8275
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8279
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8281
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 8283
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8285
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 8287
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8289
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8291
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8293
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8295
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 8298
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 8300
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 8304
   $27 = $6 + 24 | 0; //@line 8305
   $28 = $4 + 8 | 0; //@line 8306
   $29 = $6 + 54 | 0; //@line 8307
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
    HEAP8[$10 >> 0] = 0; //@line 8337
    HEAP8[$14 >> 0] = 0; //@line 8338
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 8339
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 8340
    if (!___async) {
     ___async_unwind = 0; //@line 8343
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 205; //@line 8345
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 8347
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 8349
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 8351
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 8353
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8355
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 8357
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 8359
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 8361
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 8363
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 8365
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 8367
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 8369
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 8371
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 8374
    sp = STACKTOP; //@line 8375
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 8380
 HEAP8[$14 >> 0] = $12; //@line 8381
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8159
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8163
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8165
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 8167
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8169
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 8171
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8173
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8175
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8177
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8179
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 8181
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 8183
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 8185
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 8188
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 8189
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
    HEAP8[$10 >> 0] = 0; //@line 8222
    HEAP8[$14 >> 0] = 0; //@line 8223
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 8224
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 8225
    if (!___async) {
     ___async_unwind = 0; //@line 8228
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 205; //@line 8230
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 8232
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 8234
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 8236
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 8238
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8240
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 8242
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 8244
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 8246
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 8248
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 8250
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 8252
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 8254
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 8256
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 8259
    sp = STACKTOP; //@line 8260
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 8265
 HEAP8[$14 >> 0] = $12; //@line 8266
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
 sp = STACKTOP; //@line 1395
 $3 = $1 + $2 | 0; //@line 1396
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1399
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 1400
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1401
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 65; //@line 1404
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1406
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1408
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1410
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 1412
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 1414
  sp = STACKTOP; //@line 1415
  return 0; //@line 1416
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1418
 L4 : do {
  if (!$2) {
   $$016$lcssa = $1; //@line 1422
  } else {
   $$01617 = $1; //@line 1424
   while (1) {
    $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 76 >> 2] | 0; //@line 1428
    $AsyncCtx2 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1429
    $16 = FUNCTION_TABLE_ii[$15 & 31]($0) | 0; //@line 1430
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1435
    if (($16 | 0) == -1) {
     $$016$lcssa = $$01617; //@line 1438
     break L4;
    }
    $25 = $$01617 + 1 | 0; //@line 1442
    HEAP8[$$01617 >> 0] = $16; //@line 1443
    if (($25 | 0) == ($3 | 0)) {
     $$016$lcssa = $3; //@line 1446
     break L4;
    } else {
     $$01617 = $25; //@line 1449
    }
   }
   HEAP32[$AsyncCtx2 >> 2] = 66; //@line 1452
   HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1454
   HEAP32[$AsyncCtx2 + 8 >> 2] = $$01617; //@line 1456
   HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1458
   HEAP32[$AsyncCtx2 + 16 >> 2] = $0; //@line 1460
   HEAP32[$AsyncCtx2 + 20 >> 2] = $0; //@line 1462
   HEAP32[$AsyncCtx2 + 24 >> 2] = $0; //@line 1464
   sp = STACKTOP; //@line 1465
   return 0; //@line 1466
  }
 } while (0);
 $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1471
 $AsyncCtx5 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1472
 FUNCTION_TABLE_vi[$29 & 255]($0); //@line 1473
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 67; //@line 1476
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$016$lcssa; //@line 1478
  HEAP32[$AsyncCtx5 + 8 >> 2] = $1; //@line 1480
  sp = STACKTOP; //@line 1481
  return 0; //@line 1482
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1484
  return $$016$lcssa - $1 | 0; //@line 1488
 }
 return 0; //@line 1490
}
function __ZN4mbed6Stream5writeEPKvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$1 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $28 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1499
 $3 = $1 + $2 | 0; //@line 1500
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1503
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1504
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1505
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 68; //@line 1508
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1510
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1512
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1514
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 1516
  sp = STACKTOP; //@line 1517
  return 0; //@line 1518
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1520
 $$0 = $1; //@line 1521
 while (1) {
  if (($$0 | 0) == ($3 | 0)) {
   $$1 = $3; //@line 1525
   break;
  }
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 1530
  $15 = $$0 + 1 | 0; //@line 1531
  $17 = HEAP8[$$0 >> 0] | 0; //@line 1533
  $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1534
  $18 = FUNCTION_TABLE_iii[$14 & 7]($0, $17) | 0; //@line 1535
  if (___async) {
   label = 6; //@line 1538
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1541
  if (($18 | 0) == -1) {
   $$1 = $15; //@line 1544
   break;
  } else {
   $$0 = $15; //@line 1547
  }
 }
 if ((label | 0) == 6) {
  HEAP32[$AsyncCtx3 >> 2] = 69; //@line 1551
  HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 1553
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1555
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1557
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1559
  HEAP32[$AsyncCtx3 + 20 >> 2] = $1; //@line 1561
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 1563
  sp = STACKTOP; //@line 1564
  return 0; //@line 1565
 }
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1569
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1570
 FUNCTION_TABLE_vi[$28 & 255]($0); //@line 1571
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 70; //@line 1574
  HEAP32[$AsyncCtx7 + 4 >> 2] = $$1; //@line 1576
  HEAP32[$AsyncCtx7 + 8 >> 2] = $1; //@line 1578
  sp = STACKTOP; //@line 1579
  return 0; //@line 1580
 } else {
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1582
  return $$1 - $1 | 0; //@line 1586
 }
 return 0; //@line 1588
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 13013
 STACKTOP = STACKTOP + 128 | 0; //@line 13014
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 13014
 $4 = sp + 124 | 0; //@line 13015
 $5 = sp; //@line 13016
 dest = $5; //@line 13017
 src = 1612; //@line 13017
 stop = dest + 124 | 0; //@line 13017
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13017
  dest = dest + 4 | 0; //@line 13017
  src = src + 4 | 0; //@line 13017
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 13023
   $$015 = 1; //@line 13023
   label = 4; //@line 13024
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 13027
   $$0 = -1; //@line 13028
  }
 } else {
  $$014 = $0; //@line 13031
  $$015 = $1; //@line 13031
  label = 4; //@line 13032
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 13036
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 13038
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 13040
  $14 = $5 + 20 | 0; //@line 13041
  HEAP32[$14 >> 2] = $$014; //@line 13042
  HEAP32[$5 + 44 >> 2] = $$014; //@line 13044
  $16 = $$014 + $$$015 | 0; //@line 13045
  $17 = $5 + 16 | 0; //@line 13046
  HEAP32[$17 >> 2] = $16; //@line 13047
  HEAP32[$5 + 28 >> 2] = $16; //@line 13049
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 13050
  $19 = _vfprintf($5, $2, $3) | 0; //@line 13051
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 178; //@line 13054
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 13056
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 13058
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 13060
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 13062
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 13064
   sp = STACKTOP; //@line 13065
   STACKTOP = sp; //@line 13066
   return 0; //@line 13066
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13068
  if (!$$$015) {
   $$0 = $19; //@line 13071
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 13073
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 13078
   $$0 = $19; //@line 13079
  }
 }
 STACKTOP = sp; //@line 13082
 return $$0 | 0; //@line 13082
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_79($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8704
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8708
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8710
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8712
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8714
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8716
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8718
 $16 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 8719
 if (($16 | 0) == ($4 | 0)) {
  return;
 }
 $25 = HEAPU16[((128 >>> ($16 & 7) & HEAP8[$6 + ($16 >> 3) >> 0] | 0) == 0 ? $8 : $10) >> 1] | 0; //@line 8734
 $28 = HEAP32[(HEAP32[$12 >> 2] | 0) + 140 >> 2] | 0; //@line 8737
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 8738
 FUNCTION_TABLE_vii[$28 & 7]($14, $25); //@line 8739
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 8742
  $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 8743
  HEAP32[$29 >> 2] = $16; //@line 8744
  $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 8745
  HEAP32[$30 >> 2] = $4; //@line 8746
  $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 8747
  HEAP32[$31 >> 2] = $6; //@line 8748
  $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 8749
  HEAP32[$32 >> 2] = $8; //@line 8750
  $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 8751
  HEAP32[$33 >> 2] = $10; //@line 8752
  $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 8753
  HEAP32[$34 >> 2] = $12; //@line 8754
  $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 8755
  HEAP32[$35 >> 2] = $14; //@line 8756
  sp = STACKTOP; //@line 8757
  return;
 }
 ___async_unwind = 0; //@line 8760
 HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 8761
 $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 8762
 HEAP32[$29 >> 2] = $16; //@line 8763
 $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 8764
 HEAP32[$30 >> 2] = $4; //@line 8765
 $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 8766
 HEAP32[$31 >> 2] = $6; //@line 8767
 $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 8768
 HEAP32[$32 >> 2] = $8; //@line 8769
 $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 8770
 HEAP32[$33 >> 2] = $10; //@line 8771
 $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 8772
 HEAP32[$34 >> 2] = $12; //@line 8773
 $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 8774
 HEAP32[$35 >> 2] = $14; //@line 8775
 sp = STACKTOP; //@line 8776
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
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $17 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1956
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1958
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1960
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1962
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1964
 HEAP32[$2 >> 2] = 608; //@line 1965
 HEAP32[$2 + 4 >> 2] = 772; //@line 1967
 $10 = $2 + 4172 | 0; //@line 1968
 HEAP32[$10 >> 2] = $4; //@line 1969
 $11 = $2 + 4176 | 0; //@line 1970
 HEAP32[$11 >> 2] = $6; //@line 1971
 $12 = $2 + 4180 | 0; //@line 1972
 HEAP32[$12 >> 2] = $8; //@line 1973
 _emscripten_asm_const_iiii(4, $4 | 0, $6 | 0, $8 | 0) | 0; //@line 1974
 HEAP32[$2 + 56 >> 2] = 1; //@line 1976
 HEAP32[$2 + 52 >> 2] = 0; //@line 1978
 HEAP32[$2 + 60 >> 2] = 0; //@line 1980
 $17 = $2 + 68 | 0; //@line 1981
 _memset($17 | 0, 0, 4096) | 0; //@line 1982
 $20 = HEAP32[(HEAP32[$2 >> 2] | 0) + 112 >> 2] | 0; //@line 1985
 $ReallocAsyncCtx = _emscripten_realloc_async_context(24) | 0; //@line 1986
 FUNCTION_TABLE_viii[$20 & 3]($2, 0, 0); //@line 1987
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 1990
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 1991
  HEAP32[$21 >> 2] = $2; //@line 1992
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 1993
  HEAP32[$22 >> 2] = $10; //@line 1994
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 1995
  HEAP32[$23 >> 2] = $11; //@line 1996
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 1997
  HEAP32[$24 >> 2] = $12; //@line 1998
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 1999
  HEAP32[$25 >> 2] = $17; //@line 2000
  sp = STACKTOP; //@line 2001
  return;
 }
 ___async_unwind = 0; //@line 2004
 HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 2005
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 2006
 HEAP32[$21 >> 2] = $2; //@line 2007
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 2008
 HEAP32[$22 >> 2] = $10; //@line 2009
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 2010
 HEAP32[$23 >> 2] = $11; //@line 2011
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 2012
 HEAP32[$24 >> 2] = $12; //@line 2013
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 2014
 HEAP32[$25 >> 2] = $17; //@line 2015
 sp = STACKTOP; //@line 2016
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13439
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 13444
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 13449
  } else {
   $20 = $0 & 255; //@line 13451
   $21 = $0 & 255; //@line 13452
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 13458
   } else {
    $26 = $1 + 20 | 0; //@line 13460
    $27 = HEAP32[$26 >> 2] | 0; //@line 13461
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 13467
     HEAP8[$27 >> 0] = $20; //@line 13468
     $34 = $21; //@line 13469
    } else {
     label = 12; //@line 13471
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 13476
     $32 = ___overflow($1, $0) | 0; //@line 13477
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 186; //@line 13480
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 13482
      sp = STACKTOP; //@line 13483
      return 0; //@line 13484
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 13486
      $34 = $32; //@line 13487
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 13492
   $$0 = $34; //@line 13493
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 13498
   $8 = $0 & 255; //@line 13499
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 13505
    $14 = HEAP32[$13 >> 2] | 0; //@line 13506
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 13512
     HEAP8[$14 >> 0] = $7; //@line 13513
     $$0 = $8; //@line 13514
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 13518
   $19 = ___overflow($1, $0) | 0; //@line 13519
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 185; //@line 13522
    sp = STACKTOP; //@line 13523
    return 0; //@line 13524
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13526
    $$0 = $19; //@line 13527
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 13532
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 8684
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 8687
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 8690
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 8693
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 8699
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 8708
     $24 = $13 >>> 2; //@line 8709
     $$090 = 0; //@line 8710
     $$094 = $7; //@line 8710
     while (1) {
      $25 = $$094 >>> 1; //@line 8712
      $26 = $$090 + $25 | 0; //@line 8713
      $27 = $26 << 1; //@line 8714
      $28 = $27 + $23 | 0; //@line 8715
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 8718
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8722
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 8728
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 8736
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 8740
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 8746
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 8751
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 8754
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 8754
      }
     }
     $46 = $27 + $24 | 0; //@line 8757
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 8760
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8764
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 8776
     } else {
      $$4 = 0; //@line 8778
     }
    } else {
     $$4 = 0; //@line 8781
    }
   } else {
    $$4 = 0; //@line 8784
   }
  } else {
   $$4 = 0; //@line 8787
  }
 } while (0);
 return $$4 | 0; //@line 8790
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8628
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8634
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8636
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 8637
 if (($9 | 0) <= 0) {
  return;
 }
 $11 = $6 + 28 | 0; //@line 8642
 $12 = $6 + 30 | 0; //@line 8643
 $22 = HEAPU16[((128 >>> 0 & HEAP8[$8 + 0 >> 0] | 0) == 0 ? $12 : $11) >> 1] | 0; //@line 8654
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 8657
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 8658
 FUNCTION_TABLE_vii[$25 & 7]($6, $22); //@line 8659
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 8662
  $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 8663
  HEAP32[$26 >> 2] = 0; //@line 8664
  $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 8665
  HEAP32[$27 >> 2] = $9; //@line 8666
  $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 8667
  HEAP32[$28 >> 2] = $8; //@line 8668
  $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 8669
  HEAP32[$29 >> 2] = $12; //@line 8670
  $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 8671
  HEAP32[$30 >> 2] = $11; //@line 8672
  $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 8673
  HEAP32[$31 >> 2] = $6; //@line 8674
  $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 8675
  HEAP32[$32 >> 2] = $6; //@line 8676
  sp = STACKTOP; //@line 8677
  return;
 }
 ___async_unwind = 0; //@line 8680
 HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 8681
 $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 8682
 HEAP32[$26 >> 2] = 0; //@line 8683
 $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 8684
 HEAP32[$27 >> 2] = $9; //@line 8685
 $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 8686
 HEAP32[$28 >> 2] = $8; //@line 8687
 $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 8688
 HEAP32[$29 >> 2] = $12; //@line 8689
 $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 8690
 HEAP32[$30 >> 2] = $11; //@line 8691
 $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 8692
 HEAP32[$31 >> 2] = $6; //@line 8693
 $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 8694
 HEAP32[$32 >> 2] = $6; //@line 8695
 sp = STACKTOP; //@line 8696
 return;
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8311
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 8316
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 8321
  } else {
   $20 = $0 & 255; //@line 8323
   $21 = $0 & 255; //@line 8324
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 8330
   } else {
    $26 = $1 + 20 | 0; //@line 8332
    $27 = HEAP32[$26 >> 2] | 0; //@line 8333
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 8339
     HEAP8[$27 >> 0] = $20; //@line 8340
     $34 = $21; //@line 8341
    } else {
     label = 12; //@line 8343
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8348
     $32 = ___overflow($1, $0) | 0; //@line 8349
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 166; //@line 8352
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8354
      sp = STACKTOP; //@line 8355
      return 0; //@line 8356
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8358
      $34 = $32; //@line 8359
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 8364
   $$0 = $34; //@line 8365
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 8370
   $8 = $0 & 255; //@line 8371
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 8377
    $14 = HEAP32[$13 >> 2] | 0; //@line 8378
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 8384
     HEAP8[$14 >> 0] = $7; //@line 8385
     $$0 = $8; //@line 8386
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8390
   $19 = ___overflow($1, $0) | 0; //@line 8391
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 165; //@line 8394
    sp = STACKTOP; //@line 8395
    return 0; //@line 8396
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8398
    $$0 = $19; //@line 8399
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8404
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9387
 $1 = $0 + 20 | 0; //@line 9388
 $3 = $0 + 28 | 0; //@line 9390
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 9396
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9397
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 9398
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 174; //@line 9401
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9403
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 9405
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9407
    sp = STACKTOP; //@line 9408
    return 0; //@line 9409
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9411
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 9415
     break;
    } else {
     label = 5; //@line 9418
     break;
    }
   }
  } else {
   label = 5; //@line 9423
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 9427
  $14 = HEAP32[$13 >> 2] | 0; //@line 9428
  $15 = $0 + 8 | 0; //@line 9429
  $16 = HEAP32[$15 >> 2] | 0; //@line 9430
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 9438
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 9439
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 9440
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 175; //@line 9443
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 9445
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 9447
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 9449
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 9451
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 9453
     sp = STACKTOP; //@line 9454
     return 0; //@line 9455
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9457
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 9463
  HEAP32[$3 >> 2] = 0; //@line 9464
  HEAP32[$1 >> 2] = 0; //@line 9465
  HEAP32[$15 >> 2] = 0; //@line 9466
  HEAP32[$13 >> 2] = 0; //@line 9467
  $$0 = 0; //@line 9468
 }
 return $$0 | 0; //@line 9470
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1051
 HEAP32[$0 >> 2] = 392; //@line 1052
 $1 = HEAP32[2331] | 0; //@line 1053
 do {
  if (!$1) {
   HEAP32[2331] = 9328; //@line 1057
  } else {
   if (($1 | 0) != 9328) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1061
    _mbed_assert_internal(2982, 3002, 93); //@line 1062
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 53; //@line 1065
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1067
     sp = STACKTOP; //@line 1068
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1071
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2330] | 0; //@line 1082
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2330] = HEAP32[$0 + 4 >> 2]; //@line 1087
    break;
   } else {
    $$0$i = $8; //@line 1090
   }
   do {
    $12 = $$0$i + 4 | 0; //@line 1093
    $$0$i = HEAP32[$12 >> 2] | 0; //@line 1094
   } while (($$0$i | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1104
  }
 } while (0);
 $17 = HEAP32[2331] | 0; //@line 1107
 do {
  if (!$17) {
   HEAP32[2331] = 9328; //@line 1111
  } else {
   if (($17 | 0) != 9328) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1115
    _mbed_assert_internal(2982, 3002, 93); //@line 1116
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 54; //@line 1119
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1121
     sp = STACKTOP; //@line 1122
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1125
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  __ZdlPv($0); //@line 1135
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1139
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 1140
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 55; //@line 1143
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1145
  sp = STACKTOP; //@line 1146
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1149
 __ZdlPv($0); //@line 1150
 return;
}
function __ZN4mbed6Stream4putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $15 = 0, $16 = 0, $21 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1744
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1747
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1748
 FUNCTION_TABLE_vi[$4 & 255]($0); //@line 1749
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 1752
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1754
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1756
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1758
  sp = STACKTOP; //@line 1759
  return 0; //@line 1760
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1762
 $9 = HEAP32[$0 + 20 >> 2] | 0; //@line 1764
 $AsyncCtx9 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1765
 _fflush($9) | 0; //@line 1766
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 77; //@line 1769
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 1771
  HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 1773
  HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 1775
  sp = STACKTOP; //@line 1776
  return 0; //@line 1777
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1779
 $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 1782
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1783
 $16 = FUNCTION_TABLE_iii[$15 & 7]($0, $1) | 0; //@line 1784
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 78; //@line 1787
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1789
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1791
  sp = STACKTOP; //@line 1792
  return 0; //@line 1793
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1795
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1798
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1799
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 1800
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 79; //@line 1803
  HEAP32[$AsyncCtx5 + 4 >> 2] = $16; //@line 1805
  sp = STACKTOP; //@line 1806
  return 0; //@line 1807
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1809
  return $16 | 0; //@line 1810
 }
 return 0; //@line 1812
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$019 = 0, $13 = 0, $15 = 0, $16 = 0, $26 = 0, $29 = 0, $37 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3986
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3989
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3990
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3991
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 142; //@line 3994
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3996
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3998
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 4000
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 4002
  sp = STACKTOP; //@line 4003
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4006
 $13 = Math_imul($4, $3) | 0; //@line 4007
 if (($13 | 0) <= 0) {
  return;
 }
 $15 = $0 + 28 | 0; //@line 4012
 $16 = $0 + 30 | 0; //@line 4013
 $$019 = 0; //@line 4014
 while (1) {
  $26 = HEAPU16[((128 >>> ($$019 & 7) & HEAP8[$5 + ($$019 >> 3) >> 0] | 0) == 0 ? $16 : $15) >> 1] | 0; //@line 4026
  $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 4029
  $AsyncCtx3 = _emscripten_alloc_async_context(32, sp) | 0; //@line 4030
  FUNCTION_TABLE_vii[$29 & 7]($0, $26); //@line 4031
  if (___async) {
   label = 7; //@line 4034
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4037
  $37 = $$019 + 1 | 0; //@line 4038
  if (($37 | 0) == ($13 | 0)) {
   label = 5; //@line 4041
   break;
  } else {
   $$019 = $37; //@line 4044
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 143; //@line 4051
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$019; //@line 4053
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 4055
  HEAP32[$AsyncCtx3 + 12 >> 2] = $5; //@line 4057
  HEAP32[$AsyncCtx3 + 16 >> 2] = $16; //@line 4059
  HEAP32[$AsyncCtx3 + 20 >> 2] = $15; //@line 4061
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 4063
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 4065
  sp = STACKTOP; //@line 4066
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
 sp = STACKTOP; //@line 3536
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3537
 __ZN15GraphicsDisplayC2EPKc($0, $6); //@line 3538
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 129; //@line 3541
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3543
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3545
  HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 3547
  HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 3549
  sp = STACKTOP; //@line 3550
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3553
 HEAP32[$0 >> 2] = 608; //@line 3554
 HEAP32[$0 + 4 >> 2] = 772; //@line 3556
 $12 = $0 + 4172 | 0; //@line 3557
 HEAP32[$12 >> 2] = $1; //@line 3558
 $13 = $0 + 4176 | 0; //@line 3559
 HEAP32[$13 >> 2] = $3; //@line 3560
 $14 = $0 + 4180 | 0; //@line 3561
 HEAP32[$14 >> 2] = $2; //@line 3562
 _emscripten_asm_const_iiii(4, $1 | 0, $3 | 0, $2 | 0) | 0; //@line 3563
 HEAP32[$0 + 56 >> 2] = 1; //@line 3565
 HEAP32[$0 + 52 >> 2] = 0; //@line 3567
 HEAP32[$0 + 60 >> 2] = 0; //@line 3569
 $19 = $0 + 68 | 0; //@line 3570
 _memset($19 | 0, 0, 4096) | 0; //@line 3571
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 112 >> 2] | 0; //@line 3574
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 3575
 FUNCTION_TABLE_viii[$22 & 3]($0, 0, 0); //@line 3576
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 130; //@line 3579
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3581
  HEAP32[$AsyncCtx + 8 >> 2] = $12; //@line 3583
  HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 3585
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 3587
  HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 3589
  sp = STACKTOP; //@line 3590
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3593
  HEAP32[$0 + 48 >> 2] = 3248; //@line 3595
  _emscripten_asm_const_iiiii(3, HEAP32[$12 >> 2] | 0, HEAP32[$13 >> 2] | 0, HEAP32[$14 >> 2] | 0, $19 | 0) | 0; //@line 3599
  return;
 }
}
function _fclose($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $15 = 0, $21 = 0, $25 = 0, $27 = 0, $28 = 0, $33 = 0, $35 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9153
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $25 = ___lockfile($0) | 0; //@line 9159
 } else {
  $25 = 0; //@line 9161
 }
 ___unlist_locked_file($0); //@line 9163
 $7 = (HEAP32[$0 >> 2] & 1 | 0) != 0; //@line 9166
 if (!$7) {
  $8 = ___ofl_lock() | 0; //@line 9168
  $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 9170
  $$pre = $0 + 56 | 0; //@line 9173
  if ($10 | 0) {
   HEAP32[$10 + 56 >> 2] = HEAP32[$$pre >> 2]; //@line 9177
  }
  $15 = HEAP32[$$pre >> 2] | 0; //@line 9179
  if ($15 | 0) {
   HEAP32[$15 + 52 >> 2] = $10; //@line 9184
  }
  if ((HEAP32[$8 >> 2] | 0) == ($0 | 0)) {
   HEAP32[$8 >> 2] = $15; //@line 9189
  }
  ___ofl_unlock(); //@line 9191
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9193
 $21 = _fflush($0) | 0; //@line 9194
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 168; //@line 9197
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 9199
  HEAP8[$AsyncCtx3 + 8 >> 0] = $7 & 1; //@line 9202
  HEAP32[$AsyncCtx3 + 12 >> 2] = $25; //@line 9204
  sp = STACKTOP; //@line 9205
  return 0; //@line 9206
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9208
 $27 = HEAP32[$0 + 12 >> 2] | 0; //@line 9210
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 9211
 $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 9212
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 169; //@line 9215
  HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 9217
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 9219
  HEAP8[$AsyncCtx + 12 >> 0] = $7 & 1; //@line 9222
  HEAP32[$AsyncCtx + 16 >> 2] = $25; //@line 9224
  sp = STACKTOP; //@line 9225
  return 0; //@line 9226
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9228
 $33 = $28 | $21; //@line 9229
 $35 = HEAP32[$0 + 92 >> 2] | 0; //@line 9231
 if ($35 | 0) {
  _free($35); //@line 9234
 }
 if ($7) {
  if ($25 | 0) {
   ___unlockfile($0); //@line 9239
  }
 } else {
  _free($0); //@line 9242
 }
 return $33 | 0; //@line 9244
}
function __ZN6C128325_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $14 = 0, $15 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2955
 if (($1 | 0) == 10) {
  HEAP32[$0 + 60 >> 2] = 0; //@line 2959
  $4 = $0 + 64 | 0; //@line 2960
  $6 = $0 + 48 | 0; //@line 2962
  $11 = (HEAP32[$4 >> 2] | 0) + (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0; //@line 2967
  HEAP32[$4 >> 2] = $11; //@line 2968
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 2971
  $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2972
  $15 = FUNCTION_TABLE_ii[$14 & 31]($0) | 0; //@line 2973
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 119; //@line 2976
   HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 2978
   HEAP32[$AsyncCtx + 8 >> 2] = $11; //@line 2980
   HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2982
   HEAP32[$AsyncCtx + 16 >> 2] = $4; //@line 2984
   sp = STACKTOP; //@line 2985
   return 0; //@line 2986
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2988
  if ($11 >>> 0 < ($15 - (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
   return $1 | 0; //@line 2996
  }
  HEAP32[$4 >> 2] = 0; //@line 2998
  return $1 | 0; //@line 2999
 } else {
  $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 3003
  $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3005
  $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3007
  $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3008
  FUNCTION_TABLE_viiii[$28 & 7]($0, $30, $32, $1); //@line 3009
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 120; //@line 3012
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3014
   HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3016
   sp = STACKTOP; //@line 3017
   return 0; //@line 3018
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3020
  if (!(HEAP32[$0 + 4168 >> 2] | 0)) {
   return $1 | 0; //@line 3025
  }
  _emscripten_asm_const_iiiii(3, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 3034
  return $1 | 0; //@line 3035
 }
 return 0; //@line 3037
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $12 = 0, $15 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
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
 _mbed_tracef(16, 1895, 1900, $vararg_buffer); //@line 92
 $9 = HEAP32[$0 + 752 >> 2] | 0; //@line 94
 if (($9 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $9; //@line 97
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 99
  _mbed_tracef(16, 1895, 1941, $vararg_buffer4); //@line 100
  STACKTOP = sp; //@line 101
  return;
 }
 $12 = HEAP32[$0 + 756 >> 2] | 0; //@line 104
 if (($12 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $12; //@line 107
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 109
  _mbed_tracef(16, 1895, 1988, $vararg_buffer8); //@line 110
  STACKTOP = sp; //@line 111
  return;
 }
 $15 = HEAP32[$0 + 692 >> 2] | 0; //@line 114
 if (($15 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 118
  HEAP8[$0 + 782 >> 0] = $2; //@line 121
  HEAP8[$0 + 781 >> 0] = -35; //@line 123
  HEAP8[$0 + 780 >> 0] = -5; //@line 125
  HEAP8[$0 + 783 >> 0] = 1; //@line 127
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(0) | 0; //@line 130
  STACKTOP = sp; //@line 131
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $15; //@line 133
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 135
  _mbed_tracef(16, 1895, 2035, $vararg_buffer12); //@line 136
  STACKTOP = sp; //@line 137
  return;
 }
}
function _main() {
 var $4 = 0.0, $5 = 0.0, $AsyncCtx = 0, $AsyncCtx6 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, sp = 0;
 sp = STACKTOP; //@line 4637
 STACKTOP = STACKTOP + 16 | 0; //@line 4638
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4638
 $vararg_buffer1 = sp + 8 | 0; //@line 4639
 $vararg_buffer = sp; //@line 4640
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4641
 _puts(6175) | 0; //@line 4642
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 163; //@line 4645
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 4647
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 4649
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer1; //@line 4651
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer1; //@line 4653
  sp = STACKTOP; //@line 4654
  STACKTOP = sp; //@line 4655
  return 0; //@line 4655
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4657
 while (1) {
  __ZN6C128323clsEv(9516); //@line 4659
  $4 = +__ZN5Sht3115readTemperatureEv(14313); //@line 4660
  $5 = +__ZN5Sht3112readHumidityEv(14313); //@line 4661
  __ZN6C128326locateEii(9516, 3, 3); //@line 4662
  HEAPF64[$vararg_buffer >> 3] = $4; //@line 4664
  __ZN4mbed6Stream6printfEPKcz(9516, 6239, $vararg_buffer) | 0; //@line 4665
  __ZN6C128326locateEii(9516, 3, 13); //@line 4666
  HEAPF64[$vararg_buffer1 >> 3] = $5; //@line 4668
  __ZN4mbed6Stream6printfEPKcz(9516, 6259, $vararg_buffer1) | 0; //@line 4669
  _emscripten_asm_const_iii(1, HEAP32[3425] | 0, $4 > 25.0 | 0) | 0; //@line 4673
  $AsyncCtx6 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4674
  _wait(.5); //@line 4675
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4680
 }
 HEAP32[$AsyncCtx6 >> 2] = 164; //@line 4682
 HEAP32[$AsyncCtx6 + 4 >> 2] = $vararg_buffer; //@line 4684
 HEAP32[$AsyncCtx6 + 8 >> 2] = $vararg_buffer; //@line 4686
 HEAP32[$AsyncCtx6 + 12 >> 2] = $vararg_buffer1; //@line 4688
 HEAP32[$AsyncCtx6 + 16 >> 2] = $vararg_buffer1; //@line 4690
 sp = STACKTOP; //@line 4691
 STACKTOP = sp; //@line 4692
 return 0; //@line 4692
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 949
 HEAP32[$0 >> 2] = 392; //@line 950
 $1 = HEAP32[2331] | 0; //@line 951
 do {
  if (!$1) {
   HEAP32[2331] = 9328; //@line 955
  } else {
   if (($1 | 0) != 9328) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 959
    _mbed_assert_internal(2982, 3002, 93); //@line 960
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 50; //@line 963
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 965
     sp = STACKTOP; //@line 966
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 969
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2330] | 0; //@line 980
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2330] = HEAP32[$0 + 4 >> 2]; //@line 985
    break;
   } else {
    $$0 = $8; //@line 988
   }
   do {
    $12 = $$0 + 4 | 0; //@line 991
    $$0 = HEAP32[$12 >> 2] | 0; //@line 992
   } while (($$0 | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1002
  }
 } while (0);
 $17 = HEAP32[2331] | 0; //@line 1005
 do {
  if (!$17) {
   HEAP32[2331] = 9328; //@line 1009
  } else {
   if (($17 | 0) != 9328) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1013
    _mbed_assert_internal(2982, 3002, 93); //@line 1014
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 51; //@line 1017
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1019
     sp = STACKTOP; //@line 1020
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1023
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1036
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 1037
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 52; //@line 1040
  sp = STACKTOP; //@line 1041
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1044
 return;
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 9053
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 9059
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 9065
   } else {
    $7 = $1 & 255; //@line 9067
    $$03039 = $0; //@line 9068
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 9070
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 9075
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 9078
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 9083
      break;
     } else {
      $$03039 = $13; //@line 9086
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 9090
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 9091
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 9099
     $25 = $18; //@line 9099
     while (1) {
      $24 = $25 ^ $17; //@line 9101
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 9108
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 9111
      $25 = HEAP32[$31 >> 2] | 0; //@line 9112
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 9121
       break;
      } else {
       $$02936 = $31; //@line 9119
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 9126
    }
   } while (0);
   $38 = $1 & 255; //@line 9129
   $$1 = $$029$lcssa; //@line 9130
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 9132
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 9138
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 9141
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 9146
}
function __ZN4mbed8FileBaseD0Ev__async_cb_41($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $23 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5144
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5146
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2330] | 0; //@line 5152
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2330] = HEAP32[$2 + 4 >> 2]; //@line 5157
    break;
   } else {
    $$0$i = $6; //@line 5160
   }
   do {
    $10 = $$0$i + 4 | 0; //@line 5163
    $$0$i = HEAP32[$10 >> 2] | 0; //@line 5164
   } while (($$0$i | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 5174
  }
 } while (0);
 $15 = HEAP32[2331] | 0; //@line 5177
 if (!$15) {
  HEAP32[2331] = 9328; //@line 5180
 } else {
  if (($15 | 0) != 9328) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5184
   _mbed_assert_internal(2982, 3002, 93); //@line 5185
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 5188
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 5189
    HEAP32[$18 >> 2] = $2; //@line 5190
    sp = STACKTOP; //@line 5191
    return;
   }
   ___async_unwind = 0; //@line 5194
   HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 5195
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 5196
   HEAP32[$18 >> 2] = $2; //@line 5197
   sp = STACKTOP; //@line 5198
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 5206
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5210
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 5211
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 5214
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 5215
  HEAP32[$23 >> 2] = $2; //@line 5216
  sp = STACKTOP; //@line 5217
  return;
 }
 ___async_unwind = 0; //@line 5220
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 5221
 $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 5222
 HEAP32[$23 >> 2] = $2; //@line 5223
 sp = STACKTOP; //@line 5224
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 8575
 $4 = HEAP32[$3 >> 2] | 0; //@line 8576
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 8583
   label = 5; //@line 8584
  } else {
   $$1 = 0; //@line 8586
  }
 } else {
  $12 = $4; //@line 8590
  label = 5; //@line 8591
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 8595
   $10 = HEAP32[$9 >> 2] | 0; //@line 8596
   $14 = $10; //@line 8599
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 8604
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 8612
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 8616
       $$141 = $0; //@line 8616
       $$143 = $1; //@line 8616
       $31 = $14; //@line 8616
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 8619
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 8626
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 8631
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 8634
      break L5;
     }
     $$139 = $$038; //@line 8640
     $$141 = $0 + $$038 | 0; //@line 8640
     $$143 = $1 - $$038 | 0; //@line 8640
     $31 = HEAP32[$9 >> 2] | 0; //@line 8640
    } else {
     $$139 = 0; //@line 8642
     $$141 = $0; //@line 8642
     $$143 = $1; //@line 8642
     $31 = $14; //@line 8642
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 8645
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 8648
   $$1 = $$139 + $$143 | 0; //@line 8650
  }
 } while (0);
 return $$1 | 0; //@line 8653
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0.0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3904
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3906
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3908
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3910
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3912
 __ZN6C128323clsEv(9516); //@line 3913
 $9 = +__ZN5Sht3115readTemperatureEv(14313); //@line 3914
 $10 = +__ZN5Sht3112readHumidityEv(14313); //@line 3915
 __ZN6C128326locateEii(9516, 3, 3); //@line 3916
 HEAPF64[$2 >> 3] = $9; //@line 3918
 __ZN4mbed6Stream6printfEPKcz(9516, 6239, $2) | 0; //@line 3919
 __ZN6C128326locateEii(9516, 3, 13); //@line 3920
 HEAPF64[$6 >> 3] = $10; //@line 3922
 __ZN4mbed6Stream6printfEPKcz(9516, 6259, $6) | 0; //@line 3923
 _emscripten_asm_const_iii(1, HEAP32[3425] | 0, $9 > 25.0 | 0) | 0; //@line 3927
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 3928
 _wait(.5); //@line 3929
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 3932
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3933
  HEAP32[$16 >> 2] = $2; //@line 3934
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3935
  HEAP32[$17 >> 2] = $4; //@line 3936
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3937
  HEAP32[$18 >> 2] = $6; //@line 3938
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3939
  HEAP32[$19 >> 2] = $8; //@line 3940
  sp = STACKTOP; //@line 3941
  return;
 }
 ___async_unwind = 0; //@line 3944
 HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 3945
 $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3946
 HEAP32[$16 >> 2] = $2; //@line 3947
 $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3948
 HEAP32[$17 >> 2] = $4; //@line 3949
 $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3950
 HEAP32[$18 >> 2] = $6; //@line 3951
 $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3952
 HEAP32[$19 >> 2] = $8; //@line 3953
 sp = STACKTOP; //@line 3954
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0.0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3847
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3849
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3851
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3853
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3855
 __ZN6C128323clsEv(9516); //@line 3856
 $9 = +__ZN5Sht3115readTemperatureEv(14313); //@line 3857
 $10 = +__ZN5Sht3112readHumidityEv(14313); //@line 3858
 __ZN6C128326locateEii(9516, 3, 3); //@line 3859
 HEAPF64[$2 >> 3] = $9; //@line 3861
 __ZN4mbed6Stream6printfEPKcz(9516, 6239, $2) | 0; //@line 3862
 __ZN6C128326locateEii(9516, 3, 13); //@line 3863
 HEAPF64[$6 >> 3] = $10; //@line 3865
 __ZN4mbed6Stream6printfEPKcz(9516, 6259, $6) | 0; //@line 3866
 _emscripten_asm_const_iii(1, HEAP32[3425] | 0, $9 > 25.0 | 0) | 0; //@line 3870
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 3871
 _wait(.5); //@line 3872
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 3875
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3876
  HEAP32[$16 >> 2] = $2; //@line 3877
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3878
  HEAP32[$17 >> 2] = $4; //@line 3879
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3880
  HEAP32[$18 >> 2] = $6; //@line 3881
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3882
  HEAP32[$19 >> 2] = $8; //@line 3883
  sp = STACKTOP; //@line 3884
  return;
 }
 ___async_unwind = 0; //@line 3887
 HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 3888
 $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3889
 HEAP32[$16 >> 2] = $2; //@line 3890
 $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3891
 HEAP32[$17 >> 2] = $4; //@line 3892
 $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3893
 HEAP32[$18 >> 2] = $6; //@line 3894
 $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3895
 HEAP32[$19 >> 2] = $8; //@line 3896
 sp = STACKTOP; //@line 3897
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
 sp = STACKTOP; //@line 3907
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3910
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3911
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3912
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 3915
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3917
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3919
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3921
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3923
  sp = STACKTOP; //@line 3924
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3927
 $13 = Math_imul($4, $3) | 0; //@line 3928
 if (($13 | 0) <= 0) {
  return;
 }
 $$011 = 0; //@line 3933
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 3937
  $19 = HEAP32[$5 + ($$011 << 2) >> 2] | 0; //@line 3939
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3940
  FUNCTION_TABLE_vii[$17 & 7]($0, $19); //@line 3941
  if (___async) {
   label = 7; //@line 3944
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3947
  $25 = $$011 + 1 | 0; //@line 3948
  if (($25 | 0) == ($13 | 0)) {
   label = 5; //@line 3951
   break;
  } else {
   $$011 = $25; //@line 3954
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 141; //@line 3961
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$011; //@line 3963
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 3965
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 3967
  HEAP32[$AsyncCtx3 + 16 >> 2] = $5; //@line 3969
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 3971
  sp = STACKTOP; //@line 3972
  return;
 }
}
function __ZN11TextDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $13 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4531
 STACKTOP = STACKTOP + 16 | 0; //@line 4532
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4532
 $vararg_buffer = sp; //@line 4533
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4534
 __ZN4mbed6StreamC2EPKc($0, $1); //@line 4535
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 160; //@line 4538
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4540
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 4542
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 4544
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 4546
  sp = STACKTOP; //@line 4547
  STACKTOP = sp; //@line 4548
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4550
 HEAP32[$0 >> 2] = 968; //@line 4551
 HEAP32[$0 + 4 >> 2] = 1100; //@line 4553
 HEAP16[$0 + 26 >> 1] = 0; //@line 4555
 HEAP16[$0 + 24 >> 1] = 0; //@line 4557
 if (!$1) {
  HEAP32[$0 + 32 >> 2] = 0; //@line 4561
  STACKTOP = sp; //@line 4562
  return;
 }
 $12 = (_strlen($1) | 0) + 2 | 0; //@line 4565
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4566
 $13 = __Znaj($12) | 0; //@line 4567
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 161; //@line 4570
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4572
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 4574
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 4576
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 4578
  sp = STACKTOP; //@line 4579
  STACKTOP = sp; //@line 4580
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4582
 HEAP32[$0 + 32 >> 2] = $13; //@line 4584
 HEAP32[$vararg_buffer >> 2] = $1; //@line 4585
 _sprintf($13, 6013, $vararg_buffer) | 0; //@line 4586
 STACKTOP = sp; //@line 4587
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_98($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9513
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9517
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9519
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9521
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9523
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 9524
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 9531
 $16 = HEAP32[$8 + ($15 << 2) >> 2] | 0; //@line 9533
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9534
 FUNCTION_TABLE_vii[$13 & 7]($10, $16); //@line 9535
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 9538
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 9539
  HEAP32[$17 >> 2] = $15; //@line 9540
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 9541
  HEAP32[$18 >> 2] = $4; //@line 9542
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 9543
  HEAP32[$19 >> 2] = $6; //@line 9544
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 9545
  HEAP32[$20 >> 2] = $8; //@line 9546
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 9547
  HEAP32[$21 >> 2] = $10; //@line 9548
  sp = STACKTOP; //@line 9549
  return;
 }
 ___async_unwind = 0; //@line 9552
 HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 9553
 $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 9554
 HEAP32[$17 >> 2] = $15; //@line 9555
 $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 9556
 HEAP32[$18 >> 2] = $4; //@line 9557
 $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 9558
 HEAP32[$19 >> 2] = $6; //@line 9559
 $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 9560
 HEAP32[$20 >> 2] = $8; //@line 9561
 $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 9562
 HEAP32[$21 >> 2] = $10; //@line 9563
 sp = STACKTOP; //@line 9564
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
 sp = STACKTOP; //@line 3831
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 3834
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3835
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 3836
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 3839
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3841
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3843
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3845
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 3847
  sp = STACKTOP; //@line 3848
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3851
 $13 = Math_imul($4, $3) | 0; //@line 3852
 if (($13 | 0) <= 0) {
  return;
 }
 $$010 = 0; //@line 3857
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 3861
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3862
  FUNCTION_TABLE_vii[$17 & 7]($0, $5); //@line 3863
  if (___async) {
   label = 7; //@line 3866
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3869
  $23 = $$010 + 1 | 0; //@line 3870
  if (($23 | 0) == ($13 | 0)) {
   label = 5; //@line 3873
   break;
  } else {
   $$010 = $23; //@line 3876
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 139; //@line 3883
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$010; //@line 3885
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 3887
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 3889
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 3891
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 3893
  sp = STACKTOP; //@line 3894
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_63($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7107
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7111
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7113
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7115
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7117
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7119
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7121
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7123
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 7126
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 7127
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 7143
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 7144
    if (!___async) {
     ___async_unwind = 0; //@line 7147
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 209; //@line 7149
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 7151
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 7153
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 7155
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 7157
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 7159
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 7161
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 7163
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 7165
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 7168
    sp = STACKTOP; //@line 7169
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
 sp = STACKTOP; //@line 13152
 STACKTOP = STACKTOP + 48 | 0; //@line 13153
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 13153
 $vararg_buffer7 = sp + 24 | 0; //@line 13154
 $vararg_buffer3 = sp + 16 | 0; //@line 13155
 $vararg_buffer = sp; //@line 13156
 L1 : do {
  if (($0 | 0) == ($1 | 0)) {
   $$sink = -22; //@line 13160
  } else {
   $5 = ($2 & 524288 | 0) != 0; //@line 13163
   L3 : do {
    if ($5) {
     while (1) {
      HEAP32[$vararg_buffer >> 2] = $0; //@line 13167
      HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 13169
      HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 13171
      $6 = ___syscall330(330, $vararg_buffer | 0) | 0; //@line 13172
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
        $$sink = $6; //@line 13182
        break L1;
       }
      }
     }
    }
   } while (0);
   do {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 13190
    HEAP32[$vararg_buffer3 + 4 >> 2] = $1; //@line 13192
    $7 = ___syscall63(63, $vararg_buffer3 | 0) | 0; //@line 13193
   } while (($7 | 0) == -16);
   if ($5) {
    HEAP32[$vararg_buffer7 >> 2] = $1; //@line 13200
    HEAP32[$vararg_buffer7 + 4 >> 2] = 2; //@line 13202
    HEAP32[$vararg_buffer7 + 8 >> 2] = 1; //@line 13204
    ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 13205
    $$sink = $7; //@line 13206
   } else {
    $$sink = $7; //@line 13208
   }
  }
 } while (0);
 $9 = ___syscall_ret($$sink) | 0; //@line 13212
 STACKTOP = sp; //@line 13213
 return $9 | 0; //@line 13213
}
function __ZN4mbed8FileBaseD2Ev__async_cb_8($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2341
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2343
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2330] | 0; //@line 2349
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2330] = HEAP32[$2 + 4 >> 2]; //@line 2354
    break;
   } else {
    $$0 = $6; //@line 2357
   }
   do {
    $10 = $$0 + 4 | 0; //@line 2360
    $$0 = HEAP32[$10 >> 2] | 0; //@line 2361
   } while (($$0 | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 2371
  }
 } while (0);
 $15 = HEAP32[2331] | 0; //@line 2374
 if (!$15) {
  HEAP32[2331] = 9328; //@line 2377
 } else {
  if (($15 | 0) != 9328) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2381
   _mbed_assert_internal(2982, 3002, 93); //@line 2382
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 2385
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 2386
    HEAP32[$18 >> 2] = $2; //@line 2387
    sp = STACKTOP; //@line 2388
    return;
   }
   ___async_unwind = 0; //@line 2391
   HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 2392
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 2393
   HEAP32[$18 >> 2] = $2; //@line 2394
   sp = STACKTOP; //@line 2395
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2406
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 2407
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 2410
  sp = STACKTOP; //@line 2411
  return;
 }
 ___async_unwind = 0; //@line 2414
 HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 2415
 sp = STACKTOP; //@line 2416
 return;
}
function __ZN4mbed10FileHandle4sizeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $17 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1291
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1294
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1295
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 1296
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 60; //@line 1299
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1301
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1303
  sp = STACKTOP; //@line 1304
  return 0; //@line 1305
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1307
 if (($4 | 0) < 0) {
  $$0 = $4; //@line 1310
  return $$0 | 0; //@line 1311
 }
 $10 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1315
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1316
 $11 = FUNCTION_TABLE_iiii[$10 & 15]($0, 0, 2) | 0; //@line 1317
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 61; //@line 1320
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1322
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1324
  HEAP32[$AsyncCtx3 + 12 >> 2] = $4; //@line 1326
  sp = STACKTOP; //@line 1327
  return 0; //@line 1328
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1330
 $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1333
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1334
 FUNCTION_TABLE_iiii[$17 & 15]($0, $4, 0) | 0; //@line 1335
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 62; //@line 1338
  HEAP32[$AsyncCtx6 + 4 >> 2] = $11; //@line 1340
  sp = STACKTOP; //@line 1341
  return 0; //@line 1342
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 1344
 $$0 = $11; //@line 1345
 return $$0 | 0; //@line 1346
}
function __ZN11TextDisplay5_putcEi__async_cb_33($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $16 = 0, $17 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4630
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4634
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4636
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4638
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4640
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4642
 if ((HEAP32[___async_retval >> 2] | 0) > (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[___async_retval >> 2] = $4; //@line 4648
  return;
 }
 HEAP16[$6 >> 1] = 0; //@line 4651
 $16 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 4653
 HEAP16[$8 >> 1] = $16; //@line 4654
 $17 = $16 & 65535; //@line 4655
 $20 = HEAP32[(HEAP32[$10 >> 2] | 0) + 96 >> 2] | 0; //@line 4658
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 4659
 $21 = FUNCTION_TABLE_ii[$20 & 31]($12) | 0; //@line 4660
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 150; //@line 4663
  $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 4664
  HEAP32[$22 >> 2] = $17; //@line 4665
  $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 4666
  HEAP32[$23 >> 2] = $4; //@line 4667
  $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 4668
  HEAP32[$24 >> 2] = $8; //@line 4669
  sp = STACKTOP; //@line 4670
  return;
 }
 HEAP32[___async_retval >> 2] = $21; //@line 4674
 ___async_unwind = 0; //@line 4675
 HEAP32[$ReallocAsyncCtx4 >> 2] = 150; //@line 4676
 $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 4677
 HEAP32[$22 >> 2] = $17; //@line 4678
 $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 4679
 HEAP32[$23 >> 2] = $4; //@line 4680
 $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 4681
 HEAP32[$24 >> 2] = $8; //@line 4682
 sp = STACKTOP; //@line 4683
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb_70($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7858
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7860
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7862
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7864
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7866
 HEAP32[$2 >> 2] = 968; //@line 7867
 HEAP32[$2 + 4 >> 2] = 1100; //@line 7869
 HEAP16[$2 + 26 >> 1] = 0; //@line 7871
 HEAP16[$2 + 24 >> 1] = 0; //@line 7873
 if (!$4) {
  HEAP32[$2 + 32 >> 2] = 0; //@line 7877
  return;
 }
 $15 = (_strlen($4) | 0) + 2 | 0; //@line 7881
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 7882
 $16 = __Znaj($15) | 0; //@line 7883
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 7886
  $17 = $ReallocAsyncCtx + 4 | 0; //@line 7887
  HEAP32[$17 >> 2] = $2; //@line 7888
  $18 = $ReallocAsyncCtx + 8 | 0; //@line 7889
  HEAP32[$18 >> 2] = $6; //@line 7890
  $19 = $ReallocAsyncCtx + 12 | 0; //@line 7891
  HEAP32[$19 >> 2] = $4; //@line 7892
  $20 = $ReallocAsyncCtx + 16 | 0; //@line 7893
  HEAP32[$20 >> 2] = $8; //@line 7894
  sp = STACKTOP; //@line 7895
  return;
 }
 HEAP32[___async_retval >> 2] = $16; //@line 7899
 ___async_unwind = 0; //@line 7900
 HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 7901
 $17 = $ReallocAsyncCtx + 4 | 0; //@line 7902
 HEAP32[$17 >> 2] = $2; //@line 7903
 $18 = $ReallocAsyncCtx + 8 | 0; //@line 7904
 HEAP32[$18 >> 2] = $6; //@line 7905
 $19 = $ReallocAsyncCtx + 12 | 0; //@line 7906
 HEAP32[$19 >> 2] = $4; //@line 7907
 $20 = $ReallocAsyncCtx + 16 | 0; //@line 7908
 HEAP32[$20 >> 2] = $8; //@line 7909
 sp = STACKTOP; //@line 7910
 return;
}
function ___stdio_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$cast = 0, $11 = 0, $18 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8034
 STACKTOP = STACKTOP + 32 | 0; //@line 8035
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8035
 $vararg_buffer = sp; //@line 8036
 $3 = sp + 16 | 0; //@line 8037
 HEAP32[$3 >> 2] = $1; //@line 8038
 $4 = $3 + 4 | 0; //@line 8039
 $5 = $0 + 48 | 0; //@line 8040
 $6 = HEAP32[$5 >> 2] | 0; //@line 8041
 HEAP32[$4 >> 2] = $2 - (($6 | 0) != 0 & 1); //@line 8045
 $11 = $0 + 44 | 0; //@line 8047
 HEAP32[$3 + 8 >> 2] = HEAP32[$11 >> 2]; //@line 8049
 HEAP32[$3 + 12 >> 2] = $6; //@line 8051
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 8055
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 8057
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 8059
 $18 = ___syscall_ret(___syscall145(145, $vararg_buffer | 0) | 0) | 0; //@line 8061
 if (($18 | 0) < 1) {
  HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | $18 & 48 ^ 16; //@line 8068
  $$0 = $18; //@line 8069
 } else {
  $24 = HEAP32[$4 >> 2] | 0; //@line 8071
  if ($18 >>> 0 > $24 >>> 0) {
   $27 = HEAP32[$11 >> 2] | 0; //@line 8075
   $28 = $0 + 4 | 0; //@line 8076
   HEAP32[$28 >> 2] = $27; //@line 8077
   $$cast = $27; //@line 8078
   HEAP32[$0 + 8 >> 2] = $$cast + ($18 - $24); //@line 8081
   if (!(HEAP32[$5 >> 2] | 0)) {
    $$0 = $2; //@line 8085
   } else {
    HEAP32[$28 >> 2] = $$cast + 1; //@line 8088
    HEAP8[$1 + ($2 + -1) >> 0] = HEAP8[$$cast >> 0] | 0; //@line 8092
    $$0 = $2; //@line 8093
   }
  } else {
   $$0 = $18; //@line 8096
  }
 }
 STACKTOP = sp; //@line 8099
 return $$0 | 0; //@line 8099
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8461
 STACKTOP = STACKTOP + 16 | 0; //@line 8462
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8462
 $2 = sp; //@line 8463
 $3 = $1 & 255; //@line 8464
 HEAP8[$2 >> 0] = $3; //@line 8465
 $4 = $0 + 16 | 0; //@line 8466
 $5 = HEAP32[$4 >> 2] | 0; //@line 8467
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 8474
   label = 4; //@line 8475
  } else {
   $$0 = -1; //@line 8477
  }
 } else {
  $12 = $5; //@line 8480
  label = 4; //@line 8481
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 8485
   $10 = HEAP32[$9 >> 2] | 0; //@line 8486
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 8489
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 8496
     HEAP8[$10 >> 0] = $3; //@line 8497
     $$0 = $13; //@line 8498
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 8503
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8504
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 8505
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 167; //@line 8508
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 8510
    sp = STACKTOP; //@line 8511
    STACKTOP = sp; //@line 8512
    return 0; //@line 8512
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 8514
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 8519
   } else {
    $$0 = -1; //@line 8521
   }
  }
 } while (0);
 STACKTOP = sp; //@line 8525
 return $$0 | 0; //@line 8525
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
 sp = STACKTOP; //@line 2542
 STACKTOP = STACKTOP + 32 | 0; //@line 2543
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2543
 $5 = sp; //@line 2544
 if ((HEAP8[14312] | 0) == 1) {
  while (1) {}
 }
 HEAP8[14312] = 1; //@line 2553
 HEAP32[2341] = (HEAP32[2341] | 0) + 1; //@line 2556
 HEAP32[$5 >> 2] = ($0 | 0) > -1 ? -2130771711 : $0; //@line 2557
 HEAP32[$5 + 4 >> 2] = _llvm_returnaddress(0) | 0; //@line 2561
 HEAP32[$5 + 8 >> 2] = $2; //@line 2563
 HEAP32[2333] = HEAP32[$5 >> 2]; //@line 2564
 HEAP32[2334] = HEAP32[$5 + 4 >> 2]; //@line 2564
 HEAP32[2335] = HEAP32[$5 + 8 >> 2]; //@line 2564
 HEAP32[2336] = HEAP32[$5 + 12 >> 2]; //@line 2564
 HEAP32[2337] = HEAP32[$5 + 16 >> 2]; //@line 2564
 HEAP32[2338] = HEAP32[$5 + 20 >> 2]; //@line 2564
 HEAP32[2339] = HEAP32[$5 + 24 >> 2]; //@line 2564
 HEAP32[2340] = HEAP32[$5 + 28 >> 2]; //@line 2564
 _mbed_error_hist_put($5) | 0; //@line 2565
 HEAP8[14312] = 0; //@line 2566
 _print_error_report($1); //@line 2567
 if (!(_core_util_is_isr_active() | 0)) {
  if (_core_util_are_interrupts_enabled() | 0) {
   _emscripten_alloc_async_context(4, sp) | 0; //@line 2572
   _exit(1); //@line 2573
  }
 }
 while (1) {
  $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2578
  ___WFI(); //@line 2579
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2584
 }
 HEAP32[$AsyncCtx2 >> 2] = 106; //@line 2586
 sp = STACKTOP; //@line 2587
 STACKTOP = sp; //@line 2588
 return 0; //@line 2588
}
function _fflush__async_cb_45($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5339
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5341
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5343
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 5347
  } else {
   $$02327 = $$02325; //@line 5349
   $$02426 = $AsyncRetVal; //@line 5349
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 5356
    } else {
     $16 = 0; //@line 5358
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 5370
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5373
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 5376
     break L3;
    } else {
     $$02327 = $$023; //@line 5379
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5382
   $13 = ___fflush_unlocked($$02327) | 0; //@line 5383
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 5387
    ___async_unwind = 0; //@line 5388
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 173; //@line 5390
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 5392
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 5394
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 5396
   sp = STACKTOP; //@line 5397
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 5401
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 5403
 return;
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $19 = 0, $3 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3682
 $1 = HEAP32[$0 >> 2] | 0; //@line 3683
 $3 = HEAP32[$1 + 144 >> 2] | 0; //@line 3685
 $5 = HEAP32[$1 + 128 >> 2] | 0; //@line 3687
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3688
 $6 = FUNCTION_TABLE_ii[$5 & 31]($0) | 0; //@line 3689
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 134; //@line 3692
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3694
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 3696
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 3698
  sp = STACKTOP; //@line 3699
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3702
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3705
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3706
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 3707
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 135; //@line 3710
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 3712
  HEAP32[$AsyncCtx2 + 8 >> 2] = $6; //@line 3714
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 3716
  sp = STACKTOP; //@line 3717
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3720
 $19 = HEAPU16[$0 + 30 >> 1] | 0; //@line 3723
 $AsyncCtx5 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3724
 FUNCTION_TABLE_viiiiii[$3 & 7]($0, 0, 0, $6, $13, $19); //@line 3725
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 136; //@line 3728
  sp = STACKTOP; //@line 3729
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 3732
  return;
 }
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1158
 HEAP32[$0 >> 2] = 392; //@line 1159
 $3 = $0 + 4 | 0; //@line 1160
 HEAP32[$3 >> 2] = 0; //@line 1161
 HEAP32[$0 + 8 >> 2] = $1; //@line 1163
 HEAP32[$0 + 12 >> 2] = $2; //@line 1165
 $6 = HEAP32[2331] | 0; //@line 1166
 do {
  if (!$6) {
   HEAP32[2331] = 9328; //@line 1170
  } else {
   if (($6 | 0) != 9328) {
    $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1174
    _mbed_assert_internal(2982, 3002, 93); //@line 1175
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 56; //@line 1178
     HEAP32[$AsyncCtx3 + 4 >> 2] = $1; //@line 1180
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1182
     HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1184
     sp = STACKTOP; //@line 1185
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1188
     break;
    }
   }
  }
 } while (0);
 if (!$1) {
  HEAP32[$3 >> 2] = 0; //@line 1196
 } else {
  HEAP32[$3 >> 2] = HEAP32[2330]; //@line 1199
  HEAP32[2330] = $0; //@line 1200
 }
 $14 = HEAP32[2331] | 0; //@line 1202
 if (!$14) {
  HEAP32[2331] = 9328; //@line 1205
  return;
 }
 if (($14 | 0) == 9328) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1212
 _mbed_assert_internal(2982, 3002, 93); //@line 1213
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1216
  sp = STACKTOP; //@line 1217
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1220
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7044
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7048
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7050
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7052
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7054
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7056
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7058
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 7061
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 7062
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 7071
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 7072
    if (!___async) {
     ___async_unwind = 0; //@line 7075
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 210; //@line 7077
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 7079
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 7081
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 7083
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 7085
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 7087
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 7089
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 7091
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 7094
    sp = STACKTOP; //@line 7095
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5240
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 5250
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 5250
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 5250
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 5254
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 5257
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 5260
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 5268
  } else {
   $20 = 0; //@line 5270
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 5280
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 5284
  HEAP32[___async_retval >> 2] = $$1; //@line 5286
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5289
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 5290
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 5294
  ___async_unwind = 0; //@line 5295
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 173; //@line 5297
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 5299
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 5301
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 5303
 sp = STACKTOP; //@line 5304
 return;
}
function __ZN4mbed6StreamC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $6 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1690
 HEAP32[$0 >> 2] = 408; //@line 1691
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1693
 __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0 + 4 | 0, $1, 0); //@line 1694
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 73; //@line 1697
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1699
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1701
  sp = STACKTOP; //@line 1702
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1705
 HEAP32[$0 >> 2] = 488; //@line 1706
 HEAP32[$0 + 4 >> 2] = 588; //@line 1708
 $6 = $0 + 20 | 0; //@line 1709
 HEAP32[$6 >> 2] = 0; //@line 1710
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1711
 $7 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, 2413) | 0; //@line 1712
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 1715
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 1717
  sp = STACKTOP; //@line 1718
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1721
 HEAP32[$6 >> 2] = $7; //@line 1722
 if ($7 | 0) {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($7); //@line 1725
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1728
 _mbed_error(-2147417831, 2416, 0, 0, 0) | 0; //@line 1729
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 75; //@line 1732
  sp = STACKTOP; //@line 1733
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1736
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4769
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4771
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4773
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4775
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 4780
  } else {
   $9 = $4 + 4 | 0; //@line 4782
   $10 = HEAP32[$9 >> 2] | 0; //@line 4783
   $11 = $4 + 8 | 0; //@line 4784
   $12 = HEAP32[$11 >> 2] | 0; //@line 4785
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 4789
    HEAP32[$6 >> 2] = 0; //@line 4790
    HEAP32[$2 >> 2] = 0; //@line 4791
    HEAP32[$11 >> 2] = 0; //@line 4792
    HEAP32[$9 >> 2] = 0; //@line 4793
    $$0 = 0; //@line 4794
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 4801
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4802
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 4803
   if (!___async) {
    ___async_unwind = 0; //@line 4806
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 175; //@line 4808
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 4810
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 4812
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 4814
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 4816
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 4818
   sp = STACKTOP; //@line 4819
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 4824
 return;
}
function _fopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $11 = 0, $15 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 8807
 STACKTOP = STACKTOP + 48 | 0; //@line 8808
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 8808
 $vararg_buffer8 = sp + 32 | 0; //@line 8809
 $vararg_buffer3 = sp + 16 | 0; //@line 8810
 $vararg_buffer = sp; //@line 8811
 if (!(_strchr(6311, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8818
  $$0 = 0; //@line 8819
 } else {
  $7 = ___fmodeflags($1) | 0; //@line 8821
  HEAP32[$vararg_buffer >> 2] = $0; //@line 8824
  HEAP32[$vararg_buffer + 4 >> 2] = $7 | 32768; //@line 8826
  HEAP32[$vararg_buffer + 8 >> 2] = 438; //@line 8828
  $11 = ___syscall_ret(___syscall5(5, $vararg_buffer | 0) | 0) | 0; //@line 8830
  if (($11 | 0) < 0) {
   $$0 = 0; //@line 8833
  } else {
   if ($7 & 524288 | 0) {
    HEAP32[$vararg_buffer3 >> 2] = $11; //@line 8838
    HEAP32[$vararg_buffer3 + 4 >> 2] = 2; //@line 8840
    HEAP32[$vararg_buffer3 + 8 >> 2] = 1; //@line 8842
    ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8843
   }
   $15 = ___fdopen($11, $1) | 0; //@line 8845
   if (!$15) {
    HEAP32[$vararg_buffer8 >> 2] = $11; //@line 8848
    ___syscall6(6, $vararg_buffer8 | 0) | 0; //@line 8849
    $$0 = 0; //@line 8850
   } else {
    $$0 = $15; //@line 8852
   }
  }
 }
 STACKTOP = sp; //@line 8856
 return $$0 | 0; //@line 8856
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4888
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4890
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4892
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4894
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 4898
  return;
 }
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 4903
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4904
 $10 = FUNCTION_TABLE_iiii[$9 & 15]($4, 0, 2) | 0; //@line 4905
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 4908
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 4909
  HEAP32[$11 >> 2] = $2; //@line 4910
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 4911
  HEAP32[$12 >> 2] = $4; //@line 4912
  $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 4913
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 4914
  sp = STACKTOP; //@line 4915
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 4919
 ___async_unwind = 0; //@line 4920
 HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 4921
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 4922
 HEAP32[$11 >> 2] = $2; //@line 4923
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 4924
 HEAP32[$12 >> 2] = $4; //@line 4925
 $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 4926
 HEAP32[$13 >> 2] = $AsyncRetVal; //@line 4927
 sp = STACKTOP; //@line 4928
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 12159
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 12164
    $$0 = 1; //@line 12165
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 12178
     $$0 = 1; //@line 12179
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 12183
     $$0 = -1; //@line 12184
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 12194
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 12198
    $$0 = 2; //@line 12199
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 12211
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 12217
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 12221
    $$0 = 3; //@line 12222
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 12232
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 12238
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 12244
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 12248
    $$0 = 4; //@line 12249
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 12253
    $$0 = -1; //@line 12254
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12259
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_80($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8809
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8811
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8813
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8815
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8817
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 8822
  return;
 }
 dest = $2 + 4 | 0; //@line 8826
 stop = dest + 52 | 0; //@line 8826
 do {
  HEAP32[dest >> 2] = 0; //@line 8826
  dest = dest + 4 | 0; //@line 8826
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 8827
 HEAP32[$2 + 8 >> 2] = $4; //@line 8829
 HEAP32[$2 + 12 >> 2] = -1; //@line 8831
 HEAP32[$2 + 48 >> 2] = 1; //@line 8833
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 8836
 $16 = HEAP32[$6 >> 2] | 0; //@line 8837
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8838
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 8839
 if (!___async) {
  ___async_unwind = 0; //@line 8842
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 195; //@line 8844
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8846
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 8848
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 8850
 sp = STACKTOP; //@line 8851
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_64($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7180
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7184
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7186
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7188
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7190
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7192
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 7195
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 7196
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 7202
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 7203
   if (!___async) {
    ___async_unwind = 0; //@line 7206
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 208; //@line 7208
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 7210
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 7212
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 7214
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 7216
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 7218
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 7220
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 7223
   sp = STACKTOP; //@line 7224
   return;
  }
 }
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$$sroa_idx = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2861
 STACKTOP = STACKTOP + 16 | 0; //@line 2862
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2862
 $2 = sp; //@line 2863
 HEAP8[$2 >> 0] = 58; //@line 2864
 $$0$$sroa_idx = $2 + 1 | 0; //@line 2865
 HEAP8[$$0$$sroa_idx >> 0] = $0; //@line 2866
 HEAP8[$$0$$sroa_idx + 1 >> 0] = $0 >> 8; //@line 2866
 HEAP8[$$0$$sroa_idx + 2 >> 0] = $0 >> 16; //@line 2866
 HEAP8[$$0$$sroa_idx + 3 >> 0] = $0 >> 24; //@line 2866
 $3 = _fopen($2, $1) | 0; //@line 2867
 if (!$3) {
  STACKTOP = sp; //@line 2870
  return $3 | 0; //@line 2870
 }
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 28 >> 2] | 0; //@line 2874
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2875
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 2876
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 115; //@line 2879
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2881
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 2883
  sp = STACKTOP; //@line 2884
  STACKTOP = sp; //@line 2885
  return 0; //@line 2885
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2887
 if (!$8) {
  STACKTOP = sp; //@line 2890
  return $3 | 0; //@line 2890
 }
 _setbuf($3, 0); //@line 2892
 STACKTOP = sp; //@line 2893
 return $3 | 0; //@line 2893
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 11043
  $8 = $0; //@line 11043
  $9 = $1; //@line 11043
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 11045
   $$0914 = $$0914 + -1 | 0; //@line 11049
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 11050
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 11051
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 11059
   }
  }
  $$010$lcssa$off0 = $8; //@line 11064
  $$09$lcssa = $$0914; //@line 11064
 } else {
  $$010$lcssa$off0 = $0; //@line 11066
  $$09$lcssa = $2; //@line 11066
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 11070
 } else {
  $$012 = $$010$lcssa$off0; //@line 11072
  $$111 = $$09$lcssa; //@line 11072
  while (1) {
   $26 = $$111 + -1 | 0; //@line 11077
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 11078
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 11082
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 11085
    $$111 = $26; //@line 11085
   }
  }
 }
 return $$1$lcssa | 0; //@line 11089
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0) {
 $0 = $0 | 0;
 var $1 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2766
 $1 = HEAP32[2377] | 0; //@line 2767
 do {
  if (!$1) {
   HEAP32[2377] = 9512; //@line 2771
  } else {
   if (($1 | 0) != 9512) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2775
    _mbed_assert_internal(2982, 3002, 93); //@line 2776
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 112; //@line 2779
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2781
     sp = STACKTOP; //@line 2782
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2785
     break;
    }
   }
  }
 } while (0);
 if ((HEAP32[465] | 0) == ($0 | 0)) {
  HEAP32[465] = 0; //@line 2794
 }
 if ((HEAP32[466] | 0) == ($0 | 0)) {
  HEAP32[466] = 0; //@line 2799
 }
 if ((HEAP32[467] | 0) == ($0 | 0)) {
  HEAP32[467] = 0; //@line 2804
 }
 $8 = HEAP32[2377] | 0; //@line 2806
 if (!$8) {
  HEAP32[2377] = 9512; //@line 2809
  return;
 }
 if (($8 | 0) == 9512) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2816
 _mbed_assert_internal(2982, 3002, 93); //@line 2817
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 113; //@line 2820
  sp = STACKTOP; //@line 2821
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2824
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $12 = 0, $13 = 0, $3 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4279
 $3 = HEAP32[$0 + 32 >> 2] | 0; //@line 4281
 if (!$3) {
  _fwrite(5870, 85, 1, HEAP32[277] | 0) | 0; //@line 4285
  $$0 = 0; //@line 4286
  return $$0 | 0; //@line 4287
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4289
 $6 = _freopen($3, 5956, $1) | 0; //@line 4290
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 151; //@line 4293
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4295
  sp = STACKTOP; //@line 4296
  return 0; //@line 4297
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4299
 if (!$6) {
  $$0 = 0; //@line 4302
  return $$0 | 0; //@line 4303
 }
 $9 = HEAP32[309] | 0; //@line 4305
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4308
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4309
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 4310
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 152; //@line 4313
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 4315
  sp = STACKTOP; //@line 4316
  return 0; //@line 4317
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4319
 _setvbuf($9, 0, 1, $13) | 0; //@line 4320
 $$0 = 1; //@line 4321
 return $$0 | 0; //@line 4322
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4977
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4979
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4983
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4985
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4987
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4989
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 4993
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 4996
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 4997
   if (!___async) {
    ___async_unwind = 0; //@line 5000
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 212; //@line 5002
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 5004
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 5006
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 5008
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 5010
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 5012
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 5014
   sp = STACKTOP; //@line 5015
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 8189
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 8194
   label = 4; //@line 8195
  } else {
   $$01519 = $0; //@line 8197
   $23 = $1; //@line 8197
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 8202
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 8205
    $23 = $6; //@line 8206
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 8210
     label = 4; //@line 8211
     break;
    } else {
     $$01519 = $6; //@line 8214
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 8220
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 8222
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 8230
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 8238
  } else {
   $$pn = $$0; //@line 8240
   while (1) {
    $19 = $$pn + 1 | 0; //@line 8242
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 8246
     break;
    } else {
     $$pn = $19; //@line 8249
    }
   }
  }
  $$sink = $$1$lcssa; //@line 8254
 }
 return $$sink - $1 | 0; //@line 8257
}
function __ZN15GraphicsDisplay4putpEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $15 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3771
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 3774
 $5 = $0 + 36 | 0; //@line 3775
 $7 = HEAP16[$5 >> 1] | 0; //@line 3777
 $8 = $0 + 38 | 0; //@line 3778
 $10 = HEAP16[$8 >> 1] | 0; //@line 3780
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3781
 FUNCTION_TABLE_viiii[$4 & 7]($0, $7, $10, $1); //@line 3782
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 3785
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 3787
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 3789
  HEAP32[$AsyncCtx + 12 >> 2] = $8; //@line 3791
  sp = STACKTOP; //@line 3792
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3795
 $15 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 3797
 HEAP16[$5 >> 1] = $15; //@line 3798
 if ($15 << 16 >> 16 <= (HEAP16[$0 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$5 >> 1] = HEAP16[$0 + 40 >> 1] | 0; //@line 3807
 $22 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 3809
 HEAP16[$8 >> 1] = $22; //@line 3810
 if ($22 << 16 >> 16 <= (HEAP16[$0 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$8 >> 1] = HEAP16[$0 + 44 >> 1] | 0; //@line 3819
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
function _mbed_vtracef__async_cb_53($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 6315
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6317
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6319
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6321
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 6326
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6328
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 6333
 $16 = _snprintf($4, $6, 2116, $2) | 0; //@line 6334
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 6336
 $19 = $4 + $$18 | 0; //@line 6338
 $20 = $6 - $$18 | 0; //@line 6339
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 2194, $12) | 0; //@line 6347
  }
 }
 $23 = HEAP32[91] | 0; //@line 6350
 $24 = HEAP32[84] | 0; //@line 6351
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 6352
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 6353
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6356
  sp = STACKTOP; //@line 6357
  return;
 }
 ___async_unwind = 0; //@line 6360
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6361
 sp = STACKTOP; //@line 6362
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_40($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5025
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5031
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5033
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5035
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5037
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 5042
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 5044
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 5045
 if (!___async) {
  ___async_unwind = 0; //@line 5048
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 212; //@line 5050
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 5052
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 5054
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 5056
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 5058
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 5060
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 5062
 sp = STACKTOP; //@line 5063
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
function __ZN11TextDisplay5_putcEi__async_cb_32($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4586
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4588
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4590
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4592
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4594
 $10 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 4596
 HEAP16[$2 >> 1] = $10; //@line 4597
 $14 = HEAP32[(HEAP32[$4 >> 2] | 0) + 100 >> 2] | 0; //@line 4601
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(28) | 0; //@line 4602
 $15 = FUNCTION_TABLE_ii[$14 & 31]($4) | 0; //@line 4603
 if (!___async) {
  HEAP32[___async_retval >> 2] = $15; //@line 4607
  ___async_unwind = 0; //@line 4608
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 149; //@line 4610
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $10 & 65535; //@line 4612
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 4614
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 4616
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 4618
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 4620
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $4; //@line 4622
 sp = STACKTOP; //@line 4623
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7959
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7961
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7963
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7965
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 7967
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 7969
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 8877; //@line 7974
  HEAP32[$4 + 4 >> 2] = $6; //@line 7976
  _abort_message(8786, $4); //@line 7977
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 7980
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 7983
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 7984
 $16 = FUNCTION_TABLE_ii[$15 & 31]($12) | 0; //@line 7985
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 7989
  ___async_unwind = 0; //@line 7990
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 191; //@line 7992
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 7994
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 7996
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 7998
 sp = STACKTOP; //@line 7999
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 12279
 while (1) {
  if ((HEAPU8[6849 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 12286
   break;
  }
  $7 = $$016 + 1 | 0; //@line 12289
  if (($7 | 0) == 87) {
   $$01214 = 6937; //@line 12292
   $$115 = 87; //@line 12292
   label = 5; //@line 12293
   break;
  } else {
   $$016 = $7; //@line 12296
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 6937; //@line 12302
  } else {
   $$01214 = 6937; //@line 12304
   $$115 = $$016; //@line 12304
   label = 5; //@line 12305
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 12310
   $$113 = $$01214; //@line 12311
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 12315
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 12322
   if (!$$115) {
    $$012$lcssa = $$113; //@line 12325
    break;
   } else {
    $$01214 = $$113; //@line 12328
    label = 5; //@line 12329
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 12336
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4271
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4273
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4275
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4279
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 4283
  label = 4; //@line 4284
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 4289
   label = 4; //@line 4290
  } else {
   $$037$off039 = 3; //@line 4292
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 4296
  $17 = $8 + 40 | 0; //@line 4297
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 4300
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 4310
    $$037$off039 = $$037$off038; //@line 4311
   } else {
    $$037$off039 = $$037$off038; //@line 4313
   }
  } else {
   $$037$off039 = $$037$off038; //@line 4316
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 4319
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
 $2 = HEAP8[$1 >> 0] | 0; //@line 12352
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 12356
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 12359
   if (!$5) {
    $$0 = 0; //@line 12362
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 12368
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 12374
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 12381
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 12388
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 12395
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 12402
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 12409
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 12413
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 12423
}
function __ZN4mbed6Stream4putcEi__async_cb_16($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2740
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2742
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2744
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2746
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 2749
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 2750
 $10 = FUNCTION_TABLE_iii[$9 & 7]($2, $4) | 0; //@line 2751
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 2754
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2755
  HEAP32[$11 >> 2] = $6; //@line 2756
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 2757
  HEAP32[$12 >> 2] = $2; //@line 2758
  sp = STACKTOP; //@line 2759
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 2763
 ___async_unwind = 0; //@line 2764
 HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 2765
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2766
 HEAP32[$11 >> 2] = $6; //@line 2767
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 2768
 HEAP32[$12 >> 2] = $2; //@line 2769
 sp = STACKTOP; //@line 2770
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 12548
 $32 = $0 + 3 | 0; //@line 12562
 $33 = HEAP8[$32 >> 0] | 0; //@line 12563
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 12565
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 12570
  $$sink21$lcssa = $32; //@line 12570
 } else {
  $$sink2123 = $32; //@line 12572
  $39 = $35; //@line 12572
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 12575
   $41 = HEAP8[$40 >> 0] | 0; //@line 12576
   $39 = $39 << 8 | $41 & 255; //@line 12578
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 12583
    $$sink21$lcssa = $40; //@line 12583
    break;
   } else {
    $$sink2123 = $40; //@line 12586
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 12593
}
function __ZN11TextDisplay3clsEv__async_cb_4($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2127
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2129
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2131
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2133
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2135
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2137
 $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 2140
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 2141
 $13 = FUNCTION_TABLE_ii[$12 & 31]($4) | 0; //@line 2142
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 2146
  ___async_unwind = 0; //@line 2147
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 158; //@line 2149
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $AsyncRetVal; //@line 2151
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 2153
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 2155
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 2157
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $4; //@line 2159
 sp = STACKTOP; //@line 2160
 return;
}
function _mbed_vtracef__async_cb_59($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6700
 $3 = HEAP32[92] | 0; //@line 6704
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[84] | 0; //@line 6708
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 6709
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 6710
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 6713
   sp = STACKTOP; //@line 6714
   return;
  }
  ___async_unwind = 0; //@line 6717
  HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 6718
  sp = STACKTOP; //@line 6719
  return;
 } else {
  $6 = HEAP32[91] | 0; //@line 6722
  $7 = HEAP32[84] | 0; //@line 6723
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 6724
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 6725
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 42; //@line 6728
   sp = STACKTOP; //@line 6729
   return;
  }
  ___async_unwind = 0; //@line 6732
  HEAP32[$ReallocAsyncCtx4 >> 2] = 42; //@line 6733
  sp = STACKTOP; //@line 6734
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2701
 $2 = $0 + 12 | 0; //@line 2703
 $3 = HEAP32[$2 >> 2] | 0; //@line 2704
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2708
   _mbed_assert_internal(2893, 2898, 528); //@line 2709
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 110; //@line 2712
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2714
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2716
    sp = STACKTOP; //@line 2717
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2720
    $8 = HEAP32[$2 >> 2] | 0; //@line 2722
    break;
   }
  } else {
   $8 = $3; //@line 2726
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2729
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2731
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 2732
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 2735
  sp = STACKTOP; //@line 2736
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2739
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3961
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3963
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3967
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3969
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3971
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3973
 HEAP32[$2 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 3974
 _memset($6 | 0, 0, 4096) | 0; //@line 3975
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 3976
 $13 = _vsprintf($6, $8, $2) | 0; //@line 3977
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 3981
  ___async_unwind = 0; //@line 3982
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 81; //@line 3984
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 3986
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 3988
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3990
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 3992
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $6; //@line 3994
 sp = STACKTOP; //@line 3995
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2535
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2539
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2541
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2543
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2545
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2546
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 2553
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2554
 FUNCTION_TABLE_vii[$13 & 7]($8, $10); //@line 2555
 if (!___async) {
  ___async_unwind = 0; //@line 2558
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 139; //@line 2560
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2562
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2564
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2566
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2568
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2570
 sp = STACKTOP; //@line 2571
 return;
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 12482
 $23 = $0 + 2 | 0; //@line 12491
 $24 = HEAP8[$23 >> 0] | 0; //@line 12492
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 12495
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 12500
  $$lcssa = $24; //@line 12500
 } else {
  $$01618 = $23; //@line 12502
  $$019 = $27; //@line 12502
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 12504
   $31 = HEAP8[$30 >> 0] | 0; //@line 12505
   $$019 = ($$019 | $31 & 255) << 8; //@line 12508
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 12513
    $$lcssa = $31; //@line 12513
    break;
   } else {
    $$01618 = $30; //@line 12516
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 12523
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 12110
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 12110
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 12111
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 12112
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 12121
    $$016 = $9; //@line 12124
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 12124
   } else {
    $$016 = $0; //@line 12126
    $storemerge = 0; //@line 12126
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 12128
   $$0 = $$016; //@line 12129
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 12133
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 12139
   HEAP32[tempDoublePtr >> 2] = $2; //@line 12142
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 12142
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 12143
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
 sp = STACKTOP; //@line 9471
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9477
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9479
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 9480
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 9487
 $14 = HEAP32[$8 >> 2] | 0; //@line 9488
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9489
 FUNCTION_TABLE_vii[$13 & 7]($6, $14); //@line 9490
 if (!___async) {
  ___async_unwind = 0; //@line 9493
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 9495
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 9497
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 9499
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 9501
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 9503
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 9505
 sp = STACKTOP; //@line 9506
 return;
}
function __ZN15GraphicsDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4098
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4099
 __ZN11TextDisplayC2EPKc($0, $1); //@line 4100
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 145; //@line 4103
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4105
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4107
  sp = STACKTOP; //@line 4108
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4111
 HEAP32[$0 >> 2] = 788; //@line 4112
 HEAP32[$0 + 4 >> 2] = 952; //@line 4114
 __ZN11TextDisplay10foregroundEt($0, -1); //@line 4115
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 4118
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4119
 FUNCTION_TABLE_vii[$7 & 7]($0, 0); //@line 4120
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 146; //@line 4123
  sp = STACKTOP; //@line 4124
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4127
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
 sp = STACKTOP; //@line 2028
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2030
 $5 = HEAP32[(HEAP32[$2 >> 2] | 0) + 100 >> 2] | 0; //@line 2033
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 2034
 $6 = FUNCTION_TABLE_ii[$5 & 31]($2) | 0; //@line 2035
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 154; //@line 2038
  $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 2039
  HEAP32[$7 >> 2] = $2; //@line 2040
  $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 2041
  HEAP32[$8 >> 2] = $2; //@line 2042
  sp = STACKTOP; //@line 2043
  return;
 }
 HEAP32[___async_retval >> 2] = $6; //@line 2047
 ___async_unwind = 0; //@line 2048
 HEAP32[$ReallocAsyncCtx2 >> 2] = 154; //@line 2049
 $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 2050
 HEAP32[$7 >> 2] = $2; //@line 2051
 $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 2052
 HEAP32[$8 >> 2] = $2; //@line 2053
 sp = STACKTOP; //@line 2054
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6983
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6991
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6993
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6995
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6997
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6999
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7001
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7003
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 7014
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 7015
 HEAP32[$10 >> 2] = 0; //@line 7016
 HEAP32[$12 >> 2] = 0; //@line 7017
 HEAP32[$14 >> 2] = 0; //@line 7018
 HEAP32[$2 >> 2] = 0; //@line 7019
 $33 = HEAP32[$16 >> 2] | 0; //@line 7020
 HEAP32[$16 >> 2] = $33 | $18; //@line 7025
 if ($20 | 0) {
  ___unlockfile($22); //@line 7028
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 7031
 return;
}
function _mbed_vtracef__async_cb_56($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 6431
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6435
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 6440
 $$pre = HEAP32[94] | 0; //@line 6441
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 6442
 FUNCTION_TABLE_v[$$pre & 3](); //@line 6443
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 6446
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 6447
  HEAP32[$6 >> 2] = $4; //@line 6448
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 6449
  HEAP32[$7 >> 2] = $5; //@line 6450
  sp = STACKTOP; //@line 6451
  return;
 }
 ___async_unwind = 0; //@line 6454
 HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 6455
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 6456
 HEAP32[$6 >> 2] = $4; //@line 6457
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 6458
 HEAP32[$7 >> 2] = $5; //@line 6459
 sp = STACKTOP; //@line 6460
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2618
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2620
 if (!(HEAP32[___async_retval >> 2] | 0)) {
  HEAP8[___async_retval >> 0] = 0; //@line 2627
  return;
 }
 $5 = HEAP32[309] | 0; //@line 2630
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 100 >> 2] | 0; //@line 2633
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2634
 $9 = FUNCTION_TABLE_ii[$8 & 31]($2) | 0; //@line 2635
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 152; //@line 2638
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 2639
  HEAP32[$10 >> 2] = $5; //@line 2640
  sp = STACKTOP; //@line 2641
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 2645
 ___async_unwind = 0; //@line 2646
 HEAP32[$ReallocAsyncCtx >> 2] = 152; //@line 2647
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 2648
 HEAP32[$10 >> 2] = $5; //@line 2649
 sp = STACKTOP; //@line 2650
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
function _mbed_vtracef__async_cb_55($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 6398
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6400
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 6405
 $$pre = HEAP32[94] | 0; //@line 6406
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 6407
 FUNCTION_TABLE_v[$$pre & 3](); //@line 6408
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 6411
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 6412
  HEAP32[$5 >> 2] = $2; //@line 6413
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 6414
  HEAP32[$6 >> 2] = $4; //@line 6415
  sp = STACKTOP; //@line 6416
  return;
 }
 ___async_unwind = 0; //@line 6419
 HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 6420
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 6421
 HEAP32[$5 >> 2] = $2; //@line 6422
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 6423
 HEAP32[$6 >> 2] = $4; //@line 6424
 sp = STACKTOP; //@line 6425
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2494
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2500
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2502
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2503
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 2510
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2511
 FUNCTION_TABLE_vii[$13 & 7]($6, $8); //@line 2512
 if (!___async) {
  ___async_unwind = 0; //@line 2515
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 139; //@line 2517
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 2519
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 2521
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2523
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $6; //@line 2525
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $8; //@line 2527
 sp = STACKTOP; //@line 2528
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_6($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2207
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2211
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2213
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2215
 $9 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2216
 $12 = HEAP32[(HEAP32[$4 >> 2] | 0) + 100 >> 2] | 0; //@line 2219
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 2220
 $13 = FUNCTION_TABLE_ii[$12 & 31]($6) | 0; //@line 2221
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 2225
  ___async_unwind = 0; //@line 2226
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 157; //@line 2228
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $4; //@line 2230
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 2232
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $9; //@line 2234
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 2236
 sp = STACKTOP; //@line 2237
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4934
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4938
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4940
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4942
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 16 >> 2] | 0; //@line 4945
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4946
 FUNCTION_TABLE_iiii[$10 & 15]($4, $6, 0) | 0; //@line 4947
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 62; //@line 4950
  $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 4951
  HEAP32[$11 >> 2] = $AsyncRetVal; //@line 4952
  sp = STACKTOP; //@line 4953
  return;
 }
 ___async_unwind = 0; //@line 4956
 HEAP32[$ReallocAsyncCtx3 >> 2] = 62; //@line 4957
 $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 4958
 HEAP32[$11 >> 2] = $AsyncRetVal; //@line 4959
 sp = STACKTOP; //@line 4960
 return;
}
function _fclose__async_cb_7($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2278
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2280
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 2283
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2285
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2287
 $9 = HEAP32[$2 + 12 >> 2] | 0; //@line 2289
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 2290
 $10 = FUNCTION_TABLE_ii[$9 & 31]($2) | 0; //@line 2291
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 2295
  ___async_unwind = 0; //@line 2296
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 169; //@line 2298
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $AsyncRetVal; //@line 2300
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 2302
 HEAP8[$ReallocAsyncCtx + 12 >> 0] = $4 & 1; //@line 2305
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 2307
 sp = STACKTOP; //@line 2308
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
function __ZN4mbed6StreamC2EPKc__async_cb_10($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2455
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2459
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 488; //@line 2460
 HEAP32[$4 + 4 >> 2] = 588; //@line 2462
 $6 = $4 + 20 | 0; //@line 2463
 HEAP32[$6 >> 2] = 0; //@line 2464
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2465
 $7 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($4, 2413) | 0; //@line 2466
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 2469
  $8 = $ReallocAsyncCtx + 4 | 0; //@line 2470
  HEAP32[$8 >> 2] = $6; //@line 2471
  sp = STACKTOP; //@line 2472
  return;
 }
 HEAP32[___async_retval >> 2] = $7; //@line 2476
 ___async_unwind = 0; //@line 2477
 HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 2478
 $8 = $ReallocAsyncCtx + 4 | 0; //@line 2479
 HEAP32[$8 >> 2] = $6; //@line 2480
 sp = STACKTOP; //@line 2481
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
function __ZThn4_N4mbed6StreamD1Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1649
 $1 = $0 + -4 | 0; //@line 1650
 HEAP32[$1 >> 2] = 488; //@line 1651
 $2 = $1 + 4 | 0; //@line 1652
 HEAP32[$2 >> 2] = 588; //@line 1653
 $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 1655
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1656
 _fclose($4) | 0; //@line 1657
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 71; //@line 1660
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1662
  sp = STACKTOP; //@line 1663
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1666
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1667
 __ZN4mbed8FileBaseD2Ev($2); //@line 1668
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 72; //@line 1671
  sp = STACKTOP; //@line 1672
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1675
  return;
 }
}
function __ZN11TextDisplay3clsEv__async_cb_5($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2167
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2171
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2173
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2175
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2177
 if (($4 | 0) >= (Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0)) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 2185
 __ZN4mbed6Stream4putcEi($6, 32) | 0; //@line 2186
 if (!___async) {
  ___async_unwind = 0; //@line 2189
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 156; //@line 2191
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 2193
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $8; //@line 2195
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $10; //@line 2197
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $6; //@line 2199
 sp = STACKTOP; //@line 2200
 return;
}
function ___dynamic_cast__async_cb_73($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8095
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8097
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8099
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8105
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 8120
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 8136
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 8141
    break;
   }
  default:
   {
    $$0 = 0; //@line 8145
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 8150
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
function _mbed_error_vfprintf__async_cb_69($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7779
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 7781
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7783
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7785
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7787
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7789
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 7791
 _serial_putc(9500, $2 << 24 >> 24); //@line 7792
 if (!___async) {
  ___async_unwind = 0; //@line 7795
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 7797
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 7799
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 7801
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 7803
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 7805
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 7807
 sp = STACKTOP; //@line 7808
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_77($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8545
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8547
 if ((HEAP32[465] | 0) == ($2 | 0)) {
  HEAP32[465] = 0; //@line 8551
 }
 if ((HEAP32[466] | 0) == ($2 | 0)) {
  HEAP32[466] = 0; //@line 8556
 }
 if ((HEAP32[467] | 0) == ($2 | 0)) {
  HEAP32[467] = 0; //@line 8561
 }
 $6 = HEAP32[2377] | 0; //@line 8563
 if (!$6) {
  HEAP32[2377] = 9512; //@line 8566
  return;
 }
 if (($6 | 0) == 9512) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8573
 _mbed_assert_internal(2982, 3002, 93); //@line 8574
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 8577
  sp = STACKTOP; //@line 8578
  return;
 }
 ___async_unwind = 0; //@line 8581
 HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 8582
 sp = STACKTOP; //@line 8583
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
 sp = STACKTOP; //@line 5477
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5481
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5483
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5485
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 132 >> 2] | 0; //@line 5488
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 5489
 $11 = FUNCTION_TABLE_ii[$10 & 31]($4) | 0; //@line 5490
 if (!___async) {
  HEAP32[___async_retval >> 2] = $11; //@line 5494
  ___async_unwind = 0; //@line 5495
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 135; //@line 5497
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 5499
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 5501
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5503
 sp = STACKTOP; //@line 5504
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
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_35($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4715
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4719
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4721
 if (!(HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[$4 >> 2] = 0; //@line 4724
 } else {
  HEAP32[$4 >> 2] = HEAP32[2330]; //@line 4727
  HEAP32[2330] = $6; //@line 4728
 }
 $9 = HEAP32[2331] | 0; //@line 4730
 if (!$9) {
  HEAP32[2331] = 9328; //@line 4733
  return;
 }
 if (($9 | 0) == 9328) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4740
 _mbed_assert_internal(2982, 3002, 93); //@line 4741
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 57; //@line 4744
  sp = STACKTOP; //@line 4745
  return;
 }
 ___async_unwind = 0; //@line 4748
 HEAP32[$ReallocAsyncCtx >> 2] = 57; //@line 4749
 sp = STACKTOP; //@line 4750
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 11108
 STACKTOP = STACKTOP + 256 | 0; //@line 11109
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 11109
 $5 = sp; //@line 11110
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 11116
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 11120
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 11123
   $$011 = $9; //@line 11124
   do {
    _out_670($0, $5, 256); //@line 11126
    $$011 = $$011 + -256 | 0; //@line 11127
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 11136
  } else {
   $$0$lcssa = $9; //@line 11138
  }
  _out_670($0, $5, $$0$lcssa); //@line 11140
 }
 STACKTOP = sp; //@line 11142
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_14($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2700
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2704
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2706
 $8 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 2709
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 2710
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 2711
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 79; //@line 2714
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 2715
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 2716
  sp = STACKTOP; //@line 2717
  return;
 }
 ___async_unwind = 0; //@line 2720
 HEAP32[$ReallocAsyncCtx3 >> 2] = 79; //@line 2721
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 2722
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 2723
 sp = STACKTOP; //@line 2724
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2060
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2062
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2064
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2066
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 2069
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 2070
 $9 = FUNCTION_TABLE_ii[$8 & 31]($4) | 0; //@line 2071
 if (!___async) {
  HEAP32[___async_retval >> 2] = $9; //@line 2075
  ___async_unwind = 0; //@line 2076
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 155; //@line 2078
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $AsyncRetVal; //@line 2080
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 2082
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 2084
 sp = STACKTOP; //@line 2085
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4001
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4005
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4007
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4009
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4011
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 4014
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 4015
 FUNCTION_TABLE_vi[$13 & 255]($4); //@line 4016
 if (!___async) {
  ___async_unwind = 0; //@line 4019
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4021
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 4023
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $8; //@line 4025
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $10; //@line 4027
 sp = STACKTOP; //@line 4028
 return;
}
function __ZN4mbed6StreamD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1351
 HEAP32[$0 >> 2] = 488; //@line 1352
 HEAP32[$0 + 4 >> 2] = 588; //@line 1354
 $3 = HEAP32[$0 + 20 >> 2] | 0; //@line 1356
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1357
 _fclose($3) | 0; //@line 1358
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 63; //@line 1361
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1363
  sp = STACKTOP; //@line 1364
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1367
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1369
 __ZN4mbed8FileBaseD2Ev($0 + 4 | 0); //@line 1370
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 64; //@line 1373
  sp = STACKTOP; //@line 1374
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1377
  return;
 }
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7973
 STACKTOP = STACKTOP + 32 | 0; //@line 7974
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7974
 $vararg_buffer = sp; //@line 7975
 $3 = sp + 20 | 0; //@line 7976
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7980
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7982
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7984
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7986
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7988
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7993
  $10 = -1; //@line 7994
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7997
 }
 STACKTOP = sp; //@line 7999
 return $10 | 0; //@line 7999
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1967
 STACKTOP = STACKTOP + 16 | 0; //@line 1968
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1968
 $vararg_buffer = sp; //@line 1969
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1970
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1972
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1974
 _mbed_error_printf(2435, $vararg_buffer); //@line 1975
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1976
 _mbed_die(); //@line 1977
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 85; //@line 1980
  sp = STACKTOP; //@line 1981
  STACKTOP = sp; //@line 1982
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1984
  STACKTOP = sp; //@line 1985
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12987
 STACKTOP = STACKTOP + 16 | 0; //@line 12988
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12988
 $3 = sp; //@line 12989
 HEAP32[$3 >> 2] = $varargs; //@line 12990
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12991
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 12992
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 177; //@line 12995
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12997
  sp = STACKTOP; //@line 12998
  STACKTOP = sp; //@line 12999
  return 0; //@line 12999
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13001
  STACKTOP = sp; //@line 13002
  return $4 | 0; //@line 13002
 }
 return 0; //@line 13004
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13109
 STACKTOP = STACKTOP + 16 | 0; //@line 13110
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13110
 $2 = sp; //@line 13111
 HEAP32[$2 >> 2] = $varargs; //@line 13112
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 13113
 $3 = _vsprintf($0, $1, $2) | 0; //@line 13114
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 179; //@line 13117
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 13119
  sp = STACKTOP; //@line 13120
  STACKTOP = sp; //@line 13121
  return 0; //@line 13121
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13123
  STACKTOP = sp; //@line 13124
  return $3 | 0; //@line 13124
 }
 return 0; //@line 13126
}
function __ZN11TextDisplay3clsEv__async_cb_3($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2091
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2095
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2097
 if ((Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0) <= 0) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 2105
 __ZN4mbed6Stream4putcEi($4, 32) | 0; //@line 2106
 if (!___async) {
  ___async_unwind = 0; //@line 2109
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 156; //@line 2111
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = 0; //@line 2113
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 2115
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $4; //@line 2117
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $4; //@line 2119
 sp = STACKTOP; //@line 2120
 return;
}
function _mbed_vtracef__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6368
 HEAP32[88] = HEAP32[86]; //@line 6370
 $2 = HEAP32[94] | 0; //@line 6371
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 6376
 HEAP32[95] = 0; //@line 6377
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6378
 FUNCTION_TABLE_v[$2 & 3](); //@line 6379
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6382
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6383
  HEAP32[$5 >> 2] = $4; //@line 6384
  sp = STACKTOP; //@line 6385
  return;
 }
 ___async_unwind = 0; //@line 6388
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6389
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6390
 HEAP32[$5 >> 2] = $4; //@line 6391
 sp = STACKTOP; //@line 6392
 return;
}
function _mbed_vtracef__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6104
 HEAP32[88] = HEAP32[86]; //@line 6106
 $2 = HEAP32[94] | 0; //@line 6107
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 6112
 HEAP32[95] = 0; //@line 6113
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6114
 FUNCTION_TABLE_v[$2 & 3](); //@line 6115
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6118
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6119
  HEAP32[$5 >> 2] = $4; //@line 6120
  sp = STACKTOP; //@line 6121
  return;
 }
 ___async_unwind = 0; //@line 6124
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6125
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6126
 HEAP32[$5 >> 2] = $4; //@line 6127
 sp = STACKTOP; //@line 6128
 return;
}
function _mbed_vtracef__async_cb_50($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6074
 HEAP32[88] = HEAP32[86]; //@line 6076
 $2 = HEAP32[94] | 0; //@line 6077
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 6082
 HEAP32[95] = 0; //@line 6083
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6084
 FUNCTION_TABLE_v[$2 & 3](); //@line 6085
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6088
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6089
  HEAP32[$5 >> 2] = $4; //@line 6090
  sp = STACKTOP; //@line 6091
  return;
 }
 ___async_unwind = 0; //@line 6094
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6095
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6096
 HEAP32[$5 >> 2] = $4; //@line 6097
 sp = STACKTOP; //@line 6098
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5510
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5512
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5514
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5516
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5518
 $10 = HEAPU16[$2 + 30 >> 1] | 0; //@line 5521
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 5522
 FUNCTION_TABLE_viiiiii[$6 & 7]($2, 0, 0, $4, $AsyncRetVal, $10); //@line 5523
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 136; //@line 5526
  sp = STACKTOP; //@line 5527
  return;
 }
 ___async_unwind = 0; //@line 5530
 HEAP32[$ReallocAsyncCtx3 >> 2] = 136; //@line 5531
 sp = STACKTOP; //@line 5532
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $7 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5112
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5114
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 5119
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5123
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 5124
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 5127
  $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 5128
  HEAP32[$7 >> 2] = $2; //@line 5129
  sp = STACKTOP; //@line 5130
  return;
 }
 ___async_unwind = 0; //@line 5133
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 5134
 $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 5135
 HEAP32[$7 >> 2] = $2; //@line 5136
 sp = STACKTOP; //@line 5137
 return;
}
function _mbed_error_hist_put($0) {
 $0 = $0 | 0;
 var $$0 = 0, $3 = 0, $5 = 0;
 if (!$0) {
  $$0 = -2130771711; //@line 2596
  return $$0 | 0; //@line 2597
 }
 $3 = (HEAP32[149] | 0) + 1 | 0; //@line 2600
 HEAP32[149] = $3; //@line 2601
 $5 = 9368 + ((($3 | 0) % 4 | 0) << 5) | 0; //@line 2603
 HEAP32[$5 >> 2] = HEAP32[$0 >> 2]; //@line 2604
 HEAP32[$5 + 4 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2604
 HEAP32[$5 + 8 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 2604
 HEAP32[$5 + 12 >> 2] = HEAP32[$0 + 12 >> 2]; //@line 2604
 HEAP32[$5 + 16 >> 2] = HEAP32[$0 + 16 >> 2]; //@line 2604
 HEAP32[$5 + 20 >> 2] = HEAP32[$0 + 20 >> 2]; //@line 2604
 HEAP32[$5 + 24 >> 2] = HEAP32[$0 + 24 >> 2]; //@line 2604
 HEAP32[$5 + 28 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 2604
 $$0 = 0; //@line 2605
 return $$0 | 0; //@line 2606
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
function __ZN15GraphicsDisplayC2EPKc__async_cb_62($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6951
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6953
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6955
 HEAP32[$2 >> 2] = 788; //@line 6956
 HEAP32[$2 + 4 >> 2] = 952; //@line 6958
 __ZN11TextDisplay10foregroundEt($4, -1); //@line 6959
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 120 >> 2] | 0; //@line 6962
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6963
 FUNCTION_TABLE_vii[$8 & 7]($4, 0); //@line 6964
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 6967
  sp = STACKTOP; //@line 6968
  return;
 }
 ___async_unwind = 0; //@line 6971
 HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 6972
 sp = STACKTOP; //@line 6973
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8399
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8401
 $3 = _malloc($2) | 0; //@line 8402
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 8405
  if (!$5) {
   $$lcssa = 0; //@line 8408
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8410
   FUNCTION_TABLE_v[$5 & 3](); //@line 8411
   if (!___async) {
    ___async_unwind = 0; //@line 8414
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 188; //@line 8416
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8418
   sp = STACKTOP; //@line 8419
   return;
  }
 } else {
  $$lcssa = $3; //@line 8423
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 8426
 return;
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2673
 $2 = HEAP32[309] | 0; //@line 2674
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2675
 _putc($1, $2) | 0; //@line 2676
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 108; //@line 2679
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2681
  sp = STACKTOP; //@line 2682
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2685
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2686
 _fflush($2) | 0; //@line 2687
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 2690
  sp = STACKTOP; //@line 2691
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2694
  return;
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 8154
 $3 = HEAP8[$1 >> 0] | 0; //@line 8155
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 8160
  $$lcssa8 = $2; //@line 8160
 } else {
  $$011 = $1; //@line 8162
  $$0710 = $0; //@line 8162
  do {
   $$0710 = $$0710 + 1 | 0; //@line 8164
   $$011 = $$011 + 1 | 0; //@line 8165
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 8166
   $9 = HEAP8[$$011 >> 0] | 0; //@line 8167
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 8172
  $$lcssa8 = $8; //@line 8172
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 8182
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 12952
  } else {
   $$01318 = $0; //@line 12954
   $$01417 = $2; //@line 12954
   $$019 = $1; //@line 12954
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 12956
    $5 = HEAP8[$$019 >> 0] | 0; //@line 12957
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 12962
    if (!$$01417) {
     $14 = 0; //@line 12967
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 12970
     $$019 = $$019 + 1 | 0; //@line 12970
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 12976
  }
 } while (0);
 return $14 | 0; //@line 12979
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
  _abort_message(9168, $vararg_buffer); //@line 1072
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8106
 STACKTOP = STACKTOP + 32 | 0; //@line 8107
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8107
 $vararg_buffer = sp; //@line 8108
 HEAP32[$0 + 36 >> 2] = 5; //@line 8111
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 8119
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 8121
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 8123
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 8128
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 8131
 STACKTOP = sp; //@line 8132
 return $14 | 0; //@line 8132
}
function _mbed_die__async_cb_97($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 9439
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9441
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9443
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 9444
 _wait_ms(150); //@line 9445
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 87; //@line 9448
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9449
  HEAP32[$4 >> 2] = $2; //@line 9450
  sp = STACKTOP; //@line 9451
  return;
 }
 ___async_unwind = 0; //@line 9454
 HEAP32[$ReallocAsyncCtx15 >> 2] = 87; //@line 9455
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9456
 HEAP32[$4 >> 2] = $2; //@line 9457
 sp = STACKTOP; //@line 9458
 return;
}
function _mbed_die__async_cb_96($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 9414
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9416
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9418
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 9419
 _wait_ms(150); //@line 9420
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 88; //@line 9423
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9424
  HEAP32[$4 >> 2] = $2; //@line 9425
  sp = STACKTOP; //@line 9426
  return;
 }
 ___async_unwind = 0; //@line 9429
 HEAP32[$ReallocAsyncCtx14 >> 2] = 88; //@line 9430
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9431
 HEAP32[$4 >> 2] = $2; //@line 9432
 sp = STACKTOP; //@line 9433
 return;
}
function _mbed_die__async_cb_95($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 9389
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9391
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9393
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 9394
 _wait_ms(150); //@line 9395
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 89; //@line 9398
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9399
  HEAP32[$4 >> 2] = $2; //@line 9400
  sp = STACKTOP; //@line 9401
  return;
 }
 ___async_unwind = 0; //@line 9404
 HEAP32[$ReallocAsyncCtx13 >> 2] = 89; //@line 9405
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9406
 HEAP32[$4 >> 2] = $2; //@line 9407
 sp = STACKTOP; //@line 9408
 return;
}
function _mbed_die__async_cb_94($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 9364
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9366
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9368
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 9369
 _wait_ms(150); //@line 9370
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 90; //@line 9373
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9374
  HEAP32[$4 >> 2] = $2; //@line 9375
  sp = STACKTOP; //@line 9376
  return;
 }
 ___async_unwind = 0; //@line 9379
 HEAP32[$ReallocAsyncCtx12 >> 2] = 90; //@line 9380
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9381
 HEAP32[$4 >> 2] = $2; //@line 9382
 sp = STACKTOP; //@line 9383
 return;
}
function _mbed_die__async_cb_93($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 9339
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9341
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9343
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 9344
 _wait_ms(150); //@line 9345
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 91; //@line 9348
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 9349
  HEAP32[$4 >> 2] = $2; //@line 9350
  sp = STACKTOP; //@line 9351
  return;
 }
 ___async_unwind = 0; //@line 9354
 HEAP32[$ReallocAsyncCtx11 >> 2] = 91; //@line 9355
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 9356
 HEAP32[$4 >> 2] = $2; //@line 9357
 sp = STACKTOP; //@line 9358
 return;
}
function _mbed_die__async_cb_92($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 9314
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9316
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9318
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 9319
 _wait_ms(150); //@line 9320
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 9323
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9324
  HEAP32[$4 >> 2] = $2; //@line 9325
  sp = STACKTOP; //@line 9326
  return;
 }
 ___async_unwind = 0; //@line 9329
 HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 9330
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9331
 HEAP32[$4 >> 2] = $2; //@line 9332
 sp = STACKTOP; //@line 9333
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 252
 STACKTOP = STACKTOP + 16 | 0; //@line 253
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 253
 $3 = sp; //@line 254
 HEAP32[$3 >> 2] = $varargs; //@line 255
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 256
 _mbed_vtracef($0, $1, $2, $3); //@line 257
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 37; //@line 260
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 262
  sp = STACKTOP; //@line 263
  STACKTOP = sp; //@line 264
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 266
  STACKTOP = sp; //@line 267
  return;
 }
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 9064
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9066
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9068
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 9069
 _wait_ms(150); //@line 9070
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 86; //@line 9073
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 9074
  HEAP32[$4 >> 2] = $2; //@line 9075
  sp = STACKTOP; //@line 9076
  return;
 }
 ___async_unwind = 0; //@line 9079
 HEAP32[$ReallocAsyncCtx16 >> 2] = 86; //@line 9080
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 9081
 HEAP32[$4 >> 2] = $2; //@line 9082
 sp = STACKTOP; //@line 9083
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2428
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2432
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $AsyncRetVal; //@line 2433
 if ($AsyncRetVal | 0) {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($AsyncRetVal); //@line 2436
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2439
 _mbed_error(-2147417831, 2416, 0, 0, 0) | 0; //@line 2440
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 75; //@line 2443
  sp = STACKTOP; //@line 2444
  return;
 }
 ___async_unwind = 0; //@line 2447
 HEAP32[$ReallocAsyncCtx3 >> 2] = 75; //@line 2448
 sp = STACKTOP; //@line 2449
 return;
}
function _mbed_die__async_cb_84($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9114
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9116
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9118
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 9119
 _wait_ms(400); //@line 9120
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 9123
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 9124
  HEAP32[$4 >> 2] = $2; //@line 9125
  sp = STACKTOP; //@line 9126
  return;
 }
 ___async_unwind = 0; //@line 9129
 HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 9130
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 9131
 HEAP32[$4 >> 2] = $2; //@line 9132
 sp = STACKTOP; //@line 9133
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2672
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2674
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2676
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2678
 $8 = HEAP32[$2 + 20 >> 2] | 0; //@line 2680
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 2681
 _fflush($8) | 0; //@line 2682
 if (!___async) {
  ___async_unwind = 0; //@line 2685
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 77; //@line 2687
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 2689
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 2691
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 2693
 sp = STACKTOP; //@line 2694
 return;
}
function _mbed_die__async_cb_91($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 9289
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9291
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9293
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 9294
 _wait_ms(150); //@line 9295
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 93; //@line 9298
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 9299
  HEAP32[$4 >> 2] = $2; //@line 9300
  sp = STACKTOP; //@line 9301
  return;
 }
 ___async_unwind = 0; //@line 9304
 HEAP32[$ReallocAsyncCtx9 >> 2] = 93; //@line 9305
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 9306
 HEAP32[$4 >> 2] = $2; //@line 9307
 sp = STACKTOP; //@line 9308
 return;
}
function _mbed_die__async_cb_90($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 9264
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9266
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9268
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 9269
 _wait_ms(400); //@line 9270
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 94; //@line 9273
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 9274
  HEAP32[$4 >> 2] = $2; //@line 9275
  sp = STACKTOP; //@line 9276
  return;
 }
 ___async_unwind = 0; //@line 9279
 HEAP32[$ReallocAsyncCtx8 >> 2] = 94; //@line 9280
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 9281
 HEAP32[$4 >> 2] = $2; //@line 9282
 sp = STACKTOP; //@line 9283
 return;
}
function _mbed_die__async_cb_89($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 9239
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9241
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9243
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 9244
 _wait_ms(400); //@line 9245
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 9248
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 9249
  HEAP32[$4 >> 2] = $2; //@line 9250
  sp = STACKTOP; //@line 9251
  return;
 }
 ___async_unwind = 0; //@line 9254
 HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 9255
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 9256
 HEAP32[$4 >> 2] = $2; //@line 9257
 sp = STACKTOP; //@line 9258
 return;
}
function _mbed_die__async_cb_88($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 9214
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9216
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9218
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 9219
 _wait_ms(400); //@line 9220
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 96; //@line 9223
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 9224
  HEAP32[$4 >> 2] = $2; //@line 9225
  sp = STACKTOP; //@line 9226
  return;
 }
 ___async_unwind = 0; //@line 9229
 HEAP32[$ReallocAsyncCtx6 >> 2] = 96; //@line 9230
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 9231
 HEAP32[$4 >> 2] = $2; //@line 9232
 sp = STACKTOP; //@line 9233
 return;
}
function _mbed_die__async_cb_87($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 9189
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9191
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9193
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 9194
 _wait_ms(400); //@line 9195
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 97; //@line 9198
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 9199
  HEAP32[$4 >> 2] = $2; //@line 9200
  sp = STACKTOP; //@line 9201
  return;
 }
 ___async_unwind = 0; //@line 9204
 HEAP32[$ReallocAsyncCtx5 >> 2] = 97; //@line 9205
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 9206
 HEAP32[$4 >> 2] = $2; //@line 9207
 sp = STACKTOP; //@line 9208
 return;
}
function _mbed_die__async_cb_86($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9164
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9166
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9168
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 9169
 _wait_ms(400); //@line 9170
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 98; //@line 9173
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 9174
  HEAP32[$4 >> 2] = $2; //@line 9175
  sp = STACKTOP; //@line 9176
  return;
 }
 ___async_unwind = 0; //@line 9179
 HEAP32[$ReallocAsyncCtx4 >> 2] = 98; //@line 9180
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 9181
 HEAP32[$4 >> 2] = $2; //@line 9182
 sp = STACKTOP; //@line 9183
 return;
}
function _mbed_die__async_cb_85($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9139
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9141
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9143
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 9144
 _wait_ms(400); //@line 9145
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 9148
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 9149
  HEAP32[$4 >> 2] = $2; //@line 9150
  sp = STACKTOP; //@line 9151
  return;
 }
 ___async_unwind = 0; //@line 9154
 HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 9155
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 9156
 HEAP32[$4 >> 2] = $2; //@line 9157
 sp = STACKTOP; //@line 9158
 return;
}
function _mbed_die__async_cb_83($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9089
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9091
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9093
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 9094
 _wait_ms(400); //@line 9095
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 9098
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 9099
  HEAP32[$4 >> 2] = $2; //@line 9100
  sp = STACKTOP; //@line 9101
  return;
 }
 ___async_unwind = 0; //@line 9104
 HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 9105
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 9106
 HEAP32[$4 >> 2] = $2; //@line 9107
 sp = STACKTOP; //@line 9108
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2295
 STACKTOP = STACKTOP + 16 | 0; //@line 2296
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2296
 $1 = sp; //@line 2297
 HEAP32[$1 >> 2] = $varargs; //@line 2298
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2299
 _mbed_error_vfprintf($0, $1); //@line 2300
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 102; //@line 2303
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2305
  sp = STACKTOP; //@line 2306
  STACKTOP = sp; //@line 2307
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2309
  STACKTOP = sp; //@line 2310
  return;
 }
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4618
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4619
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(9516, 9, 7, 8, 6, 18, 6171); //@line 4620
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 162; //@line 4623
  sp = STACKTOP; //@line 4624
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4627
  __ZN5Sht31C2E7PinNameS0_(14313, 10, 11); //@line 4628
  HEAP32[3425] = 0; //@line 4629
  HEAP32[3426] = 0; //@line 4629
  HEAP32[3427] = 0; //@line 4629
  HEAP32[3428] = 0; //@line 4629
  HEAP32[3429] = 0; //@line 4629
  HEAP32[3430] = 0; //@line 4629
  _gpio_init_out(13700, 50); //@line 4630
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
  $$05$lcssa = $2; //@line 10969
 } else {
  $$056 = $2; //@line 10971
  $15 = $1; //@line 10971
  $8 = $0; //@line 10971
  while (1) {
   $14 = $$056 + -1 | 0; //@line 10979
   HEAP8[$14 >> 0] = HEAPU8[6831 + ($8 & 15) >> 0] | 0 | $3; //@line 10980
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 10981
   $15 = tempRet0; //@line 10982
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 10987
    break;
   } else {
    $$056 = $14; //@line 10990
   }
  }
 }
 return $$05$lcssa | 0; //@line 10994
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 8277
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 8279
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 8285
  $11 = ___fwritex($0, $4, $3) | 0; //@line 8286
  if ($phitmp) {
   $13 = $11; //@line 8288
  } else {
   ___unlockfile($3); //@line 8290
   $13 = $11; //@line 8291
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 8295
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 8299
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 8302
 }
 return $15 | 0; //@line 8304
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3812
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3814
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3816
 $8 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 3818
 HEAP16[$2 >> 1] = $8; //@line 3819
 if ($8 << 16 >> 16 <= (HEAP16[$4 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$2 >> 1] = HEAP16[$4 + 40 >> 1] | 0; //@line 3828
 $15 = (HEAP16[$6 >> 1] | 0) + 1 << 16 >> 16; //@line 3830
 HEAP16[$6 >> 1] = $15; //@line 3831
 if ($15 << 16 >> 16 <= (HEAP16[$4 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$6 >> 1] = HEAP16[$4 + 44 >> 1] | 0; //@line 3840
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
 $1 = $0 + 74 | 0; //@line 8532
 $3 = HEAP8[$1 >> 0] | 0; //@line 8534
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 8538
 $7 = HEAP32[$0 >> 2] | 0; //@line 8539
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 8544
  HEAP32[$0 + 4 >> 2] = 0; //@line 8546
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 8548
  HEAP32[$0 + 28 >> 2] = $14; //@line 8550
  HEAP32[$0 + 20 >> 2] = $14; //@line 8552
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 8558
  $$0 = 0; //@line 8559
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 8562
  $$0 = -1; //@line 8563
 }
 return $$0 | 0; //@line 8565
}
function __ZN6C128327columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3366
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3369
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3370
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3371
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 126; //@line 3374
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3376
  sp = STACKTOP; //@line 3377
  return 0; //@line 3378
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3380
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0 | 0; //@line 3387
 }
 return 0; //@line 3389
}
function __ZN6C128324rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3338
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3341
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3342
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3343
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 125; //@line 3346
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3348
  sp = STACKTOP; //@line 3349
  return 0; //@line 3350
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3352
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0 | 0; //@line 3359
 }
 return 0; //@line 3361
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 12437
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 12440
 $$sink17$sink = $0; //@line 12440
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 12442
  $12 = HEAP8[$11 >> 0] | 0; //@line 12443
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 12451
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 12456
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 12461
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 11006
 } else {
  $$06 = $2; //@line 11008
  $11 = $1; //@line 11008
  $7 = $0; //@line 11008
  while (1) {
   $10 = $$06 + -1 | 0; //@line 11013
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 11014
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 11015
   $11 = tempRet0; //@line 11016
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 11021
    break;
   } else {
    $$06 = $10; //@line 11024
   }
  }
 }
 return $$0$lcssa | 0; //@line 11028
}
function ___fmodeflags($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $2 = 0, $3 = 0, $6 = 0, $9 = 0;
 $2 = (_strchr($0, 43) | 0) == 0; //@line 8876
 $3 = HEAP8[$0 >> 0] | 0; //@line 8877
 $$0 = $2 ? $3 << 24 >> 24 != 114 & 1 : 2; //@line 8880
 $6 = (_strchr($0, 120) | 0) == 0; //@line 8882
 $$0$ = $6 ? $$0 : $$0 | 128; //@line 8884
 $9 = (_strchr($0, 101) | 0) == 0; //@line 8886
 $$2 = $9 ? $$0$ : $$0$ | 524288; //@line 8888
 $$2$ = $3 << 24 >> 24 == 114 ? $$2 : $$2 | 64; //@line 8891
 $$4 = $3 << 24 >> 24 == 119 ? $$2$ | 512 : $$2$; //@line 8894
 return ($3 << 24 >> 24 == 97 ? $$4 | 1024 : $$4) | 0; //@line 8898
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
 sp = STACKTOP; //@line 2314
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2316
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2324
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 2325
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 2328
  sp = STACKTOP; //@line 2329
  return;
 }
 ___async_unwind = 0; //@line 2332
 HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 2333
 sp = STACKTOP; //@line 2334
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 10650
 } else {
  $$04 = 0; //@line 10652
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 10655
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 10659
   $12 = $7 + 1 | 0; //@line 10660
   HEAP32[$0 >> 2] = $12; //@line 10661
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 10667
    break;
   } else {
    $$04 = $11; //@line 10670
   }
  }
 }
 return $$0$lcssa | 0; //@line 10674
}
function _invoke_ticker__async_cb_67($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7568
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 7574
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 7575
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7576
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 7577
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 111; //@line 7580
  sp = STACKTOP; //@line 7581
  return;
 }
 ___async_unwind = 0; //@line 7584
 HEAP32[$ReallocAsyncCtx >> 2] = 111; //@line 7585
 sp = STACKTOP; //@line 7586
 return;
}
function __ZN15GraphicsDisplay9characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3616
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 152 >> 2] | 0; //@line 3619
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3624
 FUNCTION_TABLE_viiiiii[$6 & 7]($0, $1 << 3, $2 << 3, 8, 8, 5076 + ($3 + -31 << 3) | 0); //@line 3625
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 131; //@line 3628
  sp = STACKTOP; //@line 3629
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3632
  return;
 }
}
function __ZN4mbed10FileHandle5lseekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 145
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 148
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 149
 $6 = FUNCTION_TABLE_iiii[$5 & 15]($0, $1, $2) | 0; //@line 150
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 153
  sp = STACKTOP; //@line 154
  return 0; //@line 155
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 157
  return $6 | 0; //@line 158
 }
 return 0; //@line 160
}
function __ZN15GraphicsDisplay7columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3660
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3663
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3664
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3665
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 133; //@line 3668
  sp = STACKTOP; //@line 3669
  return 0; //@line 3670
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3672
  return ($4 | 0) / 8 | 0 | 0; //@line 3674
 }
 return 0; //@line 3676
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3639
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3642
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3643
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3644
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 132; //@line 3647
  sp = STACKTOP; //@line 3648
  return 0; //@line 3649
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3651
  return ($4 | 0) / 8 | 0 | 0; //@line 3653
 }
 return 0; //@line 3655
}
function __ZN4mbed10FileHandle4tellEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1251
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1254
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1255
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 1256
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 58; //@line 1259
  sp = STACKTOP; //@line 1260
  return 0; //@line 1261
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1263
  return $4 | 0; //@line 1264
 }
 return 0; //@line 1266
}
function __ZN4mbed10FileHandle5fsyncEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 165
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 168
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 169
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 170
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 173
  sp = STACKTOP; //@line 174
  return 0; //@line 175
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 177
  return $4 | 0; //@line 178
 }
 return 0; //@line 180
}
function _fclose__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2247
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 2250
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2252
 $10 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 2255
 $12 = HEAP32[$4 + 92 >> 2] | 0; //@line 2257
 if ($12 | 0) {
  _free($12); //@line 2260
 }
 if ($6) {
  if ($8 | 0) {
   ___unlockfile($4); //@line 2265
  }
 } else {
  _free($4); //@line 2268
 }
 HEAP32[___async_retval >> 2] = $10; //@line 2271
 return;
}
function __ZN4mbed10FileHandle4flenEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 185
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 188
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 189
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 190
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 193
  sp = STACKTOP; //@line 194
  return 0; //@line 195
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 197
  return $4 | 0; //@line 198
 }
 return 0; //@line 200
}
function __ZN4mbed6StreamD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4331
 $3 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 4334
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4335
 __ZN4mbed8FileBaseD2Ev($3); //@line 4336
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 4339
  sp = STACKTOP; //@line 4340
  return;
 }
 ___async_unwind = 0; //@line 4343
 HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 4344
 sp = STACKTOP; //@line 4345
 return;
}
function ___fflush_unlocked__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4834
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4836
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4838
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4840
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 4842
 HEAP32[$4 >> 2] = 0; //@line 4843
 HEAP32[$6 >> 2] = 0; //@line 4844
 HEAP32[$8 >> 2] = 0; //@line 4845
 HEAP32[$10 >> 2] = 0; //@line 4846
 HEAP32[___async_retval >> 2] = 0; //@line 4848
 return;
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5425
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5427
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 < ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
  $16 = ___async_retval; //@line 5437
  HEAP32[$16 >> 2] = $6; //@line 5438
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 5441
 $16 = ___async_retval; //@line 5442
 HEAP32[$16 >> 2] = $6; //@line 5443
 return;
}
function __ZN6C128325_putcEi__async_cb_46($0) {
 $0 = $0 | 0;
 var $16 = 0, $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5451
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5453
 if (!(HEAP32[$2 + 4168 >> 2] | 0)) {
  $16 = ___async_retval; //@line 5458
  HEAP32[$16 >> 2] = $4; //@line 5459
  return;
 }
 _emscripten_asm_const_iiiii(3, HEAP32[$2 + 4172 >> 2] | 0, HEAP32[$2 + 4176 >> 2] | 0, HEAP32[$2 + 4180 >> 2] | 0, $2 + 68 | 0) | 0; //@line 5469
 $16 = ___async_retval; //@line 5470
 HEAP32[$16 >> 2] = $4; //@line 5471
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4357
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4359
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4360
 __ZN4mbed8FileBaseD2Ev($2); //@line 4361
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 4364
  sp = STACKTOP; //@line 4365
  return;
 }
 ___async_unwind = 0; //@line 4368
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 4369
 sp = STACKTOP; //@line 4370
 return;
}
function _mbed_vtracef__async_cb_49($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6056
 $1 = HEAP32[92] | 0; //@line 6057
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6058
 FUNCTION_TABLE_vi[$1 & 255](2084); //@line 6059
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 6062
  sp = STACKTOP; //@line 6063
  return;
 }
 ___async_unwind = 0; //@line 6066
 HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 6067
 sp = STACKTOP; //@line 6068
 return;
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13133
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13134
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 13135
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 180; //@line 13138
  sp = STACKTOP; //@line 13139
  return 0; //@line 13140
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13142
  return $3 | 0; //@line 13143
 }
 return 0; //@line 13145
}
function ___unlist_locked_file($0) {
 $0 = $0 | 0;
 var $$pre = 0, $$sink = 0, $10 = 0, $5 = 0;
 if (HEAP32[$0 + 68 >> 2] | 0) {
  $5 = HEAP32[$0 + 116 >> 2] | 0; //@line 8415
  $$pre = $0 + 112 | 0; //@line 8418
  if ($5 | 0) {
   HEAP32[$5 + 112 >> 2] = HEAP32[$$pre >> 2]; //@line 8422
  }
  $10 = HEAP32[$$pre >> 2] | 0; //@line 8424
  if (!$10) {
   $$sink = (___pthread_self_699() | 0) + 232 | 0; //@line 8429
  } else {
   $$sink = $10 + 116 | 0; //@line 8432
  }
  HEAP32[$$sink >> 2] = $5; //@line 8434
 }
 return;
}
function __ZThn4_N6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3509
 $1 = $0 + -4 | 0; //@line 3510
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3511
 __ZN4mbed6StreamD2Ev($1); //@line 3512
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 128; //@line 3515
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3517
  sp = STACKTOP; //@line 3518
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3521
  __ZdlPv($1); //@line 3522
  return;
 }
}
function _serial_putc__async_cb_72($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8029
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8031
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8032
 _fflush($2) | 0; //@line 8033
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 8036
  sp = STACKTOP; //@line 8037
  return;
 }
 ___async_unwind = 0; //@line 8040
 HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 8041
 sp = STACKTOP; //@line 8042
 return;
}
function __ZN4mbed10FileHandle6rewindEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1271
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1274
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1275
 FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 0) | 0; //@line 1276
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1279
  sp = STACKTOP; //@line 1280
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1283
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
 $5 = $1 & 65535; //@line 3744
 HEAP16[$0 + 36 >> 1] = $5; //@line 3746
 $7 = $2 & 65535; //@line 3747
 HEAP16[$0 + 38 >> 1] = $7; //@line 3749
 HEAP16[$0 + 40 >> 1] = $5; //@line 3751
 HEAP16[$0 + 42 >> 1] = $1 + 65535 + $3; //@line 3756
 HEAP16[$0 + 44 >> 1] = $7; //@line 3758
 HEAP16[$0 + 46 >> 1] = $2 + 65535 + $4; //@line 3763
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
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1937
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1939
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1941
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1943
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] = 3248; //@line 1945
 _emscripten_asm_const_iiiii(3, HEAP32[$4 >> 2] | 0, HEAP32[$6 >> 2] | 0, HEAP32[$8 >> 2] | 0, $10 | 0) | 0; //@line 1949
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7843
 STACKTOP = STACKTOP + 16 | 0; //@line 7844
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7844
 $vararg_buffer = sp; //@line 7845
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7849
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7851
 STACKTOP = sp; //@line 7852
 return $5 | 0; //@line 7852
}
function _freopen__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4525
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4527
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 4528
 _fclose($2) | 0; //@line 4529
 if (!___async) {
  ___async_unwind = 0; //@line 4532
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 184; //@line 4534
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 4536
 sp = STACKTOP; //@line 4537
 return;
}
function __ZN6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2933
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2934
 __ZN4mbed6StreamD2Ev($0); //@line 2935
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 118; //@line 2938
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2940
  sp = STACKTOP; //@line 2941
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2944
  __ZdlPv($0); //@line 2945
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
 sp = STACKTOP; //@line 2830
 do {
  if ($0 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2834
   _mbed_die(); //@line 2835
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 2838
    sp = STACKTOP; //@line 2839
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2842
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
  HEAP8[($2 << 7) + $1 + ($0 + 68) >> 0] = ($3 | 0) != 0 & 1; //@line 3440
  return;
 }
 $17 = ($2 << 7) + $1 + ($0 + 68) | 0; //@line 3446
 if (($3 | 0) != 1) {
  return;
 }
 HEAP8[$17 >> 0] = HEAP8[$17 >> 0] ^ 1; //@line 3452
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
 if (!(_pthread_once(14300, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[3576] | 0) | 0; //@line 249
  STACKTOP = sp; //@line 250
  return $3 | 0; //@line 250
 } else {
  _abort_message(9016, sp); //@line 252
 }
 return 0; //@line 255
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 13092
 $6 = HEAP32[$5 >> 2] | 0; //@line 13093
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 13094
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 13096
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 13098
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 13101
 return $2 | 0; //@line 13102
}
function __ZL25default_terminate_handlerv__async_cb_71($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8007
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8009
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8011
 HEAP32[$2 >> 2] = 8877; //@line 8012
 HEAP32[$2 + 4 >> 2] = $4; //@line 8014
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 8016
 _abort_message(8741, $2); //@line 8017
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8481
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8483
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8484
 _fputc(10, $2) | 0; //@line 8485
 if (!___async) {
  ___async_unwind = 0; //@line 8488
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 193; //@line 8490
 sp = STACKTOP; //@line 8491
 return;
}
function _setvbuf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = $0 + 75 | 0; //@line 13414
 HEAP8[$4 >> 0] = -1; //@line 13415
 switch ($2 | 0) {
 case 2:
  {
   HEAP32[$0 + 48 >> 2] = 0; //@line 13419
   break;
  }
 case 1:
  {
   HEAP8[$4 >> 0] = 10; //@line 13423
   break;
  }
 default:
  {}
 }
 HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 64; //@line 13431
 return 0; //@line 13432
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7841
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7843
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7847
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 32 >> 2] = $AsyncRetVal; //@line 7849
 HEAP32[$4 >> 2] = $6; //@line 7850
 _sprintf($AsyncRetVal, 6013, $4) | 0; //@line 7851
 return;
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4073
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4075
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 4076
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 144; //@line 4079
  sp = STACKTOP; //@line 4080
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4083
  return;
 }
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4505
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4507
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 4508
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 159; //@line 4511
  sp = STACKTOP; //@line 4512
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4515
  return;
 }
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2898
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2902
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 2903
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 116; //@line 2906
  sp = STACKTOP; //@line 2907
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2910
  return;
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8445
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 8448
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 8453
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 8456
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8784
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8795
  $$0 = 1; //@line 8796
 } else {
  $$0 = 0; //@line 8798
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 8802
 return;
}
function __ZThn4_N6C12832D1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3492
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3494
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 3495
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 127; //@line 3498
  sp = STACKTOP; //@line 3499
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3502
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
 if (!(_pthread_setspecific(HEAP32[3576] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 1012
  return;
 } else {
  _abort_message(9115, sp); //@line 1014
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 2652
 HEAP32[$0 >> 2] = $1; //@line 2653
 HEAP32[2374] = 1; //@line 2654
 $4 = $0; //@line 2655
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 2660
 $10 = 9500; //@line 2661
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 2663
 HEAP32[$10 + 4 >> 2] = $9; //@line 2666
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
 sp = STACKTOP; //@line 2917
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2918
 _emscripten_sleep($0 | 0); //@line 2919
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 117; //@line 2922
  sp = STACKTOP; //@line 2923
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2926
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 233
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 234
 _puts($0) | 0; //@line 235
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 238
  sp = STACKTOP; //@line 239
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 242
  return;
 }
}
function _mbed_error__async_cb_78($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8595
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8596
 ___WFI(); //@line 8597
 if (!___async) {
  ___async_unwind = 0; //@line 8600
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 106; //@line 8602
 sp = STACKTOP; //@line 8603
 return;
}
function ___WFI() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2610
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2611
 _wait_ms(100); //@line 2612
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 2615
  sp = STACKTOP; //@line 2616
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2619
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
 __ZN5Sht31C2E7PinNameS0_(14313, 10, 11); //@line 2596
 HEAP32[3425] = 0; //@line 2597
 HEAP32[3426] = 0; //@line 2597
 HEAP32[3427] = 0; //@line 2597
 HEAP32[3428] = 0; //@line 2597
 HEAP32[3429] = 0; //@line 2597
 HEAP32[3430] = 0; //@line 2597
 _gpio_init_out(13700, 50); //@line 2598
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
 if (!(_pthread_key_create(14304, 202) | 0)) {
  STACKTOP = sp; //@line 995
  return;
 } else {
  _abort_message(9065, sp); //@line 997
 }
}
function ___ofl_add($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0;
 $1 = ___ofl_lock() | 0; //@line 9020
 HEAP32[$0 + 56 >> 2] = HEAP32[$1 >> 2]; //@line 9023
 $4 = HEAP32[$1 >> 2] | 0; //@line 9024
 if ($4 | 0) {
  HEAP32[$4 + 52 >> 2] = $0; //@line 9028
 }
 HEAP32[$1 >> 2] = $0; //@line 9030
 ___ofl_unlock(); //@line 9031
 return $0 | 0; //@line 9032
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 8057
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 8061
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 8064
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
function __ZN11TextDisplay5_putcEi__async_cb_34($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4693
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 4700
 }
 HEAP32[___async_retval >> 2] = $4; //@line 4703
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4569
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 4576
 }
 HEAP32[___async_retval >> 2] = $4; //@line 4579
 return;
}
function _fflush__async_cb_43($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5317
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 5319
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5322
 return;
}
function __ZN6C128323clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = $0 + 68 | 0; //@line 3395
 _memset($1 | 0, 0, 4096) | 0; //@line 3396
 _emscripten_asm_const_iiiii(3, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $1 | 0) | 0; //@line 3403
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 8469
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 8472
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 8475
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 5078
 } else {
  $$0 = -1; //@line 5080
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 5083
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7926
 if (HEAP32[___async_retval >> 2] | 0) {
  _setbuf($4, 0); //@line 7931
 }
 HEAP32[___async_retval >> 2] = $4; //@line 7934
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 8662
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 8668
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 8672
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
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3781
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 3782
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3784
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8520
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 8521
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 8523
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 12091
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 12091
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 12093
 return $1 | 0; //@line 12094
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2628
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2634
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 2635
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 8009
  $$0 = -1; //@line 8010
 } else {
  $$0 = $0; //@line 8012
 }
 return $$0 | 0; //@line 8014
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
   $$0 = 128; //@line 3480
   break;
  }
 default:
  {
   $$0 = 32; //@line 3484
  }
 }
 return $$0 | 0; //@line 3487
}
function __ZN6C128325widthEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 32; //@line 3463
   break;
  }
 default:
  {
   $$0 = 128; //@line 3467
  }
 }
 return $$0 | 0; //@line 3470
}
function _freopen__async_cb_31($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4547
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile($4); //@line 4550
 }
 HEAP32[___async_retval >> 2] = $4; //@line 4553
 return;
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0; //@line 8621
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
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0; //@line 2589
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
 _setvbuf(HEAP32[$0 + 4 >> 2] | 0, 0, 1, HEAP32[___async_retval >> 2] | 0) | 0; //@line 2609
 HEAP8[___async_retval >> 0] = 1; //@line 2612
 return;
}
function __ZN6C128326_flushEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(3, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 3050
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
  $$0 = 0; //@line 11151
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 11154
 }
 return $$0 | 0; //@line 11156
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8863
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8868
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
 $2 = _strlen($0) | 0; //@line 8264
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 8268
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 8081
 return;
}
function __ZN11TextDisplay6locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP16[$0 + 24 >> 1] = $1; //@line 4478
 HEAP16[$0 + 26 >> 1] = $2; //@line 4481
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_61($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 6933
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
 HEAP32[$0 + 60 >> 2] = $1; //@line 3413
 HEAP32[$0 + 64 >> 2] = $2; //@line 3415
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_82($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 9058
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
 _emscripten_asm_const_iiii(6, $0 | 0, $1 | 0, $2 | 0) | 0; //@line 4595
 return;
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 5549
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 8798
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 8800
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 1089
 __ZdlPv($0); //@line 1090
 return;
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 7819
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
  ___fwritex($1, $2, $0) | 0; //@line 10636
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
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 7831
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
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5413
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[3577] | 0; //@line 1862
 HEAP32[3577] = $0 + 0; //@line 1864
 return $0 | 0; //@line 1866
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4864
 return;
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2660
 return;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 7944
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
function __ZN4mbed6Stream6printfEPKcz__async_cb_23($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 12 >> 2]; //@line 4042
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_39($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 4970
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
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_26($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_15($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2734
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
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 11099
}
function _fflush__async_cb_44($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5332
 return;
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5559
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4876
 return;
}
function _fputc__async_cb_20($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3794
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 31](a1 | 0) | 0; //@line 10075
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8510
 return;
}
function _putc__async_cb_76($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8533
 return;
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8861
 return;
}
function __ZN11TextDisplay10foregroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 28 >> 1] = $1; //@line 4490
 return;
}
function __ZN11TextDisplay10backgroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 30 >> 1] = $1; //@line 4499
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
 return ($1 ? 0 : -25) | 0; //@line 208
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(9168, HEAP32[$0 + 4 >> 2] | 0); //@line 2785
}
function _setbuf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _setvbuf($0, $1, $1 | 0 ? 0 : 2, 1024) | 0; //@line 13404
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 10103
}
function __ZN5Sht3115readTemperatureEv($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(7, $0 | 0) | 0) / 100.0);
}
function __ZN4mbed8FileBaseD0Ev__async_cb_42($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5233
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
 return +(+(_emscripten_asm_const_ii(8, $0 | 0) | 0) / 100.0);
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 3803
 return;
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0 | 0;
 _setbuf($0, 0); //@line 2854
 return;
}
function __ZN4mbed6Stream4seekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return 0; //@line 1596
}
function __ZN6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5092
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 12344
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
function _freopen__async_cb_29($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 4519
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
 return 17; //@line 221
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
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 8141
}
function __ZNK4mbed10FileHandle11is_blockingEv($0) {
 $0 = $0 | 0;
 return 1; //@line 214
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
 _llvm_trap(); //@line 4091
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4523
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1246
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
 ___lock(14288); //@line 9037
 return 14296; //@line 9038
}
function __ZThn4_N4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1683
}
function __ZN4mbed11NonCopyableINS_10FileHandleEED2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandleD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1233
}
function __ZN15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 3607
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
 return 0; //@line 1240
}
function _abort_message__async_cb_75($0) {
 $0 = $0 | 0;
 _abort(); //@line 8498
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
 return 0; //@line 1614
}
function __ZN4mbed10FileHandle6rewindEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_48($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4135
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1385
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1602
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb_28($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4tellEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1620
}
function __ZN4mbed6Stream4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1608
}
function __ZN4mbed6Stream4sizeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1632
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 12265
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 12271
}
function ___pthread_self_699() {
 return _pthread_self() | 0; //@line 8448
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb_11($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZN4mbed8FileBaseD2Ev__async_cb_9($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb_27($0) {
 $0 = $0 | 0;
 return;
}
function b1() {
 nullFunc_i(0); //@line 10142
 return 0; //@line 10142
}
function _core_util_are_interrupts_enabled() {
 return 1; //@line 2746
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
 ___unlock(14288); //@line 9043
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
 return $0 | 0; //@line 8025
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 8454
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
 return 0; //@line 2751
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
 return 14284; //@line 8019
}
function __ZSt9terminatev__async_cb_36($0) {
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
 return 1368; //@line 8146
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
,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_59,_mbed_vtracef__async_cb_49,_mbed_vtracef__async_cb_50,_mbed_vtracef__async_cb_51,_mbed_vtracef__async_cb_58,_mbed_vtracef__async_cb_52,_mbed_vtracef__async_cb_57,_mbed_vtracef__async_cb_53,_mbed_vtracef__async_cb_54,_mbed_vtracef__async_cb_55,_mbed_vtracef__async_cb_56,__ZN4mbed8FileBaseD2Ev__async_cb_8,__ZN4mbed8FileBaseD2Ev__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_9,__ZN4mbed8FileBaseD0Ev__async_cb_41,__ZN4mbed8FileBaseD0Ev__async_cb,__ZN4mbed8FileBaseD0Ev__async_cb_42,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_35,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb,__ZN4mbed10FileHandle4tellEv__async_cb
,__ZN4mbed10FileHandle6rewindEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_38,__ZN4mbed10FileHandle4sizeEv__async_cb_39,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD2Ev__async_cb_27,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_81,__ZN4mbed6Stream4readEPvj__async_cb_82,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_60,__ZN4mbed6Stream5writeEPKvj__async_cb_61,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD1Ev__async_cb_28,__ZN4mbed6StreamC2EPKc__async_cb_10,__ZN4mbed6StreamC2EPKc__async_cb,__ZN4mbed6StreamC2EPKc__async_cb_11,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_16,__ZN4mbed6Stream4putcEi__async_cb_14,__ZN4mbed6Stream4putcEi__async_cb_15,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_25,__ZN4mbed6Stream6printfEPKcz__async_cb_22,__ZN4mbed6Stream6printfEPKcz__async_cb_23,__ZN4mbed6Stream6printfEPKcz__async_cb_24,_mbed_assert_internal__async_cb,_mbed_die__async_cb_97,_mbed_die__async_cb_96,_mbed_die__async_cb_95
,_mbed_die__async_cb_94,_mbed_die__async_cb_93,_mbed_die__async_cb_92,_mbed_die__async_cb_91,_mbed_die__async_cb_90,_mbed_die__async_cb_89,_mbed_die__async_cb_88,_mbed_die__async_cb_87,_mbed_die__async_cb_86,_mbed_die__async_cb_85,_mbed_die__async_cb_84,_mbed_die__async_cb_83,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_69,_mbed_error_vfprintf__async_cb_68,_mbed_error__async_cb_78,___WFI__async_cb,_serial_putc__async_cb_72,_serial_putc__async_cb,_invoke_ticker__async_cb_67,_invoke_ticker__async_cb,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_77,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb,_exit__async_cb,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,_wait_ms__async_cb,__ZN6C12832D0Ev__async_cb
,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_46,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_17,__ZN6C128329characterEiii__async_cb_18,__ZN6C128329characterEiii__async_cb_19,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_1,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_47,__ZN15GraphicsDisplay3clsEv__async_cb_48,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_12,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_98,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_79,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_62,__ZN15GraphicsDisplayC2EPKc__async_cb,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_32
,__ZN11TextDisplay5_putcEi__async_cb_33,__ZN11TextDisplay5_putcEi__async_cb_34,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_13,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_2,__ZN11TextDisplay3clsEv__async_cb_3,__ZN11TextDisplay3clsEv__async_cb_6,__ZN11TextDisplay3clsEv__async_cb_4,__ZN11TextDisplay3clsEv__async_cb_5,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_70,__ZN11TextDisplayC2EPKc__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb,_main__async_cb_21,_putc__async_cb_76,_putc__async_cb,___overflow__async_cb,_fclose__async_cb_7,_fclose__async_cb,_fflush__async_cb_44,_fflush__async_cb_43,_fflush__async_cb_45,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_37,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb
,_sprintf__async_cb,_vsprintf__async_cb,_freopen__async_cb,_freopen__async_cb_31,_freopen__async_cb_30,_freopen__async_cb_29,_fputc__async_cb_20,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_71,_abort_message__async_cb,_abort_message__async_cb_75,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_80,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_73,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_26,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_74,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_66,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_65,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_64
,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_63,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_40,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50
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
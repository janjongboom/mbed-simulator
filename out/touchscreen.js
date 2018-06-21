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

var ASM_CONSTS = [function() { return Date.now(); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0) { window.MbedJSHal.ST7789H2.writeReg($0); },
 function() { window.MbedJSHal.ST7789H2.readData(); },
 function() { window.MbedJSHal.ST7789H2.init(); },
 function($0, $1, $2) { window.MbedJSHal.ST7789H2.drawPixel($0, $1, $2); },
 function() { return window.MbedJSHal.ST7789H2.getTouchX(); },
 function() { return window.MbedJSHal.ST7789H2.getTouchY(); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 16928;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "touchscreen.js.mem";





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
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_31", "_mbed_vtracef__async_cb_21", "_mbed_vtracef__async_cb_22", "_mbed_vtracef__async_cb_23", "_mbed_vtracef__async_cb_30", "_mbed_vtracef__async_cb_24", "_mbed_vtracef__async_cb_29", "_mbed_vtracef__async_cb_25", "_mbed_vtracef__async_cb_26", "_mbed_vtracef__async_cb_27", "_mbed_vtracef__async_cb_28", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_20", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_40", "_mbed_error_vfprintf__async_cb_39", "_serial_putc__async_cb_41", "_serial_putc__async_cb", "_invoke_ticker__async_cb_36", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_BSP_TS_GetState__async_cb", "_main__async_cb_2", "_main__async_cb", "_main__async_cb_4", "_main__async_cb_3", "_putc__async_cb_37", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_34", "_fflush__async_cb_33", "_fflush__async_cb_35", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_32", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_5", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_38", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
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
 sp = STACKTOP; //@line 2393
 STACKTOP = STACKTOP + 16 | 0; //@line 2394
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2394
 $1 = sp; //@line 2395
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2402
   $7 = $6 >>> 3; //@line 2403
   $8 = HEAP32[3821] | 0; //@line 2404
   $9 = $8 >>> $7; //@line 2405
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2411
    $16 = 15324 + ($14 << 1 << 2) | 0; //@line 2413
    $17 = $16 + 8 | 0; //@line 2414
    $18 = HEAP32[$17 >> 2] | 0; //@line 2415
    $19 = $18 + 8 | 0; //@line 2416
    $20 = HEAP32[$19 >> 2] | 0; //@line 2417
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3821] = $8 & ~(1 << $14); //@line 2424
     } else {
      if ((HEAP32[3825] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2429
      }
      $27 = $20 + 12 | 0; //@line 2432
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2436
       HEAP32[$17 >> 2] = $20; //@line 2437
       break;
      } else {
       _abort(); //@line 2440
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2445
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2448
    $34 = $18 + $30 + 4 | 0; //@line 2450
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2453
    $$0 = $19; //@line 2454
    STACKTOP = sp; //@line 2455
    return $$0 | 0; //@line 2455
   }
   $37 = HEAP32[3823] | 0; //@line 2457
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2463
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2466
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2469
     $49 = $47 >>> 12 & 16; //@line 2471
     $50 = $47 >>> $49; //@line 2472
     $52 = $50 >>> 5 & 8; //@line 2474
     $54 = $50 >>> $52; //@line 2476
     $56 = $54 >>> 2 & 4; //@line 2478
     $58 = $54 >>> $56; //@line 2480
     $60 = $58 >>> 1 & 2; //@line 2482
     $62 = $58 >>> $60; //@line 2484
     $64 = $62 >>> 1 & 1; //@line 2486
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2489
     $69 = 15324 + ($67 << 1 << 2) | 0; //@line 2491
     $70 = $69 + 8 | 0; //@line 2492
     $71 = HEAP32[$70 >> 2] | 0; //@line 2493
     $72 = $71 + 8 | 0; //@line 2494
     $73 = HEAP32[$72 >> 2] | 0; //@line 2495
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2501
       HEAP32[3821] = $77; //@line 2502
       $98 = $77; //@line 2503
      } else {
       if ((HEAP32[3825] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2508
       }
       $80 = $73 + 12 | 0; //@line 2511
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2515
        HEAP32[$70 >> 2] = $73; //@line 2516
        $98 = $8; //@line 2517
        break;
       } else {
        _abort(); //@line 2520
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2525
     $84 = $83 - $6 | 0; //@line 2526
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2529
     $87 = $71 + $6 | 0; //@line 2530
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2533
     HEAP32[$71 + $83 >> 2] = $84; //@line 2535
     if ($37 | 0) {
      $92 = HEAP32[3826] | 0; //@line 2538
      $93 = $37 >>> 3; //@line 2539
      $95 = 15324 + ($93 << 1 << 2) | 0; //@line 2541
      $96 = 1 << $93; //@line 2542
      if (!($98 & $96)) {
       HEAP32[3821] = $98 | $96; //@line 2547
       $$0199 = $95; //@line 2549
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2549
      } else {
       $101 = $95 + 8 | 0; //@line 2551
       $102 = HEAP32[$101 >> 2] | 0; //@line 2552
       if ((HEAP32[3825] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2556
       } else {
        $$0199 = $102; //@line 2559
        $$pre$phiZ2D = $101; //@line 2559
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2562
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2564
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2566
      HEAP32[$92 + 12 >> 2] = $95; //@line 2568
     }
     HEAP32[3823] = $84; //@line 2570
     HEAP32[3826] = $87; //@line 2571
     $$0 = $72; //@line 2572
     STACKTOP = sp; //@line 2573
     return $$0 | 0; //@line 2573
    }
    $108 = HEAP32[3822] | 0; //@line 2575
    if (!$108) {
     $$0197 = $6; //@line 2578
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2582
     $114 = $112 >>> 12 & 16; //@line 2584
     $115 = $112 >>> $114; //@line 2585
     $117 = $115 >>> 5 & 8; //@line 2587
     $119 = $115 >>> $117; //@line 2589
     $121 = $119 >>> 2 & 4; //@line 2591
     $123 = $119 >>> $121; //@line 2593
     $125 = $123 >>> 1 & 2; //@line 2595
     $127 = $123 >>> $125; //@line 2597
     $129 = $127 >>> 1 & 1; //@line 2599
     $134 = HEAP32[15588 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2604
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2608
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2614
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2617
      $$0193$lcssa$i = $138; //@line 2617
     } else {
      $$01926$i = $134; //@line 2619
      $$01935$i = $138; //@line 2619
      $146 = $143; //@line 2619
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2624
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2625
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2626
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2627
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2633
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2636
        $$0193$lcssa$i = $$$0193$i; //@line 2636
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2639
        $$01935$i = $$$0193$i; //@line 2639
       }
      }
     }
     $157 = HEAP32[3825] | 0; //@line 2643
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2646
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2649
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2652
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2656
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2658
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2662
       $176 = HEAP32[$175 >> 2] | 0; //@line 2663
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2666
        $179 = HEAP32[$178 >> 2] | 0; //@line 2667
        if (!$179) {
         $$3$i = 0; //@line 2670
         break;
        } else {
         $$1196$i = $179; //@line 2673
         $$1198$i = $178; //@line 2673
        }
       } else {
        $$1196$i = $176; //@line 2676
        $$1198$i = $175; //@line 2676
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2679
        $182 = HEAP32[$181 >> 2] | 0; //@line 2680
        if ($182 | 0) {
         $$1196$i = $182; //@line 2683
         $$1198$i = $181; //@line 2683
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2686
        $185 = HEAP32[$184 >> 2] | 0; //@line 2687
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2692
         $$1198$i = $184; //@line 2692
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2697
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2700
        $$3$i = $$1196$i; //@line 2701
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2706
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2709
       }
       $169 = $167 + 12 | 0; //@line 2712
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2716
       }
       $172 = $164 + 8 | 0; //@line 2719
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2723
        HEAP32[$172 >> 2] = $167; //@line 2724
        $$3$i = $164; //@line 2725
        break;
       } else {
        _abort(); //@line 2728
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2737
       $191 = 15588 + ($190 << 2) | 0; //@line 2738
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2743
         if (!$$3$i) {
          HEAP32[3822] = $108 & ~(1 << $190); //@line 2749
          break L73;
         }
        } else {
         if ((HEAP32[3825] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2756
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2764
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3825] | 0; //@line 2774
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 2777
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 2781
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 2783
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 2789
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2793
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2795
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2801
       if ($214 | 0) {
        if ((HEAP32[3825] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2807
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2811
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2813
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2821
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2824
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2826
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2829
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2833
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2836
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2838
      if ($37 | 0) {
       $234 = HEAP32[3826] | 0; //@line 2841
       $235 = $37 >>> 3; //@line 2842
       $237 = 15324 + ($235 << 1 << 2) | 0; //@line 2844
       $238 = 1 << $235; //@line 2845
       if (!($8 & $238)) {
        HEAP32[3821] = $8 | $238; //@line 2850
        $$0189$i = $237; //@line 2852
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2852
       } else {
        $242 = $237 + 8 | 0; //@line 2854
        $243 = HEAP32[$242 >> 2] | 0; //@line 2855
        if ((HEAP32[3825] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2859
        } else {
         $$0189$i = $243; //@line 2862
         $$pre$phi$iZ2D = $242; //@line 2862
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2865
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2867
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2869
       HEAP32[$234 + 12 >> 2] = $237; //@line 2871
      }
      HEAP32[3823] = $$0193$lcssa$i; //@line 2873
      HEAP32[3826] = $159; //@line 2874
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2877
     STACKTOP = sp; //@line 2878
     return $$0 | 0; //@line 2878
    }
   } else {
    $$0197 = $6; //@line 2881
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2886
   } else {
    $251 = $0 + 11 | 0; //@line 2888
    $252 = $251 & -8; //@line 2889
    $253 = HEAP32[3822] | 0; //@line 2890
    if (!$253) {
     $$0197 = $252; //@line 2893
    } else {
     $255 = 0 - $252 | 0; //@line 2895
     $256 = $251 >>> 8; //@line 2896
     if (!$256) {
      $$0358$i = 0; //@line 2899
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2903
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2907
       $262 = $256 << $261; //@line 2908
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2911
       $267 = $262 << $265; //@line 2913
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2916
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2921
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2927
      }
     }
     $282 = HEAP32[15588 + ($$0358$i << 2) >> 2] | 0; //@line 2931
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2935
       $$3$i203 = 0; //@line 2935
       $$3350$i = $255; //@line 2935
       label = 81; //@line 2936
      } else {
       $$0342$i = 0; //@line 2943
       $$0347$i = $255; //@line 2943
       $$0353$i = $282; //@line 2943
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2943
       $$0362$i = 0; //@line 2943
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2948
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2953
          $$435113$i = 0; //@line 2953
          $$435712$i = $$0353$i; //@line 2953
          label = 85; //@line 2954
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2957
          $$1348$i = $292; //@line 2957
         }
        } else {
         $$1343$i = $$0342$i; //@line 2960
         $$1348$i = $$0347$i; //@line 2960
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2963
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2966
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2970
        $302 = ($$0353$i | 0) == 0; //@line 2971
        if ($302) {
         $$2355$i = $$1363$i; //@line 2976
         $$3$i203 = $$1343$i; //@line 2976
         $$3350$i = $$1348$i; //@line 2976
         label = 81; //@line 2977
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2980
         $$0347$i = $$1348$i; //@line 2980
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2980
         $$0362$i = $$1363$i; //@line 2980
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2990
       $309 = $253 & ($306 | 0 - $306); //@line 2993
       if (!$309) {
        $$0197 = $252; //@line 2996
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3001
       $315 = $313 >>> 12 & 16; //@line 3003
       $316 = $313 >>> $315; //@line 3004
       $318 = $316 >>> 5 & 8; //@line 3006
       $320 = $316 >>> $318; //@line 3008
       $322 = $320 >>> 2 & 4; //@line 3010
       $324 = $320 >>> $322; //@line 3012
       $326 = $324 >>> 1 & 2; //@line 3014
       $328 = $324 >>> $326; //@line 3016
       $330 = $328 >>> 1 & 1; //@line 3018
       $$4$ph$i = 0; //@line 3024
       $$4357$ph$i = HEAP32[15588 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3024
      } else {
       $$4$ph$i = $$3$i203; //@line 3026
       $$4357$ph$i = $$2355$i; //@line 3026
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3030
       $$4351$lcssa$i = $$3350$i; //@line 3030
      } else {
       $$414$i = $$4$ph$i; //@line 3032
       $$435113$i = $$3350$i; //@line 3032
       $$435712$i = $$4357$ph$i; //@line 3032
       label = 85; //@line 3033
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3038
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3042
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3043
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3044
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3045
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3051
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3054
        $$4351$lcssa$i = $$$4351$i; //@line 3054
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3057
        $$435113$i = $$$4351$i; //@line 3057
        label = 85; //@line 3058
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3064
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3823] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3825] | 0; //@line 3070
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3073
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3076
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3079
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3083
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3085
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3089
         $371 = HEAP32[$370 >> 2] | 0; //@line 3090
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3093
          $374 = HEAP32[$373 >> 2] | 0; //@line 3094
          if (!$374) {
           $$3372$i = 0; //@line 3097
           break;
          } else {
           $$1370$i = $374; //@line 3100
           $$1374$i = $373; //@line 3100
          }
         } else {
          $$1370$i = $371; //@line 3103
          $$1374$i = $370; //@line 3103
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3106
          $377 = HEAP32[$376 >> 2] | 0; //@line 3107
          if ($377 | 0) {
           $$1370$i = $377; //@line 3110
           $$1374$i = $376; //@line 3110
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3113
          $380 = HEAP32[$379 >> 2] | 0; //@line 3114
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3119
           $$1374$i = $379; //@line 3119
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3124
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3127
          $$3372$i = $$1370$i; //@line 3128
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3133
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3136
         }
         $364 = $362 + 12 | 0; //@line 3139
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3143
         }
         $367 = $359 + 8 | 0; //@line 3146
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3150
          HEAP32[$367 >> 2] = $362; //@line 3151
          $$3372$i = $359; //@line 3152
          break;
         } else {
          _abort(); //@line 3155
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3163
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3166
         $386 = 15588 + ($385 << 2) | 0; //@line 3167
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3172
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3177
            HEAP32[3822] = $391; //@line 3178
            $475 = $391; //@line 3179
            break L164;
           }
          } else {
           if ((HEAP32[3825] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3186
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3194
            if (!$$3372$i) {
             $475 = $253; //@line 3197
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3825] | 0; //@line 3205
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3208
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3212
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3214
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3220
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3224
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3226
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3232
         if (!$409) {
          $475 = $253; //@line 3235
         } else {
          if ((HEAP32[3825] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3240
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3244
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3246
           $475 = $253; //@line 3247
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3256
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3259
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3261
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3264
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3268
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3271
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3273
         $428 = $$4351$lcssa$i >>> 3; //@line 3274
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 15324 + ($428 << 1 << 2) | 0; //@line 3278
          $432 = HEAP32[3821] | 0; //@line 3279
          $433 = 1 << $428; //@line 3280
          if (!($432 & $433)) {
           HEAP32[3821] = $432 | $433; //@line 3285
           $$0368$i = $431; //@line 3287
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3287
          } else {
           $437 = $431 + 8 | 0; //@line 3289
           $438 = HEAP32[$437 >> 2] | 0; //@line 3290
           if ((HEAP32[3825] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3294
           } else {
            $$0368$i = $438; //@line 3297
            $$pre$phi$i211Z2D = $437; //@line 3297
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3300
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3302
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3304
          HEAP32[$354 + 12 >> 2] = $431; //@line 3306
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3309
         if (!$444) {
          $$0361$i = 0; //@line 3312
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3316
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3320
           $450 = $444 << $449; //@line 3321
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3324
           $455 = $450 << $453; //@line 3326
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3329
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3334
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3340
          }
         }
         $469 = 15588 + ($$0361$i << 2) | 0; //@line 3343
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3345
         $471 = $354 + 16 | 0; //@line 3346
         HEAP32[$471 + 4 >> 2] = 0; //@line 3348
         HEAP32[$471 >> 2] = 0; //@line 3349
         $473 = 1 << $$0361$i; //@line 3350
         if (!($475 & $473)) {
          HEAP32[3822] = $475 | $473; //@line 3355
          HEAP32[$469 >> 2] = $354; //@line 3356
          HEAP32[$354 + 24 >> 2] = $469; //@line 3358
          HEAP32[$354 + 12 >> 2] = $354; //@line 3360
          HEAP32[$354 + 8 >> 2] = $354; //@line 3362
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3371
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3371
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3378
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3382
          $494 = HEAP32[$492 >> 2] | 0; //@line 3384
          if (!$494) {
           label = 136; //@line 3387
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3390
           $$0345$i = $494; //@line 3390
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3825] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3397
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3400
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3402
           HEAP32[$354 + 12 >> 2] = $354; //@line 3404
           HEAP32[$354 + 8 >> 2] = $354; //@line 3406
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3411
          $502 = HEAP32[$501 >> 2] | 0; //@line 3412
          $503 = HEAP32[3825] | 0; //@line 3413
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3419
           HEAP32[$501 >> 2] = $354; //@line 3420
           HEAP32[$354 + 8 >> 2] = $502; //@line 3422
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3424
           HEAP32[$354 + 24 >> 2] = 0; //@line 3426
           break;
          } else {
           _abort(); //@line 3429
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3436
       STACKTOP = sp; //@line 3437
       return $$0 | 0; //@line 3437
      } else {
       $$0197 = $252; //@line 3439
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3823] | 0; //@line 3446
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3449
  $515 = HEAP32[3826] | 0; //@line 3450
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3453
   HEAP32[3826] = $517; //@line 3454
   HEAP32[3823] = $514; //@line 3455
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3458
   HEAP32[$515 + $512 >> 2] = $514; //@line 3460
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3463
  } else {
   HEAP32[3823] = 0; //@line 3465
   HEAP32[3826] = 0; //@line 3466
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3469
   $526 = $515 + $512 + 4 | 0; //@line 3471
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3474
  }
  $$0 = $515 + 8 | 0; //@line 3477
  STACKTOP = sp; //@line 3478
  return $$0 | 0; //@line 3478
 }
 $530 = HEAP32[3824] | 0; //@line 3480
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3483
  HEAP32[3824] = $532; //@line 3484
  $533 = HEAP32[3827] | 0; //@line 3485
  $534 = $533 + $$0197 | 0; //@line 3486
  HEAP32[3827] = $534; //@line 3487
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3490
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3493
  $$0 = $533 + 8 | 0; //@line 3495
  STACKTOP = sp; //@line 3496
  return $$0 | 0; //@line 3496
 }
 if (!(HEAP32[3939] | 0)) {
  HEAP32[3941] = 4096; //@line 3501
  HEAP32[3940] = 4096; //@line 3502
  HEAP32[3942] = -1; //@line 3503
  HEAP32[3943] = -1; //@line 3504
  HEAP32[3944] = 0; //@line 3505
  HEAP32[3932] = 0; //@line 3506
  HEAP32[3939] = $1 & -16 ^ 1431655768; //@line 3510
  $548 = 4096; //@line 3511
 } else {
  $548 = HEAP32[3941] | 0; //@line 3514
 }
 $545 = $$0197 + 48 | 0; //@line 3516
 $546 = $$0197 + 47 | 0; //@line 3517
 $547 = $548 + $546 | 0; //@line 3518
 $549 = 0 - $548 | 0; //@line 3519
 $550 = $547 & $549; //@line 3520
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3523
  STACKTOP = sp; //@line 3524
  return $$0 | 0; //@line 3524
 }
 $552 = HEAP32[3931] | 0; //@line 3526
 if ($552 | 0) {
  $554 = HEAP32[3929] | 0; //@line 3529
  $555 = $554 + $550 | 0; //@line 3530
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3535
   STACKTOP = sp; //@line 3536
   return $$0 | 0; //@line 3536
  }
 }
 L244 : do {
  if (!(HEAP32[3932] & 4)) {
   $561 = HEAP32[3827] | 0; //@line 3544
   L246 : do {
    if (!$561) {
     label = 163; //@line 3548
    } else {
     $$0$i$i = 15732; //@line 3550
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3552
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3555
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3564
      if (!$570) {
       label = 163; //@line 3567
       break L246;
      } else {
       $$0$i$i = $570; //@line 3570
      }
     }
     $595 = $547 - $530 & $549; //@line 3574
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3577
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3585
       } else {
        $$723947$i = $595; //@line 3587
        $$748$i = $597; //@line 3587
        label = 180; //@line 3588
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3592
       $$2253$ph$i = $595; //@line 3592
       label = 171; //@line 3593
      }
     } else {
      $$2234243136$i = 0; //@line 3596
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3602
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3605
     } else {
      $574 = $572; //@line 3607
      $575 = HEAP32[3940] | 0; //@line 3608
      $576 = $575 + -1 | 0; //@line 3609
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3617
      $584 = HEAP32[3929] | 0; //@line 3618
      $585 = $$$i + $584 | 0; //@line 3619
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3931] | 0; //@line 3624
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3631
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3635
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3638
        $$748$i = $572; //@line 3638
        label = 180; //@line 3639
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3642
        $$2253$ph$i = $$$i; //@line 3642
        label = 171; //@line 3643
       }
      } else {
       $$2234243136$i = 0; //@line 3646
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3653
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3662
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3665
       $$748$i = $$2247$ph$i; //@line 3665
       label = 180; //@line 3666
       break L244;
      }
     }
     $607 = HEAP32[3941] | 0; //@line 3670
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3674
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3677
      $$748$i = $$2247$ph$i; //@line 3677
      label = 180; //@line 3678
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3684
      $$2234243136$i = 0; //@line 3685
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3689
      $$748$i = $$2247$ph$i; //@line 3689
      label = 180; //@line 3690
      break L244;
     }
    }
   } while (0);
   HEAP32[3932] = HEAP32[3932] | 4; //@line 3697
   $$4236$i = $$2234243136$i; //@line 3698
   label = 178; //@line 3699
  } else {
   $$4236$i = 0; //@line 3701
   label = 178; //@line 3702
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3708
   $621 = _sbrk(0) | 0; //@line 3709
   $627 = $621 - $620 | 0; //@line 3717
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3719
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3727
    $$748$i = $620; //@line 3727
    label = 180; //@line 3728
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3929] | 0) + $$723947$i | 0; //@line 3734
  HEAP32[3929] = $633; //@line 3735
  if ($633 >>> 0 > (HEAP32[3930] | 0) >>> 0) {
   HEAP32[3930] = $633; //@line 3739
  }
  $636 = HEAP32[3827] | 0; //@line 3741
  do {
   if (!$636) {
    $638 = HEAP32[3825] | 0; //@line 3745
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3825] = $$748$i; //@line 3750
    }
    HEAP32[3933] = $$748$i; //@line 3752
    HEAP32[3934] = $$723947$i; //@line 3753
    HEAP32[3936] = 0; //@line 3754
    HEAP32[3830] = HEAP32[3939]; //@line 3756
    HEAP32[3829] = -1; //@line 3757
    HEAP32[3834] = 15324; //@line 3758
    HEAP32[3833] = 15324; //@line 3759
    HEAP32[3836] = 15332; //@line 3760
    HEAP32[3835] = 15332; //@line 3761
    HEAP32[3838] = 15340; //@line 3762
    HEAP32[3837] = 15340; //@line 3763
    HEAP32[3840] = 15348; //@line 3764
    HEAP32[3839] = 15348; //@line 3765
    HEAP32[3842] = 15356; //@line 3766
    HEAP32[3841] = 15356; //@line 3767
    HEAP32[3844] = 15364; //@line 3768
    HEAP32[3843] = 15364; //@line 3769
    HEAP32[3846] = 15372; //@line 3770
    HEAP32[3845] = 15372; //@line 3771
    HEAP32[3848] = 15380; //@line 3772
    HEAP32[3847] = 15380; //@line 3773
    HEAP32[3850] = 15388; //@line 3774
    HEAP32[3849] = 15388; //@line 3775
    HEAP32[3852] = 15396; //@line 3776
    HEAP32[3851] = 15396; //@line 3777
    HEAP32[3854] = 15404; //@line 3778
    HEAP32[3853] = 15404; //@line 3779
    HEAP32[3856] = 15412; //@line 3780
    HEAP32[3855] = 15412; //@line 3781
    HEAP32[3858] = 15420; //@line 3782
    HEAP32[3857] = 15420; //@line 3783
    HEAP32[3860] = 15428; //@line 3784
    HEAP32[3859] = 15428; //@line 3785
    HEAP32[3862] = 15436; //@line 3786
    HEAP32[3861] = 15436; //@line 3787
    HEAP32[3864] = 15444; //@line 3788
    HEAP32[3863] = 15444; //@line 3789
    HEAP32[3866] = 15452; //@line 3790
    HEAP32[3865] = 15452; //@line 3791
    HEAP32[3868] = 15460; //@line 3792
    HEAP32[3867] = 15460; //@line 3793
    HEAP32[3870] = 15468; //@line 3794
    HEAP32[3869] = 15468; //@line 3795
    HEAP32[3872] = 15476; //@line 3796
    HEAP32[3871] = 15476; //@line 3797
    HEAP32[3874] = 15484; //@line 3798
    HEAP32[3873] = 15484; //@line 3799
    HEAP32[3876] = 15492; //@line 3800
    HEAP32[3875] = 15492; //@line 3801
    HEAP32[3878] = 15500; //@line 3802
    HEAP32[3877] = 15500; //@line 3803
    HEAP32[3880] = 15508; //@line 3804
    HEAP32[3879] = 15508; //@line 3805
    HEAP32[3882] = 15516; //@line 3806
    HEAP32[3881] = 15516; //@line 3807
    HEAP32[3884] = 15524; //@line 3808
    HEAP32[3883] = 15524; //@line 3809
    HEAP32[3886] = 15532; //@line 3810
    HEAP32[3885] = 15532; //@line 3811
    HEAP32[3888] = 15540; //@line 3812
    HEAP32[3887] = 15540; //@line 3813
    HEAP32[3890] = 15548; //@line 3814
    HEAP32[3889] = 15548; //@line 3815
    HEAP32[3892] = 15556; //@line 3816
    HEAP32[3891] = 15556; //@line 3817
    HEAP32[3894] = 15564; //@line 3818
    HEAP32[3893] = 15564; //@line 3819
    HEAP32[3896] = 15572; //@line 3820
    HEAP32[3895] = 15572; //@line 3821
    $642 = $$723947$i + -40 | 0; //@line 3822
    $644 = $$748$i + 8 | 0; //@line 3824
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3829
    $650 = $$748$i + $649 | 0; //@line 3830
    $651 = $642 - $649 | 0; //@line 3831
    HEAP32[3827] = $650; //@line 3832
    HEAP32[3824] = $651; //@line 3833
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3836
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3839
    HEAP32[3828] = HEAP32[3943]; //@line 3841
   } else {
    $$024367$i = 15732; //@line 3843
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3845
     $658 = $$024367$i + 4 | 0; //@line 3846
     $659 = HEAP32[$658 >> 2] | 0; //@line 3847
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3851
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3855
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3860
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3874
       $673 = (HEAP32[3824] | 0) + $$723947$i | 0; //@line 3876
       $675 = $636 + 8 | 0; //@line 3878
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3883
       $681 = $636 + $680 | 0; //@line 3884
       $682 = $673 - $680 | 0; //@line 3885
       HEAP32[3827] = $681; //@line 3886
       HEAP32[3824] = $682; //@line 3887
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3890
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3893
       HEAP32[3828] = HEAP32[3943]; //@line 3895
       break;
      }
     }
    }
    $688 = HEAP32[3825] | 0; //@line 3900
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3825] = $$748$i; //@line 3903
     $753 = $$748$i; //@line 3904
    } else {
     $753 = $688; //@line 3906
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3908
    $$124466$i = 15732; //@line 3909
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3914
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3918
     if (!$694) {
      $$0$i$i$i = 15732; //@line 3921
      break;
     } else {
      $$124466$i = $694; //@line 3924
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3933
      $700 = $$124466$i + 4 | 0; //@line 3934
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3937
      $704 = $$748$i + 8 | 0; //@line 3939
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3945
      $712 = $690 + 8 | 0; //@line 3947
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3953
      $722 = $710 + $$0197 | 0; //@line 3957
      $723 = $718 - $710 - $$0197 | 0; //@line 3958
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3961
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3824] | 0) + $723 | 0; //@line 3966
        HEAP32[3824] = $728; //@line 3967
        HEAP32[3827] = $722; //@line 3968
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3971
       } else {
        if ((HEAP32[3826] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3823] | 0) + $723 | 0; //@line 3977
         HEAP32[3823] = $734; //@line 3978
         HEAP32[3826] = $722; //@line 3979
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3982
         HEAP32[$722 + $734 >> 2] = $734; //@line 3984
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3988
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3992
         $743 = $739 >>> 3; //@line 3993
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3998
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4000
           $750 = 15324 + ($743 << 1 << 2) | 0; //@line 4002
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4008
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4017
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3821] = HEAP32[3821] & ~(1 << $743); //@line 4027
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4034
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4038
             }
             $764 = $748 + 8 | 0; //@line 4041
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4045
              break;
             }
             _abort(); //@line 4048
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4053
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4054
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4057
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4059
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4063
             $783 = $782 + 4 | 0; //@line 4064
             $784 = HEAP32[$783 >> 2] | 0; //@line 4065
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4068
              if (!$786) {
               $$3$i$i = 0; //@line 4071
               break;
              } else {
               $$1291$i$i = $786; //@line 4074
               $$1293$i$i = $782; //@line 4074
              }
             } else {
              $$1291$i$i = $784; //@line 4077
              $$1293$i$i = $783; //@line 4077
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4080
              $789 = HEAP32[$788 >> 2] | 0; //@line 4081
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4084
               $$1293$i$i = $788; //@line 4084
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4087
              $792 = HEAP32[$791 >> 2] | 0; //@line 4088
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4093
               $$1293$i$i = $791; //@line 4093
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4098
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4101
              $$3$i$i = $$1291$i$i; //@line 4102
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4107
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4110
             }
             $776 = $774 + 12 | 0; //@line 4113
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4117
             }
             $779 = $771 + 8 | 0; //@line 4120
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4124
              HEAP32[$779 >> 2] = $774; //@line 4125
              $$3$i$i = $771; //@line 4126
              break;
             } else {
              _abort(); //@line 4129
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4139
           $798 = 15588 + ($797 << 2) | 0; //@line 4140
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4145
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3822] = HEAP32[3822] & ~(1 << $797); //@line 4154
             break L311;
            } else {
             if ((HEAP32[3825] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4160
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4168
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3825] | 0; //@line 4178
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4181
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4185
           $815 = $718 + 16 | 0; //@line 4186
           $816 = HEAP32[$815 >> 2] | 0; //@line 4187
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4193
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4197
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4199
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4205
           if (!$822) {
            break;
           }
           if ((HEAP32[3825] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4213
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4217
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4219
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4226
         $$0287$i$i = $742 + $723 | 0; //@line 4226
        } else {
         $$0$i17$i = $718; //@line 4228
         $$0287$i$i = $723; //@line 4228
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4230
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4233
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4236
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4238
        $836 = $$0287$i$i >>> 3; //@line 4239
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 15324 + ($836 << 1 << 2) | 0; //@line 4243
         $840 = HEAP32[3821] | 0; //@line 4244
         $841 = 1 << $836; //@line 4245
         do {
          if (!($840 & $841)) {
           HEAP32[3821] = $840 | $841; //@line 4251
           $$0295$i$i = $839; //@line 4253
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4253
          } else {
           $845 = $839 + 8 | 0; //@line 4255
           $846 = HEAP32[$845 >> 2] | 0; //@line 4256
           if ((HEAP32[3825] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4260
            $$pre$phi$i19$iZ2D = $845; //@line 4260
            break;
           }
           _abort(); //@line 4263
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4267
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4269
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4271
         HEAP32[$722 + 12 >> 2] = $839; //@line 4273
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4276
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4280
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4284
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4289
          $858 = $852 << $857; //@line 4290
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4293
          $863 = $858 << $861; //@line 4295
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4298
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4303
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4309
         }
        } while (0);
        $877 = 15588 + ($$0296$i$i << 2) | 0; //@line 4312
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4314
        $879 = $722 + 16 | 0; //@line 4315
        HEAP32[$879 + 4 >> 2] = 0; //@line 4317
        HEAP32[$879 >> 2] = 0; //@line 4318
        $881 = HEAP32[3822] | 0; //@line 4319
        $882 = 1 << $$0296$i$i; //@line 4320
        if (!($881 & $882)) {
         HEAP32[3822] = $881 | $882; //@line 4325
         HEAP32[$877 >> 2] = $722; //@line 4326
         HEAP32[$722 + 24 >> 2] = $877; //@line 4328
         HEAP32[$722 + 12 >> 2] = $722; //@line 4330
         HEAP32[$722 + 8 >> 2] = $722; //@line 4332
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4341
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4341
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4348
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4352
         $902 = HEAP32[$900 >> 2] | 0; //@line 4354
         if (!$902) {
          label = 260; //@line 4357
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4360
          $$0289$i$i = $902; //@line 4360
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3825] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4367
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4370
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4372
          HEAP32[$722 + 12 >> 2] = $722; //@line 4374
          HEAP32[$722 + 8 >> 2] = $722; //@line 4376
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4381
         $910 = HEAP32[$909 >> 2] | 0; //@line 4382
         $911 = HEAP32[3825] | 0; //@line 4383
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4389
          HEAP32[$909 >> 2] = $722; //@line 4390
          HEAP32[$722 + 8 >> 2] = $910; //@line 4392
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4394
          HEAP32[$722 + 24 >> 2] = 0; //@line 4396
          break;
         } else {
          _abort(); //@line 4399
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4406
      STACKTOP = sp; //@line 4407
      return $$0 | 0; //@line 4407
     } else {
      $$0$i$i$i = 15732; //@line 4409
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4413
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4418
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4426
    }
    $927 = $923 + -47 | 0; //@line 4428
    $929 = $927 + 8 | 0; //@line 4430
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4436
    $936 = $636 + 16 | 0; //@line 4437
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4439
    $939 = $938 + 8 | 0; //@line 4440
    $940 = $938 + 24 | 0; //@line 4441
    $941 = $$723947$i + -40 | 0; //@line 4442
    $943 = $$748$i + 8 | 0; //@line 4444
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4449
    $949 = $$748$i + $948 | 0; //@line 4450
    $950 = $941 - $948 | 0; //@line 4451
    HEAP32[3827] = $949; //@line 4452
    HEAP32[3824] = $950; //@line 4453
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4456
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4459
    HEAP32[3828] = HEAP32[3943]; //@line 4461
    $956 = $938 + 4 | 0; //@line 4462
    HEAP32[$956 >> 2] = 27; //@line 4463
    HEAP32[$939 >> 2] = HEAP32[3933]; //@line 4464
    HEAP32[$939 + 4 >> 2] = HEAP32[3934]; //@line 4464
    HEAP32[$939 + 8 >> 2] = HEAP32[3935]; //@line 4464
    HEAP32[$939 + 12 >> 2] = HEAP32[3936]; //@line 4464
    HEAP32[3933] = $$748$i; //@line 4465
    HEAP32[3934] = $$723947$i; //@line 4466
    HEAP32[3936] = 0; //@line 4467
    HEAP32[3935] = $939; //@line 4468
    $958 = $940; //@line 4469
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4471
     HEAP32[$958 >> 2] = 7; //@line 4472
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4485
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4488
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4491
     HEAP32[$938 >> 2] = $964; //@line 4492
     $969 = $964 >>> 3; //@line 4493
     if ($964 >>> 0 < 256) {
      $972 = 15324 + ($969 << 1 << 2) | 0; //@line 4497
      $973 = HEAP32[3821] | 0; //@line 4498
      $974 = 1 << $969; //@line 4499
      if (!($973 & $974)) {
       HEAP32[3821] = $973 | $974; //@line 4504
       $$0211$i$i = $972; //@line 4506
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4506
      } else {
       $978 = $972 + 8 | 0; //@line 4508
       $979 = HEAP32[$978 >> 2] | 0; //@line 4509
       if ((HEAP32[3825] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4513
       } else {
        $$0211$i$i = $979; //@line 4516
        $$pre$phi$i$iZ2D = $978; //@line 4516
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4519
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4521
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4523
      HEAP32[$636 + 12 >> 2] = $972; //@line 4525
      break;
     }
     $985 = $964 >>> 8; //@line 4528
     if (!$985) {
      $$0212$i$i = 0; //@line 4531
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4535
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4539
       $991 = $985 << $990; //@line 4540
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4543
       $996 = $991 << $994; //@line 4545
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4548
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4553
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4559
      }
     }
     $1010 = 15588 + ($$0212$i$i << 2) | 0; //@line 4562
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4564
     HEAP32[$636 + 20 >> 2] = 0; //@line 4566
     HEAP32[$936 >> 2] = 0; //@line 4567
     $1013 = HEAP32[3822] | 0; //@line 4568
     $1014 = 1 << $$0212$i$i; //@line 4569
     if (!($1013 & $1014)) {
      HEAP32[3822] = $1013 | $1014; //@line 4574
      HEAP32[$1010 >> 2] = $636; //@line 4575
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4577
      HEAP32[$636 + 12 >> 2] = $636; //@line 4579
      HEAP32[$636 + 8 >> 2] = $636; //@line 4581
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4590
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4590
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4597
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4601
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4603
      if (!$1034) {
       label = 286; //@line 4606
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4609
       $$0207$i$i = $1034; //@line 4609
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3825] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4616
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4619
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4621
       HEAP32[$636 + 12 >> 2] = $636; //@line 4623
       HEAP32[$636 + 8 >> 2] = $636; //@line 4625
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4630
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4631
      $1043 = HEAP32[3825] | 0; //@line 4632
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4638
       HEAP32[$1041 >> 2] = $636; //@line 4639
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4641
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4643
       HEAP32[$636 + 24 >> 2] = 0; //@line 4645
       break;
      } else {
       _abort(); //@line 4648
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3824] | 0; //@line 4655
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4658
   HEAP32[3824] = $1054; //@line 4659
   $1055 = HEAP32[3827] | 0; //@line 4660
   $1056 = $1055 + $$0197 | 0; //@line 4661
   HEAP32[3827] = $1056; //@line 4662
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4665
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4668
   $$0 = $1055 + 8 | 0; //@line 4670
   STACKTOP = sp; //@line 4671
   return $$0 | 0; //@line 4671
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4675
 $$0 = 0; //@line 4676
 STACKTOP = sp; //@line 4677
 return $$0 | 0; //@line 4677
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8399
 STACKTOP = STACKTOP + 560 | 0; //@line 8400
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 8400
 $6 = sp + 8 | 0; //@line 8401
 $7 = sp; //@line 8402
 $8 = sp + 524 | 0; //@line 8403
 $9 = $8; //@line 8404
 $10 = sp + 512 | 0; //@line 8405
 HEAP32[$7 >> 2] = 0; //@line 8406
 $11 = $10 + 12 | 0; //@line 8407
 ___DOUBLE_BITS_677($1) | 0; //@line 8408
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8413
  $$0520 = 1; //@line 8413
  $$0521 = 13136; //@line 8413
 } else {
  $$0471 = $1; //@line 8424
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8424
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 13137 : 13142 : 13139; //@line 8424
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8426
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8435
   $31 = $$0520 + 3 | 0; //@line 8440
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8442
   _out_670($0, $$0521, $$0520); //@line 8443
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 13163 : 13167 : $27 ? 13155 : 13159, 3); //@line 8444
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8446
   $$sink560 = $31; //@line 8447
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8450
   $36 = $35 != 0.0; //@line 8451
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8455
   }
   $39 = $5 | 32; //@line 8457
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8460
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8463
    $44 = $$0520 | 2; //@line 8464
    $46 = 12 - $3 | 0; //@line 8466
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8471
     } else {
      $$0509585 = 8.0; //@line 8473
      $$1508586 = $46; //@line 8473
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8475
       $$0509585 = $$0509585 * 16.0; //@line 8476
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8491
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8496
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8501
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8504
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8507
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8510
     HEAP8[$68 >> 0] = 48; //@line 8511
     $$0511 = $68; //@line 8512
    } else {
     $$0511 = $66; //@line 8514
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8521
    $76 = $$0511 + -2 | 0; //@line 8524
    HEAP8[$76 >> 0] = $5 + 15; //@line 8525
    $77 = ($3 | 0) < 1; //@line 8526
    $79 = ($4 & 8 | 0) == 0; //@line 8528
    $$0523 = $8; //@line 8529
    $$2473 = $$1472; //@line 8529
    while (1) {
     $80 = ~~$$2473; //@line 8531
     $86 = $$0523 + 1 | 0; //@line 8537
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[13171 + $80 >> 0]; //@line 8538
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8541
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8550
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8553
       $$1524 = $$0523 + 2 | 0; //@line 8554
      }
     } else {
      $$1524 = $86; //@line 8557
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8561
     }
    }
    $$pre693 = $$1524; //@line 8567
    if (!$3) {
     label = 24; //@line 8569
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8577
      $$sink = $3 + 2 | 0; //@line 8577
     } else {
      label = 24; //@line 8579
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8583
     $$pre$phi691Z2D = $101; //@line 8584
     $$sink = $101; //@line 8584
    }
    $104 = $11 - $76 | 0; //@line 8588
    $106 = $104 + $44 + $$sink | 0; //@line 8590
    _pad_676($0, 32, $2, $106, $4); //@line 8591
    _out_670($0, $$0521$, $44); //@line 8592
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8594
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8595
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8597
    _out_670($0, $76, $104); //@line 8598
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8600
    $$sink560 = $106; //@line 8601
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8605
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8609
    HEAP32[$7 >> 2] = $113; //@line 8610
    $$3 = $35 * 268435456.0; //@line 8611
    $$pr = $113; //@line 8611
   } else {
    $$3 = $35; //@line 8614
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8614
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8618
   $$0498 = $$561; //@line 8619
   $$4 = $$3; //@line 8619
   do {
    $116 = ~~$$4 >>> 0; //@line 8621
    HEAP32[$$0498 >> 2] = $116; //@line 8622
    $$0498 = $$0498 + 4 | 0; //@line 8623
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8626
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8636
    $$1499662 = $$0498; //@line 8636
    $124 = $$pr; //@line 8636
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8639
     $$0488655 = $$1499662 + -4 | 0; //@line 8640
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8643
     } else {
      $$0488657 = $$0488655; //@line 8645
      $$0497656 = 0; //@line 8645
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8648
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8650
       $131 = tempRet0; //@line 8651
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8652
       HEAP32[$$0488657 >> 2] = $132; //@line 8654
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8655
       $$0488657 = $$0488657 + -4 | 0; //@line 8657
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8667
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8669
       HEAP32[$138 >> 2] = $$0497656; //@line 8670
       $$2483$ph = $138; //@line 8671
      }
     }
     $$2500 = $$1499662; //@line 8674
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8680
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8684
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8690
     HEAP32[$7 >> 2] = $144; //@line 8691
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8694
      $$1499662 = $$2500; //@line 8694
      $124 = $144; //@line 8694
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8696
      $$1499$lcssa = $$2500; //@line 8696
      $$pr566 = $144; //@line 8696
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8701
    $$1499$lcssa = $$0498; //@line 8701
    $$pr566 = $$pr; //@line 8701
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8707
    $150 = ($39 | 0) == 102; //@line 8708
    $$3484650 = $$1482$lcssa; //@line 8709
    $$3501649 = $$1499$lcssa; //@line 8709
    $152 = $$pr566; //@line 8709
    while (1) {
     $151 = 0 - $152 | 0; //@line 8711
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8713
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8717
      $161 = 1e9 >>> $154; //@line 8718
      $$0487644 = 0; //@line 8719
      $$1489643 = $$3484650; //@line 8719
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8721
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8725
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8726
       $$1489643 = $$1489643 + 4 | 0; //@line 8727
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8738
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8741
       $$4502 = $$3501649; //@line 8741
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8744
       $$$3484700 = $$$3484; //@line 8745
       $$4502 = $$3501649 + 4 | 0; //@line 8745
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8752
      $$4502 = $$3501649; //@line 8752
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8754
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8761
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8763
     HEAP32[$7 >> 2] = $152; //@line 8764
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8769
      $$3501$lcssa = $$$4502; //@line 8769
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8767
      $$3501649 = $$$4502; //@line 8767
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8774
    $$3501$lcssa = $$1499$lcssa; //@line 8774
   }
   $185 = $$561; //@line 8777
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8782
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8783
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8786
    } else {
     $$0514639 = $189; //@line 8788
     $$0530638 = 10; //@line 8788
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8790
      $193 = $$0514639 + 1 | 0; //@line 8791
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8794
       break;
      } else {
       $$0514639 = $193; //@line 8797
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8802
   }
   $198 = ($39 | 0) == 103; //@line 8807
   $199 = ($$540 | 0) != 0; //@line 8808
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8811
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8820
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8823
    $213 = ($209 | 0) % 9 | 0; //@line 8824
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8827
     $$1531632 = 10; //@line 8827
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8830
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8833
       $$1531632 = $215; //@line 8833
      } else {
       $$1531$lcssa = $215; //@line 8835
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8840
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8842
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8843
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8846
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8849
     $$4518 = $$1515; //@line 8849
     $$8 = $$3484$lcssa; //@line 8849
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8854
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8855
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8860
     if (!$$0520) {
      $$1467 = $$$564; //@line 8863
      $$1469 = $$543; //@line 8863
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8866
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8871
      $$1469 = $230 ? -$$543 : $$543; //@line 8871
     }
     $233 = $217 - $218 | 0; //@line 8873
     HEAP32[$212 >> 2] = $233; //@line 8874
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8878
      HEAP32[$212 >> 2] = $236; //@line 8879
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8882
       $$sink547625 = $212; //@line 8882
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8884
        HEAP32[$$sink547625 >> 2] = 0; //@line 8885
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8888
         HEAP32[$240 >> 2] = 0; //@line 8889
         $$6 = $240; //@line 8890
        } else {
         $$6 = $$5486626; //@line 8892
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8895
        HEAP32[$238 >> 2] = $242; //@line 8896
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8899
         $$sink547625 = $238; //@line 8899
        } else {
         $$5486$lcssa = $$6; //@line 8901
         $$sink547$lcssa = $238; //@line 8901
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8906
       $$sink547$lcssa = $212; //@line 8906
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8911
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8912
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8915
       $$4518 = $247; //@line 8915
       $$8 = $$5486$lcssa; //@line 8915
      } else {
       $$2516621 = $247; //@line 8917
       $$2532620 = 10; //@line 8917
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8919
        $251 = $$2516621 + 1 | 0; //@line 8920
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8923
         $$4518 = $251; //@line 8923
         $$8 = $$5486$lcssa; //@line 8923
         break;
        } else {
         $$2516621 = $251; //@line 8926
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8931
      $$4518 = $$1515; //@line 8931
      $$8 = $$3484$lcssa; //@line 8931
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8934
    $$5519$ph = $$4518; //@line 8937
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8937
    $$9$ph = $$8; //@line 8937
   } else {
    $$5519$ph = $$1515; //@line 8939
    $$7505$ph = $$3501$lcssa; //@line 8939
    $$9$ph = $$3484$lcssa; //@line 8939
   }
   $$7505 = $$7505$ph; //@line 8941
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8945
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8948
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8952
    } else {
     $$lcssa675 = 1; //@line 8954
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8958
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8963
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8971
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8971
     } else {
      $$0479 = $5 + -2 | 0; //@line 8975
      $$2476 = $$540$ + -1 | 0; //@line 8975
     }
     $267 = $4 & 8; //@line 8977
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8982
       if (!$270) {
        $$2529 = 9; //@line 8985
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8990
         $$3533616 = 10; //@line 8990
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8992
          $275 = $$1528617 + 1 | 0; //@line 8993
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8999
           break;
          } else {
           $$1528617 = $275; //@line 8997
          }
         }
        } else {
         $$2529 = 0; //@line 9004
        }
       }
      } else {
       $$2529 = 9; //@line 9008
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 9016
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 9018
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 9020
       $$1480 = $$0479; //@line 9023
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 9023
       $$pre$phi698Z2D = 0; //@line 9023
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 9027
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 9029
       $$1480 = $$0479; //@line 9032
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 9032
       $$pre$phi698Z2D = 0; //@line 9032
       break;
      }
     } else {
      $$1480 = $$0479; //@line 9036
      $$3477 = $$2476; //@line 9036
      $$pre$phi698Z2D = $267; //@line 9036
     }
    } else {
     $$1480 = $5; //@line 9040
     $$3477 = $$540; //@line 9040
     $$pre$phi698Z2D = $4 & 8; //@line 9040
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 9043
   $294 = ($292 | 0) != 0 & 1; //@line 9045
   $296 = ($$1480 | 32 | 0) == 102; //@line 9047
   if ($296) {
    $$2513 = 0; //@line 9051
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 9051
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 9054
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9057
    $304 = $11; //@line 9058
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 9063
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 9065
      HEAP8[$308 >> 0] = 48; //@line 9066
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 9071
      } else {
       $$1512$lcssa = $308; //@line 9073
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 9078
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 9085
    $318 = $$1512$lcssa + -2 | 0; //@line 9087
    HEAP8[$318 >> 0] = $$1480; //@line 9088
    $$2513 = $318; //@line 9091
    $$pn = $304 - $318 | 0; //@line 9091
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 9096
   _pad_676($0, 32, $2, $323, $4); //@line 9097
   _out_670($0, $$0521, $$0520); //@line 9098
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 9100
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 9103
    $326 = $8 + 9 | 0; //@line 9104
    $327 = $326; //@line 9105
    $328 = $8 + 8 | 0; //@line 9106
    $$5493600 = $$0496$$9; //@line 9107
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 9110
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 9115
       $$1465 = $328; //@line 9116
      } else {
       $$1465 = $330; //@line 9118
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 9125
       $$0464597 = $330; //@line 9126
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 9128
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 9131
        } else {
         $$1465 = $335; //@line 9133
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 9138
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 9143
     $$5493600 = $$5493600 + 4 | 0; //@line 9144
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 13187, 1); //@line 9154
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 9160
     $$6494592 = $$5493600; //@line 9160
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 9163
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 9168
       $$0463587 = $347; //@line 9169
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 9171
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 9174
        } else {
         $$0463$lcssa = $351; //@line 9176
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 9181
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 9185
      $$6494592 = $$6494592 + 4 | 0; //@line 9186
      $356 = $$4478593 + -9 | 0; //@line 9187
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 9194
       break;
      } else {
       $$4478593 = $356; //@line 9192
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 9199
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 9202
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9205
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9208
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9209
     $365 = $363; //@line 9210
     $366 = 0 - $9 | 0; //@line 9211
     $367 = $8 + 8 | 0; //@line 9212
     $$5605 = $$3477; //@line 9213
     $$7495604 = $$9$ph; //@line 9213
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9216
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9219
       $$0 = $367; //@line 9220
      } else {
       $$0 = $369; //@line 9222
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9227
        _out_670($0, $$0, 1); //@line 9228
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9232
         break;
        }
        _out_670($0, 13187, 1); //@line 9235
        $$2 = $375; //@line 9236
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9240
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9245
        $$1601 = $$0; //@line 9246
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9248
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9251
         } else {
          $$2 = $373; //@line 9253
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9260
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9263
      $381 = $$5605 - $378 | 0; //@line 9264
      $$7495604 = $$7495604 + 4 | 0; //@line 9265
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9272
       break;
      } else {
       $$5605 = $381; //@line 9270
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9277
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9280
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9284
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9287
   $$sink560 = $323; //@line 9288
  }
 } while (0);
 STACKTOP = sp; //@line 9293
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9293
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6971
 STACKTOP = STACKTOP + 64 | 0; //@line 6972
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6972
 $5 = sp + 16 | 0; //@line 6973
 $6 = sp; //@line 6974
 $7 = sp + 24 | 0; //@line 6975
 $8 = sp + 8 | 0; //@line 6976
 $9 = sp + 20 | 0; //@line 6977
 HEAP32[$5 >> 2] = $1; //@line 6978
 $10 = ($0 | 0) != 0; //@line 6979
 $11 = $7 + 40 | 0; //@line 6980
 $12 = $11; //@line 6981
 $13 = $7 + 39 | 0; //@line 6982
 $14 = $8 + 4 | 0; //@line 6983
 $$0243 = 0; //@line 6984
 $$0247 = 0; //@line 6984
 $$0269 = 0; //@line 6984
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6993
     $$1248 = -1; //@line 6994
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6998
     break;
    }
   } else {
    $$1248 = $$0247; //@line 7002
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 7005
  $21 = HEAP8[$20 >> 0] | 0; //@line 7006
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 7009
   break;
  } else {
   $23 = $21; //@line 7012
   $25 = $20; //@line 7012
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 7017
     $27 = $25; //@line 7017
     label = 9; //@line 7018
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 7023
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 7030
   HEAP32[$5 >> 2] = $24; //@line 7031
   $23 = HEAP8[$24 >> 0] | 0; //@line 7033
   $25 = $24; //@line 7033
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 7038
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 7043
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 7046
     $27 = $27 + 2 | 0; //@line 7047
     HEAP32[$5 >> 2] = $27; //@line 7048
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 7055
      break;
     } else {
      $$0249303 = $30; //@line 7052
      label = 9; //@line 7053
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 7063
  if ($10) {
   _out_670($0, $20, $36); //@line 7065
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 7069
   $$0247 = $$1248; //@line 7069
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 7077
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 7078
  if ($43) {
   $$0253 = -1; //@line 7080
   $$1270 = $$0269; //@line 7080
   $$sink = 1; //@line 7080
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 7090
    $$1270 = 1; //@line 7090
    $$sink = 3; //@line 7090
   } else {
    $$0253 = -1; //@line 7092
    $$1270 = $$0269; //@line 7092
    $$sink = 1; //@line 7092
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 7095
  HEAP32[$5 >> 2] = $51; //@line 7096
  $52 = HEAP8[$51 >> 0] | 0; //@line 7097
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 7099
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 7106
   $$lcssa291 = $52; //@line 7106
   $$lcssa292 = $51; //@line 7106
  } else {
   $$0262309 = 0; //@line 7108
   $60 = $52; //@line 7108
   $65 = $51; //@line 7108
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 7113
    $64 = $65 + 1 | 0; //@line 7114
    HEAP32[$5 >> 2] = $64; //@line 7115
    $66 = HEAP8[$64 >> 0] | 0; //@line 7116
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 7118
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 7125
     $$lcssa291 = $66; //@line 7125
     $$lcssa292 = $64; //@line 7125
     break;
    } else {
     $$0262309 = $63; //@line 7128
     $60 = $66; //@line 7128
     $65 = $64; //@line 7128
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 7140
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 7142
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 7147
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7152
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7164
     $$2271 = 1; //@line 7164
     $storemerge274 = $79 + 3 | 0; //@line 7164
    } else {
     label = 23; //@line 7166
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 7170
    if ($$1270 | 0) {
     $$0 = -1; //@line 7173
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7188
     $106 = HEAP32[$105 >> 2] | 0; //@line 7189
     HEAP32[$2 >> 2] = $105 + 4; //@line 7191
     $363 = $106; //@line 7192
    } else {
     $363 = 0; //@line 7194
    }
    $$0259 = $363; //@line 7198
    $$2271 = 0; //@line 7198
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 7198
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 7200
   $109 = ($$0259 | 0) < 0; //@line 7201
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7206
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7206
   $$3272 = $$2271; //@line 7206
   $115 = $storemerge274; //@line 7206
  } else {
   $112 = _getint_671($5) | 0; //@line 7208
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7211
    break;
   }
   $$1260 = $112; //@line 7215
   $$1263 = $$0262$lcssa; //@line 7215
   $$3272 = $$1270; //@line 7215
   $115 = HEAP32[$5 >> 2] | 0; //@line 7215
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7226
     $156 = _getint_671($5) | 0; //@line 7227
     $$0254 = $156; //@line 7229
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7229
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7238
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7243
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7248
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7255
      $144 = $125 + 4 | 0; //@line 7259
      HEAP32[$5 >> 2] = $144; //@line 7260
      $$0254 = $140; //@line 7261
      $$pre345 = $144; //@line 7261
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7267
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7282
     $152 = HEAP32[$151 >> 2] | 0; //@line 7283
     HEAP32[$2 >> 2] = $151 + 4; //@line 7285
     $364 = $152; //@line 7286
    } else {
     $364 = 0; //@line 7288
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7291
    HEAP32[$5 >> 2] = $154; //@line 7292
    $$0254 = $364; //@line 7293
    $$pre345 = $154; //@line 7293
   } else {
    $$0254 = -1; //@line 7295
    $$pre345 = $115; //@line 7295
   }
  } while (0);
  $$0252 = 0; //@line 7298
  $158 = $$pre345; //@line 7298
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7305
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7308
   HEAP32[$5 >> 2] = $158; //@line 7309
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (12655 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7314
   $168 = $167 & 255; //@line 7315
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7319
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7326
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7330
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7334
     break L1;
    } else {
     label = 50; //@line 7337
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7342
     $176 = $3 + ($$0253 << 3) | 0; //@line 7344
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7349
     $182 = $6; //@line 7350
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7352
     HEAP32[$182 + 4 >> 2] = $181; //@line 7355
     label = 50; //@line 7356
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7360
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7363
    $187 = HEAP32[$5 >> 2] | 0; //@line 7365
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7369
   if ($10) {
    $187 = $158; //@line 7371
   } else {
    $$0243 = 0; //@line 7373
    $$0247 = $$1248; //@line 7373
    $$0269 = $$3272; //@line 7373
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7379
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7385
  $196 = $$1263 & -65537; //@line 7388
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7389
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7397
       $$0243 = 0; //@line 7398
       $$0247 = $$1248; //@line 7398
       $$0269 = $$3272; //@line 7398
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7404
       $$0243 = 0; //@line 7405
       $$0247 = $$1248; //@line 7405
       $$0269 = $$3272; //@line 7405
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7413
       HEAP32[$208 >> 2] = $$1248; //@line 7415
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7418
       $$0243 = 0; //@line 7419
       $$0247 = $$1248; //@line 7419
       $$0269 = $$3272; //@line 7419
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7426
       $$0243 = 0; //@line 7427
       $$0247 = $$1248; //@line 7427
       $$0269 = $$3272; //@line 7427
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7434
       $$0243 = 0; //@line 7435
       $$0247 = $$1248; //@line 7435
       $$0269 = $$3272; //@line 7435
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7441
       $$0243 = 0; //@line 7442
       $$0247 = $$1248; //@line 7442
       $$0269 = $$3272; //@line 7442
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7450
       HEAP32[$220 >> 2] = $$1248; //@line 7452
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7455
       $$0243 = 0; //@line 7456
       $$0247 = $$1248; //@line 7456
       $$0269 = $$3272; //@line 7456
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7461
       $$0247 = $$1248; //@line 7461
       $$0269 = $$3272; //@line 7461
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7471
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7471
     $$3265 = $$1263$ | 8; //@line 7471
     label = 62; //@line 7472
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7476
     $$1255 = $$0254; //@line 7476
     $$3265 = $$1263$; //@line 7476
     label = 62; //@line 7477
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7481
     $244 = HEAP32[$242 >> 2] | 0; //@line 7483
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7486
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7487
     $252 = $12 - $248 | 0; //@line 7491
     $$0228 = $248; //@line 7496
     $$1233 = 0; //@line 7496
     $$1238 = 13119; //@line 7496
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7496
     $$4266 = $$1263$; //@line 7496
     $281 = $244; //@line 7496
     $283 = $247; //@line 7496
     label = 68; //@line 7497
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7501
     $258 = HEAP32[$256 >> 2] | 0; //@line 7503
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7506
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7509
      $264 = tempRet0; //@line 7510
      $265 = $6; //@line 7511
      HEAP32[$265 >> 2] = $263; //@line 7513
      HEAP32[$265 + 4 >> 2] = $264; //@line 7516
      $$0232 = 1; //@line 7517
      $$0237 = 13119; //@line 7517
      $275 = $263; //@line 7517
      $276 = $264; //@line 7517
      label = 67; //@line 7518
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7530
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 13119 : 13121 : 13120; //@line 7530
      $275 = $258; //@line 7530
      $276 = $261; //@line 7530
      label = 67; //@line 7531
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7537
     $$0232 = 0; //@line 7543
     $$0237 = 13119; //@line 7543
     $275 = HEAP32[$197 >> 2] | 0; //@line 7543
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7543
     label = 67; //@line 7544
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7555
     $$2 = $13; //@line 7556
     $$2234 = 0; //@line 7556
     $$2239 = 13119; //@line 7556
     $$2251 = $11; //@line 7556
     $$5 = 1; //@line 7556
     $$6268 = $196; //@line 7556
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7563
     label = 72; //@line 7564
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7568
     $$1 = $302 | 0 ? $302 : 13129; //@line 7571
     label = 72; //@line 7572
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7582
     HEAP32[$14 >> 2] = 0; //@line 7583
     HEAP32[$6 >> 2] = $8; //@line 7584
     $$4258354 = -1; //@line 7585
     $365 = $8; //@line 7585
     label = 76; //@line 7586
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7590
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7593
      $$0240$lcssa356 = 0; //@line 7594
      label = 85; //@line 7595
     } else {
      $$4258354 = $$0254; //@line 7597
      $365 = $$pre348; //@line 7597
      label = 76; //@line 7598
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7605
     $$0247 = $$1248; //@line 7605
     $$0269 = $$3272; //@line 7605
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7610
     $$2234 = 0; //@line 7610
     $$2239 = 13119; //@line 7610
     $$2251 = $11; //@line 7610
     $$5 = $$0254; //@line 7610
     $$6268 = $$1263$; //@line 7610
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7616
    $227 = $6; //@line 7617
    $229 = HEAP32[$227 >> 2] | 0; //@line 7619
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7622
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7624
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7630
    $$0228 = $234; //@line 7635
    $$1233 = $or$cond278 ? 0 : 2; //@line 7635
    $$1238 = $or$cond278 ? 13119 : 13119 + ($$1236 >> 4) | 0; //@line 7635
    $$2256 = $$1255; //@line 7635
    $$4266 = $$3265; //@line 7635
    $281 = $229; //@line 7635
    $283 = $232; //@line 7635
    label = 68; //@line 7636
   } else if ((label | 0) == 67) {
    label = 0; //@line 7639
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7641
    $$1233 = $$0232; //@line 7641
    $$1238 = $$0237; //@line 7641
    $$2256 = $$0254; //@line 7641
    $$4266 = $$1263$; //@line 7641
    $281 = $275; //@line 7641
    $283 = $276; //@line 7641
    label = 68; //@line 7642
   } else if ((label | 0) == 72) {
    label = 0; //@line 7645
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7646
    $306 = ($305 | 0) == 0; //@line 7647
    $$2 = $$1; //@line 7654
    $$2234 = 0; //@line 7654
    $$2239 = 13119; //@line 7654
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7654
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7654
    $$6268 = $196; //@line 7654
   } else if ((label | 0) == 76) {
    label = 0; //@line 7657
    $$0229316 = $365; //@line 7658
    $$0240315 = 0; //@line 7658
    $$1244314 = 0; //@line 7658
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7660
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7663
      $$2245 = $$1244314; //@line 7663
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7666
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7672
      $$2245 = $320; //@line 7672
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7676
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7679
      $$0240315 = $325; //@line 7679
      $$1244314 = $320; //@line 7679
     } else {
      $$0240$lcssa = $325; //@line 7681
      $$2245 = $320; //@line 7681
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7687
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7690
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7693
     label = 85; //@line 7694
    } else {
     $$1230327 = $365; //@line 7696
     $$1241326 = 0; //@line 7696
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7698
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7701
       label = 85; //@line 7702
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7705
      $$1241326 = $331 + $$1241326 | 0; //@line 7706
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7709
       label = 85; //@line 7710
       break L97;
      }
      _out_670($0, $9, $331); //@line 7714
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7719
       label = 85; //@line 7720
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7717
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7728
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7734
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7736
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7741
   $$2 = $or$cond ? $$0228 : $11; //@line 7746
   $$2234 = $$1233; //@line 7746
   $$2239 = $$1238; //@line 7746
   $$2251 = $11; //@line 7746
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7746
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7746
  } else if ((label | 0) == 85) {
   label = 0; //@line 7749
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7751
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7754
   $$0247 = $$1248; //@line 7754
   $$0269 = $$3272; //@line 7754
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7759
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7761
  $345 = $$$5 + $$2234 | 0; //@line 7762
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7764
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7765
  _out_670($0, $$2239, $$2234); //@line 7766
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7768
  _pad_676($0, 48, $$$5, $343, 0); //@line 7769
  _out_670($0, $$2, $343); //@line 7770
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7772
  $$0243 = $$2261; //@line 7773
  $$0247 = $$1248; //@line 7773
  $$0269 = $$3272; //@line 7773
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7781
    } else {
     $$2242302 = 1; //@line 7783
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7786
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7789
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7793
      $356 = $$2242302 + 1 | 0; //@line 7794
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7797
      } else {
       $$2242$lcssa = $356; //@line 7799
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7805
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7811
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7817
       } else {
        $$0 = 1; //@line 7819
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7824
     }
    }
   } else {
    $$0 = $$1248; //@line 7828
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7832
 return $$0 | 0; //@line 7832
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 191
 STACKTOP = STACKTOP + 96 | 0; //@line 192
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 192
 $vararg_buffer23 = sp + 72 | 0; //@line 193
 $vararg_buffer20 = sp + 64 | 0; //@line 194
 $vararg_buffer18 = sp + 56 | 0; //@line 195
 $vararg_buffer15 = sp + 48 | 0; //@line 196
 $vararg_buffer12 = sp + 40 | 0; //@line 197
 $vararg_buffer9 = sp + 32 | 0; //@line 198
 $vararg_buffer6 = sp + 24 | 0; //@line 199
 $vararg_buffer3 = sp + 16 | 0; //@line 200
 $vararg_buffer1 = sp + 8 | 0; //@line 201
 $vararg_buffer = sp; //@line 202
 $4 = sp + 80 | 0; //@line 203
 $5 = HEAP32[37] | 0; //@line 204
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 208
   FUNCTION_TABLE_v[$5 & 0](); //@line 209
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 9; //@line 212
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 214
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 216
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 218
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer6; //@line 220
    HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 222
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer6; //@line 224
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer9; //@line 226
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer9; //@line 228
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer12; //@line 230
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer12; //@line 232
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer15; //@line 234
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer15; //@line 236
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer3; //@line 238
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer3; //@line 240
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer1; //@line 242
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer1; //@line 244
    HEAP8[$AsyncCtx + 68 >> 0] = $0; //@line 246
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer20; //@line 248
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer20; //@line 250
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer; //@line 252
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer; //@line 254
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer18; //@line 256
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer18; //@line 258
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer23; //@line 260
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer23; //@line 262
    sp = STACKTOP; //@line 263
    STACKTOP = sp; //@line 264
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 266
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 269
    break;
   }
  }
 } while (0);
 $34 = HEAP32[28] | 0; //@line 274
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 278
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[25] | 0; //@line 284
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 291
       break;
      }
     }
     $43 = HEAP32[26] | 0; //@line 295
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 299
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 304
      } else {
       label = 11; //@line 306
      }
     }
    } else {
     label = 11; //@line 310
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 314
   }
   if (!((HEAP32[35] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 326
    break;
   }
   $54 = HEAPU8[96] | 0; //@line 330
   $55 = $0 & 255; //@line 331
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 336
    $$lobit = $59 >>> 6; //@line 337
    $60 = $$lobit & 255; //@line 338
    $64 = ($54 & 32 | 0) == 0; //@line 342
    $65 = HEAP32[29] | 0; //@line 343
    $66 = HEAP32[28] | 0; //@line 344
    $67 = $0 << 24 >> 24 == 1; //@line 345
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 349
      _vsnprintf($66, $65, $2, $3) | 0; //@line 350
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 10; //@line 353
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 356
       sp = STACKTOP; //@line 357
       STACKTOP = sp; //@line 358
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 360
      $69 = HEAP32[36] | 0; //@line 361
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[35] | 0; //@line 365
       $74 = HEAP32[28] | 0; //@line 366
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 367
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 368
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 13; //@line 371
        sp = STACKTOP; //@line 372
        STACKTOP = sp; //@line 373
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 375
        break;
       }
      }
      $71 = HEAP32[28] | 0; //@line 379
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 380
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 381
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 11; //@line 384
       sp = STACKTOP; //@line 385
       STACKTOP = sp; //@line 386
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 388
      $72 = HEAP32[36] | 0; //@line 389
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 390
      FUNCTION_TABLE_vi[$72 & 127](976); //@line 391
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 12; //@line 394
       sp = STACKTOP; //@line 395
       STACKTOP = sp; //@line 396
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 398
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 405
       $$1143 = $66; //@line 405
       $$1145 = $65; //@line 405
       $$3154 = 0; //@line 405
       label = 38; //@line 406
      } else {
       if ($64) {
        $$0142 = $66; //@line 409
        $$0144 = $65; //@line 409
       } else {
        $76 = _snprintf($66, $65, 978, $vararg_buffer) | 0; //@line 411
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 413
        $78 = ($$ | 0) > 0; //@line 414
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 419
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 419
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 423
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 996; //@line 429
          label = 35; //@line 430
          break;
         }
        case 1:
         {
          $$sink = 1002; //@line 434
          label = 35; //@line 435
          break;
         }
        case 3:
         {
          $$sink = 990; //@line 439
          label = 35; //@line 440
          break;
         }
        case 7:
         {
          $$sink = 984; //@line 444
          label = 35; //@line 445
          break;
         }
        default:
         {
          $$0141 = 0; //@line 449
          $$1152 = 0; //@line 449
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 453
         $$0141 = $60 & 1; //@line 456
         $$1152 = _snprintf($$0142, $$0144, 1008, $vararg_buffer1) | 0; //@line 456
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 459
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 461
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 463
         $$1$off0 = $extract$t159; //@line 468
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 468
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 468
         $$3154 = $$1152; //@line 468
         label = 38; //@line 469
        } else {
         $$1$off0 = $extract$t159; //@line 471
         $$1143 = $$0142; //@line 471
         $$1145 = $$0144; //@line 471
         $$3154 = $$1152$; //@line 471
         label = 38; //@line 472
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 485
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 486
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 487
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 14; //@line 490
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 492
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 494
           HEAP8[$AsyncCtx60 + 12 >> 0] = $$1$off0 & 1; //@line 497
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer23; //@line 499
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer23; //@line 501
           HEAP32[$AsyncCtx60 + 24 >> 2] = $$1143; //@line 503
           HEAP32[$AsyncCtx60 + 28 >> 2] = $$1145; //@line 505
           HEAP32[$AsyncCtx60 + 32 >> 2] = $55; //@line 507
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer6; //@line 509
           HEAP32[$AsyncCtx60 + 40 >> 2] = $1; //@line 511
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer6; //@line 513
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer9; //@line 515
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer9; //@line 517
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer12; //@line 519
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer12; //@line 521
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer15; //@line 523
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer15; //@line 525
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer3; //@line 527
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer3; //@line 529
           HEAP32[$AsyncCtx60 + 80 >> 2] = $4; //@line 531
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer18; //@line 533
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer18; //@line 535
           HEAP32[$AsyncCtx60 + 92 >> 2] = $2; //@line 537
           HEAP32[$AsyncCtx60 + 96 >> 2] = $3; //@line 539
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 541
           sp = STACKTOP; //@line 542
           STACKTOP = sp; //@line 543
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 545
          $125 = HEAP32[33] | 0; //@line 550
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 551
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 552
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 15; //@line 555
           HEAP32[$AsyncCtx38 + 4 >> 2] = $$1143; //@line 557
           HEAP32[$AsyncCtx38 + 8 >> 2] = $$1145; //@line 559
           HEAP32[$AsyncCtx38 + 12 >> 2] = $55; //@line 561
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer6; //@line 563
           HEAP32[$AsyncCtx38 + 20 >> 2] = $1; //@line 565
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer6; //@line 567
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer9; //@line 569
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer9; //@line 571
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer12; //@line 573
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer12; //@line 575
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer15; //@line 577
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer15; //@line 579
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer3; //@line 581
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer3; //@line 583
           HEAP32[$AsyncCtx38 + 60 >> 2] = $4; //@line 585
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer20; //@line 587
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer20; //@line 589
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer18; //@line 591
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer18; //@line 593
           HEAP32[$AsyncCtx38 + 80 >> 2] = $2; //@line 595
           HEAP32[$AsyncCtx38 + 84 >> 2] = $3; //@line 597
           HEAP8[$AsyncCtx38 + 88 >> 0] = $$1$off0 & 1; //@line 600
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer23; //@line 602
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer23; //@line 604
           sp = STACKTOP; //@line 605
           STACKTOP = sp; //@line 606
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 608
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 609
           $151 = _snprintf($$1143, $$1145, 1008, $vararg_buffer3) | 0; //@line 610
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 612
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 617
            $$3147 = $$1145 - $$10 | 0; //@line 617
            label = 44; //@line 618
            break;
           } else {
            $$3147168 = $$1145; //@line 621
            $$3169 = $$1143; //@line 621
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 626
          $$3147 = $$1145; //@line 626
          label = 44; //@line 627
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 633
          $$3169 = $$3; //@line 633
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 638
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 644
          $$5156 = _snprintf($$3169, $$3147168, 1011, $vararg_buffer6) | 0; //@line 646
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 650
          $$5156 = _snprintf($$3169, $$3147168, 1026, $vararg_buffer9) | 0; //@line 652
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 656
          $$5156 = _snprintf($$3169, $$3147168, 1041, $vararg_buffer12) | 0; //@line 658
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 662
          $$5156 = _snprintf($$3169, $$3147168, 1056, $vararg_buffer15) | 0; //@line 664
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1071, $vararg_buffer18) | 0; //@line 669
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 673
        $168 = $$3169 + $$5156$ | 0; //@line 675
        $169 = $$3147168 - $$5156$ | 0; //@line 676
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 680
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 681
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 16; //@line 684
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 686
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 688
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 691
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 693
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 695
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 697
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 699
          sp = STACKTOP; //@line 700
          STACKTOP = sp; //@line 701
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 703
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 705
         $181 = $168 + $$13 | 0; //@line 707
         $182 = $169 - $$13 | 0; //@line 708
         if (($$13 | 0) > 0) {
          $184 = HEAP32[34] | 0; //@line 711
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 716
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 717
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 17; //@line 720
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 722
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 724
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 726
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 728
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 731
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 733
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 735
             sp = STACKTOP; //@line 736
             STACKTOP = sp; //@line 737
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 739
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 740
             $194 = _snprintf($181, $182, 1008, $vararg_buffer20) | 0; //@line 741
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 743
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 748
              $$6150 = $182 - $$18 | 0; //@line 748
              $$9 = $$18; //@line 748
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 755
            $$6150 = $182; //@line 755
            $$9 = $$13; //@line 755
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1086, $vararg_buffer23) | 0; //@line 764
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[35] | 0; //@line 770
      $202 = HEAP32[28] | 0; //@line 771
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 772
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 773
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 18; //@line 776
       sp = STACKTOP; //@line 777
       STACKTOP = sp; //@line 778
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 780
       break;
      }
     }
    } while (0);
    HEAP32[32] = HEAP32[30]; //@line 786
   }
  }
 } while (0);
 $204 = HEAP32[38] | 0; //@line 790
 if (!$204) {
  STACKTOP = sp; //@line 793
  return;
 }
 $206 = HEAP32[39] | 0; //@line 795
 HEAP32[39] = 0; //@line 796
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 797
 FUNCTION_TABLE_v[$204 & 0](); //@line 798
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 19; //@line 801
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 803
  sp = STACKTOP; //@line 804
  STACKTOP = sp; //@line 805
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 807
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 810
 } else {
  STACKTOP = sp; //@line 812
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 815
  $$pre = HEAP32[38] | 0; //@line 816
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 817
  FUNCTION_TABLE_v[$$pre & 0](); //@line 818
  if (___async) {
   label = 70; //@line 821
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 824
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 827
  } else {
   label = 72; //@line 829
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 20; //@line 834
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 836
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 838
  sp = STACKTOP; //@line 839
  STACKTOP = sp; //@line 840
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 843
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11965
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11967
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11969
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11971
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11973
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11975
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11977
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11979
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11981
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11983
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11985
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11987
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11989
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11991
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11993
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11995
 $34 = HEAP8[$0 + 68 >> 0] | 0; //@line 11999
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12001
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12003
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 12005
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 12009
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 12011
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 12013
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 12015
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 12018
 $53 = HEAP32[28] | 0; //@line 12019
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 12023
   do {
    if ($34 << 24 >> 24 > -1 & ($10 | 0) != 0) {
     $57 = HEAP32[25] | 0; //@line 12029
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $10) | 0) {
       $$0$i = 1; //@line 12036
       break;
      }
     }
     $62 = HEAP32[26] | 0; //@line 12040
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 12044
     } else {
      if (!(_strstr($62, $10) | 0)) {
       $$0$i = 1; //@line 12049
      } else {
       label = 9; //@line 12051
      }
     }
    } else {
     label = 9; //@line 12055
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 12059
   }
   if (!((HEAP32[35] | 0) != 0 & ((($10 | 0) == 0 | (($6 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 12071
    break;
   }
   $73 = HEAPU8[96] | 0; //@line 12075
   $74 = $34 & 255; //@line 12076
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 12081
    $$lobit = $78 >>> 6; //@line 12082
    $79 = $$lobit & 255; //@line 12083
    $83 = ($73 & 32 | 0) == 0; //@line 12087
    $84 = HEAP32[29] | 0; //@line 12088
    $85 = HEAP32[28] | 0; //@line 12089
    $86 = $34 << 24 >> 24 == 1; //@line 12090
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 12093
     _vsnprintf($85, $84, $6, $4) | 0; //@line 12094
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 12097
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 12098
      $$expand_i1_val = $86 & 1; //@line 12099
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 12100
      sp = STACKTOP; //@line 12101
      return;
     }
     ___async_unwind = 0; //@line 12104
     HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 12105
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 12106
     $$expand_i1_val = $86 & 1; //@line 12107
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 12108
     sp = STACKTOP; //@line 12109
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 12115
     $$1143 = $85; //@line 12115
     $$1145 = $84; //@line 12115
     $$3154 = 0; //@line 12115
     label = 28; //@line 12116
    } else {
     if ($83) {
      $$0142 = $85; //@line 12119
      $$0144 = $84; //@line 12119
     } else {
      $89 = _snprintf($85, $84, 978, $40) | 0; //@line 12121
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 12123
      $91 = ($$ | 0) > 0; //@line 12124
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 12129
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 12129
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 12133
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 996; //@line 12139
        label = 25; //@line 12140
        break;
       }
      case 1:
       {
        $$sink = 1002; //@line 12144
        label = 25; //@line 12145
        break;
       }
      case 3:
       {
        $$sink = 990; //@line 12149
        label = 25; //@line 12150
        break;
       }
      case 7:
       {
        $$sink = 984; //@line 12154
        label = 25; //@line 12155
        break;
       }
      default:
       {
        $$0141 = 0; //@line 12159
        $$1152 = 0; //@line 12159
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$30 >> 2] = $$sink; //@line 12163
       $$0141 = $79 & 1; //@line 12166
       $$1152 = _snprintf($$0142, $$0144, 1008, $30) | 0; //@line 12166
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 12169
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 12171
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 12173
       $$1$off0 = $extract$t159; //@line 12178
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 12178
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 12178
       $$3154 = $$1152; //@line 12178
       label = 28; //@line 12179
      } else {
       $$1$off0 = $extract$t159; //@line 12181
       $$1143 = $$0142; //@line 12181
       $$1145 = $$0144; //@line 12181
       $$3154 = $$1152$; //@line 12181
       label = 28; //@line 12182
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
      HEAP32[$2 >> 2] = HEAP32[$4 >> 2]; //@line 12193
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 12194
      $108 = _vsnprintf(0, 0, $6, $2) | 0; //@line 12195
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 12198
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 12199
       HEAP32[$109 >> 2] = $36; //@line 12200
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 12201
       HEAP32[$110 >> 2] = $38; //@line 12202
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 12203
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 12204
       HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 12205
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 12206
       HEAP32[$112 >> 2] = $48; //@line 12207
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 12208
       HEAP32[$113 >> 2] = $50; //@line 12209
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 12210
       HEAP32[$114 >> 2] = $$1143; //@line 12211
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 12212
       HEAP32[$115 >> 2] = $$1145; //@line 12213
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 12214
       HEAP32[$116 >> 2] = $74; //@line 12215
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 12216
       HEAP32[$117 >> 2] = $8; //@line 12217
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 12218
       HEAP32[$118 >> 2] = $10; //@line 12219
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 12220
       HEAP32[$119 >> 2] = $12; //@line 12221
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 12222
       HEAP32[$120 >> 2] = $14; //@line 12223
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 12224
       HEAP32[$121 >> 2] = $16; //@line 12225
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 12226
       HEAP32[$122 >> 2] = $18; //@line 12227
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 12228
       HEAP32[$123 >> 2] = $20; //@line 12229
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 12230
       HEAP32[$124 >> 2] = $22; //@line 12231
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 12232
       HEAP32[$125 >> 2] = $24; //@line 12233
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 12234
       HEAP32[$126 >> 2] = $26; //@line 12235
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 12236
       HEAP32[$127 >> 2] = $28; //@line 12237
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 12238
       HEAP32[$128 >> 2] = $2; //@line 12239
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 12240
       HEAP32[$129 >> 2] = $44; //@line 12241
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 12242
       HEAP32[$130 >> 2] = $46; //@line 12243
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 12244
       HEAP32[$131 >> 2] = $6; //@line 12245
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 12246
       HEAP32[$132 >> 2] = $4; //@line 12247
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 12248
       HEAP32[$133 >> 2] = $$3154; //@line 12249
       sp = STACKTOP; //@line 12250
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 12254
      ___async_unwind = 0; //@line 12255
      HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 12256
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 12257
      HEAP32[$109 >> 2] = $36; //@line 12258
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 12259
      HEAP32[$110 >> 2] = $38; //@line 12260
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 12261
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 12262
      HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 12263
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 12264
      HEAP32[$112 >> 2] = $48; //@line 12265
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 12266
      HEAP32[$113 >> 2] = $50; //@line 12267
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 12268
      HEAP32[$114 >> 2] = $$1143; //@line 12269
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 12270
      HEAP32[$115 >> 2] = $$1145; //@line 12271
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 12272
      HEAP32[$116 >> 2] = $74; //@line 12273
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 12274
      HEAP32[$117 >> 2] = $8; //@line 12275
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 12276
      HEAP32[$118 >> 2] = $10; //@line 12277
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 12278
      HEAP32[$119 >> 2] = $12; //@line 12279
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 12280
      HEAP32[$120 >> 2] = $14; //@line 12281
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 12282
      HEAP32[$121 >> 2] = $16; //@line 12283
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 12284
      HEAP32[$122 >> 2] = $18; //@line 12285
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 12286
      HEAP32[$123 >> 2] = $20; //@line 12287
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 12288
      HEAP32[$124 >> 2] = $22; //@line 12289
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 12290
      HEAP32[$125 >> 2] = $24; //@line 12291
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 12292
      HEAP32[$126 >> 2] = $26; //@line 12293
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 12294
      HEAP32[$127 >> 2] = $28; //@line 12295
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 12296
      HEAP32[$128 >> 2] = $2; //@line 12297
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 12298
      HEAP32[$129 >> 2] = $44; //@line 12299
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 12300
      HEAP32[$130 >> 2] = $46; //@line 12301
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 12302
      HEAP32[$131 >> 2] = $6; //@line 12303
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 12304
      HEAP32[$132 >> 2] = $4; //@line 12305
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 12306
      HEAP32[$133 >> 2] = $$3154; //@line 12307
      sp = STACKTOP; //@line 12308
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 12313
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$8 >> 2] = $10; //@line 12319
        $$5156 = _snprintf($$1143, $$1145, 1011, $8) | 0; //@line 12321
        break;
       }
      case 1:
       {
        HEAP32[$14 >> 2] = $10; //@line 12325
        $$5156 = _snprintf($$1143, $$1145, 1026, $14) | 0; //@line 12327
        break;
       }
      case 3:
       {
        HEAP32[$18 >> 2] = $10; //@line 12331
        $$5156 = _snprintf($$1143, $$1145, 1041, $18) | 0; //@line 12333
        break;
       }
      case 7:
       {
        HEAP32[$22 >> 2] = $10; //@line 12337
        $$5156 = _snprintf($$1143, $$1145, 1056, $22) | 0; //@line 12339
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1071, $44) | 0; //@line 12344
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 12348
      $147 = $$1143 + $$5156$ | 0; //@line 12350
      $148 = $$1145 - $$5156$ | 0; //@line 12351
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 12355
       $150 = _vsnprintf($147, $148, $6, $4) | 0; //@line 12356
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12359
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 12360
        HEAP32[$151 >> 2] = $36; //@line 12361
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 12362
        HEAP32[$152 >> 2] = $38; //@line 12363
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 12364
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 12365
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 12366
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 12367
        HEAP32[$154 >> 2] = $48; //@line 12368
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 12369
        HEAP32[$155 >> 2] = $50; //@line 12370
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 12371
        HEAP32[$156 >> 2] = $148; //@line 12372
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 12373
        HEAP32[$157 >> 2] = $147; //@line 12374
        sp = STACKTOP; //@line 12375
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 12379
       ___async_unwind = 0; //@line 12380
       HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12381
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 12382
       HEAP32[$151 >> 2] = $36; //@line 12383
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 12384
       HEAP32[$152 >> 2] = $38; //@line 12385
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 12386
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 12387
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 12388
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 12389
       HEAP32[$154 >> 2] = $48; //@line 12390
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 12391
       HEAP32[$155 >> 2] = $50; //@line 12392
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 12393
       HEAP32[$156 >> 2] = $148; //@line 12394
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 12395
       HEAP32[$157 >> 2] = $147; //@line 12396
       sp = STACKTOP; //@line 12397
       return;
      }
     }
    }
    $159 = HEAP32[35] | 0; //@line 12402
    $160 = HEAP32[28] | 0; //@line 12403
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12404
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 12405
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12408
     sp = STACKTOP; //@line 12409
     return;
    }
    ___async_unwind = 0; //@line 12412
    HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12413
    sp = STACKTOP; //@line 12414
    return;
   }
  }
 } while (0);
 $161 = HEAP32[38] | 0; //@line 12419
 if (!$161) {
  return;
 }
 $163 = HEAP32[39] | 0; //@line 12424
 HEAP32[39] = 0; //@line 12425
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12426
 FUNCTION_TABLE_v[$161 & 0](); //@line 12427
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12430
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 12431
  HEAP32[$164 >> 2] = $163; //@line 12432
  sp = STACKTOP; //@line 12433
  return;
 }
 ___async_unwind = 0; //@line 12436
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12437
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 12438
 HEAP32[$164 >> 2] = $163; //@line 12439
 sp = STACKTOP; //@line 12440
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4704
 $3 = HEAP32[3825] | 0; //@line 4705
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4708
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4712
 $7 = $6 & 3; //@line 4713
 if (($7 | 0) == 1) {
  _abort(); //@line 4716
 }
 $9 = $6 & -8; //@line 4719
 $10 = $2 + $9 | 0; //@line 4720
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4725
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4731
   $17 = $13 + $9 | 0; //@line 4732
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4735
   }
   if ((HEAP32[3826] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4741
    $106 = HEAP32[$105 >> 2] | 0; //@line 4742
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4746
     $$1382 = $17; //@line 4746
     $114 = $16; //@line 4746
     break;
    }
    HEAP32[3823] = $17; //@line 4749
    HEAP32[$105 >> 2] = $106 & -2; //@line 4751
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4754
    HEAP32[$16 + $17 >> 2] = $17; //@line 4756
    return;
   }
   $21 = $13 >>> 3; //@line 4759
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4763
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4765
    $28 = 15324 + ($21 << 1 << 2) | 0; //@line 4767
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4772
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4779
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3821] = HEAP32[3821] & ~(1 << $21); //@line 4789
     $$1 = $16; //@line 4790
     $$1382 = $17; //@line 4790
     $114 = $16; //@line 4790
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4796
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4800
     }
     $41 = $26 + 8 | 0; //@line 4803
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4807
     } else {
      _abort(); //@line 4809
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4814
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4815
    $$1 = $16; //@line 4816
    $$1382 = $17; //@line 4816
    $114 = $16; //@line 4816
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4820
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4822
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4826
     $60 = $59 + 4 | 0; //@line 4827
     $61 = HEAP32[$60 >> 2] | 0; //@line 4828
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4831
      if (!$63) {
       $$3 = 0; //@line 4834
       break;
      } else {
       $$1387 = $63; //@line 4837
       $$1390 = $59; //@line 4837
      }
     } else {
      $$1387 = $61; //@line 4840
      $$1390 = $60; //@line 4840
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4843
      $66 = HEAP32[$65 >> 2] | 0; //@line 4844
      if ($66 | 0) {
       $$1387 = $66; //@line 4847
       $$1390 = $65; //@line 4847
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4850
      $69 = HEAP32[$68 >> 2] | 0; //@line 4851
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4856
       $$1390 = $68; //@line 4856
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4861
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4864
      $$3 = $$1387; //@line 4865
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4870
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4873
     }
     $53 = $51 + 12 | 0; //@line 4876
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4880
     }
     $56 = $48 + 8 | 0; //@line 4883
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4887
      HEAP32[$56 >> 2] = $51; //@line 4888
      $$3 = $48; //@line 4889
      break;
     } else {
      _abort(); //@line 4892
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4899
    $$1382 = $17; //@line 4899
    $114 = $16; //@line 4899
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4902
    $75 = 15588 + ($74 << 2) | 0; //@line 4903
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4908
      if (!$$3) {
       HEAP32[3822] = HEAP32[3822] & ~(1 << $74); //@line 4915
       $$1 = $16; //@line 4916
       $$1382 = $17; //@line 4916
       $114 = $16; //@line 4916
       break L10;
      }
     } else {
      if ((HEAP32[3825] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4923
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4931
       if (!$$3) {
        $$1 = $16; //@line 4934
        $$1382 = $17; //@line 4934
        $114 = $16; //@line 4934
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3825] | 0; //@line 4942
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4945
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4949
    $92 = $16 + 16 | 0; //@line 4950
    $93 = HEAP32[$92 >> 2] | 0; //@line 4951
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4957
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4961
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4963
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4969
    if (!$99) {
     $$1 = $16; //@line 4972
     $$1382 = $17; //@line 4972
     $114 = $16; //@line 4972
    } else {
     if ((HEAP32[3825] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4977
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4981
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4983
      $$1 = $16; //@line 4984
      $$1382 = $17; //@line 4984
      $114 = $16; //@line 4984
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4990
   $$1382 = $9; //@line 4990
   $114 = $2; //@line 4990
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4995
 }
 $115 = $10 + 4 | 0; //@line 4998
 $116 = HEAP32[$115 >> 2] | 0; //@line 4999
 if (!($116 & 1)) {
  _abort(); //@line 5003
 }
 if (!($116 & 2)) {
  if ((HEAP32[3827] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3824] | 0) + $$1382 | 0; //@line 5013
   HEAP32[3824] = $124; //@line 5014
   HEAP32[3827] = $$1; //@line 5015
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5018
   if (($$1 | 0) != (HEAP32[3826] | 0)) {
    return;
   }
   HEAP32[3826] = 0; //@line 5024
   HEAP32[3823] = 0; //@line 5025
   return;
  }
  if ((HEAP32[3826] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3823] | 0) + $$1382 | 0; //@line 5032
   HEAP32[3823] = $132; //@line 5033
   HEAP32[3826] = $114; //@line 5034
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5037
   HEAP32[$114 + $132 >> 2] = $132; //@line 5039
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5043
  $138 = $116 >>> 3; //@line 5044
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5049
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5051
    $145 = 15324 + ($138 << 1 << 2) | 0; //@line 5053
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3825] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5059
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5066
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3821] = HEAP32[3821] & ~(1 << $138); //@line 5076
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5082
    } else {
     if ((HEAP32[3825] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5087
     }
     $160 = $143 + 8 | 0; //@line 5090
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5094
     } else {
      _abort(); //@line 5096
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5101
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5102
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5105
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5107
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5111
      $180 = $179 + 4 | 0; //@line 5112
      $181 = HEAP32[$180 >> 2] | 0; //@line 5113
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5116
       if (!$183) {
        $$3400 = 0; //@line 5119
        break;
       } else {
        $$1398 = $183; //@line 5122
        $$1402 = $179; //@line 5122
       }
      } else {
       $$1398 = $181; //@line 5125
       $$1402 = $180; //@line 5125
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5128
       $186 = HEAP32[$185 >> 2] | 0; //@line 5129
       if ($186 | 0) {
        $$1398 = $186; //@line 5132
        $$1402 = $185; //@line 5132
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5135
       $189 = HEAP32[$188 >> 2] | 0; //@line 5136
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5141
        $$1402 = $188; //@line 5141
       }
      }
      if ((HEAP32[3825] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5147
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5150
       $$3400 = $$1398; //@line 5151
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5156
      if ((HEAP32[3825] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5160
      }
      $173 = $170 + 12 | 0; //@line 5163
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5167
      }
      $176 = $167 + 8 | 0; //@line 5170
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5174
       HEAP32[$176 >> 2] = $170; //@line 5175
       $$3400 = $167; //@line 5176
       break;
      } else {
       _abort(); //@line 5179
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5187
     $196 = 15588 + ($195 << 2) | 0; //@line 5188
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5193
       if (!$$3400) {
        HEAP32[3822] = HEAP32[3822] & ~(1 << $195); //@line 5200
        break L108;
       }
      } else {
       if ((HEAP32[3825] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5207
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5215
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3825] | 0; //@line 5225
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5228
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5232
     $213 = $10 + 16 | 0; //@line 5233
     $214 = HEAP32[$213 >> 2] | 0; //@line 5234
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5240
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5244
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5246
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5252
     if ($220 | 0) {
      if ((HEAP32[3825] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5258
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5262
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5264
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5273
  HEAP32[$114 + $137 >> 2] = $137; //@line 5275
  if (($$1 | 0) == (HEAP32[3826] | 0)) {
   HEAP32[3823] = $137; //@line 5279
   return;
  } else {
   $$2 = $137; //@line 5282
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5286
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5289
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5291
  $$2 = $$1382; //@line 5292
 }
 $235 = $$2 >>> 3; //@line 5294
 if ($$2 >>> 0 < 256) {
  $238 = 15324 + ($235 << 1 << 2) | 0; //@line 5298
  $239 = HEAP32[3821] | 0; //@line 5299
  $240 = 1 << $235; //@line 5300
  if (!($239 & $240)) {
   HEAP32[3821] = $239 | $240; //@line 5305
   $$0403 = $238; //@line 5307
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5307
  } else {
   $244 = $238 + 8 | 0; //@line 5309
   $245 = HEAP32[$244 >> 2] | 0; //@line 5310
   if ((HEAP32[3825] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5314
   } else {
    $$0403 = $245; //@line 5317
    $$pre$phiZ2D = $244; //@line 5317
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5320
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5322
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5324
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5326
  return;
 }
 $251 = $$2 >>> 8; //@line 5329
 if (!$251) {
  $$0396 = 0; //@line 5332
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5336
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5340
   $257 = $251 << $256; //@line 5341
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5344
   $262 = $257 << $260; //@line 5346
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5349
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5354
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5360
  }
 }
 $276 = 15588 + ($$0396 << 2) | 0; //@line 5363
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5365
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5368
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5369
 $280 = HEAP32[3822] | 0; //@line 5370
 $281 = 1 << $$0396; //@line 5371
 do {
  if (!($280 & $281)) {
   HEAP32[3822] = $280 | $281; //@line 5377
   HEAP32[$276 >> 2] = $$1; //@line 5378
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5380
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5382
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5384
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5392
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5392
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5399
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5403
    $301 = HEAP32[$299 >> 2] | 0; //@line 5405
    if (!$301) {
     label = 121; //@line 5408
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5411
     $$0384 = $301; //@line 5411
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3825] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5418
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5421
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5423
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5425
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5427
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5432
    $309 = HEAP32[$308 >> 2] | 0; //@line 5433
    $310 = HEAP32[3825] | 0; //@line 5434
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5440
     HEAP32[$308 >> 2] = $$1; //@line 5441
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5443
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5445
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5447
     break;
    } else {
     _abort(); //@line 5450
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3829] | 0) + -1 | 0; //@line 5457
 HEAP32[3829] = $319; //@line 5458
 if (!$319) {
  $$0212$in$i = 15740; //@line 5461
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5466
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5472
  }
 }
 HEAP32[3829] = -1; //@line 5475
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9815
 STACKTOP = STACKTOP + 1056 | 0; //@line 9816
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 9816
 $2 = sp + 1024 | 0; //@line 9817
 $3 = sp; //@line 9818
 HEAP32[$2 >> 2] = 0; //@line 9819
 HEAP32[$2 + 4 >> 2] = 0; //@line 9819
 HEAP32[$2 + 8 >> 2] = 0; //@line 9819
 HEAP32[$2 + 12 >> 2] = 0; //@line 9819
 HEAP32[$2 + 16 >> 2] = 0; //@line 9819
 HEAP32[$2 + 20 >> 2] = 0; //@line 9819
 HEAP32[$2 + 24 >> 2] = 0; //@line 9819
 HEAP32[$2 + 28 >> 2] = 0; //@line 9819
 $4 = HEAP8[$1 >> 0] | 0; //@line 9820
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 9824
   $$0185$ph$lcssa327 = -1; //@line 9824
   $$0187219$ph325326 = 0; //@line 9824
   $$1176$ph$ph$lcssa208 = 1; //@line 9824
   $$1186$ph$lcssa = -1; //@line 9824
   label = 26; //@line 9825
  } else {
   $$0187263 = 0; //@line 9827
   $10 = $4; //@line 9827
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 9833
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 9841
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 9844
    $$0187263 = $$0187263 + 1 | 0; //@line 9845
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9848
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9850
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9858
   if ($23) {
    $$0183$ph260 = 0; //@line 9860
    $$0185$ph259 = -1; //@line 9860
    $130 = 1; //@line 9860
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9862
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9862
     $131 = $130; //@line 9862
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9864
      $132 = $131; //@line 9864
      L10 : while (1) {
       $$0179242 = 1; //@line 9866
       $25 = $132; //@line 9866
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9870
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9872
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9878
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9882
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9887
         $$0185$ph$lcssa = $$0185$ph259; //@line 9887
         break L6;
        } else {
         $25 = $27; //@line 9885
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9891
       $132 = $37 + 1 | 0; //@line 9892
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9897
        $$0185$ph$lcssa = $$0185$ph259; //@line 9897
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9895
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9902
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9906
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9911
       $$0185$ph$lcssa = $$0185$ph259; //@line 9911
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9909
       $$0183$ph197$ph253 = $25; //@line 9909
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9916
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9921
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9921
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9919
      $$0185$ph259 = $$0183$ph197248; //@line 9919
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9926
     $$1186$ph238 = -1; //@line 9926
     $133 = 1; //@line 9926
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9928
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9928
      $135 = $133; //@line 9928
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9930
       $134 = $135; //@line 9930
       L25 : while (1) {
        $$1180222 = 1; //@line 9932
        $52 = $134; //@line 9932
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9936
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9938
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9944
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 9948
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9953
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9953
          $$0187219$ph325326 = $$0187263; //@line 9953
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9953
          $$1186$ph$lcssa = $$1186$ph238; //@line 9953
          label = 26; //@line 9954
          break L1;
         } else {
          $52 = $45; //@line 9951
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 9958
        $134 = $56 + 1 | 0; //@line 9959
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9964
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9964
         $$0187219$ph325326 = $$0187263; //@line 9964
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9964
         $$1186$ph$lcssa = $$1186$ph238; //@line 9964
         label = 26; //@line 9965
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 9962
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 9970
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 9974
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9979
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9979
        $$0187219$ph325326 = $$0187263; //@line 9979
        $$1176$ph$ph$lcssa208 = $60; //@line 9979
        $$1186$ph$lcssa = $$1186$ph238; //@line 9979
        label = 26; //@line 9980
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 9977
        $$1184$ph193$ph232 = $52; //@line 9977
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 9985
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9990
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9990
       $$0187219$ph325326 = $$0187263; //@line 9990
       $$1176$ph$ph$lcssa208 = 1; //@line 9990
       $$1186$ph$lcssa = $$1184$ph193227; //@line 9990
       label = 26; //@line 9991
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 9988
       $$1186$ph238 = $$1184$ph193227; //@line 9988
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9996
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9996
     $$0187219$ph325326 = $$0187263; //@line 9996
     $$1176$ph$ph$lcssa208 = 1; //@line 9996
     $$1186$ph$lcssa = -1; //@line 9996
     label = 26; //@line 9997
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 10000
    $$0185$ph$lcssa327 = -1; //@line 10000
    $$0187219$ph325326 = $$0187263; //@line 10000
    $$1176$ph$ph$lcssa208 = 1; //@line 10000
    $$1186$ph$lcssa = -1; //@line 10000
    label = 26; //@line 10001
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 10009
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 10010
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 10011
   $70 = $$1186$$0185 + 1 | 0; //@line 10013
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 10018
    $$3178 = $$1176$$0175; //@line 10018
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 10021
    $$0168 = 0; //@line 10025
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 10025
   }
   $78 = $$0187219$ph325326 | 63; //@line 10027
   $79 = $$0187219$ph325326 + -1 | 0; //@line 10028
   $80 = ($$0168 | 0) != 0; //@line 10029
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 10030
   $$0166 = $0; //@line 10031
   $$0169 = 0; //@line 10031
   $$0170 = $0; //@line 10031
   while (1) {
    $83 = $$0166; //@line 10034
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 10039
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 10043
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 10050
        break L35;
       } else {
        $$3173 = $86; //@line 10053
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 10058
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 10062
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 10074
      $$2181$sink = $$0187219$ph325326; //@line 10074
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 10079
      if ($105 | 0) {
       $$0169$be = 0; //@line 10087
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 10087
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 10091
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 10093
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 10097
       } else {
        $$3182221 = $111; //@line 10099
        $$pr = $113; //@line 10099
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 10107
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 10109
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 10112
          break L54;
         } else {
          $$3182221 = $118; //@line 10115
         }
        }
        $$0169$be = 0; //@line 10119
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 10119
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 10126
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 10129
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 10138
        $$2181$sink = $$3178; //@line 10138
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 10145
    $$0169 = $$0169$be; //@line 10145
    $$0170 = $$3173; //@line 10145
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10149
 return $$3 | 0; //@line 10149
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 441
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 442
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 443
 $d_sroa_0_0_extract_trunc = $b$0; //@line 444
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 445
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 446
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 448
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 451
    HEAP32[$rem + 4 >> 2] = 0; //@line 452
   }
   $_0$1 = 0; //@line 454
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 455
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 456
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 459
    $_0$0 = 0; //@line 460
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 461
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 463
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 464
   $_0$1 = 0; //@line 465
   $_0$0 = 0; //@line 466
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 467
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 470
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 475
     HEAP32[$rem + 4 >> 2] = 0; //@line 476
    }
    $_0$1 = 0; //@line 478
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 479
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 480
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 484
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 485
    }
    $_0$1 = 0; //@line 487
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 488
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 489
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 491
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 494
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 495
    }
    $_0$1 = 0; //@line 497
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 498
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 499
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 502
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 504
    $58 = 31 - $51 | 0; //@line 505
    $sr_1_ph = $57; //@line 506
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 507
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 508
    $q_sroa_0_1_ph = 0; //@line 509
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 510
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 514
    $_0$0 = 0; //@line 515
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 516
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 518
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 519
   $_0$1 = 0; //@line 520
   $_0$0 = 0; //@line 521
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 522
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 526
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 528
     $126 = 31 - $119 | 0; //@line 529
     $130 = $119 - 31 >> 31; //@line 530
     $sr_1_ph = $125; //@line 531
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 532
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 533
     $q_sroa_0_1_ph = 0; //@line 534
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 535
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 539
     $_0$0 = 0; //@line 540
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 541
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 543
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 544
    $_0$1 = 0; //@line 545
    $_0$0 = 0; //@line 546
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 547
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 549
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 552
    $89 = 64 - $88 | 0; //@line 553
    $91 = 32 - $88 | 0; //@line 554
    $92 = $91 >> 31; //@line 555
    $95 = $88 - 32 | 0; //@line 556
    $105 = $95 >> 31; //@line 557
    $sr_1_ph = $88; //@line 558
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 559
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 560
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 561
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 562
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 566
    HEAP32[$rem + 4 >> 2] = 0; //@line 567
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 570
    $_0$0 = $a$0 | 0 | 0; //@line 571
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 572
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 574
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 575
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 576
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 577
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 582
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 583
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 584
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 585
  $carry_0_lcssa$1 = 0; //@line 586
  $carry_0_lcssa$0 = 0; //@line 587
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 589
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 590
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 591
  $137$1 = tempRet0; //@line 592
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 593
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 594
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 595
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 596
  $sr_1202 = $sr_1_ph; //@line 597
  $carry_0203 = 0; //@line 598
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 600
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 601
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 602
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 603
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 604
   $150$1 = tempRet0; //@line 605
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 606
   $carry_0203 = $151$0 & 1; //@line 607
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 609
   $r_sroa_1_1200 = tempRet0; //@line 610
   $sr_1202 = $sr_1202 - 1 | 0; //@line 611
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 623
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 624
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 625
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 626
  $carry_0_lcssa$1 = 0; //@line 627
  $carry_0_lcssa$0 = $carry_0203; //@line 628
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 630
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 631
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 634
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 635
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 637
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 638
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 639
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 878
 STACKTOP = STACKTOP + 32 | 0; //@line 879
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 879
 $0 = sp; //@line 880
 _gpio_init_out($0, 50); //@line 881
 while (1) {
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 884
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 885
  _wait_ms(150); //@line 886
  if (___async) {
   label = 3; //@line 889
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 892
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 894
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 895
  _wait_ms(150); //@line 896
  if (___async) {
   label = 5; //@line 899
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 902
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 904
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 905
  _wait_ms(150); //@line 906
  if (___async) {
   label = 7; //@line 909
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 912
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 914
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 915
  _wait_ms(150); //@line 916
  if (___async) {
   label = 9; //@line 919
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 922
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 924
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 925
  _wait_ms(150); //@line 926
  if (___async) {
   label = 11; //@line 929
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 932
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 934
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 935
  _wait_ms(150); //@line 936
  if (___async) {
   label = 13; //@line 939
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 942
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 944
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 945
  _wait_ms(150); //@line 946
  if (___async) {
   label = 15; //@line 949
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 952
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 954
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 955
  _wait_ms(150); //@line 956
  if (___async) {
   label = 17; //@line 959
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 962
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 964
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 965
  _wait_ms(400); //@line 966
  if (___async) {
   label = 19; //@line 969
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 972
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 974
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 975
  _wait_ms(400); //@line 976
  if (___async) {
   label = 21; //@line 979
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 982
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 984
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 985
  _wait_ms(400); //@line 986
  if (___async) {
   label = 23; //@line 989
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 992
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 994
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 995
  _wait_ms(400); //@line 996
  if (___async) {
   label = 25; //@line 999
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1002
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1004
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1005
  _wait_ms(400); //@line 1006
  if (___async) {
   label = 27; //@line 1009
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1012
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1014
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1015
  _wait_ms(400); //@line 1016
  if (___async) {
   label = 29; //@line 1019
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1022
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1024
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1025
  _wait_ms(400); //@line 1026
  if (___async) {
   label = 31; //@line 1029
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1032
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1034
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1035
  _wait_ms(400); //@line 1036
  if (___async) {
   label = 33; //@line 1039
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1042
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 22; //@line 1046
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1048
   sp = STACKTOP; //@line 1049
   STACKTOP = sp; //@line 1050
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 23; //@line 1054
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1056
   sp = STACKTOP; //@line 1057
   STACKTOP = sp; //@line 1058
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 24; //@line 1062
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1064
   sp = STACKTOP; //@line 1065
   STACKTOP = sp; //@line 1066
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 25; //@line 1070
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1072
   sp = STACKTOP; //@line 1073
   STACKTOP = sp; //@line 1074
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 26; //@line 1078
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1080
   sp = STACKTOP; //@line 1081
   STACKTOP = sp; //@line 1082
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 27; //@line 1086
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1088
   sp = STACKTOP; //@line 1089
   STACKTOP = sp; //@line 1090
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 28; //@line 1094
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1096
   sp = STACKTOP; //@line 1097
   STACKTOP = sp; //@line 1098
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 29; //@line 1102
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1104
   sp = STACKTOP; //@line 1105
   STACKTOP = sp; //@line 1106
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 30; //@line 1110
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1112
   sp = STACKTOP; //@line 1113
   STACKTOP = sp; //@line 1114
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 31; //@line 1118
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1120
   sp = STACKTOP; //@line 1121
   STACKTOP = sp; //@line 1122
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 32; //@line 1126
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1128
   sp = STACKTOP; //@line 1129
   STACKTOP = sp; //@line 1130
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 33; //@line 1134
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1136
   sp = STACKTOP; //@line 1137
   STACKTOP = sp; //@line 1138
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 34; //@line 1142
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1144
   sp = STACKTOP; //@line 1145
   STACKTOP = sp; //@line 1146
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 35; //@line 1150
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1152
   sp = STACKTOP; //@line 1153
   STACKTOP = sp; //@line 1154
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 36; //@line 1158
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1160
   sp = STACKTOP; //@line 1161
   STACKTOP = sp; //@line 1162
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 37; //@line 1166
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1168
   sp = STACKTOP; //@line 1169
   STACKTOP = sp; //@line 1170
   return;
  }
 }
}
function _mbed_vtracef__async_cb_24($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $14 = 0, $18 = 0, $2 = 0, $22 = 0, $26 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12528
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12530
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12532
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12534
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12536
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12538
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12542
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12546
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12550
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12554
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12560
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12562
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12564
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 12568
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 12570
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 12573
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 12575
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 12577
 HEAP32[$26 >> 2] = HEAP32[___async_retval >> 2]; //@line 12580
 $50 = _snprintf($2, $4, 1008, $26) | 0; //@line 12581
 $$10 = ($50 | 0) >= ($4 | 0) ? 0 : $50; //@line 12583
 $53 = $2 + $$10 | 0; //@line 12585
 $54 = $4 - $$10 | 0; //@line 12586
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 12590
   $$3169 = $53; //@line 12590
   label = 4; //@line 12591
  }
 } else {
  $$3147168 = $4; //@line 12594
  $$3169 = $2; //@line 12594
  label = 4; //@line 12595
 }
 if ((label | 0) == 4) {
  $56 = $6 + -2 | 0; //@line 12598
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$8 >> 2] = $10; //@line 12604
    $$5156 = _snprintf($$3169, $$3147168, 1011, $8) | 0; //@line 12606
    break;
   }
  case 1:
   {
    HEAP32[$14 >> 2] = $10; //@line 12610
    $$5156 = _snprintf($$3169, $$3147168, 1026, $14) | 0; //@line 12612
    break;
   }
  case 3:
   {
    HEAP32[$18 >> 2] = $10; //@line 12616
    $$5156 = _snprintf($$3169, $$3147168, 1041, $18) | 0; //@line 12618
    break;
   }
  case 7:
   {
    HEAP32[$22 >> 2] = $10; //@line 12622
    $$5156 = _snprintf($$3169, $$3147168, 1056, $22) | 0; //@line 12624
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1071, $36) | 0; //@line 12629
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 12633
  $67 = $$3169 + $$5156$ | 0; //@line 12635
  $68 = $$3147168 - $$5156$ | 0; //@line 12636
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 12640
   $70 = _vsnprintf($67, $68, $40, $42) | 0; //@line 12641
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12644
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12645
    HEAP32[$71 >> 2] = $32; //@line 12646
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12647
    HEAP32[$72 >> 2] = $34; //@line 12648
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12649
    $$expand_i1_val = $44 & 1; //@line 12650
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 12651
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12652
    HEAP32[$74 >> 2] = $46; //@line 12653
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12654
    HEAP32[$75 >> 2] = $48; //@line 12655
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12656
    HEAP32[$76 >> 2] = $68; //@line 12657
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12658
    HEAP32[$77 >> 2] = $67; //@line 12659
    sp = STACKTOP; //@line 12660
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 12664
   ___async_unwind = 0; //@line 12665
   HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12666
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12667
   HEAP32[$71 >> 2] = $32; //@line 12668
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12669
   HEAP32[$72 >> 2] = $34; //@line 12670
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12671
   $$expand_i1_val = $44 & 1; //@line 12672
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 12673
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12674
   HEAP32[$74 >> 2] = $46; //@line 12675
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12676
   HEAP32[$75 >> 2] = $48; //@line 12677
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12678
   HEAP32[$76 >> 2] = $68; //@line 12679
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12680
   HEAP32[$77 >> 2] = $67; //@line 12681
   sp = STACKTOP; //@line 12682
   return;
  }
 }
 $79 = HEAP32[35] | 0; //@line 12686
 $80 = HEAP32[28] | 0; //@line 12687
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12688
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 12689
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12692
  sp = STACKTOP; //@line 12693
  return;
 }
 ___async_unwind = 0; //@line 12696
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12697
 sp = STACKTOP; //@line 12698
 return;
}
function _BSP_LCD_DisplayChar($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$03641$i$us = 0, $$03641$i$us5 = 0, $$03641$us$i$us = 0, $$03740$i$us = 0, $$03740$i$us6 = 0, $$03740$us$i$us = 0, $$03839$i$us = 0, $$03839$i$us10 = 0, $$03839$us$i$us = 0, $10 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $23 = 0, $26 = 0, $27 = 0, $3 = 0, $31 = 0, $32 = 0, $37 = 0, $50 = 0, $57 = 0, $58 = 0, $63 = 0, $76 = 0, $8 = 0, $88 = 0, $89 = 0, $9 = 0, $94 = 0;
 $3 = HEAP32[3967] | 0; //@line 1690
 $8 = HEAP16[$3 + 6 >> 1] | 0; //@line 1695
 $9 = $8 & 65535; //@line 1696
 $10 = Math_imul(($2 & 255) + -32 | 0, $9) | 0; //@line 1697
 $12 = HEAP16[$3 + 4 >> 1] | 0; //@line 1699
 $13 = $12 & 65535; //@line 1700
 $15 = ($13 + 7 | 0) >>> 3; //@line 1702
 $17 = (HEAP32[$3 >> 2] | 0) + (Math_imul($10, $15) | 0) | 0; //@line 1704
 if (!($8 << 16 >> 16)) {
  return;
 }
 $23 = $12 << 16 >> 16 != 0; //@line 1714
 $26 = $13 + -1 + (($12 + 7 & 248) - $13 & 255) | 0; //@line 1717
 $27 = $0 & 65535; //@line 1718
 switch ($15 & 16383) {
 case 1:
  {
   if ($23) {
    $$03641$us$i$us = $1; //@line 1723
    $$03740$us$i$us = 0; //@line 1723
   } else {
    return;
   }
   while (1) {
    $31 = HEAPU8[$17 + (Math_imul($$03740$us$i$us, $15) | 0) >> 0] | 0; //@line 1731
    $32 = $$03641$us$i$us & 65535; //@line 1732
    $$03839$us$i$us = 0; //@line 1733
    do {
     $37 = $$03839$us$i$us + $27 | 0; //@line 1739
     if (!(1 << $26 - $$03839$us$i$us & $31)) {
      _emscripten_asm_const_iiii(6, $37 & 65535 | 0, $32 | 0, HEAP32[3966] & 65535 | 0) | 0; //@line 1744
     } else {
      _emscripten_asm_const_iiii(6, $37 & 65535 | 0, $32 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 1749
     }
     $$03839$us$i$us = $$03839$us$i$us + 1 | 0; //@line 1751
    } while (($$03839$us$i$us | 0) != ($13 | 0));
    $$03740$us$i$us = $$03740$us$i$us + 1 | 0; //@line 1760
    if (($$03740$us$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$us$i$us = $$03641$us$i$us + 1 << 16 >> 16; //@line 1765
    }
   }
   return;
  }
 case 2:
  {
   $$03641$i$us = $1; //@line 1772
   $$03740$i$us = 0; //@line 1772
   while (1) {
    $50 = $17 + (Math_imul($$03740$i$us, $15) | 0) | 0; //@line 1775
    $57 = (HEAPU8[$50 >> 0] | 0) << 8 | (HEAPU8[$50 + 1 >> 0] | 0); //@line 1782
    if ($23) {
     $58 = $$03641$i$us & 65535; //@line 1784
     $$03839$i$us = 0; //@line 1785
     do {
      $63 = $$03839$i$us + $27 | 0; //@line 1791
      if (!(1 << $26 - $$03839$i$us & $57)) {
       _emscripten_asm_const_iiii(6, $63 & 65535 | 0, $58 | 0, HEAP32[3966] & 65535 | 0) | 0; //@line 1796
      } else {
       _emscripten_asm_const_iiii(6, $63 & 65535 | 0, $58 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 1801
      }
      $$03839$i$us = $$03839$i$us + 1 | 0; //@line 1803
     } while (($$03839$i$us | 0) != ($13 | 0));
    }
    $$03740$i$us = $$03740$i$us + 1 | 0; //@line 1813
    if (($$03740$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us = $$03641$i$us + 1 << 16 >> 16; //@line 1818
    }
   }
   return;
  }
 default:
  {
   if ($23) {
    $$03641$i$us5 = $1; //@line 1826
    $$03740$i$us6 = 0; //@line 1826
   } else {
    return;
   }
   while (1) {
    $76 = $17 + (Math_imul($$03740$i$us6, $15) | 0) | 0; //@line 1832
    $88 = (HEAPU8[$76 + 1 >> 0] | 0) << 8 | (HEAPU8[$76 >> 0] | 0) << 16 | (HEAPU8[$76 + 2 >> 0] | 0); //@line 1844
    $89 = $$03641$i$us5 & 65535; //@line 1845
    $$03839$i$us10 = 0; //@line 1846
    do {
     $94 = $$03839$i$us10 + $27 | 0; //@line 1852
     if (!(1 << $26 - $$03839$i$us10 & $88)) {
      _emscripten_asm_const_iiii(6, $94 & 65535 | 0, $89 | 0, HEAP32[3966] & 65535 | 0) | 0; //@line 1857
     } else {
      _emscripten_asm_const_iiii(6, $94 & 65535 | 0, $89 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 1862
     }
     $$03839$i$us10 = $$03839$i$us10 + 1 | 0; //@line 1864
    } while (($$03839$i$us10 | 0) != ($13 | 0));
    $$03740$i$us6 = $$03740$i$us6 + 1 | 0; //@line 1873
    if (($$03740$i$us6 | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us5 = $$03641$i$us5 + 1 << 16 >> 16; //@line 1878
    }
   }
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7916
      $10 = HEAP32[$9 >> 2] | 0; //@line 7917
      HEAP32[$2 >> 2] = $9 + 4; //@line 7919
      HEAP32[$0 >> 2] = $10; //@line 7920
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7936
      $17 = HEAP32[$16 >> 2] | 0; //@line 7937
      HEAP32[$2 >> 2] = $16 + 4; //@line 7939
      $20 = $0; //@line 7942
      HEAP32[$20 >> 2] = $17; //@line 7944
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7947
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7963
      $30 = HEAP32[$29 >> 2] | 0; //@line 7964
      HEAP32[$2 >> 2] = $29 + 4; //@line 7966
      $31 = $0; //@line 7967
      HEAP32[$31 >> 2] = $30; //@line 7969
      HEAP32[$31 + 4 >> 2] = 0; //@line 7972
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7988
      $41 = $40; //@line 7989
      $43 = HEAP32[$41 >> 2] | 0; //@line 7991
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7994
      HEAP32[$2 >> 2] = $40 + 8; //@line 7996
      $47 = $0; //@line 7997
      HEAP32[$47 >> 2] = $43; //@line 7999
      HEAP32[$47 + 4 >> 2] = $46; //@line 8002
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8018
      $57 = HEAP32[$56 >> 2] | 0; //@line 8019
      HEAP32[$2 >> 2] = $56 + 4; //@line 8021
      $59 = ($57 & 65535) << 16 >> 16; //@line 8023
      $62 = $0; //@line 8026
      HEAP32[$62 >> 2] = $59; //@line 8028
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 8031
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8047
      $72 = HEAP32[$71 >> 2] | 0; //@line 8048
      HEAP32[$2 >> 2] = $71 + 4; //@line 8050
      $73 = $0; //@line 8052
      HEAP32[$73 >> 2] = $72 & 65535; //@line 8054
      HEAP32[$73 + 4 >> 2] = 0; //@line 8057
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8073
      $83 = HEAP32[$82 >> 2] | 0; //@line 8074
      HEAP32[$2 >> 2] = $82 + 4; //@line 8076
      $85 = ($83 & 255) << 24 >> 24; //@line 8078
      $88 = $0; //@line 8081
      HEAP32[$88 >> 2] = $85; //@line 8083
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 8086
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8102
      $98 = HEAP32[$97 >> 2] | 0; //@line 8103
      HEAP32[$2 >> 2] = $97 + 4; //@line 8105
      $99 = $0; //@line 8107
      HEAP32[$99 >> 2] = $98 & 255; //@line 8109
      HEAP32[$99 + 4 >> 2] = 0; //@line 8112
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8128
      $109 = +HEAPF64[$108 >> 3]; //@line 8129
      HEAP32[$2 >> 2] = $108 + 8; //@line 8131
      HEAPF64[$0 >> 3] = $109; //@line 8132
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8148
      $116 = +HEAPF64[$115 >> 3]; //@line 8149
      HEAP32[$2 >> 2] = $115 + 8; //@line 8151
      HEAPF64[$0 >> 3] = $116; //@line 8152
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
 sp = STACKTOP; //@line 6816
 STACKTOP = STACKTOP + 224 | 0; //@line 6817
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6817
 $3 = sp + 120 | 0; //@line 6818
 $4 = sp + 80 | 0; //@line 6819
 $5 = sp; //@line 6820
 $6 = sp + 136 | 0; //@line 6821
 dest = $4; //@line 6822
 stop = dest + 40 | 0; //@line 6822
 do {
  HEAP32[dest >> 2] = 0; //@line 6822
  dest = dest + 4 | 0; //@line 6822
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6824
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6828
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6835
  } else {
   $43 = 0; //@line 6837
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6839
  $14 = $13 & 32; //@line 6840
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6846
  }
  $19 = $0 + 48 | 0; //@line 6848
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6853
    $24 = HEAP32[$23 >> 2] | 0; //@line 6854
    HEAP32[$23 >> 2] = $6; //@line 6855
    $25 = $0 + 28 | 0; //@line 6856
    HEAP32[$25 >> 2] = $6; //@line 6857
    $26 = $0 + 20 | 0; //@line 6858
    HEAP32[$26 >> 2] = $6; //@line 6859
    HEAP32[$19 >> 2] = 80; //@line 6860
    $28 = $0 + 16 | 0; //@line 6862
    HEAP32[$28 >> 2] = $6 + 80; //@line 6863
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6864
    if (!$24) {
     $$1 = $29; //@line 6867
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6870
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6871
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6872
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 61; //@line 6875
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6877
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6879
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6881
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6883
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6885
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6887
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6889
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6891
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6893
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6895
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6897
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6899
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6901
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6903
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6905
      sp = STACKTOP; //@line 6906
      STACKTOP = sp; //@line 6907
      return 0; //@line 6907
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6909
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6912
      HEAP32[$23 >> 2] = $24; //@line 6913
      HEAP32[$19 >> 2] = 0; //@line 6914
      HEAP32[$28 >> 2] = 0; //@line 6915
      HEAP32[$25 >> 2] = 0; //@line 6916
      HEAP32[$26 >> 2] = 0; //@line 6917
      $$1 = $$; //@line 6918
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6924
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6927
  HEAP32[$0 >> 2] = $51 | $14; //@line 6932
  if ($43 | 0) {
   ___unlockfile($0); //@line 6935
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6937
 }
 STACKTOP = sp; //@line 6939
 return $$0 | 0; //@line 6939
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10731
 STACKTOP = STACKTOP + 64 | 0; //@line 10732
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10732
 $4 = sp; //@line 10733
 $5 = HEAP32[$0 >> 2] | 0; //@line 10734
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10737
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10739
 HEAP32[$4 >> 2] = $2; //@line 10740
 HEAP32[$4 + 4 >> 2] = $0; //@line 10742
 HEAP32[$4 + 8 >> 2] = $1; //@line 10744
 HEAP32[$4 + 12 >> 2] = $3; //@line 10746
 $14 = $4 + 16 | 0; //@line 10747
 $15 = $4 + 20 | 0; //@line 10748
 $16 = $4 + 24 | 0; //@line 10749
 $17 = $4 + 28 | 0; //@line 10750
 $18 = $4 + 32 | 0; //@line 10751
 $19 = $4 + 40 | 0; //@line 10752
 dest = $14; //@line 10753
 stop = dest + 36 | 0; //@line 10753
 do {
  HEAP32[dest >> 2] = 0; //@line 10753
  dest = dest + 4 | 0; //@line 10753
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10753
 HEAP8[$14 + 38 >> 0] = 0; //@line 10753
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10758
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10761
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10762
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10763
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 67; //@line 10766
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10768
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10770
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10772
    sp = STACKTOP; //@line 10773
    STACKTOP = sp; //@line 10774
    return 0; //@line 10774
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10776
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10780
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10784
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10787
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10788
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10789
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 68; //@line 10792
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10794
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10796
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10798
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10800
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10802
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10804
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10806
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10808
    sp = STACKTOP; //@line 10809
    STACKTOP = sp; //@line 10810
    return 0; //@line 10810
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10812
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10826
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10834
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10850
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10855
  }
 } while (0);
 STACKTOP = sp; //@line 10858
 return $$0 | 0; //@line 10858
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6688
 $7 = ($2 | 0) != 0; //@line 6692
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6696
   $$03555 = $0; //@line 6697
   $$03654 = $2; //@line 6697
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6702
     $$036$lcssa64 = $$03654; //@line 6702
     label = 6; //@line 6703
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6706
    $12 = $$03654 + -1 | 0; //@line 6707
    $16 = ($12 | 0) != 0; //@line 6711
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6714
     $$03654 = $12; //@line 6714
    } else {
     $$035$lcssa = $11; //@line 6716
     $$036$lcssa = $12; //@line 6716
     $$lcssa = $16; //@line 6716
     label = 5; //@line 6717
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6722
   $$036$lcssa = $2; //@line 6722
   $$lcssa = $7; //@line 6722
   label = 5; //@line 6723
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6728
   $$036$lcssa64 = $$036$lcssa; //@line 6728
   label = 6; //@line 6729
  } else {
   $$2 = $$035$lcssa; //@line 6731
   $$3 = 0; //@line 6731
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6737
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6740
    $$3 = $$036$lcssa64; //@line 6740
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6742
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6746
      $$13745 = $$036$lcssa64; //@line 6746
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6749
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6758
       $30 = $$13745 + -4 | 0; //@line 6759
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6762
        $$13745 = $30; //@line 6762
       } else {
        $$0$lcssa = $29; //@line 6764
        $$137$lcssa = $30; //@line 6764
        label = 11; //@line 6765
        break L11;
       }
      }
      $$140 = $$046; //@line 6769
      $$23839 = $$13745; //@line 6769
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6771
      $$137$lcssa = $$036$lcssa64; //@line 6771
      label = 11; //@line 6772
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6778
      $$3 = 0; //@line 6778
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6781
      $$23839 = $$137$lcssa; //@line 6781
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6788
      $$3 = $$23839; //@line 6788
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6791
     $$23839 = $$23839 + -1 | 0; //@line 6792
     if (!$$23839) {
      $$2 = $35; //@line 6795
      $$3 = 0; //@line 6795
      break;
     } else {
      $$140 = $35; //@line 6798
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6806
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 6459
 do {
  if (!$0) {
   do {
    if (!(HEAP32[78] | 0)) {
     $34 = 0; //@line 6467
    } else {
     $12 = HEAP32[78] | 0; //@line 6469
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6470
     $13 = _fflush($12) | 0; //@line 6471
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 57; //@line 6474
      sp = STACKTOP; //@line 6475
      return 0; //@line 6476
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 6478
      $34 = $13; //@line 6479
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6485
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 6489
    } else {
     $$02327 = $$02325; //@line 6491
     $$02426 = $34; //@line 6491
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 6498
      } else {
       $28 = 0; //@line 6500
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6508
       $25 = ___fflush_unlocked($$02327) | 0; //@line 6509
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 6514
       $$1 = $25 | $$02426; //@line 6516
      } else {
       $$1 = $$02426; //@line 6518
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 6522
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6525
      if (!$$023) {
       $$024$lcssa = $$1; //@line 6528
       break L9;
      } else {
       $$02327 = $$023; //@line 6531
       $$02426 = $$1; //@line 6531
      }
     }
     HEAP32[$AsyncCtx >> 2] = 58; //@line 6534
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 6536
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 6538
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 6540
     sp = STACKTOP; //@line 6541
     return 0; //@line 6542
    }
   } while (0);
   ___ofl_unlock(); //@line 6545
   $$0 = $$024$lcssa; //@line 6546
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6552
    $5 = ___fflush_unlocked($0) | 0; //@line 6553
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 55; //@line 6556
     sp = STACKTOP; //@line 6557
     return 0; //@line 6558
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 6560
     $$0 = $5; //@line 6561
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 6566
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 6567
   $7 = ___fflush_unlocked($0) | 0; //@line 6568
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 56; //@line 6571
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6574
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6576
    sp = STACKTOP; //@line 6577
    return 0; //@line 6578
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6580
   if ($phitmp) {
    $$0 = $7; //@line 6582
   } else {
    ___unlockfile($0); //@line 6584
    $$0 = $7; //@line 6585
   }
  }
 } while (0);
 return $$0 | 0; //@line 6589
}
function _mbed_vtracef__async_cb_29($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12858
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12860
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12862
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 12865
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12867
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12869
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12871
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12875
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 12877
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 12879
 $19 = $12 - $$13 | 0; //@line 12880
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[34] | 0; //@line 12884
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1086, $8) | 0; //@line 12896
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 12899
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 12900
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 12903
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 12904
    HEAP32[$24 >> 2] = $2; //@line 12905
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 12906
    HEAP32[$25 >> 2] = $18; //@line 12907
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 12908
    HEAP32[$26 >> 2] = $19; //@line 12909
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 12910
    HEAP32[$27 >> 2] = $4; //@line 12911
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 12912
    $$expand_i1_val = $6 & 1; //@line 12913
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 12914
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 12915
    HEAP32[$29 >> 2] = $8; //@line 12916
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 12917
    HEAP32[$30 >> 2] = $10; //@line 12918
    sp = STACKTOP; //@line 12919
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 12923
   ___async_unwind = 0; //@line 12924
   HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 12925
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 12926
   HEAP32[$24 >> 2] = $2; //@line 12927
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 12928
   HEAP32[$25 >> 2] = $18; //@line 12929
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 12930
   HEAP32[$26 >> 2] = $19; //@line 12931
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 12932
   HEAP32[$27 >> 2] = $4; //@line 12933
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 12934
   $$expand_i1_val = $6 & 1; //@line 12935
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 12936
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 12937
   HEAP32[$29 >> 2] = $8; //@line 12938
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 12939
   HEAP32[$30 >> 2] = $10; //@line 12940
   sp = STACKTOP; //@line 12941
   return;
  }
 } while (0);
 $34 = HEAP32[35] | 0; //@line 12945
 $35 = HEAP32[28] | 0; //@line 12946
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12947
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 12948
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12951
  sp = STACKTOP; //@line 12952
  return;
 }
 ___async_unwind = 0; //@line 12955
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12956
 sp = STACKTOP; //@line 12957
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10913
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10919
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10925
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10928
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10929
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10930
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 71; //@line 10933
     sp = STACKTOP; //@line 10934
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10937
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10945
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10950
     $19 = $1 + 44 | 0; //@line 10951
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10957
     HEAP8[$22 >> 0] = 0; //@line 10958
     $23 = $1 + 53 | 0; //@line 10959
     HEAP8[$23 >> 0] = 0; //@line 10960
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10962
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10965
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10966
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10967
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 70; //@line 10970
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10972
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10974
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10976
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10978
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10980
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10982
      sp = STACKTOP; //@line 10983
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10986
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10990
      label = 13; //@line 10991
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10996
       label = 13; //@line 10997
      } else {
       $$037$off039 = 3; //@line 10999
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 11003
      $39 = $1 + 40 | 0; //@line 11004
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 11007
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 11017
        $$037$off039 = $$037$off038; //@line 11018
       } else {
        $$037$off039 = $$037$off038; //@line 11020
       }
      } else {
       $$037$off039 = $$037$off038; //@line 11023
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 11026
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 11033
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_30($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12967
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12969
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12971
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 12974
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12976
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12978
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12980
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12982
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12984
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12986
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12988
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12990
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12992
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12994
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12996
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12998
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 13000
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 13002
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 13004
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 13006
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 13008
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 13010
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 13012
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 13014
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 13016
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 13018
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 13024
 $56 = HEAP32[33] | 0; //@line 13025
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 13026
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 13027
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 13031
  ___async_unwind = 0; //@line 13032
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 15; //@line 13034
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $12; //@line 13036
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $14; //@line 13038
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $16; //@line 13040
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $18; //@line 13042
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $20; //@line 13044
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $22; //@line 13046
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $24; //@line 13048
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $26; //@line 13050
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $28; //@line 13052
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $30; //@line 13054
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $32; //@line 13056
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $34; //@line 13058
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $36; //@line 13060
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $38; //@line 13062
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $40; //@line 13064
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $2; //@line 13066
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $4; //@line 13068
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $42; //@line 13070
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $44; //@line 13072
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $46; //@line 13074
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $48; //@line 13076
 HEAP8[$ReallocAsyncCtx5 + 88 >> 0] = $6 & 1; //@line 13079
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $8; //@line 13081
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $10; //@line 13083
 sp = STACKTOP; //@line 13084
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 152
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 154
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 156
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 158
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[3818] | 0)) {
  _serial_init(15276, 2, 3); //@line 166
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 168
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 174
  _serial_putc(15276, $9 << 24 >> 24); //@line 175
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 178
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 179
   HEAP32[$18 >> 2] = 0; //@line 180
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 181
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 182
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 183
   HEAP32[$20 >> 2] = $2; //@line 184
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 185
   HEAP8[$21 >> 0] = $9; //@line 186
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 187
   HEAP32[$22 >> 2] = $4; //@line 188
   sp = STACKTOP; //@line 189
   return;
  }
  ___async_unwind = 0; //@line 192
  HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 193
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 194
  HEAP32[$18 >> 2] = 0; //@line 195
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 196
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 197
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 198
  HEAP32[$20 >> 2] = $2; //@line 199
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 200
  HEAP8[$21 >> 0] = $9; //@line 201
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 202
  HEAP32[$22 >> 2] = $4; //@line 203
  sp = STACKTOP; //@line 204
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 207
  _serial_putc(15276, 13); //@line 208
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 211
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 212
   HEAP8[$12 >> 0] = $9; //@line 213
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 214
   HEAP32[$13 >> 2] = 0; //@line 215
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 216
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 217
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 218
   HEAP32[$15 >> 2] = $2; //@line 219
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 220
   HEAP32[$16 >> 2] = $4; //@line 221
   sp = STACKTOP; //@line 222
   return;
  }
  ___async_unwind = 0; //@line 225
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 226
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 227
  HEAP8[$12 >> 0] = $9; //@line 228
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 229
  HEAP32[$13 >> 2] = 0; //@line 230
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 231
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 232
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 233
  HEAP32[$15 >> 2] = $2; //@line 234
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 235
  HEAP32[$16 >> 2] = $4; //@line 236
  sp = STACKTOP; //@line 237
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5500
 STACKTOP = STACKTOP + 48 | 0; //@line 5501
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 5501
 $vararg_buffer3 = sp + 16 | 0; //@line 5502
 $vararg_buffer = sp; //@line 5503
 $3 = sp + 32 | 0; //@line 5504
 $4 = $0 + 28 | 0; //@line 5505
 $5 = HEAP32[$4 >> 2] | 0; //@line 5506
 HEAP32[$3 >> 2] = $5; //@line 5507
 $7 = $0 + 20 | 0; //@line 5509
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5511
 HEAP32[$3 + 4 >> 2] = $9; //@line 5512
 HEAP32[$3 + 8 >> 2] = $1; //@line 5514
 HEAP32[$3 + 12 >> 2] = $2; //@line 5516
 $12 = $9 + $2 | 0; //@line 5517
 $13 = $0 + 60 | 0; //@line 5518
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5521
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5523
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5525
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5527
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5531
  } else {
   $$04756 = 2; //@line 5533
   $$04855 = $12; //@line 5533
   $$04954 = $3; //@line 5533
   $27 = $17; //@line 5533
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5539
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5541
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5542
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5544
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5546
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5548
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5551
    $44 = $$150 + 4 | 0; //@line 5552
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5555
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5558
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5560
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5562
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5564
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5567
     break L1;
    } else {
     $$04756 = $$1; //@line 5570
     $$04954 = $$150; //@line 5570
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5574
   HEAP32[$4 >> 2] = 0; //@line 5575
   HEAP32[$7 >> 2] = 0; //@line 5576
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5579
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5582
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5587
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5593
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5598
  $25 = $20; //@line 5599
  HEAP32[$4 >> 2] = $25; //@line 5600
  HEAP32[$7 >> 2] = $25; //@line 5601
  $$051 = $2; //@line 5602
 }
 STACKTOP = sp; //@line 5604
 return $$051 | 0; //@line 5604
}
function _mbed_error_vfprintf__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 245
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 249
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 251
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 255
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 256
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 262
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 268
  _serial_putc(15276, $13 << 24 >> 24); //@line 269
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 272
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 273
   HEAP32[$22 >> 2] = $12; //@line 274
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 275
   HEAP32[$23 >> 2] = $4; //@line 276
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 277
   HEAP32[$24 >> 2] = $6; //@line 278
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 279
   HEAP8[$25 >> 0] = $13; //@line 280
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 281
   HEAP32[$26 >> 2] = $10; //@line 282
   sp = STACKTOP; //@line 283
   return;
  }
  ___async_unwind = 0; //@line 286
  HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 287
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 288
  HEAP32[$22 >> 2] = $12; //@line 289
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 290
  HEAP32[$23 >> 2] = $4; //@line 291
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 292
  HEAP32[$24 >> 2] = $6; //@line 293
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 294
  HEAP8[$25 >> 0] = $13; //@line 295
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 296
  HEAP32[$26 >> 2] = $10; //@line 297
  sp = STACKTOP; //@line 298
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 301
  _serial_putc(15276, 13); //@line 302
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 305
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 306
   HEAP8[$16 >> 0] = $13; //@line 307
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 308
   HEAP32[$17 >> 2] = $12; //@line 309
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 310
   HEAP32[$18 >> 2] = $4; //@line 311
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 312
   HEAP32[$19 >> 2] = $6; //@line 313
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 314
   HEAP32[$20 >> 2] = $10; //@line 315
   sp = STACKTOP; //@line 316
   return;
  }
  ___async_unwind = 0; //@line 319
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 320
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 321
  HEAP8[$16 >> 0] = $13; //@line 322
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 323
  HEAP32[$17 >> 2] = $12; //@line 324
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 325
  HEAP32[$18 >> 2] = $4; //@line 326
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 327
  HEAP32[$19 >> 2] = $6; //@line 328
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 329
  HEAP32[$20 >> 2] = $10; //@line 330
  sp = STACKTOP; //@line 331
  return;
 }
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1202
 STACKTOP = STACKTOP + 128 | 0; //@line 1203
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1203
 $2 = sp; //@line 1204
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1205
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1206
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 1209
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1211
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1213
  sp = STACKTOP; //@line 1214
  STACKTOP = sp; //@line 1215
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1217
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1220
  return;
 }
 if (!(HEAP32[3818] | 0)) {
  _serial_init(15276, 2, 3); //@line 1225
  $$01213 = 0; //@line 1226
  $$014 = 0; //@line 1226
 } else {
  $$01213 = 0; //@line 1228
  $$014 = 0; //@line 1228
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1232
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1237
   _serial_putc(15276, 13); //@line 1238
   if (___async) {
    label = 8; //@line 1241
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1244
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1247
  _serial_putc(15276, $$01213 << 24 >> 24); //@line 1248
  if (___async) {
   label = 11; //@line 1251
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1254
  $24 = $$014 + 1 | 0; //@line 1255
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1258
   break;
  } else {
   $$014 = $24; //@line 1261
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 40; //@line 1265
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1267
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1269
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1271
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1273
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1275
  sp = STACKTOP; //@line 1276
  STACKTOP = sp; //@line 1277
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 41; //@line 1280
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1282
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1284
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1286
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1288
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1290
  sp = STACKTOP; //@line 1291
  STACKTOP = sp; //@line 1292
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1295
  return;
 }
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 748
 }
 ret = dest | 0; //@line 751
 dest_end = dest + num | 0; //@line 752
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 756
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 757
   dest = dest + 1 | 0; //@line 758
   src = src + 1 | 0; //@line 759
   num = num - 1 | 0; //@line 760
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 762
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 763
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 765
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 766
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 767
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 768
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 769
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 770
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 771
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 772
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 773
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 774
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 775
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 776
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 777
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 778
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 779
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 780
   dest = dest + 64 | 0; //@line 781
   src = src + 64 | 0; //@line 782
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 785
   dest = dest + 4 | 0; //@line 786
   src = src + 4 | 0; //@line 787
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 791
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 793
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 794
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 795
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 796
   dest = dest + 4 | 0; //@line 797
   src = src + 4 | 0; //@line 798
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 803
  dest = dest + 1 | 0; //@line 804
  src = src + 1 | 0; //@line 805
 }
 return ret | 0; //@line 807
}
function _BSP_LCD_FillCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04157 = 0, $$04256 = 0, $$058 = 0, $$07$i = 0, $$07$i45 = 0, $$07$i49 = 0, $$07$i53 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $14 = 0, $17 = 0, $25 = 0, $3 = 0, $33 = 0, $34 = 0, $36 = 0, $39 = 0, $47 = 0, $8 = 0, $9 = 0;
 $3 = $2 & 65535; //@line 2082
 HEAP32[3965] = HEAP32[3965] & 65535; //@line 2087
 $8 = $0 & 65535; //@line 2088
 $9 = $1 & 65535; //@line 2089
 $$04157 = 0; //@line 2090
 $$04256 = 3 - ($3 << 1) | 0; //@line 2090
 $$058 = $3; //@line 2090
 while (1) {
  if ($$058 | 0) {
   $11 = $8 - $$058 | 0; //@line 2094
   $12 = $$058 << 1; //@line 2095
   $14 = $12 & 65534; //@line 2097
   if (($12 & 65535) << 16 >> 16) {
    $17 = $$04157 + $9 & 65535; //@line 2101
    $$07$i = 0; //@line 2102
    do {
     _emscripten_asm_const_iiii(6, $$07$i + $11 & 65535 | 0, $17 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2108
     $$07$i = $$07$i + 1 | 0; //@line 2109
    } while (($$07$i | 0) != ($14 | 0));
    $25 = $9 - $$04157 & 65535; //@line 2118
    $$07$i45 = 0; //@line 2119
    do {
     _emscripten_asm_const_iiii(6, $$07$i45 + $11 & 65535 | 0, $25 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2125
     $$07$i45 = $$07$i45 + 1 | 0; //@line 2126
    } while (($$07$i45 | 0) != ($14 | 0));
   }
  }
  if ($$04157 | 0) {
   $33 = $8 - $$04157 | 0; //@line 2138
   $34 = $$04157 << 1; //@line 2139
   $36 = $34 & 65534; //@line 2141
   if (($34 & 65535) << 16 >> 16) {
    $39 = $9 - $$058 & 65535; //@line 2145
    $$07$i49 = 0; //@line 2146
    do {
     _emscripten_asm_const_iiii(6, $$07$i49 + $33 & 65535 | 0, $39 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2152
     $$07$i49 = $$07$i49 + 1 | 0; //@line 2153
    } while (($$07$i49 | 0) != ($36 | 0));
    $47 = $$058 + $9 & 65535; //@line 2162
    $$07$i53 = 0; //@line 2163
    do {
     _emscripten_asm_const_iiii(6, $$07$i53 + $33 & 65535 | 0, $47 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2169
     $$07$i53 = $$07$i53 + 1 | 0; //@line 2170
    } while (($$07$i53 | 0) != ($36 | 0));
   }
  }
  if (($$04256 | 0) < 0) {
   $$1 = $$058; //@line 2184
   $$pn = ($$04157 << 2) + 6 | 0; //@line 2184
  } else {
   $$1 = $$058 + -1 | 0; //@line 2190
   $$pn = ($$04157 - $$058 << 2) + 10 | 0; //@line 2190
  }
  $$04157 = $$04157 + 1 | 0; //@line 2193
  if ($$04157 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04256 = $$pn + $$04256 | 0; //@line 2198
   $$058 = $$1; //@line 2198
  }
 }
 HEAP32[3965] = HEAP32[3965] & 65535; //@line 2203
 _BSP_LCD_DrawCircle($0, $1, $2); //@line 2204
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10414
 STACKTOP = STACKTOP + 64 | 0; //@line 10415
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10415
 $3 = sp; //@line 10416
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 10419
 } else {
  if (!$1) {
   $$2 = 0; //@line 10423
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 10425
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 10426
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 65; //@line 10429
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 10431
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10433
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 10435
    sp = STACKTOP; //@line 10436
    STACKTOP = sp; //@line 10437
    return 0; //@line 10437
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10439
   if (!$6) {
    $$2 = 0; //@line 10442
   } else {
    dest = $3 + 4 | 0; //@line 10445
    stop = dest + 52 | 0; //@line 10445
    do {
     HEAP32[dest >> 2] = 0; //@line 10445
     dest = dest + 4 | 0; //@line 10445
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 10446
    HEAP32[$3 + 8 >> 2] = $0; //@line 10448
    HEAP32[$3 + 12 >> 2] = -1; //@line 10450
    HEAP32[$3 + 48 >> 2] = 1; //@line 10452
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 10455
    $18 = HEAP32[$2 >> 2] | 0; //@line 10456
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10457
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 10458
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 66; //@line 10461
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10463
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10465
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10467
     sp = STACKTOP; //@line 10468
     STACKTOP = sp; //@line 10469
     return 0; //@line 10469
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10471
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 10478
     $$0 = 1; //@line 10479
    } else {
     $$0 = 0; //@line 10481
    }
    $$2 = $$0; //@line 10483
   }
  }
 }
 STACKTOP = sp; //@line 10487
 return $$2 | 0; //@line 10487
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 10221
 STACKTOP = STACKTOP + 128 | 0; //@line 10222
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 10222
 $4 = sp + 124 | 0; //@line 10223
 $5 = sp; //@line 10224
 dest = $5; //@line 10225
 src = 560; //@line 10225
 stop = dest + 124 | 0; //@line 10225
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 10225
  dest = dest + 4 | 0; //@line 10225
  src = src + 4 | 0; //@line 10225
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 10231
   $$015 = 1; //@line 10231
   label = 4; //@line 10232
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 10235
   $$0 = -1; //@line 10236
  }
 } else {
  $$014 = $0; //@line 10239
  $$015 = $1; //@line 10239
  label = 4; //@line 10240
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 10244
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 10246
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 10248
  $14 = $5 + 20 | 0; //@line 10249
  HEAP32[$14 >> 2] = $$014; //@line 10250
  HEAP32[$5 + 44 >> 2] = $$014; //@line 10252
  $16 = $$014 + $$$015 | 0; //@line 10253
  $17 = $5 + 16 | 0; //@line 10254
  HEAP32[$17 >> 2] = $16; //@line 10255
  HEAP32[$5 + 28 >> 2] = $16; //@line 10257
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 10258
  $19 = _vfprintf($5, $2, $3) | 0; //@line 10259
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 63; //@line 10262
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 10264
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 10266
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10268
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 10270
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 10272
   sp = STACKTOP; //@line 10273
   STACKTOP = sp; //@line 10274
   return 0; //@line 10274
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10276
  if (!$$$015) {
   $$0 = $19; //@line 10279
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 10281
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 10286
   $$0 = $19; //@line 10287
  }
 }
 STACKTOP = sp; //@line 10290
 return $$0 | 0; //@line 10290
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6210
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6213
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6216
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6219
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6225
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6234
     $24 = $13 >>> 2; //@line 6235
     $$090 = 0; //@line 6236
     $$094 = $7; //@line 6236
     while (1) {
      $25 = $$094 >>> 1; //@line 6238
      $26 = $$090 + $25 | 0; //@line 6239
      $27 = $26 << 1; //@line 6240
      $28 = $27 + $23 | 0; //@line 6241
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6244
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6248
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6254
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6262
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6266
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6272
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6277
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6280
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6280
      }
     }
     $46 = $27 + $24 | 0; //@line 6283
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6286
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6290
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6302
     } else {
      $$4 = 0; //@line 6304
     }
    } else {
     $$4 = 0; //@line 6307
    }
   } else {
    $$4 = 0; //@line 6310
   }
  } else {
   $$4 = 0; //@line 6313
  }
 } while (0);
 return $$4 | 0; //@line 6316
}
function _main() {
 var $1 = 0, $10 = 0, $11 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2252
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2253
 _puts(12600) | 0; //@line 2254
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 48; //@line 2257
  sp = STACKTOP; //@line 2258
  return 0; //@line 2259
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2261
 _BSP_LCD_Init() | 0; //@line 2262
 $1 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 2264
 do {
  if ((_BSP_TS_Init($1, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2271
   _puts(12620) | 0; //@line 2272
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 49; //@line 2275
    sp = STACKTOP; //@line 2276
    return 0; //@line 2277
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2279
    break;
   }
  }
 } while (0);
 _BSP_LCD_Clear(-1); //@line 2284
 _BSP_LCD_SetTextColor(2016); //@line 2285
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 2288
 _BSP_LCD_SetTextColor(0); //@line 2289
 _BSP_LCD_SetBackColor(2016); //@line 2290
 _BSP_LCD_SetFont(168); //@line 2291
 _BSP_LCD_DisplayStringAt(0, 15, 12638, 1); //@line 2292
 while (1) {
  $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2294
  _BSP_TS_GetState(15872) | 0; //@line 2295
  if (___async) {
   label = 9; //@line 2298
   break;
  }
  _emscripten_free_async_context($AsyncCtx10 | 0); //@line 2301
  if (!(HEAP8[15872] | 0)) {
   continue;
  }
  $10 = HEAP16[7937] | 0; //@line 2307
  $11 = HEAP16[7939] | 0; //@line 2308
  _BSP_LCD_SetTextColor(-2048); //@line 2309
  _BSP_LCD_FillCircle($10, $11, 5); //@line 2310
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2311
  _wait_ms(10); //@line 2312
  if (___async) {
   label = 12; //@line 2315
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2318
 }
 if ((label | 0) == 9) {
  HEAP32[$AsyncCtx10 >> 2] = 50; //@line 2321
  sp = STACKTOP; //@line 2322
  return 0; //@line 2323
 } else if ((label | 0) == 12) {
  HEAP32[$AsyncCtx7 >> 2] = 51; //@line 2326
  sp = STACKTOP; //@line 2327
  return 0; //@line 2328
 }
 return 0; //@line 2330
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5875
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5880
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5885
  } else {
   $20 = $0 & 255; //@line 5887
   $21 = $0 & 255; //@line 5888
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5894
   } else {
    $26 = $1 + 20 | 0; //@line 5896
    $27 = HEAP32[$26 >> 2] | 0; //@line 5897
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5903
     HEAP8[$27 >> 0] = $20; //@line 5904
     $34 = $21; //@line 5905
    } else {
     label = 12; //@line 5907
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5912
     $32 = ___overflow($1, $0) | 0; //@line 5913
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 53; //@line 5916
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5918
      sp = STACKTOP; //@line 5919
      return 0; //@line 5920
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5922
      $34 = $32; //@line 5923
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5928
   $$0 = $34; //@line 5929
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5934
   $8 = $0 & 255; //@line 5935
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5941
    $14 = HEAP32[$13 >> 2] | 0; //@line 5942
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5948
     HEAP8[$14 >> 0] = $7; //@line 5949
     $$0 = $8; //@line 5950
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5954
   $19 = ___overflow($1, $0) | 0; //@line 5955
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 52; //@line 5958
    sp = STACKTOP; //@line 5959
    return 0; //@line 5960
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5962
    $$0 = $19; //@line 5963
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5968
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6595
 $1 = $0 + 20 | 0; //@line 6596
 $3 = $0 + 28 | 0; //@line 6598
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6604
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6605
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6606
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 59; //@line 6609
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6611
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6613
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6615
    sp = STACKTOP; //@line 6616
    return 0; //@line 6617
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6619
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6623
     break;
    } else {
     label = 5; //@line 6626
     break;
    }
   }
  } else {
   label = 5; //@line 6631
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6635
  $14 = HEAP32[$13 >> 2] | 0; //@line 6636
  $15 = $0 + 8 | 0; //@line 6637
  $16 = HEAP32[$15 >> 2] | 0; //@line 6638
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6646
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6647
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6648
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 60; //@line 6651
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6653
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6655
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6657
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6659
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6661
     sp = STACKTOP; //@line 6662
     return 0; //@line 6663
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6665
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6671
  HEAP32[$3 >> 2] = 0; //@line 6672
  HEAP32[$1 >> 2] = 0; //@line 6673
  HEAP32[$15 >> 2] = 0; //@line 6674
  HEAP32[$13 >> 2] = 0; //@line 6675
  $$0 = 0; //@line 6676
 }
 return $$0 | 0; //@line 6678
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $12 = 0, $15 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
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
 _mbed_tracef(16, 787, 792, $vararg_buffer); //@line 83
 $9 = HEAP32[$0 + 752 >> 2] | 0; //@line 85
 if (($9 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $9; //@line 88
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 90
  _mbed_tracef(16, 787, 833, $vararg_buffer4); //@line 91
  STACKTOP = sp; //@line 92
  return;
 }
 $12 = HEAP32[$0 + 756 >> 2] | 0; //@line 95
 if (($12 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $12; //@line 98
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 100
  _mbed_tracef(16, 787, 880, $vararg_buffer8); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $15 = HEAP32[$0 + 692 >> 2] | 0; //@line 105
 if (($15 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 109
  HEAP8[$0 + 782 >> 0] = $2; //@line 112
  HEAP8[$0 + 781 >> 0] = -35; //@line 114
  HEAP8[$0 + 780 >> 0] = -5; //@line 116
  HEAP8[$0 + 783 >> 0] = 1; //@line 118
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(0) | 0; //@line 121
  STACKTOP = sp; //@line 122
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $15; //@line 124
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 126
  _mbed_tracef(16, 787, 927, $vararg_buffer12); //@line 127
  STACKTOP = sp; //@line 128
  return;
 }
}
function _BSP_LCD_DisplayStringAt($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$030$lcssa = 0, $$03037 = 0, $$03136 = 0, $$032 = 0, $$03334 = 0, $$038 = 0, $$135 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $28 = 0, $29 = 0, $47 = 0, $49 = 0, $54 = 0, $7 = 0;
 if (!(HEAP8[$2 >> 0] | 0)) {
  $$030$lcssa = 0; //@line 1898
 } else {
  $$03037 = 0; //@line 1900
  $$038 = $2; //@line 1900
  while (1) {
   $$038 = $$038 + 1 | 0; //@line 1902
   $7 = $$03037 + 1 | 0; //@line 1903
   if (!(HEAP8[$$038 >> 0] | 0)) {
    $$030$lcssa = $7; //@line 1907
    break;
   } else {
    $$03037 = $7; //@line 1910
   }
  }
 }
 $10 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 1914
 $13 = HEAP16[(HEAP32[3967] | 0) + 4 >> 1] | 0; //@line 1917
 $14 = $13 & 65535; //@line 1918
 $15 = (($10 & 65535) / ($13 & 65535) | 0) & 65535; //@line 1920
 switch ($3 | 0) {
 case 1:
  {
   $$032 = ((Math_imul($15 - $$030$lcssa | 0, $14) | 0) >>> 1) + ($0 & 65535) & 65535; //@line 1929
   break;
  }
 case 2:
  {
   $$032 = (Math_imul($15 - $$030$lcssa | 0, $14) | 0) - ($0 & 65535) & 65535; //@line 1938
   break;
  }
 default:
  {
   $$032 = $0; //@line 1942
  }
 }
 $28 = (HEAP8[$2 >> 0] | 0) != 0; //@line 1946
 $29 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 1947
 if (!($28 & ($29 & 65535) >= (HEAPU16[(HEAP32[3967] | 0) + 4 >> 1] | 0))) {
  return;
 }
 $$03136 = 0; //@line 1958
 $$03334 = $2; //@line 1958
 $$135 = $$032 << 16 >> 16 > 1 ? $$032 : 1; //@line 1958
 do {
  _BSP_LCD_DisplayChar($$135, $1, HEAP8[$$03334 >> 0] | 0); //@line 1961
  $$135 = (HEAPU16[(HEAP32[3967] | 0) + 4 >> 1] | 0) + ($$135 & 65535) & 65535; //@line 1968
  $$03334 = $$03334 + 1 | 0; //@line 1969
  $$03136 = $$03136 + 1 << 16 >> 16; //@line 1970
  $47 = (HEAP8[$$03334 >> 0] | 0) != 0; //@line 1972
  $49 = (_ST7789H2_GetLcdPixelWidth() | 0) & 65535; //@line 1974
  $54 = HEAPU16[(HEAP32[3967] | 0) + 4 >> 1] | 0; //@line 1979
 } while ($47 & ($49 - (Math_imul($54, $$03136 & 65535) | 0) & 65535) >>> 0 >= $54 >>> 0);
 return;
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 6359
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 6365
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 6371
   } else {
    $7 = $1 & 255; //@line 6373
    $$03039 = $0; //@line 6374
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 6376
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 6381
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 6384
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 6389
      break;
     } else {
      $$03039 = $13; //@line 6392
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 6396
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 6397
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 6405
     $25 = $18; //@line 6405
     while (1) {
      $24 = $25 ^ $17; //@line 6407
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 6414
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 6417
      $25 = HEAP32[$31 >> 2] | 0; //@line 6418
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 6427
       break;
      } else {
       $$02936 = $31; //@line 6425
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 6432
    }
   } while (0);
   $38 = $1 & 255; //@line 6435
   $$1 = $$029$lcssa; //@line 6436
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 6438
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 6444
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 6447
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 6452
}
function _BSP_LCD_DrawCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04852 = 0, $$04951 = 0, $$053 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $17 = 0, $23 = 0, $24 = 0, $29 = 0, $3 = 0, $34 = 0, $42 = 0, $6 = 0, $7 = 0;
 $3 = $2 & 65535; //@line 2002
 $6 = $0 & 65535; //@line 2005
 $7 = $1 & 65535; //@line 2006
 $$04852 = 0; //@line 2007
 $$04951 = 3 - ($3 << 1) | 0; //@line 2007
 $$053 = $3; //@line 2007
 while (1) {
  $11 = $$04852 + $6 & 65535; //@line 2012
  $12 = $7 - $$053 & 65535; //@line 2013
  _emscripten_asm_const_iiii(6, $11 | 0, $12 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2015
  $17 = $6 - $$04852 & 65535; //@line 2018
  _emscripten_asm_const_iiii(6, $17 | 0, $12 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2020
  $23 = $$053 + $6 & 65535; //@line 2024
  $24 = $7 - $$04852 & 65535; //@line 2025
  _emscripten_asm_const_iiii(6, $23 | 0, $24 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2027
  $29 = $6 - $$053 & 65535; //@line 2030
  _emscripten_asm_const_iiii(6, $29 | 0, $24 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2032
  $34 = $$053 + $7 & 65535; //@line 2035
  _emscripten_asm_const_iiii(6, $11 | 0, $34 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2037
  _emscripten_asm_const_iiii(6, $17 | 0, $34 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2040
  $42 = $$04852 + $7 & 65535; //@line 2043
  _emscripten_asm_const_iiii(6, $23 | 0, $42 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2045
  _emscripten_asm_const_iiii(6, $29 | 0, $42 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 2048
  HEAP32[3967] = 160; //@line 2049
  if (($$04951 | 0) < 0) {
   $$1 = $$053; //@line 2054
   $$pn = ($$04852 << 2) + 6 | 0; //@line 2054
  } else {
   $$1 = $$053 + -1 | 0; //@line 2060
   $$pn = ($$04852 - $$053 << 2) + 10 | 0; //@line 2060
  }
  $$04852 = $$04852 + 1 | 0; //@line 2063
  if ($$04852 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04951 = $$pn + $$04951 | 0; //@line 2068
   $$053 = $$1; //@line 2068
  }
 }
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6101
 $4 = HEAP32[$3 >> 2] | 0; //@line 6102
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6109
   label = 5; //@line 6110
  } else {
   $$1 = 0; //@line 6112
  }
 } else {
  $12 = $4; //@line 6116
  label = 5; //@line 6117
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6121
   $10 = HEAP32[$9 >> 2] | 0; //@line 6122
   $14 = $10; //@line 6125
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6130
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6138
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6142
       $$141 = $0; //@line 6142
       $$143 = $1; //@line 6142
       $31 = $14; //@line 6142
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6145
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6152
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6157
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6160
      break L5;
     }
     $$139 = $$038; //@line 6166
     $$141 = $0 + $$038 | 0; //@line 6166
     $$143 = $1 - $$038 | 0; //@line 6166
     $31 = HEAP32[$9 >> 2] | 0; //@line 6166
    } else {
     $$139 = 0; //@line 6168
     $$141 = $0; //@line 6168
     $$143 = $1; //@line 6168
     $31 = $14; //@line 6168
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6171
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6174
   $$1 = $$139 + $$143 | 0; //@line 6176
  }
 } while (0);
 return $$1 | 0; //@line 6179
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5987
 STACKTOP = STACKTOP + 16 | 0; //@line 5988
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5988
 $2 = sp; //@line 5989
 $3 = $1 & 255; //@line 5990
 HEAP8[$2 >> 0] = $3; //@line 5991
 $4 = $0 + 16 | 0; //@line 5992
 $5 = HEAP32[$4 >> 2] | 0; //@line 5993
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6000
   label = 4; //@line 6001
  } else {
   $$0 = -1; //@line 6003
  }
 } else {
  $12 = $5; //@line 6006
  label = 4; //@line 6007
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6011
   $10 = HEAP32[$9 >> 2] | 0; //@line 6012
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6015
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6022
     HEAP8[$10 >> 0] = $3; //@line 6023
     $$0 = $13; //@line 6024
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6029
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6030
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6031
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 54; //@line 6034
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6036
    sp = STACKTOP; //@line 6037
    STACKTOP = sp; //@line 6038
    return 0; //@line 6038
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6040
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6045
   } else {
    $$0 = -1; //@line 6047
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6051
 return $$0 | 0; //@line 6051
}
function _fflush__async_cb_35($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13317
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13319
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 13321
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 13325
  } else {
   $$02327 = $$02325; //@line 13327
   $$02426 = $AsyncRetVal; //@line 13327
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 13334
    } else {
     $16 = 0; //@line 13336
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 13348
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 13351
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 13354
     break L3;
    } else {
     $$02327 = $$023; //@line 13357
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13360
   $13 = ___fflush_unlocked($$02327) | 0; //@line 13361
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 13365
    ___async_unwind = 0; //@line 13366
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 58; //@line 13368
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 13370
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 13372
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 13374
   sp = STACKTOP; //@line 13375
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 13379
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 13381
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 812
 value = value & 255; //@line 814
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 817
   ptr = ptr + 1 | 0; //@line 818
  }
  aligned_end = end & -4 | 0; //@line 821
  block_aligned_end = aligned_end - 64 | 0; //@line 822
  value4 = value | value << 8 | value << 16 | value << 24; //@line 823
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 826
   HEAP32[ptr + 4 >> 2] = value4; //@line 827
   HEAP32[ptr + 8 >> 2] = value4; //@line 828
   HEAP32[ptr + 12 >> 2] = value4; //@line 829
   HEAP32[ptr + 16 >> 2] = value4; //@line 830
   HEAP32[ptr + 20 >> 2] = value4; //@line 831
   HEAP32[ptr + 24 >> 2] = value4; //@line 832
   HEAP32[ptr + 28 >> 2] = value4; //@line 833
   HEAP32[ptr + 32 >> 2] = value4; //@line 834
   HEAP32[ptr + 36 >> 2] = value4; //@line 835
   HEAP32[ptr + 40 >> 2] = value4; //@line 836
   HEAP32[ptr + 44 >> 2] = value4; //@line 837
   HEAP32[ptr + 48 >> 2] = value4; //@line 838
   HEAP32[ptr + 52 >> 2] = value4; //@line 839
   HEAP32[ptr + 56 >> 2] = value4; //@line 840
   HEAP32[ptr + 60 >> 2] = value4; //@line 841
   ptr = ptr + 64 | 0; //@line 842
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 846
   ptr = ptr + 4 | 0; //@line 847
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 852
  ptr = ptr + 1 | 0; //@line 853
 }
 return end - num | 0; //@line 855
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13218
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 13228
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 13228
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 13228
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 13232
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 13235
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 13238
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 13246
  } else {
   $20 = 0; //@line 13248
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 13258
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 13262
  HEAP32[___async_retval >> 2] = $$1; //@line 13264
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13267
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 13268
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 13272
  ___async_unwind = 0; //@line 13273
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 58; //@line 13275
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 13277
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 13279
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 13281
 sp = STACKTOP; //@line 13282
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13132
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13134
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13136
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13138
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 13143
  } else {
   $9 = $4 + 4 | 0; //@line 13145
   $10 = HEAP32[$9 >> 2] | 0; //@line 13146
   $11 = $4 + 8 | 0; //@line 13147
   $12 = HEAP32[$11 >> 2] | 0; //@line 13148
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 13152
    HEAP32[$6 >> 2] = 0; //@line 13153
    HEAP32[$2 >> 2] = 0; //@line 13154
    HEAP32[$11 >> 2] = 0; //@line 13155
    HEAP32[$9 >> 2] = 0; //@line 13156
    $$0 = 0; //@line 13157
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 13164
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 13165
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 13166
   if (!___async) {
    ___async_unwind = 0; //@line 13169
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 13171
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 13173
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 13175
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 13177
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 13179
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 13181
   sp = STACKTOP; //@line 13182
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 13187
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_5($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11487
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11489
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11491
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11493
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11495
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 11500
  return;
 }
 dest = $2 + 4 | 0; //@line 11504
 stop = dest + 52 | 0; //@line 11504
 do {
  HEAP32[dest >> 2] = 0; //@line 11504
  dest = dest + 4 | 0; //@line 11504
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 11505
 HEAP32[$2 + 8 >> 2] = $4; //@line 11507
 HEAP32[$2 + 12 >> 2] = -1; //@line 11509
 HEAP32[$2 + 48 >> 2] = 1; //@line 11511
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 11514
 $16 = HEAP32[$6 >> 2] | 0; //@line 11515
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 11516
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 11517
 if (!___async) {
  ___async_unwind = 0; //@line 11520
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 66; //@line 11522
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 11524
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 11526
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 11528
 sp = STACKTOP; //@line 11529
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9367
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9372
    $$0 = 1; //@line 9373
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9386
     $$0 = 1; //@line 9387
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9391
     $$0 = -1; //@line 9392
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9402
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9406
    $$0 = 2; //@line 9407
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9419
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9425
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9429
    $$0 = 3; //@line 9430
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9440
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9446
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9452
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9456
    $$0 = 4; //@line 9457
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9461
    $$0 = -1; //@line 9462
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9467
}
function _main__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11339
 _BSP_LCD_Init() | 0; //@line 11340
 $2 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 11342
 if ((_BSP_TS_Init($2, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 11348
  _puts(12620) | 0; //@line 11349
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 49; //@line 11352
   sp = STACKTOP; //@line 11353
   return;
  }
  ___async_unwind = 0; //@line 11356
  HEAP32[$ReallocAsyncCtx >> 2] = 49; //@line 11357
  sp = STACKTOP; //@line 11358
  return;
 }
 _BSP_LCD_Clear(-1); //@line 11361
 _BSP_LCD_SetTextColor(2016); //@line 11362
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 11365
 _BSP_LCD_SetTextColor(0); //@line 11366
 _BSP_LCD_SetBackColor(2016); //@line 11367
 _BSP_LCD_SetFont(168); //@line 11368
 _BSP_LCD_DisplayStringAt(0, 15, 12638, 1); //@line 11369
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11370
 _BSP_TS_GetState(15872) | 0; //@line 11371
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 11374
  sp = STACKTOP; //@line 11375
  return;
 }
 ___async_unwind = 0; //@line 11378
 HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 11379
 sp = STACKTOP; //@line 11380
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 8251
  $8 = $0; //@line 8251
  $9 = $1; //@line 8251
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8253
   $$0914 = $$0914 + -1 | 0; //@line 8257
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8258
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8259
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8267
   }
  }
  $$010$lcssa$off0 = $8; //@line 8272
  $$09$lcssa = $$0914; //@line 8272
 } else {
  $$010$lcssa$off0 = $0; //@line 8274
  $$09$lcssa = $2; //@line 8274
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8278
 } else {
  $$012 = $$010$lcssa$off0; //@line 8280
  $$111 = $$09$lcssa; //@line 8280
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8285
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8286
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8290
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8293
    $$111 = $26; //@line 8293
   }
  }
 }
 return $$1$lcssa | 0; //@line 8297
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 5753
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5758
   label = 4; //@line 5759
  } else {
   $$01519 = $0; //@line 5761
   $23 = $1; //@line 5761
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5766
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5769
    $23 = $6; //@line 5770
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 5774
     label = 4; //@line 5775
     break;
    } else {
     $$01519 = $6; //@line 5778
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 5784
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 5786
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 5794
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 5802
  } else {
   $$pn = $$0; //@line 5804
   while (1) {
    $19 = $$pn + 1 | 0; //@line 5806
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 5810
     break;
    } else {
     $$pn = $19; //@line 5813
    }
   }
  }
  $$sink = $$1$lcssa; //@line 5818
 }
 return $$sink - $1 | 0; //@line 5821
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10661
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10668
   $10 = $1 + 16 | 0; //@line 10669
   $11 = HEAP32[$10 >> 2] | 0; //@line 10670
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10673
    HEAP32[$1 + 24 >> 2] = $4; //@line 10675
    HEAP32[$1 + 36 >> 2] = 1; //@line 10677
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10687
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10692
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10695
    HEAP8[$1 + 54 >> 0] = 1; //@line 10697
    break;
   }
   $21 = $1 + 24 | 0; //@line 10700
   $22 = HEAP32[$21 >> 2] | 0; //@line 10701
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10704
    $28 = $4; //@line 10705
   } else {
    $28 = $22; //@line 10707
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10716
   }
  }
 } while (0);
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10316
 $1 = HEAP32[46] | 0; //@line 10317
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 10323
 } else {
  $19 = 0; //@line 10325
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 10331
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 10337
    $12 = HEAP32[$11 >> 2] | 0; //@line 10338
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 10344
     HEAP8[$12 >> 0] = 10; //@line 10345
     $22 = 0; //@line 10346
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10350
   $17 = ___overflow($1, 10) | 0; //@line 10351
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 64; //@line 10354
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 10356
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 10358
    sp = STACKTOP; //@line 10359
    return 0; //@line 10360
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10362
    $22 = $17 >> 31; //@line 10364
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 10371
 }
 return $22 | 0; //@line 10373
}
function _mbed_vtracef__async_cb_25($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12705
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12707
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12709
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12711
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 12716
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12718
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 12723
 $16 = _snprintf($4, $6, 1008, $2) | 0; //@line 12724
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 12726
 $19 = $4 + $$18 | 0; //@line 12728
 $20 = $6 - $$18 | 0; //@line 12729
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1086, $12) | 0; //@line 12737
  }
 }
 $23 = HEAP32[35] | 0; //@line 12740
 $24 = HEAP32[28] | 0; //@line 12741
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12742
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 12743
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12746
  sp = STACKTOP; //@line 12747
  return;
 }
 ___async_unwind = 0; //@line 12750
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12751
 sp = STACKTOP; //@line 12752
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11207
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11209
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11211
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11215
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 11219
  label = 4; //@line 11220
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 11225
   label = 4; //@line 11226
  } else {
   $$037$off039 = 3; //@line 11228
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 11232
  $17 = $8 + 40 | 0; //@line 11233
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 11236
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 11246
    $$037$off039 = $$037$off038; //@line 11247
   } else {
    $$037$off039 = $$037$off038; //@line 11249
   }
  } else {
   $$037$off039 = $$037$off038; //@line 11252
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 11255
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10520
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10529
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10534
      HEAP32[$13 >> 2] = $2; //@line 10535
      $19 = $1 + 40 | 0; //@line 10536
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10539
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10549
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10553
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10560
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
 $$016 = 0; //@line 9487
 while (1) {
  if ((HEAPU8[13189 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9494
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9497
  if (($7 | 0) == 87) {
   $$01214 = 13277; //@line 9500
   $$115 = 87; //@line 9500
   label = 5; //@line 9501
   break;
  } else {
   $$016 = $7; //@line 9504
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 13277; //@line 9510
  } else {
   $$01214 = 13277; //@line 9512
   $$115 = $$016; //@line 9512
   label = 5; //@line 9513
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9518
   $$113 = $$01214; //@line 9519
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9523
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9530
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9533
    break;
   } else {
    $$01214 = $$113; //@line 9536
    label = 5; //@line 9537
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9544
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 9560
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 9564
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 9567
   if (!$5) {
    $$0 = 0; //@line 9570
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 9576
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 9582
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 9589
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 9596
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 9603
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 9610
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 9617
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 9621
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 9631
}
function _mbed_vtracef__async_cb_31($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13090
 $3 = HEAP32[36] | 0; //@line 13094
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[28] | 0; //@line 13098
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13099
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 13100
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 13103
   sp = STACKTOP; //@line 13104
   return;
  }
  ___async_unwind = 0; //@line 13107
  HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 13108
  sp = STACKTOP; //@line 13109
  return;
 } else {
  $6 = HEAP32[35] | 0; //@line 13112
  $7 = HEAP32[28] | 0; //@line 13113
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 13114
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 13115
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 13118
   sp = STACKTOP; //@line 13119
   return;
  }
  ___async_unwind = 0; //@line 13122
  HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 13123
  sp = STACKTOP; //@line 13124
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 9756
 $32 = $0 + 3 | 0; //@line 9770
 $33 = HEAP8[$32 >> 0] | 0; //@line 9771
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 9773
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 9778
  $$sink21$lcssa = $32; //@line 9778
 } else {
  $$sink2123 = $32; //@line 9780
  $39 = $35; //@line 9780
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 9783
   $41 = HEAP8[$40 >> 0] | 0; //@line 9784
   $39 = $39 << 8 | $41 & 255; //@line 9786
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 9791
    $$sink21$lcssa = $40; //@line 9791
    break;
   } else {
    $$sink2123 = $40; //@line 9794
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 9801
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1376
 $2 = $0 + 12 | 0; //@line 1378
 $3 = HEAP32[$2 >> 2] | 0; //@line 1379
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1383
   _mbed_assert_internal(1214, 1219, 528); //@line 1384
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 44; //@line 1387
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1389
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1391
    sp = STACKTOP; //@line 1392
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1395
    $8 = HEAP32[$2 >> 2] | 0; //@line 1397
    break;
   }
  } else {
   $8 = $3; //@line 1401
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1404
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1406
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1407
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 1410
  sp = STACKTOP; //@line 1411
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1414
  return;
 }
}
function _main__async_cb_4($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11400
 if (!(HEAP8[15872] | 0)) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11404
  _BSP_TS_GetState(15872) | 0; //@line 11405
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 11408
   sp = STACKTOP; //@line 11409
   return;
  }
  ___async_unwind = 0; //@line 11412
  HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 11413
  sp = STACKTOP; //@line 11414
  return;
 } else {
  $3 = HEAP16[7937] | 0; //@line 11417
  $4 = HEAP16[7939] | 0; //@line 11418
  _BSP_LCD_SetTextColor(-2048); //@line 11419
  _BSP_LCD_FillCircle($3, $4, 5); //@line 11420
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 11421
  _wait_ms(10); //@line 11422
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 11425
   sp = STACKTOP; //@line 11426
   return;
  }
  ___async_unwind = 0; //@line 11429
  HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 11430
  sp = STACKTOP; //@line 11431
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 9690
 $23 = $0 + 2 | 0; //@line 9699
 $24 = HEAP8[$23 >> 0] | 0; //@line 9700
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 9703
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 9708
  $$lcssa = $24; //@line 9708
 } else {
  $$01618 = $23; //@line 9710
  $$019 = $27; //@line 9710
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 9712
   $31 = HEAP8[$30 >> 0] | 0; //@line 9713
   $$019 = ($$019 | $31 & 255) << 8; //@line 9716
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 9721
    $$lcssa = $31; //@line 9721
    break;
   } else {
    $$01618 = $30; //@line 9724
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 9731
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11084
 STACKTOP = STACKTOP + 16 | 0; //@line 11085
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11085
 $3 = sp; //@line 11086
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11088
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11091
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11092
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11093
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 73; //@line 11096
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11098
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11100
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11102
  sp = STACKTOP; //@line 11103
  STACKTOP = sp; //@line 11104
  return 0; //@line 11104
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11106
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11110
 }
 STACKTOP = sp; //@line 11112
 return $8 & 1 | 0; //@line 11112
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9318
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9318
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9319
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9320
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9329
    $$016 = $9; //@line 9332
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9332
   } else {
    $$016 = $0; //@line 9334
    $storemerge = 0; //@line 9334
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9336
   $$0 = $$016; //@line 9337
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9341
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9347
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9350
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9350
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9351
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11148
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11156
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11158
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11160
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11162
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11164
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11166
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11168
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 11179
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 11180
 HEAP32[$10 >> 2] = 0; //@line 11181
 HEAP32[$12 >> 2] = 0; //@line 11182
 HEAP32[$14 >> 2] = 0; //@line 11183
 HEAP32[$2 >> 2] = 0; //@line 11184
 $33 = HEAP32[$16 >> 2] | 0; //@line 11185
 HEAP32[$16 >> 2] = $33 | $18; //@line 11190
 if ($20 | 0) {
  ___unlockfile($22); //@line 11193
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 11196
 return;
}
function _mbed_vtracef__async_cb_28($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12821
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12825
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 12830
 $$pre = HEAP32[38] | 0; //@line 12831
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12832
 FUNCTION_TABLE_v[$$pre & 0](); //@line 12833
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12836
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 12837
  HEAP32[$6 >> 2] = $4; //@line 12838
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 12839
  HEAP32[$7 >> 2] = $5; //@line 12840
  sp = STACKTOP; //@line 12841
  return;
 }
 ___async_unwind = 0; //@line 12844
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12845
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 12846
 HEAP32[$6 >> 2] = $4; //@line 12847
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 12848
 HEAP32[$7 >> 2] = $5; //@line 12849
 sp = STACKTOP; //@line 12850
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
 sp = STACKTOP; //@line 10876
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10882
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10885
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10888
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10889
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10890
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 69; //@line 10893
    sp = STACKTOP; //@line 10894
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10897
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_27($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12788
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12790
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 12795
 $$pre = HEAP32[38] | 0; //@line 12796
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12797
 FUNCTION_TABLE_v[$$pre & 0](); //@line 12798
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12801
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 12802
  HEAP32[$5 >> 2] = $2; //@line 12803
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 12804
  HEAP32[$6 >> 2] = $4; //@line 12805
  sp = STACKTOP; //@line 12806
  return;
 }
 ___async_unwind = 0; //@line 12809
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12810
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 12811
 HEAP32[$5 >> 2] = $2; //@line 12812
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 12813
 HEAP32[$6 >> 2] = $4; //@line 12814
 sp = STACKTOP; //@line 12815
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11045
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11051
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 11054
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 11057
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11058
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 11059
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 72; //@line 11062
    sp = STACKTOP; //@line 11063
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11066
    break;
   }
  }
 } while (0);
 return;
}
function ___dynamic_cast__async_cb_38($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 90
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 92
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 94
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 100
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 115
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 131
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 136
    break;
   }
  default:
   {
    $$0 = 0; //@line 140
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 145
 return;
}
function _mbed_error_vfprintf__async_cb_40($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 338
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 340
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 342
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 344
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 346
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 348
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 350
 _serial_putc(15276, $2 << 24 >> 24); //@line 351
 if (!___async) {
  ___async_unwind = 0; //@line 354
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 356
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 358
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 360
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 362
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 364
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 366
 sp = STACKTOP; //@line 367
 return;
}
function _BSP_LCD_Clear($0) {
 $0 = $0 | 0;
 var $$011 = 0, $$07$i = 0, $1 = 0, $14 = 0, $3 = 0, $4 = 0, $6 = 0, $7 = 0;
 $1 = HEAP32[3965] | 0; //@line 1587
 HEAP32[3965] = $0 & 65535; //@line 1589
 $3 = _ST7789H2_GetLcdPixelHeight() | 0; //@line 1590
 $4 = $3 & 65535; //@line 1591
 if (!($3 << 16 >> 16)) {
  $14 = $1 & 65535; //@line 1594
  HEAP32[3965] = $14; //@line 1595
  return;
 } else {
  $$011 = 0; //@line 1598
 }
 do {
  $6 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 1601
  $7 = $6 & 65535; //@line 1602
  if ($6 << 16 >> 16) {
   $$07$i = 0; //@line 1605
   do {
    _emscripten_asm_const_iiii(6, $$07$i | 0, $$011 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 1609
    $$07$i = $$07$i + 1 | 0; //@line 1610
   } while (($$07$i | 0) != ($7 | 0));
  }
  $$011 = $$011 + 1 | 0; //@line 1619
 } while (($$011 | 0) != ($4 | 0));
 $14 = $1 & 65535; //@line 1627
 HEAP32[3965] = $14; //@line 1628
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 8316
 STACKTOP = STACKTOP + 256 | 0; //@line 8317
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 8317
 $5 = sp; //@line 8318
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8324
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8328
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8331
   $$011 = $9; //@line 8332
   do {
    _out_670($0, $5, 256); //@line 8334
    $$011 = $$011 + -256 | 0; //@line 8335
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8344
  } else {
   $$0$lcssa = $9; //@line 8346
  }
  _out_670($0, $5, $$0$lcssa); //@line 8348
 }
 STACKTOP = sp; //@line 8350
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5611
 STACKTOP = STACKTOP + 32 | 0; //@line 5612
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5612
 $vararg_buffer = sp; //@line 5613
 $3 = sp + 20 | 0; //@line 5614
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5618
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5620
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5622
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5624
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5626
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5631
  $10 = -1; //@line 5632
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5635
 }
 STACKTOP = sp; //@line 5637
 return $10 | 0; //@line 5637
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10195
 STACKTOP = STACKTOP + 16 | 0; //@line 10196
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10196
 $3 = sp; //@line 10197
 HEAP32[$3 >> 2] = $varargs; //@line 10198
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10199
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 10200
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 62; //@line 10203
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10205
  sp = STACKTOP; //@line 10206
  STACKTOP = sp; //@line 10207
  return 0; //@line 10207
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10209
  STACKTOP = sp; //@line 10210
  return $4 | 0; //@line 10210
 }
 return 0; //@line 10212
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 851
 STACKTOP = STACKTOP + 16 | 0; //@line 852
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 852
 $vararg_buffer = sp; //@line 853
 HEAP32[$vararg_buffer >> 2] = $0; //@line 854
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 856
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 858
 _mbed_error_printf(1091, $vararg_buffer); //@line 859
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 860
 _mbed_die(); //@line 861
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 21; //@line 864
  sp = STACKTOP; //@line 865
  STACKTOP = sp; //@line 866
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 868
  STACKTOP = sp; //@line 869
  return;
 }
}
function _mbed_vtracef__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12758
 HEAP32[32] = HEAP32[30]; //@line 12760
 $2 = HEAP32[38] | 0; //@line 12761
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 12766
 HEAP32[39] = 0; //@line 12767
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12768
 FUNCTION_TABLE_v[$2 & 0](); //@line 12769
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12772
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12773
  HEAP32[$5 >> 2] = $4; //@line 12774
  sp = STACKTOP; //@line 12775
  return;
 }
 ___async_unwind = 0; //@line 12778
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12779
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12780
 HEAP32[$5 >> 2] = $4; //@line 12781
 sp = STACKTOP; //@line 12782
 return;
}
function _mbed_vtracef__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12494
 HEAP32[32] = HEAP32[30]; //@line 12496
 $2 = HEAP32[38] | 0; //@line 12497
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 12502
 HEAP32[39] = 0; //@line 12503
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12504
 FUNCTION_TABLE_v[$2 & 0](); //@line 12505
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12508
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12509
  HEAP32[$5 >> 2] = $4; //@line 12510
  sp = STACKTOP; //@line 12511
  return;
 }
 ___async_unwind = 0; //@line 12514
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12515
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12516
 HEAP32[$5 >> 2] = $4; //@line 12517
 sp = STACKTOP; //@line 12518
 return;
}
function _mbed_vtracef__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12464
 HEAP32[32] = HEAP32[30]; //@line 12466
 $2 = HEAP32[38] | 0; //@line 12467
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 12472
 HEAP32[39] = 0; //@line 12473
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12474
 FUNCTION_TABLE_v[$2 & 0](); //@line 12475
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12478
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12479
  HEAP32[$5 >> 2] = $4; //@line 12480
  sp = STACKTOP; //@line 12481
  return;
 }
 ___async_unwind = 0; //@line 12484
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12485
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12486
 HEAP32[$5 >> 2] = $4; //@line 12487
 sp = STACKTOP; //@line 12488
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 10598
 $5 = HEAP32[$4 >> 2] | 0; //@line 10599
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10603
   HEAP32[$1 + 24 >> 2] = $3; //@line 10605
   HEAP32[$1 + 36 >> 2] = 1; //@line 10607
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10611
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10614
    HEAP32[$1 + 24 >> 2] = 2; //@line 10616
    HEAP8[$1 + 54 >> 0] = 1; //@line 10618
    break;
   }
   $10 = $1 + 24 | 0; //@line 10621
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10625
   }
  }
 } while (0);
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11313
 _BSP_LCD_Clear(-1); //@line 11314
 _BSP_LCD_SetTextColor(2016); //@line 11315
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 11318
 _BSP_LCD_SetTextColor(0); //@line 11319
 _BSP_LCD_SetBackColor(2016); //@line 11320
 _BSP_LCD_SetFont(168); //@line 11321
 _BSP_LCD_DisplayStringAt(0, 15, 12638, 1); //@line 11322
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11323
 _BSP_TS_GetState(15872) | 0; //@line 11324
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 11327
  sp = STACKTOP; //@line 11328
  return;
 }
 ___async_unwind = 0; //@line 11331
 HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 11332
 sp = STACKTOP; //@line 11333
 return;
}
function _BSP_TS_GetState($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2218
 $1 = _emscripten_asm_const_i(7) | 0; //@line 2219
 $2 = _emscripten_asm_const_i(8) | 0; //@line 2220
 $3 = ($1 | 0) != -1; //@line 2221
 $4 = ($2 | 0) != -1; //@line 2222
 HEAP8[$0 >> 0] = $3 & $4 & 1; //@line 2225
 if ($3) {
  HEAP16[$0 + 2 >> 1] = $1; //@line 2229
 }
 if ($4) {
  HEAP16[$0 + 6 >> 1] = $2; //@line 2234
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2236
 _wait_ms(1); //@line 2237
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 2240
  sp = STACKTOP; //@line 2241
  return 0; //@line 2242
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2244
  return 0; //@line 2245
 }
 return 0; //@line 2247
}
function _BSP_LCD_FillRect($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $$04 = 0, $$07$i = 0, $6 = 0, $8 = 0, $9 = 0;
 HEAP32[3965] = HEAP32[3965] & 65535; //@line 1641
 $6 = $2 & 65535; //@line 1642
 $8 = $0 & 65535; //@line 1644
 if (!($2 << 16 >> 16)) {
  return;
 } else {
  $$0 = $3; //@line 1648
  $$04 = $1; //@line 1648
 }
 while (1) {
  $9 = $$04 & 65535; //@line 1651
  $$07$i = 0; //@line 1652
  do {
   _emscripten_asm_const_iiii(6, $$07$i + $8 & 65535 | 0, $9 | 0, HEAP32[3965] & 65535 | 0) | 0; //@line 1658
   $$07$i = $$07$i + 1 | 0; //@line 1659
  } while (($$07$i | 0) != ($6 | 0));
  if (!($$0 << 16 >> 16)) {
   break;
  } else {
   $$0 = $$0 + -1 << 16 >> 16; //@line 1673
   $$04 = $$04 + 1 << 16 >> 16; //@line 1673
  }
 }
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5718
 $3 = HEAP8[$1 >> 0] | 0; //@line 5719
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5724
  $$lcssa8 = $2; //@line 5724
 } else {
  $$011 = $1; //@line 5726
  $$0710 = $0; //@line 5726
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5728
   $$011 = $$011 + 1 | 0; //@line 5729
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5730
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5731
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5736
  $$lcssa8 = $8; //@line 5736
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5746
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 10160
  } else {
   $$01318 = $0; //@line 10162
   $$01417 = $2; //@line 10162
   $$019 = $1; //@line 10162
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 10164
    $5 = HEAP8[$$019 >> 0] | 0; //@line 10165
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 10170
    if (!$$01417) {
     $14 = 0; //@line 10175
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 10178
     $$019 = $$019 + 1 | 0; //@line 10178
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 10184
  }
 } while (0);
 return $14 | 0; //@line 10187
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1348
 $2 = HEAP32[46] | 0; //@line 1349
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1350
 _putc($1, $2) | 0; //@line 1351
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 42; //@line 1354
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1356
  sp = STACKTOP; //@line 1357
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1360
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1361
 _fflush($2) | 0; //@line 1362
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 1365
  sp = STACKTOP; //@line 1366
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1369
  return;
 }
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 11922
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11924
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11926
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 11927
 _wait_ms(150); //@line 11928
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 23; //@line 11931
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11932
  HEAP32[$4 >> 2] = $2; //@line 11933
  sp = STACKTOP; //@line 11934
  return;
 }
 ___async_unwind = 0; //@line 11937
 HEAP32[$ReallocAsyncCtx15 >> 2] = 23; //@line 11938
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11939
 HEAP32[$4 >> 2] = $2; //@line 11940
 sp = STACKTOP; //@line 11941
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 11897
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11899
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11901
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 11902
 _wait_ms(150); //@line 11903
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 24; //@line 11906
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11907
  HEAP32[$4 >> 2] = $2; //@line 11908
  sp = STACKTOP; //@line 11909
  return;
 }
 ___async_unwind = 0; //@line 11912
 HEAP32[$ReallocAsyncCtx14 >> 2] = 24; //@line 11913
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11914
 HEAP32[$4 >> 2] = $2; //@line 11915
 sp = STACKTOP; //@line 11916
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 11872
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11874
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11876
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 11877
 _wait_ms(150); //@line 11878
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 25; //@line 11881
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11882
  HEAP32[$4 >> 2] = $2; //@line 11883
  sp = STACKTOP; //@line 11884
  return;
 }
 ___async_unwind = 0; //@line 11887
 HEAP32[$ReallocAsyncCtx13 >> 2] = 25; //@line 11888
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11889
 HEAP32[$4 >> 2] = $2; //@line 11890
 sp = STACKTOP; //@line 11891
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 11847
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11849
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11851
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 11852
 _wait_ms(150); //@line 11853
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 26; //@line 11856
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11857
  HEAP32[$4 >> 2] = $2; //@line 11858
  sp = STACKTOP; //@line 11859
  return;
 }
 ___async_unwind = 0; //@line 11862
 HEAP32[$ReallocAsyncCtx12 >> 2] = 26; //@line 11863
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11864
 HEAP32[$4 >> 2] = $2; //@line 11865
 sp = STACKTOP; //@line 11866
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 11822
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11824
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11826
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 11827
 _wait_ms(150); //@line 11828
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 27; //@line 11831
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11832
  HEAP32[$4 >> 2] = $2; //@line 11833
  sp = STACKTOP; //@line 11834
  return;
 }
 ___async_unwind = 0; //@line 11837
 HEAP32[$ReallocAsyncCtx11 >> 2] = 27; //@line 11838
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11839
 HEAP32[$4 >> 2] = $2; //@line 11840
 sp = STACKTOP; //@line 11841
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 11797
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11799
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11801
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 11802
 _wait_ms(150); //@line 11803
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 28; //@line 11806
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11807
  HEAP32[$4 >> 2] = $2; //@line 11808
  sp = STACKTOP; //@line 11809
  return;
 }
 ___async_unwind = 0; //@line 11812
 HEAP32[$ReallocAsyncCtx10 >> 2] = 28; //@line 11813
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11814
 HEAP32[$4 >> 2] = $2; //@line 11815
 sp = STACKTOP; //@line 11816
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 11547
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11549
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11551
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 11552
 _wait_ms(150); //@line 11553
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 22; //@line 11556
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11557
  HEAP32[$4 >> 2] = $2; //@line 11558
  sp = STACKTOP; //@line 11559
  return;
 }
 ___async_unwind = 0; //@line 11562
 HEAP32[$ReallocAsyncCtx16 >> 2] = 22; //@line 11563
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11564
 HEAP32[$4 >> 2] = $2; //@line 11565
 sp = STACKTOP; //@line 11566
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5670
 STACKTOP = STACKTOP + 32 | 0; //@line 5671
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5671
 $vararg_buffer = sp; //@line 5672
 HEAP32[$0 + 36 >> 2] = 5; //@line 5675
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5683
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5685
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5687
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5692
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5695
 STACKTOP = sp; //@line 5696
 return $14 | 0; //@line 5696
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11772
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11774
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11776
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 11777
 _wait_ms(150); //@line 11778
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 11781
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11782
  HEAP32[$4 >> 2] = $2; //@line 11783
  sp = STACKTOP; //@line 11784
  return;
 }
 ___async_unwind = 0; //@line 11787
 HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 11788
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11789
 HEAP32[$4 >> 2] = $2; //@line 11790
 sp = STACKTOP; //@line 11791
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11747
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11749
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11751
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11752
 _wait_ms(400); //@line 11753
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 30; //@line 11756
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11757
  HEAP32[$4 >> 2] = $2; //@line 11758
  sp = STACKTOP; //@line 11759
  return;
 }
 ___async_unwind = 0; //@line 11762
 HEAP32[$ReallocAsyncCtx8 >> 2] = 30; //@line 11763
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11764
 HEAP32[$4 >> 2] = $2; //@line 11765
 sp = STACKTOP; //@line 11766
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11722
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11724
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11726
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 11727
 _wait_ms(400); //@line 11728
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 31; //@line 11731
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11732
  HEAP32[$4 >> 2] = $2; //@line 11733
  sp = STACKTOP; //@line 11734
  return;
 }
 ___async_unwind = 0; //@line 11737
 HEAP32[$ReallocAsyncCtx7 >> 2] = 31; //@line 11738
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11739
 HEAP32[$4 >> 2] = $2; //@line 11740
 sp = STACKTOP; //@line 11741
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 11697
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11699
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11701
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 11702
 _wait_ms(400); //@line 11703
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 32; //@line 11706
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11707
  HEAP32[$4 >> 2] = $2; //@line 11708
  sp = STACKTOP; //@line 11709
  return;
 }
 ___async_unwind = 0; //@line 11712
 HEAP32[$ReallocAsyncCtx6 >> 2] = 32; //@line 11713
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11714
 HEAP32[$4 >> 2] = $2; //@line 11715
 sp = STACKTOP; //@line 11716
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11672
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11674
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11676
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 11677
 _wait_ms(400); //@line 11678
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 33; //@line 11681
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11682
  HEAP32[$4 >> 2] = $2; //@line 11683
  sp = STACKTOP; //@line 11684
  return;
 }
 ___async_unwind = 0; //@line 11687
 HEAP32[$ReallocAsyncCtx5 >> 2] = 33; //@line 11688
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11689
 HEAP32[$4 >> 2] = $2; //@line 11690
 sp = STACKTOP; //@line 11691
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11647
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11649
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11651
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 11652
 _wait_ms(400); //@line 11653
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 11656
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11657
  HEAP32[$4 >> 2] = $2; //@line 11658
  sp = STACKTOP; //@line 11659
  return;
 }
 ___async_unwind = 0; //@line 11662
 HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 11663
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11664
 HEAP32[$4 >> 2] = $2; //@line 11665
 sp = STACKTOP; //@line 11666
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11622
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11624
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11626
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11627
 _wait_ms(400); //@line 11628
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 35; //@line 11631
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11632
  HEAP32[$4 >> 2] = $2; //@line 11633
  sp = STACKTOP; //@line 11634
  return;
 }
 ___async_unwind = 0; //@line 11637
 HEAP32[$ReallocAsyncCtx3 >> 2] = 35; //@line 11638
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11639
 HEAP32[$4 >> 2] = $2; //@line 11640
 sp = STACKTOP; //@line 11641
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11597
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11599
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11601
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11602
 _wait_ms(400); //@line 11603
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 36; //@line 11606
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11607
  HEAP32[$4 >> 2] = $2; //@line 11608
  sp = STACKTOP; //@line 11609
  return;
 }
 ___async_unwind = 0; //@line 11612
 HEAP32[$ReallocAsyncCtx2 >> 2] = 36; //@line 11613
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11614
 HEAP32[$4 >> 2] = $2; //@line 11615
 sp = STACKTOP; //@line 11616
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11572
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11574
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11576
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11577
 _wait_ms(400); //@line 11578
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 11581
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 11582
  HEAP32[$4 >> 2] = $2; //@line 11583
  sp = STACKTOP; //@line 11584
  return;
 }
 ___async_unwind = 0; //@line 11587
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 11588
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 11589
 HEAP32[$4 >> 2] = $2; //@line 11590
 sp = STACKTOP; //@line 11591
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 153
 STACKTOP = STACKTOP + 16 | 0; //@line 154
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 154
 $3 = sp; //@line 155
 HEAP32[$3 >> 2] = $varargs; //@line 156
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 157
 _mbed_vtracef($0, $1, $2, $3); //@line 158
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 8; //@line 161
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 163
  sp = STACKTOP; //@line 164
  STACKTOP = sp; //@line 165
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 167
  STACKTOP = sp; //@line 168
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1179
 STACKTOP = STACKTOP + 16 | 0; //@line 1180
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1180
 $1 = sp; //@line 1181
 HEAP32[$1 >> 2] = $varargs; //@line 1182
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1183
 _mbed_error_vfprintf($0, $1); //@line 1184
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 1187
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1189
  sp = STACKTOP; //@line 1190
  STACKTOP = sp; //@line 1191
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1193
  STACKTOP = sp; //@line 1194
  return;
 }
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 5841
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 5843
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5849
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5850
  if ($phitmp) {
   $13 = $11; //@line 5852
  } else {
   ___unlockfile($3); //@line 5854
   $13 = $11; //@line 5855
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5859
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5863
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5866
 }
 return $15 | 0; //@line 5868
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 863
 newDynamicTop = oldDynamicTop + increment | 0; //@line 864
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 868
  ___setErrNo(12); //@line 869
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 873
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 877
   ___setErrNo(12); //@line 878
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 882
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 8177
 } else {
  $$056 = $2; //@line 8179
  $15 = $1; //@line 8179
  $8 = $0; //@line 8179
  while (1) {
   $14 = $$056 + -1 | 0; //@line 8187
   HEAP8[$14 >> 0] = HEAPU8[13171 + ($8 & 15) >> 0] | 0 | $3; //@line 8188
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 8189
   $15 = tempRet0; //@line 8190
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 8195
    break;
   } else {
    $$056 = $14; //@line 8198
   }
  }
 }
 return $$05$lcssa | 0; //@line 8202
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6058
 $3 = HEAP8[$1 >> 0] | 0; //@line 6060
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6064
 $7 = HEAP32[$0 >> 2] | 0; //@line 6065
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6070
  HEAP32[$0 + 4 >> 2] = 0; //@line 6072
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6074
  HEAP32[$0 + 28 >> 2] = $14; //@line 6076
  HEAP32[$0 + 20 >> 2] = $14; //@line 6078
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6084
  $$0 = 0; //@line 6085
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6088
  $$0 = -1; //@line 6089
 }
 return $$0 | 0; //@line 6091
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 9645
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 9648
 $$sink17$sink = $0; //@line 9648
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 9650
  $12 = HEAP8[$11 >> 0] | 0; //@line 9651
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 9659
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 9664
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 9669
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8214
 } else {
  $$06 = $2; //@line 8216
  $11 = $1; //@line 8216
  $7 = $0; //@line 8216
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8221
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8222
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8223
   $11 = tempRet0; //@line 8224
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8229
    break;
   } else {
    $$06 = $10; //@line 8232
   }
  }
 }
 return $$0$lcssa | 0; //@line 8236
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11117
 do {
  if (!$0) {
   $3 = 0; //@line 11121
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11123
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 11124
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 74; //@line 11127
    sp = STACKTOP; //@line 11128
    return 0; //@line 11129
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11131
    $3 = ($2 | 0) != 0 & 1; //@line 11134
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 11139
}
function _invoke_ticker__async_cb_36($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13429
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 13435
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 13436
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 13437
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 13438
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 45; //@line 13441
  sp = STACKTOP; //@line 13442
  return;
 }
 ___async_unwind = 0; //@line 13445
 HEAP32[$ReallocAsyncCtx >> 2] = 45; //@line 13446
 sp = STACKTOP; //@line 13447
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7858
 } else {
  $$04 = 0; //@line 7860
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7863
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7867
   $12 = $7 + 1 | 0; //@line 7868
   HEAP32[$0 >> 2] = $12; //@line 7869
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7875
    break;
   } else {
    $$04 = $11; //@line 7878
   }
  }
 }
 return $$0$lcssa | 0; //@line 7882
}
function ___fflush_unlocked__async_cb_32($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13197
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13199
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13201
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13203
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 13205
 HEAP32[$4 >> 2] = 0; //@line 13206
 HEAP32[$6 >> 2] = 0; //@line 13207
 HEAP32[$8 >> 2] = 0; //@line 13208
 HEAP32[$10 >> 2] = 0; //@line 13209
 HEAP32[___async_retval >> 2] = 0; //@line 13211
 return;
}
function _ft6x06_Init($0) {
 $0 = $0 | 0;
 var $$05$i6$ph = 0, $1 = 0, $2 = 0, $5 = 0;
 $1 = $0 & 65535; //@line 1448
 $2 = HEAP8[15882] | 0; //@line 1449
 do {
  if (($2 & 255 | 0) != ($1 | 0)) {
   $5 = HEAP8[15883] | 0; //@line 1454
   if (($5 & 255 | 0) != ($1 | 0)) {
    if (!($2 << 24 >> 24)) {
     $$05$i6$ph = 0; //@line 1460
    } else {
     if (!($5 << 24 >> 24)) {
      $$05$i6$ph = 1; //@line 1464
     } else {
      break;
     }
    }
    HEAP8[15882 + $$05$i6$ph >> 0] = $0; //@line 1471
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_21($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12446
 $1 = HEAP32[36] | 0; //@line 12447
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12448
 FUNCTION_TABLE_vi[$1 & 127](976); //@line 12449
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 12452
  sp = STACKTOP; //@line 12453
  return;
 }
 ___async_unwind = 0; //@line 12456
 HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 12457
 sp = STACKTOP; //@line 12458
 return;
}
function _serial_putc__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 385
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 387
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 388
 _fflush($2) | 0; //@line 389
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 392
  sp = STACKTOP; //@line 393
  return;
 }
 ___async_unwind = 0; //@line 396
 HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 397
 sp = STACKTOP; //@line 398
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 714
 ___async_unwind = 1; //@line 715
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 721
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 725
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 729
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 731
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5481
 STACKTOP = STACKTOP + 16 | 0; //@line 5482
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5482
 $vararg_buffer = sp; //@line 5483
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5487
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5489
 STACKTOP = sp; //@line 5490
 return $5 | 0; //@line 5490
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 656
 STACKTOP = STACKTOP + 16 | 0; //@line 657
 $rem = __stackBase__ | 0; //@line 658
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 659
 STACKTOP = __stackBase__; //@line 660
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 661
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 426
 if ((ret | 0) < 8) return ret | 0; //@line 427
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 428
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 429
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 430
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 431
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 432
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10502
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 10300
 $6 = HEAP32[$5 >> 2] | 0; //@line 10301
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 10302
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 10304
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 10306
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 10309
 return $2 | 0; //@line 10310
}
function _BSP_LCD_Init() {
 var $$0$i = 0;
 HEAP32[3966] = 65535; //@line 1526
 HEAP32[3967] = 176; //@line 1527
 HEAP32[3965] = 0; //@line 1528
 _BSP_LCD_MspInit(); //@line 1529
 if ((_ST7789H2_ReadID() | 0) << 16 >> 16 != 133) {
  $$0$i = 1; //@line 1533
  return $$0$i | 0; //@line 1534
 }
 _emscripten_asm_const_i(5) | 0; //@line 1536
 HEAP32[3967] = 160; //@line 1537
 $$0$i = 0; //@line 1538
 return $$0$i | 0; //@line 1539
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11462
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 11473
  $$0 = 1; //@line 11474
 } else {
  $$0 = 0; //@line 11476
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 11480
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13400
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 13403
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 13408
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13411
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1327
 HEAP32[$0 >> 2] = $1; //@line 1328
 HEAP32[3818] = 1; //@line 1329
 $4 = $0; //@line 1330
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1335
 $10 = 15276; //@line 1336
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1338
 HEAP32[$10 + 4 >> 2] = $9; //@line 1341
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10578
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1431
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1432
 _emscripten_sleep($0 | 0); //@line 1433
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 46; //@line 1436
  sp = STACKTOP; //@line 1437
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1440
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 134
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 135
 _puts($0) | 0; //@line 136
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 139
  sp = STACKTOP; //@line 140
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 143
  return;
 }
}
function _main__async_cb_3($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11386
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11387
 _BSP_TS_GetState(15872) | 0; //@line 11388
 if (!___async) {
  ___async_unwind = 0; //@line 11391
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 11393
 sp = STACKTOP; //@line 11394
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 10642
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10646
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 690
 HEAP32[new_frame + 4 >> 2] = sp; //@line 692
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 694
 ___async_cur_frame = new_frame; //@line 695
 return ___async_cur_frame + 8 | 0; //@line 696
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 11447
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11451
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 11454
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 679
  return low << bits; //@line 680
 }
 tempRet0 = low << bits - 32; //@line 682
 return 0; //@line 683
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 668
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 669
 }
 tempRet0 = 0; //@line 671
 return high >>> bits - 32 | 0; //@line 672
}
function _fflush__async_cb_33($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13295
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13297
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13300
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
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 11302
 } else {
  $$0 = -1; //@line 11304
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 11307
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 47
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 50
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 53
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6188
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6194
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6198
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 938
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 702
 stackRestore(___async_cur_frame | 0); //@line 703
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 704
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 14
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 16
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1303
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1309
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1310
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9299
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9299
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9301
 return $1 | 0; //@line 9302
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5647
  $$0 = -1; //@line 5648
 } else {
  $$0 = $0; //@line 5650
 }
 return $$0 | 0; //@line 5652
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 419
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 420
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 421
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 411
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 413
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 931
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
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 924
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 6333
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 6338
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 8359
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8362
 }
 return $$0 | 0; //@line 8364
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 903
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 5828
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 5832
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 648
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 76
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 709
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 710
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10864
 __ZdlPv($0); //@line 10865
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6324
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6326
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10392
 __ZdlPv($0); //@line 10393
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 11273
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
  ___fwritex($1, $2, $0) | 0; //@line 7844
 }
 return;
}
function _ST7789H2_ReadID() {
 _LCD_IO_WriteReg(4); //@line 1492
 _LCD_IO_ReadData() | 0; //@line 1493
 return (_LCD_IO_ReadData() | 0) & 255 | 0; //@line 1496
}
function b73(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 1137
}
function b72(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 1134
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10589
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 736
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1($0) {
 $0 = $0 | 0;
 return;
}
function b70(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 1131
}
function b69(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 1128
}
function _fflush__async_cb_34($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13310
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8307
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11541
 return;
}
function _putc__async_cb_37($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 26
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 896
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 954
 return 0; //@line 954
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 951
 return 0; //@line 951
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 948
 return 0; //@line 948
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 917
}
function b67(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 1125
}
function b66(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 1122
}
function _LCD_IO_WriteReg($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(3, $0 & 255 | 0) | 0; //@line 1513
 return;
}
function _BSP_TS_Init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _ft6x06_Init(0); //@line 2212
 return 0; //@line 2213
}
function _BSP_TS_GetState__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[___async_retval >> 0] = 0; //@line 11949
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9552
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 889
}
function _BSP_LCD_SetTextColor($0) {
 $0 = $0 | 0;
 HEAP32[3965] = $0 & 65535; //@line 1572
 return;
}
function _BSP_LCD_SetBackColor($0) {
 $0 = $0 | 0;
 HEAP32[3966] = $0 & 65535; //@line 1580
 return;
}
function _BSP_LCD_GetYSize() {
 return (_ST7789H2_GetLcdPixelHeight() | 0) & 65535 | 0; //@line 1565
}
function _BSP_LCD_GetXSize() {
 return (_ST7789H2_GetLcdPixelWidth() | 0) & 65535 | 0; //@line 1558
}
function _LCD_IO_ReadData() {
 return (_emscripten_asm_const_i(4) | 0) & 65535 | 0; //@line 1521
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 910
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5705
}
function _BSP_LCD_SetFont($0) {
 $0 = $0 | 0;
 HEAP32[3967] = $0; //@line 1550
 return;
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 945
 return 0; //@line 945
}
function ___ofl_lock() {
 ___lock(15848); //@line 6343
 return 15856; //@line 6344
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
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
 return _pthread_self() | 0; //@line 9473
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9479
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 10379
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
 ___unlock(15848); //@line 6349
 return;
}
function b1() {
 nullFunc_i(0); //@line 942
 return 0; //@line 942
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _ST7789H2_GetLcdPixelHeight() {
 return 240; //@line 1506
}
function _ST7789H2_GetLcdPixelWidth() {
 return 240; //@line 1501
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 1119
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 1116
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 1113
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 1110
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 1107
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 1104
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 1101
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 1098
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 1095
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 1092
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 1089
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 1086
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 1083
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 1080
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 1077
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 1074
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 1071
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 1068
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 1065
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 1062
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 1059
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(106); //@line 1056
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(105); //@line 1053
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(104); //@line 1050
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(103); //@line 1047
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(102); //@line 1044
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(101); //@line 1041
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(100); //@line 1038
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5663
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5980
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(99); //@line 1035
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(98); //@line 1032
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(97); //@line 1029
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(96); //@line 1026
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(95); //@line 1023
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(94); //@line 1020
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(93); //@line 1017
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(92); //@line 1014
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(91); //@line 1011
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(90); //@line 1008
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(89); //@line 1005
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(88); //@line 1002
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(87); //@line 999
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(86); //@line 996
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(85); //@line 993
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(84); //@line 990
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(83); //@line 987
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(82); //@line 984
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(81); //@line 981
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(80); //@line 978
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(79); //@line 975
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(78); //@line 972
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(77); //@line 969
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(76); //@line 966
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(75); //@line 963
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 960
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_tracef__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___errno_location() {
 return 15844; //@line 5657
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
function _ft6x06_TS_Start($0) {
 $0 = $0 | 0;
 return;
}
function _core_util_critical_section_exit() {
 return;
}
function _pthread_self() {
 return 316; //@line 5710
}
function _ft6x06_Reset($0) {
 $0 = $0 | 0;
 return;
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 957
}
function _BSP_LCD_MspInit() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_31,_mbed_vtracef__async_cb_21,_mbed_vtracef__async_cb_22,_mbed_vtracef__async_cb_23,_mbed_vtracef__async_cb_30,_mbed_vtracef__async_cb_24,_mbed_vtracef__async_cb_29,_mbed_vtracef__async_cb_25,_mbed_vtracef__async_cb_26,_mbed_vtracef__async_cb_27,_mbed_vtracef__async_cb_28,_mbed_assert_internal__async_cb,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14
,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_40,_mbed_error_vfprintf__async_cb_39,_serial_putc__async_cb_41,_serial_putc__async_cb,_invoke_ticker__async_cb_36,_invoke_ticker__async_cb,_wait_ms__async_cb,_BSP_TS_GetState__async_cb,_main__async_cb_2,_main__async_cb,_main__async_cb_4,_main__async_cb_3,_putc__async_cb_37,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_34,_fflush__async_cb_33,_fflush__async_cb_35,_fflush__async_cb
,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_32,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_5,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_38,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25
,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55
,b56,b57,b58,b59,b60,b61,b62,b63,b64];
var FUNCTION_TABLE_viiii = [b66,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b67];
var FUNCTION_TABLE_viiiii = [b69,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b70];
var FUNCTION_TABLE_viiiiii = [b72,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b73];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

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






//# sourceMappingURL=touchscreen.js.map
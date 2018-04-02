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

var ASM_CONSTS = [function($0) { window.MbedJSHal.ST7789H2.writeReg($0); },
 function() { window.MbedJSHal.ST7789H2.readData(); },
 function() { window.MbedJSHal.ST7789H2.init(); },
 function($0, $1, $2) { window.MbedJSHal.ST7789H2.drawPixel($0, $1, $2); },
 function() { return window.MbedJSHal.ST7789H2.getTouchX(); },
 function() { return window.MbedJSHal.ST7789H2.getTouchY(); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

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

STATICTOP = STATIC_BASE + 13664;
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
var debug_table_vi = ["0", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_BSP_TS_GetState__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_21", "_mbed_die__async_cb_20", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb", "_invoke_ticker__async_cb_1", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_main__async_cb_23", "_main__async_cb", "_main__async_cb_25", "_main__async_cb_24", "___overflow__async_cb", "_fflush__async_cb_4", "_fflush__async_cb_3", "_fflush__async_cb_5", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_26", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_6", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_2", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_22", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
 sp = STACKTOP; //@line 1418
 STACKTOP = STACKTOP + 16 | 0; //@line 1419
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1419
 $1 = sp; //@line 1420
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1427
   $7 = $6 >>> 3; //@line 1428
   $8 = HEAP32[3022] | 0; //@line 1429
   $9 = $8 >>> $7; //@line 1430
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1436
    $16 = 12128 + ($14 << 1 << 2) | 0; //@line 1438
    $17 = $16 + 8 | 0; //@line 1439
    $18 = HEAP32[$17 >> 2] | 0; //@line 1440
    $19 = $18 + 8 | 0; //@line 1441
    $20 = HEAP32[$19 >> 2] | 0; //@line 1442
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3022] = $8 & ~(1 << $14); //@line 1449
     } else {
      if ((HEAP32[3026] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1454
      }
      $27 = $20 + 12 | 0; //@line 1457
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1461
       HEAP32[$17 >> 2] = $20; //@line 1462
       break;
      } else {
       _abort(); //@line 1465
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1470
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1473
    $34 = $18 + $30 + 4 | 0; //@line 1475
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1478
    $$0 = $19; //@line 1479
    STACKTOP = sp; //@line 1480
    return $$0 | 0; //@line 1480
   }
   $37 = HEAP32[3024] | 0; //@line 1482
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1488
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1491
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1494
     $49 = $47 >>> 12 & 16; //@line 1496
     $50 = $47 >>> $49; //@line 1497
     $52 = $50 >>> 5 & 8; //@line 1499
     $54 = $50 >>> $52; //@line 1501
     $56 = $54 >>> 2 & 4; //@line 1503
     $58 = $54 >>> $56; //@line 1505
     $60 = $58 >>> 1 & 2; //@line 1507
     $62 = $58 >>> $60; //@line 1509
     $64 = $62 >>> 1 & 1; //@line 1511
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1514
     $69 = 12128 + ($67 << 1 << 2) | 0; //@line 1516
     $70 = $69 + 8 | 0; //@line 1517
     $71 = HEAP32[$70 >> 2] | 0; //@line 1518
     $72 = $71 + 8 | 0; //@line 1519
     $73 = HEAP32[$72 >> 2] | 0; //@line 1520
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1526
       HEAP32[3022] = $77; //@line 1527
       $98 = $77; //@line 1528
      } else {
       if ((HEAP32[3026] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1533
       }
       $80 = $73 + 12 | 0; //@line 1536
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1540
        HEAP32[$70 >> 2] = $73; //@line 1541
        $98 = $8; //@line 1542
        break;
       } else {
        _abort(); //@line 1545
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1550
     $84 = $83 - $6 | 0; //@line 1551
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1554
     $87 = $71 + $6 | 0; //@line 1555
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1558
     HEAP32[$71 + $83 >> 2] = $84; //@line 1560
     if ($37 | 0) {
      $92 = HEAP32[3027] | 0; //@line 1563
      $93 = $37 >>> 3; //@line 1564
      $95 = 12128 + ($93 << 1 << 2) | 0; //@line 1566
      $96 = 1 << $93; //@line 1567
      if (!($98 & $96)) {
       HEAP32[3022] = $98 | $96; //@line 1572
       $$0199 = $95; //@line 1574
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1574
      } else {
       $101 = $95 + 8 | 0; //@line 1576
       $102 = HEAP32[$101 >> 2] | 0; //@line 1577
       if ((HEAP32[3026] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1581
       } else {
        $$0199 = $102; //@line 1584
        $$pre$phiZ2D = $101; //@line 1584
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1587
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1589
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1591
      HEAP32[$92 + 12 >> 2] = $95; //@line 1593
     }
     HEAP32[3024] = $84; //@line 1595
     HEAP32[3027] = $87; //@line 1596
     $$0 = $72; //@line 1597
     STACKTOP = sp; //@line 1598
     return $$0 | 0; //@line 1598
    }
    $108 = HEAP32[3023] | 0; //@line 1600
    if (!$108) {
     $$0197 = $6; //@line 1603
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1607
     $114 = $112 >>> 12 & 16; //@line 1609
     $115 = $112 >>> $114; //@line 1610
     $117 = $115 >>> 5 & 8; //@line 1612
     $119 = $115 >>> $117; //@line 1614
     $121 = $119 >>> 2 & 4; //@line 1616
     $123 = $119 >>> $121; //@line 1618
     $125 = $123 >>> 1 & 2; //@line 1620
     $127 = $123 >>> $125; //@line 1622
     $129 = $127 >>> 1 & 1; //@line 1624
     $134 = HEAP32[12392 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1629
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1633
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1639
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1642
      $$0193$lcssa$i = $138; //@line 1642
     } else {
      $$01926$i = $134; //@line 1644
      $$01935$i = $138; //@line 1644
      $146 = $143; //@line 1644
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1649
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1650
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1651
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1652
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1658
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1661
        $$0193$lcssa$i = $$$0193$i; //@line 1661
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1664
        $$01935$i = $$$0193$i; //@line 1664
       }
      }
     }
     $157 = HEAP32[3026] | 0; //@line 1668
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1671
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1674
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1677
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1681
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1683
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1687
       $176 = HEAP32[$175 >> 2] | 0; //@line 1688
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1691
        $179 = HEAP32[$178 >> 2] | 0; //@line 1692
        if (!$179) {
         $$3$i = 0; //@line 1695
         break;
        } else {
         $$1196$i = $179; //@line 1698
         $$1198$i = $178; //@line 1698
        }
       } else {
        $$1196$i = $176; //@line 1701
        $$1198$i = $175; //@line 1701
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1704
        $182 = HEAP32[$181 >> 2] | 0; //@line 1705
        if ($182 | 0) {
         $$1196$i = $182; //@line 1708
         $$1198$i = $181; //@line 1708
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1711
        $185 = HEAP32[$184 >> 2] | 0; //@line 1712
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1717
         $$1198$i = $184; //@line 1717
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1722
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1725
        $$3$i = $$1196$i; //@line 1726
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1731
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1734
       }
       $169 = $167 + 12 | 0; //@line 1737
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1741
       }
       $172 = $164 + 8 | 0; //@line 1744
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1748
        HEAP32[$172 >> 2] = $167; //@line 1749
        $$3$i = $164; //@line 1750
        break;
       } else {
        _abort(); //@line 1753
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1762
       $191 = 12392 + ($190 << 2) | 0; //@line 1763
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1768
         if (!$$3$i) {
          HEAP32[3023] = $108 & ~(1 << $190); //@line 1774
          break L73;
         }
        } else {
         if ((HEAP32[3026] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1781
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1789
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3026] | 0; //@line 1799
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1802
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1806
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1808
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1814
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1818
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1820
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1826
       if ($214 | 0) {
        if ((HEAP32[3026] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1832
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1836
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1838
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1846
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1849
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1851
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1854
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1858
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1861
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1863
      if ($37 | 0) {
       $234 = HEAP32[3027] | 0; //@line 1866
       $235 = $37 >>> 3; //@line 1867
       $237 = 12128 + ($235 << 1 << 2) | 0; //@line 1869
       $238 = 1 << $235; //@line 1870
       if (!($8 & $238)) {
        HEAP32[3022] = $8 | $238; //@line 1875
        $$0189$i = $237; //@line 1877
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1877
       } else {
        $242 = $237 + 8 | 0; //@line 1879
        $243 = HEAP32[$242 >> 2] | 0; //@line 1880
        if ((HEAP32[3026] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1884
        } else {
         $$0189$i = $243; //@line 1887
         $$pre$phi$iZ2D = $242; //@line 1887
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1890
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1892
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1894
       HEAP32[$234 + 12 >> 2] = $237; //@line 1896
      }
      HEAP32[3024] = $$0193$lcssa$i; //@line 1898
      HEAP32[3027] = $159; //@line 1899
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1902
     STACKTOP = sp; //@line 1903
     return $$0 | 0; //@line 1903
    }
   } else {
    $$0197 = $6; //@line 1906
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1911
   } else {
    $251 = $0 + 11 | 0; //@line 1913
    $252 = $251 & -8; //@line 1914
    $253 = HEAP32[3023] | 0; //@line 1915
    if (!$253) {
     $$0197 = $252; //@line 1918
    } else {
     $255 = 0 - $252 | 0; //@line 1920
     $256 = $251 >>> 8; //@line 1921
     if (!$256) {
      $$0358$i = 0; //@line 1924
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1928
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1932
       $262 = $256 << $261; //@line 1933
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1936
       $267 = $262 << $265; //@line 1938
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1941
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1946
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 1952
      }
     }
     $282 = HEAP32[12392 + ($$0358$i << 2) >> 2] | 0; //@line 1956
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 1960
       $$3$i203 = 0; //@line 1960
       $$3350$i = $255; //@line 1960
       label = 81; //@line 1961
      } else {
       $$0342$i = 0; //@line 1968
       $$0347$i = $255; //@line 1968
       $$0353$i = $282; //@line 1968
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 1968
       $$0362$i = 0; //@line 1968
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 1973
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 1978
          $$435113$i = 0; //@line 1978
          $$435712$i = $$0353$i; //@line 1978
          label = 85; //@line 1979
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 1982
          $$1348$i = $292; //@line 1982
         }
        } else {
         $$1343$i = $$0342$i; //@line 1985
         $$1348$i = $$0347$i; //@line 1985
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 1988
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 1991
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 1995
        $302 = ($$0353$i | 0) == 0; //@line 1996
        if ($302) {
         $$2355$i = $$1363$i; //@line 2001
         $$3$i203 = $$1343$i; //@line 2001
         $$3350$i = $$1348$i; //@line 2001
         label = 81; //@line 2002
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2005
         $$0347$i = $$1348$i; //@line 2005
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2005
         $$0362$i = $$1363$i; //@line 2005
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2015
       $309 = $253 & ($306 | 0 - $306); //@line 2018
       if (!$309) {
        $$0197 = $252; //@line 2021
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2026
       $315 = $313 >>> 12 & 16; //@line 2028
       $316 = $313 >>> $315; //@line 2029
       $318 = $316 >>> 5 & 8; //@line 2031
       $320 = $316 >>> $318; //@line 2033
       $322 = $320 >>> 2 & 4; //@line 2035
       $324 = $320 >>> $322; //@line 2037
       $326 = $324 >>> 1 & 2; //@line 2039
       $328 = $324 >>> $326; //@line 2041
       $330 = $328 >>> 1 & 1; //@line 2043
       $$4$ph$i = 0; //@line 2049
       $$4357$ph$i = HEAP32[12392 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2049
      } else {
       $$4$ph$i = $$3$i203; //@line 2051
       $$4357$ph$i = $$2355$i; //@line 2051
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2055
       $$4351$lcssa$i = $$3350$i; //@line 2055
      } else {
       $$414$i = $$4$ph$i; //@line 2057
       $$435113$i = $$3350$i; //@line 2057
       $$435712$i = $$4357$ph$i; //@line 2057
       label = 85; //@line 2058
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2063
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2067
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2068
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2069
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2070
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2076
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2079
        $$4351$lcssa$i = $$$4351$i; //@line 2079
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2082
        $$435113$i = $$$4351$i; //@line 2082
        label = 85; //@line 2083
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2089
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3024] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3026] | 0; //@line 2095
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2098
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2101
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2104
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2108
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2110
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2114
         $371 = HEAP32[$370 >> 2] | 0; //@line 2115
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2118
          $374 = HEAP32[$373 >> 2] | 0; //@line 2119
          if (!$374) {
           $$3372$i = 0; //@line 2122
           break;
          } else {
           $$1370$i = $374; //@line 2125
           $$1374$i = $373; //@line 2125
          }
         } else {
          $$1370$i = $371; //@line 2128
          $$1374$i = $370; //@line 2128
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2131
          $377 = HEAP32[$376 >> 2] | 0; //@line 2132
          if ($377 | 0) {
           $$1370$i = $377; //@line 2135
           $$1374$i = $376; //@line 2135
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2138
          $380 = HEAP32[$379 >> 2] | 0; //@line 2139
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2144
           $$1374$i = $379; //@line 2144
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2149
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2152
          $$3372$i = $$1370$i; //@line 2153
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2158
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2161
         }
         $364 = $362 + 12 | 0; //@line 2164
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2168
         }
         $367 = $359 + 8 | 0; //@line 2171
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2175
          HEAP32[$367 >> 2] = $362; //@line 2176
          $$3372$i = $359; //@line 2177
          break;
         } else {
          _abort(); //@line 2180
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2188
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2191
         $386 = 12392 + ($385 << 2) | 0; //@line 2192
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2197
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2202
            HEAP32[3023] = $391; //@line 2203
            $475 = $391; //@line 2204
            break L164;
           }
          } else {
           if ((HEAP32[3026] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2211
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2219
            if (!$$3372$i) {
             $475 = $253; //@line 2222
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3026] | 0; //@line 2230
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2233
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2237
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2239
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2245
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2249
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2251
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2257
         if (!$409) {
          $475 = $253; //@line 2260
         } else {
          if ((HEAP32[3026] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2265
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2269
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2271
           $475 = $253; //@line 2272
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2281
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2284
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2286
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2289
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2293
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2296
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2298
         $428 = $$4351$lcssa$i >>> 3; //@line 2299
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 12128 + ($428 << 1 << 2) | 0; //@line 2303
          $432 = HEAP32[3022] | 0; //@line 2304
          $433 = 1 << $428; //@line 2305
          if (!($432 & $433)) {
           HEAP32[3022] = $432 | $433; //@line 2310
           $$0368$i = $431; //@line 2312
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2312
          } else {
           $437 = $431 + 8 | 0; //@line 2314
           $438 = HEAP32[$437 >> 2] | 0; //@line 2315
           if ((HEAP32[3026] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2319
           } else {
            $$0368$i = $438; //@line 2322
            $$pre$phi$i211Z2D = $437; //@line 2322
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2325
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2327
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2329
          HEAP32[$354 + 12 >> 2] = $431; //@line 2331
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2334
         if (!$444) {
          $$0361$i = 0; //@line 2337
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2341
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2345
           $450 = $444 << $449; //@line 2346
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2349
           $455 = $450 << $453; //@line 2351
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2354
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2359
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2365
          }
         }
         $469 = 12392 + ($$0361$i << 2) | 0; //@line 2368
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2370
         $471 = $354 + 16 | 0; //@line 2371
         HEAP32[$471 + 4 >> 2] = 0; //@line 2373
         HEAP32[$471 >> 2] = 0; //@line 2374
         $473 = 1 << $$0361$i; //@line 2375
         if (!($475 & $473)) {
          HEAP32[3023] = $475 | $473; //@line 2380
          HEAP32[$469 >> 2] = $354; //@line 2381
          HEAP32[$354 + 24 >> 2] = $469; //@line 2383
          HEAP32[$354 + 12 >> 2] = $354; //@line 2385
          HEAP32[$354 + 8 >> 2] = $354; //@line 2387
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2396
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2396
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2403
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2407
          $494 = HEAP32[$492 >> 2] | 0; //@line 2409
          if (!$494) {
           label = 136; //@line 2412
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2415
           $$0345$i = $494; //@line 2415
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3026] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2422
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2425
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2427
           HEAP32[$354 + 12 >> 2] = $354; //@line 2429
           HEAP32[$354 + 8 >> 2] = $354; //@line 2431
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2436
          $502 = HEAP32[$501 >> 2] | 0; //@line 2437
          $503 = HEAP32[3026] | 0; //@line 2438
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2444
           HEAP32[$501 >> 2] = $354; //@line 2445
           HEAP32[$354 + 8 >> 2] = $502; //@line 2447
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2449
           HEAP32[$354 + 24 >> 2] = 0; //@line 2451
           break;
          } else {
           _abort(); //@line 2454
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2461
       STACKTOP = sp; //@line 2462
       return $$0 | 0; //@line 2462
      } else {
       $$0197 = $252; //@line 2464
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3024] | 0; //@line 2471
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2474
  $515 = HEAP32[3027] | 0; //@line 2475
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2478
   HEAP32[3027] = $517; //@line 2479
   HEAP32[3024] = $514; //@line 2480
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2483
   HEAP32[$515 + $512 >> 2] = $514; //@line 2485
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2488
  } else {
   HEAP32[3024] = 0; //@line 2490
   HEAP32[3027] = 0; //@line 2491
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2494
   $526 = $515 + $512 + 4 | 0; //@line 2496
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2499
  }
  $$0 = $515 + 8 | 0; //@line 2502
  STACKTOP = sp; //@line 2503
  return $$0 | 0; //@line 2503
 }
 $530 = HEAP32[3025] | 0; //@line 2505
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2508
  HEAP32[3025] = $532; //@line 2509
  $533 = HEAP32[3028] | 0; //@line 2510
  $534 = $533 + $$0197 | 0; //@line 2511
  HEAP32[3028] = $534; //@line 2512
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2515
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2518
  $$0 = $533 + 8 | 0; //@line 2520
  STACKTOP = sp; //@line 2521
  return $$0 | 0; //@line 2521
 }
 if (!(HEAP32[3140] | 0)) {
  HEAP32[3142] = 4096; //@line 2526
  HEAP32[3141] = 4096; //@line 2527
  HEAP32[3143] = -1; //@line 2528
  HEAP32[3144] = -1; //@line 2529
  HEAP32[3145] = 0; //@line 2530
  HEAP32[3133] = 0; //@line 2531
  HEAP32[3140] = $1 & -16 ^ 1431655768; //@line 2535
  $548 = 4096; //@line 2536
 } else {
  $548 = HEAP32[3142] | 0; //@line 2539
 }
 $545 = $$0197 + 48 | 0; //@line 2541
 $546 = $$0197 + 47 | 0; //@line 2542
 $547 = $548 + $546 | 0; //@line 2543
 $549 = 0 - $548 | 0; //@line 2544
 $550 = $547 & $549; //@line 2545
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2548
  STACKTOP = sp; //@line 2549
  return $$0 | 0; //@line 2549
 }
 $552 = HEAP32[3132] | 0; //@line 2551
 if ($552 | 0) {
  $554 = HEAP32[3130] | 0; //@line 2554
  $555 = $554 + $550 | 0; //@line 2555
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2560
   STACKTOP = sp; //@line 2561
   return $$0 | 0; //@line 2561
  }
 }
 L244 : do {
  if (!(HEAP32[3133] & 4)) {
   $561 = HEAP32[3028] | 0; //@line 2569
   L246 : do {
    if (!$561) {
     label = 163; //@line 2573
    } else {
     $$0$i$i = 12536; //@line 2575
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2577
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2580
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2589
      if (!$570) {
       label = 163; //@line 2592
       break L246;
      } else {
       $$0$i$i = $570; //@line 2595
      }
     }
     $595 = $547 - $530 & $549; //@line 2599
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2602
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2610
       } else {
        $$723947$i = $595; //@line 2612
        $$748$i = $597; //@line 2612
        label = 180; //@line 2613
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2617
       $$2253$ph$i = $595; //@line 2617
       label = 171; //@line 2618
      }
     } else {
      $$2234243136$i = 0; //@line 2621
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2627
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2630
     } else {
      $574 = $572; //@line 2632
      $575 = HEAP32[3141] | 0; //@line 2633
      $576 = $575 + -1 | 0; //@line 2634
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2642
      $584 = HEAP32[3130] | 0; //@line 2643
      $585 = $$$i + $584 | 0; //@line 2644
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3132] | 0; //@line 2649
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2656
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2660
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2663
        $$748$i = $572; //@line 2663
        label = 180; //@line 2664
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2667
        $$2253$ph$i = $$$i; //@line 2667
        label = 171; //@line 2668
       }
      } else {
       $$2234243136$i = 0; //@line 2671
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2678
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2687
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2690
       $$748$i = $$2247$ph$i; //@line 2690
       label = 180; //@line 2691
       break L244;
      }
     }
     $607 = HEAP32[3142] | 0; //@line 2695
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2699
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2702
      $$748$i = $$2247$ph$i; //@line 2702
      label = 180; //@line 2703
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2709
      $$2234243136$i = 0; //@line 2710
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2714
      $$748$i = $$2247$ph$i; //@line 2714
      label = 180; //@line 2715
      break L244;
     }
    }
   } while (0);
   HEAP32[3133] = HEAP32[3133] | 4; //@line 2722
   $$4236$i = $$2234243136$i; //@line 2723
   label = 178; //@line 2724
  } else {
   $$4236$i = 0; //@line 2726
   label = 178; //@line 2727
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2733
   $621 = _sbrk(0) | 0; //@line 2734
   $627 = $621 - $620 | 0; //@line 2742
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2744
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2752
    $$748$i = $620; //@line 2752
    label = 180; //@line 2753
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3130] | 0) + $$723947$i | 0; //@line 2759
  HEAP32[3130] = $633; //@line 2760
  if ($633 >>> 0 > (HEAP32[3131] | 0) >>> 0) {
   HEAP32[3131] = $633; //@line 2764
  }
  $636 = HEAP32[3028] | 0; //@line 2766
  do {
   if (!$636) {
    $638 = HEAP32[3026] | 0; //@line 2770
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3026] = $$748$i; //@line 2775
    }
    HEAP32[3134] = $$748$i; //@line 2777
    HEAP32[3135] = $$723947$i; //@line 2778
    HEAP32[3137] = 0; //@line 2779
    HEAP32[3031] = HEAP32[3140]; //@line 2781
    HEAP32[3030] = -1; //@line 2782
    HEAP32[3035] = 12128; //@line 2783
    HEAP32[3034] = 12128; //@line 2784
    HEAP32[3037] = 12136; //@line 2785
    HEAP32[3036] = 12136; //@line 2786
    HEAP32[3039] = 12144; //@line 2787
    HEAP32[3038] = 12144; //@line 2788
    HEAP32[3041] = 12152; //@line 2789
    HEAP32[3040] = 12152; //@line 2790
    HEAP32[3043] = 12160; //@line 2791
    HEAP32[3042] = 12160; //@line 2792
    HEAP32[3045] = 12168; //@line 2793
    HEAP32[3044] = 12168; //@line 2794
    HEAP32[3047] = 12176; //@line 2795
    HEAP32[3046] = 12176; //@line 2796
    HEAP32[3049] = 12184; //@line 2797
    HEAP32[3048] = 12184; //@line 2798
    HEAP32[3051] = 12192; //@line 2799
    HEAP32[3050] = 12192; //@line 2800
    HEAP32[3053] = 12200; //@line 2801
    HEAP32[3052] = 12200; //@line 2802
    HEAP32[3055] = 12208; //@line 2803
    HEAP32[3054] = 12208; //@line 2804
    HEAP32[3057] = 12216; //@line 2805
    HEAP32[3056] = 12216; //@line 2806
    HEAP32[3059] = 12224; //@line 2807
    HEAP32[3058] = 12224; //@line 2808
    HEAP32[3061] = 12232; //@line 2809
    HEAP32[3060] = 12232; //@line 2810
    HEAP32[3063] = 12240; //@line 2811
    HEAP32[3062] = 12240; //@line 2812
    HEAP32[3065] = 12248; //@line 2813
    HEAP32[3064] = 12248; //@line 2814
    HEAP32[3067] = 12256; //@line 2815
    HEAP32[3066] = 12256; //@line 2816
    HEAP32[3069] = 12264; //@line 2817
    HEAP32[3068] = 12264; //@line 2818
    HEAP32[3071] = 12272; //@line 2819
    HEAP32[3070] = 12272; //@line 2820
    HEAP32[3073] = 12280; //@line 2821
    HEAP32[3072] = 12280; //@line 2822
    HEAP32[3075] = 12288; //@line 2823
    HEAP32[3074] = 12288; //@line 2824
    HEAP32[3077] = 12296; //@line 2825
    HEAP32[3076] = 12296; //@line 2826
    HEAP32[3079] = 12304; //@line 2827
    HEAP32[3078] = 12304; //@line 2828
    HEAP32[3081] = 12312; //@line 2829
    HEAP32[3080] = 12312; //@line 2830
    HEAP32[3083] = 12320; //@line 2831
    HEAP32[3082] = 12320; //@line 2832
    HEAP32[3085] = 12328; //@line 2833
    HEAP32[3084] = 12328; //@line 2834
    HEAP32[3087] = 12336; //@line 2835
    HEAP32[3086] = 12336; //@line 2836
    HEAP32[3089] = 12344; //@line 2837
    HEAP32[3088] = 12344; //@line 2838
    HEAP32[3091] = 12352; //@line 2839
    HEAP32[3090] = 12352; //@line 2840
    HEAP32[3093] = 12360; //@line 2841
    HEAP32[3092] = 12360; //@line 2842
    HEAP32[3095] = 12368; //@line 2843
    HEAP32[3094] = 12368; //@line 2844
    HEAP32[3097] = 12376; //@line 2845
    HEAP32[3096] = 12376; //@line 2846
    $642 = $$723947$i + -40 | 0; //@line 2847
    $644 = $$748$i + 8 | 0; //@line 2849
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2854
    $650 = $$748$i + $649 | 0; //@line 2855
    $651 = $642 - $649 | 0; //@line 2856
    HEAP32[3028] = $650; //@line 2857
    HEAP32[3025] = $651; //@line 2858
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2861
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2864
    HEAP32[3029] = HEAP32[3144]; //@line 2866
   } else {
    $$024367$i = 12536; //@line 2868
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2870
     $658 = $$024367$i + 4 | 0; //@line 2871
     $659 = HEAP32[$658 >> 2] | 0; //@line 2872
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2876
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2880
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2885
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2899
       $673 = (HEAP32[3025] | 0) + $$723947$i | 0; //@line 2901
       $675 = $636 + 8 | 0; //@line 2903
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2908
       $681 = $636 + $680 | 0; //@line 2909
       $682 = $673 - $680 | 0; //@line 2910
       HEAP32[3028] = $681; //@line 2911
       HEAP32[3025] = $682; //@line 2912
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2915
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2918
       HEAP32[3029] = HEAP32[3144]; //@line 2920
       break;
      }
     }
    }
    $688 = HEAP32[3026] | 0; //@line 2925
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3026] = $$748$i; //@line 2928
     $753 = $$748$i; //@line 2929
    } else {
     $753 = $688; //@line 2931
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2933
    $$124466$i = 12536; //@line 2934
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2939
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2943
     if (!$694) {
      $$0$i$i$i = 12536; //@line 2946
      break;
     } else {
      $$124466$i = $694; //@line 2949
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 2958
      $700 = $$124466$i + 4 | 0; //@line 2959
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 2962
      $704 = $$748$i + 8 | 0; //@line 2964
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 2970
      $712 = $690 + 8 | 0; //@line 2972
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 2978
      $722 = $710 + $$0197 | 0; //@line 2982
      $723 = $718 - $710 - $$0197 | 0; //@line 2983
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 2986
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3025] | 0) + $723 | 0; //@line 2991
        HEAP32[3025] = $728; //@line 2992
        HEAP32[3028] = $722; //@line 2993
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 2996
       } else {
        if ((HEAP32[3027] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3024] | 0) + $723 | 0; //@line 3002
         HEAP32[3024] = $734; //@line 3003
         HEAP32[3027] = $722; //@line 3004
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3007
         HEAP32[$722 + $734 >> 2] = $734; //@line 3009
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3013
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3017
         $743 = $739 >>> 3; //@line 3018
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3023
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3025
           $750 = 12128 + ($743 << 1 << 2) | 0; //@line 3027
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3033
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3042
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3022] = HEAP32[3022] & ~(1 << $743); //@line 3052
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3059
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3063
             }
             $764 = $748 + 8 | 0; //@line 3066
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3070
              break;
             }
             _abort(); //@line 3073
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3078
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3079
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3082
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3084
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3088
             $783 = $782 + 4 | 0; //@line 3089
             $784 = HEAP32[$783 >> 2] | 0; //@line 3090
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3093
              if (!$786) {
               $$3$i$i = 0; //@line 3096
               break;
              } else {
               $$1291$i$i = $786; //@line 3099
               $$1293$i$i = $782; //@line 3099
              }
             } else {
              $$1291$i$i = $784; //@line 3102
              $$1293$i$i = $783; //@line 3102
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3105
              $789 = HEAP32[$788 >> 2] | 0; //@line 3106
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3109
               $$1293$i$i = $788; //@line 3109
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3112
              $792 = HEAP32[$791 >> 2] | 0; //@line 3113
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3118
               $$1293$i$i = $791; //@line 3118
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3123
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3126
              $$3$i$i = $$1291$i$i; //@line 3127
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3132
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3135
             }
             $776 = $774 + 12 | 0; //@line 3138
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3142
             }
             $779 = $771 + 8 | 0; //@line 3145
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3149
              HEAP32[$779 >> 2] = $774; //@line 3150
              $$3$i$i = $771; //@line 3151
              break;
             } else {
              _abort(); //@line 3154
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3164
           $798 = 12392 + ($797 << 2) | 0; //@line 3165
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3170
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3023] = HEAP32[3023] & ~(1 << $797); //@line 3179
             break L311;
            } else {
             if ((HEAP32[3026] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3185
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3193
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3026] | 0; //@line 3203
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3206
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3210
           $815 = $718 + 16 | 0; //@line 3211
           $816 = HEAP32[$815 >> 2] | 0; //@line 3212
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3218
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3222
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3224
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3230
           if (!$822) {
            break;
           }
           if ((HEAP32[3026] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3238
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3242
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3244
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3251
         $$0287$i$i = $742 + $723 | 0; //@line 3251
        } else {
         $$0$i17$i = $718; //@line 3253
         $$0287$i$i = $723; //@line 3253
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3255
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3258
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3261
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3263
        $836 = $$0287$i$i >>> 3; //@line 3264
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 12128 + ($836 << 1 << 2) | 0; //@line 3268
         $840 = HEAP32[3022] | 0; //@line 3269
         $841 = 1 << $836; //@line 3270
         do {
          if (!($840 & $841)) {
           HEAP32[3022] = $840 | $841; //@line 3276
           $$0295$i$i = $839; //@line 3278
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3278
          } else {
           $845 = $839 + 8 | 0; //@line 3280
           $846 = HEAP32[$845 >> 2] | 0; //@line 3281
           if ((HEAP32[3026] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3285
            $$pre$phi$i19$iZ2D = $845; //@line 3285
            break;
           }
           _abort(); //@line 3288
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3292
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3294
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3296
         HEAP32[$722 + 12 >> 2] = $839; //@line 3298
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3301
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3305
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3309
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3314
          $858 = $852 << $857; //@line 3315
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3318
          $863 = $858 << $861; //@line 3320
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3323
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3328
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3334
         }
        } while (0);
        $877 = 12392 + ($$0296$i$i << 2) | 0; //@line 3337
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3339
        $879 = $722 + 16 | 0; //@line 3340
        HEAP32[$879 + 4 >> 2] = 0; //@line 3342
        HEAP32[$879 >> 2] = 0; //@line 3343
        $881 = HEAP32[3023] | 0; //@line 3344
        $882 = 1 << $$0296$i$i; //@line 3345
        if (!($881 & $882)) {
         HEAP32[3023] = $881 | $882; //@line 3350
         HEAP32[$877 >> 2] = $722; //@line 3351
         HEAP32[$722 + 24 >> 2] = $877; //@line 3353
         HEAP32[$722 + 12 >> 2] = $722; //@line 3355
         HEAP32[$722 + 8 >> 2] = $722; //@line 3357
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3366
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3366
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3373
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3377
         $902 = HEAP32[$900 >> 2] | 0; //@line 3379
         if (!$902) {
          label = 260; //@line 3382
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3385
          $$0289$i$i = $902; //@line 3385
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3026] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3392
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3395
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3397
          HEAP32[$722 + 12 >> 2] = $722; //@line 3399
          HEAP32[$722 + 8 >> 2] = $722; //@line 3401
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3406
         $910 = HEAP32[$909 >> 2] | 0; //@line 3407
         $911 = HEAP32[3026] | 0; //@line 3408
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3414
          HEAP32[$909 >> 2] = $722; //@line 3415
          HEAP32[$722 + 8 >> 2] = $910; //@line 3417
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3419
          HEAP32[$722 + 24 >> 2] = 0; //@line 3421
          break;
         } else {
          _abort(); //@line 3424
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3431
      STACKTOP = sp; //@line 3432
      return $$0 | 0; //@line 3432
     } else {
      $$0$i$i$i = 12536; //@line 3434
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3438
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3443
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3451
    }
    $927 = $923 + -47 | 0; //@line 3453
    $929 = $927 + 8 | 0; //@line 3455
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3461
    $936 = $636 + 16 | 0; //@line 3462
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3464
    $939 = $938 + 8 | 0; //@line 3465
    $940 = $938 + 24 | 0; //@line 3466
    $941 = $$723947$i + -40 | 0; //@line 3467
    $943 = $$748$i + 8 | 0; //@line 3469
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3474
    $949 = $$748$i + $948 | 0; //@line 3475
    $950 = $941 - $948 | 0; //@line 3476
    HEAP32[3028] = $949; //@line 3477
    HEAP32[3025] = $950; //@line 3478
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3481
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3484
    HEAP32[3029] = HEAP32[3144]; //@line 3486
    $956 = $938 + 4 | 0; //@line 3487
    HEAP32[$956 >> 2] = 27; //@line 3488
    HEAP32[$939 >> 2] = HEAP32[3134]; //@line 3489
    HEAP32[$939 + 4 >> 2] = HEAP32[3135]; //@line 3489
    HEAP32[$939 + 8 >> 2] = HEAP32[3136]; //@line 3489
    HEAP32[$939 + 12 >> 2] = HEAP32[3137]; //@line 3489
    HEAP32[3134] = $$748$i; //@line 3490
    HEAP32[3135] = $$723947$i; //@line 3491
    HEAP32[3137] = 0; //@line 3492
    HEAP32[3136] = $939; //@line 3493
    $958 = $940; //@line 3494
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3496
     HEAP32[$958 >> 2] = 7; //@line 3497
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3510
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3513
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3516
     HEAP32[$938 >> 2] = $964; //@line 3517
     $969 = $964 >>> 3; //@line 3518
     if ($964 >>> 0 < 256) {
      $972 = 12128 + ($969 << 1 << 2) | 0; //@line 3522
      $973 = HEAP32[3022] | 0; //@line 3523
      $974 = 1 << $969; //@line 3524
      if (!($973 & $974)) {
       HEAP32[3022] = $973 | $974; //@line 3529
       $$0211$i$i = $972; //@line 3531
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3531
      } else {
       $978 = $972 + 8 | 0; //@line 3533
       $979 = HEAP32[$978 >> 2] | 0; //@line 3534
       if ((HEAP32[3026] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3538
       } else {
        $$0211$i$i = $979; //@line 3541
        $$pre$phi$i$iZ2D = $978; //@line 3541
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3544
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3546
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3548
      HEAP32[$636 + 12 >> 2] = $972; //@line 3550
      break;
     }
     $985 = $964 >>> 8; //@line 3553
     if (!$985) {
      $$0212$i$i = 0; //@line 3556
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3560
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3564
       $991 = $985 << $990; //@line 3565
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3568
       $996 = $991 << $994; //@line 3570
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3573
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3578
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3584
      }
     }
     $1010 = 12392 + ($$0212$i$i << 2) | 0; //@line 3587
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3589
     HEAP32[$636 + 20 >> 2] = 0; //@line 3591
     HEAP32[$936 >> 2] = 0; //@line 3592
     $1013 = HEAP32[3023] | 0; //@line 3593
     $1014 = 1 << $$0212$i$i; //@line 3594
     if (!($1013 & $1014)) {
      HEAP32[3023] = $1013 | $1014; //@line 3599
      HEAP32[$1010 >> 2] = $636; //@line 3600
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3602
      HEAP32[$636 + 12 >> 2] = $636; //@line 3604
      HEAP32[$636 + 8 >> 2] = $636; //@line 3606
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3615
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3615
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3622
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3626
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3628
      if (!$1034) {
       label = 286; //@line 3631
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3634
       $$0207$i$i = $1034; //@line 3634
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3026] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3641
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3644
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3646
       HEAP32[$636 + 12 >> 2] = $636; //@line 3648
       HEAP32[$636 + 8 >> 2] = $636; //@line 3650
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3655
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3656
      $1043 = HEAP32[3026] | 0; //@line 3657
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3663
       HEAP32[$1041 >> 2] = $636; //@line 3664
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3666
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3668
       HEAP32[$636 + 24 >> 2] = 0; //@line 3670
       break;
      } else {
       _abort(); //@line 3673
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3025] | 0; //@line 3680
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3683
   HEAP32[3025] = $1054; //@line 3684
   $1055 = HEAP32[3028] | 0; //@line 3685
   $1056 = $1055 + $$0197 | 0; //@line 3686
   HEAP32[3028] = $1056; //@line 3687
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3690
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3693
   $$0 = $1055 + 8 | 0; //@line 3695
   STACKTOP = sp; //@line 3696
   return $$0 | 0; //@line 3696
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3700
 $$0 = 0; //@line 3701
 STACKTOP = sp; //@line 3702
 return $$0 | 0; //@line 3702
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3729
 $3 = HEAP32[3026] | 0; //@line 3730
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3733
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3737
 $7 = $6 & 3; //@line 3738
 if (($7 | 0) == 1) {
  _abort(); //@line 3741
 }
 $9 = $6 & -8; //@line 3744
 $10 = $2 + $9 | 0; //@line 3745
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3750
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3756
   $17 = $13 + $9 | 0; //@line 3757
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3760
   }
   if ((HEAP32[3027] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3766
    $106 = HEAP32[$105 >> 2] | 0; //@line 3767
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3771
     $$1382 = $17; //@line 3771
     $114 = $16; //@line 3771
     break;
    }
    HEAP32[3024] = $17; //@line 3774
    HEAP32[$105 >> 2] = $106 & -2; //@line 3776
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3779
    HEAP32[$16 + $17 >> 2] = $17; //@line 3781
    return;
   }
   $21 = $13 >>> 3; //@line 3784
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3788
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3790
    $28 = 12128 + ($21 << 1 << 2) | 0; //@line 3792
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3797
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3804
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3022] = HEAP32[3022] & ~(1 << $21); //@line 3814
     $$1 = $16; //@line 3815
     $$1382 = $17; //@line 3815
     $114 = $16; //@line 3815
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3821
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3825
     }
     $41 = $26 + 8 | 0; //@line 3828
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3832
     } else {
      _abort(); //@line 3834
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3839
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3840
    $$1 = $16; //@line 3841
    $$1382 = $17; //@line 3841
    $114 = $16; //@line 3841
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3845
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3847
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3851
     $60 = $59 + 4 | 0; //@line 3852
     $61 = HEAP32[$60 >> 2] | 0; //@line 3853
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3856
      if (!$63) {
       $$3 = 0; //@line 3859
       break;
      } else {
       $$1387 = $63; //@line 3862
       $$1390 = $59; //@line 3862
      }
     } else {
      $$1387 = $61; //@line 3865
      $$1390 = $60; //@line 3865
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3868
      $66 = HEAP32[$65 >> 2] | 0; //@line 3869
      if ($66 | 0) {
       $$1387 = $66; //@line 3872
       $$1390 = $65; //@line 3872
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3875
      $69 = HEAP32[$68 >> 2] | 0; //@line 3876
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3881
       $$1390 = $68; //@line 3881
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3886
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3889
      $$3 = $$1387; //@line 3890
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3895
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3898
     }
     $53 = $51 + 12 | 0; //@line 3901
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3905
     }
     $56 = $48 + 8 | 0; //@line 3908
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3912
      HEAP32[$56 >> 2] = $51; //@line 3913
      $$3 = $48; //@line 3914
      break;
     } else {
      _abort(); //@line 3917
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3924
    $$1382 = $17; //@line 3924
    $114 = $16; //@line 3924
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3927
    $75 = 12392 + ($74 << 2) | 0; //@line 3928
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3933
      if (!$$3) {
       HEAP32[3023] = HEAP32[3023] & ~(1 << $74); //@line 3940
       $$1 = $16; //@line 3941
       $$1382 = $17; //@line 3941
       $114 = $16; //@line 3941
       break L10;
      }
     } else {
      if ((HEAP32[3026] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 3948
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 3956
       if (!$$3) {
        $$1 = $16; //@line 3959
        $$1382 = $17; //@line 3959
        $114 = $16; //@line 3959
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3026] | 0; //@line 3967
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 3970
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 3974
    $92 = $16 + 16 | 0; //@line 3975
    $93 = HEAP32[$92 >> 2] | 0; //@line 3976
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 3982
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 3986
       HEAP32[$93 + 24 >> 2] = $$3; //@line 3988
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 3994
    if (!$99) {
     $$1 = $16; //@line 3997
     $$1382 = $17; //@line 3997
     $114 = $16; //@line 3997
    } else {
     if ((HEAP32[3026] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4002
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4006
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4008
      $$1 = $16; //@line 4009
      $$1382 = $17; //@line 4009
      $114 = $16; //@line 4009
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4015
   $$1382 = $9; //@line 4015
   $114 = $2; //@line 4015
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4020
 }
 $115 = $10 + 4 | 0; //@line 4023
 $116 = HEAP32[$115 >> 2] | 0; //@line 4024
 if (!($116 & 1)) {
  _abort(); //@line 4028
 }
 if (!($116 & 2)) {
  if ((HEAP32[3028] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3025] | 0) + $$1382 | 0; //@line 4038
   HEAP32[3025] = $124; //@line 4039
   HEAP32[3028] = $$1; //@line 4040
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4043
   if (($$1 | 0) != (HEAP32[3027] | 0)) {
    return;
   }
   HEAP32[3027] = 0; //@line 4049
   HEAP32[3024] = 0; //@line 4050
   return;
  }
  if ((HEAP32[3027] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3024] | 0) + $$1382 | 0; //@line 4057
   HEAP32[3024] = $132; //@line 4058
   HEAP32[3027] = $114; //@line 4059
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4062
   HEAP32[$114 + $132 >> 2] = $132; //@line 4064
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4068
  $138 = $116 >>> 3; //@line 4069
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4074
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4076
    $145 = 12128 + ($138 << 1 << 2) | 0; //@line 4078
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3026] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4084
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4091
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3022] = HEAP32[3022] & ~(1 << $138); //@line 4101
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4107
    } else {
     if ((HEAP32[3026] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4112
     }
     $160 = $143 + 8 | 0; //@line 4115
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4119
     } else {
      _abort(); //@line 4121
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4126
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4127
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4130
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4132
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4136
      $180 = $179 + 4 | 0; //@line 4137
      $181 = HEAP32[$180 >> 2] | 0; //@line 4138
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4141
       if (!$183) {
        $$3400 = 0; //@line 4144
        break;
       } else {
        $$1398 = $183; //@line 4147
        $$1402 = $179; //@line 4147
       }
      } else {
       $$1398 = $181; //@line 4150
       $$1402 = $180; //@line 4150
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4153
       $186 = HEAP32[$185 >> 2] | 0; //@line 4154
       if ($186 | 0) {
        $$1398 = $186; //@line 4157
        $$1402 = $185; //@line 4157
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4160
       $189 = HEAP32[$188 >> 2] | 0; //@line 4161
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4166
        $$1402 = $188; //@line 4166
       }
      }
      if ((HEAP32[3026] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4172
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4175
       $$3400 = $$1398; //@line 4176
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4181
      if ((HEAP32[3026] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4185
      }
      $173 = $170 + 12 | 0; //@line 4188
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4192
      }
      $176 = $167 + 8 | 0; //@line 4195
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4199
       HEAP32[$176 >> 2] = $170; //@line 4200
       $$3400 = $167; //@line 4201
       break;
      } else {
       _abort(); //@line 4204
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4212
     $196 = 12392 + ($195 << 2) | 0; //@line 4213
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4218
       if (!$$3400) {
        HEAP32[3023] = HEAP32[3023] & ~(1 << $195); //@line 4225
        break L108;
       }
      } else {
       if ((HEAP32[3026] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4232
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4240
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3026] | 0; //@line 4250
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4253
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4257
     $213 = $10 + 16 | 0; //@line 4258
     $214 = HEAP32[$213 >> 2] | 0; //@line 4259
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4265
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4269
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4271
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4277
     if ($220 | 0) {
      if ((HEAP32[3026] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4283
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4287
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4289
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4298
  HEAP32[$114 + $137 >> 2] = $137; //@line 4300
  if (($$1 | 0) == (HEAP32[3027] | 0)) {
   HEAP32[3024] = $137; //@line 4304
   return;
  } else {
   $$2 = $137; //@line 4307
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4311
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4314
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4316
  $$2 = $$1382; //@line 4317
 }
 $235 = $$2 >>> 3; //@line 4319
 if ($$2 >>> 0 < 256) {
  $238 = 12128 + ($235 << 1 << 2) | 0; //@line 4323
  $239 = HEAP32[3022] | 0; //@line 4324
  $240 = 1 << $235; //@line 4325
  if (!($239 & $240)) {
   HEAP32[3022] = $239 | $240; //@line 4330
   $$0403 = $238; //@line 4332
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4332
  } else {
   $244 = $238 + 8 | 0; //@line 4334
   $245 = HEAP32[$244 >> 2] | 0; //@line 4335
   if ((HEAP32[3026] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4339
   } else {
    $$0403 = $245; //@line 4342
    $$pre$phiZ2D = $244; //@line 4342
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4345
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4347
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4349
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4351
  return;
 }
 $251 = $$2 >>> 8; //@line 4354
 if (!$251) {
  $$0396 = 0; //@line 4357
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4361
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4365
   $257 = $251 << $256; //@line 4366
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4369
   $262 = $257 << $260; //@line 4371
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4374
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4379
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4385
  }
 }
 $276 = 12392 + ($$0396 << 2) | 0; //@line 4388
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4390
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4393
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4394
 $280 = HEAP32[3023] | 0; //@line 4395
 $281 = 1 << $$0396; //@line 4396
 do {
  if (!($280 & $281)) {
   HEAP32[3023] = $280 | $281; //@line 4402
   HEAP32[$276 >> 2] = $$1; //@line 4403
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4405
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4407
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4409
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4417
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4417
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4424
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4428
    $301 = HEAP32[$299 >> 2] | 0; //@line 4430
    if (!$301) {
     label = 121; //@line 4433
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4436
     $$0384 = $301; //@line 4436
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3026] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4443
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4446
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4448
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4450
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4452
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4457
    $309 = HEAP32[$308 >> 2] | 0; //@line 4458
    $310 = HEAP32[3026] | 0; //@line 4459
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4465
     HEAP32[$308 >> 2] = $$1; //@line 4466
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4468
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4470
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4472
     break;
    } else {
     _abort(); //@line 4475
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3030] | 0) + -1 | 0; //@line 4482
 HEAP32[3030] = $319; //@line 4483
 if (!$319) {
  $$0212$in$i = 12544; //@line 4486
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4491
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4497
  }
 }
 HEAP32[3030] = -1; //@line 4500
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 882
 STACKTOP = STACKTOP + 32 | 0; //@line 883
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 883
 $0 = sp; //@line 884
 _gpio_init_out($0, 50); //@line 885
 while (1) {
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 888
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 889
  _wait_ms(150); //@line 890
  if (___async) {
   label = 3; //@line 893
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 896
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 898
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 899
  _wait_ms(150); //@line 900
  if (___async) {
   label = 5; //@line 903
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 906
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 908
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 909
  _wait_ms(150); //@line 910
  if (___async) {
   label = 7; //@line 913
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 916
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 918
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 919
  _wait_ms(150); //@line 920
  if (___async) {
   label = 9; //@line 923
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 926
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 928
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 929
  _wait_ms(150); //@line 930
  if (___async) {
   label = 11; //@line 933
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 936
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 938
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 939
  _wait_ms(150); //@line 940
  if (___async) {
   label = 13; //@line 943
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 946
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 948
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 949
  _wait_ms(150); //@line 950
  if (___async) {
   label = 15; //@line 953
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 956
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 958
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 959
  _wait_ms(150); //@line 960
  if (___async) {
   label = 17; //@line 963
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 966
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 968
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 969
  _wait_ms(400); //@line 970
  if (___async) {
   label = 19; //@line 973
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 976
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 978
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 979
  _wait_ms(400); //@line 980
  if (___async) {
   label = 21; //@line 983
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 986
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 988
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 989
  _wait_ms(400); //@line 990
  if (___async) {
   label = 23; //@line 993
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 996
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 998
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 999
  _wait_ms(400); //@line 1000
  if (___async) {
   label = 25; //@line 1003
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1006
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1008
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1009
  _wait_ms(400); //@line 1010
  if (___async) {
   label = 27; //@line 1013
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1016
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1018
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1019
  _wait_ms(400); //@line 1020
  if (___async) {
   label = 29; //@line 1023
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1026
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1028
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1029
  _wait_ms(400); //@line 1030
  if (___async) {
   label = 31; //@line 1033
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1036
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1038
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1039
  _wait_ms(400); //@line 1040
  if (___async) {
   label = 33; //@line 1043
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1046
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 8; //@line 1050
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1052
   sp = STACKTOP; //@line 1053
   STACKTOP = sp; //@line 1054
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 9; //@line 1058
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1060
   sp = STACKTOP; //@line 1061
   STACKTOP = sp; //@line 1062
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 10; //@line 1066
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1068
   sp = STACKTOP; //@line 1069
   STACKTOP = sp; //@line 1070
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 11; //@line 1074
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1076
   sp = STACKTOP; //@line 1077
   STACKTOP = sp; //@line 1078
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 12; //@line 1082
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1084
   sp = STACKTOP; //@line 1085
   STACKTOP = sp; //@line 1086
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 13; //@line 1090
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1092
   sp = STACKTOP; //@line 1093
   STACKTOP = sp; //@line 1094
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 14; //@line 1098
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1100
   sp = STACKTOP; //@line 1101
   STACKTOP = sp; //@line 1102
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 15; //@line 1106
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1108
   sp = STACKTOP; //@line 1109
   STACKTOP = sp; //@line 1110
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 16; //@line 1114
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1116
   sp = STACKTOP; //@line 1117
   STACKTOP = sp; //@line 1118
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 17; //@line 1122
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1124
   sp = STACKTOP; //@line 1125
   STACKTOP = sp; //@line 1126
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 18; //@line 1130
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1132
   sp = STACKTOP; //@line 1133
   STACKTOP = sp; //@line 1134
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 19; //@line 1138
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1140
   sp = STACKTOP; //@line 1141
   STACKTOP = sp; //@line 1142
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 20; //@line 1146
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1148
   sp = STACKTOP; //@line 1149
   STACKTOP = sp; //@line 1150
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 21; //@line 1154
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1156
   sp = STACKTOP; //@line 1157
   STACKTOP = sp; //@line 1158
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 22; //@line 1162
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1164
   sp = STACKTOP; //@line 1165
   STACKTOP = sp; //@line 1166
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 23; //@line 1170
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1172
   sp = STACKTOP; //@line 1173
   STACKTOP = sp; //@line 1174
   return;
  }
 }
}
function _BSP_LCD_DisplayChar($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$03641$i$us = 0, $$03641$i$us5 = 0, $$03641$us$i$us = 0, $$03740$i$us = 0, $$03740$i$us6 = 0, $$03740$us$i$us = 0, $$03839$i$us = 0, $$03839$i$us10 = 0, $$03839$us$i$us = 0, $10 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $23 = 0, $26 = 0, $27 = 0, $3 = 0, $31 = 0, $32 = 0, $37 = 0, $50 = 0, $57 = 0, $58 = 0, $63 = 0, $76 = 0, $8 = 0, $88 = 0, $89 = 0, $9 = 0, $94 = 0;
 $3 = HEAP32[3152] | 0; //@line 291
 $8 = HEAP16[$3 + 6 >> 1] | 0; //@line 296
 $9 = $8 & 65535; //@line 297
 $10 = Math_imul(($2 & 255) + -32 | 0, $9) | 0; //@line 298
 $12 = HEAP16[$3 + 4 >> 1] | 0; //@line 300
 $13 = $12 & 65535; //@line 301
 $15 = ($13 + 7 | 0) >>> 3; //@line 303
 $17 = (HEAP32[$3 >> 2] | 0) + (Math_imul($10, $15) | 0) | 0; //@line 305
 if (!($8 << 16 >> 16)) {
  return;
 }
 $23 = $12 << 16 >> 16 != 0; //@line 315
 $26 = $13 + -1 + (($12 + 7 & 248) - $13 & 255) | 0; //@line 318
 $27 = $0 & 65535; //@line 319
 switch ($15 & 16383) {
 case 1:
  {
   if ($23) {
    $$03641$us$i$us = $1; //@line 324
    $$03740$us$i$us = 0; //@line 324
   } else {
    return;
   }
   while (1) {
    $31 = HEAPU8[$17 + (Math_imul($$03740$us$i$us, $15) | 0) >> 0] | 0; //@line 332
    $32 = $$03641$us$i$us & 65535; //@line 333
    $$03839$us$i$us = 0; //@line 334
    do {
     $37 = $$03839$us$i$us + $27 | 0; //@line 340
     if (!(1 << $26 - $$03839$us$i$us & $31)) {
      _emscripten_asm_const_iiii(3, $37 & 65535 | 0, $32 | 0, HEAP32[3151] & 65535 | 0) | 0; //@line 345
     } else {
      _emscripten_asm_const_iiii(3, $37 & 65535 | 0, $32 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 350
     }
     $$03839$us$i$us = $$03839$us$i$us + 1 | 0; //@line 352
    } while (($$03839$us$i$us | 0) != ($13 | 0));
    $$03740$us$i$us = $$03740$us$i$us + 1 | 0; //@line 361
    if (($$03740$us$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$us$i$us = $$03641$us$i$us + 1 << 16 >> 16; //@line 366
    }
   }
   return;
  }
 case 2:
  {
   $$03641$i$us = $1; //@line 373
   $$03740$i$us = 0; //@line 373
   while (1) {
    $50 = $17 + (Math_imul($$03740$i$us, $15) | 0) | 0; //@line 376
    $57 = (HEAPU8[$50 >> 0] | 0) << 8 | (HEAPU8[$50 + 1 >> 0] | 0); //@line 383
    if ($23) {
     $58 = $$03641$i$us & 65535; //@line 385
     $$03839$i$us = 0; //@line 386
     do {
      $63 = $$03839$i$us + $27 | 0; //@line 392
      if (!(1 << $26 - $$03839$i$us & $57)) {
       _emscripten_asm_const_iiii(3, $63 & 65535 | 0, $58 | 0, HEAP32[3151] & 65535 | 0) | 0; //@line 397
      } else {
       _emscripten_asm_const_iiii(3, $63 & 65535 | 0, $58 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 402
      }
      $$03839$i$us = $$03839$i$us + 1 | 0; //@line 404
     } while (($$03839$i$us | 0) != ($13 | 0));
    }
    $$03740$i$us = $$03740$i$us + 1 | 0; //@line 414
    if (($$03740$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us = $$03641$i$us + 1 << 16 >> 16; //@line 419
    }
   }
   return;
  }
 default:
  {
   if ($23) {
    $$03641$i$us5 = $1; //@line 427
    $$03740$i$us6 = 0; //@line 427
   } else {
    return;
   }
   while (1) {
    $76 = $17 + (Math_imul($$03740$i$us6, $15) | 0) | 0; //@line 433
    $88 = (HEAPU8[$76 + 1 >> 0] | 0) << 8 | (HEAPU8[$76 >> 0] | 0) << 16 | (HEAPU8[$76 + 2 >> 0] | 0); //@line 445
    $89 = $$03641$i$us5 & 65535; //@line 446
    $$03839$i$us10 = 0; //@line 447
    do {
     $94 = $$03839$i$us10 + $27 | 0; //@line 453
     if (!(1 << $26 - $$03839$i$us10 & $88)) {
      _emscripten_asm_const_iiii(3, $94 & 65535 | 0, $89 | 0, HEAP32[3151] & 65535 | 0) | 0; //@line 458
     } else {
      _emscripten_asm_const_iiii(3, $94 & 65535 | 0, $89 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 463
     }
     $$03839$i$us10 = $$03839$i$us10 + 1 | 0; //@line 465
    } while (($$03839$i$us10 | 0) != ($13 | 0));
    $$03740$i$us6 = $$03740$i$us6 + 1 | 0; //@line 474
    if (($$03740$i$us6 | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us5 = $$03641$i$us5 + 1 << 16 >> 16; //@line 479
    }
   }
   return;
  }
 }
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5713
 STACKTOP = STACKTOP + 64 | 0; //@line 5714
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 5714
 $4 = sp; //@line 5715
 $5 = HEAP32[$0 >> 2] | 0; //@line 5716
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 5719
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 5721
 HEAP32[$4 >> 2] = $2; //@line 5722
 HEAP32[$4 + 4 >> 2] = $0; //@line 5724
 HEAP32[$4 + 8 >> 2] = $1; //@line 5726
 HEAP32[$4 + 12 >> 2] = $3; //@line 5728
 $14 = $4 + 16 | 0; //@line 5729
 $15 = $4 + 20 | 0; //@line 5730
 $16 = $4 + 24 | 0; //@line 5731
 $17 = $4 + 28 | 0; //@line 5732
 $18 = $4 + 32 | 0; //@line 5733
 $19 = $4 + 40 | 0; //@line 5734
 dest = $14; //@line 5735
 stop = dest + 36 | 0; //@line 5735
 do {
  HEAP32[dest >> 2] = 0; //@line 5735
  dest = dest + 4 | 0; //@line 5735
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 5735
 HEAP8[$14 + 38 >> 0] = 0; //@line 5735
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 5740
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 5743
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5744
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 5745
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 41; //@line 5748
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 5750
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 5752
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 5754
    sp = STACKTOP; //@line 5755
    STACKTOP = sp; //@line 5756
    return 0; //@line 5756
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5758
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 5762
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 5766
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 5769
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 5770
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 5771
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 42; //@line 5774
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 5776
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 5778
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 5780
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 5782
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 5784
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 5786
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 5788
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 5790
    sp = STACKTOP; //@line 5791
    STACKTOP = sp; //@line 5792
    return 0; //@line 5792
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5794
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 5808
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 5816
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 5832
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 5837
  }
 } while (0);
 STACKTOP = sp; //@line 5840
 return $$0 | 0; //@line 5840
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5073
 do {
  if (!$0) {
   do {
    if (!(HEAP32[62] | 0)) {
     $34 = 0; //@line 5081
    } else {
     $12 = HEAP32[62] | 0; //@line 5083
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5084
     $13 = _fflush($12) | 0; //@line 5085
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 34; //@line 5088
      sp = STACKTOP; //@line 5089
      return 0; //@line 5090
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5092
      $34 = $13; //@line 5093
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5099
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5103
    } else {
     $$02327 = $$02325; //@line 5105
     $$02426 = $34; //@line 5105
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5112
      } else {
       $28 = 0; //@line 5114
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5122
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5123
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5128
       $$1 = $25 | $$02426; //@line 5130
      } else {
       $$1 = $$02426; //@line 5132
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5136
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5139
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5142
       break L9;
      } else {
       $$02327 = $$023; //@line 5145
       $$02426 = $$1; //@line 5145
      }
     }
     HEAP32[$AsyncCtx >> 2] = 35; //@line 5148
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5150
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5152
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5154
     sp = STACKTOP; //@line 5155
     return 0; //@line 5156
    }
   } while (0);
   ___ofl_unlock(); //@line 5159
   $$0 = $$024$lcssa; //@line 5160
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5166
    $5 = ___fflush_unlocked($0) | 0; //@line 5167
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 32; //@line 5170
     sp = STACKTOP; //@line 5171
     return 0; //@line 5172
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5174
     $$0 = $5; //@line 5175
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5180
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5181
   $7 = ___fflush_unlocked($0) | 0; //@line 5182
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 33; //@line 5185
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 5188
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5190
    sp = STACKTOP; //@line 5191
    return 0; //@line 5192
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5194
   if ($phitmp) {
    $$0 = $7; //@line 5196
   } else {
    ___unlockfile($0); //@line 5198
    $$0 = $7; //@line 5199
   }
  }
 } while (0);
 return $$0 | 0; //@line 5203
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5895
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5901
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 5907
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 5910
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5911
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 5912
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 45; //@line 5915
     sp = STACKTOP; //@line 5916
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5919
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 5927
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 5932
     $19 = $1 + 44 | 0; //@line 5933
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 5939
     HEAP8[$22 >> 0] = 0; //@line 5940
     $23 = $1 + 53 | 0; //@line 5941
     HEAP8[$23 >> 0] = 0; //@line 5942
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 5944
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 5947
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 5948
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 5949
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 44; //@line 5952
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 5954
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5956
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 5958
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 5960
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 5962
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 5964
      sp = STACKTOP; //@line 5965
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 5968
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 5972
      label = 13; //@line 5973
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 5978
       label = 13; //@line 5979
      } else {
       $$037$off039 = 3; //@line 5981
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 5985
      $39 = $1 + 40 | 0; //@line 5986
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 5989
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 5999
        $$037$off039 = $$037$off038; //@line 6000
       } else {
        $$037$off039 = $$037$off038; //@line 6002
       }
      } else {
       $$037$off039 = $$037$off038; //@line 6005
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 6008
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 6015
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
 sp = STACKTOP; //@line 4525
 STACKTOP = STACKTOP + 48 | 0; //@line 4526
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4526
 $vararg_buffer3 = sp + 16 | 0; //@line 4527
 $vararg_buffer = sp; //@line 4528
 $3 = sp + 32 | 0; //@line 4529
 $4 = $0 + 28 | 0; //@line 4530
 $5 = HEAP32[$4 >> 2] | 0; //@line 4531
 HEAP32[$3 >> 2] = $5; //@line 4532
 $7 = $0 + 20 | 0; //@line 4534
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4536
 HEAP32[$3 + 4 >> 2] = $9; //@line 4537
 HEAP32[$3 + 8 >> 2] = $1; //@line 4539
 HEAP32[$3 + 12 >> 2] = $2; //@line 4541
 $12 = $9 + $2 | 0; //@line 4542
 $13 = $0 + 60 | 0; //@line 4543
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4546
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4548
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4550
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4552
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4556
  } else {
   $$04756 = 2; //@line 4558
   $$04855 = $12; //@line 4558
   $$04954 = $3; //@line 4558
   $27 = $17; //@line 4558
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4564
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4566
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4567
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4569
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4571
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4573
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4576
    $44 = $$150 + 4 | 0; //@line 4577
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4580
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4583
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4585
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4587
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4589
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4592
     break L1;
    } else {
     $$04756 = $$1; //@line 4595
     $$04954 = $$150; //@line 4595
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4599
   HEAP32[$4 >> 2] = 0; //@line 4600
   HEAP32[$7 >> 2] = 0; //@line 4601
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4604
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4607
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4612
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4618
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4623
  $25 = $20; //@line 4624
  HEAP32[$4 >> 2] = $25; //@line 4625
  HEAP32[$7 >> 2] = $25; //@line 4626
  $$051 = $2; //@line 4627
 }
 STACKTOP = sp; //@line 4629
 return $$051 | 0; //@line 4629
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 7326
 }
 ret = dest | 0; //@line 7329
 dest_end = dest + num | 0; //@line 7330
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 7334
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7335
   dest = dest + 1 | 0; //@line 7336
   src = src + 1 | 0; //@line 7337
   num = num - 1 | 0; //@line 7338
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 7340
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 7341
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7343
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 7344
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 7345
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 7346
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 7347
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 7348
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 7349
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 7350
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 7351
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 7352
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 7353
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 7354
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 7355
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 7356
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 7357
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 7358
   dest = dest + 64 | 0; //@line 7359
   src = src + 64 | 0; //@line 7360
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7363
   dest = dest + 4 | 0; //@line 7364
   src = src + 4 | 0; //@line 7365
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 7369
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7371
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 7372
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 7373
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 7374
   dest = dest + 4 | 0; //@line 7375
   src = src + 4 | 0; //@line 7376
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7381
  dest = dest + 1 | 0; //@line 7382
  src = src + 1 | 0; //@line 7383
 }
 return ret | 0; //@line 7385
}
function _BSP_LCD_FillCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04157 = 0, $$04256 = 0, $$058 = 0, $$07$i = 0, $$07$i45 = 0, $$07$i49 = 0, $$07$i53 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $14 = 0, $17 = 0, $25 = 0, $3 = 0, $33 = 0, $34 = 0, $36 = 0, $39 = 0, $47 = 0, $8 = 0, $9 = 0;
 $3 = $2 & 65535; //@line 683
 HEAP32[3150] = HEAP32[3150] & 65535; //@line 688
 $8 = $0 & 65535; //@line 689
 $9 = $1 & 65535; //@line 690
 $$04157 = 0; //@line 691
 $$04256 = 3 - ($3 << 1) | 0; //@line 691
 $$058 = $3; //@line 691
 while (1) {
  if ($$058 | 0) {
   $11 = $8 - $$058 | 0; //@line 695
   $12 = $$058 << 1; //@line 696
   $14 = $12 & 65534; //@line 698
   if (($12 & 65535) << 16 >> 16) {
    $17 = $$04157 + $9 & 65535; //@line 702
    $$07$i = 0; //@line 703
    do {
     _emscripten_asm_const_iiii(3, $$07$i + $11 & 65535 | 0, $17 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 709
     $$07$i = $$07$i + 1 | 0; //@line 710
    } while (($$07$i | 0) != ($14 | 0));
    $25 = $9 - $$04157 & 65535; //@line 719
    $$07$i45 = 0; //@line 720
    do {
     _emscripten_asm_const_iiii(3, $$07$i45 + $11 & 65535 | 0, $25 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 726
     $$07$i45 = $$07$i45 + 1 | 0; //@line 727
    } while (($$07$i45 | 0) != ($14 | 0));
   }
  }
  if ($$04157 | 0) {
   $33 = $8 - $$04157 | 0; //@line 739
   $34 = $$04157 << 1; //@line 740
   $36 = $34 & 65534; //@line 742
   if (($34 & 65535) << 16 >> 16) {
    $39 = $9 - $$058 & 65535; //@line 746
    $$07$i49 = 0; //@line 747
    do {
     _emscripten_asm_const_iiii(3, $$07$i49 + $33 & 65535 | 0, $39 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 753
     $$07$i49 = $$07$i49 + 1 | 0; //@line 754
    } while (($$07$i49 | 0) != ($36 | 0));
    $47 = $$058 + $9 & 65535; //@line 763
    $$07$i53 = 0; //@line 764
    do {
     _emscripten_asm_const_iiii(3, $$07$i53 + $33 & 65535 | 0, $47 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 770
     $$07$i53 = $$07$i53 + 1 | 0; //@line 771
    } while (($$07$i53 | 0) != ($36 | 0));
   }
  }
  if (($$04256 | 0) < 0) {
   $$1 = $$058; //@line 785
   $$pn = ($$04157 << 2) + 6 | 0; //@line 785
  } else {
   $$1 = $$058 + -1 | 0; //@line 791
   $$pn = ($$04157 - $$058 << 2) + 10 | 0; //@line 791
  }
  $$04157 = $$04157 + 1 | 0; //@line 794
  if ($$04157 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04256 = $$pn + $$04256 | 0; //@line 799
   $$058 = $$1; //@line 799
  }
 }
 HEAP32[3150] = HEAP32[3150] & 65535; //@line 804
 _BSP_LCD_DrawCircle($0, $1, $2); //@line 805
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5396
 STACKTOP = STACKTOP + 64 | 0; //@line 5397
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 5397
 $3 = sp; //@line 5398
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 5401
 } else {
  if (!$1) {
   $$2 = 0; //@line 5405
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 5407
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 5408
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 39; //@line 5411
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 5413
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5415
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 5417
    sp = STACKTOP; //@line 5418
    STACKTOP = sp; //@line 5419
    return 0; //@line 5419
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5421
   if (!$6) {
    $$2 = 0; //@line 5424
   } else {
    dest = $3 + 4 | 0; //@line 5427
    stop = dest + 52 | 0; //@line 5427
    do {
     HEAP32[dest >> 2] = 0; //@line 5427
     dest = dest + 4 | 0; //@line 5427
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 5428
    HEAP32[$3 + 8 >> 2] = $0; //@line 5430
    HEAP32[$3 + 12 >> 2] = -1; //@line 5432
    HEAP32[$3 + 48 >> 2] = 1; //@line 5434
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 5437
    $18 = HEAP32[$2 >> 2] | 0; //@line 5438
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5439
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 5440
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 40; //@line 5443
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 5445
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5447
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5449
     sp = STACKTOP; //@line 5450
     STACKTOP = sp; //@line 5451
     return 0; //@line 5451
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5453
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 5460
     $$0 = 1; //@line 5461
    } else {
     $$0 = 0; //@line 5463
    }
    $$2 = $$0; //@line 5465
   }
  }
 }
 STACKTOP = sp; //@line 5469
 return $$2 | 0; //@line 5469
}
function _main() {
 var $1 = 0, $10 = 0, $11 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1277
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1278
 _puts(11841) | 0; //@line 1279
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 27; //@line 1282
  sp = STACKTOP; //@line 1283
  return 0; //@line 1284
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1286
 _BSP_LCD_Init() | 0; //@line 1287
 $1 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 1289
 do {
  if ((_BSP_TS_Init($1, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1296
   _puts(11861) | 0; //@line 1297
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 28; //@line 1300
    sp = STACKTOP; //@line 1301
    return 0; //@line 1302
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1304
    break;
   }
  }
 } while (0);
 _BSP_LCD_Clear(-1); //@line 1309
 _BSP_LCD_SetTextColor(2016); //@line 1310
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 1313
 _BSP_LCD_SetTextColor(0); //@line 1314
 _BSP_LCD_SetBackColor(2016); //@line 1315
 _BSP_LCD_SetFont(104); //@line 1316
 _BSP_LCD_DisplayStringAt(0, 15, 11879, 1); //@line 1317
 while (1) {
  $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1319
  _BSP_TS_GetState(12612) | 0; //@line 1320
  if (___async) {
   label = 9; //@line 1323
   break;
  }
  _emscripten_free_async_context($AsyncCtx10 | 0); //@line 1326
  if (!(HEAP8[12612] | 0)) {
   continue;
  }
  $10 = HEAP16[6307] | 0; //@line 1332
  $11 = HEAP16[6309] | 0; //@line 1333
  _BSP_LCD_SetTextColor(-2048); //@line 1334
  _BSP_LCD_FillCircle($10, $11, 5); //@line 1335
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1336
  _wait_ms(10); //@line 1337
  if (___async) {
   label = 12; //@line 1340
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1343
 }
 if ((label | 0) == 9) {
  HEAP32[$AsyncCtx10 >> 2] = 29; //@line 1346
  sp = STACKTOP; //@line 1347
  return 0; //@line 1348
 } else if ((label | 0) == 12) {
  HEAP32[$AsyncCtx7 >> 2] = 30; //@line 1351
  sp = STACKTOP; //@line 1352
  return 0; //@line 1353
 }
 return 0; //@line 1355
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5209
 $1 = $0 + 20 | 0; //@line 5210
 $3 = $0 + 28 | 0; //@line 5212
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 5218
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5219
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 5220
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 36; //@line 5223
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5225
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 5227
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5229
    sp = STACKTOP; //@line 5230
    return 0; //@line 5231
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5233
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 5237
     break;
    } else {
     label = 5; //@line 5240
     break;
    }
   }
  } else {
   label = 5; //@line 5245
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 5249
  $14 = HEAP32[$13 >> 2] | 0; //@line 5250
  $15 = $0 + 8 | 0; //@line 5251
  $16 = HEAP32[$15 >> 2] | 0; //@line 5252
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5260
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 5261
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 5262
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 37; //@line 5265
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5267
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5269
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5271
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5273
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5275
     sp = STACKTOP; //@line 5276
     return 0; //@line 5277
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5279
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 5285
  HEAP32[$3 >> 2] = 0; //@line 5286
  HEAP32[$1 >> 2] = 0; //@line 5287
  HEAP32[$15 >> 2] = 0; //@line 5288
  HEAP32[$13 >> 2] = 0; //@line 5289
  $$0 = 0; //@line 5290
 }
 return $$0 | 0; //@line 5292
}
function _BSP_LCD_DisplayStringAt($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$030$lcssa = 0, $$03037 = 0, $$03136 = 0, $$032 = 0, $$03334 = 0, $$038 = 0, $$135 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $28 = 0, $29 = 0, $47 = 0, $49 = 0, $54 = 0, $7 = 0;
 if (!(HEAP8[$2 >> 0] | 0)) {
  $$030$lcssa = 0; //@line 499
 } else {
  $$03037 = 0; //@line 501
  $$038 = $2; //@line 501
  while (1) {
   $$038 = $$038 + 1 | 0; //@line 503
   $7 = $$03037 + 1 | 0; //@line 504
   if (!(HEAP8[$$038 >> 0] | 0)) {
    $$030$lcssa = $7; //@line 508
    break;
   } else {
    $$03037 = $7; //@line 511
   }
  }
 }
 $10 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 515
 $13 = HEAP16[(HEAP32[3152] | 0) + 4 >> 1] | 0; //@line 518
 $14 = $13 & 65535; //@line 519
 $15 = (($10 & 65535) / ($13 & 65535) | 0) & 65535; //@line 521
 switch ($3 | 0) {
 case 1:
  {
   $$032 = ((Math_imul($15 - $$030$lcssa | 0, $14) | 0) >>> 1) + ($0 & 65535) & 65535; //@line 530
   break;
  }
 case 2:
  {
   $$032 = (Math_imul($15 - $$030$lcssa | 0, $14) | 0) - ($0 & 65535) & 65535; //@line 539
   break;
  }
 default:
  {
   $$032 = $0; //@line 543
  }
 }
 $28 = (HEAP8[$2 >> 0] | 0) != 0; //@line 547
 $29 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 548
 if (!($28 & ($29 & 65535) >= (HEAPU16[(HEAP32[3152] | 0) + 4 >> 1] | 0))) {
  return;
 }
 $$03136 = 0; //@line 559
 $$03334 = $2; //@line 559
 $$135 = $$032 << 16 >> 16 > 1 ? $$032 : 1; //@line 559
 do {
  _BSP_LCD_DisplayChar($$135, $1, HEAP8[$$03334 >> 0] | 0); //@line 562
  $$135 = (HEAPU16[(HEAP32[3152] | 0) + 4 >> 1] | 0) + ($$135 & 65535) & 65535; //@line 569
  $$03334 = $$03334 + 1 | 0; //@line 570
  $$03136 = $$03136 + 1 << 16 >> 16; //@line 571
  $47 = (HEAP8[$$03334 >> 0] | 0) != 0; //@line 573
  $49 = (_ST7789H2_GetLcdPixelWidth() | 0) & 65535; //@line 575
  $54 = HEAPU16[(HEAP32[3152] | 0) + 4 >> 1] | 0; //@line 580
 } while ($47 & ($49 - (Math_imul($54, $$03136 & 65535) | 0) & 65535) >>> 0 >= $54 >>> 0);
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 4976
 $4 = HEAP32[$3 >> 2] | 0; //@line 4977
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 4984
   label = 5; //@line 4985
  } else {
   $$1 = 0; //@line 4987
  }
 } else {
  $12 = $4; //@line 4991
  label = 5; //@line 4992
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 4996
   $10 = HEAP32[$9 >> 2] | 0; //@line 4997
   $14 = $10; //@line 5000
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5005
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5013
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5017
       $$141 = $0; //@line 5017
       $$143 = $1; //@line 5017
       $31 = $14; //@line 5017
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5020
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5027
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5032
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5035
      break L5;
     }
     $$139 = $$038; //@line 5041
     $$141 = $0 + $$038 | 0; //@line 5041
     $$143 = $1 - $$038 | 0; //@line 5041
     $31 = HEAP32[$9 >> 2] | 0; //@line 5041
    } else {
     $$139 = 0; //@line 5043
     $$141 = $0; //@line 5043
     $$143 = $1; //@line 5043
     $31 = $14; //@line 5043
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5046
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5049
   $$1 = $$139 + $$143 | 0; //@line 5051
  }
 } while (0);
 return $$1 | 0; //@line 5054
}
function _BSP_LCD_DrawCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04852 = 0, $$04951 = 0, $$053 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $17 = 0, $23 = 0, $24 = 0, $29 = 0, $3 = 0, $34 = 0, $42 = 0, $6 = 0, $7 = 0;
 $3 = $2 & 65535; //@line 603
 $6 = $0 & 65535; //@line 606
 $7 = $1 & 65535; //@line 607
 $$04852 = 0; //@line 608
 $$04951 = 3 - ($3 << 1) | 0; //@line 608
 $$053 = $3; //@line 608
 while (1) {
  $11 = $$04852 + $6 & 65535; //@line 613
  $12 = $7 - $$053 & 65535; //@line 614
  _emscripten_asm_const_iiii(3, $11 | 0, $12 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 616
  $17 = $6 - $$04852 & 65535; //@line 619
  _emscripten_asm_const_iiii(3, $17 | 0, $12 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 621
  $23 = $$053 + $6 & 65535; //@line 625
  $24 = $7 - $$04852 & 65535; //@line 626
  _emscripten_asm_const_iiii(3, $23 | 0, $24 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 628
  $29 = $6 - $$053 & 65535; //@line 631
  _emscripten_asm_const_iiii(3, $29 | 0, $24 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 633
  $34 = $$053 + $7 & 65535; //@line 636
  _emscripten_asm_const_iiii(3, $11 | 0, $34 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 638
  _emscripten_asm_const_iiii(3, $17 | 0, $34 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 641
  $42 = $$04852 + $7 & 65535; //@line 644
  _emscripten_asm_const_iiii(3, $23 | 0, $42 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 646
  _emscripten_asm_const_iiii(3, $29 | 0, $42 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 649
  HEAP32[3152] = 96; //@line 650
  if (($$04951 | 0) < 0) {
   $$1 = $$053; //@line 655
   $$pn = ($$04852 << 2) + 6 | 0; //@line 655
  } else {
   $$1 = $$053 + -1 | 0; //@line 661
   $$pn = ($$04852 - $$053 << 2) + 10 | 0; //@line 661
  }
  $$04852 = $$04852 + 1 | 0; //@line 664
  if ($$04852 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04951 = $$pn + $$04951 | 0; //@line 669
   $$053 = $$1; //@line 669
  }
 }
 return;
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4862
 STACKTOP = STACKTOP + 16 | 0; //@line 4863
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4863
 $2 = sp; //@line 4864
 $3 = $1 & 255; //@line 4865
 HEAP8[$2 >> 0] = $3; //@line 4866
 $4 = $0 + 16 | 0; //@line 4867
 $5 = HEAP32[$4 >> 2] | 0; //@line 4868
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 4875
   label = 4; //@line 4876
  } else {
   $$0 = -1; //@line 4878
  }
 } else {
  $12 = $5; //@line 4881
  label = 4; //@line 4882
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 4886
   $10 = HEAP32[$9 >> 2] | 0; //@line 4887
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 4890
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 4897
     HEAP8[$10 >> 0] = $3; //@line 4898
     $$0 = $13; //@line 4899
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 4904
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4905
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 4906
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 31; //@line 4909
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 4911
    sp = STACKTOP; //@line 4912
    STACKTOP = sp; //@line 4913
    return 0; //@line 4913
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 4915
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 4920
   } else {
    $$0 = -1; //@line 4922
   }
  }
 } while (0);
 STACKTOP = sp; //@line 4926
 return $$0 | 0; //@line 4926
}
function _fflush__async_cb_5($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6368
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6370
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6372
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 6376
  } else {
   $$02327 = $$02325; //@line 6378
   $$02426 = $AsyncRetVal; //@line 6378
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 6385
    } else {
     $16 = 0; //@line 6387
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 6399
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6402
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 6405
     break L3;
    } else {
     $$02327 = $$023; //@line 6408
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 6411
   $13 = ___fflush_unlocked($$02327) | 0; //@line 6412
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 6416
    ___async_unwind = 0; //@line 6417
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 35; //@line 6419
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 6421
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 6423
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 6425
   sp = STACKTOP; //@line 6426
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 6430
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 6432
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 7390
 value = value & 255; //@line 7392
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 7395
   ptr = ptr + 1 | 0; //@line 7396
  }
  aligned_end = end & -4 | 0; //@line 7399
  block_aligned_end = aligned_end - 64 | 0; //@line 7400
  value4 = value | value << 8 | value << 16 | value << 24; //@line 7401
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7404
   HEAP32[ptr + 4 >> 2] = value4; //@line 7405
   HEAP32[ptr + 8 >> 2] = value4; //@line 7406
   HEAP32[ptr + 12 >> 2] = value4; //@line 7407
   HEAP32[ptr + 16 >> 2] = value4; //@line 7408
   HEAP32[ptr + 20 >> 2] = value4; //@line 7409
   HEAP32[ptr + 24 >> 2] = value4; //@line 7410
   HEAP32[ptr + 28 >> 2] = value4; //@line 7411
   HEAP32[ptr + 32 >> 2] = value4; //@line 7412
   HEAP32[ptr + 36 >> 2] = value4; //@line 7413
   HEAP32[ptr + 40 >> 2] = value4; //@line 7414
   HEAP32[ptr + 44 >> 2] = value4; //@line 7415
   HEAP32[ptr + 48 >> 2] = value4; //@line 7416
   HEAP32[ptr + 52 >> 2] = value4; //@line 7417
   HEAP32[ptr + 56 >> 2] = value4; //@line 7418
   HEAP32[ptr + 60 >> 2] = value4; //@line 7419
   ptr = ptr + 64 | 0; //@line 7420
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7424
   ptr = ptr + 4 | 0; //@line 7425
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 7430
  ptr = ptr + 1 | 0; //@line 7431
 }
 return end - num | 0; //@line 7433
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6269
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 6279
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 6279
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 6279
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 6283
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 6286
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 6289
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 6297
  } else {
   $20 = 0; //@line 6299
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 6309
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 6313
  HEAP32[___async_retval >> 2] = $$1; //@line 6315
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 6318
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 6319
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 6323
  ___async_unwind = 0; //@line 6324
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 35; //@line 6326
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 6328
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 6330
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 6332
 sp = STACKTOP; //@line 6333
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7171
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7173
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7175
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7177
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 7182
  } else {
   $9 = $4 + 4 | 0; //@line 7184
   $10 = HEAP32[$9 >> 2] | 0; //@line 7185
   $11 = $4 + 8 | 0; //@line 7186
   $12 = HEAP32[$11 >> 2] | 0; //@line 7187
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 7191
    HEAP32[$6 >> 2] = 0; //@line 7192
    HEAP32[$2 >> 2] = 0; //@line 7193
    HEAP32[$11 >> 2] = 0; //@line 7194
    HEAP32[$9 >> 2] = 0; //@line 7195
    $$0 = 0; //@line 7196
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 7203
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 7204
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 7205
   if (!___async) {
    ___async_unwind = 0; //@line 7208
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 7210
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 7212
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 7214
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 7216
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 7218
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 7220
   sp = STACKTOP; //@line 7221
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 7226
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_6($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 6465
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6467
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6469
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6471
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6473
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 6478
  return;
 }
 dest = $2 + 4 | 0; //@line 6482
 stop = dest + 52 | 0; //@line 6482
 do {
  HEAP32[dest >> 2] = 0; //@line 6482
  dest = dest + 4 | 0; //@line 6482
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 6483
 HEAP32[$2 + 8 >> 2] = $4; //@line 6485
 HEAP32[$2 + 12 >> 2] = -1; //@line 6487
 HEAP32[$2 + 48 >> 2] = 1; //@line 6489
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 6492
 $16 = HEAP32[$6 >> 2] | 0; //@line 6493
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 6494
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 6495
 if (!___async) {
  ___async_unwind = 0; //@line 6498
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 40; //@line 6500
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 6502
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 6504
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 6506
 sp = STACKTOP; //@line 6507
 return;
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7071
 _BSP_LCD_Init() | 0; //@line 7072
 $2 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 7074
 if ((_BSP_TS_Init($2, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7080
  _puts(11861) | 0; //@line 7081
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 7084
   sp = STACKTOP; //@line 7085
   return;
  }
  ___async_unwind = 0; //@line 7088
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 7089
  sp = STACKTOP; //@line 7090
  return;
 }
 _BSP_LCD_Clear(-1); //@line 7093
 _BSP_LCD_SetTextColor(2016); //@line 7094
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 7097
 _BSP_LCD_SetTextColor(0); //@line 7098
 _BSP_LCD_SetBackColor(2016); //@line 7099
 _BSP_LCD_SetFont(104); //@line 7100
 _BSP_LCD_DisplayStringAt(0, 15, 11879, 1); //@line 7101
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 7102
 _BSP_TS_GetState(12612) | 0; //@line 7103
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 7106
  sp = STACKTOP; //@line 7107
  return;
 }
 ___async_unwind = 0; //@line 7110
 HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 7111
 sp = STACKTOP; //@line 7112
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 4728
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 4733
   label = 4; //@line 4734
  } else {
   $$01519 = $0; //@line 4736
   $23 = $1; //@line 4736
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 4741
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 4744
    $23 = $6; //@line 4745
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 4749
     label = 4; //@line 4750
     break;
    } else {
     $$01519 = $6; //@line 4753
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 4759
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 4761
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 4769
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 4777
  } else {
   $$pn = $$0; //@line 4779
   while (1) {
    $19 = $$pn + 1 | 0; //@line 4781
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 4785
     break;
    } else {
     $$pn = $19; //@line 4788
    }
   }
  }
  $$sink = $$1$lcssa; //@line 4793
 }
 return $$sink - $1 | 0; //@line 4796
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 5643
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 5650
   $10 = $1 + 16 | 0; //@line 5651
   $11 = HEAP32[$10 >> 2] | 0; //@line 5652
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 5655
    HEAP32[$1 + 24 >> 2] = $4; //@line 5657
    HEAP32[$1 + 36 >> 2] = 1; //@line 5659
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 5669
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 5674
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 5677
    HEAP8[$1 + 54 >> 0] = 1; //@line 5679
    break;
   }
   $21 = $1 + 24 | 0; //@line 5682
   $22 = HEAP32[$21 >> 2] | 0; //@line 5683
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 5686
    $28 = $4; //@line 5687
   } else {
    $28 = $22; //@line 5689
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 5698
   }
  }
 } while (0);
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5298
 $1 = HEAP32[30] | 0; //@line 5299
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 5305
 } else {
  $19 = 0; //@line 5307
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 5313
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 5319
    $12 = HEAP32[$11 >> 2] | 0; //@line 5320
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 5326
     HEAP8[$12 >> 0] = 10; //@line 5327
     $22 = 0; //@line 5328
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 5332
   $17 = ___overflow($1, 10) | 0; //@line 5333
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 38; //@line 5336
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 5338
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 5340
    sp = STACKTOP; //@line 5341
    return 0; //@line 5342
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5344
    $22 = $17 >> 31; //@line 5346
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 5353
 }
 return $22 | 0; //@line 5355
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5502
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 5511
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 5516
      HEAP32[$13 >> 2] = $2; //@line 5517
      $19 = $1 + 40 | 0; //@line 5518
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 5521
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 5531
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 5535
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 5542
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6971
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6973
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6975
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6979
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 6983
  label = 4; //@line 6984
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 6989
   label = 4; //@line 6990
  } else {
   $$037$off039 = 3; //@line 6992
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 6996
  $17 = $8 + 40 | 0; //@line 6997
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 7000
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 7010
    $$037$off039 = $$037$off038; //@line 7011
   } else {
    $$037$off039 = $$037$off038; //@line 7013
   }
  } else {
   $$037$off039 = $$037$off038; //@line 7016
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 7019
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1211
 $2 = $0 + 12 | 0; //@line 1213
 $3 = HEAP32[$2 >> 2] | 0; //@line 1214
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1218
   _mbed_assert_internal(11752, 11757, 528); //@line 1219
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 24; //@line 1222
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1224
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1226
    sp = STACKTOP; //@line 1227
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1230
    $8 = HEAP32[$2 >> 2] | 0; //@line 1232
    break;
   }
  } else {
   $8 = $3; //@line 1236
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1239
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1241
 FUNCTION_TABLE_vi[$7 & 63]($0); //@line 1242
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 1245
  sp = STACKTOP; //@line 1246
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1249
  return;
 }
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7132
 if (!(HEAP8[12612] | 0)) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 7136
  _BSP_TS_GetState(12612) | 0; //@line 7137
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 7140
   sp = STACKTOP; //@line 7141
   return;
  }
  ___async_unwind = 0; //@line 7144
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 7145
  sp = STACKTOP; //@line 7146
  return;
 } else {
  $3 = HEAP16[6307] | 0; //@line 7149
  $4 = HEAP16[6309] | 0; //@line 7150
  _BSP_LCD_SetTextColor(-2048); //@line 7151
  _BSP_LCD_FillCircle($3, $4, 5); //@line 7152
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 7153
  _wait_ms(10); //@line 7154
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 7157
   sp = STACKTOP; //@line 7158
   return;
  }
  ___async_unwind = 0; //@line 7161
  HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 7162
  sp = STACKTOP; //@line 7163
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6066
 STACKTOP = STACKTOP + 16 | 0; //@line 6067
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6067
 $3 = sp; //@line 6068
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6070
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 6073
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6074
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 6075
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 6078
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 6080
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 6082
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6084
  sp = STACKTOP; //@line 6085
  STACKTOP = sp; //@line 6086
  return 0; //@line 6086
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 6088
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 6092
 }
 STACKTOP = sp; //@line 6094
 return $8 & 1 | 0; //@line 6094
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5858
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5864
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 5867
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 5870
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5871
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 5872
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 43; //@line 5875
    sp = STACKTOP; //@line 5876
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5879
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
 sp = STACKTOP; //@line 6027
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 6033
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 6036
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 6039
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6040
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 6041
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 46; //@line 6044
    sp = STACKTOP; //@line 6045
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6048
    break;
   }
  }
 } while (0);
 return;
}
function ___dynamic_cast__async_cb_2($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6201
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6203
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6205
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6211
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 6226
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 6242
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 6247
    break;
   }
  default:
   {
    $$0 = 0; //@line 6251
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 6256
 return;
}
function _BSP_LCD_Clear($0) {
 $0 = $0 | 0;
 var $$011 = 0, $$07$i = 0, $1 = 0, $14 = 0, $3 = 0, $4 = 0, $6 = 0, $7 = 0;
 $1 = HEAP32[3150] | 0; //@line 188
 HEAP32[3150] = $0 & 65535; //@line 190
 $3 = _ST7789H2_GetLcdPixelHeight() | 0; //@line 191
 $4 = $3 & 65535; //@line 192
 if (!($3 << 16 >> 16)) {
  $14 = $1 & 65535; //@line 195
  HEAP32[3150] = $14; //@line 196
  return;
 } else {
  $$011 = 0; //@line 199
 }
 do {
  $6 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 202
  $7 = $6 & 65535; //@line 203
  if ($6 << 16 >> 16) {
   $$07$i = 0; //@line 206
   do {
    _emscripten_asm_const_iiii(3, $$07$i | 0, $$011 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 210
    $$07$i = $$07$i + 1 | 0; //@line 211
   } while (($$07$i | 0) != ($7 | 0));
  }
  $$011 = $$011 + 1 | 0; //@line 220
 } while (($$011 | 0) != ($4 | 0));
 $14 = $1 & 65535; //@line 228
 HEAP32[3150] = $14; //@line 229
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4636
 STACKTOP = STACKTOP + 32 | 0; //@line 4637
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4637
 $vararg_buffer = sp; //@line 4638
 $3 = sp + 20 | 0; //@line 4639
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4643
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4645
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4647
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4649
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4651
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4656
  $10 = -1; //@line 4657
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4660
 }
 STACKTOP = sp; //@line 4662
 return $10 | 0; //@line 4662
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 855
 STACKTOP = STACKTOP + 16 | 0; //@line 856
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 856
 $vararg_buffer = sp; //@line 857
 HEAP32[$vararg_buffer >> 2] = $0; //@line 858
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 860
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 862
 _mbed_error_printf(11629, $vararg_buffer); //@line 863
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 864
 _mbed_die(); //@line 865
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 868
  sp = STACKTOP; //@line 869
  STACKTOP = sp; //@line 870
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 872
  STACKTOP = sp; //@line 873
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 5580
 $5 = HEAP32[$4 >> 2] | 0; //@line 5581
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 5585
   HEAP32[$1 + 24 >> 2] = $3; //@line 5587
   HEAP32[$1 + 36 >> 2] = 1; //@line 5589
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 5593
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 5596
    HEAP32[$1 + 24 >> 2] = 2; //@line 5598
    HEAP8[$1 + 54 >> 0] = 1; //@line 5600
    break;
   }
   $10 = $1 + 24 | 0; //@line 5603
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 5607
   }
  }
 } while (0);
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7045
 _BSP_LCD_Clear(-1); //@line 7046
 _BSP_LCD_SetTextColor(2016); //@line 7047
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 7050
 _BSP_LCD_SetTextColor(0); //@line 7051
 _BSP_LCD_SetBackColor(2016); //@line 7052
 _BSP_LCD_SetFont(104); //@line 7053
 _BSP_LCD_DisplayStringAt(0, 15, 11879, 1); //@line 7054
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 7055
 _BSP_TS_GetState(12612) | 0; //@line 7056
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 7059
  sp = STACKTOP; //@line 7060
  return;
 }
 ___async_unwind = 0; //@line 7063
 HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 7064
 sp = STACKTOP; //@line 7065
 return;
}
function _BSP_LCD_FillRect($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $$04 = 0, $$07$i = 0, $6 = 0, $8 = 0, $9 = 0;
 HEAP32[3150] = HEAP32[3150] & 65535; //@line 242
 $6 = $2 & 65535; //@line 243
 $8 = $0 & 65535; //@line 245
 if (!($2 << 16 >> 16)) {
  return;
 } else {
  $$0 = $3; //@line 249
  $$04 = $1; //@line 249
 }
 while (1) {
  $9 = $$04 & 65535; //@line 252
  $$07$i = 0; //@line 253
  do {
   _emscripten_asm_const_iiii(3, $$07$i + $8 & 65535 | 0, $9 | 0, HEAP32[3150] & 65535 | 0) | 0; //@line 259
   $$07$i = $$07$i + 1 | 0; //@line 260
  } while (($$07$i | 0) != ($6 | 0));
  if (!($$0 << 16 >> 16)) {
   break;
  } else {
   $$0 = $$0 + -1 << 16 >> 16; //@line 274
   $$04 = $$04 + 1 << 16 >> 16; //@line 274
  }
 }
 return;
}
function _BSP_TS_GetState($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 819
 $1 = _emscripten_asm_const_i(4) | 0; //@line 820
 $2 = _emscripten_asm_const_i(5) | 0; //@line 821
 $3 = ($1 | 0) != -1; //@line 822
 $4 = ($2 | 0) != -1; //@line 823
 HEAP8[$0 >> 0] = $3 & $4 & 1; //@line 826
 if ($3) {
  HEAP16[$0 + 2 >> 1] = $1; //@line 830
 }
 if ($4) {
  HEAP16[$0 + 6 >> 1] = $2; //@line 835
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 837
 _wait_ms(1); //@line 838
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 6; //@line 841
  sp = STACKTOP; //@line 842
  return 0; //@line 843
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 845
  return 0; //@line 846
 }
 return 0; //@line 848
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4695
 STACKTOP = STACKTOP + 32 | 0; //@line 4696
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4696
 $vararg_buffer = sp; //@line 4697
 HEAP32[$0 + 36 >> 2] = 4; //@line 4700
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4708
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4710
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4712
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4717
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4720
 STACKTOP = sp; //@line 4721
 return $14 | 0; //@line 4721
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 6882
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6884
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6886
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 6887
 _wait_ms(150); //@line 6888
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 10; //@line 6891
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6892
  HEAP32[$4 >> 2] = $2; //@line 6893
  sp = STACKTOP; //@line 6894
  return;
 }
 ___async_unwind = 0; //@line 6897
 HEAP32[$ReallocAsyncCtx14 >> 2] = 10; //@line 6898
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6899
 HEAP32[$4 >> 2] = $2; //@line 6900
 sp = STACKTOP; //@line 6901
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 6857
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6859
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6861
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 6862
 _wait_ms(150); //@line 6863
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 11; //@line 6866
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6867
  HEAP32[$4 >> 2] = $2; //@line 6868
  sp = STACKTOP; //@line 6869
  return;
 }
 ___async_unwind = 0; //@line 6872
 HEAP32[$ReallocAsyncCtx13 >> 2] = 11; //@line 6873
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6874
 HEAP32[$4 >> 2] = $2; //@line 6875
 sp = STACKTOP; //@line 6876
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 6832
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6834
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6836
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 6837
 _wait_ms(150); //@line 6838
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 12; //@line 6841
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6842
  HEAP32[$4 >> 2] = $2; //@line 6843
  sp = STACKTOP; //@line 6844
  return;
 }
 ___async_unwind = 0; //@line 6847
 HEAP32[$ReallocAsyncCtx12 >> 2] = 12; //@line 6848
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6849
 HEAP32[$4 >> 2] = $2; //@line 6850
 sp = STACKTOP; //@line 6851
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 6807
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6809
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6811
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 6812
 _wait_ms(150); //@line 6813
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 13; //@line 6816
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 6817
  HEAP32[$4 >> 2] = $2; //@line 6818
  sp = STACKTOP; //@line 6819
  return;
 }
 ___async_unwind = 0; //@line 6822
 HEAP32[$ReallocAsyncCtx11 >> 2] = 13; //@line 6823
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 6824
 HEAP32[$4 >> 2] = $2; //@line 6825
 sp = STACKTOP; //@line 6826
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 6782
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6784
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6786
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 6787
 _wait_ms(150); //@line 6788
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 14; //@line 6791
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 6792
  HEAP32[$4 >> 2] = $2; //@line 6793
  sp = STACKTOP; //@line 6794
  return;
 }
 ___async_unwind = 0; //@line 6797
 HEAP32[$ReallocAsyncCtx10 >> 2] = 14; //@line 6798
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 6799
 HEAP32[$4 >> 2] = $2; //@line 6800
 sp = STACKTOP; //@line 6801
 return;
}
function _mbed_die__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 6907
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6909
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6911
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 6912
 _wait_ms(150); //@line 6913
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 9; //@line 6916
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6917
  HEAP32[$4 >> 2] = $2; //@line 6918
  sp = STACKTOP; //@line 6919
  return;
 }
 ___async_unwind = 0; //@line 6922
 HEAP32[$ReallocAsyncCtx15 >> 2] = 9; //@line 6923
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6924
 HEAP32[$4 >> 2] = $2; //@line 6925
 sp = STACKTOP; //@line 6926
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 6532
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6534
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6536
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 6537
 _wait_ms(150); //@line 6538
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 8; //@line 6541
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 6542
  HEAP32[$4 >> 2] = $2; //@line 6543
  sp = STACKTOP; //@line 6544
  return;
 }
 ___async_unwind = 0; //@line 6547
 HEAP32[$ReallocAsyncCtx16 >> 2] = 8; //@line 6548
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 6549
 HEAP32[$4 >> 2] = $2; //@line 6550
 sp = STACKTOP; //@line 6551
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 6757
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6759
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6761
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 6762
 _wait_ms(150); //@line 6763
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 15; //@line 6766
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 6767
  HEAP32[$4 >> 2] = $2; //@line 6768
  sp = STACKTOP; //@line 6769
  return;
 }
 ___async_unwind = 0; //@line 6772
 HEAP32[$ReallocAsyncCtx9 >> 2] = 15; //@line 6773
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 6774
 HEAP32[$4 >> 2] = $2; //@line 6775
 sp = STACKTOP; //@line 6776
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6732
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6734
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6736
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6737
 _wait_ms(400); //@line 6738
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 16; //@line 6741
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 6742
  HEAP32[$4 >> 2] = $2; //@line 6743
  sp = STACKTOP; //@line 6744
  return;
 }
 ___async_unwind = 0; //@line 6747
 HEAP32[$ReallocAsyncCtx8 >> 2] = 16; //@line 6748
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 6749
 HEAP32[$4 >> 2] = $2; //@line 6750
 sp = STACKTOP; //@line 6751
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 6707
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6709
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6711
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 6712
 _wait_ms(400); //@line 6713
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 17; //@line 6716
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 6717
  HEAP32[$4 >> 2] = $2; //@line 6718
  sp = STACKTOP; //@line 6719
  return;
 }
 ___async_unwind = 0; //@line 6722
 HEAP32[$ReallocAsyncCtx7 >> 2] = 17; //@line 6723
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 6724
 HEAP32[$4 >> 2] = $2; //@line 6725
 sp = STACKTOP; //@line 6726
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 6682
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6684
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6686
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 6687
 _wait_ms(400); //@line 6688
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 18; //@line 6691
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 6692
  HEAP32[$4 >> 2] = $2; //@line 6693
  sp = STACKTOP; //@line 6694
  return;
 }
 ___async_unwind = 0; //@line 6697
 HEAP32[$ReallocAsyncCtx6 >> 2] = 18; //@line 6698
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 6699
 HEAP32[$4 >> 2] = $2; //@line 6700
 sp = STACKTOP; //@line 6701
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 6657
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6659
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6661
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 6662
 _wait_ms(400); //@line 6663
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 19; //@line 6666
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 6667
  HEAP32[$4 >> 2] = $2; //@line 6668
  sp = STACKTOP; //@line 6669
  return;
 }
 ___async_unwind = 0; //@line 6672
 HEAP32[$ReallocAsyncCtx5 >> 2] = 19; //@line 6673
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 6674
 HEAP32[$4 >> 2] = $2; //@line 6675
 sp = STACKTOP; //@line 6676
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6632
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6634
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6636
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 6637
 _wait_ms(400); //@line 6638
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 6641
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 6642
  HEAP32[$4 >> 2] = $2; //@line 6643
  sp = STACKTOP; //@line 6644
  return;
 }
 ___async_unwind = 0; //@line 6647
 HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 6648
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 6649
 HEAP32[$4 >> 2] = $2; //@line 6650
 sp = STACKTOP; //@line 6651
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6607
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6609
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6611
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 6612
 _wait_ms(400); //@line 6613
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 6616
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 6617
  HEAP32[$4 >> 2] = $2; //@line 6618
  sp = STACKTOP; //@line 6619
  return;
 }
 ___async_unwind = 0; //@line 6622
 HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 6623
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 6624
 HEAP32[$4 >> 2] = $2; //@line 6625
 sp = STACKTOP; //@line 6626
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6582
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6584
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6586
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6587
 _wait_ms(400); //@line 6588
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 6591
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 6592
  HEAP32[$4 >> 2] = $2; //@line 6593
  sp = STACKTOP; //@line 6594
  return;
 }
 ___async_unwind = 0; //@line 6597
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 6598
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 6599
 HEAP32[$4 >> 2] = $2; //@line 6600
 sp = STACKTOP; //@line 6601
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6557
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6559
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6561
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 6562
 _wait_ms(400); //@line 6563
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 23; //@line 6566
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 6567
  HEAP32[$4 >> 2] = $2; //@line 6568
  sp = STACKTOP; //@line 6569
  return;
 }
 ___async_unwind = 0; //@line 6572
 HEAP32[$ReallocAsyncCtx >> 2] = 23; //@line 6573
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 6574
 HEAP32[$4 >> 2] = $2; //@line 6575
 sp = STACKTOP; //@line 6576
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 7441
 newDynamicTop = oldDynamicTop + increment | 0; //@line 7442
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 7446
  ___setErrNo(12); //@line 7447
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 7451
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 7455
   ___setErrNo(12); //@line 7456
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 7460
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 4816
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 4818
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 4824
  $11 = ___fwritex($0, $4, $3) | 0; //@line 4825
  if ($phitmp) {
   $13 = $11; //@line 4827
  } else {
   ___unlockfile($3); //@line 4829
   $13 = $11; //@line 4830
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 4834
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 4838
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 4841
 }
 return $15 | 0; //@line 4843
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 4933
 $3 = HEAP8[$1 >> 0] | 0; //@line 4935
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 4939
 $7 = HEAP32[$0 >> 2] | 0; //@line 4940
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 4945
  HEAP32[$0 + 4 >> 2] = 0; //@line 4947
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 4949
  HEAP32[$0 + 28 >> 2] = $14; //@line 4951
  HEAP32[$0 + 20 >> 2] = $14; //@line 4953
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4959
  $$0 = 0; //@line 4960
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 4963
  $$0 = -1; //@line 4964
 }
 return $$0 | 0; //@line 4966
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6099
 do {
  if (!$0) {
   $3 = 0; //@line 6103
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6105
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 6106
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 48; //@line 6109
    sp = STACKTOP; //@line 6110
    return 0; //@line 6111
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6113
    $3 = ($2 | 0) != 0 & 1; //@line 6116
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 6121
}
function _invoke_ticker__async_cb_1($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6132
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 6138
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 6139
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6140
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 6141
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 25; //@line 6144
  sp = STACKTOP; //@line 6145
  return;
 }
 ___async_unwind = 0; //@line 6148
 HEAP32[$ReallocAsyncCtx >> 2] = 25; //@line 6149
 sp = STACKTOP; //@line 6150
 return;
}
function ___fflush_unlocked__async_cb_26($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7236
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7238
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7240
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7242
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 7244
 HEAP32[$4 >> 2] = 0; //@line 7245
 HEAP32[$6 >> 2] = 0; //@line 7246
 HEAP32[$8 >> 2] = 0; //@line 7247
 HEAP32[$10 >> 2] = 0; //@line 7248
 HEAP32[___async_retval >> 2] = 0; //@line 7250
 return;
}
function _ft6x06_Init($0) {
 $0 = $0 | 0;
 var $$05$i6$ph = 0, $1 = 0, $2 = 0, $5 = 0;
 $1 = $0 & 65535; //@line 49
 $2 = HEAP8[12622] | 0; //@line 50
 do {
  if (($2 & 255 | 0) != ($1 | 0)) {
   $5 = HEAP8[12623] | 0; //@line 55
   if (($5 & 255 | 0) != ($1 | 0)) {
    if (!($2 << 24 >> 24)) {
     $$05$i6$ph = 0; //@line 61
    } else {
     if (!($5 << 24 >> 24)) {
      $$05$i6$ph = 1; //@line 65
     } else {
      break;
     }
    }
    HEAP8[12622 + $$05$i6$ph >> 0] = $0; //@line 72
   }
  }
 } while (0);
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 7296
 ___async_unwind = 1; //@line 7297
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 7303
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 7307
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 7311
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 7313
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4506
 STACKTOP = STACKTOP + 16 | 0; //@line 4507
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4507
 $vararg_buffer = sp; //@line 4508
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4512
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4514
 STACKTOP = sp; //@line 4515
 return $5 | 0; //@line 4515
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5484
 }
 return;
}
function _BSP_LCD_Init() {
 var $$0$i = 0;
 HEAP32[3151] = 65535; //@line 127
 HEAP32[3152] = 112; //@line 128
 HEAP32[3150] = 0; //@line 129
 _BSP_LCD_MspInit(); //@line 130
 if ((_ST7789H2_ReadID() | 0) << 16 >> 16 != 133) {
  $$0$i = 1; //@line 134
  return $$0$i | 0; //@line 135
 }
 _emscripten_asm_const_i(2) | 0; //@line 137
 HEAP32[3152] = 96; //@line 138
 $$0$i = 0; //@line 139
 return $$0$i | 0; //@line 140
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6440
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 6451
  $$0 = 1; //@line 6452
 } else {
  $$0 = 0; //@line 6454
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 6458
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 5560
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1261
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1262
 _emscripten_sleep($0 | 0); //@line 1263
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 1266
  sp = STACKTOP; //@line 1267
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1270
  return;
 }
}
function runPostSets() {}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 7272
 HEAP32[new_frame + 4 >> 2] = sp; //@line 7274
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 7276
 ___async_cur_frame = new_frame; //@line 7277
 return ___async_cur_frame + 8 | 0; //@line 7278
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7118
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 7119
 _BSP_TS_GetState(12612) | 0; //@line 7120
 if (!___async) {
  ___async_unwind = 0; //@line 7123
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 7125
 sp = STACKTOP; //@line 7126
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 5624
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 5628
  }
 }
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 6947
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 6951
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 6954
 return;
}
function _fflush__async_cb_3($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6346
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 6348
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 6351
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 6520
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 6523
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 6526
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 6165
 } else {
  $$0 = -1; //@line 6167
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 6170
 return;
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 7502
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 7284
 stackRestore(___async_cur_frame | 0); //@line 7285
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 7286
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1191
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1197
 _emscripten_asm_const_iii(7, $0 | 0, $1 | 0) | 0; //@line 1198
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4672
  $$0 = -1; //@line 4673
 } else {
  $$0 = $0; //@line 4675
 }
 return $$0 | 0; //@line 4677
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 7495
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 7488
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 7474
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 4803
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 4807
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 6187
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 7291
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 7292
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5846
 __ZdlPv($0); //@line 5847
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5374
 __ZdlPv($0); //@line 5375
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
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 7262
 return;
}
function b32(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 7584
}
function b31(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 7581
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 5571
}
function _ST7789H2_ReadID() {
 _LCD_IO_WriteReg(4); //@line 93
 _LCD_IO_ReadData() | 0; //@line 94
 return (_LCD_IO_ReadData() | 0) & 255 | 0; //@line 97
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_22($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b29(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 7578
}
function b28(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 7575
}
function _fflush__async_cb_4($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6361
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 7467
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 7518
 return 0; //@line 7518
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 7515
 return 0; //@line 7515
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(5); //@line 7512
 return 0; //@line 7512
}
function b3(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 7509
 return 0; //@line 7509
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 7481
}
function b26(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 7572
}
function b25(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 7569
}
function _LCD_IO_WriteReg($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(0, $0 & 255 | 0) | 0; //@line 114
 return;
}
function _BSP_TS_Init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _ft6x06_Init(0); //@line 813
 return 0; //@line 814
}
function _BSP_TS_GetState__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[___async_retval >> 0] = 0; //@line 7039
 return;
}
function _BSP_LCD_SetTextColor($0) {
 $0 = $0 | 0;
 HEAP32[3150] = $0 & 65535; //@line 173
 return;
}
function _BSP_LCD_SetBackColor($0) {
 $0 = $0 | 0;
 HEAP32[3151] = $0 & 65535; //@line 181
 return;
}
function _BSP_LCD_GetYSize() {
 return (_ST7789H2_GetLcdPixelHeight() | 0) & 65535 | 0; //@line 166
}
function _BSP_LCD_GetXSize() {
 return (_ST7789H2_GetLcdPixelWidth() | 0) & 65535 | 0; //@line 159
}
function _LCD_IO_ReadData() {
 return (_emscripten_asm_const_i(1) | 0) & 65535 | 0; //@line 122
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _BSP_LCD_SetFont($0) {
 $0 = $0 | 0;
 HEAP32[3152] = $0; //@line 151
 return;
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 7506
 return 0; //@line 7506
}
function ___ofl_lock() {
 ___lock(12588); //@line 5059
 return 12596; //@line 5060
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
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 5361
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
 ___unlock(12588); //@line 5065
 return;
}
function _ST7789H2_GetLcdPixelHeight() {
 return 240; //@line 107
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4688
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 4855
}
function _ST7789H2_GetLcdPixelWidth() {
 return 240; //@line 102
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(63); //@line 7566
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(62); //@line 7563
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(61); //@line 7560
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(60); //@line 7557
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(59); //@line 7554
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(58); //@line 7551
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(57); //@line 7548
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(56); //@line 7545
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(55); //@line 7542
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(54); //@line 7539
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(53); //@line 7536
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(52); //@line 7533
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(51); //@line 7530
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_vi(50); //@line 7527
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_vi(49); //@line 7524
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 7521
}
function ___errno_location() {
 return 12584; //@line 4682
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
function _BSP_LCD_MspInit() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,___stdio_close];
var FUNCTION_TABLE_iiii = [b3,___stdout_write,___stdio_seek,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b4,b5,b6];
var FUNCTION_TABLE_vi = [b8,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_BSP_TS_GetState__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_21,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb,_invoke_ticker__async_cb_1,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb_23,_main__async_cb
,_main__async_cb_25,_main__async_cb_24,___overflow__async_cb,_fflush__async_cb_4,_fflush__async_cb_3,_fflush__async_cb_5,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_26,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_6,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_22,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b9,b10,b11,b12,b13,b14,b15,b16,b17,b18
,b19,b20,b21,b22,b23];
var FUNCTION_TABLE_viiii = [b25,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b26];
var FUNCTION_TABLE_viiiii = [b28,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b29];
var FUNCTION_TABLE_viiiiii = [b31,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b32];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _invoke_ticker: _invoke_ticker, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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

var real__invoke_ticker = asm["_invoke_ticker"]; asm["_invoke_ticker"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_ticker.apply(null, arguments);
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
var _emscripten_alloc_async_context = Module["_emscripten_alloc_async_context"] = asm["_emscripten_alloc_async_context"];
var _emscripten_async_resume = Module["_emscripten_async_resume"] = asm["_emscripten_async_resume"];
var _emscripten_free_async_context = Module["_emscripten_free_async_context"] = asm["_emscripten_free_async_context"];
var _emscripten_realloc_async_context = Module["_emscripten_realloc_async_context"] = asm["_emscripten_realloc_async_context"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
var _invoke_ticker = Module["_invoke_ticker"] = asm["_invoke_ticker"];
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






//# sourceMappingURL=touchscreen.js.map
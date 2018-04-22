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

STATICTOP = STATIC_BASE + 16528;
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



var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0"];
var debug_table_vi = ["0", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_20", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_printf__async_cb_29", "_serial_putc__async_cb_1", "_serial_putc__async_cb", "_invoke_ticker__async_cb_27", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_BSP_TS_GetState__async_cb", "_main__async_cb_2", "_main__async_cb", "_main__async_cb_4", "_main__async_cb_3", "_putc__async_cb_5", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_24", "_fflush__async_cb_23", "_fflush__async_cb_25", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_21", "_vfprintf__async_cb", "_vsnprintf__async_cb", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_26", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_28", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_22", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0"];
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
 sp = STACKTOP; //@line 1546
 STACKTOP = STACKTOP + 16 | 0; //@line 1547
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1547
 $1 = sp; //@line 1548
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1555
   $7 = $6 >>> 3; //@line 1556
   $8 = HEAP32[3723] | 0; //@line 1557
   $9 = $8 >>> $7; //@line 1558
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1564
    $16 = 14932 + ($14 << 1 << 2) | 0; //@line 1566
    $17 = $16 + 8 | 0; //@line 1567
    $18 = HEAP32[$17 >> 2] | 0; //@line 1568
    $19 = $18 + 8 | 0; //@line 1569
    $20 = HEAP32[$19 >> 2] | 0; //@line 1570
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3723] = $8 & ~(1 << $14); //@line 1577
     } else {
      if ((HEAP32[3727] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1582
      }
      $27 = $20 + 12 | 0; //@line 1585
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1589
       HEAP32[$17 >> 2] = $20; //@line 1590
       break;
      } else {
       _abort(); //@line 1593
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1598
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1601
    $34 = $18 + $30 + 4 | 0; //@line 1603
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1606
    $$0 = $19; //@line 1607
    STACKTOP = sp; //@line 1608
    return $$0 | 0; //@line 1608
   }
   $37 = HEAP32[3725] | 0; //@line 1610
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1616
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1619
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1622
     $49 = $47 >>> 12 & 16; //@line 1624
     $50 = $47 >>> $49; //@line 1625
     $52 = $50 >>> 5 & 8; //@line 1627
     $54 = $50 >>> $52; //@line 1629
     $56 = $54 >>> 2 & 4; //@line 1631
     $58 = $54 >>> $56; //@line 1633
     $60 = $58 >>> 1 & 2; //@line 1635
     $62 = $58 >>> $60; //@line 1637
     $64 = $62 >>> 1 & 1; //@line 1639
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1642
     $69 = 14932 + ($67 << 1 << 2) | 0; //@line 1644
     $70 = $69 + 8 | 0; //@line 1645
     $71 = HEAP32[$70 >> 2] | 0; //@line 1646
     $72 = $71 + 8 | 0; //@line 1647
     $73 = HEAP32[$72 >> 2] | 0; //@line 1648
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1654
       HEAP32[3723] = $77; //@line 1655
       $98 = $77; //@line 1656
      } else {
       if ((HEAP32[3727] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1661
       }
       $80 = $73 + 12 | 0; //@line 1664
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1668
        HEAP32[$70 >> 2] = $73; //@line 1669
        $98 = $8; //@line 1670
        break;
       } else {
        _abort(); //@line 1673
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1678
     $84 = $83 - $6 | 0; //@line 1679
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1682
     $87 = $71 + $6 | 0; //@line 1683
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1686
     HEAP32[$71 + $83 >> 2] = $84; //@line 1688
     if ($37 | 0) {
      $92 = HEAP32[3728] | 0; //@line 1691
      $93 = $37 >>> 3; //@line 1692
      $95 = 14932 + ($93 << 1 << 2) | 0; //@line 1694
      $96 = 1 << $93; //@line 1695
      if (!($98 & $96)) {
       HEAP32[3723] = $98 | $96; //@line 1700
       $$0199 = $95; //@line 1702
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1702
      } else {
       $101 = $95 + 8 | 0; //@line 1704
       $102 = HEAP32[$101 >> 2] | 0; //@line 1705
       if ((HEAP32[3727] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1709
       } else {
        $$0199 = $102; //@line 1712
        $$pre$phiZ2D = $101; //@line 1712
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1715
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1717
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1719
      HEAP32[$92 + 12 >> 2] = $95; //@line 1721
     }
     HEAP32[3725] = $84; //@line 1723
     HEAP32[3728] = $87; //@line 1724
     $$0 = $72; //@line 1725
     STACKTOP = sp; //@line 1726
     return $$0 | 0; //@line 1726
    }
    $108 = HEAP32[3724] | 0; //@line 1728
    if (!$108) {
     $$0197 = $6; //@line 1731
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1735
     $114 = $112 >>> 12 & 16; //@line 1737
     $115 = $112 >>> $114; //@line 1738
     $117 = $115 >>> 5 & 8; //@line 1740
     $119 = $115 >>> $117; //@line 1742
     $121 = $119 >>> 2 & 4; //@line 1744
     $123 = $119 >>> $121; //@line 1746
     $125 = $123 >>> 1 & 2; //@line 1748
     $127 = $123 >>> $125; //@line 1750
     $129 = $127 >>> 1 & 1; //@line 1752
     $134 = HEAP32[15196 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1757
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1761
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1767
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1770
      $$0193$lcssa$i = $138; //@line 1770
     } else {
      $$01926$i = $134; //@line 1772
      $$01935$i = $138; //@line 1772
      $146 = $143; //@line 1772
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1777
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1778
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1779
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1780
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1786
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1789
        $$0193$lcssa$i = $$$0193$i; //@line 1789
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1792
        $$01935$i = $$$0193$i; //@line 1792
       }
      }
     }
     $157 = HEAP32[3727] | 0; //@line 1796
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1799
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1802
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1805
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1809
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1811
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1815
       $176 = HEAP32[$175 >> 2] | 0; //@line 1816
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1819
        $179 = HEAP32[$178 >> 2] | 0; //@line 1820
        if (!$179) {
         $$3$i = 0; //@line 1823
         break;
        } else {
         $$1196$i = $179; //@line 1826
         $$1198$i = $178; //@line 1826
        }
       } else {
        $$1196$i = $176; //@line 1829
        $$1198$i = $175; //@line 1829
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1832
        $182 = HEAP32[$181 >> 2] | 0; //@line 1833
        if ($182 | 0) {
         $$1196$i = $182; //@line 1836
         $$1198$i = $181; //@line 1836
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1839
        $185 = HEAP32[$184 >> 2] | 0; //@line 1840
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1845
         $$1198$i = $184; //@line 1845
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1850
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1853
        $$3$i = $$1196$i; //@line 1854
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1859
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1862
       }
       $169 = $167 + 12 | 0; //@line 1865
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1869
       }
       $172 = $164 + 8 | 0; //@line 1872
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1876
        HEAP32[$172 >> 2] = $167; //@line 1877
        $$3$i = $164; //@line 1878
        break;
       } else {
        _abort(); //@line 1881
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1890
       $191 = 15196 + ($190 << 2) | 0; //@line 1891
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1896
         if (!$$3$i) {
          HEAP32[3724] = $108 & ~(1 << $190); //@line 1902
          break L73;
         }
        } else {
         if ((HEAP32[3727] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1909
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1917
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3727] | 0; //@line 1927
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1930
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1934
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1936
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1942
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1946
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1948
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1954
       if ($214 | 0) {
        if ((HEAP32[3727] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1960
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1964
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1966
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1974
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1977
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1979
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1982
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1986
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1989
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1991
      if ($37 | 0) {
       $234 = HEAP32[3728] | 0; //@line 1994
       $235 = $37 >>> 3; //@line 1995
       $237 = 14932 + ($235 << 1 << 2) | 0; //@line 1997
       $238 = 1 << $235; //@line 1998
       if (!($8 & $238)) {
        HEAP32[3723] = $8 | $238; //@line 2003
        $$0189$i = $237; //@line 2005
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2005
       } else {
        $242 = $237 + 8 | 0; //@line 2007
        $243 = HEAP32[$242 >> 2] | 0; //@line 2008
        if ((HEAP32[3727] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2012
        } else {
         $$0189$i = $243; //@line 2015
         $$pre$phi$iZ2D = $242; //@line 2015
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2018
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2020
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2022
       HEAP32[$234 + 12 >> 2] = $237; //@line 2024
      }
      HEAP32[3725] = $$0193$lcssa$i; //@line 2026
      HEAP32[3728] = $159; //@line 2027
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2030
     STACKTOP = sp; //@line 2031
     return $$0 | 0; //@line 2031
    }
   } else {
    $$0197 = $6; //@line 2034
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2039
   } else {
    $251 = $0 + 11 | 0; //@line 2041
    $252 = $251 & -8; //@line 2042
    $253 = HEAP32[3724] | 0; //@line 2043
    if (!$253) {
     $$0197 = $252; //@line 2046
    } else {
     $255 = 0 - $252 | 0; //@line 2048
     $256 = $251 >>> 8; //@line 2049
     if (!$256) {
      $$0358$i = 0; //@line 2052
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2056
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2060
       $262 = $256 << $261; //@line 2061
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2064
       $267 = $262 << $265; //@line 2066
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2069
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2074
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2080
      }
     }
     $282 = HEAP32[15196 + ($$0358$i << 2) >> 2] | 0; //@line 2084
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2088
       $$3$i203 = 0; //@line 2088
       $$3350$i = $255; //@line 2088
       label = 81; //@line 2089
      } else {
       $$0342$i = 0; //@line 2096
       $$0347$i = $255; //@line 2096
       $$0353$i = $282; //@line 2096
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2096
       $$0362$i = 0; //@line 2096
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2101
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2106
          $$435113$i = 0; //@line 2106
          $$435712$i = $$0353$i; //@line 2106
          label = 85; //@line 2107
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2110
          $$1348$i = $292; //@line 2110
         }
        } else {
         $$1343$i = $$0342$i; //@line 2113
         $$1348$i = $$0347$i; //@line 2113
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2116
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2119
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2123
        $302 = ($$0353$i | 0) == 0; //@line 2124
        if ($302) {
         $$2355$i = $$1363$i; //@line 2129
         $$3$i203 = $$1343$i; //@line 2129
         $$3350$i = $$1348$i; //@line 2129
         label = 81; //@line 2130
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2133
         $$0347$i = $$1348$i; //@line 2133
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2133
         $$0362$i = $$1363$i; //@line 2133
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2143
       $309 = $253 & ($306 | 0 - $306); //@line 2146
       if (!$309) {
        $$0197 = $252; //@line 2149
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2154
       $315 = $313 >>> 12 & 16; //@line 2156
       $316 = $313 >>> $315; //@line 2157
       $318 = $316 >>> 5 & 8; //@line 2159
       $320 = $316 >>> $318; //@line 2161
       $322 = $320 >>> 2 & 4; //@line 2163
       $324 = $320 >>> $322; //@line 2165
       $326 = $324 >>> 1 & 2; //@line 2167
       $328 = $324 >>> $326; //@line 2169
       $330 = $328 >>> 1 & 1; //@line 2171
       $$4$ph$i = 0; //@line 2177
       $$4357$ph$i = HEAP32[15196 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2177
      } else {
       $$4$ph$i = $$3$i203; //@line 2179
       $$4357$ph$i = $$2355$i; //@line 2179
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2183
       $$4351$lcssa$i = $$3350$i; //@line 2183
      } else {
       $$414$i = $$4$ph$i; //@line 2185
       $$435113$i = $$3350$i; //@line 2185
       $$435712$i = $$4357$ph$i; //@line 2185
       label = 85; //@line 2186
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2191
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2195
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2196
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2197
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2198
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2204
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2207
        $$4351$lcssa$i = $$$4351$i; //@line 2207
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2210
        $$435113$i = $$$4351$i; //@line 2210
        label = 85; //@line 2211
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2217
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3725] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3727] | 0; //@line 2223
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2226
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2229
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2232
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2236
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2238
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2242
         $371 = HEAP32[$370 >> 2] | 0; //@line 2243
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2246
          $374 = HEAP32[$373 >> 2] | 0; //@line 2247
          if (!$374) {
           $$3372$i = 0; //@line 2250
           break;
          } else {
           $$1370$i = $374; //@line 2253
           $$1374$i = $373; //@line 2253
          }
         } else {
          $$1370$i = $371; //@line 2256
          $$1374$i = $370; //@line 2256
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2259
          $377 = HEAP32[$376 >> 2] | 0; //@line 2260
          if ($377 | 0) {
           $$1370$i = $377; //@line 2263
           $$1374$i = $376; //@line 2263
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2266
          $380 = HEAP32[$379 >> 2] | 0; //@line 2267
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2272
           $$1374$i = $379; //@line 2272
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2277
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2280
          $$3372$i = $$1370$i; //@line 2281
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2286
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2289
         }
         $364 = $362 + 12 | 0; //@line 2292
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2296
         }
         $367 = $359 + 8 | 0; //@line 2299
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2303
          HEAP32[$367 >> 2] = $362; //@line 2304
          $$3372$i = $359; //@line 2305
          break;
         } else {
          _abort(); //@line 2308
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2316
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2319
         $386 = 15196 + ($385 << 2) | 0; //@line 2320
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2325
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2330
            HEAP32[3724] = $391; //@line 2331
            $475 = $391; //@line 2332
            break L164;
           }
          } else {
           if ((HEAP32[3727] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2339
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2347
            if (!$$3372$i) {
             $475 = $253; //@line 2350
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3727] | 0; //@line 2358
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2361
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2365
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2367
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2373
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2377
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2379
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2385
         if (!$409) {
          $475 = $253; //@line 2388
         } else {
          if ((HEAP32[3727] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2393
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2397
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2399
           $475 = $253; //@line 2400
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2409
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2412
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2414
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2417
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2421
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2424
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2426
         $428 = $$4351$lcssa$i >>> 3; //@line 2427
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 14932 + ($428 << 1 << 2) | 0; //@line 2431
          $432 = HEAP32[3723] | 0; //@line 2432
          $433 = 1 << $428; //@line 2433
          if (!($432 & $433)) {
           HEAP32[3723] = $432 | $433; //@line 2438
           $$0368$i = $431; //@line 2440
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2440
          } else {
           $437 = $431 + 8 | 0; //@line 2442
           $438 = HEAP32[$437 >> 2] | 0; //@line 2443
           if ((HEAP32[3727] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2447
           } else {
            $$0368$i = $438; //@line 2450
            $$pre$phi$i211Z2D = $437; //@line 2450
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2453
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2455
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2457
          HEAP32[$354 + 12 >> 2] = $431; //@line 2459
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2462
         if (!$444) {
          $$0361$i = 0; //@line 2465
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2469
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2473
           $450 = $444 << $449; //@line 2474
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2477
           $455 = $450 << $453; //@line 2479
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2482
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2487
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2493
          }
         }
         $469 = 15196 + ($$0361$i << 2) | 0; //@line 2496
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2498
         $471 = $354 + 16 | 0; //@line 2499
         HEAP32[$471 + 4 >> 2] = 0; //@line 2501
         HEAP32[$471 >> 2] = 0; //@line 2502
         $473 = 1 << $$0361$i; //@line 2503
         if (!($475 & $473)) {
          HEAP32[3724] = $475 | $473; //@line 2508
          HEAP32[$469 >> 2] = $354; //@line 2509
          HEAP32[$354 + 24 >> 2] = $469; //@line 2511
          HEAP32[$354 + 12 >> 2] = $354; //@line 2513
          HEAP32[$354 + 8 >> 2] = $354; //@line 2515
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2524
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2524
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2531
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2535
          $494 = HEAP32[$492 >> 2] | 0; //@line 2537
          if (!$494) {
           label = 136; //@line 2540
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2543
           $$0345$i = $494; //@line 2543
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3727] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2550
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2553
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2555
           HEAP32[$354 + 12 >> 2] = $354; //@line 2557
           HEAP32[$354 + 8 >> 2] = $354; //@line 2559
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2564
          $502 = HEAP32[$501 >> 2] | 0; //@line 2565
          $503 = HEAP32[3727] | 0; //@line 2566
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2572
           HEAP32[$501 >> 2] = $354; //@line 2573
           HEAP32[$354 + 8 >> 2] = $502; //@line 2575
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2577
           HEAP32[$354 + 24 >> 2] = 0; //@line 2579
           break;
          } else {
           _abort(); //@line 2582
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2589
       STACKTOP = sp; //@line 2590
       return $$0 | 0; //@line 2590
      } else {
       $$0197 = $252; //@line 2592
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3725] | 0; //@line 2599
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2602
  $515 = HEAP32[3728] | 0; //@line 2603
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2606
   HEAP32[3728] = $517; //@line 2607
   HEAP32[3725] = $514; //@line 2608
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2611
   HEAP32[$515 + $512 >> 2] = $514; //@line 2613
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2616
  } else {
   HEAP32[3725] = 0; //@line 2618
   HEAP32[3728] = 0; //@line 2619
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2622
   $526 = $515 + $512 + 4 | 0; //@line 2624
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2627
  }
  $$0 = $515 + 8 | 0; //@line 2630
  STACKTOP = sp; //@line 2631
  return $$0 | 0; //@line 2631
 }
 $530 = HEAP32[3726] | 0; //@line 2633
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2636
  HEAP32[3726] = $532; //@line 2637
  $533 = HEAP32[3729] | 0; //@line 2638
  $534 = $533 + $$0197 | 0; //@line 2639
  HEAP32[3729] = $534; //@line 2640
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2643
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2646
  $$0 = $533 + 8 | 0; //@line 2648
  STACKTOP = sp; //@line 2649
  return $$0 | 0; //@line 2649
 }
 if (!(HEAP32[3841] | 0)) {
  HEAP32[3843] = 4096; //@line 2654
  HEAP32[3842] = 4096; //@line 2655
  HEAP32[3844] = -1; //@line 2656
  HEAP32[3845] = -1; //@line 2657
  HEAP32[3846] = 0; //@line 2658
  HEAP32[3834] = 0; //@line 2659
  HEAP32[3841] = $1 & -16 ^ 1431655768; //@line 2663
  $548 = 4096; //@line 2664
 } else {
  $548 = HEAP32[3843] | 0; //@line 2667
 }
 $545 = $$0197 + 48 | 0; //@line 2669
 $546 = $$0197 + 47 | 0; //@line 2670
 $547 = $548 + $546 | 0; //@line 2671
 $549 = 0 - $548 | 0; //@line 2672
 $550 = $547 & $549; //@line 2673
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2676
  STACKTOP = sp; //@line 2677
  return $$0 | 0; //@line 2677
 }
 $552 = HEAP32[3833] | 0; //@line 2679
 if ($552 | 0) {
  $554 = HEAP32[3831] | 0; //@line 2682
  $555 = $554 + $550 | 0; //@line 2683
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2688
   STACKTOP = sp; //@line 2689
   return $$0 | 0; //@line 2689
  }
 }
 L244 : do {
  if (!(HEAP32[3834] & 4)) {
   $561 = HEAP32[3729] | 0; //@line 2697
   L246 : do {
    if (!$561) {
     label = 163; //@line 2701
    } else {
     $$0$i$i = 15340; //@line 2703
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2705
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2708
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2717
      if (!$570) {
       label = 163; //@line 2720
       break L246;
      } else {
       $$0$i$i = $570; //@line 2723
      }
     }
     $595 = $547 - $530 & $549; //@line 2727
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2730
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2738
       } else {
        $$723947$i = $595; //@line 2740
        $$748$i = $597; //@line 2740
        label = 180; //@line 2741
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2745
       $$2253$ph$i = $595; //@line 2745
       label = 171; //@line 2746
      }
     } else {
      $$2234243136$i = 0; //@line 2749
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2755
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2758
     } else {
      $574 = $572; //@line 2760
      $575 = HEAP32[3842] | 0; //@line 2761
      $576 = $575 + -1 | 0; //@line 2762
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2770
      $584 = HEAP32[3831] | 0; //@line 2771
      $585 = $$$i + $584 | 0; //@line 2772
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3833] | 0; //@line 2777
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2784
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2788
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2791
        $$748$i = $572; //@line 2791
        label = 180; //@line 2792
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2795
        $$2253$ph$i = $$$i; //@line 2795
        label = 171; //@line 2796
       }
      } else {
       $$2234243136$i = 0; //@line 2799
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2806
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2815
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2818
       $$748$i = $$2247$ph$i; //@line 2818
       label = 180; //@line 2819
       break L244;
      }
     }
     $607 = HEAP32[3843] | 0; //@line 2823
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2827
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2830
      $$748$i = $$2247$ph$i; //@line 2830
      label = 180; //@line 2831
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2837
      $$2234243136$i = 0; //@line 2838
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2842
      $$748$i = $$2247$ph$i; //@line 2842
      label = 180; //@line 2843
      break L244;
     }
    }
   } while (0);
   HEAP32[3834] = HEAP32[3834] | 4; //@line 2850
   $$4236$i = $$2234243136$i; //@line 2851
   label = 178; //@line 2852
  } else {
   $$4236$i = 0; //@line 2854
   label = 178; //@line 2855
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2861
   $621 = _sbrk(0) | 0; //@line 2862
   $627 = $621 - $620 | 0; //@line 2870
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2872
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2880
    $$748$i = $620; //@line 2880
    label = 180; //@line 2881
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3831] | 0) + $$723947$i | 0; //@line 2887
  HEAP32[3831] = $633; //@line 2888
  if ($633 >>> 0 > (HEAP32[3832] | 0) >>> 0) {
   HEAP32[3832] = $633; //@line 2892
  }
  $636 = HEAP32[3729] | 0; //@line 2894
  do {
   if (!$636) {
    $638 = HEAP32[3727] | 0; //@line 2898
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3727] = $$748$i; //@line 2903
    }
    HEAP32[3835] = $$748$i; //@line 2905
    HEAP32[3836] = $$723947$i; //@line 2906
    HEAP32[3838] = 0; //@line 2907
    HEAP32[3732] = HEAP32[3841]; //@line 2909
    HEAP32[3731] = -1; //@line 2910
    HEAP32[3736] = 14932; //@line 2911
    HEAP32[3735] = 14932; //@line 2912
    HEAP32[3738] = 14940; //@line 2913
    HEAP32[3737] = 14940; //@line 2914
    HEAP32[3740] = 14948; //@line 2915
    HEAP32[3739] = 14948; //@line 2916
    HEAP32[3742] = 14956; //@line 2917
    HEAP32[3741] = 14956; //@line 2918
    HEAP32[3744] = 14964; //@line 2919
    HEAP32[3743] = 14964; //@line 2920
    HEAP32[3746] = 14972; //@line 2921
    HEAP32[3745] = 14972; //@line 2922
    HEAP32[3748] = 14980; //@line 2923
    HEAP32[3747] = 14980; //@line 2924
    HEAP32[3750] = 14988; //@line 2925
    HEAP32[3749] = 14988; //@line 2926
    HEAP32[3752] = 14996; //@line 2927
    HEAP32[3751] = 14996; //@line 2928
    HEAP32[3754] = 15004; //@line 2929
    HEAP32[3753] = 15004; //@line 2930
    HEAP32[3756] = 15012; //@line 2931
    HEAP32[3755] = 15012; //@line 2932
    HEAP32[3758] = 15020; //@line 2933
    HEAP32[3757] = 15020; //@line 2934
    HEAP32[3760] = 15028; //@line 2935
    HEAP32[3759] = 15028; //@line 2936
    HEAP32[3762] = 15036; //@line 2937
    HEAP32[3761] = 15036; //@line 2938
    HEAP32[3764] = 15044; //@line 2939
    HEAP32[3763] = 15044; //@line 2940
    HEAP32[3766] = 15052; //@line 2941
    HEAP32[3765] = 15052; //@line 2942
    HEAP32[3768] = 15060; //@line 2943
    HEAP32[3767] = 15060; //@line 2944
    HEAP32[3770] = 15068; //@line 2945
    HEAP32[3769] = 15068; //@line 2946
    HEAP32[3772] = 15076; //@line 2947
    HEAP32[3771] = 15076; //@line 2948
    HEAP32[3774] = 15084; //@line 2949
    HEAP32[3773] = 15084; //@line 2950
    HEAP32[3776] = 15092; //@line 2951
    HEAP32[3775] = 15092; //@line 2952
    HEAP32[3778] = 15100; //@line 2953
    HEAP32[3777] = 15100; //@line 2954
    HEAP32[3780] = 15108; //@line 2955
    HEAP32[3779] = 15108; //@line 2956
    HEAP32[3782] = 15116; //@line 2957
    HEAP32[3781] = 15116; //@line 2958
    HEAP32[3784] = 15124; //@line 2959
    HEAP32[3783] = 15124; //@line 2960
    HEAP32[3786] = 15132; //@line 2961
    HEAP32[3785] = 15132; //@line 2962
    HEAP32[3788] = 15140; //@line 2963
    HEAP32[3787] = 15140; //@line 2964
    HEAP32[3790] = 15148; //@line 2965
    HEAP32[3789] = 15148; //@line 2966
    HEAP32[3792] = 15156; //@line 2967
    HEAP32[3791] = 15156; //@line 2968
    HEAP32[3794] = 15164; //@line 2969
    HEAP32[3793] = 15164; //@line 2970
    HEAP32[3796] = 15172; //@line 2971
    HEAP32[3795] = 15172; //@line 2972
    HEAP32[3798] = 15180; //@line 2973
    HEAP32[3797] = 15180; //@line 2974
    $642 = $$723947$i + -40 | 0; //@line 2975
    $644 = $$748$i + 8 | 0; //@line 2977
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2982
    $650 = $$748$i + $649 | 0; //@line 2983
    $651 = $642 - $649 | 0; //@line 2984
    HEAP32[3729] = $650; //@line 2985
    HEAP32[3726] = $651; //@line 2986
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2989
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2992
    HEAP32[3730] = HEAP32[3845]; //@line 2994
   } else {
    $$024367$i = 15340; //@line 2996
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2998
     $658 = $$024367$i + 4 | 0; //@line 2999
     $659 = HEAP32[$658 >> 2] | 0; //@line 3000
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3004
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3008
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3013
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3027
       $673 = (HEAP32[3726] | 0) + $$723947$i | 0; //@line 3029
       $675 = $636 + 8 | 0; //@line 3031
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3036
       $681 = $636 + $680 | 0; //@line 3037
       $682 = $673 - $680 | 0; //@line 3038
       HEAP32[3729] = $681; //@line 3039
       HEAP32[3726] = $682; //@line 3040
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3043
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3046
       HEAP32[3730] = HEAP32[3845]; //@line 3048
       break;
      }
     }
    }
    $688 = HEAP32[3727] | 0; //@line 3053
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3727] = $$748$i; //@line 3056
     $753 = $$748$i; //@line 3057
    } else {
     $753 = $688; //@line 3059
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3061
    $$124466$i = 15340; //@line 3062
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3067
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3071
     if (!$694) {
      $$0$i$i$i = 15340; //@line 3074
      break;
     } else {
      $$124466$i = $694; //@line 3077
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3086
      $700 = $$124466$i + 4 | 0; //@line 3087
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3090
      $704 = $$748$i + 8 | 0; //@line 3092
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3098
      $712 = $690 + 8 | 0; //@line 3100
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3106
      $722 = $710 + $$0197 | 0; //@line 3110
      $723 = $718 - $710 - $$0197 | 0; //@line 3111
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3114
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3726] | 0) + $723 | 0; //@line 3119
        HEAP32[3726] = $728; //@line 3120
        HEAP32[3729] = $722; //@line 3121
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3124
       } else {
        if ((HEAP32[3728] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3725] | 0) + $723 | 0; //@line 3130
         HEAP32[3725] = $734; //@line 3131
         HEAP32[3728] = $722; //@line 3132
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3135
         HEAP32[$722 + $734 >> 2] = $734; //@line 3137
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3141
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3145
         $743 = $739 >>> 3; //@line 3146
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3151
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3153
           $750 = 14932 + ($743 << 1 << 2) | 0; //@line 3155
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3161
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3170
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3723] = HEAP32[3723] & ~(1 << $743); //@line 3180
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3187
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3191
             }
             $764 = $748 + 8 | 0; //@line 3194
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3198
              break;
             }
             _abort(); //@line 3201
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3206
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3207
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3210
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3212
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3216
             $783 = $782 + 4 | 0; //@line 3217
             $784 = HEAP32[$783 >> 2] | 0; //@line 3218
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3221
              if (!$786) {
               $$3$i$i = 0; //@line 3224
               break;
              } else {
               $$1291$i$i = $786; //@line 3227
               $$1293$i$i = $782; //@line 3227
              }
             } else {
              $$1291$i$i = $784; //@line 3230
              $$1293$i$i = $783; //@line 3230
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3233
              $789 = HEAP32[$788 >> 2] | 0; //@line 3234
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3237
               $$1293$i$i = $788; //@line 3237
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3240
              $792 = HEAP32[$791 >> 2] | 0; //@line 3241
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3246
               $$1293$i$i = $791; //@line 3246
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3251
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3254
              $$3$i$i = $$1291$i$i; //@line 3255
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3260
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3263
             }
             $776 = $774 + 12 | 0; //@line 3266
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3270
             }
             $779 = $771 + 8 | 0; //@line 3273
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3277
              HEAP32[$779 >> 2] = $774; //@line 3278
              $$3$i$i = $771; //@line 3279
              break;
             } else {
              _abort(); //@line 3282
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3292
           $798 = 15196 + ($797 << 2) | 0; //@line 3293
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3298
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3724] = HEAP32[3724] & ~(1 << $797); //@line 3307
             break L311;
            } else {
             if ((HEAP32[3727] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3313
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3321
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3727] | 0; //@line 3331
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3334
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3338
           $815 = $718 + 16 | 0; //@line 3339
           $816 = HEAP32[$815 >> 2] | 0; //@line 3340
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3346
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3350
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3352
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3358
           if (!$822) {
            break;
           }
           if ((HEAP32[3727] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3366
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3370
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3372
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3379
         $$0287$i$i = $742 + $723 | 0; //@line 3379
        } else {
         $$0$i17$i = $718; //@line 3381
         $$0287$i$i = $723; //@line 3381
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3383
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3386
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3389
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3391
        $836 = $$0287$i$i >>> 3; //@line 3392
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 14932 + ($836 << 1 << 2) | 0; //@line 3396
         $840 = HEAP32[3723] | 0; //@line 3397
         $841 = 1 << $836; //@line 3398
         do {
          if (!($840 & $841)) {
           HEAP32[3723] = $840 | $841; //@line 3404
           $$0295$i$i = $839; //@line 3406
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3406
          } else {
           $845 = $839 + 8 | 0; //@line 3408
           $846 = HEAP32[$845 >> 2] | 0; //@line 3409
           if ((HEAP32[3727] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3413
            $$pre$phi$i19$iZ2D = $845; //@line 3413
            break;
           }
           _abort(); //@line 3416
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3420
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3422
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3424
         HEAP32[$722 + 12 >> 2] = $839; //@line 3426
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3429
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3433
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3437
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3442
          $858 = $852 << $857; //@line 3443
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3446
          $863 = $858 << $861; //@line 3448
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3451
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3456
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3462
         }
        } while (0);
        $877 = 15196 + ($$0296$i$i << 2) | 0; //@line 3465
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3467
        $879 = $722 + 16 | 0; //@line 3468
        HEAP32[$879 + 4 >> 2] = 0; //@line 3470
        HEAP32[$879 >> 2] = 0; //@line 3471
        $881 = HEAP32[3724] | 0; //@line 3472
        $882 = 1 << $$0296$i$i; //@line 3473
        if (!($881 & $882)) {
         HEAP32[3724] = $881 | $882; //@line 3478
         HEAP32[$877 >> 2] = $722; //@line 3479
         HEAP32[$722 + 24 >> 2] = $877; //@line 3481
         HEAP32[$722 + 12 >> 2] = $722; //@line 3483
         HEAP32[$722 + 8 >> 2] = $722; //@line 3485
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3494
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3494
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3501
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3505
         $902 = HEAP32[$900 >> 2] | 0; //@line 3507
         if (!$902) {
          label = 260; //@line 3510
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3513
          $$0289$i$i = $902; //@line 3513
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3727] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3520
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3523
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3525
          HEAP32[$722 + 12 >> 2] = $722; //@line 3527
          HEAP32[$722 + 8 >> 2] = $722; //@line 3529
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3534
         $910 = HEAP32[$909 >> 2] | 0; //@line 3535
         $911 = HEAP32[3727] | 0; //@line 3536
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3542
          HEAP32[$909 >> 2] = $722; //@line 3543
          HEAP32[$722 + 8 >> 2] = $910; //@line 3545
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3547
          HEAP32[$722 + 24 >> 2] = 0; //@line 3549
          break;
         } else {
          _abort(); //@line 3552
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3559
      STACKTOP = sp; //@line 3560
      return $$0 | 0; //@line 3560
     } else {
      $$0$i$i$i = 15340; //@line 3562
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3566
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3571
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3579
    }
    $927 = $923 + -47 | 0; //@line 3581
    $929 = $927 + 8 | 0; //@line 3583
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3589
    $936 = $636 + 16 | 0; //@line 3590
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3592
    $939 = $938 + 8 | 0; //@line 3593
    $940 = $938 + 24 | 0; //@line 3594
    $941 = $$723947$i + -40 | 0; //@line 3595
    $943 = $$748$i + 8 | 0; //@line 3597
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3602
    $949 = $$748$i + $948 | 0; //@line 3603
    $950 = $941 - $948 | 0; //@line 3604
    HEAP32[3729] = $949; //@line 3605
    HEAP32[3726] = $950; //@line 3606
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3609
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3612
    HEAP32[3730] = HEAP32[3845]; //@line 3614
    $956 = $938 + 4 | 0; //@line 3615
    HEAP32[$956 >> 2] = 27; //@line 3616
    HEAP32[$939 >> 2] = HEAP32[3835]; //@line 3617
    HEAP32[$939 + 4 >> 2] = HEAP32[3836]; //@line 3617
    HEAP32[$939 + 8 >> 2] = HEAP32[3837]; //@line 3617
    HEAP32[$939 + 12 >> 2] = HEAP32[3838]; //@line 3617
    HEAP32[3835] = $$748$i; //@line 3618
    HEAP32[3836] = $$723947$i; //@line 3619
    HEAP32[3838] = 0; //@line 3620
    HEAP32[3837] = $939; //@line 3621
    $958 = $940; //@line 3622
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3624
     HEAP32[$958 >> 2] = 7; //@line 3625
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3638
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3641
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3644
     HEAP32[$938 >> 2] = $964; //@line 3645
     $969 = $964 >>> 3; //@line 3646
     if ($964 >>> 0 < 256) {
      $972 = 14932 + ($969 << 1 << 2) | 0; //@line 3650
      $973 = HEAP32[3723] | 0; //@line 3651
      $974 = 1 << $969; //@line 3652
      if (!($973 & $974)) {
       HEAP32[3723] = $973 | $974; //@line 3657
       $$0211$i$i = $972; //@line 3659
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3659
      } else {
       $978 = $972 + 8 | 0; //@line 3661
       $979 = HEAP32[$978 >> 2] | 0; //@line 3662
       if ((HEAP32[3727] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3666
       } else {
        $$0211$i$i = $979; //@line 3669
        $$pre$phi$i$iZ2D = $978; //@line 3669
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3672
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3674
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3676
      HEAP32[$636 + 12 >> 2] = $972; //@line 3678
      break;
     }
     $985 = $964 >>> 8; //@line 3681
     if (!$985) {
      $$0212$i$i = 0; //@line 3684
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3688
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3692
       $991 = $985 << $990; //@line 3693
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3696
       $996 = $991 << $994; //@line 3698
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3701
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3706
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3712
      }
     }
     $1010 = 15196 + ($$0212$i$i << 2) | 0; //@line 3715
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3717
     HEAP32[$636 + 20 >> 2] = 0; //@line 3719
     HEAP32[$936 >> 2] = 0; //@line 3720
     $1013 = HEAP32[3724] | 0; //@line 3721
     $1014 = 1 << $$0212$i$i; //@line 3722
     if (!($1013 & $1014)) {
      HEAP32[3724] = $1013 | $1014; //@line 3727
      HEAP32[$1010 >> 2] = $636; //@line 3728
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3730
      HEAP32[$636 + 12 >> 2] = $636; //@line 3732
      HEAP32[$636 + 8 >> 2] = $636; //@line 3734
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3743
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3743
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3750
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3754
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3756
      if (!$1034) {
       label = 286; //@line 3759
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3762
       $$0207$i$i = $1034; //@line 3762
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3727] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3769
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3772
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3774
       HEAP32[$636 + 12 >> 2] = $636; //@line 3776
       HEAP32[$636 + 8 >> 2] = $636; //@line 3778
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3783
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3784
      $1043 = HEAP32[3727] | 0; //@line 3785
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3791
       HEAP32[$1041 >> 2] = $636; //@line 3792
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3794
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3796
       HEAP32[$636 + 24 >> 2] = 0; //@line 3798
       break;
      } else {
       _abort(); //@line 3801
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3726] | 0; //@line 3808
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3811
   HEAP32[3726] = $1054; //@line 3812
   $1055 = HEAP32[3729] | 0; //@line 3813
   $1056 = $1055 + $$0197 | 0; //@line 3814
   HEAP32[3729] = $1056; //@line 3815
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3818
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3821
   $$0 = $1055 + 8 | 0; //@line 3823
   STACKTOP = sp; //@line 3824
   return $$0 | 0; //@line 3824
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3828
 $$0 = 0; //@line 3829
 STACKTOP = sp; //@line 3830
 return $$0 | 0; //@line 3830
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7438
 STACKTOP = STACKTOP + 560 | 0; //@line 7439
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 7439
 $6 = sp + 8 | 0; //@line 7440
 $7 = sp; //@line 7441
 $8 = sp + 524 | 0; //@line 7442
 $9 = $8; //@line 7443
 $10 = sp + 512 | 0; //@line 7444
 HEAP32[$7 >> 2] = 0; //@line 7445
 $11 = $10 + 12 | 0; //@line 7446
 ___DOUBLE_BITS_677($1) | 0; //@line 7447
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 7452
  $$0520 = 1; //@line 7452
  $$0521 = 12745; //@line 7452
 } else {
  $$0471 = $1; //@line 7463
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 7463
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 12746 : 12751 : 12748; //@line 7463
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 7465
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 7474
   $31 = $$0520 + 3 | 0; //@line 7479
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 7481
   _out_670($0, $$0521, $$0520); //@line 7482
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 12772 : 12776 : $27 ? 12764 : 12768, 3); //@line 7483
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 7485
   $$sink560 = $31; //@line 7486
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 7489
   $36 = $35 != 0.0; //@line 7490
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 7494
   }
   $39 = $5 | 32; //@line 7496
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 7499
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 7502
    $44 = $$0520 | 2; //@line 7503
    $46 = 12 - $3 | 0; //@line 7505
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 7510
     } else {
      $$0509585 = 8.0; //@line 7512
      $$1508586 = $46; //@line 7512
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 7514
       $$0509585 = $$0509585 * 16.0; //@line 7515
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 7530
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 7535
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 7540
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 7543
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7546
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 7549
     HEAP8[$68 >> 0] = 48; //@line 7550
     $$0511 = $68; //@line 7551
    } else {
     $$0511 = $66; //@line 7553
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 7560
    $76 = $$0511 + -2 | 0; //@line 7563
    HEAP8[$76 >> 0] = $5 + 15; //@line 7564
    $77 = ($3 | 0) < 1; //@line 7565
    $79 = ($4 & 8 | 0) == 0; //@line 7567
    $$0523 = $8; //@line 7568
    $$2473 = $$1472; //@line 7568
    while (1) {
     $80 = ~~$$2473; //@line 7570
     $86 = $$0523 + 1 | 0; //@line 7576
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[12780 + $80 >> 0]; //@line 7577
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 7580
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 7589
      } else {
       HEAP8[$86 >> 0] = 46; //@line 7592
       $$1524 = $$0523 + 2 | 0; //@line 7593
      }
     } else {
      $$1524 = $86; //@line 7596
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 7600
     }
    }
    $$pre693 = $$1524; //@line 7606
    if (!$3) {
     label = 24; //@line 7608
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 7616
      $$sink = $3 + 2 | 0; //@line 7616
     } else {
      label = 24; //@line 7618
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 7622
     $$pre$phi691Z2D = $101; //@line 7623
     $$sink = $101; //@line 7623
    }
    $104 = $11 - $76 | 0; //@line 7627
    $106 = $104 + $44 + $$sink | 0; //@line 7629
    _pad_676($0, 32, $2, $106, $4); //@line 7630
    _out_670($0, $$0521$, $44); //@line 7631
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 7633
    _out_670($0, $8, $$pre$phi691Z2D); //@line 7634
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 7636
    _out_670($0, $76, $104); //@line 7637
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 7639
    $$sink560 = $106; //@line 7640
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 7644
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 7648
    HEAP32[$7 >> 2] = $113; //@line 7649
    $$3 = $35 * 268435456.0; //@line 7650
    $$pr = $113; //@line 7650
   } else {
    $$3 = $35; //@line 7653
    $$pr = HEAP32[$7 >> 2] | 0; //@line 7653
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 7657
   $$0498 = $$561; //@line 7658
   $$4 = $$3; //@line 7658
   do {
    $116 = ~~$$4 >>> 0; //@line 7660
    HEAP32[$$0498 >> 2] = $116; //@line 7661
    $$0498 = $$0498 + 4 | 0; //@line 7662
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 7665
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 7675
    $$1499662 = $$0498; //@line 7675
    $124 = $$pr; //@line 7675
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 7678
     $$0488655 = $$1499662 + -4 | 0; //@line 7679
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 7682
     } else {
      $$0488657 = $$0488655; //@line 7684
      $$0497656 = 0; //@line 7684
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 7687
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 7689
       $131 = tempRet0; //@line 7690
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7691
       HEAP32[$$0488657 >> 2] = $132; //@line 7693
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7694
       $$0488657 = $$0488657 + -4 | 0; //@line 7696
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 7706
      } else {
       $138 = $$1482663 + -4 | 0; //@line 7708
       HEAP32[$138 >> 2] = $$0497656; //@line 7709
       $$2483$ph = $138; //@line 7710
      }
     }
     $$2500 = $$1499662; //@line 7713
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 7719
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 7723
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 7729
     HEAP32[$7 >> 2] = $144; //@line 7730
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 7733
      $$1499662 = $$2500; //@line 7733
      $124 = $144; //@line 7733
     } else {
      $$1482$lcssa = $$2483$ph; //@line 7735
      $$1499$lcssa = $$2500; //@line 7735
      $$pr566 = $144; //@line 7735
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 7740
    $$1499$lcssa = $$0498; //@line 7740
    $$pr566 = $$pr; //@line 7740
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 7746
    $150 = ($39 | 0) == 102; //@line 7747
    $$3484650 = $$1482$lcssa; //@line 7748
    $$3501649 = $$1499$lcssa; //@line 7748
    $152 = $$pr566; //@line 7748
    while (1) {
     $151 = 0 - $152 | 0; //@line 7750
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 7752
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 7756
      $161 = 1e9 >>> $154; //@line 7757
      $$0487644 = 0; //@line 7758
      $$1489643 = $$3484650; //@line 7758
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 7760
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 7764
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 7765
       $$1489643 = $$1489643 + 4 | 0; //@line 7766
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7777
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 7780
       $$4502 = $$3501649; //@line 7780
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 7783
       $$$3484700 = $$$3484; //@line 7784
       $$4502 = $$3501649 + 4 | 0; //@line 7784
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7791
      $$4502 = $$3501649; //@line 7791
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 7793
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 7800
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 7802
     HEAP32[$7 >> 2] = $152; //@line 7803
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 7808
      $$3501$lcssa = $$$4502; //@line 7808
      break;
     } else {
      $$3484650 = $$$3484700; //@line 7806
      $$3501649 = $$$4502; //@line 7806
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 7813
    $$3501$lcssa = $$1499$lcssa; //@line 7813
   }
   $185 = $$561; //@line 7816
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 7821
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 7822
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 7825
    } else {
     $$0514639 = $189; //@line 7827
     $$0530638 = 10; //@line 7827
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 7829
      $193 = $$0514639 + 1 | 0; //@line 7830
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 7833
       break;
      } else {
       $$0514639 = $193; //@line 7836
      }
     }
    }
   } else {
    $$1515 = 0; //@line 7841
   }
   $198 = ($39 | 0) == 103; //@line 7846
   $199 = ($$540 | 0) != 0; //@line 7847
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 7850
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 7859
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 7862
    $213 = ($209 | 0) % 9 | 0; //@line 7863
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 7866
     $$1531632 = 10; //@line 7866
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 7869
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 7872
       $$1531632 = $215; //@line 7872
      } else {
       $$1531$lcssa = $215; //@line 7874
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 7879
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 7881
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 7882
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 7885
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 7888
     $$4518 = $$1515; //@line 7888
     $$8 = $$3484$lcssa; //@line 7888
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 7893
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 7894
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 7899
     if (!$$0520) {
      $$1467 = $$$564; //@line 7902
      $$1469 = $$543; //@line 7902
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 7905
      $$1467 = $230 ? -$$$564 : $$$564; //@line 7910
      $$1469 = $230 ? -$$543 : $$543; //@line 7910
     }
     $233 = $217 - $218 | 0; //@line 7912
     HEAP32[$212 >> 2] = $233; //@line 7913
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 7917
      HEAP32[$212 >> 2] = $236; //@line 7918
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 7921
       $$sink547625 = $212; //@line 7921
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 7923
        HEAP32[$$sink547625 >> 2] = 0; //@line 7924
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 7927
         HEAP32[$240 >> 2] = 0; //@line 7928
         $$6 = $240; //@line 7929
        } else {
         $$6 = $$5486626; //@line 7931
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 7934
        HEAP32[$238 >> 2] = $242; //@line 7935
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 7938
         $$sink547625 = $238; //@line 7938
        } else {
         $$5486$lcssa = $$6; //@line 7940
         $$sink547$lcssa = $238; //@line 7940
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 7945
       $$sink547$lcssa = $212; //@line 7945
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 7950
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 7951
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 7954
       $$4518 = $247; //@line 7954
       $$8 = $$5486$lcssa; //@line 7954
      } else {
       $$2516621 = $247; //@line 7956
       $$2532620 = 10; //@line 7956
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 7958
        $251 = $$2516621 + 1 | 0; //@line 7959
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 7962
         $$4518 = $251; //@line 7962
         $$8 = $$5486$lcssa; //@line 7962
         break;
        } else {
         $$2516621 = $251; //@line 7965
        }
       }
      }
     } else {
      $$4492 = $212; //@line 7970
      $$4518 = $$1515; //@line 7970
      $$8 = $$3484$lcssa; //@line 7970
     }
    }
    $253 = $$4492 + 4 | 0; //@line 7973
    $$5519$ph = $$4518; //@line 7976
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 7976
    $$9$ph = $$8; //@line 7976
   } else {
    $$5519$ph = $$1515; //@line 7978
    $$7505$ph = $$3501$lcssa; //@line 7978
    $$9$ph = $$3484$lcssa; //@line 7978
   }
   $$7505 = $$7505$ph; //@line 7980
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 7984
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 7987
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 7991
    } else {
     $$lcssa675 = 1; //@line 7993
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 7997
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8002
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8010
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8010
     } else {
      $$0479 = $5 + -2 | 0; //@line 8014
      $$2476 = $$540$ + -1 | 0; //@line 8014
     }
     $267 = $4 & 8; //@line 8016
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8021
       if (!$270) {
        $$2529 = 9; //@line 8024
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8029
         $$3533616 = 10; //@line 8029
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8031
          $275 = $$1528617 + 1 | 0; //@line 8032
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8038
           break;
          } else {
           $$1528617 = $275; //@line 8036
          }
         }
        } else {
         $$2529 = 0; //@line 8043
        }
       }
      } else {
       $$2529 = 9; //@line 8047
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8055
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8057
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8059
       $$1480 = $$0479; //@line 8062
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8062
       $$pre$phi698Z2D = 0; //@line 8062
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8066
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8068
       $$1480 = $$0479; //@line 8071
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8071
       $$pre$phi698Z2D = 0; //@line 8071
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8075
      $$3477 = $$2476; //@line 8075
      $$pre$phi698Z2D = $267; //@line 8075
     }
    } else {
     $$1480 = $5; //@line 8079
     $$3477 = $$540; //@line 8079
     $$pre$phi698Z2D = $4 & 8; //@line 8079
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8082
   $294 = ($292 | 0) != 0 & 1; //@line 8084
   $296 = ($$1480 | 32 | 0) == 102; //@line 8086
   if ($296) {
    $$2513 = 0; //@line 8090
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8090
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8093
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8096
    $304 = $11; //@line 8097
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8102
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8104
      HEAP8[$308 >> 0] = 48; //@line 8105
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8110
      } else {
       $$1512$lcssa = $308; //@line 8112
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8117
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8124
    $318 = $$1512$lcssa + -2 | 0; //@line 8126
    HEAP8[$318 >> 0] = $$1480; //@line 8127
    $$2513 = $318; //@line 8130
    $$pn = $304 - $318 | 0; //@line 8130
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8135
   _pad_676($0, 32, $2, $323, $4); //@line 8136
   _out_670($0, $$0521, $$0520); //@line 8137
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8139
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8142
    $326 = $8 + 9 | 0; //@line 8143
    $327 = $326; //@line 8144
    $328 = $8 + 8 | 0; //@line 8145
    $$5493600 = $$0496$$9; //@line 8146
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8149
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8154
       $$1465 = $328; //@line 8155
      } else {
       $$1465 = $330; //@line 8157
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8164
       $$0464597 = $330; //@line 8165
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8167
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8170
        } else {
         $$1465 = $335; //@line 8172
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8177
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8182
     $$5493600 = $$5493600 + 4 | 0; //@line 8183
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 12796, 1); //@line 8193
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8199
     $$6494592 = $$5493600; //@line 8199
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8202
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8207
       $$0463587 = $347; //@line 8208
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8210
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8213
        } else {
         $$0463$lcssa = $351; //@line 8215
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8220
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8224
      $$6494592 = $$6494592 + 4 | 0; //@line 8225
      $356 = $$4478593 + -9 | 0; //@line 8226
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8233
       break;
      } else {
       $$4478593 = $356; //@line 8231
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8238
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8241
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8244
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8247
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8248
     $365 = $363; //@line 8249
     $366 = 0 - $9 | 0; //@line 8250
     $367 = $8 + 8 | 0; //@line 8251
     $$5605 = $$3477; //@line 8252
     $$7495604 = $$9$ph; //@line 8252
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8255
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8258
       $$0 = $367; //@line 8259
      } else {
       $$0 = $369; //@line 8261
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8266
        _out_670($0, $$0, 1); //@line 8267
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 8271
         break;
        }
        _out_670($0, 12796, 1); //@line 8274
        $$2 = $375; //@line 8275
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 8279
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 8284
        $$1601 = $$0; //@line 8285
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 8287
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 8290
         } else {
          $$2 = $373; //@line 8292
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 8299
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 8302
      $381 = $$5605 - $378 | 0; //@line 8303
      $$7495604 = $$7495604 + 4 | 0; //@line 8304
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 8311
       break;
      } else {
       $$5605 = $381; //@line 8309
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 8316
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 8319
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 8323
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 8326
   $$sink560 = $323; //@line 8327
  }
 } while (0);
 STACKTOP = sp; //@line 8332
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 8332
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6010
 STACKTOP = STACKTOP + 64 | 0; //@line 6011
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6011
 $5 = sp + 16 | 0; //@line 6012
 $6 = sp; //@line 6013
 $7 = sp + 24 | 0; //@line 6014
 $8 = sp + 8 | 0; //@line 6015
 $9 = sp + 20 | 0; //@line 6016
 HEAP32[$5 >> 2] = $1; //@line 6017
 $10 = ($0 | 0) != 0; //@line 6018
 $11 = $7 + 40 | 0; //@line 6019
 $12 = $11; //@line 6020
 $13 = $7 + 39 | 0; //@line 6021
 $14 = $8 + 4 | 0; //@line 6022
 $$0243 = 0; //@line 6023
 $$0247 = 0; //@line 6023
 $$0269 = 0; //@line 6023
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6032
     $$1248 = -1; //@line 6033
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6037
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6041
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6044
  $21 = HEAP8[$20 >> 0] | 0; //@line 6045
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6048
   break;
  } else {
   $23 = $21; //@line 6051
   $25 = $20; //@line 6051
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6056
     $27 = $25; //@line 6056
     label = 9; //@line 6057
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6062
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6069
   HEAP32[$5 >> 2] = $24; //@line 6070
   $23 = HEAP8[$24 >> 0] | 0; //@line 6072
   $25 = $24; //@line 6072
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6077
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6082
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6085
     $27 = $27 + 2 | 0; //@line 6086
     HEAP32[$5 >> 2] = $27; //@line 6087
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6094
      break;
     } else {
      $$0249303 = $30; //@line 6091
      label = 9; //@line 6092
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6102
  if ($10) {
   _out_670($0, $20, $36); //@line 6104
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6108
   $$0247 = $$1248; //@line 6108
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6116
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6117
  if ($43) {
   $$0253 = -1; //@line 6119
   $$1270 = $$0269; //@line 6119
   $$sink = 1; //@line 6119
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6129
    $$1270 = 1; //@line 6129
    $$sink = 3; //@line 6129
   } else {
    $$0253 = -1; //@line 6131
    $$1270 = $$0269; //@line 6131
    $$sink = 1; //@line 6131
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6134
  HEAP32[$5 >> 2] = $51; //@line 6135
  $52 = HEAP8[$51 >> 0] | 0; //@line 6136
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6138
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6145
   $$lcssa291 = $52; //@line 6145
   $$lcssa292 = $51; //@line 6145
  } else {
   $$0262309 = 0; //@line 6147
   $60 = $52; //@line 6147
   $65 = $51; //@line 6147
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6152
    $64 = $65 + 1 | 0; //@line 6153
    HEAP32[$5 >> 2] = $64; //@line 6154
    $66 = HEAP8[$64 >> 0] | 0; //@line 6155
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6157
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6164
     $$lcssa291 = $66; //@line 6164
     $$lcssa292 = $64; //@line 6164
     break;
    } else {
     $$0262309 = $63; //@line 6167
     $60 = $66; //@line 6167
     $65 = $64; //@line 6167
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6179
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6181
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6186
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6191
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6203
     $$2271 = 1; //@line 6203
     $storemerge274 = $79 + 3 | 0; //@line 6203
    } else {
     label = 23; //@line 6205
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6209
    if ($$1270 | 0) {
     $$0 = -1; //@line 6212
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6227
     $106 = HEAP32[$105 >> 2] | 0; //@line 6228
     HEAP32[$2 >> 2] = $105 + 4; //@line 6230
     $363 = $106; //@line 6231
    } else {
     $363 = 0; //@line 6233
    }
    $$0259 = $363; //@line 6237
    $$2271 = 0; //@line 6237
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6237
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6239
   $109 = ($$0259 | 0) < 0; //@line 6240
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6245
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6245
   $$3272 = $$2271; //@line 6245
   $115 = $storemerge274; //@line 6245
  } else {
   $112 = _getint_671($5) | 0; //@line 6247
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6250
    break;
   }
   $$1260 = $112; //@line 6254
   $$1263 = $$0262$lcssa; //@line 6254
   $$3272 = $$1270; //@line 6254
   $115 = HEAP32[$5 >> 2] | 0; //@line 6254
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6265
     $156 = _getint_671($5) | 0; //@line 6266
     $$0254 = $156; //@line 6268
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 6268
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 6277
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 6282
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6287
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6294
      $144 = $125 + 4 | 0; //@line 6298
      HEAP32[$5 >> 2] = $144; //@line 6299
      $$0254 = $140; //@line 6300
      $$pre345 = $144; //@line 6300
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 6306
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6321
     $152 = HEAP32[$151 >> 2] | 0; //@line 6322
     HEAP32[$2 >> 2] = $151 + 4; //@line 6324
     $364 = $152; //@line 6325
    } else {
     $364 = 0; //@line 6327
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 6330
    HEAP32[$5 >> 2] = $154; //@line 6331
    $$0254 = $364; //@line 6332
    $$pre345 = $154; //@line 6332
   } else {
    $$0254 = -1; //@line 6334
    $$pre345 = $115; //@line 6334
   }
  } while (0);
  $$0252 = 0; //@line 6337
  $158 = $$pre345; //@line 6337
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 6344
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 6347
   HEAP32[$5 >> 2] = $158; //@line 6348
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (12264 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 6353
   $168 = $167 & 255; //@line 6354
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 6358
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 6365
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 6369
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 6373
     break L1;
    } else {
     label = 50; //@line 6376
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 6381
     $176 = $3 + ($$0253 << 3) | 0; //@line 6383
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 6388
     $182 = $6; //@line 6389
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 6391
     HEAP32[$182 + 4 >> 2] = $181; //@line 6394
     label = 50; //@line 6395
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 6399
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 6402
    $187 = HEAP32[$5 >> 2] | 0; //@line 6404
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 6408
   if ($10) {
    $187 = $158; //@line 6410
   } else {
    $$0243 = 0; //@line 6412
    $$0247 = $$1248; //@line 6412
    $$0269 = $$3272; //@line 6412
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 6418
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 6424
  $196 = $$1263 & -65537; //@line 6427
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 6428
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6436
       $$0243 = 0; //@line 6437
       $$0247 = $$1248; //@line 6437
       $$0269 = $$3272; //@line 6437
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6443
       $$0243 = 0; //@line 6444
       $$0247 = $$1248; //@line 6444
       $$0269 = $$3272; //@line 6444
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 6452
       HEAP32[$208 >> 2] = $$1248; //@line 6454
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6457
       $$0243 = 0; //@line 6458
       $$0247 = $$1248; //@line 6458
       $$0269 = $$3272; //@line 6458
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 6465
       $$0243 = 0; //@line 6466
       $$0247 = $$1248; //@line 6466
       $$0269 = $$3272; //@line 6466
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 6473
       $$0243 = 0; //@line 6474
       $$0247 = $$1248; //@line 6474
       $$0269 = $$3272; //@line 6474
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6480
       $$0243 = 0; //@line 6481
       $$0247 = $$1248; //@line 6481
       $$0269 = $$3272; //@line 6481
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 6489
       HEAP32[$220 >> 2] = $$1248; //@line 6491
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6494
       $$0243 = 0; //@line 6495
       $$0247 = $$1248; //@line 6495
       $$0269 = $$3272; //@line 6495
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 6500
       $$0247 = $$1248; //@line 6500
       $$0269 = $$3272; //@line 6500
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 6510
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 6510
     $$3265 = $$1263$ | 8; //@line 6510
     label = 62; //@line 6511
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 6515
     $$1255 = $$0254; //@line 6515
     $$3265 = $$1263$; //@line 6515
     label = 62; //@line 6516
     break;
    }
   case 111:
    {
     $242 = $6; //@line 6520
     $244 = HEAP32[$242 >> 2] | 0; //@line 6522
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 6525
     $248 = _fmt_o($244, $247, $11) | 0; //@line 6526
     $252 = $12 - $248 | 0; //@line 6530
     $$0228 = $248; //@line 6535
     $$1233 = 0; //@line 6535
     $$1238 = 12728; //@line 6535
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 6535
     $$4266 = $$1263$; //@line 6535
     $281 = $244; //@line 6535
     $283 = $247; //@line 6535
     label = 68; //@line 6536
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 6540
     $258 = HEAP32[$256 >> 2] | 0; //@line 6542
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 6545
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 6548
      $264 = tempRet0; //@line 6549
      $265 = $6; //@line 6550
      HEAP32[$265 >> 2] = $263; //@line 6552
      HEAP32[$265 + 4 >> 2] = $264; //@line 6555
      $$0232 = 1; //@line 6556
      $$0237 = 12728; //@line 6556
      $275 = $263; //@line 6556
      $276 = $264; //@line 6556
      label = 67; //@line 6557
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 6569
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 12728 : 12730 : 12729; //@line 6569
      $275 = $258; //@line 6569
      $276 = $261; //@line 6569
      label = 67; //@line 6570
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 6576
     $$0232 = 0; //@line 6582
     $$0237 = 12728; //@line 6582
     $275 = HEAP32[$197 >> 2] | 0; //@line 6582
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 6582
     label = 67; //@line 6583
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 6594
     $$2 = $13; //@line 6595
     $$2234 = 0; //@line 6595
     $$2239 = 12728; //@line 6595
     $$2251 = $11; //@line 6595
     $$5 = 1; //@line 6595
     $$6268 = $196; //@line 6595
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 6602
     label = 72; //@line 6603
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 6607
     $$1 = $302 | 0 ? $302 : 12738; //@line 6610
     label = 72; //@line 6611
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 6621
     HEAP32[$14 >> 2] = 0; //@line 6622
     HEAP32[$6 >> 2] = $8; //@line 6623
     $$4258354 = -1; //@line 6624
     $365 = $8; //@line 6624
     label = 76; //@line 6625
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 6629
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 6632
      $$0240$lcssa356 = 0; //@line 6633
      label = 85; //@line 6634
     } else {
      $$4258354 = $$0254; //@line 6636
      $365 = $$pre348; //@line 6636
      label = 76; //@line 6637
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 6644
     $$0247 = $$1248; //@line 6644
     $$0269 = $$3272; //@line 6644
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 6649
     $$2234 = 0; //@line 6649
     $$2239 = 12728; //@line 6649
     $$2251 = $11; //@line 6649
     $$5 = $$0254; //@line 6649
     $$6268 = $$1263$; //@line 6649
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 6655
    $227 = $6; //@line 6656
    $229 = HEAP32[$227 >> 2] | 0; //@line 6658
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 6661
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 6663
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 6669
    $$0228 = $234; //@line 6674
    $$1233 = $or$cond278 ? 0 : 2; //@line 6674
    $$1238 = $or$cond278 ? 12728 : 12728 + ($$1236 >> 4) | 0; //@line 6674
    $$2256 = $$1255; //@line 6674
    $$4266 = $$3265; //@line 6674
    $281 = $229; //@line 6674
    $283 = $232; //@line 6674
    label = 68; //@line 6675
   } else if ((label | 0) == 67) {
    label = 0; //@line 6678
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 6680
    $$1233 = $$0232; //@line 6680
    $$1238 = $$0237; //@line 6680
    $$2256 = $$0254; //@line 6680
    $$4266 = $$1263$; //@line 6680
    $281 = $275; //@line 6680
    $283 = $276; //@line 6680
    label = 68; //@line 6681
   } else if ((label | 0) == 72) {
    label = 0; //@line 6684
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 6685
    $306 = ($305 | 0) == 0; //@line 6686
    $$2 = $$1; //@line 6693
    $$2234 = 0; //@line 6693
    $$2239 = 12728; //@line 6693
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 6693
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 6693
    $$6268 = $196; //@line 6693
   } else if ((label | 0) == 76) {
    label = 0; //@line 6696
    $$0229316 = $365; //@line 6697
    $$0240315 = 0; //@line 6697
    $$1244314 = 0; //@line 6697
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 6699
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 6702
      $$2245 = $$1244314; //@line 6702
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 6705
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 6711
      $$2245 = $320; //@line 6711
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 6715
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 6718
      $$0240315 = $325; //@line 6718
      $$1244314 = $320; //@line 6718
     } else {
      $$0240$lcssa = $325; //@line 6720
      $$2245 = $320; //@line 6720
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 6726
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 6729
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 6732
     label = 85; //@line 6733
    } else {
     $$1230327 = $365; //@line 6735
     $$1241326 = 0; //@line 6735
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 6737
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6740
       label = 85; //@line 6741
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 6744
      $$1241326 = $331 + $$1241326 | 0; //@line 6745
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6748
       label = 85; //@line 6749
       break L97;
      }
      _out_670($0, $9, $331); //@line 6753
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6758
       label = 85; //@line 6759
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 6756
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 6767
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 6773
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 6775
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 6780
   $$2 = $or$cond ? $$0228 : $11; //@line 6785
   $$2234 = $$1233; //@line 6785
   $$2239 = $$1238; //@line 6785
   $$2251 = $11; //@line 6785
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 6785
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 6785
  } else if ((label | 0) == 85) {
   label = 0; //@line 6788
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 6790
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 6793
   $$0247 = $$1248; //@line 6793
   $$0269 = $$3272; //@line 6793
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 6798
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 6800
  $345 = $$$5 + $$2234 | 0; //@line 6801
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 6803
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 6804
  _out_670($0, $$2239, $$2234); //@line 6805
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 6807
  _pad_676($0, 48, $$$5, $343, 0); //@line 6808
  _out_670($0, $$2, $343); //@line 6809
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 6811
  $$0243 = $$2261; //@line 6812
  $$0247 = $$1248; //@line 6812
  $$0269 = $$3272; //@line 6812
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 6820
    } else {
     $$2242302 = 1; //@line 6822
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 6825
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 6828
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 6832
      $356 = $$2242302 + 1 | 0; //@line 6833
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 6836
      } else {
       $$2242$lcssa = $356; //@line 6838
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 6844
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 6850
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 6856
       } else {
        $$0 = 1; //@line 6858
        break;
       }
      }
     } else {
      $$0 = 1; //@line 6863
     }
    }
   } else {
    $$0 = $$1248; //@line 6867
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6871
 return $$0 | 0; //@line 6871
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3857
 $3 = HEAP32[3727] | 0; //@line 3858
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3861
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3865
 $7 = $6 & 3; //@line 3866
 if (($7 | 0) == 1) {
  _abort(); //@line 3869
 }
 $9 = $6 & -8; //@line 3872
 $10 = $2 + $9 | 0; //@line 3873
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3878
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3884
   $17 = $13 + $9 | 0; //@line 3885
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3888
   }
   if ((HEAP32[3728] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3894
    $106 = HEAP32[$105 >> 2] | 0; //@line 3895
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3899
     $$1382 = $17; //@line 3899
     $114 = $16; //@line 3899
     break;
    }
    HEAP32[3725] = $17; //@line 3902
    HEAP32[$105 >> 2] = $106 & -2; //@line 3904
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3907
    HEAP32[$16 + $17 >> 2] = $17; //@line 3909
    return;
   }
   $21 = $13 >>> 3; //@line 3912
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3916
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3918
    $28 = 14932 + ($21 << 1 << 2) | 0; //@line 3920
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3925
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3932
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3723] = HEAP32[3723] & ~(1 << $21); //@line 3942
     $$1 = $16; //@line 3943
     $$1382 = $17; //@line 3943
     $114 = $16; //@line 3943
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3949
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3953
     }
     $41 = $26 + 8 | 0; //@line 3956
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3960
     } else {
      _abort(); //@line 3962
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3967
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3968
    $$1 = $16; //@line 3969
    $$1382 = $17; //@line 3969
    $114 = $16; //@line 3969
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3973
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3975
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3979
     $60 = $59 + 4 | 0; //@line 3980
     $61 = HEAP32[$60 >> 2] | 0; //@line 3981
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3984
      if (!$63) {
       $$3 = 0; //@line 3987
       break;
      } else {
       $$1387 = $63; //@line 3990
       $$1390 = $59; //@line 3990
      }
     } else {
      $$1387 = $61; //@line 3993
      $$1390 = $60; //@line 3993
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3996
      $66 = HEAP32[$65 >> 2] | 0; //@line 3997
      if ($66 | 0) {
       $$1387 = $66; //@line 4000
       $$1390 = $65; //@line 4000
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4003
      $69 = HEAP32[$68 >> 2] | 0; //@line 4004
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4009
       $$1390 = $68; //@line 4009
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4014
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4017
      $$3 = $$1387; //@line 4018
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4023
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4026
     }
     $53 = $51 + 12 | 0; //@line 4029
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4033
     }
     $56 = $48 + 8 | 0; //@line 4036
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4040
      HEAP32[$56 >> 2] = $51; //@line 4041
      $$3 = $48; //@line 4042
      break;
     } else {
      _abort(); //@line 4045
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4052
    $$1382 = $17; //@line 4052
    $114 = $16; //@line 4052
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4055
    $75 = 15196 + ($74 << 2) | 0; //@line 4056
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4061
      if (!$$3) {
       HEAP32[3724] = HEAP32[3724] & ~(1 << $74); //@line 4068
       $$1 = $16; //@line 4069
       $$1382 = $17; //@line 4069
       $114 = $16; //@line 4069
       break L10;
      }
     } else {
      if ((HEAP32[3727] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4076
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4084
       if (!$$3) {
        $$1 = $16; //@line 4087
        $$1382 = $17; //@line 4087
        $114 = $16; //@line 4087
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3727] | 0; //@line 4095
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4098
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4102
    $92 = $16 + 16 | 0; //@line 4103
    $93 = HEAP32[$92 >> 2] | 0; //@line 4104
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4110
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4114
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4116
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4122
    if (!$99) {
     $$1 = $16; //@line 4125
     $$1382 = $17; //@line 4125
     $114 = $16; //@line 4125
    } else {
     if ((HEAP32[3727] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4130
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4134
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4136
      $$1 = $16; //@line 4137
      $$1382 = $17; //@line 4137
      $114 = $16; //@line 4137
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4143
   $$1382 = $9; //@line 4143
   $114 = $2; //@line 4143
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4148
 }
 $115 = $10 + 4 | 0; //@line 4151
 $116 = HEAP32[$115 >> 2] | 0; //@line 4152
 if (!($116 & 1)) {
  _abort(); //@line 4156
 }
 if (!($116 & 2)) {
  if ((HEAP32[3729] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3726] | 0) + $$1382 | 0; //@line 4166
   HEAP32[3726] = $124; //@line 4167
   HEAP32[3729] = $$1; //@line 4168
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4171
   if (($$1 | 0) != (HEAP32[3728] | 0)) {
    return;
   }
   HEAP32[3728] = 0; //@line 4177
   HEAP32[3725] = 0; //@line 4178
   return;
  }
  if ((HEAP32[3728] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3725] | 0) + $$1382 | 0; //@line 4185
   HEAP32[3725] = $132; //@line 4186
   HEAP32[3728] = $114; //@line 4187
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4190
   HEAP32[$114 + $132 >> 2] = $132; //@line 4192
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4196
  $138 = $116 >>> 3; //@line 4197
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4202
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4204
    $145 = 14932 + ($138 << 1 << 2) | 0; //@line 4206
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3727] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4212
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4219
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3723] = HEAP32[3723] & ~(1 << $138); //@line 4229
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4235
    } else {
     if ((HEAP32[3727] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4240
     }
     $160 = $143 + 8 | 0; //@line 4243
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4247
     } else {
      _abort(); //@line 4249
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4254
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4255
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4258
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4260
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4264
      $180 = $179 + 4 | 0; //@line 4265
      $181 = HEAP32[$180 >> 2] | 0; //@line 4266
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4269
       if (!$183) {
        $$3400 = 0; //@line 4272
        break;
       } else {
        $$1398 = $183; //@line 4275
        $$1402 = $179; //@line 4275
       }
      } else {
       $$1398 = $181; //@line 4278
       $$1402 = $180; //@line 4278
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4281
       $186 = HEAP32[$185 >> 2] | 0; //@line 4282
       if ($186 | 0) {
        $$1398 = $186; //@line 4285
        $$1402 = $185; //@line 4285
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4288
       $189 = HEAP32[$188 >> 2] | 0; //@line 4289
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4294
        $$1402 = $188; //@line 4294
       }
      }
      if ((HEAP32[3727] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4300
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4303
       $$3400 = $$1398; //@line 4304
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4309
      if ((HEAP32[3727] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4313
      }
      $173 = $170 + 12 | 0; //@line 4316
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4320
      }
      $176 = $167 + 8 | 0; //@line 4323
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4327
       HEAP32[$176 >> 2] = $170; //@line 4328
       $$3400 = $167; //@line 4329
       break;
      } else {
       _abort(); //@line 4332
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4340
     $196 = 15196 + ($195 << 2) | 0; //@line 4341
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4346
       if (!$$3400) {
        HEAP32[3724] = HEAP32[3724] & ~(1 << $195); //@line 4353
        break L108;
       }
      } else {
       if ((HEAP32[3727] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4360
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4368
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3727] | 0; //@line 4378
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4381
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4385
     $213 = $10 + 16 | 0; //@line 4386
     $214 = HEAP32[$213 >> 2] | 0; //@line 4387
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4393
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4397
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4399
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4405
     if ($220 | 0) {
      if ((HEAP32[3727] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4411
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4415
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4417
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4426
  HEAP32[$114 + $137 >> 2] = $137; //@line 4428
  if (($$1 | 0) == (HEAP32[3728] | 0)) {
   HEAP32[3725] = $137; //@line 4432
   return;
  } else {
   $$2 = $137; //@line 4435
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4439
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4442
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4444
  $$2 = $$1382; //@line 4445
 }
 $235 = $$2 >>> 3; //@line 4447
 if ($$2 >>> 0 < 256) {
  $238 = 14932 + ($235 << 1 << 2) | 0; //@line 4451
  $239 = HEAP32[3723] | 0; //@line 4452
  $240 = 1 << $235; //@line 4453
  if (!($239 & $240)) {
   HEAP32[3723] = $239 | $240; //@line 4458
   $$0403 = $238; //@line 4460
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4460
  } else {
   $244 = $238 + 8 | 0; //@line 4462
   $245 = HEAP32[$244 >> 2] | 0; //@line 4463
   if ((HEAP32[3727] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4467
   } else {
    $$0403 = $245; //@line 4470
    $$pre$phiZ2D = $244; //@line 4470
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4473
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4475
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4477
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4479
  return;
 }
 $251 = $$2 >>> 8; //@line 4482
 if (!$251) {
  $$0396 = 0; //@line 4485
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4489
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4493
   $257 = $251 << $256; //@line 4494
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4497
   $262 = $257 << $260; //@line 4499
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4502
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4507
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4513
  }
 }
 $276 = 15196 + ($$0396 << 2) | 0; //@line 4516
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4518
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4521
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4522
 $280 = HEAP32[3724] | 0; //@line 4523
 $281 = 1 << $$0396; //@line 4524
 do {
  if (!($280 & $281)) {
   HEAP32[3724] = $280 | $281; //@line 4530
   HEAP32[$276 >> 2] = $$1; //@line 4531
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4533
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4535
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4537
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4545
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4545
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4552
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4556
    $301 = HEAP32[$299 >> 2] | 0; //@line 4558
    if (!$301) {
     label = 121; //@line 4561
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4564
     $$0384 = $301; //@line 4564
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3727] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4571
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4574
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4576
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4578
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4580
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4585
    $309 = HEAP32[$308 >> 2] | 0; //@line 4586
    $310 = HEAP32[3727] | 0; //@line 4587
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4593
     HEAP32[$308 >> 2] = $$1; //@line 4594
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4596
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4598
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4600
     break;
    } else {
     _abort(); //@line 4603
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3731] | 0) + -1 | 0; //@line 4610
 HEAP32[3731] = $319; //@line 4611
 if (!$319) {
  $$0212$in$i = 15348; //@line 4614
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4619
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4625
  }
 }
 HEAP32[3731] = -1; //@line 4628
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 10925
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 10926
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 10927
 $d_sroa_0_0_extract_trunc = $b$0; //@line 10928
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 10929
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 10930
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 10932
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 10935
    HEAP32[$rem + 4 >> 2] = 0; //@line 10936
   }
   $_0$1 = 0; //@line 10938
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 10939
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10940
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 10943
    $_0$0 = 0; //@line 10944
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10945
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 10947
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 10948
   $_0$1 = 0; //@line 10949
   $_0$0 = 0; //@line 10950
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10951
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 10954
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 10959
     HEAP32[$rem + 4 >> 2] = 0; //@line 10960
    }
    $_0$1 = 0; //@line 10962
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 10963
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10964
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 10968
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 10969
    }
    $_0$1 = 0; //@line 10971
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 10972
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10973
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 10975
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 10978
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 10979
    }
    $_0$1 = 0; //@line 10981
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 10982
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 10983
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 10986
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 10988
    $58 = 31 - $51 | 0; //@line 10989
    $sr_1_ph = $57; //@line 10990
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 10991
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 10992
    $q_sroa_0_1_ph = 0; //@line 10993
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 10994
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 10998
    $_0$0 = 0; //@line 10999
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11000
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 11002
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 11003
   $_0$1 = 0; //@line 11004
   $_0$0 = 0; //@line 11005
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11006
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 11010
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 11012
     $126 = 31 - $119 | 0; //@line 11013
     $130 = $119 - 31 >> 31; //@line 11014
     $sr_1_ph = $125; //@line 11015
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 11016
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 11017
     $q_sroa_0_1_ph = 0; //@line 11018
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 11019
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 11023
     $_0$0 = 0; //@line 11024
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11025
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 11027
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 11028
    $_0$1 = 0; //@line 11029
    $_0$0 = 0; //@line 11030
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11031
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 11033
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 11036
    $89 = 64 - $88 | 0; //@line 11037
    $91 = 32 - $88 | 0; //@line 11038
    $92 = $91 >> 31; //@line 11039
    $95 = $88 - 32 | 0; //@line 11040
    $105 = $95 >> 31; //@line 11041
    $sr_1_ph = $88; //@line 11042
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 11043
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 11044
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 11045
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 11046
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 11050
    HEAP32[$rem + 4 >> 2] = 0; //@line 11051
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 11054
    $_0$0 = $a$0 | 0 | 0; //@line 11055
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11056
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 11058
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 11059
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 11060
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11061
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 11066
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 11067
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 11068
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 11069
  $carry_0_lcssa$1 = 0; //@line 11070
  $carry_0_lcssa$0 = 0; //@line 11071
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 11073
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 11074
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 11075
  $137$1 = tempRet0; //@line 11076
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 11077
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 11078
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 11079
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 11080
  $sr_1202 = $sr_1_ph; //@line 11081
  $carry_0203 = 0; //@line 11082
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 11084
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 11085
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 11086
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 11087
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 11088
   $150$1 = tempRet0; //@line 11089
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 11090
   $carry_0203 = $151$0 & 1; //@line 11091
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 11093
   $r_sroa_1_1200 = tempRet0; //@line 11094
   $sr_1202 = $sr_1202 - 1 | 0; //@line 11095
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 11107
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 11108
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 11109
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 11110
  $carry_0_lcssa$1 = 0; //@line 11111
  $carry_0_lcssa$0 = $carry_0203; //@line 11112
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 11114
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 11115
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 11118
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 11119
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 11121
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 11122
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11123
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 77
 STACKTOP = STACKTOP + 32 | 0; //@line 78
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 78
 $0 = sp; //@line 79
 _gpio_init_out($0, 50); //@line 80
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 83
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 84
  _wait_ms(150); //@line 85
  if (___async) {
   label = 3; //@line 88
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 91
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 93
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 94
  _wait_ms(150); //@line 95
  if (___async) {
   label = 5; //@line 98
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 101
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 103
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 104
  _wait_ms(150); //@line 105
  if (___async) {
   label = 7; //@line 108
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 111
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 113
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 114
  _wait_ms(150); //@line 115
  if (___async) {
   label = 9; //@line 118
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 121
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 123
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 124
  _wait_ms(150); //@line 125
  if (___async) {
   label = 11; //@line 128
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 131
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 133
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 134
  _wait_ms(150); //@line 135
  if (___async) {
   label = 13; //@line 138
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 141
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 143
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 144
  _wait_ms(150); //@line 145
  if (___async) {
   label = 15; //@line 148
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 151
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 153
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 154
  _wait_ms(150); //@line 155
  if (___async) {
   label = 17; //@line 158
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 161
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 163
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 164
  _wait_ms(400); //@line 165
  if (___async) {
   label = 19; //@line 168
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 171
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 173
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 174
  _wait_ms(400); //@line 175
  if (___async) {
   label = 21; //@line 178
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 181
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 183
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 184
  _wait_ms(400); //@line 185
  if (___async) {
   label = 23; //@line 188
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 191
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 193
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 194
  _wait_ms(400); //@line 195
  if (___async) {
   label = 25; //@line 198
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 201
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 203
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 204
  _wait_ms(400); //@line 205
  if (___async) {
   label = 27; //@line 208
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 211
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 213
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 214
  _wait_ms(400); //@line 215
  if (___async) {
   label = 29; //@line 218
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 221
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 223
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 224
  _wait_ms(400); //@line 225
  if (___async) {
   label = 31; //@line 228
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 231
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 233
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 234
  _wait_ms(400); //@line 235
  if (___async) {
   label = 33; //@line 238
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 241
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 7; //@line 245
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 247
   sp = STACKTOP; //@line 248
   STACKTOP = sp; //@line 249
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 8; //@line 253
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 255
   sp = STACKTOP; //@line 256
   STACKTOP = sp; //@line 257
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 9; //@line 261
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 263
   sp = STACKTOP; //@line 264
   STACKTOP = sp; //@line 265
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 10; //@line 269
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 271
   sp = STACKTOP; //@line 272
   STACKTOP = sp; //@line 273
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 11; //@line 277
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 279
   sp = STACKTOP; //@line 280
   STACKTOP = sp; //@line 281
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 12; //@line 285
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 287
   sp = STACKTOP; //@line 288
   STACKTOP = sp; //@line 289
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 13; //@line 293
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 295
   sp = STACKTOP; //@line 296
   STACKTOP = sp; //@line 297
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 14; //@line 301
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 303
   sp = STACKTOP; //@line 304
   STACKTOP = sp; //@line 305
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 15; //@line 309
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 311
   sp = STACKTOP; //@line 312
   STACKTOP = sp; //@line 313
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 16; //@line 317
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 319
   sp = STACKTOP; //@line 320
   STACKTOP = sp; //@line 321
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 17; //@line 325
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 327
   sp = STACKTOP; //@line 328
   STACKTOP = sp; //@line 329
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 18; //@line 333
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 335
   sp = STACKTOP; //@line 336
   STACKTOP = sp; //@line 337
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 19; //@line 341
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 343
   sp = STACKTOP; //@line 344
   STACKTOP = sp; //@line 345
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 20; //@line 349
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 351
   sp = STACKTOP; //@line 352
   STACKTOP = sp; //@line 353
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 21; //@line 357
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 359
   sp = STACKTOP; //@line 360
   STACKTOP = sp; //@line 361
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 22; //@line 365
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 367
   sp = STACKTOP; //@line 368
   STACKTOP = sp; //@line 369
   return;
  }
 }
}
function _BSP_LCD_DisplayChar($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$03641$i$us = 0, $$03641$i$us5 = 0, $$03641$us$i$us = 0, $$03740$i$us = 0, $$03740$i$us6 = 0, $$03740$us$i$us = 0, $$03839$i$us = 0, $$03839$i$us10 = 0, $$03839$us$i$us = 0, $10 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $23 = 0, $26 = 0, $27 = 0, $3 = 0, $31 = 0, $32 = 0, $37 = 0, $50 = 0, $57 = 0, $58 = 0, $63 = 0, $76 = 0, $8 = 0, $88 = 0, $89 = 0, $9 = 0, $94 = 0;
 $3 = HEAP32[3869] | 0; //@line 843
 $8 = HEAP16[$3 + 6 >> 1] | 0; //@line 848
 $9 = $8 & 65535; //@line 849
 $10 = Math_imul(($2 & 255) + -32 | 0, $9) | 0; //@line 850
 $12 = HEAP16[$3 + 4 >> 1] | 0; //@line 852
 $13 = $12 & 65535; //@line 853
 $15 = ($13 + 7 | 0) >>> 3; //@line 855
 $17 = (HEAP32[$3 >> 2] | 0) + (Math_imul($10, $15) | 0) | 0; //@line 857
 if (!($8 << 16 >> 16)) {
  return;
 }
 $23 = $12 << 16 >> 16 != 0; //@line 867
 $26 = $13 + -1 + (($12 + 7 & 248) - $13 & 255) | 0; //@line 870
 $27 = $0 & 65535; //@line 871
 switch ($15 & 16383) {
 case 1:
  {
   if ($23) {
    $$03641$us$i$us = $1; //@line 876
    $$03740$us$i$us = 0; //@line 876
   } else {
    return;
   }
   while (1) {
    $31 = HEAPU8[$17 + (Math_imul($$03740$us$i$us, $15) | 0) >> 0] | 0; //@line 884
    $32 = $$03641$us$i$us & 65535; //@line 885
    $$03839$us$i$us = 0; //@line 886
    do {
     $37 = $$03839$us$i$us + $27 | 0; //@line 892
     if (!(1 << $26 - $$03839$us$i$us & $31)) {
      _emscripten_asm_const_iiii(5, $37 & 65535 | 0, $32 | 0, HEAP32[3868] & 65535 | 0) | 0; //@line 897
     } else {
      _emscripten_asm_const_iiii(5, $37 & 65535 | 0, $32 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 902
     }
     $$03839$us$i$us = $$03839$us$i$us + 1 | 0; //@line 904
    } while (($$03839$us$i$us | 0) != ($13 | 0));
    $$03740$us$i$us = $$03740$us$i$us + 1 | 0; //@line 913
    if (($$03740$us$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$us$i$us = $$03641$us$i$us + 1 << 16 >> 16; //@line 918
    }
   }
   return;
  }
 case 2:
  {
   $$03641$i$us = $1; //@line 925
   $$03740$i$us = 0; //@line 925
   while (1) {
    $50 = $17 + (Math_imul($$03740$i$us, $15) | 0) | 0; //@line 928
    $57 = (HEAPU8[$50 >> 0] | 0) << 8 | (HEAPU8[$50 + 1 >> 0] | 0); //@line 935
    if ($23) {
     $58 = $$03641$i$us & 65535; //@line 937
     $$03839$i$us = 0; //@line 938
     do {
      $63 = $$03839$i$us + $27 | 0; //@line 944
      if (!(1 << $26 - $$03839$i$us & $57)) {
       _emscripten_asm_const_iiii(5, $63 & 65535 | 0, $58 | 0, HEAP32[3868] & 65535 | 0) | 0; //@line 949
      } else {
       _emscripten_asm_const_iiii(5, $63 & 65535 | 0, $58 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 954
      }
      $$03839$i$us = $$03839$i$us + 1 | 0; //@line 956
     } while (($$03839$i$us | 0) != ($13 | 0));
    }
    $$03740$i$us = $$03740$i$us + 1 | 0; //@line 966
    if (($$03740$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us = $$03641$i$us + 1 << 16 >> 16; //@line 971
    }
   }
   return;
  }
 default:
  {
   if ($23) {
    $$03641$i$us5 = $1; //@line 979
    $$03740$i$us6 = 0; //@line 979
   } else {
    return;
   }
   while (1) {
    $76 = $17 + (Math_imul($$03740$i$us6, $15) | 0) | 0; //@line 985
    $88 = (HEAPU8[$76 + 1 >> 0] | 0) << 8 | (HEAPU8[$76 >> 0] | 0) << 16 | (HEAPU8[$76 + 2 >> 0] | 0); //@line 997
    $89 = $$03641$i$us5 & 65535; //@line 998
    $$03839$i$us10 = 0; //@line 999
    do {
     $94 = $$03839$i$us10 + $27 | 0; //@line 1005
     if (!(1 << $26 - $$03839$i$us10 & $88)) {
      _emscripten_asm_const_iiii(5, $94 & 65535 | 0, $89 | 0, HEAP32[3868] & 65535 | 0) | 0; //@line 1010
     } else {
      _emscripten_asm_const_iiii(5, $94 & 65535 | 0, $89 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1015
     }
     $$03839$i$us10 = $$03839$i$us10 + 1 | 0; //@line 1017
    } while (($$03839$i$us10 | 0) != ($13 | 0));
    $$03740$i$us6 = $$03740$i$us6 + 1 | 0; //@line 1026
    if (($$03740$i$us6 | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us5 = $$03641$i$us5 + 1 << 16 >> 16; //@line 1031
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6955
      $10 = HEAP32[$9 >> 2] | 0; //@line 6956
      HEAP32[$2 >> 2] = $9 + 4; //@line 6958
      HEAP32[$0 >> 2] = $10; //@line 6959
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6975
      $17 = HEAP32[$16 >> 2] | 0; //@line 6976
      HEAP32[$2 >> 2] = $16 + 4; //@line 6978
      $20 = $0; //@line 6981
      HEAP32[$20 >> 2] = $17; //@line 6983
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 6986
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7002
      $30 = HEAP32[$29 >> 2] | 0; //@line 7003
      HEAP32[$2 >> 2] = $29 + 4; //@line 7005
      $31 = $0; //@line 7006
      HEAP32[$31 >> 2] = $30; //@line 7008
      HEAP32[$31 + 4 >> 2] = 0; //@line 7011
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7027
      $41 = $40; //@line 7028
      $43 = HEAP32[$41 >> 2] | 0; //@line 7030
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7033
      HEAP32[$2 >> 2] = $40 + 8; //@line 7035
      $47 = $0; //@line 7036
      HEAP32[$47 >> 2] = $43; //@line 7038
      HEAP32[$47 + 4 >> 2] = $46; //@line 7041
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7057
      $57 = HEAP32[$56 >> 2] | 0; //@line 7058
      HEAP32[$2 >> 2] = $56 + 4; //@line 7060
      $59 = ($57 & 65535) << 16 >> 16; //@line 7062
      $62 = $0; //@line 7065
      HEAP32[$62 >> 2] = $59; //@line 7067
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7070
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7086
      $72 = HEAP32[$71 >> 2] | 0; //@line 7087
      HEAP32[$2 >> 2] = $71 + 4; //@line 7089
      $73 = $0; //@line 7091
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7093
      HEAP32[$73 + 4 >> 2] = 0; //@line 7096
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7112
      $83 = HEAP32[$82 >> 2] | 0; //@line 7113
      HEAP32[$2 >> 2] = $82 + 4; //@line 7115
      $85 = ($83 & 255) << 24 >> 24; //@line 7117
      $88 = $0; //@line 7120
      HEAP32[$88 >> 2] = $85; //@line 7122
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7125
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7141
      $98 = HEAP32[$97 >> 2] | 0; //@line 7142
      HEAP32[$2 >> 2] = $97 + 4; //@line 7144
      $99 = $0; //@line 7146
      HEAP32[$99 >> 2] = $98 & 255; //@line 7148
      HEAP32[$99 + 4 >> 2] = 0; //@line 7151
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7167
      $109 = +HEAPF64[$108 >> 3]; //@line 7168
      HEAP32[$2 >> 2] = $108 + 8; //@line 7170
      HEAPF64[$0 >> 3] = $109; //@line 7171
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7187
      $116 = +HEAPF64[$115 >> 3]; //@line 7188
      HEAP32[$2 >> 2] = $115 + 8; //@line 7190
      HEAPF64[$0 >> 3] = $116; //@line 7191
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
 sp = STACKTOP; //@line 5855
 STACKTOP = STACKTOP + 224 | 0; //@line 5856
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 5856
 $3 = sp + 120 | 0; //@line 5857
 $4 = sp + 80 | 0; //@line 5858
 $5 = sp; //@line 5859
 $6 = sp + 136 | 0; //@line 5860
 dest = $4; //@line 5861
 stop = dest + 40 | 0; //@line 5861
 do {
  HEAP32[dest >> 2] = 0; //@line 5861
  dest = dest + 4 | 0; //@line 5861
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 5863
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 5867
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 5874
  } else {
   $43 = 0; //@line 5876
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 5878
  $14 = $13 & 32; //@line 5879
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 5885
  }
  $19 = $0 + 48 | 0; //@line 5887
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 5892
    $24 = HEAP32[$23 >> 2] | 0; //@line 5893
    HEAP32[$23 >> 2] = $6; //@line 5894
    $25 = $0 + 28 | 0; //@line 5895
    HEAP32[$25 >> 2] = $6; //@line 5896
    $26 = $0 + 20 | 0; //@line 5897
    HEAP32[$26 >> 2] = $6; //@line 5898
    HEAP32[$19 >> 2] = 80; //@line 5899
    $28 = $0 + 16 | 0; //@line 5901
    HEAP32[$28 >> 2] = $6 + 80; //@line 5902
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 5903
    if (!$24) {
     $$1 = $29; //@line 5906
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 5909
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 5910
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 5911
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 44; //@line 5914
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 5916
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 5918
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 5920
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 5922
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 5924
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 5926
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 5928
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 5930
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 5932
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 5934
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 5936
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 5938
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 5940
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 5942
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 5944
      sp = STACKTOP; //@line 5945
      STACKTOP = sp; //@line 5946
      return 0; //@line 5946
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5948
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 5951
      HEAP32[$23 >> 2] = $24; //@line 5952
      HEAP32[$19 >> 2] = 0; //@line 5953
      HEAP32[$28 >> 2] = 0; //@line 5954
      HEAP32[$25 >> 2] = 0; //@line 5955
      HEAP32[$26 >> 2] = 0; //@line 5956
      $$1 = $$; //@line 5957
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 5963
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 5966
  HEAP32[$0 >> 2] = $51 | $14; //@line 5971
  if ($43 | 0) {
   ___unlockfile($0); //@line 5974
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 5976
 }
 STACKTOP = sp; //@line 5978
 return $$0 | 0; //@line 5978
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9110
 STACKTOP = STACKTOP + 64 | 0; //@line 9111
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9111
 $4 = sp; //@line 9112
 $5 = HEAP32[$0 >> 2] | 0; //@line 9113
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 9116
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 9118
 HEAP32[$4 >> 2] = $2; //@line 9119
 HEAP32[$4 + 4 >> 2] = $0; //@line 9121
 HEAP32[$4 + 8 >> 2] = $1; //@line 9123
 HEAP32[$4 + 12 >> 2] = $3; //@line 9125
 $14 = $4 + 16 | 0; //@line 9126
 $15 = $4 + 20 | 0; //@line 9127
 $16 = $4 + 24 | 0; //@line 9128
 $17 = $4 + 28 | 0; //@line 9129
 $18 = $4 + 32 | 0; //@line 9130
 $19 = $4 + 40 | 0; //@line 9131
 dest = $14; //@line 9132
 stop = dest + 36 | 0; //@line 9132
 do {
  HEAP32[dest >> 2] = 0; //@line 9132
  dest = dest + 4 | 0; //@line 9132
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 9132
 HEAP8[$14 + 38 >> 0] = 0; //@line 9132
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 9137
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 9140
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9141
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 9142
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 49; //@line 9145
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 9147
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 9149
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9151
    sp = STACKTOP; //@line 9152
    STACKTOP = sp; //@line 9153
    return 0; //@line 9153
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9155
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 9159
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 9163
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 9166
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 9167
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 9168
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 50; //@line 9171
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 9173
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 9175
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 9177
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 9179
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 9181
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 9183
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 9185
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 9187
    sp = STACKTOP; //@line 9188
    STACKTOP = sp; //@line 9189
    return 0; //@line 9189
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9191
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 9205
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 9213
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 9229
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 9234
  }
 } while (0);
 STACKTOP = sp; //@line 9237
 return $$0 | 0; //@line 9237
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 5727
 $7 = ($2 | 0) != 0; //@line 5731
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 5735
   $$03555 = $0; //@line 5736
   $$03654 = $2; //@line 5736
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 5741
     $$036$lcssa64 = $$03654; //@line 5741
     label = 6; //@line 5742
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 5745
    $12 = $$03654 + -1 | 0; //@line 5746
    $16 = ($12 | 0) != 0; //@line 5750
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 5753
     $$03654 = $12; //@line 5753
    } else {
     $$035$lcssa = $11; //@line 5755
     $$036$lcssa = $12; //@line 5755
     $$lcssa = $16; //@line 5755
     label = 5; //@line 5756
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 5761
   $$036$lcssa = $2; //@line 5761
   $$lcssa = $7; //@line 5761
   label = 5; //@line 5762
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 5767
   $$036$lcssa64 = $$036$lcssa; //@line 5767
   label = 6; //@line 5768
  } else {
   $$2 = $$035$lcssa; //@line 5770
   $$3 = 0; //@line 5770
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 5776
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 5779
    $$3 = $$036$lcssa64; //@line 5779
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 5781
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 5785
      $$13745 = $$036$lcssa64; //@line 5785
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 5788
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 5797
       $30 = $$13745 + -4 | 0; //@line 5798
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 5801
        $$13745 = $30; //@line 5801
       } else {
        $$0$lcssa = $29; //@line 5803
        $$137$lcssa = $30; //@line 5803
        label = 11; //@line 5804
        break L11;
       }
      }
      $$140 = $$046; //@line 5808
      $$23839 = $$13745; //@line 5808
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 5810
      $$137$lcssa = $$036$lcssa64; //@line 5810
      label = 11; //@line 5811
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 5817
      $$3 = 0; //@line 5817
      break;
     } else {
      $$140 = $$0$lcssa; //@line 5820
      $$23839 = $$137$lcssa; //@line 5820
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 5827
      $$3 = $$23839; //@line 5827
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 5830
     $$23839 = $$23839 + -1 | 0; //@line 5831
     if (!$$23839) {
      $$2 = $35; //@line 5834
      $$3 = 0; //@line 5834
      break;
     } else {
      $$140 = $35; //@line 5837
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 5845
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5498
 do {
  if (!$0) {
   do {
    if (!(HEAP32[62] | 0)) {
     $34 = 0; //@line 5506
    } else {
     $12 = HEAP32[62] | 0; //@line 5508
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5509
     $13 = _fflush($12) | 0; //@line 5510
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 40; //@line 5513
      sp = STACKTOP; //@line 5514
      return 0; //@line 5515
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5517
      $34 = $13; //@line 5518
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5524
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5528
    } else {
     $$02327 = $$02325; //@line 5530
     $$02426 = $34; //@line 5530
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5537
      } else {
       $28 = 0; //@line 5539
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5547
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5548
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5553
       $$1 = $25 | $$02426; //@line 5555
      } else {
       $$1 = $$02426; //@line 5557
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5561
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5564
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5567
       break L9;
      } else {
       $$02327 = $$023; //@line 5570
       $$02426 = $$1; //@line 5570
      }
     }
     HEAP32[$AsyncCtx >> 2] = 41; //@line 5573
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5575
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5577
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5579
     sp = STACKTOP; //@line 5580
     return 0; //@line 5581
    }
   } while (0);
   ___ofl_unlock(); //@line 5584
   $$0 = $$024$lcssa; //@line 5585
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5591
    $5 = ___fflush_unlocked($0) | 0; //@line 5592
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 38; //@line 5595
     sp = STACKTOP; //@line 5596
     return 0; //@line 5597
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5599
     $$0 = $5; //@line 5600
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5605
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5606
   $7 = ___fflush_unlocked($0) | 0; //@line 5607
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 39; //@line 5610
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 5613
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5615
    sp = STACKTOP; //@line 5616
    return 0; //@line 5617
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5619
   if ($phitmp) {
    $$0 = $7; //@line 5621
   } else {
    ___unlockfile($0); //@line 5623
    $$0 = $7; //@line 5624
   }
  }
 } while (0);
 return $$0 | 0; //@line 5628
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9292
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9298
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 9304
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 9307
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9308
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 9309
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 53; //@line 9312
     sp = STACKTOP; //@line 9313
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9316
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 9324
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 9329
     $19 = $1 + 44 | 0; //@line 9330
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 9336
     HEAP8[$22 >> 0] = 0; //@line 9337
     $23 = $1 + 53 | 0; //@line 9338
     HEAP8[$23 >> 0] = 0; //@line 9339
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 9341
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 9344
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 9345
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 9346
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 52; //@line 9349
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 9351
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9353
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 9355
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 9357
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 9359
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 9361
      sp = STACKTOP; //@line 9362
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 9365
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 9369
      label = 13; //@line 9370
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 9375
       label = 13; //@line 9376
      } else {
       $$037$off039 = 3; //@line 9378
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 9382
      $39 = $1 + 40 | 0; //@line 9383
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 9386
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9396
        $$037$off039 = $$037$off038; //@line 9397
       } else {
        $$037$off039 = $$037$off038; //@line 9399
       }
      } else {
       $$037$off039 = $$037$off038; //@line 9402
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 9405
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 9412
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
 sp = STACKTOP; //@line 4653
 STACKTOP = STACKTOP + 48 | 0; //@line 4654
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4654
 $vararg_buffer3 = sp + 16 | 0; //@line 4655
 $vararg_buffer = sp; //@line 4656
 $3 = sp + 32 | 0; //@line 4657
 $4 = $0 + 28 | 0; //@line 4658
 $5 = HEAP32[$4 >> 2] | 0; //@line 4659
 HEAP32[$3 >> 2] = $5; //@line 4660
 $7 = $0 + 20 | 0; //@line 4662
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4664
 HEAP32[$3 + 4 >> 2] = $9; //@line 4665
 HEAP32[$3 + 8 >> 2] = $1; //@line 4667
 HEAP32[$3 + 12 >> 2] = $2; //@line 4669
 $12 = $9 + $2 | 0; //@line 4670
 $13 = $0 + 60 | 0; //@line 4671
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4674
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4676
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4678
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4680
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4684
  } else {
   $$04756 = 2; //@line 4686
   $$04855 = $12; //@line 4686
   $$04954 = $3; //@line 4686
   $27 = $17; //@line 4686
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4692
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4694
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4695
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4697
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4699
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4701
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4704
    $44 = $$150 + 4 | 0; //@line 4705
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4708
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4711
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4713
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4715
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4717
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4720
     break L1;
    } else {
     $$04756 = $$1; //@line 4723
     $$04954 = $$150; //@line 4723
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4727
   HEAP32[$4 >> 2] = 0; //@line 4728
   HEAP32[$7 >> 2] = 0; //@line 4729
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4732
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4735
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4740
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4746
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4751
  $25 = $20; //@line 4752
  HEAP32[$4 >> 2] = $25; //@line 4753
  HEAP32[$7 >> 2] = $25; //@line 4754
  $$051 = $2; //@line 4755
 }
 STACKTOP = sp; //@line 4757
 return $$051 | 0; //@line 4757
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 11232
 }
 ret = dest | 0; //@line 11235
 dest_end = dest + num | 0; //@line 11236
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 11240
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 11241
   dest = dest + 1 | 0; //@line 11242
   src = src + 1 | 0; //@line 11243
   num = num - 1 | 0; //@line 11244
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 11246
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 11247
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11249
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 11250
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 11251
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 11252
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 11253
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 11254
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 11255
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 11256
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 11257
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 11258
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 11259
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 11260
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 11261
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 11262
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 11263
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 11264
   dest = dest + 64 | 0; //@line 11265
   src = src + 64 | 0; //@line 11266
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11269
   dest = dest + 4 | 0; //@line 11270
   src = src + 4 | 0; //@line 11271
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 11275
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 11277
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 11278
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 11279
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 11280
   dest = dest + 4 | 0; //@line 11281
   src = src + 4 | 0; //@line 11282
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 11287
  dest = dest + 1 | 0; //@line 11288
  src = src + 1 | 0; //@line 11289
 }
 return ret | 0; //@line 11291
}
function _BSP_LCD_FillCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04157 = 0, $$04256 = 0, $$058 = 0, $$07$i = 0, $$07$i45 = 0, $$07$i49 = 0, $$07$i53 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $14 = 0, $17 = 0, $25 = 0, $3 = 0, $33 = 0, $34 = 0, $36 = 0, $39 = 0, $47 = 0, $8 = 0, $9 = 0;
 $3 = $2 & 65535; //@line 1235
 HEAP32[3867] = HEAP32[3867] & 65535; //@line 1240
 $8 = $0 & 65535; //@line 1241
 $9 = $1 & 65535; //@line 1242
 $$04157 = 0; //@line 1243
 $$04256 = 3 - ($3 << 1) | 0; //@line 1243
 $$058 = $3; //@line 1243
 while (1) {
  if ($$058 | 0) {
   $11 = $8 - $$058 | 0; //@line 1247
   $12 = $$058 << 1; //@line 1248
   $14 = $12 & 65534; //@line 1250
   if (($12 & 65535) << 16 >> 16) {
    $17 = $$04157 + $9 & 65535; //@line 1254
    $$07$i = 0; //@line 1255
    do {
     _emscripten_asm_const_iiii(5, $$07$i + $11 & 65535 | 0, $17 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1261
     $$07$i = $$07$i + 1 | 0; //@line 1262
    } while (($$07$i | 0) != ($14 | 0));
    $25 = $9 - $$04157 & 65535; //@line 1271
    $$07$i45 = 0; //@line 1272
    do {
     _emscripten_asm_const_iiii(5, $$07$i45 + $11 & 65535 | 0, $25 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1278
     $$07$i45 = $$07$i45 + 1 | 0; //@line 1279
    } while (($$07$i45 | 0) != ($14 | 0));
   }
  }
  if ($$04157 | 0) {
   $33 = $8 - $$04157 | 0; //@line 1291
   $34 = $$04157 << 1; //@line 1292
   $36 = $34 & 65534; //@line 1294
   if (($34 & 65535) << 16 >> 16) {
    $39 = $9 - $$058 & 65535; //@line 1298
    $$07$i49 = 0; //@line 1299
    do {
     _emscripten_asm_const_iiii(5, $$07$i49 + $33 & 65535 | 0, $39 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1305
     $$07$i49 = $$07$i49 + 1 | 0; //@line 1306
    } while (($$07$i49 | 0) != ($36 | 0));
    $47 = $$058 + $9 & 65535; //@line 1315
    $$07$i53 = 0; //@line 1316
    do {
     _emscripten_asm_const_iiii(5, $$07$i53 + $33 & 65535 | 0, $47 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1322
     $$07$i53 = $$07$i53 + 1 | 0; //@line 1323
    } while (($$07$i53 | 0) != ($36 | 0));
   }
  }
  if (($$04256 | 0) < 0) {
   $$1 = $$058; //@line 1337
   $$pn = ($$04157 << 2) + 6 | 0; //@line 1337
  } else {
   $$1 = $$058 + -1 | 0; //@line 1343
   $$pn = ($$04157 - $$058 << 2) + 10 | 0; //@line 1343
  }
  $$04157 = $$04157 + 1 | 0; //@line 1346
  if ($$04157 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04256 = $$pn + $$04256 | 0; //@line 1351
   $$058 = $$1; //@line 1351
  }
 }
 HEAP32[3867] = HEAP32[3867] & 65535; //@line 1356
 _BSP_LCD_DrawCircle($0, $1, $2); //@line 1357
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8793
 STACKTOP = STACKTOP + 64 | 0; //@line 8794
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8794
 $3 = sp; //@line 8795
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 8798
 } else {
  if (!$1) {
   $$2 = 0; //@line 8802
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 8804
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 8805
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 47; //@line 8808
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 8810
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8812
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 8814
    sp = STACKTOP; //@line 8815
    STACKTOP = sp; //@line 8816
    return 0; //@line 8816
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8818
   if (!$6) {
    $$2 = 0; //@line 8821
   } else {
    dest = $3 + 4 | 0; //@line 8824
    stop = dest + 52 | 0; //@line 8824
    do {
     HEAP32[dest >> 2] = 0; //@line 8824
     dest = dest + 4 | 0; //@line 8824
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 8825
    HEAP32[$3 + 8 >> 2] = $0; //@line 8827
    HEAP32[$3 + 12 >> 2] = -1; //@line 8829
    HEAP32[$3 + 48 >> 2] = 1; //@line 8831
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 8834
    $18 = HEAP32[$2 >> 2] | 0; //@line 8835
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8836
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 8837
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 48; //@line 8840
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 8842
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8844
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8846
     sp = STACKTOP; //@line 8847
     STACKTOP = sp; //@line 8848
     return 0; //@line 8848
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8850
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 8857
     $$0 = 1; //@line 8858
    } else {
     $$0 = 0; //@line 8860
    }
    $$2 = $$0; //@line 8862
   }
  }
 }
 STACKTOP = sp; //@line 8866
 return $$2 | 0; //@line 8866
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 8600
 STACKTOP = STACKTOP + 128 | 0; //@line 8601
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 8601
 $4 = sp + 124 | 0; //@line 8602
 $5 = sp; //@line 8603
 dest = $5; //@line 8604
 src = 496; //@line 8604
 stop = dest + 124 | 0; //@line 8604
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 8604
  dest = dest + 4 | 0; //@line 8604
  src = src + 4 | 0; //@line 8604
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 8610
   $$015 = 1; //@line 8610
   label = 4; //@line 8611
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8614
   $$0 = -1; //@line 8615
  }
 } else {
  $$014 = $0; //@line 8618
  $$015 = $1; //@line 8618
  label = 4; //@line 8619
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 8623
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 8625
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 8627
  $14 = $5 + 20 | 0; //@line 8628
  HEAP32[$14 >> 2] = $$014; //@line 8629
  HEAP32[$5 + 44 >> 2] = $$014; //@line 8631
  $16 = $$014 + $$$015 | 0; //@line 8632
  $17 = $5 + 16 | 0; //@line 8633
  HEAP32[$17 >> 2] = $16; //@line 8634
  HEAP32[$5 + 28 >> 2] = $16; //@line 8636
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 8637
  $19 = _vfprintf($5, $2, $3) | 0; //@line 8638
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 45; //@line 8641
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 8643
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 8645
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 8647
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 8649
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 8651
   sp = STACKTOP; //@line 8652
   STACKTOP = sp; //@line 8653
   return 0; //@line 8653
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8655
  if (!$$$015) {
   $$0 = $19; //@line 8658
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 8660
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 8665
   $$0 = $19; //@line 8666
  }
 }
 STACKTOP = sp; //@line 8669
 return $$0 | 0; //@line 8669
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 5363
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 5366
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 5369
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 5372
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 5378
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 5387
     $24 = $13 >>> 2; //@line 5388
     $$090 = 0; //@line 5389
     $$094 = $7; //@line 5389
     while (1) {
      $25 = $$094 >>> 1; //@line 5391
      $26 = $$090 + $25 | 0; //@line 5392
      $27 = $26 << 1; //@line 5393
      $28 = $27 + $23 | 0; //@line 5394
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 5397
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5401
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 5407
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 5415
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 5419
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 5425
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 5430
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 5433
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 5433
      }
     }
     $46 = $27 + $24 | 0; //@line 5436
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 5439
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5443
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 5455
     } else {
      $$4 = 0; //@line 5457
     }
    } else {
     $$4 = 0; //@line 5460
    }
   } else {
    $$4 = 0; //@line 5463
   }
  } else {
   $$4 = 0; //@line 5466
  }
 } while (0);
 return $$4 | 0; //@line 5469
}
function _main() {
 var $1 = 0, $10 = 0, $11 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1405
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1406
 _puts(12209) | 0; //@line 1407
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 31; //@line 1410
  sp = STACKTOP; //@line 1411
  return 0; //@line 1412
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1414
 _BSP_LCD_Init() | 0; //@line 1415
 $1 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 1417
 do {
  if ((_BSP_TS_Init($1, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1424
   _puts(12229) | 0; //@line 1425
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 1428
    sp = STACKTOP; //@line 1429
    return 0; //@line 1430
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1432
    break;
   }
  }
 } while (0);
 _BSP_LCD_Clear(-1); //@line 1437
 _BSP_LCD_SetTextColor(2016); //@line 1438
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 1441
 _BSP_LCD_SetTextColor(0); //@line 1442
 _BSP_LCD_SetBackColor(2016); //@line 1443
 _BSP_LCD_SetFont(104); //@line 1444
 _BSP_LCD_DisplayStringAt(0, 15, 12247, 1); //@line 1445
 while (1) {
  $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1447
  _BSP_TS_GetState(15480) | 0; //@line 1448
  if (___async) {
   label = 9; //@line 1451
   break;
  }
  _emscripten_free_async_context($AsyncCtx10 | 0); //@line 1454
  if (!(HEAP8[15480] | 0)) {
   continue;
  }
  $10 = HEAP16[7741] | 0; //@line 1460
  $11 = HEAP16[7743] | 0; //@line 1461
  _BSP_LCD_SetTextColor(-2048); //@line 1462
  _BSP_LCD_FillCircle($10, $11, 5); //@line 1463
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1464
  _wait_ms(10); //@line 1465
  if (___async) {
   label = 12; //@line 1468
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1471
 }
 if ((label | 0) == 9) {
  HEAP32[$AsyncCtx10 >> 2] = 33; //@line 1474
  sp = STACKTOP; //@line 1475
  return 0; //@line 1476
 } else if ((label | 0) == 12) {
  HEAP32[$AsyncCtx7 >> 2] = 34; //@line 1479
  sp = STACKTOP; //@line 1480
  return 0; //@line 1481
 }
 return 0; //@line 1483
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5028
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5033
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5038
  } else {
   $20 = $0 & 255; //@line 5040
   $21 = $0 & 255; //@line 5041
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5047
   } else {
    $26 = $1 + 20 | 0; //@line 5049
    $27 = HEAP32[$26 >> 2] | 0; //@line 5050
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5056
     HEAP8[$27 >> 0] = $20; //@line 5057
     $34 = $21; //@line 5058
    } else {
     label = 12; //@line 5060
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5065
     $32 = ___overflow($1, $0) | 0; //@line 5066
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 36; //@line 5069
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5071
      sp = STACKTOP; //@line 5072
      return 0; //@line 5073
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5075
      $34 = $32; //@line 5076
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5081
   $$0 = $34; //@line 5082
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5087
   $8 = $0 & 255; //@line 5088
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5094
    $14 = HEAP32[$13 >> 2] | 0; //@line 5095
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5101
     HEAP8[$14 >> 0] = $7; //@line 5102
     $$0 = $8; //@line 5103
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5107
   $19 = ___overflow($1, $0) | 0; //@line 5108
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 35; //@line 5111
    sp = STACKTOP; //@line 5112
    return 0; //@line 5113
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5115
    $$0 = $19; //@line 5116
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5121
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5634
 $1 = $0 + 20 | 0; //@line 5635
 $3 = $0 + 28 | 0; //@line 5637
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 5643
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5644
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 5645
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 42; //@line 5648
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5650
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 5652
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5654
    sp = STACKTOP; //@line 5655
    return 0; //@line 5656
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5658
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 5662
     break;
    } else {
     label = 5; //@line 5665
     break;
    }
   }
  } else {
   label = 5; //@line 5670
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 5674
  $14 = HEAP32[$13 >> 2] | 0; //@line 5675
  $15 = $0 + 8 | 0; //@line 5676
  $16 = HEAP32[$15 >> 2] | 0; //@line 5677
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5685
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 5686
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 5687
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 43; //@line 5690
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5692
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5694
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5696
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5698
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5700
     sp = STACKTOP; //@line 5701
     return 0; //@line 5702
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5704
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 5710
  HEAP32[$3 >> 2] = 0; //@line 5711
  HEAP32[$1 >> 2] = 0; //@line 5712
  HEAP32[$15 >> 2] = 0; //@line 5713
  HEAP32[$13 >> 2] = 0; //@line 5714
  $$0 = 0; //@line 5715
 }
 return $$0 | 0; //@line 5717
}
function _BSP_LCD_DisplayStringAt($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$030$lcssa = 0, $$03037 = 0, $$03136 = 0, $$032 = 0, $$03334 = 0, $$038 = 0, $$135 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $28 = 0, $29 = 0, $47 = 0, $49 = 0, $54 = 0, $7 = 0;
 if (!(HEAP8[$2 >> 0] | 0)) {
  $$030$lcssa = 0; //@line 1051
 } else {
  $$03037 = 0; //@line 1053
  $$038 = $2; //@line 1053
  while (1) {
   $$038 = $$038 + 1 | 0; //@line 1055
   $7 = $$03037 + 1 | 0; //@line 1056
   if (!(HEAP8[$$038 >> 0] | 0)) {
    $$030$lcssa = $7; //@line 1060
    break;
   } else {
    $$03037 = $7; //@line 1063
   }
  }
 }
 $10 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 1067
 $13 = HEAP16[(HEAP32[3869] | 0) + 4 >> 1] | 0; //@line 1070
 $14 = $13 & 65535; //@line 1071
 $15 = (($10 & 65535) / ($13 & 65535) | 0) & 65535; //@line 1073
 switch ($3 | 0) {
 case 1:
  {
   $$032 = ((Math_imul($15 - $$030$lcssa | 0, $14) | 0) >>> 1) + ($0 & 65535) & 65535; //@line 1082
   break;
  }
 case 2:
  {
   $$032 = (Math_imul($15 - $$030$lcssa | 0, $14) | 0) - ($0 & 65535) & 65535; //@line 1091
   break;
  }
 default:
  {
   $$032 = $0; //@line 1095
  }
 }
 $28 = (HEAP8[$2 >> 0] | 0) != 0; //@line 1099
 $29 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 1100
 if (!($28 & ($29 & 65535) >= (HEAPU16[(HEAP32[3869] | 0) + 4 >> 1] | 0))) {
  return;
 }
 $$03136 = 0; //@line 1111
 $$03334 = $2; //@line 1111
 $$135 = $$032 << 16 >> 16 > 1 ? $$032 : 1; //@line 1111
 do {
  _BSP_LCD_DisplayChar($$135, $1, HEAP8[$$03334 >> 0] | 0); //@line 1114
  $$135 = (HEAPU16[(HEAP32[3869] | 0) + 4 >> 1] | 0) + ($$135 & 65535) & 65535; //@line 1121
  $$03334 = $$03334 + 1 | 0; //@line 1122
  $$03136 = $$03136 + 1 << 16 >> 16; //@line 1123
  $47 = (HEAP8[$$03334 >> 0] | 0) != 0; //@line 1125
  $49 = (_ST7789H2_GetLcdPixelWidth() | 0) & 65535; //@line 1127
  $54 = HEAPU16[(HEAP32[3869] | 0) + 4 >> 1] | 0; //@line 1132
 } while ($47 & ($49 - (Math_imul($54, $$03136 & 65535) | 0) & 65535) >>> 0 >= $54 >>> 0);
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $$09$i = 0, $1 = 0, $12 = 0, $18 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 379
 STACKTOP = STACKTOP + 144 | 0; //@line 380
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 380
 $1 = sp + 16 | 0; //@line 381
 $2 = sp; //@line 382
 HEAP32[$2 >> 2] = $varargs; //@line 383
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 384
 $3 = _vsnprintf($1, 128, $0, $2) | 0; //@line 385
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 388
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 390
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 392
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 394
  sp = STACKTOP; //@line 395
  STACKTOP = sp; //@line 396
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 398
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 401
  return;
 }
 if (!(HEAP32[3720] | 0)) {
  _serial_init(14884, 2, 3); //@line 406
  $$09$i = 0; //@line 407
 } else {
  $$09$i = 0; //@line 409
 }
 while (1) {
  $12 = HEAP8[$1 + $$09$i >> 0] | 0; //@line 414
  $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 415
  _serial_putc(14884, $12); //@line 416
  if (___async) {
   label = 7; //@line 419
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 422
  $18 = $$09$i + 1 | 0; //@line 423
  if (($18 | 0) == ($3 | 0)) {
   label = 9; //@line 426
   break;
  } else {
   $$09$i = $18; //@line 429
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 24; //@line 433
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09$i; //@line 435
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 437
  HEAP32[$AsyncCtx2 + 12 >> 2] = $1; //@line 439
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 441
  HEAP32[$AsyncCtx2 + 20 >> 2] = $1; //@line 443
  sp = STACKTOP; //@line 444
  STACKTOP = sp; //@line 445
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 448
  return;
 }
}
function _BSP_LCD_DrawCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04852 = 0, $$04951 = 0, $$053 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $17 = 0, $23 = 0, $24 = 0, $29 = 0, $3 = 0, $34 = 0, $42 = 0, $6 = 0, $7 = 0;
 $3 = $2 & 65535; //@line 1155
 $6 = $0 & 65535; //@line 1158
 $7 = $1 & 65535; //@line 1159
 $$04852 = 0; //@line 1160
 $$04951 = 3 - ($3 << 1) | 0; //@line 1160
 $$053 = $3; //@line 1160
 while (1) {
  $11 = $$04852 + $6 & 65535; //@line 1165
  $12 = $7 - $$053 & 65535; //@line 1166
  _emscripten_asm_const_iiii(5, $11 | 0, $12 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1168
  $17 = $6 - $$04852 & 65535; //@line 1171
  _emscripten_asm_const_iiii(5, $17 | 0, $12 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1173
  $23 = $$053 + $6 & 65535; //@line 1177
  $24 = $7 - $$04852 & 65535; //@line 1178
  _emscripten_asm_const_iiii(5, $23 | 0, $24 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1180
  $29 = $6 - $$053 & 65535; //@line 1183
  _emscripten_asm_const_iiii(5, $29 | 0, $24 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1185
  $34 = $$053 + $7 & 65535; //@line 1188
  _emscripten_asm_const_iiii(5, $11 | 0, $34 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1190
  _emscripten_asm_const_iiii(5, $17 | 0, $34 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1193
  $42 = $$04852 + $7 & 65535; //@line 1196
  _emscripten_asm_const_iiii(5, $23 | 0, $42 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1198
  _emscripten_asm_const_iiii(5, $29 | 0, $42 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 1201
  HEAP32[3869] = 96; //@line 1202
  if (($$04951 | 0) < 0) {
   $$1 = $$053; //@line 1207
   $$pn = ($$04852 << 2) + 6 | 0; //@line 1207
  } else {
   $$1 = $$053 + -1 | 0; //@line 1213
   $$pn = ($$04852 - $$053 << 2) + 10 | 0; //@line 1213
  }
  $$04852 = $$04852 + 1 | 0; //@line 1216
  if ($$04852 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04951 = $$pn + $$04951 | 0; //@line 1221
   $$053 = $$1; //@line 1221
  }
 }
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 5254
 $4 = HEAP32[$3 >> 2] | 0; //@line 5255
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 5262
   label = 5; //@line 5263
  } else {
   $$1 = 0; //@line 5265
  }
 } else {
  $12 = $4; //@line 5269
  label = 5; //@line 5270
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 5274
   $10 = HEAP32[$9 >> 2] | 0; //@line 5275
   $14 = $10; //@line 5278
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5283
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5291
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5295
       $$141 = $0; //@line 5295
       $$143 = $1; //@line 5295
       $31 = $14; //@line 5295
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5298
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5305
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5310
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5313
      break L5;
     }
     $$139 = $$038; //@line 5319
     $$141 = $0 + $$038 | 0; //@line 5319
     $$143 = $1 - $$038 | 0; //@line 5319
     $31 = HEAP32[$9 >> 2] | 0; //@line 5319
    } else {
     $$139 = 0; //@line 5321
     $$141 = $0; //@line 5321
     $$143 = $1; //@line 5321
     $31 = $14; //@line 5321
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5324
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5327
   $$1 = $$139 + $$143 | 0; //@line 5329
  }
 } while (0);
 return $$1 | 0; //@line 5332
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5140
 STACKTOP = STACKTOP + 16 | 0; //@line 5141
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5141
 $2 = sp; //@line 5142
 $3 = $1 & 255; //@line 5143
 HEAP8[$2 >> 0] = $3; //@line 5144
 $4 = $0 + 16 | 0; //@line 5145
 $5 = HEAP32[$4 >> 2] | 0; //@line 5146
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 5153
   label = 4; //@line 5154
  } else {
   $$0 = -1; //@line 5156
  }
 } else {
  $12 = $5; //@line 5159
  label = 4; //@line 5160
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 5164
   $10 = HEAP32[$9 >> 2] | 0; //@line 5165
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 5168
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 5175
     HEAP8[$10 >> 0] = $3; //@line 5176
     $$0 = $13; //@line 5177
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5182
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5183
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 5184
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 37; //@line 5187
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 5189
    sp = STACKTOP; //@line 5190
    STACKTOP = sp; //@line 5191
    return 0; //@line 5191
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 5193
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 5198
   } else {
    $$0 = -1; //@line 5200
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5204
 return $$0 | 0; //@line 5204
}
function _fflush__async_cb_25($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10404
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10406
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 10408
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 10412
  } else {
   $$02327 = $$02325; //@line 10414
   $$02426 = $AsyncRetVal; //@line 10414
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 10421
    } else {
     $16 = 0; //@line 10423
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 10435
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 10438
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 10441
     break L3;
    } else {
     $$02327 = $$023; //@line 10444
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 10447
   $13 = ___fflush_unlocked($$02327) | 0; //@line 10448
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 10452
    ___async_unwind = 0; //@line 10453
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 41; //@line 10455
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 10457
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 10459
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 10461
   sp = STACKTOP; //@line 10462
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 10466
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 10468
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 11296
 value = value & 255; //@line 11298
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 11301
   ptr = ptr + 1 | 0; //@line 11302
  }
  aligned_end = end & -4 | 0; //@line 11305
  block_aligned_end = aligned_end - 64 | 0; //@line 11306
  value4 = value | value << 8 | value << 16 | value << 24; //@line 11307
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 11310
   HEAP32[ptr + 4 >> 2] = value4; //@line 11311
   HEAP32[ptr + 8 >> 2] = value4; //@line 11312
   HEAP32[ptr + 12 >> 2] = value4; //@line 11313
   HEAP32[ptr + 16 >> 2] = value4; //@line 11314
   HEAP32[ptr + 20 >> 2] = value4; //@line 11315
   HEAP32[ptr + 24 >> 2] = value4; //@line 11316
   HEAP32[ptr + 28 >> 2] = value4; //@line 11317
   HEAP32[ptr + 32 >> 2] = value4; //@line 11318
   HEAP32[ptr + 36 >> 2] = value4; //@line 11319
   HEAP32[ptr + 40 >> 2] = value4; //@line 11320
   HEAP32[ptr + 44 >> 2] = value4; //@line 11321
   HEAP32[ptr + 48 >> 2] = value4; //@line 11322
   HEAP32[ptr + 52 >> 2] = value4; //@line 11323
   HEAP32[ptr + 56 >> 2] = value4; //@line 11324
   HEAP32[ptr + 60 >> 2] = value4; //@line 11325
   ptr = ptr + 64 | 0; //@line 11326
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 11330
   ptr = ptr + 4 | 0; //@line 11331
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 11336
  ptr = ptr + 1 | 0; //@line 11337
 }
 return end - num | 0; //@line 11339
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10305
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 10315
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 10315
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 10315
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 10319
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 10322
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 10325
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 10333
  } else {
   $20 = 0; //@line 10335
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 10345
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 10349
  HEAP32[___async_retval >> 2] = $$1; //@line 10351
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 10354
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 10355
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 10359
  ___async_unwind = 0; //@line 10360
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 41; //@line 10362
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 10364
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 10366
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 10368
 sp = STACKTOP; //@line 10369
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10130
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10132
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10134
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10136
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 10141
  } else {
   $9 = $4 + 4 | 0; //@line 10143
   $10 = HEAP32[$9 >> 2] | 0; //@line 10144
   $11 = $4 + 8 | 0; //@line 10145
   $12 = HEAP32[$11 >> 2] | 0; //@line 10146
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 10150
    HEAP32[$6 >> 2] = 0; //@line 10151
    HEAP32[$2 >> 2] = 0; //@line 10152
    HEAP32[$11 >> 2] = 0; //@line 10153
    HEAP32[$9 >> 2] = 0; //@line 10154
    $$0 = 0; //@line 10155
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 10162
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10163
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 10164
   if (!___async) {
    ___async_unwind = 0; //@line 10167
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 43; //@line 10169
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 10171
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 10173
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 10175
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 10177
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 10179
   sp = STACKTOP; //@line 10180
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 10185
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_26($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10559
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10561
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10563
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10565
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10567
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 10572
  return;
 }
 dest = $2 + 4 | 0; //@line 10576
 stop = dest + 52 | 0; //@line 10576
 do {
  HEAP32[dest >> 2] = 0; //@line 10576
  dest = dest + 4 | 0; //@line 10576
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 10577
 HEAP32[$2 + 8 >> 2] = $4; //@line 10579
 HEAP32[$2 + 12 >> 2] = -1; //@line 10581
 HEAP32[$2 + 48 >> 2] = 1; //@line 10583
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 10586
 $16 = HEAP32[$6 >> 2] | 0; //@line 10587
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 10588
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 10589
 if (!___async) {
  ___async_unwind = 0; //@line 10592
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 10594
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 10596
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 10598
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 10600
 sp = STACKTOP; //@line 10601
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 8406
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 8411
    $$0 = 1; //@line 8412
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 8425
     $$0 = 1; //@line 8426
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8430
     $$0 = -1; //@line 8431
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 8441
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 8445
    $$0 = 2; //@line 8446
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 8458
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 8464
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 8468
    $$0 = 3; //@line 8469
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 8479
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 8485
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 8491
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 8495
    $$0 = 4; //@line 8496
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8500
    $$0 = -1; //@line 8501
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8506
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 7290
  $8 = $0; //@line 7290
  $9 = $1; //@line 7290
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7292
   $$0914 = $$0914 + -1 | 0; //@line 7296
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 7297
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7298
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 7306
   }
  }
  $$010$lcssa$off0 = $8; //@line 7311
  $$09$lcssa = $$0914; //@line 7311
 } else {
  $$010$lcssa$off0 = $0; //@line 7313
  $$09$lcssa = $2; //@line 7313
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 7317
 } else {
  $$012 = $$010$lcssa$off0; //@line 7319
  $$111 = $$09$lcssa; //@line 7319
  while (1) {
   $26 = $$111 + -1 | 0; //@line 7324
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 7325
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 7329
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 7332
    $$111 = $26; //@line 7332
   }
  }
 }
 return $$1$lcssa | 0; //@line 7336
}
function _main__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9582
 _BSP_LCD_Init() | 0; //@line 9583
 $2 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 9585
 if ((_BSP_TS_Init($2, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9591
  _puts(12229) | 0; //@line 9592
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 32; //@line 9595
   sp = STACKTOP; //@line 9596
   return;
  }
  ___async_unwind = 0; //@line 9599
  HEAP32[$ReallocAsyncCtx >> 2] = 32; //@line 9600
  sp = STACKTOP; //@line 9601
  return;
 }
 _BSP_LCD_Clear(-1); //@line 9604
 _BSP_LCD_SetTextColor(2016); //@line 9605
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 9608
 _BSP_LCD_SetTextColor(0); //@line 9609
 _BSP_LCD_SetBackColor(2016); //@line 9610
 _BSP_LCD_SetFont(104); //@line 9611
 _BSP_LCD_DisplayStringAt(0, 15, 12247, 1); //@line 9612
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 9613
 _BSP_TS_GetState(15480) | 0; //@line 9614
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 33; //@line 9617
  sp = STACKTOP; //@line 9618
  return;
 }
 ___async_unwind = 0; //@line 9621
 HEAP32[$ReallocAsyncCtx4 >> 2] = 33; //@line 9622
 sp = STACKTOP; //@line 9623
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 4906
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 4911
   label = 4; //@line 4912
  } else {
   $$01519 = $0; //@line 4914
   $23 = $1; //@line 4914
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 4919
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 4922
    $23 = $6; //@line 4923
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 4927
     label = 4; //@line 4928
     break;
    } else {
     $$01519 = $6; //@line 4931
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 4937
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 4939
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 4947
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 4955
  } else {
   $$pn = $$0; //@line 4957
   while (1) {
    $19 = $$pn + 1 | 0; //@line 4959
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 4963
     break;
    } else {
     $$pn = $19; //@line 4966
    }
   }
  }
  $$sink = $$1$lcssa; //@line 4971
 }
 return $$sink - $1 | 0; //@line 4974
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 9040
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 9047
   $10 = $1 + 16 | 0; //@line 9048
   $11 = HEAP32[$10 >> 2] | 0; //@line 9049
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 9052
    HEAP32[$1 + 24 >> 2] = $4; //@line 9054
    HEAP32[$1 + 36 >> 2] = 1; //@line 9056
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 9066
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 9071
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 9074
    HEAP8[$1 + 54 >> 0] = 1; //@line 9076
    break;
   }
   $21 = $1 + 24 | 0; //@line 9079
   $22 = HEAP32[$21 >> 2] | 0; //@line 9080
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 9083
    $28 = $4; //@line 9084
   } else {
    $28 = $22; //@line 9086
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 9095
   }
  }
 } while (0);
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8695
 $1 = HEAP32[30] | 0; //@line 8696
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 8702
 } else {
  $19 = 0; //@line 8704
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 8710
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 8716
    $12 = HEAP32[$11 >> 2] | 0; //@line 8717
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 8723
     HEAP8[$12 >> 0] = 10; //@line 8724
     $22 = 0; //@line 8725
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 8729
   $17 = ___overflow($1, 10) | 0; //@line 8730
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 46; //@line 8733
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 8735
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 8737
    sp = STACKTOP; //@line 8738
    return 0; //@line 8739
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8741
    $22 = $17 >> 31; //@line 8743
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 8750
 }
 return $22 | 0; //@line 8752
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10226
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10228
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10230
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10234
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 10238
  label = 4; //@line 10239
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 10244
   label = 4; //@line 10245
  } else {
   $$037$off039 = 3; //@line 10247
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 10251
  $17 = $8 + 40 | 0; //@line 10252
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 10255
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 10265
    $$037$off039 = $$037$off038; //@line 10266
   } else {
    $$037$off039 = $$037$off038; //@line 10268
   }
  } else {
   $$037$off039 = $$037$off038; //@line 10271
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 10274
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 8899
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 8908
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 8913
      HEAP32[$13 >> 2] = $2; //@line 8914
      $19 = $1 + 40 | 0; //@line 8915
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 8918
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 8928
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 8932
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 8939
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
 $$016 = 0; //@line 8526
 while (1) {
  if ((HEAPU8[12798 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 8533
   break;
  }
  $7 = $$016 + 1 | 0; //@line 8536
  if (($7 | 0) == 87) {
   $$01214 = 12886; //@line 8539
   $$115 = 87; //@line 8539
   label = 5; //@line 8540
   break;
  } else {
   $$016 = $7; //@line 8543
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 12886; //@line 8549
  } else {
   $$01214 = 12886; //@line 8551
   $$115 = $$016; //@line 8551
   label = 5; //@line 8552
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 8557
   $$113 = $$01214; //@line 8558
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 8562
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 8569
   if (!$$115) {
    $$012$lcssa = $$113; //@line 8572
    break;
   } else {
    $$01214 = $$113; //@line 8575
    label = 5; //@line 8576
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 8583
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10802
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10804
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10806
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10808
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10810
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[3720] | 0)) {
  _serial_init(14884, 2, 3); //@line 10818
 }
 $12 = HEAP8[$6 >> 0] | 0; //@line 10821
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10822
 _serial_putc(14884, $12); //@line 10823
 if (!___async) {
  ___async_unwind = 0; //@line 10826
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 10828
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 10830
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 10832
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 10834
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 10836
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 10838
 sp = STACKTOP; //@line 10839
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 529
 $2 = $0 + 12 | 0; //@line 531
 $3 = HEAP32[$2 >> 2] | 0; //@line 532
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 536
   _mbed_assert_internal(823, 828, 528); //@line 537
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 27; //@line 540
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 542
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 544
    sp = STACKTOP; //@line 545
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 548
    $8 = HEAP32[$2 >> 2] | 0; //@line 550
    break;
   }
  } else {
   $8 = $3; //@line 554
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 557
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 559
 FUNCTION_TABLE_vi[$7 & 63]($0); //@line 560
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 563
  sp = STACKTOP; //@line 564
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 567
  return;
 }
}
function _main__async_cb_4($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9643
 if (!(HEAP8[15480] | 0)) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 9647
  _BSP_TS_GetState(15480) | 0; //@line 9648
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 33; //@line 9651
   sp = STACKTOP; //@line 9652
   return;
  }
  ___async_unwind = 0; //@line 9655
  HEAP32[$ReallocAsyncCtx4 >> 2] = 33; //@line 9656
  sp = STACKTOP; //@line 9657
  return;
 } else {
  $3 = HEAP16[7741] | 0; //@line 9660
  $4 = HEAP16[7743] | 0; //@line 9661
  _BSP_LCD_SetTextColor(-2048); //@line 9662
  _BSP_LCD_FillCircle($3, $4, 5); //@line 9663
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 9664
  _wait_ms(10); //@line 9665
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 34; //@line 9668
   sp = STACKTOP; //@line 9669
   return;
  }
  ___async_unwind = 0; //@line 9672
  HEAP32[$ReallocAsyncCtx3 >> 2] = 34; //@line 9673
  sp = STACKTOP; //@line 9674
  return;
 }
}
function _mbed_error_printf__async_cb_29($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10846
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10850
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10852
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10854
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10856
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 10857
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $14 = HEAP8[$10 + $12 >> 0] | 0; //@line 10864
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10865
 _serial_putc(14884, $14); //@line 10866
 if (!___async) {
  ___async_unwind = 0; //@line 10869
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 10871
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 10873
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 10875
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 10877
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 10879
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 10881
 sp = STACKTOP; //@line 10882
 return;
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8357
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8357
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8358
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 8359
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 8368
    $$016 = $9; //@line 8371
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 8371
   } else {
    $$016 = $0; //@line 8373
    $storemerge = 0; //@line 8373
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 8375
   $$0 = $$016; //@line 8376
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 8380
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 8386
   HEAP32[tempDoublePtr >> 2] = $2; //@line 8389
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 8389
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 8390
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10478
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10486
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10488
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10490
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10492
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10494
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10496
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10498
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 10509
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 10510
 HEAP32[$10 >> 2] = 0; //@line 10511
 HEAP32[$12 >> 2] = 0; //@line 10512
 HEAP32[$14 >> 2] = 0; //@line 10513
 HEAP32[$2 >> 2] = 0; //@line 10514
 $33 = HEAP32[$16 >> 2] | 0; //@line 10515
 HEAP32[$16 >> 2] = $33 | $18; //@line 10520
 if ($20 | 0) {
  ___unlockfile($22); //@line 10523
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 10526
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9463
 STACKTOP = STACKTOP + 16 | 0; //@line 9464
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9464
 $3 = sp; //@line 9465
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 9467
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 9470
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9471
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 9472
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 55; //@line 9475
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9477
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9479
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9481
  sp = STACKTOP; //@line 9482
  STACKTOP = sp; //@line 9483
  return 0; //@line 9483
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9485
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 9489
 }
 STACKTOP = sp; //@line 9491
 return $8 & 1 | 0; //@line 9491
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9255
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9261
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 9264
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 9267
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 9268
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 9269
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 51; //@line 9272
    sp = STACKTOP; //@line 9273
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9276
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
 sp = STACKTOP; //@line 9424
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9430
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 9433
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 9436
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 9437
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 9438
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 54; //@line 9441
    sp = STACKTOP; //@line 9442
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9445
    break;
   }
  }
 } while (0);
 return;
}
function ___dynamic_cast__async_cb_28($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10698
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10700
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10702
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10708
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 10723
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 10739
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 10744
    break;
   }
  default:
   {
    $$0 = 0; //@line 10748
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 10753
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 7355
 STACKTOP = STACKTOP + 256 | 0; //@line 7356
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 7356
 $5 = sp; //@line 7357
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 7363
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 7367
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 7370
   $$011 = $9; //@line 7371
   do {
    _out_670($0, $5, 256); //@line 7373
    $$011 = $$011 + -256 | 0; //@line 7374
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 7383
  } else {
   $$0$lcssa = $9; //@line 7385
  }
  _out_670($0, $5, $$0$lcssa); //@line 7387
 }
 STACKTOP = sp; //@line 7389
 return;
}
function _BSP_LCD_Clear($0) {
 $0 = $0 | 0;
 var $$011 = 0, $$07$i = 0, $1 = 0, $14 = 0, $3 = 0, $4 = 0, $6 = 0, $7 = 0;
 $1 = HEAP32[3867] | 0; //@line 740
 HEAP32[3867] = $0 & 65535; //@line 742
 $3 = _ST7789H2_GetLcdPixelHeight() | 0; //@line 743
 $4 = $3 & 65535; //@line 744
 if (!($3 << 16 >> 16)) {
  $14 = $1 & 65535; //@line 747
  HEAP32[3867] = $14; //@line 748
  return;
 } else {
  $$011 = 0; //@line 751
 }
 do {
  $6 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 754
  $7 = $6 & 65535; //@line 755
  if ($6 << 16 >> 16) {
   $$07$i = 0; //@line 758
   do {
    _emscripten_asm_const_iiii(5, $$07$i | 0, $$011 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 762
    $$07$i = $$07$i + 1 | 0; //@line 763
   } while (($$07$i | 0) != ($7 | 0));
  }
  $$011 = $$011 + 1 | 0; //@line 772
 } while (($$011 | 0) != ($4 | 0));
 $14 = $1 & 65535; //@line 780
 HEAP32[3867] = $14; //@line 781
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4764
 STACKTOP = STACKTOP + 32 | 0; //@line 4765
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4765
 $vararg_buffer = sp; //@line 4766
 $3 = sp + 20 | 0; //@line 4767
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4771
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4773
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4775
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4777
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4779
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4784
  $10 = -1; //@line 4785
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4788
 }
 STACKTOP = sp; //@line 4790
 return $10 | 0; //@line 4790
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 50
 STACKTOP = STACKTOP + 16 | 0; //@line 51
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 51
 $vararg_buffer = sp; //@line 52
 HEAP32[$vararg_buffer >> 2] = $0; //@line 53
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 55
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 57
 _mbed_error_printf(700, $vararg_buffer); //@line 58
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 59
 _mbed_die(); //@line 60
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 6; //@line 63
  sp = STACKTOP; //@line 64
  STACKTOP = sp; //@line 65
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 67
  STACKTOP = sp; //@line 68
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 8977
 $5 = HEAP32[$4 >> 2] | 0; //@line 8978
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 8982
   HEAP32[$1 + 24 >> 2] = $3; //@line 8984
   HEAP32[$1 + 36 >> 2] = 1; //@line 8986
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 8990
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 8993
    HEAP32[$1 + 24 >> 2] = 2; //@line 8995
    HEAP8[$1 + 54 >> 0] = 1; //@line 8997
    break;
   }
   $10 = $1 + 24 | 0; //@line 9000
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 9004
   }
  }
 } while (0);
 return;
}
function _BSP_TS_GetState($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1371
 $1 = _emscripten_asm_const_i(6) | 0; //@line 1372
 $2 = _emscripten_asm_const_i(7) | 0; //@line 1373
 $3 = ($1 | 0) != -1; //@line 1374
 $4 = ($2 | 0) != -1; //@line 1375
 HEAP8[$0 >> 0] = $3 & $4 & 1; //@line 1378
 if ($3) {
  HEAP16[$0 + 2 >> 1] = $1; //@line 1382
 }
 if ($4) {
  HEAP16[$0 + 6 >> 1] = $2; //@line 1387
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1389
 _wait_ms(1); //@line 1390
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 30; //@line 1393
  sp = STACKTOP; //@line 1394
  return 0; //@line 1395
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1397
  return 0; //@line 1398
 }
 return 0; //@line 1400
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9556
 _BSP_LCD_Clear(-1); //@line 9557
 _BSP_LCD_SetTextColor(2016); //@line 9558
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 9561
 _BSP_LCD_SetTextColor(0); //@line 9562
 _BSP_LCD_SetBackColor(2016); //@line 9563
 _BSP_LCD_SetFont(104); //@line 9564
 _BSP_LCD_DisplayStringAt(0, 15, 12247, 1); //@line 9565
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 9566
 _BSP_TS_GetState(15480) | 0; //@line 9567
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 33; //@line 9570
  sp = STACKTOP; //@line 9571
  return;
 }
 ___async_unwind = 0; //@line 9574
 HEAP32[$ReallocAsyncCtx4 >> 2] = 33; //@line 9575
 sp = STACKTOP; //@line 9576
 return;
}
function _BSP_LCD_FillRect($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $$04 = 0, $$07$i = 0, $6 = 0, $8 = 0, $9 = 0;
 HEAP32[3867] = HEAP32[3867] & 65535; //@line 794
 $6 = $2 & 65535; //@line 795
 $8 = $0 & 65535; //@line 797
 if (!($2 << 16 >> 16)) {
  return;
 } else {
  $$0 = $3; //@line 801
  $$04 = $1; //@line 801
 }
 while (1) {
  $9 = $$04 & 65535; //@line 804
  $$07$i = 0; //@line 805
  do {
   _emscripten_asm_const_iiii(5, $$07$i + $8 & 65535 | 0, $9 | 0, HEAP32[3867] & 65535 | 0) | 0; //@line 811
   $$07$i = $$07$i + 1 | 0; //@line 812
  } while (($$07$i | 0) != ($6 | 0));
  if (!($$0 << 16 >> 16)) {
   break;
  } else {
   $$0 = $$0 + -1 << 16 >> 16; //@line 826
   $$04 = $$04 + 1 << 16 >> 16; //@line 826
  }
 }
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 4871
 $3 = HEAP8[$1 >> 0] | 0; //@line 4872
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 4877
  $$lcssa8 = $2; //@line 4877
 } else {
  $$011 = $1; //@line 4879
  $$0710 = $0; //@line 4879
  do {
   $$0710 = $$0710 + 1 | 0; //@line 4881
   $$011 = $$011 + 1 | 0; //@line 4882
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 4883
   $9 = HEAP8[$$011 >> 0] | 0; //@line 4884
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 4889
  $$lcssa8 = $8; //@line 4889
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 4899
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 10048
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10050
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10052
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 10053
 _wait_ms(150); //@line 10054
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 10057
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 10058
  HEAP32[$4 >> 2] = $2; //@line 10059
  sp = STACKTOP; //@line 10060
  return;
 }
 ___async_unwind = 0; //@line 10063
 HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 10064
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 10065
 HEAP32[$4 >> 2] = $2; //@line 10066
 sp = STACKTOP; //@line 10067
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 10023
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10025
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10027
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 10028
 _wait_ms(150); //@line 10029
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 10032
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 10033
  HEAP32[$4 >> 2] = $2; //@line 10034
  sp = STACKTOP; //@line 10035
  return;
 }
 ___async_unwind = 0; //@line 10038
 HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 10039
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 10040
 HEAP32[$4 >> 2] = $2; //@line 10041
 sp = STACKTOP; //@line 10042
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 9998
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10000
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10002
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 10003
 _wait_ms(150); //@line 10004
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 10007
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 10008
  HEAP32[$4 >> 2] = $2; //@line 10009
  sp = STACKTOP; //@line 10010
  return;
 }
 ___async_unwind = 0; //@line 10013
 HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 10014
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 10015
 HEAP32[$4 >> 2] = $2; //@line 10016
 sp = STACKTOP; //@line 10017
 return;
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 10098
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10100
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10102
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 10103
 _wait_ms(150); //@line 10104
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 10107
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 10108
  HEAP32[$4 >> 2] = $2; //@line 10109
  sp = STACKTOP; //@line 10110
  return;
 }
 ___async_unwind = 0; //@line 10113
 HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 10114
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 10115
 HEAP32[$4 >> 2] = $2; //@line 10116
 sp = STACKTOP; //@line 10117
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 10073
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10075
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10077
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 10078
 _wait_ms(150); //@line 10079
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 10082
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 10083
  HEAP32[$4 >> 2] = $2; //@line 10084
  sp = STACKTOP; //@line 10085
  return;
 }
 ___async_unwind = 0; //@line 10088
 HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 10089
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 10090
 HEAP32[$4 >> 2] = $2; //@line 10091
 sp = STACKTOP; //@line 10092
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4823
 STACKTOP = STACKTOP + 32 | 0; //@line 4824
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4824
 $vararg_buffer = sp; //@line 4825
 HEAP32[$0 + 36 >> 2] = 5; //@line 4828
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4836
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4838
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4840
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4845
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4848
 STACKTOP = sp; //@line 4849
 return $14 | 0; //@line 4849
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 501
 $2 = HEAP32[30] | 0; //@line 502
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 503
 _putc($1, $2) | 0; //@line 504
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 25; //@line 507
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 509
  sp = STACKTOP; //@line 510
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 513
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 514
 _fflush($2) | 0; //@line 515
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 518
  sp = STACKTOP; //@line 519
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 522
  return;
 }
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 9973
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9975
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9977
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 9978
 _wait_ms(150); //@line 9979
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 9982
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9983
  HEAP32[$4 >> 2] = $2; //@line 9984
  sp = STACKTOP; //@line 9985
  return;
 }
 ___async_unwind = 0; //@line 9988
 HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 9989
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9990
 HEAP32[$4 >> 2] = $2; //@line 9991
 sp = STACKTOP; //@line 9992
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 9723
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9725
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9727
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 9728
 _wait_ms(150); //@line 9729
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 9732
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 9733
  HEAP32[$4 >> 2] = $2; //@line 9734
  sp = STACKTOP; //@line 9735
  return;
 }
 ___async_unwind = 0; //@line 9738
 HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 9739
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 9740
 HEAP32[$4 >> 2] = $2; //@line 9741
 sp = STACKTOP; //@line 9742
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 9948
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9950
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9952
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 9953
 _wait_ms(150); //@line 9954
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 9957
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 9958
  HEAP32[$4 >> 2] = $2; //@line 9959
  sp = STACKTOP; //@line 9960
  return;
 }
 ___async_unwind = 0; //@line 9963
 HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 9964
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 9965
 HEAP32[$4 >> 2] = $2; //@line 9966
 sp = STACKTOP; //@line 9967
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 9923
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9925
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9927
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 9928
 _wait_ms(400); //@line 9929
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 9932
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 9933
  HEAP32[$4 >> 2] = $2; //@line 9934
  sp = STACKTOP; //@line 9935
  return;
 }
 ___async_unwind = 0; //@line 9938
 HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 9939
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 9940
 HEAP32[$4 >> 2] = $2; //@line 9941
 sp = STACKTOP; //@line 9942
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 9898
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9900
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9902
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 9903
 _wait_ms(400); //@line 9904
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 9907
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 9908
  HEAP32[$4 >> 2] = $2; //@line 9909
  sp = STACKTOP; //@line 9910
  return;
 }
 ___async_unwind = 0; //@line 9913
 HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 9914
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 9915
 HEAP32[$4 >> 2] = $2; //@line 9916
 sp = STACKTOP; //@line 9917
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 9873
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9875
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9877
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 9878
 _wait_ms(400); //@line 9879
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 9882
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 9883
  HEAP32[$4 >> 2] = $2; //@line 9884
  sp = STACKTOP; //@line 9885
  return;
 }
 ___async_unwind = 0; //@line 9888
 HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 9889
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 9890
 HEAP32[$4 >> 2] = $2; //@line 9891
 sp = STACKTOP; //@line 9892
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 9848
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9850
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9852
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 9853
 _wait_ms(400); //@line 9854
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 9857
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 9858
  HEAP32[$4 >> 2] = $2; //@line 9859
  sp = STACKTOP; //@line 9860
  return;
 }
 ___async_unwind = 0; //@line 9863
 HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 9864
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 9865
 HEAP32[$4 >> 2] = $2; //@line 9866
 sp = STACKTOP; //@line 9867
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9823
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9825
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9827
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 9828
 _wait_ms(400); //@line 9829
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 9832
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 9833
  HEAP32[$4 >> 2] = $2; //@line 9834
  sp = STACKTOP; //@line 9835
  return;
 }
 ___async_unwind = 0; //@line 9838
 HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 9839
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 9840
 HEAP32[$4 >> 2] = $2; //@line 9841
 sp = STACKTOP; //@line 9842
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9798
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9800
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9802
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 9803
 _wait_ms(400); //@line 9804
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 9807
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 9808
  HEAP32[$4 >> 2] = $2; //@line 9809
  sp = STACKTOP; //@line 9810
  return;
 }
 ___async_unwind = 0; //@line 9813
 HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 9814
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 9815
 HEAP32[$4 >> 2] = $2; //@line 9816
 sp = STACKTOP; //@line 9817
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9773
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9775
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9777
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 9778
 _wait_ms(400); //@line 9779
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 9782
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 9783
  HEAP32[$4 >> 2] = $2; //@line 9784
  sp = STACKTOP; //@line 9785
  return;
 }
 ___async_unwind = 0; //@line 9788
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 9789
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 9790
 HEAP32[$4 >> 2] = $2; //@line 9791
 sp = STACKTOP; //@line 9792
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9748
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9750
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9752
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 9753
 _wait_ms(400); //@line 9754
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 9757
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 9758
  HEAP32[$4 >> 2] = $2; //@line 9759
  sp = STACKTOP; //@line 9760
  return;
 }
 ___async_unwind = 0; //@line 9763
 HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 9764
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 9765
 HEAP32[$4 >> 2] = $2; //@line 9766
 sp = STACKTOP; //@line 9767
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 11347
 newDynamicTop = oldDynamicTop + increment | 0; //@line 11348
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 11352
  ___setErrNo(12); //@line 11353
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 11357
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 11361
   ___setErrNo(12); //@line 11362
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 11366
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 4994
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 4996
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5002
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5003
  if ($phitmp) {
   $13 = $11; //@line 5005
  } else {
   ___unlockfile($3); //@line 5007
   $13 = $11; //@line 5008
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5012
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5016
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5019
 }
 return $15 | 0; //@line 5021
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7216
 } else {
  $$056 = $2; //@line 7218
  $15 = $1; //@line 7218
  $8 = $0; //@line 7218
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7226
   HEAP8[$14 >> 0] = HEAPU8[12780 + ($8 & 15) >> 0] | 0 | $3; //@line 7227
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7228
   $15 = tempRet0; //@line 7229
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7234
    break;
   } else {
    $$056 = $14; //@line 7237
   }
  }
 }
 return $$05$lcssa | 0; //@line 7241
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 5211
 $3 = HEAP8[$1 >> 0] | 0; //@line 5213
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 5217
 $7 = HEAP32[$0 >> 2] | 0; //@line 5218
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 5223
  HEAP32[$0 + 4 >> 2] = 0; //@line 5225
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 5227
  HEAP32[$0 + 28 >> 2] = $14; //@line 5229
  HEAP32[$0 + 20 >> 2] = $14; //@line 5231
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5237
  $$0 = 0; //@line 5238
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 5241
  $$0 = -1; //@line 5242
 }
 return $$0 | 0; //@line 5244
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7253
 } else {
  $$06 = $2; //@line 7255
  $11 = $1; //@line 7255
  $7 = $0; //@line 7255
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7260
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7261
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7262
   $11 = tempRet0; //@line 7263
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 7268
    break;
   } else {
    $$06 = $10; //@line 7271
   }
  }
 }
 return $$0$lcssa | 0; //@line 7275
}
function _invoke_ticker__async_cb_27($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10643
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 10649
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 10650
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 10651
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 10652
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 10655
  sp = STACKTOP; //@line 10656
  return;
 }
 ___async_unwind = 0; //@line 10659
 HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 10660
 sp = STACKTOP; //@line 10661
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9496
 do {
  if (!$0) {
   $3 = 0; //@line 9500
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 9502
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 9503
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 56; //@line 9506
    sp = STACKTOP; //@line 9507
    return 0; //@line 9508
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9510
    $3 = ($2 | 0) != 0 & 1; //@line 9513
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 9518
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 6897
 } else {
  $$04 = 0; //@line 6899
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 6902
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 6906
   $12 = $7 + 1 | 0; //@line 6907
   HEAP32[$0 >> 2] = $12; //@line 6908
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 6914
    break;
   } else {
    $$04 = $11; //@line 6917
   }
  }
 }
 return $$0$lcssa | 0; //@line 6921
}
function ___fflush_unlocked__async_cb_21($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10195
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10197
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10199
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10201
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 10203
 HEAP32[$4 >> 2] = 0; //@line 10204
 HEAP32[$6 >> 2] = 0; //@line 10205
 HEAP32[$8 >> 2] = 0; //@line 10206
 HEAP32[$10 >> 2] = 0; //@line 10207
 HEAP32[___async_retval >> 2] = 0; //@line 10209
 return;
}
function _ft6x06_Init($0) {
 $0 = $0 | 0;
 var $$05$i6$ph = 0, $1 = 0, $2 = 0, $5 = 0;
 $1 = $0 & 65535; //@line 601
 $2 = HEAP8[15490] | 0; //@line 602
 do {
  if (($2 & 255 | 0) != ($1 | 0)) {
   $5 = HEAP8[15491] | 0; //@line 607
   if (($5 & 255 | 0) != ($1 | 0)) {
    if (!($2 << 24 >> 24)) {
     $$05$i6$ph = 0; //@line 613
    } else {
     if (!($5 << 24 >> 24)) {
      $$05$i6$ph = 1; //@line 617
     } else {
      break;
     }
    }
    HEAP8[15490 + $$05$i6$ph >> 0] = $0; //@line 624
   }
  }
 } while (0);
 return;
}
function _serial_putc__async_cb_1($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9529
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9531
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9532
 _fflush($2) | 0; //@line 9533
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 26; //@line 9536
  sp = STACKTOP; //@line 9537
  return;
 }
 ___async_unwind = 0; //@line 9540
 HEAP32[$ReallocAsyncCtx >> 2] = 26; //@line 9541
 sp = STACKTOP; //@line 9542
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 11198
 ___async_unwind = 1; //@line 11199
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 11205
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 11209
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 11213
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 11215
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4634
 STACKTOP = STACKTOP + 16 | 0; //@line 4635
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4635
 $vararg_buffer = sp; //@line 4636
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4640
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4642
 STACKTOP = sp; //@line 4643
 return $5 | 0; //@line 4643
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 11140
 STACKTOP = STACKTOP + 16 | 0; //@line 11141
 $rem = __stackBase__ | 0; //@line 11142
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 11143
 STACKTOP = __stackBase__; //@line 11144
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 11145
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 10910
 if ((ret | 0) < 8) return ret | 0; //@line 10911
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 10912
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 10913
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 10914
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 10915
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 10916
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 8881
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 8679
 $6 = HEAP32[$5 >> 2] | 0; //@line 8680
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 8681
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 8683
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 8685
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 8688
 return $2 | 0; //@line 8689
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10534
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 10545
  $$0 = 1; //@line 10546
 } else {
  $$0 = 0; //@line 10548
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 10552
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10620
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 10623
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 10628
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 10631
 return;
}
function _BSP_LCD_Init() {
 var $$0$i = 0;
 HEAP32[3868] = 65535; //@line 679
 HEAP32[3869] = 112; //@line 680
 HEAP32[3867] = 0; //@line 681
 _BSP_LCD_MspInit(); //@line 682
 if ((_ST7789H2_ReadID() | 0) << 16 >> 16 != 133) {
  $$0$i = 1; //@line 686
  return $$0$i | 0; //@line 687
 }
 _emscripten_asm_const_i(4) | 0; //@line 689
 HEAP32[3869] = 96; //@line 690
 $$0$i = 0; //@line 691
 return $$0$i | 0; //@line 692
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 8957
 }
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 480
 HEAP32[$0 >> 2] = $1; //@line 481
 HEAP32[3720] = 1; //@line 482
 $4 = $0; //@line 483
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 488
 $10 = 14884; //@line 489
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 491
 HEAP32[$10 + 4 >> 2] = $9; //@line 494
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 584
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 585
 _emscripten_sleep($0 | 0); //@line 586
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 29; //@line 589
  sp = STACKTOP; //@line 590
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 593
  return;
 }
}
function _main__async_cb_3($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9629
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 9630
 _BSP_TS_GetState(15480) | 0; //@line 9631
 if (!___async) {
  ___async_unwind = 0; //@line 9634
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 33; //@line 9636
 sp = STACKTOP; //@line 9637
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 9021
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 9025
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 11174
 HEAP32[new_frame + 4 >> 2] = sp; //@line 11176
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 11178
 ___async_cur_frame = new_frame; //@line 11179
 return ___async_cur_frame + 8 | 0; //@line 11180
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 10768
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 10772
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 10775
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 11163
  return low << bits; //@line 11164
 }
 tempRet0 = low << bits - 32; //@line 11166
 return 0; //@line 11167
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 11152
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 11153
 }
 tempRet0 = 0; //@line 11155
 return high >>> bits - 32 | 0; //@line 11156
}
function _fflush__async_cb_23($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10382
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 10384
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 10387
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 9711
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 9714
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 9717
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 10790
 } else {
  $$0 = -1; //@line 10792
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 10795
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 5341
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 5347
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 5351
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 11408
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 11186
 stackRestore(___async_cur_frame | 0); //@line 11187
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 11188
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9685
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 9686
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9688
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8338
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8338
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8340
 return $1 | 0; //@line 8341
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 10903
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 10904
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 10905
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4800
  $$0 = -1; //@line 4801
 } else {
  $$0 = $0; //@line 4803
 }
 return $$0 | 0; //@line 4805
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 456
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 462
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 463
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 10895
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 10897
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 11401
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 11394
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 7398
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 7401
 }
 return $$0 | 0; //@line 7403
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 11380
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 11132
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 10684
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 4981
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 4985
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 11193
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 11194
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
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 5477
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 5479
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9243
 __ZdlPv($0); //@line 9244
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 8771
 __ZdlPv($0); //@line 8772
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 10298
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
  ___fwritex($1, $2, $0) | 0; //@line 6883
 }
 return;
}
function b23(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 11463
}
function b22(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 11460
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 8968
}
function _ST7789H2_ReadID() {
 _LCD_IO_WriteReg(4); //@line 645
 _LCD_IO_ReadData() | 0; //@line 646
 return (_LCD_IO_ReadData() | 0) & 255 | 0; //@line 649
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 11220
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_22($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b20(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 11457
}
function b19(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 11454
}
function _fflush__async_cb_24($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 10397
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 7346
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 11373
}
function _putc__async_cb_5($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9698
 return;
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 11421
 return 0; //@line 11421
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 11418
 return 0; //@line 11418
}
function b3(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 11415
 return 0; //@line 11415
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 11387
}
function b17(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 11451
}
function b16(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 11448
}
function _LCD_IO_WriteReg($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(2, $0 & 255 | 0) | 0; //@line 666
 return;
}
function _BSP_TS_Init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _ft6x06_Init(0); //@line 1365
 return 0; //@line 1366
}
function _BSP_TS_GetState__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[___async_retval >> 0] = 0; //@line 9550
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 8591
}
function _BSP_LCD_SetTextColor($0) {
 $0 = $0 | 0;
 HEAP32[3867] = $0 & 65535; //@line 725
 return;
}
function _BSP_LCD_SetBackColor($0) {
 $0 = $0 | 0;
 HEAP32[3868] = $0 & 65535; //@line 733
 return;
}
function _BSP_LCD_GetYSize() {
 return (_ST7789H2_GetLcdPixelHeight() | 0) & 65535 | 0; //@line 718
}
function _BSP_LCD_GetXSize() {
 return (_ST7789H2_GetLcdPixelWidth() | 0) & 65535 | 0; //@line 711
}
function _LCD_IO_ReadData() {
 return (_emscripten_asm_const_i(3) | 0) & 65535 | 0; //@line 674
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 4858
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 11412
 return 0; //@line 11412
}
function _BSP_LCD_SetFont($0) {
 $0 = $0 | 0;
 HEAP32[3869] = $0; //@line 703
 return;
}
function ___ofl_lock() {
 ___lock(15456); //@line 5484
 return 15464; //@line 5485
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
 return _pthread_self() | 0; //@line 8512
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 8518
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 8758
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
 ___unlock(15456); //@line 5490
 return;
}
function _ST7789H2_GetLcdPixelHeight() {
 return 240; //@line 659
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(63); //@line 11445
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(62); //@line 11442
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(61); //@line 11439
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(60); //@line 11436
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_vi(59); //@line 11433
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4816
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5133
}
function _ST7789H2_GetLcdPixelWidth() {
 return 240; //@line 654
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_vi(58); //@line 11430
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_vi(57); //@line 11427
}
function b7(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 11424
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___errno_location() {
 return 15452; //@line 4810
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
 return 252; //@line 4863
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
var FUNCTION_TABLE_iiii = [b3,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b4,b5];
var FUNCTION_TABLE_vi = [b7,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_assert_internal__async_cb,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_printf__async_cb_29,_serial_putc__async_cb_1,_serial_putc__async_cb,_invoke_ticker__async_cb_27,_invoke_ticker__async_cb
,_wait_ms__async_cb,_BSP_TS_GetState__async_cb,_main__async_cb_2,_main__async_cb,_main__async_cb_4,_main__async_cb_3,_putc__async_cb_5,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_24,_fflush__async_cb_23,_fflush__async_cb_25,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_21,_vfprintf__async_cb,_vsnprintf__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_26,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_28,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_22,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b8,b9
,b10,b11,b12,b13,b14];
var FUNCTION_TABLE_viiii = [b16,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b17];
var FUNCTION_TABLE_viiiii = [b19,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b20];
var FUNCTION_TABLE_viiiiii = [b22,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b23];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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






//# sourceMappingURL=touchscreen.js.map
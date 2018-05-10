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
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5680;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "trace.js.mem";





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
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_handle_lora_downlink__async_cb", "__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_42", "__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_41", "__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_40", "__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_1", "_mbed_vtracef__async_cb_2", "_mbed_vtracef__async_cb_3", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_4", "_mbed_vtracef__async_cb_9", "_mbed_vtracef__async_cb_5", "_mbed_vtracef__async_cb_6", "_mbed_vtracef__async_cb_7", "_mbed_vtracef__async_cb_8", "_mbed_trace_array__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb_28", "_mbed_die__async_cb_27", "_mbed_die__async_cb_26", "_mbed_die__async_cb_25", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_17", "_mbed_error_vfprintf__async_cb_16", "_serial_putc__async_cb_18", "_serial_putc__async_cb", "_invoke_ticker__async_cb_23", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_main__async_cb", "_putc__async_cb_24", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_21", "_fflush__async_cb_20", "_fflush__async_cb_22", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_13", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_printf__async_cb", "_putchar__async_cb", "_fputc__async_cb_12", "_fputc__async_cb", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_15", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_19", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
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
 sp = STACKTOP; //@line 1823
 STACKTOP = STACKTOP + 16 | 0; //@line 1824
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1824
 $1 = sp; //@line 1825
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1832
   $7 = $6 >>> 3; //@line 1833
   $8 = HEAP32[1017] | 0; //@line 1834
   $9 = $8 >>> $7; //@line 1835
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1841
    $16 = 4108 + ($14 << 1 << 2) | 0; //@line 1843
    $17 = $16 + 8 | 0; //@line 1844
    $18 = HEAP32[$17 >> 2] | 0; //@line 1845
    $19 = $18 + 8 | 0; //@line 1846
    $20 = HEAP32[$19 >> 2] | 0; //@line 1847
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1017] = $8 & ~(1 << $14); //@line 1854
     } else {
      if ((HEAP32[1021] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1859
      }
      $27 = $20 + 12 | 0; //@line 1862
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1866
       HEAP32[$17 >> 2] = $20; //@line 1867
       break;
      } else {
       _abort(); //@line 1870
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1875
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1878
    $34 = $18 + $30 + 4 | 0; //@line 1880
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1883
    $$0 = $19; //@line 1884
    STACKTOP = sp; //@line 1885
    return $$0 | 0; //@line 1885
   }
   $37 = HEAP32[1019] | 0; //@line 1887
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1893
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1896
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1899
     $49 = $47 >>> 12 & 16; //@line 1901
     $50 = $47 >>> $49; //@line 1902
     $52 = $50 >>> 5 & 8; //@line 1904
     $54 = $50 >>> $52; //@line 1906
     $56 = $54 >>> 2 & 4; //@line 1908
     $58 = $54 >>> $56; //@line 1910
     $60 = $58 >>> 1 & 2; //@line 1912
     $62 = $58 >>> $60; //@line 1914
     $64 = $62 >>> 1 & 1; //@line 1916
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1919
     $69 = 4108 + ($67 << 1 << 2) | 0; //@line 1921
     $70 = $69 + 8 | 0; //@line 1922
     $71 = HEAP32[$70 >> 2] | 0; //@line 1923
     $72 = $71 + 8 | 0; //@line 1924
     $73 = HEAP32[$72 >> 2] | 0; //@line 1925
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1931
       HEAP32[1017] = $77; //@line 1932
       $98 = $77; //@line 1933
      } else {
       if ((HEAP32[1021] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1938
       }
       $80 = $73 + 12 | 0; //@line 1941
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1945
        HEAP32[$70 >> 2] = $73; //@line 1946
        $98 = $8; //@line 1947
        break;
       } else {
        _abort(); //@line 1950
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1955
     $84 = $83 - $6 | 0; //@line 1956
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1959
     $87 = $71 + $6 | 0; //@line 1960
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1963
     HEAP32[$71 + $83 >> 2] = $84; //@line 1965
     if ($37 | 0) {
      $92 = HEAP32[1022] | 0; //@line 1968
      $93 = $37 >>> 3; //@line 1969
      $95 = 4108 + ($93 << 1 << 2) | 0; //@line 1971
      $96 = 1 << $93; //@line 1972
      if (!($98 & $96)) {
       HEAP32[1017] = $98 | $96; //@line 1977
       $$0199 = $95; //@line 1979
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1979
      } else {
       $101 = $95 + 8 | 0; //@line 1981
       $102 = HEAP32[$101 >> 2] | 0; //@line 1982
       if ((HEAP32[1021] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1986
       } else {
        $$0199 = $102; //@line 1989
        $$pre$phiZ2D = $101; //@line 1989
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1992
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1994
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1996
      HEAP32[$92 + 12 >> 2] = $95; //@line 1998
     }
     HEAP32[1019] = $84; //@line 2000
     HEAP32[1022] = $87; //@line 2001
     $$0 = $72; //@line 2002
     STACKTOP = sp; //@line 2003
     return $$0 | 0; //@line 2003
    }
    $108 = HEAP32[1018] | 0; //@line 2005
    if (!$108) {
     $$0197 = $6; //@line 2008
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2012
     $114 = $112 >>> 12 & 16; //@line 2014
     $115 = $112 >>> $114; //@line 2015
     $117 = $115 >>> 5 & 8; //@line 2017
     $119 = $115 >>> $117; //@line 2019
     $121 = $119 >>> 2 & 4; //@line 2021
     $123 = $119 >>> $121; //@line 2023
     $125 = $123 >>> 1 & 2; //@line 2025
     $127 = $123 >>> $125; //@line 2027
     $129 = $127 >>> 1 & 1; //@line 2029
     $134 = HEAP32[4372 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2034
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2038
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2044
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2047
      $$0193$lcssa$i = $138; //@line 2047
     } else {
      $$01926$i = $134; //@line 2049
      $$01935$i = $138; //@line 2049
      $146 = $143; //@line 2049
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2054
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2055
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2056
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2057
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2063
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2066
        $$0193$lcssa$i = $$$0193$i; //@line 2066
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2069
        $$01935$i = $$$0193$i; //@line 2069
       }
      }
     }
     $157 = HEAP32[1021] | 0; //@line 2073
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2076
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2079
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2082
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2086
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2088
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2092
       $176 = HEAP32[$175 >> 2] | 0; //@line 2093
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2096
        $179 = HEAP32[$178 >> 2] | 0; //@line 2097
        if (!$179) {
         $$3$i = 0; //@line 2100
         break;
        } else {
         $$1196$i = $179; //@line 2103
         $$1198$i = $178; //@line 2103
        }
       } else {
        $$1196$i = $176; //@line 2106
        $$1198$i = $175; //@line 2106
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2109
        $182 = HEAP32[$181 >> 2] | 0; //@line 2110
        if ($182 | 0) {
         $$1196$i = $182; //@line 2113
         $$1198$i = $181; //@line 2113
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2116
        $185 = HEAP32[$184 >> 2] | 0; //@line 2117
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2122
         $$1198$i = $184; //@line 2122
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2127
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2130
        $$3$i = $$1196$i; //@line 2131
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2136
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2139
       }
       $169 = $167 + 12 | 0; //@line 2142
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2146
       }
       $172 = $164 + 8 | 0; //@line 2149
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2153
        HEAP32[$172 >> 2] = $167; //@line 2154
        $$3$i = $164; //@line 2155
        break;
       } else {
        _abort(); //@line 2158
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2167
       $191 = 4372 + ($190 << 2) | 0; //@line 2168
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2173
         if (!$$3$i) {
          HEAP32[1018] = $108 & ~(1 << $190); //@line 2179
          break L73;
         }
        } else {
         if ((HEAP32[1021] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2186
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2194
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1021] | 0; //@line 2204
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 2207
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 2211
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 2213
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 2219
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2223
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2225
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2231
       if ($214 | 0) {
        if ((HEAP32[1021] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2237
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2241
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2243
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2251
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2254
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2256
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2259
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2263
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2266
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2268
      if ($37 | 0) {
       $234 = HEAP32[1022] | 0; //@line 2271
       $235 = $37 >>> 3; //@line 2272
       $237 = 4108 + ($235 << 1 << 2) | 0; //@line 2274
       $238 = 1 << $235; //@line 2275
       if (!($8 & $238)) {
        HEAP32[1017] = $8 | $238; //@line 2280
        $$0189$i = $237; //@line 2282
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2282
       } else {
        $242 = $237 + 8 | 0; //@line 2284
        $243 = HEAP32[$242 >> 2] | 0; //@line 2285
        if ((HEAP32[1021] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2289
        } else {
         $$0189$i = $243; //@line 2292
         $$pre$phi$iZ2D = $242; //@line 2292
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2295
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2297
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2299
       HEAP32[$234 + 12 >> 2] = $237; //@line 2301
      }
      HEAP32[1019] = $$0193$lcssa$i; //@line 2303
      HEAP32[1022] = $159; //@line 2304
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2307
     STACKTOP = sp; //@line 2308
     return $$0 | 0; //@line 2308
    }
   } else {
    $$0197 = $6; //@line 2311
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2316
   } else {
    $251 = $0 + 11 | 0; //@line 2318
    $252 = $251 & -8; //@line 2319
    $253 = HEAP32[1018] | 0; //@line 2320
    if (!$253) {
     $$0197 = $252; //@line 2323
    } else {
     $255 = 0 - $252 | 0; //@line 2325
     $256 = $251 >>> 8; //@line 2326
     if (!$256) {
      $$0358$i = 0; //@line 2329
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2333
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2337
       $262 = $256 << $261; //@line 2338
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2341
       $267 = $262 << $265; //@line 2343
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2346
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2351
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2357
      }
     }
     $282 = HEAP32[4372 + ($$0358$i << 2) >> 2] | 0; //@line 2361
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2365
       $$3$i203 = 0; //@line 2365
       $$3350$i = $255; //@line 2365
       label = 81; //@line 2366
      } else {
       $$0342$i = 0; //@line 2373
       $$0347$i = $255; //@line 2373
       $$0353$i = $282; //@line 2373
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2373
       $$0362$i = 0; //@line 2373
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2378
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2383
          $$435113$i = 0; //@line 2383
          $$435712$i = $$0353$i; //@line 2383
          label = 85; //@line 2384
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2387
          $$1348$i = $292; //@line 2387
         }
        } else {
         $$1343$i = $$0342$i; //@line 2390
         $$1348$i = $$0347$i; //@line 2390
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2393
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2396
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2400
        $302 = ($$0353$i | 0) == 0; //@line 2401
        if ($302) {
         $$2355$i = $$1363$i; //@line 2406
         $$3$i203 = $$1343$i; //@line 2406
         $$3350$i = $$1348$i; //@line 2406
         label = 81; //@line 2407
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2410
         $$0347$i = $$1348$i; //@line 2410
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2410
         $$0362$i = $$1363$i; //@line 2410
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2420
       $309 = $253 & ($306 | 0 - $306); //@line 2423
       if (!$309) {
        $$0197 = $252; //@line 2426
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2431
       $315 = $313 >>> 12 & 16; //@line 2433
       $316 = $313 >>> $315; //@line 2434
       $318 = $316 >>> 5 & 8; //@line 2436
       $320 = $316 >>> $318; //@line 2438
       $322 = $320 >>> 2 & 4; //@line 2440
       $324 = $320 >>> $322; //@line 2442
       $326 = $324 >>> 1 & 2; //@line 2444
       $328 = $324 >>> $326; //@line 2446
       $330 = $328 >>> 1 & 1; //@line 2448
       $$4$ph$i = 0; //@line 2454
       $$4357$ph$i = HEAP32[4372 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2454
      } else {
       $$4$ph$i = $$3$i203; //@line 2456
       $$4357$ph$i = $$2355$i; //@line 2456
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2460
       $$4351$lcssa$i = $$3350$i; //@line 2460
      } else {
       $$414$i = $$4$ph$i; //@line 2462
       $$435113$i = $$3350$i; //@line 2462
       $$435712$i = $$4357$ph$i; //@line 2462
       label = 85; //@line 2463
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2468
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2472
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2473
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2474
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2475
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2481
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2484
        $$4351$lcssa$i = $$$4351$i; //@line 2484
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2487
        $$435113$i = $$$4351$i; //@line 2487
        label = 85; //@line 2488
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2494
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1019] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1021] | 0; //@line 2500
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2503
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2506
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2509
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2513
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2515
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2519
         $371 = HEAP32[$370 >> 2] | 0; //@line 2520
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2523
          $374 = HEAP32[$373 >> 2] | 0; //@line 2524
          if (!$374) {
           $$3372$i = 0; //@line 2527
           break;
          } else {
           $$1370$i = $374; //@line 2530
           $$1374$i = $373; //@line 2530
          }
         } else {
          $$1370$i = $371; //@line 2533
          $$1374$i = $370; //@line 2533
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2536
          $377 = HEAP32[$376 >> 2] | 0; //@line 2537
          if ($377 | 0) {
           $$1370$i = $377; //@line 2540
           $$1374$i = $376; //@line 2540
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2543
          $380 = HEAP32[$379 >> 2] | 0; //@line 2544
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2549
           $$1374$i = $379; //@line 2549
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2554
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2557
          $$3372$i = $$1370$i; //@line 2558
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2563
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2566
         }
         $364 = $362 + 12 | 0; //@line 2569
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2573
         }
         $367 = $359 + 8 | 0; //@line 2576
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2580
          HEAP32[$367 >> 2] = $362; //@line 2581
          $$3372$i = $359; //@line 2582
          break;
         } else {
          _abort(); //@line 2585
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2593
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2596
         $386 = 4372 + ($385 << 2) | 0; //@line 2597
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2602
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2607
            HEAP32[1018] = $391; //@line 2608
            $475 = $391; //@line 2609
            break L164;
           }
          } else {
           if ((HEAP32[1021] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2616
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2624
            if (!$$3372$i) {
             $475 = $253; //@line 2627
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1021] | 0; //@line 2635
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2638
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2642
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2644
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2650
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2654
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2656
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2662
         if (!$409) {
          $475 = $253; //@line 2665
         } else {
          if ((HEAP32[1021] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2670
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2674
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2676
           $475 = $253; //@line 2677
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2686
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2689
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2691
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2694
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2698
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2701
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2703
         $428 = $$4351$lcssa$i >>> 3; //@line 2704
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4108 + ($428 << 1 << 2) | 0; //@line 2708
          $432 = HEAP32[1017] | 0; //@line 2709
          $433 = 1 << $428; //@line 2710
          if (!($432 & $433)) {
           HEAP32[1017] = $432 | $433; //@line 2715
           $$0368$i = $431; //@line 2717
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2717
          } else {
           $437 = $431 + 8 | 0; //@line 2719
           $438 = HEAP32[$437 >> 2] | 0; //@line 2720
           if ((HEAP32[1021] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2724
           } else {
            $$0368$i = $438; //@line 2727
            $$pre$phi$i211Z2D = $437; //@line 2727
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2730
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2732
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2734
          HEAP32[$354 + 12 >> 2] = $431; //@line 2736
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2739
         if (!$444) {
          $$0361$i = 0; //@line 2742
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2746
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2750
           $450 = $444 << $449; //@line 2751
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2754
           $455 = $450 << $453; //@line 2756
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2759
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2764
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2770
          }
         }
         $469 = 4372 + ($$0361$i << 2) | 0; //@line 2773
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2775
         $471 = $354 + 16 | 0; //@line 2776
         HEAP32[$471 + 4 >> 2] = 0; //@line 2778
         HEAP32[$471 >> 2] = 0; //@line 2779
         $473 = 1 << $$0361$i; //@line 2780
         if (!($475 & $473)) {
          HEAP32[1018] = $475 | $473; //@line 2785
          HEAP32[$469 >> 2] = $354; //@line 2786
          HEAP32[$354 + 24 >> 2] = $469; //@line 2788
          HEAP32[$354 + 12 >> 2] = $354; //@line 2790
          HEAP32[$354 + 8 >> 2] = $354; //@line 2792
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2801
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2801
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2808
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2812
          $494 = HEAP32[$492 >> 2] | 0; //@line 2814
          if (!$494) {
           label = 136; //@line 2817
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2820
           $$0345$i = $494; //@line 2820
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1021] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2827
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2830
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2832
           HEAP32[$354 + 12 >> 2] = $354; //@line 2834
           HEAP32[$354 + 8 >> 2] = $354; //@line 2836
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2841
          $502 = HEAP32[$501 >> 2] | 0; //@line 2842
          $503 = HEAP32[1021] | 0; //@line 2843
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2849
           HEAP32[$501 >> 2] = $354; //@line 2850
           HEAP32[$354 + 8 >> 2] = $502; //@line 2852
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2854
           HEAP32[$354 + 24 >> 2] = 0; //@line 2856
           break;
          } else {
           _abort(); //@line 2859
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2866
       STACKTOP = sp; //@line 2867
       return $$0 | 0; //@line 2867
      } else {
       $$0197 = $252; //@line 2869
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1019] | 0; //@line 2876
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2879
  $515 = HEAP32[1022] | 0; //@line 2880
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2883
   HEAP32[1022] = $517; //@line 2884
   HEAP32[1019] = $514; //@line 2885
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2888
   HEAP32[$515 + $512 >> 2] = $514; //@line 2890
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2893
  } else {
   HEAP32[1019] = 0; //@line 2895
   HEAP32[1022] = 0; //@line 2896
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2899
   $526 = $515 + $512 + 4 | 0; //@line 2901
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2904
  }
  $$0 = $515 + 8 | 0; //@line 2907
  STACKTOP = sp; //@line 2908
  return $$0 | 0; //@line 2908
 }
 $530 = HEAP32[1020] | 0; //@line 2910
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2913
  HEAP32[1020] = $532; //@line 2914
  $533 = HEAP32[1023] | 0; //@line 2915
  $534 = $533 + $$0197 | 0; //@line 2916
  HEAP32[1023] = $534; //@line 2917
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2920
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2923
  $$0 = $533 + 8 | 0; //@line 2925
  STACKTOP = sp; //@line 2926
  return $$0 | 0; //@line 2926
 }
 if (!(HEAP32[1135] | 0)) {
  HEAP32[1137] = 4096; //@line 2931
  HEAP32[1136] = 4096; //@line 2932
  HEAP32[1138] = -1; //@line 2933
  HEAP32[1139] = -1; //@line 2934
  HEAP32[1140] = 0; //@line 2935
  HEAP32[1128] = 0; //@line 2936
  HEAP32[1135] = $1 & -16 ^ 1431655768; //@line 2940
  $548 = 4096; //@line 2941
 } else {
  $548 = HEAP32[1137] | 0; //@line 2944
 }
 $545 = $$0197 + 48 | 0; //@line 2946
 $546 = $$0197 + 47 | 0; //@line 2947
 $547 = $548 + $546 | 0; //@line 2948
 $549 = 0 - $548 | 0; //@line 2949
 $550 = $547 & $549; //@line 2950
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2953
  STACKTOP = sp; //@line 2954
  return $$0 | 0; //@line 2954
 }
 $552 = HEAP32[1127] | 0; //@line 2956
 if ($552 | 0) {
  $554 = HEAP32[1125] | 0; //@line 2959
  $555 = $554 + $550 | 0; //@line 2960
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2965
   STACKTOP = sp; //@line 2966
   return $$0 | 0; //@line 2966
  }
 }
 L244 : do {
  if (!(HEAP32[1128] & 4)) {
   $561 = HEAP32[1023] | 0; //@line 2974
   L246 : do {
    if (!$561) {
     label = 163; //@line 2978
    } else {
     $$0$i$i = 4516; //@line 2980
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2982
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2985
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2994
      if (!$570) {
       label = 163; //@line 2997
       break L246;
      } else {
       $$0$i$i = $570; //@line 3000
      }
     }
     $595 = $547 - $530 & $549; //@line 3004
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3007
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3015
       } else {
        $$723947$i = $595; //@line 3017
        $$748$i = $597; //@line 3017
        label = 180; //@line 3018
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3022
       $$2253$ph$i = $595; //@line 3022
       label = 171; //@line 3023
      }
     } else {
      $$2234243136$i = 0; //@line 3026
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3032
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3035
     } else {
      $574 = $572; //@line 3037
      $575 = HEAP32[1136] | 0; //@line 3038
      $576 = $575 + -1 | 0; //@line 3039
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3047
      $584 = HEAP32[1125] | 0; //@line 3048
      $585 = $$$i + $584 | 0; //@line 3049
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1127] | 0; //@line 3054
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3061
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3065
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3068
        $$748$i = $572; //@line 3068
        label = 180; //@line 3069
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3072
        $$2253$ph$i = $$$i; //@line 3072
        label = 171; //@line 3073
       }
      } else {
       $$2234243136$i = 0; //@line 3076
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3083
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3092
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3095
       $$748$i = $$2247$ph$i; //@line 3095
       label = 180; //@line 3096
       break L244;
      }
     }
     $607 = HEAP32[1137] | 0; //@line 3100
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3104
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3107
      $$748$i = $$2247$ph$i; //@line 3107
      label = 180; //@line 3108
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3114
      $$2234243136$i = 0; //@line 3115
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3119
      $$748$i = $$2247$ph$i; //@line 3119
      label = 180; //@line 3120
      break L244;
     }
    }
   } while (0);
   HEAP32[1128] = HEAP32[1128] | 4; //@line 3127
   $$4236$i = $$2234243136$i; //@line 3128
   label = 178; //@line 3129
  } else {
   $$4236$i = 0; //@line 3131
   label = 178; //@line 3132
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3138
   $621 = _sbrk(0) | 0; //@line 3139
   $627 = $621 - $620 | 0; //@line 3147
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3149
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3157
    $$748$i = $620; //@line 3157
    label = 180; //@line 3158
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1125] | 0) + $$723947$i | 0; //@line 3164
  HEAP32[1125] = $633; //@line 3165
  if ($633 >>> 0 > (HEAP32[1126] | 0) >>> 0) {
   HEAP32[1126] = $633; //@line 3169
  }
  $636 = HEAP32[1023] | 0; //@line 3171
  do {
   if (!$636) {
    $638 = HEAP32[1021] | 0; //@line 3175
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1021] = $$748$i; //@line 3180
    }
    HEAP32[1129] = $$748$i; //@line 3182
    HEAP32[1130] = $$723947$i; //@line 3183
    HEAP32[1132] = 0; //@line 3184
    HEAP32[1026] = HEAP32[1135]; //@line 3186
    HEAP32[1025] = -1; //@line 3187
    HEAP32[1030] = 4108; //@line 3188
    HEAP32[1029] = 4108; //@line 3189
    HEAP32[1032] = 4116; //@line 3190
    HEAP32[1031] = 4116; //@line 3191
    HEAP32[1034] = 4124; //@line 3192
    HEAP32[1033] = 4124; //@line 3193
    HEAP32[1036] = 4132; //@line 3194
    HEAP32[1035] = 4132; //@line 3195
    HEAP32[1038] = 4140; //@line 3196
    HEAP32[1037] = 4140; //@line 3197
    HEAP32[1040] = 4148; //@line 3198
    HEAP32[1039] = 4148; //@line 3199
    HEAP32[1042] = 4156; //@line 3200
    HEAP32[1041] = 4156; //@line 3201
    HEAP32[1044] = 4164; //@line 3202
    HEAP32[1043] = 4164; //@line 3203
    HEAP32[1046] = 4172; //@line 3204
    HEAP32[1045] = 4172; //@line 3205
    HEAP32[1048] = 4180; //@line 3206
    HEAP32[1047] = 4180; //@line 3207
    HEAP32[1050] = 4188; //@line 3208
    HEAP32[1049] = 4188; //@line 3209
    HEAP32[1052] = 4196; //@line 3210
    HEAP32[1051] = 4196; //@line 3211
    HEAP32[1054] = 4204; //@line 3212
    HEAP32[1053] = 4204; //@line 3213
    HEAP32[1056] = 4212; //@line 3214
    HEAP32[1055] = 4212; //@line 3215
    HEAP32[1058] = 4220; //@line 3216
    HEAP32[1057] = 4220; //@line 3217
    HEAP32[1060] = 4228; //@line 3218
    HEAP32[1059] = 4228; //@line 3219
    HEAP32[1062] = 4236; //@line 3220
    HEAP32[1061] = 4236; //@line 3221
    HEAP32[1064] = 4244; //@line 3222
    HEAP32[1063] = 4244; //@line 3223
    HEAP32[1066] = 4252; //@line 3224
    HEAP32[1065] = 4252; //@line 3225
    HEAP32[1068] = 4260; //@line 3226
    HEAP32[1067] = 4260; //@line 3227
    HEAP32[1070] = 4268; //@line 3228
    HEAP32[1069] = 4268; //@line 3229
    HEAP32[1072] = 4276; //@line 3230
    HEAP32[1071] = 4276; //@line 3231
    HEAP32[1074] = 4284; //@line 3232
    HEAP32[1073] = 4284; //@line 3233
    HEAP32[1076] = 4292; //@line 3234
    HEAP32[1075] = 4292; //@line 3235
    HEAP32[1078] = 4300; //@line 3236
    HEAP32[1077] = 4300; //@line 3237
    HEAP32[1080] = 4308; //@line 3238
    HEAP32[1079] = 4308; //@line 3239
    HEAP32[1082] = 4316; //@line 3240
    HEAP32[1081] = 4316; //@line 3241
    HEAP32[1084] = 4324; //@line 3242
    HEAP32[1083] = 4324; //@line 3243
    HEAP32[1086] = 4332; //@line 3244
    HEAP32[1085] = 4332; //@line 3245
    HEAP32[1088] = 4340; //@line 3246
    HEAP32[1087] = 4340; //@line 3247
    HEAP32[1090] = 4348; //@line 3248
    HEAP32[1089] = 4348; //@line 3249
    HEAP32[1092] = 4356; //@line 3250
    HEAP32[1091] = 4356; //@line 3251
    $642 = $$723947$i + -40 | 0; //@line 3252
    $644 = $$748$i + 8 | 0; //@line 3254
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3259
    $650 = $$748$i + $649 | 0; //@line 3260
    $651 = $642 - $649 | 0; //@line 3261
    HEAP32[1023] = $650; //@line 3262
    HEAP32[1020] = $651; //@line 3263
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3266
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3269
    HEAP32[1024] = HEAP32[1139]; //@line 3271
   } else {
    $$024367$i = 4516; //@line 3273
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3275
     $658 = $$024367$i + 4 | 0; //@line 3276
     $659 = HEAP32[$658 >> 2] | 0; //@line 3277
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3281
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3285
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3290
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3304
       $673 = (HEAP32[1020] | 0) + $$723947$i | 0; //@line 3306
       $675 = $636 + 8 | 0; //@line 3308
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3313
       $681 = $636 + $680 | 0; //@line 3314
       $682 = $673 - $680 | 0; //@line 3315
       HEAP32[1023] = $681; //@line 3316
       HEAP32[1020] = $682; //@line 3317
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3320
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3323
       HEAP32[1024] = HEAP32[1139]; //@line 3325
       break;
      }
     }
    }
    $688 = HEAP32[1021] | 0; //@line 3330
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1021] = $$748$i; //@line 3333
     $753 = $$748$i; //@line 3334
    } else {
     $753 = $688; //@line 3336
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3338
    $$124466$i = 4516; //@line 3339
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3344
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3348
     if (!$694) {
      $$0$i$i$i = 4516; //@line 3351
      break;
     } else {
      $$124466$i = $694; //@line 3354
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3363
      $700 = $$124466$i + 4 | 0; //@line 3364
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3367
      $704 = $$748$i + 8 | 0; //@line 3369
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3375
      $712 = $690 + 8 | 0; //@line 3377
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3383
      $722 = $710 + $$0197 | 0; //@line 3387
      $723 = $718 - $710 - $$0197 | 0; //@line 3388
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3391
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1020] | 0) + $723 | 0; //@line 3396
        HEAP32[1020] = $728; //@line 3397
        HEAP32[1023] = $722; //@line 3398
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3401
       } else {
        if ((HEAP32[1022] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1019] | 0) + $723 | 0; //@line 3407
         HEAP32[1019] = $734; //@line 3408
         HEAP32[1022] = $722; //@line 3409
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3412
         HEAP32[$722 + $734 >> 2] = $734; //@line 3414
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3418
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3422
         $743 = $739 >>> 3; //@line 3423
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3428
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3430
           $750 = 4108 + ($743 << 1 << 2) | 0; //@line 3432
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3438
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3447
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1017] = HEAP32[1017] & ~(1 << $743); //@line 3457
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3464
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3468
             }
             $764 = $748 + 8 | 0; //@line 3471
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3475
              break;
             }
             _abort(); //@line 3478
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3483
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3484
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3487
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3489
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3493
             $783 = $782 + 4 | 0; //@line 3494
             $784 = HEAP32[$783 >> 2] | 0; //@line 3495
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3498
              if (!$786) {
               $$3$i$i = 0; //@line 3501
               break;
              } else {
               $$1291$i$i = $786; //@line 3504
               $$1293$i$i = $782; //@line 3504
              }
             } else {
              $$1291$i$i = $784; //@line 3507
              $$1293$i$i = $783; //@line 3507
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3510
              $789 = HEAP32[$788 >> 2] | 0; //@line 3511
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3514
               $$1293$i$i = $788; //@line 3514
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3517
              $792 = HEAP32[$791 >> 2] | 0; //@line 3518
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3523
               $$1293$i$i = $791; //@line 3523
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3528
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3531
              $$3$i$i = $$1291$i$i; //@line 3532
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3537
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3540
             }
             $776 = $774 + 12 | 0; //@line 3543
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3547
             }
             $779 = $771 + 8 | 0; //@line 3550
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3554
              HEAP32[$779 >> 2] = $774; //@line 3555
              $$3$i$i = $771; //@line 3556
              break;
             } else {
              _abort(); //@line 3559
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3569
           $798 = 4372 + ($797 << 2) | 0; //@line 3570
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3575
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1018] = HEAP32[1018] & ~(1 << $797); //@line 3584
             break L311;
            } else {
             if ((HEAP32[1021] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3590
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3598
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1021] | 0; //@line 3608
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3611
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3615
           $815 = $718 + 16 | 0; //@line 3616
           $816 = HEAP32[$815 >> 2] | 0; //@line 3617
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3623
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3627
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3629
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3635
           if (!$822) {
            break;
           }
           if ((HEAP32[1021] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3643
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3647
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3649
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3656
         $$0287$i$i = $742 + $723 | 0; //@line 3656
        } else {
         $$0$i17$i = $718; //@line 3658
         $$0287$i$i = $723; //@line 3658
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3660
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3663
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3666
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3668
        $836 = $$0287$i$i >>> 3; //@line 3669
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4108 + ($836 << 1 << 2) | 0; //@line 3673
         $840 = HEAP32[1017] | 0; //@line 3674
         $841 = 1 << $836; //@line 3675
         do {
          if (!($840 & $841)) {
           HEAP32[1017] = $840 | $841; //@line 3681
           $$0295$i$i = $839; //@line 3683
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3683
          } else {
           $845 = $839 + 8 | 0; //@line 3685
           $846 = HEAP32[$845 >> 2] | 0; //@line 3686
           if ((HEAP32[1021] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3690
            $$pre$phi$i19$iZ2D = $845; //@line 3690
            break;
           }
           _abort(); //@line 3693
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3697
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3699
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3701
         HEAP32[$722 + 12 >> 2] = $839; //@line 3703
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3706
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3710
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3714
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3719
          $858 = $852 << $857; //@line 3720
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3723
          $863 = $858 << $861; //@line 3725
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3728
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3733
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3739
         }
        } while (0);
        $877 = 4372 + ($$0296$i$i << 2) | 0; //@line 3742
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3744
        $879 = $722 + 16 | 0; //@line 3745
        HEAP32[$879 + 4 >> 2] = 0; //@line 3747
        HEAP32[$879 >> 2] = 0; //@line 3748
        $881 = HEAP32[1018] | 0; //@line 3749
        $882 = 1 << $$0296$i$i; //@line 3750
        if (!($881 & $882)) {
         HEAP32[1018] = $881 | $882; //@line 3755
         HEAP32[$877 >> 2] = $722; //@line 3756
         HEAP32[$722 + 24 >> 2] = $877; //@line 3758
         HEAP32[$722 + 12 >> 2] = $722; //@line 3760
         HEAP32[$722 + 8 >> 2] = $722; //@line 3762
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3771
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3771
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3778
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3782
         $902 = HEAP32[$900 >> 2] | 0; //@line 3784
         if (!$902) {
          label = 260; //@line 3787
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3790
          $$0289$i$i = $902; //@line 3790
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1021] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3797
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3800
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3802
          HEAP32[$722 + 12 >> 2] = $722; //@line 3804
          HEAP32[$722 + 8 >> 2] = $722; //@line 3806
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3811
         $910 = HEAP32[$909 >> 2] | 0; //@line 3812
         $911 = HEAP32[1021] | 0; //@line 3813
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3819
          HEAP32[$909 >> 2] = $722; //@line 3820
          HEAP32[$722 + 8 >> 2] = $910; //@line 3822
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3824
          HEAP32[$722 + 24 >> 2] = 0; //@line 3826
          break;
         } else {
          _abort(); //@line 3829
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3836
      STACKTOP = sp; //@line 3837
      return $$0 | 0; //@line 3837
     } else {
      $$0$i$i$i = 4516; //@line 3839
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3843
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3848
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3856
    }
    $927 = $923 + -47 | 0; //@line 3858
    $929 = $927 + 8 | 0; //@line 3860
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3866
    $936 = $636 + 16 | 0; //@line 3867
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3869
    $939 = $938 + 8 | 0; //@line 3870
    $940 = $938 + 24 | 0; //@line 3871
    $941 = $$723947$i + -40 | 0; //@line 3872
    $943 = $$748$i + 8 | 0; //@line 3874
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3879
    $949 = $$748$i + $948 | 0; //@line 3880
    $950 = $941 - $948 | 0; //@line 3881
    HEAP32[1023] = $949; //@line 3882
    HEAP32[1020] = $950; //@line 3883
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3886
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3889
    HEAP32[1024] = HEAP32[1139]; //@line 3891
    $956 = $938 + 4 | 0; //@line 3892
    HEAP32[$956 >> 2] = 27; //@line 3893
    HEAP32[$939 >> 2] = HEAP32[1129]; //@line 3894
    HEAP32[$939 + 4 >> 2] = HEAP32[1130]; //@line 3894
    HEAP32[$939 + 8 >> 2] = HEAP32[1131]; //@line 3894
    HEAP32[$939 + 12 >> 2] = HEAP32[1132]; //@line 3894
    HEAP32[1129] = $$748$i; //@line 3895
    HEAP32[1130] = $$723947$i; //@line 3896
    HEAP32[1132] = 0; //@line 3897
    HEAP32[1131] = $939; //@line 3898
    $958 = $940; //@line 3899
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3901
     HEAP32[$958 >> 2] = 7; //@line 3902
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3915
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3918
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3921
     HEAP32[$938 >> 2] = $964; //@line 3922
     $969 = $964 >>> 3; //@line 3923
     if ($964 >>> 0 < 256) {
      $972 = 4108 + ($969 << 1 << 2) | 0; //@line 3927
      $973 = HEAP32[1017] | 0; //@line 3928
      $974 = 1 << $969; //@line 3929
      if (!($973 & $974)) {
       HEAP32[1017] = $973 | $974; //@line 3934
       $$0211$i$i = $972; //@line 3936
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3936
      } else {
       $978 = $972 + 8 | 0; //@line 3938
       $979 = HEAP32[$978 >> 2] | 0; //@line 3939
       if ((HEAP32[1021] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3943
       } else {
        $$0211$i$i = $979; //@line 3946
        $$pre$phi$i$iZ2D = $978; //@line 3946
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3949
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3951
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3953
      HEAP32[$636 + 12 >> 2] = $972; //@line 3955
      break;
     }
     $985 = $964 >>> 8; //@line 3958
     if (!$985) {
      $$0212$i$i = 0; //@line 3961
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3965
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3969
       $991 = $985 << $990; //@line 3970
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3973
       $996 = $991 << $994; //@line 3975
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3978
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3983
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3989
      }
     }
     $1010 = 4372 + ($$0212$i$i << 2) | 0; //@line 3992
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3994
     HEAP32[$636 + 20 >> 2] = 0; //@line 3996
     HEAP32[$936 >> 2] = 0; //@line 3997
     $1013 = HEAP32[1018] | 0; //@line 3998
     $1014 = 1 << $$0212$i$i; //@line 3999
     if (!($1013 & $1014)) {
      HEAP32[1018] = $1013 | $1014; //@line 4004
      HEAP32[$1010 >> 2] = $636; //@line 4005
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4007
      HEAP32[$636 + 12 >> 2] = $636; //@line 4009
      HEAP32[$636 + 8 >> 2] = $636; //@line 4011
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4020
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4020
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4027
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4031
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4033
      if (!$1034) {
       label = 286; //@line 4036
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4039
       $$0207$i$i = $1034; //@line 4039
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1021] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4046
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4049
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4051
       HEAP32[$636 + 12 >> 2] = $636; //@line 4053
       HEAP32[$636 + 8 >> 2] = $636; //@line 4055
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4060
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4061
      $1043 = HEAP32[1021] | 0; //@line 4062
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4068
       HEAP32[$1041 >> 2] = $636; //@line 4069
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4071
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4073
       HEAP32[$636 + 24 >> 2] = 0; //@line 4075
       break;
      } else {
       _abort(); //@line 4078
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1020] | 0; //@line 4085
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4088
   HEAP32[1020] = $1054; //@line 4089
   $1055 = HEAP32[1023] | 0; //@line 4090
   $1056 = $1055 + $$0197 | 0; //@line 4091
   HEAP32[1023] = $1056; //@line 4092
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4095
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4098
   $$0 = $1055 + 8 | 0; //@line 4100
   STACKTOP = sp; //@line 4101
   return $$0 | 0; //@line 4101
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4105
 $$0 = 0; //@line 4106
 STACKTOP = sp; //@line 4107
 return $$0 | 0; //@line 4107
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7829
 STACKTOP = STACKTOP + 560 | 0; //@line 7830
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 7830
 $6 = sp + 8 | 0; //@line 7831
 $7 = sp; //@line 7832
 $8 = sp + 524 | 0; //@line 7833
 $9 = $8; //@line 7834
 $10 = sp + 512 | 0; //@line 7835
 HEAP32[$7 >> 2] = 0; //@line 7836
 $11 = $10 + 12 | 0; //@line 7837
 ___DOUBLE_BITS_677($1) | 0; //@line 7838
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 7843
  $$0520 = 1; //@line 7843
  $$0521 = 1923; //@line 7843
 } else {
  $$0471 = $1; //@line 7854
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 7854
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1924 : 1929 : 1926; //@line 7854
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 7856
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 7865
   $31 = $$0520 + 3 | 0; //@line 7870
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 7872
   _out_670($0, $$0521, $$0520); //@line 7873
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1950 : 1954 : $27 ? 1942 : 1946, 3); //@line 7874
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 7876
   $$sink560 = $31; //@line 7877
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 7880
   $36 = $35 != 0.0; //@line 7881
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 7885
   }
   $39 = $5 | 32; //@line 7887
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 7890
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 7893
    $44 = $$0520 | 2; //@line 7894
    $46 = 12 - $3 | 0; //@line 7896
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 7901
     } else {
      $$0509585 = 8.0; //@line 7903
      $$1508586 = $46; //@line 7903
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 7905
       $$0509585 = $$0509585 * 16.0; //@line 7906
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 7921
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 7926
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 7931
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 7934
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7937
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 7940
     HEAP8[$68 >> 0] = 48; //@line 7941
     $$0511 = $68; //@line 7942
    } else {
     $$0511 = $66; //@line 7944
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 7951
    $76 = $$0511 + -2 | 0; //@line 7954
    HEAP8[$76 >> 0] = $5 + 15; //@line 7955
    $77 = ($3 | 0) < 1; //@line 7956
    $79 = ($4 & 8 | 0) == 0; //@line 7958
    $$0523 = $8; //@line 7959
    $$2473 = $$1472; //@line 7959
    while (1) {
     $80 = ~~$$2473; //@line 7961
     $86 = $$0523 + 1 | 0; //@line 7967
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1958 + $80 >> 0]; //@line 7968
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 7971
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 7980
      } else {
       HEAP8[$86 >> 0] = 46; //@line 7983
       $$1524 = $$0523 + 2 | 0; //@line 7984
      }
     } else {
      $$1524 = $86; //@line 7987
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 7991
     }
    }
    $$pre693 = $$1524; //@line 7997
    if (!$3) {
     label = 24; //@line 7999
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8007
      $$sink = $3 + 2 | 0; //@line 8007
     } else {
      label = 24; //@line 8009
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8013
     $$pre$phi691Z2D = $101; //@line 8014
     $$sink = $101; //@line 8014
    }
    $104 = $11 - $76 | 0; //@line 8018
    $106 = $104 + $44 + $$sink | 0; //@line 8020
    _pad_676($0, 32, $2, $106, $4); //@line 8021
    _out_670($0, $$0521$, $44); //@line 8022
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8024
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8025
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8027
    _out_670($0, $76, $104); //@line 8028
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8030
    $$sink560 = $106; //@line 8031
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8035
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8039
    HEAP32[$7 >> 2] = $113; //@line 8040
    $$3 = $35 * 268435456.0; //@line 8041
    $$pr = $113; //@line 8041
   } else {
    $$3 = $35; //@line 8044
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8044
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8048
   $$0498 = $$561; //@line 8049
   $$4 = $$3; //@line 8049
   do {
    $116 = ~~$$4 >>> 0; //@line 8051
    HEAP32[$$0498 >> 2] = $116; //@line 8052
    $$0498 = $$0498 + 4 | 0; //@line 8053
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8056
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8066
    $$1499662 = $$0498; //@line 8066
    $124 = $$pr; //@line 8066
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8069
     $$0488655 = $$1499662 + -4 | 0; //@line 8070
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8073
     } else {
      $$0488657 = $$0488655; //@line 8075
      $$0497656 = 0; //@line 8075
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8078
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8080
       $131 = tempRet0; //@line 8081
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8082
       HEAP32[$$0488657 >> 2] = $132; //@line 8084
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8085
       $$0488657 = $$0488657 + -4 | 0; //@line 8087
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8097
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8099
       HEAP32[$138 >> 2] = $$0497656; //@line 8100
       $$2483$ph = $138; //@line 8101
      }
     }
     $$2500 = $$1499662; //@line 8104
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8110
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8114
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8120
     HEAP32[$7 >> 2] = $144; //@line 8121
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8124
      $$1499662 = $$2500; //@line 8124
      $124 = $144; //@line 8124
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8126
      $$1499$lcssa = $$2500; //@line 8126
      $$pr566 = $144; //@line 8126
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8131
    $$1499$lcssa = $$0498; //@line 8131
    $$pr566 = $$pr; //@line 8131
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8137
    $150 = ($39 | 0) == 102; //@line 8138
    $$3484650 = $$1482$lcssa; //@line 8139
    $$3501649 = $$1499$lcssa; //@line 8139
    $152 = $$pr566; //@line 8139
    while (1) {
     $151 = 0 - $152 | 0; //@line 8141
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8143
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8147
      $161 = 1e9 >>> $154; //@line 8148
      $$0487644 = 0; //@line 8149
      $$1489643 = $$3484650; //@line 8149
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8151
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8155
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8156
       $$1489643 = $$1489643 + 4 | 0; //@line 8157
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8168
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8171
       $$4502 = $$3501649; //@line 8171
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8174
       $$$3484700 = $$$3484; //@line 8175
       $$4502 = $$3501649 + 4 | 0; //@line 8175
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8182
      $$4502 = $$3501649; //@line 8182
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8184
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8191
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8193
     HEAP32[$7 >> 2] = $152; //@line 8194
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8199
      $$3501$lcssa = $$$4502; //@line 8199
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8197
      $$3501649 = $$$4502; //@line 8197
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8204
    $$3501$lcssa = $$1499$lcssa; //@line 8204
   }
   $185 = $$561; //@line 8207
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8212
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8213
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8216
    } else {
     $$0514639 = $189; //@line 8218
     $$0530638 = 10; //@line 8218
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8220
      $193 = $$0514639 + 1 | 0; //@line 8221
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8224
       break;
      } else {
       $$0514639 = $193; //@line 8227
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8232
   }
   $198 = ($39 | 0) == 103; //@line 8237
   $199 = ($$540 | 0) != 0; //@line 8238
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8241
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8250
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8253
    $213 = ($209 | 0) % 9 | 0; //@line 8254
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8257
     $$1531632 = 10; //@line 8257
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8260
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8263
       $$1531632 = $215; //@line 8263
      } else {
       $$1531$lcssa = $215; //@line 8265
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8270
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8272
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8273
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8276
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8279
     $$4518 = $$1515; //@line 8279
     $$8 = $$3484$lcssa; //@line 8279
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8284
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8285
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8290
     if (!$$0520) {
      $$1467 = $$$564; //@line 8293
      $$1469 = $$543; //@line 8293
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8296
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8301
      $$1469 = $230 ? -$$543 : $$543; //@line 8301
     }
     $233 = $217 - $218 | 0; //@line 8303
     HEAP32[$212 >> 2] = $233; //@line 8304
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8308
      HEAP32[$212 >> 2] = $236; //@line 8309
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8312
       $$sink547625 = $212; //@line 8312
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8314
        HEAP32[$$sink547625 >> 2] = 0; //@line 8315
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8318
         HEAP32[$240 >> 2] = 0; //@line 8319
         $$6 = $240; //@line 8320
        } else {
         $$6 = $$5486626; //@line 8322
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8325
        HEAP32[$238 >> 2] = $242; //@line 8326
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8329
         $$sink547625 = $238; //@line 8329
        } else {
         $$5486$lcssa = $$6; //@line 8331
         $$sink547$lcssa = $238; //@line 8331
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8336
       $$sink547$lcssa = $212; //@line 8336
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8341
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8342
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8345
       $$4518 = $247; //@line 8345
       $$8 = $$5486$lcssa; //@line 8345
      } else {
       $$2516621 = $247; //@line 8347
       $$2532620 = 10; //@line 8347
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8349
        $251 = $$2516621 + 1 | 0; //@line 8350
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8353
         $$4518 = $251; //@line 8353
         $$8 = $$5486$lcssa; //@line 8353
         break;
        } else {
         $$2516621 = $251; //@line 8356
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8361
      $$4518 = $$1515; //@line 8361
      $$8 = $$3484$lcssa; //@line 8361
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8364
    $$5519$ph = $$4518; //@line 8367
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8367
    $$9$ph = $$8; //@line 8367
   } else {
    $$5519$ph = $$1515; //@line 8369
    $$7505$ph = $$3501$lcssa; //@line 8369
    $$9$ph = $$3484$lcssa; //@line 8369
   }
   $$7505 = $$7505$ph; //@line 8371
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8375
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8378
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8382
    } else {
     $$lcssa675 = 1; //@line 8384
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8388
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8393
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8401
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8401
     } else {
      $$0479 = $5 + -2 | 0; //@line 8405
      $$2476 = $$540$ + -1 | 0; //@line 8405
     }
     $267 = $4 & 8; //@line 8407
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8412
       if (!$270) {
        $$2529 = 9; //@line 8415
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8420
         $$3533616 = 10; //@line 8420
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8422
          $275 = $$1528617 + 1 | 0; //@line 8423
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8429
           break;
          } else {
           $$1528617 = $275; //@line 8427
          }
         }
        } else {
         $$2529 = 0; //@line 8434
        }
       }
      } else {
       $$2529 = 9; //@line 8438
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8446
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8448
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8450
       $$1480 = $$0479; //@line 8453
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8453
       $$pre$phi698Z2D = 0; //@line 8453
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8457
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8459
       $$1480 = $$0479; //@line 8462
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8462
       $$pre$phi698Z2D = 0; //@line 8462
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8466
      $$3477 = $$2476; //@line 8466
      $$pre$phi698Z2D = $267; //@line 8466
     }
    } else {
     $$1480 = $5; //@line 8470
     $$3477 = $$540; //@line 8470
     $$pre$phi698Z2D = $4 & 8; //@line 8470
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8473
   $294 = ($292 | 0) != 0 & 1; //@line 8475
   $296 = ($$1480 | 32 | 0) == 102; //@line 8477
   if ($296) {
    $$2513 = 0; //@line 8481
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8481
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8484
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8487
    $304 = $11; //@line 8488
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8493
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8495
      HEAP8[$308 >> 0] = 48; //@line 8496
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8501
      } else {
       $$1512$lcssa = $308; //@line 8503
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8508
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8515
    $318 = $$1512$lcssa + -2 | 0; //@line 8517
    HEAP8[$318 >> 0] = $$1480; //@line 8518
    $$2513 = $318; //@line 8521
    $$pn = $304 - $318 | 0; //@line 8521
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8526
   _pad_676($0, 32, $2, $323, $4); //@line 8527
   _out_670($0, $$0521, $$0520); //@line 8528
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8530
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8533
    $326 = $8 + 9 | 0; //@line 8534
    $327 = $326; //@line 8535
    $328 = $8 + 8 | 0; //@line 8536
    $$5493600 = $$0496$$9; //@line 8537
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8540
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8545
       $$1465 = $328; //@line 8546
      } else {
       $$1465 = $330; //@line 8548
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8555
       $$0464597 = $330; //@line 8556
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8558
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8561
        } else {
         $$1465 = $335; //@line 8563
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8568
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8573
     $$5493600 = $$5493600 + 4 | 0; //@line 8574
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1974, 1); //@line 8584
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8590
     $$6494592 = $$5493600; //@line 8590
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8593
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8598
       $$0463587 = $347; //@line 8599
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8601
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8604
        } else {
         $$0463$lcssa = $351; //@line 8606
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8611
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8615
      $$6494592 = $$6494592 + 4 | 0; //@line 8616
      $356 = $$4478593 + -9 | 0; //@line 8617
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8624
       break;
      } else {
       $$4478593 = $356; //@line 8622
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8629
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8632
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8635
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8638
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8639
     $365 = $363; //@line 8640
     $366 = 0 - $9 | 0; //@line 8641
     $367 = $8 + 8 | 0; //@line 8642
     $$5605 = $$3477; //@line 8643
     $$7495604 = $$9$ph; //@line 8643
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8646
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8649
       $$0 = $367; //@line 8650
      } else {
       $$0 = $369; //@line 8652
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8657
        _out_670($0, $$0, 1); //@line 8658
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 8662
         break;
        }
        _out_670($0, 1974, 1); //@line 8665
        $$2 = $375; //@line 8666
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 8670
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 8675
        $$1601 = $$0; //@line 8676
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 8678
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 8681
         } else {
          $$2 = $373; //@line 8683
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 8690
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 8693
      $381 = $$5605 - $378 | 0; //@line 8694
      $$7495604 = $$7495604 + 4 | 0; //@line 8695
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 8702
       break;
      } else {
       $$5605 = $381; //@line 8700
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 8707
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 8710
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 8714
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 8717
   $$sink560 = $323; //@line 8718
  }
 } while (0);
 STACKTOP = sp; //@line 8723
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 8723
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6401
 STACKTOP = STACKTOP + 64 | 0; //@line 6402
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6402
 $5 = sp + 16 | 0; //@line 6403
 $6 = sp; //@line 6404
 $7 = sp + 24 | 0; //@line 6405
 $8 = sp + 8 | 0; //@line 6406
 $9 = sp + 20 | 0; //@line 6407
 HEAP32[$5 >> 2] = $1; //@line 6408
 $10 = ($0 | 0) != 0; //@line 6409
 $11 = $7 + 40 | 0; //@line 6410
 $12 = $11; //@line 6411
 $13 = $7 + 39 | 0; //@line 6412
 $14 = $8 + 4 | 0; //@line 6413
 $$0243 = 0; //@line 6414
 $$0247 = 0; //@line 6414
 $$0269 = 0; //@line 6414
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6423
     $$1248 = -1; //@line 6424
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6428
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6432
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6435
  $21 = HEAP8[$20 >> 0] | 0; //@line 6436
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6439
   break;
  } else {
   $23 = $21; //@line 6442
   $25 = $20; //@line 6442
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6447
     $27 = $25; //@line 6447
     label = 9; //@line 6448
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6453
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6460
   HEAP32[$5 >> 2] = $24; //@line 6461
   $23 = HEAP8[$24 >> 0] | 0; //@line 6463
   $25 = $24; //@line 6463
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6468
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6473
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6476
     $27 = $27 + 2 | 0; //@line 6477
     HEAP32[$5 >> 2] = $27; //@line 6478
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6485
      break;
     } else {
      $$0249303 = $30; //@line 6482
      label = 9; //@line 6483
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6493
  if ($10) {
   _out_670($0, $20, $36); //@line 6495
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6499
   $$0247 = $$1248; //@line 6499
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6507
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6508
  if ($43) {
   $$0253 = -1; //@line 6510
   $$1270 = $$0269; //@line 6510
   $$sink = 1; //@line 6510
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6520
    $$1270 = 1; //@line 6520
    $$sink = 3; //@line 6520
   } else {
    $$0253 = -1; //@line 6522
    $$1270 = $$0269; //@line 6522
    $$sink = 1; //@line 6522
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6525
  HEAP32[$5 >> 2] = $51; //@line 6526
  $52 = HEAP8[$51 >> 0] | 0; //@line 6527
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6529
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6536
   $$lcssa291 = $52; //@line 6536
   $$lcssa292 = $51; //@line 6536
  } else {
   $$0262309 = 0; //@line 6538
   $60 = $52; //@line 6538
   $65 = $51; //@line 6538
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6543
    $64 = $65 + 1 | 0; //@line 6544
    HEAP32[$5 >> 2] = $64; //@line 6545
    $66 = HEAP8[$64 >> 0] | 0; //@line 6546
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6548
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6555
     $$lcssa291 = $66; //@line 6555
     $$lcssa292 = $64; //@line 6555
     break;
    } else {
     $$0262309 = $63; //@line 6558
     $60 = $66; //@line 6558
     $65 = $64; //@line 6558
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6570
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6572
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6577
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6582
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6594
     $$2271 = 1; //@line 6594
     $storemerge274 = $79 + 3 | 0; //@line 6594
    } else {
     label = 23; //@line 6596
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6600
    if ($$1270 | 0) {
     $$0 = -1; //@line 6603
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6618
     $106 = HEAP32[$105 >> 2] | 0; //@line 6619
     HEAP32[$2 >> 2] = $105 + 4; //@line 6621
     $363 = $106; //@line 6622
    } else {
     $363 = 0; //@line 6624
    }
    $$0259 = $363; //@line 6628
    $$2271 = 0; //@line 6628
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6628
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6630
   $109 = ($$0259 | 0) < 0; //@line 6631
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6636
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6636
   $$3272 = $$2271; //@line 6636
   $115 = $storemerge274; //@line 6636
  } else {
   $112 = _getint_671($5) | 0; //@line 6638
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6641
    break;
   }
   $$1260 = $112; //@line 6645
   $$1263 = $$0262$lcssa; //@line 6645
   $$3272 = $$1270; //@line 6645
   $115 = HEAP32[$5 >> 2] | 0; //@line 6645
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6656
     $156 = _getint_671($5) | 0; //@line 6657
     $$0254 = $156; //@line 6659
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 6659
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 6668
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 6673
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6678
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6685
      $144 = $125 + 4 | 0; //@line 6689
      HEAP32[$5 >> 2] = $144; //@line 6690
      $$0254 = $140; //@line 6691
      $$pre345 = $144; //@line 6691
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 6697
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6712
     $152 = HEAP32[$151 >> 2] | 0; //@line 6713
     HEAP32[$2 >> 2] = $151 + 4; //@line 6715
     $364 = $152; //@line 6716
    } else {
     $364 = 0; //@line 6718
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 6721
    HEAP32[$5 >> 2] = $154; //@line 6722
    $$0254 = $364; //@line 6723
    $$pre345 = $154; //@line 6723
   } else {
    $$0254 = -1; //@line 6725
    $$pre345 = $115; //@line 6725
   }
  } while (0);
  $$0252 = 0; //@line 6728
  $158 = $$pre345; //@line 6728
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 6735
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 6738
   HEAP32[$5 >> 2] = $158; //@line 6739
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1442 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 6744
   $168 = $167 & 255; //@line 6745
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 6749
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 6756
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 6760
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 6764
     break L1;
    } else {
     label = 50; //@line 6767
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 6772
     $176 = $3 + ($$0253 << 3) | 0; //@line 6774
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 6779
     $182 = $6; //@line 6780
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 6782
     HEAP32[$182 + 4 >> 2] = $181; //@line 6785
     label = 50; //@line 6786
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 6790
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 6793
    $187 = HEAP32[$5 >> 2] | 0; //@line 6795
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 6799
   if ($10) {
    $187 = $158; //@line 6801
   } else {
    $$0243 = 0; //@line 6803
    $$0247 = $$1248; //@line 6803
    $$0269 = $$3272; //@line 6803
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 6809
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 6815
  $196 = $$1263 & -65537; //@line 6818
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 6819
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6827
       $$0243 = 0; //@line 6828
       $$0247 = $$1248; //@line 6828
       $$0269 = $$3272; //@line 6828
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6834
       $$0243 = 0; //@line 6835
       $$0247 = $$1248; //@line 6835
       $$0269 = $$3272; //@line 6835
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 6843
       HEAP32[$208 >> 2] = $$1248; //@line 6845
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6848
       $$0243 = 0; //@line 6849
       $$0247 = $$1248; //@line 6849
       $$0269 = $$3272; //@line 6849
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 6856
       $$0243 = 0; //@line 6857
       $$0247 = $$1248; //@line 6857
       $$0269 = $$3272; //@line 6857
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 6864
       $$0243 = 0; //@line 6865
       $$0247 = $$1248; //@line 6865
       $$0269 = $$3272; //@line 6865
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6871
       $$0243 = 0; //@line 6872
       $$0247 = $$1248; //@line 6872
       $$0269 = $$3272; //@line 6872
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 6880
       HEAP32[$220 >> 2] = $$1248; //@line 6882
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6885
       $$0243 = 0; //@line 6886
       $$0247 = $$1248; //@line 6886
       $$0269 = $$3272; //@line 6886
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 6891
       $$0247 = $$1248; //@line 6891
       $$0269 = $$3272; //@line 6891
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 6901
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 6901
     $$3265 = $$1263$ | 8; //@line 6901
     label = 62; //@line 6902
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 6906
     $$1255 = $$0254; //@line 6906
     $$3265 = $$1263$; //@line 6906
     label = 62; //@line 6907
     break;
    }
   case 111:
    {
     $242 = $6; //@line 6911
     $244 = HEAP32[$242 >> 2] | 0; //@line 6913
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 6916
     $248 = _fmt_o($244, $247, $11) | 0; //@line 6917
     $252 = $12 - $248 | 0; //@line 6921
     $$0228 = $248; //@line 6926
     $$1233 = 0; //@line 6926
     $$1238 = 1906; //@line 6926
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 6926
     $$4266 = $$1263$; //@line 6926
     $281 = $244; //@line 6926
     $283 = $247; //@line 6926
     label = 68; //@line 6927
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 6931
     $258 = HEAP32[$256 >> 2] | 0; //@line 6933
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 6936
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 6939
      $264 = tempRet0; //@line 6940
      $265 = $6; //@line 6941
      HEAP32[$265 >> 2] = $263; //@line 6943
      HEAP32[$265 + 4 >> 2] = $264; //@line 6946
      $$0232 = 1; //@line 6947
      $$0237 = 1906; //@line 6947
      $275 = $263; //@line 6947
      $276 = $264; //@line 6947
      label = 67; //@line 6948
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 6960
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1906 : 1908 : 1907; //@line 6960
      $275 = $258; //@line 6960
      $276 = $261; //@line 6960
      label = 67; //@line 6961
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 6967
     $$0232 = 0; //@line 6973
     $$0237 = 1906; //@line 6973
     $275 = HEAP32[$197 >> 2] | 0; //@line 6973
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 6973
     label = 67; //@line 6974
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 6985
     $$2 = $13; //@line 6986
     $$2234 = 0; //@line 6986
     $$2239 = 1906; //@line 6986
     $$2251 = $11; //@line 6986
     $$5 = 1; //@line 6986
     $$6268 = $196; //@line 6986
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 6993
     label = 72; //@line 6994
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 6998
     $$1 = $302 | 0 ? $302 : 1916; //@line 7001
     label = 72; //@line 7002
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7012
     HEAP32[$14 >> 2] = 0; //@line 7013
     HEAP32[$6 >> 2] = $8; //@line 7014
     $$4258354 = -1; //@line 7015
     $365 = $8; //@line 7015
     label = 76; //@line 7016
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7020
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7023
      $$0240$lcssa356 = 0; //@line 7024
      label = 85; //@line 7025
     } else {
      $$4258354 = $$0254; //@line 7027
      $365 = $$pre348; //@line 7027
      label = 76; //@line 7028
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7035
     $$0247 = $$1248; //@line 7035
     $$0269 = $$3272; //@line 7035
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7040
     $$2234 = 0; //@line 7040
     $$2239 = 1906; //@line 7040
     $$2251 = $11; //@line 7040
     $$5 = $$0254; //@line 7040
     $$6268 = $$1263$; //@line 7040
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7046
    $227 = $6; //@line 7047
    $229 = HEAP32[$227 >> 2] | 0; //@line 7049
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7052
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7054
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7060
    $$0228 = $234; //@line 7065
    $$1233 = $or$cond278 ? 0 : 2; //@line 7065
    $$1238 = $or$cond278 ? 1906 : 1906 + ($$1236 >> 4) | 0; //@line 7065
    $$2256 = $$1255; //@line 7065
    $$4266 = $$3265; //@line 7065
    $281 = $229; //@line 7065
    $283 = $232; //@line 7065
    label = 68; //@line 7066
   } else if ((label | 0) == 67) {
    label = 0; //@line 7069
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7071
    $$1233 = $$0232; //@line 7071
    $$1238 = $$0237; //@line 7071
    $$2256 = $$0254; //@line 7071
    $$4266 = $$1263$; //@line 7071
    $281 = $275; //@line 7071
    $283 = $276; //@line 7071
    label = 68; //@line 7072
   } else if ((label | 0) == 72) {
    label = 0; //@line 7075
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7076
    $306 = ($305 | 0) == 0; //@line 7077
    $$2 = $$1; //@line 7084
    $$2234 = 0; //@line 7084
    $$2239 = 1906; //@line 7084
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7084
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7084
    $$6268 = $196; //@line 7084
   } else if ((label | 0) == 76) {
    label = 0; //@line 7087
    $$0229316 = $365; //@line 7088
    $$0240315 = 0; //@line 7088
    $$1244314 = 0; //@line 7088
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7090
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7093
      $$2245 = $$1244314; //@line 7093
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7096
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7102
      $$2245 = $320; //@line 7102
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7106
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7109
      $$0240315 = $325; //@line 7109
      $$1244314 = $320; //@line 7109
     } else {
      $$0240$lcssa = $325; //@line 7111
      $$2245 = $320; //@line 7111
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7117
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7120
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7123
     label = 85; //@line 7124
    } else {
     $$1230327 = $365; //@line 7126
     $$1241326 = 0; //@line 7126
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7128
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7131
       label = 85; //@line 7132
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7135
      $$1241326 = $331 + $$1241326 | 0; //@line 7136
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7139
       label = 85; //@line 7140
       break L97;
      }
      _out_670($0, $9, $331); //@line 7144
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7149
       label = 85; //@line 7150
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7147
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7158
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7164
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7166
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7171
   $$2 = $or$cond ? $$0228 : $11; //@line 7176
   $$2234 = $$1233; //@line 7176
   $$2239 = $$1238; //@line 7176
   $$2251 = $11; //@line 7176
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7176
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7176
  } else if ((label | 0) == 85) {
   label = 0; //@line 7179
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7181
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7184
   $$0247 = $$1248; //@line 7184
   $$0269 = $$3272; //@line 7184
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7189
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7191
  $345 = $$$5 + $$2234 | 0; //@line 7192
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7194
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7195
  _out_670($0, $$2239, $$2234); //@line 7196
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7198
  _pad_676($0, 48, $$$5, $343, 0); //@line 7199
  _out_670($0, $$2, $343); //@line 7200
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7202
  $$0243 = $$2261; //@line 7203
  $$0247 = $$1248; //@line 7203
  $$0269 = $$3272; //@line 7203
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7211
    } else {
     $$2242302 = 1; //@line 7213
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7216
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7219
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7223
      $356 = $$2242302 + 1 | 0; //@line 7224
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7227
      } else {
       $$2242$lcssa = $356; //@line 7229
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7235
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7241
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7247
       } else {
        $$0 = 1; //@line 7249
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7254
     }
    }
   } else {
    $$0 = $$1248; //@line 7258
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7262
 return $$0 | 0; //@line 7262
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 378
 STACKTOP = STACKTOP + 96 | 0; //@line 379
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 379
 $vararg_buffer23 = sp + 72 | 0; //@line 380
 $vararg_buffer20 = sp + 64 | 0; //@line 381
 $vararg_buffer18 = sp + 56 | 0; //@line 382
 $vararg_buffer15 = sp + 48 | 0; //@line 383
 $vararg_buffer12 = sp + 40 | 0; //@line 384
 $vararg_buffer9 = sp + 32 | 0; //@line 385
 $vararg_buffer6 = sp + 24 | 0; //@line 386
 $vararg_buffer3 = sp + 16 | 0; //@line 387
 $vararg_buffer1 = sp + 8 | 0; //@line 388
 $vararg_buffer = sp; //@line 389
 $4 = sp + 80 | 0; //@line 390
 $5 = HEAP32[37] | 0; //@line 391
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 395
   FUNCTION_TABLE_v[$5 & 0](); //@line 396
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 14; //@line 399
    HEAP8[$AsyncCtx + 4 >> 0] = $0; //@line 401
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 403
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer3; //@line 405
    HEAP32[$AsyncCtx + 16 >> 2] = $2; //@line 407
    HEAP32[$AsyncCtx + 20 >> 2] = $3; //@line 409
    HEAP32[$AsyncCtx + 24 >> 2] = $1; //@line 411
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer23; //@line 413
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer23; //@line 415
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer; //@line 417
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer; //@line 419
    HEAP32[$AsyncCtx + 44 >> 2] = $4; //@line 421
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer1; //@line 423
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer1; //@line 425
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer18; //@line 427
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer18; //@line 429
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer9; //@line 431
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer9; //@line 433
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer6; //@line 435
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer6; //@line 437
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer15; //@line 439
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer15; //@line 441
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer12; //@line 443
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer12; //@line 445
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer20; //@line 447
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer20; //@line 449
    sp = STACKTOP; //@line 450
    STACKTOP = sp; //@line 451
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 453
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 456
    break;
   }
  }
 } while (0);
 $34 = HEAP32[28] | 0; //@line 461
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 465
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[25] | 0; //@line 471
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 478
       break;
      }
     }
     $43 = HEAP32[26] | 0; //@line 482
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 486
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 491
      } else {
       label = 11; //@line 493
      }
     }
    } else {
     label = 11; //@line 497
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 501
   }
   if (!((HEAP32[35] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 513
    break;
   }
   $54 = HEAPU8[96] | 0; //@line 517
   $55 = $0 & 255; //@line 518
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 523
    $$lobit = $59 >>> 6; //@line 524
    $60 = $$lobit & 255; //@line 525
    $64 = ($54 & 32 | 0) == 0; //@line 529
    $65 = HEAP32[29] | 0; //@line 530
    $66 = HEAP32[28] | 0; //@line 531
    $67 = $0 << 24 >> 24 == 1; //@line 532
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 536
      _vsnprintf($66, $65, $2, $3) | 0; //@line 537
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 15; //@line 540
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 543
       sp = STACKTOP; //@line 544
       STACKTOP = sp; //@line 545
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 547
      $69 = HEAP32[36] | 0; //@line 548
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[35] | 0; //@line 552
       $74 = HEAP32[28] | 0; //@line 553
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 554
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 555
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 18; //@line 558
        sp = STACKTOP; //@line 559
        STACKTOP = sp; //@line 560
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 562
        break;
       }
      }
      $71 = HEAP32[28] | 0; //@line 566
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 567
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 568
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 16; //@line 571
       sp = STACKTOP; //@line 572
       STACKTOP = sp; //@line 573
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 575
      $72 = HEAP32[36] | 0; //@line 576
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 577
      FUNCTION_TABLE_vi[$72 & 127](1002); //@line 578
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 17; //@line 581
       sp = STACKTOP; //@line 582
       STACKTOP = sp; //@line 583
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 585
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 592
       $$1143 = $66; //@line 592
       $$1145 = $65; //@line 592
       $$3154 = 0; //@line 592
       label = 38; //@line 593
      } else {
       if ($64) {
        $$0142 = $66; //@line 596
        $$0144 = $65; //@line 596
       } else {
        $76 = _snprintf($66, $65, 1004, $vararg_buffer) | 0; //@line 598
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 600
        $78 = ($$ | 0) > 0; //@line 601
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 606
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 606
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 610
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1022; //@line 616
          label = 35; //@line 617
          break;
         }
        case 1:
         {
          $$sink = 1028; //@line 621
          label = 35; //@line 622
          break;
         }
        case 3:
         {
          $$sink = 1016; //@line 626
          label = 35; //@line 627
          break;
         }
        case 7:
         {
          $$sink = 1010; //@line 631
          label = 35; //@line 632
          break;
         }
        default:
         {
          $$0141 = 0; //@line 636
          $$1152 = 0; //@line 636
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 640
         $$0141 = $60 & 1; //@line 643
         $$1152 = _snprintf($$0142, $$0144, 1034, $vararg_buffer1) | 0; //@line 643
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 646
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 648
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 650
         $$1$off0 = $extract$t159; //@line 655
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 655
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 655
         $$3154 = $$1152; //@line 655
         label = 38; //@line 656
        } else {
         $$1$off0 = $extract$t159; //@line 658
         $$1143 = $$0142; //@line 658
         $$1145 = $$0144; //@line 658
         $$3154 = $$1152$; //@line 658
         label = 38; //@line 659
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 672
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 673
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 674
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 19; //@line 677
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer3; //@line 679
           HEAP32[$AsyncCtx60 + 8 >> 2] = $$1143; //@line 681
           HEAP32[$AsyncCtx60 + 12 >> 2] = $$1145; //@line 683
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer3; //@line 685
           HEAP32[$AsyncCtx60 + 20 >> 2] = $4; //@line 687
           HEAP8[$AsyncCtx60 + 24 >> 0] = $$1$off0 & 1; //@line 690
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer23; //@line 692
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer23; //@line 694
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer20; //@line 696
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer20; //@line 698
           HEAP32[$AsyncCtx60 + 44 >> 2] = $55; //@line 700
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer18; //@line 702
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer18; //@line 704
           HEAP32[$AsyncCtx60 + 56 >> 2] = $2; //@line 706
           HEAP32[$AsyncCtx60 + 60 >> 2] = $3; //@line 708
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer9; //@line 710
           HEAP32[$AsyncCtx60 + 68 >> 2] = $1; //@line 712
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer9; //@line 714
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer6; //@line 716
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer6; //@line 718
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer15; //@line 720
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer15; //@line 722
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer12; //@line 724
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer12; //@line 726
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 728
           sp = STACKTOP; //@line 729
           STACKTOP = sp; //@line 730
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 732
          $125 = HEAP32[33] | 0; //@line 737
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 738
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 739
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 20; //@line 742
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer3; //@line 744
           HEAP32[$AsyncCtx38 + 8 >> 2] = $$1143; //@line 746
           HEAP32[$AsyncCtx38 + 12 >> 2] = $$1145; //@line 748
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer3; //@line 750
           HEAP32[$AsyncCtx38 + 20 >> 2] = $4; //@line 752
           HEAP8[$AsyncCtx38 + 24 >> 0] = $$1$off0 & 1; //@line 755
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer23; //@line 757
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer23; //@line 759
           HEAP32[$AsyncCtx38 + 36 >> 2] = $55; //@line 761
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer18; //@line 763
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer18; //@line 765
           HEAP32[$AsyncCtx38 + 48 >> 2] = $2; //@line 767
           HEAP32[$AsyncCtx38 + 52 >> 2] = $3; //@line 769
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer9; //@line 771
           HEAP32[$AsyncCtx38 + 60 >> 2] = $1; //@line 773
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer9; //@line 775
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer6; //@line 777
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer6; //@line 779
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer15; //@line 781
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer15; //@line 783
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer12; //@line 785
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer12; //@line 787
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer20; //@line 789
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer20; //@line 791
           sp = STACKTOP; //@line 792
           STACKTOP = sp; //@line 793
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 795
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 796
           $151 = _snprintf($$1143, $$1145, 1034, $vararg_buffer3) | 0; //@line 797
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 799
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 804
            $$3147 = $$1145 - $$10 | 0; //@line 804
            label = 44; //@line 805
            break;
           } else {
            $$3147168 = $$1145; //@line 808
            $$3169 = $$1143; //@line 808
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 813
          $$3147 = $$1145; //@line 813
          label = 44; //@line 814
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 820
          $$3169 = $$3; //@line 820
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 825
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 831
          $$5156 = _snprintf($$3169, $$3147168, 1037, $vararg_buffer6) | 0; //@line 833
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 837
          $$5156 = _snprintf($$3169, $$3147168, 1052, $vararg_buffer9) | 0; //@line 839
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 843
          $$5156 = _snprintf($$3169, $$3147168, 1067, $vararg_buffer12) | 0; //@line 845
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 849
          $$5156 = _snprintf($$3169, $$3147168, 1082, $vararg_buffer15) | 0; //@line 851
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1097, $vararg_buffer18) | 0; //@line 856
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 860
        $168 = $$3169 + $$5156$ | 0; //@line 862
        $169 = $$3147168 - $$5156$ | 0; //@line 863
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 867
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 868
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 21; //@line 871
          HEAP8[$AsyncCtx56 + 4 >> 0] = $$1$off0 & 1; //@line 874
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer23; //@line 876
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer23; //@line 878
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer20; //@line 880
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer20; //@line 882
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 884
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 886
          sp = STACKTOP; //@line 887
          STACKTOP = sp; //@line 888
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 890
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 892
         $181 = $168 + $$13 | 0; //@line 894
         $182 = $169 - $$13 | 0; //@line 895
         if (($$13 | 0) > 0) {
          $184 = HEAP32[34] | 0; //@line 898
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 903
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 904
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 22; //@line 907
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 909
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 911
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 913
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 915
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 918
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 920
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 922
             sp = STACKTOP; //@line 923
             STACKTOP = sp; //@line 924
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 926
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 927
             $194 = _snprintf($181, $182, 1034, $vararg_buffer20) | 0; //@line 928
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 930
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 935
              $$6150 = $182 - $$18 | 0; //@line 935
              $$9 = $$18; //@line 935
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 942
            $$6150 = $182; //@line 942
            $$9 = $$13; //@line 942
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1112, $vararg_buffer23) | 0; //@line 951
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[35] | 0; //@line 957
      $202 = HEAP32[28] | 0; //@line 958
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 959
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 960
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 23; //@line 963
       sp = STACKTOP; //@line 964
       STACKTOP = sp; //@line 965
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 967
       break;
      }
     }
    } while (0);
    HEAP32[32] = HEAP32[30]; //@line 973
   }
  }
 } while (0);
 $204 = HEAP32[38] | 0; //@line 977
 if (!$204) {
  STACKTOP = sp; //@line 980
  return;
 }
 $206 = HEAP32[39] | 0; //@line 982
 HEAP32[39] = 0; //@line 983
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 984
 FUNCTION_TABLE_v[$204 & 0](); //@line 985
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 24; //@line 988
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 990
  sp = STACKTOP; //@line 991
  STACKTOP = sp; //@line 992
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 994
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 997
 } else {
  STACKTOP = sp; //@line 999
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 1002
  $$pre = HEAP32[38] | 0; //@line 1003
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1004
  FUNCTION_TABLE_v[$$pre & 0](); //@line 1005
  if (___async) {
   label = 70; //@line 1008
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 1011
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 1014
  } else {
   label = 72; //@line 1016
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 25; //@line 1021
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 1023
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 1025
  sp = STACKTOP; //@line 1026
  STACKTOP = sp; //@line 1027
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 1030
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $22 = 0, $24 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10726
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 10728
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10730
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10732
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10734
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10736
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10738
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10740
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10742
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10744
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10748
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10750
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10754
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 10756
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 10758
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 10760
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 10762
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 10764
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 10766
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 10768
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 10770
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 10772
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 10774
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 10776
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 10779
 $53 = HEAP32[28] | 0; //@line 10780
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 10784
   do {
    if ($2 << 24 >> 24 > -1 & ($12 | 0) != 0) {
     $57 = HEAP32[25] | 0; //@line 10790
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $12) | 0) {
       $$0$i = 1; //@line 10797
       break;
      }
     }
     $62 = HEAP32[26] | 0; //@line 10801
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 10805
     } else {
      if (!(_strstr($62, $12) | 0)) {
       $$0$i = 1; //@line 10810
      } else {
       label = 9; //@line 10812
      }
     }
    } else {
     label = 9; //@line 10816
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 10820
   }
   if (!((HEAP32[35] | 0) != 0 & ((($12 | 0) == 0 | (($8 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 10832
    break;
   }
   $73 = HEAPU8[96] | 0; //@line 10836
   $74 = $2 & 255; //@line 10837
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 10842
    $$lobit = $78 >>> 6; //@line 10843
    $79 = $$lobit & 255; //@line 10844
    $83 = ($73 & 32 | 0) == 0; //@line 10848
    $84 = HEAP32[29] | 0; //@line 10849
    $85 = HEAP32[28] | 0; //@line 10850
    $86 = $2 << 24 >> 24 == 1; //@line 10851
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 10854
     _vsnprintf($85, $84, $8, $10) | 0; //@line 10855
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 15; //@line 10858
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 10859
      $$expand_i1_val = $86 & 1; //@line 10860
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 10861
      sp = STACKTOP; //@line 10862
      return;
     }
     ___async_unwind = 0; //@line 10865
     HEAP32[$ReallocAsyncCtx12 >> 2] = 15; //@line 10866
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 10867
     $$expand_i1_val = $86 & 1; //@line 10868
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 10869
     sp = STACKTOP; //@line 10870
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 10876
     $$1143 = $85; //@line 10876
     $$1145 = $84; //@line 10876
     $$3154 = 0; //@line 10876
     label = 28; //@line 10877
    } else {
     if ($83) {
      $$0142 = $85; //@line 10880
      $$0144 = $84; //@line 10880
     } else {
      $89 = _snprintf($85, $84, 1004, $18) | 0; //@line 10882
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 10884
      $91 = ($$ | 0) > 0; //@line 10885
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 10890
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 10890
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 10894
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1022; //@line 10900
        label = 25; //@line 10901
        break;
       }
      case 1:
       {
        $$sink = 1028; //@line 10905
        label = 25; //@line 10906
        break;
       }
      case 3:
       {
        $$sink = 1016; //@line 10910
        label = 25; //@line 10911
        break;
       }
      case 7:
       {
        $$sink = 1010; //@line 10915
        label = 25; //@line 10916
        break;
       }
      default:
       {
        $$0141 = 0; //@line 10920
        $$1152 = 0; //@line 10920
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$24 >> 2] = $$sink; //@line 10924
       $$0141 = $79 & 1; //@line 10927
       $$1152 = _snprintf($$0142, $$0144, 1034, $24) | 0; //@line 10927
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 10930
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 10932
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 10934
       $$1$off0 = $extract$t159; //@line 10939
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 10939
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 10939
       $$3154 = $$1152; //@line 10939
       label = 28; //@line 10940
      } else {
       $$1$off0 = $extract$t159; //@line 10942
       $$1143 = $$0142; //@line 10942
       $$1145 = $$0144; //@line 10942
       $$3154 = $$1152$; //@line 10942
       label = 28; //@line 10943
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
      HEAP32[$22 >> 2] = HEAP32[$10 >> 2]; //@line 10954
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 10955
      $108 = _vsnprintf(0, 0, $8, $22) | 0; //@line 10956
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 19; //@line 10959
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 10960
       HEAP32[$109 >> 2] = $4; //@line 10961
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 10962
       HEAP32[$110 >> 2] = $$1143; //@line 10963
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 10964
       HEAP32[$111 >> 2] = $$1145; //@line 10965
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 10966
       HEAP32[$112 >> 2] = $6; //@line 10967
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 10968
       HEAP32[$113 >> 2] = $22; //@line 10969
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 10970
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 10971
       HEAP8[$114 >> 0] = $$1$off0$expand_i1_val; //@line 10972
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 10973
       HEAP32[$115 >> 2] = $14; //@line 10974
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 10975
       HEAP32[$116 >> 2] = $16; //@line 10976
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 10977
       HEAP32[$117 >> 2] = $48; //@line 10978
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 10979
       HEAP32[$118 >> 2] = $50; //@line 10980
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 10981
       HEAP32[$119 >> 2] = $74; //@line 10982
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 10983
       HEAP32[$120 >> 2] = $28; //@line 10984
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 10985
       HEAP32[$121 >> 2] = $30; //@line 10986
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 10987
       HEAP32[$122 >> 2] = $8; //@line 10988
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 10989
       HEAP32[$123 >> 2] = $10; //@line 10990
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 10991
       HEAP32[$124 >> 2] = $32; //@line 10992
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 10993
       HEAP32[$125 >> 2] = $12; //@line 10994
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 10995
       HEAP32[$126 >> 2] = $34; //@line 10996
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 10997
       HEAP32[$127 >> 2] = $36; //@line 10998
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 10999
       HEAP32[$128 >> 2] = $38; //@line 11000
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 11001
       HEAP32[$129 >> 2] = $40; //@line 11002
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 11003
       HEAP32[$130 >> 2] = $42; //@line 11004
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 11005
       HEAP32[$131 >> 2] = $44; //@line 11006
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 11007
       HEAP32[$132 >> 2] = $46; //@line 11008
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 11009
       HEAP32[$133 >> 2] = $$3154; //@line 11010
       sp = STACKTOP; //@line 11011
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 11015
      ___async_unwind = 0; //@line 11016
      HEAP32[$ReallocAsyncCtx11 >> 2] = 19; //@line 11017
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 11018
      HEAP32[$109 >> 2] = $4; //@line 11019
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 11020
      HEAP32[$110 >> 2] = $$1143; //@line 11021
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 11022
      HEAP32[$111 >> 2] = $$1145; //@line 11023
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 11024
      HEAP32[$112 >> 2] = $6; //@line 11025
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 11026
      HEAP32[$113 >> 2] = $22; //@line 11027
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 11028
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 11029
      HEAP8[$114 >> 0] = $$1$off0$expand_i1_val; //@line 11030
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 11031
      HEAP32[$115 >> 2] = $14; //@line 11032
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 11033
      HEAP32[$116 >> 2] = $16; //@line 11034
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 11035
      HEAP32[$117 >> 2] = $48; //@line 11036
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 11037
      HEAP32[$118 >> 2] = $50; //@line 11038
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 11039
      HEAP32[$119 >> 2] = $74; //@line 11040
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 11041
      HEAP32[$120 >> 2] = $28; //@line 11042
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 11043
      HEAP32[$121 >> 2] = $30; //@line 11044
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 11045
      HEAP32[$122 >> 2] = $8; //@line 11046
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 11047
      HEAP32[$123 >> 2] = $10; //@line 11048
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 11049
      HEAP32[$124 >> 2] = $32; //@line 11050
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 11051
      HEAP32[$125 >> 2] = $12; //@line 11052
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 11053
      HEAP32[$126 >> 2] = $34; //@line 11054
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 11055
      HEAP32[$127 >> 2] = $36; //@line 11056
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 11057
      HEAP32[$128 >> 2] = $38; //@line 11058
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 11059
      HEAP32[$129 >> 2] = $40; //@line 11060
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 11061
      HEAP32[$130 >> 2] = $42; //@line 11062
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 11063
      HEAP32[$131 >> 2] = $44; //@line 11064
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 11065
      HEAP32[$132 >> 2] = $46; //@line 11066
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 11067
      HEAP32[$133 >> 2] = $$3154; //@line 11068
      sp = STACKTOP; //@line 11069
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 11074
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$36 >> 2] = $12; //@line 11080
        $$5156 = _snprintf($$1143, $$1145, 1037, $36) | 0; //@line 11082
        break;
       }
      case 1:
       {
        HEAP32[$32 >> 2] = $12; //@line 11086
        $$5156 = _snprintf($$1143, $$1145, 1052, $32) | 0; //@line 11088
        break;
       }
      case 3:
       {
        HEAP32[$44 >> 2] = $12; //@line 11092
        $$5156 = _snprintf($$1143, $$1145, 1067, $44) | 0; //@line 11094
        break;
       }
      case 7:
       {
        HEAP32[$40 >> 2] = $12; //@line 11098
        $$5156 = _snprintf($$1143, $$1145, 1082, $40) | 0; //@line 11100
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1097, $28) | 0; //@line 11105
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 11109
      $147 = $$1143 + $$5156$ | 0; //@line 11111
      $148 = $$1145 - $$5156$ | 0; //@line 11112
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 11116
       $150 = _vsnprintf($147, $148, $8, $10) | 0; //@line 11117
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 21; //@line 11120
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 11121
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 11122
        HEAP8[$151 >> 0] = $$1$off0$expand_i1_val18; //@line 11123
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 11124
        HEAP32[$152 >> 2] = $14; //@line 11125
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 11126
        HEAP32[$153 >> 2] = $16; //@line 11127
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 11128
        HEAP32[$154 >> 2] = $48; //@line 11129
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 11130
        HEAP32[$155 >> 2] = $50; //@line 11131
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 11132
        HEAP32[$156 >> 2] = $148; //@line 11133
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 11134
        HEAP32[$157 >> 2] = $147; //@line 11135
        sp = STACKTOP; //@line 11136
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 11140
       ___async_unwind = 0; //@line 11141
       HEAP32[$ReallocAsyncCtx10 >> 2] = 21; //@line 11142
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 11143
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 11144
       HEAP8[$151 >> 0] = $$1$off0$expand_i1_val18; //@line 11145
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 11146
       HEAP32[$152 >> 2] = $14; //@line 11147
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 11148
       HEAP32[$153 >> 2] = $16; //@line 11149
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 11150
       HEAP32[$154 >> 2] = $48; //@line 11151
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 11152
       HEAP32[$155 >> 2] = $50; //@line 11153
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 11154
       HEAP32[$156 >> 2] = $148; //@line 11155
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 11156
       HEAP32[$157 >> 2] = $147; //@line 11157
       sp = STACKTOP; //@line 11158
       return;
      }
     }
    }
    $159 = HEAP32[35] | 0; //@line 11163
    $160 = HEAP32[28] | 0; //@line 11164
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11165
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 11166
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11169
     sp = STACKTOP; //@line 11170
     return;
    }
    ___async_unwind = 0; //@line 11173
    HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11174
    sp = STACKTOP; //@line 11175
    return;
   }
  }
 } while (0);
 $161 = HEAP32[38] | 0; //@line 11180
 if (!$161) {
  return;
 }
 $163 = HEAP32[39] | 0; //@line 11185
 HEAP32[39] = 0; //@line 11186
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11187
 FUNCTION_TABLE_v[$161 & 0](); //@line 11188
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11191
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 11192
  HEAP32[$164 >> 2] = $163; //@line 11193
  sp = STACKTOP; //@line 11194
  return;
 }
 ___async_unwind = 0; //@line 11197
 HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11198
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 11199
 HEAP32[$164 >> 2] = $163; //@line 11200
 sp = STACKTOP; //@line 11201
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4134
 $3 = HEAP32[1021] | 0; //@line 4135
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4138
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4142
 $7 = $6 & 3; //@line 4143
 if (($7 | 0) == 1) {
  _abort(); //@line 4146
 }
 $9 = $6 & -8; //@line 4149
 $10 = $2 + $9 | 0; //@line 4150
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4155
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4161
   $17 = $13 + $9 | 0; //@line 4162
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4165
   }
   if ((HEAP32[1022] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4171
    $106 = HEAP32[$105 >> 2] | 0; //@line 4172
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4176
     $$1382 = $17; //@line 4176
     $114 = $16; //@line 4176
     break;
    }
    HEAP32[1019] = $17; //@line 4179
    HEAP32[$105 >> 2] = $106 & -2; //@line 4181
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4184
    HEAP32[$16 + $17 >> 2] = $17; //@line 4186
    return;
   }
   $21 = $13 >>> 3; //@line 4189
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4193
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4195
    $28 = 4108 + ($21 << 1 << 2) | 0; //@line 4197
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4202
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4209
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1017] = HEAP32[1017] & ~(1 << $21); //@line 4219
     $$1 = $16; //@line 4220
     $$1382 = $17; //@line 4220
     $114 = $16; //@line 4220
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4226
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4230
     }
     $41 = $26 + 8 | 0; //@line 4233
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4237
     } else {
      _abort(); //@line 4239
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4244
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4245
    $$1 = $16; //@line 4246
    $$1382 = $17; //@line 4246
    $114 = $16; //@line 4246
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4250
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4252
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4256
     $60 = $59 + 4 | 0; //@line 4257
     $61 = HEAP32[$60 >> 2] | 0; //@line 4258
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4261
      if (!$63) {
       $$3 = 0; //@line 4264
       break;
      } else {
       $$1387 = $63; //@line 4267
       $$1390 = $59; //@line 4267
      }
     } else {
      $$1387 = $61; //@line 4270
      $$1390 = $60; //@line 4270
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4273
      $66 = HEAP32[$65 >> 2] | 0; //@line 4274
      if ($66 | 0) {
       $$1387 = $66; //@line 4277
       $$1390 = $65; //@line 4277
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4280
      $69 = HEAP32[$68 >> 2] | 0; //@line 4281
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4286
       $$1390 = $68; //@line 4286
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4291
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4294
      $$3 = $$1387; //@line 4295
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4300
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4303
     }
     $53 = $51 + 12 | 0; //@line 4306
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4310
     }
     $56 = $48 + 8 | 0; //@line 4313
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4317
      HEAP32[$56 >> 2] = $51; //@line 4318
      $$3 = $48; //@line 4319
      break;
     } else {
      _abort(); //@line 4322
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4329
    $$1382 = $17; //@line 4329
    $114 = $16; //@line 4329
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4332
    $75 = 4372 + ($74 << 2) | 0; //@line 4333
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4338
      if (!$$3) {
       HEAP32[1018] = HEAP32[1018] & ~(1 << $74); //@line 4345
       $$1 = $16; //@line 4346
       $$1382 = $17; //@line 4346
       $114 = $16; //@line 4346
       break L10;
      }
     } else {
      if ((HEAP32[1021] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4353
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4361
       if (!$$3) {
        $$1 = $16; //@line 4364
        $$1382 = $17; //@line 4364
        $114 = $16; //@line 4364
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1021] | 0; //@line 4372
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4375
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4379
    $92 = $16 + 16 | 0; //@line 4380
    $93 = HEAP32[$92 >> 2] | 0; //@line 4381
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4387
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4391
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4393
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4399
    if (!$99) {
     $$1 = $16; //@line 4402
     $$1382 = $17; //@line 4402
     $114 = $16; //@line 4402
    } else {
     if ((HEAP32[1021] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4407
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4411
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4413
      $$1 = $16; //@line 4414
      $$1382 = $17; //@line 4414
      $114 = $16; //@line 4414
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4420
   $$1382 = $9; //@line 4420
   $114 = $2; //@line 4420
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4425
 }
 $115 = $10 + 4 | 0; //@line 4428
 $116 = HEAP32[$115 >> 2] | 0; //@line 4429
 if (!($116 & 1)) {
  _abort(); //@line 4433
 }
 if (!($116 & 2)) {
  if ((HEAP32[1023] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1020] | 0) + $$1382 | 0; //@line 4443
   HEAP32[1020] = $124; //@line 4444
   HEAP32[1023] = $$1; //@line 4445
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4448
   if (($$1 | 0) != (HEAP32[1022] | 0)) {
    return;
   }
   HEAP32[1022] = 0; //@line 4454
   HEAP32[1019] = 0; //@line 4455
   return;
  }
  if ((HEAP32[1022] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1019] | 0) + $$1382 | 0; //@line 4462
   HEAP32[1019] = $132; //@line 4463
   HEAP32[1022] = $114; //@line 4464
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4467
   HEAP32[$114 + $132 >> 2] = $132; //@line 4469
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4473
  $138 = $116 >>> 3; //@line 4474
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4479
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4481
    $145 = 4108 + ($138 << 1 << 2) | 0; //@line 4483
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1021] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4489
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4496
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1017] = HEAP32[1017] & ~(1 << $138); //@line 4506
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4512
    } else {
     if ((HEAP32[1021] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4517
     }
     $160 = $143 + 8 | 0; //@line 4520
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4524
     } else {
      _abort(); //@line 4526
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4531
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4532
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4535
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4537
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4541
      $180 = $179 + 4 | 0; //@line 4542
      $181 = HEAP32[$180 >> 2] | 0; //@line 4543
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4546
       if (!$183) {
        $$3400 = 0; //@line 4549
        break;
       } else {
        $$1398 = $183; //@line 4552
        $$1402 = $179; //@line 4552
       }
      } else {
       $$1398 = $181; //@line 4555
       $$1402 = $180; //@line 4555
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4558
       $186 = HEAP32[$185 >> 2] | 0; //@line 4559
       if ($186 | 0) {
        $$1398 = $186; //@line 4562
        $$1402 = $185; //@line 4562
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4565
       $189 = HEAP32[$188 >> 2] | 0; //@line 4566
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4571
        $$1402 = $188; //@line 4571
       }
      }
      if ((HEAP32[1021] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4577
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4580
       $$3400 = $$1398; //@line 4581
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4586
      if ((HEAP32[1021] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4590
      }
      $173 = $170 + 12 | 0; //@line 4593
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4597
      }
      $176 = $167 + 8 | 0; //@line 4600
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4604
       HEAP32[$176 >> 2] = $170; //@line 4605
       $$3400 = $167; //@line 4606
       break;
      } else {
       _abort(); //@line 4609
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4617
     $196 = 4372 + ($195 << 2) | 0; //@line 4618
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4623
       if (!$$3400) {
        HEAP32[1018] = HEAP32[1018] & ~(1 << $195); //@line 4630
        break L108;
       }
      } else {
       if ((HEAP32[1021] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4637
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4645
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1021] | 0; //@line 4655
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4658
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4662
     $213 = $10 + 16 | 0; //@line 4663
     $214 = HEAP32[$213 >> 2] | 0; //@line 4664
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4670
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4674
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4676
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4682
     if ($220 | 0) {
      if ((HEAP32[1021] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4688
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4692
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4694
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4703
  HEAP32[$114 + $137 >> 2] = $137; //@line 4705
  if (($$1 | 0) == (HEAP32[1022] | 0)) {
   HEAP32[1019] = $137; //@line 4709
   return;
  } else {
   $$2 = $137; //@line 4712
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4716
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4719
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4721
  $$2 = $$1382; //@line 4722
 }
 $235 = $$2 >>> 3; //@line 4724
 if ($$2 >>> 0 < 256) {
  $238 = 4108 + ($235 << 1 << 2) | 0; //@line 4728
  $239 = HEAP32[1017] | 0; //@line 4729
  $240 = 1 << $235; //@line 4730
  if (!($239 & $240)) {
   HEAP32[1017] = $239 | $240; //@line 4735
   $$0403 = $238; //@line 4737
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4737
  } else {
   $244 = $238 + 8 | 0; //@line 4739
   $245 = HEAP32[$244 >> 2] | 0; //@line 4740
   if ((HEAP32[1021] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4744
   } else {
    $$0403 = $245; //@line 4747
    $$pre$phiZ2D = $244; //@line 4747
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4750
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4752
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4754
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4756
  return;
 }
 $251 = $$2 >>> 8; //@line 4759
 if (!$251) {
  $$0396 = 0; //@line 4762
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4766
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4770
   $257 = $251 << $256; //@line 4771
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4774
   $262 = $257 << $260; //@line 4776
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4779
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4784
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4790
  }
 }
 $276 = 4372 + ($$0396 << 2) | 0; //@line 4793
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4795
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4798
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4799
 $280 = HEAP32[1018] | 0; //@line 4800
 $281 = 1 << $$0396; //@line 4801
 do {
  if (!($280 & $281)) {
   HEAP32[1018] = $280 | $281; //@line 4807
   HEAP32[$276 >> 2] = $$1; //@line 4808
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4810
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4812
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4814
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4822
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4822
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4829
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4833
    $301 = HEAP32[$299 >> 2] | 0; //@line 4835
    if (!$301) {
     label = 121; //@line 4838
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4841
     $$0384 = $301; //@line 4841
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1021] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4848
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4851
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4853
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4855
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4857
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4862
    $309 = HEAP32[$308 >> 2] | 0; //@line 4863
    $310 = HEAP32[1021] | 0; //@line 4864
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4870
     HEAP32[$308 >> 2] = $$1; //@line 4871
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4873
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4875
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4877
     break;
    } else {
     _abort(); //@line 4880
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1025] | 0) + -1 | 0; //@line 4887
 HEAP32[1025] = $319; //@line 4888
 if (!$319) {
  $$0212$in$i = 4524; //@line 4891
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4896
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4902
  }
 }
 HEAP32[1025] = -1; //@line 4905
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9245
 STACKTOP = STACKTOP + 1056 | 0; //@line 9246
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 9246
 $2 = sp + 1024 | 0; //@line 9247
 $3 = sp; //@line 9248
 HEAP32[$2 >> 2] = 0; //@line 9249
 HEAP32[$2 + 4 >> 2] = 0; //@line 9249
 HEAP32[$2 + 8 >> 2] = 0; //@line 9249
 HEAP32[$2 + 12 >> 2] = 0; //@line 9249
 HEAP32[$2 + 16 >> 2] = 0; //@line 9249
 HEAP32[$2 + 20 >> 2] = 0; //@line 9249
 HEAP32[$2 + 24 >> 2] = 0; //@line 9249
 HEAP32[$2 + 28 >> 2] = 0; //@line 9249
 $4 = HEAP8[$1 >> 0] | 0; //@line 9250
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 9254
   $$0185$ph$lcssa327 = -1; //@line 9254
   $$0187219$ph325326 = 0; //@line 9254
   $$1176$ph$ph$lcssa208 = 1; //@line 9254
   $$1186$ph$lcssa = -1; //@line 9254
   label = 26; //@line 9255
  } else {
   $$0187263 = 0; //@line 9257
   $10 = $4; //@line 9257
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 9263
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 9271
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 9274
    $$0187263 = $$0187263 + 1 | 0; //@line 9275
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9278
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9280
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9288
   if ($23) {
    $$0183$ph260 = 0; //@line 9290
    $$0185$ph259 = -1; //@line 9290
    $130 = 1; //@line 9290
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9292
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9292
     $131 = $130; //@line 9292
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9294
      $132 = $131; //@line 9294
      L10 : while (1) {
       $$0179242 = 1; //@line 9296
       $25 = $132; //@line 9296
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9300
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9302
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9308
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9312
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9317
         $$0185$ph$lcssa = $$0185$ph259; //@line 9317
         break L6;
        } else {
         $25 = $27; //@line 9315
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9321
       $132 = $37 + 1 | 0; //@line 9322
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9327
        $$0185$ph$lcssa = $$0185$ph259; //@line 9327
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9325
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9332
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9336
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9341
       $$0185$ph$lcssa = $$0185$ph259; //@line 9341
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9339
       $$0183$ph197$ph253 = $25; //@line 9339
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9346
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9351
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9351
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9349
      $$0185$ph259 = $$0183$ph197248; //@line 9349
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9356
     $$1186$ph238 = -1; //@line 9356
     $133 = 1; //@line 9356
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9358
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9358
      $135 = $133; //@line 9358
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9360
       $134 = $135; //@line 9360
       L25 : while (1) {
        $$1180222 = 1; //@line 9362
        $52 = $134; //@line 9362
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9366
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9368
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9374
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 9378
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9383
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9383
          $$0187219$ph325326 = $$0187263; //@line 9383
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9383
          $$1186$ph$lcssa = $$1186$ph238; //@line 9383
          label = 26; //@line 9384
          break L1;
         } else {
          $52 = $45; //@line 9381
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 9388
        $134 = $56 + 1 | 0; //@line 9389
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9394
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9394
         $$0187219$ph325326 = $$0187263; //@line 9394
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9394
         $$1186$ph$lcssa = $$1186$ph238; //@line 9394
         label = 26; //@line 9395
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 9392
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 9400
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 9404
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9409
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9409
        $$0187219$ph325326 = $$0187263; //@line 9409
        $$1176$ph$ph$lcssa208 = $60; //@line 9409
        $$1186$ph$lcssa = $$1186$ph238; //@line 9409
        label = 26; //@line 9410
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 9407
        $$1184$ph193$ph232 = $52; //@line 9407
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 9415
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9420
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9420
       $$0187219$ph325326 = $$0187263; //@line 9420
       $$1176$ph$ph$lcssa208 = 1; //@line 9420
       $$1186$ph$lcssa = $$1184$ph193227; //@line 9420
       label = 26; //@line 9421
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 9418
       $$1186$ph238 = $$1184$ph193227; //@line 9418
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9426
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9426
     $$0187219$ph325326 = $$0187263; //@line 9426
     $$1176$ph$ph$lcssa208 = 1; //@line 9426
     $$1186$ph$lcssa = -1; //@line 9426
     label = 26; //@line 9427
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 9430
    $$0185$ph$lcssa327 = -1; //@line 9430
    $$0187219$ph325326 = $$0187263; //@line 9430
    $$1176$ph$ph$lcssa208 = 1; //@line 9430
    $$1186$ph$lcssa = -1; //@line 9430
    label = 26; //@line 9431
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 9439
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 9440
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 9441
   $70 = $$1186$$0185 + 1 | 0; //@line 9443
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 9448
    $$3178 = $$1176$$0175; //@line 9448
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 9451
    $$0168 = 0; //@line 9455
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 9455
   }
   $78 = $$0187219$ph325326 | 63; //@line 9457
   $79 = $$0187219$ph325326 + -1 | 0; //@line 9458
   $80 = ($$0168 | 0) != 0; //@line 9459
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 9460
   $$0166 = $0; //@line 9461
   $$0169 = 0; //@line 9461
   $$0170 = $0; //@line 9461
   while (1) {
    $83 = $$0166; //@line 9464
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 9469
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 9473
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 9480
        break L35;
       } else {
        $$3173 = $86; //@line 9483
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 9488
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 9492
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 9504
      $$2181$sink = $$0187219$ph325326; //@line 9504
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 9509
      if ($105 | 0) {
       $$0169$be = 0; //@line 9517
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 9517
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 9521
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 9523
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 9527
       } else {
        $$3182221 = $111; //@line 9529
        $$pr = $113; //@line 9529
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 9537
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 9539
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 9542
          break L54;
         } else {
          $$3182221 = $118; //@line 9545
         }
        }
        $$0169$be = 0; //@line 9549
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 9549
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 9556
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 9559
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 9568
        $$2181$sink = $$3178; //@line 9568
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 9575
    $$0169 = $$0169$be; //@line 9575
    $$0170 = $$3173; //@line 9575
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9579
 return $$3 | 0; //@line 9579
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 13628
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 13629
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 13630
 $d_sroa_0_0_extract_trunc = $b$0; //@line 13631
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 13632
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 13633
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 13635
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13638
    HEAP32[$rem + 4 >> 2] = 0; //@line 13639
   }
   $_0$1 = 0; //@line 13641
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13642
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13643
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 13646
    $_0$0 = 0; //@line 13647
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13648
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13650
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 13651
   $_0$1 = 0; //@line 13652
   $_0$0 = 0; //@line 13653
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13654
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 13657
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13662
     HEAP32[$rem + 4 >> 2] = 0; //@line 13663
    }
    $_0$1 = 0; //@line 13665
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13666
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13667
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 13671
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 13672
    }
    $_0$1 = 0; //@line 13674
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 13675
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13676
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 13678
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 13681
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 13682
    }
    $_0$1 = 0; //@line 13684
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 13685
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13686
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13689
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 13691
    $58 = 31 - $51 | 0; //@line 13692
    $sr_1_ph = $57; //@line 13693
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 13694
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 13695
    $q_sroa_0_1_ph = 0; //@line 13696
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 13697
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 13701
    $_0$0 = 0; //@line 13702
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13703
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13705
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13706
   $_0$1 = 0; //@line 13707
   $_0$0 = 0; //@line 13708
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13709
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13713
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 13715
     $126 = 31 - $119 | 0; //@line 13716
     $130 = $119 - 31 >> 31; //@line 13717
     $sr_1_ph = $125; //@line 13718
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 13719
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 13720
     $q_sroa_0_1_ph = 0; //@line 13721
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 13722
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 13726
     $_0$0 = 0; //@line 13727
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13728
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 13730
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13731
    $_0$1 = 0; //@line 13732
    $_0$0 = 0; //@line 13733
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13734
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 13736
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13739
    $89 = 64 - $88 | 0; //@line 13740
    $91 = 32 - $88 | 0; //@line 13741
    $92 = $91 >> 31; //@line 13742
    $95 = $88 - 32 | 0; //@line 13743
    $105 = $95 >> 31; //@line 13744
    $sr_1_ph = $88; //@line 13745
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 13746
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 13747
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 13748
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 13749
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 13753
    HEAP32[$rem + 4 >> 2] = 0; //@line 13754
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13757
    $_0$0 = $a$0 | 0 | 0; //@line 13758
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13759
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 13761
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 13762
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 13763
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13764
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 13769
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 13770
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 13771
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 13772
  $carry_0_lcssa$1 = 0; //@line 13773
  $carry_0_lcssa$0 = 0; //@line 13774
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 13776
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 13777
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 13778
  $137$1 = tempRet0; //@line 13779
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 13780
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 13781
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 13782
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 13783
  $sr_1202 = $sr_1_ph; //@line 13784
  $carry_0203 = 0; //@line 13785
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 13787
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 13788
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 13789
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 13790
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 13791
   $150$1 = tempRet0; //@line 13792
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 13793
   $carry_0203 = $151$0 & 1; //@line 13794
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 13796
   $r_sroa_1_1200 = tempRet0; //@line 13797
   $sr_1202 = $sr_1202 - 1 | 0; //@line 13798
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 13810
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 13811
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 13812
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 13813
  $carry_0_lcssa$1 = 0; //@line 13814
  $carry_0_lcssa$0 = $carry_0203; //@line 13815
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 13817
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 13818
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 13821
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 13822
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 13824
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 13825
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13826
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1163
 STACKTOP = STACKTOP + 32 | 0; //@line 1164
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1164
 $0 = sp; //@line 1165
 _gpio_init_out($0, 50); //@line 1166
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1169
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1170
  _wait_ms(150); //@line 1171
  if (___async) {
   label = 3; //@line 1174
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1177
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1179
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1180
  _wait_ms(150); //@line 1181
  if (___async) {
   label = 5; //@line 1184
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1187
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1189
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1190
  _wait_ms(150); //@line 1191
  if (___async) {
   label = 7; //@line 1194
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1197
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1199
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1200
  _wait_ms(150); //@line 1201
  if (___async) {
   label = 9; //@line 1204
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1207
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1209
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1210
  _wait_ms(150); //@line 1211
  if (___async) {
   label = 11; //@line 1214
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1217
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1219
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1220
  _wait_ms(150); //@line 1221
  if (___async) {
   label = 13; //@line 1224
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1227
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1229
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1230
  _wait_ms(150); //@line 1231
  if (___async) {
   label = 15; //@line 1234
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1237
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1239
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1240
  _wait_ms(150); //@line 1241
  if (___async) {
   label = 17; //@line 1244
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1247
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1249
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1250
  _wait_ms(400); //@line 1251
  if (___async) {
   label = 19; //@line 1254
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1257
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1259
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1260
  _wait_ms(400); //@line 1261
  if (___async) {
   label = 21; //@line 1264
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1267
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1269
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1270
  _wait_ms(400); //@line 1271
  if (___async) {
   label = 23; //@line 1274
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1277
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1279
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1280
  _wait_ms(400); //@line 1281
  if (___async) {
   label = 25; //@line 1284
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1287
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1289
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1290
  _wait_ms(400); //@line 1291
  if (___async) {
   label = 27; //@line 1294
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1297
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1299
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1300
  _wait_ms(400); //@line 1301
  if (___async) {
   label = 29; //@line 1304
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1307
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1309
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1310
  _wait_ms(400); //@line 1311
  if (___async) {
   label = 31; //@line 1314
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1317
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1319
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1320
  _wait_ms(400); //@line 1321
  if (___async) {
   label = 33; //@line 1324
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1327
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 28; //@line 1331
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1333
   sp = STACKTOP; //@line 1334
   STACKTOP = sp; //@line 1335
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 29; //@line 1339
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1341
   sp = STACKTOP; //@line 1342
   STACKTOP = sp; //@line 1343
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 30; //@line 1347
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1349
   sp = STACKTOP; //@line 1350
   STACKTOP = sp; //@line 1351
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 31; //@line 1355
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1357
   sp = STACKTOP; //@line 1358
   STACKTOP = sp; //@line 1359
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 32; //@line 1363
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1365
   sp = STACKTOP; //@line 1366
   STACKTOP = sp; //@line 1367
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 33; //@line 1371
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1373
   sp = STACKTOP; //@line 1374
   STACKTOP = sp; //@line 1375
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 34; //@line 1379
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1381
   sp = STACKTOP; //@line 1382
   STACKTOP = sp; //@line 1383
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 35; //@line 1387
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1389
   sp = STACKTOP; //@line 1390
   STACKTOP = sp; //@line 1391
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 36; //@line 1395
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1397
   sp = STACKTOP; //@line 1398
   STACKTOP = sp; //@line 1399
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 37; //@line 1403
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1405
   sp = STACKTOP; //@line 1406
   STACKTOP = sp; //@line 1407
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 38; //@line 1411
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1413
   sp = STACKTOP; //@line 1414
   STACKTOP = sp; //@line 1415
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 39; //@line 1419
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1421
   sp = STACKTOP; //@line 1422
   STACKTOP = sp; //@line 1423
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 40; //@line 1427
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1429
   sp = STACKTOP; //@line 1430
   STACKTOP = sp; //@line 1431
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 41; //@line 1435
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1437
   sp = STACKTOP; //@line 1438
   STACKTOP = sp; //@line 1439
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 42; //@line 1443
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1445
   sp = STACKTOP; //@line 1446
   STACKTOP = sp; //@line 1447
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 43; //@line 1451
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1453
   sp = STACKTOP; //@line 1454
   STACKTOP = sp; //@line 1455
   return;
  }
 }
}
function _mbed_vtracef__async_cb_4($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $34 = 0, $38 = 0, $4 = 0, $42 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11289
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11291
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11293
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11295
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 11302
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11304
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11306
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11308
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11310
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11314
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11316
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11318
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11320
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11324
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11328
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 11332
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 11336
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 11338
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 11341
 $50 = _snprintf($4, $6, 1034, $2) | 0; //@line 11342
 $$10 = ($50 | 0) >= ($6 | 0) ? 0 : $50; //@line 11344
 $53 = $4 + $$10 | 0; //@line 11346
 $54 = $6 - $$10 | 0; //@line 11347
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 11351
   $$3169 = $53; //@line 11351
   label = 4; //@line 11352
  }
 } else {
  $$3147168 = $6; //@line 11355
  $$3169 = $4; //@line 11355
  label = 4; //@line 11356
 }
 if ((label | 0) == 4) {
  $56 = $18 + -2 | 0; //@line 11359
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$34 >> 2] = $30; //@line 11365
    $$5156 = _snprintf($$3169, $$3147168, 1037, $34) | 0; //@line 11367
    break;
   }
  case 1:
   {
    HEAP32[$28 >> 2] = $30; //@line 11371
    $$5156 = _snprintf($$3169, $$3147168, 1052, $28) | 0; //@line 11373
    break;
   }
  case 3:
   {
    HEAP32[$42 >> 2] = $30; //@line 11377
    $$5156 = _snprintf($$3169, $$3147168, 1067, $42) | 0; //@line 11379
    break;
   }
  case 7:
   {
    HEAP32[$38 >> 2] = $30; //@line 11383
    $$5156 = _snprintf($$3169, $$3147168, 1082, $38) | 0; //@line 11385
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1097, $20) | 0; //@line 11390
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 11394
  $67 = $$3169 + $$5156$ | 0; //@line 11396
  $68 = $$3147168 - $$5156$ | 0; //@line 11397
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 11401
   $70 = _vsnprintf($67, $68, $24, $26) | 0; //@line 11402
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 21; //@line 11405
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 11406
    $$expand_i1_val = $12 & 1; //@line 11407
    HEAP8[$71 >> 0] = $$expand_i1_val; //@line 11408
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 11409
    HEAP32[$72 >> 2] = $14; //@line 11410
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 11411
    HEAP32[$73 >> 2] = $16; //@line 11412
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 11413
    HEAP32[$74 >> 2] = $46; //@line 11414
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 11415
    HEAP32[$75 >> 2] = $48; //@line 11416
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 11417
    HEAP32[$76 >> 2] = $68; //@line 11418
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 11419
    HEAP32[$77 >> 2] = $67; //@line 11420
    sp = STACKTOP; //@line 11421
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 11425
   ___async_unwind = 0; //@line 11426
   HEAP32[$ReallocAsyncCtx10 >> 2] = 21; //@line 11427
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 11428
   $$expand_i1_val = $12 & 1; //@line 11429
   HEAP8[$71 >> 0] = $$expand_i1_val; //@line 11430
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 11431
   HEAP32[$72 >> 2] = $14; //@line 11432
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 11433
   HEAP32[$73 >> 2] = $16; //@line 11434
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 11435
   HEAP32[$74 >> 2] = $46; //@line 11436
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 11437
   HEAP32[$75 >> 2] = $48; //@line 11438
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 11439
   HEAP32[$76 >> 2] = $68; //@line 11440
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 11441
   HEAP32[$77 >> 2] = $67; //@line 11442
   sp = STACKTOP; //@line 11443
   return;
  }
 }
 $79 = HEAP32[35] | 0; //@line 11447
 $80 = HEAP32[28] | 0; //@line 11448
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11449
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 11450
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11453
  sp = STACKTOP; //@line 11454
  return;
 }
 ___async_unwind = 0; //@line 11457
 HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11458
 sp = STACKTOP; //@line 11459
 return;
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $27 = 0, $31 = 0, $35 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx26 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer14 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer6 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 79
 STACKTOP = STACKTOP + 80 | 0; //@line 80
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(80); //@line 80
 $vararg_buffer20 = sp + 64 | 0; //@line 81
 $vararg_buffer18 = sp + 56 | 0; //@line 82
 $vararg_buffer14 = sp + 48 | 0; //@line 83
 $vararg_buffer12 = sp + 40 | 0; //@line 84
 $vararg_buffer8 = sp + 32 | 0; //@line 85
 $vararg_buffer6 = sp + 24 | 0; //@line 86
 $vararg_buffer1 = sp + 8 | 0; //@line 87
 _printf(740, sp) | 0; //@line 89
 $6 = $4 & 255; //@line 90
 $7 = $5 & 255; //@line 91
 HEAP32[$vararg_buffer1 >> 2] = $2; //@line 92
 HEAP32[$vararg_buffer1 + 4 >> 2] = $3; //@line 94
 HEAP32[$vararg_buffer1 + 8 >> 2] = $6; //@line 96
 HEAP32[$vararg_buffer1 + 12 >> 2] = $7; //@line 98
 _printf(777, $vararg_buffer1) | 0; //@line 99
 $AsyncCtx34 = _emscripten_alloc_async_context(76, sp) | 0; //@line 100
 _putchar(10) | 0; //@line 101
 if (___async) {
  HEAP32[$AsyncCtx34 >> 2] = 8; //@line 104
  HEAP32[$AsyncCtx34 + 4 >> 2] = $0; //@line 106
  HEAP32[$AsyncCtx34 + 8 >> 2] = $6; //@line 108
  HEAP32[$AsyncCtx34 + 12 >> 2] = $7; //@line 110
  HEAP32[$AsyncCtx34 + 16 >> 2] = $vararg_buffer6; //@line 112
  HEAP32[$AsyncCtx34 + 20 >> 2] = $vararg_buffer6; //@line 114
  HEAP32[$AsyncCtx34 + 24 >> 2] = $vararg_buffer8; //@line 116
  HEAP32[$AsyncCtx34 + 28 >> 2] = $vararg_buffer8; //@line 118
  HEAP32[$AsyncCtx34 + 32 >> 2] = $3; //@line 120
  HEAP32[$AsyncCtx34 + 36 >> 2] = $vararg_buffer12; //@line 122
  HEAP32[$AsyncCtx34 + 40 >> 2] = $vararg_buffer12; //@line 124
  HEAP32[$AsyncCtx34 + 44 >> 2] = $vararg_buffer14; //@line 126
  HEAP32[$AsyncCtx34 + 48 >> 2] = $vararg_buffer14; //@line 128
  HEAP32[$AsyncCtx34 + 52 >> 2] = $1; //@line 130
  HEAP32[$AsyncCtx34 + 56 >> 2] = $2; //@line 132
  HEAP32[$AsyncCtx34 + 60 >> 2] = $vararg_buffer18; //@line 134
  HEAP32[$AsyncCtx34 + 64 >> 2] = $vararg_buffer18; //@line 136
  HEAP32[$AsyncCtx34 + 68 >> 2] = $vararg_buffer20; //@line 138
  HEAP32[$AsyncCtx34 + 72 >> 2] = $vararg_buffer20; //@line 140
  sp = STACKTOP; //@line 141
  STACKTOP = sp; //@line 142
  return;
 }
 _emscripten_free_async_context($AsyncCtx34 | 0); //@line 144
 _emscripten_asm_const_i(0) | 0; //@line 145
 $27 = $0 + 752 | 0; //@line 146
 if ((HEAP32[$27 >> 2] | 0) != ($6 | 0)) {
  _printf(740, $vararg_buffer6) | 0; //@line 150
  HEAP32[$vararg_buffer8 >> 2] = HEAP32[$27 >> 2]; //@line 152
  HEAP32[$vararg_buffer8 + 4 >> 2] = $6; //@line 154
  _printf(859, $vararg_buffer8) | 0; //@line 155
  $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 156
  _putchar(10) | 0; //@line 157
  if (___async) {
   HEAP32[$AsyncCtx30 >> 2] = 9; //@line 160
   sp = STACKTOP; //@line 161
   STACKTOP = sp; //@line 162
   return;
  }
  _emscripten_free_async_context($AsyncCtx30 | 0); //@line 164
  STACKTOP = sp; //@line 165
  return;
 }
 $31 = $0 + 756 | 0; //@line 167
 if ((HEAP32[$31 >> 2] | 0) != ($7 | 0)) {
  _printf(740, $vararg_buffer12) | 0; //@line 171
  HEAP32[$vararg_buffer14 >> 2] = HEAP32[$31 >> 2]; //@line 173
  HEAP32[$vararg_buffer14 + 4 >> 2] = $7; //@line 175
  _printf(906, $vararg_buffer14) | 0; //@line 176
  $AsyncCtx26 = _emscripten_alloc_async_context(4, sp) | 0; //@line 177
  _putchar(10) | 0; //@line 178
  if (___async) {
   HEAP32[$AsyncCtx26 >> 2] = 10; //@line 181
   sp = STACKTOP; //@line 182
   STACKTOP = sp; //@line 183
   return;
  }
  _emscripten_free_async_context($AsyncCtx26 | 0); //@line 185
  STACKTOP = sp; //@line 186
  return;
 }
 $35 = $0 + 692 | 0; //@line 188
 if ((HEAP32[$35 >> 2] | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 193
  HEAP8[$0 + 782 >> 0] = $2; //@line 196
  HEAP8[$0 + 781 >> 0] = -35; //@line 198
  HEAP8[$0 + 780 >> 0] = -5; //@line 200
  HEAP8[$0 + 783 >> 0] = 1; //@line 202
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(1) | 0; //@line 205
  STACKTOP = sp; //@line 206
  return;
 }
 _printf(740, $vararg_buffer18) | 0; //@line 208
 HEAP32[$vararg_buffer20 >> 2] = HEAP32[$35 >> 2]; //@line 210
 HEAP32[$vararg_buffer20 + 4 >> 2] = $3; //@line 212
 _printf(953, $vararg_buffer20) | 0; //@line 213
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 214
 _putchar(10) | 0; //@line 215
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 11; //@line 218
  sp = STACKTOP; //@line 219
  STACKTOP = sp; //@line 220
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 222
 STACKTOP = sp; //@line 223
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7346
      $10 = HEAP32[$9 >> 2] | 0; //@line 7347
      HEAP32[$2 >> 2] = $9 + 4; //@line 7349
      HEAP32[$0 >> 2] = $10; //@line 7350
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7366
      $17 = HEAP32[$16 >> 2] | 0; //@line 7367
      HEAP32[$2 >> 2] = $16 + 4; //@line 7369
      $20 = $0; //@line 7372
      HEAP32[$20 >> 2] = $17; //@line 7374
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7377
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7393
      $30 = HEAP32[$29 >> 2] | 0; //@line 7394
      HEAP32[$2 >> 2] = $29 + 4; //@line 7396
      $31 = $0; //@line 7397
      HEAP32[$31 >> 2] = $30; //@line 7399
      HEAP32[$31 + 4 >> 2] = 0; //@line 7402
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7418
      $41 = $40; //@line 7419
      $43 = HEAP32[$41 >> 2] | 0; //@line 7421
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7424
      HEAP32[$2 >> 2] = $40 + 8; //@line 7426
      $47 = $0; //@line 7427
      HEAP32[$47 >> 2] = $43; //@line 7429
      HEAP32[$47 + 4 >> 2] = $46; //@line 7432
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7448
      $57 = HEAP32[$56 >> 2] | 0; //@line 7449
      HEAP32[$2 >> 2] = $56 + 4; //@line 7451
      $59 = ($57 & 65535) << 16 >> 16; //@line 7453
      $62 = $0; //@line 7456
      HEAP32[$62 >> 2] = $59; //@line 7458
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7461
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7477
      $72 = HEAP32[$71 >> 2] | 0; //@line 7478
      HEAP32[$2 >> 2] = $71 + 4; //@line 7480
      $73 = $0; //@line 7482
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7484
      HEAP32[$73 + 4 >> 2] = 0; //@line 7487
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7503
      $83 = HEAP32[$82 >> 2] | 0; //@line 7504
      HEAP32[$2 >> 2] = $82 + 4; //@line 7506
      $85 = ($83 & 255) << 24 >> 24; //@line 7508
      $88 = $0; //@line 7511
      HEAP32[$88 >> 2] = $85; //@line 7513
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7516
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7532
      $98 = HEAP32[$97 >> 2] | 0; //@line 7533
      HEAP32[$2 >> 2] = $97 + 4; //@line 7535
      $99 = $0; //@line 7537
      HEAP32[$99 >> 2] = $98 & 255; //@line 7539
      HEAP32[$99 + 4 >> 2] = 0; //@line 7542
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7558
      $109 = +HEAPF64[$108 >> 3]; //@line 7559
      HEAP32[$2 >> 2] = $108 + 8; //@line 7561
      HEAPF64[$0 >> 3] = $109; //@line 7562
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7578
      $116 = +HEAPF64[$115 >> 3]; //@line 7579
      HEAP32[$2 >> 2] = $115 + 8; //@line 7581
      HEAPF64[$0 >> 3] = $116; //@line 7582
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
 sp = STACKTOP; //@line 6246
 STACKTOP = STACKTOP + 224 | 0; //@line 6247
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6247
 $3 = sp + 120 | 0; //@line 6248
 $4 = sp + 80 | 0; //@line 6249
 $5 = sp; //@line 6250
 $6 = sp + 136 | 0; //@line 6251
 dest = $4; //@line 6252
 stop = dest + 40 | 0; //@line 6252
 do {
  HEAP32[dest >> 2] = 0; //@line 6252
  dest = dest + 4 | 0; //@line 6252
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6254
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6258
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6265
  } else {
   $43 = 0; //@line 6267
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6269
  $14 = $13 & 32; //@line 6270
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6276
  }
  $19 = $0 + 48 | 0; //@line 6278
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6283
    $24 = HEAP32[$23 >> 2] | 0; //@line 6284
    HEAP32[$23 >> 2] = $6; //@line 6285
    $25 = $0 + 28 | 0; //@line 6286
    HEAP32[$25 >> 2] = $6; //@line 6287
    $26 = $0 + 20 | 0; //@line 6288
    HEAP32[$26 >> 2] = $6; //@line 6289
    HEAP32[$19 >> 2] = 80; //@line 6290
    $28 = $0 + 16 | 0; //@line 6292
    HEAP32[$28 >> 2] = $6 + 80; //@line 6293
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6294
    if (!$24) {
     $$1 = $29; //@line 6297
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6300
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6301
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6302
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 63; //@line 6305
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6307
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6309
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6311
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6313
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6315
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6317
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6319
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6321
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6323
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6325
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6327
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6329
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6331
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6333
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6335
      sp = STACKTOP; //@line 6336
      STACKTOP = sp; //@line 6337
      return 0; //@line 6337
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6339
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6342
      HEAP32[$23 >> 2] = $24; //@line 6343
      HEAP32[$19 >> 2] = 0; //@line 6344
      HEAP32[$28 >> 2] = 0; //@line 6345
      HEAP32[$25 >> 2] = 0; //@line 6346
      HEAP32[$26 >> 2] = 0; //@line 6347
      $$1 = $$; //@line 6348
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6354
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6357
  HEAP32[$0 >> 2] = $51 | $14; //@line 6362
  if ($43 | 0) {
   ___unlockfile($0); //@line 6365
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6367
 }
 STACKTOP = sp; //@line 6369
 return $$0 | 0; //@line 6369
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10303
 STACKTOP = STACKTOP + 64 | 0; //@line 10304
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10304
 $4 = sp; //@line 10305
 $5 = HEAP32[$0 >> 2] | 0; //@line 10306
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10309
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10311
 HEAP32[$4 >> 2] = $2; //@line 10312
 HEAP32[$4 + 4 >> 2] = $0; //@line 10314
 HEAP32[$4 + 8 >> 2] = $1; //@line 10316
 HEAP32[$4 + 12 >> 2] = $3; //@line 10318
 $14 = $4 + 16 | 0; //@line 10319
 $15 = $4 + 20 | 0; //@line 10320
 $16 = $4 + 24 | 0; //@line 10321
 $17 = $4 + 28 | 0; //@line 10322
 $18 = $4 + 32 | 0; //@line 10323
 $19 = $4 + 40 | 0; //@line 10324
 dest = $14; //@line 10325
 stop = dest + 36 | 0; //@line 10325
 do {
  HEAP32[dest >> 2] = 0; //@line 10325
  dest = dest + 4 | 0; //@line 10325
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10325
 HEAP8[$14 + 38 >> 0] = 0; //@line 10325
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10330
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10333
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10334
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10335
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 73; //@line 10338
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10340
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10342
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10344
    sp = STACKTOP; //@line 10345
    STACKTOP = sp; //@line 10346
    return 0; //@line 10346
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10348
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10352
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10356
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10359
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10360
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10361
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 74; //@line 10364
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10366
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10368
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10370
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10372
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10374
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10376
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10378
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10380
    sp = STACKTOP; //@line 10381
    STACKTOP = sp; //@line 10382
    return 0; //@line 10382
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10384
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10398
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10406
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10422
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10427
  }
 } while (0);
 STACKTOP = sp; //@line 10430
 return $$0 | 0; //@line 10430
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6118
 $7 = ($2 | 0) != 0; //@line 6122
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6126
   $$03555 = $0; //@line 6127
   $$03654 = $2; //@line 6127
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6132
     $$036$lcssa64 = $$03654; //@line 6132
     label = 6; //@line 6133
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6136
    $12 = $$03654 + -1 | 0; //@line 6137
    $16 = ($12 | 0) != 0; //@line 6141
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6144
     $$03654 = $12; //@line 6144
    } else {
     $$035$lcssa = $11; //@line 6146
     $$036$lcssa = $12; //@line 6146
     $$lcssa = $16; //@line 6146
     label = 5; //@line 6147
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6152
   $$036$lcssa = $2; //@line 6152
   $$lcssa = $7; //@line 6152
   label = 5; //@line 6153
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6158
   $$036$lcssa64 = $$036$lcssa; //@line 6158
   label = 6; //@line 6159
  } else {
   $$2 = $$035$lcssa; //@line 6161
   $$3 = 0; //@line 6161
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6167
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6170
    $$3 = $$036$lcssa64; //@line 6170
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6172
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6176
      $$13745 = $$036$lcssa64; //@line 6176
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6179
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6188
       $30 = $$13745 + -4 | 0; //@line 6189
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6192
        $$13745 = $30; //@line 6192
       } else {
        $$0$lcssa = $29; //@line 6194
        $$137$lcssa = $30; //@line 6194
        label = 11; //@line 6195
        break L11;
       }
      }
      $$140 = $$046; //@line 6199
      $$23839 = $$13745; //@line 6199
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6201
      $$137$lcssa = $$036$lcssa64; //@line 6201
      label = 11; //@line 6202
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6208
      $$3 = 0; //@line 6208
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6211
      $$23839 = $$137$lcssa; //@line 6211
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6218
      $$3 = $$23839; //@line 6218
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6221
     $$23839 = $$23839 + -1 | 0; //@line 6222
     if (!$$23839) {
      $$2 = $35; //@line 6225
      $$3 = 0; //@line 6225
      break;
     } else {
      $$140 = $35; //@line 6228
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6236
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5889
 do {
  if (!$0) {
   do {
    if (!(HEAP32[72] | 0)) {
     $34 = 0; //@line 5897
    } else {
     $12 = HEAP32[72] | 0; //@line 5899
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5900
     $13 = _fflush($12) | 0; //@line 5901
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 59; //@line 5904
      sp = STACKTOP; //@line 5905
      return 0; //@line 5906
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5908
      $34 = $13; //@line 5909
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5915
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5919
    } else {
     $$02327 = $$02325; //@line 5921
     $$02426 = $34; //@line 5921
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5928
      } else {
       $28 = 0; //@line 5930
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5938
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5939
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5944
       $$1 = $25 | $$02426; //@line 5946
      } else {
       $$1 = $$02426; //@line 5948
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5952
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5955
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5958
       break L9;
      } else {
       $$02327 = $$023; //@line 5961
       $$02426 = $$1; //@line 5961
      }
     }
     HEAP32[$AsyncCtx >> 2] = 60; //@line 5964
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5966
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5968
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5970
     sp = STACKTOP; //@line 5971
     return 0; //@line 5972
    }
   } while (0);
   ___ofl_unlock(); //@line 5975
   $$0 = $$024$lcssa; //@line 5976
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5982
    $5 = ___fflush_unlocked($0) | 0; //@line 5983
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 57; //@line 5986
     sp = STACKTOP; //@line 5987
     return 0; //@line 5988
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5990
     $$0 = $5; //@line 5991
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5996
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5997
   $7 = ___fflush_unlocked($0) | 0; //@line 5998
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 58; //@line 6001
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6004
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6006
    sp = STACKTOP; //@line 6007
    return 0; //@line 6008
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6010
   if ($phitmp) {
    $$0 = $7; //@line 6012
   } else {
    ___unlockfile($0); //@line 6014
    $$0 = $7; //@line 6015
   }
  }
 } while (0);
 return $$0 | 0; //@line 6019
}
function _mbed_vtracef__async_cb_9($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11619
 $2 = HEAP8[$0 + 4 >> 0] & 1; //@line 11622
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11624
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11626
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11628
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11630
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11632
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11636
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 11638
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 11640
 $19 = $12 - $$13 | 0; //@line 11641
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[34] | 0; //@line 11645
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $2 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1112, $4) | 0; //@line 11657
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 11660
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 11661
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 22; //@line 11664
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 11665
    HEAP32[$24 >> 2] = $8; //@line 11666
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 11667
    HEAP32[$25 >> 2] = $18; //@line 11668
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 11669
    HEAP32[$26 >> 2] = $19; //@line 11670
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 11671
    HEAP32[$27 >> 2] = $10; //@line 11672
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 11673
    $$expand_i1_val = $2 & 1; //@line 11674
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 11675
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 11676
    HEAP32[$29 >> 2] = $4; //@line 11677
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 11678
    HEAP32[$30 >> 2] = $6; //@line 11679
    sp = STACKTOP; //@line 11680
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 11684
   ___async_unwind = 0; //@line 11685
   HEAP32[$ReallocAsyncCtx6 >> 2] = 22; //@line 11686
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 11687
   HEAP32[$24 >> 2] = $8; //@line 11688
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 11689
   HEAP32[$25 >> 2] = $18; //@line 11690
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 11691
   HEAP32[$26 >> 2] = $19; //@line 11692
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 11693
   HEAP32[$27 >> 2] = $10; //@line 11694
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 11695
   $$expand_i1_val = $2 & 1; //@line 11696
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 11697
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 11698
   HEAP32[$29 >> 2] = $4; //@line 11699
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 11700
   HEAP32[$30 >> 2] = $6; //@line 11701
   sp = STACKTOP; //@line 11702
   return;
  }
 } while (0);
 $34 = HEAP32[35] | 0; //@line 11706
 $35 = HEAP32[28] | 0; //@line 11707
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11708
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 11709
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11712
  sp = STACKTOP; //@line 11713
  return;
 }
 ___async_unwind = 0; //@line 11716
 HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11717
 sp = STACKTOP; //@line 11718
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10485
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10491
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10497
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10500
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10501
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10502
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 77; //@line 10505
     sp = STACKTOP; //@line 10506
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10509
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10517
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10522
     $19 = $1 + 44 | 0; //@line 10523
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10529
     HEAP8[$22 >> 0] = 0; //@line 10530
     $23 = $1 + 53 | 0; //@line 10531
     HEAP8[$23 >> 0] = 0; //@line 10532
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10534
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10537
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10538
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10539
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 76; //@line 10542
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10544
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10546
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10548
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10550
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10552
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10554
      sp = STACKTOP; //@line 10555
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10558
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10562
      label = 13; //@line 10563
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10568
       label = 13; //@line 10569
      } else {
       $$037$off039 = 3; //@line 10571
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10575
      $39 = $1 + 40 | 0; //@line 10576
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10579
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10589
        $$037$off039 = $$037$off038; //@line 10590
       } else {
        $$037$off039 = $$037$off038; //@line 10592
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10595
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10598
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10605
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11728
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11730
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11732
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11734
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11736
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11738
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 11741
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11743
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11745
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11747
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11749
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11751
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11753
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11755
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11757
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11759
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11761
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11763
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11765
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11767
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11769
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 11771
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 11773
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 11775
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 11777
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 11779
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 11785
 $56 = HEAP32[33] | 0; //@line 11786
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 11787
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 11788
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 11792
  ___async_unwind = 0; //@line 11793
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 20; //@line 11795
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 11797
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 11799
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 11801
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 11803
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 11805
 HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 11808
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 11810
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 11812
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $22; //@line 11814
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $24; //@line 11816
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $26; //@line 11818
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $28; //@line 11820
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $30; //@line 11822
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $32; //@line 11824
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $34; //@line 11826
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $36; //@line 11828
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $38; //@line 11830
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $40; //@line 11832
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $42; //@line 11834
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $44; //@line 11836
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $46; //@line 11838
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $48; //@line 11840
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $18; //@line 11842
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $20; //@line 11844
 sp = STACKTOP; //@line 11845
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12278
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12280
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12282
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12284
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1014] | 0)) {
  _serial_init(4060, 2, 3); //@line 12292
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 12294
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12300
  _serial_putc(4060, $9 << 24 >> 24); //@line 12301
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 12304
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 12305
   HEAP32[$18 >> 2] = 0; //@line 12306
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 12307
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 12308
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 12309
   HEAP32[$20 >> 2] = $2; //@line 12310
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 12311
   HEAP8[$21 >> 0] = $9; //@line 12312
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 12313
   HEAP32[$22 >> 2] = $4; //@line 12314
   sp = STACKTOP; //@line 12315
   return;
  }
  ___async_unwind = 0; //@line 12318
  HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 12319
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 12320
  HEAP32[$18 >> 2] = 0; //@line 12321
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 12322
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 12323
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 12324
  HEAP32[$20 >> 2] = $2; //@line 12325
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 12326
  HEAP8[$21 >> 0] = $9; //@line 12327
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 12328
  HEAP32[$22 >> 2] = $4; //@line 12329
  sp = STACKTOP; //@line 12330
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 12333
  _serial_putc(4060, 13); //@line 12334
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 12337
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 12338
   HEAP8[$12 >> 0] = $9; //@line 12339
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 12340
   HEAP32[$13 >> 2] = 0; //@line 12341
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 12342
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 12343
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 12344
   HEAP32[$15 >> 2] = $2; //@line 12345
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 12346
   HEAP32[$16 >> 2] = $4; //@line 12347
   sp = STACKTOP; //@line 12348
   return;
  }
  ___async_unwind = 0; //@line 12351
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 12352
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 12353
  HEAP8[$12 >> 0] = $9; //@line 12354
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 12355
  HEAP32[$13 >> 2] = 0; //@line 12356
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 12357
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 12358
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 12359
  HEAP32[$15 >> 2] = $2; //@line 12360
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 12361
  HEAP32[$16 >> 2] = $4; //@line 12362
  sp = STACKTOP; //@line 12363
  return;
 }
}
function _mbed_error_vfprintf__async_cb_16($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12371
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12375
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12377
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12381
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 12382
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 12388
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12394
  _serial_putc(4060, $13 << 24 >> 24); //@line 12395
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 12398
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 12399
   HEAP32[$22 >> 2] = $12; //@line 12400
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 12401
   HEAP32[$23 >> 2] = $4; //@line 12402
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 12403
   HEAP32[$24 >> 2] = $6; //@line 12404
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 12405
   HEAP8[$25 >> 0] = $13; //@line 12406
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 12407
   HEAP32[$26 >> 2] = $10; //@line 12408
   sp = STACKTOP; //@line 12409
   return;
  }
  ___async_unwind = 0; //@line 12412
  HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 12413
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 12414
  HEAP32[$22 >> 2] = $12; //@line 12415
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 12416
  HEAP32[$23 >> 2] = $4; //@line 12417
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 12418
  HEAP32[$24 >> 2] = $6; //@line 12419
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 12420
  HEAP8[$25 >> 0] = $13; //@line 12421
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 12422
  HEAP32[$26 >> 2] = $10; //@line 12423
  sp = STACKTOP; //@line 12424
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 12427
  _serial_putc(4060, 13); //@line 12428
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 12431
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 12432
   HEAP8[$16 >> 0] = $13; //@line 12433
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 12434
   HEAP32[$17 >> 2] = $12; //@line 12435
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 12436
   HEAP32[$18 >> 2] = $4; //@line 12437
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 12438
   HEAP32[$19 >> 2] = $6; //@line 12439
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 12440
   HEAP32[$20 >> 2] = $10; //@line 12441
   sp = STACKTOP; //@line 12442
   return;
  }
  ___async_unwind = 0; //@line 12445
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 12446
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 12447
  HEAP8[$16 >> 0] = $13; //@line 12448
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 12449
  HEAP32[$17 >> 2] = $12; //@line 12450
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 12451
  HEAP32[$18 >> 2] = $4; //@line 12452
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 12453
  HEAP32[$19 >> 2] = $6; //@line 12454
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 12455
  HEAP32[$20 >> 2] = $10; //@line 12456
  sp = STACKTOP; //@line 12457
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4930
 STACKTOP = STACKTOP + 48 | 0; //@line 4931
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4931
 $vararg_buffer3 = sp + 16 | 0; //@line 4932
 $vararg_buffer = sp; //@line 4933
 $3 = sp + 32 | 0; //@line 4934
 $4 = $0 + 28 | 0; //@line 4935
 $5 = HEAP32[$4 >> 2] | 0; //@line 4936
 HEAP32[$3 >> 2] = $5; //@line 4937
 $7 = $0 + 20 | 0; //@line 4939
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4941
 HEAP32[$3 + 4 >> 2] = $9; //@line 4942
 HEAP32[$3 + 8 >> 2] = $1; //@line 4944
 HEAP32[$3 + 12 >> 2] = $2; //@line 4946
 $12 = $9 + $2 | 0; //@line 4947
 $13 = $0 + 60 | 0; //@line 4948
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4951
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4953
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4955
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4957
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4961
  } else {
   $$04756 = 2; //@line 4963
   $$04855 = $12; //@line 4963
   $$04954 = $3; //@line 4963
   $27 = $17; //@line 4963
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4969
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4971
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4972
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4974
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4976
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4978
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4981
    $44 = $$150 + 4 | 0; //@line 4982
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4985
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4988
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4990
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4992
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4994
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4997
     break L1;
    } else {
     $$04756 = $$1; //@line 5000
     $$04954 = $$150; //@line 5000
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5004
   HEAP32[$4 >> 2] = 0; //@line 5005
   HEAP32[$7 >> 2] = 0; //@line 5006
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5009
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5012
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5017
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5023
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5028
  $25 = $20; //@line 5029
  HEAP32[$4 >> 2] = $25; //@line 5030
  HEAP32[$7 >> 2] = $25; //@line 5031
  $$051 = $2; //@line 5032
 }
 STACKTOP = sp; //@line 5034
 return $$051 | 0; //@line 5034
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_42($0) {
 $0 = $0 | 0;
 var $12 = 0, $16 = 0, $18 = 0, $2 = 0, $22 = 0, $26 = 0, $28 = 0, $30 = 0, $34 = 0, $38 = 0, $4 = 0, $42 = 0, $46 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13459
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13461
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13463
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13465
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13467
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13471
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13475
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13477
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13481
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 13485
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 13487
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 13489
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 13493
 _emscripten_asm_const_i(0) | 0; //@line 13496
 $38 = $2 + 752 | 0; //@line 13497
 if ((HEAP32[$38 >> 2] | 0) != ($4 | 0)) {
  _printf(740, $8) | 0; //@line 13501
  HEAP32[$12 >> 2] = HEAP32[$38 >> 2]; //@line 13503
  HEAP32[$12 + 4 >> 2] = $4; //@line 13505
  _printf(859, $12) | 0; //@line 13506
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 13507
  _putchar(10) | 0; //@line 13508
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 9; //@line 13511
   sp = STACKTOP; //@line 13512
   return;
  }
  ___async_unwind = 0; //@line 13515
  HEAP32[$ReallocAsyncCtx3 >> 2] = 9; //@line 13516
  sp = STACKTOP; //@line 13517
  return;
 }
 $42 = $2 + 756 | 0; //@line 13520
 if ((HEAP32[$42 >> 2] | 0) != ($6 | 0)) {
  _printf(740, $18) | 0; //@line 13524
  HEAP32[$22 >> 2] = HEAP32[$42 >> 2]; //@line 13526
  HEAP32[$22 + 4 >> 2] = $6; //@line 13528
  _printf(906, $22) | 0; //@line 13529
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13530
  _putchar(10) | 0; //@line 13531
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 10; //@line 13534
   sp = STACKTOP; //@line 13535
   return;
  }
  ___async_unwind = 0; //@line 13538
  HEAP32[$ReallocAsyncCtx2 >> 2] = 10; //@line 13539
  sp = STACKTOP; //@line 13540
  return;
 }
 $46 = $2 + 692 | 0; //@line 13543
 if ((HEAP32[$46 >> 2] | 0) == ($16 | 0)) {
  _memcpy($2 + 792 | 0, $26 | 0, $28 | 0) | 0; //@line 13548
  HEAP8[$2 + 782 >> 0] = $28; //@line 13551
  HEAP8[$2 + 781 >> 0] = -35; //@line 13553
  HEAP8[$2 + 780 >> 0] = -5; //@line 13555
  HEAP8[$2 + 783 >> 0] = 1; //@line 13557
  HEAP32[$2 + 784 >> 2] = _emscripten_asm_const_i(1) | 0; //@line 13560
  return;
 }
 _printf(740, $30) | 0; //@line 13563
 HEAP32[$34 >> 2] = HEAP32[$46 >> 2]; //@line 13565
 HEAP32[$34 + 4 >> 2] = $16; //@line 13567
 _printf(953, $34) | 0; //@line 13568
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 13569
 _putchar(10) | 0; //@line 13570
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 13573
  sp = STACKTOP; //@line 13574
  return;
 }
 ___async_unwind = 0; //@line 13577
 HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 13578
 sp = STACKTOP; //@line 13579
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1487
 STACKTOP = STACKTOP + 128 | 0; //@line 1488
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1488
 $2 = sp; //@line 1489
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1490
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1491
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 1494
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1496
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1498
  sp = STACKTOP; //@line 1499
  STACKTOP = sp; //@line 1500
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1502
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1505
  return;
 }
 if (!(HEAP32[1014] | 0)) {
  _serial_init(4060, 2, 3); //@line 1510
  $$01213 = 0; //@line 1511
  $$014 = 0; //@line 1511
 } else {
  $$01213 = 0; //@line 1513
  $$014 = 0; //@line 1513
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1517
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1522
   _serial_putc(4060, 13); //@line 1523
   if (___async) {
    label = 8; //@line 1526
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1529
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1532
  _serial_putc(4060, $$01213 << 24 >> 24); //@line 1533
  if (___async) {
   label = 11; //@line 1536
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1539
  $24 = $$014 + 1 | 0; //@line 1540
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1543
   break;
  } else {
   $$014 = $24; //@line 1546
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 46; //@line 1550
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1552
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1554
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1556
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1558
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1560
  sp = STACKTOP; //@line 1561
  STACKTOP = sp; //@line 1562
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 47; //@line 1565
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1567
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1569
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1571
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1573
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1575
  sp = STACKTOP; //@line 1576
  STACKTOP = sp; //@line 1577
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1580
  return;
 }
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 13935
 }
 ret = dest | 0; //@line 13938
 dest_end = dest + num | 0; //@line 13939
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 13943
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13944
   dest = dest + 1 | 0; //@line 13945
   src = src + 1 | 0; //@line 13946
   num = num - 1 | 0; //@line 13947
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 13949
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 13950
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13952
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 13953
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 13954
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 13955
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 13956
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 13957
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 13958
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 13959
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 13960
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 13961
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 13962
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 13963
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 13964
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 13965
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 13966
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 13967
   dest = dest + 64 | 0; //@line 13968
   src = src + 64 | 0; //@line 13969
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13972
   dest = dest + 4 | 0; //@line 13973
   src = src + 4 | 0; //@line 13974
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 13978
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13980
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 13981
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 13982
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 13983
   dest = dest + 4 | 0; //@line 13984
   src = src + 4 | 0; //@line 13985
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13990
  dest = dest + 1 | 0; //@line 13991
  src = src + 1 | 0; //@line 13992
 }
 return ret | 0; //@line 13994
}
function _mbed_trace_array($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$042$ph = 0, $$04353 = 0, $$04552 = 0, $$04651 = 0, $$04750 = 0, $$2$ph = 0, $11 = 0, $15 = 0, $16 = 0, $2 = 0, $24 = 0, $27 = 0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1039
 STACKTOP = STACKTOP + 16 | 0; //@line 1040
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1040
 $vararg_buffer = sp; //@line 1041
 $2 = HEAP32[37] | 0; //@line 1042
 do {
  if ($2 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1046
   FUNCTION_TABLE_v[$2 & 0](); //@line 1047
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 26; //@line 1050
    HEAP16[$AsyncCtx + 4 >> 1] = $1; //@line 1052
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1054
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 1056
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 1058
    sp = STACKTOP; //@line 1059
    STACKTOP = sp; //@line 1060
    return 0; //@line 1060
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1062
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 1065
    break;
   }
  }
 } while (0);
 $11 = HEAP32[32] | 0; //@line 1071
 $15 = (HEAP32[30] | 0) - $11 + (HEAP32[31] | 0) | 0; //@line 1075
 $16 = $1 & 65535; //@line 1076
 if ($1 << 16 >> 16 == 0 | ($11 | 0) == 0 | ($15 | 0) == 0) {
  $$0 = 4644; //@line 1083
  STACKTOP = sp; //@line 1084
  return $$0 | 0; //@line 1084
 }
 if (!$0) {
  $$0 = 1117; //@line 1088
  STACKTOP = sp; //@line 1089
  return $$0 | 0; //@line 1089
 }
 HEAP8[$11 >> 0] = 0; //@line 1091
 $$04353 = $0; //@line 1092
 $$04552 = $11; //@line 1092
 $$04651 = 0; //@line 1092
 $$04750 = $15; //@line 1092
 while (1) {
  if (($$04750 | 0) < 4) {
   $$042$ph = 42; //@line 1096
   $$2$ph = $$04552; //@line 1096
   break;
  }
  HEAP32[$vararg_buffer >> 2] = HEAPU8[$$04353 >> 0]; //@line 1101
  $24 = _snprintf($$04552, $$04750, 1124, $vararg_buffer) | 0; //@line 1102
  $27 = $$04552 + $24 | 0; //@line 1106
  if (($24 | 0) < 1 | ($$04750 | 0) < ($24 | 0)) {
   $$042$ph = 0; //@line 1108
   $$2$ph = $$04552; //@line 1108
   break;
  }
  $$04651 = $$04651 + 1 | 0; //@line 1113
  if (($$04651 | 0) >= ($16 | 0)) {
   $$042$ph = 0; //@line 1118
   $$2$ph = $27; //@line 1118
   break;
  } else {
   $$04353 = $$04353 + 1 | 0; //@line 1116
   $$04552 = $27; //@line 1116
   $$04750 = $$04750 - $24 | 0; //@line 1116
  }
 }
 if ($$2$ph >>> 0 > $11 >>> 0) {
  HEAP8[$$2$ph + -1 >> 0] = $$042$ph; //@line 1125
 }
 HEAP32[32] = $$2$ph; //@line 1127
 $$0 = $11; //@line 1128
 STACKTOP = sp; //@line 1129
 return $$0 | 0; //@line 1129
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9986
 STACKTOP = STACKTOP + 64 | 0; //@line 9987
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9987
 $3 = sp; //@line 9988
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9991
 } else {
  if (!$1) {
   $$2 = 0; //@line 9995
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9997
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 9998
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 71; //@line 10001
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 10003
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10005
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 10007
    sp = STACKTOP; //@line 10008
    STACKTOP = sp; //@line 10009
    return 0; //@line 10009
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10011
   if (!$6) {
    $$2 = 0; //@line 10014
   } else {
    dest = $3 + 4 | 0; //@line 10017
    stop = dest + 52 | 0; //@line 10017
    do {
     HEAP32[dest >> 2] = 0; //@line 10017
     dest = dest + 4 | 0; //@line 10017
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 10018
    HEAP32[$3 + 8 >> 2] = $0; //@line 10020
    HEAP32[$3 + 12 >> 2] = -1; //@line 10022
    HEAP32[$3 + 48 >> 2] = 1; //@line 10024
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 10027
    $18 = HEAP32[$2 >> 2] | 0; //@line 10028
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10029
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 10030
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 72; //@line 10033
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10035
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10037
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10039
     sp = STACKTOP; //@line 10040
     STACKTOP = sp; //@line 10041
     return 0; //@line 10041
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10043
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 10050
     $$0 = 1; //@line 10051
    } else {
     $$0 = 0; //@line 10053
    }
    $$2 = $$0; //@line 10055
   }
  }
 }
 STACKTOP = sp; //@line 10059
 return $$2 | 0; //@line 10059
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 9651
 STACKTOP = STACKTOP + 128 | 0; //@line 9652
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 9652
 $4 = sp + 124 | 0; //@line 9653
 $5 = sp; //@line 9654
 dest = $5; //@line 9655
 src = 536; //@line 9655
 stop = dest + 124 | 0; //@line 9655
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9655
  dest = dest + 4 | 0; //@line 9655
  src = src + 4 | 0; //@line 9655
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 9661
   $$015 = 1; //@line 9661
   label = 4; //@line 9662
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9665
   $$0 = -1; //@line 9666
  }
 } else {
  $$014 = $0; //@line 9669
  $$015 = $1; //@line 9669
  label = 4; //@line 9670
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 9674
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 9676
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 9678
  $14 = $5 + 20 | 0; //@line 9679
  HEAP32[$14 >> 2] = $$014; //@line 9680
  HEAP32[$5 + 44 >> 2] = $$014; //@line 9682
  $16 = $$014 + $$$015 | 0; //@line 9683
  $17 = $5 + 16 | 0; //@line 9684
  HEAP32[$17 >> 2] = $16; //@line 9685
  HEAP32[$5 + 28 >> 2] = $16; //@line 9687
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 9688
  $19 = _vfprintf($5, $2, $3) | 0; //@line 9689
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 65; //@line 9692
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 9694
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 9696
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9698
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 9700
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 9702
   sp = STACKTOP; //@line 9703
   STACKTOP = sp; //@line 9704
   return 0; //@line 9704
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9706
  if (!$$$015) {
   $$0 = $19; //@line 9709
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 9711
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9716
   $$0 = $19; //@line 9717
  }
 }
 STACKTOP = sp; //@line 9720
 return $$0 | 0; //@line 9720
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 5640
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 5643
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 5646
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 5649
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 5655
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 5664
     $24 = $13 >>> 2; //@line 5665
     $$090 = 0; //@line 5666
     $$094 = $7; //@line 5666
     while (1) {
      $25 = $$094 >>> 1; //@line 5668
      $26 = $$090 + $25 | 0; //@line 5669
      $27 = $26 << 1; //@line 5670
      $28 = $27 + $23 | 0; //@line 5671
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 5674
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5678
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 5684
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 5692
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 5696
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 5702
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 5707
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 5710
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 5710
      }
     }
     $46 = $27 + $24 | 0; //@line 5713
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 5716
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5720
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 5732
     } else {
      $$4 = 0; //@line 5734
     }
    } else {
     $$4 = 0; //@line 5737
    }
   } else {
    $$4 = 0; //@line 5740
   }
  } else {
   $$4 = 0; //@line 5743
  }
 } while (0);
 return $$4 | 0; //@line 5746
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9789
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 9794
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 9799
  } else {
   $20 = $0 & 255; //@line 9801
   $21 = $0 & 255; //@line 9802
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 9808
   } else {
    $26 = $1 + 20 | 0; //@line 9810
    $27 = HEAP32[$26 >> 2] | 0; //@line 9811
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 9817
     HEAP8[$27 >> 0] = $20; //@line 9818
     $34 = $21; //@line 9819
    } else {
     label = 12; //@line 9821
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9826
     $32 = ___overflow($1, $0) | 0; //@line 9827
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 69; //@line 9830
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9832
      sp = STACKTOP; //@line 9833
      return 0; //@line 9834
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9836
      $34 = $32; //@line 9837
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 9842
   $$0 = $34; //@line 9843
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 9848
   $8 = $0 & 255; //@line 9849
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 9855
    $14 = HEAP32[$13 >> 2] | 0; //@line 9856
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 9862
     HEAP8[$14 >> 0] = $7; //@line 9863
     $$0 = $8; //@line 9864
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9868
   $19 = ___overflow($1, $0) | 0; //@line 9869
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 68; //@line 9872
    sp = STACKTOP; //@line 9873
    return 0; //@line 9874
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9876
    $$0 = $19; //@line 9877
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9882
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5305
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5310
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5315
  } else {
   $20 = $0 & 255; //@line 5317
   $21 = $0 & 255; //@line 5318
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5324
   } else {
    $26 = $1 + 20 | 0; //@line 5326
    $27 = HEAP32[$26 >> 2] | 0; //@line 5327
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5333
     HEAP8[$27 >> 0] = $20; //@line 5334
     $34 = $21; //@line 5335
    } else {
     label = 12; //@line 5337
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5342
     $32 = ___overflow($1, $0) | 0; //@line 5343
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 55; //@line 5346
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5348
      sp = STACKTOP; //@line 5349
      return 0; //@line 5350
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5352
      $34 = $32; //@line 5353
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5358
   $$0 = $34; //@line 5359
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5364
   $8 = $0 & 255; //@line 5365
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5371
    $14 = HEAP32[$13 >> 2] | 0; //@line 5372
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5378
     HEAP8[$14 >> 0] = $7; //@line 5379
     $$0 = $8; //@line 5380
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5384
   $19 = ___overflow($1, $0) | 0; //@line 5385
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 54; //@line 5388
    sp = STACKTOP; //@line 5389
    return 0; //@line 5390
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5392
    $$0 = $19; //@line 5393
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5398
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6025
 $1 = $0 + 20 | 0; //@line 6026
 $3 = $0 + 28 | 0; //@line 6028
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6034
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6035
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6036
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 61; //@line 6039
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6041
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6043
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6045
    sp = STACKTOP; //@line 6046
    return 0; //@line 6047
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6049
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6053
     break;
    } else {
     label = 5; //@line 6056
     break;
    }
   }
  } else {
   label = 5; //@line 6061
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6065
  $14 = HEAP32[$13 >> 2] | 0; //@line 6066
  $15 = $0 + 8 | 0; //@line 6067
  $16 = HEAP32[$15 >> 2] | 0; //@line 6068
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6076
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6077
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6078
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 62; //@line 6081
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6083
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6085
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6087
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6089
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6091
     sp = STACKTOP; //@line 6092
     return 0; //@line 6093
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6095
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6101
  HEAP32[$3 >> 2] = 0; //@line 6102
  HEAP32[$1 >> 2] = 0; //@line 6103
  HEAP32[$15 >> 2] = 0; //@line 6104
  HEAP32[$13 >> 2] = 0; //@line 6105
  $$0 = 0; //@line 6106
 }
 return $$0 | 0; //@line 6108
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 5789
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 5795
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 5801
   } else {
    $7 = $1 & 255; //@line 5803
    $$03039 = $0; //@line 5804
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 5806
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 5811
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 5814
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 5819
      break;
     } else {
      $$03039 = $13; //@line 5822
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 5826
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 5827
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 5835
     $25 = $18; //@line 5835
     while (1) {
      $24 = $25 ^ $17; //@line 5837
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 5844
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 5847
      $25 = HEAP32[$31 >> 2] | 0; //@line 5848
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 5857
       break;
      } else {
       $$02936 = $31; //@line 5855
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 5862
    }
   } while (0);
   $38 = $1 & 255; //@line 5865
   $$1 = $$029$lcssa; //@line 5866
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 5868
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 5874
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 5877
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 5882
}
function _mbed_trace_init() {
 var $$0 = 0, $0 = 0, $10 = 0, $13 = 0, $14 = 0, $17 = 0, $19 = 0, $22 = 0, $24 = 0, $3 = 0, $4 = 0, $7 = 0, $9 = 0;
 $0 = HEAP32[28] | 0; //@line 230
 if (!$0) {
  $3 = _malloc(HEAP32[29] | 0) | 0; //@line 234
  HEAP32[28] = $3; //@line 235
  $19 = $3; //@line 236
 } else {
  $19 = $0; //@line 238
 }
 $4 = HEAP32[30] | 0; //@line 240
 if (!$4) {
  $7 = _malloc(HEAP32[31] | 0) | 0; //@line 244
  HEAP32[30] = $7; //@line 245
  $9 = $7; //@line 246
 } else {
  $9 = $4; //@line 248
 }
 HEAP32[32] = $9; //@line 251
 $10 = HEAP32[25] | 0; //@line 252
 if (!$10) {
  $13 = _malloc(HEAP32[27] | 0) | 0; //@line 256
  HEAP32[25] = $13; //@line 257
  $22 = $13; //@line 258
 } else {
  $22 = $10; //@line 260
 }
 $14 = HEAP32[26] | 0; //@line 262
 if (!$14) {
  $17 = _malloc(HEAP32[27] | 0) | 0; //@line 266
  HEAP32[26] = $17; //@line 267
  $24 = $17; //@line 268
 } else {
  $24 = $14; //@line 270
 }
 if (($19 | 0) == 0 | ($9 | 0) == 0 | ($22 | 0) == 0 | ($24 | 0) == 0) {
  _free($19); //@line 280
  _free(HEAP32[30] | 0); //@line 282
  _free(HEAP32[25] | 0); //@line 284
  _free(HEAP32[26] | 0); //@line 286
  HEAP8[96] = 127; //@line 287
  HEAP32[25] = 0; //@line 288
  HEAP32[26] = 0; //@line 289
  HEAP32[27] = 24; //@line 290
  HEAP32[28] = 0; //@line 291
  HEAP32[29] = 1024; //@line 292
  HEAP32[30] = 0; //@line 293
  HEAP32[31] = 128; //@line 294
  HEAP32[33] = 0; //@line 295
  HEAP32[34] = 0; //@line 296
  HEAP32[35] = 1; //@line 297
  HEAP32[36] = 0; //@line 298
  HEAP32[37] = 0; //@line 298
  HEAP32[38] = 0; //@line 298
  HEAP32[39] = 0; //@line 298
  $$0 = -1; //@line 299
  return $$0 | 0; //@line 300
 } else {
  _memset($9 | 0, 0, HEAP32[31] | 0) | 0; //@line 303
  _memset(HEAP32[25] | 0, 0, HEAP32[27] | 0) | 0; //@line 306
  _memset(HEAP32[26] | 0, 0, HEAP32[27] | 0) | 0; //@line 309
  _memset(HEAP32[28] | 0, 0, HEAP32[29] | 0) | 0; //@line 312
  $$0 = 0; //@line 313
  return $$0 | 0; //@line 314
 }
 return 0; //@line 316
}
function _mbed_trace_array__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$042$ph = 0, $$04353 = 0, $$04552 = 0, $$04651 = 0, $$04750 = 0, $$2$ph = 0, $12 = 0, $16 = 0, $17 = 0, $2 = 0, $25 = 0, $28 = 0, $34 = 0, $4 = 0, $6 = 0;
 $2 = HEAP16[$0 + 4 >> 1] | 0; //@line 13334
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13336
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13338
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 13343
 $12 = HEAP32[32] | 0; //@line 13345
 $16 = (HEAP32[30] | 0) - $12 + (HEAP32[31] | 0) | 0; //@line 13349
 $17 = $2 & 65535; //@line 13350
 if ($2 << 16 >> 16 == 0 | ($12 | 0) == 0 | ($16 | 0) == 0) {
  $$0 = 4644; //@line 13357
  $34 = ___async_retval; //@line 13358
  HEAP32[$34 >> 2] = $$0; //@line 13359
  return;
 }
 if (!$4) {
  $$0 = 1117; //@line 13364
  $34 = ___async_retval; //@line 13365
  HEAP32[$34 >> 2] = $$0; //@line 13366
  return;
 }
 HEAP8[$12 >> 0] = 0; //@line 13369
 $$04353 = $4; //@line 13370
 $$04552 = $12; //@line 13370
 $$04651 = 0; //@line 13370
 $$04750 = $16; //@line 13370
 while (1) {
  if (($$04750 | 0) < 4) {
   $$042$ph = 42; //@line 13374
   $$2$ph = $$04552; //@line 13374
   break;
  }
  HEAP32[$6 >> 2] = HEAPU8[$$04353 >> 0]; //@line 13379
  $25 = _snprintf($$04552, $$04750, 1124, $6) | 0; //@line 13380
  $28 = $$04552 + $25 | 0; //@line 13384
  if (($25 | 0) < 1 | ($$04750 | 0) < ($25 | 0)) {
   $$042$ph = 0; //@line 13386
   $$2$ph = $$04552; //@line 13386
   break;
  }
  $$04651 = $$04651 + 1 | 0; //@line 13391
  if (($$04651 | 0) >= ($17 | 0)) {
   $$042$ph = 0; //@line 13396
   $$2$ph = $28; //@line 13396
   break;
  } else {
   $$04353 = $$04353 + 1 | 0; //@line 13394
   $$04552 = $28; //@line 13394
   $$04750 = $$04750 - $25 | 0; //@line 13394
  }
 }
 if ($$2$ph >>> 0 > $12 >>> 0) {
  HEAP8[$$2$ph + -1 >> 0] = $$042$ph; //@line 13403
 }
 HEAP32[32] = $$2$ph; //@line 13405
 $$0 = $12; //@line 13406
 $34 = ___async_retval; //@line 13407
 HEAP32[$34 >> 2] = $$0; //@line 13408
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 5531
 $4 = HEAP32[$3 >> 2] | 0; //@line 5532
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 5539
   label = 5; //@line 5540
  } else {
   $$1 = 0; //@line 5542
  }
 } else {
  $12 = $4; //@line 5546
  label = 5; //@line 5547
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 5551
   $10 = HEAP32[$9 >> 2] | 0; //@line 5552
   $14 = $10; //@line 5555
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5560
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5568
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5572
       $$141 = $0; //@line 5572
       $$143 = $1; //@line 5572
       $31 = $14; //@line 5572
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5575
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5582
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5587
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5590
      break L5;
     }
     $$139 = $$038; //@line 5596
     $$141 = $0 + $$038 | 0; //@line 5596
     $$143 = $1 - $$038 | 0; //@line 5596
     $31 = HEAP32[$9 >> 2] | 0; //@line 5596
    } else {
     $$139 = 0; //@line 5598
     $$141 = $0; //@line 5598
     $$143 = $1; //@line 5598
     $31 = $14; //@line 5598
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5601
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5604
   $$1 = $$139 + $$143 | 0; //@line 5606
  }
 } while (0);
 return $$1 | 0; //@line 5609
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5417
 STACKTOP = STACKTOP + 16 | 0; //@line 5418
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5418
 $2 = sp; //@line 5419
 $3 = $1 & 255; //@line 5420
 HEAP8[$2 >> 0] = $3; //@line 5421
 $4 = $0 + 16 | 0; //@line 5422
 $5 = HEAP32[$4 >> 2] | 0; //@line 5423
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 5430
   label = 4; //@line 5431
  } else {
   $$0 = -1; //@line 5433
  }
 } else {
  $12 = $5; //@line 5436
  label = 4; //@line 5437
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 5441
   $10 = HEAP32[$9 >> 2] | 0; //@line 5442
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 5445
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 5452
     HEAP8[$10 >> 0] = $3; //@line 5453
     $$0 = $13; //@line 5454
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5459
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5460
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 5461
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 56; //@line 5464
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 5466
    sp = STACKTOP; //@line 5467
    STACKTOP = sp; //@line 5468
    return 0; //@line 5468
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 5470
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 5475
   } else {
    $$0 = -1; //@line 5477
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5481
 return $$0 | 0; //@line 5481
}
function _fflush__async_cb_22($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12779
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12781
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 12783
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 12787
  } else {
   $$02327 = $$02325; //@line 12789
   $$02426 = $AsyncRetVal; //@line 12789
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 12796
    } else {
     $16 = 0; //@line 12798
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 12810
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 12813
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 12816
     break L3;
    } else {
     $$02327 = $$023; //@line 12819
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12822
   $13 = ___fflush_unlocked($$02327) | 0; //@line 12823
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 12827
    ___async_unwind = 0; //@line 12828
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 60; //@line 12830
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 12832
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 12834
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 12836
   sp = STACKTOP; //@line 12837
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 12841
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 12843
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 13999
 value = value & 255; //@line 14001
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 14004
   ptr = ptr + 1 | 0; //@line 14005
  }
  aligned_end = end & -4 | 0; //@line 14008
  block_aligned_end = aligned_end - 64 | 0; //@line 14009
  value4 = value | value << 8 | value << 16 | value << 24; //@line 14010
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 14013
   HEAP32[ptr + 4 >> 2] = value4; //@line 14014
   HEAP32[ptr + 8 >> 2] = value4; //@line 14015
   HEAP32[ptr + 12 >> 2] = value4; //@line 14016
   HEAP32[ptr + 16 >> 2] = value4; //@line 14017
   HEAP32[ptr + 20 >> 2] = value4; //@line 14018
   HEAP32[ptr + 24 >> 2] = value4; //@line 14019
   HEAP32[ptr + 28 >> 2] = value4; //@line 14020
   HEAP32[ptr + 32 >> 2] = value4; //@line 14021
   HEAP32[ptr + 36 >> 2] = value4; //@line 14022
   HEAP32[ptr + 40 >> 2] = value4; //@line 14023
   HEAP32[ptr + 44 >> 2] = value4; //@line 14024
   HEAP32[ptr + 48 >> 2] = value4; //@line 14025
   HEAP32[ptr + 52 >> 2] = value4; //@line 14026
   HEAP32[ptr + 56 >> 2] = value4; //@line 14027
   HEAP32[ptr + 60 >> 2] = value4; //@line 14028
   ptr = ptr + 64 | 0; //@line 14029
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 14033
   ptr = ptr + 4 | 0; //@line 14034
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 14039
  ptr = ptr + 1 | 0; //@line 14040
 }
 return end - num | 0; //@line 14042
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12680
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12690
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12690
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12690
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 12694
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 12697
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 12700
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 12708
  } else {
   $20 = 0; //@line 12710
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 12720
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 12724
  HEAP32[___async_retval >> 2] = $$1; //@line 12726
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12729
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 12730
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 12734
  ___async_unwind = 0; //@line 12735
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 60; //@line 12737
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 12739
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 12741
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 12743
 sp = STACKTOP; //@line 12744
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12032
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12034
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12036
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12038
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 12043
  } else {
   $9 = $4 + 4 | 0; //@line 12045
   $10 = HEAP32[$9 >> 2] | 0; //@line 12046
   $11 = $4 + 8 | 0; //@line 12047
   $12 = HEAP32[$11 >> 2] | 0; //@line 12048
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 12052
    HEAP32[$6 >> 2] = 0; //@line 12053
    HEAP32[$2 >> 2] = 0; //@line 12054
    HEAP32[$11 >> 2] = 0; //@line 12055
    HEAP32[$9 >> 2] = 0; //@line 12056
    $$0 = 0; //@line 12057
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 12064
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12065
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 12066
   if (!___async) {
    ___async_unwind = 0; //@line 12069
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 12071
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 12073
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 12075
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 12077
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 12079
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 12081
   sp = STACKTOP; //@line 12082
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12087
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_15($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12209
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12211
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12213
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12215
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12217
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 12222
  return;
 }
 dest = $2 + 4 | 0; //@line 12226
 stop = dest + 52 | 0; //@line 12226
 do {
  HEAP32[dest >> 2] = 0; //@line 12226
  dest = dest + 4 | 0; //@line 12226
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 12227
 HEAP32[$2 + 8 >> 2] = $4; //@line 12229
 HEAP32[$2 + 12 >> 2] = -1; //@line 12231
 HEAP32[$2 + 48 >> 2] = 1; //@line 12233
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 12236
 $16 = HEAP32[$6 >> 2] | 0; //@line 12237
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12238
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 12239
 if (!___async) {
  ___async_unwind = 0; //@line 12242
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 12244
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12246
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 12248
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 12250
 sp = STACKTOP; //@line 12251
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 8797
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 8802
    $$0 = 1; //@line 8803
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 8816
     $$0 = 1; //@line 8817
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8821
     $$0 = -1; //@line 8822
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 8832
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 8836
    $$0 = 2; //@line 8837
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 8849
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 8855
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 8859
    $$0 = 3; //@line 8860
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 8870
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 8876
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 8882
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 8886
    $$0 = 4; //@line 8887
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8891
    $$0 = -1; //@line 8892
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8897
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 7681
  $8 = $0; //@line 7681
  $9 = $1; //@line 7681
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7683
   $$0914 = $$0914 + -1 | 0; //@line 7687
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 7688
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7689
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 7697
   }
  }
  $$010$lcssa$off0 = $8; //@line 7702
  $$09$lcssa = $$0914; //@line 7702
 } else {
  $$010$lcssa$off0 = $0; //@line 7704
  $$09$lcssa = $2; //@line 7704
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 7708
 } else {
  $$012 = $$010$lcssa$off0; //@line 7710
  $$111 = $$09$lcssa; //@line 7710
  while (1) {
   $26 = $$111 + -1 | 0; //@line 7715
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 7716
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 7720
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 7723
    $$111 = $26; //@line 7723
   }
  }
 }
 return $$1$lcssa | 0; //@line 7727
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 5183
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5188
   label = 4; //@line 5189
  } else {
   $$01519 = $0; //@line 5191
   $23 = $1; //@line 5191
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5196
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5199
    $23 = $6; //@line 5200
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 5204
     label = 4; //@line 5205
     break;
    } else {
     $$01519 = $6; //@line 5208
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 5214
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 5216
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 5224
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 5232
  } else {
   $$pn = $$0; //@line 5234
   while (1) {
    $19 = $$pn + 1 | 0; //@line 5236
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 5240
     break;
    } else {
     $$pn = $19; //@line 5243
    }
   }
  }
  $$sink = $$1$lcssa; //@line 5248
 }
 return $$sink - $1 | 0; //@line 5251
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10233
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10240
   $10 = $1 + 16 | 0; //@line 10241
   $11 = HEAP32[$10 >> 2] | 0; //@line 10242
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10245
    HEAP32[$1 + 24 >> 2] = $4; //@line 10247
    HEAP32[$1 + 36 >> 2] = 1; //@line 10249
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10259
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10264
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10267
    HEAP8[$1 + 54 >> 0] = 1; //@line 10269
    break;
   }
   $21 = $1 + 24 | 0; //@line 10272
   $22 = HEAP32[$21 >> 2] | 0; //@line 10273
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10276
    $28 = $4; //@line 10277
   } else {
    $28 = $22; //@line 10279
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10288
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_5($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11466
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11468
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11470
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11472
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 11477
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11479
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 11484
 $16 = _snprintf($4, $6, 1034, $2) | 0; //@line 11485
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 11487
 $19 = $4 + $$18 | 0; //@line 11489
 $20 = $6 - $$18 | 0; //@line 11490
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1112, $12) | 0; //@line 11498
  }
 }
 $23 = HEAP32[35] | 0; //@line 11501
 $24 = HEAP32[28] | 0; //@line 11502
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11503
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 11504
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11507
  sp = STACKTOP; //@line 11508
  return;
 }
 ___async_unwind = 0; //@line 11511
 HEAP32[$ReallocAsyncCtx7 >> 2] = 23; //@line 11512
 sp = STACKTOP; //@line 11513
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9888
 $1 = HEAP32[40] | 0; //@line 9889
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9895
 } else {
  $19 = 0; //@line 9897
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9903
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9909
    $12 = HEAP32[$11 >> 2] | 0; //@line 9910
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9916
     HEAP8[$12 >> 0] = 10; //@line 9917
     $22 = 0; //@line 9918
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9922
   $17 = ___overflow($1, 10) | 0; //@line 9923
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 70; //@line 9926
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9928
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9930
    sp = STACKTOP; //@line 9931
    return 0; //@line 9932
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9934
    $22 = $17 >> 31; //@line 9936
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9943
 }
 return $22 | 0; //@line 9945
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12122
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12124
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12126
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12130
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 12134
  label = 4; //@line 12135
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 12140
   label = 4; //@line 12141
  } else {
   $$037$off039 = 3; //@line 12143
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 12147
  $17 = $8 + 40 | 0; //@line 12148
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 12151
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 12161
    $$037$off039 = $$037$off038; //@line 12162
   } else {
    $$037$off039 = $$037$off038; //@line 12164
   }
  } else {
   $$037$off039 = $$037$off038; //@line 12167
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 12170
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10092
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10101
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10106
      HEAP32[$13 >> 2] = $2; //@line 10107
      $19 = $1 + 40 | 0; //@line 10108
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10111
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10121
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10125
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10132
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
 $$016 = 0; //@line 8917
 while (1) {
  if ((HEAPU8[1976 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 8924
   break;
  }
  $7 = $$016 + 1 | 0; //@line 8927
  if (($7 | 0) == 87) {
   $$01214 = 2064; //@line 8930
   $$115 = 87; //@line 8930
   label = 5; //@line 8931
   break;
  } else {
   $$016 = $7; //@line 8934
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2064; //@line 8940
  } else {
   $$01214 = 2064; //@line 8942
   $$115 = $$016; //@line 8942
   label = 5; //@line 8943
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 8948
   $$113 = $$01214; //@line 8949
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 8953
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 8960
   if (!$$115) {
    $$012$lcssa = $$113; //@line 8963
    break;
   } else {
    $$01214 = $$113; //@line 8966
    label = 5; //@line 8967
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 8974
}
function _main() {
 var $0 = 0, $AsyncCtx = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 1731
 STACKTOP = STACKTOP + 48 | 0; //@line 1732
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 1732
 $vararg_buffer7 = sp + 32 | 0; //@line 1733
 _mbed_trace_init() | 0; //@line 1738
 _mbed_tracef(16, 1342, 1347, sp); //@line 1739
 _mbed_tracef(8, 1342, 1365, sp + 8 | 0); //@line 1740
 _mbed_tracef(4, 1342, 1382, sp + 16 | 0); //@line 1741
 _mbed_tracef(2, 1342, 1402, sp + 24 | 0); //@line 1742
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1743
 $0 = _mbed_trace_array(1420, 3) | 0; //@line 1744
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 1747
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer7; //@line 1749
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer7; //@line 1751
  sp = STACKTOP; //@line 1752
  STACKTOP = sp; //@line 1753
  return 0; //@line 1753
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1755
  HEAP32[$vararg_buffer7 >> 2] = $0; //@line 1756
  _mbed_tracef(16, 1342, 1423, $vararg_buffer7); //@line 1757
  STACKTOP = sp; //@line 1758
  return 0; //@line 1758
 }
 return 0; //@line 1760
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 8990
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 8994
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 8997
   if (!$5) {
    $$0 = 0; //@line 9000
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 9006
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 9012
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 9019
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 9026
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 9033
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 9040
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 9047
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 9051
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 9061
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11851
 $3 = HEAP32[36] | 0; //@line 11855
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[28] | 0; //@line 11859
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11860
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 11861
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 16; //@line 11864
   sp = STACKTOP; //@line 11865
   return;
  }
  ___async_unwind = 0; //@line 11868
  HEAP32[$ReallocAsyncCtx2 >> 2] = 16; //@line 11869
  sp = STACKTOP; //@line 11870
  return;
 } else {
  $6 = HEAP32[35] | 0; //@line 11873
  $7 = HEAP32[28] | 0; //@line 11874
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11875
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 11876
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 18; //@line 11879
   sp = STACKTOP; //@line 11880
   return;
  }
  ___async_unwind = 0; //@line 11883
  HEAP32[$ReallocAsyncCtx4 >> 2] = 18; //@line 11884
  sp = STACKTOP; //@line 11885
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 9186
 $32 = $0 + 3 | 0; //@line 9200
 $33 = HEAP8[$32 >> 0] | 0; //@line 9201
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 9203
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 9208
  $$sink21$lcssa = $32; //@line 9208
 } else {
  $$sink2123 = $32; //@line 9210
  $39 = $35; //@line 9210
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 9213
   $41 = HEAP8[$40 >> 0] | 0; //@line 9214
   $39 = $39 << 8 | $41 & 255; //@line 9216
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 9221
    $$sink21$lcssa = $40; //@line 9221
    break;
   } else {
    $$sink2123 = $40; //@line 9224
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 9231
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1661
 $2 = $0 + 12 | 0; //@line 1663
 $3 = HEAP32[$2 >> 2] | 0; //@line 1664
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1668
   _mbed_assert_internal(1253, 1258, 528); //@line 1669
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 50; //@line 1672
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1674
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1676
    sp = STACKTOP; //@line 1677
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1680
    $8 = HEAP32[$2 >> 2] | 0; //@line 1682
    break;
   }
  } else {
   $8 = $3; //@line 1686
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1689
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1691
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1692
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 1695
  sp = STACKTOP; //@line 1696
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1699
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 9120
 $23 = $0 + 2 | 0; //@line 9129
 $24 = HEAP8[$23 >> 0] | 0; //@line 9130
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 9133
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 9138
  $$lcssa = $24; //@line 9138
 } else {
  $$01618 = $23; //@line 9140
  $$019 = $27; //@line 9140
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 9142
   $31 = HEAP8[$30 >> 0] | 0; //@line 9143
   $$019 = ($$019 | $31 & 255) << 8; //@line 9146
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 9151
    $$lcssa = $31; //@line 9151
    break;
   } else {
    $$01618 = $30; //@line 9154
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 9161
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10656
 STACKTOP = STACKTOP + 16 | 0; //@line 10657
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10657
 $3 = sp; //@line 10658
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 10660
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 10663
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10664
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 10665
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 79; //@line 10668
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10670
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10672
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10674
  sp = STACKTOP; //@line 10675
  STACKTOP = sp; //@line 10676
  return 0; //@line 10676
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10678
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 10682
 }
 STACKTOP = sp; //@line 10684
 return $8 & 1 | 0; //@line 10684
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8748
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8748
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8749
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 8750
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 8759
    $$016 = $9; //@line 8762
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 8762
   } else {
    $$016 = $0; //@line 8764
    $storemerge = 0; //@line 8764
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 8766
   $$0 = $$016; //@line 8767
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 8771
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 8777
   HEAP32[tempDoublePtr >> 2] = $2; //@line 8780
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 8780
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 8781
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11942
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11950
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11952
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11954
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11956
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11958
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11960
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11962
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 11973
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 11974
 HEAP32[$10 >> 2] = 0; //@line 11975
 HEAP32[$12 >> 2] = 0; //@line 11976
 HEAP32[$14 >> 2] = 0; //@line 11977
 HEAP32[$2 >> 2] = 0; //@line 11978
 $33 = HEAP32[$16 >> 2] | 0; //@line 11979
 HEAP32[$16 >> 2] = $33 | $18; //@line 11984
 if ($20 | 0) {
  ___unlockfile($22); //@line 11987
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 11990
 return;
}
function _mbed_vtracef__async_cb_8($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11582
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11586
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 11591
 $$pre = HEAP32[38] | 0; //@line 11592
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 11593
 FUNCTION_TABLE_v[$$pre & 0](); //@line 11594
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 25; //@line 11597
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 11598
  HEAP32[$6 >> 2] = $4; //@line 11599
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 11600
  HEAP32[$7 >> 2] = $5; //@line 11601
  sp = STACKTOP; //@line 11602
  return;
 }
 ___async_unwind = 0; //@line 11605
 HEAP32[$ReallocAsyncCtx9 >> 2] = 25; //@line 11606
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 11607
 HEAP32[$6 >> 2] = $4; //@line 11608
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 11609
 HEAP32[$7 >> 2] = $5; //@line 11610
 sp = STACKTOP; //@line 11611
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
 sp = STACKTOP; //@line 10448
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10454
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10457
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10460
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10461
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10462
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 75; //@line 10465
    sp = STACKTOP; //@line 10466
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10469
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_7($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11549
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11551
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 11556
 $$pre = HEAP32[38] | 0; //@line 11557
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 11558
 FUNCTION_TABLE_v[$$pre & 0](); //@line 11559
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 25; //@line 11562
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 11563
  HEAP32[$5 >> 2] = $2; //@line 11564
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 11565
  HEAP32[$6 >> 2] = $4; //@line 11566
  sp = STACKTOP; //@line 11567
  return;
 }
 ___async_unwind = 0; //@line 11570
 HEAP32[$ReallocAsyncCtx9 >> 2] = 25; //@line 11571
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 11572
 HEAP32[$5 >> 2] = $2; //@line 11573
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 11574
 HEAP32[$6 >> 2] = $4; //@line 11575
 sp = STACKTOP; //@line 11576
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10617
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10623
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10626
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10629
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10630
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10631
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 78; //@line 10634
    sp = STACKTOP; //@line 10635
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10638
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_error_vfprintf__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12464
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 12466
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12468
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12470
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12472
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12474
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12476
 _serial_putc(4060, $2 << 24 >> 24); //@line 12477
 if (!___async) {
  ___async_unwind = 0; //@line 12480
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 12482
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 12484
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 12486
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 12488
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 12490
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 12492
 sp = STACKTOP; //@line 12493
 return;
}
function ___dynamic_cast__async_cb_19($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12598
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12600
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12602
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12608
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 12623
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 12639
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 12644
    break;
   }
  default:
   {
    $$0 = 0; //@line 12648
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12653
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 7746
 STACKTOP = STACKTOP + 256 | 0; //@line 7747
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 7747
 $5 = sp; //@line 7748
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 7754
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 7758
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 7761
   $$011 = $9; //@line 7762
   do {
    _out_670($0, $5, 256); //@line 7764
    $$011 = $$011 + -256 | 0; //@line 7765
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 7774
  } else {
   $$0$lcssa = $9; //@line 7776
  }
  _out_670($0, $5, $$0$lcssa); //@line 7778
 }
 STACKTOP = sp; //@line 7780
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5041
 STACKTOP = STACKTOP + 32 | 0; //@line 5042
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5042
 $vararg_buffer = sp; //@line 5043
 $3 = sp + 20 | 0; //@line 5044
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5048
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5050
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5052
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5054
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5056
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5061
  $10 = -1; //@line 5062
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5065
 }
 STACKTOP = sp; //@line 5067
 return $10 | 0; //@line 5067
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1136
 STACKTOP = STACKTOP + 16 | 0; //@line 1137
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1137
 $vararg_buffer = sp; //@line 1138
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1139
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1141
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1143
 _mbed_error_printf(1130, $vararg_buffer); //@line 1144
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1145
 _mbed_die(); //@line 1146
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 27; //@line 1149
  sp = STACKTOP; //@line 1150
  STACKTOP = sp; //@line 1151
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1153
  STACKTOP = sp; //@line 1154
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9625
 STACKTOP = STACKTOP + 16 | 0; //@line 9626
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9626
 $3 = sp; //@line 9627
 HEAP32[$3 >> 2] = $varargs; //@line 9628
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9629
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 9630
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 64; //@line 9633
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9635
  sp = STACKTOP; //@line 9636
  STACKTOP = sp; //@line 9637
  return 0; //@line 9637
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9639
  STACKTOP = sp; //@line 9640
  return $4 | 0; //@line 9640
 }
 return 0; //@line 9642
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9746
 STACKTOP = STACKTOP + 16 | 0; //@line 9747
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9747
 $1 = sp; //@line 9748
 HEAP32[$1 >> 2] = $varargs; //@line 9749
 $2 = HEAP32[40] | 0; //@line 9750
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9751
 $3 = _vfprintf($2, $0, $1) | 0; //@line 9752
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 66; //@line 9755
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9757
  sp = STACKTOP; //@line 9758
  STACKTOP = sp; //@line 9759
  return 0; //@line 9759
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9761
  STACKTOP = sp; //@line 9762
  return $3 | 0; //@line 9762
 }
 return 0; //@line 9764
}
function _mbed_vtracef__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11519
 HEAP32[32] = HEAP32[30]; //@line 11521
 $2 = HEAP32[38] | 0; //@line 11522
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11527
 HEAP32[39] = 0; //@line 11528
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11529
 FUNCTION_TABLE_v[$2 & 0](); //@line 11530
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11533
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11534
  HEAP32[$5 >> 2] = $4; //@line 11535
  sp = STACKTOP; //@line 11536
  return;
 }
 ___async_unwind = 0; //@line 11539
 HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11540
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11541
 HEAP32[$5 >> 2] = $4; //@line 11542
 sp = STACKTOP; //@line 11543
 return;
}
function _mbed_vtracef__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11255
 HEAP32[32] = HEAP32[30]; //@line 11257
 $2 = HEAP32[38] | 0; //@line 11258
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11263
 HEAP32[39] = 0; //@line 11264
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11265
 FUNCTION_TABLE_v[$2 & 0](); //@line 11266
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11269
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11270
  HEAP32[$5 >> 2] = $4; //@line 11271
  sp = STACKTOP; //@line 11272
  return;
 }
 ___async_unwind = 0; //@line 11275
 HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11276
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11277
 HEAP32[$5 >> 2] = $4; //@line 11278
 sp = STACKTOP; //@line 11279
 return;
}
function _mbed_vtracef__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11225
 HEAP32[32] = HEAP32[30]; //@line 11227
 $2 = HEAP32[38] | 0; //@line 11228
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11233
 HEAP32[39] = 0; //@line 11234
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11235
 FUNCTION_TABLE_v[$2 & 0](); //@line 11236
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11239
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11240
  HEAP32[$5 >> 2] = $4; //@line 11241
  sp = STACKTOP; //@line 11242
  return;
 }
 ___async_unwind = 0; //@line 11245
 HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11246
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11247
 HEAP32[$5 >> 2] = $4; //@line 11248
 sp = STACKTOP; //@line 11249
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 10170
 $5 = HEAP32[$4 >> 2] | 0; //@line 10171
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10175
   HEAP32[$1 + 24 >> 2] = $3; //@line 10177
   HEAP32[$1 + 36 >> 2] = 1; //@line 10179
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10183
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10186
    HEAP32[$1 + 24 >> 2] = 2; //@line 10188
    HEAP8[$1 + 54 >> 0] = 1; //@line 10190
    break;
   }
   $10 = $1 + 24 | 0; //@line 10193
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10197
   }
  }
 } while (0);
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5148
 $3 = HEAP8[$1 >> 0] | 0; //@line 5149
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5154
  $$lcssa8 = $2; //@line 5154
 } else {
  $$011 = $1; //@line 5156
  $$0710 = $0; //@line 5156
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5158
   $$011 = $$011 + 1 | 0; //@line 5159
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5160
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5161
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5166
  $$lcssa8 = $8; //@line 5166
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5176
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1633
 $2 = HEAP32[40] | 0; //@line 1634
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1635
 _putc($1, $2) | 0; //@line 1636
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 48; //@line 1639
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1641
  sp = STACKTOP; //@line 1642
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1645
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1646
 _fflush($2) | 0; //@line 1647
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 1650
  sp = STACKTOP; //@line 1651
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1654
  return;
 }
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 13299
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13301
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13303
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 13304
 _wait_ms(150); //@line 13305
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 29; //@line 13308
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13309
  HEAP32[$4 >> 2] = $2; //@line 13310
  sp = STACKTOP; //@line 13311
  return;
 }
 ___async_unwind = 0; //@line 13314
 HEAP32[$ReallocAsyncCtx15 >> 2] = 29; //@line 13315
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13316
 HEAP32[$4 >> 2] = $2; //@line 13317
 sp = STACKTOP; //@line 13318
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 13274
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13276
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13278
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 13279
 _wait_ms(150); //@line 13280
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 30; //@line 13283
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13284
  HEAP32[$4 >> 2] = $2; //@line 13285
  sp = STACKTOP; //@line 13286
  return;
 }
 ___async_unwind = 0; //@line 13289
 HEAP32[$ReallocAsyncCtx14 >> 2] = 30; //@line 13290
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13291
 HEAP32[$4 >> 2] = $2; //@line 13292
 sp = STACKTOP; //@line 13293
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 13249
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13251
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13253
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 13254
 _wait_ms(150); //@line 13255
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 31; //@line 13258
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13259
  HEAP32[$4 >> 2] = $2; //@line 13260
  sp = STACKTOP; //@line 13261
  return;
 }
 ___async_unwind = 0; //@line 13264
 HEAP32[$ReallocAsyncCtx13 >> 2] = 31; //@line 13265
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13266
 HEAP32[$4 >> 2] = $2; //@line 13267
 sp = STACKTOP; //@line 13268
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 13224
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13226
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13228
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 13229
 _wait_ms(150); //@line 13230
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 32; //@line 13233
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13234
  HEAP32[$4 >> 2] = $2; //@line 13235
  sp = STACKTOP; //@line 13236
  return;
 }
 ___async_unwind = 0; //@line 13239
 HEAP32[$ReallocAsyncCtx12 >> 2] = 32; //@line 13240
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13241
 HEAP32[$4 >> 2] = $2; //@line 13242
 sp = STACKTOP; //@line 13243
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 13199
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13201
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13203
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 13204
 _wait_ms(150); //@line 13205
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 33; //@line 13208
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13209
  HEAP32[$4 >> 2] = $2; //@line 13210
  sp = STACKTOP; //@line 13211
  return;
 }
 ___async_unwind = 0; //@line 13214
 HEAP32[$ReallocAsyncCtx11 >> 2] = 33; //@line 13215
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13216
 HEAP32[$4 >> 2] = $2; //@line 13217
 sp = STACKTOP; //@line 13218
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 13174
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13176
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13178
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 13179
 _wait_ms(150); //@line 13180
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 34; //@line 13183
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13184
  HEAP32[$4 >> 2] = $2; //@line 13185
  sp = STACKTOP; //@line 13186
  return;
 }
 ___async_unwind = 0; //@line 13189
 HEAP32[$ReallocAsyncCtx10 >> 2] = 34; //@line 13190
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13191
 HEAP32[$4 >> 2] = $2; //@line 13192
 sp = STACKTOP; //@line 13193
 return;
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 9590
  } else {
   $$01318 = $0; //@line 9592
   $$01417 = $2; //@line 9592
   $$019 = $1; //@line 9592
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 9594
    $5 = HEAP8[$$019 >> 0] | 0; //@line 9595
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 9600
    if (!$$01417) {
     $14 = 0; //@line 9605
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 9608
     $$019 = $$019 + 1 | 0; //@line 9608
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 9614
  }
 } while (0);
 return $14 | 0; //@line 9617
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 12924
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12926
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12928
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 12929
 _wait_ms(150); //@line 12930
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 28; //@line 12933
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12934
  HEAP32[$4 >> 2] = $2; //@line 12935
  sp = STACKTOP; //@line 12936
  return;
 }
 ___async_unwind = 0; //@line 12939
 HEAP32[$ReallocAsyncCtx16 >> 2] = 28; //@line 12940
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12941
 HEAP32[$4 >> 2] = $2; //@line 12942
 sp = STACKTOP; //@line 12943
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5100
 STACKTOP = STACKTOP + 32 | 0; //@line 5101
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5101
 $vararg_buffer = sp; //@line 5102
 HEAP32[$0 + 36 >> 2] = 5; //@line 5105
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5113
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5115
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5117
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5122
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5125
 STACKTOP = sp; //@line 5126
 return $14 | 0; //@line 5126
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13149
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13151
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13153
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 13154
 _wait_ms(150); //@line 13155
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 35; //@line 13158
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13159
  HEAP32[$4 >> 2] = $2; //@line 13160
  sp = STACKTOP; //@line 13161
  return;
 }
 ___async_unwind = 0; //@line 13164
 HEAP32[$ReallocAsyncCtx9 >> 2] = 35; //@line 13165
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13166
 HEAP32[$4 >> 2] = $2; //@line 13167
 sp = STACKTOP; //@line 13168
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13124
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13126
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13128
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13129
 _wait_ms(400); //@line 13130
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 36; //@line 13133
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13134
  HEAP32[$4 >> 2] = $2; //@line 13135
  sp = STACKTOP; //@line 13136
  return;
 }
 ___async_unwind = 0; //@line 13139
 HEAP32[$ReallocAsyncCtx8 >> 2] = 36; //@line 13140
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13141
 HEAP32[$4 >> 2] = $2; //@line 13142
 sp = STACKTOP; //@line 13143
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13099
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13101
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13103
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 13104
 _wait_ms(400); //@line 13105
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 37; //@line 13108
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13109
  HEAP32[$4 >> 2] = $2; //@line 13110
  sp = STACKTOP; //@line 13111
  return;
 }
 ___async_unwind = 0; //@line 13114
 HEAP32[$ReallocAsyncCtx7 >> 2] = 37; //@line 13115
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13116
 HEAP32[$4 >> 2] = $2; //@line 13117
 sp = STACKTOP; //@line 13118
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13074
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13076
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13078
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13079
 _wait_ms(400); //@line 13080
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 38; //@line 13083
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13084
  HEAP32[$4 >> 2] = $2; //@line 13085
  sp = STACKTOP; //@line 13086
  return;
 }
 ___async_unwind = 0; //@line 13089
 HEAP32[$ReallocAsyncCtx6 >> 2] = 38; //@line 13090
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13091
 HEAP32[$4 >> 2] = $2; //@line 13092
 sp = STACKTOP; //@line 13093
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13049
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13051
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13053
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 13054
 _wait_ms(400); //@line 13055
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 39; //@line 13058
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13059
  HEAP32[$4 >> 2] = $2; //@line 13060
  sp = STACKTOP; //@line 13061
  return;
 }
 ___async_unwind = 0; //@line 13064
 HEAP32[$ReallocAsyncCtx5 >> 2] = 39; //@line 13065
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13066
 HEAP32[$4 >> 2] = $2; //@line 13067
 sp = STACKTOP; //@line 13068
 return;
}
function _mbed_die__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13024
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13026
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13028
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 13029
 _wait_ms(400); //@line 13030
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 40; //@line 13033
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13034
  HEAP32[$4 >> 2] = $2; //@line 13035
  sp = STACKTOP; //@line 13036
  return;
 }
 ___async_unwind = 0; //@line 13039
 HEAP32[$ReallocAsyncCtx4 >> 2] = 40; //@line 13040
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13041
 HEAP32[$4 >> 2] = $2; //@line 13042
 sp = STACKTOP; //@line 13043
 return;
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12999
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13001
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13003
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 13004
 _wait_ms(400); //@line 13005
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 13008
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13009
  HEAP32[$4 >> 2] = $2; //@line 13010
  sp = STACKTOP; //@line 13011
  return;
 }
 ___async_unwind = 0; //@line 13014
 HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 13015
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13016
 HEAP32[$4 >> 2] = $2; //@line 13017
 sp = STACKTOP; //@line 13018
 return;
}
function _mbed_die__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12974
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12976
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12978
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12979
 _wait_ms(400); //@line 12980
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 12983
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12984
  HEAP32[$4 >> 2] = $2; //@line 12985
  sp = STACKTOP; //@line 12986
  return;
 }
 ___async_unwind = 0; //@line 12989
 HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 12990
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12991
 HEAP32[$4 >> 2] = $2; //@line 12992
 sp = STACKTOP; //@line 12993
 return;
}
function _mbed_die__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12949
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12951
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12953
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 12954
 _wait_ms(400); //@line 12955
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 12958
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 12959
  HEAP32[$4 >> 2] = $2; //@line 12960
  sp = STACKTOP; //@line 12961
  return;
 }
 ___async_unwind = 0; //@line 12964
 HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 12965
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 12966
 HEAP32[$4 >> 2] = $2; //@line 12967
 sp = STACKTOP; //@line 12968
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 340
 STACKTOP = STACKTOP + 16 | 0; //@line 341
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 341
 $3 = sp; //@line 342
 HEAP32[$3 >> 2] = $varargs; //@line 343
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 344
 _mbed_vtracef($0, $1, $2, $3); //@line 345
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 13; //@line 348
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 350
  sp = STACKTOP; //@line 351
  STACKTOP = sp; //@line 352
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 354
  STACKTOP = sp; //@line 355
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1464
 STACKTOP = STACKTOP + 16 | 0; //@line 1465
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1465
 $1 = sp; //@line 1466
 HEAP32[$1 >> 2] = $varargs; //@line 1467
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1468
 _mbed_error_vfprintf($0, $1); //@line 1469
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 1472
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1474
  sp = STACKTOP; //@line 1475
  STACKTOP = sp; //@line 1476
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1478
  STACKTOP = sp; //@line 1479
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 14050
 newDynamicTop = oldDynamicTop + increment | 0; //@line 14051
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 14055
  ___setErrNo(12); //@line 14056
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 14060
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 14064
   ___setErrNo(12); //@line 14065
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 14069
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 5271
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 5273
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5279
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5280
  if ($phitmp) {
   $13 = $11; //@line 5282
  } else {
   ___unlockfile($3); //@line 5284
   $13 = $11; //@line 5285
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5289
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5293
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5296
 }
 return $15 | 0; //@line 5298
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7607
 } else {
  $$056 = $2; //@line 7609
  $15 = $1; //@line 7609
  $8 = $0; //@line 7609
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7617
   HEAP8[$14 >> 0] = HEAPU8[1958 + ($8 & 15) >> 0] | 0 | $3; //@line 7618
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7619
   $15 = tempRet0; //@line 7620
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7625
    break;
   } else {
    $$056 = $14; //@line 7628
   }
  }
 }
 return $$05$lcssa | 0; //@line 7632
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 5488
 $3 = HEAP8[$1 >> 0] | 0; //@line 5490
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 5494
 $7 = HEAP32[$0 >> 2] | 0; //@line 5495
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 5500
  HEAP32[$0 + 4 >> 2] = 0; //@line 5502
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 5504
  HEAP32[$0 + 28 >> 2] = $14; //@line 5506
  HEAP32[$0 + 20 >> 2] = $14; //@line 5508
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5514
  $$0 = 0; //@line 5515
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 5518
  $$0 = -1; //@line 5519
 }
 return $$0 | 0; //@line 5521
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 9075
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 9078
 $$sink17$sink = $0; //@line 9078
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 9080
  $12 = HEAP8[$11 >> 0] | 0; //@line 9081
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 9089
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 9094
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 9099
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7644
 } else {
  $$06 = $2; //@line 7646
  $11 = $1; //@line 7646
  $7 = $0; //@line 7646
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7651
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7652
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7653
   $11 = tempRet0; //@line 7654
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 7659
    break;
   } else {
    $$06 = $10; //@line 7662
   }
  }
 }
 return $$0$lcssa | 0; //@line 7666
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10689
 do {
  if (!$0) {
   $3 = 0; //@line 10693
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10695
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 10696
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 80; //@line 10699
    sp = STACKTOP; //@line 10700
    return 0; //@line 10701
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10703
    $3 = ($2 | 0) != 0 & 1; //@line 10706
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 10711
}
function _invoke_ticker__async_cb_23($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12855
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 12861
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 12862
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12863
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 12864
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 12867
  sp = STACKTOP; //@line 12868
  return;
 }
 ___async_unwind = 0; //@line 12871
 HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 12872
 sp = STACKTOP; //@line 12873
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7288
 } else {
  $$04 = 0; //@line 7290
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7293
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7297
   $12 = $7 + 1 | 0; //@line 7298
   HEAP32[$0 >> 2] = $12; //@line 7299
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7305
    break;
   } else {
    $$04 = $11; //@line 7308
   }
  }
 }
 return $$0$lcssa | 0; //@line 7312
}
function ___fflush_unlocked__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12097
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12099
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12101
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12103
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 12105
 HEAP32[$4 >> 2] = 0; //@line 12106
 HEAP32[$6 >> 2] = 0; //@line 12107
 HEAP32[$8 >> 2] = 0; //@line 12108
 HEAP32[$10 >> 2] = 0; //@line 12109
 HEAP32[___async_retval >> 2] = 0; //@line 12111
 return;
}
function _mbed_vtracef__async_cb_1($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11207
 $1 = HEAP32[36] | 0; //@line 11208
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 11209
 FUNCTION_TABLE_vi[$1 & 127](1002); //@line 11210
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 17; //@line 11213
  sp = STACKTOP; //@line 11214
  return;
 }
 ___async_unwind = 0; //@line 11217
 HEAP32[$ReallocAsyncCtx3 >> 2] = 17; //@line 11218
 sp = STACKTOP; //@line 11219
 return;
}
function _serial_putc__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12524
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12526
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12527
 _fflush($2) | 0; //@line 12528
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 49; //@line 12531
  sp = STACKTOP; //@line 12532
  return;
 }
 ___async_unwind = 0; //@line 12535
 HEAP32[$ReallocAsyncCtx >> 2] = 49; //@line 12536
 sp = STACKTOP; //@line 12537
 return;
}
function _handle_lora_downlink($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 53
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 56
 __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5); //@line 57
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 60
  sp = STACKTOP; //@line 61
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 64
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 13901
 ___async_unwind = 1; //@line 13902
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 13908
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 13912
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 13916
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13918
 }
}
function _putchar($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9769
 $1 = HEAP32[40] | 0; //@line 9770
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 9771
 $2 = _fputc($0, $1) | 0; //@line 9772
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 67; //@line 9775
  sp = STACKTOP; //@line 9776
  return 0; //@line 9777
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9779
  return $2 | 0; //@line 9780
 }
 return 0; //@line 9782
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4911
 STACKTOP = STACKTOP + 16 | 0; //@line 4912
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4912
 $vararg_buffer = sp; //@line 4913
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4917
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4919
 STACKTOP = sp; //@line 4920
 return $5 | 0; //@line 4920
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 13843
 STACKTOP = STACKTOP + 16 | 0; //@line 13844
 $rem = __stackBase__ | 0; //@line 13845
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 13846
 STACKTOP = __stackBase__; //@line 13847
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 13848
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 13613
 if ((ret | 0) < 8) return ret | 0; //@line 13614
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 13615
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 13616
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 13617
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 13618
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 13619
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10074
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 9730
 $6 = HEAP32[$5 >> 2] | 0; //@line 9731
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 9732
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 9734
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 9736
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 9739
 return $2 | 0; //@line 9740
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12184
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 12195
  $$0 = 1; //@line 12196
 } else {
  $$0 = 0; //@line 12198
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 12202
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12556
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 12559
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 12564
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12567
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1612
 HEAP32[$0 >> 2] = $1; //@line 1613
 HEAP32[1014] = 1; //@line 1614
 $4 = $0; //@line 1615
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1620
 $10 = 4060; //@line 1621
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1623
 HEAP32[$10 + 4 >> 2] = $9; //@line 1626
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10150
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1716
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1717
 _emscripten_sleep($0 | 0); //@line 1718
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 1721
  sp = STACKTOP; //@line 1722
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1725
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 321
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 322
 _puts($0) | 0; //@line 323
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 12; //@line 326
  sp = STACKTOP; //@line 327
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 330
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
  $7 = $1 + 28 | 0; //@line 10214
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10218
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 13877
 HEAP32[new_frame + 4 >> 2] = sp; //@line 13879
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 13881
 ___async_cur_frame = new_frame; //@line 13882
 return ___async_cur_frame + 8 | 0; //@line 13883
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 11901
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11905
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 11908
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 13866
  return low << bits; //@line 13867
 }
 tempRet0 = low << bits - 32; //@line 13869
 return 0; //@line 13870
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 13855
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 13856
 }
 tempRet0 = 0; //@line 13858
 return high >>> bits - 32 | 0; //@line 13859
}
function _fflush__async_cb_20($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12757
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12759
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12762
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 12506
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12509
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 12512
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12910
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 12915
 _mbed_tracef(16, 1342, 1423, $2); //@line 12916
 HEAP32[___async_retval >> 2] = 0; //@line 12918
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 12266
 } else {
  $$0 = -1; //@line 12268
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 12271
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 5618
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 5624
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 5628
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 14125
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 13889
 stackRestore(___async_cur_frame | 0); //@line 13890
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13891
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12000
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 12001
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12003
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12883
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 12884
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12886
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1588
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1594
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 1595
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8729
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8729
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8731
 return $1 | 0; //@line 8732
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 13606
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 13607
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 13608
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5077
  $$0 = -1; //@line 5078
 } else {
  $$0 = $0; //@line 5080
 }
 return $$0 | 0; //@line 5082
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 13598
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 13600
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 14118
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 14111
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 5763
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 5768
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 7789
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 7792
 }
 return $$0 | 0; //@line 7794
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 14090
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 13835
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 12584
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 5258
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 5262
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 13896
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 13897
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10436
 __ZdlPv($0); //@line 10437
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 5754
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 5756
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9964
 __ZdlPv($0); //@line 9965
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 13432
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
  ___fwritex($1, $2, $0) | 0; //@line 7274
 }
 return;
}
function b67(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 14306
}
function b66(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 14303
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10161
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 13923
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b64(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 14300
}
function b63(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 14297
}
function _fflush__async_cb_21($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12772
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 7737
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12025
 return;
}
function _fputc__async_cb_12($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12013
 return;
}
function _putchar__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11924
 return;
}
function _putc__async_cb_24($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12896
 return;
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13420
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 14083
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 14141
 return 0; //@line 14141
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 14138
 return 0; //@line 14138
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 14135
 return 0; //@line 14135
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 14104
}
function b61(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 14294
}
function b60(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 14291
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 8982
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 14076
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 14097
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5135
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_41($0) {
 $0 = $0 | 0;
 return;
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_40($0) {
 $0 = $0 | 0;
 return;
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 14132
 return 0; //@line 14132
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb($0) {
 $0 = $0 | 0;
 return;
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
 ___lock(4632); //@line 5773
 return 4640; //@line 5774
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
 return _pthread_self() | 0; //@line 8903
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 8909
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function b1() {
 nullFunc_i(0); //@line 14129
 return 0; //@line 14129
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9951
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_lora_downlink__async_cb($0) {
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
 ___unlock(4632); //@line 5779
 return;
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 14288
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 14285
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 14282
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 14279
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 14276
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 14273
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 14270
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 14267
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 14264
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 14261
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 14258
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 14255
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 14252
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 14249
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 14246
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 14243
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 14240
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 14237
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 14234
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 14231
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 14228
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(106); //@line 14225
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(105); //@line 14222
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(104); //@line 14219
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(103); //@line 14216
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(102); //@line 14213
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(101); //@line 14210
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(100); //@line 14207
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(99); //@line 14204
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(98); //@line 14201
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(97); //@line 14198
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(96); //@line 14195
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(95); //@line 14192
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(94); //@line 14189
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(93); //@line 14186
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(92); //@line 14183
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(91); //@line 14180
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(90); //@line 14177
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(89); //@line 14174
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(88); //@line 14171
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(87); //@line 14168
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(86); //@line 14165
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(85); //@line 14162
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(84); //@line 14159
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(83); //@line 14156
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(82); //@line 14153
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(81); //@line 14150
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5093
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5410
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 14147
}
function _invoke_ticker__async_cb($0) {
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
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 4628; //@line 5087
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
function _pthread_self() {
 return 292; //@line 5140
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 14144
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_handle_lora_downlink__async_cb,__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_42,__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_41,__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb_40,__ZN16SX1276_LoRaRadio8rx_frameEPhjjhh__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_1,_mbed_vtracef__async_cb_2,_mbed_vtracef__async_cb_3,_mbed_vtracef__async_cb_10,_mbed_vtracef__async_cb_4,_mbed_vtracef__async_cb_9,_mbed_vtracef__async_cb_5,_mbed_vtracef__async_cb_6,_mbed_vtracef__async_cb_7,_mbed_vtracef__async_cb_8,_mbed_trace_array__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_39
,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb_28,_mbed_die__async_cb_27,_mbed_die__async_cb_26,_mbed_die__async_cb_25,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_17,_mbed_error_vfprintf__async_cb_16,_serial_putc__async_cb_18,_serial_putc__async_cb,_invoke_ticker__async_cb_23,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb,_putc__async_cb_24,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_21,_fflush__async_cb_20
,_fflush__async_cb_22,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_13,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_printf__async_cb,_putchar__async_cb,_fputc__async_cb_12,_fputc__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_15,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_19,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13,b14,b15,b16,b17,b18,b19
,b20,b21,b22,b23,b24,b25,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49
,b50,b51,b52,b53,b54,b55,b56,b57,b58];
var FUNCTION_TABLE_viiii = [b60,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b61];
var FUNCTION_TABLE_viiiii = [b63,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b64];
var FUNCTION_TABLE_viiiiii = [b66,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b67];

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






//# sourceMappingURL=trace.js.map
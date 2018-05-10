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
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_15", "_mbed_vtracef__async_cb_5", "_mbed_vtracef__async_cb_6", "_mbed_vtracef__async_cb_7", "_mbed_vtracef__async_cb_14", "_mbed_vtracef__async_cb_8", "_mbed_vtracef__async_cb_13", "_mbed_vtracef__async_cb_9", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_12", "_mbed_trace_array__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb_28", "_mbed_die__async_cb_27", "_mbed_die__async_cb_26", "_mbed_die__async_cb_25", "_mbed_die__async_cb_24", "_mbed_die__async_cb_23", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_3", "_mbed_error_vfprintf__async_cb_2", "_serial_putc__async_cb_38", "_serial_putc__async_cb", "_invoke_ticker__async_cb_1", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_main__async_cb", "_putc__async_cb_19", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_17", "_fflush__async_cb_16", "_fflush__async_cb_18", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_22", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_20", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_4", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 1730
 STACKTOP = STACKTOP + 16 | 0; //@line 1731
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1731
 $1 = sp; //@line 1732
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1739
   $7 = $6 >>> 3; //@line 1740
   $8 = HEAP32[1015] | 0; //@line 1741
   $9 = $8 >>> $7; //@line 1742
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1748
    $16 = 4100 + ($14 << 1 << 2) | 0; //@line 1750
    $17 = $16 + 8 | 0; //@line 1751
    $18 = HEAP32[$17 >> 2] | 0; //@line 1752
    $19 = $18 + 8 | 0; //@line 1753
    $20 = HEAP32[$19 >> 2] | 0; //@line 1754
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1015] = $8 & ~(1 << $14); //@line 1761
     } else {
      if ((HEAP32[1019] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1766
      }
      $27 = $20 + 12 | 0; //@line 1769
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1773
       HEAP32[$17 >> 2] = $20; //@line 1774
       break;
      } else {
       _abort(); //@line 1777
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1782
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1785
    $34 = $18 + $30 + 4 | 0; //@line 1787
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1790
    $$0 = $19; //@line 1791
    STACKTOP = sp; //@line 1792
    return $$0 | 0; //@line 1792
   }
   $37 = HEAP32[1017] | 0; //@line 1794
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1800
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1803
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1806
     $49 = $47 >>> 12 & 16; //@line 1808
     $50 = $47 >>> $49; //@line 1809
     $52 = $50 >>> 5 & 8; //@line 1811
     $54 = $50 >>> $52; //@line 1813
     $56 = $54 >>> 2 & 4; //@line 1815
     $58 = $54 >>> $56; //@line 1817
     $60 = $58 >>> 1 & 2; //@line 1819
     $62 = $58 >>> $60; //@line 1821
     $64 = $62 >>> 1 & 1; //@line 1823
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1826
     $69 = 4100 + ($67 << 1 << 2) | 0; //@line 1828
     $70 = $69 + 8 | 0; //@line 1829
     $71 = HEAP32[$70 >> 2] | 0; //@line 1830
     $72 = $71 + 8 | 0; //@line 1831
     $73 = HEAP32[$72 >> 2] | 0; //@line 1832
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1838
       HEAP32[1015] = $77; //@line 1839
       $98 = $77; //@line 1840
      } else {
       if ((HEAP32[1019] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1845
       }
       $80 = $73 + 12 | 0; //@line 1848
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1852
        HEAP32[$70 >> 2] = $73; //@line 1853
        $98 = $8; //@line 1854
        break;
       } else {
        _abort(); //@line 1857
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1862
     $84 = $83 - $6 | 0; //@line 1863
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1866
     $87 = $71 + $6 | 0; //@line 1867
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1870
     HEAP32[$71 + $83 >> 2] = $84; //@line 1872
     if ($37 | 0) {
      $92 = HEAP32[1020] | 0; //@line 1875
      $93 = $37 >>> 3; //@line 1876
      $95 = 4100 + ($93 << 1 << 2) | 0; //@line 1878
      $96 = 1 << $93; //@line 1879
      if (!($98 & $96)) {
       HEAP32[1015] = $98 | $96; //@line 1884
       $$0199 = $95; //@line 1886
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1886
      } else {
       $101 = $95 + 8 | 0; //@line 1888
       $102 = HEAP32[$101 >> 2] | 0; //@line 1889
       if ((HEAP32[1019] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1893
       } else {
        $$0199 = $102; //@line 1896
        $$pre$phiZ2D = $101; //@line 1896
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1899
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1901
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1903
      HEAP32[$92 + 12 >> 2] = $95; //@line 1905
     }
     HEAP32[1017] = $84; //@line 1907
     HEAP32[1020] = $87; //@line 1908
     $$0 = $72; //@line 1909
     STACKTOP = sp; //@line 1910
     return $$0 | 0; //@line 1910
    }
    $108 = HEAP32[1016] | 0; //@line 1912
    if (!$108) {
     $$0197 = $6; //@line 1915
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1919
     $114 = $112 >>> 12 & 16; //@line 1921
     $115 = $112 >>> $114; //@line 1922
     $117 = $115 >>> 5 & 8; //@line 1924
     $119 = $115 >>> $117; //@line 1926
     $121 = $119 >>> 2 & 4; //@line 1928
     $123 = $119 >>> $121; //@line 1930
     $125 = $123 >>> 1 & 2; //@line 1932
     $127 = $123 >>> $125; //@line 1934
     $129 = $127 >>> 1 & 1; //@line 1936
     $134 = HEAP32[4364 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1941
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1945
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1951
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1954
      $$0193$lcssa$i = $138; //@line 1954
     } else {
      $$01926$i = $134; //@line 1956
      $$01935$i = $138; //@line 1956
      $146 = $143; //@line 1956
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1961
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1962
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1963
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1964
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1970
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1973
        $$0193$lcssa$i = $$$0193$i; //@line 1973
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1976
        $$01935$i = $$$0193$i; //@line 1976
       }
      }
     }
     $157 = HEAP32[1019] | 0; //@line 1980
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1983
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1986
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1989
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1993
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1995
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1999
       $176 = HEAP32[$175 >> 2] | 0; //@line 2000
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2003
        $179 = HEAP32[$178 >> 2] | 0; //@line 2004
        if (!$179) {
         $$3$i = 0; //@line 2007
         break;
        } else {
         $$1196$i = $179; //@line 2010
         $$1198$i = $178; //@line 2010
        }
       } else {
        $$1196$i = $176; //@line 2013
        $$1198$i = $175; //@line 2013
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2016
        $182 = HEAP32[$181 >> 2] | 0; //@line 2017
        if ($182 | 0) {
         $$1196$i = $182; //@line 2020
         $$1198$i = $181; //@line 2020
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2023
        $185 = HEAP32[$184 >> 2] | 0; //@line 2024
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2029
         $$1198$i = $184; //@line 2029
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2034
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2037
        $$3$i = $$1196$i; //@line 2038
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2043
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2046
       }
       $169 = $167 + 12 | 0; //@line 2049
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2053
       }
       $172 = $164 + 8 | 0; //@line 2056
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2060
        HEAP32[$172 >> 2] = $167; //@line 2061
        $$3$i = $164; //@line 2062
        break;
       } else {
        _abort(); //@line 2065
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2074
       $191 = 4364 + ($190 << 2) | 0; //@line 2075
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2080
         if (!$$3$i) {
          HEAP32[1016] = $108 & ~(1 << $190); //@line 2086
          break L73;
         }
        } else {
         if ((HEAP32[1019] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2093
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2101
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1019] | 0; //@line 2111
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 2114
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 2118
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 2120
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 2126
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2130
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2132
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2138
       if ($214 | 0) {
        if ((HEAP32[1019] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2144
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2148
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2150
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2158
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2161
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2163
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2166
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2170
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2173
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2175
      if ($37 | 0) {
       $234 = HEAP32[1020] | 0; //@line 2178
       $235 = $37 >>> 3; //@line 2179
       $237 = 4100 + ($235 << 1 << 2) | 0; //@line 2181
       $238 = 1 << $235; //@line 2182
       if (!($8 & $238)) {
        HEAP32[1015] = $8 | $238; //@line 2187
        $$0189$i = $237; //@line 2189
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2189
       } else {
        $242 = $237 + 8 | 0; //@line 2191
        $243 = HEAP32[$242 >> 2] | 0; //@line 2192
        if ((HEAP32[1019] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2196
        } else {
         $$0189$i = $243; //@line 2199
         $$pre$phi$iZ2D = $242; //@line 2199
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2202
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2204
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2206
       HEAP32[$234 + 12 >> 2] = $237; //@line 2208
      }
      HEAP32[1017] = $$0193$lcssa$i; //@line 2210
      HEAP32[1020] = $159; //@line 2211
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2214
     STACKTOP = sp; //@line 2215
     return $$0 | 0; //@line 2215
    }
   } else {
    $$0197 = $6; //@line 2218
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2223
   } else {
    $251 = $0 + 11 | 0; //@line 2225
    $252 = $251 & -8; //@line 2226
    $253 = HEAP32[1016] | 0; //@line 2227
    if (!$253) {
     $$0197 = $252; //@line 2230
    } else {
     $255 = 0 - $252 | 0; //@line 2232
     $256 = $251 >>> 8; //@line 2233
     if (!$256) {
      $$0358$i = 0; //@line 2236
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2240
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2244
       $262 = $256 << $261; //@line 2245
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2248
       $267 = $262 << $265; //@line 2250
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2253
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2258
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2264
      }
     }
     $282 = HEAP32[4364 + ($$0358$i << 2) >> 2] | 0; //@line 2268
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2272
       $$3$i203 = 0; //@line 2272
       $$3350$i = $255; //@line 2272
       label = 81; //@line 2273
      } else {
       $$0342$i = 0; //@line 2280
       $$0347$i = $255; //@line 2280
       $$0353$i = $282; //@line 2280
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2280
       $$0362$i = 0; //@line 2280
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2285
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2290
          $$435113$i = 0; //@line 2290
          $$435712$i = $$0353$i; //@line 2290
          label = 85; //@line 2291
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2294
          $$1348$i = $292; //@line 2294
         }
        } else {
         $$1343$i = $$0342$i; //@line 2297
         $$1348$i = $$0347$i; //@line 2297
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2300
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2303
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2307
        $302 = ($$0353$i | 0) == 0; //@line 2308
        if ($302) {
         $$2355$i = $$1363$i; //@line 2313
         $$3$i203 = $$1343$i; //@line 2313
         $$3350$i = $$1348$i; //@line 2313
         label = 81; //@line 2314
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2317
         $$0347$i = $$1348$i; //@line 2317
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2317
         $$0362$i = $$1363$i; //@line 2317
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2327
       $309 = $253 & ($306 | 0 - $306); //@line 2330
       if (!$309) {
        $$0197 = $252; //@line 2333
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2338
       $315 = $313 >>> 12 & 16; //@line 2340
       $316 = $313 >>> $315; //@line 2341
       $318 = $316 >>> 5 & 8; //@line 2343
       $320 = $316 >>> $318; //@line 2345
       $322 = $320 >>> 2 & 4; //@line 2347
       $324 = $320 >>> $322; //@line 2349
       $326 = $324 >>> 1 & 2; //@line 2351
       $328 = $324 >>> $326; //@line 2353
       $330 = $328 >>> 1 & 1; //@line 2355
       $$4$ph$i = 0; //@line 2361
       $$4357$ph$i = HEAP32[4364 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2361
      } else {
       $$4$ph$i = $$3$i203; //@line 2363
       $$4357$ph$i = $$2355$i; //@line 2363
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2367
       $$4351$lcssa$i = $$3350$i; //@line 2367
      } else {
       $$414$i = $$4$ph$i; //@line 2369
       $$435113$i = $$3350$i; //@line 2369
       $$435712$i = $$4357$ph$i; //@line 2369
       label = 85; //@line 2370
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2375
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2379
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2380
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2381
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2382
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2388
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2391
        $$4351$lcssa$i = $$$4351$i; //@line 2391
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2394
        $$435113$i = $$$4351$i; //@line 2394
        label = 85; //@line 2395
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2401
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1017] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1019] | 0; //@line 2407
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2410
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2413
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2416
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2420
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2422
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2426
         $371 = HEAP32[$370 >> 2] | 0; //@line 2427
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2430
          $374 = HEAP32[$373 >> 2] | 0; //@line 2431
          if (!$374) {
           $$3372$i = 0; //@line 2434
           break;
          } else {
           $$1370$i = $374; //@line 2437
           $$1374$i = $373; //@line 2437
          }
         } else {
          $$1370$i = $371; //@line 2440
          $$1374$i = $370; //@line 2440
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2443
          $377 = HEAP32[$376 >> 2] | 0; //@line 2444
          if ($377 | 0) {
           $$1370$i = $377; //@line 2447
           $$1374$i = $376; //@line 2447
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2450
          $380 = HEAP32[$379 >> 2] | 0; //@line 2451
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2456
           $$1374$i = $379; //@line 2456
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2461
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2464
          $$3372$i = $$1370$i; //@line 2465
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2470
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2473
         }
         $364 = $362 + 12 | 0; //@line 2476
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2480
         }
         $367 = $359 + 8 | 0; //@line 2483
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2487
          HEAP32[$367 >> 2] = $362; //@line 2488
          $$3372$i = $359; //@line 2489
          break;
         } else {
          _abort(); //@line 2492
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2500
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2503
         $386 = 4364 + ($385 << 2) | 0; //@line 2504
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2509
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2514
            HEAP32[1016] = $391; //@line 2515
            $475 = $391; //@line 2516
            break L164;
           }
          } else {
           if ((HEAP32[1019] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2523
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2531
            if (!$$3372$i) {
             $475 = $253; //@line 2534
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1019] | 0; //@line 2542
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2545
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2549
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2551
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2557
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2561
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2563
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2569
         if (!$409) {
          $475 = $253; //@line 2572
         } else {
          if ((HEAP32[1019] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2577
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2581
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2583
           $475 = $253; //@line 2584
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2593
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2596
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2598
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2601
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2605
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2608
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2610
         $428 = $$4351$lcssa$i >>> 3; //@line 2611
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4100 + ($428 << 1 << 2) | 0; //@line 2615
          $432 = HEAP32[1015] | 0; //@line 2616
          $433 = 1 << $428; //@line 2617
          if (!($432 & $433)) {
           HEAP32[1015] = $432 | $433; //@line 2622
           $$0368$i = $431; //@line 2624
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2624
          } else {
           $437 = $431 + 8 | 0; //@line 2626
           $438 = HEAP32[$437 >> 2] | 0; //@line 2627
           if ((HEAP32[1019] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2631
           } else {
            $$0368$i = $438; //@line 2634
            $$pre$phi$i211Z2D = $437; //@line 2634
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2637
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2639
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2641
          HEAP32[$354 + 12 >> 2] = $431; //@line 2643
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2646
         if (!$444) {
          $$0361$i = 0; //@line 2649
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2653
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2657
           $450 = $444 << $449; //@line 2658
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2661
           $455 = $450 << $453; //@line 2663
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2666
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2671
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2677
          }
         }
         $469 = 4364 + ($$0361$i << 2) | 0; //@line 2680
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2682
         $471 = $354 + 16 | 0; //@line 2683
         HEAP32[$471 + 4 >> 2] = 0; //@line 2685
         HEAP32[$471 >> 2] = 0; //@line 2686
         $473 = 1 << $$0361$i; //@line 2687
         if (!($475 & $473)) {
          HEAP32[1016] = $475 | $473; //@line 2692
          HEAP32[$469 >> 2] = $354; //@line 2693
          HEAP32[$354 + 24 >> 2] = $469; //@line 2695
          HEAP32[$354 + 12 >> 2] = $354; //@line 2697
          HEAP32[$354 + 8 >> 2] = $354; //@line 2699
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2708
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2708
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2715
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2719
          $494 = HEAP32[$492 >> 2] | 0; //@line 2721
          if (!$494) {
           label = 136; //@line 2724
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2727
           $$0345$i = $494; //@line 2727
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1019] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2734
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2737
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2739
           HEAP32[$354 + 12 >> 2] = $354; //@line 2741
           HEAP32[$354 + 8 >> 2] = $354; //@line 2743
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2748
          $502 = HEAP32[$501 >> 2] | 0; //@line 2749
          $503 = HEAP32[1019] | 0; //@line 2750
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2756
           HEAP32[$501 >> 2] = $354; //@line 2757
           HEAP32[$354 + 8 >> 2] = $502; //@line 2759
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2761
           HEAP32[$354 + 24 >> 2] = 0; //@line 2763
           break;
          } else {
           _abort(); //@line 2766
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2773
       STACKTOP = sp; //@line 2774
       return $$0 | 0; //@line 2774
      } else {
       $$0197 = $252; //@line 2776
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1017] | 0; //@line 2783
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2786
  $515 = HEAP32[1020] | 0; //@line 2787
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2790
   HEAP32[1020] = $517; //@line 2791
   HEAP32[1017] = $514; //@line 2792
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2795
   HEAP32[$515 + $512 >> 2] = $514; //@line 2797
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2800
  } else {
   HEAP32[1017] = 0; //@line 2802
   HEAP32[1020] = 0; //@line 2803
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2806
   $526 = $515 + $512 + 4 | 0; //@line 2808
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2811
  }
  $$0 = $515 + 8 | 0; //@line 2814
  STACKTOP = sp; //@line 2815
  return $$0 | 0; //@line 2815
 }
 $530 = HEAP32[1018] | 0; //@line 2817
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2820
  HEAP32[1018] = $532; //@line 2821
  $533 = HEAP32[1021] | 0; //@line 2822
  $534 = $533 + $$0197 | 0; //@line 2823
  HEAP32[1021] = $534; //@line 2824
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2827
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2830
  $$0 = $533 + 8 | 0; //@line 2832
  STACKTOP = sp; //@line 2833
  return $$0 | 0; //@line 2833
 }
 if (!(HEAP32[1133] | 0)) {
  HEAP32[1135] = 4096; //@line 2838
  HEAP32[1134] = 4096; //@line 2839
  HEAP32[1136] = -1; //@line 2840
  HEAP32[1137] = -1; //@line 2841
  HEAP32[1138] = 0; //@line 2842
  HEAP32[1126] = 0; //@line 2843
  HEAP32[1133] = $1 & -16 ^ 1431655768; //@line 2847
  $548 = 4096; //@line 2848
 } else {
  $548 = HEAP32[1135] | 0; //@line 2851
 }
 $545 = $$0197 + 48 | 0; //@line 2853
 $546 = $$0197 + 47 | 0; //@line 2854
 $547 = $548 + $546 | 0; //@line 2855
 $549 = 0 - $548 | 0; //@line 2856
 $550 = $547 & $549; //@line 2857
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2860
  STACKTOP = sp; //@line 2861
  return $$0 | 0; //@line 2861
 }
 $552 = HEAP32[1125] | 0; //@line 2863
 if ($552 | 0) {
  $554 = HEAP32[1123] | 0; //@line 2866
  $555 = $554 + $550 | 0; //@line 2867
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2872
   STACKTOP = sp; //@line 2873
   return $$0 | 0; //@line 2873
  }
 }
 L244 : do {
  if (!(HEAP32[1126] & 4)) {
   $561 = HEAP32[1021] | 0; //@line 2881
   L246 : do {
    if (!$561) {
     label = 163; //@line 2885
    } else {
     $$0$i$i = 4508; //@line 2887
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2889
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2892
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2901
      if (!$570) {
       label = 163; //@line 2904
       break L246;
      } else {
       $$0$i$i = $570; //@line 2907
      }
     }
     $595 = $547 - $530 & $549; //@line 2911
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2914
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2922
       } else {
        $$723947$i = $595; //@line 2924
        $$748$i = $597; //@line 2924
        label = 180; //@line 2925
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2929
       $$2253$ph$i = $595; //@line 2929
       label = 171; //@line 2930
      }
     } else {
      $$2234243136$i = 0; //@line 2933
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2939
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2942
     } else {
      $574 = $572; //@line 2944
      $575 = HEAP32[1134] | 0; //@line 2945
      $576 = $575 + -1 | 0; //@line 2946
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2954
      $584 = HEAP32[1123] | 0; //@line 2955
      $585 = $$$i + $584 | 0; //@line 2956
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1125] | 0; //@line 2961
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2968
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2972
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2975
        $$748$i = $572; //@line 2975
        label = 180; //@line 2976
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2979
        $$2253$ph$i = $$$i; //@line 2979
        label = 171; //@line 2980
       }
      } else {
       $$2234243136$i = 0; //@line 2983
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2990
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2999
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3002
       $$748$i = $$2247$ph$i; //@line 3002
       label = 180; //@line 3003
       break L244;
      }
     }
     $607 = HEAP32[1135] | 0; //@line 3007
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3011
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3014
      $$748$i = $$2247$ph$i; //@line 3014
      label = 180; //@line 3015
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3021
      $$2234243136$i = 0; //@line 3022
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3026
      $$748$i = $$2247$ph$i; //@line 3026
      label = 180; //@line 3027
      break L244;
     }
    }
   } while (0);
   HEAP32[1126] = HEAP32[1126] | 4; //@line 3034
   $$4236$i = $$2234243136$i; //@line 3035
   label = 178; //@line 3036
  } else {
   $$4236$i = 0; //@line 3038
   label = 178; //@line 3039
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3045
   $621 = _sbrk(0) | 0; //@line 3046
   $627 = $621 - $620 | 0; //@line 3054
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3056
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3064
    $$748$i = $620; //@line 3064
    label = 180; //@line 3065
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1123] | 0) + $$723947$i | 0; //@line 3071
  HEAP32[1123] = $633; //@line 3072
  if ($633 >>> 0 > (HEAP32[1124] | 0) >>> 0) {
   HEAP32[1124] = $633; //@line 3076
  }
  $636 = HEAP32[1021] | 0; //@line 3078
  do {
   if (!$636) {
    $638 = HEAP32[1019] | 0; //@line 3082
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1019] = $$748$i; //@line 3087
    }
    HEAP32[1127] = $$748$i; //@line 3089
    HEAP32[1128] = $$723947$i; //@line 3090
    HEAP32[1130] = 0; //@line 3091
    HEAP32[1024] = HEAP32[1133]; //@line 3093
    HEAP32[1023] = -1; //@line 3094
    HEAP32[1028] = 4100; //@line 3095
    HEAP32[1027] = 4100; //@line 3096
    HEAP32[1030] = 4108; //@line 3097
    HEAP32[1029] = 4108; //@line 3098
    HEAP32[1032] = 4116; //@line 3099
    HEAP32[1031] = 4116; //@line 3100
    HEAP32[1034] = 4124; //@line 3101
    HEAP32[1033] = 4124; //@line 3102
    HEAP32[1036] = 4132; //@line 3103
    HEAP32[1035] = 4132; //@line 3104
    HEAP32[1038] = 4140; //@line 3105
    HEAP32[1037] = 4140; //@line 3106
    HEAP32[1040] = 4148; //@line 3107
    HEAP32[1039] = 4148; //@line 3108
    HEAP32[1042] = 4156; //@line 3109
    HEAP32[1041] = 4156; //@line 3110
    HEAP32[1044] = 4164; //@line 3111
    HEAP32[1043] = 4164; //@line 3112
    HEAP32[1046] = 4172; //@line 3113
    HEAP32[1045] = 4172; //@line 3114
    HEAP32[1048] = 4180; //@line 3115
    HEAP32[1047] = 4180; //@line 3116
    HEAP32[1050] = 4188; //@line 3117
    HEAP32[1049] = 4188; //@line 3118
    HEAP32[1052] = 4196; //@line 3119
    HEAP32[1051] = 4196; //@line 3120
    HEAP32[1054] = 4204; //@line 3121
    HEAP32[1053] = 4204; //@line 3122
    HEAP32[1056] = 4212; //@line 3123
    HEAP32[1055] = 4212; //@line 3124
    HEAP32[1058] = 4220; //@line 3125
    HEAP32[1057] = 4220; //@line 3126
    HEAP32[1060] = 4228; //@line 3127
    HEAP32[1059] = 4228; //@line 3128
    HEAP32[1062] = 4236; //@line 3129
    HEAP32[1061] = 4236; //@line 3130
    HEAP32[1064] = 4244; //@line 3131
    HEAP32[1063] = 4244; //@line 3132
    HEAP32[1066] = 4252; //@line 3133
    HEAP32[1065] = 4252; //@line 3134
    HEAP32[1068] = 4260; //@line 3135
    HEAP32[1067] = 4260; //@line 3136
    HEAP32[1070] = 4268; //@line 3137
    HEAP32[1069] = 4268; //@line 3138
    HEAP32[1072] = 4276; //@line 3139
    HEAP32[1071] = 4276; //@line 3140
    HEAP32[1074] = 4284; //@line 3141
    HEAP32[1073] = 4284; //@line 3142
    HEAP32[1076] = 4292; //@line 3143
    HEAP32[1075] = 4292; //@line 3144
    HEAP32[1078] = 4300; //@line 3145
    HEAP32[1077] = 4300; //@line 3146
    HEAP32[1080] = 4308; //@line 3147
    HEAP32[1079] = 4308; //@line 3148
    HEAP32[1082] = 4316; //@line 3149
    HEAP32[1081] = 4316; //@line 3150
    HEAP32[1084] = 4324; //@line 3151
    HEAP32[1083] = 4324; //@line 3152
    HEAP32[1086] = 4332; //@line 3153
    HEAP32[1085] = 4332; //@line 3154
    HEAP32[1088] = 4340; //@line 3155
    HEAP32[1087] = 4340; //@line 3156
    HEAP32[1090] = 4348; //@line 3157
    HEAP32[1089] = 4348; //@line 3158
    $642 = $$723947$i + -40 | 0; //@line 3159
    $644 = $$748$i + 8 | 0; //@line 3161
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3166
    $650 = $$748$i + $649 | 0; //@line 3167
    $651 = $642 - $649 | 0; //@line 3168
    HEAP32[1021] = $650; //@line 3169
    HEAP32[1018] = $651; //@line 3170
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3173
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3176
    HEAP32[1022] = HEAP32[1137]; //@line 3178
   } else {
    $$024367$i = 4508; //@line 3180
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3182
     $658 = $$024367$i + 4 | 0; //@line 3183
     $659 = HEAP32[$658 >> 2] | 0; //@line 3184
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3188
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3192
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3197
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3211
       $673 = (HEAP32[1018] | 0) + $$723947$i | 0; //@line 3213
       $675 = $636 + 8 | 0; //@line 3215
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3220
       $681 = $636 + $680 | 0; //@line 3221
       $682 = $673 - $680 | 0; //@line 3222
       HEAP32[1021] = $681; //@line 3223
       HEAP32[1018] = $682; //@line 3224
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3227
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3230
       HEAP32[1022] = HEAP32[1137]; //@line 3232
       break;
      }
     }
    }
    $688 = HEAP32[1019] | 0; //@line 3237
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1019] = $$748$i; //@line 3240
     $753 = $$748$i; //@line 3241
    } else {
     $753 = $688; //@line 3243
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3245
    $$124466$i = 4508; //@line 3246
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3251
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3255
     if (!$694) {
      $$0$i$i$i = 4508; //@line 3258
      break;
     } else {
      $$124466$i = $694; //@line 3261
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3270
      $700 = $$124466$i + 4 | 0; //@line 3271
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3274
      $704 = $$748$i + 8 | 0; //@line 3276
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3282
      $712 = $690 + 8 | 0; //@line 3284
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3290
      $722 = $710 + $$0197 | 0; //@line 3294
      $723 = $718 - $710 - $$0197 | 0; //@line 3295
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3298
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1018] | 0) + $723 | 0; //@line 3303
        HEAP32[1018] = $728; //@line 3304
        HEAP32[1021] = $722; //@line 3305
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3308
       } else {
        if ((HEAP32[1020] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1017] | 0) + $723 | 0; //@line 3314
         HEAP32[1017] = $734; //@line 3315
         HEAP32[1020] = $722; //@line 3316
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3319
         HEAP32[$722 + $734 >> 2] = $734; //@line 3321
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3325
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3329
         $743 = $739 >>> 3; //@line 3330
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3335
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3337
           $750 = 4100 + ($743 << 1 << 2) | 0; //@line 3339
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3345
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3354
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1015] = HEAP32[1015] & ~(1 << $743); //@line 3364
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3371
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3375
             }
             $764 = $748 + 8 | 0; //@line 3378
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3382
              break;
             }
             _abort(); //@line 3385
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3390
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3391
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3394
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3396
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3400
             $783 = $782 + 4 | 0; //@line 3401
             $784 = HEAP32[$783 >> 2] | 0; //@line 3402
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3405
              if (!$786) {
               $$3$i$i = 0; //@line 3408
               break;
              } else {
               $$1291$i$i = $786; //@line 3411
               $$1293$i$i = $782; //@line 3411
              }
             } else {
              $$1291$i$i = $784; //@line 3414
              $$1293$i$i = $783; //@line 3414
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3417
              $789 = HEAP32[$788 >> 2] | 0; //@line 3418
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3421
               $$1293$i$i = $788; //@line 3421
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3424
              $792 = HEAP32[$791 >> 2] | 0; //@line 3425
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3430
               $$1293$i$i = $791; //@line 3430
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3435
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3438
              $$3$i$i = $$1291$i$i; //@line 3439
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3444
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3447
             }
             $776 = $774 + 12 | 0; //@line 3450
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3454
             }
             $779 = $771 + 8 | 0; //@line 3457
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3461
              HEAP32[$779 >> 2] = $774; //@line 3462
              $$3$i$i = $771; //@line 3463
              break;
             } else {
              _abort(); //@line 3466
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3476
           $798 = 4364 + ($797 << 2) | 0; //@line 3477
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3482
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1016] = HEAP32[1016] & ~(1 << $797); //@line 3491
             break L311;
            } else {
             if ((HEAP32[1019] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3497
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3505
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1019] | 0; //@line 3515
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3518
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3522
           $815 = $718 + 16 | 0; //@line 3523
           $816 = HEAP32[$815 >> 2] | 0; //@line 3524
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3530
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3534
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3536
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3542
           if (!$822) {
            break;
           }
           if ((HEAP32[1019] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3550
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3554
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3556
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3563
         $$0287$i$i = $742 + $723 | 0; //@line 3563
        } else {
         $$0$i17$i = $718; //@line 3565
         $$0287$i$i = $723; //@line 3565
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3567
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3570
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3573
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3575
        $836 = $$0287$i$i >>> 3; //@line 3576
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4100 + ($836 << 1 << 2) | 0; //@line 3580
         $840 = HEAP32[1015] | 0; //@line 3581
         $841 = 1 << $836; //@line 3582
         do {
          if (!($840 & $841)) {
           HEAP32[1015] = $840 | $841; //@line 3588
           $$0295$i$i = $839; //@line 3590
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3590
          } else {
           $845 = $839 + 8 | 0; //@line 3592
           $846 = HEAP32[$845 >> 2] | 0; //@line 3593
           if ((HEAP32[1019] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3597
            $$pre$phi$i19$iZ2D = $845; //@line 3597
            break;
           }
           _abort(); //@line 3600
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3604
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3606
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3608
         HEAP32[$722 + 12 >> 2] = $839; //@line 3610
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3613
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3617
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3621
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3626
          $858 = $852 << $857; //@line 3627
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3630
          $863 = $858 << $861; //@line 3632
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3635
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3640
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3646
         }
        } while (0);
        $877 = 4364 + ($$0296$i$i << 2) | 0; //@line 3649
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3651
        $879 = $722 + 16 | 0; //@line 3652
        HEAP32[$879 + 4 >> 2] = 0; //@line 3654
        HEAP32[$879 >> 2] = 0; //@line 3655
        $881 = HEAP32[1016] | 0; //@line 3656
        $882 = 1 << $$0296$i$i; //@line 3657
        if (!($881 & $882)) {
         HEAP32[1016] = $881 | $882; //@line 3662
         HEAP32[$877 >> 2] = $722; //@line 3663
         HEAP32[$722 + 24 >> 2] = $877; //@line 3665
         HEAP32[$722 + 12 >> 2] = $722; //@line 3667
         HEAP32[$722 + 8 >> 2] = $722; //@line 3669
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3678
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3678
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3685
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3689
         $902 = HEAP32[$900 >> 2] | 0; //@line 3691
         if (!$902) {
          label = 260; //@line 3694
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3697
          $$0289$i$i = $902; //@line 3697
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1019] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3704
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3707
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3709
          HEAP32[$722 + 12 >> 2] = $722; //@line 3711
          HEAP32[$722 + 8 >> 2] = $722; //@line 3713
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3718
         $910 = HEAP32[$909 >> 2] | 0; //@line 3719
         $911 = HEAP32[1019] | 0; //@line 3720
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3726
          HEAP32[$909 >> 2] = $722; //@line 3727
          HEAP32[$722 + 8 >> 2] = $910; //@line 3729
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3731
          HEAP32[$722 + 24 >> 2] = 0; //@line 3733
          break;
         } else {
          _abort(); //@line 3736
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3743
      STACKTOP = sp; //@line 3744
      return $$0 | 0; //@line 3744
     } else {
      $$0$i$i$i = 4508; //@line 3746
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3750
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3755
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3763
    }
    $927 = $923 + -47 | 0; //@line 3765
    $929 = $927 + 8 | 0; //@line 3767
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3773
    $936 = $636 + 16 | 0; //@line 3774
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3776
    $939 = $938 + 8 | 0; //@line 3777
    $940 = $938 + 24 | 0; //@line 3778
    $941 = $$723947$i + -40 | 0; //@line 3779
    $943 = $$748$i + 8 | 0; //@line 3781
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3786
    $949 = $$748$i + $948 | 0; //@line 3787
    $950 = $941 - $948 | 0; //@line 3788
    HEAP32[1021] = $949; //@line 3789
    HEAP32[1018] = $950; //@line 3790
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3793
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3796
    HEAP32[1022] = HEAP32[1137]; //@line 3798
    $956 = $938 + 4 | 0; //@line 3799
    HEAP32[$956 >> 2] = 27; //@line 3800
    HEAP32[$939 >> 2] = HEAP32[1127]; //@line 3801
    HEAP32[$939 + 4 >> 2] = HEAP32[1128]; //@line 3801
    HEAP32[$939 + 8 >> 2] = HEAP32[1129]; //@line 3801
    HEAP32[$939 + 12 >> 2] = HEAP32[1130]; //@line 3801
    HEAP32[1127] = $$748$i; //@line 3802
    HEAP32[1128] = $$723947$i; //@line 3803
    HEAP32[1130] = 0; //@line 3804
    HEAP32[1129] = $939; //@line 3805
    $958 = $940; //@line 3806
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3808
     HEAP32[$958 >> 2] = 7; //@line 3809
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3822
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3825
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3828
     HEAP32[$938 >> 2] = $964; //@line 3829
     $969 = $964 >>> 3; //@line 3830
     if ($964 >>> 0 < 256) {
      $972 = 4100 + ($969 << 1 << 2) | 0; //@line 3834
      $973 = HEAP32[1015] | 0; //@line 3835
      $974 = 1 << $969; //@line 3836
      if (!($973 & $974)) {
       HEAP32[1015] = $973 | $974; //@line 3841
       $$0211$i$i = $972; //@line 3843
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3843
      } else {
       $978 = $972 + 8 | 0; //@line 3845
       $979 = HEAP32[$978 >> 2] | 0; //@line 3846
       if ((HEAP32[1019] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3850
       } else {
        $$0211$i$i = $979; //@line 3853
        $$pre$phi$i$iZ2D = $978; //@line 3853
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3856
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3858
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3860
      HEAP32[$636 + 12 >> 2] = $972; //@line 3862
      break;
     }
     $985 = $964 >>> 8; //@line 3865
     if (!$985) {
      $$0212$i$i = 0; //@line 3868
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3872
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3876
       $991 = $985 << $990; //@line 3877
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3880
       $996 = $991 << $994; //@line 3882
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3885
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3890
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3896
      }
     }
     $1010 = 4364 + ($$0212$i$i << 2) | 0; //@line 3899
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3901
     HEAP32[$636 + 20 >> 2] = 0; //@line 3903
     HEAP32[$936 >> 2] = 0; //@line 3904
     $1013 = HEAP32[1016] | 0; //@line 3905
     $1014 = 1 << $$0212$i$i; //@line 3906
     if (!($1013 & $1014)) {
      HEAP32[1016] = $1013 | $1014; //@line 3911
      HEAP32[$1010 >> 2] = $636; //@line 3912
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3914
      HEAP32[$636 + 12 >> 2] = $636; //@line 3916
      HEAP32[$636 + 8 >> 2] = $636; //@line 3918
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3927
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3927
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3934
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3938
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3940
      if (!$1034) {
       label = 286; //@line 3943
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3946
       $$0207$i$i = $1034; //@line 3946
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1019] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3953
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3956
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3958
       HEAP32[$636 + 12 >> 2] = $636; //@line 3960
       HEAP32[$636 + 8 >> 2] = $636; //@line 3962
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3967
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3968
      $1043 = HEAP32[1019] | 0; //@line 3969
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3975
       HEAP32[$1041 >> 2] = $636; //@line 3976
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3978
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3980
       HEAP32[$636 + 24 >> 2] = 0; //@line 3982
       break;
      } else {
       _abort(); //@line 3985
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1018] | 0; //@line 3992
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3995
   HEAP32[1018] = $1054; //@line 3996
   $1055 = HEAP32[1021] | 0; //@line 3997
   $1056 = $1055 + $$0197 | 0; //@line 3998
   HEAP32[1021] = $1056; //@line 3999
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4002
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4005
   $$0 = $1055 + 8 | 0; //@line 4007
   STACKTOP = sp; //@line 4008
   return $$0 | 0; //@line 4008
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4012
 $$0 = 0; //@line 4013
 STACKTOP = sp; //@line 4014
 return $$0 | 0; //@line 4014
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7736
 STACKTOP = STACKTOP + 560 | 0; //@line 7737
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 7737
 $6 = sp + 8 | 0; //@line 7738
 $7 = sp; //@line 7739
 $8 = sp + 524 | 0; //@line 7740
 $9 = $8; //@line 7741
 $10 = sp + 512 | 0; //@line 7742
 HEAP32[$7 >> 2] = 0; //@line 7743
 $11 = $10 + 12 | 0; //@line 7744
 ___DOUBLE_BITS_677($1) | 0; //@line 7745
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 7750
  $$0520 = 1; //@line 7750
  $$0521 = 1914; //@line 7750
 } else {
  $$0471 = $1; //@line 7761
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 7761
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1915 : 1920 : 1917; //@line 7761
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 7763
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 7772
   $31 = $$0520 + 3 | 0; //@line 7777
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 7779
   _out_670($0, $$0521, $$0520); //@line 7780
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1941 : 1945 : $27 ? 1933 : 1937, 3); //@line 7781
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 7783
   $$sink560 = $31; //@line 7784
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 7787
   $36 = $35 != 0.0; //@line 7788
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 7792
   }
   $39 = $5 | 32; //@line 7794
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 7797
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 7800
    $44 = $$0520 | 2; //@line 7801
    $46 = 12 - $3 | 0; //@line 7803
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 7808
     } else {
      $$0509585 = 8.0; //@line 7810
      $$1508586 = $46; //@line 7810
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 7812
       $$0509585 = $$0509585 * 16.0; //@line 7813
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 7828
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 7833
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 7838
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 7841
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7844
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 7847
     HEAP8[$68 >> 0] = 48; //@line 7848
     $$0511 = $68; //@line 7849
    } else {
     $$0511 = $66; //@line 7851
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 7858
    $76 = $$0511 + -2 | 0; //@line 7861
    HEAP8[$76 >> 0] = $5 + 15; //@line 7862
    $77 = ($3 | 0) < 1; //@line 7863
    $79 = ($4 & 8 | 0) == 0; //@line 7865
    $$0523 = $8; //@line 7866
    $$2473 = $$1472; //@line 7866
    while (1) {
     $80 = ~~$$2473; //@line 7868
     $86 = $$0523 + 1 | 0; //@line 7874
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1949 + $80 >> 0]; //@line 7875
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 7878
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 7887
      } else {
       HEAP8[$86 >> 0] = 46; //@line 7890
       $$1524 = $$0523 + 2 | 0; //@line 7891
      }
     } else {
      $$1524 = $86; //@line 7894
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 7898
     }
    }
    $$pre693 = $$1524; //@line 7904
    if (!$3) {
     label = 24; //@line 7906
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 7914
      $$sink = $3 + 2 | 0; //@line 7914
     } else {
      label = 24; //@line 7916
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 7920
     $$pre$phi691Z2D = $101; //@line 7921
     $$sink = $101; //@line 7921
    }
    $104 = $11 - $76 | 0; //@line 7925
    $106 = $104 + $44 + $$sink | 0; //@line 7927
    _pad_676($0, 32, $2, $106, $4); //@line 7928
    _out_670($0, $$0521$, $44); //@line 7929
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 7931
    _out_670($0, $8, $$pre$phi691Z2D); //@line 7932
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 7934
    _out_670($0, $76, $104); //@line 7935
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 7937
    $$sink560 = $106; //@line 7938
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 7942
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 7946
    HEAP32[$7 >> 2] = $113; //@line 7947
    $$3 = $35 * 268435456.0; //@line 7948
    $$pr = $113; //@line 7948
   } else {
    $$3 = $35; //@line 7951
    $$pr = HEAP32[$7 >> 2] | 0; //@line 7951
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 7955
   $$0498 = $$561; //@line 7956
   $$4 = $$3; //@line 7956
   do {
    $116 = ~~$$4 >>> 0; //@line 7958
    HEAP32[$$0498 >> 2] = $116; //@line 7959
    $$0498 = $$0498 + 4 | 0; //@line 7960
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 7963
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 7973
    $$1499662 = $$0498; //@line 7973
    $124 = $$pr; //@line 7973
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 7976
     $$0488655 = $$1499662 + -4 | 0; //@line 7977
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 7980
     } else {
      $$0488657 = $$0488655; //@line 7982
      $$0497656 = 0; //@line 7982
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 7985
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 7987
       $131 = tempRet0; //@line 7988
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7989
       HEAP32[$$0488657 >> 2] = $132; //@line 7991
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7992
       $$0488657 = $$0488657 + -4 | 0; //@line 7994
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8004
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8006
       HEAP32[$138 >> 2] = $$0497656; //@line 8007
       $$2483$ph = $138; //@line 8008
      }
     }
     $$2500 = $$1499662; //@line 8011
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8017
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8021
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8027
     HEAP32[$7 >> 2] = $144; //@line 8028
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8031
      $$1499662 = $$2500; //@line 8031
      $124 = $144; //@line 8031
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8033
      $$1499$lcssa = $$2500; //@line 8033
      $$pr566 = $144; //@line 8033
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8038
    $$1499$lcssa = $$0498; //@line 8038
    $$pr566 = $$pr; //@line 8038
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8044
    $150 = ($39 | 0) == 102; //@line 8045
    $$3484650 = $$1482$lcssa; //@line 8046
    $$3501649 = $$1499$lcssa; //@line 8046
    $152 = $$pr566; //@line 8046
    while (1) {
     $151 = 0 - $152 | 0; //@line 8048
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8050
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8054
      $161 = 1e9 >>> $154; //@line 8055
      $$0487644 = 0; //@line 8056
      $$1489643 = $$3484650; //@line 8056
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8058
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8062
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8063
       $$1489643 = $$1489643 + 4 | 0; //@line 8064
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8075
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8078
       $$4502 = $$3501649; //@line 8078
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8081
       $$$3484700 = $$$3484; //@line 8082
       $$4502 = $$3501649 + 4 | 0; //@line 8082
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8089
      $$4502 = $$3501649; //@line 8089
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8091
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8098
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8100
     HEAP32[$7 >> 2] = $152; //@line 8101
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8106
      $$3501$lcssa = $$$4502; //@line 8106
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8104
      $$3501649 = $$$4502; //@line 8104
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8111
    $$3501$lcssa = $$1499$lcssa; //@line 8111
   }
   $185 = $$561; //@line 8114
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8119
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8120
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8123
    } else {
     $$0514639 = $189; //@line 8125
     $$0530638 = 10; //@line 8125
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8127
      $193 = $$0514639 + 1 | 0; //@line 8128
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8131
       break;
      } else {
       $$0514639 = $193; //@line 8134
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8139
   }
   $198 = ($39 | 0) == 103; //@line 8144
   $199 = ($$540 | 0) != 0; //@line 8145
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8148
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8157
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8160
    $213 = ($209 | 0) % 9 | 0; //@line 8161
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8164
     $$1531632 = 10; //@line 8164
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8167
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8170
       $$1531632 = $215; //@line 8170
      } else {
       $$1531$lcssa = $215; //@line 8172
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8177
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8179
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8180
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8183
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8186
     $$4518 = $$1515; //@line 8186
     $$8 = $$3484$lcssa; //@line 8186
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8191
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8192
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8197
     if (!$$0520) {
      $$1467 = $$$564; //@line 8200
      $$1469 = $$543; //@line 8200
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8203
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8208
      $$1469 = $230 ? -$$543 : $$543; //@line 8208
     }
     $233 = $217 - $218 | 0; //@line 8210
     HEAP32[$212 >> 2] = $233; //@line 8211
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8215
      HEAP32[$212 >> 2] = $236; //@line 8216
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8219
       $$sink547625 = $212; //@line 8219
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8221
        HEAP32[$$sink547625 >> 2] = 0; //@line 8222
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8225
         HEAP32[$240 >> 2] = 0; //@line 8226
         $$6 = $240; //@line 8227
        } else {
         $$6 = $$5486626; //@line 8229
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8232
        HEAP32[$238 >> 2] = $242; //@line 8233
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8236
         $$sink547625 = $238; //@line 8236
        } else {
         $$5486$lcssa = $$6; //@line 8238
         $$sink547$lcssa = $238; //@line 8238
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8243
       $$sink547$lcssa = $212; //@line 8243
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8248
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8249
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8252
       $$4518 = $247; //@line 8252
       $$8 = $$5486$lcssa; //@line 8252
      } else {
       $$2516621 = $247; //@line 8254
       $$2532620 = 10; //@line 8254
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8256
        $251 = $$2516621 + 1 | 0; //@line 8257
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8260
         $$4518 = $251; //@line 8260
         $$8 = $$5486$lcssa; //@line 8260
         break;
        } else {
         $$2516621 = $251; //@line 8263
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8268
      $$4518 = $$1515; //@line 8268
      $$8 = $$3484$lcssa; //@line 8268
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8271
    $$5519$ph = $$4518; //@line 8274
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8274
    $$9$ph = $$8; //@line 8274
   } else {
    $$5519$ph = $$1515; //@line 8276
    $$7505$ph = $$3501$lcssa; //@line 8276
    $$9$ph = $$3484$lcssa; //@line 8276
   }
   $$7505 = $$7505$ph; //@line 8278
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8282
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8285
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8289
    } else {
     $$lcssa675 = 1; //@line 8291
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8295
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8300
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8308
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8308
     } else {
      $$0479 = $5 + -2 | 0; //@line 8312
      $$2476 = $$540$ + -1 | 0; //@line 8312
     }
     $267 = $4 & 8; //@line 8314
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8319
       if (!$270) {
        $$2529 = 9; //@line 8322
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8327
         $$3533616 = 10; //@line 8327
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8329
          $275 = $$1528617 + 1 | 0; //@line 8330
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8336
           break;
          } else {
           $$1528617 = $275; //@line 8334
          }
         }
        } else {
         $$2529 = 0; //@line 8341
        }
       }
      } else {
       $$2529 = 9; //@line 8345
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8353
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8355
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8357
       $$1480 = $$0479; //@line 8360
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8360
       $$pre$phi698Z2D = 0; //@line 8360
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8364
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8366
       $$1480 = $$0479; //@line 8369
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8369
       $$pre$phi698Z2D = 0; //@line 8369
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8373
      $$3477 = $$2476; //@line 8373
      $$pre$phi698Z2D = $267; //@line 8373
     }
    } else {
     $$1480 = $5; //@line 8377
     $$3477 = $$540; //@line 8377
     $$pre$phi698Z2D = $4 & 8; //@line 8377
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8380
   $294 = ($292 | 0) != 0 & 1; //@line 8382
   $296 = ($$1480 | 32 | 0) == 102; //@line 8384
   if ($296) {
    $$2513 = 0; //@line 8388
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8388
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8391
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8394
    $304 = $11; //@line 8395
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8400
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8402
      HEAP8[$308 >> 0] = 48; //@line 8403
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8408
      } else {
       $$1512$lcssa = $308; //@line 8410
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8415
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8422
    $318 = $$1512$lcssa + -2 | 0; //@line 8424
    HEAP8[$318 >> 0] = $$1480; //@line 8425
    $$2513 = $318; //@line 8428
    $$pn = $304 - $318 | 0; //@line 8428
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8433
   _pad_676($0, 32, $2, $323, $4); //@line 8434
   _out_670($0, $$0521, $$0520); //@line 8435
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8437
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8440
    $326 = $8 + 9 | 0; //@line 8441
    $327 = $326; //@line 8442
    $328 = $8 + 8 | 0; //@line 8443
    $$5493600 = $$0496$$9; //@line 8444
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8447
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8452
       $$1465 = $328; //@line 8453
      } else {
       $$1465 = $330; //@line 8455
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8462
       $$0464597 = $330; //@line 8463
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8465
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8468
        } else {
         $$1465 = $335; //@line 8470
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8475
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8480
     $$5493600 = $$5493600 + 4 | 0; //@line 8481
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1965, 1); //@line 8491
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8497
     $$6494592 = $$5493600; //@line 8497
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8500
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8505
       $$0463587 = $347; //@line 8506
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8508
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8511
        } else {
         $$0463$lcssa = $351; //@line 8513
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8518
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8522
      $$6494592 = $$6494592 + 4 | 0; //@line 8523
      $356 = $$4478593 + -9 | 0; //@line 8524
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8531
       break;
      } else {
       $$4478593 = $356; //@line 8529
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8536
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8539
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8542
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8545
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8546
     $365 = $363; //@line 8547
     $366 = 0 - $9 | 0; //@line 8548
     $367 = $8 + 8 | 0; //@line 8549
     $$5605 = $$3477; //@line 8550
     $$7495604 = $$9$ph; //@line 8550
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8553
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8556
       $$0 = $367; //@line 8557
      } else {
       $$0 = $369; //@line 8559
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8564
        _out_670($0, $$0, 1); //@line 8565
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 8569
         break;
        }
        _out_670($0, 1965, 1); //@line 8572
        $$2 = $375; //@line 8573
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 8577
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 8582
        $$1601 = $$0; //@line 8583
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 8585
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 8588
         } else {
          $$2 = $373; //@line 8590
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 8597
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 8600
      $381 = $$5605 - $378 | 0; //@line 8601
      $$7495604 = $$7495604 + 4 | 0; //@line 8602
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 8609
       break;
      } else {
       $$5605 = $381; //@line 8607
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 8614
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 8617
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 8621
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 8624
   $$sink560 = $323; //@line 8625
  }
 } while (0);
 STACKTOP = sp; //@line 8630
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 8630
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6308
 STACKTOP = STACKTOP + 64 | 0; //@line 6309
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6309
 $5 = sp + 16 | 0; //@line 6310
 $6 = sp; //@line 6311
 $7 = sp + 24 | 0; //@line 6312
 $8 = sp + 8 | 0; //@line 6313
 $9 = sp + 20 | 0; //@line 6314
 HEAP32[$5 >> 2] = $1; //@line 6315
 $10 = ($0 | 0) != 0; //@line 6316
 $11 = $7 + 40 | 0; //@line 6317
 $12 = $11; //@line 6318
 $13 = $7 + 39 | 0; //@line 6319
 $14 = $8 + 4 | 0; //@line 6320
 $$0243 = 0; //@line 6321
 $$0247 = 0; //@line 6321
 $$0269 = 0; //@line 6321
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6330
     $$1248 = -1; //@line 6331
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6335
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6339
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6342
  $21 = HEAP8[$20 >> 0] | 0; //@line 6343
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6346
   break;
  } else {
   $23 = $21; //@line 6349
   $25 = $20; //@line 6349
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6354
     $27 = $25; //@line 6354
     label = 9; //@line 6355
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6360
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6367
   HEAP32[$5 >> 2] = $24; //@line 6368
   $23 = HEAP8[$24 >> 0] | 0; //@line 6370
   $25 = $24; //@line 6370
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6375
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6380
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6383
     $27 = $27 + 2 | 0; //@line 6384
     HEAP32[$5 >> 2] = $27; //@line 6385
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6392
      break;
     } else {
      $$0249303 = $30; //@line 6389
      label = 9; //@line 6390
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6400
  if ($10) {
   _out_670($0, $20, $36); //@line 6402
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6406
   $$0247 = $$1248; //@line 6406
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6414
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6415
  if ($43) {
   $$0253 = -1; //@line 6417
   $$1270 = $$0269; //@line 6417
   $$sink = 1; //@line 6417
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6427
    $$1270 = 1; //@line 6427
    $$sink = 3; //@line 6427
   } else {
    $$0253 = -1; //@line 6429
    $$1270 = $$0269; //@line 6429
    $$sink = 1; //@line 6429
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6432
  HEAP32[$5 >> 2] = $51; //@line 6433
  $52 = HEAP8[$51 >> 0] | 0; //@line 6434
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6436
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6443
   $$lcssa291 = $52; //@line 6443
   $$lcssa292 = $51; //@line 6443
  } else {
   $$0262309 = 0; //@line 6445
   $60 = $52; //@line 6445
   $65 = $51; //@line 6445
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6450
    $64 = $65 + 1 | 0; //@line 6451
    HEAP32[$5 >> 2] = $64; //@line 6452
    $66 = HEAP8[$64 >> 0] | 0; //@line 6453
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6455
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6462
     $$lcssa291 = $66; //@line 6462
     $$lcssa292 = $64; //@line 6462
     break;
    } else {
     $$0262309 = $63; //@line 6465
     $60 = $66; //@line 6465
     $65 = $64; //@line 6465
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6477
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6479
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6484
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6489
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6501
     $$2271 = 1; //@line 6501
     $storemerge274 = $79 + 3 | 0; //@line 6501
    } else {
     label = 23; //@line 6503
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6507
    if ($$1270 | 0) {
     $$0 = -1; //@line 6510
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6525
     $106 = HEAP32[$105 >> 2] | 0; //@line 6526
     HEAP32[$2 >> 2] = $105 + 4; //@line 6528
     $363 = $106; //@line 6529
    } else {
     $363 = 0; //@line 6531
    }
    $$0259 = $363; //@line 6535
    $$2271 = 0; //@line 6535
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6535
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6537
   $109 = ($$0259 | 0) < 0; //@line 6538
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6543
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6543
   $$3272 = $$2271; //@line 6543
   $115 = $storemerge274; //@line 6543
  } else {
   $112 = _getint_671($5) | 0; //@line 6545
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6548
    break;
   }
   $$1260 = $112; //@line 6552
   $$1263 = $$0262$lcssa; //@line 6552
   $$3272 = $$1270; //@line 6552
   $115 = HEAP32[$5 >> 2] | 0; //@line 6552
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6563
     $156 = _getint_671($5) | 0; //@line 6564
     $$0254 = $156; //@line 6566
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 6566
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 6575
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 6580
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6585
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6592
      $144 = $125 + 4 | 0; //@line 6596
      HEAP32[$5 >> 2] = $144; //@line 6597
      $$0254 = $140; //@line 6598
      $$pre345 = $144; //@line 6598
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 6604
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6619
     $152 = HEAP32[$151 >> 2] | 0; //@line 6620
     HEAP32[$2 >> 2] = $151 + 4; //@line 6622
     $364 = $152; //@line 6623
    } else {
     $364 = 0; //@line 6625
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 6628
    HEAP32[$5 >> 2] = $154; //@line 6629
    $$0254 = $364; //@line 6630
    $$pre345 = $154; //@line 6630
   } else {
    $$0254 = -1; //@line 6632
    $$pre345 = $115; //@line 6632
   }
  } while (0);
  $$0252 = 0; //@line 6635
  $158 = $$pre345; //@line 6635
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 6642
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 6645
   HEAP32[$5 >> 2] = $158; //@line 6646
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1433 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 6651
   $168 = $167 & 255; //@line 6652
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 6656
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 6663
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 6667
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 6671
     break L1;
    } else {
     label = 50; //@line 6674
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 6679
     $176 = $3 + ($$0253 << 3) | 0; //@line 6681
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 6686
     $182 = $6; //@line 6687
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 6689
     HEAP32[$182 + 4 >> 2] = $181; //@line 6692
     label = 50; //@line 6693
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 6697
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 6700
    $187 = HEAP32[$5 >> 2] | 0; //@line 6702
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 6706
   if ($10) {
    $187 = $158; //@line 6708
   } else {
    $$0243 = 0; //@line 6710
    $$0247 = $$1248; //@line 6710
    $$0269 = $$3272; //@line 6710
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 6716
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 6722
  $196 = $$1263 & -65537; //@line 6725
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 6726
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6734
       $$0243 = 0; //@line 6735
       $$0247 = $$1248; //@line 6735
       $$0269 = $$3272; //@line 6735
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6741
       $$0243 = 0; //@line 6742
       $$0247 = $$1248; //@line 6742
       $$0269 = $$3272; //@line 6742
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 6750
       HEAP32[$208 >> 2] = $$1248; //@line 6752
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6755
       $$0243 = 0; //@line 6756
       $$0247 = $$1248; //@line 6756
       $$0269 = $$3272; //@line 6756
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 6763
       $$0243 = 0; //@line 6764
       $$0247 = $$1248; //@line 6764
       $$0269 = $$3272; //@line 6764
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 6771
       $$0243 = 0; //@line 6772
       $$0247 = $$1248; //@line 6772
       $$0269 = $$3272; //@line 6772
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6778
       $$0243 = 0; //@line 6779
       $$0247 = $$1248; //@line 6779
       $$0269 = $$3272; //@line 6779
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 6787
       HEAP32[$220 >> 2] = $$1248; //@line 6789
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6792
       $$0243 = 0; //@line 6793
       $$0247 = $$1248; //@line 6793
       $$0269 = $$3272; //@line 6793
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 6798
       $$0247 = $$1248; //@line 6798
       $$0269 = $$3272; //@line 6798
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 6808
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 6808
     $$3265 = $$1263$ | 8; //@line 6808
     label = 62; //@line 6809
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 6813
     $$1255 = $$0254; //@line 6813
     $$3265 = $$1263$; //@line 6813
     label = 62; //@line 6814
     break;
    }
   case 111:
    {
     $242 = $6; //@line 6818
     $244 = HEAP32[$242 >> 2] | 0; //@line 6820
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 6823
     $248 = _fmt_o($244, $247, $11) | 0; //@line 6824
     $252 = $12 - $248 | 0; //@line 6828
     $$0228 = $248; //@line 6833
     $$1233 = 0; //@line 6833
     $$1238 = 1897; //@line 6833
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 6833
     $$4266 = $$1263$; //@line 6833
     $281 = $244; //@line 6833
     $283 = $247; //@line 6833
     label = 68; //@line 6834
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 6838
     $258 = HEAP32[$256 >> 2] | 0; //@line 6840
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 6843
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 6846
      $264 = tempRet0; //@line 6847
      $265 = $6; //@line 6848
      HEAP32[$265 >> 2] = $263; //@line 6850
      HEAP32[$265 + 4 >> 2] = $264; //@line 6853
      $$0232 = 1; //@line 6854
      $$0237 = 1897; //@line 6854
      $275 = $263; //@line 6854
      $276 = $264; //@line 6854
      label = 67; //@line 6855
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 6867
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1897 : 1899 : 1898; //@line 6867
      $275 = $258; //@line 6867
      $276 = $261; //@line 6867
      label = 67; //@line 6868
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 6874
     $$0232 = 0; //@line 6880
     $$0237 = 1897; //@line 6880
     $275 = HEAP32[$197 >> 2] | 0; //@line 6880
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 6880
     label = 67; //@line 6881
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 6892
     $$2 = $13; //@line 6893
     $$2234 = 0; //@line 6893
     $$2239 = 1897; //@line 6893
     $$2251 = $11; //@line 6893
     $$5 = 1; //@line 6893
     $$6268 = $196; //@line 6893
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 6900
     label = 72; //@line 6901
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 6905
     $$1 = $302 | 0 ? $302 : 1907; //@line 6908
     label = 72; //@line 6909
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 6919
     HEAP32[$14 >> 2] = 0; //@line 6920
     HEAP32[$6 >> 2] = $8; //@line 6921
     $$4258354 = -1; //@line 6922
     $365 = $8; //@line 6922
     label = 76; //@line 6923
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 6927
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 6930
      $$0240$lcssa356 = 0; //@line 6931
      label = 85; //@line 6932
     } else {
      $$4258354 = $$0254; //@line 6934
      $365 = $$pre348; //@line 6934
      label = 76; //@line 6935
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 6942
     $$0247 = $$1248; //@line 6942
     $$0269 = $$3272; //@line 6942
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 6947
     $$2234 = 0; //@line 6947
     $$2239 = 1897; //@line 6947
     $$2251 = $11; //@line 6947
     $$5 = $$0254; //@line 6947
     $$6268 = $$1263$; //@line 6947
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 6953
    $227 = $6; //@line 6954
    $229 = HEAP32[$227 >> 2] | 0; //@line 6956
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 6959
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 6961
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 6967
    $$0228 = $234; //@line 6972
    $$1233 = $or$cond278 ? 0 : 2; //@line 6972
    $$1238 = $or$cond278 ? 1897 : 1897 + ($$1236 >> 4) | 0; //@line 6972
    $$2256 = $$1255; //@line 6972
    $$4266 = $$3265; //@line 6972
    $281 = $229; //@line 6972
    $283 = $232; //@line 6972
    label = 68; //@line 6973
   } else if ((label | 0) == 67) {
    label = 0; //@line 6976
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 6978
    $$1233 = $$0232; //@line 6978
    $$1238 = $$0237; //@line 6978
    $$2256 = $$0254; //@line 6978
    $$4266 = $$1263$; //@line 6978
    $281 = $275; //@line 6978
    $283 = $276; //@line 6978
    label = 68; //@line 6979
   } else if ((label | 0) == 72) {
    label = 0; //@line 6982
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 6983
    $306 = ($305 | 0) == 0; //@line 6984
    $$2 = $$1; //@line 6991
    $$2234 = 0; //@line 6991
    $$2239 = 1897; //@line 6991
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 6991
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 6991
    $$6268 = $196; //@line 6991
   } else if ((label | 0) == 76) {
    label = 0; //@line 6994
    $$0229316 = $365; //@line 6995
    $$0240315 = 0; //@line 6995
    $$1244314 = 0; //@line 6995
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 6997
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7000
      $$2245 = $$1244314; //@line 7000
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7003
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7009
      $$2245 = $320; //@line 7009
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7013
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7016
      $$0240315 = $325; //@line 7016
      $$1244314 = $320; //@line 7016
     } else {
      $$0240$lcssa = $325; //@line 7018
      $$2245 = $320; //@line 7018
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7024
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7027
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7030
     label = 85; //@line 7031
    } else {
     $$1230327 = $365; //@line 7033
     $$1241326 = 0; //@line 7033
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7035
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7038
       label = 85; //@line 7039
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7042
      $$1241326 = $331 + $$1241326 | 0; //@line 7043
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7046
       label = 85; //@line 7047
       break L97;
      }
      _out_670($0, $9, $331); //@line 7051
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7056
       label = 85; //@line 7057
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7054
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7065
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7071
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7073
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7078
   $$2 = $or$cond ? $$0228 : $11; //@line 7083
   $$2234 = $$1233; //@line 7083
   $$2239 = $$1238; //@line 7083
   $$2251 = $11; //@line 7083
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7083
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7083
  } else if ((label | 0) == 85) {
   label = 0; //@line 7086
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7088
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7091
   $$0247 = $$1248; //@line 7091
   $$0269 = $$3272; //@line 7091
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7096
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7098
  $345 = $$$5 + $$2234 | 0; //@line 7099
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7101
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7102
  _out_670($0, $$2239, $$2234); //@line 7103
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7105
  _pad_676($0, 48, $$$5, $343, 0); //@line 7106
  _out_670($0, $$2, $343); //@line 7107
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7109
  $$0243 = $$2261; //@line 7110
  $$0247 = $$1248; //@line 7110
  $$0269 = $$3272; //@line 7110
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7118
    } else {
     $$2242302 = 1; //@line 7120
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7123
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7126
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7130
      $356 = $$2242302 + 1 | 0; //@line 7131
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7134
      } else {
       $$2242$lcssa = $356; //@line 7136
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7142
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7148
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7154
       } else {
        $$0 = 1; //@line 7156
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7161
     }
    }
   } else {
    $$0 = $$1248; //@line 7165
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7169
 return $$0 | 0; //@line 7169
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 285
 STACKTOP = STACKTOP + 96 | 0; //@line 286
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 286
 $vararg_buffer23 = sp + 72 | 0; //@line 287
 $vararg_buffer20 = sp + 64 | 0; //@line 288
 $vararg_buffer18 = sp + 56 | 0; //@line 289
 $vararg_buffer15 = sp + 48 | 0; //@line 290
 $vararg_buffer12 = sp + 40 | 0; //@line 291
 $vararg_buffer9 = sp + 32 | 0; //@line 292
 $vararg_buffer6 = sp + 24 | 0; //@line 293
 $vararg_buffer3 = sp + 16 | 0; //@line 294
 $vararg_buffer1 = sp + 8 | 0; //@line 295
 $vararg_buffer = sp; //@line 296
 $4 = sp + 80 | 0; //@line 297
 $5 = HEAP32[37] | 0; //@line 298
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 302
   FUNCTION_TABLE_v[$5 & 0](); //@line 303
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 9; //@line 306
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer1; //@line 308
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer1; //@line 310
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 312
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 314
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer20; //@line 316
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer20; //@line 318
    HEAP8[$AsyncCtx + 28 >> 0] = $0; //@line 320
    HEAP32[$AsyncCtx + 32 >> 2] = $2; //@line 322
    HEAP32[$AsyncCtx + 36 >> 2] = $3; //@line 324
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 326
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer23; //@line 328
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer23; //@line 330
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer9; //@line 332
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer9; //@line 334
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer12; //@line 336
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer12; //@line 338
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer3; //@line 340
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer3; //@line 342
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer15; //@line 344
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer15; //@line 346
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer18; //@line 348
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer18; //@line 350
    HEAP32[$AsyncCtx + 92 >> 2] = $4; //@line 352
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer6; //@line 354
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer6; //@line 356
    sp = STACKTOP; //@line 357
    STACKTOP = sp; //@line 358
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 360
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 363
    break;
   }
  }
 } while (0);
 $34 = HEAP32[28] | 0; //@line 368
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 372
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[25] | 0; //@line 378
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 385
       break;
      }
     }
     $43 = HEAP32[26] | 0; //@line 389
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 393
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 398
      } else {
       label = 11; //@line 400
      }
     }
    } else {
     label = 11; //@line 404
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 408
   }
   if (!((HEAP32[35] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 420
    break;
   }
   $54 = HEAPU8[96] | 0; //@line 424
   $55 = $0 & 255; //@line 425
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 430
    $$lobit = $59 >>> 6; //@line 431
    $60 = $$lobit & 255; //@line 432
    $64 = ($54 & 32 | 0) == 0; //@line 436
    $65 = HEAP32[29] | 0; //@line 437
    $66 = HEAP32[28] | 0; //@line 438
    $67 = $0 << 24 >> 24 == 1; //@line 439
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 443
      _vsnprintf($66, $65, $2, $3) | 0; //@line 444
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 10; //@line 447
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 450
       sp = STACKTOP; //@line 451
       STACKTOP = sp; //@line 452
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 454
      $69 = HEAP32[36] | 0; //@line 455
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[35] | 0; //@line 459
       $74 = HEAP32[28] | 0; //@line 460
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 461
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 462
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 13; //@line 465
        sp = STACKTOP; //@line 466
        STACKTOP = sp; //@line 467
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 469
        break;
       }
      }
      $71 = HEAP32[28] | 0; //@line 473
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 474
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 475
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 11; //@line 478
       sp = STACKTOP; //@line 479
       STACKTOP = sp; //@line 480
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 482
      $72 = HEAP32[36] | 0; //@line 483
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 484
      FUNCTION_TABLE_vi[$72 & 127](993); //@line 485
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 12; //@line 488
       sp = STACKTOP; //@line 489
       STACKTOP = sp; //@line 490
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 492
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 499
       $$1143 = $66; //@line 499
       $$1145 = $65; //@line 499
       $$3154 = 0; //@line 499
       label = 38; //@line 500
      } else {
       if ($64) {
        $$0142 = $66; //@line 503
        $$0144 = $65; //@line 503
       } else {
        $76 = _snprintf($66, $65, 995, $vararg_buffer) | 0; //@line 505
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 507
        $78 = ($$ | 0) > 0; //@line 508
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 513
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 513
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 517
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1013; //@line 523
          label = 35; //@line 524
          break;
         }
        case 1:
         {
          $$sink = 1019; //@line 528
          label = 35; //@line 529
          break;
         }
        case 3:
         {
          $$sink = 1007; //@line 533
          label = 35; //@line 534
          break;
         }
        case 7:
         {
          $$sink = 1001; //@line 538
          label = 35; //@line 539
          break;
         }
        default:
         {
          $$0141 = 0; //@line 543
          $$1152 = 0; //@line 543
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 547
         $$0141 = $60 & 1; //@line 550
         $$1152 = _snprintf($$0142, $$0144, 1025, $vararg_buffer1) | 0; //@line 550
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 553
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 555
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 557
         $$1$off0 = $extract$t159; //@line 562
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 562
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 562
         $$3154 = $$1152; //@line 562
         label = 38; //@line 563
        } else {
         $$1$off0 = $extract$t159; //@line 565
         $$1143 = $$0142; //@line 565
         $$1145 = $$0144; //@line 565
         $$3154 = $$1152$; //@line 565
         label = 38; //@line 566
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 579
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 580
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 581
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 14; //@line 584
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 586
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 588
           HEAP8[$AsyncCtx60 + 12 >> 0] = $$1$off0 & 1; //@line 591
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer23; //@line 593
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer23; //@line 595
           HEAP32[$AsyncCtx60 + 24 >> 2] = $2; //@line 597
           HEAP32[$AsyncCtx60 + 28 >> 2] = $3; //@line 599
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer9; //@line 601
           HEAP32[$AsyncCtx60 + 36 >> 2] = $1; //@line 603
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer9; //@line 605
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer12; //@line 607
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer12; //@line 609
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer3; //@line 611
           HEAP32[$AsyncCtx60 + 56 >> 2] = $$1143; //@line 613
           HEAP32[$AsyncCtx60 + 60 >> 2] = $$1145; //@line 615
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer3; //@line 617
           HEAP32[$AsyncCtx60 + 68 >> 2] = $4; //@line 619
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer15; //@line 621
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer15; //@line 623
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer18; //@line 625
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer18; //@line 627
           HEAP32[$AsyncCtx60 + 88 >> 2] = $55; //@line 629
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer6; //@line 631
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer6; //@line 633
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 635
           sp = STACKTOP; //@line 636
           STACKTOP = sp; //@line 637
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 639
          $125 = HEAP32[33] | 0; //@line 644
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 645
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 646
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 15; //@line 649
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer20; //@line 651
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer20; //@line 653
           HEAP8[$AsyncCtx38 + 12 >> 0] = $$1$off0 & 1; //@line 656
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer23; //@line 658
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer23; //@line 660
           HEAP32[$AsyncCtx38 + 24 >> 2] = $2; //@line 662
           HEAP32[$AsyncCtx38 + 28 >> 2] = $3; //@line 664
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer9; //@line 666
           HEAP32[$AsyncCtx38 + 36 >> 2] = $1; //@line 668
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer9; //@line 670
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer12; //@line 672
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer12; //@line 674
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer3; //@line 676
           HEAP32[$AsyncCtx38 + 56 >> 2] = $$1143; //@line 678
           HEAP32[$AsyncCtx38 + 60 >> 2] = $$1145; //@line 680
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer3; //@line 682
           HEAP32[$AsyncCtx38 + 68 >> 2] = $4; //@line 684
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer15; //@line 686
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer15; //@line 688
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer18; //@line 690
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer18; //@line 692
           HEAP32[$AsyncCtx38 + 88 >> 2] = $55; //@line 694
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer6; //@line 696
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer6; //@line 698
           sp = STACKTOP; //@line 699
           STACKTOP = sp; //@line 700
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 702
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 703
           $151 = _snprintf($$1143, $$1145, 1025, $vararg_buffer3) | 0; //@line 704
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 706
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 711
            $$3147 = $$1145 - $$10 | 0; //@line 711
            label = 44; //@line 712
            break;
           } else {
            $$3147168 = $$1145; //@line 715
            $$3169 = $$1143; //@line 715
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 720
          $$3147 = $$1145; //@line 720
          label = 44; //@line 721
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 727
          $$3169 = $$3; //@line 727
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 732
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 738
          $$5156 = _snprintf($$3169, $$3147168, 1028, $vararg_buffer6) | 0; //@line 740
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 744
          $$5156 = _snprintf($$3169, $$3147168, 1043, $vararg_buffer9) | 0; //@line 746
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 750
          $$5156 = _snprintf($$3169, $$3147168, 1058, $vararg_buffer12) | 0; //@line 752
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 756
          $$5156 = _snprintf($$3169, $$3147168, 1073, $vararg_buffer15) | 0; //@line 758
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1088, $vararg_buffer18) | 0; //@line 763
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 767
        $168 = $$3169 + $$5156$ | 0; //@line 769
        $169 = $$3147168 - $$5156$ | 0; //@line 770
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 774
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 775
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 16; //@line 778
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 780
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 782
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 785
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 787
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 789
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 791
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 793
          sp = STACKTOP; //@line 794
          STACKTOP = sp; //@line 795
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 797
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 799
         $181 = $168 + $$13 | 0; //@line 801
         $182 = $169 - $$13 | 0; //@line 802
         if (($$13 | 0) > 0) {
          $184 = HEAP32[34] | 0; //@line 805
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 810
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 811
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 17; //@line 814
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 816
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 818
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 820
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 822
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 825
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 827
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 829
             sp = STACKTOP; //@line 830
             STACKTOP = sp; //@line 831
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 833
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 834
             $194 = _snprintf($181, $182, 1025, $vararg_buffer20) | 0; //@line 835
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 837
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 842
              $$6150 = $182 - $$18 | 0; //@line 842
              $$9 = $$18; //@line 842
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 849
            $$6150 = $182; //@line 849
            $$9 = $$13; //@line 849
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1103, $vararg_buffer23) | 0; //@line 858
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[35] | 0; //@line 864
      $202 = HEAP32[28] | 0; //@line 865
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 866
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 867
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 18; //@line 870
       sp = STACKTOP; //@line 871
       STACKTOP = sp; //@line 872
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 874
       break;
      }
     }
    } while (0);
    HEAP32[32] = HEAP32[30]; //@line 880
   }
  }
 } while (0);
 $204 = HEAP32[38] | 0; //@line 884
 if (!$204) {
  STACKTOP = sp; //@line 887
  return;
 }
 $206 = HEAP32[39] | 0; //@line 889
 HEAP32[39] = 0; //@line 890
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 891
 FUNCTION_TABLE_v[$204 & 0](); //@line 892
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 19; //@line 895
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 897
  sp = STACKTOP; //@line 898
  STACKTOP = sp; //@line 899
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 901
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 904
 } else {
  STACKTOP = sp; //@line 906
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 909
  $$pre = HEAP32[38] | 0; //@line 910
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 911
  FUNCTION_TABLE_v[$$pre & 0](); //@line 912
  if (___async) {
   label = 70; //@line 915
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 918
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 921
  } else {
   label = 72; //@line 923
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 20; //@line 928
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 930
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 932
  sp = STACKTOP; //@line 933
  STACKTOP = sp; //@line 934
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 937
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10855
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10857
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10861
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10865
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10867
 $14 = HEAP8[$0 + 28 >> 0] | 0; //@line 10869
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10871
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10873
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10875
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10877
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10879
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10881
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10883
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 10885
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 10887
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 10889
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 10891
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 10893
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 10895
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 10897
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 10899
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 10901
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 10903
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 10905
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 10908
 $53 = HEAP32[28] | 0; //@line 10909
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 10913
   do {
    if ($14 << 24 >> 24 > -1 & ($20 | 0) != 0) {
     $57 = HEAP32[25] | 0; //@line 10919
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $20) | 0) {
       $$0$i = 1; //@line 10926
       break;
      }
     }
     $62 = HEAP32[26] | 0; //@line 10930
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 10934
     } else {
      if (!(_strstr($62, $20) | 0)) {
       $$0$i = 1; //@line 10939
      } else {
       label = 9; //@line 10941
      }
     }
    } else {
     label = 9; //@line 10945
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 10949
   }
   if (!((HEAP32[35] | 0) != 0 & ((($20 | 0) == 0 | (($16 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 10961
    break;
   }
   $73 = HEAPU8[96] | 0; //@line 10965
   $74 = $14 & 255; //@line 10966
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 10971
    $$lobit = $78 >>> 6; //@line 10972
    $79 = $$lobit & 255; //@line 10973
    $83 = ($73 & 32 | 0) == 0; //@line 10977
    $84 = HEAP32[29] | 0; //@line 10978
    $85 = HEAP32[28] | 0; //@line 10979
    $86 = $14 << 24 >> 24 == 1; //@line 10980
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 10983
     _vsnprintf($85, $84, $16, $18) | 0; //@line 10984
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 10987
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 10988
      $$expand_i1_val = $86 & 1; //@line 10989
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 10990
      sp = STACKTOP; //@line 10991
      return;
     }
     ___async_unwind = 0; //@line 10994
     HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 10995
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 10996
     $$expand_i1_val = $86 & 1; //@line 10997
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 10998
     sp = STACKTOP; //@line 10999
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 11005
     $$1143 = $85; //@line 11005
     $$1145 = $84; //@line 11005
     $$3154 = 0; //@line 11005
     label = 28; //@line 11006
    } else {
     if ($83) {
      $$0142 = $85; //@line 11009
      $$0144 = $84; //@line 11009
     } else {
      $89 = _snprintf($85, $84, 995, $6) | 0; //@line 11011
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 11013
      $91 = ($$ | 0) > 0; //@line 11014
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 11019
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 11019
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 11023
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1013; //@line 11029
        label = 25; //@line 11030
        break;
       }
      case 1:
       {
        $$sink = 1019; //@line 11034
        label = 25; //@line 11035
        break;
       }
      case 3:
       {
        $$sink = 1007; //@line 11039
        label = 25; //@line 11040
        break;
       }
      case 7:
       {
        $$sink = 1001; //@line 11044
        label = 25; //@line 11045
        break;
       }
      default:
       {
        $$0141 = 0; //@line 11049
        $$1152 = 0; //@line 11049
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$2 >> 2] = $$sink; //@line 11053
       $$0141 = $79 & 1; //@line 11056
       $$1152 = _snprintf($$0142, $$0144, 1025, $2) | 0; //@line 11056
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 11059
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 11061
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 11063
       $$1$off0 = $extract$t159; //@line 11068
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 11068
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 11068
       $$3154 = $$1152; //@line 11068
       label = 28; //@line 11069
      } else {
       $$1$off0 = $extract$t159; //@line 11071
       $$1143 = $$0142; //@line 11071
       $$1145 = $$0144; //@line 11071
       $$3154 = $$1152$; //@line 11071
       label = 28; //@line 11072
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
      HEAP32[$46 >> 2] = HEAP32[$18 >> 2]; //@line 11083
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 11084
      $108 = _vsnprintf(0, 0, $16, $46) | 0; //@line 11085
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 11088
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 11089
       HEAP32[$109 >> 2] = $10; //@line 11090
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 11091
       HEAP32[$110 >> 2] = $12; //@line 11092
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 11093
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 11094
       HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 11095
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 11096
       HEAP32[$112 >> 2] = $22; //@line 11097
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 11098
       HEAP32[$113 >> 2] = $24; //@line 11099
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 11100
       HEAP32[$114 >> 2] = $16; //@line 11101
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 11102
       HEAP32[$115 >> 2] = $18; //@line 11103
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 11104
       HEAP32[$116 >> 2] = $26; //@line 11105
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 11106
       HEAP32[$117 >> 2] = $20; //@line 11107
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 11108
       HEAP32[$118 >> 2] = $28; //@line 11109
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 11110
       HEAP32[$119 >> 2] = $30; //@line 11111
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 11112
       HEAP32[$120 >> 2] = $32; //@line 11113
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 11114
       HEAP32[$121 >> 2] = $34; //@line 11115
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 11116
       HEAP32[$122 >> 2] = $$1143; //@line 11117
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 11118
       HEAP32[$123 >> 2] = $$1145; //@line 11119
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 11120
       HEAP32[$124 >> 2] = $36; //@line 11121
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 11122
       HEAP32[$125 >> 2] = $46; //@line 11123
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 11124
       HEAP32[$126 >> 2] = $38; //@line 11125
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 11126
       HEAP32[$127 >> 2] = $40; //@line 11127
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 11128
       HEAP32[$128 >> 2] = $42; //@line 11129
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 11130
       HEAP32[$129 >> 2] = $44; //@line 11131
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 11132
       HEAP32[$130 >> 2] = $74; //@line 11133
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 11134
       HEAP32[$131 >> 2] = $48; //@line 11135
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 11136
       HEAP32[$132 >> 2] = $50; //@line 11137
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 11138
       HEAP32[$133 >> 2] = $$3154; //@line 11139
       sp = STACKTOP; //@line 11140
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 11144
      ___async_unwind = 0; //@line 11145
      HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 11146
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 11147
      HEAP32[$109 >> 2] = $10; //@line 11148
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 11149
      HEAP32[$110 >> 2] = $12; //@line 11150
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 11151
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 11152
      HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 11153
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 11154
      HEAP32[$112 >> 2] = $22; //@line 11155
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 11156
      HEAP32[$113 >> 2] = $24; //@line 11157
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 11158
      HEAP32[$114 >> 2] = $16; //@line 11159
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 11160
      HEAP32[$115 >> 2] = $18; //@line 11161
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 11162
      HEAP32[$116 >> 2] = $26; //@line 11163
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 11164
      HEAP32[$117 >> 2] = $20; //@line 11165
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 11166
      HEAP32[$118 >> 2] = $28; //@line 11167
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 11168
      HEAP32[$119 >> 2] = $30; //@line 11169
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 11170
      HEAP32[$120 >> 2] = $32; //@line 11171
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 11172
      HEAP32[$121 >> 2] = $34; //@line 11173
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 11174
      HEAP32[$122 >> 2] = $$1143; //@line 11175
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 11176
      HEAP32[$123 >> 2] = $$1145; //@line 11177
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 11178
      HEAP32[$124 >> 2] = $36; //@line 11179
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 11180
      HEAP32[$125 >> 2] = $46; //@line 11181
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 11182
      HEAP32[$126 >> 2] = $38; //@line 11183
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 11184
      HEAP32[$127 >> 2] = $40; //@line 11185
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 11186
      HEAP32[$128 >> 2] = $42; //@line 11187
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 11188
      HEAP32[$129 >> 2] = $44; //@line 11189
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 11190
      HEAP32[$130 >> 2] = $74; //@line 11191
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 11192
      HEAP32[$131 >> 2] = $48; //@line 11193
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 11194
      HEAP32[$132 >> 2] = $50; //@line 11195
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 11196
      HEAP32[$133 >> 2] = $$3154; //@line 11197
      sp = STACKTOP; //@line 11198
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 11203
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$48 >> 2] = $20; //@line 11209
        $$5156 = _snprintf($$1143, $$1145, 1028, $48) | 0; //@line 11211
        break;
       }
      case 1:
       {
        HEAP32[$26 >> 2] = $20; //@line 11215
        $$5156 = _snprintf($$1143, $$1145, 1043, $26) | 0; //@line 11217
        break;
       }
      case 3:
       {
        HEAP32[$30 >> 2] = $20; //@line 11221
        $$5156 = _snprintf($$1143, $$1145, 1058, $30) | 0; //@line 11223
        break;
       }
      case 7:
       {
        HEAP32[$38 >> 2] = $20; //@line 11227
        $$5156 = _snprintf($$1143, $$1145, 1073, $38) | 0; //@line 11229
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1088, $42) | 0; //@line 11234
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 11238
      $147 = $$1143 + $$5156$ | 0; //@line 11240
      $148 = $$1145 - $$5156$ | 0; //@line 11241
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 11245
       $150 = _vsnprintf($147, $148, $16, $18) | 0; //@line 11246
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11249
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 11250
        HEAP32[$151 >> 2] = $10; //@line 11251
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 11252
        HEAP32[$152 >> 2] = $12; //@line 11253
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 11254
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 11255
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 11256
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 11257
        HEAP32[$154 >> 2] = $22; //@line 11258
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 11259
        HEAP32[$155 >> 2] = $24; //@line 11260
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 11261
        HEAP32[$156 >> 2] = $148; //@line 11262
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 11263
        HEAP32[$157 >> 2] = $147; //@line 11264
        sp = STACKTOP; //@line 11265
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 11269
       ___async_unwind = 0; //@line 11270
       HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11271
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 11272
       HEAP32[$151 >> 2] = $10; //@line 11273
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 11274
       HEAP32[$152 >> 2] = $12; //@line 11275
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 11276
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 11277
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 11278
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 11279
       HEAP32[$154 >> 2] = $22; //@line 11280
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 11281
       HEAP32[$155 >> 2] = $24; //@line 11282
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 11283
       HEAP32[$156 >> 2] = $148; //@line 11284
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 11285
       HEAP32[$157 >> 2] = $147; //@line 11286
       sp = STACKTOP; //@line 11287
       return;
      }
     }
    }
    $159 = HEAP32[35] | 0; //@line 11292
    $160 = HEAP32[28] | 0; //@line 11293
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11294
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 11295
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11298
     sp = STACKTOP; //@line 11299
     return;
    }
    ___async_unwind = 0; //@line 11302
    HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11303
    sp = STACKTOP; //@line 11304
    return;
   }
  }
 } while (0);
 $161 = HEAP32[38] | 0; //@line 11309
 if (!$161) {
  return;
 }
 $163 = HEAP32[39] | 0; //@line 11314
 HEAP32[39] = 0; //@line 11315
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11316
 FUNCTION_TABLE_v[$161 & 0](); //@line 11317
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11320
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 11321
  HEAP32[$164 >> 2] = $163; //@line 11322
  sp = STACKTOP; //@line 11323
  return;
 }
 ___async_unwind = 0; //@line 11326
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11327
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 11328
 HEAP32[$164 >> 2] = $163; //@line 11329
 sp = STACKTOP; //@line 11330
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4041
 $3 = HEAP32[1019] | 0; //@line 4042
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4045
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4049
 $7 = $6 & 3; //@line 4050
 if (($7 | 0) == 1) {
  _abort(); //@line 4053
 }
 $9 = $6 & -8; //@line 4056
 $10 = $2 + $9 | 0; //@line 4057
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4062
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4068
   $17 = $13 + $9 | 0; //@line 4069
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4072
   }
   if ((HEAP32[1020] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4078
    $106 = HEAP32[$105 >> 2] | 0; //@line 4079
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4083
     $$1382 = $17; //@line 4083
     $114 = $16; //@line 4083
     break;
    }
    HEAP32[1017] = $17; //@line 4086
    HEAP32[$105 >> 2] = $106 & -2; //@line 4088
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4091
    HEAP32[$16 + $17 >> 2] = $17; //@line 4093
    return;
   }
   $21 = $13 >>> 3; //@line 4096
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4100
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4102
    $28 = 4100 + ($21 << 1 << 2) | 0; //@line 4104
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4109
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4116
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1015] = HEAP32[1015] & ~(1 << $21); //@line 4126
     $$1 = $16; //@line 4127
     $$1382 = $17; //@line 4127
     $114 = $16; //@line 4127
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4133
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4137
     }
     $41 = $26 + 8 | 0; //@line 4140
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4144
     } else {
      _abort(); //@line 4146
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4151
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4152
    $$1 = $16; //@line 4153
    $$1382 = $17; //@line 4153
    $114 = $16; //@line 4153
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4157
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4159
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4163
     $60 = $59 + 4 | 0; //@line 4164
     $61 = HEAP32[$60 >> 2] | 0; //@line 4165
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4168
      if (!$63) {
       $$3 = 0; //@line 4171
       break;
      } else {
       $$1387 = $63; //@line 4174
       $$1390 = $59; //@line 4174
      }
     } else {
      $$1387 = $61; //@line 4177
      $$1390 = $60; //@line 4177
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4180
      $66 = HEAP32[$65 >> 2] | 0; //@line 4181
      if ($66 | 0) {
       $$1387 = $66; //@line 4184
       $$1390 = $65; //@line 4184
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4187
      $69 = HEAP32[$68 >> 2] | 0; //@line 4188
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4193
       $$1390 = $68; //@line 4193
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4198
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4201
      $$3 = $$1387; //@line 4202
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4207
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4210
     }
     $53 = $51 + 12 | 0; //@line 4213
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4217
     }
     $56 = $48 + 8 | 0; //@line 4220
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4224
      HEAP32[$56 >> 2] = $51; //@line 4225
      $$3 = $48; //@line 4226
      break;
     } else {
      _abort(); //@line 4229
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4236
    $$1382 = $17; //@line 4236
    $114 = $16; //@line 4236
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4239
    $75 = 4364 + ($74 << 2) | 0; //@line 4240
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4245
      if (!$$3) {
       HEAP32[1016] = HEAP32[1016] & ~(1 << $74); //@line 4252
       $$1 = $16; //@line 4253
       $$1382 = $17; //@line 4253
       $114 = $16; //@line 4253
       break L10;
      }
     } else {
      if ((HEAP32[1019] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4260
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4268
       if (!$$3) {
        $$1 = $16; //@line 4271
        $$1382 = $17; //@line 4271
        $114 = $16; //@line 4271
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1019] | 0; //@line 4279
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4282
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4286
    $92 = $16 + 16 | 0; //@line 4287
    $93 = HEAP32[$92 >> 2] | 0; //@line 4288
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4294
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4298
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4300
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4306
    if (!$99) {
     $$1 = $16; //@line 4309
     $$1382 = $17; //@line 4309
     $114 = $16; //@line 4309
    } else {
     if ((HEAP32[1019] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4314
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4318
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4320
      $$1 = $16; //@line 4321
      $$1382 = $17; //@line 4321
      $114 = $16; //@line 4321
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4327
   $$1382 = $9; //@line 4327
   $114 = $2; //@line 4327
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4332
 }
 $115 = $10 + 4 | 0; //@line 4335
 $116 = HEAP32[$115 >> 2] | 0; //@line 4336
 if (!($116 & 1)) {
  _abort(); //@line 4340
 }
 if (!($116 & 2)) {
  if ((HEAP32[1021] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1018] | 0) + $$1382 | 0; //@line 4350
   HEAP32[1018] = $124; //@line 4351
   HEAP32[1021] = $$1; //@line 4352
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4355
   if (($$1 | 0) != (HEAP32[1020] | 0)) {
    return;
   }
   HEAP32[1020] = 0; //@line 4361
   HEAP32[1017] = 0; //@line 4362
   return;
  }
  if ((HEAP32[1020] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1017] | 0) + $$1382 | 0; //@line 4369
   HEAP32[1017] = $132; //@line 4370
   HEAP32[1020] = $114; //@line 4371
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4374
   HEAP32[$114 + $132 >> 2] = $132; //@line 4376
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4380
  $138 = $116 >>> 3; //@line 4381
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4386
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4388
    $145 = 4100 + ($138 << 1 << 2) | 0; //@line 4390
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1019] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4396
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4403
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1015] = HEAP32[1015] & ~(1 << $138); //@line 4413
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4419
    } else {
     if ((HEAP32[1019] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4424
     }
     $160 = $143 + 8 | 0; //@line 4427
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4431
     } else {
      _abort(); //@line 4433
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4438
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4439
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4442
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4444
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4448
      $180 = $179 + 4 | 0; //@line 4449
      $181 = HEAP32[$180 >> 2] | 0; //@line 4450
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4453
       if (!$183) {
        $$3400 = 0; //@line 4456
        break;
       } else {
        $$1398 = $183; //@line 4459
        $$1402 = $179; //@line 4459
       }
      } else {
       $$1398 = $181; //@line 4462
       $$1402 = $180; //@line 4462
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4465
       $186 = HEAP32[$185 >> 2] | 0; //@line 4466
       if ($186 | 0) {
        $$1398 = $186; //@line 4469
        $$1402 = $185; //@line 4469
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4472
       $189 = HEAP32[$188 >> 2] | 0; //@line 4473
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4478
        $$1402 = $188; //@line 4478
       }
      }
      if ((HEAP32[1019] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4484
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4487
       $$3400 = $$1398; //@line 4488
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4493
      if ((HEAP32[1019] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4497
      }
      $173 = $170 + 12 | 0; //@line 4500
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4504
      }
      $176 = $167 + 8 | 0; //@line 4507
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4511
       HEAP32[$176 >> 2] = $170; //@line 4512
       $$3400 = $167; //@line 4513
       break;
      } else {
       _abort(); //@line 4516
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4524
     $196 = 4364 + ($195 << 2) | 0; //@line 4525
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4530
       if (!$$3400) {
        HEAP32[1016] = HEAP32[1016] & ~(1 << $195); //@line 4537
        break L108;
       }
      } else {
       if ((HEAP32[1019] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4544
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4552
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1019] | 0; //@line 4562
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4565
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4569
     $213 = $10 + 16 | 0; //@line 4570
     $214 = HEAP32[$213 >> 2] | 0; //@line 4571
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4577
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4581
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4583
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4589
     if ($220 | 0) {
      if ((HEAP32[1019] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4595
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4599
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4601
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4610
  HEAP32[$114 + $137 >> 2] = $137; //@line 4612
  if (($$1 | 0) == (HEAP32[1020] | 0)) {
   HEAP32[1017] = $137; //@line 4616
   return;
  } else {
   $$2 = $137; //@line 4619
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4623
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4626
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4628
  $$2 = $$1382; //@line 4629
 }
 $235 = $$2 >>> 3; //@line 4631
 if ($$2 >>> 0 < 256) {
  $238 = 4100 + ($235 << 1 << 2) | 0; //@line 4635
  $239 = HEAP32[1015] | 0; //@line 4636
  $240 = 1 << $235; //@line 4637
  if (!($239 & $240)) {
   HEAP32[1015] = $239 | $240; //@line 4642
   $$0403 = $238; //@line 4644
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4644
  } else {
   $244 = $238 + 8 | 0; //@line 4646
   $245 = HEAP32[$244 >> 2] | 0; //@line 4647
   if ((HEAP32[1019] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4651
   } else {
    $$0403 = $245; //@line 4654
    $$pre$phiZ2D = $244; //@line 4654
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4657
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4659
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4661
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4663
  return;
 }
 $251 = $$2 >>> 8; //@line 4666
 if (!$251) {
  $$0396 = 0; //@line 4669
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4673
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4677
   $257 = $251 << $256; //@line 4678
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4681
   $262 = $257 << $260; //@line 4683
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4686
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4691
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4697
  }
 }
 $276 = 4364 + ($$0396 << 2) | 0; //@line 4700
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4702
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4705
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4706
 $280 = HEAP32[1016] | 0; //@line 4707
 $281 = 1 << $$0396; //@line 4708
 do {
  if (!($280 & $281)) {
   HEAP32[1016] = $280 | $281; //@line 4714
   HEAP32[$276 >> 2] = $$1; //@line 4715
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4717
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4719
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4721
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4729
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4729
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4736
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4740
    $301 = HEAP32[$299 >> 2] | 0; //@line 4742
    if (!$301) {
     label = 121; //@line 4745
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4748
     $$0384 = $301; //@line 4748
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1019] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4755
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4758
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4760
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4762
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4764
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4769
    $309 = HEAP32[$308 >> 2] | 0; //@line 4770
    $310 = HEAP32[1019] | 0; //@line 4771
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4777
     HEAP32[$308 >> 2] = $$1; //@line 4778
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4780
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4782
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4784
     break;
    } else {
     _abort(); //@line 4787
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1023] | 0) + -1 | 0; //@line 4794
 HEAP32[1023] = $319; //@line 4795
 if (!$319) {
  $$0212$in$i = 4516; //@line 4798
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4803
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4809
  }
 }
 HEAP32[1023] = -1; //@line 4812
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9152
 STACKTOP = STACKTOP + 1056 | 0; //@line 9153
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 9153
 $2 = sp + 1024 | 0; //@line 9154
 $3 = sp; //@line 9155
 HEAP32[$2 >> 2] = 0; //@line 9156
 HEAP32[$2 + 4 >> 2] = 0; //@line 9156
 HEAP32[$2 + 8 >> 2] = 0; //@line 9156
 HEAP32[$2 + 12 >> 2] = 0; //@line 9156
 HEAP32[$2 + 16 >> 2] = 0; //@line 9156
 HEAP32[$2 + 20 >> 2] = 0; //@line 9156
 HEAP32[$2 + 24 >> 2] = 0; //@line 9156
 HEAP32[$2 + 28 >> 2] = 0; //@line 9156
 $4 = HEAP8[$1 >> 0] | 0; //@line 9157
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 9161
   $$0185$ph$lcssa327 = -1; //@line 9161
   $$0187219$ph325326 = 0; //@line 9161
   $$1176$ph$ph$lcssa208 = 1; //@line 9161
   $$1186$ph$lcssa = -1; //@line 9161
   label = 26; //@line 9162
  } else {
   $$0187263 = 0; //@line 9164
   $10 = $4; //@line 9164
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 9170
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 9178
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 9181
    $$0187263 = $$0187263 + 1 | 0; //@line 9182
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9185
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9187
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9195
   if ($23) {
    $$0183$ph260 = 0; //@line 9197
    $$0185$ph259 = -1; //@line 9197
    $130 = 1; //@line 9197
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9199
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9199
     $131 = $130; //@line 9199
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9201
      $132 = $131; //@line 9201
      L10 : while (1) {
       $$0179242 = 1; //@line 9203
       $25 = $132; //@line 9203
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9207
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9209
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9215
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9219
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9224
         $$0185$ph$lcssa = $$0185$ph259; //@line 9224
         break L6;
        } else {
         $25 = $27; //@line 9222
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9228
       $132 = $37 + 1 | 0; //@line 9229
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9234
        $$0185$ph$lcssa = $$0185$ph259; //@line 9234
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9232
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9239
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9243
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9248
       $$0185$ph$lcssa = $$0185$ph259; //@line 9248
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9246
       $$0183$ph197$ph253 = $25; //@line 9246
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9253
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9258
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9258
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9256
      $$0185$ph259 = $$0183$ph197248; //@line 9256
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9263
     $$1186$ph238 = -1; //@line 9263
     $133 = 1; //@line 9263
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9265
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9265
      $135 = $133; //@line 9265
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9267
       $134 = $135; //@line 9267
       L25 : while (1) {
        $$1180222 = 1; //@line 9269
        $52 = $134; //@line 9269
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9273
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9275
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9281
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 9285
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9290
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9290
          $$0187219$ph325326 = $$0187263; //@line 9290
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9290
          $$1186$ph$lcssa = $$1186$ph238; //@line 9290
          label = 26; //@line 9291
          break L1;
         } else {
          $52 = $45; //@line 9288
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 9295
        $134 = $56 + 1 | 0; //@line 9296
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9301
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9301
         $$0187219$ph325326 = $$0187263; //@line 9301
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9301
         $$1186$ph$lcssa = $$1186$ph238; //@line 9301
         label = 26; //@line 9302
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 9299
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 9307
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 9311
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9316
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9316
        $$0187219$ph325326 = $$0187263; //@line 9316
        $$1176$ph$ph$lcssa208 = $60; //@line 9316
        $$1186$ph$lcssa = $$1186$ph238; //@line 9316
        label = 26; //@line 9317
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 9314
        $$1184$ph193$ph232 = $52; //@line 9314
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 9322
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9327
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9327
       $$0187219$ph325326 = $$0187263; //@line 9327
       $$1176$ph$ph$lcssa208 = 1; //@line 9327
       $$1186$ph$lcssa = $$1184$ph193227; //@line 9327
       label = 26; //@line 9328
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 9325
       $$1186$ph238 = $$1184$ph193227; //@line 9325
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9333
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9333
     $$0187219$ph325326 = $$0187263; //@line 9333
     $$1176$ph$ph$lcssa208 = 1; //@line 9333
     $$1186$ph$lcssa = -1; //@line 9333
     label = 26; //@line 9334
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 9337
    $$0185$ph$lcssa327 = -1; //@line 9337
    $$0187219$ph325326 = $$0187263; //@line 9337
    $$1176$ph$ph$lcssa208 = 1; //@line 9337
    $$1186$ph$lcssa = -1; //@line 9337
    label = 26; //@line 9338
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 9346
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 9347
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 9348
   $70 = $$1186$$0185 + 1 | 0; //@line 9350
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 9355
    $$3178 = $$1176$$0175; //@line 9355
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 9358
    $$0168 = 0; //@line 9362
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 9362
   }
   $78 = $$0187219$ph325326 | 63; //@line 9364
   $79 = $$0187219$ph325326 + -1 | 0; //@line 9365
   $80 = ($$0168 | 0) != 0; //@line 9366
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 9367
   $$0166 = $0; //@line 9368
   $$0169 = 0; //@line 9368
   $$0170 = $0; //@line 9368
   while (1) {
    $83 = $$0166; //@line 9371
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 9376
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 9380
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 9387
        break L35;
       } else {
        $$3173 = $86; //@line 9390
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 9395
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 9399
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 9411
      $$2181$sink = $$0187219$ph325326; //@line 9411
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 9416
      if ($105 | 0) {
       $$0169$be = 0; //@line 9424
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 9424
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 9428
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 9430
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 9434
       } else {
        $$3182221 = $111; //@line 9436
        $$pr = $113; //@line 9436
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 9444
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 9446
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 9449
          break L54;
         } else {
          $$3182221 = $118; //@line 9452
         }
        }
        $$0169$be = 0; //@line 9456
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 9456
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 9463
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 9466
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 9475
        $$2181$sink = $$3178; //@line 9475
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 9482
    $$0169 = $$0169$be; //@line 9482
    $$0170 = $$3173; //@line 9482
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9486
 return $$3 | 0; //@line 9486
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 13195
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 13196
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 13197
 $d_sroa_0_0_extract_trunc = $b$0; //@line 13198
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 13199
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 13200
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 13202
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13205
    HEAP32[$rem + 4 >> 2] = 0; //@line 13206
   }
   $_0$1 = 0; //@line 13208
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13209
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13210
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 13213
    $_0$0 = 0; //@line 13214
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13215
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13217
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 13218
   $_0$1 = 0; //@line 13219
   $_0$0 = 0; //@line 13220
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13221
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 13224
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13229
     HEAP32[$rem + 4 >> 2] = 0; //@line 13230
    }
    $_0$1 = 0; //@line 13232
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13233
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13234
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 13238
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 13239
    }
    $_0$1 = 0; //@line 13241
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 13242
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13243
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 13245
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 13248
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 13249
    }
    $_0$1 = 0; //@line 13251
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 13252
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13253
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13256
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 13258
    $58 = 31 - $51 | 0; //@line 13259
    $sr_1_ph = $57; //@line 13260
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 13261
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 13262
    $q_sroa_0_1_ph = 0; //@line 13263
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 13264
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 13268
    $_0$0 = 0; //@line 13269
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13270
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13272
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13273
   $_0$1 = 0; //@line 13274
   $_0$0 = 0; //@line 13275
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13276
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13280
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 13282
     $126 = 31 - $119 | 0; //@line 13283
     $130 = $119 - 31 >> 31; //@line 13284
     $sr_1_ph = $125; //@line 13285
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 13286
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 13287
     $q_sroa_0_1_ph = 0; //@line 13288
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 13289
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 13293
     $_0$0 = 0; //@line 13294
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13295
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 13297
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13298
    $_0$1 = 0; //@line 13299
    $_0$0 = 0; //@line 13300
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13301
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 13303
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13306
    $89 = 64 - $88 | 0; //@line 13307
    $91 = 32 - $88 | 0; //@line 13308
    $92 = $91 >> 31; //@line 13309
    $95 = $88 - 32 | 0; //@line 13310
    $105 = $95 >> 31; //@line 13311
    $sr_1_ph = $88; //@line 13312
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 13313
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 13314
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 13315
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 13316
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 13320
    HEAP32[$rem + 4 >> 2] = 0; //@line 13321
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13324
    $_0$0 = $a$0 | 0 | 0; //@line 13325
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13326
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 13328
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 13329
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 13330
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13331
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 13336
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 13337
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 13338
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 13339
  $carry_0_lcssa$1 = 0; //@line 13340
  $carry_0_lcssa$0 = 0; //@line 13341
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 13343
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 13344
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 13345
  $137$1 = tempRet0; //@line 13346
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 13347
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 13348
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 13349
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 13350
  $sr_1202 = $sr_1_ph; //@line 13351
  $carry_0203 = 0; //@line 13352
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 13354
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 13355
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 13356
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 13357
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 13358
   $150$1 = tempRet0; //@line 13359
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 13360
   $carry_0203 = $151$0 & 1; //@line 13361
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 13363
   $r_sroa_1_1200 = tempRet0; //@line 13364
   $sr_1202 = $sr_1202 - 1 | 0; //@line 13365
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 13377
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 13378
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 13379
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 13380
  $carry_0_lcssa$1 = 0; //@line 13381
  $carry_0_lcssa$0 = $carry_0203; //@line 13382
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 13384
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 13385
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 13388
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 13389
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 13391
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 13392
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13393
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1070
 STACKTOP = STACKTOP + 32 | 0; //@line 1071
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1071
 $0 = sp; //@line 1072
 _gpio_init_out($0, 50); //@line 1073
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1076
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1077
  _wait_ms(150); //@line 1078
  if (___async) {
   label = 3; //@line 1081
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1084
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1086
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1087
  _wait_ms(150); //@line 1088
  if (___async) {
   label = 5; //@line 1091
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1094
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1096
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1097
  _wait_ms(150); //@line 1098
  if (___async) {
   label = 7; //@line 1101
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1104
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1106
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1107
  _wait_ms(150); //@line 1108
  if (___async) {
   label = 9; //@line 1111
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1114
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1116
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1117
  _wait_ms(150); //@line 1118
  if (___async) {
   label = 11; //@line 1121
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1124
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1126
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1127
  _wait_ms(150); //@line 1128
  if (___async) {
   label = 13; //@line 1131
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1134
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1136
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1137
  _wait_ms(150); //@line 1138
  if (___async) {
   label = 15; //@line 1141
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1144
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1146
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1147
  _wait_ms(150); //@line 1148
  if (___async) {
   label = 17; //@line 1151
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1154
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1156
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1157
  _wait_ms(400); //@line 1158
  if (___async) {
   label = 19; //@line 1161
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1164
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1166
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1167
  _wait_ms(400); //@line 1168
  if (___async) {
   label = 21; //@line 1171
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1174
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1176
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1177
  _wait_ms(400); //@line 1178
  if (___async) {
   label = 23; //@line 1181
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1184
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1186
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1187
  _wait_ms(400); //@line 1188
  if (___async) {
   label = 25; //@line 1191
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1194
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1196
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1197
  _wait_ms(400); //@line 1198
  if (___async) {
   label = 27; //@line 1201
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1204
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1206
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1207
  _wait_ms(400); //@line 1208
  if (___async) {
   label = 29; //@line 1211
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1214
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1216
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1217
  _wait_ms(400); //@line 1218
  if (___async) {
   label = 31; //@line 1221
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1224
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1226
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1227
  _wait_ms(400); //@line 1228
  if (___async) {
   label = 33; //@line 1231
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1234
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 23; //@line 1238
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1240
   sp = STACKTOP; //@line 1241
   STACKTOP = sp; //@line 1242
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 24; //@line 1246
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1248
   sp = STACKTOP; //@line 1249
   STACKTOP = sp; //@line 1250
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 25; //@line 1254
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1256
   sp = STACKTOP; //@line 1257
   STACKTOP = sp; //@line 1258
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 26; //@line 1262
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1264
   sp = STACKTOP; //@line 1265
   STACKTOP = sp; //@line 1266
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 27; //@line 1270
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1272
   sp = STACKTOP; //@line 1273
   STACKTOP = sp; //@line 1274
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 28; //@line 1278
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1280
   sp = STACKTOP; //@line 1281
   STACKTOP = sp; //@line 1282
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 29; //@line 1286
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1288
   sp = STACKTOP; //@line 1289
   STACKTOP = sp; //@line 1290
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 30; //@line 1294
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1296
   sp = STACKTOP; //@line 1297
   STACKTOP = sp; //@line 1298
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 31; //@line 1302
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1304
   sp = STACKTOP; //@line 1305
   STACKTOP = sp; //@line 1306
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 32; //@line 1310
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1312
   sp = STACKTOP; //@line 1313
   STACKTOP = sp; //@line 1314
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 33; //@line 1318
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1320
   sp = STACKTOP; //@line 1321
   STACKTOP = sp; //@line 1322
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 34; //@line 1326
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1328
   sp = STACKTOP; //@line 1329
   STACKTOP = sp; //@line 1330
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 35; //@line 1334
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1336
   sp = STACKTOP; //@line 1337
   STACKTOP = sp; //@line 1338
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 36; //@line 1342
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1344
   sp = STACKTOP; //@line 1345
   STACKTOP = sp; //@line 1346
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 37; //@line 1350
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1352
   sp = STACKTOP; //@line 1353
   STACKTOP = sp; //@line 1354
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 38; //@line 1358
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1360
   sp = STACKTOP; //@line 1361
   STACKTOP = sp; //@line 1362
   return;
  }
 }
}
function _mbed_vtracef__async_cb_8($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $22 = 0, $26 = 0, $28 = 0, $30 = 0, $36 = 0, $4 = 0, $40 = 0, $44 = 0, $46 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11418
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11420
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11422
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 11425
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11427
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11429
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11431
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11433
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11435
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11437
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11441
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11445
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11447
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11449
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11455
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11459
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 11463
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 11465
 HEAP32[$26 >> 2] = HEAP32[___async_retval >> 2]; //@line 11470
 $50 = _snprintf($28, $30, 1025, $26) | 0; //@line 11471
 $$10 = ($50 | 0) >= ($30 | 0) ? 0 : $50; //@line 11473
 $53 = $28 + $$10 | 0; //@line 11475
 $54 = $30 - $$10 | 0; //@line 11476
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 11480
   $$3169 = $53; //@line 11480
   label = 4; //@line 11481
  }
 } else {
  $$3147168 = $30; //@line 11484
  $$3169 = $28; //@line 11484
  label = 4; //@line 11485
 }
 if ((label | 0) == 4) {
  $56 = $44 + -2 | 0; //@line 11488
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$46 >> 2] = $18; //@line 11494
    $$5156 = _snprintf($$3169, $$3147168, 1028, $46) | 0; //@line 11496
    break;
   }
  case 1:
   {
    HEAP32[$16 >> 2] = $18; //@line 11500
    $$5156 = _snprintf($$3169, $$3147168, 1043, $16) | 0; //@line 11502
    break;
   }
  case 3:
   {
    HEAP32[$22 >> 2] = $18; //@line 11506
    $$5156 = _snprintf($$3169, $$3147168, 1058, $22) | 0; //@line 11508
    break;
   }
  case 7:
   {
    HEAP32[$36 >> 2] = $18; //@line 11512
    $$5156 = _snprintf($$3169, $$3147168, 1073, $36) | 0; //@line 11514
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1088, $40) | 0; //@line 11519
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 11523
  $67 = $$3169 + $$5156$ | 0; //@line 11525
  $68 = $$3147168 - $$5156$ | 0; //@line 11526
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 11530
   $70 = _vsnprintf($67, $68, $12, $14) | 0; //@line 11531
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11534
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 11535
    HEAP32[$71 >> 2] = $2; //@line 11536
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 11537
    HEAP32[$72 >> 2] = $4; //@line 11538
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 11539
    $$expand_i1_val = $6 & 1; //@line 11540
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 11541
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 11542
    HEAP32[$74 >> 2] = $8; //@line 11543
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 11544
    HEAP32[$75 >> 2] = $10; //@line 11545
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 11546
    HEAP32[$76 >> 2] = $68; //@line 11547
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 11548
    HEAP32[$77 >> 2] = $67; //@line 11549
    sp = STACKTOP; //@line 11550
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 11554
   ___async_unwind = 0; //@line 11555
   HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11556
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 11557
   HEAP32[$71 >> 2] = $2; //@line 11558
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 11559
   HEAP32[$72 >> 2] = $4; //@line 11560
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 11561
   $$expand_i1_val = $6 & 1; //@line 11562
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 11563
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 11564
   HEAP32[$74 >> 2] = $8; //@line 11565
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 11566
   HEAP32[$75 >> 2] = $10; //@line 11567
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 11568
   HEAP32[$76 >> 2] = $68; //@line 11569
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 11570
   HEAP32[$77 >> 2] = $67; //@line 11571
   sp = STACKTOP; //@line 11572
   return;
  }
 }
 $79 = HEAP32[35] | 0; //@line 11576
 $80 = HEAP32[28] | 0; //@line 11577
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11578
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 11579
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11582
  sp = STACKTOP; //@line 11583
  return;
 }
 ___async_unwind = 0; //@line 11586
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11587
 sp = STACKTOP; //@line 11588
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7253
      $10 = HEAP32[$9 >> 2] | 0; //@line 7254
      HEAP32[$2 >> 2] = $9 + 4; //@line 7256
      HEAP32[$0 >> 2] = $10; //@line 7257
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7273
      $17 = HEAP32[$16 >> 2] | 0; //@line 7274
      HEAP32[$2 >> 2] = $16 + 4; //@line 7276
      $20 = $0; //@line 7279
      HEAP32[$20 >> 2] = $17; //@line 7281
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7284
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7300
      $30 = HEAP32[$29 >> 2] | 0; //@line 7301
      HEAP32[$2 >> 2] = $29 + 4; //@line 7303
      $31 = $0; //@line 7304
      HEAP32[$31 >> 2] = $30; //@line 7306
      HEAP32[$31 + 4 >> 2] = 0; //@line 7309
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7325
      $41 = $40; //@line 7326
      $43 = HEAP32[$41 >> 2] | 0; //@line 7328
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7331
      HEAP32[$2 >> 2] = $40 + 8; //@line 7333
      $47 = $0; //@line 7334
      HEAP32[$47 >> 2] = $43; //@line 7336
      HEAP32[$47 + 4 >> 2] = $46; //@line 7339
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7355
      $57 = HEAP32[$56 >> 2] | 0; //@line 7356
      HEAP32[$2 >> 2] = $56 + 4; //@line 7358
      $59 = ($57 & 65535) << 16 >> 16; //@line 7360
      $62 = $0; //@line 7363
      HEAP32[$62 >> 2] = $59; //@line 7365
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7368
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7384
      $72 = HEAP32[$71 >> 2] | 0; //@line 7385
      HEAP32[$2 >> 2] = $71 + 4; //@line 7387
      $73 = $0; //@line 7389
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7391
      HEAP32[$73 + 4 >> 2] = 0; //@line 7394
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7410
      $83 = HEAP32[$82 >> 2] | 0; //@line 7411
      HEAP32[$2 >> 2] = $82 + 4; //@line 7413
      $85 = ($83 & 255) << 24 >> 24; //@line 7415
      $88 = $0; //@line 7418
      HEAP32[$88 >> 2] = $85; //@line 7420
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7423
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7439
      $98 = HEAP32[$97 >> 2] | 0; //@line 7440
      HEAP32[$2 >> 2] = $97 + 4; //@line 7442
      $99 = $0; //@line 7444
      HEAP32[$99 >> 2] = $98 & 255; //@line 7446
      HEAP32[$99 + 4 >> 2] = 0; //@line 7449
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7465
      $109 = +HEAPF64[$108 >> 3]; //@line 7466
      HEAP32[$2 >> 2] = $108 + 8; //@line 7468
      HEAPF64[$0 >> 3] = $109; //@line 7469
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7485
      $116 = +HEAPF64[$115 >> 3]; //@line 7486
      HEAP32[$2 >> 2] = $115 + 8; //@line 7488
      HEAPF64[$0 >> 3] = $116; //@line 7489
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
 sp = STACKTOP; //@line 6153
 STACKTOP = STACKTOP + 224 | 0; //@line 6154
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6154
 $3 = sp + 120 | 0; //@line 6155
 $4 = sp + 80 | 0; //@line 6156
 $5 = sp; //@line 6157
 $6 = sp + 136 | 0; //@line 6158
 dest = $4; //@line 6159
 stop = dest + 40 | 0; //@line 6159
 do {
  HEAP32[dest >> 2] = 0; //@line 6159
  dest = dest + 4 | 0; //@line 6159
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6161
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6165
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6172
  } else {
   $43 = 0; //@line 6174
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6176
  $14 = $13 & 32; //@line 6177
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6183
  }
  $19 = $0 + 48 | 0; //@line 6185
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6190
    $24 = HEAP32[$23 >> 2] | 0; //@line 6191
    HEAP32[$23 >> 2] = $6; //@line 6192
    $25 = $0 + 28 | 0; //@line 6193
    HEAP32[$25 >> 2] = $6; //@line 6194
    $26 = $0 + 20 | 0; //@line 6195
    HEAP32[$26 >> 2] = $6; //@line 6196
    HEAP32[$19 >> 2] = 80; //@line 6197
    $28 = $0 + 16 | 0; //@line 6199
    HEAP32[$28 >> 2] = $6 + 80; //@line 6200
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6201
    if (!$24) {
     $$1 = $29; //@line 6204
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6207
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6208
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6209
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 58; //@line 6212
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6214
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6216
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6218
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6220
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6222
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6224
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6226
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6228
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6230
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6232
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6234
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6236
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6238
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6240
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6242
      sp = STACKTOP; //@line 6243
      STACKTOP = sp; //@line 6244
      return 0; //@line 6244
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6246
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6249
      HEAP32[$23 >> 2] = $24; //@line 6250
      HEAP32[$19 >> 2] = 0; //@line 6251
      HEAP32[$28 >> 2] = 0; //@line 6252
      HEAP32[$25 >> 2] = 0; //@line 6253
      HEAP32[$26 >> 2] = 0; //@line 6254
      $$1 = $$; //@line 6255
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6261
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6264
  HEAP32[$0 >> 2] = $51 | $14; //@line 6269
  if ($43 | 0) {
   ___unlockfile($0); //@line 6272
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6274
 }
 STACKTOP = sp; //@line 6276
 return $$0 | 0; //@line 6276
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10068
 STACKTOP = STACKTOP + 64 | 0; //@line 10069
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10069
 $4 = sp; //@line 10070
 $5 = HEAP32[$0 >> 2] | 0; //@line 10071
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10074
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10076
 HEAP32[$4 >> 2] = $2; //@line 10077
 HEAP32[$4 + 4 >> 2] = $0; //@line 10079
 HEAP32[$4 + 8 >> 2] = $1; //@line 10081
 HEAP32[$4 + 12 >> 2] = $3; //@line 10083
 $14 = $4 + 16 | 0; //@line 10084
 $15 = $4 + 20 | 0; //@line 10085
 $16 = $4 + 24 | 0; //@line 10086
 $17 = $4 + 28 | 0; //@line 10087
 $18 = $4 + 32 | 0; //@line 10088
 $19 = $4 + 40 | 0; //@line 10089
 dest = $14; //@line 10090
 stop = dest + 36 | 0; //@line 10090
 do {
  HEAP32[dest >> 2] = 0; //@line 10090
  dest = dest + 4 | 0; //@line 10090
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10090
 HEAP8[$14 + 38 >> 0] = 0; //@line 10090
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10095
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10098
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10099
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10100
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 64; //@line 10103
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10105
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10107
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10109
    sp = STACKTOP; //@line 10110
    STACKTOP = sp; //@line 10111
    return 0; //@line 10111
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10113
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10117
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10121
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10124
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10125
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10126
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 65; //@line 10129
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10131
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10133
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10135
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10137
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10139
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10141
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10143
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10145
    sp = STACKTOP; //@line 10146
    STACKTOP = sp; //@line 10147
    return 0; //@line 10147
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10149
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10163
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10171
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10187
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10192
  }
 } while (0);
 STACKTOP = sp; //@line 10195
 return $$0 | 0; //@line 10195
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6025
 $7 = ($2 | 0) != 0; //@line 6029
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6033
   $$03555 = $0; //@line 6034
   $$03654 = $2; //@line 6034
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6039
     $$036$lcssa64 = $$03654; //@line 6039
     label = 6; //@line 6040
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6043
    $12 = $$03654 + -1 | 0; //@line 6044
    $16 = ($12 | 0) != 0; //@line 6048
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6051
     $$03654 = $12; //@line 6051
    } else {
     $$035$lcssa = $11; //@line 6053
     $$036$lcssa = $12; //@line 6053
     $$lcssa = $16; //@line 6053
     label = 5; //@line 6054
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6059
   $$036$lcssa = $2; //@line 6059
   $$lcssa = $7; //@line 6059
   label = 5; //@line 6060
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6065
   $$036$lcssa64 = $$036$lcssa; //@line 6065
   label = 6; //@line 6066
  } else {
   $$2 = $$035$lcssa; //@line 6068
   $$3 = 0; //@line 6068
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6074
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6077
    $$3 = $$036$lcssa64; //@line 6077
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6079
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6083
      $$13745 = $$036$lcssa64; //@line 6083
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6086
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6095
       $30 = $$13745 + -4 | 0; //@line 6096
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6099
        $$13745 = $30; //@line 6099
       } else {
        $$0$lcssa = $29; //@line 6101
        $$137$lcssa = $30; //@line 6101
        label = 11; //@line 6102
        break L11;
       }
      }
      $$140 = $$046; //@line 6106
      $$23839 = $$13745; //@line 6106
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6108
      $$137$lcssa = $$036$lcssa64; //@line 6108
      label = 11; //@line 6109
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6115
      $$3 = 0; //@line 6115
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6118
      $$23839 = $$137$lcssa; //@line 6118
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6125
      $$3 = $$23839; //@line 6125
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6128
     $$23839 = $$23839 + -1 | 0; //@line 6129
     if (!$$23839) {
      $$2 = $35; //@line 6132
      $$3 = 0; //@line 6132
      break;
     } else {
      $$140 = $35; //@line 6135
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6143
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5796
 do {
  if (!$0) {
   do {
    if (!(HEAP32[72] | 0)) {
     $34 = 0; //@line 5804
    } else {
     $12 = HEAP32[72] | 0; //@line 5806
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5807
     $13 = _fflush($12) | 0; //@line 5808
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 54; //@line 5811
      sp = STACKTOP; //@line 5812
      return 0; //@line 5813
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5815
      $34 = $13; //@line 5816
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5822
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5826
    } else {
     $$02327 = $$02325; //@line 5828
     $$02426 = $34; //@line 5828
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5835
      } else {
       $28 = 0; //@line 5837
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5845
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5846
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5851
       $$1 = $25 | $$02426; //@line 5853
      } else {
       $$1 = $$02426; //@line 5855
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5859
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5862
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5865
       break L9;
      } else {
       $$02327 = $$023; //@line 5868
       $$02426 = $$1; //@line 5868
      }
     }
     HEAP32[$AsyncCtx >> 2] = 55; //@line 5871
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5873
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5875
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5877
     sp = STACKTOP; //@line 5878
     return 0; //@line 5879
    }
   } while (0);
   ___ofl_unlock(); //@line 5882
   $$0 = $$024$lcssa; //@line 5883
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5889
    $5 = ___fflush_unlocked($0) | 0; //@line 5890
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 52; //@line 5893
     sp = STACKTOP; //@line 5894
     return 0; //@line 5895
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5897
     $$0 = $5; //@line 5898
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5903
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5904
   $7 = ___fflush_unlocked($0) | 0; //@line 5905
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 53; //@line 5908
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 5911
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5913
    sp = STACKTOP; //@line 5914
    return 0; //@line 5915
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5917
   if ($phitmp) {
    $$0 = $7; //@line 5919
   } else {
    ___unlockfile($0); //@line 5921
    $$0 = $7; //@line 5922
   }
  }
 } while (0);
 return $$0 | 0; //@line 5926
}
function _mbed_vtracef__async_cb_13($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11748
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11750
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11752
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 11755
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11757
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11759
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11761
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11765
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 11767
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 11769
 $19 = $12 - $$13 | 0; //@line 11770
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[34] | 0; //@line 11774
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1103, $8) | 0; //@line 11786
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 11789
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 11790
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 11793
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 11794
    HEAP32[$24 >> 2] = $2; //@line 11795
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 11796
    HEAP32[$25 >> 2] = $18; //@line 11797
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 11798
    HEAP32[$26 >> 2] = $19; //@line 11799
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 11800
    HEAP32[$27 >> 2] = $4; //@line 11801
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 11802
    $$expand_i1_val = $6 & 1; //@line 11803
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 11804
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 11805
    HEAP32[$29 >> 2] = $8; //@line 11806
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 11807
    HEAP32[$30 >> 2] = $10; //@line 11808
    sp = STACKTOP; //@line 11809
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 11813
   ___async_unwind = 0; //@line 11814
   HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 11815
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 11816
   HEAP32[$24 >> 2] = $2; //@line 11817
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 11818
   HEAP32[$25 >> 2] = $18; //@line 11819
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 11820
   HEAP32[$26 >> 2] = $19; //@line 11821
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 11822
   HEAP32[$27 >> 2] = $4; //@line 11823
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 11824
   $$expand_i1_val = $6 & 1; //@line 11825
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 11826
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 11827
   HEAP32[$29 >> 2] = $8; //@line 11828
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 11829
   HEAP32[$30 >> 2] = $10; //@line 11830
   sp = STACKTOP; //@line 11831
   return;
  }
 } while (0);
 $34 = HEAP32[35] | 0; //@line 11835
 $35 = HEAP32[28] | 0; //@line 11836
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11837
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 11838
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11841
  sp = STACKTOP; //@line 11842
  return;
 }
 ___async_unwind = 0; //@line 11845
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11846
 sp = STACKTOP; //@line 11847
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10250
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10256
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10262
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10265
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10266
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10267
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 68; //@line 10270
     sp = STACKTOP; //@line 10271
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10274
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10282
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10287
     $19 = $1 + 44 | 0; //@line 10288
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10294
     HEAP8[$22 >> 0] = 0; //@line 10295
     $23 = $1 + 53 | 0; //@line 10296
     HEAP8[$23 >> 0] = 0; //@line 10297
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10299
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10302
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10303
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10304
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 67; //@line 10307
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10309
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10311
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10313
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10315
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10317
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10319
      sp = STACKTOP; //@line 10320
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10323
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10327
      label = 13; //@line 10328
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10333
       label = 13; //@line 10334
      } else {
       $$037$off039 = 3; //@line 10336
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10340
      $39 = $1 + 40 | 0; //@line 10341
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10344
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10354
        $$037$off039 = $$037$off038; //@line 10355
       } else {
        $$037$off039 = $$037$off038; //@line 10357
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10360
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10363
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10370
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_14($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11857
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11859
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11861
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 11864
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11866
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11868
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11870
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11872
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11874
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11876
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11878
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11880
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11882
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11884
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11886
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11888
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11890
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11892
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11894
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11896
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11898
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 11900
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 11902
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 11904
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 11906
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 11908
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 11914
 $56 = HEAP32[33] | 0; //@line 11915
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 11916
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 11917
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 11921
  ___async_unwind = 0; //@line 11922
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 15; //@line 11924
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 11926
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 11928
 HEAP8[$ReallocAsyncCtx5 + 12 >> 0] = $6 & 1; //@line 11931
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 11933
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 11935
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 11937
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 11939
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 11941
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 11943
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 11945
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 11947
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 11949
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 11951
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 11953
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 11955
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 11957
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $34; //@line 11959
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 11961
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 11963
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 11965
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 11967
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $44; //@line 11969
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 11971
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $48; //@line 11973
 sp = STACKTOP; //@line 11974
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10512
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10514
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10516
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10518
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1012] | 0)) {
  _serial_init(4052, 2, 3); //@line 10526
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 10528
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10534
  _serial_putc(4052, $9 << 24 >> 24); //@line 10535
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 10538
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 10539
   HEAP32[$18 >> 2] = 0; //@line 10540
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 10541
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 10542
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 10543
   HEAP32[$20 >> 2] = $2; //@line 10544
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 10545
   HEAP8[$21 >> 0] = $9; //@line 10546
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 10547
   HEAP32[$22 >> 2] = $4; //@line 10548
   sp = STACKTOP; //@line 10549
   return;
  }
  ___async_unwind = 0; //@line 10552
  HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 10553
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 10554
  HEAP32[$18 >> 2] = 0; //@line 10555
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 10556
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 10557
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 10558
  HEAP32[$20 >> 2] = $2; //@line 10559
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 10560
  HEAP8[$21 >> 0] = $9; //@line 10561
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 10562
  HEAP32[$22 >> 2] = $4; //@line 10563
  sp = STACKTOP; //@line 10564
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 10567
  _serial_putc(4052, 13); //@line 10568
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 10571
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 10572
   HEAP8[$12 >> 0] = $9; //@line 10573
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 10574
   HEAP32[$13 >> 2] = 0; //@line 10575
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 10576
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 10577
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 10578
   HEAP32[$15 >> 2] = $2; //@line 10579
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 10580
   HEAP32[$16 >> 2] = $4; //@line 10581
   sp = STACKTOP; //@line 10582
   return;
  }
  ___async_unwind = 0; //@line 10585
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 10586
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 10587
  HEAP8[$12 >> 0] = $9; //@line 10588
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 10589
  HEAP32[$13 >> 2] = 0; //@line 10590
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 10591
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 10592
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 10593
  HEAP32[$15 >> 2] = $2; //@line 10594
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 10595
  HEAP32[$16 >> 2] = $4; //@line 10596
  sp = STACKTOP; //@line 10597
  return;
 }
}
function _mbed_error_vfprintf__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10605
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10609
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10611
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10615
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 10616
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 10622
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10628
  _serial_putc(4052, $13 << 24 >> 24); //@line 10629
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 10632
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 10633
   HEAP32[$22 >> 2] = $12; //@line 10634
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 10635
   HEAP32[$23 >> 2] = $4; //@line 10636
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 10637
   HEAP32[$24 >> 2] = $6; //@line 10638
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 10639
   HEAP8[$25 >> 0] = $13; //@line 10640
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 10641
   HEAP32[$26 >> 2] = $10; //@line 10642
   sp = STACKTOP; //@line 10643
   return;
  }
  ___async_unwind = 0; //@line 10646
  HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 10647
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 10648
  HEAP32[$22 >> 2] = $12; //@line 10649
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 10650
  HEAP32[$23 >> 2] = $4; //@line 10651
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 10652
  HEAP32[$24 >> 2] = $6; //@line 10653
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 10654
  HEAP8[$25 >> 0] = $13; //@line 10655
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 10656
  HEAP32[$26 >> 2] = $10; //@line 10657
  sp = STACKTOP; //@line 10658
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 10661
  _serial_putc(4052, 13); //@line 10662
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 10665
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 10666
   HEAP8[$16 >> 0] = $13; //@line 10667
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 10668
   HEAP32[$17 >> 2] = $12; //@line 10669
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 10670
   HEAP32[$18 >> 2] = $4; //@line 10671
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 10672
   HEAP32[$19 >> 2] = $6; //@line 10673
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 10674
   HEAP32[$20 >> 2] = $10; //@line 10675
   sp = STACKTOP; //@line 10676
   return;
  }
  ___async_unwind = 0; //@line 10679
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 10680
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 10681
  HEAP8[$16 >> 0] = $13; //@line 10682
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 10683
  HEAP32[$17 >> 2] = $12; //@line 10684
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 10685
  HEAP32[$18 >> 2] = $4; //@line 10686
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 10687
  HEAP32[$19 >> 2] = $6; //@line 10688
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 10689
  HEAP32[$20 >> 2] = $10; //@line 10690
  sp = STACKTOP; //@line 10691
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4837
 STACKTOP = STACKTOP + 48 | 0; //@line 4838
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4838
 $vararg_buffer3 = sp + 16 | 0; //@line 4839
 $vararg_buffer = sp; //@line 4840
 $3 = sp + 32 | 0; //@line 4841
 $4 = $0 + 28 | 0; //@line 4842
 $5 = HEAP32[$4 >> 2] | 0; //@line 4843
 HEAP32[$3 >> 2] = $5; //@line 4844
 $7 = $0 + 20 | 0; //@line 4846
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4848
 HEAP32[$3 + 4 >> 2] = $9; //@line 4849
 HEAP32[$3 + 8 >> 2] = $1; //@line 4851
 HEAP32[$3 + 12 >> 2] = $2; //@line 4853
 $12 = $9 + $2 | 0; //@line 4854
 $13 = $0 + 60 | 0; //@line 4855
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4858
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4860
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4862
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4864
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4868
  } else {
   $$04756 = 2; //@line 4870
   $$04855 = $12; //@line 4870
   $$04954 = $3; //@line 4870
   $27 = $17; //@line 4870
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4876
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4878
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4879
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4881
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4883
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4885
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4888
    $44 = $$150 + 4 | 0; //@line 4889
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4892
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4895
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4897
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4899
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4901
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4904
     break L1;
    } else {
     $$04756 = $$1; //@line 4907
     $$04954 = $$150; //@line 4907
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4911
   HEAP32[$4 >> 2] = 0; //@line 4912
   HEAP32[$7 >> 2] = 0; //@line 4913
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4916
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4919
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4924
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4930
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4935
  $25 = $20; //@line 4936
  HEAP32[$4 >> 2] = $25; //@line 4937
  HEAP32[$7 >> 2] = $25; //@line 4938
  $$051 = $2; //@line 4939
 }
 STACKTOP = sp; //@line 4941
 return $$051 | 0; //@line 4941
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1394
 STACKTOP = STACKTOP + 128 | 0; //@line 1395
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1395
 $2 = sp; //@line 1396
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1397
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1398
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 1401
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1403
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1405
  sp = STACKTOP; //@line 1406
  STACKTOP = sp; //@line 1407
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1409
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1412
  return;
 }
 if (!(HEAP32[1012] | 0)) {
  _serial_init(4052, 2, 3); //@line 1417
  $$01213 = 0; //@line 1418
  $$014 = 0; //@line 1418
 } else {
  $$01213 = 0; //@line 1420
  $$014 = 0; //@line 1420
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1424
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1429
   _serial_putc(4052, 13); //@line 1430
   if (___async) {
    label = 8; //@line 1433
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1436
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1439
  _serial_putc(4052, $$01213 << 24 >> 24); //@line 1440
  if (___async) {
   label = 11; //@line 1443
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1446
  $24 = $$014 + 1 | 0; //@line 1447
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1450
   break;
  } else {
   $$014 = $24; //@line 1453
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 41; //@line 1457
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1459
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1461
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1463
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1465
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1467
  sp = STACKTOP; //@line 1468
  STACKTOP = sp; //@line 1469
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 42; //@line 1472
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1474
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1476
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1478
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1480
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1482
  sp = STACKTOP; //@line 1483
  STACKTOP = sp; //@line 1484
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1487
  return;
 }
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 13502
 }
 ret = dest | 0; //@line 13505
 dest_end = dest + num | 0; //@line 13506
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 13510
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13511
   dest = dest + 1 | 0; //@line 13512
   src = src + 1 | 0; //@line 13513
   num = num - 1 | 0; //@line 13514
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 13516
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 13517
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13519
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 13520
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 13521
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 13522
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 13523
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 13524
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 13525
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 13526
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 13527
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 13528
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 13529
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 13530
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 13531
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 13532
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 13533
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 13534
   dest = dest + 64 | 0; //@line 13535
   src = src + 64 | 0; //@line 13536
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13539
   dest = dest + 4 | 0; //@line 13540
   src = src + 4 | 0; //@line 13541
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 13545
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13547
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 13548
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 13549
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 13550
   dest = dest + 4 | 0; //@line 13551
   src = src + 4 | 0; //@line 13552
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13557
  dest = dest + 1 | 0; //@line 13558
  src = src + 1 | 0; //@line 13559
 }
 return ret | 0; //@line 13561
}
function _mbed_trace_array($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$042$ph = 0, $$04353 = 0, $$04552 = 0, $$04651 = 0, $$04750 = 0, $$2$ph = 0, $11 = 0, $15 = 0, $16 = 0, $2 = 0, $24 = 0, $27 = 0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 946
 STACKTOP = STACKTOP + 16 | 0; //@line 947
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 947
 $vararg_buffer = sp; //@line 948
 $2 = HEAP32[37] | 0; //@line 949
 do {
  if ($2 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 953
   FUNCTION_TABLE_v[$2 & 0](); //@line 954
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 21; //@line 957
    HEAP16[$AsyncCtx + 4 >> 1] = $1; //@line 959
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 961
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 963
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 965
    sp = STACKTOP; //@line 966
    STACKTOP = sp; //@line 967
    return 0; //@line 967
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 969
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 972
    break;
   }
  }
 } while (0);
 $11 = HEAP32[32] | 0; //@line 978
 $15 = (HEAP32[30] | 0) - $11 + (HEAP32[31] | 0) | 0; //@line 982
 $16 = $1 & 65535; //@line 983
 if ($1 << 16 >> 16 == 0 | ($11 | 0) == 0 | ($15 | 0) == 0) {
  $$0 = 4636; //@line 990
  STACKTOP = sp; //@line 991
  return $$0 | 0; //@line 991
 }
 if (!$0) {
  $$0 = 1108; //@line 995
  STACKTOP = sp; //@line 996
  return $$0 | 0; //@line 996
 }
 HEAP8[$11 >> 0] = 0; //@line 998
 $$04353 = $0; //@line 999
 $$04552 = $11; //@line 999
 $$04651 = 0; //@line 999
 $$04750 = $15; //@line 999
 while (1) {
  if (($$04750 | 0) < 4) {
   $$042$ph = 42; //@line 1003
   $$2$ph = $$04552; //@line 1003
   break;
  }
  HEAP32[$vararg_buffer >> 2] = HEAPU8[$$04353 >> 0]; //@line 1008
  $24 = _snprintf($$04552, $$04750, 1115, $vararg_buffer) | 0; //@line 1009
  $27 = $$04552 + $24 | 0; //@line 1013
  if (($24 | 0) < 1 | ($$04750 | 0) < ($24 | 0)) {
   $$042$ph = 0; //@line 1015
   $$2$ph = $$04552; //@line 1015
   break;
  }
  $$04651 = $$04651 + 1 | 0; //@line 1020
  if (($$04651 | 0) >= ($16 | 0)) {
   $$042$ph = 0; //@line 1025
   $$2$ph = $27; //@line 1025
   break;
  } else {
   $$04353 = $$04353 + 1 | 0; //@line 1023
   $$04552 = $27; //@line 1023
   $$04750 = $$04750 - $24 | 0; //@line 1023
  }
 }
 if ($$2$ph >>> 0 > $11 >>> 0) {
  HEAP8[$$2$ph + -1 >> 0] = $$042$ph; //@line 1032
 }
 HEAP32[32] = $$2$ph; //@line 1034
 $$0 = $11; //@line 1035
 STACKTOP = sp; //@line 1036
 return $$0 | 0; //@line 1036
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9751
 STACKTOP = STACKTOP + 64 | 0; //@line 9752
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9752
 $3 = sp; //@line 9753
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9756
 } else {
  if (!$1) {
   $$2 = 0; //@line 9760
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9762
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 9763
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 62; //@line 9766
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9768
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9770
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9772
    sp = STACKTOP; //@line 9773
    STACKTOP = sp; //@line 9774
    return 0; //@line 9774
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9776
   if (!$6) {
    $$2 = 0; //@line 9779
   } else {
    dest = $3 + 4 | 0; //@line 9782
    stop = dest + 52 | 0; //@line 9782
    do {
     HEAP32[dest >> 2] = 0; //@line 9782
     dest = dest + 4 | 0; //@line 9782
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9783
    HEAP32[$3 + 8 >> 2] = $0; //@line 9785
    HEAP32[$3 + 12 >> 2] = -1; //@line 9787
    HEAP32[$3 + 48 >> 2] = 1; //@line 9789
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9792
    $18 = HEAP32[$2 >> 2] | 0; //@line 9793
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9794
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9795
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 63; //@line 9798
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9800
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9802
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9804
     sp = STACKTOP; //@line 9805
     STACKTOP = sp; //@line 9806
     return 0; //@line 9806
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9808
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 9815
     $$0 = 1; //@line 9816
    } else {
     $$0 = 0; //@line 9818
    }
    $$2 = $$0; //@line 9820
   }
  }
 }
 STACKTOP = sp; //@line 9824
 return $$2 | 0; //@line 9824
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 9558
 STACKTOP = STACKTOP + 128 | 0; //@line 9559
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 9559
 $4 = sp + 124 | 0; //@line 9560
 $5 = sp; //@line 9561
 dest = $5; //@line 9562
 src = 536; //@line 9562
 stop = dest + 124 | 0; //@line 9562
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9562
  dest = dest + 4 | 0; //@line 9562
  src = src + 4 | 0; //@line 9562
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 9568
   $$015 = 1; //@line 9568
   label = 4; //@line 9569
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9572
   $$0 = -1; //@line 9573
  }
 } else {
  $$014 = $0; //@line 9576
  $$015 = $1; //@line 9576
  label = 4; //@line 9577
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 9581
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 9583
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 9585
  $14 = $5 + 20 | 0; //@line 9586
  HEAP32[$14 >> 2] = $$014; //@line 9587
  HEAP32[$5 + 44 >> 2] = $$014; //@line 9589
  $16 = $$014 + $$$015 | 0; //@line 9590
  $17 = $5 + 16 | 0; //@line 9591
  HEAP32[$17 >> 2] = $16; //@line 9592
  HEAP32[$5 + 28 >> 2] = $16; //@line 9594
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 9595
  $19 = _vfprintf($5, $2, $3) | 0; //@line 9596
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 60; //@line 9599
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 9601
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 9603
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9605
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 9607
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 9609
   sp = STACKTOP; //@line 9610
   STACKTOP = sp; //@line 9611
   return 0; //@line 9611
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9613
  if (!$$$015) {
   $$0 = $19; //@line 9616
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 9618
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9623
   $$0 = $19; //@line 9624
  }
 }
 STACKTOP = sp; //@line 9627
 return $$0 | 0; //@line 9627
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 5547
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 5550
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 5553
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 5556
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 5562
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 5571
     $24 = $13 >>> 2; //@line 5572
     $$090 = 0; //@line 5573
     $$094 = $7; //@line 5573
     while (1) {
      $25 = $$094 >>> 1; //@line 5575
      $26 = $$090 + $25 | 0; //@line 5576
      $27 = $26 << 1; //@line 5577
      $28 = $27 + $23 | 0; //@line 5578
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 5581
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5585
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 5591
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 5599
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 5603
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 5609
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 5614
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 5617
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 5617
      }
     }
     $46 = $27 + $24 | 0; //@line 5620
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 5623
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5627
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 5639
     } else {
      $$4 = 0; //@line 5641
     }
    } else {
     $$4 = 0; //@line 5644
    }
   } else {
    $$4 = 0; //@line 5647
   }
  } else {
   $$4 = 0; //@line 5650
  }
 } while (0);
 return $$4 | 0; //@line 5653
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5212
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5217
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5222
  } else {
   $20 = $0 & 255; //@line 5224
   $21 = $0 & 255; //@line 5225
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5231
   } else {
    $26 = $1 + 20 | 0; //@line 5233
    $27 = HEAP32[$26 >> 2] | 0; //@line 5234
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5240
     HEAP8[$27 >> 0] = $20; //@line 5241
     $34 = $21; //@line 5242
    } else {
     label = 12; //@line 5244
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5249
     $32 = ___overflow($1, $0) | 0; //@line 5250
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 50; //@line 5253
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5255
      sp = STACKTOP; //@line 5256
      return 0; //@line 5257
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5259
      $34 = $32; //@line 5260
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5265
   $$0 = $34; //@line 5266
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5271
   $8 = $0 & 255; //@line 5272
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5278
    $14 = HEAP32[$13 >> 2] | 0; //@line 5279
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5285
     HEAP8[$14 >> 0] = $7; //@line 5286
     $$0 = $8; //@line 5287
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5291
   $19 = ___overflow($1, $0) | 0; //@line 5292
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 49; //@line 5295
    sp = STACKTOP; //@line 5296
    return 0; //@line 5297
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5299
    $$0 = $19; //@line 5300
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5305
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5932
 $1 = $0 + 20 | 0; //@line 5933
 $3 = $0 + 28 | 0; //@line 5935
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 5941
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5942
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 5943
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 56; //@line 5946
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5948
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 5950
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5952
    sp = STACKTOP; //@line 5953
    return 0; //@line 5954
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5956
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 5960
     break;
    } else {
     label = 5; //@line 5963
     break;
    }
   }
  } else {
   label = 5; //@line 5968
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 5972
  $14 = HEAP32[$13 >> 2] | 0; //@line 5973
  $15 = $0 + 8 | 0; //@line 5974
  $16 = HEAP32[$15 >> 2] | 0; //@line 5975
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5983
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 5984
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 5985
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 57; //@line 5988
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5990
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5992
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5994
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5996
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5998
     sp = STACKTOP; //@line 5999
     return 0; //@line 6000
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6002
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6008
  HEAP32[$3 >> 2] = 0; //@line 6009
  HEAP32[$1 >> 2] = 0; //@line 6010
  HEAP32[$15 >> 2] = 0; //@line 6011
  HEAP32[$13 >> 2] = 0; //@line 6012
  $$0 = 0; //@line 6013
 }
 return $$0 | 0; //@line 6015
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
 $2 = $1 & 255; //@line 5696
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 5702
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 5708
   } else {
    $7 = $1 & 255; //@line 5710
    $$03039 = $0; //@line 5711
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 5713
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 5718
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 5721
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 5726
      break;
     } else {
      $$03039 = $13; //@line 5729
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 5733
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 5734
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 5742
     $25 = $18; //@line 5742
     while (1) {
      $24 = $25 ^ $17; //@line 5744
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 5751
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 5754
      $25 = HEAP32[$31 >> 2] | 0; //@line 5755
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 5764
       break;
      } else {
       $$02936 = $31; //@line 5762
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 5769
    }
   } while (0);
   $38 = $1 & 255; //@line 5772
   $$1 = $$029$lcssa; //@line 5773
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 5775
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 5781
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 5784
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 5789
}
function _mbed_trace_init() {
 var $$0 = 0, $0 = 0, $10 = 0, $13 = 0, $14 = 0, $17 = 0, $19 = 0, $22 = 0, $24 = 0, $3 = 0, $4 = 0, $7 = 0, $9 = 0;
 $0 = HEAP32[28] | 0; //@line 137
 if (!$0) {
  $3 = _malloc(HEAP32[29] | 0) | 0; //@line 141
  HEAP32[28] = $3; //@line 142
  $19 = $3; //@line 143
 } else {
  $19 = $0; //@line 145
 }
 $4 = HEAP32[30] | 0; //@line 147
 if (!$4) {
  $7 = _malloc(HEAP32[31] | 0) | 0; //@line 151
  HEAP32[30] = $7; //@line 152
  $9 = $7; //@line 153
 } else {
  $9 = $4; //@line 155
 }
 HEAP32[32] = $9; //@line 158
 $10 = HEAP32[25] | 0; //@line 159
 if (!$10) {
  $13 = _malloc(HEAP32[27] | 0) | 0; //@line 163
  HEAP32[25] = $13; //@line 164
  $22 = $13; //@line 165
 } else {
  $22 = $10; //@line 167
 }
 $14 = HEAP32[26] | 0; //@line 169
 if (!$14) {
  $17 = _malloc(HEAP32[27] | 0) | 0; //@line 173
  HEAP32[26] = $17; //@line 174
  $24 = $17; //@line 175
 } else {
  $24 = $14; //@line 177
 }
 if (($19 | 0) == 0 | ($9 | 0) == 0 | ($22 | 0) == 0 | ($24 | 0) == 0) {
  _free($19); //@line 187
  _free(HEAP32[30] | 0); //@line 189
  _free(HEAP32[25] | 0); //@line 191
  _free(HEAP32[26] | 0); //@line 193
  HEAP8[96] = 127; //@line 194
  HEAP32[25] = 0; //@line 195
  HEAP32[26] = 0; //@line 196
  HEAP32[27] = 24; //@line 197
  HEAP32[28] = 0; //@line 198
  HEAP32[29] = 1024; //@line 199
  HEAP32[30] = 0; //@line 200
  HEAP32[31] = 128; //@line 201
  HEAP32[33] = 0; //@line 202
  HEAP32[34] = 0; //@line 203
  HEAP32[35] = 1; //@line 204
  HEAP32[36] = 0; //@line 205
  HEAP32[37] = 0; //@line 205
  HEAP32[38] = 0; //@line 205
  HEAP32[39] = 0; //@line 205
  $$0 = -1; //@line 206
  return $$0 | 0; //@line 207
 } else {
  _memset($9 | 0, 0, HEAP32[31] | 0) | 0; //@line 210
  _memset(HEAP32[25] | 0, 0, HEAP32[27] | 0) | 0; //@line 213
  _memset(HEAP32[26] | 0, 0, HEAP32[27] | 0) | 0; //@line 216
  _memset(HEAP32[28] | 0, 0, HEAP32[29] | 0) | 0; //@line 219
  $$0 = 0; //@line 220
  return $$0 | 0; //@line 221
 }
 return 0; //@line 223
}
function _mbed_trace_array__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$042$ph = 0, $$04353 = 0, $$04552 = 0, $$04651 = 0, $$04750 = 0, $$2$ph = 0, $12 = 0, $16 = 0, $17 = 0, $2 = 0, $25 = 0, $28 = 0, $34 = 0, $4 = 0, $6 = 0;
 $2 = HEAP16[$0 + 4 >> 1] | 0; //@line 12943
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12945
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12947
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 12952
 $12 = HEAP32[32] | 0; //@line 12954
 $16 = (HEAP32[30] | 0) - $12 + (HEAP32[31] | 0) | 0; //@line 12958
 $17 = $2 & 65535; //@line 12959
 if ($2 << 16 >> 16 == 0 | ($12 | 0) == 0 | ($16 | 0) == 0) {
  $$0 = 4636; //@line 12966
  $34 = ___async_retval; //@line 12967
  HEAP32[$34 >> 2] = $$0; //@line 12968
  return;
 }
 if (!$4) {
  $$0 = 1108; //@line 12973
  $34 = ___async_retval; //@line 12974
  HEAP32[$34 >> 2] = $$0; //@line 12975
  return;
 }
 HEAP8[$12 >> 0] = 0; //@line 12978
 $$04353 = $4; //@line 12979
 $$04552 = $12; //@line 12979
 $$04651 = 0; //@line 12979
 $$04750 = $16; //@line 12979
 while (1) {
  if (($$04750 | 0) < 4) {
   $$042$ph = 42; //@line 12983
   $$2$ph = $$04552; //@line 12983
   break;
  }
  HEAP32[$6 >> 2] = HEAPU8[$$04353 >> 0]; //@line 12988
  $25 = _snprintf($$04552, $$04750, 1115, $6) | 0; //@line 12989
  $28 = $$04552 + $25 | 0; //@line 12993
  if (($25 | 0) < 1 | ($$04750 | 0) < ($25 | 0)) {
   $$042$ph = 0; //@line 12995
   $$2$ph = $$04552; //@line 12995
   break;
  }
  $$04651 = $$04651 + 1 | 0; //@line 13000
  if (($$04651 | 0) >= ($17 | 0)) {
   $$042$ph = 0; //@line 13005
   $$2$ph = $28; //@line 13005
   break;
  } else {
   $$04353 = $$04353 + 1 | 0; //@line 13003
   $$04552 = $28; //@line 13003
   $$04750 = $$04750 - $25 | 0; //@line 13003
  }
 }
 if ($$2$ph >>> 0 > $12 >>> 0) {
  HEAP8[$$2$ph + -1 >> 0] = $$042$ph; //@line 13012
 }
 HEAP32[32] = $$2$ph; //@line 13014
 $$0 = $12; //@line 13015
 $34 = ___async_retval; //@line 13016
 HEAP32[$34 >> 2] = $$0; //@line 13017
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 5438
 $4 = HEAP32[$3 >> 2] | 0; //@line 5439
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 5446
   label = 5; //@line 5447
  } else {
   $$1 = 0; //@line 5449
  }
 } else {
  $12 = $4; //@line 5453
  label = 5; //@line 5454
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 5458
   $10 = HEAP32[$9 >> 2] | 0; //@line 5459
   $14 = $10; //@line 5462
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5467
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5475
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5479
       $$141 = $0; //@line 5479
       $$143 = $1; //@line 5479
       $31 = $14; //@line 5479
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5482
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5489
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5494
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5497
      break L5;
     }
     $$139 = $$038; //@line 5503
     $$141 = $0 + $$038 | 0; //@line 5503
     $$143 = $1 - $$038 | 0; //@line 5503
     $31 = HEAP32[$9 >> 2] | 0; //@line 5503
    } else {
     $$139 = 0; //@line 5505
     $$141 = $0; //@line 5505
     $$143 = $1; //@line 5505
     $31 = $14; //@line 5505
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5508
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5511
   $$1 = $$139 + $$143 | 0; //@line 5513
  }
 } while (0);
 return $$1 | 0; //@line 5516
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5324
 STACKTOP = STACKTOP + 16 | 0; //@line 5325
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5325
 $2 = sp; //@line 5326
 $3 = $1 & 255; //@line 5327
 HEAP8[$2 >> 0] = $3; //@line 5328
 $4 = $0 + 16 | 0; //@line 5329
 $5 = HEAP32[$4 >> 2] | 0; //@line 5330
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 5337
   label = 4; //@line 5338
  } else {
   $$0 = -1; //@line 5340
  }
 } else {
  $12 = $5; //@line 5343
  label = 4; //@line 5344
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 5348
   $10 = HEAP32[$9 >> 2] | 0; //@line 5349
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 5352
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 5359
     HEAP8[$10 >> 0] = $3; //@line 5360
     $$0 = $13; //@line 5361
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5366
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5367
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 5368
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 51; //@line 5371
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 5373
    sp = STACKTOP; //@line 5374
    STACKTOP = sp; //@line 5375
    return 0; //@line 5375
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 5377
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 5382
   } else {
    $$0 = -1; //@line 5384
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5388
 return $$0 | 0; //@line 5388
}
function _fflush__async_cb_18($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12121
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12123
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 12125
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 12129
  } else {
   $$02327 = $$02325; //@line 12131
   $$02426 = $AsyncRetVal; //@line 12131
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 12138
    } else {
     $16 = 0; //@line 12140
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 12152
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 12155
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 12158
     break L3;
    } else {
     $$02327 = $$023; //@line 12161
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12164
   $13 = ___fflush_unlocked($$02327) | 0; //@line 12165
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 12169
    ___async_unwind = 0; //@line 12170
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 12172
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 12174
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 12176
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 12178
   sp = STACKTOP; //@line 12179
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 12183
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 12185
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 13566
 value = value & 255; //@line 13568
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 13571
   ptr = ptr + 1 | 0; //@line 13572
  }
  aligned_end = end & -4 | 0; //@line 13575
  block_aligned_end = aligned_end - 64 | 0; //@line 13576
  value4 = value | value << 8 | value << 16 | value << 24; //@line 13577
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13580
   HEAP32[ptr + 4 >> 2] = value4; //@line 13581
   HEAP32[ptr + 8 >> 2] = value4; //@line 13582
   HEAP32[ptr + 12 >> 2] = value4; //@line 13583
   HEAP32[ptr + 16 >> 2] = value4; //@line 13584
   HEAP32[ptr + 20 >> 2] = value4; //@line 13585
   HEAP32[ptr + 24 >> 2] = value4; //@line 13586
   HEAP32[ptr + 28 >> 2] = value4; //@line 13587
   HEAP32[ptr + 32 >> 2] = value4; //@line 13588
   HEAP32[ptr + 36 >> 2] = value4; //@line 13589
   HEAP32[ptr + 40 >> 2] = value4; //@line 13590
   HEAP32[ptr + 44 >> 2] = value4; //@line 13591
   HEAP32[ptr + 48 >> 2] = value4; //@line 13592
   HEAP32[ptr + 52 >> 2] = value4; //@line 13593
   HEAP32[ptr + 56 >> 2] = value4; //@line 13594
   HEAP32[ptr + 60 >> 2] = value4; //@line 13595
   ptr = ptr + 64 | 0; //@line 13596
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13600
   ptr = ptr + 4 | 0; //@line 13601
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 13606
  ptr = ptr + 1 | 0; //@line 13607
 }
 return end - num | 0; //@line 13609
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12022
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12032
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12032
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12032
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 12036
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 12039
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 12042
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 12050
  } else {
   $20 = 0; //@line 12052
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 12062
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 12066
  HEAP32[___async_retval >> 2] = $$1; //@line 12068
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12071
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 12072
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 12076
  ___async_unwind = 0; //@line 12077
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 12079
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 12081
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 12083
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 12085
 sp = STACKTOP; //@line 12086
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12436
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12438
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12440
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12442
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 12447
  } else {
   $9 = $4 + 4 | 0; //@line 12449
   $10 = HEAP32[$9 >> 2] | 0; //@line 12450
   $11 = $4 + 8 | 0; //@line 12451
   $12 = HEAP32[$11 >> 2] | 0; //@line 12452
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 12456
    HEAP32[$6 >> 2] = 0; //@line 12457
    HEAP32[$2 >> 2] = 0; //@line 12458
    HEAP32[$11 >> 2] = 0; //@line 12459
    HEAP32[$9 >> 2] = 0; //@line 12460
    $$0 = 0; //@line 12461
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 12468
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12469
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 12470
   if (!___async) {
    ___async_unwind = 0; //@line 12473
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 57; //@line 12475
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 12477
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 12479
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 12481
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 12483
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 12485
   sp = STACKTOP; //@line 12486
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12491
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_20($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12322
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12324
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12326
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12328
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12330
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 12335
  return;
 }
 dest = $2 + 4 | 0; //@line 12339
 stop = dest + 52 | 0; //@line 12339
 do {
  HEAP32[dest >> 2] = 0; //@line 12339
  dest = dest + 4 | 0; //@line 12339
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 12340
 HEAP32[$2 + 8 >> 2] = $4; //@line 12342
 HEAP32[$2 + 12 >> 2] = -1; //@line 12344
 HEAP32[$2 + 48 >> 2] = 1; //@line 12346
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 12349
 $16 = HEAP32[$6 >> 2] | 0; //@line 12350
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12351
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 12352
 if (!___async) {
  ___async_unwind = 0; //@line 12355
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 12357
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12359
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 12361
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 12363
 sp = STACKTOP; //@line 12364
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 8704
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 8709
    $$0 = 1; //@line 8710
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 8723
     $$0 = 1; //@line 8724
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8728
     $$0 = -1; //@line 8729
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 8739
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 8743
    $$0 = 2; //@line 8744
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 8756
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 8762
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 8766
    $$0 = 3; //@line 8767
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 8777
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 8783
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 8789
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 8793
    $$0 = 4; //@line 8794
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8798
    $$0 = -1; //@line 8799
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8804
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 7588
  $8 = $0; //@line 7588
  $9 = $1; //@line 7588
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7590
   $$0914 = $$0914 + -1 | 0; //@line 7594
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 7595
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7596
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 7604
   }
  }
  $$010$lcssa$off0 = $8; //@line 7609
  $$09$lcssa = $$0914; //@line 7609
 } else {
  $$010$lcssa$off0 = $0; //@line 7611
  $$09$lcssa = $2; //@line 7611
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 7615
 } else {
  $$012 = $$010$lcssa$off0; //@line 7617
  $$111 = $$09$lcssa; //@line 7617
  while (1) {
   $26 = $$111 + -1 | 0; //@line 7622
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 7623
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 7627
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 7630
    $$111 = $26; //@line 7630
   }
  }
 }
 return $$1$lcssa | 0; //@line 7634
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 5090
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5095
   label = 4; //@line 5096
  } else {
   $$01519 = $0; //@line 5098
   $23 = $1; //@line 5098
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5103
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5106
    $23 = $6; //@line 5107
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 5111
     label = 4; //@line 5112
     break;
    } else {
     $$01519 = $6; //@line 5115
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 5121
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 5123
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 5131
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 5139
  } else {
   $$pn = $$0; //@line 5141
   while (1) {
    $19 = $$pn + 1 | 0; //@line 5143
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 5147
     break;
    } else {
     $$pn = $19; //@line 5150
    }
   }
  }
  $$sink = $$1$lcssa; //@line 5155
 }
 return $$sink - $1 | 0; //@line 5158
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 9998
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10005
   $10 = $1 + 16 | 0; //@line 10006
   $11 = HEAP32[$10 >> 2] | 0; //@line 10007
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10010
    HEAP32[$1 + 24 >> 2] = $4; //@line 10012
    HEAP32[$1 + 36 >> 2] = 1; //@line 10014
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10024
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10029
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10032
    HEAP8[$1 + 54 >> 0] = 1; //@line 10034
    break;
   }
   $21 = $1 + 24 | 0; //@line 10037
   $22 = HEAP32[$21 >> 2] | 0; //@line 10038
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10041
    $28 = $4; //@line 10042
   } else {
    $28 = $22; //@line 10044
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10053
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_9($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11595
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11597
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11599
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11601
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 11606
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11608
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 11613
 $16 = _snprintf($4, $6, 1025, $2) | 0; //@line 11614
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 11616
 $19 = $4 + $$18 | 0; //@line 11618
 $20 = $6 - $$18 | 0; //@line 11619
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1103, $12) | 0; //@line 11627
  }
 }
 $23 = HEAP32[35] | 0; //@line 11630
 $24 = HEAP32[28] | 0; //@line 11631
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11632
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 11633
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11636
  sp = STACKTOP; //@line 11637
  return;
 }
 ___async_unwind = 0; //@line 11640
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11641
 sp = STACKTOP; //@line 11642
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9653
 $1 = HEAP32[40] | 0; //@line 9654
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9660
 } else {
  $19 = 0; //@line 9662
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9668
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9674
    $12 = HEAP32[$11 >> 2] | 0; //@line 9675
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9681
     HEAP8[$12 >> 0] = 10; //@line 9682
     $22 = 0; //@line 9683
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9687
   $17 = ___overflow($1, 10) | 0; //@line 9688
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 61; //@line 9691
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9693
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9695
    sp = STACKTOP; //@line 9696
    return 0; //@line 9697
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9699
    $22 = $17 >> 31; //@line 9701
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9708
 }
 return $22 | 0; //@line 9710
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12375
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12377
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12379
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12383
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 12387
  label = 4; //@line 12388
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 12393
   label = 4; //@line 12394
  } else {
   $$037$off039 = 3; //@line 12396
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 12400
  $17 = $8 + 40 | 0; //@line 12401
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 12404
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 12414
    $$037$off039 = $$037$off038; //@line 12415
   } else {
    $$037$off039 = $$037$off038; //@line 12417
   }
  } else {
   $$037$off039 = $$037$off038; //@line 12420
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 12423
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9857
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 9866
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 9871
      HEAP32[$13 >> 2] = $2; //@line 9872
      $19 = $1 + 40 | 0; //@line 9873
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 9876
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9886
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 9890
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 9897
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
 $$016 = 0; //@line 8824
 while (1) {
  if ((HEAPU8[1967 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 8831
   break;
  }
  $7 = $$016 + 1 | 0; //@line 8834
  if (($7 | 0) == 87) {
   $$01214 = 2055; //@line 8837
   $$115 = 87; //@line 8837
   label = 5; //@line 8838
   break;
  } else {
   $$016 = $7; //@line 8841
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2055; //@line 8847
  } else {
   $$01214 = 2055; //@line 8849
   $$115 = $$016; //@line 8849
   label = 5; //@line 8850
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 8855
   $$113 = $$01214; //@line 8856
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 8860
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 8867
   if (!$$115) {
    $$012$lcssa = $$113; //@line 8870
    break;
   } else {
    $$01214 = $$113; //@line 8873
    label = 5; //@line 8874
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 8881
}
function _main() {
 var $0 = 0, $AsyncCtx = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 1638
 STACKTOP = STACKTOP + 48 | 0; //@line 1639
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 1639
 $vararg_buffer7 = sp + 32 | 0; //@line 1640
 _mbed_trace_init() | 0; //@line 1645
 _mbed_tracef(16, 1333, 1338, sp); //@line 1646
 _mbed_tracef(8, 1333, 1356, sp + 8 | 0); //@line 1647
 _mbed_tracef(4, 1333, 1373, sp + 16 | 0); //@line 1648
 _mbed_tracef(2, 1333, 1393, sp + 24 | 0); //@line 1649
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1650
 $0 = _mbed_trace_array(1411, 3) | 0; //@line 1651
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 1654
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer7; //@line 1656
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer7; //@line 1658
  sp = STACKTOP; //@line 1659
  STACKTOP = sp; //@line 1660
  return 0; //@line 1660
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1662
  HEAP32[$vararg_buffer7 >> 2] = $0; //@line 1663
  _mbed_tracef(16, 1333, 1414, $vararg_buffer7); //@line 1664
  STACKTOP = sp; //@line 1665
  return 0; //@line 1665
 }
 return 0; //@line 1667
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 8897
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 8901
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 8904
   if (!$5) {
    $$0 = 0; //@line 8907
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 8913
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 8919
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 8926
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 8933
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 8940
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 8947
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 8954
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 8958
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8968
}
function _mbed_vtracef__async_cb_15($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11980
 $3 = HEAP32[36] | 0; //@line 11984
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[28] | 0; //@line 11988
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11989
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 11990
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 11993
   sp = STACKTOP; //@line 11994
   return;
  }
  ___async_unwind = 0; //@line 11997
  HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 11998
  sp = STACKTOP; //@line 11999
  return;
 } else {
  $6 = HEAP32[35] | 0; //@line 12002
  $7 = HEAP32[28] | 0; //@line 12003
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 12004
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 12005
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 12008
   sp = STACKTOP; //@line 12009
   return;
  }
  ___async_unwind = 0; //@line 12012
  HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 12013
  sp = STACKTOP; //@line 12014
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 9093
 $32 = $0 + 3 | 0; //@line 9107
 $33 = HEAP8[$32 >> 0] | 0; //@line 9108
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 9110
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 9115
  $$sink21$lcssa = $32; //@line 9115
 } else {
  $$sink2123 = $32; //@line 9117
  $39 = $35; //@line 9117
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 9120
   $41 = HEAP8[$40 >> 0] | 0; //@line 9121
   $39 = $39 << 8 | $41 & 255; //@line 9123
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 9128
    $$sink21$lcssa = $40; //@line 9128
    break;
   } else {
    $$sink2123 = $40; //@line 9131
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 9138
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1568
 $2 = $0 + 12 | 0; //@line 1570
 $3 = HEAP32[$2 >> 2] | 0; //@line 1571
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1575
   _mbed_assert_internal(1244, 1249, 528); //@line 1576
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 45; //@line 1579
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1581
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1583
    sp = STACKTOP; //@line 1584
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1587
    $8 = HEAP32[$2 >> 2] | 0; //@line 1589
    break;
   }
  } else {
   $8 = $3; //@line 1593
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1596
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1598
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1599
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 46; //@line 1602
  sp = STACKTOP; //@line 1603
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1606
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 9027
 $23 = $0 + 2 | 0; //@line 9036
 $24 = HEAP8[$23 >> 0] | 0; //@line 9037
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 9040
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 9045
  $$lcssa = $24; //@line 9045
 } else {
  $$01618 = $23; //@line 9047
  $$019 = $27; //@line 9047
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 9049
   $31 = HEAP8[$30 >> 0] | 0; //@line 9050
   $$019 = ($$019 | $31 & 255) << 8; //@line 9053
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 9058
    $$lcssa = $31; //@line 9058
    break;
   } else {
    $$01618 = $30; //@line 9061
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 9068
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10421
 STACKTOP = STACKTOP + 16 | 0; //@line 10422
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10422
 $3 = sp; //@line 10423
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 10425
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 10428
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10429
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 10430
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 10433
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10435
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10437
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10439
  sp = STACKTOP; //@line 10440
  STACKTOP = sp; //@line 10441
  return 0; //@line 10441
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10443
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 10447
 }
 STACKTOP = sp; //@line 10449
 return $8 & 1 | 0; //@line 10449
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8655
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8655
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8656
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 8657
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 8666
    $$016 = $9; //@line 8669
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 8669
   } else {
    $$016 = $0; //@line 8671
    $storemerge = 0; //@line 8671
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 8673
   $$0 = $$016; //@line 8674
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 8678
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 8684
   HEAP32[tempDoublePtr >> 2] = $2; //@line 8687
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 8687
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 8688
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13104
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13112
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13114
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13116
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13118
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13120
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13122
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13124
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 13135
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 13136
 HEAP32[$10 >> 2] = 0; //@line 13137
 HEAP32[$12 >> 2] = 0; //@line 13138
 HEAP32[$14 >> 2] = 0; //@line 13139
 HEAP32[$2 >> 2] = 0; //@line 13140
 $33 = HEAP32[$16 >> 2] | 0; //@line 13141
 HEAP32[$16 >> 2] = $33 | $18; //@line 13146
 if ($20 | 0) {
  ___unlockfile($22); //@line 13149
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 13152
 return;
}
function _mbed_vtracef__async_cb_12($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11711
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11715
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 11720
 $$pre = HEAP32[38] | 0; //@line 11721
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 11722
 FUNCTION_TABLE_v[$$pre & 0](); //@line 11723
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11726
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 11727
  HEAP32[$6 >> 2] = $4; //@line 11728
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 11729
  HEAP32[$7 >> 2] = $5; //@line 11730
  sp = STACKTOP; //@line 11731
  return;
 }
 ___async_unwind = 0; //@line 11734
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11735
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 11736
 HEAP32[$6 >> 2] = $4; //@line 11737
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 11738
 HEAP32[$7 >> 2] = $5; //@line 11739
 sp = STACKTOP; //@line 11740
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
 sp = STACKTOP; //@line 10213
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10219
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10222
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10225
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10226
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10227
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 66; //@line 10230
    sp = STACKTOP; //@line 10231
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10234
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11678
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11680
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 11685
 $$pre = HEAP32[38] | 0; //@line 11686
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 11687
 FUNCTION_TABLE_v[$$pre & 0](); //@line 11688
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11691
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 11692
  HEAP32[$5 >> 2] = $2; //@line 11693
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 11694
  HEAP32[$6 >> 2] = $4; //@line 11695
  sp = STACKTOP; //@line 11696
  return;
 }
 ___async_unwind = 0; //@line 11699
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11700
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 11701
 HEAP32[$5 >> 2] = $2; //@line 11702
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 11703
 HEAP32[$6 >> 2] = $4; //@line 11704
 sp = STACKTOP; //@line 11705
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10382
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10388
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10391
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10394
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10395
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10396
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 69; //@line 10399
    sp = STACKTOP; //@line 10400
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10403
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_error_vfprintf__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10698
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 10700
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10702
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10704
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10706
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10708
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10710
 _serial_putc(4052, $2 << 24 >> 24); //@line 10711
 if (!___async) {
  ___async_unwind = 0; //@line 10714
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 10716
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 10718
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 10720
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 10722
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 10724
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 10726
 sp = STACKTOP; //@line 10727
 return;
}
function ___dynamic_cast__async_cb_4($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10784
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10786
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10788
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10794
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 10809
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 10825
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 10830
    break;
   }
  default:
   {
    $$0 = 0; //@line 10834
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 10839
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 7653
 STACKTOP = STACKTOP + 256 | 0; //@line 7654
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 7654
 $5 = sp; //@line 7655
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 7661
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 7665
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 7668
   $$011 = $9; //@line 7669
   do {
    _out_670($0, $5, 256); //@line 7671
    $$011 = $$011 + -256 | 0; //@line 7672
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 7681
  } else {
   $$0$lcssa = $9; //@line 7683
  }
  _out_670($0, $5, $$0$lcssa); //@line 7685
 }
 STACKTOP = sp; //@line 7687
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4948
 STACKTOP = STACKTOP + 32 | 0; //@line 4949
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4949
 $vararg_buffer = sp; //@line 4950
 $3 = sp + 20 | 0; //@line 4951
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4955
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4957
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4959
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4961
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4963
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4968
  $10 = -1; //@line 4969
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4972
 }
 STACKTOP = sp; //@line 4974
 return $10 | 0; //@line 4974
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1043
 STACKTOP = STACKTOP + 16 | 0; //@line 1044
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1044
 $vararg_buffer = sp; //@line 1045
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1046
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1048
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1050
 _mbed_error_printf(1121, $vararg_buffer); //@line 1051
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1052
 _mbed_die(); //@line 1053
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 22; //@line 1056
  sp = STACKTOP; //@line 1057
  STACKTOP = sp; //@line 1058
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1060
  STACKTOP = sp; //@line 1061
  return;
 }
}
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11648
 HEAP32[32] = HEAP32[30]; //@line 11650
 $2 = HEAP32[38] | 0; //@line 11651
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11656
 HEAP32[39] = 0; //@line 11657
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11658
 FUNCTION_TABLE_v[$2 & 0](); //@line 11659
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11662
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11663
  HEAP32[$5 >> 2] = $4; //@line 11664
  sp = STACKTOP; //@line 11665
  return;
 }
 ___async_unwind = 0; //@line 11668
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11669
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11670
 HEAP32[$5 >> 2] = $4; //@line 11671
 sp = STACKTOP; //@line 11672
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9532
 STACKTOP = STACKTOP + 16 | 0; //@line 9533
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9533
 $3 = sp; //@line 9534
 HEAP32[$3 >> 2] = $varargs; //@line 9535
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9536
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 9537
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 9540
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9542
  sp = STACKTOP; //@line 9543
  STACKTOP = sp; //@line 9544
  return 0; //@line 9544
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9546
  STACKTOP = sp; //@line 9547
  return $4 | 0; //@line 9547
 }
 return 0; //@line 9549
}
function _mbed_vtracef__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11384
 HEAP32[32] = HEAP32[30]; //@line 11386
 $2 = HEAP32[38] | 0; //@line 11387
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11392
 HEAP32[39] = 0; //@line 11393
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11394
 FUNCTION_TABLE_v[$2 & 0](); //@line 11395
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11398
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11399
  HEAP32[$5 >> 2] = $4; //@line 11400
  sp = STACKTOP; //@line 11401
  return;
 }
 ___async_unwind = 0; //@line 11404
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11405
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11406
 HEAP32[$5 >> 2] = $4; //@line 11407
 sp = STACKTOP; //@line 11408
 return;
}
function _mbed_vtracef__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11354
 HEAP32[32] = HEAP32[30]; //@line 11356
 $2 = HEAP32[38] | 0; //@line 11357
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11362
 HEAP32[39] = 0; //@line 11363
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11364
 FUNCTION_TABLE_v[$2 & 0](); //@line 11365
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11368
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11369
  HEAP32[$5 >> 2] = $4; //@line 11370
  sp = STACKTOP; //@line 11371
  return;
 }
 ___async_unwind = 0; //@line 11374
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11375
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11376
 HEAP32[$5 >> 2] = $4; //@line 11377
 sp = STACKTOP; //@line 11378
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 9935
 $5 = HEAP32[$4 >> 2] | 0; //@line 9936
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 9940
   HEAP32[$1 + 24 >> 2] = $3; //@line 9942
   HEAP32[$1 + 36 >> 2] = 1; //@line 9944
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 9948
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 9951
    HEAP32[$1 + 24 >> 2] = 2; //@line 9953
    HEAP8[$1 + 54 >> 0] = 1; //@line 9955
    break;
   }
   $10 = $1 + 24 | 0; //@line 9958
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 9962
   }
  }
 } while (0);
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5055
 $3 = HEAP8[$1 >> 0] | 0; //@line 5056
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5061
  $$lcssa8 = $2; //@line 5061
 } else {
  $$011 = $1; //@line 5063
  $$0710 = $0; //@line 5063
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5065
   $$011 = $$011 + 1 | 0; //@line 5066
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5067
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5068
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5073
  $$lcssa8 = $8; //@line 5073
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5083
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1540
 $2 = HEAP32[40] | 0; //@line 1541
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1542
 _putc($1, $2) | 0; //@line 1543
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 43; //@line 1546
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1548
  sp = STACKTOP; //@line 1549
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1552
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1553
 _fflush($2) | 0; //@line 1554
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 1557
  sp = STACKTOP; //@line 1558
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1561
  return;
 }
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 12896
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12898
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12900
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 12901
 _wait_ms(150); //@line 12902
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 24; //@line 12905
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12906
  HEAP32[$4 >> 2] = $2; //@line 12907
  sp = STACKTOP; //@line 12908
  return;
 }
 ___async_unwind = 0; //@line 12911
 HEAP32[$ReallocAsyncCtx15 >> 2] = 24; //@line 12912
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12913
 HEAP32[$4 >> 2] = $2; //@line 12914
 sp = STACKTOP; //@line 12915
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 12871
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12873
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12875
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 12876
 _wait_ms(150); //@line 12877
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 25; //@line 12880
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12881
  HEAP32[$4 >> 2] = $2; //@line 12882
  sp = STACKTOP; //@line 12883
  return;
 }
 ___async_unwind = 0; //@line 12886
 HEAP32[$ReallocAsyncCtx14 >> 2] = 25; //@line 12887
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12888
 HEAP32[$4 >> 2] = $2; //@line 12889
 sp = STACKTOP; //@line 12890
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 12846
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12848
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12850
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 12851
 _wait_ms(150); //@line 12852
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 26; //@line 12855
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12856
  HEAP32[$4 >> 2] = $2; //@line 12857
  sp = STACKTOP; //@line 12858
  return;
 }
 ___async_unwind = 0; //@line 12861
 HEAP32[$ReallocAsyncCtx13 >> 2] = 26; //@line 12862
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12863
 HEAP32[$4 >> 2] = $2; //@line 12864
 sp = STACKTOP; //@line 12865
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 12821
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12823
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12825
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 12826
 _wait_ms(150); //@line 12827
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 27; //@line 12830
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12831
  HEAP32[$4 >> 2] = $2; //@line 12832
  sp = STACKTOP; //@line 12833
  return;
 }
 ___async_unwind = 0; //@line 12836
 HEAP32[$ReallocAsyncCtx12 >> 2] = 27; //@line 12837
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12838
 HEAP32[$4 >> 2] = $2; //@line 12839
 sp = STACKTOP; //@line 12840
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 12796
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12798
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12800
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 12801
 _wait_ms(150); //@line 12802
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 28; //@line 12805
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12806
  HEAP32[$4 >> 2] = $2; //@line 12807
  sp = STACKTOP; //@line 12808
  return;
 }
 ___async_unwind = 0; //@line 12811
 HEAP32[$ReallocAsyncCtx11 >> 2] = 28; //@line 12812
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12813
 HEAP32[$4 >> 2] = $2; //@line 12814
 sp = STACKTOP; //@line 12815
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 12771
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12773
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12775
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 12776
 _wait_ms(150); //@line 12777
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 29; //@line 12780
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12781
  HEAP32[$4 >> 2] = $2; //@line 12782
  sp = STACKTOP; //@line 12783
  return;
 }
 ___async_unwind = 0; //@line 12786
 HEAP32[$ReallocAsyncCtx10 >> 2] = 29; //@line 12787
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12788
 HEAP32[$4 >> 2] = $2; //@line 12789
 sp = STACKTOP; //@line 12790
 return;
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 9497
  } else {
   $$01318 = $0; //@line 9499
   $$01417 = $2; //@line 9499
   $$019 = $1; //@line 9499
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 9501
    $5 = HEAP8[$$019 >> 0] | 0; //@line 9502
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 9507
    if (!$$01417) {
     $14 = 0; //@line 9512
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 9515
     $$019 = $$019 + 1 | 0; //@line 9515
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 9521
  }
 } while (0);
 return $14 | 0; //@line 9524
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 12521
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12523
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12525
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 12526
 _wait_ms(150); //@line 12527
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 23; //@line 12530
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12531
  HEAP32[$4 >> 2] = $2; //@line 12532
  sp = STACKTOP; //@line 12533
  return;
 }
 ___async_unwind = 0; //@line 12536
 HEAP32[$ReallocAsyncCtx16 >> 2] = 23; //@line 12537
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12538
 HEAP32[$4 >> 2] = $2; //@line 12539
 sp = STACKTOP; //@line 12540
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5007
 STACKTOP = STACKTOP + 32 | 0; //@line 5008
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5008
 $vararg_buffer = sp; //@line 5009
 HEAP32[$0 + 36 >> 2] = 5; //@line 5012
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5020
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5022
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5024
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5029
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5032
 STACKTOP = sp; //@line 5033
 return $14 | 0; //@line 5033
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12746
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12748
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12750
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 12751
 _wait_ms(150); //@line 12752
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 30; //@line 12755
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 12756
  HEAP32[$4 >> 2] = $2; //@line 12757
  sp = STACKTOP; //@line 12758
  return;
 }
 ___async_unwind = 0; //@line 12761
 HEAP32[$ReallocAsyncCtx9 >> 2] = 30; //@line 12762
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 12763
 HEAP32[$4 >> 2] = $2; //@line 12764
 sp = STACKTOP; //@line 12765
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12721
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12723
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12725
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12726
 _wait_ms(400); //@line 12727
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 31; //@line 12730
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 12731
  HEAP32[$4 >> 2] = $2; //@line 12732
  sp = STACKTOP; //@line 12733
  return;
 }
 ___async_unwind = 0; //@line 12736
 HEAP32[$ReallocAsyncCtx8 >> 2] = 31; //@line 12737
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 12738
 HEAP32[$4 >> 2] = $2; //@line 12739
 sp = STACKTOP; //@line 12740
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12696
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12698
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12700
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 12701
 _wait_ms(400); //@line 12702
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 32; //@line 12705
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 12706
  HEAP32[$4 >> 2] = $2; //@line 12707
  sp = STACKTOP; //@line 12708
  return;
 }
 ___async_unwind = 0; //@line 12711
 HEAP32[$ReallocAsyncCtx7 >> 2] = 32; //@line 12712
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 12713
 HEAP32[$4 >> 2] = $2; //@line 12714
 sp = STACKTOP; //@line 12715
 return;
}
function _mbed_die__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12671
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12673
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12675
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 12676
 _wait_ms(400); //@line 12677
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 33; //@line 12680
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 12681
  HEAP32[$4 >> 2] = $2; //@line 12682
  sp = STACKTOP; //@line 12683
  return;
 }
 ___async_unwind = 0; //@line 12686
 HEAP32[$ReallocAsyncCtx6 >> 2] = 33; //@line 12687
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 12688
 HEAP32[$4 >> 2] = $2; //@line 12689
 sp = STACKTOP; //@line 12690
 return;
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12646
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12648
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12650
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 12651
 _wait_ms(400); //@line 12652
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 12655
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 12656
  HEAP32[$4 >> 2] = $2; //@line 12657
  sp = STACKTOP; //@line 12658
  return;
 }
 ___async_unwind = 0; //@line 12661
 HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 12662
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 12663
 HEAP32[$4 >> 2] = $2; //@line 12664
 sp = STACKTOP; //@line 12665
 return;
}
function _mbed_die__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12621
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12623
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12625
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 12626
 _wait_ms(400); //@line 12627
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 35; //@line 12630
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 12631
  HEAP32[$4 >> 2] = $2; //@line 12632
  sp = STACKTOP; //@line 12633
  return;
 }
 ___async_unwind = 0; //@line 12636
 HEAP32[$ReallocAsyncCtx4 >> 2] = 35; //@line 12637
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 12638
 HEAP32[$4 >> 2] = $2; //@line 12639
 sp = STACKTOP; //@line 12640
 return;
}
function _mbed_die__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12596
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12598
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12600
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 12601
 _wait_ms(400); //@line 12602
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 36; //@line 12605
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 12606
  HEAP32[$4 >> 2] = $2; //@line 12607
  sp = STACKTOP; //@line 12608
  return;
 }
 ___async_unwind = 0; //@line 12611
 HEAP32[$ReallocAsyncCtx3 >> 2] = 36; //@line 12612
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 12613
 HEAP32[$4 >> 2] = $2; //@line 12614
 sp = STACKTOP; //@line 12615
 return;
}
function _mbed_die__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12571
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12573
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12575
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12576
 _wait_ms(400); //@line 12577
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 12580
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12581
  HEAP32[$4 >> 2] = $2; //@line 12582
  sp = STACKTOP; //@line 12583
  return;
 }
 ___async_unwind = 0; //@line 12586
 HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 12587
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12588
 HEAP32[$4 >> 2] = $2; //@line 12589
 sp = STACKTOP; //@line 12590
 return;
}
function _mbed_die__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12546
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12548
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12550
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 12551
 _wait_ms(400); //@line 12552
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 12555
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 12556
  HEAP32[$4 >> 2] = $2; //@line 12557
  sp = STACKTOP; //@line 12558
  return;
 }
 ___async_unwind = 0; //@line 12561
 HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 12562
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 12563
 HEAP32[$4 >> 2] = $2; //@line 12564
 sp = STACKTOP; //@line 12565
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 247
 STACKTOP = STACKTOP + 16 | 0; //@line 248
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 248
 $3 = sp; //@line 249
 HEAP32[$3 >> 2] = $varargs; //@line 250
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 251
 _mbed_vtracef($0, $1, $2, $3); //@line 252
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 8; //@line 255
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 257
  sp = STACKTOP; //@line 258
  STACKTOP = sp; //@line 259
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 261
  STACKTOP = sp; //@line 262
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1371
 STACKTOP = STACKTOP + 16 | 0; //@line 1372
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1372
 $1 = sp; //@line 1373
 HEAP32[$1 >> 2] = $varargs; //@line 1374
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1375
 _mbed_error_vfprintf($0, $1); //@line 1376
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 1379
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1381
  sp = STACKTOP; //@line 1382
  STACKTOP = sp; //@line 1383
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1385
  STACKTOP = sp; //@line 1386
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 13617
 newDynamicTop = oldDynamicTop + increment | 0; //@line 13618
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 13622
  ___setErrNo(12); //@line 13623
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 13627
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 13631
   ___setErrNo(12); //@line 13632
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 13636
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 5178
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 5180
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5186
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5187
  if ($phitmp) {
   $13 = $11; //@line 5189
  } else {
   ___unlockfile($3); //@line 5191
   $13 = $11; //@line 5192
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5196
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5200
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5203
 }
 return $15 | 0; //@line 5205
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7514
 } else {
  $$056 = $2; //@line 7516
  $15 = $1; //@line 7516
  $8 = $0; //@line 7516
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7524
   HEAP8[$14 >> 0] = HEAPU8[1949 + ($8 & 15) >> 0] | 0 | $3; //@line 7525
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7526
   $15 = tempRet0; //@line 7527
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7532
    break;
   } else {
    $$056 = $14; //@line 7535
   }
  }
 }
 return $$05$lcssa | 0; //@line 7539
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 5395
 $3 = HEAP8[$1 >> 0] | 0; //@line 5397
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 5401
 $7 = HEAP32[$0 >> 2] | 0; //@line 5402
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 5407
  HEAP32[$0 + 4 >> 2] = 0; //@line 5409
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 5411
  HEAP32[$0 + 28 >> 2] = $14; //@line 5413
  HEAP32[$0 + 20 >> 2] = $14; //@line 5415
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5421
  $$0 = 0; //@line 5422
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 5425
  $$0 = -1; //@line 5426
 }
 return $$0 | 0; //@line 5428
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 8982
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 8985
 $$sink17$sink = $0; //@line 8985
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 8987
  $12 = HEAP8[$11 >> 0] | 0; //@line 8988
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 8996
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 9001
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 9006
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7551
 } else {
  $$06 = $2; //@line 7553
  $11 = $1; //@line 7553
  $7 = $0; //@line 7553
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7558
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7559
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7560
   $11 = tempRet0; //@line 7561
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 7566
    break;
   } else {
    $$06 = $10; //@line 7569
   }
  }
 }
 return $$0$lcssa | 0; //@line 7573
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10454
 do {
  if (!$0) {
   $3 = 0; //@line 10458
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10460
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 10461
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 71; //@line 10464
    sp = STACKTOP; //@line 10465
    return 0; //@line 10466
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10468
    $3 = ($2 | 0) != 0 & 1; //@line 10471
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 10476
}
function _invoke_ticker__async_cb_1($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10487
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 10493
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 10494
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 10495
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 10496
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 10499
  sp = STACKTOP; //@line 10500
  return;
 }
 ___async_unwind = 0; //@line 10503
 HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 10504
 sp = STACKTOP; //@line 10505
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7195
 } else {
  $$04 = 0; //@line 7197
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7200
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7204
   $12 = $7 + 1 | 0; //@line 7205
   HEAP32[$0 >> 2] = $12; //@line 7206
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7212
    break;
   } else {
    $$04 = $11; //@line 7215
   }
  }
 }
 return $$0$lcssa | 0; //@line 7219
}
function ___fflush_unlocked__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12501
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12503
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12505
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12507
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 12509
 HEAP32[$4 >> 2] = 0; //@line 12510
 HEAP32[$6 >> 2] = 0; //@line 12511
 HEAP32[$8 >> 2] = 0; //@line 12512
 HEAP32[$10 >> 2] = 0; //@line 12513
 HEAP32[___async_retval >> 2] = 0; //@line 12515
 return;
}
function _mbed_vtracef__async_cb_5($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11336
 $1 = HEAP32[36] | 0; //@line 11337
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 11338
 FUNCTION_TABLE_vi[$1 & 127](993); //@line 11339
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 11342
  sp = STACKTOP; //@line 11343
  return;
 }
 ___async_unwind = 0; //@line 11346
 HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 11347
 sp = STACKTOP; //@line 11348
 return;
}
function _serial_putc__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13073
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13075
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 13076
 _fflush($2) | 0; //@line 13077
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 44; //@line 13080
  sp = STACKTOP; //@line 13081
  return;
 }
 ___async_unwind = 0; //@line 13084
 HEAP32[$ReallocAsyncCtx >> 2] = 44; //@line 13085
 sp = STACKTOP; //@line 13086
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 13468
 ___async_unwind = 1; //@line 13469
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 13475
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 13479
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 13483
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13485
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4818
 STACKTOP = STACKTOP + 16 | 0; //@line 4819
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4819
 $vararg_buffer = sp; //@line 4820
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4824
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4826
 STACKTOP = sp; //@line 4827
 return $5 | 0; //@line 4827
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 13410
 STACKTOP = STACKTOP + 16 | 0; //@line 13411
 $rem = __stackBase__ | 0; //@line 13412
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 13413
 STACKTOP = __stackBase__; //@line 13414
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 13415
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 13180
 if ((ret | 0) < 8) return ret | 0; //@line 13181
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 13182
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 13183
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 13184
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 13185
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 13186
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9839
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 9637
 $6 = HEAP32[$5 >> 2] | 0; //@line 9638
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 9639
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 9641
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 9643
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 9646
 return $2 | 0; //@line 9647
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12297
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 12308
  $$0 = 1; //@line 12309
 } else {
  $$0 = 0; //@line 12311
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 12315
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13036
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 13039
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 13044
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13047
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1519
 HEAP32[$0 >> 2] = $1; //@line 1520
 HEAP32[1012] = 1; //@line 1521
 $4 = $0; //@line 1522
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1527
 $10 = 4052; //@line 1528
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1530
 HEAP32[$10 + 4 >> 2] = $9; //@line 1533
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9915
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1623
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1624
 _emscripten_sleep($0 | 0); //@line 1625
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 1628
  sp = STACKTOP; //@line 1629
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1632
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 228
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 229
 _puts($0) | 0; //@line 230
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 233
  sp = STACKTOP; //@line 234
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 237
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
  $7 = $1 + 28 | 0; //@line 9979
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 9983
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 13444
 HEAP32[new_frame + 4 >> 2] = sp; //@line 13446
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 13448
 ___async_cur_frame = new_frame; //@line 13449
 return ___async_cur_frame + 8 | 0; //@line 13450
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 12270
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 12274
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 12277
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 13433
  return low << bits; //@line 13434
 }
 tempRet0 = low << bits - 32; //@line 13436
 return 0; //@line 13437
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 13422
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 13423
 }
 tempRet0 = 0; //@line 13425
 return high >>> bits - 32 | 0; //@line 13426
}
function _fflush__async_cb_16($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12099
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12101
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12104
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 12210
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12213
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 12216
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12247
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 12252
 _mbed_tracef(16, 1333, 1414, $2); //@line 12253
 HEAP32[___async_retval >> 2] = 0; //@line 12255
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 10742
 } else {
  $$0 = -1; //@line 10744
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 10747
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 5525
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 5531
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 5535
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 13692
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 13456
 stackRestore(___async_cur_frame | 0); //@line 13457
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13458
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12226
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 12227
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12229
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1495
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1501
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 1502
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8636
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8636
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8638
 return $1 | 0; //@line 8639
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 13173
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 13174
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 13175
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4984
  $$0 = -1; //@line 4985
 } else {
  $$0 = $0; //@line 4987
 }
 return $$0 | 0; //@line 4989
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 13165
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 13167
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 13685
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
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 13678
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 5670
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 5675
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 7696
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 7699
 }
 return $$0 | 0; //@line 7701
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 13657
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 13402
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 10770
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 5165
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 5169
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 13463
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 13464
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10201
 __ZdlPv($0); //@line 10202
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 5661
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 5663
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9729
 __ZdlPv($0); //@line 9730
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 12933
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
  ___fwritex($1, $2, $0) | 0; //@line 7181
 }
 return;
}
function b76(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 13900
}
function b75(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 13897
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 9926
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 13490
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b73(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 13894
}
function b72(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 13891
}
function _fflush__async_cb_17($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12114
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 7644
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12289
 return;
}
function _putc__async_cb_19($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12239
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 13650
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 13708
 return 0; //@line 13708
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 13705
 return 0; //@line 13705
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 13702
 return 0; //@line 13702
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 13671
}
function b70(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 13888
}
function b69(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 13885
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 8889
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 13643
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 13664
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5042
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 13699
 return 0; //@line 13699
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
 ___lock(4624); //@line 5680
 return 4632; //@line 5681
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
 return _pthread_self() | 0; //@line 8810
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 8816
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function b1() {
 nullFunc_i(0); //@line 13696
 return 0; //@line 13696
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9716
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
 ___unlock(4624); //@line 5686
 return;
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 13882
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 13879
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 13876
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 13873
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 13870
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 13867
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 13864
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 13861
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 13858
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 13855
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 13852
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 13849
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 13846
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 13843
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 13840
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 13837
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 13834
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 13831
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 13828
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 13825
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 13822
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(106); //@line 13819
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(105); //@line 13816
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(104); //@line 13813
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(103); //@line 13810
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(102); //@line 13807
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(101); //@line 13804
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(100); //@line 13801
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(99); //@line 13798
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(98); //@line 13795
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(97); //@line 13792
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(96); //@line 13789
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(95); //@line 13786
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(94); //@line 13783
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(93); //@line 13780
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(92); //@line 13777
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(91); //@line 13774
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(90); //@line 13771
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(89); //@line 13768
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(88); //@line 13765
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(87); //@line 13762
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(86); //@line 13759
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(85); //@line 13756
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(84); //@line 13753
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(83); //@line 13750
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(82); //@line 13747
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(81); //@line 13744
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(80); //@line 13741
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(79); //@line 13738
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(78); //@line 13735
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(77); //@line 13732
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(76); //@line 13729
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(75); //@line 13726
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(74); //@line 13723
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(73); //@line 13720
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(72); //@line 13717
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5000
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5317
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 13714
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
 return 4620; //@line 4994
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
 return 292; //@line 5047
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 13711
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_15,_mbed_vtracef__async_cb_5,_mbed_vtracef__async_cb_6,_mbed_vtracef__async_cb_7,_mbed_vtracef__async_cb_14,_mbed_vtracef__async_cb_8,_mbed_vtracef__async_cb_13,_mbed_vtracef__async_cb_9,_mbed_vtracef__async_cb_10,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_12,_mbed_trace_array__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32
,_mbed_die__async_cb_31,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb_28,_mbed_die__async_cb_27,_mbed_die__async_cb_26,_mbed_die__async_cb_25,_mbed_die__async_cb_24,_mbed_die__async_cb_23,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_3,_mbed_error_vfprintf__async_cb_2,_serial_putc__async_cb_38,_serial_putc__async_cb,_invoke_ticker__async_cb_1,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb,_putc__async_cb_19,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_17,_fflush__async_cb_16,_fflush__async_cb_18,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_22,_vfprintf__async_cb
,_snprintf__async_cb,_vsnprintf__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_20,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_4,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28
,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58
,b59,b60,b61,b62,b63,b64,b65,b66,b67];
var FUNCTION_TABLE_viiii = [b69,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b70];
var FUNCTION_TABLE_viiiii = [b72,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b73];
var FUNCTION_TABLE_viiiiii = [b75,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b76];

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
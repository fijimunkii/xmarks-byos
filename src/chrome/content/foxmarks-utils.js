/*
 forEach, version 1.0
 Copyright 2006, Dean Edwards
 License: http://www.opensource.org/licenses/mit-license.php
 */

// array-like enumeration
if (!Array.forEach) { // mozilla already supports this
    Array.forEach = function(array, block, context) {
        for (var i = 0; i < array.length; i++) {
            block.call(context, array[i], i, array);
        }
    };
}

// generic enumeration
Function.prototype.forEach = function(object, block, context) {
    for (var key in object) {
        if (typeof this.prototype[key] == "undefined") {
            block.call(context, object[key], key, object);
        }
    }
};

// character enumeration
String.forEach = function(string, block, context) {
    Array.forEach(string.split(""), function(chr, index) {
            block.call(context, chr, index, string);
        });
};

// globally resolve forEach enumeration
var forEach = function(object, block, context) {
    if (object) {
        var resolve = Object; // default
        if (object instanceof Function) {
            // functions have a "length" property
            resolve = Function;
        } else if (object.forEach instanceof Function) {
            // the object implements a custom forEach method so use that
            object.forEach(block, context);
            return;
        } else if (typeof object == "string") {
            // the object is a string
            resolve = String;
        } else if (typeof object.length == "number") {
            // the object is array-like
            resolve = Array;
        }
        resolve.forEach(object, block, context);
    }
};


/* function atob is:
 *
 * Copyright (c) 2007, David Lindquist <david.lindquist@gmail.com>
 * Released under the MIT license
 */


function My_atob(str) {
    var chars = 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var invalid = {
        strlen: (str.length % 4 != 0),
        chars:  new RegExp('[^' + chars + ']').test(str),
        equals: (/=/.test(str) && (/=[^=]/.test(str) || /={3}/.test(str)))
    };
    if (invalid.strlen || invalid.chars || invalid.equals)
        throw new Error('Invalid base64 data');
    var decoded = [];
    var c = 0;
    while (c < str.length) {
        var i0 = chars.indexOf(str.charAt(c++));
        var i1 = chars.indexOf(str.charAt(c++));
        var i2 = chars.indexOf(str.charAt(c++));
        var i3 = chars.indexOf(str.charAt(c++));
        var buf = (i0 << 18) + (i1 << 12) + ((i2 & 63) << 6) + (i3 & 63);
        var b0 = (buf & (255 << 16)) >> 16;
        var b1 = (i2 == 64) ? -1 : (buf & (255 << 8)) >> 8;
        var b2 = (i3 == 64) ? -1 : (buf & 255);
        decoded.push(b0);
        if (b1 >= 0) decoded.push(b1);
        if (b2 >= 0) decoded.push(b2);
    }
    return decoded;
}

function clone (deep) {
    var objectClone = new this.constructor();
    for (var property in this) {
        if (!this.hasOwnProperty(property))
            continue;
        if (deep && typeof this[property] == 'object' && this[property]) {
            objectClone[property] = this[property].clone(deep);
        } else {
            objectClone[property] = this[property];
        }
    }
    return objectClone;
}
Object.prototype.clone = clone;

/*
 
 Fron http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Objects:Array:indexOf

 indexOf is a JavaScript extension to the ECMA-262 standard; as such it may
 not be present in other implementations of the standard. You can work around 
 this by inserting the following code at the beginning of your scripts, 
 allowing use of indexOf in ECMA-262 implementations which do not natively 
 support it. This algorithm is exactly the one used in Firefox and 
 SpiderMonkey.

*/

if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function(elt /*, from*/) {
    var len = this.length;

    var from = Number(arguments[1]) || 0;
    from = (from < 0)
         ? Math.ceil(from)
         : Math.floor(from);
    if (from < 0)
      from += len;

    for (; from < len; from++) {
      if (from in this && this[from] === elt)
        return from;
    }
    return -1;
  };
}

if (!Array.prototype.filter) {
  Array.prototype.filter = function(fun /*, thisp*/) {
    var len = this.length;
    if (typeof fun != "function")
      throw new TypeError();

    var res = new Array();
    var thisp = arguments[1];
    for (var i = 0; i < len; i++) {
      if (i in this) {
        var val = this[i]; // in case fun mutates this
        if (fun.call(thisp, val, i, this))
          res.push(val);
      }
    }

    return res;
  };
}

function equals(a, b) {
    if (typeof a != typeof b)
        return false;
    if (typeof a != 'object')
        return a == b;
    if (a == b)
        return true;
    if (a.constructor == Array && b.constructor == Array) {
        if (a.length != b.length)
            return false;
        for (var i = 0; i < a.length; ++i) {
            if (a[i] != b[i])
                return false;
        }
        return true;
    } else {
        throw Error("can't compare non-Array objects");
    }
}


/**
*
*  Base64 encode / decode
*  http://www.webtoolkit.info/
*
**/

(function() {
var _Base64 = {

    // private property
    _keyStr : 
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

    // public method for encoding
    encode : function (input, isBinaryData) {
        var output = [];
        var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
        var i = 0;

        input = isBinaryData ? String.fromCharCode.apply(null, input) : 
            _Base64._utf8_encode(input);

        var len = input.length;
        while (i < len) {
            chr1 = input.charCodeAt(i++);
            chr2 = input.charCodeAt(i++);
            chr3 = input.charCodeAt(i++);
            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;
            if (isNaN(chr2)) {
                enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
                enc4 = 64;
            }
            output.push(
                this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4));
        }

        return output.join("");
    },

    // public method for decoding
    decode : function (input) {
        if(!input)
            return "";
        var output = [];
        var chr1, chr2, chr3;
        var enc1, enc2, enc3, enc4;
        var i = 0;

        input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

        var len = input.length;
        while (i < len) {
            enc1 = this._keyStr.indexOf(input.charAt(i++));
            enc2 = this._keyStr.indexOf(input.charAt(i++));
            enc3 = this._keyStr.indexOf(input.charAt(i++));
            enc4 = this._keyStr.indexOf(input.charAt(i++));
            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;
            output.push( String.fromCharCode(chr1));
            if (enc3 != 64) {
                output.push(String.fromCharCode(chr2));
            }
            if (enc4 != 64) {
                output.push( String.fromCharCode(chr3));
            }
        }

        return  _Base64._utf8_decode(output.join(""));
    },

    // private method for UTF-8 encoding
    _utf8_encode : function (string) {
        string = string.replace(/\r\n/g,"\n");
        var utftext = [];
        var len = string.length;

        for (var n = 0; n < len; n++) {

            var c = string.charCodeAt(n);

            if (c < 128) {
                utftext.push( String.fromCharCode(c));
            }
            else if((c > 127) & (c < 2048)) {
                utftext.push(String.fromCharCode((c >> 6) | 192),
                    String.fromCharCode((c & 63) | 128));
            }
            else {
                utftext.push( String.fromCharCode((c >> 12) | 224),
                    String.fromCharCode(((c >> 6) & 63) | 128),
                    String.fromCharCode((c & 63) | 128));
            }

        }

        return utftext.join("");
    },

    // private method for UTF-8 decoding
    _utf8_decode : function (utftext) {
        var string = [];
        var i = 0;
        var c = c1 = c2 = 0;
        var len = utftext.length;

        while ( i < len ) {

            c = utftext.charCodeAt(i);

            if (c < 128) {
                string.push(String.fromCharCode(c));
                i++;
            }
            else if((c > 191) & (c < 224)) {
                c2 = utftext.charCodeAt(i+1);
                string.push(String.fromCharCode(((c & 31) << 6) | (c2 & 63)));
                i += 2;
            }
            else {
                c2 = utftext.charCodeAt(i+1);
                c3 = utftext.charCodeAt(i+2);
                string.push( String.fromCharCode(((c & 15) << 12) | 
                    ((c2 & 63) << 6) | (c3 & 63)));
                i += 3;
            }

        }

        return string.join("");
    }
}


if (typeof(window) != 'undefined' && window.Foxmarks) {
	Foxmarks.provide('Foxmarks.ThirdParty.Base64');
	Foxmarks.ThirdParty.Base64 = _Base64 ;
} else {
	Base64 = _Base64;
}
    


})();

/* 
 Copyright 2007 Foxmarks Inc.
 
 foxmarks-network.js: implements network interface to Syncd2.
 
 */

// TO DO:
// * Tie in to global notification system.
// * Implement dumb server support.
// * Setup Wizard support for upgrade process, including self-served.
// * UI changes to support deprecation of self-serving.
// * Once sync works, dismantle RDF sync crap, old network crap, etc.
// * Add upgrade/version compatibility to syncd2 spec.
// * Contemplate server status/feedback control for syncd2.

const NS_ERROR_REDIRECT_LOOP = 2152398879;
const NS_ERROR_CWD_ERROR = 0x804b0016;

/*

 The Request class handles communication with a server. It is essentially
 an HTTP Javascript remote object broker, delivering objects from the client
 to the server and retrieving Javascript objects from the server in return.
 Request has built-in support for the Foxmarks authentication protocol,
 initiated by a 302 Redirect response.

 Arguments:
     method: a string indicating which HTTP method to use.
     url: either a string or an object containing any of
        protocol, host, and path. If the caller provides a string, that
        literal string is used as the target url. If an object is
        supplied, Request uses whatever components are provided to construct
        a final url, employing defaults for missing components.
     obj: the object to be transmitted to the server.
     isAuthRequest: a boolean which, if set, indicates that this request is
        an authentication request. This is used internally only and should
        never be set by callers.
    headers: a dict of HTTP headers that can be optionally set on the request.

 Return value:
    Three different types of errors can occur in processing a request.
    1) Network error: DNS failure, connection reset, etc.
    2) Transport failure: HTTP 404, etc.
    3) App failure: syncd rejects a request because of revision mismatch.

 If an error occurs, we return an integer status code in response.status.

 NOTE: We're deprecating the use of "restype" -- clients should rely on
 the status return value, which is 0 is everything went as expected
 or a non-zero integer representing the error code if things went awry.

 As of this moment, Acctmgr still uses restype, but clients calling this
 code should rely entirely on status, as restype is gone.

 */


var g_auth = "";
var g_authu = "";
var g_authp = "";

function Request(method, url, bodyobj, isAuthRequest, headers, ignoreBody, ignoreAuthTokens) {
    this._channel = null;
    this._streamLoader = null;
    this._callback = null;
    this._triedAuth = false;
    this._headers = headers;
    this._ignoreBody = ignoreBody;
    this._ignoreAuthTokens = ignoreAuthTokens;
    try {
        this.JSON = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
    } catch(e){
        this.JSON = null;
    }
    
    // Argument url is either a string or an object
    // consisting of protocol, host, and path.
    // If it's a string, just take the string that's been
    // given. If it's an object, assemble the components
    // (applying defaults as appropriate) into a url.

    if (url instanceof Object) {

        // Set up defaults.
        if (!url.protocol) {
            if (XmarksBYOS.gSettings.securityLevel == 1 ||
                (XmarksBYOS.gSettings.securityLevel == 0 && isAuthRequest)) {
                    url.protocol = "https";
            } else {
                url.protocol = "http";
            }
        }
        if (!url.host) url.host = XmarksBYOS.gSettings.host;
        if (!url.path) url.path = "/";
        if (url.path[0] != "/") url.path = "/" + url.path;
        this._url = url.protocol + "://" + url.host + url.path;
    } else {
        this._url = url;
    }
    this._bodyobj = bodyobj;
    this._method = method;
    this._isAuthRequest = isAuthRequest;
}

Request.prototype = {

    /*

    Process a request. Given the protocol, host, and path, construct a
    url and execute the specified method against that url, inserting
    the given message body.

    When request completes, it calls the provided callback function,
    passing a single object (the "response object"). 

    */

    Start: function(callback) {
        LogWrite(">>> " + this._method + " " + this._StripPassword(this._url));
        if (this._bodyobj && !this._isAuthRequest) {
            LogWrite(">>> Body is: " + 
                (!XmarksBYOS.gSettings.getDebugOption("no-verbose") ?
                this._bodyobj.toJSONString() : "(disabled)"));
        }
        this._callback = callback;

        // Create a channel.
        var ios = Cc["@mozilla.org/network/io-service;1"].
            getService(Ci.nsIIOService);
        try {
            this._channel = ios.newChannelFromURI(ios.newURI(this._url, 
                    "UTF-8", null));
        } catch (e) {
            LogWrite("Couldn't create channel from " + this._url + ", error:" + e.toSource());
            callback(1008);
            return;
        }

        this._channel.QueryInterface(Ci.nsIUploadChannel);
        this._channel.loadFlags |= 
            Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;

        // If we have a body to transmit, set it up as an upload stream.
        if (this._bodyobj) {
            var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                createInstance(Ci.nsIScriptableUnicodeConverter);
            converter.charset = "UTF-8";
            var stream = converter.convertToInputStream(
                this._bodyobj.toJSONString());
            this._channel.setUploadStream(stream, "application/json", -1);
        }

        // Special setup only for HTTP channels.
        if (this._channel instanceof Ci.nsIHttpChannel) {

            // Set the channel's method if necessary.
            if (this._method) {
                this._channel.requestMethod = this._method;
            }

            // Disable redirection.
            this._channel.redirectionLimit = 0;
            this._channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;

            // Set the user agent.
            this._channel.setRequestHeader("User-Agent", 
                this._channel.getRequestHeader("User-Agent") + 
                    " Xmarks-Fx/" + XmarksBYOS.FoxmarksVersion(), false);

            if(!this._ignoreAuthTokens){
                if(g_authp != XmarksBYOS.gSettings.passwordNoPrompt || g_authu != XmarksBYOS.gSettings.username)
                    g_auth = "";
                if(g_auth.length > 0){
                    this._channel.setRequestHeader("Authorization", 
                        "XMAuth " + g_auth, false);
                    this._channel.setRequestHeader("X-Xmarks-Auth",
                        g_auth, false);
                }
            }

            // Set other headers if provided.
            if (this._headers) {
                var self = this;
                forEach(this._headers, function(v, k) {
                    self._channel.setRequestHeader(k, v, false);
                } );
            }
        }

        // Create a stream loader for retrieving the response.
        this._streamLoader = Cc["@mozilla.org/network/stream-loader;1"]
            .createInstance(Ci.nsIStreamLoader);
 
        // Fire it up. Note that this results in the channel's AsyncOpen
        // being called; if we have set an upload stream above, it will be
        // transmitted as part of the request. This is a bit strange, but
        // appears to be correct.
        try {
            // Before Firefox 3...
            this._streamLoader.init(this._channel, this, null);
        } catch(e) {
            // Firefox 3 style...
            this._streamLoader.init(this);
            this._channel.asyncOpen(this._streamLoader, null);
        }
        return;
    },

    Cancel: function() {
        if (this._channel && this._channel.isPending()){
            LogWrite("Cancelling Network Request");
            this._channel.cancel(0x804b0002);
        }
    },

    onStreamComplete: function(loader, ctxt, status, resultLength, result) {
        var response = {};
        if (Components.isSuccessCode(status)) {
            try {
                status = this._channel.responseStatus || 200;
            } catch (e) {
                this._callback( { status: 1005, errormsg: 
                        "Disable automatic proxy settings detection."} );
                return;
            }

            //try {
            //    dump("cookie: " + this._channel.getResponseHeader("Set-Cookie") + "\n");
           // }catch(e){}
            var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                createInstance(Ci.nsIScriptableUnicodeConverter);
            converter.charset = "utf-8";
            var msg = "";
            if (status == 200 || status == 201 || status == 204) {
                if(!this._ignoreBody){
                    msg = converter.convertFromByteArray(result, resultLength);
                }
                if (msg && msg.length && !this._ignoreBody) {
                    try {
                        response = this.JSON ? this.JSON.decode(msg) :
                            eval("(" + msg + ")");
                        if(response.auth && response.auth.length > 0){
                            g_auth =  response.auth;
                        }
                    } catch(e) {
                        LogWrite("Failed to parse message: " + msg);
                        response = { status: 1010, 
                            errormsg: "Invalid server response" }; 
                    }
                }
                if (response.status == null) {
                    response.status = 0;
                }

                // New Auth stuff
                if(response.status == 302){
                    function RestartAfterAuth(response) {
                        if (response.status == 0){
                            g_auth = response.auth;
                            g_authp = XmarksBYOS.gSettings.password;
                            g_authu = XmarksBYOS.gSettings.username;
                            // We're authenticated. Retry original request.
                            self.Start(self._callback);
                            return;
                        } else {
                            // Auth failed. Return failure code.
                            if (response.message == "Wrong username or password.") {
                                response.status = 401;
                            }
                            self._callback(response);
                            return;
                        }
                    }

                    LogWrite(">>> Authenticating...");

                    if (this._triedAuth) {
                        LogWrite("In authentication loop. Possible proxy server caching issue.");
                        this._callback( { status: 1012 } );
                        return;
                    }

                    var location = response.authtoken_location;
                    var self = this;    // keep a handle on the original request
                    // parse out the protocol, host, and path
                    var colonslashslash = location.indexOf("://");
                    var nextslash = location.indexOf("/", colonslashslash + 3);
                    if (colonslashslash < 0 || nextslash < 0) {
                        throw Error("Couldn't parse location string " + location);
                    }
                    var url = {}
                    url.host = location.substr(colonslashslash + 3, 
                        nextslash - (colonslashslash + 3)); 
                    url.host = XmarksBYOS.gSettings.getCharPref('host-login', url.host);

                    url.path = location.substr(nextslash);
                    try {
                        var pw = XmarksBYOS.gSettings.password;
                    } catch (e) {
                        LogWrite("User canceled password request.");
                        this._callback(2);
                        return;
                    }
                    var authReq = new Request("POST", url,
                        { username: XmarksBYOS.gSettings.username, 
                            password: Base64.encode(pw) }, true );
                    this._triedAuth = true;
                    authReq.Start(RestartAfterAuth);
                    return;
                }
                
            } else {
                response = { status: status, "errormsg" : msg };
            }
            try {   // Pass back the etag if there is one.
                response.etag = this._channel.getResponseHeader("Etag");
            } catch (e) {}

            if(XmarksBYOS.gSettings.getDebugOption("no-verbose")){
                LogWrite(">>> Callback (disabled)");
            } else {
                var oldauth = response.auth;
                delete response.auth;
                LogWrite(">>> Callback " + response.toSource());
                response.auth = oldauth;
            }
            this._callback(response);
            return;
        } else {
            if (status == NS_ERROR_REDIRECT_LOOP && !this._isAuthRequest) {
                this._callback( { status: status });
                return;
            } else if (status == NS_ERROR_CWD_ERROR) {
                LogWrite("CWD error (mapping to 404)");
                this._callback( { status: 404 } );
            } else {
                LogWrite("network request failed; status is " +
                        status.toString(16));
                this._callback( { status: status });
            }
        }
    },

    _StripPassword: function(url) {
        var exp = /^(.*):(.*)@(.*)$/
        var match = url.match(exp);
        return match ? match[1] + "@" + match[3] : url;
    }
}


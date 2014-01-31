/* 
 Copyright 2009 Xmarks Inc.
 
 foxmarks-settings.js: implements FoxmarksSettings, an object that wraps
 access to persistent settings, both user settings and internal stored values.
   
 */

// TO DO:
// * If user changes username or password, delete our cookie.

var XmarksBYOS;
if(XmarksBYOS === undefined){
    XmarksBYOS = {};
}

var Cc = Components.classes;
var Ci = Components.interfaces;
var CCon = Components.Constructor;

(function() {

var xm = XmarksBYOS;

xm.SYNC_REALM = "Xmarks BYOS Sync Login";
xm.SYNC_REALM_PIN = "Xmarks BYOS Sync PIN";

xm.Bundle = function() {
  var sb = Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle("chrome://xmarksbyos/locale/foxmarks.properties");
  return sb;
};

// Notify takes the given args object and passes it to observers.
// By convention, args contains at least "status", an integer with
// the following interpretation:
//   0: operation completed successfully.
//   1: operation continues; msg is status update only.
//   2: operation was cancelled by user.
//   3: component finished
//   other: operation failed.
// Similarly, "msg" contains a user-displayable message.

xm.Notify = function(args) {
    var os = Cc["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);

    var str = args.toSource();        
    os.notifyObservers(null, "xmarksbyos-service", str);
};

xm.SetProgressComponentStatus = function(id, phase){
    xm.Notify({status: 3, component: id, phase: phase} );
};
xm.SetProgressMessage = function(msgname) {
    var msg;
    try {
        msg = xm.Bundle().GetStringFromName(msgname);
    } catch(e) {
        msg = "untranslated(" + msgname + ")";
    }

    xm.Notify({status: 1, msg: msg} );
};

xm.FoxmarksAlert = function(str){
    var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(Components.interfaces.nsIPromptService);
    ps.alert(null,"Xmarks", str);
};

xm.MapErrorUrl = function(status) {
    var error = "";

    status = status & 0x0000ffff;

    try {
        error = xm.Bundle().GetStringFromName("errorurl." + status);
    } catch (e) {
        if(xm.UnknownError(status)){
            error = xm.Bundle().GetStringFromName("errorurl.unknown");
        } else {
            error = "";
        }
    }

    return error;
}; 
xm.UnknownError = function(status){
    var result = false;
    status = status & 0x0000ffff;

    try {
        xm.Bundle().GetStringFromName("error." + status);
        result = false;
    } catch (e) {
        result = true;
    }

    return result;
};
xm.MapErrorMessage = function(status) {
    var error = "";

    status = status & 0x0000ffff;

    try {
        error = xm.Bundle().GetStringFromName("errormsg." + status);
    } catch (e) {
        if(xm.UnknownError(status)){
            error = xm.Bundle().formatStringFromName(
                "errormsg.unknown", [status], 1);
        } else {
            error = "";
        }
    }

    return error;
}; 
xm.MapError = function(status) {
    var error = "";

    status = status & 0x0000ffff;

    try {
        error = xm.Bundle().GetStringFromName("error." + status);
    } catch (e) {
        error = xm.Bundle().formatStringFromName("error.unknown", [status], 1);
    }

    return error;
}; 

/**
* Convert a string containing binary values to hex.
* Shamelessly stolen from nsUpdateService.js
*/
xm.binaryToHex = function(input) {
    var result = "";
    for (var i = 0; i < input.length; ++i) {
        var hex = input.charCodeAt(i).toString(16);
        if (hex.length == 1)
            hex = "0" + hex;
        result += hex;
    }
    return result;
};

xm.hex_md5 = function(string) {
    var arr = new Array();
    
    for (var i = 0; i < string.length; ++i)
        arr[i] = string.charCodeAt(i);
        
    try {
        var hash = Components.classes["@mozilla.org/security/hash;1"].
                    createInstance(Components.interfaces.nsICryptoHash);
        hash.initWithString("md5");
        hash.update(arr, arr.length);
        var digest = xm.binaryToHex(hash.finish(false));
    } catch (e) {
        var ps = Components.classes
            ["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);
        ps.alert(null, "Xmarks", e);
    } 
    return digest;    // 8 bytes seems sufficient for our purposes
};

xm.IsXmarksInstalled = function() {
    var rdfs = Components.classes["@mozilla.org/rdf/rdf-service;1"].
        getService(Components.interfaces.nsIRDFService);
    var ds = Components.classes["@mozilla.org/extensions/manager;1"].
        getService(Components.interfaces.nsIExtensionManager).datasource;
    var s = rdfs.GetResource("urn:mozilla:item:foxmarks@kei.com");
    var p = rdfs.GetResource("http://www.mozilla.org/2004/em-rdf#version");
    var t = ds.GetTarget(s, p, true);
    return t instanceof Components.interfaces.nsIRDFLiteral;
};

// Return the version string associated with the currently installed version
xm.FoxmarksExtensionManagerLiteral = function(value) {
    var rdfs = Components.classes["@mozilla.org/rdf/rdf-service;1"].
        getService(Components.interfaces.nsIRDFService);
    var ds = Components.classes["@mozilla.org/extensions/manager;1"].
        getService(Components.interfaces.nsIExtensionManager).datasource;
    var s = rdfs.GetResource("urn:mozilla:item:byos@xmarks.com");
    var p = rdfs.GetResource("http://www.mozilla.org/2004/em-rdf#" + value);
    var t = ds.GetTarget(s, p, true);
    if (t instanceof Components.interfaces.nsIRDFLiteral)
        return t.Value;
    else
        return "unknown";
};

xm.FoxmarksVersion = function() {
    return xm.FoxmarksExtensionManagerLiteral("version");
}

function FoxmarksSettings() {
    // upgrade to xmarks if possible
    var ps = Cc["@mozilla.org/preferences-service;1"].
            getService(Ci.nsIPrefService);
        
    this.prefs = ps.getBranch("extensions.xmarksbyos.");
    this.ps = ps;
    this._auth = "";
}

FoxmarksSettings.prototype = {
    prefs: null,

    // Only call this for uninstalls (it nukes all prefs)
    clearAllPrefs: function(){
        this.pin = "";
        this.password = "";
        this.prefs.deleteBranch("");
    },
    
    getCharPref: function(string, def) {
        var result;
        
        try {
            result = this.prefs.getCharPref(string);
        } catch (e) {
            result = def;
        }
        
        return result;
    },

    getIntPref: function(string, def) {
        var result;
        
        try {
            result = this.prefs.getIntPref(string);
        } catch (e) {
            result = def;
        }
        
        return result;
    },


    getBoolPref: function(string, def) {
        var result;
        
        try {
            result = this.prefs.getBoolPref(string);
        } catch (e) {
            result = def;
        }
        
        return result;
    },


    formatDate: function(d) {
        return d.toLocaleDateString() + " " + d.toLocaleTimeString();
    },

    // get fundamental settings

    get username() {
        return this.getCharPref("username", "");
    },

    get httpProtocol() {
        return this.securityLevel == 1 ? "https://" : "http://";
    },

    get sessionPin() {
        var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
            getService(Ci.nsIXmarksByosService);

        return fms.getPin();
    },

    set sessionPin(pw) {
        var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
            getService(Ci.nsIXmarksByosService);

        fms.setPin(pw);
    },
    get sessionPassword() {
        var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
            getService(Ci.nsIXmarksByosService);
        return fms.getPassword();
    },

    set sessionPassword(pw) {
        var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
            getService(Ci.nsIXmarksByosService);

        fms.setPassword(pw);
    },
    removePIN: function(){
        var lm = Cc["@mozilla.org/login-manager;1"].
            getService(Ci.nsILoginManager);
        var nsli = new CCon("@mozilla.org/login-manager/loginInfo;1",
            Ci.nsILoginInfo, "init");
        var oldli = new nsli(this.host, null, xm.SYNC_REALM_PIN, 
            this.username, this.pinNoPrompt, "", "");

        lm.removeLogin(oldli);
        this.sessionPin = "";
    },

    set pin(pin) {
        if (!this.rememberPin) {
            this.sessionPin = pin;
        } else {
            if ("@mozilla.org/login-manager;1" in Cc) {
                // Can't set password without username.
                if (!this.username)
                    return;
                var lm = Cc["@mozilla.org/login-manager;1"].
                    getService(Ci.nsILoginManager);
                var nsli = new CCon("@mozilla.org/login-manager/loginInfo;1",
                    Ci.nsILoginInfo, "init");
                var newli = new nsli(this.host, null,
                    xm.SYNC_REALM_PIN,this.username, pin, "", "");
                var oldli = new nsli(this.host, null,
                    xm.SYNC_REALM_PIN, 
                    this.username, this.pinNoPrompt, "", "");
                try {
                    lm.modifyLogin(oldli, newli);
                } catch (e) {
                    lm.addLogin(newli);
                }
            }
        }
    },

    get pin() {

        var pw = this.pinNoPrompt;

        if (pw != null)
            return pw;

        var pin = { value: "" };
        var remember = { value: this.rememberPin };

        var sb = xm.Bundle().GetStringFromName;
        var rv = Cc["@mozilla.org/embedcomp/prompt-service;1"].
             getService(Ci.nsIPromptService).
             promptPassword(null, sb("appname.long"), 
                 sb("prompt.pin"),
                  pin,
                 sb("prompt.rememberpin"),
                 remember);

        if (!rv) {
            throw 2;
        }

        this.pin = pin.value;
        this.rememberPin = remember.value;

        return pin.value;
    },

    get pinNoPrompt() {
        if (!this.rememberPin && this.sessionPin) {
            return this.sessionPin;
        }

        if (this.rememberPin) {
            if ("@mozilla.org/login-manager;1" in Cc) {
                var lm = Cc["@mozilla.org/login-manager;1"].
                    getService(Ci.nsILoginManager);
                var logins = lm.findLogins({}, this.host, null,
                        xm.SYNC_REALM_PIN);
                for (var i = 0; i < logins.length; ++i) {
                    if (logins[i].username == this.username) {
                        return logins[i].password;
                    }
                }
            }
        }
        return null;    // couldn't fetch password
    },

    get password() {

        var pw = this.passwordNoPrompt;

        if (pw != null)
            return pw;

        var username = { value: this.username };
        var password = { value: "" };
        var remember = { value: this.rememberPassword };

        var sb = xm.Bundle().GetStringFromName;
        var rv = Cc["@mozilla.org/embedcomp/prompt-service;1"].
             getService(Ci.nsIPromptService).
             promptUsernameAndPassword(null, sb("appname.long"), 
                 sb("prompt.usernamepassword"),
                 username, password,
                 sb("prompt.rememberpassword"),
                 remember);

        if (!rv) {
            throw 2;
        }

        this.rememberPassword = remember.value;
        this.username = username.value;
        this.password = password.value;

        return password.value;
    },

    get passwordNoPrompt() {
        if (!this.rememberPassword && this.sessionPassword) {
            return this.sessionPassword;
        }

        if (this.rememberPassword) {
            if ("@mozilla.org/passwordmanager;1" in Cc) {
                var host = {};
                var user = {};
                var pass = {}; 
                try {
                    var pmi = Cc["@mozilla.org/passwordmanager;1"].
                        createInstance(Ci.nsIPasswordManagerInternal);
                    pmi.findPasswordEntry(this.host, this.username, 
                        "", host, user, pass);
                    if(pass.value){
                        this.sessionPassword = pass.value;
                    // else try foxmarks
                    } else if(this.host == "sync.xmarks.com"){
                        pmi.findPasswordEntry("sync.foxmarks.com", this.username, 
                            "", host, user, pass);
                    }
                    return pass.value;
                } catch(e) { }
            } else if ("@mozilla.org/login-manager;1" in Cc) {
                var lm = Cc["@mozilla.org/login-manager;1"].
                    getService(Ci.nsILoginManager);
                var logins = lm.findLogins({}, this.host, null, xm.SYNC_REALM);
                for (var i = 0; i < logins.length; ++i) {
                    if (logins[i].username == this.username) {
                        return logins[i].password;
                    }
                }
            }
        }
        return null;    // couldn't fetch password
    },

    _calcHash: function(host){
        var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
            getService(Ci.nsIXmarksByosService);

        return xm.hex_md5((this.useOwnServer ? 
                this.url : host + this.username) + 
            fms.getStorageEngine("bookmarks")).slice(16)
            + ".";
    },
    get hash() {
        return this._calcHash(this.host);
    },
            
    get lastSynchDate() {
        return this.getCharPref(this.hash + "lastSynchDate", "");
    },

    get haveSynced() {
        return this.lastSynchDate != "";
    },

    getLastSyncDate: function(syncType){
        if(syncType == "bookmarks")
            return this.getCharPref(this.hash + "lastSynchDate", "");
        else
            return this.getCharPref(this.hash + syncType + "-lastSynchDate",
                    "");
    },
    
    getHaveSynced: function(syncType){
        return this.getLastSyncDate(syncType) != "";

    },

    setLastSyncDate: function(syncType, string){
        if(syncType == "bookmarks")
            return this.prefs.setCharPref(this.hash + "lastSynchDate", string);
        else
            return this.prefs.setCharPref(this.hash + syncType + "-lastSynchDate",
                    string);
    },

    get minutesSinceLastSync() {
        if (!this.haveSynced)
          return 0;
      
        var syncMS = new Date(this.lastSynchDate).getTime();
        var nowMS = Date.now();
        return (nowMS - syncMS) / 60000;
  
    },
  
    get daysSinceLastUpdateNag() {
        if (!this.lastNagDate)
            return Infinity;
        var updateMS = new Date(this.lastNagDate).getTime();
        var nowMS = Date.now();
        return (nowMS - updateMS) / (60000 * 60 * 24);
    },
  
    get lastNagDate() {
        return this.getCharPref("lastNagDate", null);
    },
    
    set lastNagDate(string) {
        this.prefs.setCharPref("lastNagDate", string);
    },
    
    get lastSynchDisplayDate() {
        if (!this.haveSynced) {
            return xm.Bundle().GetStringFromName("msg.neversynced");
        } else {
            return this.formatDate(new Date(this.lastSynchDate));
        }
    },

    setEtag: function(syncType, string){
        if(syncType == "bookmarks"){
            this.prefs.setCharPref(this.hash + "etag", string);
        }
        else {
            this.prefs.setCharPref(this.hash + 
                    "-" + syncType + "-etag", string);
        }
    },
    getEtag: function(syncType){
        if(syncType == "bookmarks"){
            return this.getCharPref(this.hash + "etag", "");
        }
        else {
            return this.getCharPref(this.hash + "-" + syncType + "-etag", "");
        }
    },
    
    
    setToken: function(syncType, string){
        if(syncType == "bookmarks"){
            return this.prefs.setCharPref(this.hash + "token", string);
        }
        else {
            return this.prefs.setCharPref(this.hash + "-" + syncType + "-token", string);
        }

    },
    getToken: function(syncType){
        if(syncType == "bookmarks"){
            return this.getCharPref(this.hash + "token", "");
        }
        else {
            return this.getCharPref(this.hash + "-" + syncType + "-token", "");
        }

    },
    
    get writeCount() {
        return this.getIntPref("writeCount", 0);
    },

    get lastError() {
        return this.getIntPref("lastError", 0);
    },
    set lastError(err){
        this.prefs.setIntPref("lastError", err);
    },
    get synchOnTimer() {
        return this.getBoolPref("synchOnTimer", true);
    },
    get useBaselineCache() {
        return this.getBoolPref("memory-useBaselineCache", true);
    },
    get forceGC() {
        return this.getBoolPref("memory-forceGC", false);
    },

    isSyncEnabled: function(syncType){
        return this.getBoolPref("sync-"+syncType, syncType == "bookmarks");
    },

    setSyncEnabled: function(syncType, val){
        this.prefs.setBoolPref("sync-"+syncType, val);
    },
    
    mustMerge: function(syncType){
        return this.getBoolPref("mergereq-"+syncType, false);
    },
    setMustMerge: function(syncType, val){
        this.prefs.setBoolPref("mergereq-"+syncType, val);
    },
    mustUpload: function(syncType){
        return this.getBoolPref("uploadreq-"+syncType, false);
    },
    setMustUpload: function(syncType, val){
        this.prefs.setBoolPref("uploadreq-"+syncType, val);
    },
    get autoSynchFreq() {
        return this.getIntPref("autoSynchFreq", 60);
    },
    
    get syncOnShutdown() {
        return this.getIntPref("syncOnShutdown", true) != 0;
    },

    get syncOnShutdownAsk() {
        return this.getBoolPref("syncOnShutdownAsk", true);
    },
    
    get debugUI() {
        return this.getBoolPref("debugUI", false);
    },
    
    get wizardPrefs() {
        return this.getCharPref("wizardPrefURL", "/FX/wiz.json");
    },
    set wizardPrefs(val) {
        this.prefs.setCharPref("wizardPrefURL", val);
    },
    get serpPrefix() {
        return this.getCharPref("serpPrefix", "xmarksserp");
    },
    set serpPrefix(val) {
        this.prefs.setCharPref("serpPrefix", val);
    },
    get wizardWarning() {
        return this.getBoolPref("wizardDoWarning", true);
    },
    set wizardWarning(v){
        this.prefs.setBoolPref("wizardDoWarning", v);
    },
    get wizardRetriesLeft(){
        return this.getIntPref("wizardRetriesLeft", 5);
    },

    set wizardRetriesLeft(v){
        this.prefs.setIntPref("wizardRetriesLeft", v);
    },

    get lastWizardBubble(){
        return this.getCharPref("wizardLastBubble", "");
    },

    set lastWizardBubble(v){
        this.prefs.setCharPref("wizardLastBubble", v);
    },
    
    get wizardMinTimeExpired(){
        var nowMS = Date.now();
        var lastMS = this.lastWizardBubble == "" ? 0 : new Date(this.lastWizardBubble).getTime();
        return (nowMS - lastMS) >= (24 * 3600 * 1000);
    },

    wizardResetMinTime: function(){
        this.lastWizardBubble = this.NowAsGMT;
    },

    get wizardSuppress() {
        return this.getBoolPref("wizardNoShow", false);
    },
  
    set wizardSuppress(bool) {
       this.prefs.setBoolPref("wizardNoShow", bool);
    },

    get disableIfMatchOnPut() {
        return this.getBoolPref("disableIfMatchOnPut", false);
    },

    set enableLogging(bool) {
        this.prefs.setBoolPref("enableLogging", bool);
    },
    get enableLogging() {
        return this.getBoolPref("enableLogging", true);
    },

    get rememberPassword() {
        return this.getBoolPref("rememberPassword", true);
    },

    set rememberPassword(bool) {
        this.prefs.setBoolPref("rememberPassword", bool);
    },


    get rememberPin() {
        return this.getBoolPref("rememberPin", true);
    },

    set rememberPin(bool) {
        this.prefs.setBoolPref("rememberPin", bool);
    },

    set username(string) {
        string = string.replace(/^\s+|\s+$/g, '')
        if (string != this.username) {
            this.prefs.setCharPref("username", string);
            this.ClearCredentials();
        }
    },
    
    set password(password) {
        if (this.passwordNoPrompt != password) {
            this.ClearCredentials();
        }
        if (!this.rememberPassword) {
            this.sessionPassword = password;
        } else {
            if(!password)
                password = "";
            if ("@mozilla.org/passwordmanager;1" in Cc) {
                // Can't set password without username.
                if (!this.username)
                    return;
                var pm = Cc["@mozilla.org/passwordmanager;1"]
                    .createInstance(Ci.nsIPasswordManager);
                try { 
                    pm.removeUser(this.host, this.username);
                } catch(e) {}
                if(password.length > 0)
                    pm.addUser(this.host, this.username, password);
            } else if ("@mozilla.org/login-manager;1" in Cc) {
                // Can't set password without username.
                if (!this.username)
                    return;
                var lm = Cc["@mozilla.org/login-manager;1"].
                    getService(Ci.nsILoginManager);
                var nsli = new CCon("@mozilla.org/login-manager/loginInfo;1",
                    Ci.nsILoginInfo, "init");
                var newli = new nsli(this.host, null, xm.SYNC_REALM, 
                    this.username, password, "", "");
                var oldli = new nsli(this.host, null, xm.SYNC_REALM, 
                    this.username, this.passwordNoPrompt, "", "");
                try {
                    if(password.length == 0){
                        lm.removeLogin(oldli);
                    }
                    else {
                        lm.modifyLogin(oldli, newli);
                    }
                } catch (e) {
                    if(password.length > 0)
                        lm.addLogin(newli);
                }
            }
        }
    },
    
    ClearCredentials: function() {
    },

    set lastSynchDate(string) {
        this.prefs.setCharPref(this.hash + "lastSynchDate", string);
    },

    set writeCount(integer) {
        this.prefs.setIntPref("writeCount", integer);
    },
        
    set autoSynchFreq(integer) {
        this.prefs.setIntPref("autoSynchFreq", integer);
    },
    
    set synchOnTimer(bool) {
        this.prefs.setBoolPref("synchOnTimer", bool);
    },
    
    set syncOnShutdown(integer) {
        this.prefs.setIntPref("syncOnShutdown", integer);
    },
    
    set syncOnShutdownAsk(bool) {
        this.prefs.setBoolPref("syncOnShutdownAsk", bool);
    },

    set debugUI(bool) {
        this.prefs.setBoolPref("debugUI", bool);
    },

    set serpEnabled(v){
        this.prefs.setBoolPref("enableSERP", v);
    },

    get serpEnabled(){
        return this.getBoolPref("enableSERP", true);
    },

    set simsiteEnabled(v){
        this.prefs.setBoolPref("enableSimSite", v);
    },

    get simsiteEnabled(){
        return this.getBoolPref("enableSimSite", true);
    },

    get serpRegex(){
        return this.getCharPref("SERPRegEx", "(http:\/\/www\.google\..+\/.*[?&]q=([^&]+))|(http:\/\/[-a-zA-Z]+\.start3\.mozilla\.com\/search\?.*[?&]q=([^&]+))|(http:\/\/search\.yahoo\.com\/search?.*[?&]p=([^&]+))|(http:\/\/search\.(msn|live)\.com\/results\.aspx?.*[?&]q=([^&]+))");
    },
    set serpRegex(v){
        this.prefs.setCharPref("SERPRegEx", v);
    },
    get serpMaxItems(){
        return this.getIntPref("SERPMaxItems", 3);
    },

    set serpMaxItems(val) {
        this.prefs.setIntPref("SERPMaxItems", val);
    },
    set tagSuggestionsEnabled(v){
        this.prefs.setBoolPref("enableTagSuggestions", v);
    },

    get is_english(){
        var lang = this.lang;
        if(lang){
            return lang.split("-")[0] == 'en';
        }
        return true;
    },
    get lang(){
        var prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefBranch2);
        var lang = prefs.getComplexValue("intl.accept_languages",
                Ci.nsIPrefLocalizedString).data;

        if(lang){
            var a = lang.split(",");
            if(a.length){
                return a[0];
            }
        }
        return lang;
    },
    get tagSuggestionsEnabled() {
        var result;
        
        try {
            result = this.prefs.getBoolPref("enableTagSuggestions");
        } catch (e) {
            try {
                var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch2);
                var lang = prefs.getComplexValue("intl.accept_languages",
                    Ci.nsIPrefLocalizedString).data;
                result = lang.substr(0, 2) == "en";
                this.tagSuggestionsEnabled = result;
            } catch(f){
                result = false;
            }
        }
        
        return result;
    },
    
    // get calculated settings
    get calcPath() {
        return this.path.replace("{username}", this.username);
    },
       
    get NowAsGMT() {
        var d = new Date();
        return d.toGMTString();
    },
    

    SyncComplete: function(syncType) {
        this.setLastSyncDate(syncType, this.NowAsGMT);
        // TODO - remove the last sync by type; it's really unnecssary and causes issues if bookmarks are being synced
        if(!this.isSyncEnabled("bookmarks")){
            this.setLastSyncDate("bookmarks", this.NowAsGMT);
        }
    },

    // Additions to support Sync2
    get useOwnServer() {
        return true;
    },

    set useOwnServer(bool) {
        this.prefs.setBoolPref("useOwnServer", bool);
    },

    set url(u) {
        this.prefs.setCharPref("url-bookmarks", u);
    },

    get url() {
        return this.getCharPref("url-bookmarks",
            this.getCharPref("url", ""));
    },

    set passwordurl(u) {
        this.prefs.setCharPref("url-passwords", u);
    },

    get passwordurl() {
        return this.getCharPref("url-passwords", "");
    },

    set hideStatusIcon(b) {
        this.prefs.setBoolPref("hideStatusIcon", b);
        var os = Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService);
        os.notifyObservers(null, "xmarksbyos-statechange", 
            xm.gSettings.hideStatusIcon ?  "hide" : "show")
    },

    get hideStatusIcon() {
        return this.getBoolPref("hideStatusIcon", false);
    },

    getUrlWithUsernameAndPassword: function(syncType){
        var url;
        if(syncType == "bookmarks")
            url = this.url;
        else
            url = this.getCharPref("url-" + syncType, "");
            
        var user = this.username;
        var pw = this.password;
        
        if (pw.length) {
            user += ":" + pw;
        }

        if (user.length) {
            user += "@";
        }

        return url.replace("://", "://" + user);
    },

    get majorVersion() {
        return this.getIntPref("majorVersion", 0);
    },

    set majorVersion(ver) {
        this.prefs.setIntPref("majorVersion", ver);
    },

    get currVersion(){
        return this.getCharPref("lastUpdateVersion", "");
    },

    set currVersion(ver){
        this.prefs.setCharPref("lastUpdateVersion", ver);
    },

    get host() {
        if (this.useOwnServer) {
            var exp = /(.*):\/\/([^\/]*)/;
            var result = this.url.match(exp);
            if (!result) {
                return null;
            } else {
                return result[1] + "://" + result[2];
            }
        } else {
            return this.getCharPref("host-bookmarks",
                       this.getCharPref("host", "sync.xmarks.com"));
        }
    },

    setDebugOption: function(opt, val){
        this.prefs.setBoolPref("debug-" + opt, val);
    },
    getDebugOption: function(opt){
        return this.getBoolPref("debug-" + opt, false);
    },
    getUnitTestOption: function(opt){
        return this.getIntPref("unittest-" + opt, 0);
    },
    getServerHost: function(syncType){
        if(syncType == "bookmarks" || this.useOwnServer)
            return this.host;
        else
            return this.getCharPref("host-" + syncType, "sync.xmarks.com");
    },
    
    get numTurboTags(){
        return this.getIntPref("turbotagctr", 0);
    },
    set numTurboTags(num){
        this.prefs.setIntPref("turbotagctr", num);
    },

    get apiHost() {
        return this.getCharPref("host-api", "api.xmarks.com");
    },
    set apiHost(val) {
        this.prefs.setCharPref("host-api", val);
    },
    get driftHost() {
        return this.getCharPref("host-drift", "www.xmarks.com");
    },
    set driftHost(val) {
        this.prefs.setCharPref("host-drift", val);
    },
    get staticHost() {
        return this.getCharPref("host-static", "static.xmarks.com");
    },
    set staticHost(val) {
        this.prefs.setCharPref("host-static", val);
    },
    get acctMgrHost() {
        return this.useOwnServer ? "" : 
            this.getCharPref("host-login",
                this.getCharPref("acctMgrHost",
                    this.host.replace("sync", "login")
                )
            );
    },

    get truncateLog(){
        return this.getBoolPref("truncateLog", true);

    },
    get webHost() {
        return this.useOwnServer ? "www.xmarks.com" : 
            this.getCharPref("host-www",
                this.getCharPref("acctMgrHost",
                    this.host.replace("sync", "www")
                )
            );
    },
    get wizardUrl() {
        return this.getCharPref("wizardUrl", "https://" + 
            this.acctMgrHost + "/wizard");
    },

    // -1: never synced
    //  0: likely synced in prior installation
    //  > 0: definitely synced
    get currentRevision() {
        return this.getIntPref(this.hash + "currentRevision", -1);
    },

    set currentRevision(cv) {
        if (cv != this.currentRevision) {
            this.prefs.setIntPref(this.hash + "currentRevision", cv);
            this.ps.savePrefFile(null);     // ensure it gets flushed
        }
    },

    GetSyncRevision: function(syncType) {
        if(syncType == "bookmarks")
            return this.getIntPref(this.hash + "currentRevision", -1);
        else    
            return this.getIntPref(this.hash + syncType + "-currentRevision", -1);
    },

    SetSyncRevision: function(syncType,cv) {
        if (cv != this.GetSyncRevision(syncType)) {
            if(syncType == "bookmarks")
                this.prefs.setIntPref(this.hash + "currentRevision", cv);
            else
                this.prefs.setIntPref(this.hash + syncType + "-currentRevision", cv);
            this.ps.savePrefFile(null);     // ensure it gets flushed
        }
    },
    get securityLevel() {
        // -1: use cleartext throughout
        //  0: use SSL for auth, cleartext otherwise (default)
        //  1: use SSL everywhere
        return this.getIntPref("securityLevel", 0);
    },

    set securityLevel(level) {
        this.prefs.setIntPref("securityLevel", level);
    },

    get disableIconSync() {
        return this.getBoolPref("disableIconSync", false);
    },

    get disableDirtyOnBatch() {
        return this.getBoolPref("disableDirtyOnBatch", false);
    },

    get machineId() {
        var id = this.getCharPref("machineId", null);
        if (!id) {
            id = Date.now().toString(36);
            this.prefs.setCharPref("machineId", id);
        }
        return id;
    },

    get serverVersion() {
        return this.getIntPref("serverVersion", 0);
    },

    set serverVersion(val) {
        this.prefs.setIntPref("serverVersion", val);
    },
    get viewId() {
        return this.getIntPref(this.hash + "viewId", 0);
    },

    set viewId(vid) {
        this.prefs.setIntPref(this.hash + "viewId", vid);
    },

    _stPref: function(undec, id, v){
        if(undec){
            return "UST-" + id + "-" + v;
        }
        return "ST-" + id + "-" + v;
    },
    getST: function(undec,id){
        var result = {};
        var val;

        val = this.getIntPref(this._stPref(undec,id, "d"), 0);
        if(val) result["d"] = val;
        val = this.getIntPref(this._stPref(undec,id, "dc"), 0);
        if(val) result["dc"] = val;
        val = this.getIntPref(this._stPref(undec,id, "u"), 0);
        if(val) result["u"] = val;
        val = this.getIntPref(this._stPref(undec,id, "uc"), 0);
        if(val) result["uc"] = val;
        val = this.getIntPref(this._stPref(undec,id, "na"), 0);
        if(val) result["na"] = val;
        val = this.getIntPref(this._stPref(undec,id, "h"), 0);
        if(val) result["h"] = val;

        return result;
    },
    incrST: function(id, key, undec){
        var name;

        name = this._stPref(undec,id, key);
        this.prefs.setIntPref(name, this.getIntPref(name, 0) + 1);

    },
    clearST: function(id){
        this.prefs.setIntPref(this._stPref(true, id, "d"),0);
        this.prefs.setIntPref(this._stPref(true, id, "dc"),0);
        this.prefs.setIntPref(this._stPref(true, id, "u"),0);
        this.prefs.setIntPref(this._stPref(true, id, "uc"),0);
        this.prefs.setIntPref(this._stPref(true, id, "na"),0);
        this.prefs.setIntPref(this._stPref(true, id, "h"),0);
        this.prefs.setIntPref(this._stPref(false, id, "d"),0);
        this.prefs.setIntPref(this._stPref(false, id, "dc"),0);
        this.prefs.setIntPref(this._stPref(false, id, "u"),0);
        this.prefs.setIntPref(this._stPref(false, id, "uc"),0);
        this.prefs.setIntPref(this._stPref(false, id, "na"),0);
        this.prefs.setIntPref(this._stPref(false, id, "h"),0);
    },

    get trSERP() {
        return this.getCharPref("trSERP", "");
    },

    set trSERP(val) {
        this.prefs.setCharPref("trSERP", val);
    },
    get bibBug() {
        return this.getCharPref("bibBug", "/FX/xmarks_bib.png");
    },

    set bibBug(val) {
        this.prefs.setCharPref("bibBug", val);
    },

    get viewName() {
        return this.getCharPref(this.hash + "viewName", this.viewId ?
            String(this.viewId) : 
            xm.Bundle().GetStringFromName("profile.globalname"));
    },

    set viewName(name) {
        this.prefs.setCharPref(this.hash + "viewName", name);
    },

    get syncShortcutKey() {
        return this.getCharPref("shortcut.SyncNow", "");
    },

    get siteinfoDialogShortcutKey() {
        return this.getCharPref("shortcut.SiteInfo", "");
    },
    get openSettingsDialogShortcutKey() {
        return this.getCharPref("shortcut.OpenSettings", "");
    },

    correctHashes: function(){
        var oldhash = "";
        // if we are now using the default host, we must
        // have used sync.foxmarks.com before
        LogWrite("Upgrading to 3.0: correcting hashes");
        LogWrite("Current Host: " + this.host);
        if(this.host == "sync.xmarks.com"){
            oldhash = this._calcHash("sync.foxmarks.com");

            LogWrite("Hashes Need Correction");
            // change all the hosts
            this.prefs.setCharPref(this.hash + "lastSynchDate", 
                this.getCharPref(oldhash + "lastSynchDate", ""));
            this.prefs.setCharPref(this.hash + "passwords-lastSynchDate", 
                this.getCharPref(oldhash + "passwords-lastSynchDate", ""));
            this.prefs.setIntPref(this.hash + "currentRevision", 
                this.getIntPref(oldhash + "currentRevision", -1));
            this.prefs.setIntPref(this.hash + "passwords-currentRevision", 
                this.getIntPref(oldhash + "passwords-currentRevision", -1));
            this.prefs.setIntPref(this.hash + "viewId", 
                this.getIntPref(oldhash + "viewId", 0));
            this.prefs.setCharPref(this.hash + "viewName", 
                this.getCharPref(oldhash + "viewName", this.viewId ?
                    String(this.viewId) : 
                    xm.Bundle().GetStringFromName("profile.globalname")
            ));
        } else {
            oldhash = this.hash;
        }

        // bookmark baseline 
        var dirname = Cc['@mozilla.org/file/directory_service;1']
            .getService(Ci.nsIProperties)
            .get('ProfD', Ci.nsIFile);
        var file = Cc['@mozilla.org/file/directory_service;1']
            .getService(Ci.nsIProperties)
            .get('ProfD', Ci.nsIFile);
        var fromname = "foxmarks-baseline-" + oldhash + "json";
        var toname = "xmarks-baseline-" + this.hash + "json";

        try {
            file.append(fromname);
            file.moveTo(dirname, toname);
        } catch(e){
            // don't do anything if file doesn't exist
        }

        // password baseline
        file = Cc['@mozilla.org/file/directory_service;1']
            .getService(Ci.nsIProperties)
            .get('ProfD', Ci.nsIFile);
        fromname = "foxmarks-password-baseline-" + oldhash + "json";
        toname = "xmarks-password-baseline-" + this.hash + "json";

        try {
            file.append(fromname);
            file.moveTo(dirname, toname);
        } catch(e){
            // don't do anything if file doesn't exist
        }

        this.ps.savePrefFile(null);     // ensure it gets flushed
    }
}

xm.gSettings = new FoxmarksSettings();
})();

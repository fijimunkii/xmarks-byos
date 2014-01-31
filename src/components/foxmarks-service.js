/*
 Copyright 2005-2008 Foxmarks Inc.

 foxmarks-service.js: component that implements the "service" interface to
 the core synchronization code.

 */

var XmarksBYOS;
if(XmarksBYOS === undefined){
    XmarksBYOS = {};
}
var Cc = Components.classes;
var Ci = Components.interfaces;

function LoadJavascript(filename, id) {
    if (id == "undefined") {
        Cc["@mozilla.org/moz/jssubscript-loader;1"].
        getService(Ci.mozIJSSubScriptLoader).
        loadSubScript(filename, null);
    }
}

function GetTopWin(wintype) {
    var topwin = Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator).
        getMostRecentWindow(wintype);

    return topwin;
}

function XmarksCollisionDialog() {
    var callback = {
        notify: function(){
            var os = Cc["@mozilla.org/observer-service;1"].
                getService(Ci.nsIObserverService);
            os.notifyObservers(null, "xmarksbyos-xmarksrunning",""); 
        }
    };
    var timer = Cc["@mozilla.org/timer;1"].
        createInstance(Ci.nsITimer);
    timer.initWithCallback(callback, 5000,
        Ci.nsITimer.TYPE_ONE_SHOT);
}
function FoxmarksLaunchUpgradePage() {
    upgradeCallback.timer = Cc["@mozilla.org/timer;1"].
        createInstance(Ci.nsITimer);
    upgradeCallback.timer.initWithCallback(upgradeCallback, 5000,
        Ci.nsITimer.TYPE_ONE_SHOT);
}

var upgradeCallback = {
    notify: function(timer) {
        var currver = XmarksBYOS.FoxmarksVersion();
        XmarksBYOS.FoxmarksOpenInNewTab(XmarksBYOS.gSettings.httpProtocol + XmarksBYOS.gSettings.webHost + "/byos/upgrade/" + currver, 
            true);
        XmarksBYOS.gSettings.currVersion = currver;
    }
}

function FoxmarksLaunchSuccessPage() {
    successCallback.timer = Cc["@mozilla.org/timer;1"].
        createInstance(Ci.nsITimer);
    successCallback.timer.initWithCallback(successCallback, 5000,
        Ci.nsITimer.TYPE_ONE_SHOT);
}

var successCallback = {
    notify: function(timer) {
        var currver = XmarksBYOS.FoxmarksVersion();
        XmarksBYOS.FoxmarksOpenInNewTab(XmarksBYOS.gSettings.httpProtocol + XmarksBYOS.gSettings.webHost + "/byos/success/" + currver, 
            true);
        XmarksBYOS.gSettings.currVersion = currver;
    }
}
function FoxmarksLaunchSetupWizard() {
    FoxmarksWizardCallback.timer = Cc["@mozilla.org/timer;1"].
        createInstance(Ci.nsITimer);
    FoxmarksWizardCallback.timer.initWithCallback(FoxmarksWizardCallback, 5000,
        Ci.nsITimer.TYPE_ONE_SHOT);
}

var FoxmarksWizardCallback = {
    notify: function(timer) {
        var os = Cc["@mozilla.org/observer-service;1"]
            .getService(Ci.nsIObserverService);
        os.notifyObservers(null, "xmarksbyos-newpopup", "");
    }
}

function HandleShutdown(cancel) {
    var retval = { helpurl: null };
    var sb = XmarksBYOS.Bundle().GetStringFromName;
    var dontask = {value: false};
    var rv = 0;

    if (!XmarksBYOS.gSettings.haveSynced || GetState() != "dirty") {
        return;
    }

    var topwin = GetTopWin();

    if (!topwin) {
        LogWrite("HandleShutdown: Couldn't find a topwin!");
        return;
    }

    if (XmarksBYOS.gSettings.syncOnShutdown && XmarksBYOS.gSettings.syncOnShutdownAsk) {

        rv = Cc["@mozilla.org/embedcomp/prompt-service;1"].
        getService(Ci.nsIPromptService).
        confirmEx(topwin, sb("appname.long"), sb("msg.unsynced"),
            Ci.nsIPromptService.STD_YES_NO_BUTTONS, null, null, null,
            sb("msg.dontask"), dontask);
        // Reverse sense: confirmEx returns 0 - yes, 1 - no
        rv = !rv;

        // If user says "don't ask me again", set syncOnShutdown to whatever
        // they have chosen in this instance.
        if (dontask.value) {
            XmarksBYOS.gSettings.syncOnShutdown = rv;
        }
        XmarksBYOS.gSettings.syncOnShutdownAsk = !dontask.value;

    } else {                           // don't ask
        rv = XmarksBYOS.gSettings.syncOnShutdown;
    }

    if (rv) {
        var win = topwin.openDialog(
            "chrome://xmarksbyos/content/foxmarks-progress.xul", "_blank",
            "chrome,dialog,modal,centerscreen", "synch", retval, null);
        if (retval.helpurl) { // we hit an error and user pressed help button
            if (cancel instanceof Ci.nsISupportsPRBoolean) {
                cancel.value = true;
                topwin.openDialog("chrome://browser/content/browser.xul",
                    "_blank", "chrome,all,dialog=no", retval.helpurl);
            }
        }
    }
}

function LoadFiles() {
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-log.js",
        typeof(LogWrite));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-settings.js",
        typeof(XmarksBYOS.gSettings));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-update.js",
        typeof(ForceUpdate));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-clobber.js",
        typeof(onClobberCancel));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-bookmark.js",
        typeof(loadDatasourceSet));
    if ("@mozilla.org/browser/nav-bookmarks-service;1" in Cc)
        LoadJavascript("chrome://xmarksbyos/content/foxmarks-places.js",
            typeof(BookmarkDatasource));
    else
        LoadJavascript("chrome://xmarksbyos/content/foxmarks-rdf.js",
            typeof(BookmarkDatasource));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-nodes.js",
        typeof(Node));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-command.js",
        typeof(Command));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-core.js",
        typeof(Synchronize));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-network.js",
        typeof(Request));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-json.js",
        "undefined");

    LoadJavascript("chrome://xmarksbyos/content/shared/Base64.js",
        typeof(Base64));
    LoadJavascript("chrome://xmarksbyos/content/shared/CreateAESManager.js",
        typeof(CreateAESManager));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-utils.js",
        typeof(forEach));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-unittest.js",
        typeof(gFoxmarksUT));
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-uitools.js",
        typeof(XmarksBYOS.FoxmarksOpenWindowByType));
    if("@mozilla.org/login-manager;1" in Cc){
        LoadJavascript("chrome://xmarksbyos/content/foxmarks-password.js",
            typeof(PasswordDatasource));
    }
    LoadJavascript("chrome://xmarksbyos/content/foxmarks-server.js",
        typeof(SyncServer));
}

var logStream = null;
 
function removeTempLogFile(){
    var fileremoved = Cc['@mozilla.org/file/directory_service;1']
        .getService(Ci.nsIProperties)
        .get('ProfD', Ci.nsIFile);
    fileremoved.append("xmarks.temp.log");
    try {
        fileremoved.remove(false);
    } catch(e){}
}
function logMoveFile(){
    try {
        var file = Cc['@mozilla.org/file/directory_service;1']
            .getService(Ci.nsIProperties)
            .get('ProfD', Ci.nsIFile);
        file.append("xmarksbyos.log");

        var dir = Cc['@mozilla.org/file/directory_service;1']
            .getService(Ci.nsIProperties)
            .get('ProfD', Ci.nsIFile);
        removeTempLogFile();
        file.moveTo(dir, "xmarksbyos.temp.log");


        var fromstream = Cc["@mozilla.org/network/file-input-stream;1"]
            .createInstance(Ci.nsIFileInputStream);
        var tostream = Cc["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Ci.nsIFileOutputStream);

        fromstream.init(file, -1, 0x01, 0);
        var logSeek = fromstream.QueryInterface(Ci.nsISeekableStream);
        var lread = fromstream.QueryInterface(Ci.nsILineInputStream);
        var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
            .createInstance(Ci.nsIScriptableUnicodeConverter);
        converter.charset = "UTF-8";
        var i =  100 * 1024;
        if(i > file.fileSize){
            i = file.fileSize;
        }

        var filenew = Cc['@mozilla.org/file/directory_service;1']
            .getService(Ci.nsIProperties)
            .get('ProfD', Ci.nsIFile);
        filenew.append("xmarksbyos.log");
        tostream.init(filenew, 0x02 | 0x08 | 0x10, 0664, 0);

        logSeek.seek(logSeek.NS_SEEK_END, -i);

        var buf;
        var cont = true;
        var lineData = {};
        var ctr = 0;
        // throw out the first one; could be mid line
        cont = lread.readLine(lineData);
        while(cont){
            lineData = {};
            cont = lread.readLine(lineData);
            if(cont){
                buf = converter.ConvertToUnicode(lineData.value) + "\n";
                tostream.write(buf, buf.length);
            }
        }

     } catch(e){
        Components.utils.reportError(e);
     } finally {
        if(fromstream !== undefined)
            fromstream.close();
        if(tostream !== undefined)
            tostream.close();
     }
    removeTempLogFile();
}
function logFileOpen() {
    var file = Cc['@mozilla.org/file/directory_service;1']
    .getService(Ci.nsIProperties)
    .get('ProfD', Ci.nsIFile);

    var needsTruncate = false;
    var filesize = 0;
    file.append("xmarksbyos.log");

    // check the file size
    try {
       if(file.isFile()){
            filesize = file.fileSize;
       }

       if(filesize > 500 * 1024 && XmarksBYOS.gSettings.truncateLog ){
            logMoveFile();
       }
    } catch(e) {
   //     Components.utils.reportError(e);
    }
    
    try {
        logStream = Cc["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Ci.nsIFileOutputStream);

        // use write, append, create
        logStream.init(file, 0x02 | 0x08 | 0x10, 0664, 0);
    } catch (e) {
        // We failed to open. Close and try again next time.
        logFileClose();
    }
}

function logFileClose() {
    try {
        logStream.close();
    } catch (e) {}
    logStream = null;
}

var gFailureCount = 0;// number of consecutive times we've failed
var gBackoffUntil = 0;// if we've been failing, our backoff time (ms since 1970)
var gServerBackoff = 
    { 'bookmarks': 0,
      'passwords': 0,
      min: function(){
        return Math.min(this['bookmarks'], this['passwords']);
      },
      max: function(){
        return Math.max(this['bookmarks'], this['passwords']);
      },
      clear: function(){
        this['bookmarks'] = 0;
        this['passwords'] = 0;
      }
    };  // seconds server wants us to back off

function ReturnErrorMsg(code, msg, restoreState, noBackoff) {
    XmarksBYOS.gSettings.lastError  = code;
    XmarksBYOS.gSettings.lastError  = code;
    XmarksBYOS.Notify({status: code, msg: msg });
    ClearBusy();
    SetState(restoreState ? restoreState : ((code == 503 || code == 2)
            ? "dirty" : "error"));
    LogWrite("Returned error: " + msg + "(" + code + ")");
    if(code != 2 && !noBackoff){
        var d = new Date();
        // Initial back-off is 15 minutes, doubling with each error
        gBackoffUntil = d.getTime() + 1000 * (Math.max(
            15 * 60 * Math.pow(2, gFailureCount++),
            gServerBackoff.max()) + Math.floor(Math.random() * 15));
        gServerBackoff.clear();;
        var retry = new Date();
        retry.setTime(gBackoffUntil);
        LogWrite("Will retry at " + retry);
    }
    FoxmarksSyncService.lastError = code;
}

function ReturnErrorCode(code) {
    ReturnErrorMsg(code, XmarksBYOS.MapError(code));
}

function ReturnSuccess(msgname, args, restoreState) {
    if (args == null) {
        var args = {};
    }

    args.status = 0;
    args.msg = XmarksBYOS.Bundle().GetStringFromName(msgname);

    SetState(restoreState ? restoreState : "ready");
    ClearBusy();
    gFailureCount = 0;
    FoxmarksSyncService.lastError = 0;
    LogWrite("Success: " + XmarksBYOS.Bundle().GetStringFromName(msgname));
    XmarksBYOS.Notify(args);
}

function SetBusy() {
    if (IsBusy._busy) {
        return false;
    } else {
        IsBusy._busy = true;
        SetState("working");
        return true;
    }
}

function ClearBusy() {
    IsBusy._busy = false;
}

function IsBusy() {
    return IsBusy._busy;
}
IsBusy._busy = false;

function GetState() {
    return GetState._state;
}
GetState._state = "ready";

function SetState(newstate) {
    if (newstate == GetState()) {
        return;
    }

    var os = Cc["@mozilla.org/observer-service;1"]
    .getService(Ci.nsIObserverService);

    os.notifyObservers(null, "xmarksbyos-statechange", newstate);

    GetState._state = newstate;
}

// Internal callbacks

function LogStart(op, dest) {
    LogWrite("------ Xmarks (BYOS)/" + XmarksBYOS.FoxmarksVersion() + " (" + 
            FoxmarksSyncService.getStorageEngine("bookmarks") + ") starting " + op +
            " with " + dest + " ------");
}

///////////////////////////////////////////////////////////////////////////
//
// nsFoxmarksService
//

var FoxmarksSyncService = null;  // set during initialization to instance object

function nsXmarksByosService() {
    LoadFiles();
}

nsXmarksByosService.prototype = {
    /////////////////////////////////////////////////////////////////////////
    // nsIXmarksByosService

    timer: null,
    _server: null,
    lastmodified: null,

    status: function(syncType) {
        // return if we're currently processing another request
        if (!SetBusy()) {
            return false;
        }
        LogStart("status", XmarksBYOS.gSettings.host);
        if(syncType === undefined)
            syncType = "bookmarks";

        this.server.status(syncType, function(status, response){
            if (status) {
                ReturnErrorCode(status);
            }
            else {
                ReturnSuccess("msg.accountverified", response);
            }
        });
        return true;
    },
    extstatus: function(syncType) {
        // return if we're currently processing another request
        if (!SetBusy()) {
            return false;
        }
        LogStart("extstatus", XmarksBYOS.gSettings.host);
        if(syncType === undefined)
            syncType = "bookmarks";

        this.server.extstatus(syncType, function(status, response){
            if (status) {
                ReturnErrorCode(status);
            }
            else {
                ReturnSuccess("msg.accountverified", response);
            }
        });
        return true;
    },
    purgepasswords: function(){
        LogStart("purgepasswords", XmarksBYOS.gSettings.host);
        this.server.purgepasswords(function(status){
            if (!status) {
                ReturnSuccess("msg.synccompleted");
            }
            else {
                ReturnErrorCode(status);
            }
        });
        return true;

    },

    verifypin: function(pin) {
        // return if we're currently processing another request
        if (!SetBusy()) {
            return false;
        }
        LogStart("status", XmarksBYOS.gSettings.host);

        this.server.verifypin(pin, function(status, response){
            if (status) {
                ReturnErrorCode(status);
            }
            else {
                ReturnSuccess("msg.pinverified", response);
            }
        });
        return true;
    },

    synchronize: function(automatic) {
        var prevState = GetState();

        // return if we're currently processing another request
        if (!SetBusy()) {
            return false;
        }

        LogStart("sync", XmarksBYOS.gSettings.host);
        this.server.manual = automatic === true ? false : true;
        this.server.sync(prevState, function(status){
            if (!status) {
                ReturnSuccess("msg.synccompleted");
            }
            else {
                ReturnErrorCode(status);
            }
        });
        return true;
    },

    synchronizeInitial: function (remoteIsMaster, doMerge) {
        // return if we're currently processing another request
        if (!SetBusy()) {
            return false;
        }

        LogStart("initial sync", XmarksBYOS.gSettings.host);
        this.server.manual = true;

        // We need to self correct for password sync.  If there is an
        // uploadReq == true, we know it doesn't have data on the server.
        // if it's false, we should force a merge per our PRD.
        if(XmarksBYOS.gSettings.isSyncEnabled("passwords")){
            // Set default higher if we're doing password sync
            XmarksBYOS.gSettings.securityLevel = 1;
            if(!XmarksBYOS.gSettings.mustUpload("passwords")){
                XmarksBYOS.gSettings.setMustMerge("passwords", true);
            }
        }

        if (doMerge) {
            this.server.merge(!remoteIsMaster, Finished);
        } else {
            if (remoteIsMaster) {
                this.server.download(Finished);
            } else {
                this.server.upload(Finished);
            }
        }

        return true;

        function Finished(status) {
            if (!status) {
                ReturnSuccess("msg.synccompleted");
            } else {
                ReturnErrorCode(status);
            }
        }
    },

    upload: function () {
        // return if we're currently processing another request
        if (!SetBusy()) {
            return false;
        }

        LogStart("upload", XmarksBYOS.gSettings.host);

        this.server.manual = true;
        this.server.upload(function(status){
            if (!status) {
                ReturnSuccess("msg.uploadcompleted");
            }
            else {
                ReturnErrorCode(status);
            }
        });
        return true;
    },

    download: function () {
        // return if we're currently processing another request
        if (!SetBusy()) {
            return false;
        }

        LogStart("download", XmarksBYOS.gSettings.host);

        this.server.manual = true;
        this.server.download(function(status){
            if (!status) {
                ReturnSuccess("msg.remotefilecopied");
            }
            else {
                ReturnErrorCode(status);
            }
        });
        return true;
    },

    _handleDataResponse: function(response){
        var os = Cc["@mozilla.org/observer-service;1"]
            .getService(Ci.nsIObserverService);

        os.notifyObservers(null, "xmarksbyos-dataservice", response.toSource());
    },
    launchSuccessPage: function(){
    },
    cancel: function() {
        this.server.cancel();
    },
    datacancel: function() {
        this.server.datacancel();
    },

    logWrite: function (msg) {
        if (!logStream)
            logFileOpen();

        var d = new Date();
        var year = d.getFullYear();
        var month = d.getMonth() + 1; if (month < 10) month = "0" + month;
        var day = d.getDate(); if (day < 10) day = "0" + day;
        var hour = d.getHours(); if (hour < 10) hour = "0" + hour;
        var minute = d.getMinutes(); if (minute < 10) minute = "0" + minute;
        var sec = d.getSeconds(); if (sec < 10) sec = "0" + sec;

        // format is [YYYY-MM-DD HH:MM:SS] msg\n
        var string = "[" + year + "-" + month + "-" + day + " " + hour + ":" +
            minute + ":" + sec + "] " + msg + "\n";

        if(XmarksBYOS.gSettings.getDebugOption("dumplog"))
            dump("Xmarks: " + string + "\n");
        logStream.write(string, string.length)
    },

    getState: function() {
        return GetState();
    },

    _password: null,
    _pin: null,

    getPassword: function() {
        return this._password;
    },

    setPassword: function(password) {
        this._password = password;
    },
    getPin: function() {
        return this._pin;
    },

    setPin: function(password) {
        this._pin = password;
    },

    getStorageEngine: function(synctype) {
        return getDatasourceAttribute(synctype, "engine");
    },

    getLastError: function() {
        return this.lastError;
    },

    lastError: 0,
    _uninstall: false,
    _channel: null,
     pingServer: function(topic){
         // no op
    },
    getLastModified: function(synctype) {
        return FoxmarksSyncService.lastmodified;
    },

    get server() {
        if (!this._server) {
            this._server = new SyncServer();
        }
        return this._server;
    },

    /////////////////////////////////////////////////////////////////////////
    //
    // nsIObserver

    observe: function(subject, topic, data)  { // called at startup
        var timerCallback = {

            notify: function(timer) {

                var now = new Date().getTime();

                // scan entire bookmark set to find
                // last modified date for entire set
                // XXX: Implement


                // Do automatic sync if necessary
                if (!IsBusy() && (!gFailureCount || now > gBackoffUntil) &&
                    XmarksBYOS.gSettings.synchOnTimer && XmarksBYOS.gSettings.haveSynced) {
                    if (XmarksBYOS.gSettings.minutesSinceLastSync > 
                            XmarksBYOS.gSettings.autoSynchFreq) {
                        FoxmarksSyncService.synchronize(true);
                    } else {
                        if (FoxmarksSyncService.lastmodified && XmarksBYOS.gSettings.haveSynced && 
                            FoxmarksSyncService.lastmodified >
                            Date.parse(XmarksBYOS.gSettings.lastSynchDate) &&
                            now - FoxmarksSyncService.lastmodified > 5 * 60 * 1000) {
                            FoxmarksSyncService.synchronize(true);
                        }
                    }
                }
            }
        }

        if (topic == "app-startup") {
            // Pre-initialization here.
            var os = Cc["@mozilla.org/observer-service;1"].
                getService(Ci.nsIObserverService);
            os.addObserver(this, "quit-application-requested", false);
            os.addObserver(this, "xmarksbyos-datasourcechanged", false);
            os.addObserver(this, "xmarksbyos-rununittest", false);
            os.addObserver(this, "xmarksbyos-unittesterror", false);
            os.addObserver(this, "earlyformsubmit", false);
            os.addObserver(this, "final-ui-startup", false);
            os.addObserver(this, "em-action-requested", false);
            os.addObserver(this, "quit-application-granted", false);
            os.addObserver(this, "xmarksbyos-showsettingpane", false);
        } else if (topic == "final-ui-startup") {
            if(XmarksBYOS.IsXmarksInstalled()){
                var os = Cc["@mozilla.org/observer-service;1"].
                    getService(Ci.nsIObserverService);
                os.removeObserver(this, "quit-application-requested");
                os.removeObserver(this, "earlyformsubmit");
                os.removeObserver(this, "em-action-requested");
                os.removeObserver(this, "quit-application-granted");
                LogWrite("Xmarks is installed on this system.");
                XmarksCollisionDialog();
                return;
            }
            // Real initialization starts here.
            FoxmarksSyncService = this;
            var dsList = loadDatasourceSet(true); 

            FoxmarksSyncService.nat = {}; 
            for(var x = 0; x < dsList.length; x++)
                FoxmarksSyncService.nat[dsList[x].syncType] = dsList[x].WatchForChanges(this.server);

            if (!XmarksBYOS.gSettings.wizardSuppress && !XmarksBYOS.gSettings.useOwnServer &&
                    !XmarksBYOS.gSettings.haveSynced) {
                LogWrite("Starting Wizard: Never Synched");
                FoxmarksLaunchSetupWizard();
            } else if (XmarksBYOS.gSettings.majorVersion < 1) {
                LogWrite("Starting Wizard: Major Upgrade");
                XmarksBYOS.gSettings.majorVersion = 1;
                //FoxmarksLaunchSuccessPage();
                var currver = XmarksBYOS.FoxmarksVersion();
                XmarksBYOS.gSettings.currVersion = currver;
                FoxmarksLaunchSetupWizard();
            } else {
                // need to check for upgrades here
                XmarksBYOS.gSettings.majorVersion = 1;
                var currver = XmarksBYOS.FoxmarksVersion();
                var lastver = XmarksBYOS.gSettings.currVersion;
                var ca = currver.split(".");
                var la = lastver.split(".");
                var newver =false;
                
                if(ca.length != la.length){
                    newver = true;
                } else {
                    for(var x=0; x < ca.length-1; x++){
                        if(parseInt(ca[x]) != parseInt(la[x])){
                            newver = true;
                            break;
                        }
                    }
                }
                if(newver){
                    FoxmarksLaunchUpgradePage();
                }
            }
            
            this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
            this.timer.initWithCallback(timerCallback, 1000*60,
                Ci.nsITimer.TYPE_REPEATING_SLACK);
        } else if (topic == "quit-application-requested") {
            HandleShutdown();
        } else if(topic == "em-action-requested"){
            subject.QueryInterface(Components.interfaces.nsIUpdateItem);
            if(subject.id == "byos@xmarks.com"){
                switch(data){
                    case 'item-uninstalled':
                        this._uninstall = true;
                        break;
                    case 'item-cancel-action':
                        this._uninstall = false;
                        break;
                }

            }

        } else if(topic == "quit-application-granted"){
            if(this._uninstall){
                XmarksBYOS.gSettings.clearAllPrefs();
            }
        } else if(topic == "xmarksbyos-showsettingpane"){
            if(data.length > 0){
                XmarksBYOS.OpenFoxmarksSettingsDialog(data);
            }
        } else if (topic == "xmarksbyos-unittesterror"){
            try {
                ReturnErrorCode(parseInt(data));
            }
            catch(e){
                Components.utils.reportError(e);
            }
        } else if (topic == "xmarksbyos-rununittest"){
            this.server.runUnitTest();
        } else if (topic == "xmarksbyos-datasourcechanged") {
            var a = data.split(';');
            this.lastmodified = parseInt(a[0]);
            var okState = (GetState() == "ready" || GetState() == "unknown");
            if (okState && XmarksBYOS.gSettings.haveSynced &&
                XmarksBYOS.gSettings.isSyncEnabled(a[1]) && 
                this.lastmodified > Date.parse(XmarksBYOS.gSettings.lastSynchDate)) {
                SetState("dirty");
            }
        } else {
            LogWrite("Yikes unknown topic " + topic);
        }
    },

    /////////////////////////////////////////////////////////////////////////
    // nsIFormSubmitObserver
    notify : function (formElement, aWindow, actionURI) {
        if(FoxmarksSyncService && FoxmarksSyncService.nat["passwords"])
            FoxmarksSyncService.nat["passwords"].formsubmit(formElement);
        return true;
    },

    /////////////////////////////////////////////////////////////////////////
    // nsIClassInfo
    getInterfaces: function (aCount) {
        var interfaces = [Ci.nsIXmarksByosService,
        Ci.nsIObserver,
        Ci.nsIFormSubmitObserver,
        Ci.nsiRDFObserver];
        aCount.value = interfaces.length;
        return interfaces;
    },

    getHelperForLanguage: function (aLanguage) {
        return null;
    },

    get contractID() {
        return "@xmarks.com/extensions/xmarksbyos;1";
    },

    get classDescription() {
        return "Xmarks BYOS Service";
    },

    get classID() {
        return Components.ID("{bbf70449-254b-4714-a1fc-c848627a1a43}");
    },

    get implementationLanguage() {
        return Ci.nsIProgrammingLanguage.JAVASCRIPT;
    },

    get flags() {
        return Ci.nsIClassInfo.SINGLETON;
    },

    /////////////////////////////////////////////////////////////////////////
    // nsISupports
    QueryInterface: function (aIID) {
        if (!aIID.equals(Ci.nsIXmarksByosService) &&
            !aIID.equals(Ci.nsISupports) &&
            !aIID.equals(Ci.nsIRDFObserver) &&
            !aIID.equals(Ci.nsIFormSubmitObserver) &&
            !aIID.equals(Ci.nsIObserver))
        throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    }
};

var gModule = {
    _firstTime: true,

    registerSelf: function (aComponentManager, aFileSpec, aLocation, aType) {
        if (this._firstTime) {
            this._firstTime = false;
            throw Components.results.NS_ERROR_FACTORY_REGISTER_AGAIN;
        }


        aComponentManager = aComponentManager.
        QueryInterface(Ci.nsIComponentRegistrar);

        for (var key in this._objects) {
            var obj = this._objects[key];
            aComponentManager.registerFactoryLocation(obj.CID, obj.className,
                obj.contractID, aFileSpec, aLocation, aType);
        }

        // Make the Foxmarks Service a startup observer
        var cm = Cc["@mozilla.org/categorymanager;1"].
        getService(Ci.nsICategoryManager);
        cm.addCategoryEntry("app-startup", this._objects.service.className,
            "service," + this._objects.service.contractID, true, true, null);
    },


    getClassObject: function (aComponentManager, aCID, aIID) {
        if (!aIID.equals(Ci.nsIFactory))
            throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

        for (var key in this._objects) {
            if (aCID.equals(this._objects[key].CID))
                return this._objects[key].factory;
        }

        throw Components.results.NS_ERROR_NO_INTERFACE;
    },

    _makeFactory: #1= function(ctor) {
        return {
            createInstance: function (outer, iid) {
                if (outer != null)
                    throw Components.results.NS_ERROR_NO_AGGREGATION;
                return (new ctor()).QueryInterface(iid);
            }
        };
    },

    _objects: {
        service: { CID : nsXmarksByosService.prototype.classID,
            contractID : nsXmarksByosService.prototype.contractID,
            className  : nsXmarksByosService.prototype.classDescription,
            factory    : #1#(nsXmarksByosService)
        }
    },

    canUnload: function (aComponentManager)
    {
        return true;
    }
};

function NSGetModule(compMgr, fileSpec)
{
    return gModule;
}

/*
 Copyright 2005-2009 Foxmarks Inc.

 foxmarks-dialog.js: Implements the main foxmarks options dialog.

 */

// TO DO:
// * Use synchronize method for preferences

var Cc = Components.classes;
var Ci = Components.interfaces;
var CCon = Components.Constructor;
var dialogMgr = {
    panes: {
        // Status Tab
        status: {
            onSetup: function(mgr){
                var os = Cc["@mozilla.org/observer-service;1"].
                    getService(Ci.nsIObserverService);
                os.addObserver(this, "xmarksbyos-service", false);
                os.addObserver(this, "xmarksbyos-statechange", false);
                this.doc = document;
                this.window = window;
                if(!XmarksBYOS.gSettings.haveSynced){
                    this.updateStatus("never");
                } else {
                    this.updateStatus();
                }
            },
            onUnload: function(){
                var os = Cc["@mozilla.org/observer-service;1"].
                    getService(Ci.nsIObserverService);
                try {
                    os.removeObserver(this, "xmarksbyos-service");
                    os.removeObserver(this, "xmarksbyos-statechange");
                } catch (e) {
                    LogWrite("Warning: removeObserver failed.");
                }
            },
            onOK: function(){},
            onCancel: function(){},
            setErrorMessaging: function(addThem,err){
                if(addThem){
                    var box = this.doc.getElementById('errorbox');
                    if(box){
                        box.parentNode.removeChild(box);
                    }
                    box = this.doc.createElement('groupbox');
                    box.setAttribute('width', '50');
                    box.setAttribute('style', 'padding-left: 42px;');
                    
                    var label = this.doc.createElement('label');
                    label.setAttribute('value',
                        XmarksBYOS.MapError(err) +"\n"
                    );
                    label.setAttribute('style',
                        'font-weight: bold; margin-left: -2px;'

                    );
                    box.appendChild(label);
                    var errMessage = XmarksBYOS.MapErrorMessage(err);
                    var errUrl = XmarksBYOS.MapErrorUrl(err);
                    if(errMessage.length > 0){
                        var desc = this.doc.createElement('description');
                        var textNode = this.doc.createTextNode(
                            XmarksBYOS.MapErrorMessage(err)
                        );
                        desc.appendChild(textNode);
                        box.appendChild(desc);
                    }

                    
                    if(errUrl.length > 0){
                        var box2 = this.doc.createElement('vbox');
                        box2.setAttribute('flex', '1');
                        box2.setAttribute('align', 'end');

                        var button = this.doc.createElement('button');
                        button.setAttribute('label',
                        XmarksBYOS.Bundle().GetStringFromName("dialog.status.button")
                        );
                        button.setAttribute('oncommand', 
                            'dialogMgr.panes.status.moreInfo("' + errUrl + '");'
                        );
                        box2.appendChild(button);
                        box.appendChild(box2);
                    }
                    box.setAttribute('id', 'errorbox');
                    this.doc.getElementById('statusbox').appendChild(box);
                   // this.window.sizeToContent();
                } else {
                    var box = this.doc.getElementById('errorbox');
                    if(box){
                        box.parentNode.removeChild(box);
                    }
                    // this.window.sizeToContent();
                }
            },

            observe: function(subject, topic, data) {
                if(topic == "xmarksbyos-service"){
                    var result = eval(data);
                    switch(result.status){
                        case 1:
                        case 3:
                            this.updateStatus('working');
                            break;
                        case 0:
                            this.updateStatus('ready');
                            break;
                        case 2:
                            this.updateStatus('dirty');
                            break;
                        default:
                            this.updateStatus('error', result.status);
                            break;
                    }
               } else if(topic == "xmarksbyos-statechange"){
                    switch(data){
                        case 'ready':
                        case 'dirty':
                        case 'working':
                        case 'error':
                            this.updateStatus(data);
                            break;
                    }
               }
            },
            moreInfo: function(err){
                XmarksBYOS.FoxmarksOpenInNewWindow(err);
            },
            updateStatus: function(state, errorStatus){
                if(state === undefined){
                    var foxmarks = Cc["@xmarks.com/extensions/xmarksbyos;1"].
                        getService(Ci.nsIXmarksByosService);
                    state = foxmarks.getState();
                }
                var image = this.doc.getElementById('status-image');
                var text = this.doc.getElementById('status-text');
                if(errorStatus === undefined){
                    errorStatus = XmarksBYOS.gSettings.lastError;
                }
                switch(state){
                    case 'never':
                        this.setErrorMessaging(false);
                        image.setAttribute('src',
                            "chrome://xmarksbyos/skin/images/status-good.png");
                        text.setAttribute('value',
                            XmarksBYOS.Bundle().GetStringFromName("dialog.status.none")
                            );
                        break;
                    case 'ready':
                        this.setErrorMessaging(false);
                        image.setAttribute('src',
                            "chrome://xmarksbyos/skin/images/status-good.png");
                        text.setAttribute('value',
                            XmarksBYOS.Bundle().GetStringFromName("dialog.status.good")
                            );
                        dialogMgr._lastSyncDateChanged();
                        break;
                    case 'dirty':
                        this.setErrorMessaging(false);
                        image.setAttribute('src',
                            "chrome://xmarksbyos/skin/images/status-dirty.png");
                        text.setAttribute('value',
                            XmarksBYOS.Bundle().GetStringFromName("dialog.status.dirty")
                            );
                        break;
                    case 'working':
                        this.setErrorMessaging(false);
                        image.setAttribute('src',
                            "chrome://xmarksbyos/skin/images/wheel36x28.gif");
                        text.setAttribute('value',
                            XmarksBYOS.Bundle().GetStringFromName("dialog.status.working")
                            );
                        break;
                    case 'error':
                        image.setAttribute('src',
                            "chrome://xmarksbyos/skin/images/status-bad.png");
                        text.setAttribute('value',
                            XmarksBYOS.Bundle().GetStringFromName("dialog.status.bad")
                            );
                        this.setErrorMessaging(true, errorStatus);
                        break;
                }
            }
        },
        // General Tab
        general: { 
           onSetup: function(mgr){
                this.data = {
                    username: XmarksBYOS.gSettings.username,
                    password: XmarksBYOS.gSettings.passwordNoPrompt,
                    rememberPassword: XmarksBYOS.gSettings.rememberPassword,
                    synchOnTimer: XmarksBYOS.gSettings.synchOnTimer,
                    syncOnShutdown: XmarksBYOS.gSettings.syncOnShutdown,
                    syncOnShutdownAsk: XmarksBYOS.gSettings.syncOnShutdownAsk,
                };
                // Settings that are too complex to handle via prefwindow
                document.getElementById("password").value =
                    XmarksBYOS.gSettings.passwordNoPrompt;
                document.getElementById("synconshutdown").checked =
                    XmarksBYOS.gSettings.syncOnShutdown;
                document.getElementById("askfirst").checked =
                    XmarksBYOS.gSettings.syncOnShutdownAsk;
                this.syncOnShutdownChanged();
           },
           resetNameAndPassword: function(){
                document.getElementById("username").value =
                    XmarksBYOS.gSettings.username;
                document.getElementById("password").value =
                    XmarksBYOS.gSettings.passwordNoPrompt;

           },
           onOK: function(){
                XmarksBYOS.gSettings.username = 
                    document.getElementById("username").value;
           },

           onCancel: function(){
                var name;
                for(name in this.data){
                    if(this.data.hasOwnProperty(name)){
                        XmarksBYOS.gSettings[name] = this.data[name];
                    }
                }
           },
           forgotPassword: function(){
                XmarksBYOS.FoxmarksOpenInNewWindow("http://" + XmarksBYOS.gSettings.acctMgrHost + 
                        "/login/forgot_password");
           },
           syncOnShutdownChanged: function() {
                document.getElementById("askfirst").disabled =
                    !document.getElementById("synconshutdown").checked;
           },
           syncOnShutdownToPreference: function() {
                if (document.getElementById("synconshutdown").checked) {
                    return 1;
                }
                return 0;
           }
        },
        sync: { // sync tab
           onSetup: function(mgr){
            this.mgr = mgr;

            this.resetSyncTypes();
           },
           
           resetSyncTypes: function(){
            this.data = {
               bookmarks: XmarksBYOS.gSettings.isSyncEnabled("bookmarks"),
               passwords: XmarksBYOS.gSettings.isSyncEnabled("passwords")
            };
            // Settings for passwords
            var passwordSyncEnabled = XmarksBYOS.gSettings.isSyncEnabled("passwords");

            document.getElementById("sync-passwords").checked =
                passwordSyncEnabled;
            document.getElementById("sync-resetpin").disabled =
                !passwordSyncEnabled; 
                
            document.getElementById("sync-bookmarks").checked =
                XmarksBYOS.gSettings.isSyncEnabled("bookmarks");

            if ("@mozilla.org/login-manager;1" in Cc) {
                document.getElementById("onlyFF3").hidden = true;
            }
            else {
                document.getElementById("sync-resetpin").disabled = true;
                document.getElementById("sync-passwords").disabled = true;
            }

           },
           onOK: function(){

           },
           onCancel: function(){
                         /*
                XmarksBYOS.gSettings.setSyncEnabled("passwords",this.data.passwords); 
                XmarksBYOS.gSettings.setSyncEnabled("bookmarks",this.data.bookmarks); 
                */
           },
           handlePasswordSync: function(){
                var d = document;
                var passwordSyncEnabled =
                    d.getElementById("sync-passwords").checked; 
                var result = {
                    doSync: false
                };
                if(passwordSyncEnabled){
                    if(!d.getElementById("passwordurl").value){
                        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().
                            GetStringFromName("error.nourlownserver"));
                        d.getElementById("sync-passwords").checked = false; 
                        passwordSyncEnabled = false;
                    } else if(!this.mgr.onOK()){
                        d.getElementById("sync-passwords").checked = false; 
                        passwordSyncEnabled = false;
                    } else {
                        window.openDialog(
                            "chrome://xmarksbyos/content/foxmarks-setup.xul",
                            "Xmarks", "chrome,dialog,modal,centerscreen",
                            true,
                            "askforPIN",
                            result
                        );
                        passwordSyncEnabled = XmarksBYOS.gSettings.pinNoPrompt != null;
                        if(!passwordSyncEnabled){
                            d.getElementById("sync-passwords").checked = false; 
                        }
                        if(result.doSync){
                            XmarksBYOS.gSettings.setSyncEnabled("passwords",
                                passwordSyncEnabled);
                            if(this.mgr.synchronizeNow()){
                                var prefwindow = 
                                    document.getElementById("foxmarks-settings");
                                prefwindow.showPane(
                                    document.getElementById("foxmarks-mainpane")
                                );
                            }
                        }
                    }
                }
                else if(!passwordSyncEnabled){
                    XmarksBYOS.gSettings.removePIN();
                }

                XmarksBYOS.gSettings.setSyncEnabled("passwords",passwordSyncEnabled); 
                d.getElementById("sync-resetpin").disabled =
                    !passwordSyncEnabled; 
           },
           handleBookmarkSync: function(){
                var d = document;
                var enabled =d.getElementById("sync-bookmarks").checked; 

                XmarksBYOS.gSettings.setSyncEnabled("bookmarks",enabled); 
           },
           doDeletePasswords: function(){
                var ps = Components.classes
                    ["@mozilla.org/embedcomp/prompt-service;1"]
                    .getService(Components.interfaces.nsIPromptService);
               if(ps.confirm(null,"Xmarks", XmarksBYOS.Bundle().
                    GetStringFromName("msg.deletepasswords.confirm"))
               ){
                    this.mgr.onOK();
                    if(!XmarksBYOS.PerformAction("deletepasswords", null)){
                        XmarksBYOS.gSettings.setSyncEnabled("passwords", false);
                        document.getElementById("sync-passwords").checked = 
                            false; 
                        document.getElementById("sync-resetpin").disabled =
                            true;
                        XmarksBYOS.gSettings.removePIN();
                        ps.alert(null, "Xmarks", XmarksBYOS.Bundle().
                                GetStringFromName("msg.deletepasswords.success")
                        );
                    }
                    else {
                        var prefwindow = 
                            document.getElementById("foxmarks-settings");
                        prefwindow.showPane(
                                document.getElementById("foxmarks-mainpane")
                        );
                    }
               }

           },
           doResetPIN: function(){
                var result = {
                    doSync: false
                };
                window.openDialog(
                    "chrome://xmarksbyos/content/foxmarks-resetpin.xul",
                    "_blank",
                    "chrome,dialog,modal,centerscreen", result);
                if(result.doSync){
                    XmarksBYOS.gSettings.setSyncEnabled("passwords",true); 
                   XmarksBYOS.gSettings.setMustUpload("passwords", true);
                   if(!this.mgr.synchronizeNow()){
                        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().
                            GetStringFromName("msg.resetpin.success"));
                   }
                    else {
                        var prefwindow = 
                            document.getElementById("foxmarks-settings");
                        prefwindow.showPane(
                                document.getElementById("foxmarks-mainpane")
                        );
                    }
                }
            },
            moreSyncSoon: function(){
                XmarksBYOS.FoxmarksOpenInNewWindow("http://wiki.xmarks.com/wiki/Foxmarks:_More_Syncing_Coming_Soon"); 
            }
        },
        // Advanced tab
        advanced: { 
           onSetup: function(mgr){
                this.data = {
                    enableLogging: XmarksBYOS.gSettings.enableLogging,
                    url: XmarksBYOS.gSettings.url,
                    passwordurl: XmarksBYOS.gSettings.passwordurl
                };
           },
           verifyOK: function(){

                var s = document.getElementById("url").value;
                if(s.length == 0){
                    return true;
                }

                if(s == document.getElementById("passwordurl").value){
                    XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().
                        GetStringFromName("error.1011"));
                    return false;
                }
                var exp = /(.*):\/\/([^\/]*)/;
                var result = s.match(exp);
                if (!result || result.length < 2) {
                    XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().
                        GetStringFromName("error.nourlownserver"));
                    return false;
                }

                return true;
           },
           onOK: function(){
                XmarksBYOS.gSettings.url = 
                    document.getElementById("url").value;
                XmarksBYOS.gSettings.passwordurl =
                    document.getElementById("passwordurl").value;
                return true;
           },
           onCancel: function(){
                var name;
                for(name in this.data){
                    if(this.data.hasOwnProperty(name)){
                        XmarksBYOS.gSettings[name] = this.data[name];
                    }
                }
           },
           displayLogFile: function() {
                var ios = Cc["@mozilla.org/network/io-service;1"].
                    getService(Ci.nsIIOService);
                var file = Cc['@mozilla.org/file/directory_service;1']
                    .getService(Ci.nsIProperties) .get('ProfD', Ci.nsIFile);

                file.append("xmarksbyos.log");
                var uri = ios.newFileURI(file);
                XmarksBYOS.FoxmarksOpenInNewWindow(uri.spec);
           },
                           /*
           useOwnServer: function(){
                var uo = document.getElementById("useown").checked;
                if(!uo){
                    return true;
                }
                    
                var params = {
                    url: document.getElementById("url").value,
                    purl: document.getElementById("passwordurl").value,
                    psync: document.getElementById("sync-passwords").checked,
                    result: false
                };
                window.openDialog(
                    "chrome://xmarksbyos/content/foxmarks-ownserverdlg.xul",
                    "_blank",
                    "chrome,dialog,modal,centerscreen", params);
                if(params.result){
                    document.getElementById("url").value = params.url;
                    document.getElementById("passwordurl").value = params.purl;
                } else {
                    document.getElementById("useown").checked = false;
                }
                this.useOwnServerChanged();
                return true;
           },
           */
           moreOwnServer: function(){
                XmarksBYOS.FoxmarksOpenInNewWindow("http://wiki.xmarks.com/wiki/Foxmarks:_Frequently_Asked_Questions#Using_Other_Servers"); 
           }
        }
    },

    _forEachPane: function(method, args){
        var name;
        for(name in this.panes){
            if(this.panes.hasOwnProperty(name)){
                var pane = this.panes[name];
                if(typeof(method) == "string"){
                    pane[method].apply(pane, args);
                }
                else {
                    if(args === undefined){
                        args = [];

                    }
                    args.splice(0,0,this.panes[name]);
                    method.apply(pane, args);
                }
            }
        }
    },

    onSetup: function(){
        this._forEachPane("onSetup", [this]);

        // Set styles for Mac OS X
        if (navigator.platform.toLowerCase().indexOf('mac') > -1 ||
            navigator.platform.toLowerCase().indexOf('linux') > -1) {
            document.getElementById("foxmarks-settings").className = "macosx";
        }

        // Info that is read-only
        this._lastSyncDateChanged();
        document.getElementById("version").value = 
            "v"
            + XmarksBYOS.FoxmarksVersion();
        try {
            window.sizeToContent();
        } catch(e) {}

        var prefwindow = document.getElementById("foxmarks-settings");
        prefwindow.showPane(
            document.getElementById(window.arguments[0] || "foxmarks-mainpane")
        );

    },
    onOK: function(){
        if(!this.panes.advanced.verifyOK()){
           return false;
        }
        this._forEachPane("onOK");
        XmarksBYOS.gSettings.password = 
            document.getElementById("password").value;
        return true;
    },
    onCancel: function(){
        if (navigator.platform.toLowerCase().indexOf('mac') > -1 ||
            navigator.platform.toLowerCase().indexOf('linux') > -1) {
            if(!this.panes.advanced.verifyOK()){
                return false;
            }
            this._forEachPane("onOK");
        }
        else {
            this._forEachPane("onCancel");
        }
        return true;
    },
    onHelp: function(){
        XmarksBYOS.FoxmarksOpenInNewWindow("http://wiki.xmarks.com/wiki/Foxmarks:_Help");
    },
    synchronizeNow: function() {
        var retval = 0;
        if(this.onOK()){
            var retval = XmarksBYOS.PerformAction("synch", null);
            this._lastSyncDateChanged();
            this.panes.general.resetNameAndPassword();
            this.panes.sync.resetSyncTypes();
        }
        return retval;
    },
    _lastSyncDateChanged: function() {
        document.getElementById("lastSynchDate").value = 
            XmarksBYOS.gSettings.lastSynchDisplayDate;
    },
    uploadNow: function(){
        var retval = 0;
        var ps = Components.classes
            ["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);
        if (ps.confirm(null, "Xmarks",
            XmarksBYOS.Bundle().GetStringFromName("msg.overwriteremote"))) {
            if(this.onOK()){
                retval = XmarksBYOS.PerformAction("upload", null);
                if(retval){
                var prefwindow = document.getElementById("foxmarks-settings");
                prefwindow.showPane(
                        document.getElementById("foxmarks-mainpane")
                );
                }
                this._lastSyncDateChanged();
            }
        }
        return retval;
    },
    downloadNow: function(silent){
        var retval = 0;
        var ps = Components.classes
            ["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);
        if (silent
            || ps.confirm(null, "Xmarks",
                XmarksBYOS.Bundle().GetStringFromName("msg.overwritelocal"))) {
            if(this.onOK()){
                retval = XmarksBYOS.PerformAction("download", null);
                if(retval){
                var prefwindow = document.getElementById("foxmarks-settings");
                prefwindow.showPane(
                        document.getElementById("foxmarks-mainpane")
                );
                }
                this._lastSyncDateChanged();
            }
        }
        return retval;

    },
    onUnload: function(){
        this.panes.status.onUnload();
    }
};



function SynchronizeForever() {
    while (!SynchronizeNow()) { };
}



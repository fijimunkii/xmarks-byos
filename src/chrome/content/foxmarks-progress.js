/* 
 Copyright 2005-2008 Foxmarks Inc.
 
 foxmarks-progress.js: handles the UI and top-level logic for
 merge, sync, upload, and download operations.
  
 */

var gCancelled;
var gQuick;
var gSyncTypes = ["bookmarks", "passwords"];

var gXmarksByosNewObserver = {
    _document: null,
    _window: null,

    observe: function(subject, topic, data) {
        var result = eval(data);
        //LogWrite("Progress: " + data);
        if (this._document) {
            if(result.status == 3){
                var label = this._document.getElementById(result.component);
                if(label){
                    label.setAttribute("value",  result.phase == "end" ?
                        XmarksBYOS.Bundle().GetStringFromName("progress.sync.done") :
                        XmarksBYOS.Bundle().GetStringFromName("progress.sync.working")
                    );
                }
                var image =this._document.getElementById(result.component + "-check");
                if(image){
                    image.setAttribute("src", result.phase == "end" ?
                        "chrome://xmarksbyos/skin/images/progress-good.png":
                        "chrome://xmarksbyos/skin/images/wheel.gif"
                    );
                }
            }
            else if (result.status != 1) { // complete?
                this._window.arguments[1].status = result.status;
                this._window.arguments[1].msg = result.msg;
                this._window.arguments[1].result = result;
                if (gQuick) {
                    setTimeout(this._window.close, 1000);
                } else {
                    gCancelled = true;
                    setTimeout(this._window.close, 100);
                }
            }
        }        
        try {
            this._window.sizeToContent();
        } catch(e) {}
    },

    adjustDialogButtons: function(status) {
        var d = this._document.documentElement;
        var help = d.getButton("help");
        help.hidden = (status >= 0 && status <= 2);
        var cancel = d.getButton("cancel");
        cancel.hidden = (status != 1);
        try {
            this._window.sizeToContent();
        } catch(e) {}
    }
};

var gFoxmarksService = null;
var Cc = Components.classes;
var Ci = Components.interfaces;

function onProgressLoad() {
    gCancelled = false;
    gQuick = false;

    // get reference to foxmarks-service to process the request
    gFoxmarksService = Cc["@xmarks.com/extensions/xmarksbyos;1"].
        getService(Ci.nsIXmarksByosService);

    var os = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);
    gXmarksByosNewObserver._document = document;
    gXmarksByosNewObserver._window = window;
    os.addObserver(gXmarksByosNewObserver, "xmarksbyos-service", false);
    
    var okay = false;

    switch (window.arguments[0]) {
        case "upload":
            gQuick = false;
            okay = gFoxmarksService.upload();
            break;
        
        case "download":
            gQuick = false;
            okay = gFoxmarksService.download();
            break;
        
        case "deletepasswords":
            gQuick = false;
            document.getElementById("lineitems").setAttribute("hidden", "true");
            okay = gFoxmarksService.purgepasswords();
            break;
        case "synch":
            gQuick = false;
            okay = gFoxmarksService.synchronize();
            break;

        case "status":
            gQuick = true;
            okay = gFoxmarksService.status();
            break;
            
        case "initialSync":
            var ca = window.arguments[2];
            gQuick = true;
            okay = gFoxmarksService.synchronizeInitial(ca.remoteIsMaster, 
                ca.merge);
            break;
    }

    var len = gSyncTypes.length;
    var x;
    for(x = 0; x < len; x++){
        var type = gSyncTypes[x];
        var label = document.getElementById(type);
        label.setAttribute("value", XmarksBYOS.gSettings.isSyncEnabled(type) ?
            XmarksBYOS.Bundle().GetStringFromName("progress.sync.enabled") :
            XmarksBYOS.Bundle().GetStringFromName("progress.sync.disabled")
        );
    }

    if (!okay) {
        // Service is busy. Disconnect the observer and simulate a
        // "busy" status message.
        onProgressUnload();
        gXmarksByosNewObserver.observe(null, null,
            { msg: XmarksBYOS.Bundle().GetStringFromName("msg.busy"), status: 4 }.
            toSource());
    }
}

function onProgressUnload() {
    var os = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);
    try {
        os.removeObserver(gXmarksByosNewObserver, "xmarksbyos-service");
    } catch (e) {
        LogWrite("Warning: removeObserver failed.");
    }
}

function onProgressCancel() {
    gFoxmarksService.cancel();
  
    // the first time through, just let callbacks from the cancellation
    // requests above shut us down
    // if we somehow got stuck, allow a second press of the cancel
    // button to actually shut the dialog box down.
    
    if (gCancelled) {
        window.arguments[1].status = -1;
        window.arguments[1].msg = XmarksBYOS.Bundle().GetStringFromName("msg.cancelled");
        return true;
    } else {
        gCancelled = true;
        return false;   // let the callbacks close us down
    }
}

function onProgressHelp() {
    var element = document.getElementById("status");
    if (element) {
        var errmsg = element.value.replace(/ /g, "_");
        window.arguments[1].helpurl =
            XmarksBYOS.Bundle().formatStringFromName("url.error", [errmsg], 1);
        setTimeout(window.close, 100);
    }
    return false;
}

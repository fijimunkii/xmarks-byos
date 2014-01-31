/* 
 Copyright 2005-2007 Foxmarks Inc.

 foxmarks-overlay.js: implement the foxmarks overlay into the main browser
 window
 */

var XmarksBYOS;
if(XmarksBYOS === undefined){
    XmarksBYOS = {};
}

(function() {
var xm = XmarksBYOS;
var foxmarksObserver = {
    observe: function(subject, topic, data) {
        var result = eval(data);
        //ignore component finish messages
        if(result.status == 3)
            return;
        var status = result.status;
        var msg = result.msg || "";
        var complete = status != 1;

        window.XULBrowserWindow.setJSStatus("Xmarks: " + msg);

        if (complete) {
            setTimeout(foxmarksObserver.clearStatus, status != 0 ? 5000: 1000);
        }
    },
    clearStatus: function() {
        window.XULBrowserWindow.setJSStatus("");
     }
};

var foxmarksPopupObserver = {
    observe: function(subject, topic, data) {
        xm.FoxmarksOpenWizard(false, false);
    }
};
var foxmarksXmarksRunningObserver = {
    observe: function(subject, topic, data) {
        xm.FoxmarksOpenWindowByType("foxmarks:setup",
            "chrome://xmarksbyos/content/foxmarks-byosconflict.xul",
            "chrome,centerscreen,dialog=yes");
    }
};
xm.FoxmarksSetKeyboardShortcut = function(id, key) {
    var element = document.getElementById(id);
    element.setAttribute("key", key);
    element.setAttribute("disabled", key ? false : true);
};

xm.FoxmarksBrowserLoad = function() {
    var os = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);
    os.addObserver(foxmarksObserver, "xmarksbyos-service", false);
    os.addObserver(foxmarksPopupObserver, "xmarksbyos-newpopup", false);
    os.addObserver(foxmarksXmarksRunningObserver, 
            "xmarksbyos-xmarksrunning", false);

    xm.FoxmarksSetKeyboardShortcut("SyncNow", xm.gSettings.syncShortcutKey);
    xm.FoxmarksSetKeyboardShortcut("OpenFoxmarksDialog",
        xm.gSettings.openSettingsDialogShortcutKey);

};

xm.FoxmarksOnPopupShowing = function() {
    if (xm.gSettings.hideStatusIcon) {
        document.getElementById("foxmarks-showstatusicon").
            removeAttribute("checked");
    } else {
        document.getElementById("foxmarks-showstatusicon").
            setAttribute("checked", "true");
    }
    return true;
};

xm.FoxmarksToggleIcon = function(event) {
    xm.gSettings.hideStatusIcon = !xm.gSettings.hideStatusIcon;
};

xm.FoxmarksBrowserUnload = function() {
    var os = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);

    try {
        os.removeObserver(foxmarksObserver, "xmarksbyos-service");
    } catch (e) {
        LogWrite("Warning: removeObserver failed.");
    }
};

window.addEventListener("load", xm.FoxmarksBrowserLoad, false);
window.addEventListener("unload", xm.FoxmarksBrowserUnload, false);

})();

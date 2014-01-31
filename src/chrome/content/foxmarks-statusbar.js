/* 
 Copyright 2007-2009 Xmarks Inc.

 foxmarks-statusbar.js: implement the foxmarks status bar
 */

var XmarksBYOS;
if(XmarksBYOS === undefined){
    XmarksBYOS = {};
}

(function() {
var Cc = Components.classes;
var Ci = Components.interfaces;
var CCon = Components.Constructor;

var xm = XmarksBYOS;
xm.STATE_MAP = {
    ready: { src: "chrome://xmarksbyos/skin/images/ready.png", 
        tooltip: "icon.tooltip.ready" },
    dirty: { src: "chrome://xmarksbyos/skin/images/dirty.png",
        tooltip: "icon.tooltip.dirty" },
    working: { src: "chrome://xmarksbyos/skin/images/wheel_16.gif",
        tooltip: "icon.tooltip.working2" },
    error: { src: "chrome://xmarksbyos/skin/images/error.png",
        tooltip: "icon.tooltip.error" }
};


var XmarksByosStateObserver = {
    observe: function(subject, topic, data) {
        xm.UpdateStateIndicator(data);
    }
}

xm.UpdateStateIndicator = function(state) {
    if (state == "hide" || state == "show") {
        xm.UpdateHiddenState();
    } else {
        var panel = document.getElementById("xmarksbyos-statusimage");
        panel.src = xm.STATE_MAP[state].src;
        panel.tooltipText = Cc["@mozilla.org/intl/stringbundle;1"].
            getService(Ci.nsIStringBundleService).
            createBundle("chrome://xmarksbyos/locale/foxmarks.properties").
            GetStringFromName(xm.STATE_MAP[state].tooltip);
    }
};


xm.UpdateHiddenState = function(state) {
    if (state == null) {
        state = xm.gSettings.hideStatusIcon;
    } else {
        xm.gSettings.hideStatusIcon = state;
    }
    document.getElementById("xmarksbyos-statusbarpanel").hidden = state;
};

function StatusBarLoad() {
    var os = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);
    os.addObserver(XmarksByosStateObserver, "xmarksbyos-statechange", false);

    var foxmarks = Cc["@xmarks.com/extensions/xmarksbyos;1"].
        getService(Ci.nsIXmarksByosService);
    var state = foxmarks.getState();
    xm.UpdateStateIndicator(state);
    xm.UpdateHiddenState();

    return;
}

function StatusBarUnload() {
    var os = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);

    try {
        os.removeObserver(XmarksByosStateObserver, "xmarksbyos-statechange");
    } catch (e) {
        LogWrite("Warning: removeObserver failed.");
    }
}

window.addEventListener("load", StatusBarLoad, false);
window.addEventListener("unload", StatusBarUnload, false);
})();

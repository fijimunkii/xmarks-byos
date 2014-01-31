/* 
 Copyright 2009 Xmarks Inc.

 foxmarks-byossetup.js: helper js for initial dialog

 */
var Cc = Components.classes;
var Ci = Components.interfaces;

function OnOK(){
    var os = this.Cc["@mozilla.org/observer-service;1"].
        getService(this.Ci.nsIObserverService);

    os.notifyObservers(null, "xmarksbyos-showsettingpane","foxmarks-mainpane"); 
}

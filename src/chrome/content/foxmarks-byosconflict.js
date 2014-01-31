/* 
 Copyright 2009 Xmarks Inc.

 foxmarks-byossetup.js: helper js for byos conflict dialog

 */
var Cc = Components.classes;
var Ci = Components.interfaces;
var CCon = Components.Constructor;

function UninstallExt(id){
    var em= Cc['@mozilla.org/extensions/manager;1']
        .getService(Ci.nsIExtensionManager);

    em.uninstallItem(id);
    
    var ap = Cc['@mozilla.org/toolkit/app-startup;1']
        .getService(Ci.nsIAppStartup);
    ap.quit(Ci.nsIAppStartup.eAttemptQuit|Ci.nsIAppStartup.eRestart);
}

function UninstallXmarks(){
    UninstallExt("foxmarks@kei.com");
    return true;
}
function UninstallBYOS(){
    UninstallExt("byos@xmarks.com");
    return true;
}

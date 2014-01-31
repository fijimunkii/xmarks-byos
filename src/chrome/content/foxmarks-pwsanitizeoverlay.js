/*
 Copyright 2007-2008 Foxmarks Inc.

 foxmarks-pwsanitizeoverlay.js: component that tells password that it
 needs to check for changes.

 */

window.addEventListener("unload",
    function(){
        var checklist = document.getElementsByTagName("checkbox");
        var ctr = checklist.length;
        while(ctr--){
            var el = checklist[ctr];
            var prefname = el.getAttribute('preference');
            if(el.checked && prefname=="privacy.item.passwords"){
                var lm = Date.now();
                var os = Components.classes["@mozilla.org/observer-service;1"]
                    .getService(Components.interfaces.nsIObserverService);
                os.notifyObservers(null, "xmarksbyos-checkforpasswordchange", 
                    lm);
            }
        }
    }, 
    false);


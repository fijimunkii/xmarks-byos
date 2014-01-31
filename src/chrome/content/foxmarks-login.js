/*
 Copyright 2008 Foxmarks Inc.

 foxmarks-login.js: Implements the client-side behavior for Account Manager.

 */


var firstTime = true;

function FoxmarksLoginOnLoad() {
    var iframe = document.getElementById("foxmarks-iframe");
    if (firstTime) {
        iframe.addEventListener("DOMContentLoaded", FoxmarksIFrameOnLoad, true);
        firstTime = false;
    } else {
        iframe.setAttribute("src", "");
    }

    var url = XmarksBYOS.gSettings.wizardUrl;
    var params = [];
    if (XmarksBYOS.gSettings.username) {
        params.push("_username=" + XmarksBYOS.gSettings.username);
    }
    params.push("_app=jezebel");
    params.push("_version=" + XmarksBYOS.FoxmarksVersion()); 
    params.push("_remempw=" + (XmarksBYOS.gSettings.rememberPassword ? "on" : "off"));
    params.push("_mid=" + XmarksBYOS.gSettings.machineId);
    params.push("_manual=" + window.arguments[0]);
    XmarksBYOS.gSettings.sessionID = Date.now().toString(36);
    params.push("_sess=" + XmarksBYOS.gSettings.sessionID);


    if (params.length) {
        url += ("?" + params.join("&"));
    }

    iframe.setAttribute("src", url);
}

function FoxmarksIFrameOnLoad(event) {
    var pathname = event.originalTarget.location.pathname;
    var query = event.originalTarget.location.search;
    
    // Extract values from DOM.
    try {
        var form = event.originalTarget.getElementById("user_account_form");
        var formKids = [];
        if(form){
            formKids = form.childNodes;
        }
    } catch (e) {
        var ps = Components.classes
            ["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);
        if (ps.confirm(null, "Xmarks",
                    XmarksBYOS.Bundle().GetStringFromName("msg.nosetupwizard"))) {
            FoxmarksLoginOnLoad();  // restart it
            return;
        } else {
            window.close();
            return;
        }
    }

    var obj = {};
    for (var i = 0; i < formKids.length; ++i) {
        if (formKids[i].name) {
            obj[formKids[i].name] = formKids[i].value;
        }
    }

    if (obj["_flag"] == 'cancel') {
        if (XmarksBYOS.FoxmarksOnWizardCancel()) {
            window.close();
        }
    } else if (obj["_flag"] == 'done') {
        XmarksBYOS.gSettings.username = obj["_username"];
        XmarksBYOS.gSettings.password = obj["_password"];
        XmarksBYOS.gSettings.rememberPassword = (obj["_remempw"] == "on");
        window.close();
        var win = 
            window.openDialog("chrome://xmarksbyos/content/foxmarks-setup.xul",
                "Xmarks", "chrome", window.arguments[0], "normal");
            win.moveTo(window.screenX, window.screenY);
    }
}


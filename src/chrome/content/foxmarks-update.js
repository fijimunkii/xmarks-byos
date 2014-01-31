/*
 Copyright 2005-2007 Foxmarks Inc.

 foxmarks-update.js: implements interface to Firefox extensions manager for
 handling updates of the extension.

 */


var em;
var Ci = Components.interfaces;
var Cc = Components.classes;

function ForceUpdate() {
    // find a window to use as a parent for open
    var topwin = Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator).
        getMostRecentWindow(null);

    // first, open the extension manager window
    em = topwin.
     open("chrome://mozapps/content/extensions/extensions.xul?type=extensions",
        "_blank", "chrome,dialog=no,resizable");
    em.addEventListener("pageshow", ExtensionManagerShow, false);

    function ExtensionManagerShow(arg) {
    const id = "urn:mozilla:item:foxmarks@kei.com";

        // find our entry in the extension manager's view
        with (em) {
            var children = gExtensionsView.children;

            while (children.length > 0) {
                var item = children.shift()

                if (item.id == id) {       // found it, install it
                    gExtensionsView.selectedItem = item;
                    var updateitem = gExtensionManager.
                        getItemForID("foxmarks@kei.com");
                    var listener = new FoxmarksUpdateCheckListener();
                    gExtensionManager.update([updateitem], 1, false, listener);
                    break;
                }
            }
        }
    }
}

function FoxmarksUpdateCheckListener() {
}

FoxmarksUpdateCheckListener.prototype = {
    onUpdateStarted: function() {
        LogWrite("onUpdateStarted");
    },

    onUpdateEnded: function() {
        LogWrite("onUpdatedEnded");
    },

    onAddonUpdateStarted: function(addon) {
        LogWrite("onAddonUpdateStarted");
    },

    onAddonUpdateEnded: function(addon, status) {
        LogWrite("onAddonUpdatedEnded, status = " + status);

        const nsIAUCL = Components.interfaces.nsIAddonUpdateCheckListener;
        switch (status) {
            case nsIAUCL.STATUS_UPDATE:
              em.gExtensionManager.addDownloads([addon], 1, true);
              break;
            case nsIAUCL.STATUS_FAILURE:
              break;
            case nsIAUCL.STATUS_DISABLED:
              break;
        }
    },

    /**
    * See nsISupports.idl
    */
    QueryInterface: function(iid) {
        if (!iid.equals(Components.interfaces.nsIAddonUpdateCheckListener) &&
            !iid.equals(Components.interfaces.nsISupports))
                throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    }
}

function UpdateNag() {
    var sb = XmarksBYOS.Bundle().GetStringFromName;

    if (Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
      getService(Components.interfaces.nsIPromptService).
      confirm(null, sb("appname.long"), sb("msg.upgradeAvailable"))) {
      ForceUpdate();
    }
}

function Handle403(response)
{
    /*
    var sb = XmarksBYOS.Bundle().GetStringFromName;
    if (response.status == 403 && response.message == "Upgrade required") {
        LogWrite("Upgrade required.");
        var infoURL = response.url; 
        if (!infoURL) {
            if (Cc["@mozilla.org/embedcomp/prompt-service;1"].
                getService(Ci.nsIPromptService).
                confirm(null, sb("appname.long"), 
                    sb("msg.upgraderequired"))) {
                ForceUpdate();
            }
        } else {
            if (Cc["@mozilla.org/embedcomp/prompt-service;1"].
                getService(Ci.nsIPromptService).
                confirm(null, sb("appname.long"), sb("msg.emergencyupgrade"))) {
                Cc['@mozilla.org/appshell/window-mediator;1'].
                getService(Ci.nsIWindowMediator).
                getMostRecentWindow("navigator:browser").
                openDialog("chrome://browser/content/browser.xul", "_blank",
                    "chrome,all,dialog=no", infoURL);
            }
        }
    } else {
        LogWrite("False alarm? " + response.toSource());
    } 
    */
}


/* 
 Copyright 2009 Xmarks Inc.

 foxmarks-uitools.js: Various and sundry UI functions. 

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

xm.FoxmarksOpenWindowByType = function(inType, uri, features, args) {
    var wm = Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator);
    var topWindow = wm.getMostRecentWindow(inType);

    if (topWindow) {
        topWindow.focus();
    } else {
        topWindow = wm.getMostRecentWindow(null);
        var win = topWindow.openDialog(uri, "_blank", features || "chrome",
            args);
    }
};

xm.FoxmarksOpenInNewTab = function(url, focus, postData) {
    var wm = Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator);
    var topWindow = wm.getMostRecentWindow('navigator:browser');
    if (topWindow) {
        var content = topWindow.document.getElementById('content');
        if(postData !== undefined){
            var stringStream = Cc["@mozilla.org/io/string-input-stream;1"].
                createInstance(Ci.nsIStringInputStream);
            var txt = postData.toJSONString();
            if ("data" in stringStream) // Gecko 1.9 or newer
                    stringStream.data = txt;
            else // 1.8 or older
                stringStream.setData(txt, txt.length);
                               
            var pd = Cc["@mozilla.org/network/mime-input-stream;1"].
                           createInstance(Ci.nsIMIMEInputStream);
            pd.addHeader("Content-Type", "application/json");
            pd.addContentLength = true;
            pd.setData(stringStream);

            content.selectedTab =
                content.addTab(url, null,null , pd);
        } else {
            content.selectedTab =
                content.addTab(url);
        }
        if (focus) {
            topWindow.focus();
        }
    }
};

xm.FoxmarksOpenInNewWindow = function(url) {
    openDialog("chrome://browser/content/browser.xul", "_blank",
        "chrome,all,dialog=no", url);
};

xm.OpenFoxmarksSettingsDialog = function(pane) {
    xm.FoxmarksOpenWindowByType("foxmarks:settings",
        "chrome://xmarksbyos/content/foxmarks-dialog.xul", 
        "chrome,toolbar,centerscreen",
        [pane || "foxmarks-mainpane"]);
};

xm.FoxmarksOpenWizard = function(manual, skipAuth) {
    if(!xm.gSettings.url || !xm.gSettings.username){
        xm.FoxmarksOpenWindowByType("foxmarks:setup",
            "chrome://xmarksbyos/content/foxmarks-byossetup.xul",
            "chrome,centerscreen,dialog=no", manual);
    }
};

xm.FoxmarksOnWizardCancel = function() {
    var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(Components.interfaces.nsIPromptService);

    var checkResult = {};
    checkResult.value = xm.gSettings.wizardSuppress;
    var sb = xm.Bundle();

    var ret = ps.confirmCheck(window, sb.GetStringFromName("title.cancelsetup"),
            sb.GetStringFromName("msg.cancelsetup"),
            sb.GetStringFromName("msg.nowizard"),
            checkResult);

    xm.gSettings.wizardSuppress = checkResult.value;
    xm.gSettings.majorVersion = 1;

    return ret;
};

xm.FoxmarksSynch = function() {
    xm.PerformAction("synch");
};

xm.FoxmarksOpenStatusWindow = function() {
    xm.PerformAction("showStatus");
};

xm.PerformAction = function(action, arg) {
    var retval = { helpurl: null };

    try {
        var win = window.openDialog(
            "chrome://xmarksbyos/content/foxmarks-progress.xul", "_blank",
            "chrome,dialog,modal,centerscreen", action, retval, arg);
        if (retval.helpurl) {
            xm.FoxmarksOpenInNewWindow(retval.helpurl);   
        }
    } catch (e) {
       // xm.FoxmarksAlert(e.message);
    }
    /*
    if (retval.status == 401) {
        xm.FoxmarksAlert(xm.Bundle().GetStringFromName("msg.invalidcredentials"));
    }
    */
    return retval.status;
};

var XmarksDataServiceObserver = {
    os: Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService),

    observe: function(subject, topic, data) {
        var result = eval("(" + data + ")");
        this.os.removeObserver(this, "xmarksbyos-dataservice");
        if (this.spinner) {
            this.spinner.hidden = true;
        }
        if (this.callback) {
            var callback = this.callback;
            this.callback = null;
            callback(result);
        }
    },

    start: function(text, spinner, callback) {
        this.os.addObserver(this, 
                "xmarksbyos-dataservice", false);
        this.text = text;
        this.spinner = spinner;
        this.callback = callback;
        if (this.spinner) {
            this.spinner.hidden = false;
        }
    }
};
var XmarksServiceObserver = {
    os: Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService),

    observe: function(subject, topic, data) {
        var result = eval("(" + data + ")");
        if (this.text) {
            this.text.value = result.msg;
        }
        if (result.status != 1 && result.status != 3) {
            this.os.removeObserver(this, "xmarksbyos-service");
            if (this.spinner) {
                this.spinner.hidden = true;
            }
            if (this.callback) {
                var callback = this.callback;
                this.callback = null;
                callback(result);
            }
        }
    },

    start: function(text, spinner, callback) {
        this.os.addObserver(XmarksServiceObserver, "xmarksbyos-service", false);
        this.text = text;
        this.spinner = spinner;
        this.callback = callback;
        if (this.spinner) {
            this.spinner.hidden = false;
        }
    }
}

xm.VerifyPINStatus = function(pin, text, spinner, callback) {
    var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
        getService(Ci.nsIXmarksByosService);
    XmarksServiceObserver.start(text, spinner, callback);
    fms.verifypin(pin);
};

xm.FetchAccountStatus = function(syncType, text, spinner, callback) {
    var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
        getService(Ci.nsIXmarksByosService);
    XmarksServiceObserver.start(text, spinner, callback);
    fms.status(syncType);
};

xm.FetchAccountExtStatus = function(syncType, text, spinner, callback) {
    var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
        getService(Ci.nsIXmarksByosService);
    XmarksServiceObserver.start(text, spinner, callback);
    fms.extstatus(syncType);
};

var inputTimer;
xm.handlePasswordMeter = function(id){
    if(inputTimer){
        window.clearTimeout(inputTimer);
        inputTimer = undefined;
    }

    inputTimer = window.setTimeout(function(){
        var txt = document.getElementById(id).value;
        var result = TestPassword(txt);

        if(result * 5 > 200 || result > 24){
            result = 40;
        }
        document.getElementById('passwordmeter').width = result * 5;
        if(txt.length < 4){
            document.getElementById('passwordStrength').style.color = 
                "#333";
            document.getElementById('passwordmeter').style.backgroundColor = 
                "#999";

            document.getElementById('passwordStrength').value =
                xm.Bundle().GetStringFromName("password.tooshort");
        }
        else if(result < 17){
            document.getElementById('passwordStrength').value =
                xm.Bundle().GetStringFromName("password.weak");
            document.getElementById('passwordStrength').style.color = 
                "#57040F";
            document.getElementById('passwordmeter').style.backgroundColor = 
                "#57040F";
        }
        else if(result < 24){
            document.getElementById('passwordStrength').value =
                xm.Bundle().GetStringFromName("password.good");
            document.getElementById('passwordStrength').style.color = 
                "#ED9D2B";
            document.getElementById('passwordmeter').style.backgroundColor = 
                "#ED9D2B";
        }
        else {
            document.getElementById('passwordStrength').value =
                xm.Bundle().GetStringFromName("password.strong");
            document.getElementById('passwordStrength').style.color = 
                "#2A911B";
            document.getElementById('passwordmeter').style.backgroundColor = 
                "#2A911B";

        }
        inputTimer = undefined;
        /*
        if(window)
            window.sizeToContent();

        */
    }, 500);
};

})();

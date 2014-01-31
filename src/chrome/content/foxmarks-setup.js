/* 
 Copyright 2005-2008 Foxmarks Inc.
 
 foxmarks-setup.js: implements behavior for the Foxmarks Setup Wizard.
   
 */


var gIsEmpty;
var gHasProfiles;
var pProfileNames;
var gHelpUrl;
var gPasswordsNeedUpload = false;

var gWizardMode = "normal";
var gWizardForgotPassword = false;

function OnWizardCancel() {
    if(gWizardMode == "normal"){
        var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);

        var checkResult = {};
        checkResult.value = XmarksBYOS.gSettings.wizardSuppress;
        var sb = XmarksBYOS.Bundle();

        var ret = ps.confirmCheck(window, sb.GetStringFromName("title.cancelsetup"),
                sb.GetStringFromName("msg.cancelsetup"),
                sb.GetStringFromName("msg.nowizard"),
                checkResult);

        XmarksBYOS.gSettings.wizardSuppress = checkResult.value;
        XmarksBYOS.gSettings.majorVersion = 1;

        return ret;
    }
    else
        return true;
}
function OnWizardLoad(){
    var wizard = document.documentElement;
    var sb = XmarksBYOS.Bundle();
    if(window.arguments[1] !== undefined)
        gWizardMode = window.arguments[1];
    else
        gWizardMode = "normal";

    if(gWizardMode == "resetPIN"){
        wizard.title = sb.GetStringFromName("wizard.resettitle");
        wizard.goTo("resetPIN");
    }
    else if(gWizardMode == "askforPIN"){
        wizard.title = sb.GetStringFromName("wizard.newtitle");
        wizard.goTo("passwordTransition");
    }
}

function HandleError(retval) {
    var wizard = document.documentElement;
    wizard.goTo("errorPage");
    document.getElementById("errormsg").value = retval.msg;
    var errmsg = retval.msg.replace(/ /g, "_");
    gHelpUrl = XmarksBYOS.Bundle().formatStringFromName("url.error", [errmsg], 1);
    wizard.canAdvance = true;
}

function OnTransitionPageShow() {
    /*

    We've just gained control back from the web-based setup wizard.
    1) Confirm that we can log in.
    2) Determine whether there are profiles.
    3) Determine whether there are server-side bookmarks.

    */
    // There is a timing issue; sometimes this doesn't get called first
    OnWizardLoad();
    if(gWizardMode != "normal")
        return;

    var spinner = document.getElementById("spinner");
    var status = document.getElementById("statusLabel");
    var wizard = document.documentElement;
    wizard.canAdvance = false;
    document.getElementById("profileMenuList").value = String(XmarksBYOS.gSettings.viewId);

    XmarksBYOS.FetchAccountStatus("bookmarks", status, spinner, FetchedStatus);

    function FetchedStatus(response) {
        if (response.status != 0) {
            HandleError(response);
            return;
        }

        gIsEmpty = response.isreset;

        if("@mozilla.org/login-manager;1" in Components.classes){
            wizard.getPageById("selectProfile").next = "syncPasswords";
        }
        else {
            wizard.getPageById("selectProfile").next = gIsEmpty ? 
                "execute" : "selectSyncOption"; 
        }

        FetchProfileNames(status, spinner,
            document.getElementById("profileMenuPopup"),
            FetchedProfileNames);
    }

    function FetchedProfileNames(response) {
        if (response.status != 0) {
            HandleError(response);
            return;
        }

        gHasProfiles = (response.count > 0);
        gProfileNames = response.profiles;
        // TODO: what should we do with this haveSynced
        wizard.getPageById("transition").next = 
            (gHasProfiles && !XmarksBYOS.gSettings.haveSynced) ?
            "selectProfile" : wizard.getPageById("selectProfile").next;
        wizard.canAdvance = true;
        if(gWizardMode == "normal")
            wizard.advance();
    }
}

function ForgotPIN(){
    var wizard = document.documentElement;

    wizard.goTo("forgotPIN");
}

function ForgotPINAdvance(){
    var wizard = document.documentElement;
    var resetPIN  = document.getElementById("forgotpinradio").selectedItem.value == "reset";
    if(resetPIN){
        wizard.currentPage.next = "resetPIN";
    }
    else {
        XmarksBYOS.gSettings.setSyncEnabled("passwords", false);
        window.close();
    }
    return true;
}
function ForgotPINRewind(){
    var wizard = document.documentElement;
    wizard.goTo('pinOld'); 
    return false;
}

function ResetPINLoad(){
    if(gWizardMode == "resetPIN"){
        var wizard = document.documentElement;
        var radio = document.getElementById("resetpinno");
        radio.label = XmarksBYOS.Bundle().GetStringFromName("wizard.changedmymind");
        wizard.canAdvance = true;
        wizard.canRewind = false;
    }
}

function SyncPasswordsLoad(){
    var wizard = document.documentElement;
    wizard.canRewind = false;

}
function ResetPINRewind(){
    var wizard = document.documentElement;
    wizard.goTo('forgotPIN'); 
    return false;
}

function ResetPINAdvance(){
    var wizard = document.documentElement;
    var resetPIN  =
        document.getElementById("resetpinradio").selectedItem.value == "1";
    if(resetPIN){
       XmarksBYOS.gSettings.setMustUpload("passwords", true);
       gWizardForgotPassword = true;
        wizard.currentPage.next = "pinNew";
    }
    else {
        if(gWizardMode == "normal"){
            XmarksBYOS.gSettings.setSyncEnabled("passwords", false);
            wizard.currentPage.next = gIsEmpty ? 
                "execute" : "selectSyncOption"; 
        }
        else {
            wizard.cancel();
        }
    }
    return true;

}
function SyncPasswordAdvance() {
    var wizard = document.documentElement;
    var syncPassword =
        document.getElementById("syncpasswordradio").selectedItem.value == "1";
    if(syncPassword){
        wizard.currentPage.next = "passwordTransition";
    }
    else {
        XmarksBYOS.gSettings.setSyncEnabled("passwords", false);
        wizard.currentPage.next = gIsEmpty ? 
            "execute" : "selectSyncOption"; 
    }
    return true;
}

function OnPasswordTransitionPageShow() {
    var spinner = document.getElementById("pin_spinner");
    var status = document.getElementById("pin_statusLabel");
    var wizard = document.documentElement;
    wizard.canAdvance = false;

    XmarksBYOS.FetchAccountExtStatus("passwords", status, spinner,function(response){ 
        if (response.status != 0) {
            if(response.status == 2){
                window.close();
            } else {
                HandleError(response);
            }
            return;
        }

        gPasswordsNeedUpload = response.isreset || response.ispurged;
        wizard.currentPage.next = gPasswordsNeedUpload ? "pinNew" : "pinOld";

        wizard.canAdvance = true;
        wizard.advance();
    });
}

function NewPINRewind(){
    if(gWizardMode == "resetPIN"){
        var wizard = document.documentElement;
        wizard.goTo("resetPIN");
        return false;
        
    }
    else if(gWizardForgotPassword){
        gWizardForgotPassword = false;       
        var wizard = document.documentElement;
        wizard.goTo("resetPIN");
        return false;
    }

    return GotoSyncPasswords();

}
function OldPinLoad(){
    if(gWizardMode == "askforPIN"){
        var wizard = document.documentElement;
        wizard.canRewind = false;
    }
}
function NewOrResetPassword(){
    var wizard = document.documentElement;
    var currpin = XmarksBYOS.gSettings.pinNoPrompt;
    if(currpin){
        if(gWizardMode == "resetPIN"){
            wizard.currentPage.label =
                XmarksBYOS.Bundle().GetStringFromName("wizard.resetpintitle");
        }
        else {
            wizard.currentPage.label =
                XmarksBYOS.Bundle().GetStringFromName("wizard.newpintitle");
        }
        wizard.currentPage.next = "resetpinVerified";
    }
    else if(gWizardMode == "askforPIN"){
        wizard.canRewind = false;
    }
}

function NewPasswordAdvance(){
    var wizard = document.documentElement;
    var pin = document.getElementById("newpin").value;
    var pin2 = document.getElementById("newpin2").value;

    if(!pin || pin.length < 4 || pin.length > 255){
        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName("error.pinWrongSize"));
        return false;
    }

    if(!pin2 || pin != pin2){
        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName("error.pinNoMatch"));
        return false;
    }

    if(pin == XmarksBYOS.gSettings.password){
        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName("error.pinEqualsPassword"));
        return false;
    }

    XmarksBYOS.gSettings.pin = pin;
    XmarksBYOS.gSettings.rememberPin = document.getElementById("rememberPin").checked;

    XmarksBYOS.gSettings.setSyncEnabled("passwords", true);
    if(gPasswordsNeedUpload){
        XmarksBYOS.gSettings.setMustUpload("passwords", true);
    }
    gWizardForgotPassword = false;       
    return true;
}

function OldPinAdvance(){
    XmarksBYOS.gSettings.rememberPin = document.getElementById("rememberPinOld").checked;
    return true;
}
function VerifyPIN(){
    var spinner = document.getElementById("vpin_spinner");
    var status = document.getElementById("vpin_statusLabel");
    var wizard = document.documentElement;
    var pin = document.getElementById("oldpin").value;
    wizard.canAdvance = false;

    if(!pin || pin.length < 4 || pin.length > 255){
        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName("error.pinWrongSize"));
        wizard.canAdvance = true;
        wizard.rewind();
        return;
    }

    XmarksBYOS.VerifyPINStatus(pin, status, spinner,function(response){ 
        if (response.status != 0) {
            XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName("error.pinInvalid"));
            wizard.canAdvance = true;
            wizard.rewind();
            return;
        }

        XmarksBYOS.gSettings.pin = pin;

        var lm = Date.now();
        if (!this.lastModified || lm > this.lastModified) {
            this.lastModified = lm;
            var os = Cc["@mozilla.org/observer-service;1"]
                .getService(Ci.nsIObserverService);
            os.notifyObservers(null, "xmarksbyos-datasourcechanged", 
                lm + ";passwords");
        }

        wizard.canAdvance = true;
        wizard.advance();
    });
}
function PinVerifiedAdvance(){
    XmarksBYOS.gSettings.setSyncEnabled("passwords", true);
    if(gPasswordsNeedUpload){
        XmarksBYOS.gSettings.setMustUpload("passwords", true);
    }
    if(gWizardMode == "normal")
        return true;
    else {
        window.arguments[2].doSync = true;
        window.close();
    }
    return true;
}

function GotoSyncPasswords(){
    var wizard = document.documentElement;
    wizard.goTo("syncPasswords");
    return false;
}
function RelinkPinVerified(){
    var wizard = document.documentElement;
    if(gWizardMode == "normal"){
        wizard.currentPage.next = gIsEmpty ? 
            "execute" : "selectSyncOption"; 
        }
    else {
        var button = wizard.getButton('next');
        button.label = XmarksBYOS.Bundle().GetStringFromName("wizard.finished");
        button.accesskey = XmarksBYOS.Bundle().GetStringFromName("wizard.finished.accesskey");
        button = wizard.getButton('cancel');
        button.hidden = true;
        button.disabled =true;
        button = wizard.getButton('back');
        button.hidden = true;
        button.disabled =true;
    }
}

function NewPinVerifiedAdvance(){
    if(gWizardMode == "normal")
        return true;
    else {
        window.arguments[2].doSync = true;
        window.close();
    }
    return true;
}

function SetProfileValue() {
    LogWrite("Setting profile value...");
    XmarksBYOS.gSettings.viewId = document.getElementById("profileMenuList").value;
    XmarksBYOS.gSettings.viewName = document.getElementById("profileMenuList").label;
    LogWrite("Profle value is now " + XmarksBYOS.gSettings.viewId);
}

function SyncOptionAdvance() {
    var wizard = document.documentElement;
    wizard.currentPage.next = SetupIsMerging() ? "mergeOption" : "execute";
    return true;
}

function FoxmarksSetupHelp() {
    if (gHelpUrl) {
        XmarksBYOS.FoxmarksOpenInNewWindow(gHelpUrl);
    }
}

function SetupIsMerging() {
    return !gIsEmpty && 
        document.getElementById("localOrRemote").selectedItem.value == "merge";
}
// Skip over merge options if the user hasn't selected merge.
function SetupOptionNext() {
    document.documentElement.getPageById("selectSyncOption").next = 
        SetupIsMerging() ? "mergeOption" : "execute";
    return true;
}

function SetupShowExecutePage() {
    var op;
    var a = document.getElementById("localOrRemote").selectedItem.value;
    var b = document.getElementById("mergeStart").selectedItem.value;
    var desc = document.getElementById("readydesc");

    if(XmarksBYOS.gSettings.isSyncEnabled("passwords"))
        desc.setAttribute("value", XmarksBYOS.Bundle().
        GetStringFromName("label.syncinitial"));

    if (gIsEmpty) {
        op = "msg.upload2";
    } else {
        if (a == "local") {
            op = "msg.upload2";
        } else if (a == "remote") {
            op = "msg.download2";
        } else {
            if (b == "local") {
                op = "msg.mergelocal";
            } else {
                op = "msg.mergeremote";
            }
        }
    }
    var datatype = "";
    
    if(XmarksBYOS.gSettings.isSyncEnabled("bookmarks") &&
            XmarksBYOS.gSettings.isSyncEnabled("passwords")){
        datatype = XmarksBYOS.Bundle().GetStringFromName("msg.merge.alldata");
    } else if(XmarksBYOS.gSettings.isSyncEnabled("bookmarks")){
        datatype = XmarksBYOS.Bundle().GetStringFromName("msg.merge.bookmarks");
    } else {
        datatype = XmarksBYOS.Bundle().GetStringFromName("msg.merge.passwords");
    }
    document.getElementById("operation").value =
        XmarksBYOS.Bundle().formatStringFromName(op,[datatype],1);
    var warning = document.getElementById("warning");
    if (!gIsEmpty && a != "merge") {
        if(warning.childNodes.length > 0){
            warning.removeChild(warning.firstChild);
        }

        var wtext = document.createTextNode(
             XmarksBYOS.Bundle().formatStringFromName(op + ".warning",
                [datatype], 1)
        );
        warning.appendChild(wtext)
        warning.hidden = false;
    } else {
        warning.hidden = true
    }
    var profileMsg = document.getElementById("profileMsg");
    if (gHasProfiles && XmarksBYOS.gSettings.viewId) {
        profileMsg.value = XmarksBYOS.Bundle().formatStringFromName("msg.profilemsg",
            [gProfileNames[String(XmarksBYOS.gSettings.viewId)]], 1);
        profileMsg.hidden = false;
    } else {
        profileMsg.hidden = true;
    }
}

function SetupPerformSync() {
    var retval = {}
    var args = {};

    var a = document.getElementById("localOrRemote").selectedItem.value;
    var b = document.getElementById("mergeStart").selectedItem.value;

    args.merge = SetupIsMerging();
    args.remoteIsMaster = gIsEmpty ? false :
        (args.merge ? (b == "remote") : (a == "remote"));

    SetupPerformAction("initialSync", retval, args);

    if (!retval.status) {
        return true;
    } else {
        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().formatStringFromName("msg.syncfailed",
                [retval.msg], 1));
    }

    return false;
}

function SetupPerformAction(action, retval, args) {
    var win = window.
            openDialog("chrome://xmarksbyos/content/foxmarks-progress.xul",
            "_blank", "chrome,dialog,modal,centerscreen", action, retval, args);

    if (retval.helpurl) {
        openDialog("chrome://browser/content/browser.xul", "_blank",
            "chrome,all,dialog=no", retval.helpurl);
        retval.status = -1;
        retval.msg = XmarksBYOS.Bundle().GetStringFromname("msg.cancelled");
    }

    return;
}

function SetupOnWizardFinish() {
    XmarksBYOS.gSettings.majorVersion = 1;
    var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
        getService(Ci.nsIXmarksByosService);
    fms.launchSuccessPage();
    return true;
}

function OnPageShow(pageId) {
}
function FoxmarksMoreSecurityInfo(){
    window.openDialog(
        "chrome://xmarksbyos/content/foxmarks-moresecurityinfo.xul",
        "_blank",
        "chrome,dialog,modal,centerscreen"
    );
}

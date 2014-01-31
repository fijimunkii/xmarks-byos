/* 
 Copyright 2008 Foxmarks Inc.
 
 foxmarks-resetpin.js: handles the UI for the ResetPIN dialog. 
  
 */

function onResetPINOK()
{
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
    XmarksBYOS.gSettings.setMustUpload("passwords", true);
    window.arguments[0].doSync = true;
    return true;
}


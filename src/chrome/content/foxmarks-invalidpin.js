/* 
 Copyright 2008 Foxmarks Inc.
 
 foxmarks-invalidpin.js: handles the UI for the ResetPIN dialog. 
  
 */

function onInvalidPINOK()
{
    if(document.getElementById("invalidpinradio").selectedItem.value == "newpin"){
        var pin = document.getElementById("newpin").value;
        if(!pin || pin.length < 4 || pin.length > 255){
            XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName("error.pinWrongSize"));
            return false;
        }
        window.arguments[0].okay = true;
        window.arguments[0].pin = pin;
        return true;
    } else {
        window.arguments[0].okay = false;
        return true;
    }
}

function onNewPinRadio()
{
    document.getElementById("newpin").focus();
    document.getElementById("newpin").select();
}


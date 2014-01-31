/* 
 Copyright 2007 Foxmarks Inc.
 
 foxmarks-clobber.js: handles the UI for the Clobber dialog. 
  
 */

function onClobberLoad()
{
    window.arguments[0].okay = true;
    
    document.getElementById("lastset").setAttribute("value",
        window.arguments[2]);
    document.getElementById("currset").setAttribute("value",
        window.arguments[1]);
    return true;
}
function onClobberOK()
{
    window.arguments[0].okay = true;
    return true;
}

function onClobberCancel()
{
    window.arguments[0].okay = false;
    return true;
}

function onClobberHelp(url)
{
    window.openDialog("chrome://browser/content/browser.xul",
	    "_blank", "chrome,all,dialog=no", url);
    return false;
}

 

/*
 Copyright 2005-2008 Foxmarks Inc.

 foxmarks-ownserverdlg.js: Implements a use own server dialog

 */

var gOwnServerParams;
function ownServerLoad(){
    gOwnServerParams = window.arguments[0];

    document.getElementById("url").value = gOwnServerParams.url;
    document.getElementById("passwordurl").value = gOwnServerParams.purl;
}

function ownServerOK(){
    var url = document.getElementById("url").value;
    var purl = document.getElementById("passwordurl").value;

    if(url.length && url != purl &&
        (!gOwnServerParams.psync || purl.length)){
        gOwnServerParams.url = document.getElementById("url").value;
        gOwnServerParams.purl = document.getElementById("passwordurl").value;
        gOwnServerParams.result = true;
    } else {
        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().
            GetStringFromName("error.ownserveremptyurl"));
        return false;
    }

    return true;
}

function ownServerCancel(){
    gOwnServerParams.result = false;
}

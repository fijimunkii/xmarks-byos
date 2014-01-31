/* 
 Copyright 2008 Foxmarks Inc.
 
 foxmarks-passwordconflict.js: handles the UI for the password conflict dialog. 
  
 */

function onServerOK()
{
    var dlg = document.getElementById("foxmarks-passwordconflict");
    window.arguments[1].button = 2;
    dlg.acceptDialog();
    return true;
}

function onLocalOK()
{
    var dlg = document.getElementById("foxmarks-passwordconflict");
    window.arguments[1].button = 1;
    dlg.acceptDialog();
    return true;
}
function onLoad()
{
    var data = window.arguments[0];
    var local = data.local;
    var server =data.server;

    document.getElementById("local.site").value = local.site;
    document.getElementById("local.username").value = local.username;
    document.getElementById("local.password").value = local.password;

    document.getElementById("server.site").value = server.site;
    document.getElementById("server.username").value = server.username;
    document.getElementById("server.password").value = server.password;
}

function showPasswords(){
    var item;
    item = document.getElementById("local.password");
    item.setAttribute("type", "");
    item = document.getElementById("server.password");
    item.setAttribute("type", "");
}


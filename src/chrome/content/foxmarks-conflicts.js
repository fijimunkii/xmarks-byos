/* 
 Copyright 2005-2007 Foxmarks Inc.
 
 foxmarks-conflicts.js: provides setup routines specific for each conflict
 dialog, as well as common event handlers for user input.
  
 */

 /*
  In general, here's how these conflict dialogs work. The caller passes in
  two nodes, local and server, displays their contents as appropriate for
  the particular conflict type. The dialog returns selection="local" or
  selection="server" or selection=null if the user canceled.

  */

function ConflictSelectLocal()
{
    window.arguments[0].selection = "local";
    window.close();
}

function ConflictSelectServer()
{
    window.arguments[0].selection = "server";
    window.close();
}

function ConflictCancel()
{
    window.arguments[0].selection = null;
    return true;
}


function OnFolderConflictLoad()
{
    document.getElementById("localname").value = 
        window.arguments[1].local.name || "";
    document.getElementById("localdesc").value = 
        window.arguments[1].local.description || "";
    document.getElementById("servername").value = 
        window.arguments[1].server.name || "";
    document.getElementById("serverdesc").value = 
        window.arguments[1].server.description || "";
}

function OnParentConflictLoad()
{
    document.getElementById("itemname").value = 
        window.arguments[1].item.name || "";
    document.getElementById("localname").value = 
        window.arguments[1].local.name || "";
    document.getElementById("localdesc").value = 
        window.arguments[1].local.description || "";
    document.getElementById("servername").value = 
        window.arguments[1].server.name || "";
    document.getElementById("serverdesc").value = 
        window.arguments[1].server.description || "";
}

function OnBookmarkConflictLoad()
{
    document.getElementById("localname").value = 
        window.arguments[1].local.name || "";
    document.getElementById("localurl").value = 
        window.arguments[1].local.url || "";
    document.getElementById("localkeyword").value = 
        window.arguments[1].local.shortcuturl || "";
    document.getElementById("localdesc").value = 
        window.arguments[1].local.description || "";
    document.getElementById("localwebpanel").checked = 
        window.arguments[1].local.sidebar;
    document.getElementById("servername").value = 
        window.arguments[1].server.name || "";
    document.getElementById("serverurl").value = 
        window.arguments[1].server.url || "";
    document.getElementById("serverkeyword").value = 
        window.arguments[1].server.shortcuturl || "";
    document.getElementById("serverdesc").value = 
        window.arguments[1].server.description || "";
    document.getElementById("serverwebpanel").checked = 
        window.arguments[1].server.sidebar;
}

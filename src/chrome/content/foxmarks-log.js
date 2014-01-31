/* 
 Copyright 2005-2007 Foxmarks Inc.
 
 foxmarks-log.js: provides logging support.
 
 */

function LogWrite(str)
{
    if (XmarksBYOS.gSettings.enableLogging) {
        Components.classes["@xmarks.com/extensions/xmarksbyos;1"].
            getService(Components.interfaces.nsIXmarksByosService).logWrite(str);
    }
}

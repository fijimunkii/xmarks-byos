/*
 Copyright 2007-2008 Foxmarks Inc.

 foxmarks-bookmark.js: component that implements the logical interface to
 related to syncing datatypes.

For FF2, the heavy lifting is in rdf.js
For FF3, the heavy lifting is in places.js
 */


function applyCommonBookmarkFunctions(me){

    me.DiscontinuityPrompt= function() {
        var sb = XmarksBYOS.Bundle().GetStringFromName;

        // get a reference to the prompt service component.
        var ps = Cc["@mozilla.org/embedcomp/prompt-service;1"].
          getService(Ci.nsIPromptService);

        var flags = ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_0 +
              ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_1 +
              ps.BUTTON_TITLE_CANCEL    * ps.BUTTON_POS_2;

        var rv = ps.confirmEx(null, sb("disc.title"), sb("disc.body"), flags,
            sb("disc.merge"), sb("disc.download"), null, null, {});

        return rv;
    };

    me.handleNidConflict = function(lnode, snode, conflicts){
        var nodes = { 
            local: lnode,
            server: snode
        };
        var ntype = lnode.ntype;
        var chromeUrl;

        if (ntype == "folder") {
            chromeUrl = 
                "chrome://xmarksbyos/content/foxmarks-folderconflict.xul";
        // Special case: name-change only for microsummary
        } else if (ntype == "microsummary" && 
                conflicts.length == 1 && conflicts[0] == "name") {
            return "local";
        } else {
            chromeUrl = 
                "chrome://xmarksbyos/content/foxmarks-bookmarkconflict.xul";
        }
        return OpenConflictDialog(chromeUrl, nodes);
    };
    me.ClobberDialog = function(currNum, lastNum) {

        // put up Clobber Dialog and return true if user okays
        // sync, otherwise false.

        var retval = { okay: false };

        var topwin = Cc['@mozilla.org/appshell/window-mediator;1'].
            getService(Ci.nsIWindowMediator).
            getMostRecentWindow(null);
        
        if (!topwin) {
            LogWrite("ClobberDialog: Couldn't find a topwin!");
            return false;
        }


        var win = topwin.openDialog(
            "chrome://xmarksbyos/content/foxmarks-clobber.xul", "_blank",
            "chrome,dialog,modal,centerscreen", retval, currNum, lastNum);

        LogWrite("ClobberDialog: retval.okay is " + retval.okay);
        
        return retval.okay;
    };

    me.getBaselineName = function(){
        return "xmarks-baseline-" + XmarksBYOS.gSettings.hash + "json";
    };
    me.syncType = "bookmarks";

    me.merge = function(dest, source) {
        // Merge the given nodeset into us.
        // Walk through our node hiearchy and, in parallel,
        // source's hierarchy. Discard from further consideration any item
        // inside us that loosely matches* anything in the source. For any
        // item that exists in the source but not us, recusrively copy that
        // item into ourselves (being careful to generate new nid's for each
        // copied item).
        //
        // *Loosely matches, in this context, means that the node's ntype,
        // name, and url (if present) match for any two items in the same
        // place in the hiearchy.

        var self = this;
        var folders = [[NODE_ROOT, NODE_ROOT]];
        var toolbars = [
            ValidNid(dest, dest.Node(NODE_ROOT, false, true).tnid),
            ValidNid(source, source.Node(NODE_ROOT, false, true).tnid)];
        var unfiledRoots = [
            ValidNid(dest, dest.Node(NODE_ROOT, false, true).unid),
            ValidNid(source, source.Node(NODE_ROOT, false, true).unid)];
        var mergeToolbars = false;
        var mergeUnfiledRoots = false;
       // var ds = new NativeDatasource();

        if (toolbars[0] && toolbars[1]) {
            folders.push(toolbars);
            mergeToolbars = true;
        }

        if (unfiledRoots[0] && unfiledRoots[1]) {
            folders.push(unfiledRoots);
            mergeUnfiledRoots = true;
        }

        while (folders.length) {
            var f = folders.pop();
            var us = dest.Node(f[0]);
            var them = source.Node(f[1]);
            LogWrite(">> Merge processing folder " + us.name + " (" + 
                    us.nid + ")");
            // makin' copies!
            var ourchildren = us.children ? us.children.slice() : [];
            var theirchildren = them.children ? them.children.slice() : [];

            for (var i = 0; i < theirchildren.length; ++i) {
                var theiritem = theirchildren[i];
                if (mergeToolbars && theiritem == toolbars[1])
                    continue;   // skip it, we've already processed it
                if (mergeUnfiledRoots && theiritem == unfiledRoots[1])
                    continue;   // Ditto.
                var matched = FindMatch(theiritem);
                if (matched >= 0) {
                    if (dest.Node(ourchildren[matched]).ntype == "folder") {
                        folders.push([ourchildren[matched], theirchildren[i]]);
                    }
                    ourchildren.splice(matched, 1);
                } else {
                    ReplicateNode(source, theirchildren[i], us.nid);
                }
            }
        }

        if (!toolbars[0] && toolbars[1]) {
            dest.Node(NODE_ROOT, true).tnid = toolbars[1];
        }

        if (!unfiledRoots[0] && unfiledRoots[1]) {
            dest.Node(NODE_ROOT, true).unid = unfiledRoots[1];
        }

        function FindMatch(nid) {
            // nid is an item in source.
            // Try to find an acceptable match in ourchildren.
            if (nid == toolbars[1] || nid == unfiledRoots[1])
                return -1;  // These special roots are never matched here.
            var them = source.Node(nid);
            var themurl =self.NormalizeUrl(them.ntype == "feed" ? 
                    them.feedurl : them.url);
            var themname = NormalizedName(them);
            for (var i = 0; i < ourchildren.length; ++i) {
                var child = ourchildren[i];
                if (child == toolbars[0] || child == unfiledRoots[0])
                    continue;
                var us = dest.Node(child);
                var usurl =self.NormalizeUrl(us.ntype == "feed" ? 
                        us.feedurl : us.url);
                var usname = NormalizedName(us);
                if (usname == themname && us.ntype == them.ntype
                        && usurl == themurl) {
                    return i;
                }
            }
            return -1;
        }

        function NormalizedName(node) {
            if (node.ntype == "separator") {
                return "";
            } else if (node.ntype == "microsummary") {
                return node.generateduri || rtrim(node.name);
            } else {
                return rtrim(node.name);
            }
        }
        
        function ReplicateNode(source, nid, pnid) {
            // Copy the given node (including children if it's a folder)
            // into us, generating new nids along the way.

            LogWrite("Entered ReplicateNode(" + nid + ")");

            function ReplicateNodeInternal(nid, pnid) {
                if (mergeToolbars && nid == toolbars[1])
                    return;
                var attrs = source.Node(nid).GetSafeAttrs();
                attrs.pnid = pnid;
                var newNid =self.GenerateNid();
                dest.Do_insert(newNid, attrs);

                if (attrs.ntype == 'folder') {
                    var children = source.Node(nid).children;
                    if (children) {
                        for (var i = 0; i < children.length; ++i) {
                            ReplicateNodeInternal(children[i], newNid);
                        }
                    }
                }
            }

            // Fun with closures: note that we create ds just once
            // and keep it in a closure as we recursively process
            // nid and its children. Creating a native datasource
            // *could* be expensive, depending on platform, so this
            // is likely justified.
            ReplicateNodeInternal(nid, pnid);
        }

        function rtrim(s) {
            return s ? s.replace(/\s+$/, "") : s;
        }

        function ValidNid(ns, nid) {
            return ns.Node(nid, false, true) ? nid : null;
        }
    };


    me.orderIsImportant = true;
    me.IGNORABLE ={ created: true, visited: true, modified: true, private: true };
    me.NONULLFIELDS = { name: true, description: true, shortcuturl: true };
    
    me.compareNodes = function(snode, onode, attrs){
        var important = [];

        // Iterate over other's attrs, add mistmach/missings.
        for (var attr in onode) {
            if (attr == "children" || attr == "pnid" ||
                    !onode.hasOwnProperty(attr))
                continue;
            if (!equals(snode[attr], onode[attr])) {
                attrs[attr] = onode[attr];
               
                if(this.NONULLFIELDS[attr] && !attrs[attr]){
                    attrs[attr] = "";
                    LogWrite("Updating Null field: " + attr);
                }

                if (!this.IGNORABLE[attr]) {
                    important.push(attr);
                }
            }
        }

        // Iterate over self's attrs, add deletions.
        for (var attr in snode) {
            if (attr == "children" || !snode.hasOwnProperty(attr))
                continue;
            if (!(attr in onode)) {
                attrs[attr] = null;
                if(this.NONULLFIELDS[attr]){
                    attrs[attr] = "";
                    LogWrite("Updating Null field: " + attr);
                }
                if (!this.IGNORABLE[attr]) {
                    important.push(attr);
                }
            }
        }
        
        // Special case: don't generate update on microsummary name
        // change.
        if (snode.ntype == "microsummary" && important.length == 1 &&
                important[0] == 'name') {
            return false;
        }

        return important.length > 0;
    };
}

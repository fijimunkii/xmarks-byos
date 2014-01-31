/*
 Copyright 2007-2008 Foxmarks Inc.

 foxmarks-nodes.js: implements class Node and Nodeset, encapsulating
 our datamodel for the bookmarks.

 */

// To do:
// * Add integrity checking to commands
// * We're currently filtering out modified- and visited-only updates
//   in the Compare algorithm. This is okay for modified but probably
//   inappropriate for visited: visited will only get updated when some
//   other attribute of the node changes, which may never happen. On the
//   other hand, we don't want to sync every change to last visited. We
//   may want to do something like a standard sync and a thorough sync;
//   do a thorough sync either once a week or randomly 1 in 10 times. The
//   thorough sync is when we'd perpetuate the last-visit updates.
// * In merge algorithm, special treatment for toolbar folders.

// Module-wide constants

const NODE_ROOT     = "ROOT";
const NODE_TOOLBAR  = "TOOLBAR";
const PERMS_FILE    = 0644;
const MODE_RDONLY   = 0x01;
const MODE_WRONLY   = 0x02;
const MODE_CREATE   = 0x08;
const MODE_APPEND   = 0x10;
const MODE_TRUNCATE = 0x20;

// class Node

function Node(nid, attrs) {
    this.nid = nid;
    for (a in attrs) {
        if (attrs.hasOwnProperty(a)) this[a] = attrs[a];
    }
    // TODO: remove all the assumptions that ntype will be a bookmark
    if (!this.ntype)
        this.ntype = "bookmark";
    //if (!this.ntype)
    //    throw("Node.ntype now required");
}

Node.prototype = {
    constructor: Node,

    toSource: function() {
        if (!this.ntype)
            throw("Node.ntype now required");
        return 'new Node("' + this.nid + '",' + 
            this.GetSafeAttrs(true).toSource() + ')';
    },

    GetSafeAttrs: function(withChildren) {
        var attrs = {};

        for (var attr in this) {
            if (this.hasOwnProperty(attr) && attr != 'nid' &&
                attr != 'private') {
                if (withChildren || attr != 'children') {
                    attrs[attr] = this[attr];
                }
            }
        }

        return attrs;
    },

    FindChild: function(nid) {
        if (this["children"]) {
            return this.children.indexOf(nid);
        } else {
            return -1;
        }
    }
}

// class Nodeset

function Nodeset(datasource, cloneSource) {
    if(datasource === undefined || datasource instanceof Nodeset)
        throw("Nodeset() -- datasource is required");

    this.hash = null;
    this._datasource = datasource;
    this._cloneSource = cloneSource;
    this._node = {};
    this._callback = null;
    this._length = cloneSource ? cloneSource.length : 0;
}



Nodeset.FetchAdd = function(node) {
    this.AddNode(node);
}

Nodeset.FetchComplete = function(status) {
    this._children = null;
    this.callback(this.corrupt ? 1006 : status);
}

var ct = {}
Nodeset.Continue = {
    notify: function(timer) {
        var set = ct.self;
        var nids = ct.nids;
        var result;
        var s = Date.now();
        while (nids.length > 0 && Date.now() - s < 100) {
            var next = nids.shift();
            var nid = next[0];
            var pnid = next[1];

            if (!set.Node(nid, false, true)) {
                LogWrite("Warning: OnTree() was about to reference " +
                    nid + " which doesn't exist");
                break;
            }

            try {
                result = ct.action.apply(ct.Caller, [nid, pnid]);
            } catch (e) {
                if(typeof e == "number"){
                    result = e;
                } else {
                    LogWrite("OnTree error " + e.toSource());
                    result = 3;
                }
            }

            if (result)
                break;

            // if action above deleted nid...
            if (set.Node(nid, false, true) == null)
                continue;

            if (set.Node(nid).ntype == "folder") {
                var children = set.Node(nid).children;
                var ix = 0;
                for (var child in children) {
                    if (!children.hasOwnProperty(child))
                        continue;
                    if (ct.depthfirst) {
                        nids.splice(ix++, 0, [children[child], nid]);
                    } else {
                        nids.push([children[child], nid]);
                    }
                }
            }
        }

        if (nids.length > 0 && !result) {
            timer.initWithCallback(Nodeset.Continue, 10,
                Ci.nsITimer.TYPE_ONE_SHOT);
        } else {
            ct.complete.apply(ct.Caller, [result]);
        }
    }
}

Nodeset.prototype = {
    constructor: Nodeset,

    get length() {
        return this._length;
    },

    NodeName: function(nid) {
        var node = this.Node(nid, false, true);

        if (node && node.name) {
            return node.name + "(" + nid + ")";
        } else {
            return nid;
        }
    },
    handleNidConflict: function(lnode, snode, conflicts){
        return this._datasource.handleNidConflict(lnode, snode, conflicts);
    },
        
    AddNode: function(node) {
        if (this._children && node.children) {
            var self = this;
            for (var index = 0; index < node.children.length; index++) {
                var cnid = node.children[index];
                if (self._children[cnid] != undefined) {
                    node.children.splice(index--, 1);
                    LogWrite("Warning: Filtering " + self.NodeName(cnid) + 
                            " as a corrupted duplicate in parent " +
                            node["name"] + " (" + node.nid + ")");
                } else {
                    self._children[cnid] = true;
                }
            }
        }   
            
        if (this._node[node.nid]) { // Oh oh! Node already exists.
            LogWrite("Warning: Node " + this.NodeName(node.nid) +
                    " in folder " + this.NodeName(node.pnid) + 
                    " already exists in folder " +
                    this.NodeName(this._node[node.nid].pnid));
            // Log error only; don't prevent sync as cleanup happened above
            // this.corrupt = true;
            return;
        }
        this._node[node.nid] = node;
        this._length++;
    },

    FetchFromNative: function(callback) {
        this._children = {}
        // this.source = new NativeDatasource();
        this.callback = callback;
        this._datasource.ProvideNodes(this, Nodeset.FetchAdd, Nodeset.FetchComplete);
    },

    BaselineLoaded: function(baseline, callback) {
        return this._datasource.BaselineLoaded(baseline, callback);
    },
    FlushToNative: function(callback) {
        // var source = new NativeDatasource();
        this._datasource.AcceptNodes(this, callback);
        return;
    },

    ProvideCommandset: function(callback) {
        var self = this;
        var cs = new Commandset();

        this.OnTree(Add, Done);
        return;
            
        function Add(nid, pnid) {
            cs.append(new Command("insert", nid,
                self.Node(nid).GetSafeAttrs()));
            return 0;
        }

        function Done(status) {
            callback(status, cs);
        }
    },

    _GetFile: function() {
        var file = Cc['@mozilla.org/file/directory_service;1']
            .getService(Ci.nsIProperties)
            .get('ProfD', Ci.nsIFile);

        file.append(this._datasource.getBaselineName());
        return file;
    },

    SaveToFile: function(callback) {

        var self = this;
        var first = true;

        var file = this._GetFile();

        var fstream = Cc["@mozilla.org/network/safe-file-output-stream;1"]
            .createInstance(Ci.nsIFileOutputStream);
        fstream.init(file, (MODE_WRONLY | MODE_TRUNCATE | MODE_CREATE), 
            PERMS_FILE, 0);

        var cstream = Cc["@mozilla.org/intl/converter-output-stream;1"]
            .createInstance(Ci.nsIConverterOutputStream);
        cstream.init(fstream, "UTF-8", 0, 0x0000);

        cstream.writeString('({ version:"'+ XmarksBYOS.FoxmarksVersion() +
                '", currentRevision:' + self.currentRevision + 
                ', _node: {' );

        this.OnTree(WriteNode, WriteDone);
        return;

        function WriteNode(nid, pnid) {
            var node = self.Node(nid);
            cstream.writeString((first ? "" : ",") + 
                    "'" + nid.replace(/'/g, "\\'") + "'" + ":" + 
                    node.toSource());
            first = false;
            return 0;
        }

        function WriteDone(status) {
            if (!status) {
                cstream.writeString("}})");
                // Flush the character converter, then finish the file stream,
                // guaranteeing that an existing file isn't overwritten unless
                // the whole thing succeeds.
                cstream.flush();            
                try {
                    fstream.QueryInterface(Ci.nsISafeOutputStream).finish();
                } catch (e) {
                    fstream.close();
                    LogWrite("Error in Writing: " + e.message);
                    status = 1009;
                }
            }
            callback(status);
        }

    },
    

    LoadFromFile: function() {
        var file = this._GetFile();
        var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
            .createInstance(Ci.nsIFileInputStream);
        fstream.init(file, MODE_RDONLY, PERMS_FILE, 0);
        var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
            .createInstance(Ci.nsIConverterInputStream);
        cstream.init(fstream, "UTF-8", 32768, 0xFFFD);
        var str = {}; 
        
        var contents = "";

        while (cstream.readString(32768, str) != 0) {
            contents += str.value;
        }
        fstream.close();
        cstream.close();

        var result = eval(contents);

        if (result["version"]) {
            this._node = result._node;
            this.currentRevision = result.currentRevision;
            this.version = result.version;
        } else {    // For backwards compatibility
            this._node = result;
            LogWrite("Baseline file has no currentRevision");
            this.currentRevision = XmarksBYOS.gSettings.GetSyncRevision(this._datasource.syncType);
        }

        var self = this;
        self._length = 0;
        forEach(this._node, function() { self._length++; } );
    },


    Declone: function(callback) {
        // If we are cloned from some other nodeset, copy any references
        // we currently hold from the clonesource into ourselves and
        // break the clonesource relationship.
        // This must be done before serializing a nodeset to disk.

        var self = this;

        if (!this._cloneSource) {
            callback(0);
        } else {
            this.OnTree(CopyNode, Done);
        }
        return;

        function CopyNode(nid, pnid) {
            if (self._node[nid] === undefined) {
                self._node[nid] = self._cloneSource.Node(nid);
            }
            return 0;
        }

        function Done(status) {
            if (!status) {
                self._cloneSource = null;
                forEach(
                    self._node, 
                    function(v, k) {
                        if (!v){
                            delete self._node[k];
                            self._length--;
                        }
                    }
                ); 

            }
            callback(status);
        }
    },

    // Node returns the node with the given nid.
    // If you intend to modify the returned node,
    // set "write" true; this will do a "copy on write"
    // from the clone source if one has been set.
    // If node specified is not found, throws an exception
    // unless "nullOkay" is true, in which case it returns null.

    Node: function(nid, write, nullOkay) {
        if (nid in this._node) {
            return this._node[nid];
        } else if (this._cloneSource) {
            var node = this._cloneSource.Node(nid, false, nullOkay);
            if (!node || !write) {
                return node;
            } else {
                var newNode = node.clone(true);
                if(newNode.private)
                    delete newNode.private;
                this.AddNode(newNode);
                return newNode;
            }
        } else {
            if (nullOkay)
                return null;
            else
                throw Error("Node not found: " + nid);
        }
    },

    HasAncestor: function(nid, pnid) {
        while (nid) {
            var node = this.Node(nid, false, true);
            if (!node) {
                LogWrite("Whoops! HasAncestor tried to reference " + nid +
                        " which doesn't exist");
                throw Error("HasAncestor bad nid " + nid);
            }
            nid = node.pnid;
            if (nid == pnid)
                return true;
        }
        return false;
    },

    // Find next sibling in this folder that also exists in other's folder
    NextSibling: function(nid, other) {
        var pnid = this.Node(nid).pnid;
        var oursibs = this.Node(pnid).children;
        var othersibs = other.Node(pnid).children;

        for (var i = oursibs.indexOf(nid) + 1; i < oursibs.length; ++i) {
            var sib = oursibs[i];
            if (othersibs.indexOf(sib) >= 0) {
                return sib;
            }
        }

        return null;
    },

    InsertInParent: function(nid, pnid, bnid) {
        if (nid == NODE_ROOT && pnid == null) {
            return; // Fail silently.
        }

        if (!nid)
            throw Error("bad nid");

        if (!pnid)
            throw Error("bad pnid for nid " + nid);

        var parent = this.Node(pnid, true);
        if (typeof parent["children"] == "undefined") {
            parent.children = [];
        }
        if (parent.children.indexOf(nid) >= 0) {
            throw Error("child " + nid + " already exists in parent " + pnid);
        }
        if (bnid) {
            var i = parent.children.indexOf(bnid);
            if (i >= 0) {
                parent.children.splice(i, 0, nid);
            } else {
                throw Error("didn't find child " + bnid + " in parent " + pnid);
            }
        } else {
            parent.children.push(nid);
        }
        this.Node(nid, true).pnid = pnid;
    },            

    RemoveFromParent: function(nid) {
        var node = this.Node(nid, true);
        if (!node.pnid) {
            LogWrite("node.pnid is undefined for " + node.name);
        }
        var parent = this.Node(node.pnid, true);
        var i = parent.FindChild(nid);

        if (i >= 0) {
            parent.children.splice(i, 1);
        } else {
            throw Error("didn't find child " + nid + " in parent " + pnid);
        }
        node.pnid = null;
    },

    Do_insert: function(nid, args /* pnid, bnid, ntype, etc. */) {
//        LogWrite("inserting " + nid + " " + args.toSource());
        if (this.Node(nid, false, true) != null) {
            var nargs = this.Node(nid).GetSafeAttrs();
            var conflict = false;
            forEach(args, function(value, attr) {
                if (nargs[attr] && value != nargs[attr]) {
                    conflict = true;
                }
            } );
            if (conflict) {
                throw Error("Tried to insert a node that already exists");
            } else {
                return; // In the interests of being accomodating, we're going
                        // to let this one slide by. But make sure it doesn't
                        // happen again, mkay?
            }
        }
        var node = new Node(nid);

        for (attr in args) {
            if (args.hasOwnProperty(attr) && 
                    attr != 'pnid' && attr != 'bnid' && attr != 'children') {
                node[attr] = args[attr];
            }
        }

        this.AddNode(node);
        this.InsertInParent(nid, args.pnid, args.bnid);
    },

    Do_delete: function(nid) {
        var self = this;
//        LogWrite("deleting " + this.NodeName(nid));

        // Be careful here: only the top-level node has to be
        // removed from its parent. That node and its descendants
        // need to be nulled out.

        function NukeNode(nid) {
            var node = self.Node(nid);
            if (node.children) {
                for (var n = 0; n < node.children.length; ++n)
                    NukeNode(node.children[n]);
            }
            if (self._cloneSource) {
                self._node[nid] = null; // If cloned, shadow deletion.
            } else {
                delete self._node[nid]; // Otherwise, delete it outright.
            }
            self._length--;
        }

        self.RemoveFromParent(nid);
        NukeNode(nid);
    },

    Do_move: function(nid, args /* pnid, bnid */) {
//        LogWrite("moving " + this.NodeName(nid));

        this.RemoveFromParent(nid);
        this.InsertInParent(nid, args.pnid, args.bnid);
    },

    Do_reorder: function(nid, args /* bnid */) {
//        LogWrite("reordering " + this.NodeName(nid) + " before " + 
//                this.NodeName(args.bnid));
        var pnid = this.Node(nid).pnid;
        this.RemoveFromParent(nid);
        this.InsertInParent(nid, pnid, args.bnid);
    },

    Do_update: function(nid, args /* attrs */) {
//        LogWrite("updating " + this.NodeName(nid));
        var node = this.Node(nid, true);

        forEach(args, function(value, attr) {
            if (value) {
                node[attr] = value;
            } else {
                delete node[attr];
            }
        } );
    },

    // Pass either a single command or a Commandset.
    Execute: function(command) {
        if (command instanceof Commandset) {
            var self = this;
            forEach(command.set, function(c) {
                self.Execute(c);
            } );
            return;
        }

        var method = this["Do_" + command.action];
        try {
            method.apply(this, [command.nid, command.args]);
        } catch (e) {
            if(typeof e == "number") {
                throw e;
            } else {
                Components.utils.reportError(e);
                throw Error("Failed executing command " + command.toSource() + 
                        "; error is " + e.toSource());
            }
        }
    },
    OrderIsImportant: function(){
        return this._datasource.orderIsImportant;
    },

    // traverses this's bookmarks hierarchy starting with
    // startnode, calling action(node) for each node in the tree,
    // then calling complete() when traversal is done.
    // enforces rules about maximum run times to prevent hanging the UI
    // when traversing large trees or when running on slow CPU's.
    // action() should return 0 to continue, non-zero status to abort.
    // complete() is called with status, non-zero if aborted.
    // depthfirst determines tree traversal order

    OnTree: function(action, complete, startnid, depthfirst) {
        ct = {}
        ct.self = this;
        ct.Caller = this;
        ct.action = action;
        ct.complete = complete;
        ct.startnid = startnid || NODE_ROOT;
        ct.depthfirst = depthfirst;
        ct.nids = [[ct.startnid, null]];
        ct.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        ct.timer.initWithCallback(Nodeset.Continue, 10, 
            Ci.nsITimer.TYPE_ONE_SHOT);
        return;
    },

    IGNORABLE: { created: true, visited: true, modified: true },

    // Compare this nodeset with another, returning a canonical list
    // of commands that transforms this nodeset into the specified one.
    // Note that at the successful conclusion of this routine, this
    // nodeset will be transformed to match the specified nodeset.
    Compare: function(other, callback) {
        var self = this;
        var commandset = new Commandset();

        Step1();
        return;

        function Step1() {
            self.OnTree(FindReordersInsertsMoves, Step2);
        }

        function Step2(status) {
            if (status) {
                callback(status);
            } else {
                self.OnTree(FindDeletes, Step4);
            }
        }

        // There IS no step 3.

        function Step4(status) {
            if (status) {
                callback(status);
            } else {
                self.OnTree(FindUpdates, Step5);
            }
        }

        function Step5(status) {
            if (status) {
                callback(status);
            } else {
                callback(0, commandset);
            }
        }

        function FindReordersInsertsMoves(nid, pid) {
            if (self.Node(nid).ntype != "folder")
                return 0;

            var snode = self.Node(nid);
            var onode = other.Node(nid, false, true);
            if (!onode) // Deleted; don't worry about children.
                return 0;

            var us = snode.children ? snode.children.slice() : [];
            var them = onode.children ? onode.children.slice() : [];

            // Reduce us and them to intersections
            us = us.filter(function(x) { return them.indexOf(x) >= 0; } );
            them = them.filter(function(x) { return us.indexOf(x) >= 0; } );

            if (us.length != them.length) {
                LogWrite("Error: intersections of unequal length for " +
                        self.NodeName(nid));
                LogWrite("us   = " + us);
                LogWrite("them = " + them);
                throw Error("Intersections of unequal length");
            }

            // Reorder us according to them
            if(self._datasource.orderIsImportant){
                for (var i = 0; i < us.length; ++i) {
                    if (us[i] != them[i]) {
                        var command = new Command("reorder", them[i], 
                            { bnid: us[i] });
                        commandset.append(command);
                        self.Execute(command);
                        // Simulate reorder in our intersected list
                        us.splice(us.indexOf(them[i]), 1);
                        us.splice(i, 0, them[i]);
                    }
                }
            }


            // Walk through them to find inserts and moves
            var sc = self.Node(nid).children || [];     // (May have changed)
            var oc = onode.children || [];
            forEach(oc, function(child, index) {
                if (sc.indexOf(child) < 0) {    // ... missing from us
                    if (self.Node(child, false, true)) {    // ... but exists in set
                        var command = new Command("move", child, 
                            { pnid: nid, bnid: FindBnid(index + 1) } );
                        commandset.append(command);
                        self.Execute(command);
                    } else {                                // ... missing entirely
                        var attrs = other.Node(child).GetSafeAttrs();
                        attrs.bnid = FindBnid(index + 1);
                        var command = new Command("insert", child, attrs);
                        commandset.append(command);
                        self.Execute(command);
                    }
                }

                function FindBnid(index) {
                    var oc = onode.children;
                    var len = oc.length;
                    while (index < len && us.indexOf(oc[index]) < 0) {
                        ++index;
                    }
                    return index < len ? oc[index] : null;
                }
            } );

            return 0;
        }

        function FindDeletes(nid, pnid) {
            if (!other.Node(nid, false, true)) {
                var command = new Command("delete", nid);
                commandset.append(command);
                self.Execute(command);
            }
            return 0;
        }

        function FindUpdates(nid, pnid) {
            var result = 0;
            try {
                var snode = self.Node(nid);
                var onode = other.Node(nid);
                var attrs = {};
                if (self._datasource.compareNodes(snode, onode, attrs)) {
                    var command = new Command("update", nid, attrs);
                    commandset.append(command);
                    self.Execute(command);
                }
            } catch (e){
                if(typeof e != "number"){
                    Components.utils.reportError(e);
                    result = 4;
                } else {
                    result = e;
                }
            }
            return result;
        }


    },

    Merge: function(source){
        this._datasource.merge(this, source);
    },


};


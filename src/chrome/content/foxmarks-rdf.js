/*
 Copyright 2007-2008 Foxmarks Inc.

 foxmarks-rdf.js: implements class BookmarkDatasource, encapsulating
 the Firefox RDF datasource.

 */

// To do:
// * icons in 1.0.1: whoops!
// * fix (ahem) exception text
// * figure out how to move helper mapping functions back into prototype
// * Never set a date backward in time.


var Cc = Components.classes;
var Ci = Components.interfaces;
const RDF_ROOT = "NC:BookmarksRoot";
const NC = "http://home.netscape.com/NC-rdf#";
const NS = "http://home.netscape.com/WEB-rdf#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

function ParseIconString(s) {
    var exp = /^data:(.*);base64,(.*)$/;
    var match = exp.exec(s);

    if (match) {
        try {
            var data = My_atob(match[2]);
        } catch (e) {
            return null;
        }
        return [match[1] /* mime type */, data /* b64-encoded data */];
    } else {
        return null;
    }
}

       
// Node's representation of dates is seconds since 1/1/1970.
// RDF's representation of dates is microseconds since 1/1/1970.
// Use these utility functions to convert between the two formats
// while minimizing rounding error.

function DateRDFToNode(v) {
    return Math.round(v / 1000000);
}

function DateNodeToRDF(v) {
    return v * 1000000;
}

const MAP_RDF_TYPE = {
    "http://home.netscape.com/NC-rdf#Bookmark"          : "bookmark",
    "http://home.netscape.com/NC-rdf#Folder"            : "folder",
    "http://home.netscape.com/NC-rdf#BookmarkSeparator" : "separator",
    "http://home.netscape.com/NC-rdf#Livemark"          : "feed",
    "http://home.netscape.com/NC-rdf#MicsumBookmark"    : "microsummary"
}

const MAP_NODE_TYPE = {
    "bookmark"      : null,             // special case: bookmarks & folders 
    "folder"        : null,             // have their types inferred
    "separator"     : NC + "BookmarkSeparator",
    "feed"          : NC + "Livemark",
    "microsummary"  : NC + "MicsumBookmark"
};

// Node type requires special mapping
function MapRDFType(node, resource, predicate, target) {
    if (target instanceof Ci.nsIRDFResource) {
        node.ntype = MAP_RDF_TYPE[target.Value];
    } else {
        throw Error("Whatever! I do what I want!");
    }
};


// Returns either:
// 1) array of [pred, targ, targtype (literal vs. resource)]
// 2) null (skip it)
// 3) string (reset incoming attribute to this type and skip assertion)

function MapNodeType(ntype) {
    if (ntype in MAP_NODE_TYPE) {
        var map = MAP_NODE_TYPE[ntype];
        if (map) {
            return [RDF + "type", map, true];
        } else {
            return null;
        }
    } else {
        return "bookmark";
    }
}

// Sidebar requires special mapping, as it's stored in RDF as a literal
// but we want to present as boolean in our node structure.
function MapRDFSidebar(node, resource, predicate, target) {
    node.sidebar = true;
}

function MapNodeSidebar(sidebar) {
    if (sidebar) {
        return [NC + "WebPanel", "true", false];
    } else {
        return [null, null, false];
    }
}

function BookmarkDatasource() {
    this.rdfs = Cc["@mozilla.org/rdf/rdf-service;1"].getService(
      Ci.nsIRDFService);
    
    this.ds = this.rdfs.GetDataSource("rdf:bookmarks").
            QueryInterface(Ci.nsIBookmarksService);

    this.container = Cc["@mozilla.org/rdf/container;1"].
      createInstance(Ci.nsIRDFContainer);
    this.rdfcu = Cc["@mozilla.org/rdf/container-utils;1"].
      getService(Ci.nsIRDFContainerUtils);
    this.lastModifiedPredicate = this.rdfs.
      GetResource("http://home.netscape.com/WEB-rdf#LastModifiedDate");
    this.addDatePredicate = this.rdfs.
      GetResource("http://home.netscape.com/NC-rdf#BookmarkAddDate");
    this.typePredicate = this.rdfs.
      GetResource("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
    if (!BookmarkDatasource._mapNidToNative) {
        this._InitNidNativeMaps();
    }

    applyCommonBookmarkFunctions(this);

}

// For backwards compatibility, this must be an empty string
BookmarkDatasource.STORAGE_ENGINE = "";

BookmarkDatasource.startupTime = Date.now()

BookmarkDatasource.ProvideNodesDone = function(status) {
    var tb = this.GetToolbar();
    if (tb) {
        this.pn.Caller.Node(NODE_ROOT, true).tnid = tb;
    }
    this.pn.Complete.apply(this.pn.Caller, [status]);
    this.pn.Caller.rdfSource = true;
    this.pn = null;
    return;
}

BookmarkDatasource.MapRDFToNode = function(resource, pnid) {
    var nid = this.MapNative(resource.Value);
    var node = new Node(nid);
    var predicates = this.ds.ArcLabelsOut(resource);
    node.pnid = pnid;

    while (predicates.hasMoreElements()) {
        var predicate = predicates.getNext();

        if (this.rdfcu.IsOrdinalProperty(predicate))
            continue;

        var target = this.ds.GetTarget(resource, predicate, true);

        // sometimes, targets don't exist (icons in particular)
        // just skip 'em
        if (!target)
            continue;

        predicate.QueryInterface(Ci.nsIRDFResource);
        target.QueryInterface(Ci.nsIRDFNode);

        var map = this.RDF_NODE_MAP[predicate.Value];
        var value = null;

        if (map === null) {
            // do nothing
        } else if (typeof(map) == "string") {
            if (target instanceof Ci.nsIRDFResource) {
                value = String(target.Value);
            } else if (target instanceof Ci.nsIRDFLiteral) {
                value = String(target.Value);
            } else if (target instanceof Ci.nsIRDFDate) {
                value = parseInt(target.Value / 1000000.0 + 0.5);
            } else {
                throw "Erggh! unknown target " + predicate.Value + 
                    "/" + target.Value;
            }
            node[map] = value;
        } else if (typeof(map) == "function") {
            map(node, resource, predicate, target);
        } else {
            throw Error(
                "Damn, woman! You trying to kill me or something?" +
                    predicate.Value + " / " + typeof(map) + 
                    " / " + map);
        }
    }

    if (this.IsContainer(resource)) {
        node.ntype = "folder";
        node.children = [];
        this.container.Init(this.ds, resource);
        var children = this.container.GetElements();
        while (children.hasMoreElements()) {
            var child = children.getNext();
            if (child instanceof Ci.nsIRDFResource)
                node.children.push(this.MapNative(String(child.Value)));
        }
    }
    if (XmarksBYOS.gSettings.disableIconSync) {
        delete node["icon"];
    }
    this.pn.AddNode.apply(this.pn.Caller, [node]);
    return 0;
}

// ot is the static object that maintains state for OnTree,
// the tree-walker.

var ot = {}
BookmarkDatasource.Continue = {
    notify: function(timer) {
        var self = ot.self;
        var resources = ot.resources;
        var result;
        var s = Date.now();
        while (resources.length > 0 && Date.now() - s < 100) {
            var next = resources.shift();
            var resource = next[0].QueryInterface(Ci.nsIRDFResource);
            var pnid = next[1];

            try {
                result = ot.action.apply(ot.Caller, [resource, pnid]);
            } catch (e) {
                LogWrite("OnTree error " + e.toSource());
                result = 3;
            }

            if (result)
                break;

            if (self.IsContainer(resource)) {
                self.container.Init(self.ds, resource);

                var children = self.container.GetElements();
                var ix = 0;
                var nid = self.MapNative(resource.Value);
                while (children.hasMoreElements()) {
                    if (ot.depthfirst) {
                        resources.splice(ix, 0, 
                            [children.getNext(), nid]);
                        ix += 1;
                    } else {
                        resources.push(
                            [children.getNext(), nid]);
                    }
                }
            }
        }

        if (resources.length > 0 && !result) {
            ot.timer.initWithCallback(BookmarkDatasource.Continue, 10,
                Ci.nsITimer.TYPE_ONE_SHOT);
        } else {
            ot.complete.apply(ot.Caller, [result]);
        }
    }
}

BookmarkDatasource.prototype = {

    _InitNidNativeMaps: function() {
        BookmarkDatasource._mapNidToNative = {};
        BookmarkDatasource._mapNativeToNid = {};
        this.AddToMap(RDF_ROOT, NODE_ROOT);
    },

    MapNid: function(nid) {
        return BookmarkDatasource._mapNidToNative[nid] || "rdf:#$" + nid;
    },

    MapNative: function(resourceId) {
        return BookmarkDatasource._mapNativeToNid[resourceId] || 
            (resourceId.slice(0, 6) == "rdf:#$" ? 
                resourceId.slice(6) : this.AddToMap(resourceId, resourceId));
    },

    AddToMap: function(resourceId, nid) {
        BookmarkDatasource._mapNidToNative[nid] = resourceId;
        BookmarkDatasource._mapNativeToNid[resourceId] = nid;
        return nid;
    },

    BaselineLoaded: function(baseline, callback) {
        var self = this;
        self._InitNidNativeMaps();
        self.OnTree(this, ScanForSeparators, Done);
        return;

        function ScanForSeparators(resource, pnid) {
            if (!IsSeparator(resource)) {
                return 0;
            }

            var parent = baseline.Node(pnid, false, true);
            if (!parent) {
                return 0;
            }

            for (var i = 0; i < parent.children.length; ++i) {
                var child = baseline.Node(parent.children[i]);
                if (child.ntype == "separator" && 
                        !BookmarkDatasource._mapNidToNative[child.nid]) {
                    self.AddToMap(String(resource.Value), child.nid);
                    break;
                }
            }
            return 0;
        }

        function Done(status) {
            callback(status);
        }

        function IsSeparator(resource) {
            return (self._GetType(resource) == 
                    "http://home.netscape.com/NC-rdf#BookmarkSeparator");
        }
    },

    MAP_NODE_RDF: {
        "nid"           : null,
        "pnid"          : null,
        "children"      : null,
        "tnid"          : null,
        "ntype"         : MapNodeType,
        "description"   : [NC + "Description", Ci.nsIRDFLiteral],
        "name"          : [NC + "Name", Ci.nsIRDFLiteral],
        "created"       : [NC + "BookmarkAddDate", Ci.nsIRDFDate],
        "url"           : [NC + "URL", Ci.nsIRDFLiteral],
        "feedurl"       : [NC + "FeedURL", Ci.nsIRDFLiteral],
        "sidebar"       : MapNodeSidebar,
        "shortcuturl"   : [NC + "ShortcutURL", Ci.nsIRDFLiteral],
        "generateduri"  : [NC + "MicsumGenURI", Ci.nsIRDFLiteral],
        "generatedtitle": null,
        "contenttype"   : [NC + "ContentType", Ci.nsIRDFLiteral],
        "msexpires"     : null,
        "icon"          : [NC + "Icon", Ci.nsIRDFLiteral],
        "formdata"      : [NC + "PostData", Ci.nsIRDFLiteral],
        "modified"      : null,
        "visited"       : [NS + "LastVisitDate", Ci.nsIRDFDate]
    },


    IMMUTABLE_RDF: {
        "http://home.netscape.com/WEB-rdf#LastModifiedDate"     : true,
        "http://home.netscape.com/NC-rdf#BookmarksToolbarFolder": true,
        "http://home.netscape.com/NC-rdf#ID"                    : true,
        "http://developer.mozilla.org/rdf/vocabulary/forward-proxy#forward-proxy"
                                                                : true,
        "http://home.netscape.com/NC-rdf#LivemarkExpiration"    : true,
        "http://home.netscape.com/WEB-rdf#LastCharset"          : true,
        "http://home.netscape.com/NC-rdf#Icon"                  : true,
        "http://home.netscape.com/NC-rdf#GeneratedTitle"        : true,
        "http://home.netscape.com/NC-rdf#MicsumExpiration"      : true
    },

    AcceptNodes: function(ns, callback) {
        var self = this;
        var optimizeOK = ns._cloneSource && ns._cloneSource.rdfSource;
        self.StartWrite();
        ns.OnTree(FlushNode, Done);
        return;

        function FlushNode(nid, pnid) {
            if (optimizeOK && !ns._node[nid]) {
                // We can skip writing this because we know that the
                // nodeset in question is cloned from a nodeset that
                // originated with the local datastore, and the node
                // in question exists only in the clone source; it's
                // thus unchanged.
                return 0;
            }

            self.WriteNode(ns, ns.Node(nid));
            return 0;
        }

        function Done(status) {
            if (status) {
                callback(status);
            } else {
                // You might think that we should set the toolbar
                // before calling EndWrite, but (at least in the case
                // of Firefox 2), you'd be wrong: due to a repaint bug,
                // the toolbar ignores changes to the designated toolbar
                // while it's in the middle of batch updates. One could
                // argue that this should be handled in SetToolbar().
                self.EndWrite();
                self.SetToolbar(ns.Node(NODE_ROOT).tnid);
                callback(0);
            }
        }
    },

    // Call StartWrite before calling WriteNode
    StartWrite: function() {
        this.ds.beginUpdateBatch();
    },

    // Call EndWrite after we're done calling WriteNode
    EndWrite: function() {
        this.ds.endUpdateBatch();
    },

    WriteNode: function(ns, node) {
        // iterate over node's properties; generate list of
        // prospective assertions

        if (node == null) {
            throw Error("node is null");
        }

        var assert = [];
        var attrs = node.GetSafeAttrs();

        for (var attr in attrs) {

            if (!attrs.hasOwnProperty(attr)) {
                continue;
            }

            var map = this.MAP_NODE_RDF[attr];
            var targ = null;
            var pred = null;
            var value = attrs[attr];

            if (map === null) {
                continue;   // do nothing
            } else if (typeof map == "object") {
                // XXX: Optimization: build these in advance
                pred = this.rdfs.GetResource(map[0]);
                var targType = map[1];

                if (targType == Ci.nsIRDFLiteral) {
                    targ = this.rdfs.GetLiteral(value);
                } else if (targType == Ci.nsIRDFDate) {
                    targ = this.rdfs.GetDateLiteral(DateNodeToRDF(value));
                } else {
                    throw Error("Knuckle up! " + typeof value);
                }
            } else if (typeof map == "function") {
                var a = map(value);
                if (!a) {
                    continue;
                } else if (typeof a == 'object') {
                    pred = this.rdfs.GetResource(a[0]);
                    targ = a[2] ? this.rdfs.GetResource(a[1]) :
                                    this.rdfs.GetLiteral(a[1]);
                } else if (typeof a == "string") {
                    ns.Node(node.nid, true)[attr] = a;
                    LogWrite("Warning: Set " + attr + " for node " + 
                            node.nid + " to " + a);
                    continue;
                }
            } else {
                delete ns.Node(node.nid, true)[attr];
                LogWrite("Warning: dropping unrecognized attribute " + attr);
                continue;
            }

            assert.push([pred, targ]);
        }

        var subj = this.rdfs.GetResource(this.MapNid(node.nid));

        if (node.ntype == 'folder') {
            // Are we a folder with no children?
            if (node["children"] == null) {
                node.children = [];
            }
            for (var i = 0; i < node.children.length; ++i) {
                var pred = this.rdfcu.IndexToOrdinalResource(i + 1);
                var targ = this.rdfs.GetResource(this.MapNid(node.children[i]));
                assert.push([pred, targ]);
            }
            assert.push([this.rdfs.GetResource(RDF + "nextVal"),
                this.rdfs.GetLiteral("" + (1 + node.children.length))]);
            // Since we are not asserting the type of bookmark and folder
            // nodes, we assert instanceof Seq so that Firefox can infer
            // that we're talking about a folder here.
            assert.push([this.rdfs.GetResource(RDF + "instanceOf"),
                this.rdfs.GetResource(RDF + "Seq")]);
        } else if (node.ntype == 'feed') {
            // This is some code to keep from deleting children of a 
            // Livemark
            var nextVal = this.ds.GetTarget(subj, 
                this.rdfs.GetResource(RDF + "nextVal"), true);
            if (nextVal) {
                assert.push([this.rdfs.GetResource(RDF + "nextVal"), nextVal]);
            }
            assert.push([this.rdfs.GetResource(RDF + "instanceOf"),
                this.rdfs.GetResource(RDF + "Seq")]);
        }

        // Iterate over existing assertions. For each assertion we find,
        // either:
        // (1) delete it entirely
        // (2) change it to match the new target value
        // (3) do nothing, because it is perfect as it is
        // In either of the latter two cases, remove the match from 
        // the prospective list.

        var alo = this.ds.ArcLabelsOut(subj);

        while (alo.hasMoreElements()) {
            var pred = alo.getNext();
            var targ = this.ds.GetTarget(subj, pred, true);

            var i = FindPredicate(pred);
            if (i < 0) {
                // No match; delete it.
                if (pred instanceof Ci.nsIRDFResource) {
                    // Don't Unassert if:
                    //   1) It's immutable, or
                    //   2) It's a Livemark's ordinal property
                    if (this.IMMUTABLE_RDF[pred.Value] == null && 
                         (node.ntype != 'feed' || 
                             !this.rdfcu.IsOrdinalProperty(pred)) ) { 
                        LogWrite("Unassert("+subj.Value+","+pred.Value+")");
                        this.ds.Unassert(subj, pred, targ, true);
                    } else if (pred.Value == NC + "Icon" && 
                            !XmarksBYOS.gSettings.disableIconSync) {
                        try {
                            this.ds.removeBookmarkIcon(node.url);
                        } catch (e) {
                            LogWrite("removeBookmarkIcon: " + e.toSource());
                        }
                    }
                } else {
                    throw Error("Awwww, man!");
                }
            } else {
                // We matched the predicate. Do we need to change
                // the target?
                if (!TargetsMatch(targ, assert[i][1])) {
                    if (this.IMMUTABLE_RDF[pred.Value] == null) {
                        LogWrite("Change("+subj.Value+","+pred.Value+")");
                        this.ds.Change(subj, pred, targ, assert[i][1]);
                        assert.splice(i, 1);
                    }
                } else {
                    assert.splice(i, 1);
                }
            }
        }

        // execute remaining assertions against datastore
        for (var i = 0; i < assert.length; ++i) {
            var a = assert[i];
            a[0].QueryInterface(Ci.nsIRDFResource);
            a[1].QueryInterface(Ci.nsIRDFNode);
            LogWrite("Asserting " + subj.Value + "," + 
                a[0].Value + "," + a[1].Value);
            if (a[0].Value == NC + "Icon" &&
                    this.ds instanceof Ci.nsIBookmarksService) {
                var iconPieces = ParseIconString(a[1].Value);
                if (iconPieces) {
                    this.ds.updateBookmarkIcon(node["url"], 
                        iconPieces[0], iconPieces[1], iconPieces[1].length);
                }
            } else {
                this.ds.Assert(subj, a[0], a[1], true);
            }
        }

        function FindPredicate(p) {
            for (i = 0; i < assert.length; ++i) {
                if (assert[i][0] == p)
                    return i;
            }
            return -1;
        }

        function TargetsMatch(t1, t2) {
            if (t1 instanceof Ci.nsIRDFDate) {
                return (DateRDFToNode(t1.Value) == DateRDFToNode(t2.Value));
            } else {
                return t1 == t2;
            }
        }
    },

    SetToolbar: function(nid) {
        if (this.GetToolbar() != nid) {
            LogWrite("Setting toolbar nid to " + nid);
            this.ds.setBookmarksToolbarFolder(
                this.rdfs.GetResource(this.MapNid(nid)));
        }
    },

    GetToolbar: function() {
        if (this.ds instanceof Ci.nsIBookmarksService) { 
            var tb = this.ds.getBookmarksToolbarFolder();
            return tb ? this.MapNative(tb.Value) : null;
        } else {
            throw "Criminy! It's not an nsIBookmarksService";
        }
    },

    // traverses this's bookmarks hierarchy starting with
    // startnode, calling action(node) for each node in the tree,
    // then calling complete() when traversal is done.
    // enforces rules about maximum run times to prevent hanging the UI
    // when traversing large trees or when running on slow CPU's.
    // action() should return 0 to continue, non-zero status to abort.
    // complete() is called with non-zero status if aborted.
    // depthfirst determines tree traversal order


    OnTree: function(Caller, action, complete, startnode, depthfirst) {
        ot = {}
        ot.self = this;
        ot.Caller = Caller;
        ot.action = action;
        ot.complete = complete;
        ot.startnode = startnode || this.rdfs.GetResource(RDF_ROOT);
        ot.depthfirst = depthfirst;
        ot.resources = [[ot.startnode, null]];
        ot.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        ot.timer.initWithCallback(BookmarkDatasource.Continue, 
            10, Ci.nsITimer.TYPE_ONE_SHOT);
        return;
    },

    IsContainer: function(resource)
    {
        if (!this.rdfcu.IsContainer(this.ds, resource))
            return false;

        // if it's a Livemark, don't consider it a container, as we don't
        // process its children
        var type = this.ds.GetTarget(resource, this.typePredicate, true);

        return (type instanceof Ci.nsIRDFResource &&
            type.Value != "http://home.netscape.com/NC-rdf#Livemark");
    },

    RDF_NODE_MAP: {
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"   : MapRDFType,
        "http://home.netscape.com/NC-rdf#Description"       : "description",
        "http://home.netscape.com/NC-rdf#Name"              : "name",
        "http://home.netscape.com/NC-rdf#BookmarkAddDate"   : "created",
        "http://home.netscape.com/NC-rdf#URL"               : "url",
        "http://home.netscape.com/NC-rdf#FeedURL"           : "feedurl",
        "http://home.netscape.com/NC-rdf#WebPanel"          : MapRDFSidebar,
        "http://home.netscape.com/NC-rdf#ShortcutURL"       : "shortcuturl",
        "http://home.netscape.com/NC-rdf#LivemarkExpiration": null,
        "http://home.netscape.com/NC-rdf#Icon"              : "icon",
        "http://home.netscape.com/NC-rdf#BookmarksToolbarFolder" 
                                                            : null,
        "http://home.netscape.com/WEB-rdf#LastModifiedDate" : "modified",
        "http://home.netscape.com/WEB-rdf#LastVisitDate"    : "visited",
        "http://home.netscape.com/NC-rdf#MicsumGenURI"      : "generateduri",
        "http://home.netscape.com/NC-rdf#GeneratedTitle"    : null,
        "http://home.netscape.com/NC-rdf#ContentType"       : "contenttype",
        "http://home.netscape.com/NC-rdf#MicsumExpiration"  : null,
        "http://home.netscape.com/NC-rdf#LivemarkLock"      : null,
        "http://home.netscape.com/NC-rdf#PostData"          : "formdata",
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#children"
                                                            : null,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#parent" : null,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#instanceOf" 
                                                            : null,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#nextVal" 
                                                            : null,
        "http://home.netscape.com/NC-rdf#ID"                : null,
        "http://home.netscape.com/WEB-rdf#LastCharset"      : null,
        "http://developer.mozilla.org/rdf/vocabulary/forward-proxy#forward-proxy"
                                                            : null
    },

    GenerateNid: function() {
        var resource = this.rdfs.GetAnonymousResource();
        if (resource instanceof Ci.nsIRDFResource) {
            return this.MapNative(resource.Value);
        } else {
            throw Error("Dagnabbit! Couldn't create anonymous resource");
        }
    },

    NormalizeUrl: function(url) {
        return url;
    },

    ProvideNodes: function(Caller, AddNode, Complete) {
        this.pn = {}
        this.pn.Caller = Caller;
        this.pn.AddNode = AddNode;
        this.pn.Complete = Complete;
        this.OnTree(this, BookmarkDatasource.MapRDFToNode, 
            BookmarkDatasource.ProvideNodesDone);
        return;
    },

    WatchForChanges: function() {
        var watcher = new BookmarkWatcher();
        // start observing
        this.ds.AddObserver(watcher);
        return watcher;
    },
    _GetType: function(resource) {
        var type = this.ds.GetTarget(resource, this.typePredicate, true)
        if (type instanceof Ci.nsIRDFResource) {
            return type.Value;
        } else {
            return null; 
        }
    }
 };

function BookmarkWatcher(){
    this.rdfs = Cc["@mozilla.org/rdf/rdf-service;1"].getService(
      Ci.nsIRDFService);
    this.ds = this.rdfs.GetDataSource("rdf:bookmarks").
            QueryInterface(Ci.nsIBookmarksService);
    this.typePredicate = this.rdfs.
      GetResource("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
}

BookmarkWatcher.prototype = {
    lastModified: null,

    NotifyObservers: function(lm) {
        // Take in RDF's microseconds since 1970.
        // Output Javascript milliseconds since 1970.
        lm = Math.round(lm / 1000);
        if (!this.lastModified || lm > this.lastModified) {
            this.lastModified = lm;
            var os = Cc["@mozilla.org/observer-service;1"]
                .getService(Ci.nsIObserverService);
            os.notifyObservers(null, "xmarksbyos-datasourcechanged",
                lm + ";bookmarks");
        }
    },

    _GetType: function(resource) {
        var type = this.ds.GetTarget(resource, this.typePredicate, true)
        if (type instanceof Ci.nsIRDFResource) {
            return type.Value;
        } else {
            return null; 
        }
    },


    ////////////////////////////////////////////////////////////////////////////
    //
    // nsIRDFObserver

    onAssert: function(dataSource, source, property, target) {
    },

    onUnassert: function(dataSource, source, property, target) {
    },

    onChange: function(dataSource, source, property, oldTarget, newTarget) {
        var self = this;

        var funcIsLivemark = function(resource) {
            return (self._GetType(resource) == 
                    "http://home.netscape.com/NC-rdf#Livemark");
        };
        var funcIsMicsum = function(resource){
            return (self._GetType(resource) == 
                    "http://home.netscape.com/NC-rdf#MicsumBookmark");
        }

        if (property.QueryInterface(Components.interfaces.nsIRDFResource).Value
                == "http://home.netscape.com/WEB-rdf#LastModifiedDate" &&
                !funcIsLivemark(source) && !funcIsMicsum(source)) {
            self.NotifyObservers(newTarget.
                QueryInterface(Ci.nsIRDFDate).Value);
        }
    },

    onBeginUpdateBatch: function(dataSource) {
    },


    onEndUpdateBatch: function(dataSource) {
        // Some kind of changes happened. Alas, the bookmark manager
        // has hidden from us exactly what happened. To be safe,
        // assume that something has changed and fire a sync as required.
        // Oh, and ignore notifications in the first 10 seconds after startup. 
        if (Date.now() - BookmarkDatasource.startupTime >= 10000) {
            if (!XmarksBYOS.gSettings.disableDirtyOnBatch) {
                LogWrite("onEndUpdateBatch()");
                this.NotifyObservers(Date.now() * 1000);
            } else {
                LogWrite("ignoring onEndUpdateBatch");
            }
        }
    }
};


/*
 Copyright 2008 Foxmarks Inc.

 foxmarks-places.js: implements class BookmarkDatasource, encapsulating
 the Firefox Places datasource.

 */

var Cc = Components.classes;
var Ci = Components.interfaces;

const MAP_NATIVE_TO_NID = /folder=(\d+)/g
const MAP_NID_TO_NATIVE = /folder=nid-([\w\-]+)/g

// Comment out this line and uncomment block below to enable
// collection and reporting of timing info.

const collectTimingInfo = false;

/*

const collectTimingInfo = true;

function StartTimes(activity) {
    StartTimes.activity = activity;
    StartTimes.start = Date.now();
    ResetTimes();
    LogWrite("Starting " + activity + "...");
}

function AddTime(f, t) {
    if (!AddTime.times) {
        AddTime.times = {};
    }
    if (!AddTime.times[f]) {
        AddTime.times[f] = [];
    }
    AddTime.times[f].push(t);
}

function ReportTimes() {
    LogWrite("Total time for " + String(StartTimes.activity) + ": " + 
        String(Date.now() -  StartTimes.start));

    function min(a) {
        var m;
        forEach(a, function(v) {
            if (!m || v < m) {
                m = v;
            }
        });
        return m;
    }

    function max(a) {
        var m;
        forEach(a, function(v) {
            if (!m || v > m) {
                m = v;
            }
        });
        return m;
    }

    function avg(a) {
        return (tot(a) / a.length).toPrecision(3);
    }

    function tot(a) {
        var m = 0;
        forEach(a, function(v) {
            m += v;
        });
        return m;
    }

    forEach(AddTime.times, function(v, k) {
            LogWrite("Time: " + k + ": " + String(v.length) + " times, " +
                String(tot(v)) + "ms total (" + 
                String(min(v)) + "/" + String(max(v)) + "/" + String(avg(v)) +
                ")");
    });
}

function ResetTimes() {
    AddTime.times = {};
}

*/

function Call(o, f) {
    const functionRE = /function (\w+)\(\)/
    var args = [];
    if (arguments.length > 2) {
        args = Array.prototype.slice.call(arguments, 2);
    }

    try {
        var start = Date.now();
        var returnVal =  f.apply(o, args);
        var end = Date.now();
        if (collectTimingInfo)
            AddTime(f.toSource().match(functionRE)[1], end - start);
        return returnVal;
    } catch (e) {
        throw Error("Places error calling " + f + " with args " + 
                args.toSource() + " Original error: " + e);
    }
}

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
// Mozilla's representation of dates is microseconds since 1/1/1970.
// Use these utility functions to convert between the two formats
// while minimizing rounding error.

function DatePlacesToNode(v) {
    return Math.round(v / 1000000);
}

function DateNodeToPlaces(v) {
    return (v || 0) * 1000000;
}

   

function BookmarkDatasource() {
    this.bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"].
        getService(Ci.nsINavBookmarksService);
    this.hsvc = Cc["@mozilla.org/browser/nav-history-service;1"].
        getService(Ci.nsINavHistoryService);
    this.asvc = Cc["@mozilla.org/browser/annotation-service;1"].
        getService(Ci.nsIAnnotationService);
    this.lmsvc = Cc["@mozilla.org/browser/livemark-service;2"].
        getService(Ci.nsILivemarkService);
    this.tsvc = Cc["@mozilla.org/browser/tagging-service;1"].
        getService(Ci.nsITaggingService);
    this.fisvc = Cc["@mozilla.org/browser/favicon-service;1"].
        getService(Ci.nsIFaviconService);
    this.mssvc = Cc["@mozilla.org/microsummary/service;1"].
        getService(Ci.nsIMicrosummaryService);
    this.fusvc = Cc["@mozilla.org/docshell/urifixup;1"].
        getService(Ci.nsIURIFixup);

    if (!BookmarkDatasource._mapNidToNative) {
        this._InitNidNativeMaps();
    }

    if (!BookmarkDatasource._locationMap) {
        this._InitLocationMap();
    }

    // defined in foxmarks-sync.js
    applyCommonBookmarkFunctions(this);
}

BookmarkDatasource.STORAGE_ENGINE = "/Places";
BookmarkDatasource.startupTime = Date.now();
BookmarkDatasource.sessionId = BookmarkDatasource.startupTime.toString(36);
BookmarkDatasource.nidIndex = 0;
BookmarkDatasource.MAX_NID_LENGTH = 32;
BookmarkDatasource.LOCATION_MAP_ANNO_NAME = "foxmarks/locationMap";
BookmarkDatasource.MAP_PLACE_TYPE_TO_NTYPE = 
    { 0 : "bookmark", 5: "query", 6: "folder", 7: "separator", 9: "query" };
BookmarkDatasource.MAP_NTYPE_TO_PLACE_TYPE = { 
    "bookmark": [0, 5, 9], 
    "microsummary": [0], 
    "query": [0, 5, 9], 
    "folder": [6], 
    "feed": [6], 
    "separator": [7]};

BookmarkDatasource.MAP_ANNO_TO_NODE = {
    "bookmarkProperties/description"    : ["description"],
    "bookmarkProperties/POSTData"       : ["formdata"],
    "bookmarkProperties/loadInSidebar"  : ["sidebar", 
                                            function(x) { return true; }],
    "livemark/feedURI"                  : ["feedurl"],
    "livemark/siteURI"                  : ["url"],
    "microsummary/generatorURI"         : ["generateduri"],
    "bookmarks/contentType"             : ["contenttype"]
};

BookmarkDatasource.MAP_NODE_TO_ANNO = {
    "description"   : "bookmarkProperties/description",
    "formdata"      : "bookmarkProperties/POSTData",
    "sidebar"       : "bookmarkProperties/loadInSidebar",
    "feedurl"       : "livemark/feedURI",
    "generateduri"  : "microsummary/generatorURI",
    "contentType"   : "bookmarks/contentType"
};

BookmarkDatasource.INTERESTING_PROPERTIES = {
    "title"         : true,
    "keyword"       : true,
    "uri"           : true
};

BookmarkDatasource.KNOWN_ATTRS = {
    "ntype"         : true,
    "description"   : true,
    "formdata"      : true,
    "sidebar"       : true,
    "feedurl"       : true,
    "generateduri"  : true,
    "contentType"   : true,
    "name"          : true,
    "created"       : true,
    "modified"      : true,
    "visited"       : true,
    "shortcuturl"   : true,
    "nid"           : true,
    "pnid"          : true,
    "children"      : true,
    "url"           : true,
    "icon"          : true,
    "tags"          : true,
    "tnid"          : true,
    "unid"          : true
};

BookmarkDatasource.MapPlacesToNode = function(place, pnid, children) {
    var self = this;

    if (!(place instanceof Ci.nsINavHistoryResultNode)) {
        throw Error("Unknown object type " + place);
    }

    if (!(place.type in BookmarkDatasource.MAP_PLACE_TYPE_TO_NTYPE)) {
        LogWrite("Warning: Unhandled result type " + place.type);
        return 0;
    }

    var node = new Node(this.MapNative(place.itemId));
    node.pnid = pnid;
    node.ntype = BookmarkDatasource.MAP_PLACE_TYPE_TO_NTYPE[place.type];
    if (node.ntype == 'folder' && Call(this.lmsvc, this.lmsvc.isLivemark, 
            place.itemId)) {
        node.ntype = 'feed';
    } else if (node.ntype == 'bookmark' && 
            Call(this.mssvc, this.mssvc.hasMicrosummary, place.itemId)) {
        node.ntype = 'microsummary';
    }

    if (place.title && place.title.length) {
        node.name = place.title;
    }
    if (node.ntype == 'bookmark' || node.ntype == 'query' || 
            node.ntype == 'microsummary') {
        node.url = place.uri;
        if (node.ntype == 'query') {
            try {
                node.url = node.url.replace(MAP_NATIVE_TO_NID, function(x, y) {
                        return "folder=nid-" + self.MapNative(y, true);
                    });
            } catch (e) {
                LogWrite("Warning: Failed mapping " + node.toSource());
            }
        } 
    }
    if (place.dateAdded) 
        node.created = DatePlacesToNode(place.dateAdded);
    if (place.lastModified)
        node.modified = DatePlacesToNode(place.lastModified);
    if (place.time)
        node.visited = DatePlacesToNode(place.time);
    var keyword = Call(self.bmsvc, self.bmsvc.getKeywordForBookmark, 
        place.itemId);
    if (keyword) {
        node.shortcuturl = keyword;
    }
    if (node.ntype == 'folder' && children) {
        node.children = children;
    }

    if (node.ntype == 'bookmark' && node.url) {
        var uri = self.NewURI(node.url);
        var iconUri = null;
        try {
            iconUri = Call(self.fisvc, self.fisvc.getFaviconForPage, uri);
        } catch(e) {}
        if (iconUri) {
            var mimeType = {};
            var iconData = null;
            try {
                iconData = Call(self.fisvc, self.fisvc.getFaviconData, iconUri, 
                    mimeType, {});
            } catch(e) {}
            if (iconData && iconData.length > 0) {
                node.icon = "data:" + mimeType.value + ";base64," + 
                    Base64.encode(iconData, true);
            }
        }
    }

    forEach(BookmarkDatasource.MAP_ANNO_TO_NODE, function(attr, k) {
        var value = GetAnnotation(place.itemId, k);
        if (value) {
            node[attr[0]] = attr[1] ? attr[1](value) : value;
        }
    } );

    if (place.uri) {
        var uri = self.NewURI(place.uri);
        var tags = uri ? Call(this.tsvc, this.tsvc.getTagsForURI, uri, {}) : [];
        if (tags.length) {
            node.tags = tags.slice().filter(function(x) { 
                    return x && x.length; });
            // Clone it so we get toJSONString, etc.
        }
    }

    this.pn.AddNode.apply(this.pn.Caller, [node]);
    return 0;

    function GetAnnotation(itemId, anno) {
        try {
            return Call(self.asvc, self.asvc.getItemAnnotation, itemId, anno);
        } catch (e) {
            return null;
        }
    }
}

BookmarkDatasource.ProvideNodesDone = function(status) {
    if (!status) {
        // Order is significant here; apply in reverse order
        // from that in which these were accepted.
        this._ApplyLocationMap(this.pn.Caller, 
            this.bmsvc.unfiledBookmarksFolder);
        this._ApplyLocationMap(this.pn.Caller,
            this.bmsvc.toolbarFolder);
        this.pn.Caller.Node(NODE_ROOT, true).tnid =
            this.MapNative(this.bmsvc.toolbarFolder);
        this.pn.Caller.Node(NODE_ROOT, true).unid =
            this.MapNative(this.bmsvc.unfiledBookmarksFolder);
    }
    this.pn.Caller.placesSource = true;
    this.pn.Complete.apply(this.pn.Caller, [status]);
    this.pn = null;
    if (collectTimingInfo)
        ReportTimes();
    return;
}

// ot is the static object that maintains state for OnTree,
// the tree-walker.

var ot = {}

BookmarkDatasource.prototype = {

    //
    // Nid <-> Native maps
    //

    // We use Places' GUID as our nids. These functions
    // provide mapping services between GUID/nid and the
    // native itemid.

    _InitNidNativeMaps: function() {
        BookmarkDatasource._mapNidToNative = {};
        BookmarkDatasource._mapNativeToNid = {};
        this.AddToMap(this.bmsvc.bookmarksMenuFolder, NODE_ROOT);
    },

    MapNid: function(nid) {
        return BookmarkDatasource._mapNidToNative[nid] || 
            Call(this.bmsvc, this.bmsvc.getItemIdForGUID, nid);
    },

    MapNative: function(itemId, silent) {

        // Try the map first.
        var nid = BookmarkDatasource._mapNativeToNid[itemId];
        if (nid)
            return nid;

        // Try to get a reasonable length GUID.
        try {
            nid = Call(this.bmsvc, this.bmsvc.getItemGUID, itemId);
        } catch(e) {
            if (!silent) {
                LogWrite("MapNative failed with itemId = " + itemId);
                LogWrite("Caller is " + this.MapNative.caller);
            }
            throw e;
        }
        if (nid.length < BookmarkDatasource.MAX_NID_LENGTH)
            return nid;

        // No? Make our own.
        nid = this.GenerateNid();
        Call(this.bmsvc, this.bmsvc.setItemGUID, itemId, nid);
        return nid;
    },

    AddToMap: function(itemId, nid) {
        BookmarkDatasource._mapNidToNative[nid] = itemId;
        BookmarkDatasource._mapNativeToNid[itemId] = nid;
        return nid;
    },

    GenerateNid: function() {
        return BookmarkDatasource.sessionId + "-" +
            (BookmarkDatasource.nidIndex++).toString(36);
    },


    //
    // LocationMaps
    //

    /* For the special folders (toolbar and unfiled), we maintain
       an annotation to persist those folders' location in the nodeset.
       The location is represented as a [pnid, bnid] combination.
       The annotation itself is just the toSource() representation of the
       LocationMap dict, which is keyed off the itemId.
     */

    _InitLocationMap: function() {
        try {
            BookmarkDatasource._locationMap = 
                eval(Call(this.asvc, this.asvc.getItemAnnotation, 
                        this.bmsvc.bookmarksMenuFolder,
                        BookmarkDatasource.LOCATION_MAP_ANNO_NAME));
        } catch(e) {
            BookmarkDatasource._locationMap = {};
            BookmarkDatasource._locationMap[this.bmsvc.toolbarFolder] = 
                [null, null];
            BookmarkDatasource._locationMap[this.bmsvc.unfiledBookmarksFolder] = 
                [null, null];
        }
    },

    _WriteLocationMap: function() {
        var lm = BookmarkDatasource._locationMap.toSource();
        Call(this.asvc, this.asvc.setItemAnnotation, 
            this.bmsvc.bookmarksMenuFolder,
            BookmarkDatasource.LOCATION_MAP_ANNO_NAME, lm, 0, 
            this.asvc.EXPIRES_NEVER);
    },

    _ModifyLocationMap: function(itemId, pnid, bnid) {
        var val = [pnid, bnid];
        if (!equals(BookmarkDatasource._locationMap[itemId], val)) {
            LogWrite("Modifying locationmap for " + itemId + " from " +
                    BookmarkDatasource._locationMap[itemId].toSource() + " to " + 
                    val.toSource());
            BookmarkDatasource._locationMap[itemId] = val;
            this._WriteLocationMap();
        }
    },

    _ApplyLocationMap: function(ns, itemId) {
        // Move special node into the correct position
        var v = BookmarkDatasource._locationMap[itemId];
        if (!v)
            return;

        var nid = this.MapNative(itemId);
        var pnid = v[0];
        var bnid = v[1];

        if (!ns.Node(nid, false, true)) {
            return;
        }

        if (!pnid || !ns.Node(pnid, false, true)) {
            pnid = NODE_ROOT;
            bnid = null;
        }

        if (bnid && (!ns.Node(pnid)["children"] ||
                ns.Node(pnid).children.indexOf(bnid) < 0)) {
            bnid = null;
        }

        ns.InsertInParent(nid, pnid, bnid);
    },

    //
    //
    //

    BaselineLoaded: function(baseline, callback) {
        // NYI
        callback(0);
        return;
    },

    NewURI: function(str) {
        var uri = null;
        try {
            uri = Cc["@mozilla.org/network/io-service;1"].
                getService(Ci.nsIIOService).
                newURI(str, "UTF-8", null);
        } catch(e) {}
        if (!uri) {
            LogWrite("Failed to produce uri for " + str);
        }
        return uri;
    },

    FixedURI: function(str) {
        var fixed = null;
        try {
            fixed = Call(this.fusvc, this.fusvc.createFixupURI, str, 0);
        } catch (e) {
            fixed = Call(this.fusvc, this.fusvc.createFixupURI, 
                "about:blank", 0)
        }
        return fixed;
    },

    NormalizeUrl: function(str) {
        return this.FixedURI(str).spec;
    },

    runBatched: function() {
        this._func.apply(this, this._args);
    },


    //
    // Functions for writing to the native store.
    //

    AcceptNodes: function(ns, callback) {
        if (collectTimingInfo)
            StartTimes("AcceptNodes");
        this._func = this._AcceptNodes;
        this._args = arguments;
        this.bmsvc.runInBatchMode(this, null);
        if (collectTimingInfo)
            ReportTimes();
    },

    _AcceptNodes: function(ns, callback) {
        /*

         Here's the strategy. Execute a query on the top-level of the
         bookmarks hierarchy. Push the result for that root onto the stack,
         along with the matching root of the nodeset.

         Pop the next pair off the stack. Compare direct properties, and make
         adjustments as necessary. If the nodes being compared are folders
         deal with their children as follows:

         (1) First, make sure that all of the children in the node exist
             on the Places side. This means creating entities that don't exist
             at all, and moving entities that exist in a different parent.
         (2) Delete any item that exists on the Places side but not at all
             on in the nodeset.
         (3) Iterate over the node's children, setting position indices in
             the Places children as appropriate.
         (4) Iterate over the node children again, pushing the appropriate
             pairs onto the stack.

         Dealing with toolbar: we're going to examine the tnid for the
         incoming nodeset and see if it's the same as the nid for the
         Places toolbarFolder. If it is different, we're
         going to change the nid on the toolbarFolder to match the new tnid.

         We'll also be looking at the location of the toolbar, and updating
         the location map if necessary to correspond to the toolbar folder's
         current location.

         Finally, we process the toolbar folder separately, dealing with it
         only as a root and not as a child (that is, if we see it come
         through as a child in the nodeset, we will ignore it).

         */

        var items = [];
        var fixupQueries = [];
        var self = this;
        var status = 0;

        var optimizeOK =  ns._cloneSource && ns._cloneSource.placesSource;

        try {
            var tnid = ns.Node(NODE_ROOT).tnid;
            var unid = ns.Node(NODE_ROOT).unid;

            var specialNids = [];
            AcceptNewRoot(this.bmsvc.toolbarFolder, tnid);
            AcceptNewRoot(this.bmsvc.unfiledBookmarksFolder, unid);

            this.PushRoot(this.bmsvc.bookmarksMenuFolder, items);
            this.PushRoot(this.bmsvc.toolbarFolder, items);
            this.PushRoot(this.bmsvc.unfiledBookmarksFolder, items);

            while (items.length) {
                var item = items.shift();
                var place = item[0];
                var itemId = place.itemId;
                var nid = item[1];
                var node = ns.Node(nid, false, true);
                if (!node) {
                    // Node in question was deleted; sync children
                    // and be done.
                    SynchronizeChildren(true);
                    continue;
                }
                if (MAP_NID_TO_NATIVE.test(node.url)) {
                    fixupQueries.push(itemId);
                }
                var uri = self.FixedURI(node.url);

                if (!optimizeOK || ns._node[nid]) {
                    SynchronizeDirectProperties();
                    SynchronizeIcons();
                    SynchronizeAnnotations();
                    SynchronizeTags();
                    SynchronizeChildren(false);
                }

                if (node.ntype == 'folder' &&
                        place instanceof Ci.nsINavHistoryContainerResultNode) {
                    place.containerOpen = true;
                    for (var i = 0; i < place.childCount; ++i) {
                        var child = place.getChild(i);
                        items.push([child, self.MapNative(child.itemId), nid]);
                    }
// XXX: Firefox incorrectly garbage collects if we close.
//                    place.containerOpen = false;
                }
            }

            forEach(fixupQueries, function(itemId) {
                try {
                    var uri = Call(self.bmsvc, self.bmsvc.getBookmarkURI, 
                        itemId).spec;
                    uri = uri.replace(MAP_NID_TO_NATIVE, function(x, y) {
                        return "folder=" + self.MapNid(y);
                    });
                    Call(self.bmsvc, self.bmsvc.changeBookmarkURI, itemId, 
                        self.NewURI(uri));
                } catch(e) {
                    LogWrite("Warning: Couldn't map to nid; error is " + e)
                }
            });
                
        } catch(e) {
            LogWrite("Exception in AcceptNodes: " + e);
            status = 3;
        }
        callback(status);
        return;

        function AcceptNewRoot(itemId, nid) {
            var nidValid = nid && ns.Node(nid, false, true) != null;
            if (!nidValid || self.MapNative(itemId) != nid) {
                optimizeOK = false;     // Can't optimize write if root changes.
                var oldId = Call(self.bmsvc, self.bmsvc.getItemIdForGUID, nid);
                if (oldId >= 0) {
                    // If the folder that is the new root exists as an
                    // ordinary folder in places, make the old folder itself go
                    // away by giving it a new nid. (It will get deleted after 
                    // its children get moved into the new place.)
                    Call(self.bmsvc, self.bmsvc.setItemGUID, oldId, 
                        self.GenerateNid());
                }
                Call(self.bmsvc, self.bmsvc.setItemGUID, itemId, 
                    nidValid ? nid : self.GenerateNid());
            }

            if (nidValid) {
                self._ModifyLocationMap(itemId, ns.Node(nid).pnid,
                    NextSibling(nid));
            } else {
                self._ModifyLocationMap(itemId, null, null);
            }
            specialNids.push(nid);
        }

        function NextSibling(nid) {
            var siblings = ns.Node(ns.Node(nid).pnid).children;
            var index = siblings.indexOf(nid) + 1;
            while (specialNids.indexOf(siblings[index]) >= 0 &&
                    index < siblings.length) {
                index++;
            }
            return siblings[index];
        }

        function SynchronizeDirectProperties() {
            if (BookmarkDatasource.MAP_NTYPE_TO_PLACE_TYPE[node.ntype].
                    indexOf(place.type) < 0) {
                throw Error("Type mismatch for " + ns.NodeName(nid) +
                    "place.type = " + place.type + " node.ntype = " +
                    node.ntype);
            }

            if (node.ntype == 'bookmark' || node.ntype == 'query' ||
                    node.ntype == 'microsummary') {
                if (place.uri != node.url) {
                    Call(self.bmsvc, self.bmsvc.changeBookmarkURI, itemId, uri);
                    // Conversion to URI may alter exact text, so
                    // modify it in incoming node if it changed.
                    if (uri.spec != node.url) {
                        ns.Node(nid, true).url = uri.spec;
                    }
                }
            } else if (node.ntype == 'feed') {
                Call(self.asvc, self.asvc.setItemAnnotation, itemId, 
                    "livemark/siteURI", node.url || "", 0, 
                    self.asvc.EXPIRE_NEVER);
            } else if (node.ntype == 'separator') {
                if (node.name) {
                    delete node["name"];
                }
            }

            if (place.title != node.name) {
                Call(self.bmsvc, self.bmsvc.setItemTitle, itemId, 
                    node.name || "");
            }

            if (DatePlacesToNode(place.dateAdded) != (node.created || 0)) {
                Call(self.bmsvc, self.bmsvc.setItemDateAdded, itemId, 
                    DateNodeToPlaces(node.created));
            }

            if (DatePlacesToNode(place.lastModified) != (node.modified || 0)) {
                Call(self.bmsvc, self.bmsvc.setItemLastModified, itemId, 
                    DateNodeToPlaces(node.modified));
            }

            if (Call(self.bmsvc, self.bmsvc.getKeywordForBookmark, itemId) !=
                    node.shortcuturl) {
                Call(self.bmsvc, self.bmsvc.setKeywordForBookmark, itemId, 
                    node.shortcuturl);
            }

            forEach(node, function(v, k) {
                if (!BookmarkDatasource.KNOWN_ATTRS[k] && 
                        typeof v != "function") {
                    LogWrite("Warning: deleting unknown attr " + k);
                    delete ns.Node(nid, true)[k];
                }
            });
        }

        function SynchronizeIcons() {
            if (node.url && uri && node.ntype == 'bookmark' || 
                    node.ntype == 'microsummary') {
                var parsedIcon = node.icon ? 
                    ParseIconString(node.icon) : null;
                if (parsedIcon) {
                    // To store favicon data:
                    // (1) Compare it against what we've already got.
                    //     If it's unchanged, skip it.
                    // (2) Generate a new uri.
                    // (3) Store the data for that uri.
                    // (4) Set the favicon uri for the node url.

                    var iconUri = null;
                    try {
                        iconUri = Call(self.fisvc, self.fisvc.getFaviconForPage,
                            uri);
                    } catch(e) {}
                    if (iconUri) {
                        var mimeType = {};
                        var iconData = Call(self.fisvc, 
                            self.fisvc.getFaviconData, iconUri, mimeType, {});
                    }

                    if (!iconUri || mimeType != parsedIcon[0] || iconData != 
                            parsedIcon[1]) {
                        var newIconUri = 
                            self.NewURI("http://icon.xmarks.com/" +
                                self.GenerateNid());
                        Call(self.fisvc, self.fisvc.setFaviconData, newIconUri, 
                            parsedIcon[1], parsedIcon[1].length, parsedIcon[0],
                            Number.MAX_VALUE);
                        Call(self.fisvc, self.fisvc.setFaviconUrlForPage, uri, 
                            newIconUri);
                    }
                } else {
                    // Clear icon if it exists.
                    var iconUri = null;
                    try {
                        var iconUri = Call(self.fisvc, 
                            self.fisvc.getFaviconForPage, uri);
                    } catch (e) {}
                    if (iconUri) {
                        Call(self.fisvc, self.fisvc.setFaviconData, iconUri, 
                            null, 0, null, 0);
                    }
                    // Clear incoming icon if it existed and was invalid.
                    if (node.icon) {
                        ns.Node(nid, true).icon = null;
                    }
                }
            }
        }

        function SynchronizeAnnotations() {
            // Annotation stragegy:
            // (1) Get a list of all annotations for this place.
            // (2) Filter that list down to the annos we're interested in.
            // (3) Build a list of annotation-stored attributes set in the node.
            // (4) Sync the two lists: process changes, adds, deletes.

            var placeAnnos = Call(self.asvc, self.asvc.getItemAnnotationNames, 
                itemId, {});
            placeAnnos = placeAnnos.filter(function(x) { 
                return (x in BookmarkDatasource.MAP_ANNO_TO_NODE);
            });

            var nodeAnnos = [];
            forEach(BookmarkDatasource.MAP_NODE_TO_ANNO, function(v, x) { 
                if (node[x]) {
                    nodeAnnos.push(x);
                }
            });

            // Exceptional case: if it's a feed, the url maps to
            // the livemark/siteURI annotation.
            if (node.ntype == 'feed' && node.url) {
                nodeAnnos.push('url');
            }

            forEach(nodeAnnos, function(attr) {
                var anno = BookmarkDatasource.MAP_NODE_TO_ANNO[attr];
                if (node.ntype == 'feed' && attr == 'url')
                    anno = "livemark/siteURI";  // Exception
                if (placeAnnos.indexOf(anno) >= 0) {
                    placeAnnos.splice(placeAnnos.indexOf(anno), 1);
                    var value = Call(self.asvc, self.asvc.getItemAnnotation, 
                        itemId, anno);
                    if (value == node[attr]) {
                        return;
                    }
                }
                Call(self.asvc, self.asvc.setItemAnnotation, itemId, anno, 
                    node[attr], 0, self.asvc.EXPIRE_NEVER);
            });

            forEach(placeAnnos, function(anno) {
                Call(self.asvc, self.asvc.removeItemAnnotation, itemId, anno);
            });
        }

        function SynchronizeTags() {
            // Sync tags
            var tags = uri ? 
                    Call(self.tsvc, self.tsvc.getTagsForURI, uri, {}).slice() :
                    [];
            var ntags = node.tags || [];
            if (!equals(tags, ntags)) {
                // Delete extraneous tags
                var extra = tags.filter(function(x) { 
                        return x && x.length && ntags.indexOf(x) < 0; } );
                if (extra.length) {
                    Call(self.tsvc, self.tsvc.untagURI, uri, extra);
                }

                // Add missing tags
                var missing = ntags.filter(function(x) {
                        return x.length && tags.indexOf(x) < 0; } );
                if (missing.length) {
                    Call(self.tsvc, self.tsvc.tagURI, uri, missing);
                }
            }
        }

        function SynchronizeChildren(isDeleted) {
            if (isDeleted) {
                node = new Node(nid, { ntype: "folder" } );
            }

            if (!(node.ntype == 'folder' &&
                    place instanceof Ci.nsINavHistoryContainerResultNode))
                return;

            // Deal with children.
            place.containerOpen = true;

            var children = [];
            for (var i = 0; i < place.childCount; ++i) {
                var child = place.getChild(i);
                children.push(self.MapNative(child.itemId));
            }

            if (!node.children) {
                node.children = [];
            }

            // Filter "special" children.
            var nodeChildren = node.children.filter(function(x) {
                return x != tnid && x != unid;
            } );

            // Do inserts and moves.
            forEach(nodeChildren, function(child) {
                if (children.indexOf(child) >= 0) {
                    return;
                }
                if (Call(self.bmsvc, self.bmsvc.getItemIdForGUID, child) >= 0) {
                    LogWrite("Moving item " + ns.NodeName(child) + " to " + ns.NodeName(self.MapNative(itemId)));
                    Call(self.bmsvc, self.bmsvc.moveItem, self.MapNid(child),
                         itemId, -1);
                    return;
                }
                var cnode = ns.Node(child);
                var newItemId = null;
                LogWrite("Creating " + cnode.ntype + " " + ns.NodeName(child) + " ...");
                switch (cnode.ntype) {
                case 'bookmark': 
                case 'microsummary':
                case 'query':
                    newItemId = Call(self.bmsvc, self.bmsvc.insertBookmark, 
                        itemId, self.FixedURI(cnode.url), -1, cnode.name || "");
                    LogWrite("Bookmark created.");
                    break;
                case 'folder':
                    newItemId = Call(self.bmsvc, self.bmsvc.createFolder, 
                        itemId, cnode.name || "", -1);
                    LogWrite("Folder created.");
                    break;
                case 'separator':
                    newItemId = Call(self.bmsvc, self.bmsvc.insertSeparator, 
                        itemId, -1);
                    LogWrite("Separator created");
                    // XXX: Separator name?
                    break;
                case 'feed':
                    newItemId = Call(self.lmsvc, self.lmsvc.createLivemark, 
                        itemId, cnode.name || "", self.FixedURI(cnode.url), 
                        self.FixedURI(cnode.feedurl), -1);
                    LogWrite("Feed created.");
                    break;
                }
                if (newItemId) {
                    Call(self.bmsvc, self.bmsvc.setItemGUID, newItemId, child);
                }
            });

            // Do deletes.
            for (var i = 0; i < place.childCount; ++i) {
                var childItemId = Call(place, place.getChild, i).itemId;
                if (ns.Node(self.MapNative(childItemId), false, true)) {
                    continue;
                }
                try {
                    LogWrite("Removing " + childItemId + " : " + 
                            ns.NodeName(self.MapNative(childItemId)));
                    Call(self.bmsvc, self.bmsvc.removeChildAt, itemId, i--);
                } catch(e) {
                    LogWrite("Warning: failed trying to remove " +
                        self.MapNative(childItemId));
                    LogWrite("Error was " + e);
                    i++;
                }
            }

            // Do reorders.
            var extraIndex = nodeChildren.length;
            var reorders = [];
            for (var i = 0; i < place.childCount; ++i) {
                var childItemId = place.getChild(i).itemId;
                var index = nodeChildren.indexOf(self.MapNative(childItemId));
                if (index < 0) {
                    index = extraIndex++;
                }
                if (Call(self.bmsvc, self.bmsvc.getItemIndex, childItemId) != 
                        index) {
                    reorders.push([childItemId, index]);
                }
            }

            reorders.sort(function(a, b) { return a[1] - b[1]; });

            /*
            if (reorders.length) {
                LogWrite("Executing reoders in folder " + ns.NodeName(node.nid));
                LogWrite("reorders is " + reorders.toSource());
                LogWrite("nodeChildren is " + nodeChildren.toSource());
                for (var i = 0; i < place.childCount; ++i) {
                    var childItemId = place.getChild(i).itemId;
                    LogWrite("child " + i + " : " + childItemId + " is " +
                            ns.NodeName(self.MapNative(childItemId)));
                }
            }
*/

            forEach(reorders, function(r) {
                LogWrite("Setting index for " + 
                    ns.NodeName(self.MapNative(r[0])) + " to " + r[1]);
                Call(self.bmsvc, self.bmsvc.setItemIndex, r[0], r[1]);
            } );
                
// XXX: Firefox incorrectly garbage collects if we close.
//            place.containerOpen = false;
        }
    },

    //
    // Functions for reading from the native store.
    //

    notify: function(timer) {
        var self = ot.self;
        self._func = self._OnTree;
        self._args = null;
        this.bmsvc.runInBatchMode(this, null);
    },

    _OnTree: function() {
        var self = ot.self;
        var items = ot.items;
        var result;
        var s = Date.now();
        while (items.length > 0 && Date.now() - s < 100) {
            var next = items.shift();
            var item = next[0];
            var pnid = next[2];
            var children = null;

            if (self.IsContainer(item)) {
                children = self.PushChildren(item, items, ot.depthFirst);
            }

            try {
                result = ot.action.apply(ot.Caller, [item, pnid, children]);
            } catch (e) {
                LogWrite("OnTree error: " + e);
                result = 3;
            }

            if (result)
                break;
        }

        if (items.length > 0 && !result) {
            ot.timer.initWithCallback(self, 10,
                Ci.nsITimer.TYPE_ONE_SHOT);
        } else {
            ot.complete.apply(ot.Caller, [result]);
        }
    },

    OnTree: function(Caller, action, complete) {
        ot = {}
        ot.self = this;
        ot.Caller = Caller;
        ot.action = action;
        ot.complete = complete;
        ot.depthfirst = false;
        ot.items = []

        this.PushRoot(this.bmsvc.bookmarksMenuFolder, ot.items);
        this.PushRoot(this.bmsvc.toolbarFolder, ot.items);
        this.PushRoot(this.bmsvc.unfiledBookmarksFolder, ot.items);

        ot.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        ot.timer.initWithCallback(this, 10, Ci.nsITimer.TYPE_ONE_SHOT);

        return;
    },

    PushRoot: function(itemId, list) {
        var nid = null;
        try {
            nid = this.MapNative(itemId);
        } catch(e) {
            LogWrite("Error: PushRoot couldn't find root for " + itemId);
        }

        if (!nid) {
            return false;
        }

        var options = Call(this.hsvc, this.hsvc.getNewQueryOptions);
        var query = Call(this.hsvc, this.hsvc.getNewQuery);
        query.setFolders([itemId], 1);
        var result = Call(this.hsvc, this.hsvc.executeQuery, query, options);
        list.push([result.root, nid, null]);
        return true;
    },

    IsContainer: function(item) {
        return (BookmarkDatasource.MAP_PLACE_TYPE_TO_NTYPE[item.type] == 
                'folder' && !this.lmsvc.isLivemark(item.itemId));
    },

    ProvideNodes: function(Caller, AddNode, Complete) {
        if (collectTimingInfo)
            StartTimes("ProvideNodes");
        this.pn = {}
        this.pn.Caller = Caller;
        this.pn.AddNode = AddNode;
        this.pn.Complete = Complete;
        this.OnTree(this, BookmarkDatasource.MapPlacesToNode, 
            BookmarkDatasource.ProvideNodesDone);
        return;
    },

    // Enumerate the children of item and push them
    // onto the provided list, according to depthFirst ordering.
    // Returns the list of child nids.

    PushChildren: function(item, list, depthFirst) {
        if (!(item instanceof Ci.nsINavHistoryContainerResultNode)) {
            throw Error("Expected a folder but got a non-container");
        }

        item.containerOpen = true;
        var pnid = this.MapNative(item.itemId);
        var cnids = []

        for (var i = 0; i < item.childCount; ++i) {
            child = item.getChild(i);
            var cnid = this.MapNative(child.itemId)
            cnids.push(cnid);
            if (depthFirst) {
                list.splice(i, 0, [child, cnid, pnid]);
            } else {
                list.push([child, cnid, pnid]);
            }
        }
// XXX: Firefox incorrectly garbage collects if we close.
//        item.containerOpen = false;
        return cnids;
    },

    //
    // Observer functions.
    //

    WatchForChanges: function() {
        var watcher = new BookmarkWatcher();
        // start observing
        Call(this.bmsvc, this.bmsvc.addObserver, watcher, false);

        return watcher;
    }
};

function BookmarkWatcher(){
    this.lmsvc = Cc["@mozilla.org/browser/livemark-service;2"].
        getService(Ci.nsILivemarkService);
    this.mssvc = Cc["@mozilla.org/microsummary/service;1"].
        getService(Ci.nsIMicrosummaryService);
}

BookmarkWatcher.prototype = {

    lastModified: null,

    NotifyObservers: function(reason) {
        // Output Javascript milliseconds since 1970.
        var lm = Date.now();
        if (!this.lastModified || lm > this.lastModified) {
            this.lastModified = lm;
            var os = Cc["@mozilla.org/observer-service;1"]
                .getService(Ci.nsIObserverService);
            os.notifyObservers(null, "xmarksbyos-datasourcechanged", 
                lm + ";bookmarks");
        }
    },

    ////////////////////////////////////////////////////////////////////////////
    //
    // nsINavBookmarkObserver

    onItemAdded: function(itemId, folderId) { 
        if (!this.lmsvc.isLivemark(folderId)) {
            this.NotifyObservers("Added") 
        }
    },

    onItemRemoved: function(itemId, folderId) { 
        if (!this.lmsvc.isLivemark(folderId)) {
            this.NotifyObservers("Removed")
        }
    },

    onItemChanged: function(itemId, property) { 
        // Skip title change for Microsummaries
        if (this.mssvc.hasMicrosummary(itemId) && property == 'title')
            return;

        if (BookmarkDatasource.INTERESTING_PROPERTIES[property] ||
            BookmarkDatasource.MAP_ANNO_TO_NODE[property]) {
            this.NotifyObservers("Changed") 
        }
    },

    onItemMoved: function() { 
        this.NotifyObservers("Moved") 
    },

    onItemVisited: function() {},
    onBeginUpdateBatch: function() {},
    onEndUpdateBatch: function() {},

    QueryInterface: function(iid) {
        if (iid.equals(Ci.nsINavHistoryBatchCallback) ||
            iid.equals(Ci.nsINavBookmarkObserver))
            return this;
        throw Components.result.NS_ERROR_NO_INTERFACE;
    },
};



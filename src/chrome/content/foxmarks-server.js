/*
 Copyright 2007-2008 Foxmarks Inc.

 foxmarks-server.js: component that implements the logical interface to
 the server.

 */

// TO DO:
// * Deal with failure to retrieve baseline state from server -> merge



function getDatasourceAttribute(synctype, attr){
    switch(synctype){
        case 'bookmarks':
            switch(attr){
                case 'engine':
                    return BookmarkDatasource.STORAGE_ENGINE;
                default:
                    throw("getDatasourceAttribute: unknown attribute (" + attr + ")");
            }
            break;
        case 'lastmodifieddate':
            break;
        default:
            throw("getDatasourceAttribute: unknown synctype (" + synctype + ")");
    }

}

function hasPasswordSync(){
    return "@mozilla.org/login-manager;1" in Cc;

}

var SYNCSET = {};
if(hasPasswordSync()){
    SYNCSET = {
        "bookmarks": BookmarkDatasource,
        "passwords": PasswordDatasource
    };
}
else {

    SYNCSET = {
        "bookmarks": BookmarkDatasource
    };
}
   
function createDatasource(type){
    var model = new SYNCSET[type];
    if(model === undefined)
        throw("createDatasource:  unknown synctype (" + type +")");

    return model;
}   

function loadDatasourceSet(allItems) {
    var result = [];
    var type;
    var obj = {};
    for(type in SYNCSET){
        if(obj[type] === undefined){
            if(XmarksBYOS.gSettings.isSyncEnabled(type) || allItems){
                var model = createDatasource(type);
                result.push(model);
            }
        }
    }

    
    return result;
}

function SyncServer() {
}

SyncServer.prototype = {
    _syncEngine: null,
    _request: null,
    _baselineCache: {},
    cancel: function() {
        if(this._syncEngine) {
            this._syncEngine.cancel();
        } 
        if (this._request){
            this._request.Cancel();
        }
    },
    datacancel: function(){
        if (this._request){
            this._request.Cancel();
        }
    },
    _createSyncEngine: function(datasource){
        var cls = XmarksBYOS.gSettings.useOwnServer ?
            OwnSyncEngine : 
            Syncd2SyncEngine;
        var result = new cls(this,datasource);

        result.manual = this.manual;
        return result;
    },

    getBaseline: function(syncType,callback){
        var ds = createDatasource(syncType);
        var se = this._createSyncEngine(ds);
        se._fetchBaseline(function(status){
            if(se._responseOK(status, callback)){
                callback(0, se._baseline);
            }
        });
    },
    suspendWatcher: function(state){
        var os = Cc["@mozilla.org/observer-service;1"]
            .getService(Ci.nsIObserverService);
        os.notifyObservers(null, "xmarksbyos-watchersuspend", 
            state ? "1" : "0");
    },


    _doPerDatasource: function(funcname, callback, arg2){
        var list = loadDatasourceSet();
        var that = this;
        var ds = {};

        try {
            that.suspendWatcher(true);
        
            // loop through each set of syncdata, using the 
            //  chained callback mechanism, dropping out if
            //  we encounter an error
            var mycallback = function(statuscode){
                if(statuscode == 0 || statuscode == 444){
                    // 444 -handle purged state
                    if(statuscode == 444){
                        // if we allow purge from other data types
                        // we'll need to modify this string
                        XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName(
                            "msg.passwordsyncpurged"));
                        XmarksBYOS.gSettings.setSyncEnabled(ds.syncType, false);
                        statuscode = 0;
                    }
                    if(ds && ds.syncType !== undefined){
                        XmarksBYOS.gSettings.SyncComplete(ds.syncType);
                        XmarksBYOS.SetProgressComponentStatus(ds.syncType, "end");
                    }
                    ds = list.shift();
                    if(ds){
                        that._syncEngine = that._createSyncEngine(ds);
                        XmarksBYOS.SetProgressComponentStatus(ds.syncType, "start");
                        if(arg2 !== undefined){
                            that._syncEngine[funcname](arg2, mycallback);
                        }
                        else {
                            that._syncEngine[funcname](mycallback);
                        }
                    }
                    else {
                        callback(statuscode);
                        that.suspendWatcher(false);
                        that._syncEngine = null;
                        if(!XmarksBYOS.gSettings.useBaselineCache){
                            that._baselineCache = {};
                        }
                    }
                }
                else {
                    callback(statuscode);
                    that.suspendWatcher(false);
                    that._syncEngine = null;
                    if(!XmarksBYOS.gSettings.useBaselineCache){
                        that._baselineCache = {};
                    }
                }
            }

            mycallback(0);
        }catch(e){
            that.suspendWatcher(false);
            if(typeof e == "object" && e.message){
                LogWrite("Sync Error: " + e.message + "(" +
                        e.fileName + ": " + e.lineNumber + ")");
            } else {
                LogWrite("Synchronization failed. Error is " + 
                    e.toSource() + " (type = " + typeof e + ")");
            }
            if(typeof e == "number"){
                mycallback(e);
            } else {
                mycallback(4);
            }
        }
    },
    sync: function(prevState, callback){
        XmarksBYOS.SetProgressMessage("progress.syncing");
        this._doPerDatasource("sync", callback, prevState);
    },
    upload: function(callback){
        XmarksBYOS.SetProgressMessage("progress.syncing");
        this._doPerDatasource("upload", callback);
    },
    download: function(callback){
        XmarksBYOS.SetProgressMessage("progress.syncing");
        this._doPerDatasource("download", callback);
    },
    merge: function(local, callback){
        XmarksBYOS.SetProgressMessage("progress.syncing");
        this._doPerDatasource("merge", callback, local);
    },
    status: function(syncType, callback){
        var ds = createDatasource(syncType);
        var se = this._createSyncEngine(ds);
        se.status(callback);
    },
    extstatus: function(syncType, callback){
        var ds = createDatasource(syncType);
        var se = this._createSyncEngine(ds);
        se.extstatus(callback);
    },
    getProfileNames: function(callback){
        var se = this._createSyncEngine(null);
        se.getProfileNames(callback);
    },
    _getCorrelatorInfo: function(url, corruri, callback){
        const https = "https://";
        var str;
        var self = this;
        var protocol = url.substr(0,https.length).toLowerCase();
        var funcFinished = function(status, response) {
            self._request = null;
            callback(status, response);
        };

        // we contact correlator via https if the url we are interested
        // in is https
        if (XmarksBYOS.gSettings.securityLevel == 1 || protocol == https ){ 
            str = https;
        } else {
            str = "http://";
        }

        str += XmarksBYOS.gSettings.apiHost + corruri;
        this._request = new Request(
            "POST",
            str,
            {
                urls: [url],
                mid: XmarksBYOS.gSettings.machineId,
                cid: "xmfx"
            }, false, null, false, true);
        this._request.Start(funcFinished);
    },
    getSimilarSites: function(url, callback){
        return this._getCorrelatorInfo(url, "/internal/related/read", callback);
    },
    getTurboTags: function(url, callback){
        return this._getCorrelatorInfo(url, "/internal/topics/read", callback);
    },
    purgepasswords: function(callback){
        var ds = createDatasource("passwords");
        var se = this._createSyncEngine(ds);
        se.purgepasswords(callback);
    },
    verifypin: function(pin, callback){
        var ds = createDatasource("passwords");
        var se = this._createSyncEngine(ds);
        try {
            se.verifypin(pin, callback);
        } catch(e){
            LogWrite("Verify Pin Failed (" + e.message + ")");
            if(typeof e == "number"){
                callback(e);
            } else {
                callback(4);
            }
        }
    },
    runUnitTest: function(){
        gFoxmarksUT.run();
    },
    countItems: function(synctype, itemtype, callback){
        var ds = createDatasource(synctype);
        var se = this._createSyncEngine(ds);
        se.countItems(itemtype, callback);
    }
};


function SyncEngine(datasource) {
    this._datasource = datasource;
}

SyncEngine.prototype = {
    request: null,
    _iscancelled: false,

    get _baseline() {
        return this._mgr._baselineCache[
            this._datasource.syncType
        ];
    },
    set _baseline(val) {
        this._mgr._baselineCache[
            this._datasource.syncType
        ] = val;
    },

    cancel:  function() {
        if (this.request) {
            this.request.Cancel();
        }
        this._iscancelled = true;
    },
    isCancelled: function(){
        return this._iscancelled;
    },

    _responseOK: function(response, callback) {
        if(this.isCancelled()){
            callback(2);
            return false;
        }
        else if (typeof response == 'number') {
            if (!response) {
                return true;
            } else {
                callback(response);
            }
        } else if (typeof response == 'object') {
            if (!response.status) {
                return true;
            } else {
                if (response.status == 403) {
                    LogWrite("Got a 403");
                    Handle403(response);
                } else if (response.status == 503) {
                    try {
                        gServerBackoff[this._datasource.syncType] = response.backoff_delay || 0;
                        if (gServerBackoff[this._datasource.syncType]) {
                            LogWrite("Server wants us to wait " +
                                gServerBackoff[this._datasource.syncType] + " seconds");
                        }
                    } catch(e) {}
                }
                callback(response.status);
                return false;
            }
        } else {
            throw Error("unexpected response type: " + response);
        }
    },
    countItems: function(itemtype, callback){
        var self = this;
        var ns = new Nodeset(self._datasource);
        ns.FetchFromNative(function(status){
            if (self._responseOK(status, callback)) {
                var ctr = 0;
                ns.OnTree(
                    function(nid){
                      if(ns.Node(nid).ntype == itemtype)
                        ctr++;
                    },
                    function(){
                        callback(status, ctr);
                    }
                );
            }
        });
    },
    sync: function(prevState, callback) {
        // Local Vars
        var lns = null, sns = null;
        var lcs = null, scs = null;
        var sco = null;
        var lastModified = 0;
        var self = this;
        var fms = Cc["@xmarks.com/extensions/xmarksbyos;1"].
            getService(Ci.nsIXmarksByosService);
        var funcCheckStatus = function(status, response) {
            if (self._responseOK(status, callback)) {
                if (response.isreset == true) {
                    self.upload(callback);
                } else {
                    self.merge(true, callback);
                }
            }
        };

        // Local functions
        var funcGetServerChanges = function(status) {
            if (self._responseOK(status, callback)) {
                // Get changes.
                self._getServerChanges(funcGotServerChanges);
            }
        };
        var funcGotServerChanges = function(status, serverContextObject) {
            if (self._responseOK(status, callback)) {
                sco = serverContextObject;
                if (!sco.continuous) {
                    // Someone has done an upload. Allow the user the option
                    // of performing a merge or a download.

                    switch (self._datasource.DiscontinuityPrompt()) {
                    case 0: // merge
                        return self.merge(false, callback);

                    case 1: // download
                        return self.download(callback);

                    case 2: // cancel
                        callback(2);
                        return;
                    }
                }
                if (!sco.mscs.length && prevState == 'ready' && 
                        self._haveFetched) {
                    LogWrite("Nothing to see here; move along.");
                    callback(0);
                    return;
                }

                //XmarksBYOS.SetProgressMessage("progress.syncing");
                scs = sco.mscs;
                sns = sco.sns;

                // Calculate minimal local change set.
                lastModified = fms.getLastModified(self._datasource.synctype);
                lns = new Nodeset(self._datasource);
                lns.FetchFromNative(funcGotLocalNodeset);
                self._haveFetched = true;
            }
        }
        var funcGotLocalNodeset = function(status) {
            if (self._responseOK(status, callback)) {
                var base = new Nodeset(self._datasource,self._baseline);
                base.Compare(lns, funcGetLocalCommandset);
            }
        }
        var funcGetLocalCommandset = function(status, lcs) {
            if (self._responseOK(status, callback)) {
                // Check to see whether there's been a clobber
                if (lns.length < 3 * self._baseline.length / 4) {
                    LogWrite("Yikes! Length was " + self._baseline.length + 
                        " but is now " + lns.length);
                    self.manual = true;
                    if (!self._datasource.ClobberDialog(lns.length, self._baseline.length)) {
                        // User canceled. Back off for 24 hours.
                        gBackoffUntil = Date.now() + 24 * 60 * 60 * 1000;
                        callback(2);
                        return;
                    }
                }
            
                LogWrite("lcs = " + lcs.length + " scs = " + scs.length);

                try {
                    Synchronize(self._baseline, lcs, scs, lns, sns, 
                        funcSyncComplete);
                } catch (e) {
                    LogWrite("Synchronization failed. Error is " + 
                        e.toSource());
                    if(typeof e == "number"){
                        callback(e);
                    } else {
                        callback(4);
                    }
                }
            }
        };
        var funcSyncComplete = function(finalLcs,
                finalScs,
                conflicts,
                showedUI) {
            //XmarksBYOS.SetProgressMessage("progress.writing");

            if (showedUI) {
                self.manual = true;
            }

            if (lastModified != fms.getLastModified(self._datasource.synctype)) {
                LogWrite("Local datastore changed during sync");
                LogWrite("lastModified " + lastModified + " != " + fms.getLastModified(self._datasource.synctype));
                callback(409);
                return;
            }

            // Scoping: assign back to our enclosing function's locals
            lcs = finalLcs;
            scs = finalScs;

            // Apply the server's changes to the local set.
            try {
                lns = new Nodeset(self._datasource, lns);
                scs.execute(lns);
            } catch (e) {
                LogWrite("execute failed: " + e.toSource());
                if(typeof e == "number"){
                    callback(e);
                } else {
                    callback(4);
                }
                return;
            }
            
            // Write local changes (if any) to the server.
            if (lcs.set.length > 0) {
                self._writeServerChanges(lcs, lns, sco, conflicts, 
                    funcWroteServerChanges);
            } else {
                funcWroteServerChanges();
            }
        };
        var funcWroteServerChanges = function(obj) {
            if (obj) {      // We had something to write
                if (self._responseOK(obj, callback)) {
                } else {
                    LogWrite("putchanges failed; response is " + 
                            obj.toJSONString());
                    return;
                }
            }

            // Flush the local nodeset back to the native datastore if it changed.
            if (scs.set.length > 0) {
                //XmarksBYOS.SetProgressMessage("progress.loading");
                lns.FlushToNative(funcWroteLocalChanges);
            } else {
                funcWroteLocalChanges(0);
            }
        };
        var funcWroteLocalChanges = function(response) {
            // If we got changes from the server or wrote changes to
            // the server, we'll have a new revision number. If neither
            // of these happened, then the sync was a big no-op.
            if (self._responseOK(response, callback)) {
                if (lcs.set.length > 0 || scs.set.length > 0) {
                    self._completeTransaction(lns, sco, callback);
                } else {
                    // We didn't do anything, but note that we successfully
                    // Synced nonetheless.
                    callback(0);         // Done!
                }
            }
        };

        // function start

        // If we've never synced, do an upload or merge.
        if (!XmarksBYOS.gSettings.getHaveSynced(self._datasource.syncType)) {
            self.status(funcCheckStatus);
        }
        else {
            if(XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)){
                LogWrite("Forced Upload: Pin Reset");
                self.upload(function(response){
                    if(self._responseOK(response, callback)){
                        XmarksBYOS.gSettings.setMustUpload(self._datasource.syncType, false);
                        callback(response);
                    }
                });
                return;

            }
            else if(XmarksBYOS.gSettings.mustMerge(self._datasource.syncType)){
                LogWrite("Forced Merge for Passwords");
                self.merge(true, function(response){
                    if(self._responseOK(response, callback)){
                        XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
                        callback(response);
                    }
                });
                return;

            }
            // Normal sync: make sure we've got a baseline to work with.
            //XmarksBYOS.SetProgressMessage("progress.downloading");
            self._fetchBaseline(funcGetServerChanges);
            return;
        }
    }
};


function Syncd2SyncEngine(mgr, datasource) {
    this._datasource = datasource;
    this._mgr = mgr;
}
Syncd2SyncEngine.prototype = new SyncEngine;

function OwnSyncEngine(mgr, datasource) {
    this._datasource = datasource;
    this._mgr = mgr;
}
OwnSyncEngine.prototype = new SyncEngine;

Syncd2SyncEngine.prototype._args = function(dict, ignoreUpload) {
    if (this.manual) {
        dict["manual"] = true;
    }
    if (gFailureCount) {
        dict["retry"] = gFailureCount;
    }
    if (XmarksBYOS.gSettings.machineId) {
        if (!dict["log"]) {
            dict["log"] = {};
        }
        dict["log"]["mid"] = XmarksBYOS.gSettings.machineId;
        dict["log"]["serp"] = XmarksBYOS.gSettings.serpEnabled ? XmarksBYOS.gSettings.serpMaxItems : 0;
        dict["log"]["ssEnabled"] = XmarksBYOS.gSettings.simsiteEnabled;

        var st = [];
        for(var x = 0; x < 10; x++){
            st.push(XmarksBYOS.gSettings.getST(false,x));
        }

        if(st.toSource() != "[{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]"){
            dict["log"]["st"] = st;
        }
        st = [];
        for(var x = 0; x < 10; x++){
            st.push(XmarksBYOS.gSettings.getST(true,x));
            XmarksBYOS.gSettings.clearST(x);
        }

        if(st.toSource() != "[{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]"){
            dict["log"]["ust"] = st;
        }
        if(XmarksBYOS.gSettings.trSERP){
            dict["log"]["trs"] = XmarksBYOS.gSettings.trSERP;
            XmarksBYOS.gSettings.trSERP = "";
        }
        if(XmarksBYOS.gSettings.numTurboTags){
            dict["log"]["ttags"] = XmarksBYOS.gSettings.numTurboTags;
            XmarksBYOS.gSettings.numTurboTags = 0;;
        }
    }
    if (XmarksBYOS.gSettings.viewId) {
        if(!ignoreUpload){
            dict.view = XmarksBYOS.gSettings.viewId;
        }
    }


    return dict;
}

Syncd2SyncEngine.prototype.upload = function(callback) {
    var self = this;
    var ns = new Nodeset(this._datasource);

    // if we are doing a force upload, then that trumps forcedMerge
    if(XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)){
        XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
    }
    // even though the user says upload, we don't want
    // to do that for passwords during initial sync
    if(XmarksBYOS.gSettings.mustMerge(self._datasource.syncType)){
        LogWrite("Forced Merge for Passwords");
        self.merge(true, function(response){
            if(self._responseOK(response, callback)){
                XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
                callback(response);
            }
        });
        return;
    }

    // Hack: we don't seem to be able to handle
    // authentication during an upload request.
    // So to avoid trouble, we do a throw-away
    // status request first. If auth is required,
    // it will be handled during the status request,
    // after which we will get on to our real work.

    var funcForceAuth = function(status) {
        if (self._responseOK(status, callback)) {
            //XmarksBYOS.SetProgressMessage("progress.writing");
            ns.FetchFromNative(funcFetched);
        }
    };
    var funcFetched = function(e) {
        if (e) {
            callback(e);
            return;
        }
        ns.ProvideCommandset(funcContinue);
    };
    var funcContinue = function(status, cs) {
        if (self._responseOK(status, callback)) {
            self.request = new Request("POST", 
                {
                    path: "/sync/" + self._datasource.syncType + "/upload",
                    host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
                }, 
                self._args({ "commands" : cs },
                    XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)
                )
            );
            self.request.Start(funcDone);
        }
    };
    var funcDone = function(response) {
        if (self._responseOK(response, callback)) {
            if (!response.toprev) {
                LogWrite("Error: Invalid response to upload");
                callback(500);
            } else {
                XmarksBYOS.gSettings.setMustUpload(self._datasource.syncType, false);
                self._completeTransaction(ns, { toprev: response.toprev }, 
                    callback);
            }
        }
    };

    if (XmarksBYOS.gSettings.viewId && !XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)) {
        this._uploadWithProfile(callback);
        return;
    }
    self.status(funcForceAuth);
}

Syncd2SyncEngine.prototype.purgepasswords = function(callback) {
    var self = this;
    var ns = new Nodeset(this._datasource);

    // Hack: we don't seem to be able to handle
    // authentication during an upload request.
    // So to avoid trouble, we do a throw-away
    // status request first. If auth is required,
    // it will be handled during the status request,
    // after which we will get on to our real work.

    var funcForceAuth = function(status) {
        if (self._responseOK(status, callback)) {
            self.request = new Request("POST", 
                {
                    path: "/sync/" + self._datasource.syncType + "/purge",
                    host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
                } , self._args({ mode: "data"}));
            self.request.Start(function(statuspurge){
                if (self._responseOK(statuspurge, callback)) {
                    XmarksBYOS.gSettings.SetSyncRevision(
                        self._datasource.syncType, 0);
                    callback(0);
                }
           });
        }
    };
    self.status(funcForceAuth);
}
Syncd2SyncEngine.prototype._uploadWithProfile = function(callback) {
    var self = this;
    var revision;
    var ns;
    var lns;

    var funcDone = function(response) {
        if (self._responseOK(response, callback)) {
            if (!response.toprev || !response.commands) {
                LogWrite("Error: Invalid response to download");
                callback(500);
                return;
            }
            revision = response.toprev;
            ns  = new Nodeset(self._datasource);
            var cs = new Commandset(response.commands);
            try {
                cs.execute(ns);
            } catch (e) {
                LogWrite("execute failed: " + e.toSource());
                if(typeof e == "number"){
                    callback(e);
                } else {
                    callback(4);
                }
                return;
            }

            // Retrieve local set.
            lns = new Nodeset(self._datasource);
            lns.FetchFromNative(funcGotLocal);
        }
    };
    var funcGotLocal = function(response) {
        // Calculate difference: server -> local.
        if (self._responseOK(response, callback)) {
            ns.Compare(lns, funcCompared);
        }
    };
    var funcCompared = function(status, cs) {
        if (self._responseOK(status, callback)) {
            if (cs.length) {
                //XmarksBYOS.SetProgressMessage("progress.uploading");
                self.request = new Request("POST",
                    {
                        path: "/sync/" + self._datasource.syncType + "/putchanges",
                        host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
                    }, 
                    self._args({ "baserev": revision, "commands" : cs }));
                self.request.Start(funcFinished);
            } else {
                funcFinished({ status: 0, toprev: revision});
            }
        }
    };
    var funcFinished = function(response) {
        if (self._responseOK(response, callback)) {
            if (!response.toprev) {
                LogWrite("Error: Invalid response to putchanges");
                callback(500);
            } else {
                self._completeTransaction(ns, { toprev: response.toprev }, 
                    callback);
            }
        }
    };


    // Download current server state.
    XmarksBYOS.SetProgressMessage("progress.downloading");
    self.request = new Request("POST",
        {
            path: "/sync/"  + self._datasource.syncType + "/download",
            host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        }, self._args({}));
    self.request.Start(funcDone);
}

Syncd2SyncEngine.prototype.download = function(callback) {
    var self = this;
    var ns;
    var revision;

    // resetPIN trumps download (only occurs in the case of
    // resetPIN in setup dialog)
    if(XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)){
        LogWrite("Forced Upload: Pin Reset");
        self.upload(function(response){
            if(self._responseOK(response, callback)){
                XmarksBYOS.gSettings.setMustUpload(self._datasource.syncType, false);
                callback(response);
            }
        });
        return;
    }
    else if(XmarksBYOS.gSettings.mustMerge(self._datasource.syncType)){
        LogWrite("Forced Merge for Passwords");
        self.merge(true, function(response){
            if(self._responseOK(response, callback)){
                XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
                callback(response);
            }
        });
        return;
    }
    var funcDone = function(response) {
        if (self._responseOK(response, callback)) {
            if (!response.toprev || !response.commands) {
                LogWrite("Error: Invalid response to download");
                callback(500);
                return;
            }
            revision = response.toprev;
            ns = new Nodeset(self._datasource);
            var cs = new Commandset(response.commands);
            try {
                cs.execute(ns);
            } catch (e) {
                LogWrite("execute failed: " + e.toSource());
                if(typeof e == "number"){
                    callback(e);
                } else {
                    callback(4);
                }
                return;
            }
            //XmarksBYOS.SetProgressMessage("progress.loading");
            ns.FlushToNative(funcFinished);
        }
    };
    var funcFinished = function(response) {
        if (self._responseOK(response, callback)) {
            self._completeTransaction(ns, { toprev: revision }, callback);
        }
    };

    //XmarksBYOS.SetProgressMessage("progress.downloading");
    self.request = new Request("POST", 
        {
            path: "/sync/" + self._datasource.syncType + "/download",
            host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        }, self._args({}));
    self.request.Start(funcDone);
}


Syncd2SyncEngine.prototype.verifypinbrokenroot = function(pin, callback) {
    var self = this;
    var ns;
    var revision;

    var funcDone = function(response) {
        if (self._responseOK(response, callback)) {
            for(var nid in response.nodes){
                if(!response.nodes.hasOwnProperty(nid)){
                    continue;
                } else if(response.nodes[nid].data){
                    var result = self._datasource.verifyPin(pin, response.nodes[nid]); 
                    callback(result ? 0 : 100);
                    return;
                }
            }
            // must have been no nodes with data, so assume it's valide
            callback(0);
        }
    };

    //SetProgressMessage("progress.verifying");
    LogWrite("Verifying PIN Broken Root");
    self.request = new Request("POST", 
        {
            path: "/sync/" + self._datasource.syncType + "/state",
            host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        }, {"nodes":"ROOT", "depth":"children"});
    self.request.Start(funcDone);
}

Syncd2SyncEngine.prototype.verifypin = function(pin, callback) {
    var self = this;
    var ns;
    var revision;

    var funcDone = function(response) {
        if (self._responseOK(response, callback)) {
           LogWrite("Verifying PIN (Received Test Node)");
           if(!response.nodes.ROOT.data){
                LogWrite("WARNING: Bad Root Problem");
                self.verifypinbrokenroot(pin, callback);
           } else {
                var result = self._datasource.verifyPin(pin, response.nodes.ROOT); 
                callback(result ? 0 : 100);
           }
        }
    };

    //XmarksBYOS.SetProgressMessage("progress.verifying");
    LogWrite("Verifying PIN (Starting)");
    self.request = new Request("POST", 
        {
            path: "/sync/" + self._datasource.syncType + "/state",
            host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        }, {"nodes":"ROOT", "depth":"self"});
    self.request.Start(funcDone);
}
// Fetch changes from the server. Passes to callback an object containing:
// * continous: true if the changes on the server are continuous.
// * mscs: the minimal server commandset. 
// * other server context info (in this case, toprev) to passed into
//   _writeServerChanges().


Syncd2SyncEngine.prototype._getServerChanges = function(callback) {
    // Get changes.
    var self = this;
    var toprev = 0;
    var sns = new Nodeset(self._datasource, self._baseline);

    var funcProcessResponse = function(response) {
        if (self._responseOK(response, callback)) {
            if (response.continuous == false) {
                callback(0, { continuous: false });
            } else {
                if (!response.toprev || !response.commands) {
                    LogWrite("Error: Invalid response to getchanges");
                    callback(500);
                    return;
                }
                toprev = response.toprev;
                // Calculate mcs.
                if (response.commands.length) {
                    scs = new Commandset(response.commands);
                    try {
                        scs.execute(sns);
                    } catch (e) {
                        LogWrite("execute failed: " + e.toSource());
                        if(typeof e == "number"){
                            callback(e);
                        } else {
                            callback(4);
                        }
                        return;
                    }
                    var base = new Nodeset(self._datasource,self._baseline);
                    base.Compare(sns, funcCalculatedMcs);
                } else {
                    // Not modified
                    callback(0, { mscs: new Commandset(), toprev: toprev, 
                            sns: sns, continuous: true});
                }
            }
        }
    };
    var funcCalculatedMcs = function(status, cs) {
        if (self._responseOK(status, callback)) {
            LogWrite(">>> Finished mcs: " + cs.toSource());
            callback(0, { mscs: cs, toprev: toprev, continuous: true, 
                    sns: sns });
        }
    };

    self.request = new Request("POST", 
        {
            path: "/sync/" + self._datasource.syncType + "/getchanges",
            host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        },
        self._args({ "baserev": self._baseline.currentRevision}) );
    self.request.Start(funcProcessResponse);
}

OwnSyncEngine.prototype.testDupURL = function(){
    // force check to see if user has two different urls for password
    // and bookmark
    try {
        if(XmarksBYOS.gSettings.isSyncEnabled("bookmarks") && 
            XmarksBYOS.gSettings.isSyncEnabled("passwords")){
            if(XmarksBYOS.gSettings.getUrlWithUsernameAndPassword("passwords") ==
                XmarksBYOS.gSettings.getUrlWithUsernameAndPassword("bookmarks")){
                    return true;
            }
        }
        return false;
    } catch(e){
        return false;
    }
}
OwnSyncEngine.prototype._getServerChanges = function(callback) {
    // Download the file, but only if the etag doesn't match
    var self = this;
    var headers = {};
    var token;
    var etag;
    var sns;

    var funcProcessFile = function(response) {
        if (response.status == 304) {   // Not modified.
            callback(0, { continuous: true, mscs: new Commandset(), 
                token: XmarksBYOS.gSettings.getToken(self._datasource.syncType), etag: response.etag });
            return;
        }
        if (self._responseOK(response, callback)) {
            if(response.token === undefined){
                callback(1006);
                return;
            }
            if (response.token != XmarksBYOS.gSettings.getToken(self._datasource.syncType)) {
                callback(0, { continuous: false, etag: response.etag } );
                return;
            }

            token = response.token;
            etag = response.etag;
            var cs = new Commandset(response.commands);
            sns = new Nodeset(self._datasource);
            try {
                sns.Execute(cs);
            } catch (e) {
                LogWrite("execute failed: " + e.toSource());
                if(typeof e == "number"){
                    callback(e);
                } else {
                    callback(4);
                }
                return;
            }

            var base = new Nodeset(self._datasource,self._baseline);
            base.Compare(sns, funcCompared);
        } else {
            callback(response.status);
         }

    };
    var funcCompared = function(status, cs) {
        if (self._responseOK(status)) {
            callback(0, { continuous: true, mscs: cs, token: token, 
                    sns: sns, etag: etag });
        }
    };

    var serveretag = XmarksBYOS.gSettings.getEtag(this._datasource.syncType);
    if (serveretag.length) {
        headers["If-None-Match"] = serveretag;
    }

    try {
        self.request = new Request("GET", 
            XmarksBYOS.gSettings.getUrlWithUsernameAndPassword(self._datasource.syncType),
            null, false, headers);
        self.request.Start(funcProcessFile);
    } catch(e){
        callback(2);
    }
}

Syncd2SyncEngine.prototype._writeServerChanges = function(lcs, lns, sco, conflicts,
        callback) {

    var self = this;
    var funcWrote = function(response) {
        if (self._responseOK(response, callback)) {
            sco.toprev = response.toprev;
            if (!sco.toprev) {
                LogWrite("Error: Invalid response to putchanges");
                callback(500);
            } else {
                callback(0);
            }
        }
    };

    self.request = new Request("POST", 
        {
            path: "/sync/" + self._datasource.syncType + "/putchanges",
            host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        },
        self._args({ baserev : sco.toprev, commands : lcs, log : conflicts } ));
    self.request.Start(funcWrote);
}

OwnSyncEngine.prototype._writeServerChanges = function(lcs, lns, sco, conflicts,
        callback) {
    var self = this;

    var funcGotCommandset = function(status, cs) {
        var header = {};
        if (!XmarksBYOS.gSettings.disableIfMatchOnPut && sco.etag && sco.etag.length) {
            header = { "Etag" : sco.etag };
        }
        if (self._responseOK(status, callback)) {
            try {
                self.request = new Request("PUT", 
                    XmarksBYOS.gSettings.getUrlWithUsernameAndPassword(self._datasource.syncType),
                    { token: sco.token, commands: cs },
                    false, header, true);
                self.request.Start(funcWritten);
            } catch(e){
                callback(2);
            }
        }
    };
    var funcWritten = function(response) {
        if (self._responseOK(response, callback)) {
            sco.etag = response.etag;
            callback(0);
        }
    };

    lns.ProvideCommandset(funcGotCommandset);
}

Syncd2SyncEngine.prototype.status = function(callback) {
    var self = this;

    var funcCheckStatus = function(response) {
        if (self._responseOK(response, callback)) {
            if (!response.toprev) {
                LogWrite("Error: Invalid response to status");
                callback(500);
                return;
            }
            callback(0, response);
        }
    };

    LogWrite("Entered Status...");
    //XmarksBYOS.SetProgressMessage("progress.verifying");

    self.request = new Request("POST",
        { path: "/sync/" + self._datasource.syncType + "/status",
          host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        }, {});
    self.request.Start(funcCheckStatus);
}
Syncd2SyncEngine.prototype.extstatus = function(callback) {
    var self = this;
    this.status(function(normal_status,response){
        // if we get an error, do callback right away
        if(normal_status){
            callback(normal_status, response);

        // if we are reset, no need to check if we are purged
        } else if(response.isreset){
            response.ispurged = false;
            callback(normal_status, response);
        // call for the root to see if we get a 444
        } else {
            self.request = new Request("POST", 
                {
                    path: "/sync/" + self._datasource.syncType + "/state",
                    host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
                }, {"nodes":"ROOT", "depth":"self"});
            self.request.Start(function(stateresponse){
                if (self._responseOK(stateresponse, function(errnum){
                    if(errnum == 444){
                        response.ispurged = true;
                        callback(0, response);
                    } else {
                        callback(errnum, response);
                    }
                })) {
                    response.ispurged = false;
                    callback(0, response);
                }
            });
        }
    });

}
OwnSyncEngine.prototype.status = function(callback) {
    var self = this;

    var funcHandleResponse = function(response) {
        if (response.status == 404 || response.token === undefined) {
            callback(0, { status: 0, isreset: true, ispurged: false });
        } else if (self._responseOK(response, callback)) {
            callback(0, { status: 0, isreset: false, ispurged: false });
        } else {
            callback(response.status);
        }
    };

    LogWrite("Entered status...");
    if(this.testDupURL()){
        callback(1011);
        return;
    }
    //XmarksBYOS.SetProgressMessage("progress.verifying");
    //
    try {
        self.request = new Request("GET",
            XmarksBYOS.gSettings.getUrlWithUsernameAndPassword(self._datasource.syncType));
        self.request.Start(funcHandleResponse);
    } catch(e){
        callback(2);
    }
}
OwnSyncEngine.prototype.extstatus = OwnSyncEngine.prototype.status;


Syncd2SyncEngine.prototype._getServerState = function(callback) {
    var self = this;
    self.request = new Request("POST", 
        {
            path: "/sync/" + self._datasource.syncType +  "/download",
            host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
        }, self._args({}) );
    self.request.Start(callback);
}

OwnSyncEngine.prototype._getServerState = function(callback) {
    var self = this;
    try {
        self.request = new Request("GET",
            XmarksBYOS.gSettings.getUrlWithUsernameAndPassword(self._datasource.syncType));
        self.request.Start(callback);
    } catch(e){
        callback(2);
    }
}

SyncEngine.prototype.merge = function(local, callback) {
    // Perform a merge (an "additive sync").
    // local is a boolean which determines what merge uses
    // as the starting set: true for local, false for server.

    LogWrite("Entered Merge...");

    var self = this;
    var serverNS = new Nodeset(self._datasource);
    var localNS = new Nodeset(self._datasource);
    var mergedNS = null;
    var revision;
    var sco;

    // resetPIN trumps merge
    if(XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)){
        LogWrite("Forced Upload: Pin Reset");
        self.upload(function(response){
            if(self._responseOK(response, callback)){
                XmarksBYOS.gSettings.setMustUpload(self._datasource.syncType, false);
                callback(response);
            }
        });
        return;
    }

    var funcDone = function(response) {
        if (self._responseOK(response, callback)) {
            if(response.commands === undefined){
                callback(1006);
                return;
            }
            sco = response;
            var cs = new Commandset(response.commands);
            try {
                cs.execute(serverNS);
            } catch (e) {
                if(typeof e == "number"){
                    callback(e);
                } else {
                    LogWrite("execute failed: " + e.toSource());
                    callback(4);
                }
                return;
            }
            localNS.FetchFromNative(funcFetched);
        }
    };
    var funcFetched = function( e ) {

        if (e) {
            callback(e);
            return;
        }
        //XmarksBYOS.SetProgressMessage("progress.merging");
        if (local) {
            localNS.Merge(serverNS);
            mergedNS = localNS;
        } else {
            mergedNS = new Nodeset(self._datasource, serverNS);
            mergedNS.Merge(localNS);
        }

        // calculate server's MCS
        LogWrite("Finished merge; calculating mcs");
        serverNS.Compare(mergedNS, funcWriteChanges);
    };
    var funcWriteChanges = function(status, cs) {
        if (self._responseOK(status, callback)) {
            // Write changes to the server.
            //XmarksBYOS.SetProgressMessage("progress.writing");
            if (cs.set.length > 0) {
                self._writeServerChanges(cs, mergedNS, sco, null, 
                    funcWroteServerChanges);
            } else {
                funcWroteServerChanges(0);
            }
        }
    };
    var funcWroteServerChanges = function(response) {
        // Write 'em back to native store, too
        if (self._responseOK(response, callback)) {
            //XmarksBYOS.SetProgressMessage("progress.loading");
            mergedNS.FlushToNative(funcFlushed);
        }
    };
    var funcFlushed = function(response) {
        if (self._responseOK(response, callback)) {
            XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
            self._completeTransaction(mergedNS, sco, callback);
        }
    };

    //XmarksBYOS.SetProgressMessage("progress.downloading");
    self._getServerState(funcDone);
}

Syncd2SyncEngine.prototype._fetchBaseline = function(callback) {
    // Fetch the baseline if necessary
    var self = this;

    var funcLoadedFromServer = function(response) {
        if (self._responseOK(response, callback)) {
            var cs = new Commandset(response.commands);
            try {
                cs.execute(self._baseline);
            } catch (e) {
                LogWrite("execute failed: " + e.toSource());
                if(typeof e == "number"){
                    callback(e);
                } else {
                    callback(4);
                }
                return;
            }
            self._baseline.currentRevision = response.rev;
            self._baseline.SaveToFile(funcLoaded);
            return;
        } else {
            LogWrite("Failed to load baseline from server.");
        }
    };
    var funcLoaded = function() {
        // Loaded from file or server
        // var nat = new NativeDatasource();
        self._baseline.BaselineLoaded(self._baseline, funcGotIt);
        return;
    };
    var funcGotIt = function(status) {
        if (self._responseOK(status, callback)) {
            self._baseline.hash = XmarksBYOS.gSettings.hash;
            callback(0);
        }
    };

    if (self._baseline && self._baseline.hash == XmarksBYOS.gSettings.hash) {
        LogWrite("Using Baseline Cache.");
        funcGotIt(0);
        return;
    }

    self._baseline = new Nodeset(self._datasource);
    try {
        self._baseline.LoadFromFile();
    } catch (e) {
        // We failed to load our baseline locally -- try getting
        // it from the server.
        LogWrite("Failed to load baseline from file: " + e.name);
        var request = new Request("POST",
            {
                path: "/sync/" + self._datasource.syncType + "/download",
                host: XmarksBYOS.gSettings.getServerHost(self._datasource.syncType)
            },
            self._args({ rev: XmarksBYOS.gSettings.GetSyncRevision(self._datasource.syncType), depth: "all", 
                    log: { "error": e.name }}));
        request.Start(funcLoadedFromServer);
        return;
    }

    funcLoaded();
}

OwnSyncEngine.prototype._fetchBaseline = function(callback) {
    // Fetch the baseline if necessary
    var self = this;

    var funcLoaded = function() {
        // Loaded from file 
        // var nat = new NativeDatasource();
        self._baseline.BaselineLoaded(self._baseline, funcGotIt);
    };
    var funcGotIt = function(status) {
        if (self._responseOK(status, callback)) {
            self._baseline.hash = XmarksBYOS.gSettings.hash;
            callback(0);
        }
    };

    if (self._baseline && self._baseline.hash == XmarksBYOS.gSettings.hash) {
        funcGotIt(0);
        return;
    }

    self._baseline = new Nodeset(self._datasource);
    try {
        self._baseline.LoadFromFile();
    } catch (e) {
        // We failed to load our baseline locally -- we're hosed.
        LogWrite("Failed to load baseline.");
        if(typeof e == "number"){
            callback(e);
        } else {
            callback(4);
        }
        return;
    }

    funcLoaded();
}

Syncd2SyncEngine.prototype._completeTransaction = function(ns, sco, callback) {
    var self = this;

    var funcFinishUp = function(status) {
        if (self._responseOK(status, callback)) {
            self._baseline = ns;
            self._baseline.hash = XmarksBYOS.gSettings.hash;
            self._baseline.currentRevision = sco.toprev;
            self._baseline.SaveToFile(funcFinishedWrite);
        }
    };
    var funcFinishedWrite = function(status) {
        if (self._responseOK(status, callback)) {
            // XmarksBYOS.gSettings.currentRevision = sco.toprev;
            XmarksBYOS.gSettings.SetSyncRevision(self._datasource.syncType, sco.toprev);
            callback(0);
        }
    };

    ns.Declone(funcFinishUp);
}

Syncd2SyncEngine.prototype.getProfileNames = function(callback) {
    var self = this;
    var funcFetched = function(response) {
        if (self._responseOK(response, callback)) {
            callback(0, response);
        }
    }

    //XmarksBYOS.SetProgressMessage("progress.gettingprofilenames");
    var request = new Request("POST",
        { path: "/user/profiles/getnames",
          host: XmarksBYOS.gSettings.acctMgrHost },
        this._args({}) );
    request.Start(funcFetched);

}

OwnSyncEngine.prototype.upload = function(callback) {
    var self = this;
    var ns = new Nodeset(self._datasource);
    var token = Date.now().toString(16);

    // if we are doing a force upload, then that trumps forcedMerge
    if(XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)){
        XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
    }
    // even though the user says upload, we don't want
    // to do that for passwords during initial sync
    if(XmarksBYOS.gSettings.mustMerge(self._datasource.syncType)){
        LogWrite("Forced Merge for Passwords");
        self.merge(true, function(response){
            if(self._responseOK(response, callback)){
                XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
                callback(response);
            }
        });
        return;
    }


    var funcFetched = function(status) {
        if (self._responseOK(status, callback)) {
            ns.ProvideCommandset(funcContinue);
        }
    };
    var funcContinue = function(status, cs) {
        if (self._responseOK(status, callback)) {
            try {
                self.request = new Request("PUT", 
                    XmarksBYOS.gSettings.getUrlWithUsernameAndPassword(self._datasource.syncType),
                    { commands: cs, token: token }, false, null, true );
                self.request.Start(funcDone);
            } catch(e){
                callback(2);
            }
        }
    };
    var funcDone = function(response) {
        if (self._responseOK(response, callback)) {
            XmarksBYOS.gSettings.setMustUpload(self._datasource.syncType, false);
            self._completeTransaction(ns, 
                { etag: response.etag, token: token }, callback);
        }
    };

    //XmarksBYOS.SetProgressMessage("progress.writing");
    ns.FetchFromNative(funcFetched);
}

OwnSyncEngine.prototype.verifypin = function(pin, callback) {
    var self = this;
    var ns;

    var funcDone = function(response) {
        var funcFinished = function(resp) {
            if (self._responseOK(resp, callback)) {
                self._completeTransaction(ns, 
                    { etag: response.etag, token: response.token }, callback);
            }
        };
        if (self._responseOK(response, callback)) {
            ns = new Nodeset(self._datasource);
            var cs = new Commandset(response.commands);
            try {
                cs.execute(ns);
            } catch (e) {
                LogWrite("execute failed: " + e.toSource());
                if(typeof e == "number"){
                    callback(e);
                } else {
                    callback(4);
                }
                return;
            }

           var result = self._datasource.verifyPin(pin, ns.Node(NODE_ROOT)); 
           callback(result ? 0 : 100);
        }
    };
    //XmarksBYOS.SetProgressMessage("progress.verifying");
    LogWrite("Verifying PIN (Own Server)");
    try {
        self.request = new Request("GET", XmarksBYOS.gSettings.getUrlWithUsernameAndPassword(self._datasource.syncType));
        self.request.Start(funcDone);
    } catch(e){
        callback(2);
    }
}

OwnSyncEngine.prototype.download = function(callback) {
    var self = this;
    var ns;

    // resetPIN trumps download (only occurs in the case of
    // resetPIN in setup dialog)
    if(XmarksBYOS.gSettings.mustUpload(self._datasource.syncType)){
        LogWrite("Forced Upload: Pin Reset");
        self.upload(function(response){
            if(self._responseOK(response, callback)){
                XmarksBYOS.gSettings.setMustUpload(self._datasource.syncType, false);
                callback(response);
            }
        });
        return;
    }
    else if(XmarksBYOS.gSettings.mustMerge(self._datasource.syncType)){
        LogWrite("Forced Merge for Passwords");
        self.merge(true, function(response){
            if(self._responseOK(response, callback)){
                XmarksBYOS.gSettings.setMustMerge(self._datasource.syncType, false);
                callback(response);
            }
        });
        return;
    }

    var funcDone = function(response) {
        var funcFinished = function(resp) {
            if (self._responseOK(resp, callback)) {
                self._completeTransaction(ns, 
                    { etag: response.etag, token: response.token }, callback);
            }
        };
        if (self._responseOK(response, callback)) {
            ns = new Nodeset(self._datasource);
            var cs = new Commandset(response.commands);
            try {
                cs.execute(ns);
            } catch (e) {
                LogWrite("execute failed: " + e.toSource());
                if(typeof e == "number"){
                    callback(e);
                } else {
                    callback(4);
                }
                return;
            }
            //XmarksBYOS.SetProgressMessage("progress.loading");
            ns.FlushToNative(funcFinished);
        }
    };

    try {
        self.request = new Request("GET", XmarksBYOS.gSettings.getUrlWithUsernameAndPassword(self._datasource.syncType));
        self.request.Start(funcDone);
    } catch(e){
        callback(2);
    }
}

OwnSyncEngine.prototype._completeTransaction = 
        function(ns, sco, callback) {
    var self = this;

    var funcFinishUp = function(status) {
        if (self._responseOK(status, callback)) {
            self._baseline = ns;
            self._baseline.hash = XmarksBYOS.gSettings.hash;
            self._baseline.SaveToFile(funcFinishedWrite);
        }
    };
    var funcFinishedWrite = function(status) {
        if (self._responseOK(status, callback)) {
            XmarksBYOS.gSettings.setToken(self._datasource.syncType, sco.token);
            if (sco.etag) XmarksBYOS.gSettings.setEtag(self._datasource.syncType, sco.etag);
            XmarksBYOS.gSettings.SyncComplete(self._datasource.syncType);
            callback(0);
        }
    };
    ns.Declone(funcFinishUp);
}



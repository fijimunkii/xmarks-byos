/*
 Copyright 2007-2008 Foxmarks Inc.

 foxmarks-password.js: component that implements the details of 
 password sync.

 */


function NiceProcess(iterator, funcDo, funcDone){
    var callback = {
        notify: function(timer){
            try {
                var s = Date.now();
                while (!iterator.done() && Date.now() - s < 100) {
                    funcDo(iterator);
                }
                if(iterator.done()){
                    // dump("ms: " + (Date.now() - s) + "\n");
                        funcDone(iterator);
                } else {
                    // dump("ms: " + (Date.now() - s) + "\n");
                        timer.initWithCallback(callback, 10,
                            Ci.nsITimer.TYPE_ONE_SHOT);
                }
            }catch(e){
                funcDone(iterator, e);
            }
        }
    };
    var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(callback, 10,
        Ci.nsITimer.TYPE_ONE_SHOT);
}

function PasswordDatasource(){
    this.Cc = Components.classes;
    this.Ci = Components.interfaces;

    this.JSON = this.Cc["@mozilla.org/dom/json;1"].createInstance(this.Ci.nsIJSON);

    this.encryptor = CreateAESManager();
}

PasswordDatasource.prototype = {
    DiscontinuityPrompt: function() {
        var sb = XmarksBYOS.Bundle().GetStringFromName;

        // get a reference to the prompt service component.
        var ps = this.Cc["@mozilla.org/embedcomp/prompt-service;1"].
          getService(this.Ci.nsIPromptService);

        var flags = ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_0 +
              ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_1 +
              ps.BUTTON_TITLE_CANCEL    * ps.BUTTON_POS_2;

        rv = ps.confirmEx(null, sb("passworddisc.title"), sb("passworddisc.body"), flags,
            sb("disc.merge"), sb("disc.download"), null, null, {});

        return rv;
    },
    // 2 - server, 1 -local, other-cancel
    _conflictDialog: function(dest, src){
        var retval = { button: 0 };
        var data = {
            local: { 
                site: src.hostname,
                username: src.username,
                password: src.password
            },
            server: {
                site: dest.hostname,
                username: dest.username,
                password: dest.password
            }
        };
        var topwin = Cc['@mozilla.org/appshell/window-mediator;1'].
            getService(Ci.nsIWindowMediator).
            getMostRecentWindow(null);
        
        if (!topwin) {
            LogWrite("conflictDialog: Couldn't find a topwin!");
            throw 4;
        }
        var win = topwin.openDialog(
            "chrome://xmarksbyos/content/foxmarks-passwordconflict.xul", "_blank",
            "chrome,dialog,modal,centerscreen", data, retval);
        if(!retval.button) {
            throw 2;
        }
       
       return retval.button;
    },
    ClobberDialog: function(len){
        
        if(len > 1)
            return true;
        var sb = XmarksBYOS.Bundle().GetStringFromName;

        // get a reference to the prompt service component.
        var ps = Cc["@mozilla.org/embedcomp/prompt-service;1"].
          getService(Ci.nsIPromptService);

        var flags = ps.BUTTON_TITLE_CANCEL * ps.BUTTON_POS_0 +
              ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_1 +
              ps.BUTTON_TITLE_IS_STRING    * ps.BUTTON_POS_2;

        rv = ps.confirmEx(null, sb("pwclobber.title"), sb("pwclobber.body"), flags,
            null, sb("pwclobber.disable"), sb("pwclobber.server"),  null, {});

        if(rv == 1){
            XmarksBYOS.gSettings.setSyncEnabled("passwords", false);
        }
        return rv == 2;
    },
    syncType: "passwords",
    getBaselineName: function(){
        return "xmarks-password-baseline-" + XmarksBYOS.gSettings.hash + "json";
    },
    BaselineLoaded: function(baseline, callback) {
        var self = this;
        baseline.OnTree(
            function(nid){
                self.decode(baseline.Node(nid, true, false));
            },
            function(){
                callback(0);
            }
        );
    },
    encrypt: function(str){
        var result = this.encryptor.encrypt(XmarksBYOS.gSettings.pin, str);
        if(XmarksBYOS.gSettings.forceGC) {
            Components.utils.forceGC();
        }
        return result;
    },
    decrypt: function(str){
        var result =  this.encryptor.decrypt(XmarksBYOS.gSettings.pin, str);
        var goodPIN = result.indexOf('password') >=  0;

        // If we're doing a merge from a reset pin, there will be
        // two pins floating around
        if(!goodPIN && this._oldpin !== undefined){
            result =  this.encryptor.decrypt(this._oldpin, str);
            goodPIN = result.indexOf('password') >=  0;
        }

        while(!goodPIN){
            var newpin = this.getValidPin();
            XmarksBYOS.gSettings.pin = newpin;
            result =  this.encryptor.decrypt(XmarksBYOS.gSettings.pin, str);
            goodPIN = result.indexOf('password') >=  0;
            if(!goodPIN){
                XmarksBYOS.FoxmarksAlert(XmarksBYOS.Bundle().GetStringFromName("error.pinInvalid"));
            }
        }
        return result;
    },
    getValidPin: function(){
        var retval = { okay: false, pin: "" };
        var topwin = Cc['@mozilla.org/appshell/window-mediator;1'].
            getService(Ci.nsIWindowMediator).
            getMostRecentWindow(null);
        
        if (!topwin) {
            LogWrite("getValidPin: Couldn't find a topwin!");
            throw 4;
        }
        var win = topwin.openDialog(
            "chrome://xmarksbyos/content/foxmarks-invalidpin.xul", "_blank",
            "chrome,dialog,modal,centerscreen", retval);
        if(!retval.okay) {
            XmarksBYOS.gSettings.setSyncEnabled("passwords", false);
            throw 2;
        }

        // WILL- This looks like a mozilla bug, it deallocs result.pin
        //  apparently so you need to assign a new string to it.
        var s = "" + retval.pin;
        return s;
    },
    generateNid: function(login){
        return XmarksBYOS.hex_md5("password|".concat(
                    login.hostname, "|",
                    login.formSubmitURL, "|",
                    login.httpRealm, "|",
                    login.usernameField, "|",
                    login.passwordField, "|",
                    login.username));
    },
    decode: function(node){
        if(!node.private){
            node.private = this.JSON.decode(this.decrypt(node.data));
            if(XmarksBYOS.gSettings.forceGC) {
                Components.utils.forceGC();
            }
        }
        return node.private;
    },
    handleNidConflict: function(lnode, snode){
        var litem = this.decode(lnode);
        var sitem = this.decode(snode);
        if(litem.password == sitem.password)
            return "same";
        else {
            var result = this._conflictDialog(sitem, litem); 
            switch(result){
                case 2:
                    return "server";
                case 1:
                    return "local";
                default:
                    return "cancel";
            }
        }
        return "cancel";;
    },
    _buildList: function(doEncrypt, includeCt, funcDone){
        var mgr = this.Cc["@mozilla.org/login-manager;1"]
            .getService(this.Ci.nsILoginManager);

        var a = mgr.getAllLogins({});
        var ct = a.length;
        var self = this;
        var size = 0;
        //dump("_buildList\n");
        NiceProcess(
            {  ctr: 0,
               a: a,
               len: a.length,
               size: 0,
               result: {},
               done: function(){ return this.ctr >= this.len;}
            },
            function(iter){
                var login = iter.a[iter.ctr];
                if(login.httpRealm != XmarksBYOS.SYNC_REALM &&
                        login.httpRealm != XmarksBYOS.SYNC_REALM_PIN){
                    var nid = self.generateNid(login);
                    iter.result[nid] =  {
                        ntype: "password",
                        hostname: login.hostname,
                        formSubmitURL: login.formSubmitURL,
                        httpRealm: login.httpRealm,
                        username: login.username,
                        usernameField: login.usernameField,
                        password: login.password,
                        passwordField: login.passwordField,
                        pnid: NODE_ROOT
                    };
                    if(doEncrypt){
                        iter.result[nid].blob = self.encrypt(
                            iter.result[nid].toJSONString()
                        );
                    }
                    iter.size++;
                }
                iter.ctr++;
            },
            function(iter, e){
                if(includeCt)
                    iter.result.totalLogins = iter.size;
                funcDone(iter.result, e);
            }
        );
    },

    ProvideNodes: function(Caller, AddNode, Complete) {
        var self = this;
        this._buildList(true, false, function(a, e){
            // if buildlist threw an error, just drop out now
            if(e) {
                Complete.apply(Caller, [e]);
                return;
            }
            try {
                var now = new Date();
                var random_stuff = {
                    password: XmarksBYOS.hex_md5(now.getTime().toString())
                };
                var root_node = new Node(
                    NODE_ROOT, 
                    {
                        ntype: "folder", 
                        children: [],
                        private: random_stuff,
                        data: self.encrypt(random_stuff.toJSONString())
                    }
                );
                var nid;
                var obj = {};
                for(nid in a){
                    if(obj[nid] === undefined){ 
                        var item = a[nid];
                        node = new Node(nid, {
                            ntype: "password",
                            data:  item.blob,
                            private: item,
                            pnid: NODE_ROOT
                        });
                        root_node.children.push(nid);
                        AddNode.apply(Caller, [node]);
                    }
                }
                AddNode.apply(Caller, [root_node]);

                Complete.apply(Caller, [0]);
           } catch(e) {
                if(typeof e != "number"){
                    Components.utils.reportError(e);
                    Complete.apply(Caller, [4]);
                } else {
                    Complete.apply(Caller, [e]);
                }
           }
        });
    },
    AcceptNodes: function(ns, callback) {
        var self = this;
        this._buildList(false, false, function(list, e){
            // if buildlist ran into an error, drop out now
            if(e) {
                callback(e);
                return;
            }
            var nid, node;
            var mgr = self.Cc["@mozilla.org/login-manager;1"]
                .getService(self.Ci.nsILoginManager);

            var removeList = [];
            // Remove any nids that aren't in ns
            for(nid in list){
                if(list.hasOwnProperty(nid)){
                    node = ns.Node(nid, false, true);
                    if(node === null){
                        removeList.push(nid);
                    }
                }
            }

            //dump("AcceptNodes\n");
            NiceProcess(
                {
                    a: removeList,
                    len: removeList.length,
                    ctr: 0,
                    done: function() { return this.ctr >= this.len; }
                },
                function(iter){
                    var nid = iter.a[iter.ctr];
                    var item = list[nid];
                    var logins = mgr.findLogins({},
                        item.hostname, 
                        item.formSubmitURL, 
                        item.httpRealm);
                        
                    for(var i = 0; i < logins.length; i++) {
                        if(logins[i].username == item.username) {
                            mgr.removeLogin(logins[i]);
                            break;
                        }
                    }
                    
                    iter.ctr++;
                },
                function(oldIter, e){
                    // If we had an error, just drop out now
                    if(e) {
                        callback(e);
                        return;
                    }
                    var node = ns.Node(NODE_ROOT, false, true);

                    //dump("AcceptNodes 2\n");
                    NiceProcess(
                        {
                            ctr: 0,
                            children: (node.children || []),
                            done: function() {
                                return this.ctr >= this.children.length;
                            }
                        },
                        function(iter){
                            var nid = iter.children[iter.ctr];

                            // Add it
                            node = ns.Node(nid); 
                            var  item = list[nid];
                            var  loginInfo;

                            if(!item){
                                try {
                                    var nitem = self.decode(node);
                                    loginInfo = self.Cc[
                                        "@mozilla.org/login-manager/loginInfo;1"].
                                        createInstance(self.Ci.nsILoginInfo);
                                    loginInfo.init(
                                        nitem.hostname, nitem.formSubmitURL, 
                                        nitem.httpRealm, 
                                        nitem.username, 
                                        nitem.password,
                                        nitem.usernameField, 
                                        nitem.passwordField);
                                    mgr.addLogin(loginInfo);
                                }
                                catch(e){
                                    // Pass cancels up the chain
                                    if(typeof e == "number"){ 
                                        throw e;
                                    } else {
                                        Components.utils.reportError(e);
                                    }
                                }
                            }
                            // Check for changes
                            else if(node.password != item.password){
                                var logins = mgr.findLogins({},
                                        item.hostname, 
                                        item.formSubmitURL, 
                                        item.httpRealm);
                                        
                                for(var i = 0; i < logins.length; i++) {
                                    if(logins[i].username == item.username) {
                                        var nitem = self.decode(node);
                                        loginInfo = self.Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(self.Ci.nsILoginInfo);
                                        loginInfo.init(
                                            nitem.hostname,
                                            nitem.formSubmitURL, 
                                            nitem.httpRealm, 
                                            nitem.username, 
                                            nitem.password,
                                            nitem.usernameField, 
                                            nitem.passwordField
                                        );
                                        mgr.modifyLogin(logins[i], loginInfo);
                                        break;
                                    }
                                }
                            }
                            iter.ctr++;

                        },
                        function(iter, e){
                            e = e || 0;
                            callback(e);
                        }
                    );
                }
             );
         });
    },

    merge: function(dest, source) {
        var snode =source.Node(NODE_ROOT, false, true); 
        this._oldpin = XmarksBYOS.gSettings.pin;
        if(snode == null)
            return;
        var dnode = dest.Node(NODE_ROOT, false, true);
        if(dnode == null){
            var now = new Date();
            var random_stuff = {
                    password: XmarksBYOS.hex_md5(now.getTime().toString())
            };
            dest.Do_insert(NODE_ROOT, {ntype: "folder", children: [],
                data: this.encrypt(random_stuff.toJSONString())});
            dnode = dest.Node(NODE_ROOT, false, true);
        }
        if(!dnode.data){
            var now = new Date();
            var random_stuff = {
                    password: XmarksBYOS.hex_md5(now.getTime().toString())
            };
            ditem = dest.Node(NODE_ROOT,true);
            delete ditem.private;
            ditem.data = this.encrypt(random_stuff.toJSONString());
        }
        var dlist = dnode.children || [];
        var slist = snode.children || [];

        var ctr = slist.length;

        while(ctr--){
            var nid = slist[ctr];
            var sitem = source.Node(nid);
            var ditem = dest.Node(nid, false,true);
            if(!ditem){
                dest.Do_insert(nid, sitem.GetSafeAttrs());
            }
            else {
                var sdata = this.decode(sitem);
                var ddata = this.decode(ditem);
                if(sdata.password != ddata.password){
                    var cResult = this._conflictDialog(ddata, sdata);
                    if(cResult  == 1){
                        ditem = dest.Node(nid,true);
                        delete ditem.private;
                        ditem.data = sitem.data;
                    }
                }
            }
        }
        delete this._oldpin;
    },
    orderIsImportant: false,
    compareNodes: function(snode, onode, attrs){
        if(!snode.data && onode.data){
            attrs['data'] = onode.data;
            return true;
        }
        else if(!onode.data && snode.data){
            attrs['data'] = snode.data;
            return true;
        }
        else if(snode.data === undefined || onode.data === undefined){
            return false;
        }
        var sdata = this.decode(snode);
        var ddata = this.decode(onode);
        attrs.data = onode.data;
        return sdata.password != ddata.password && snode.nid != NODE_ROOT;
    },
    verifyPin: function(pin, node){
        LogWrite("Verifying PIN (Testing Node)");
        LogWrite("Node Stats: " + (node.data ? node.data.length : "null"));
        var result =  this.encryptor.decrypt(pin, node.data);
        LogWrite("Node Verification: " + (result.indexOf('password') >= 0 ?
            "true" : "false"));
        return result.indexOf('password') >= 0;
    },
    WatchForChanges: function(server) {
        return new PasswordSyncWatcher(server);
    }
};
function PasswordSyncWatcher(server){
    this.server = server;
    this.mgr = new PasswordDatasource();
    this.start();
}

PasswordSyncWatcher.prototype = {
    start: function(){
        var os = Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService);
        os.addObserver(this, "xmarksbyos-checkforpasswordchange", false);
        os.addObserver(this, "xmarksbyos-watchersuspend", false);
    },
    _suspended: false,

    /*
        I took this code from nsLoginManagerPrompter.js
        to make sure we watch the same notify box that the
        loginmanager does.
    */
   _getNotifyBox : function (win) {
       try {
           // Get topmost window, in case we're in a frame.
           var notifyWindow = win.top;

           // Some sites pop up a temporary login window, when disappears
           // upon submission of credentials. We want to put the notification
           // bar in the opener window if this seems to be happening.
           if (notifyWindow.opener) {
               var webnav = notifyWindow
                                   .QueryInterface(Ci.nsIInterfaceRequestor)
                                   .getInterface(Ci.nsIWebNavigation);
               var chromeWin = webnav
                                   .QueryInterface(Ci.nsIDocShellTreeItem)
                                   .rootTreeItem
                                   .QueryInterface(Ci.nsIInterfaceRequestor)
                                   .getInterface(Ci.nsIDOMWindow);
               var chromeDoc = chromeWin.document.documentElement;

               // Check to see if the current window was opened with chrome
               // disabled, and if so use the opener window. But if the window
               // has been used to visit other pages (ie, has a history),
               // assume it'll stick around and *don't* use the opener.
               if (chromeDoc.getAttribute("chromehidden") &&
                   webnav.sessionHistory.count == 1) {
                   notifyWindow = notifyWindow.opener;
               }
           }


           // Find the <browser> which contains notifyWindow, by looking
           // through all the open windows and all the <browsers> in each.
           var wm = Cc["@mozilla.org/appshell/window-mediator;1"].
                    getService(Ci.nsIWindowMediator);
           var enumerator = wm.getEnumerator("navigator:browser");
           var tabbrowser = null;
           var foundBrowser = null;

           while (!foundBrowser && enumerator.hasMoreElements()) {
               var win = enumerator.getNext();
               tabbrowser = win.getBrowser(); 
               foundBrowser = tabbrowser.getBrowserForDocument(
                                                 notifyWindow.document);
           }

           // Return the notificationBox associated with the browser.
           // Apparently sometimes the notify box doesn't have this
           // function so we should test for it. Bug #4122
           if (foundBrowser){
               var box = tabbrowser.getNotificationBox(foundBrowser);
               return (box && box.getNotificationWithValue) ? box : null;
           }

       } catch (e) {
           // If any errors happen, just assume no notification box.
       }

       return null;
   },  
    formsubmit : function (form) {
        var doc = form.ownerDocument;
        var win = doc.defaultView;
        var self = this;

        // check if there is a password field
        var ct = form.elements.length;
        var found = false;
        while(ct--){
            if(form.elements[ct].type == "password"){
                found = true;
                break;
            }
        }
        if(found){
            this.monitorForChange(win);
        }
        return true;
    },

    scheduleChangeTest: function(wait){
        var self = this;
        var callbackSingle = {
            notify: function(){
                self.checkForChanges();
            }
        };
        var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(callbackSingle, wait,
            Ci.nsITimer.TYPE_ONE_SHOT);
    },
    monitorForClose: function(box,type){
        var self = this;
        var timerRepeating;
        var maxCtr = 20;

        var callbackWait = {
            notify: function(){
                if(box.getNotificationWithValue(type) == null){
                    self.checkForChanges();
                    timerRepeating.cancel();
                    }
                else if(maxCtr-- == 0)
                    timerRepeating.cancel();
            }
        };
        timerRepeating = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timerRepeating .initWithCallback(callbackWait, 1000,
            Ci.nsITimer.TYPE_REPEATING_SLACK);
    },
    checkNotifyBox: function(){
        var notifyType = "";
        var self = this;

        var box = self._getNotifyBox(win);
        if(box){
            notifyType = "password-save";
            if(box.getNotificationWithValue(notifyType) == null){
                notifyType = "password-change";
                if(box.getNotificationWithValue(notifyType) == null){
                    notifyType = "";
                }
            }
        }

        return notifyType;
    },
    monitorForChange: function(win){
        var self = this;
        var numTimes = 0;
        var callbackFirst = {
            notify: function(){
                /* Check if we have a notification.
                    if so, poll it until it closes
                */
                numTimes++;
                var box = self._getNotifyBox(win);
                var secondTry = false;
                if(box){
                    var notifyType = "password-save";
                    if(box.getNotificationWithValue(notifyType) == null){
                        notifyType = "password-change";
                        if(box.getNotificationWithValue(notifyType) == null){
                            notifyType = "";
                        }
                    }
                    if(notifyType != ""){
                        self.monitorForClose(box, notifyType);
                    }
                    else
                        self.scheduleChangeTest(8000);
                }
                // there are times that the loginManager
                //  will put up a dialog instead of a notification
                //  box.  In this case, and when they change a password,
                //  we'll wait 10 seconds more and then check for changes
                else {
                    if(numTimes > 4){
                        self.scheduleChangeTest(8000);
                    }
                    else {
                        timer.initWithCallback(callbackFirst, 500,
                            Ci.nsITimer.TYPE_ONE_SHOT);
                    }
                }
            }
        };

        // let things settle for a second and see what happens
        var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(callbackFirst, 500,
            Ci.nsITimer.TYPE_ONE_SHOT);
    },
    observe: function(subject, topic, data)  { 
        var self = this;

        switch(topic){
            case "xmarksbyos-checkforpasswordchange":
                LogWrite("Checking for password changes.");
                this.checkForChanges();
                return;
            case "xmarksbyos-watchersuspend":
                this._suspended = data == "1";
                return;
        }
    },
    checkForChanges: function(){
        var self = this;
        if(!XmarksBYOS.gSettings.isSyncEnabled("passwords") || !XmarksBYOS.gSettings.haveSynced || self._suspended)
            return;

        var funcNotifyChange = function(data){
            var lm = Date.now();
            if (!self.lastModified || lm > self.lastModified && !self._suspended) {
                self.lastModified = lm;
                var os = Cc["@mozilla.org/observer-service;1"]
                    .getService(Ci.nsIObserverService);
                os.notifyObservers(null, "xmarksbyos-datasourcechanged", 
                    lm + ";passwords");
            }
        };
        this.server.getBaseline("passwords", function(status, ns){
            if(status)
                return;
            
            var mydata = {
                totalLogins: 0
            };
            var funcCompareList = function(data, e){
                // if buildlist returned an error, just drop out silently and hope for the best
                if(e){
                    return;
                }

                if(mydata.totalLogins != data.totalLogins){
                    funcNotifyChange(data);
                    return;
                }
                for(var field in data){
                    if(data.hasOwnProperty(field)){
                        if(!mydata.hasOwnProperty(field) ||
                            mydata[field].password != data[field].password){
                            funcNotifyChange(data);
                            return;
                        }
                    }
                }
            };
            ns.OnTree(
                function(nid){
                    if(nid != NODE_ROOT){
                        mydata.totalLogins++;
                        mydata[nid] = ns.Node(nid).private;
                    }
                },
                function(){
                    self.mgr._buildList(false, true, funcCompareList);
                }
            );

        });

    }
};

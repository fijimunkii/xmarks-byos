/* 
 Copyright 2005-2008 Foxmarks Inc.
 
 foxmarks-unittest.js: Handles all the unit tests
   
 */

var gFoxmarksUT = {
    status: function(s){
        if(!s || s.length == 0)
            return;
        var os = Cc["@mozilla.org/observer-service;1"]
            .getService(Ci.nsIObserverService);
        os.notifyObservers(null, "xmarksbyos-unittest-status",
            s);
        LogWrite(s);
    },
    createTextArray: function(length, charlen,type){
        var a = [];
        var len = length;

        var charrange;
        var charoffset;
        switch(type){
            case 'all':
                charrrange = 917999;
                charoffset = 1;
                break;
            case 'ascii':
                charrange = 126 - 32;
                charoffset = 32;
                break;
            case 'alpha':
                charrange = 122 - 97;
                charoffset = 97;
                break;
            case 'numeric':
                charrange = 57 - 48;
                charoffset = 48;
                break;
        }

        while(len--){
            var txt = [];
            var ct = charlen;
            while(ct--){
                var ascii = Math.floor(charrange * Math.random()) + charoffset;
                txt.push( String.fromCharCode(ascii) );
            }
            a.push(txt.join(""));
        }
        return a;
    },
    testList: [
        // encryption tests
        function(statusFunc, errorFunc, finishFunc){
            var TITLE = "Encryption: ";
            var id = "encrypt";
            var encrypt = CreateAESManager();

            statusFunc(TITLE + "Started");
            var ct = XmarksBYOS.gSettings.getUnitTestOption(id);
            if(ct){
                statusFunc(TITLE + "start (" + ct + ")");

                var list = gFoxmarksUT.createTextArray(ct, 255, "ascii");
                for(var x = 0; x < ct; x++){
                    if(x % 100 == 0){
                        statusFunc(TITLE + "test #" + x);
                    }
                    var t1 = x == 0 ? list[x]: list[x - 1];
                    var t2 = list[x];
                    var s = encrypt.encrypt(t1, t2);
                    if(t2 != encrypt.decrypt(t1, s)){
                        errorFunc("FAIL: encryptor with password '" + t1 + 
                            "' and string '" + t2 + "'");
                    }
                }
                statusFunc(TITLE + "end");
            }
            else
                statusFunc(TITLE + "skipped");
            statusFunc(TITLE + "Ended");
            finishFunc();
        },

        // base64 tests
        function(statusFunc, errorFunc, finishFunc){
            var TITLE = "Base64: ";
            var id = "base64";

            statusFunc(TITLE + "Started");
            var ct = XmarksBYOS.gSettings.getUnitTestOption(id);
            if(ct){
                statusFunc(TITLE + "start (" + ct + ")");

                var list = gFoxmarksUT.createTextArray(ct, 255, "all");
                for(var x = 0; x < ct; x++){
                    if(x % 100 == 0){
                        statusFunc(TITLE + "test #" + x);
                    }
                    var t = list[x];
                    var s = Base64.encode(t, false);

                    if(t != Base64.decode(s)){
                        errorFunc("FAIL: base64 with password '" + t1 + 
                            "' and string '" + t2 + "'");
                    }
                    //Components.utils.forceGC();
                }
                statusFunc(TITLE + "end");
            }
            else
                statusFunc(TITLE + "skipped");
            statusFunc(TITLE + "Ended");
            finishFunc();
        },

        // sync-upload-download tests
        function(statusFunc, errorFunc, finishFunc){
            var TITLE = "Sync, Upload, Download: ";
            var id = "sync-upload-download";

            statusFunc(TITLE + "Started");
            var ct = XmarksBYOS.gSettings.getUnitTestOption(id);
            if(ct){
                statusFunc(TITLE + "start (" + ct + ")");

                var server = new SyncServer();
                server.manual = true;
                var func = function(status){
                    server.sync("dirty", function(a){
                        if(a){
                            errorFunc(TITLE + "sync returned" + a);
                        }
                        else {
                            server.upload(function(b){
                                if(b){
                                    errorFunc(TITLE + "upload returned" + b);
                                } else {
                                    server.download(function(c){
                                        if(c){
                                            errorFunc(TITLE + "download returned" + c);
                                        } else {
                                            ct--;
                                            if(ct){
                                                func();
                                            } else {
                                                statusFunc(TITLE + "Ended");
                                                finishFunc();
                                            }
                                        }

                                    });
                                }
                            });
                        }
                    });
                };
                func();
            }
            else {
                statusFunc(TITLE + "skipped");
                finishFunc();
            }
        },

        // memleak tests
        function(statusFunc, errorFunc, finishFunc){
            var TITLE = "MemLeak: ";
            var id = "memleak";

            statusFunc(TITLE + "Started");
            var ct = XmarksBYOS.gSettings.getUnitTestOption(id);
            if(ct){
                statusFunc(TITLE + "start (" + ct + ")");

                var list = gFoxmarksUT.createTextArray(ct, 255, "all");
                for(var x = 0; x < ct; x++){
                    if(x % 100 == 0){
                        statusFunc(TITLE + "test #" + x);
                    }
                    var t = list[x];
                    var s = Base64.encode(t, false);

                    if(t != Base64.decode(s)){
                        errorFunc("FAIL: base64 with password '" + t1 + 
                            "' and string '" + t2 + "'");
                    }
                    Components.utils.forceGC();
                }
                statusFunc(TITLE + "end");
            }
            else
                statusFunc(TITLE + "skipped");
            statusFunc(TITLE + "Ended");
            finishFunc();
        },

        // Password tests
        function(statusFunc, errorFunc, finishFunc){
            var TITLE = "Password: ";
            var id = "password";

            statusFunc(TITLE + "Started");
            var ct = XmarksBYOS.gSettings.getUnitTestOption(id);
            if(ct){
                statusFunc(TITLE + "start (" + ct + ")");

                // create some random strings
                var list = gFoxmarksUT.createTextArray(ct, 32, "alpha");
                var len;

                //Remove all the old passwords
                var username = XmarksBYOS.gSettings.username;
                var password = XmarksBYOS.gSettings.passwordNoPrompt;
                var pin = XmarksBYOS.gSettings.pinNoPrompt;
                var mgr = Components.classes["@mozilla.org/login-manager;1"]
                    .getService(Components.interfaces.nsILoginManager);
                
                mgr.removeAllLogins();
                XmarksBYOS.gSettings.username = username;
                XmarksBYOS.gSettings.password = password;
                XmarksBYOS.gSettings.pin = pin;

                var addLogins = function(thelist){
                    // Add logins with random values
                    for(var x = 0; x < thelist.length; x++){
                        var txt = thelist[x];
                        var loginInfo = Components.classes[
                            "@mozilla.org/login-manager/loginInfo;1"].
                            createInstance(Components.interfaces.nsILoginInfo);
                        loginInfo.init(
                            txt + ".xmarks.com", null, 
                            "Xmarks Unit Test", 
                            txt, 
                            txt,
                            "", 
                            "");
                        try {
                            mgr.addLogin(loginInfo);
                        }
                        catch(e) {}
                    }
                };

                addLogins(list);
                var server = new SyncServer();
                server.manual = true;
                server.upload(function(status){
                    if(status){
                        errorFunc(TITLE + "upload returned" + status);
                    }
                    else {
                        server.download(function(status){
                            if(status){
                                errorFunc(TITLE + "upload returned" + status);
                            }
                            else {
                                // todo, compare results

                                var append = gFoxmarksUT.
                                    createTextArray(25, 32, "alpha");
                                addLogins(append);
                                server.merge(true, function(status){
                                    if(status){
                                        errorFunc(TITLE + "merge returned " +
                                            status);
                                    }
                                    else {
                                        statusFunc(TITLE + "finished");
                                        finishFunc();
                                    }
                                });
                            }
                        });
                    }
                });
            }
            else
                statusFunc(TITLE + "skipped");
            statusFunc(TITLE + "Ended");
        },
    ],
    runtest: function(id){
        var self = this;
        var statusFunc = function(s){
            gFoxmarksUT.status(s);
        };
        var errorCallback = function(s){
            gFoxmarksUT.numErrors++;
            statusFunc(s);
        };
        var finishCallback = function(){
            gFoxmarksUT.runNext();
        };
        this.testList[id](statusFunc, errorCallback, finishCallback);
                   

    },
    runNext: function(){
        this.currTest++;
        if(this.currTest >= this.testList.length){
            this.status("End Unit Test. Num Errors = " + this.numErrors);
        }
        else {
            var self = this;
            var callbackSingle = {
                notify: function(){
                    self.runtest(self.currTest);
                }
            };
            var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
            timer.initWithCallback(callbackSingle, 1000,
                Ci.nsITimer.TYPE_ONE_SHOT);
        }
    },
    run: function(){
        this.currTest = -1;
        this.numErrors = 0;
        this.status("Begin Unit Tests");
        this.runNext();
    }
};


var gFailureCount = 0;// number of consecutive times we've failed
var gBackoffUntil = 0;// if we've been failing, our backoff time (ms since 1970)
var gServerBackoff = 
    { 'bookmarks': 0,
      'passwords': 0
    };  // seconds server wants us to back off

function TestSync(){
//    var mgr = CreateAESManager();

 //   mgr.utEncryption();
    
  var server = new SyncServer();

   //server.manual = true;
   //server.verifypin("claire", Finished);
   //server.download(Finished);
  //server.merge(true, Finished);
   //server.merge(false, Finished);
   //server.upload(Finished);
   server.sync("dirty", Finished);

   function Finished(status) {
        dump("The status was " + status);
   }
}

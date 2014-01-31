 /*
 Copyright 2007 Foxmarks Inc.

 foxmarks-core.js: implements core sync & merge algorithms. 

 */

function EnumerateDeletedNodes(cs, baseline, current) {
    // Given a delete command, determine which of its desecendant nodes
    // were actually deleted, and attach that list of nids.
    // Some children may have been moved prior to the delete, so they
    // would survive in the curernt nodeset. Those survivors are not
    // included in the attached list.

    
    var deleted = null;

    function EnumerateInternal(nid) {
        if (!current.Node(nid, false, true)) {
            deleted.push(nid);
        }
        var node = baseline.Node(nid);
        if (node.children) {
            node.children.forEach(function(nid) { EnumerateInternal(nid) } );
        }
    }

    cs.set.forEach(function(command) {
        if (command.action == 'delete') {
            command.deleted = [];
            deleted = command.deleted;
            EnumerateInternal(command.nid);
        }
    } );
}

function CleanDeletedNodes(cs) {
    cs.set.forEach(function(cmd) { 
        if (cmd.action == 'delete') {
            delete cmd.deleted;
        }
        delete cmd.fixed;
    } );
}


function CombinePrePost(cs) {
    cs.set = cs.pre.concat(cs.set).concat(cs.post);
    delete cs.pre;
    delete cs.post;
}

function OpenConflictDialog(url, input) {
    // find a browser window to use as a parent for openDialog
    var wm = Cc['@mozilla.org/appshell/window-mediator;1'].getService();
    var wmi = wm.QueryInterface(Ci.nsIWindowMediator);
    var top = wmi.getMostRecentWindow("foxmarks:progress");

    // If we can't find one of our own windows, try any window.
    if (!top) {
        top = wmi.getMostRecentWindow(null);
        if (!top) {
            // We couldn't find a window, so pretend user canceled.
            return null;
        }
    }

    var output = {};
    top.openDialog(url, "_blank", "chrome,dialog,modal,centerscreen", 
        output, input);
    return output.selection;
}



var DETECTORS = {

    // Format for naming of these detectors is localaction_serveraction.

    insert_insert: function(local, server, localNS, serverNS) {
        if (local.nid == server.nid) {  // items created with same nid. Scary!
            var conflict = [];

            forEach(local.args, function(value, attr) {
                if (server.args[attr] && !DETECTORS.HARMLESS_ATTRS[attr] &&
                        value != server.args[attr]) {
                    conflict.push(attr + ":" + value);
                }
            } );

            forEach(server.args, function(value, attr) {
                if (local.args[attr] && !DETECTORS.HARMLESS_ATTRS[attr] &&
                        value != local.args[attr]) {
                    conflict.push(attr + ":" + value);
                }
            } );

            if (conflict.length) {
                var lnode = localNS.Node(local.nid);
                var snode = serverNS.Node(server.nid);
                var rv = localNS.handleNidConflict(lnode, snode, conflict);

                showedUI = true;

                if (rv == "local") {
                    return ["overwrite", "local"];
                } else if (rv == "server") {
                    return ["overwrite", "server"];
                } else if (rv == "same") {
                    return ["drop", "both"];
                } else {
                    throw 2;
                }
            } else {
                return ["drop", "both"];
            }
        }
        if (local.args.pnid == server.args.pnid &&
                local.args.bnid == server.args.bnid) {
            return ["transit", "server"];
        }
        return null;
    },

    insert_move: function(local, server) {
        if (local.args.pnid != server.args.pnid &&
            local.args.bnid == server.nid) {
            return ["nextsib", "left"];
        }
        if (local.nid != server.nid &&
                local.args.pnid == server.args.pnid &&
                local.args.bnid == server.args.bnid) {
                return ["transit", "server"];
        }
        return null;
    },

    insert_reorder: function(local, server, lns, sns) {
        if (local.args.pnid == sns.Node(server.nid).pnid &&
                local.args.bnid == server.args.bnid && !server.fixed) {
            return ["transit", "server"]; 
        }
        if (local.args.pnid == sns.Node(server.nid).pnid &&
                local.args.bnid == server.nid) {
            return ["nextsib", "left"];
        }
        return null;
    },

    insert_update: function(local, server) {
        return null;
    },

    delete_insert: function(local, server) {
        if (local.deleted.indexOf(server.args.bnid) >= 0) {
            return ["nextsib", "right"];
        }
        if (local.deleted.indexOf(server.args.pnid) >= 0) {
            return ["delinsert", "left"];
        }
        return null;
    },
            
    delete_delete: function(local, server) {
        if (local.nid == server.nid) {
            return ["drop", "both"];
        }
        if (local.deleted.indexOf(server.nid) >= 0) {
            return ["drop", "right"];
        }

        if (server.deleted.indexOf(local.nid) >= 0) {
            return ["drop", "left"];
        }

        return null;
    },

    delete_move: function(local, server) {
        if (local.deleted.indexOf(server.args.bnid) >= 0) {
            return ["nextsib", "right"];
        }
        if (local.deleted.indexOf(server.nid) >= 0) {
            return ["delmoveout", "left"];
        }
        if (local.deleted.indexOf(server.args.pnid) >= 0) {
            return ["delmovein", "left"];
        }
        return null;
    },

    delete_reorder: function(local, server) {
        if (local.deleted.indexOf(server.nid) >= 0) {
            return ["drop", "right"];
        }
        if (local.nid == server.args.bnid) {
            return ["nextsib", "right"];
        }
        return null;
    },

    delete_update: function(local, server) {
        if (local.deleted.indexOf(server.nid) >= 0) {
            // A modified node was deleted. If the modifications
            // were significant, we've got a real conflict. Otherwise,
            // drop the modification and proceed with the delete.
            for (var a in server.args) {
                if (server.args.hasOwnProperty(a) &&
                        !DETECTORS.HARMLESS_ATTRS[a]) {
                    return ["delupdate", "left"];
                }
            }
            // The update was insignificant; drop it.
            return ["drop", "right"];
        }
        return null;
    },

    move_move: function(local, server, localNS, serverNS) {
        if (local.args.pnid == server.args.pnid) {
            if (local.nid == server.nid) {
                if (local.args.bnid == server.args.bnid) {
                    return ["drop", "both"];
                } else {
                    return ["drop", "server"];
                }
            } else {
                if (local.args.bnid == server.args.bnid) {
                    return ["transit", "server"];
                }
            }
        } else {
            if (local.nid == server.nid) {
                var input = { item: localNS.Node(local.nid),
                    local: localNS.Node(local.args.pnid),
                    server: serverNS.Node(server.args.pnid) };
                var rv = OpenConflictDialog(
                    "chrome://xmarksbyos/content/foxmarks-parentconflict.xul",
                    input);
                showedUI = true;

                if (rv == "local") {
                    return ["drop", "server"];
                } else if (rv == "server") {
                    return ["drop", "local"];
                } else {
                    throw 2;
                }
            } else {
                if (local.nid == server.args.bnid) {
                    return ["nextsib", "right"];
                } else if (local.args.bnid == server.nid) {
                    return ["nextsib", "left"];
                }
            }
        }

        return null;
    },

    move_reorder: function(local, server, lns, sns) {
        if (local.nid == server.nid) {
            return ["drop", "right"];
        }
        if (local.nid == server.args.bnid &&
                local.args.pnid != sns.Node(server.nid).pnid &&
                !server.fixed) {
            return ["nextsib", "right"];
        }
        if (local.args.pnid == sns.Node(server.nid).pnid &&
                local.args.bnid == server.args.bnid &&
                !server.fixed) {
            return ["transit", "server"];
        }
        return null;
    },

    move_update: function() {
        return null;
    },

    reorder_reorder: function(local, server, lns, sns) {
        if (lns.Node(local.nid).pnid != sns.Node(server.nid).pnid) {
            return null;
        }
        if (local.nid == server.nid) {
            if (local.args.bnid == server.args.bnid) {
                if (!local.fixed) {
                    return ["drop", "both"];
                } else {
                    return null;
                }
            } else {
                // XXX: Must retarget in this case
                return ["drop", "server"];
            }
        } else { // local.nid != server.nid
            if (local.nid == server.args.bnid && !server.fixed) {
                return ["commutereorder", "left"];
            } else if (local.args.bnid == server.nid && !local.fixed) {
                return ["commutereorder", "right"];
            } else {
                return null;
            }
        }
    },

    reorder_update: function() {
        return null;
    },

    HARMLESS_ATTRS: { created: true, visited: true, modified: true, private: true, 
        icon: true },

    update_update: function(local, server, localNS, serverNS) {
        if (local.nid != server.nid)
            return;

        var conflicts = [];

        forEach(local.args, function(value, attr) {
            if (server.args[attr] && !DETECTORS.HARMLESS_ATTRS[attr] &&
                    value != server.args[attr]) {
                conflicts.push(attr);
            }
        } );

        // Special case: tag-only conflict
        if (conflicts.length == 1 && conflicts[0] == 'tags') {
            return ["drop", "server"];
        }

        // Special case: conflict on (hidden attributes of) ROOT
        if (local.nid == NODE_ROOT) {
            return ["drop", "server"];
        }

        if (conflicts.length) {
            var lnode = localNS.Node(local.nid);
            var snode = serverNS.Node(server.nid);
            var rv = localNS.handleNidConflict(lnode, snode, conflicts);

            showedUI = true;
            if (rv == "local") {
                return ["drop", "server"];
            } else if (rv == "server") {
                return ["drop", "local"];
            } else if (rv == "same") {
                return ["drop", "both"];
            } else {
                throw 2;
            }
        } 
        return null;
    }
}



// Given a baseline nodeset, a local nodeset, and a server nodeset,
// generate two commandsets, one to be applied to the local nodeset,
// another to be applied to the server nodeset. Applying each commandset
// to the respective nodeset will result in the two nodsets becoming
// synchronized.
//
// Note that the routine operates asynchronously; the client-provided
// callback will be called with two parameters: localCS (the commandset
// to be applied to the server, and serverCS (the commandset to be applied
// to the local nodeset).

function Synchronize(baseline, localCS, serverCS, local, server, callback) {

    EnumerateDeletedNodes(localCS, baseline, local);
    EnumerateDeletedNodes(serverCS, baseline, server);

    localCS.pre = [];
    localCS.post = [];
    serverCS.pre = [];
    serverCS.post = [];

    // Iterate over each local commmand, comparing it with each
    // server command. Detect and resolve conflicts.

    var iterations = 0;
    var conflicts = {};
    var showedUI = false;

    for (var l = 0; l < localCS.set.length; ++l) {
        var lc = localCS.set[l];
        var result = null;
        var breakOut = false;

        for (var s = 0; s < serverCS.set.length; ++s) {

            sc = serverCS.set[s];

            var method = DETECTORS[lc.action + "_" + sc.action];
            if (method) {
                try {
                    result = method(lc, sc, local, server, false);
                } catch (e) {
                    LogWrite("Synchronize: failed processing " +
                        lc.toSource() + ", " + sc.toSource());
                    LogWrite("Error is " + e.toSource());
                    throw e;
                }
                if (!result)
                    continue;
                if (result[1] == 'left') result[1] = 'local';
                else if (result[1] == 'right') result[1] = 'server';
            } else {
                method = DETECTORS[sc.action + "_" + lc.action];
                if (!method) {
                    throw Error("Couldn't find conflict detector for " +
                            lc.action + " : " + sc.action);
                }
                try {
                    result = method(sc, lc, server, local, true);
                } catch (e) {
                    LogWrite("Synchronize: failed processing (reversed) " +
                        sc.toSource() + ", " + lc.toSource());
                    LogWrite("Error is " + e.toSource());
                    throw e;
                }
                if (!result)
                    continue;
                if (result[1] == 'left') result[1] = 'server';
                else if (result[1] == 'right') result[1] = 'local';
            }
           
            conflicts[result[0]] = (conflicts[result[0]] || 0) + 1;

            LogWrite(">>> Sync: Executing " + result[0] + "(" + result[1] + 
                    ") on " + lc.toSource() + " vs. " + sc.toSource());

            switch (result[0]) {
            case 'drop': do_drop(result[1]); break;
            case 'overwrite': do_overwrite(result[1]); break;
            case 'transit': do_transit(result[1]); break;
            case 'nextsib': do_nextsib(result[1]); break;
            case 'delinsert': do_delinsert(result[1]); break;
            case 'delmovein': do_delmovein(result[1]); break;
            case 'delmoveout': do_delmoveout(result[1]); break;
            case 'delupdate': do_delupdate(result[1]); break;
            case 'commutereorder': do_commutereorder(result[1]); break;
            default: throw Error("Unknown sync operator " + result[0]);
            }

            if (breakOut) {
                iterations += 1;
                if (iterations >= 1000) {
                    throw 1013;
                }
                break;
            }
        }
    }

    // We have resolved all conflicts in commands
    CleanDeletedNodes(localCS);
    CleanDeletedNodes(serverCS);
    CombinePrePost(localCS);
    CombinePrePost(serverCS);

    callback(localCS, serverCS, conflicts, showedUI);
    return;

    function do_overwrite(arg) {
        switch (arg) {
        case 'local': 
            serverCS.drop(s); 
            s = s - 1;
            localCS.set[l].action = "update";
            localCS.set[l].args.bnid = undefined;
            localCS.set[l].args.pnid = undefined;
            break;
        case 'server': 
            localCS.drop(l); 
            l = l - 1;
            serverCS.set[s].action = "update";
            serverCS.set[s].args.bnid = undefined;
            serverCS.set[s].args.pnid = undefined;
            break;
        default: 
            throw Error("Unknown sync parameter " + result[1]);
        }
        return;
    }
    function do_drop(arg) {
        switch (arg) {
        case 'both': 
            localCS.drop(l);
            serverCS.drop(s);
            l = l - 1;
            breakOut = true;
            // bust out of inner loop; decrement l and start there
            break;
        case 'local': 
            localCS.drop(l); 
            l = l - 1;
            breakOut = true;
            // bust out of inner loop; decrement l and start there
            break;
        case 'server': 
            serverCS.drop(s); 
            s = s - 1;
            // decrement s and continue inner loop
            break;
        default: 
            throw Error("Unknown sync parameter " + result[1]);
        }
        return;
    }

    function do_transit(arg) {
        switch (arg) {
        case 'local': 
            lc.args.bnid = sc.nid; 
            l = l - 1;
            breakOut = true;
            // restart inner loop
            break;
        case 'server': 
            sc.args.bnid = lc.nid; 
            l = -1;
            breakOut = true;
            // restart outer loop
            break;
        default: 
            throw Error("Uknown sync parameter " + result[1]);
        }
        return;
    }

    function do_nextsib(arg) {
        switch (result[1]) {
        case 'local': 
            lc.args.bnid = local.NextSibling(lc.args.bnid, baseline); 
            l = l - 1;
            breakOut = true;
            // restart inner loop
            break;
        case 'server': 
            sc.args.bnid = server.NextSibling(sc.args.bnid, baseline);
            l = -1;
            breakOut = true;
            // restart outer loop
            break;
        default:
            throw Error("Unknown sync parameter " + result[1]);
        }
        return;
    }

    function do_delinsert(arg) {
        // arg is local or server, determining which side
        // originated the delete. The other side originated a
        // conflicting insert. The desired end result is for the inserted
        // node to be inserted into the nearest remaining ancestor of the
        // original pnid. This is accomplished by modifying the existing
        // insert command, changing its parent, and inserting a move command
        // to the side that originated the delete which moves the already
        // inserted node into the correct parent before performing the delete.
        // Finally, we add reorders to the post-sequence so make sure that
        // the inserted item ends up at the bottom of the folder.

        var del = null;
        var ins = null;
        var delCS = null;

        if (arg == "server") {
            del = sc;
            ins = lc;
            delCS = serverCS;
        } else {
            del = lc;
            ins = sc;
            delCS = localCS;
        }

        // What's the ultimate destination for the insert?
        var pnid = NearestAncestor(ins.args.pnid, baseline, local, server);

        // Alter the insert command so that it winds up in a safe home.
        ins.args.pnid = pnid;
        ins.args.bnid = null;

        // Move the inserted node aside before the delete
        delCS.pre.push(new Command("move", ins.nid, { pnid: pnid } ));

        // And now make sure it's add the end of the folder on both sides.
        var cmd = new Command("reorder", ins.nid, { bnid: null } );
        localCS.post.push(cmd);
        serverCS.post.push(cmd);

        // We've modified both commandsets; restart processing from the top.
        l = -1;
        breakOut = true;
        return;
    }

    function do_delmovein(arg) {
        // arg is local or server, determining which side
        // originated the delete. The other side originated a
        // conflicting move into the deleted subtree.
        // The desired end result is for the moved
        // node to be inserted into the nearest remaining ancestor of the
        // original pnid. This is accomplished by modifying the existing
        // move command, changing its parent, and inserting a move command
        // to the side that originated the delete which moves the already
        // inserted node into the correct parent before performing the delete.

        var del = null;
        var ins = null;
        var delCS = null;

        if (arg == "server") {
            del = sc;
            ins = lc;
            delCS = serverCS;
        } else {
            del = lc;
            ins = sc;
            delCS = localCS;
        }

        // What's the ultimate destination for the move?
        var pnid = NearestAncestor(ins.args.pnid, baseline, local, server);

        // Alter the move command so that it winds up in a safe home.
        ins.args.pnid = pnid;
        ins.args.bnid = null;

        // Move the inserted node aside before the delete
        delCS.pre.push(new Command("move", ins.nid, { pnid: pnid } ));

        // And now make sure it's add the end of the folder on both sides.
        var cmd = new Command("reorder", ins.nid, { bnid: null } );
        localCS.post.push(cmd);
        serverCS.post.push(cmd);

        // We've modified both commandsets; restart processing from the top.
        l = -1;
        breakOut = true;
        return;
    }

    function do_delupdate(arg) {
        // arg is local or server, determining which side
        // originated the delete. The other side originated a
        // conflicting update within the deleted subtree.
        // The desired end result is for the updated node and its
        // descendants to survive at the nearest remaining ancestor of the
        // original destination. This is accomplished by resurrecting the
        // modified node and its descendants and adding a move to the side
        // from which the delete originated which moves the item to its new
        // location.

        var update = null;
        var updateCS = null;
        var moveNS = null;
        var del = null;
        var delNS = null
        var delIndex = 0;
        var updateIndex = 0;

        if (arg == "server") {
            update = lc;
            updateCS = localCS;
            updateNS = local;
            del = sc;
            delNS = server;
            delCS = serverCS;
            delIndex = s;
            updateIndex = l;
        } else {
            update = sc;
            updateCS = serverCS;
            updateNS = server;
            del = lc;
            delNS = local;
            delCS = localCS;
            delIndex = l;
            updateIndex = s;
        }

        // Resurrect the deleted nodes
        var pnid = ResurrectNodes(update.nid, baseline, updateNS, 
            delNS, updateCS, updateIndex, del, delCS, delIndex, null);

        // On the delete side, add a move of the referenced node
        // ... but only if it's a different parent.
        if (pnid != updateNS.Node(update.nid).pnid) {
            delCS.pre.push( new Command("move", update.nid, { pnid: pnid } ));
        }

        // Push it to the end of its parent folder for safety
        if(updateNS.OrderIsImportant()){
            var cmd = new Command("reorder", update.nid, { bnid: null } );
            localCS.post.push(cmd);
            serverCS.post.push(cmd);
        }

        // We've modified both commandsets; restart processing from the top.
        l = -1;
        breakOut = true;
        return;
    }

    function do_delmoveout(arg) {
        // arg is local or server, determining which side
        // originated the delete. The other side originated a
        // conflicting move out of the deleted subtree.
        // The desired end result is for the moved
        // node to survive at the nearest remaining ancestor of the
        // original destination. This is accomplished by replacing the existing
        // move command with a (series of) insert(s) that resurrect the deleted
        // nodes(s) in their correct position. We let delinsert deal with the
        // case where the destination folder has also been deleted.

        var move = null;
        var moveCS = null;
        var moveIndex = null;
        var moveNS = null;
        var del = null;
        var delNS = null
        var delCS = null;
        var delIndex = 0;

        if (arg == "server") {
            move = lc;
            moveCS = localCS;
            moveIndex = l;
            moveNS = local;
            del = sc;
            delNS = server;
            delCS = serverCS;
            delIndex = s;
        } else {
            move = sc;
            moveCS = serverCS;
            moveIndex = s;
            moveNS = server;
            del = lc;
            delNS = local;
            delCS = localCS;
            delIndex = l;
        }

        // Remove the move command
        moveCS.set.splice(moveIndex, 1);

        // Resurrect the deleted nodes
        ResurrectNodes(move.nid, baseline, moveNS, delNS, moveCS, moveIndex,
            del, delCS, delIndex, move.args.bnid);

        // We've modified both commandsets; restart processing from the top.
        l = -1;
        breakOut = true;
        return;
    }

    function do_commutereorder(arg) {
        // We've encountered R(x,y) vs. R(y,z).
        // arg determines the side receiving the additional command R(x,y).
        // The resolution is to add R(x,y) as a simulated command
        // after R(y,z). We also mark the original R(x,y) as fixed
        // so we don't trigger again and so we don't drop it believing
        // that it's redundant. It would be nice to handle this in
        // the post-sequence, but, unfortunately, we need to get the
        // order straightened out before further moves and inserts happen.

        var c = arg == "local" ? sc : lc;
        var set = arg == "local" ? localCS.set : serverCS.set;
        var i = arg == "local" ? l : s;
        c.fixed = true;

        LogWrite("Duplicating command from " + arg + ": " + c.toSource());

        // This bit is tricky. Insert our copy of the command c in
        // the appropriate place in set. The appropriate place is the first
        // non-fixed spot after the current command.

        for ( i++; i < set.length; ++i) {
            if (!set[i].fixed)
                break;
        }

        set.splice(i, 0, c);
        l = -1;
        breakOut = true;
        return;
    }
}


function NearestAncestor(nid, baseline, ns1, ns2) {
    while (nid) {
        var node = baseline.Node(nid, false, true);
        if (!node) {
            throw Error("NearestAncestor failed accessing " + nid);
        }

        if (ns1.Node(nid, false, true) && ns2.Node(nid, false, true)) {
            return nid;
        }

        nid = node.pnid;
    }
    throw "Couldn't find a common ancestor!";
}

function ResurrectNodes(nid, baseline, source, target, sourceCS, sourceIndex, 
    del, delCS, delIndex, bnid) {
    var nids = [nid];
    var pnid = null;

    while (nids.length) {
        var nid = nids.shift();
        var node = baseline.Node(nid);
        var sourceNode = source.Node(nid, false, true);
        var delpos = del.deleted.indexOf(nid);

        // Process this nid only if:
        // * If was deleted by the given delete commandi and
        // * It still exists in the source and
        // * Its has the same parent in baseline and source
        //   or it's the root of what we're resurrecting.
        if (delpos >= 0 && sourceNode && 
                (!pnid || sourceNode.pnid == node.pnid)) {
            var args = sourceNode.GetSafeAttrs();
            if (!pnid) {
                // This is our root; override the pnid and bnid if given.
                pnid = NearestAncestor(args.pnid, baseline, source, target);
                args.pnid = pnid;
                if (bnid) {
                    args.bnid = bnid;
                }
            }
            sourceCS.set.splice(sourceIndex++, 0,
                new Command("insert", nid, args));

            // If this nid was to be modified, drop the command as
            // it is now redundant (we're going to insert the full
            // node in its final state with the new command added above).
            forEach(sourceCS.set, function(cmd, index) {
                if (cmd.action == 'update' && cmd.nid == nid) {
                    sourceCS.drop(index);
                }
            });

            // Remove this nid from the list of nids deleted by the delete
            // command. This prevents triggering conflicts between the
            // delete command and the insert we just added above.
            if (delpos >= 0) {
                del.deleted.splice(delpos, 1);
            }
            if (node.children) {
                forEach(node.children, function(nid) { nids.push(nid) } );
            }
        }
    }
    // Finally, if our delete command now no longer deletes anything,
    // delete it!
    if (!del.deleted.length) {
        delCS.drop(delIndex);
    }

    return pnid;
}

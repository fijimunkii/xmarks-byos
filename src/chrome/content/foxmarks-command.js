/*
 Copyright 2007 Foxmarks Inc.

 foxmarks-command.js: implements class Command, encapsulating
 our commands executed (or derived from) Nodesets.

 */

// A command consists of:
//  * an action (insert, delete, move, reorder, or modify)
//  * a nid (node id, which identifies the node to operate upon)
//  * args: a dict of command arguments, varying by command:
//   * bnid specifies the sibling before which a node should
//     be inserted/moved/reordered.
//   * pnid specifies the nid of the parent for insert/move/reorder.
//   * attrs is a dict that specifies attributes to be set on insert
//     or modify.

function Command(action, nid, args)
{
    this.action = action;
    this.nid = nid;
    this.args = args;

}

Command.prototype = new Object;

function Commandset(set)
{
    this.set = set || [];
}

Commandset.prototype = {
    append: function(command) {
        this.set.push(command);
    },

    drop: function(command) {

        if (typeof command == 'number') {
            this.set.splice(command, 1);
        } else {
            throw Error("drop only supports command index argument");
        }
    },

    stats: function() {
        var count = {}
        for (var i in this.set) {
            var action = this.set[i].action;
            count[action] = count[action] ? count[action] + 1 : 1;
        }
        return count;
    },

    toJSONString: function() {
        return this.set.toJSONString();
    },

    execute: function(ns) {
        // execute our commands against the supplied nodeset
        for (var c = 0; c < this.set.length; ++c) {
            ns.Execute(this.set[c]);
        }
    },

    get length() {
        return this.set.length;
    }
}




var vows = require("vows"),
    assert = require("assert"),
    scrabble = require("scrabble");

var Utils = scrabble.Utils;

exports.suite = vows.describe("Testing the Utils").addBatch({
    "Utils.parseMove()": {
        "Correct 'pass' play moves": {
            topic: function() {
                return ["Pass", "pass", "PASS", "pAsS"].map(function(m) {
                    return Utils.parseMove(m);
                });
            },
            "should be parsed as {type: 'pass'}": function(topic) {
                assert.isTrue(topic.reduce(function(prev, cur) {
                    return prev && (cur.type == "pass");
                }, true));
            },
        },
        "The move 'exchange all'": {
            topic: Utils.parseMove("exchange all"),
            "should return {type: 'exchange', what: 'all'}": function(move) {
                assert.equal(move.type, "exchange");
                assert.equal(move.what, "all");
            },
        },
        "The move '4h ke[L](Le)y'": {
            topic: Utils.parseMove("4h ke[L](Le)y"),
            "should return type 'play'": function(move) {
                assert.equal(move.type, "play");
            },
            "should start at (x,y)=(7,3)": function(move) {
                assert.equal(move.tiles[0].x, 7);
                assert.equal(move.tiles[0].y, 3);
            },
            "should return 6 tiles": function(move) {
                assert.equal(move.tiles.length, 6);
            },
            "should have all tiles at height y=3": function(move) {
                for (var i = 0; i < move.tiles.length; i++) {
                    assert.equal(move.tiles[i].y, 3);
                }
            },
            "should check for the 'l' and 'e' tile": function(move) {
                assert.equal(move.tiles[3].action, "check");
                assert.equal(move.tiles[4].action, "check");
            },
            "should set 'blankletter' to '_' for the 'L'": function(move) {
                assert.equal(move.tiles[2].blankletter, "_");
            },
        },
        "The move '4hz ke[L](Le)y'": {
            topic: Utils.parseMove("4hz ke[L](Le)y"),
            "should return false": function(move) {
                assert.isFalse(move);
            },
        },
    },
    "Utils.sub()": {
        "'abcd' - 'cdef' = 'ab'": function() {
            assert.equal("ab", Utils.sub("abcd", "cdef"));
        },
        "'abcddd' - 'cdef' = 'abdd'": function() {
            assert.equal("abdd", Utils.sub("abcddd", "cdef"));
        },
        "'_' - 'kelley' = '_'": function() {
            assert.equal("_", Utils.sub("_", "kelley"));
        },
        "'__' - 'ab_' = '_'": function() {
            assert.equal("_", Utils.sub("__", "ab_"));
        },
        "'' - '' = ''": function() {
            assert.equal("", Utils.sub("", ""));
        },
    },
});


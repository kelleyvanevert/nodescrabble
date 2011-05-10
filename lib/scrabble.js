
/**
 * Create a new game:
 * var g = new Game(["Susan Peterson", "Leslie"]);
 * 
 * Load an existing game:
 * var gamedata = somegame.getJSON();
 * var g = new Game(gamedata);
 */
var Game = function(a)
{
    // Initiate board and tile store
    this.board = [];
    this.board.empty = true;
    this.tiles = {
        "permanent": [],
    };
    for (var y = 0; y < 15; y++) {
        var row = [];
        for (var x = 0; x < 15; x++) {
            row.push(null);
        }
        this.board.push(row);
    }
    
    // Check if restoration or creation, load data
    if (a.state && a.created && a.modified && a.players && a.moves) {
        this.state = "restoration";
        // --> game is being restored
        this.players = a.players.map(function(p, i) {
            return {
                "name": p,
                "rack": a.moves[0].replace(/^[0-9]+:[ ]*creategame[ ]*/, "")
                    .match(/[a-z_]+/g)[i],
                "score": 0,
                "active": (i == 0),
            };
        });
        this.activeplayer = 0;
        this.created = a.created;
        this.modified = a.modified;
        this.moves = a.moves;
        // (skip the first move, which is "creategame klsdhe_ asdkhga ..")
        for (i = 1; i < this.moves.length; i++) {
            this.play(this.moves[i]);
        }
        this.state = a.state;
    } else {
        this.state = "creation";
        // --> new game
        this.players = a.map(function(p) {
            return {
                "name": p,
                "rack": "",
                "score": 0,
            };
        });
        if (this.players.length < 1)
            throw "Must have more than 1 player!";
        this.activeplayer = 0;
        this.created = this.modified = (new Date).getTime();
        this.initracks();
        this.moves = [(new Date).getTime() + ": creategame " + this.players.map(function(p) {
            return p.rack;
        }).join(" ")];
        this.state = "active";
    }
};

Game.prototype.put = function(t) {
    var tile = {
        x           : t.x,
        y           : t.y,
        letter      : t.letter,
        blankletter : t.blankletter,
        type        : t.type || "permanent",
    };
    // Overwrite if necessary
    if (this.get(tile)) {
        this.board[tile.y][tile.x] = null;
    };
    this.board.empty = false;
    this.board[tile.y][tile.x] = tile;
    if (!this.tiles[tile.type])
        this.tiles[tile.type] = [];
    this.tiles[tile.type].push(tile);
};
Game.prototype.get = function(p) {
    if (p.x < 0 || p.y < 0 || p.x > 14 || p.y > 14)
        return null;
    return this.board[p.y][p.x];
};

/**
 * A shortcut to the current active player
 */
Game.prototype.player = function() {
    return this.players[this.activeplayer];
};

/**
 * Rotates the current active player (optionally with a given rotation)
 */
Game.prototype.rotateplayer = function(r) {
    delete this.player().active;
    this.activeplayer = (this.activeplayer + (r || 1) + this.players.length) % this.players.length;
    this.player().active = true;
};

/**
 * The game will try to play the given move for the current active player.
 * If an error occurs, false is returned and the errors are available at this.errors.
 * If successful, true is returned and the game state/data is changed.
 * @returns true when succesful, false otherwise.
 */
Game.prototype.play = function(movetxt) {
    this.scalc = "";
    this.errors = [];
    
    movetxt = movetxt.toLowerCase();
    var restore = false;
    var tmp = movetxt.match(/^([0-9]+):[ ]*[a-z0-9\(\)\[\]_ ]+(?:[ ]*--[ ]*([a-z_]+))?$/);
    if (tmp) {
        restore = true;
        var modify_time = parseInt(tmp[1]);
        var newletters = tmp[2] || "";
        movetxt = movetxt.replace(/^[0-9]+:[ ]*/, "")
            .replace(/[ ]*--[ ]*[a-z_]+$/, "");
    }
    
    var move = Game.parseMove(movetxt);
    if (move === false) {
        // parse error
        this.errors.push("The move sentence could not be parsed.");
        return false;
    }
    
    if (!restore) {
        var errors = this.validMove(move);
        if (errors.length > 0) {
            // error: invalid move
            this.errors = this.errors.concat(errors);
            return false;
        }
    }
    
    var score = 0;
    if (move.type == "exchange") {
        // Remove tiles from rack
        if (move.what == "all") {
            this.player().rack = "";
        } else {
            this.player().rack = Game.sub(this.player().rack, move.what);
        }
    } else if (move.type == "play") {
        // Put tiles to board and get a list of played rack letters
        var playedletters = "";
        for (var i = 0; i < move.tiles.length; i++) {
            var tile = move.tiles[i];
            if (tile.action == "play") {
                playedletters += tile.blankletter;
                tile.type = "temporary";
                this.put(tile);
            }
        }
        score = this.calc_score();
        while (this.tiles.temporary.length > 0) {
            var t = this.tiles.temporary.pop();
            t.type = "permanent";
            this.put(t);
        }
        // Remove played tiles from rack
        this.player().rack = Game.sub(this.player().rack, playedletters);
    }
    
    // Fill rack, rotate active player, update this.modified if needed, return true
    if (restore) {
        this.player().rack += newletters;
        if (this.state == "active") { // sync
            this.moves.push(modify_time + ": " + move.original +
                (newletters.length > 0 ? " -- " + newletters : ""));
        }
        this.modified = modify_time;
    } else {
        var n = 7 - this.player().rack.length;
        this.fillrack();
        this.moves.push((new Date).getTime() + ": " + move.original +
            (n > 0 ? " -- " + this.player().rack.slice(-n) : ""));
        this.modified = (new Date).getTime();
    }
    this.player().score += score;
    this.rotateplayer();
    
    if (!restore)
        this.fire("move");
    return true;
};

Game.prototype.calc_score = function() {
    var self = this,
        first = this.tiles.temporary[0],
        last = this.tiles.temporary.slice(-1)[0],
        varc = (first.x == last.x) ? "y" : "x",
        invc = (varc == "x") ? "y" : "x",
        fpos = function(initpos, the_varc, j) {
            var p = {},
                the_invc = (the_varc == "x") ? "y" : "x";
            p[the_varc] = j;
            p[the_invc] = initpos[the_invc];
            return p;
        },
        // Get all tiles in word with given pos and implied direction, unsorted.
        tiles = function(pos, my_varc) {
            var ts = [],
                tile;
            for (var i = pos[my_varc]; tile = self.get(fpos(pos, my_varc, i)); i--)
                ts.push(tile);
            for (var i = pos[my_varc] + 1; tile = self.get(fpos(pos, my_varc, i)); i++)
                ts.push(tile);
            return ts.sort(function(a,b) {
                return a[my_varc] > b[my_varc];
            });
        },
        // Valuate all given tiles
        valuate = function(tiles) {
            if (tiles.length == 1)
                return 0;
            var word_score_multiplication = 1;
            var v = tiles.reduce(function(total, t) {
                var fs = fieldscore(t);
                if (t.type == "temporary")
                    word_score_multiplication *= fs.word;
                return total + letterscore(t.blankletter) * (t.type == "temporary" ? fs.letter : 1);
            }, 0) * word_score_multiplication;
            return v;
        },
        scores = [];
    
    var tilerange = tiles(first, varc);
    // First, the score for the played word
    scores[0] = valuate(tilerange);
    // Then, all other possible words
    scores = scores.concat(tilerange.map(function(tile) {
        return (tile.type == "temporary") ? valuate(tiles(tile, invc)) : 0;
    }));
    
    // Final score calculation
    return scores.reduce(function(total, s) {
        return total + parseInt(s);
    }, 0) + (this.tiles.temporary.length == 7 ? 50 : 0);
};

/**
 * Check the validity of given move.
 * Returns a list of errors (which is empty if the move is valid).
 */
Game.prototype.validMove = function(move)
{
    var errors = [];
    
    // Handy
    if (move.type == "play") {
        move.tiles.play = move.tiles.filter(function(t) {
            return t.action == "play";
        });
        move.tiles.check = move.tiles.filter(function(t) {
            return t.action == "check";
        });
    }
    
    // Does the user have required letters?
    var checkletters = "";
    if (move.type == "exchange" && move.what != "all")
        checkletters = move.what;
    else if (move.type == "play")
        checkletters = move.tiles.play.map(function(t) {
            return t.blankletter;
        }).join("");
    try {
        checkletters.split("").reduce(function(rackletters, checkletter) {
            if (rackletters.indexOf(checkletter) < 0)
                throw "Not found!";
            return rackletters.replace(checkletter, "");
        }, this.player().rack);
    } catch (e) {
        errors.push("You do not have the required letters.");
    };
    
    // Exchange is only allowed if at least 7 leftoverletters remain..
    var numleftoverletters = numletters
        - this.tiles.permanent.length
        - this.players.map(function(p) { return p.rack.length; });
    if (move.type == "exchange" && numleftoverletters < 7) {
        errors.push("In order to exchange there must be at least 7 tiles remaining in the bag.");
    }
    
    var self = this;
    if (move.type == "play") {
        // Ensure playing tiles are all within the board
        if (!move.tiles.reduce(function(inboard, t) {
            return inboard && t.x >= 0 && t.y >= 0 && t.x < 15 && t.y < 15;
        }, true)) {
            errors.push("You cannot place tiles outside of the board.");
        }
        
        // Check if the tiles with action=='play' have an empty field
        if (!move.tiles.play.reduce(function(allempty, t) {
            return allempty && !self.board[t.y][t.x];
        }, true)) {
            errors.push("The word overlaps existing tiles on the board.");
        }
        
        // Check if the tiles with action=='check' really do exist
        if (!move.tiles.check.reduce(function(exist, t) {
            return exist && self.board[t.y][t.x];
        }, true)) {
            errors.push("The tiles you say exist do not exist on the board.");
        }
        
        // If there is no tiles with action=='check', then check whether
        //  this word touches an existing word or is first word of the game.
        if (move.tiles.check.length == 0 && !self.board.empty) {
            var varc = (move.tiles.length == 1) ? "x" :
                (move.tiles[0].x == move.tiles[1].x ? "y" : "x");
            var invc = (varc == "x") ? "y" : "x";
            var dc = function(v, v2) {
                var c = {};
                c[varc] = move.tiles[0][varc] + v;
                c[invc] = move.tiles[0][invc] + (v2 ? v2 : 0);
                return c;
            };
            var checkcoords = move.tiles.reduce(function(checkcoords, t, i) {
                return checkcoords.concat([dc(i, 1), dc(i, -1)]);
            }, [dc(-1), dc(move.tiles.length)]).filter(function(c) {
                return c.x >= 0 && c.x < 15 && c.y >= 0 && c.y < 15;
            });
            var found = checkcoords.filter(function(c) {
                return self.board[c.y][c.x] ? true : false;
            });
            if (found.length == 0) {
                errors.push("The word does not touch any existing letters on the board.");
            }
        }
        
        // If this is the first word of the game..
        if (this.board.empty) {
            // --> it must start in (7,7)
            if (move.tiles.play.filter(function(t) {
                return t.x == 7 && t.y == 7;
            }).length == 0) {
                errors.push("The first word of the game must pass the center field.");
            }
            // --> it must contain at least two tiles
            if (move.tiles.play.length < 2) {
                errors.push("The first word of the game must have at least two letters.");
            }
        }
    }
    
    return errors;
};

/**
 * Fills the rack of the last active player
 */
Game.prototype.fillrack = function() {
    var leftoverletters = this.players.map(function(p) {
        return p.rack;
    }).join("").split("").concat(this.tiles.permanent.map(function(t) {
        return t.blankletter;
    })).reduce(function(distribution, letter) {
        return distribution.replace(letter, "");
    }, letters());
    
    var p = this.player();
    while (p.rack.length < 7 && leftoverletters.length > 0) {
        var s = Math.floor(Math.random() * leftoverletters.length);
        p.rack += leftoverletters[s];
        leftoverletters = leftoverletters.slice(0, s) + leftoverletters.slice(s + 1);
    }
};

/**
 * Initiate the racks of all players.
 */
Game.prototype.initracks = function() {
    var distribution = letters();
    for (var i = 0; i < this.players.length; i++) {
        this.players[i].rack = "";
        for (var j = 0; j < 7; j++) {
            var k = Math.floor(Math.random() * distribution.length);
            this.players[i].rack += distribution[k];
            distribution = distribution.slice(0, k) + distribution.slice(k + 1);
        }
    }
};

/**
 * Returns an object containing all state information for this game.
 * The game can then be restored:
 *  var restored_game = new Game(jsondata);
 */
Game.prototype.getJSON = function() {
    return {
        state    : this.state,
        created  : this.created,
        modified : this.modified,
        players  : this.players.map(function(p) { return p["name"]; }),
        moves    : this.moves,
    };
};

Game.parseMove = function(movetxt)
{
    //  ABC
    // 0    => d6 -> (3,5) vertical
    // 1       6d -> (3,5) horizontal
    var collect,
        exchange_regex = /^exchange(?:[ ]+([a-z_]{1,7}))?$/,
        play_regex = /^(?:([a-o])([1-9]|1[0-5])|([1-9]|1[0-5])([a-o]))[ ]+((?:\([a-z_]+\)|\[[a-z_]+\]|[a-z_]+)+)$/;
    
    if (movetxt == "pass") {
        // pass
        return {
            type: "pass",
            original: movetxt,
        };
    } else if (collect = movetxt.match(exchange_regex)) {
        // exchange, exchange all, exchange se_d
        return {
            type: "exchange",
            what: (collect[1] || "all"),
            original: movetxt,
        };
    } else if (collect = movetxt.match(play_regex)) {
        // 3m scr[a]b(ll)e, c12 [w]o(rd)
        var startat = collect[1] ? {x: collect[1], y: collect[2]} : {x: collect[4], y: collect[3]},
            startat = {x: startat.x.charCodeAt(0) - 97, y: (startat.y - 1)},
            direction = collect[1] ? "vertical" : "horizontal",
            word = collect[5];
        // turn (ab)[xyz] into (a)(b)[x][y][z]
        while (word.match(/\[[a-z_]{2,}\]/i) || word.match(/\([a-z_]{2,}\)/i))
            word = word.replace(/\[([a-z_])(?!\])/gi, "[$1][").replace(/\(([a-z_])(?!\))/gi, "($1)(");
        // turn [x]yz(t) into [x]{y}{z}(t)
        word += "{";
        while (word.match(/[a-z_][\[\(\{]/i))
            word = word.replace(/([a-z_])(?=[\[\(\{])/gi, "{$1}");
        word = word.slice(0, -1);
        // turn "{a}(b)[c]" into ["{a", "(b", "[c"]
        word = word.replace(/[\]\)\}]/g, "").split(/(?=[\(\[\{])/);
        // determine tiles to place
        var varc = (direction == "horizontal") ? "x" : "y",
            invc = (varc == "x") ? "y" : "x",
            dc = function(v) {
                var c = {};
                c[varc] = startat[varc] + v;
                c[invc] = startat[invc];
                return c;
            },
            tiles = word.reduce(function(tiles, seg, i) {
                var tile = dc(i);
                tile.letter = tile.blankletter = seg[1];
                tile.action = (seg[0] == "(" ? "check" : "play");
                if (seg[0] == "[") tile.blankletter = "_";
                tiles.push(tile);
                return tiles;
            }, []);
        return {
            type: "play",
            tiles: tiles,
            original: movetxt,
        };
    } else {
        return false;
    }
};

/**
 * Remove the letters in b from a.
 */
Game.sub = function(a, b) {
    return b.split("").reduce(function(a, v) {
        return a.replace(v, "");
    }, a);
};

/**
 * A simple event system
 */
// Private event/callback table to store listeners
Game.prototype.listeners = {};
// Private method to fire events
Game.prototype.fire = function(event) {
    (this.listeners[event] || []).map(function(callback) {
        callback();
    });
};
// Public subscription interface
Game.prototype.on = Game.prototype.listen = function(event, callback) {
    if (!this.listeners[event])
        this.listeners[event] = [];
    this.listeners[event].push(callback);
};

var distribution = "" +
    "0 [ _2                             ] \n" +
    "1 [ e12 a9 i9 o8 n6 r6 t6 l4 s4 u4 ] \n" +
    "2 [ d4 g3                          ] \n" +
    "3 [ b2 c2 m2 p2                    ] \n" +
    "4 [ f2 h2 v2 w2 y2                 ] \n" +
    "5 [ k1                             ] \n" +
    "8 [ j1 x1                          ] \n" +
    "10[ q1 z1                          ]  ";

var numletters = 100;

var letters = function() {
    return distribution.match(/[a-z_][0-9]+/gi).reduce(function(letters, seg) {
        return letters + (new Array(parseInt(seg.slice(1)) + 1)).join(seg[0]);
    }, "");
};

var letterscore = function(blankletter) {
    var tmp = distribution.replace(/ /g, "")
        .match(new RegExp("([0-9]+)\\[[^"+blankletter+"\[]*"+blankletter));
    return tmp ? tmp[1] : false;
};

var fieldscore = function(p) {
    var tmp = (function(x, y) {
        if (x == 7 && y == 7)
            return [2, 1]; // "start"
        else if (x % 7 == 0 && y % 7 == 0)
            return [3, 1]; // "w-3"
        else if (x % 8 == 3 && y % 7 == 0)
            return [1, 2]; // "l-2"
        else if (y % 8 == 3 && x % 7 == 0)
            return [1, 2]; // "l-2"
        else if (Math.abs(x - 7) == 1 && (y % 10 == 2 || Math.abs(y - 7) == 1))
            return [1, 2]; // "l-2"
        else if (Math.abs(y - 7) == 1 && (x % 10 == 2 || Math.abs(x - 7) == 1))
            return [1, 2]; // "l-2"
        else if ((x == 5 || x == 9) && y % 4 == 1)
            return [1, 3]; // "l-3"
        else if ((y == 5 || y == 9) && x % 4 == 1)
            return [1, 3]; // "l-3"
        else if (x == y || Math.abs(x - 14) == y)
            return [2, 1]; // "w-2"
        else
            return [1, 1];
    })(p.x, p.y);
    
    return {
        word: tmp[0],
        letter: tmp[1],
    };
};

var exports = exports || {};
exports.Game = Game;
exports.letters = letters;
exports.letterscore = letterscore;
exports.distribution = distribution;



UI = {};

/**
 * This state object holds state information meant to augment the game state.
 * - playmode:
 *   - 'null' (default) if not set yet.
 *   - 0, 1, .. indicates the game player that the user is playing.
 *   - 'all' to indicate that the game is being played locally.
 * - numptiles:
 *     The number of permanent tiles in the game. This is an efficient and
 *      easy way to keep track of the tiles in the UI.
 * - history_at:
 *     UI.game.moves.length, last time checked.
 */
UI._state = {
    // "watch"
    playmode: null,
    // for bookkeeping purposes
    numptiles: 0,
    history_at: 1,
};

UI.racktilePlayer = null;
UI.racktileElements = [];

UI.playmode = function(m) {
    UI._state.playmode = m;
    UI._update();
};

/**
 * Initiation.
 */
UI.init = function(id, game) {
    UI.id = id;
    UI.game = game;
    
    // Render player list
    UI.game.players.map(function(p) {
        $("<li>").appendTo("ul#players")
            .append($("<span>").addClass("turn").text("It's"))
            .append(" ")
            .append($("<span>").addClass("name").text(p["name"]))
            .append($("<span>").addClass("turn").text("'s turn!"))
            .append(" ")
            .append($("<span>").addClass("score").text(p.score));
    });
    
    // Generate board
    $("#board").droppable(UI.BOARD_DROP_OPTIONS);
    for (var y = 0; y < 15; y++) {
        for (var x = 0; x < 15; x++) {
            var f = $("<div>")
                .css({
                    top: y * 35 + 3,
                    left: x * 35 + 3,
                })
                .appendTo("#board")
                .addClass("field x-" + x + " y-" + y)
                .addClass(UI.fclass(x, y))
                .data("empty", true)
                .data("pos", {x:x, y:y})
                .droppable(UI.FIELD_DROP_OPTIONS);
        }
    }
    
    $("button").button();
    $("#act-play").click(function() {
        UI.act("play");
        return false;
    });
    $("#act-exchange").click(function() {
        UI.act("exchange");
        return false;
    });
    $("#act-pass").click(function() {
        UI.act("pass");
        return false;
    });
    
    // Initial UI update
    UI._update();
    UI.game.on("move", function() {
        UI._update();
    });
    
    UI.game.players.map(function(p, i) {
        $("<option>").attr("value", i).text(p["name"]).appendTo("#choose-playmode select");
    });
    $("#choose-playmode").dialog({
        closeOnEscape: false,
        autoOpen: true,
        modal: true,
        buttons: {
            "Start playing!": function() {
                $(this).dialog("close");
            },
        },
        beforeClose: function() {
            UI.playmode($(this).find("select").val());
        },
    });
    
    // Check for updates
    UI._checksync();
};

/**
 * Actions
 */
UI.playError = function(errors) {
    this.errors = (typeof errors == "string") ? [errors] : errors;
};
UI.act = function(action) {
    try {
        var pm = UI._state.playmode;
        if (pm == "all" || pm != null && UI.game.activeplayer == pm) {
            UI[action]();
        } else {
            throw new UI.playError("It is not your turn! Please wait until the other player has completer his or her turn.");
        }
    } catch(e) {
        if (e instanceof UI.playError) {
            var ul = $("<p>")
                .html(e.errors.join("<br /><br />"))
                .attr("title", "Error!")
                .dialog({
                    closeOnEscape: true,
                    autoOpen: true,
                    modal: true,
                });
        } else {
            throw e;
        }
    }
};
UI.exchange = function() {
    if (UI.racktilePlayer == null)
        throw new UI.playError("You aren't playing anybody!");
    
    var rack = UI.racktileElements.map(function(el) {
        return el.data("blankletter");
    }).join("");
    $("#choose-exchange-tiles input:first").val(rack);
    $("#choose-exchange-tiles").dialog({
        closeOnEscape: true,
        autoOpen: true,
        modal: true,
        buttons: {
            "Exchange tiles!": function() {
                var letters = $(this).find("input:first").val(),
                    move = "exchange "+letters;
                if (!UI.game.play(move)) {
                    $(this).dialog("close");
                    throw new UI.playError(UI.game.errors);
                }
                $.post(window.home+"/game/"+UI.id, {
                    move: UI.game.moves.slice(-1)[0]
                })
                    .error(function(xhr) {
                        if (xhr.status == 400) {
                            throw new UI.playError(JSON.parse(xhr.responseText).errors);
                        } else {
                            throw new UI.playError("Weird-ass server error..!?");
                        }
                    });
                var pm = UI._state.playmode;
                UI.playmode(null);
                UI.playmode(pm);
                $(this).dialog("close");
            },
        },
    });
};
UI.pass = function() {
    if (!UI.game.play("pass"))
        throw new UI.playError(UI.game.errors);
    
    $.post(window.home+"/game/"+UI.id, {
        move: UI.game.moves.slice(-1)[0]
    })
        .error(function(xhr) {
            if (xhr.status == 400) {
                throw new UI.playError(JSON.parse(xhr.responseText).errors);
            } else {
                throw new UI.playError("Weird-ass server error..!?");
            }
        });
};
UI.play = function() {
    var tiles = UI.racktileElements.map(function(el) {
        return el.data("pos") ? {
            x: el.data("pos").x,
            y: el.data("pos").y,
            letter: el.data("letter"),
            blankletter: el.data("letter"),
        } : null;
    }).filter(function(t) {
        return !(t == null);
    });
    
    if (tiles.length == 0) 
        throw new UI.playError("You haven't placed any tiles on the board!");
    
    // We're going to try to determine variable and invariable coord:
    //  horizontal or vertical?
    var varc = null,
        invc = null;
    if (tiles.length == 1) {
        // --> If there is only one tile, then we find a neighbour
        //      to determine it. (At least one neighbour MUST exist, otherwise
        //      the move would be invalid anyway..)
        var neighbours = [
            // name, position, varc, invc
            ["top", {x: tiles[0].x, y: tiles[0].y - 1}, "y", "x"],
            ["right", {x: tiles[0].x + 1, y: tiles[0].y}, "x", "y"],
            ["bottom", {x: tiles[0].x, y: tiles[0].y + 1}, "y", "x"],
            ["left", {x: tiles[0].x - 1, y: tiles[0].y}, "x", "y"],
        ];
        for (var i = 0; i < 4; i++) {
            var p = neighbours[i][1];
            if (p.x < 0 || p.x > 14 || p.y < 0 || p.y > 14)
                continue;
            if (UI.game.board[p.y][p.x]) {
                varc = neighbours[i][2];
                invc = neighbours[i][3];
                break;
            }
        }
        if (!varc) {
            // We did not find any neighbour --> the move is invalid
            if (UI.game.board.empty) {
                throw new UI.playError("The first word of the game must contain at least 2 letters!");
            } else {
                throw new UI.playError("The word must be connected with previous words!");
            }
        }
    } else {
        if (tiles.reduce(function(horizontal, t) {
            return horizontal && t.y == tiles[0].y;
        }, true) == true) {
            // horizontal
            varc = "x";
            invc = "y";
        } else if (tiles.reduce(function(vertical, t) {
            return vertical && t.x == tiles[0].x;
        }, true) == true) {
            // vertical
            varc = "y";
            invc = "x";
        } else {
            throw new UI.playError("Word must be either horizontal or vertical!");
        }
        tiles.sort(function(a, b) {
            return a[varc] > b[varc];
        });
    }
    
    if (!tiles.reduce(function(all_connected, t, i) {
        if (i == 0) return true;
        if (t[varc] - 1 == tiles[i-1][varc]) return true;
        for (var j = tiles[i-1][varc] + 1; j < t[varc]; j++) {
            var p = {};
            p[varc] = j;
            p[invc] = tiles[0][invc];
            if (!UI.game.board[p.y][p.x]) return false;
        }
        return true;
    })) {
        throw new UI.playError("All placed tiles must be connected!");
    }
    
    // Construct move sentence
    var makep = function(j) {
        var p = {};
        p[varc] = j;
        p[invc] = tiles[0][invc];
        return p;
    };
    var startpos = {
        x: tiles[0].x,
        y: tiles[0].y
    };
    var move = tiles.reduce(function(move, t, i) {
        if (t.blankletter == "_") {
            // TODO
            t.letter = window.prompt("What letter would you like to substitute the blank tile with?");
        }
        t.seg = t.blankletter == "_" ? "["+t.letter+"]" : t.letter;
        if (i == 0) {
            // First, find all permanent tiles right before this one, if applicable
            // Very cryptic, but it works!
            var prepend = "";
            for (var p, j = tiles[i][varc] - 1; (p = makep(j)) && p.x >= 0 && p.y >= 0 && UI.game.board[p.y][p.x]; j--) {
                prepend = UI.game.board[p.y][p.x].letter + prepend;
            };
            startpos[varc] -= prepend.length;
            move += (prepend.length > 0) ? "(" + prepend + ")" + t.seg : t.seg;
        } else {
            if (t[varc] - 1 > tiles[i-1][varc]) {
                for (var j = tiles[i-1][varc] + 1; j < t[varc]; j++) {
                    var p = {};
                    p[varc] = j;
                    p[invc] = tiles[0][invc];
                    move += "(" + UI.game.board[p.y][p.x].letter + ")";
                }
            }
            move += t.seg;
        }
        
        if (i == tiles.length - 1) {
            for (var p, j = tiles[i][varc] + 1; (p = makep(j)) && p.x < 15 && p.y < 15 && UI.game.board[p.y][p.x]; j++) {
                move += "(" + UI.game.board[p.y][p.x].letter + ")";
            };
        }
        
        return move;
    }, "");
    
    var move = move.replace(/\)\(/g, "")
                   .replace(/\]\[/g, "");
    
    var human_coordinates = {
        y: (startpos.y + 1).toString(),
        x: String.fromCharCode(startpos.x + 97),
    };
    var move = human_coordinates[invc] + human_coordinates[varc] + " " + move;
    
    console.log(move);
    
    if (!UI.game.play(move)) {
        throw new UI.playError(UI.game.errors);
    }
    
    $.post(window.home+"/game/"+UI.id, {
        move: UI.game.moves.slice(-1)[0]
    })
        .error(function(xhr) {
            if (xhr.status == 400) {
                throw new UI.playError(JSON.parse(xhr.responseText).errors);
            } else {
                throw new UI.playError("Weird-ass server error..!?");
            }
        })
        .success(function() {
            // Remove .tile elements used for playing from the UI
            UI.racktileElements = UI.racktileElements.reduce(function(elements, el) {
                if (el.data("pos"))
                    el.remove();
                else
                    elements.push(el);
                return elements;
            }, []);
            UI._update();
        });
};

/**
 * UI update
 */
UI._update = function() {
    // Check for a change of play mode
    var playmode = UI._state.playmode;
    var racktilePlayer = (playmode == "all") ? UI.game.activeplayer : playmode;
    if (UI.racktilePlayer != racktilePlayer) {
        // --> Rack tile player changed, meaning that we either switched
        //      from player A to B, or from A to NULL, or from NULL to B
        //     Either way, we have to remove all rack tiles listed currently,
        //      whether or not this list is empty.
        UI.racktileElements.map(function(el) {
            el.remove();
        });
        UI.racktileElements = [];
        if (racktilePlayer != null) {
            // --> we switch from NULL or displaying the rack tiles of player A
            //      to displaying the rack tiles of player B
            UI.game.players[racktilePlayer].rack.split("").map(function(blankletter, i) {
                UI.makeRacktileElement(blankletter);
            });
        }
        UI.racktilePlayer = racktilePlayer;
    } else if (UI.racktilePlayer != null && UI.racktileElements.length < UI.game.players[UI.racktilePlayer].rack.length) {
        // --> The rack tile player did not change, but we did remove some
        //      of his/her rack .tile elements after the previous play
        UI.game.players[UI.racktilePlayer].rack.slice(UI.racktileElements.length).split("").map(function(blankletter, i) {
            UI.makeRacktileElement(blankletter);
        });
    }
    // Play mode indication
    var playing = "";
    if (UI._state.playmode == "all")
        playing = (UI.game.players.length == 2 ? "both" : "all") + " players";
    else if (UI._state.playmode == null)
        playing = "nobody, please refresh the window to change this";
    else
        playing = UI.game.players[UI._state.playmode]["name"];
    var turnind = (UI._state.playmode == UI.game.activeplayer || UI._state.playmode == "all") ?
        ". It's your turn!" : "";
    $("#playing").text(playing + turnind);
    // Check for new tiles
    if (UI._state.numptiles < UI.game.tiles.permanent.length) {
        UI.game.tiles.permanent.slice(UI._state.numptiles).map(function(t) {
            UI.addtile(t);
        });
        UI._state.numptiles = UI.game.tiles.permanent.length;
    }
    // Update player scores and active player indication
    UI.game.players.map(function(p, i) {
        $("#players li:eq("+i+")")
            .find(".score").text(p.score).end()
            .find(".turn").css("display", p.active ? "inline" : "none").end();
    });
    // Update move history presentation
    if (UI._state.history_at < UI.game.moves.length) {
        UI.game.moves.slice(UI._state.history_at).map(function(move) {
            var datetime = new Date(parseInt(move.match(/^([0-9]+)/)[1]))
                    .format("ddd, mmm dS, h:MM TT"),
                txt = move
                    .replace(/^[0-9]+:[ ]*/, "")
                    .replace(/[ ]*--[a-z_ ]*$/i, "")
                    .toUpperCase();
            $("<li>")
                .append('<span class="datetime">'+datetime+'</span>')
                .append('<span class="move">'+txt+'</span>')
                //.appendTo("#history ul");
        });
        UI._state.history_at = UI.game.moves.length;
    }
};

/**
 * Synchronisation
 */
UI.SYNC_CHECK_INTERVAL = 1000;
UI._checksync = function() {
    $.get(window.home+"/game/"+UI.id+".modified")
        .success(function(modified) {
            if (parseInt(modified) > UI.game.modified) {
                UI._sync(function() {
                    setTimeout(UI._checksync, UI.SYNC_CHECK_INTERVAL);
                });
            } else {
                setTimeout(UI._checksync, UI.SYNC_CHECK_INTERVAL);
            }
        })
        .error(function() {
            console.log("$.get ERROR!");
        });
};
UI._sync = function(callback) {
    $.getJSON(window.home+"/game/"+UI.id+".json")
        .success(function(g) {
            g.moves.filter(function(move) {
                return parseInt(move.match(/^([0-9]+)/)[1]) > UI.game.modified;
            }).map(function(move) {
                UI.game.play(move);
            });
            UI._update();
            if (callback)
                callback();
        })
        .error(function() {
            console.log("$.getJSON ERROR!");
        });
};

/**
 * Static options
 */
UI.TILE_DRAG_OPTIONS = {
    start: function(event, ui) {
        if ($(this).data("field")) {
            $(this).data("field").data("empty", true);
        }
        $(this).data("pos", null);
        $(this).data("field", null);
        var zindex = parseInt($(this).css("z-index"));
        UI.racktileElements.map(function(tile, i) {
            if ($(tile).css("z-index") > zindex) {
                $(tile).css("z-index", $(tile).css("z-index") - 1);
            }
        });
        $(this).css("z-index", 806).data("initpos", $(this).position());
    },
};
UI.FIELD_DROP_OPTIONS = {
    greedy: true,
    over: function(event, ui) {
        if ($(this).data("empty"))
            $(this).addClass("h");
    },
    out: function(event, ui) {
        $(this).removeClass("h");
    },
    drop: function(event, ui) {
        if ($(this).data("empty")) {
            var o = $(this).position();
            ui.helper.detach().appendTo("#board").css(o).data("pos", {
                x: $(this).data("pos").x,
                y: $(this).data("pos").y,
            });
            $(this).data("empty", false);
            ui.helper.data("field", $(this));
        } else {
            ui.helper.css(ui.helper.data("initpos"));
        }
    },
};
UI.BOARD_DROP_OPTIONS = {
    drop: function(event, ui) {
        ui.helper.css(ui.helper.data("initpos"));
    },
};

/**
 * Helper functions
 */
UI.mtile = function(t) {
    return $("<div>").addClass("tile")
        .append(t.letter)
        .append($("<span>").addClass("score").text(letterscore(t.blankletter)))
        .addClass(t.blankletter == "_" ? "blank" : "")
        .addClass(t.type)
        .data("letter", t.letter)
        .data("blankletter", t.blankletter);
};
UI.fclass = function(x, y) {
    if (x == 7 && y == 7)
        return "start";
    if (x % 7 == 0 && y % 7 == 0)
        return "w-3";
    if (x % 8 == 3 && y % 7 == 0)
        return "l-2";
    if (y % 8 == 3 && x % 7 == 0)
        return "l-2";
    if (Math.abs(x - 7) == 1 && (y % 10 == 2 || Math.abs(y - 7) == 1))
        return "l-2";
    if (Math.abs(y - 7) == 1 && (x % 10 == 2 || Math.abs(x - 7) == 1))
        return "l-2";
    if ((x == 5 || x == 9) && y % 4 == 1)
        return "l-3";
    if ((y == 5 || y == 9) && x % 4 == 1)
        return "l-3";
    if (x == y || Math.abs(x - 14) == y)
        return "w-2";
};
UI.makeRacktileElement = function(blankletter) {
    var el = UI.mtile({
            type: "racktile",
            blankletter: blankletter,
            letter: blankletter,
        }).appendTo("body")
          .css("z-index", 800)
          .data("pos", null)
          .draggable(UI.TILE_DRAG_OPTIONS);
    var blockpos = function(i) {
        var b = {
            top: 20 + Math.floor(i / 2) * 50 + (i % 2) * 20,
            left: 560 + (i % 2) * 50,
        };
        b.bottom = b.top + 50;
        b.right = b.left + 50;
        return b;
    };
    // If there are max. 7 rack tile elements, then at least one of
    //  8 blocks must be empty.
    for (var i = 0; i < 8; i++) {
        var block = blockpos(i);
        var block_taken = UI.racktileElements.reduce(function(block_taken, other) {
            var p = other.position();
            return block_taken || (
                p.left >= block.left && p.left <= block.right &&
                p.top >= block.top && p.top <= block.bottom
            );
        }, false);
        if (!block_taken) {
            el.css({
                "top": block.top + Math.floor(Math.random() * 15),
                "left": block.left + Math.floor(Math.random() * 15),
            });
            break;
        }
    }
    UI.racktileElements.push(el);
};

// Add the given tile (t.x, t.y, t.letter, t.blankletter, t.type) to the board
UI.addtile = function(t) {
    $("#board .field.x-"+t.x+".y-"+t.y).data("empty", false).append(UI.mtile(t));
};
// Remove tile at given position (p.x, p.y) from the board
UI.removetile = function(p) {
    $("#board .field.x-"+p.x+".y-"+p.y).data("empty", true).find(".tile").remove();
};


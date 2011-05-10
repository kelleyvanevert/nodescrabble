
var Game = require("scrabble").Game,
    stdin = process.openStdin();

var g;

var show = function() {
    console.log("| Players: "+g.players.map(function(p, i) {
        var str = p["name"] + " ("+p.score+") ["+p.rack+"]";
        if (g.activeplayer == i) {
            str = "--> " + str + " <--";
        }
        return str;
    }).join(", "));
    console.log("|    a b c d e f g h i j k l m n o");
    var history = g.moves;
    for (var y = 0; y < 15 || y < history.length; y++) {
        console.log("| " + (y < 9 ? " " : "") + (y+1) + g.board[y].map(function(t) {
            if (t) {
                return " " + t.letter;
            } else {
                return "  ";
            }
        }).join("") + (history[y] ? "  * " + history[y] : ""));
    }
};

stdin.on("data", function(chunk) {
    var txt = chunk.toString().slice(0, -1);
    if (txt == "exit") {
        console.log("-- Bye!");
        process.exit();
    } else if (txt == "show") {
        show();
    } else if (txt.match(/^json$/i)) {
        console.log(JSON.stringify(g.getJSON()));
    } else if (txt.match(/^newgame/i)) {
        if (txt[8] == "{") {
            g = new Game(JSON.parse(txt.slice(8)));
        } else {
            var players = txt.slice(8).split(",").map(function(v) {
                return v.trim();
            });
            g = new Game(players);
        }
        show();
        console.log("-- Okay!");
    } else if (txt.match(/^play/i)) {
        var move = txt.slice(5);
        if (g.play(move)) {
            show();
            console.log("-- Success playing: [" + g.moves.slice(-1)[0] + "], score: "+g.scalc);
        } else {
            show();
            console.log("-- Error(s):\n" + g.errors.join("\n"));
        }
    }
});


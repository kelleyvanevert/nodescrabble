
var express = require("express"),
    app = express.createServer(),
    fs = require("fs"),
    scrabble = require("scrabble");

app.configure(function() {
    //app.set("home", "http://localhost:3000/");
    app.set("view engine", "ejs");
    app.set("view options", {
        "title": "Scrabble!",
    });
    app.use(express.static(__dirname + "/public"));
    app.use(express.bodyParser());
});

app.post("/game", function(req, res) {
    var players = req.body.players;
    if (!players) {
        res.send("Player names not given!\n", 404);
    } else {
        // Parse player names
        players = players.toString().split(",").map(function(p) {
            return p.replace(/[^a-z ]/gi, "").trim();
        });
        
        // Generate a unique id
        var letters = "qwertyuiopasdfghjklzxcvbnm1234567890";
        var gameid = "";
        for (var i = 0; i < 20; i++)
            gameid += letters[Math.floor(Math.random() * 36)];
        
        // Create and save game.
        var game = new scrabble.Game(players);
        var rawdata = JSON.stringify(game.getJSON());
        fs.writeFile(__dirname + "/gamedata/" + gameid + ".json", rawdata, "utf8", function(err) {
            if (err)
                res.send("Server error!\n", 500);
            else
                res.send(gameid + "\n");
        });
    }
});
app.get(/^\/game\/([a-z0-9]+)(?:\.(json|modified))?$/i, function(req, res) {
    fs.readFile(__dirname + "/gamedata/" + req.params[0] + ".json", "utf8", function(err, rawdata) {
        if (err)
            res.send("Game does not exist!\n", 404);
        if (req.params[1] == "json")
            res.send(rawdata, {"Content-Type": "application/json"});
        else if (req.params[1] == "modified")
            res.send(JSON.parse(rawdata).modified.toString());
        else
            res.render("game", {
                page: "game",
                gameid: req.params[0],
                gamedata: JSON.parse(rawdata),
            });
    });
});
app.post(/^\/game\/([a-z0-9]+)$/i, function(req, res) {
    var move = req.body.move;
    if (!move) {
        res.send("Move sentence not given!\n", 404);
    } else {
        fs.readFile(__dirname + "/gamedata/" + req.params[0] + ".json", "utf8", function(err, rawdata) {
            if (err)
                res.send("Game does not exist!\n", 404);
            var gameid = req.params[0],
                game = new scrabble.Game(JSON.parse(rawdata));
            if (game.play(move)) {
                fs.writeFile(__dirname + "/gamedata/" + gameid + ".json", JSON.stringify(game.getJSON()), "utf8", function(err) {
                    if (err)
                        res.send("Server error!\n", 500);
                    else
                        res.send(JSON.stringify({
                            "result": "success",
                        }), {"Content-Type": "application/json"});
                });
            } else {
                res.send(JSON.stringify({
                    "result": "error",
                    "errors": game.errors,
                }), {"Content-Type": "application/json"}, 400);
            }
        });
    }
});
app.get("/", function(req, res) {
    res.render("index", {page: "index"});
});

app.listen(3000);


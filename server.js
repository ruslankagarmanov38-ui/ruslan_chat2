const express = require('express');
const app = express();
const http = require('http').createServer(app);
const cors = require('cors');
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

app.use(express.static('public'));
app.use(cors());

let queue = [];
let partners = {};
let online = 0;

io.on("connection", socket => {
    online++;
    io.emit("online", online);

    socket.on("find", data => {
        socket.my = data;

        let partner = queue.find(u =>
            u.my.gender !== undefined &&
            u.my.search !== undefined &&
            compatible(u.my, data)
        );

        if (partner) {
            queue = queue.filter(u => u !== partner);
            partners[socket.id] = partner;
            partners[partner.id] = socket;

            socket.emit("found");
            partner.emit("found");
        } else {
            queue.push(socket);
        }
    });

    socket.on("typing", () => {
        let p = partners[socket.id];
        if (p) p.emit("typing");
    });

    socket.on("msg", txt => {
        let p = partners[socket.id];
        if (p) p.emit("msg", txt);
    });

    socket.on("stop", () => endChat(socket));

    socket.on("disconnect", () => {
        endChat(socket);
        online--;
        io.emit("online", online);
    });
});

function compatible(a, b) {
    if (b.search === "Ищу любой") return true;
    if (b.search === "Ищу мужчину" && a.gender === "Мужчина") return true;
    if (b.search === "Ищу женщину" && a.gender === "Женщина") return true;
    return false;
}

function endChat(s) {
    if (queue.includes(s))
        queue = queue.filter(u => u !== s);

    let p = partners[s.id];
    if (!p) return;

    p.emit("end");

    delete partners[p.id];
    delete partners[s.id];
}

http.listen(8080, () => console.log("SERVER OK"));

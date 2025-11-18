const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('.'));

let queue = [];
let users = new Map();
let online = 0;

io.on("connection", (socket) => {

    online++;
    io.emit("online_count", online);

    socket.on("join_queue", data => {
        users.set(socket.id, data);
        queue.push(socket);
        findPair();
    });

    socket.on("leave_queue", () => {
        queue = queue.filter(s => s !== socket);
        users.delete(socket.id);
    });

    socket.on("typing", ({ roomId }) => {
        socket.to(roomId).emit("partner_typing");
    });

    socket.on("message", ({ roomId, text }) => {
        io.to(roomId).emit("message", { text, from: socket.id });
    });

    socket.on("end", ({ roomId }) => {
        socket.to(roomId).emit("ended");
    });

    socket.on("disconnect", () => {
        online--;
        io.emit("online_count", online);

        queue = queue.filter(s => s !== socket);
        io.emit("force_end_from_disconnect", socket.id);
        users.delete(socket.id);
    });
});

function match(a, b) {
    const A = users.get(a.id);
    const B = users.get(b.id);

    if (!A || !B) return false;

    const okA = (A.seekingGender === "a" || A.seekingGender === B.myGender);
    const okB = (B.seekingGender === "a" || B.seekingGender === A.myGender);

    return okA && okB;
}

function findPair() {
    if (queue.length < 2) return;

    for (let i = 0; i < queue.length; i++) {
        for (let j = i + 1; j < queue.length; j++) {

            if (match(queue[i], queue[j])) {

                const room = "room_" + Math.random();

                queue[i].join(room);
                queue[j].join(room);

                queue[i].emit("matched", { roomId: room });
                queue[j].emit("matched", { roomId: room });

                queue.splice(j, 1);
                queue.splice(i, 1);

                return;
            }
        }
    }
}

const PORT = process.env.PORT || 8080;
http.listen(PORT, () => console.log("Server started on", PORT));

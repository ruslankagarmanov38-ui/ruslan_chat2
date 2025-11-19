// server.js
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

app.use(express.static("public")); // положи index.html в public/

let queue = [];
let partners = {};
let online = 0;

io.on("connection", socket => {
    online++;
    io.emit("online_count", online);

    // клиенты отправляют prefs: { gender, searchfor, chatCount }
    socket.on("find", (prefs) => {
        socket.prefs = prefs || {};

        // если уже в паре — игнор
        if (partners[socket.id]) return;

        // простая очередь FIFO — берем первого в очереди
        if (queue.length > 0) {
            const partnerId = queue.shift();

            // защита: не матчиться с самим собой (на всякий)
            if (partnerId === socket.id) {
                // если вдруг попали сами — попробуем следующего
                if (queue.length > 0) {
                    const next = queue.shift();
                    if (next) {
                        partners[socket.id] = next;
                        partners[next] = socket.id;

                        // отправляем каждому chat_start и partner's chatCount
                        const partnerPrefs = io.sockets.sockets.get(next).prefs || {};
                        const myPrefs = socket.prefs || {};

                        io.to(socket.id).emit("chat_start", { partnerChatCount: partnerPrefs.chatCount || 0 });
                        io.to(next).emit("chat_start", { partnerChatCount: myPrefs.chatCount || 0 });
                    } else {
                        queue.push(socket.id);
                    }
                } else {
                    queue.push(socket.id);
                }
            } else {
                partners[socket.id] = partnerId;
                partners[partnerId] = socket.id;

                const partnerPrefs = io.sockets.sockets.get(partnerId).prefs || {};
                const myPrefs = socket.prefs || {};

                io.to(socket.id).emit("chat_start", { partnerChatCount: partnerPrefs.chatCount || 0 });
                io.to(partnerId).emit("chat_start", { partnerChatCount: myPrefs.chatCount || 0 });
            }
        } else {
            // добавить в очередь
            queue.push(socket.id);
            io.to(socket.id).emit("searching");
        }
    });

    socket.on("cancel_search", () => {
        queue = queue.filter(id => id !== socket.id);
    });

    socket.on("msg", text => {
        const p = partners[socket.id];
        if (p) io.to(p).emit("msg", text);
    });

    // реакции: просто пересылаем партнёру
    socket.on("reaction", data => {
        const p = partners[socket.id];
        if (p) io.to(p).emit("reaction", data);
    });

    socket.on("typing", () => {
        const p = partners[socket.id];
        if (p) io.to(p).emit("typing");
    });

    // завершение чата
    socket.on("end", () => {
        const p = partners[socket.id];
        if (p) {
            io.to(p).emit("chat_end");
            delete partners[p];
        }
        delete partners[socket.id];
    });

    socket.on("disconnect", () => {
        online--;
        io.emit("online_count", online);

        const p = partners[socket.id];
        if (p) {
            io.to(p).emit("chat_end");
            delete partners[p];
        }
        delete partners[socket.id];

        queue = queue.filter(id => id !== socket.id);
    });
});

http.listen(process.env.PORT || 3000, () => {
    console.log("Server started on port", process.env.PORT || 3000);
});

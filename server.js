const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
    cors: { origin: "*" }
});

app.use(express.static("public")); // index.html находится в /public

// ===============================
// ПАМЯТЬ
// ===============================
let waiting = []; // очередь
let partners = {}; // {socketId: партнёр}
let chatData = {}; // {socketId: {partner: id, chatCount: number}}

// ===============================
// ПОЛУЧИТЬ ПАРТНЁРА
// ===============================
function getPartner(id) {
    return partners[id];
}

// ===============================
// РАЗЪЕДИНИТЬ
// ===============================
function disconnectPair(id) {
    const p = partners[id];
    if (p) {
        partners[p] = null;
        delete partners[p];
    }
    partners[id] = null;
    delete partners[id];
}

// ===============================
// НАЧАЛО
// ===============================
io.on("connection", socket => {

    /* передаём количество онлайн */
    io.emit("online_count", io.engine.clientsCount);

    console.log("User connected:", socket.id);

    /* Когда пользователь ищет собеседника */
    socket.on("find", data => {
        let userChatCount = data.chatCount || 0;

        // Если кто-то ожидает — соединяем
        if (waiting.length > 0) {
            const partner = waiting.shift();

            partners[socket.id] = partner;
            partners[partner] = socket.id;

            // сохраняем данные
            chatData[socket.id] = { partner, chatCount: userChatCount };
            chatData[partner] = { partner: socket.id, chatCount: chatData[partner].chatCount };

            // отправляем старт чата
            socket.emit("chat_start", {
                partnerChatCount: chatData[partner].chatCount
            });

            io.to(partner).emit("chat_start", {
                partnerChatCount: userChatCount
            });

        } else {
            // добавляем в очередь
            waiting.push(socket.id);
            chatData[socket.id] = { partner: null, chatCount: userChatCount };
        }
    });

    /* Отмена поиска */
    socket.on("cancel_search", () => {
        waiting = waiting.filter(id => id !== socket.id);
    });

    /* Сообщение */
    socket.on("msg", txt => {
        const partner = getPartner(socket.id);
        if (partner) io.to(partner).emit("msg", txt);
    });

    /* Печатает */
    socket.on("typing", () => {
        const partner = getPartner(socket.id);
        if (partner) io.to(partner).emit("typing");
    });

    /* Реакция */
    socket.on("reaction", data => {
        const partner = getPartner(socket.id);
        if (!partner) return;
        io.to(partner).emit("reaction", data);
    });

    /* Завершить чат */
    socket.on("end", () => {
        const partner = getPartner(socket.id);

        if (partner) {
            io.to(partner).emit("chat_end");
        }

        // удаляем из очереди если есть
        waiting = waiting.filter(id => id !== socket.id);

        disconnectPair(socket.id);
    });

    /* Отключение */
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        waiting = waiting.filter(id => id !== socket.id);

        const partner = getPartner(socket.id);
        if (partner) {
            io.to(partner).emit("chat_end");
            disconnectPair(socket.id);
        }

        io.emit("online_count", io.engine.clientsCount);
    });
});

// ===============================
// SERVER START
// ===============================
const PORT = process.env.PORT || 8080;
http.listen(PORT, () => {
    console.log("================================");
    console.log("🚀 Сервер запущен на порту:", PORT);
    console.log("🌍 Локальный адрес: http://localhost:" + PORT);
    console.log("================================");
});


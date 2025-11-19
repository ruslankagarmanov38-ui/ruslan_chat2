const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
    cors: { origin: "*" }
});

app.use(express.static("public")); // index.html в папке public

// ===============================
// ПАМЯТЬ
// ===============================
let waiting = [];        // очередь
let partners = {};       // socketId → partnerId
let chatData = {};       // socketId → { partner, chatCount }

// ===============================
// Получить партнера
// ===============================
function getPartner(id) {
    return partners[id] || null;
}

// ===============================
// Разъединить пару
// ===============================
function disconnectPair(id) {
    const p = partners[id];
    if (p) delete partners[p];
    delete partners[id];
}

// ===============================
// MAIN SOCKET LOGIC
// ===============================
io.on("connection", socket => {

    io.emit("online_count", io.engine.clientsCount);
    console.log("User connected:", socket.id);

    // ========== ПОИСК ==========
    socket.on("find", data => {
        const userCount = data.chatCount || 0;

        if (waiting.length > 0) {
            const partner = waiting.shift();

            partners[socket.id] = partner;
            partners[partner] = socket.id;

            chatData[socket.id] = { partner, chatCount: userCount };
            chatData[partner] = { partner: socket.id, chatCount: chatData[partner].chatCount || 0 };

            socket.emit("chat_start", {
                partnerChatCount: chatData[partner].chatCount
            });

            io.to(partner).emit("chat_start", {
                partnerChatCount: userCount
            });

        } else {
            waiting.push(socket.id);
            chatData[socket.id] = { partner: null, chatCount: userCount };
        }
    });

    // ========== ОТМЕНА ПОИСКА ==========
    socket.on("cancel_search", () => {
        waiting = waiting.filter(id => id !== socket.id);
    });

    // ========== ТЕКСТОВЫЕ СООБЩЕНИЯ ==========
    socket.on("msg", txt => {
        const partner = getPartner(socket.id);
        if (partner) io.to(partner).emit("msg", txt);
    });

    // ========== ПЕЧАТАЕТ ==========
    socket.on("typing", () => {
        const partner = getPartner(socket.id);
        if (partner) io.to(partner).emit("typing");
    });

    // ========== РЕАКЦИИ ==========
    socket.on("reaction", data => {
        const partner = getPartner(socket.id);
        if (partner) io.to(partner).emit("reaction", data);
    });

    // ======================================
    // 🔊 ГОЛОСОВЫЕ СООБЩЕНИЯ
    // ======================================
    socket.on("voice", blob => {
        const partner = getPartner(socket.id);
        if (partner) {
            io.to(partner).emit("voice", blob);
        }
    });

    // ========== ЗАВЕРШЕНИЕ ЧАТА ==========
    socket.on("end", () => {
        const partner = getPartner(socket.id);

        if (partner) {
            io.to(partner).emit("chat_end");
            disconnectPair(socket.id);
        }

        socket.emit("chat_end");
    });

    // ========== ОТКЛЮЧЕНИЕ ==========
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
// START SERVER
// ===============================
const PORT = process.env.PORT || 8080;
http.listen(PORT, () => {
    console.log("================================");
    console.log("🚀 Сервер запущен на порту:", PORT);
    console.log("🌍 Локальный адрес: http://localhost:" + PORT);
    console.log("================================");
});

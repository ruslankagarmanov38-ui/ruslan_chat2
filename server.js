const express = require("express");
const app = express();
const http = require("http").createServer(app);

const io = require("socket.io")(http, {
    cors: { origin: "*" }
});

app.use(express.static("public")); // index.html лежит в /public

// ===============================
// ДАННЫЕ
// ===============================
let waiting = [];        // очередь пользователей
let partners = {};       // socket.id → partner.id

// ===============================
// Получить партнера
// ===============================
function getPartner(id) {
    return partners[id] || null;
}

// ===============================
// Разорвать связь
// ===============================
function unlink(id) {
    const p = partners[id];

    if (p) {
        delete partners[p];
    }
    delete partners[id];
}

// ===============================
// ЛОГИКА SOCKET.IO
// ===============================
io.on("connection", socket => {

    io.emit("online", io.engine.clientsCount);

    console.log("🟢 Подключился:", socket.id);

    // ====== ПОИСК ======
    socket.on("find", data => {

        // Если кто-то уже ждёт — соединяем
        if (waiting.length > 0) {

            const partner = waiting.shift();

            partners[socket.id] = partner;
            partners[partner] = socket.id;

            // Отправляем обоим, что чат найден
            socket.emit("found");
            io.to(partner).emit("found");

        } else {

            // Иначе — ставим в очередь
            waiting.push(socket.id);
        }
    });

    // ====== ОТМЕНА ПОИСКА ======
    socket.on("stop", () => {
        waiting = waiting.filter(id => id !== socket.id);
    });

    // ====== СООБЩЕНИЯ ======
    socket.on("msg", txt => {
        const p = getPartner(socket.id);
        if (p) io.to(p).emit("msg", txt);
    });

    // ====== ПЕЧАТАЕТ ======
    socket.on("typing", () => {
        const p = getPartner(socket.id);
        if (p) io.to(p).emit("typing");
    });

    // ====== ЗАВЕРШИТЬ ЧАТ ======
    socket.on("end", () => {
        const p = getPartner(socket.id);

        if (p) {
            io.to(p).emit("end");
            unlink(socket.id);
        }

        socket.emit("end");
    });

    // ====== ОТКЛЮЧЕНИЕ ======
    socket.on("disconnect", () => {

        console.log("🔴 Отключился:", socket.id);

        // убрать из очереди
        waiting = waiting.filter(id => id !== socket.id);

        // если был партнёр — уведомить
        const p = getPartner(socket.id);
        if (p) {
            io.to(p).emit("end");
            unlink(socket.id);
        }

        io.emit("online", io.engine.clientsCount);
    });
});

// ===============================
// СТАРТ СЕРВЕРА
// ===============================
const PORT = process.env.PORT || 8080;
http.listen(PORT, () => {
    console.log("================================");
    console.log("🚀 Сервер запущен на порту:", PORT);
    console.log("🌍 http://localhost:" + PORT);
    console.log("================================");
});

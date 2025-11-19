const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
    cors: { origin: "*" }
});

app.use(express.static(__dirname + "/public"));

let queue = [];            // очередь на поиск
let pairs = {};            // socket.id -> partnerId
let userData = {};         // данные пользователей (пол + статус)


// ----------- ПОЛЬЗОВАТЕЛЬ ПОДКЛЮЧЕН -------------
io.on("connection", socket => {

    // обновить количество онлайн
    io.emit("online_count", io.engine.clientsCount);


    // ---------- Поиск собеседника ----------
    socket.on("find", data => {
        userData[socket.id] = {
            gender: data.gender,
            searchfor: data.searchfor,
            chatCount: data.chatCount || 0
        };

        // если очередь пуста — добавляем
        if (queue.length === 0) {
            queue.push(socket.id);
            return;
        }

        // иначе пробуем найти пару
        let partnerId = queue.shift();

        if (!partnerId || partnerId === socket.id) return;

        // связываем
        pairs[socket.id] = partnerId;
        pairs[partnerId] = socket.id;

        let myData = userData[socket.id];
        let partnerData = userData[partnerId];

        // отправляем обоим "начало чата"
        io.to(socket.id).emit("chat_start", {
            partnerChatCount: partnerData.chatCount
        });

        io.to(partnerId).emit("chat_start", {
            partnerChatCount: myData.chatCount
        });
    });


    // ---------- Отмена поиска ----------
    socket.on("cancel_search", () => {
        queue = queue.filter(id => id !== socket.id);
    });


    // ---------- Сообщения ----------
    socket.on("msg", txt => {
        let partner = pairs[socket.id];
        if (partner) io.to(partner).emit("msg", txt);
    });


    // ---------- Тайпинг ----------
    socket.on("typing", () => {
        let partner = pairs[socket.id];
        if (partner) io.to(partner).emit("typing");
    });


    // ---------- Реакции ----------
    socket.on("reaction", data => {
        let partner = pairs[socket.id];
        if (partner) io.to(partner).emit("reaction", data);
    });


    // ---------- Завершение чата ----------
    socket.on("end", () => {
        let partner = pairs[socket.id];

        if (partner) {
            io.to(partner).emit("chat_end");
        }

        io.to(socket.id).emit("chat_end");

        delete pairs[partner];
        delete pairs[socket.id];
    });


    // ---------- Отключение ----------
    socket.on("disconnect", () => {
        // убрать из очереди
        queue = queue.filter(id => id !== socket.id);

        let partner = pairs[socket.id];
        if (partner) {
            io.to(partner).emit("chat_end");
            delete pairs[partner];
        }

        delete pairs[socket.id];
        delete userData[socket.id];

        io.emit("online_count", io.engine.clientsCount);
    });
});


const PORT = process.env.PORT || 8080;
http.listen(PORT, () => {
    console.log("======================================");
    console.log("🚀 Сервер запущен на порту:", PORT);
    console.log("🌍 Локальный адрес: http://localhost:" + PORT);
    console.log("======================================");
});

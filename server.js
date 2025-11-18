const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

app.use(express.static("public")); // index.html должен лежать в /public/

let queue = [];              // очередь на поиск
let partners = {};           // пары собеседников
let online = 0;              // онлайн

io.on("connection", socket => {
    online++;
    io.emit("online_count", online);

    // -------------------------------
    // ПОИСК СОБЕСЕДНИКА
    // -------------------------------
    socket.on("find", (prefs) => {
        // Только если не в чате
        if (partners[socket.id]) return;

        // Если есть кто-то в очереди — соединяем
        if (queue.length > 0) {
            let partner = queue.shift();

            partners[socket.id] = partner;
            partners[partner] = socket.id;

            io.to(socket.id).emit("chat_start");
            io.to(partner).emit("chat_start");
        } else {
            // добавляем в очередь
            queue.push(socket.id);
            io.to(socket.id).emit("searching");
        }
    });

    // -------------------------------
    // ОТПРАВКА СООБЩЕНИЙ
    // -------------------------------
    socket.on("msg", text => {
        let p = partners[socket.id];
        if (p) io.to(p).emit("msg", text);
    });

    // -------------------------------
    // СТАТУС "ПИШЕТ"
    // -------------------------------
    socket.on("typing", () => {
        let p = partners[socket.id];
        if (p) io.to(p).emit("typing");
    });

    // -------------------------------
    // ЗАВЕРШЕНИЕ ЧАТА
    // -------------------------------
    socket.on("end_chat", () => {
        endChat(socket.id);
    });

    // -------------------------------
    // ОТМЕНА ПОИСКА
    // -------------------------------
    socket.on("cancel_search", () => {
        queue = queue.filter(id => id !== socket.id);
        io.to(socket.id).emit("search_cancelled");
    });

    // -------------------------------
    // ОТКЛЮЧЕНИЕ КЛИЕНТА
    // -------------------------------
    socket.on("disconnect", () => {
        online--;
        io.emit("online_count", online);

        endChat(socket.id);

        // Удаляем из очереди
        queue = queue.filter(id => id !== socket.id);
    });
});


// ---------------------------------------
// ФУНКЦИЯ ЗАВЕРШЕНИЯ ЧАТА
// ---------------------------------------
function endChat(id) {
    let p = partners[id];
    if (p) {
        io.to(p).emit("chat_end");
        delete partners[p];
    }
    delete partners[id];
}

http.listen(process.env.PORT || 3000, () => {
    console.log("Server started");
});

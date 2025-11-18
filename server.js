// server.js — исправлённая версия
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

app.use(express.static("public"));

let queue = [];              // очередь: список socket.id
let partners = {};           // partners[id] = partnerId
let online = 0;

/**
 * Проверка совместимости предпочтений
 * aPrefs = { gender: "Мужчина"|"Женщина", searchfor: "Ищу любой"|"Ищу мужчину"|"Ищу женщину" }
 * Возвращает true если a ищет b и b ищет a (взаимно)
 */
function compatible(aPrefs, bPrefs) {
    if (!aPrefs || !bPrefs) return false;

    const aAcceptsB = (aPrefs.searchfor === "Ищу любой") ||
                      (aPrefs.searchfor === "Ищу мужчину" && bPrefs.gender === "Мужчина") ||
                      (aPrefs.searchfor === "Ищу женщину" && bPrefs.gender === "Женщина");

    const bAcceptsA = (bPrefs.searchfor === "Ищу любой") ||
                      (bPrefs.searchfor === "Ищу мужчину" && aPrefs.gender === "Мужчина") ||
                      (bPrefs.searchfor === "Ищу женщину" && aPrefs.gender === "Женщина");

    return aAcceptsB && bAcceptsA;
}

io.on("connection", socket => {
    online++;
    io.emit("online_count", online);

    // когда клиент просит найти собеседника
    socket.on("find", (prefs) => {
        // сохранить prefs на сокете
        socket.prefs = prefs || {};

        // если уже в паре — игнорируем
        if (partners[socket.id]) return;

        // Ищем подходящего партнёра в очереди (взаимная совместимость)
        let foundIndex = -1;
        for (let i = 0; i < queue.length; i++) {
            const candId = queue[i];
            if (candId === socket.id) continue; // не матчить с самим собой

            const candSocket = io.sockets.sockets.get(candId);
            if (!candSocket) continue;
            if (partners[candId]) continue; // уже в паре

            if (compatible(socket.prefs, candSocket.prefs)) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            const partnerId = queue.splice(foundIndex, 1)[0];
            partners[socket.id] = partnerId;
            partners[partnerId] = socket.id;

            io.to(socket.id).emit("chat_start");
            io.to(partnerId).emit("chat_start");
        } else {
            // если уже не в очереди — положим
            if (!queue.includes(socket.id)) queue.push(socket.id);
            io.to(socket.id).emit("searching");
        }
    });

    // сообщение -> пересылаем партнёру
    socket.on("msg", text => {
        const p = partners[socket.id];
        if (p) io.to(p).emit("msg", text);
    });

    // typing -> пересылаем партнёру
    socket.on("typing", () => {
        const p = partners[socket.id];
        if (p) io.to(p).emit("typing");
    });

    // клиент запросил завершить чат
    socket.on("end", () => {
        endChat(socket.id);
    });
    // запасной вариант имени события (если фронт использует другое)
    socket.on("end_chat", () => {
        endChat(socket.id);
    });

    // отмена поиска (кнопка "Прекратить поиск")
    socket.on("cancel_search", () => {
        queue = queue.filter(id => id !== socket.id);
        io.to(socket.id).emit("search_cancelled");
    });

    // обработка отключения
    socket.on("disconnect", () => {
        online--;
        io.emit("online_count", online);

        // если в паре — уведомим партнёра
        endChat(socket.id);

        // удалим из очереди (если был)
        queue = queue.filter(id => id !== socket.id);
    });
});

/**
 * Завершить чат для данного socketId.
 * Уведомляет партнёра (если есть) и очищает обе стороны.
 */
function endChat(socketId) {
    const partnerId = partners[socketId];
    if (partnerId) {
        // уведомляем партнёра, что чат окончен
        io.to(partnerId).emit("chat_end");
        // также уведомляем инициатора (на случай, если фронт ждёт подтверждение)
        io.to(socketId).emit("chat_end");

        // удаляем пары
        delete partners[partnerId];
        delete partners[socketId];
    } else {
        // если сам в partners как значение (когда partner initiated), тоже удалим
        for (const k in partners) {
            if (partners[k] === socketId) {
                const other = k;
                io.to(other).emit("chat_end");
                delete partners[other];
            }
        }
        delete partners[socketId];
    }
    // на всякий случай удаляем из очереди
    queue = queue.filter(id => id !== socketId);
}

http.listen(process.env.PORT || 3000, () => {
    console.log("Server listening on port", process.env.PORT || 3000);
});

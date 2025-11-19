// server.js
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 20 * 1024 * 1024 // 20MB — достаточно для голосовых
});

app.use(express.static("public")); // положи index.html + assets в папку public

// ===== данные на сервере =====
let waiting = [];         // очередь socket.id
let partners = {};        // partners[socketId] = partnerSocketId
let chatMeta = {};        // chatMeta[socketId] = { chatCount: number } (опционально)

// ===== помощники =====
function getPartner(id) {
  return partners[id] || null;
}

function unlinkPair(id) {
  const p = partners[id];
  if (p) delete partners[p];
  delete partners[id];
  if (p && partners[p]) { delete partners[p]; }
}

// ===== socket.io =====
io.on("connection", socket => {
  // отправляем текущее кол-во онлайн клиентам
  io.emit("online_count", io.engine.clientsCount);
  console.log("→ connected:", socket.id);

  // ===== find — пользователь ищет собеседника =====
  socket.on("find", (data = {}) => {
    const chatCount = data.chatCount || 0;
    chatMeta[socket.id] = { chatCount };

    // если кто-то уже в очереди — соединяем
    if (waiting.length > 0) {
      // найдём партнёра, исключая самого себя, на всякий случай
      let partner = null;
      while (waiting.length > 0) {
        const cand = waiting.shift();
        if (cand === socket.id) continue;
        partner = cand;
        break;
      }

      if (!partner) {
        // если подходящего нет — ставим в очередь
        waiting.push(socket.id);
        return;
      }

      partners[socket.id] = partner;
      partners[partner] = socket.id;

      // отправляем обоим событие chat_start и данные о рейтинге партнёра (если есть)
      const partnerChatCount = (chatMeta[partner] && chatMeta[partner].chatCount) || 0;
      const myChatCount = chatCount;

      socket.emit("chat_start", { partnerChatCount });
      io.to(partner).emit("chat_start", { partnerChatCount: myChatCount });

      console.log(`↔ paired: ${socket.id} <-> ${partner}`);
    } else {
      // ставим в очередь
      waiting.push(socket.id);
      console.log("⏳ queued:", socket.id);
    }
  });

  // ===== cancel_search — пользователь отменил поиск =====
  socket.on("cancel_search", () => {
    waiting = waiting.filter(id => id !== socket.id);
    // обновим онлайн — не обязательно, но пусть будет
    io.emit("online_count", io.engine.clientsCount);
    console.log("✖ cancel_search:", socket.id);
  });

  // ===== msg — текстовое сообщение =====
  socket.on("msg", txt => {
    const p = getPartner(socket.id);
    if (p) {
      io.to(p).emit("msg", txt);
    }
  });

  // ===== typing =====
  socket.on("typing", () => {
    const p = getPartner(socket.id);
    if (p) io.to(p).emit("typing");
  });

  // ===== reaction =====
  socket.on("reaction", data => {
    const p = getPartner(socket.id);
    if (p) io.to(p).emit("reaction", data);
  });

  // ===== voice — бинарный аудио blob (MediaRecorder blob) =====
  // Клиент должен отправлять как Blob/ArrayBuffer — socket.io поддерживает бинарно
  socket.on("voice", (blob) => {
    const p = getPartner(socket.id);
    if (!p) return;
    // просто ретранслируем данные партнёру
    io.to(p).emit("voice", blob);
  });

  // ===== end — пользователь завершил чат (выключаем у обоих) =====
  socket.on("end", () => {
    const p = getPartner(socket.id);
    if (p) {
      io.to(p).emit("chat_end");
      io.to(socket.id).emit("chat_end");
      // разрываем связь у обоих
      unlinkPair(socket.id);
      console.log("🔚 chat ended (both):", socket.id, p);
    } else {
      // если партнёра нет — всё равно уведомим себя
      io.to(socket.id).emit("chat_end");
      unlinkPair(socket.id);
      console.log("🔚 chat ended (self only):", socket.id);
    }
  });

  // ===== disconnect =====
  socket.on("disconnect", () => {
    console.log("← disconnected:", socket.id);

    // убрать из очереди (если был)
    waiting = waiting.filter(id => id !== socket.id);

    // уведомить партнёра, если есть
    const p = getPartner(socket.id);
    if (p) {
      io.to(p).emit("chat_end");
      unlinkPair(socket.id);
      console.log("🔔 partner notified:", p);
    }

    // обновляем счётчик онлайн
    io.emit("online_count", io.engine.clientsCount);
  });
});

// ===== запуск сервера =====
const PORT = process.env.PORT || 8080;
http.listen(PORT, () => {
  console.log("================================");
  console.log("🚀 Server listening on port:", PORT);
  console.log("🌍 http://localhost:" + PORT);
  console.log("================================");
});

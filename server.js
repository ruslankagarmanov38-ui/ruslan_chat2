// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public')); // если у тебя "public" - используем. Если index.html в корне, change to '.'.

let queue = []; // array of sockets waiting
let users = new Map(); // socketId -> { myGender, seekingGender, room }
let online = 0;

io.on('connection', socket => {

  online++;
  io.emit('online_count', online);

  socket.on('join_queue', (data) => {
    // data: { myGender, seekingGender }
    users.set(socket.id, { myGender: data.myGender, seekingGender: data.seekingGender, room: null, partner: null });
    queue.push(socket);
    tryMatch();
  });

  socket.on('leave_queue', () => {
    queue = queue.filter(s => s.id !== socket.id);
    const u = users.get(socket.id);
    if(u) users.delete(socket.id);
  });

  socket.on('message', ({ roomId, text }) => {
    // send to partner in room (exclude sender)
    socket.to(roomId).emit('message', { text, from: socket.id });
  });

  socket.on('typing', ({ roomId }) => {
    socket.to(roomId).emit('partner_typing');
  });

  socket.on('typing_stop', ({ roomId }) => {
    socket.to(roomId).emit('partner_typing_stop');
  });

  socket.on('end', ({ roomId }) => {
    // tell partner that chat ended
    socket.to(roomId).emit('ended');
    const u = users.get(socket.id);
    if(u && u.partner){
      const partnerId = u.partner;
      const p = users.get(partnerId);
      if(p){ p.partner = null; p.room = null; }
    }
    if(u) { u.partner = null; u.room = null; }
  });

  socket.on('disconnect', () => {
    online--;
    io.emit('online_count', online);

    // remove from queue
    queue = queue.filter(s => s.id !== socket.id);

    // notify partner only if exists
    const u = users.get(socket.id);
    if(u && u.partner){
      const partnerId = u.partner;
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if(partnerSocket){
        partnerSocket.emit('partner_disconnected');
        // clear partner state
        const p = users.get(partnerId);
        if(p){ p.partner = null; p.room = null; }
      }
    }
    users.delete(socket.id);
  });

  // helper: allow manual "retry match" or others later
});

/* Matching logic */
function canMatch(aData, bData){
  // aData = { myGender, seekingGender }
  // match if A's seeking matches B's myGender AND B's seeking matches A's myGender
  const okA = (aData.seekingGender === 'a' || aData.seekingGender === bData.myGender);
  const okB = (bData.seekingGender === 'a' || bData.seekingGender === aData.myGender);
  return okA && okB;
}

function tryMatch(){
  if(queue.length < 2) return;
  // iterate pairs
  for(let i=0;i<queue.length;i++){
    for(let j=i+1;j<queue.length;j++){
      const sA = queue[i];
      const sB = queue[j];
      const A = users.get(sA.id);
      const B = users.get(sB.id);
      if(!A || !B) continue;
      if(canMatch(A,B)){
        // remove from queue by indices
        queue.splice(j,1);
        queue.splice(i,1);

        // create room
        const room = 'room_' + Math.random().toString(36).slice(2,10);
        sA.join(room);
        sB.join(room);

        // set partner references
        A.partner = sB.id; A.room = room;
        B.partner = sA.id; B.room = room;
        users.set(sA.id, A); users.set(sB.id, B);

        // notify both (server uses same event name as client expects)
        sA.emit('matched', { roomId: room });
        sB.emit('matched', { roomId: room });
        return;
      }
    }
  }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=>console.log('Server listening on', PORT));

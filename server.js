const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors:{origin:"*"} });

app.use(express.static("public"));

let queue = [];
let partners = {};
let online = 0;

io.on("connection", socket => {
    online++;
    io.emit("online_count", online);

    socket.on("find", data => {
        socket.data = data;
        queue.push(socket);
        match();
    });

    socket.on("stop", () => {
        queue = queue.filter(s=>s!==socket);
    });

    socket.on("msg", text=>{
        let p = partners[socket.id];
        if(!p) return;
        p.emit("msg", text);
    });

    socket.on("disconnect", ()=>{
        online--;
        io.emit("online_count", online);

        queue = queue.filter(s=>s!==socket);

        let p = partners[socket.id];
        if(p){
            p.emit("partner_left");
            delete partners[p.id];
            delete partners[socket.id];
        }
    });

});

function match(){
    if(queue.length < 2) return;

    for(let i=0;i<queue.length;i++){
        for(let j=i+1;j<queue.length;j++){
            let a = queue[i];
            let b = queue[j];

            if (ok(a,b)) {
                queue.splice(j,1);
                queue.splice(i,1);

                partners[a.id] = b;
                partners[b.id] = a;

                a.emit("found");
                b.emit("found");
                return;
            }
        }
    }
}

function ok(a,b){
    if(a.data.looking==="Ищу любой" && b.data.looking==="Ищу любой") return true;

    if(a.data.looking==="Ищу мужчину" && b.data.gender==="Мужчина") return true;
    if(a.data.looking==="Ищу женщину" && b.data.gender==="Женщина") return true;

    if(b.data.looking==="Ищу мужчину" && a.data.gender==="Мужчина") return true;
    if(b.data.looking==="Ищу женщину" && a.data.gender==="Женщина") return true;

    return false;
}

http.listen(10000, ()=>console.log("SERVER OK"));

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// ======= "BANCO DE DADOS" EM MEMÓRIA =======
const users = {};        // username -> {password, friends:[], requests:[]}
const rooms = { "Geral": [] }; // sala -> mensagens

// ======= LOGIN PAGE =======
const loginPage = `
<!DOCTYPE html>
<html>
<head>
<title>BingBoing</title>
<style>
body{background:#2b2d31;font-family:Arial;color:white;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
.box{background:#1e1f22;padding:20px;border-radius:8px;display:flex;flex-direction:column;gap:10px;width:260px;}
input,button{padding:10px;border:none;border-radius:5px;}
button{background:#5865f2;color:white;cursor:pointer;}
</style>
</head>
<body>
<div class="box">
<h2>BingBoing</h2>
<input id="user" placeholder="Usuário">
<input id="pass" type="password" placeholder="Senha">
<button onclick="register()">Cadastrar</button>
<button onclick="login()">Entrar</button>
<p id="msg"></p>
</div>

<script>
async function register(){
 const res = await fetch("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:user.value,password:pass.value})});
 const data = await res.json();
 msg.innerText = data.msg;
}
async function login(){
 const res = await fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:user.value,password:pass.value})});
 const data = await res.json();
 if(data.ok){
   localStorage.setItem("user", user.value);
   location.href="/app";
 } else msg.innerText=data.msg;
}
</script>
</body>
</html>
`;

// ======= APP PAGE =======
const appPage = `
<!DOCTYPE html>
<html>
<head>
<title>BingBoing</title>
<style>
body{margin:0;font-family:Arial;background:#2b2d31;color:white;display:flex;height:100vh;}
#left{width:230px;background:#1e1f22;padding:10px;overflow-y:auto;}
#center{flex:1;display:flex;flex-direction:column;}
#messages{flex:1;padding:10px;overflow-y:auto;}
#input{display:flex;}
#input input{flex:1;padding:10px;border:none;}
#input button{padding:10px;border:none;background:#5865f2;color:white;}
button{margin-top:5px;width:100%;background:#5865f2;border:none;color:white;padding:5px;cursor:pointer;}
select,input{width:100%;margin-top:5px;}
</style>
</head>
<body>

<div id="left">
<b>Usuário:</b> <span id="me"></span>

<h4>Salas</h4>
<select id="roomSelect" onchange="changeRoom()"></select>
<input id="newRoom" placeholder="Nova sala">
<button onclick="createRoom()">Criar sala</button>

<h4>Amigos</h4>
<div id="friends"></div>
<input id="addFriendName" placeholder="Adicionar amigo">
<button onclick="addFriend()">Enviar pedido</button>

<h4>Pedidos</h4>
<div id="requests"></div>

<hr>
<button onclick="startCall()">🎤 Entrar na Call</button>
<audio id="remoteAudio" autoplay></audio>
</div>

<div id="center">
<div id="messages"></div>
<div id="input">
<input id="msg" placeholder="Mensagem">
<button onclick="send()">Enviar</button>
</div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const user = localStorage.getItem("user");
if(!user) location.href="/";
document.getElementById("me").innerText = user;

let currentRoom = "Geral";
let localStream;
let peer;

// ===== INIT =====
socket.emit("init", user);

// ===== RECEBER LISTAS =====
socket.on("roomList", rooms=>{
  roomSelect.innerHTML="";
  rooms.forEach(r=>{
    const opt=document.createElement("option");
    opt.value=r; opt.text=r;
    roomSelect.appendChild(opt);
  });
  roomSelect.value=currentRoom;
});

socket.on("messageHistory", msgs=>{
  messages.innerHTML="";
  msgs.forEach(m=>{
    messages.innerHTML+=\`<p><b>\${m.user}:</b> \${m.msg}</p>\`;
  });
});

socket.on("message", data=>{
  messages.innerHTML+=\`<p><b>\${data.user}:</b> \${data.msg}</p>\`;
});

socket.on("friendList", list=>{
 friends.innerHTML="";
 list.forEach(f=> friends.innerHTML+= "<p>"+f+"</p>");
});

socket.on("requestList", list=>{
 requests.innerHTML="";
 list.forEach(r=>{
   requests.innerHTML+= "<p>"+r+" <button onclick='accept(\""+r+"\")'>Aceitar</button></p>";
 });
});

// ===== CHAT =====
function send(){
 const text = msg.value;
 if(!text.trim())return;
 socket.emit("sendMessage",{room:currentRoom,msg:text});
 msg.value="";
}

function changeRoom(){
 currentRoom = roomSelect.value;
 socket.emit("joinRoom", currentRoom);
}

function createRoom(){
 if(newRoom.value) socket.emit("createRoom", newRoom.value);
 newRoom.value="";
}

// ===== AMIGOS =====
function addFriend(){
 socket.emit("friendRequest", addFriendName.value);
 addFriendName.value="";
}

function accept(name){
 socket.emit("acceptFriend", name);
}

// ===== VOZ (WEBRTC) =====
async function startCall(){
 localStream = await navigator.mediaDevices.getUserMedia({audio:true});
 createPeer();
 localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
 const offer = await peer.createOffer();
 await peer.setLocalDescription(offer);
 socket.emit("webrtc-offer", offer);
}

function createPeer(){
 peer = new RTCPeerConnection();

 peer.ontrack = event=>{
   remoteAudio.srcObject = event.streams[0];
 };

 peer.onicecandidate = event=>{
   if(event.candidate){
     socket.emit("webrtc-ice", event.candidate);
   }
 };
}

socket.on("webrtc-offer", async offer=>{
 localStream = await navigator.mediaDevices.getUserMedia({audio:true});
 createPeer();
 localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
 await peer.setRemoteDescription(offer);
 const answer = await peer.createAnswer();
 await peer.setLocalDescription(answer);
 socket.emit("webrtc-answer", answer);
});

socket.on("webrtc-answer", async answer=>{
 await peer.setRemoteDescription(answer);
});

socket.on("webrtc-ice", async candidate=>{
 if(peer) await peer.addIceCandidate(candidate);
});
</script>
</body>
</html>
`;

// ======= ROTAS =======
app.get("/", (req,res)=>res.send(loginPage));
app.get("/app", (req,res)=>res.send(appPage));

// ======= AUTH =======
app.post("/register",(req,res)=>{
 const {username,password}=req.body;
 if(users[username]) return res.json({msg:"Usuário já existe"});
 users[username]={password,friends:[],requests:[]};
 res.json({msg:"Conta criada!"});
});

app.post("/login",(req,res)=>{
 const {username,password}=req.body;
 if(users[username] && users[username].password===password)
   return res.json({ok:true});
 res.json({ok:false,msg:"Login inválido"});
});

// ======= SOCKET =======
io.on("connection", socket=>{
 let me;
 let currentRoom = "Geral";

 socket.on("init", username=>{
   me = username;
   socket.join("Geral");
   sendRoomList();
   sendRoomHistory();
   sendFriends();
   sendRequests();
 });

 function sendRoomList(){
   socket.emit("roomList", Object.keys(rooms));
 }

 function sendRoomHistory(){
   socket.emit("messageHistory", rooms[currentRoom]);
 }

 function sendFriends(){
   socket.emit("friendList", users[me].friends);
 }

 function sendRequests(){
   socket.emit("requestList", users[me].requests);
 }

 socket.on("createRoom", room=>{
   if(!rooms[room]){
     rooms[room]=[];
     io.emit("roomList", Object.keys(rooms));
   }
 });

 socket.on("joinRoom", room=>{
   currentRoom = room;
   socket.join(room);
   sendRoomHistory();
 });

 socket.on("sendMessage", data=>{
   const msgData = {user:me,msg:data.msg};
   rooms[data.room].push(msgData);
   io.to(data.room).emit("message", msgData);
 });

 // ==== Amigos ====
 socket.on("friendRequest", target=>{
   if(users[target] && !users[target].requests.includes(me)){
     users[target].requests.push(me);
   }
 });

 socket.on("acceptFriend", target=>{
   if(!users[me].friends.includes(target)){
     users[me].friends.push(target);
     users[target].friends.push(me);
   }
   users[me].requests = users[me].requests.filter(r=>r!==target);
   sendFriends();
   sendRequests();
 });

 // ==== WebRTC SIGNAL ====
 socket.on("webrtc-offer", offer=>{
   socket.broadcast.emit("webrtc-offer", offer);
 });

 socket.on("webrtc-answer", answer=>{
   socket.broadcast.emit("webrtc-answer", answer);
 });

 socket.on("webrtc-ice", candidate=>{
   socket.broadcast.emit("webrtc-ice", candidate);
 });
});

server.listen(3000, ()=>console.log("BingBoing FULL + VOZ rodando!"));

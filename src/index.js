const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const express = require("express");
const socketio = require("socket.io");
const Filter = require("bad-words");
const { generateMessage, generateLocationMessage } = require("./utils/messages");
const { addUser, removeUser, getUser, getUsersInRoom } = require("./utils/users");

let httpsOptions = null;

if (process.env.PRIVATE_KEY && process.env.PUBLIC_CRT) {
    httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, process.env.PRIVATE_KEY), 'utf8'),
        cert: fs.readFileSync(path.join(__dirname, process.env.PUBLIC_CRT), 'utf8')
    };
}

const app = express();
const server = (httpsOptions) ? https.createServer(httpsOptions, app) : http.createServer(app);
const io = socketio(server);

const port = process.env.PORT;
const publicDirectoryPath = path.join(__dirname, "../public");

app.use(express.static(publicDirectoryPath));
app.set("view engine", "html");

app.get("/", (req, res) => {
    res.send("index");
});

// server (emit) -> client (receive) - countUpdated
// client (emit) -> server (receive) - increment

// server side
io.on("connection", (socket) => {
    console.log("New WebSocket connection");

    // socket.emit for this client
    // io.emit for all clients
    // socket.broadcast.emit for all clients except for this client
    // io.to.emit for all clients in this room
    // socket.broadcast.to.emit for all clients for this client in this room
    
    socket.on("join", (options, callback) => {
        const { error, user } = addUser({ id: socket.id, ...options });

        if (error) {
            return callback(error);
        }

        socket.join(user.room);

        socket.emit("message", generateMessage("Admin", "Welcome!"));
        socket.broadcast.to(user.room).emit("message", generateMessage("Admin", `${user.username} has joined!!`));
        io.to(user.room).emit("roomData", {
            room: user.room,
            users: getUsersInRoom(user.room)
        });

        callback();
    });

    socket.on("sendMessage", (message, callback) => {
        const user = getUser(socket.id);
        const filter = new Filter();

        if (filter.isProfane(message)) {
            return callback("Profanity is not allowed!!");
        }

        io.to(user.room).emit("message", generateMessage(user.username, message));
        callback();
    });

    socket.on("sendLocation", (coords, callback) => {
        const user = getUser(socket.id);
        io.to(user.room).emit("locationMessage", generateLocationMessage(user.username, `https://google.com/maps?q=${coords.longitude},${coords.latitude}`));
        callback();
    });

    socket.on("disconnect", () => {
        const user = removeUser(socket.id);

        if (user) {
            io.to(user.room).emit("message", generateMessage("Admin", `${user.username} has left!!`));
            io.to(user.room).emit("roomData", {
                room: user.room,
                users: getUsersInRoom(user.room)
            });
        }
    });
});

server.listen(port, () => {
    console.log(`Server is up on port ${port}!`);
});
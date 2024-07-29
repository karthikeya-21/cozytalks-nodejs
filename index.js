const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const path = require('path');
const url="mongodb+srv://root:root@sockets.2v0eo1f.mongodb.net/cozytalks"
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const User = require('./models/User'); // Create a User model
const Chat = require('./models/Chat');
const ChatRequest = require('./models/ChatRequest');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');




mongoose.connect(url);


app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));


app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    console.log("name is ",username," email is ",email," password is ",password);
    try {
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        // Check if the user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }

        try{
        // Create and save new user
        const newUser = new User({ name:username, email:email, password:password });
        await newUser.save();
        }catch(err){
            console.log(err)
        }
        
        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find user by email
        const user = await User.findOne({ email,password });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid email or password' });
        }
        console.log(user)
        // console.log("trying password match")
        // // Compare password
        // const isMatch = await bcrypt.compare(password, user.password);
        // if (!isMatch) {
        //     return res.status(400).json({ success: false, message: 'Invalid email or password' });
        // }

        // Successful login
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error });
    }
});






















const socketMap = new Map();

wss.on('connection', async(ws,req) => {
    console.log('a user connected');
    const userId = req.url.replace('/?userId=', '');
    const socketId = uuidv4();
    console.log(socketId)
    socketMap.set(socketId, ws);
    try {
            await User.updateOne(
            { _id: userId }, // Query to find the document
            { $set: { connection_id: socketId ,user_status:"Online"} } // Update field
        );
    }catch(err){
        console.log(err)
    }
    ws.send(JSON.stringify({type:"connection",msg:"Connected Successfully"}));

    ws.on('message', async (message) => {
        console.log(`Received message => ${message}`);
        const data = JSON.parse(message);
        if(data.type=='userList'){
            getUsersWithoutChatRequests(ws,data)
        }
        else if(data.type=='message'){
            sendMessage(data)
        }
        else if(data.type=='send_request'){
            sendFriendRequest(data)
        }
        else if(data.type=='load_friends'){
            loadFriends(ws,data)
        }
        else if(data.type=='process_friend_request'){
            processFriendRequest(data)
        }
        else  if(data.type=='load_notifications'){
            loadNotifications(ws,data)
        }
        else if(data.type=='chat_history'){
            sendChatHistory(data);
        }
    });

    ws.on('close', async(req) => {
        console.log('user disconnected');
        const user = await User.findOne({ connection_id: socketId });
        if (user) {
            await User.updateOne(
                { _id: user._id }, // Query to find the document
                { $set: { connection_id: null ,user_status:"offline"} } // Update field
            );
        }
        socketMap.delete(socketId);
    });
});

server.listen(3000, () => {
    console.log('listening on *:3000');
});



async function sendMessage(data){
    const chatMessage = new Chat({ from_user_id: data.fromUserId, to_user_id: data.toUserId, chat_message: data.chat_message });
    await chatMessage.save();
    const sender=await User.findById(data.fromUserId).exec();
    const receiver=await User.findById(data.toUserId).exec();
    if(sender && receiver){
    senderSocket=socketMap.get(sender.connection_id)
    receiverSocket=socketMap.get(receiver.connection_id)
    }else{
        return;
    }
    if(receiverSocket){
        receiverSocket.send(JSON.stringify(data));
    }
    if(senderSocket){
        senderSocket.send(JSON.stringify(data));
    }
}

async function fetchUsersExceptMe(ws,data){
    console.log("Sending user list")
    const users = await User.find({ _id: { $ne: data.userId } });
    ws.send(JSON.stringify({ type: 'userList', users }));
}

async function sendFriendRequest(data){

    const friendRequest=new ChatRequest({from_user_id: data.fromUserId, to_user_id: data.toUserId, status: "pending"})
    await friendRequest.save();
    const sender=await User.findById(data.fromUserId).exec();
    const receiver=await User.findById(data.toUserId).exec();
    console.log(sender)
    console.log(receiver)
    senderSocket=socketMap.get(sender.connection_id)
    receiverSocket=socketMap.get(receiver.connection_id)
    if(receiverSocket){
        receiverSocket.send(JSON.stringify({ type:'updateUI', user: sender.name }));
    }
    if(senderSocket){
        senderSocket.send(JSON.stringify({ type:'updateUI', user: receiver.name }));
    }
}

async function loadFriends(ws,data){
    const friendRequests=await ChatRequest.find({ $or: [{from_user_id: data.userId}, {to_user_id: data.userId}], status: "approved" })
    const friends=friendRequests.map(req=>req.from_user_id==data.userId?req.to_user_id:req.from_user_id)
    const users=await User.find({ _id: { $in: friends } });
    ws.send(JSON.stringify({ type: 'load_friends', users }));
}

async function processFriendRequest(data){
    let result=await ChatRequest.updateOne({_id:data.request_id},{$set:{status:data.action}});
    if(result.nModified==1){
        console.log("Friend request processed")
    }
    console.log(result);
    const sender=await User.findById(data.fromUserId).exec();
    const receiver=await User.findById(data.toUserId).exec();
    senderSocket=socketMap.get(sender.connection_id);
    receiverSocket=socketMap.get(receiver.connection_id);
    if(senderSocket){
    senderSocket.send(JSON.stringify(
        {type:"process_friend_request","userId":data.fromUserId}
    ))
    }
    if(receiverSocket){
    receiverSocket.send(JSON.stringify(
        {type:"process_friend_request","userId":data.toUserId}
    ))
    }
}

async function loadNotifications(ws,data){
    try {
        // Fetch chat requests where status is not 'Approve' and involves the current user
        const notificationData = await ChatRequest.find({
            status: { $ne: 'approved' },
            $or: [
                { from_user_id: data.userId },
                { to_user_id: data.userId }
            ]
        }).sort({ id: 'asc' }).exec();

        const subData = [];

        // Iterate over each chat request to prepare detailed notification data
        for (const row of notificationData) {
            let userId = '';
            let notificationType = '';

            if (row.from_user_id.toString() === data.userId) {
                userId = row.to_user_id;
                notificationType = 'Send Request';
            } else {
                userId = row.from_user_id;
                notificationType = 'Receive Request';
            }

            const userData = await User.findById(userId).select('name user_image').exec();

            if (userData) {
                subData.push({
                    id: row._id,
                    from_user_id: row.from_user_id,
                    to_user_id: row.to_user_id,
                    name: userData.name,
                    notification_type: notificationType,
                    status: row.status,
                    user_image: userData.user_image
                });
            }
        }

        // Fetch the connection ID of the requesting user
        const requestingUser = await User.findById(data.userId).select('connection_id').exec();
        const senderConnectionId = requestingUser.connection_id;

        // Prepare the data to be sent back
        const sendData = {
            type: 'load_notifications',
            data: subData
        };


        senderSocket = socketMap.get(senderConnectionId);
        if (senderSocket) {
            senderSocket.send(JSON.stringify(sendData));
        }

    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

async function getUsersWithoutChatRequests(ws,data) {
    try {
        // Get all users except the current user
        const users = await User.find({
            _id: { $ne: data.userId },
            name: { $regex: data.search_query, $options: 'i' }
        }).exec();

        const subData = [];

        // For each user, check if there are any chat requests with the current user
        for (const user of users) {
            const chatRequestCount = await ChatRequest.countDocuments({
                $or: [
                    { from_user_id: data.userId, to_user_id: user._id },
                    { from_user_id: user._id, to_user_id: data.userId }
                ]
            }).exec();

            // If no chat request exists, add the user to the subData list
            if (chatRequestCount === 0) {
                subData.push({
                    name: user.name,
                    id: user._id,
                    status: user.user_status,
                    user_image: user.user_image
                });
            }
        }
        ws.send(JSON.stringify(
            { type: 'userList', users: subData }
        ))
        
    } catch (error) {
        console.error('Error fetching users without chat requests:', error);
        throw error;
    }
}

async function sendChatHistory(data){
    
}
const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    from_user_id: String,
    to_user_id: String,
    chat_message: String,
    message_status: String,
    createdAt: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', ChatSchema);
module.exports = Chat;

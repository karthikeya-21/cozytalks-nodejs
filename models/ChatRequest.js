const mongoose = require('mongoose');

const ChatRequestSchema = new mongoose.Schema({
    from_user_id: String,
    to_user_id: String,
    status: String,
    createdAt: { type: Date, default: Date.now }
});

const ChatRequest = mongoose.model('ChatRequest', ChatRequestSchema);
module.exports = ChatRequest;

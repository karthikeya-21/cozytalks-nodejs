const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    connection_id: { type: String }, // For storing WebSocket connection IDs
    user_status: { type: String, default: 'offline' }, // User status (online, offline, etc.)
    user_image: { type: String,default:'empty.png' } // Path to user profile image
});

// Encrypt password before saving
// UserSchema.pre('save', async function(next) {
//     if (!this.isModified('password')) return next();
//     const salt = await bcrypt.genSalt(10);
//     this.password = await bcrypt.hash(this.password, salt);
//     next();
// });

const User = mongoose.model('User', UserSchema);
module.exports = User;

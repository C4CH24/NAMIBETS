import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'user' },
  balance: { type: Number, default: 0 },
  tier: { type: String, default: 'Rising Player' },
  streak: { type: Number, default: 0 },
}, { timestamps: true })

const User = mongoose.models.User || mongoose.model('User', UserSchema)

export default User

import mongoose from 'mongoose'

const WagerSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  marketId: { type: String, required: true },
  team: { type: String, required: true },
  stake: { type: Number, required: true },
  odds: { type: Number, required: true },
  commission: { type: Number, required: true },
  potentialReturn: { type: Number, required: true },
  status: { type: String, default: 'Pending' },
}, { timestamps: true })

const Wager = mongoose.models.Wager || mongoose.model('Wager', WagerSchema)

export default Wager

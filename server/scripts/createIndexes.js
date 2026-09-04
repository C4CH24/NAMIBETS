import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'
import Wager from '../models/Wager.js'

dotenv.config()

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI not set; cannot create indexes.')
    process.exit(1)
  }

  await mongoose.connect(uri, { keepAlive: true })
  console.log('Connected; ensuring indexes...')

  try {
    await User.init()
    await Wager.init()
    console.log('Indexes ensured for User and Wager models.')
  } catch (err) {
    console.error('Failed to create indexes:', err.message)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
}

run()

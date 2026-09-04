import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import User from './models/User.js';
import Wager from './models/Wager.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = (() => {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET must be set in production. Exiting.');
    process.exit(1);
  }
  return process.env.JWT_SECRET || 'namibets-dev-secret';
})();

app.use(cors());
app.use(express.json());

// Serve built client when a production build exists. This allows the server
// to serve the built `client/dist` whether running in production or locally
// (useful during development when we run the built client without setting
// NODE_ENV explicitly).
// Detect where `client/dist` actually lives so the server works whether
// started from the repo root or the server/ folder.
{
  // Resolve based on this module's file location to avoid issues when the
  // server is started from different working directories.
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const clientDist = path.join(__dirname, '..', 'client', 'dist')

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist))
    // Ensure API routes are not shadowed by the client wildcard route.
    app.get('*', (req, res, next) => {
      if (req.path && req.path.startsWith('/api')) return next()
      // Prevent aggressive caching of index.html so clients pick up new builds.
      res.set('Cache-Control', 'no-store, must-revalidate')
      return res.sendFile(path.join(clientDist, 'index.html'))
    })
    console.log('Serving static client from', clientDist)
  } else {
    console.warn('Production static build not found at', clientDist)
  }
}

const markets = [
  {
    id: 'm-101',
    title: 'eFootball Champions Cup',
    stage: 'Semi Final',
    teamA: 'Kiboko FC',
    teamB: 'Nairobi City',
    oddsA: 1.85,
    oddsB: 2.1,
    pool: 4500,
    status: 'Open for Bet',
    time: '18:30 EAT',
  },
  {
    id: 'm-102',
    title: 'Battle Arena Clash',
    stage: 'Quarter Final',
    teamA: 'Rift XI',
    teamB: 'Taita Strikers',
    oddsA: 1.62,
    oddsB: 2.35,
    pool: 2800,
    status: 'Matched',
    time: '20:15 EAT',
  },
  {
    id: 'm-103',
    title: 'Mombasa Derby',
    stage: 'Final',
    teamA: 'Coast United',
    teamB: 'Samburu FC',
    oddsA: 1.91,
    oddsB: 1.94,
    pool: 7200,
    status: 'Result Pending',
    time: '22:00 EAT',
  },
  {
    id: 'm-104',
    title: 'Northern League Showdown',
    stage: 'Group Stage',
    teamA: 'Nakuru Eagles',
    teamB: 'Kisumu Sharks',
    oddsA: 1.74,
    oddsB: 2.18,
    pool: 5200,
    status: 'Open for Bet',
    time: '19:45 EAT',
  },
];

const tournaments = [
  {
    id: 't-1',
    name: 'Esports Masters Cup',
    prize: 'KES 240,000',
    entrants: 124,
    progress: 'Semi-finals',
    status: 'Live',
  },
  {
    id: 't-2',
    name: 'Weekend Riot League',
    prize: 'KES 110,000',
    entrants: 72,
    progress: 'Quarter-finals',
    status: 'Open',
  },
  {
    id: 't-3',
    name: 'Coastal Clash Invitational',
    prize: 'KES 90,000',
    entrants: 48,
    progress: 'Round of 16',
    status: 'Open',
  },
];

const users = [
  {
    id: 'admin-1',
    name: 'System Admin',
    email: 'admin@namibets.com',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    balance: 50000,
    tier: 'Platform Admin',
    streak: 12,
  },
  {
    id: 'user-1',
    name: 'Kiboko FC Fan',
    email: 'fan@namibets.com',
    passwordHash: bcrypt.hashSync('demo123', 10),
    role: 'user',
    balance: 18450,
    tier: 'Elite Player',
    streak: 6,
  },
];

const wagers = [
  {
    id: 'w-1001',
    userId: 'user-1',
    marketId: 'm-101',
    team: 'Kiboko FC',
    stake: 2500,
    odds: 1.85,
    status: 'Settled',
    potentialReturn: 4625,
  },
  {
    id: 'w-1002',
    userId: 'user-1',
    marketId: 'm-103',
    team: 'Coast United',
    stake: 1800,
    odds: 1.91,
    status: 'Pending',
    potentialReturn: 3438,
  },
];

let mongoReady = false;

async function startMongo() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.log('MONGODB_URI not set. Using in-memory store for NAMIBETS demo mode.');
    return;
  }

  try {
    await mongoose.connect(mongoUri, { keepAlive: true });
    mongoReady = true;
    console.log('MongoDB connected successfully.');

    // Ensure demo admin and user exist in DB
    const adminEmail = 'admin@namibets.com';
    const demoEmail = 'fan@namibets.com';

    const admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      const adminUser = new User({
        name: 'System Admin',
        email: adminEmail,
        passwordHash: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        balance: 50000,
        tier: 'Platform Admin',
        streak: 12,
      });
      await adminUser.save();
      console.log('Created demo admin user in MongoDB.');
    }

    const demo = await User.findOne({ email: demoEmail });
    if (!demo) {
      const demoUser = new User({
        name: 'Kiboko FC Fan',
        email: demoEmail,
        passwordHash: bcrypt.hashSync('demo123', 10),
        role: 'user',
        balance: 18450,
        tier: 'Elite Player',
        streak: 6,
      });
      await demoUser.save();
      console.log('Created demo user in MongoDB.');
    }
  } catch (error) {
    console.warn('MongoDB connection failed. Falling back to in-memory data store.', error.message);
  }
}

function signToken(user) {
  // user may be a mongoose doc; ensure we use id and email
  const uid = user.id || user._id || user.userId;
  const email = user.email;
  const role = user.role || 'user';
  return jwt.sign({ userId: uid, email, role }, JWT_SECRET, { expiresIn: '7d' });
}

function getUserSummary(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    balance: user.balance,
    tier: user.tier,
    streak: user.streak,
  };
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    let user = null;
    if (mongoReady) {
      user = await User.findOne({ _id: decoded.userId }).lean();
    } else {
      user = users.find((entry) => entry.id === decoded.userId);
    }

    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  return next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mongoReady, app: 'NAMIBETS' });
});

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: 'Name, email, and a password of at least 6 characters are required.' });
  }

  if (mongoReady) {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'A user with that email already exists.' });

    const created = new User({
      name,
      email: email.toLowerCase(),
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'user',
      balance: 2500,
      tier: 'Rising Player',
      streak: 1,
    });
    await created.save();
    const token = signToken(created);
    return res.status(201).json({ token, user: getUserSummary(created) });
  }

  const existingUser = users.find((user) => user.email.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    return res.status(409).json({ message: 'A user with that email already exists.' });
  }

  const newUser = {
    id: `user-${Date.now()}`,
    name,
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'user',
    balance: 2500,
    tier: 'Rising Player',
    streak: 1,
  };

  users.push(newUser);
  const token = signToken(newUser);

  return res.status(201).json({ token, user: getUserSummary(newUser) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (mongoReady) {
    const dbUser = await User.findOne({ email: email.toLowerCase() });
    if (!dbUser || !bcrypt.compareSync(password, dbUser.passwordHash)) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const token = signToken(dbUser);
    return res.json({ token, user: getUserSummary(dbUser) });
  }

  const user = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = signToken(user);
  return res.json({ token, user: getUserSummary(user) });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  res.json({ user: getUserSummary(req.user) });
});

app.get('/api/overview', authMiddleware, (req, res) => {
  const recentSettlements = [
    { id: 'TX-1290', title: 'eFootball Champions Cup', amount: '+KES 4200', status: 'Settled' },
    { id: 'TX-1287', title: 'Mombasa Derby', amount: '+KES 2100', status: 'Pending' },
    { id: 'TX-1283', title: 'Battle Arena Clash', amount: '-KES 650', status: 'Confirmed' },
  ];

  const userSummary = getUserSummary(req.user);

  res.json({
    user: userSummary,
    stats: [
      { label: 'Open Wagers', value: 148, change: '+18.4%' },
      { label: 'Win Ratio', value: '68.2%', change: '+2.1%' },
      { label: 'Volume', value: 'KES 3.2M', change: '+27.9%' },
      { label: 'Trust Score', value: '96.8%', change: '+1.6%' },
    ],
    recentSettlements,
  });
});

app.get('/api/markets', authMiddleware, (req, res) => {
  res.json(markets);
});

app.get('/api/tournaments', authMiddleware, (req, res) => {
  res.json(tournaments);
});

app.get('/api/admin/wagers', authMiddleware, adminOnly, async (req, res) => {
  if (mongoReady) {
    const dbWagers = await Wager.find().lean();
    const payload = await Promise.all(dbWagers.map(async (w) => {
      const u = await User.findById(w.userId).lean();
      return { ...w, user: u ? u.name : 'Unknown user' };
    }));
    return res.json(payload);
  }

  return res.json(wagers.map((wager) => ({
    ...wager,
    user: users.find((user) => user.id === wager.userId)?.name || 'Unknown user',
  })));
});

app.post('/api/wagers', authMiddleware, async (req, res) => {
  const { marketId, team, stake } = req.body;

  if (!marketId || !team || !stake || Number(stake) <= 0) {
    return res.status(400).json({ message: 'Valid market, side, and stake are required.' });
  }

  const market = markets.find((item) => item.id === marketId);

  if (!market) {
    return res.status(404).json({ message: 'Market not found.' });
  }

  const selectedOdds = team === market.teamA ? market.oddsA : market.oddsB;
  const commission = Number(stake) * 0.05;
  const potentialWin = Number(stake) * selectedOdds;

  const currentUser = req.user;

  if (mongoReady) {
    // persist wager
    const w = new Wager({
      userId: currentUser._id || currentUser.id,
      marketId,
      team,
      stake: Number(stake),
      odds: selectedOdds,
      commission,
      potentialReturn: potentialWin,
      status: 'Pending',
    });
    await w.save();

    // deduct stake from user's balance
    await User.findByIdAndUpdate(currentUser._id || currentUser.id, { $inc: { balance: -Number(stake) } });

    return res.status(201).json({
      message: 'Wager created successfully.',
      market: market.title,
      selectedTeam: team,
      stake: Number(stake),
      odds: selectedOdds,
      commission,
      potentialReturn: potentialWin,
      status: 'Pending settlement',
    });
  }

  const newWager = {
    id: `w-${Date.now()}`,
    userId: currentUser.id,
    marketId,
    team,
    stake: Number(stake),
    odds: selectedOdds,
    commission,
    potentialReturn: potentialWin,
    status: 'Pending',
  };

  wagers.unshift(newWager);

  return res.status(201).json({
    message: 'Wager created successfully.',
    market: market.title,
    selectedTeam: team,
    stake: Number(stake),
    odds: selectedOdds,
    commission,
    potentialReturn: potentialWin,
    status: 'Pending settlement',
  });
});

app.put('/api/admin/wagers/:id/settle', authMiddleware, adminOnly, async (req, res) => {
  const id = req.params.id;

  if (mongoReady) {
    const wager = await Wager.findById(id);
    if (!wager) return res.status(404).json({ message: 'Wager not found.' });

    wager.status = 'Settled';
    await wager.save();

    // payout
    await User.findByIdAndUpdate(wager.userId, { $inc: { balance: wager.potentialReturn } });

    return res.json({ message: 'Wager settled and payout recorded.', wager });
  }

  const wager = wagers.find((entry) => entry.id === id);

  if (!wager) {
    return res.status(404).json({ message: 'Wager not found.' });
  }

  wager.status = 'Settled';

  const user = users.find((entry) => entry.id === wager.userId);
  if (user) {
    user.balance += wager.potentialReturn;
  }

  return res.json({ message: 'Wager settled and payout recorded.', wager });
});

startMongo().then(() => {
  app.listen(PORT, () => {
    console.log(`NAMIBETS API running on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('Failed to start server.', error);
  process.exit(1);
});

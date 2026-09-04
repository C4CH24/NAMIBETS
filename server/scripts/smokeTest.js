const API = 'http://localhost:4001'

async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return res.json()
}

async function createWager(token) {
  const res = await fetch(`${API}/api/wagers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ marketId: 'm-101', team: 'Kiboko FC', stake: 1000 }),
  })
  return res.json()
}

async function listAdminWagers(token) {
  const res = await fetch(`${API}/api/admin/wagers`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function run() {
  console.log('Logging in as fan...')
  const fan = await login('fan@namibets.com', 'demo123')
  console.log('Fan login:', fan.token ? 'OK' : fan)

  if (fan.token) {
    const w = await createWager(fan.token)
    console.log('Create wager response:', w)
  }

  console.log('Logging in as admin...')
  const admin = await login('admin@namibets.com', 'admin123')
  console.log('Admin login:', admin.token ? 'OK' : admin)

  if (admin.token) {
    const wagers = await listAdminWagers(admin.token)
    console.log('Admin wagers:', wagers)
  }
}

run().catch((e) => { console.error(e); process.exit(1) })

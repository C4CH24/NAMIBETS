import { useEffect, useMemo, useState } from 'react'

type User = {
  id: string
  name: string
  email: string
  role: string
  balance: number
  tier: string
  streak: number
}

type Overview = {
  user: User
  stats: Array<{ label: string; value: string | number; change: string }>
  recentSettlements: Array<{ id: string; title: string; amount: string; status: string }>
}

type Market = {
  id: string
  title: string
  stage: string
  teamA: string
  teamB: string
  oddsA: number
  oddsB: number
  pool: number
  status: string
  time: string
}

type Tournament = {
  id: string
  name: string
  prize: string
  entrants: number
  progress: string
  status: string
}

type AdminWager = {
  id: string
  user: string
  team: string
  stake: number
  status: string
}

const money = (value: number) => `KES ${value.toLocaleString()}`

// Cast import.meta to any to access Vite env vars without TS complaints.
// Default to a relative path so the app works when served from the same origin.
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? ''

function App() {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [token, setToken] = useState<string | null>(localStorage.getItem('namibets-token'))
  const [user, setUser] = useState<User | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null)
  const [stake, setStake] = useState<number>(500)
  const [selectedTeam, setSelectedTeam] = useState<'teamA' | 'teamB'>('teamA')
  const [wagerResult, setWagerResult] = useState<string | null>(null)
  const [adminWagers, setAdminWagers] = useState<AdminWager[]>([])
  const [authForm, setAuthForm] = useState({ name: '', email: 'fan@namibets.com', password: 'demo123' })

  useEffect(() => {
    if (!token) return

    const fetchData = async () => {
      const [overviewRes, marketsRes, tournamentsRes] = await Promise.all([
        fetch(`${API_BASE}/api/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/api/markets`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/api/tournaments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (!overviewRes.ok) {
        setToken(null)
        localStorage.removeItem('namibets-token')
        return
      }

      const overviewData = await overviewRes.json()
      const marketsData = await marketsRes.json()
      const tournamentsData = await tournamentsRes.json()

      setOverview(overviewData)
      setUser(overviewData.user)
      setMarkets(marketsData)
      setTournaments(tournamentsData)
      setSelectedMarket(marketsData[0])
    }

    fetchData()
  }, [token])

  useEffect(() => {
    if (!token) return
    if (!overview || overview.user?.role !== 'admin') return

    fetch(`${API_BASE}/api/admin/wagers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAdminWagers(data))
      .catch(() => setAdminWagers([]))
  }, [token, overview])

  const odds = useMemo(() => {
    if (!selectedMarket) return { main: 1, alt: 1 }
    return {
      main: selectedTeam === 'teamA' ? selectedMarket.oddsA : selectedMarket.oddsB,
      alt: selectedTeam === 'teamA' ? selectedMarket.oddsB : selectedMarket.oddsA,
    }
  }, [selectedMarket, selectedTeam])

  const handleAuth = async () => {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup'
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: authMode === 'signup' ? authForm.name : undefined,
        email: authForm.email,
        password: authForm.password,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      alert(data.message || 'Authentication failed.')
      return
    }

    localStorage.setItem('namibets-token', data.token)
    setToken(data.token)
    setUser(data.user)
  }

  const handleWager = async () => {
    if (!selectedMarket || !token) return

    const res = await fetch(`${API_BASE}/api/wagers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        marketId: selectedMarket.id,
        team: selectedTeam === 'teamA' ? selectedMarket.teamA : selectedMarket.teamB,
        stake,
      }),
    })

    const data = await res.json()
    setWagerResult(`${data.message} ${data.selectedTeam} • Potential return: KES ${Math.round(data.potentialReturn).toLocaleString()}`)
  }

  const handleAdminSettle = async (wagerId: string) => {
    if (!token) return

    await fetch(`${API_BASE}/api/admin/wagers/${wagerId}/settle`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    })

    setAdminWagers((prev) => prev.map((wager) => (
      wager.id === wagerId ? { ...wager, status: 'Settled' } : wager
    )))
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-mark">N</div>
            <div>
              <p className="eyebrow">Competitive gaming • peer-to-peer wagering</p>
              <h1>NAMIBETS</h1>
            </div>
          </div>

          <div className="tab-row">
            <button
              type="button"
              className={authMode === 'login' ? 'tab active' : 'tab'}
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'signup' ? 'tab active' : 'tab'}
              onClick={() => setAuthMode('signup')}
            >
              Sign up
            </button>
          </div>

          <div className="auth-form">
            {authMode === 'signup' && (
              <label>
                Full name
                <input
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="Your name"
                />
              </label>
            )}

            <label>
              Email address
              <input
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder="name@email.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="Enter password"
              />
            </label>

            <button type="button" className="primary-btn full-width" onClick={handleAuth}>
              {authMode === 'login' ? 'Login to dashboard' : 'Create account'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!overview || !user) {
    return <div className="loading-state">Loading NAMIBETS platform...</div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">N</div>
          <div>
            <p className="eyebrow">Competitive gaming • peer-to-peer wagering</p>
            <h1>NAMIBETS</h1>
          </div>
        </div>

        <nav className="nav">
          <a href="#dashboard">Dashboard</a>
          <a href="#markets">Markets</a>
          <a href="#tournaments">Tournaments</a>
          <a href="#wallet">Wallet</a>
        </nav>

        <div className="header-actions">
          <span className="user-pill">{user.name}</span>
          <button
            className="secondary-btn"
            onClick={() => {
              localStorage.removeItem('namibets-token')
              setToken(null)
              setUser(null)
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main>
        <section id="dashboard" className="hero">
          <div className="hero-copy">
            <span className="spotlight">Secure esports wagering</span>
            <h2>Peer-to-peer betting for serious competitive gamers.</h2>
            <p>
              Challenge a rival, lock a stake, and settle outcomes with a transparent commission model built for
              trust, speed, and community engagement.
            </p>

            <div className="hero-actions">
              <button className="primary-btn large">Create Wager</button>
              <button className="secondary-btn large">View Leaderboard</button>
            </div>

            <div className="stat-grid">
              {overview.stats.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <span>{stat.label}</span>
                  <strong>{String(stat.value)}</strong>
                  <em>{stat.change}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-head">
              <span>Live Markets</span>
              <span className="live-pill">Live</span>
            </div>

            <div className="market-list">
              {markets.slice(0, 3).map((market) => (
                <button
                  key={market.id}
                  className={`market-item ${selectedMarket?.id === market.id ? 'selected' : ''}`}
                  onClick={() => setSelectedMarket(market)}
                  type="button"
                >
                  <div>
                    <span className="market-item-title">{market.title}</span>
                    <p>{market.stage}</p>
                  </div>
                  <div className="odds-box">
                    <small>{market.status}</small>
                    <strong>{market.oddsA.toFixed(2)} / {market.oddsB.toFixed(2)}</strong>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="utility-row" id="wallet">
          <div className="wallet-panel">
            <span className="kicker">Wallet</span>
            <h3>{money(user.balance)}</h3>
            <p>{user.tier} • {user.streak}-match streak</p>
          </div>

          <div className="wallet-panel accent">
            <span className="kicker">Platform fee</span>
            <h3>5% commission</h3>
            <p>Transparent, fixed, and visible before every bet is locked.</p>
          </div>
        </section>

        <section className="section-block" id="markets">
          <div className="section-heading">
            <span className="kicker">Open bets</span>
            <h3>Match marketplace</h3>
          </div>

          <div className="bet-layout">
            <div className="bet-card large-card">
              {selectedMarket && (
                <>
                  <div className="match-header">
                    <div>
                      <span className="tiny-label">{selectedMarket.stage}</span>
                      <h4>{selectedMarket.title}</h4>
                    </div>
                    <span className="status-badge">{selectedMarket.status}</span>
                  </div>

                  <div className="teams-row">
                    <button
                      type="button"
                      className={`team-button ${selectedTeam === 'teamA' ? 'active' : ''}`}
                      onClick={() => setSelectedTeam('teamA')}
                    >
                      <span>{selectedMarket.teamA}</span>
                      <strong>{selectedMarket.oddsA.toFixed(2)}</strong>
                    </button>

                    <span className="vs">vs</span>

                    <button
                      type="button"
                      className={`team-button ${selectedTeam === 'teamB' ? 'active' : ''}`}
                      onClick={() => setSelectedTeam('teamB')}
                    >
                      <span>{selectedMarket.teamB}</span>
                      <strong>{selectedMarket.oddsB.toFixed(2)}</strong>
                    </button>
                  </div>

                  <div className="stake-box">
                    <label htmlFor="stake">Stake amount</label>
                    <input
                      id="stake"
                      type="number"
                      min={100}
                      step={50}
                      value={stake}
                      onChange={(e) => setStake(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div className="summary-row">
                    <span>Pool</span>
                    <strong>{money(selectedMarket.pool)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Selected side</span>
                    <strong>{selectedTeam === 'teamA' ? selectedMarket.teamA : selectedMarket.teamB}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Odds</span>
                    <strong>{odds.main.toFixed(2)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Potential return</span>
                    <strong>{money(stake * odds.main)}</strong>
                  </div>

                  <button type="button" className="primary-btn full-width" onClick={handleWager}>
                    Lock Wager
                  </button>

                  {wagerResult && <div className="result-banner">{wagerResult}</div>}
                </>
              )}
            </div>

            <div className="bet-card side-card">
              <div className="mini-header">
                <span className="kicker">Recent settlements</span>
              </div>
              <div className="settlement-list">
                {overview.recentSettlements.map((entry) => (
                  <div key={entry.id} className="settlement-item">
                    <div>
                      <strong>{entry.title}</strong>
                      <small>{entry.id}</small>
                    </div>
                    <div className="settlement-meta">
                      <span>{entry.amount}</span>
                      <em>{entry.status}</em>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section-block" id="tournaments">
          <div className="section-heading">
            <span className="kicker">Community competitions</span>
            <h3>Tournament mode</h3>
          </div>

          <div className="tournament-grid">
            {tournaments.map((tournament) => (
              <div key={tournament.id} className="tournament-card">
                <div className="tournament-top">
                  <h4>{tournament.name}</h4>
                  <span className="status-badge alt">{tournament.status}</span>
                </div>
                <p>{tournament.prize}</p>
                <ul>
                  <li>{tournament.entrants} entrants</li>
                  <li>{tournament.progress}</li>
                </ul>
                <button type="button" className="secondary-btn full-width">Join bracket</button>
              </div>
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <span className="kicker">Platform enhancements</span>
            <h3>Features that strengthen trust and engagement</h3>
          </div>

          <div className="improvement-grid">
            {[
              { title: 'Spectator & Group Betting', text: 'Allow friends, communities, and fans to participate in match rooms and group wagers from a single lobby.' },
              { title: 'Skill-Based Matching', text: 'Match players by ranking and rating to improve fairness, retention, and competitive integrity.' },
              { title: 'Tournament Mode', text: 'Run seasonal cups, bracket entries, and pooled prize structures that reward consistency and skill.' },
              { title: 'Live Result Verification', text: 'Use verifiable match outcomes and dispute resolution to reduce fraud and increase confidence.' },
              { title: 'Ethical Gamification', text: 'Reward streaks, badges, and performance milestones in a responsible, user-focused experience.' },
              { title: 'Data Visualization', text: 'Deliver win/loss charts, trends, and performance insights to deepen user trust and engagement.' },
            ].map((item) => (
              <article key={item.title} className="improvement-card">
                <h4>{item.title}</h4>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        {user.role === 'admin' && (
          <section className="section-block">
            <div className="section-heading">
              <span className="kicker">Admin controls</span>
              <h3>Wager management</h3>
            </div>

            <div className="admin-panel">
              {adminWagers.length === 0 ? (
                <p>No wagers pending review.</p>
              ) : (
                adminWagers.map((wager) => (
                  <div key={wager.id} className="admin-row">
                    <div>
                      <strong>{wager.user}</strong>
                      <small>{wager.team}</small>
                    </div>
                    <div>
                      <span>{money(wager.stake)}</span>
                    </div>
                    <div className="admin-status">{wager.status}</div>
                    {wager.status !== 'Settled' && (
                      <button type="button" className="secondary-btn" onClick={() => handleAdminSettle(wager.id)}>
                        Settle
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Send, 
  Flame, 
  RotateCcw, 
  Settings2, 
  Server, 
  Database, 
  CheckCircle2, 
  Clock, 
  Layers 
} from 'lucide-react';

export default function App() {
  const [algo, setAlgo] = useState('token_bucket');
  const [capacity, setCapacity] = useState(5);
  const [refillRate, setRefillRate] = useState(1);
  const [limit, setLimit] = useState(5);
  const [windowSec, setWindowSec] = useState(5);

  const [remaining, setRemaining] = useState(5);
  const [maxLimit, setMaxLimit] = useState(5);
  const [retryAfter, setRetryAfter] = useState(0);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Countdown timer for 429 lockouts
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => Math.max(0, parseFloat((prev - 0.1).toFixed(1))));
    }, 100);
    return () => clearInterval(timer);
  }, [retryAfter]);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const sendRequest = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/ping', {
        method: 'GET',
        headers: { 
          'X-Algorithm': algo 
        },
      });

      // Parse headers
      const rem = res.headers.get('X-RateLimit-Remaining');
      const lim = res.headers.get('X-RateLimit-Limit');
      const retry = res.headers.get('Retry-After');

      if (rem !== null) setRemaining(parseInt(rem, 10));
      if (lim !== null) setMaxLimit(parseInt(lim, 10));

      if (res.status === 429) {
        // Blocked by limiter!
        const retrySeconds = retry ? parseFloat(retry) : 2.0;
        setRemaining(0);
        setRetryAfter(retrySeconds);

        const newLog = {
          id: Math.random().toString(36).substr(2, 9),
          time: new Date().toLocaleTimeString(),
          status: 429,
          algo: algo === 'token_bucket' ? 'Token Bucket' : 'Sliding Window',
          detail: `429 Blocked — Rate limit exceeded (Retry in ${retrySeconds}s)`,
        };
        setLogs((prev) => [newLog, ...prev.slice(0, 14)]);
        return;
      }

      // If allowed (200 OK)
      setRetryAfter(0);
      const newLog = {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString(),
        status: 200,
        algo: algo === 'token_bucket' ? 'Token Bucket' : 'Sliding Window',
        detail: `200 OK — Request allowed (${rem ?? 0} tokens left)`,
      };
      setLogs((prev) => [newLog, ...prev.slice(0, 14)]);

    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  const simulateBurst = async (count = 6) => {
    setLoading(true);
    await Promise.all(Array.from({ length: count }, () => sendRequest()));
    setLoading(false);
  };

  const applyConfig = async () => {
    try {
      const endpoint = algo === 'token_bucket' 
        ? 'http://127.0.0.1:8000/api/config/token-bucket' 
        : 'http://127.0.0.1:8000/api/config/sliding-window';

      const payload = algo === 'token_bucket'
        ? { capacity: Number(capacity), refill_rate: Number(refillRate) }
        : { limit: Number(limit), window_seconds: Number(windowSec) };

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setMaxLimit(algo === 'token_bucket' ? Number(capacity) : Number(limit));
      showNotification('Configuration synced to Redis successfully.');
    } catch (err) {
      console.error('Config sync error:', err);
    }
  };

  const quotaPercent = Math.min(100, Math.max(0, (remaining / maxLimit) * 100));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      
      {/* Top Navbar */}
      <nav style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: '#2563eb', padding: '6px', borderRadius: '8px', color: '#ffffff', display: 'flex' }}>
              <Layers size={20} />
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>RateLimter.</span>
              <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>v1.0</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: '#64748b' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Server size={14} color="#16a34a" /> FastAPI</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Database size={14} color="#ea580c" /> Upstash Redis</span>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main style={{ maxWidth: '1080px', margin: '32px auto', padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '28px' }}>
        
        {/* Left Column: Control Panel */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Settings2 size={18} color="#2563eb" />
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Traffic Engine Settings</h2>
            </div>

            {/* Algorithm Switcher Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px', marginBottom: '20px' }}>
              <button 
                onClick={() => setAlgo('token_bucket')}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: algo === 'token_bucket' ? '#ffffff' : 'transparent',
                  color: algo === 'token_bucket' ? '#0f172a' : '#64748b',
                  boxShadow: algo === 'token_bucket' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Token Bucket
              </button>
              <button 
                onClick={() => setAlgo('sliding_window')}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: algo === 'sliding_window' ? '#ffffff' : 'transparent',
                  color: algo === 'sliding_window' ? '#0f172a' : '#64748b',
                  boxShadow: algo === 'sliding_window' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Sliding Window
              </button>
            </div>

            {/* Parameter Inputs */}
            {algo === 'token_bucket' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', fontWeight: 500 }}>
                    <span>Bucket Capacity</span>
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{capacity} tokens</span>
                  </div>
                  <input 
                    type="range" min="1" max="20" value={capacity} 
                    onChange={(e) => setCapacity(e.target.value)}
                    style={{ width: '100%', accentColor: '#2563eb' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', fontWeight: 500 }}>
                    <span>Refill Rate</span>
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{refillRate} token/sec</span>
                  </div>
                  <input 
                    type="range" min="1" max="10" value={refillRate} 
                    onChange={(e) => setRefillRate(e.target.value)}
                    style={{ width: '100%', accentColor: '#2563eb' }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', fontWeight: 500 }}>
                    <span>Window Request Capacity</span>
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{limit} requests</span>
                  </div>
                  <input 
                    type="range" min="1" max="20" value={limit} 
                    onChange={(e) => setLimit(e.target.value)}
                    style={{ width: '100%', accentColor: '#2563eb' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', fontWeight: 500 }}>
                    <span>Sliding Window Size</span>
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{windowSec} seconds</span>
                  </div>
                  <input 
                    type="range" min="2" max="30" value={windowSec} 
                    onChange={(e) => setWindowSec(e.target.value)}
                    style={{ width: '100%', accentColor: '#2563eb' }}
                  />
                </div>
              </div>
            )}

            {/* ... Range sliders for capacity / refillRate end here ... */}

            {/* REPLACE the old config button with this: */}
            <button 
              className="btn-tactile"
              onClick={applyConfig}
              style={{
                marginTop: '24px',
                width: '100%',
                padding: '11px',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 3px 0 #020617, 0 4px 8px rgba(15,23,42,0.15)',
              }}
            >
              <RotateCcw size={14} /> Update Rate Configuration
            </button>

            {notification && (
              <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#16a34a', textAlign: 'center', fontWeight: 500 }}>
                {notification}
              </p>
            )}
          </div>

          {/* Trigger Dispatcher */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px 0' }}>Dispatch Requests</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              
              {/* BUTTON 1: SEND 1 PING */}
              <button 
                className="btn-tactile"
                onClick={sendRequest}
                disabled={loading}
                style={{
                  padding: '12px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 0 #1d4ed8, 0 6px 12px rgba(37,99,235,0.25)',
                }}
              >
                <Send size={15} /> Send 1 Ping
              </button>

              {/* BUTTON 2: BURST */}
              <button 
                className="btn-tactile"
                onClick={() => simulateBurst(6)}
                disabled={loading}
                style={{
                  padding: '12px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 0 #b91c1c, 0 6px 12px rgba(239,68,68,0.25)',
                }}
              >
                <Flame size={15} /> Burst (6 Pings)
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Gauges & Observability Log */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Status Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Capacity Headroom</span>
              <div style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0', color: remaining > 0 ? '#0f172a' : '#ef4444' }}>
                {remaining} <span style={{ fontSize: '16px', fontWeight: 500, color: '#94a3b8' }}>/ {maxLimit}</span>
              </div>
              <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${quotaPercent}%`, 
                    backgroundColor: quotaPercent > 20 ? '#2563eb' : '#ef4444', 
                    transition: 'width 0.25s ease' 
                  }} 
                />
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cooldown State</span>
              <div style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0', color: retryAfter > 0 ? '#ea580c' : '#16a34a' }}>
                {retryAfter > 0 ? `${retryAfter}s` : 'Clear'}
              </div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> {retryAfter > 0 ? 'Retry-After throttling' : 'Ready for execution'}
              </span>
            </div>
          </div>

          {/* Activity Logs */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Network Stream</h2>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Latest 15 calls</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
              {logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '13px' }}>
                  No requests recorded. Use the action triggers to inspect live rate limiting.
                </div>
              ) : (
                logs.map((log) => (
                  <div 
                    key={log.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: log.status === 200 ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${log.status === 200 ? '#dcfce7' : '#fee2e2'}`,
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {log.status === 200 ? (
                        <ShieldCheck size={16} color="#16a34a" />
                      ) : (
                        <ShieldAlert size={16} color="#ef4444" />
                      )}
                      <div>
                        <span style={{ fontWeight: 600, color: log.status === 200 ? '#15803d' : '#b91c1c' }}>
                          HTTP {log.status}
                        </span>
                        <span style={{ margin: '0 6px', color: '#cbd5e1' }}>•</span>
                        <span style={{ color: '#475569', fontSize: '12px' }}>{log.detail}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', backgroundColor: '#ffffff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                        {log.algo}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{log.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
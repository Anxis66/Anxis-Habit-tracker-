import { useState, useEffect, useMemo } from 'react';

const HABITS = [
  { key: 'Water (3L)', label: '3L water', icon: '💧' },
  { key: 'Sleep (7+ hrs)', label: '7+ hours sleep', icon: '😴' },
  { key: 'Protein Goal', label: 'Hit protein goal', icon: '🍗' },
  { key: 'Steps (5k+)', label: '5k+ steps', icon: '🚶' },
];
const TARGET = 3;

function scoreForRecord(fields) {
  if (!fields) return 0;
  return HABITS.reduce((sum, h) => sum + (fields[h.key] ? 1 : 0), 0);
}

function toISODate(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

function computeStreak(dates) {
  const hitSet = new Set(dates);
  let cursor = new Date();
  if (!hitSet.has(toISODate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (hitSet.has(toISODate(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return current;
}

export default function AdminDashboard() {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem('anxis_admin_unlocked') === '1') {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/habits');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load data.');
        setAllRecords(data.records || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [unlocked]);

  const byMember = useMemo(() => {
    const map = {};
    for (const rec of allRecords) {
      const name = rec.fields['Member Name'];
      if (!name) continue;
      if (!map[name]) map[name] = [];
      map[name].push(rec);
    }
    return map;
  }, [allRecords]);

  const memberSummaries = useMemo(() => {
    const last7 = daysAgoISO(6);
    return Object.entries(byMember)
      .map(([name, recs]) => {
        const sorted = [...recs].sort((a, b) => (a.fields.Date < b.fields.Date ? 1 : -1));
        const lastEntry = sorted[0];
        const hitDates = recs.filter((r) => scoreForRecord(r.fields) >= TARGET).map((r) => r.fields.Date);
        const streak = computeStreak(hitDates);
        const last7Recs = recs.filter((r) => r.fields.Date >= last7);
        const weeklyAvg =
          last7Recs.length > 0
            ? (last7Recs.reduce((s, r) => s + scoreForRecord(r.fields), 0) / last7Recs.length).toFixed(1)
            : '0.0';
        const daysSinceLastEntry = lastEntry
          ? Math.round((new Date(toISODate(new Date())) - new Date(lastEntry.fields.Date)) / 86400000)
          : null;
        return { name, streak, weeklyAvg, daysSinceLastEntry, lastEntry, totalDays: recs.length, records: sorted };
      })
      .sort((a, b) => (a.daysSinceLastEntry ?? 999) - (b.daysSinceLastEntry ?? 999));
  }, [byMember]);

  const topStats = useMemo(() => {
    const totalMembers = memberSummaries.length;
    const avgStreak = totalMembers
      ? (memberSummaries.reduce((s, m) => s + m.streak, 0) / totalMembers).toFixed(1)
      : '0.0';
    const activeToday = memberSummaries.filter((m) => m.daysSinceLastEntry === 0).length;
    const slacking = memberSummaries.filter((m) => (m.daysSinceLastEntry ?? 999) >= 3).length;
    return { totalMembers, avgStreak, activeToday, slacking };
  }, [memberSummaries]);

  if (!unlocked) {
    return (
      <div style={styles.gate}>
        <div style={styles.gateCard}>
          <p style={styles.gateEyebrow}>Anxis</p>
          <h1 style={styles.gateTitle}>Admin dashboard</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Lightweight gate, not real auth — swap for something stronger before scaling admin access.
              if (passcode.trim().length > 0) {
                window.sessionStorage.setItem('anxis_admin_unlocked', '1');
                setUnlocked(true);
              }
            }}
            style={{ display: 'flex', gap: 8, marginTop: 20 }}
          >
            <input
              autoFocus
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Admin passcode"
              style={styles.input}
            />
            <button type="submit" style={styles.primaryBtn}>Enter</button>
          </form>
          <p style={styles.gateNote}>
            This is a soft gate for v1 — anyone with the link and a passcode gets in. Fine for a small trusted team; upgrade before wide rollout.
          </p>
        </div>
      </div>
    );
  }

  if (selectedMember) {
    const m = memberSummaries.find((x) => x.name === selectedMember);
    return (
      <div style={styles.page}>
        <button onClick={() => setSelectedMember(null)} style={styles.backBtn}>← All members</button>
        <h1 style={styles.h1}>{m.name}</h1>
        <section style={styles.statsRow}>
          <StatCard icon="🔥" value={m.streak} label="Current streak" />
          <StatCard icon="📊" value={m.weeklyAvg} label="7-day avg" />
          <StatCard icon="📅" value={m.totalDays} label="Days logged" />
        </section>

        <section style={styles.card}>
          <p style={styles.sectionLabel}>Recent entries</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {m.records.slice(0, 14).map((r) => {
              const score = scoreForRecord(r.fields);
              return (
                <div key={r.id} style={styles.entryRow}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.fields.Date}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: score >= TARGET ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {score}/{HABITS.length}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section style={styles.card}>
          <p style={styles.sectionLabel}>Weekly non-negotiables</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {m.records
              .filter((r) => r.fields['Weekly Non-Negotiable'])
              .slice(0, 5)
              .map((r) => (
                <div key={r.id} style={styles.nnCard}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.fields.Date}</span>
                  <p style={{ fontSize: 14, marginTop: 4 }}>{r.fields['Weekly Non-Negotiable']}</p>
                </div>
              ))}
            {m.records.filter((r) => r.fields['Weekly Non-Negotiable']).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No non-negotiables logged yet.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Anxis · admin</p>
      <h1 style={styles.h1}>Habit tracker overview</h1>

      {error && <div style={styles.errorBar}>{error}</div>}
      {loading && <p style={styles.loadingText}>Loading…</p>}

      {!loading && (
        <>
          <section style={styles.statsRow}>
            <StatCard icon="👥" value={topStats.totalMembers} label="Members tracked" />
            <StatCard icon="🔥" value={topStats.avgStreak} label="Avg streak" />
            <StatCard icon="✅" value={topStats.activeToday} label="Checked in today" />
            <StatCard icon="⚠️" value={topStats.slacking} label="3+ days quiet" />
          </section>

          <section style={styles.card}>
            <p style={styles.sectionLabel}>Members</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {memberSummaries.map((m) => {
                const isQuiet = (m.daysSinceLastEntry ?? 999) >= 3;
                return (
                  <button key={m.name} onClick={() => setSelectedMember(m.name)} style={styles.memberRow}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {m.daysSinceLastEntry === 0
                          ? 'Checked in today'
                          : m.daysSinceLastEntry === 1
                          ? 'Last check-in: yesterday'
                          : m.daysSinceLastEntry === null
                          ? 'No entries yet'
                          : `Last check-in: ${m.daysSinceLastEntry} days ago`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {isQuiet && <span style={styles.warnBadge}>Slacking</span>}
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🔥 {m.streak}</span>
                      <span style={{ color: 'var(--text-muted)' }}>›</span>
                    </div>
                  </button>
                );
              })}
              {memberSummaries.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No members have checked in yet.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={styles.statValue}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

const styles = {
  gate: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  gateCard: {
    maxWidth: 380,
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '32px 28px',
  },
  gateEyebrow: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 },
  gateTitle: { fontSize: 22, fontWeight: 700, marginTop: 8 },
  gateNote: { fontSize: 12, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 },
  input: {
    flex: 1,
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 14px',
    color: 'var(--text-primary)',
    fontSize: 15,
    outline: 'none',
  },
  primaryBtn: {
    background: 'var(--accent)',
    color: '#06231a',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 18px',
    fontWeight: 600,
    fontSize: 14,
  },
  page: { maxWidth: 520, margin: '0 auto', padding: '28px 18px 60px', display: 'flex', flexDirection: 'column', gap: 16 },
  eyebrow: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 },
  h1: { fontSize: 22, fontWeight: 700 },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 13,
    alignSelf: 'flex-start',
    padding: 0,
  },
  errorBar: { background: 'var(--red-dim)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13 },
  loadingText: { fontSize: 13, color: 'var(--text-muted)' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  statCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '14px 6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: 700 },
  statLabel: { fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 },
  sectionLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  memberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '12px 14px',
    color: 'var(--text-primary)',
    textAlign: 'left',
  },
  warnBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--amber)',
    background: 'var(--amber-dim)',
    padding: '3px 8px',
    borderRadius: 999,
  },
  entryRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' },
  nnCard: { background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12 },
};

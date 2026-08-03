import { useState, useEffect, useMemo, useCallback } from 'react';

const HABITS = [
  { key: 'Water (3L)', label: '3L water', icon: '💧' },
  { key: 'Sleep (7+ hrs)', label: '7+ hours sleep', icon: '😴' },
  { key: 'Protein Goal', label: 'Hit protein goal', icon: '🍗' },
  { key: 'Steps (5k+)', label: '5k+ steps', icon: '🚶' },
];
const TARGET = 3; // hit at least 3/4 daily

function toISODate(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

function startOfWeekMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function scoreForRecord(fields) {
  if (!fields) return 0;
  return HABITS.reduce((sum, h) => sum + (fields[h.key] ? 1 : 0), 0);
}

function computeStreaks(recordsByDate) {
  const dates = Object.keys(recordsByDate)
    .filter((d) => scoreForRecord(recordsByDate[d]) >= TARGET)
    .sort();
  if (dates.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const cur = new Date(dates[i]);
    const diffDays = Math.round((cur - prev) / 86400000);
    if (diffDays === 1) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
  }

  // current streak: walk backward from today (or most recent hit day)
  const todaysISO = toISODate(new Date());
  let cursor = new Date(todaysISO);
  let current = 0;
  const hitSet = new Set(dates);
  // if today isn't hit yet, start checking from yesterday
  if (!hitSet.has(toISODate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (hitSet.has(toISODate(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, best };
}

export default function HabitTracker() {
  const [memberName, setMemberName] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [records, setRecords] = useState({}); // { 'YYYY-MM-DD': { id, fields } }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [nonNegotiableDraft, setNonNegotiableDraft] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('anxis_member_name') : null;
    if (stored) setMemberName(stored);
  }, []);

  const loadRecords = useCallback(async (name) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/habits?member=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your data.');
      const map = {};
      for (const rec of data.records || []) {
        const dateVal = rec.fields['Date'];
        if (dateVal) map[dateVal] = { id: rec.id, fields: rec.fields };
      }
      setRecords(map);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (memberName) loadRecords(memberName);
  }, [memberName, loadRecords]);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    window.localStorage.setItem('anxis_member_name', trimmed);
    setMemberName(trimmed);
  };

  const switchMember = () => {
    window.localStorage.removeItem('anxis_member_name');
    setMemberName(null);
    setNameInput('');
    setRecords({});
  };

  const todayISO = toISODate(new Date());
  const selectedRecord = records[selectedDate];
  const selectedFields = selectedRecord?.fields || {};
  const selectedScore = scoreForRecord(selectedFields);

  const { current: currentStreak, best: bestStreak } = useMemo(
    () => computeStreaks(records),
    [records]
  );

  const daysTracked = useMemo(
    () => Object.values(records).filter((r) => scoreForRecord(r.fields) > 0).length,
    [records]
  );

  const toggleHabit = async (habitKey) => {
    if (!memberName || saving) return;
    setSaving(true);
    setError('');
    const currentVal = !!selectedFields[habitKey];
    const nextFields = { ...selectedFields, [habitKey]: !currentVal };
    // optimistic update
    setRecords((prev) => ({
      ...prev,
      [selectedDate]: { id: selectedRecord?.id, fields: { ...nextFields, 'Member Name': memberName, Date: selectedDate } },
    }));

    try {
      if (selectedRecord?.id) {
        const res = await fetch('/api/habits', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId: selectedRecord.id, fields: { [habitKey]: !currentVal } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } else {
        const res = await fetch('/api/habits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { 'Member Name': memberName, Date: selectedDate, [habitKey]: true },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRecords((prev) => ({ ...prev, [selectedDate]: { id: data.record.id, fields: data.record.fields } }));
      }
    } catch (e) {
      setError('Could not save that check. Try again.');
      loadRecords(memberName);
    } finally {
      setSaving(false);
    }
  };

  const saveNonNegotiable = async () => {
    if (!memberName || !nonNegotiableDraft.trim()) return;
    setSaving(true);
    try {
      if (selectedRecord?.id) {
        const res = await fetch('/api/habits', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId: selectedRecord.id, fields: { 'Weekly Non-Negotiable': nonNegotiableDraft } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRecords((prev) => ({ ...prev, [selectedDate]: { id: data.record.id, fields: data.record.fields } }));
      } else {
        const res = await fetch('/api/habits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { 'Member Name': memberName, Date: selectedDate, 'Weekly Non-Negotiable': nonNegotiableDraft },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRecords((prev) => ({ ...prev, [selectedDate]: { id: data.record.id, fields: data.record.fields } }));
      }
      setNonNegotiableDraft('');
    } catch (e) {
      setError('Could not save your non-negotiable. Try again.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setNonNegotiableDraft(selectedFields['Weekly Non-Negotiable'] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ---- Calendar grid ----
  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [viewMonth]);

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (!memberName) {
    return (
      <div style={styles.gate}>
        <div style={styles.gateCard}>
          <p style={styles.gateEyebrow}>Anxis</p>
          <h1 style={styles.gateTitle}>Habit and mindset tracker</h1>
          <p style={styles.gateSub}>Enter your name to see your streak and today&apos;s check-in.</p>
          <form onSubmit={handleNameSubmit} style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Your name"
              style={styles.input}
            />
            <button type="submit" style={styles.primaryBtn}>Continue</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Anxis · habit tracker</p>
          <h1 style={styles.h1}>Hey {memberName}</h1>
        </div>
        <button onClick={switchMember} style={styles.ghostBtn}>Not you?</button>
      </header>

      {error && <div style={styles.errorBar}>{error}</div>}

      <section style={styles.statsRow}>
        <StatCard icon="🔥" value={currentStreak} label="Current streak" />
        <StatCard icon="🏆" value={bestStreak} label="Best streak" />
        <StatCard icon="📅" value={daysTracked} label="Days tracked" />
      </section>

      <section style={styles.card}>
        <div style={styles.calHeader}>
          <button
            style={styles.navBtn}
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <span style={styles.calTitle}>{monthLabel}</span>
          <button
            style={styles.navBtn}
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            ›
          </button>
        </div>

        <div style={styles.weekDays}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} style={styles.weekDayLabel}>{d}</span>
          ))}
        </div>

        <div style={styles.grid}>
          {calendarCells.map((date, i) => {
            if (!date) return <div key={i} />;
            const iso = toISODate(date);
            const rec = records[iso];
            const score = scoreForRecord(rec?.fields);
            const isSelected = iso === selectedDate;
            const isToday = iso === todayISO;
            let bg = 'transparent';
            let textColor = 'var(--text-secondary)';
            if (score === HABITS.length) {
              bg = 'var(--accent)';
              textColor = '#06231a';
            } else if (score >= TARGET) {
              bg = 'var(--accent-dim)';
              textColor = 'var(--accent)';
            } else if (score > 0) {
              bg = 'var(--amber-dim)';
              textColor = 'var(--amber)';
            }
            return (
              <button
                key={iso}
                onClick={() => setSelectedDate(iso)}
                style={{
                  ...styles.dayCell,
                  background: bg,
                  color: textColor,
                  border: isSelected
                    ? '2px solid var(--text-primary)'
                    : isToday
                    ? '1px solid var(--border-strong)'
                    : '1px solid transparent',
                }}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div style={styles.legend}>
          <LegendDot color="var(--accent)" label={`${HABITS.length}/${HABITS.length}`} />
          <LegendDot color="var(--accent-dim)" textColor="var(--accent)" label={`${TARGET}-${HABITS.length - 1}/${HABITS.length}`} />
          <LegendDot color="var(--amber-dim)" textColor="var(--amber)" label={`1-${TARGET - 1}/${HABITS.length}`} />
          <LegendDot color="transparent" label="None" bordered />
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.dayHeaderRow}>
          <span style={styles.dayHeaderTitle}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <span
            style={{
              ...styles.scoreBadge,
              color: selectedScore >= TARGET ? 'var(--accent)' : 'var(--text-secondary)',
              background: selectedScore >= TARGET ? 'var(--accent-dim)' : 'var(--surface-raised)',
            }}
          >
            {selectedScore}/{HABITS.length}
          </span>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {HABITS.map((h) => {
            const checked = !!selectedFields[h.key];
            return (
              <button
                key={h.key}
                onClick={() => toggleHabit(h.key)}
                disabled={saving}
                style={{
                  ...styles.habitRow,
                  borderColor: checked ? 'var(--accent)' : 'var(--border)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    ...styles.checkbox,
                    background: checked ? 'var(--accent)' : 'transparent',
                    borderColor: checked ? 'var(--accent)' : 'var(--border-strong)',
                  }}
                >
                  {checked && <CheckIcon />}
                </span>
                <span style={{ fontSize: 18 }}>{h.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{h.label}</span>
              </button>
            );
          })}
        </div>

        {selectedScore >= TARGET && (
          <p style={styles.hitTarget}>Target hit for the day. Nice work.</p>
        )}
      </section>

      <section style={styles.card}>
        <p style={styles.weeklyLabel}>
          Weekly non-negotiable — week of {toISODate(startOfWeekMonday(new Date(selectedDate + 'T00:00:00')))}
        </p>
        <p style={styles.weeklySub}>What&apos;s the one thing you have to hit this week?</p>
        <textarea
          value={nonNegotiableDraft}
          onChange={(e) => setNonNegotiableDraft(e.target.value)}
          placeholder="e.g. Train 4x this week, no matter what"
          rows={3}
          style={styles.textarea}
        />
        <button
          onClick={saveNonNegotiable}
          disabled={saving || !nonNegotiableDraft.trim()}
          style={{ ...styles.primaryBtn, marginTop: 10, opacity: saving ? 0.6 : 1 }}
        >
          Save
        </button>
      </section>

      {loading && <p style={styles.loadingText}>Loading your data…</p>}

      <footer style={styles.footer}>
        <a href="/admin" style={styles.adminLink}>Admin dashboard →</a>
      </footer>
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={styles.statValue}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function LegendDot({ color, textColor, label, bordered }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 4,
          background: color,
          border: bordered ? '1px solid var(--border-strong)' : 'none',
        }}
      />
      {label}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06231a" strokeWidth="3">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const styles = {
  gate: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gateCard: {
    maxWidth: 380,
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '32px 28px',
  },
  gateEyebrow: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'var(--accent)',
    fontWeight: 600,
  },
  gateTitle: { fontSize: 24, fontWeight: 700, marginTop: 8 },
  gateSub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 },
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
  ghostBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 14px',
    fontSize: 13,
  },
  page: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '28px 18px 60px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 },
  h1: { fontSize: 22, fontWeight: 700, marginTop: 4 },
  errorBar: {
    background: 'var(--red-dim)',
    color: 'var(--red)',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
  },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  statCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 18,
  },
  calHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    background: 'var(--surface-raised)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    width: 32,
    height: 32,
    color: 'var(--text-primary)',
    fontSize: 16,
  },
  calTitle: { fontSize: 15, fontWeight: 600 },
  weekDays: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginTop: 16 },
  weekDayLabel: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 8 },
  dayCell: {
    aspectRatio: '1',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 500,
    background: 'transparent',
  },
  legend: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  dayHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dayHeaderTitle: { fontSize: 15, fontWeight: 600 },
  scoreBadge: { fontSize: 13, fontWeight: 600, padding: '4px 10px', borderRadius: 999 },
  habitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--surface-raised)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '12px 14px',
    color: 'var(--text-primary)',
    textAlign: 'left',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    border: '2px solid var(--border-strong)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hitTarget: { marginTop: 14, fontSize: 13, color: 'var(--accent)', fontWeight: 500 },
  weeklyLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  weeklySub: { fontSize: 15, fontWeight: 600, marginTop: 4 },
  textarea: {
    width: '100%',
    marginTop: 12,
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    padding: 12,
    color: 'var(--text-primary)',
    fontSize: 14,
    resize: 'vertical',
    outline: 'none',
  },
  loadingText: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' },
  footer: { textAlign: 'center', marginTop: 8 },
  adminLink: { fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' },
};

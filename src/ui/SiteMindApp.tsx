import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { sim, useClock } from '../sim/clock';
import {
  BREACH,
  PPE,
  EVENTS,
  FLOOR,
  TRIP,
  SITE_DATE,
  boardsInstalled,
  clockAt,
  floorProgress,
  programmeProgress,
  roomAt,
  type SiteEvent,
  type Severity,
} from '../sim/timeline';
import { I, Logo } from './icons';

const NAV = [
  { id: 'overview', label: 'Overview', icon: I.overview },
  { id: 'live', label: 'Live Intelligence', icon: I.live },
  { id: 'safety', label: 'Safety & Hazards', icon: I.safety },
  { id: 'progress', label: 'Construction Progress', icon: I.progress },
  { id: 'programme', label: 'Programme', icon: I.programme },
  { id: 'activity', label: 'Site Activity', icon: I.activity },
  { id: 'reports', label: 'Reports', icon: I.reports },
];

const FEATURE_FOR = 10; // seconds a new event stays expanded

const sevIcon = (s: Severity) => (s === 'critical' || s === 'warning' ? I.alert : s === 'success' ? I.check : I.info);

export default function SiteMindApp() {
  const { t } = useClock();
  const view = t >= FLOOR.navigate ? 'programme' : 'live';
  const received = EVENTS.filter((e) => e.t <= t).sort((a, b) => b.t - a.t);
  const unread = EVENTS.filter((e) => e.t > 0 && e.t <= t && e.t > t - 14).length;
  const pulse = EVENTS.some((e) => e.t > 0 && t >= e.t && t < e.t + 1.2);

  return (
    <div className="monitor">
      <div className="screen">
        <div className="app" data-app>
          <header className="topbar">
            <div className="brand">
              <Logo />
              <span className="wordmark">SITEMIND</span>
            </div>
            <div className="project">
              <span className="project-name">Central Tower Development</span>
              <I.chevron className="muted" />
            </div>
            <div className="topbar-right">
              <span className="live-pill">
                <span className="live-dot" /> Live
              </span>
              <span className="clock mono">
                {SITE_DATE.replace(' 2026', '')} · {clockAt(t)}
              </span>
              <span className={`bell ${pulse ? 'ring' : ''}`}>
                <I.bell />
                {unread > 0 && <span className="badge">{unread}</span>}
              </span>
              <span className="avatar">SM</span>
            </div>
          </header>
          <div className="app-body">
            <nav className="sidebar" aria-label="SiteMind navigation">
              {NAV.map((n) => {
                const active = (view === 'live' && n.id === 'live') || (view === 'programme' && n.id === 'programme');
                return (
                  <div key={n.id} className={`nav-item ${active ? 'active' : ''}`} data-cursor={`nav-${n.id}`}>
                    <n.icon />
                    <span>{n.label}</span>
                    {n.id === 'safety' && received.some((e) => e.severity === 'critical' && e.status(t).tone === 'critical') && <i className="nav-dot" />}
                  </div>
                );
              })}
              <div className="sidebar-foot">
                <div className="muted small">Sources online</div>
                <div className="mono src-count">64 / 64</div>
              </div>
            </nav>
            <main className="main">
              {view === 'live' ? (
                <div key="live" className="view view-in">
                  <LiveView t={t} received={received} />
                </div>
              ) : (
                <div key="prog" className="view view-in">
                  <ProgrammeView t={t} />
                </div>
              )}
            </main>
          </div>
          <Cursor />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function LiveView({ t, received }: { t: number; received: SiteEvent[] }) {
  const open = received.filter((e) => e.t > 0 && (e.status(t).tone === 'critical' || e.status(t).tone === 'warning')).length;
  const progressUpdates = 3 + received.filter((e) => e.id === 'floor').length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live Intelligence</h1>
          <div className="muted small">Every connected source on site, interpreted in real time</div>
        </div>
      </div>
      <div className="sources">
        <span><I.camera /> 22 cameras</span>
        <span><I.drone /> 3 drones</span>
        <span><I.sensor /> 48 sensors</span>
        <span><I.wearable /> 31 wearables</span>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Open alerts</div>
          <div className={`kpi-value ${open ? 'warn' : ''}`}>{open}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Workers on site</div>
          <div className="kpi-value">126</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Progress updates today</div>
          <div className="kpi-value">{progressUpdates}</div>
        </div>
      </div>
      <Tracking t={t} />
      <div className="feed-head">
        <span>Activity feed</span>
        <span className="muted small">Newest first</span>
      </div>
      <ul className="feed">
        <AnimatePresence initial={false}>
          {received.slice(0, 6).map((e) => {
            // only the newest live event is expanded
            const featured = e.t > 0 && t - e.t < FEATURE_FOR && e === received[0];
            return (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, x: 40, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className={`event sev-${e.severity} ${featured ? 'featured' : ''} ${featured && t - e.t < 1.6 ? 'fresh' : ''}`}
              >
                {featured ? <EventCard e={e} t={t} /> : <EventRow e={e} t={t} />}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <SiteOverview t={t} />
    </>
  );
}

/** compact level-by-level status strip, mirrors the highlights on the 3D site model */
function SiteOverview({ t }: { t: number }) {
  const state = (l: number): string => {
    if (l === 14 && t >= PPE.notify && t < BREACH.notify) return 'warning';
    if (l === 14 && t >= BREACH.notify) return t >= BREACH.exitCross + 0.6 ? 'cleared' : 'critical';
    if (l === 7 && t >= TRIP.notify) return 'warning';
    if (l === 9) return t >= FLOOR.notify ? 'success' : t >= 43.5 ? 'tracking' : '';
    if (l >= 15) return 'structure';
    return '';
  };
  return (
    <div className="overview">
      <div className="feed-head">
        <span>Site overview</span>
        <span className="legend-mini">
          <i className="lv critical" /> Alert <i className="lv warning" /> Hazard <i className="lv success" /> Progress
        </span>
      </div>
      <div className="levels">
        {Array.from({ length: 16 }, (_, i) => i + 1).map((l) => (
          <div key={l} className={`lvl ${state(l)}`}>
            <span className="lvl-bar" />
            <span className="lvl-n mono">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ e, t }: { e: SiteEvent; t: number }) {
  const s = e.status(t);
  return <span className={`pill tone-${s.tone}`}>{s.label}</span>;
}

function EventCard({ e, t }: { e: SiteEvent; t: number }) {
  const Icon = sevIcon(e.severity);
  return (
    <motion.div layout="position" className="card-inner">
      <div className="card-top">
        <span className="sev-icon"><Icon /></span>
        <span className="card-cat">{e.category}</span>
        <span className="mono muted small">{clockAt(e.t)}</span>
      </div>
      <div className="card-title">{e.title}</div>
      <div className="card-desc">{e.desc}</div>
      <div className="card-meta">
        <span><I.pin /> {e.location}</span>
        {e.priority && <span className="meta-prio">{e.id === 'floor' ? e.priority : `Priority: ${e.priority}`}</span>}
      </div>
      <div className="card-meta">
        <span className="muted"><I.camera /> {e.source}</span>
      </div>
      {e.extra?.map((x) => (
        <div key={x} className="card-extra">
          <I.check /> {x}
        </div>
      ))}
      <div className="card-actions">
        <StatusPill e={e} t={t} />
        <span className="grow" />
        {e.actions?.filter((a) => !(a.doneAt && t >= a.doneAt)).map((a) => (
          <button key={a.id} className={`btn ${a.primary ? 'primary' : ''}`} data-cursor={a.id} tabIndex={-1}>
            {a.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function EventRow({ e, t }: { e: SiteEvent; t: number }) {
  const Icon = sevIcon(e.severity);
  return (
    <motion.div layout="position" className="row-inner">
      <span className="sev-icon"><Icon /></span>
      <div className="row-main">
        <div className="row-title">{e.title}</div>
        <div className="muted small">{e.location}</div>
      </div>
      <div className="row-side">
        <span className="mono muted small">{clockAt(e.t, false)}</span>
        <StatusPill e={e} t={t} />
      </div>
    </motion.div>
  );
}

/** "Now watching" card: mirrors what the vision system is attending to in the middle panel */
function Tracking({ t }: { t: number }) {
  const room = roomAt(t);
  if (room === 'floor') {
    const p = floorProgress(t);
    const n = boardsInstalled(t);
    return (
      <div className="tracking">
        <div className="tracking-head">
          <span className="scan-dot" />
          <span>Tracking progress</span>
          <span className="mono muted small">CAM 09-12</span>
        </div>
        <div className="tracking-title">Level 9 · Room 12 · Timber flooring</div>
        <div className="bar">
          <div className={`bar-fill ${p >= 100 ? 'done' : ''}`} style={{ width: `${p}%` }} />
        </div>
        <div className="tracking-foot">
          <span className="mono">{p}%</span>
          <span className="muted small">{n} of 20 boards laid · programme sync live</span>
        </div>
      </div>
    );
  }
  const info =
    room === 'breach'
      ? { cam: 'CAM 14-03 · Drone 2', where: 'Level 14 · Zone 3A', what: t >= BREACH.cross && t < BREACH.exitCross ? '1 person inside exclusion zone · 1 without hard hat' : t >= PPE.detect ? '1 worker without hard hat' : '5 people · 1 active lifting zone', hot: t >= PPE.detect }
      : { cam: 'CAM 07-08', where: 'Level 7 · Room 8', what: t >= TRIP.detect ? 'Obstruction on pedestrian walkway' : '3 people · 1 walkway', hot: t >= TRIP.detect };
  return (
    <div className={`tracking ${info.hot ? (room === 'breach' && t >= BREACH.cross && t < BREACH.exitCross ? 'hot-critical' : 'hot-warning') : ''}`}>
      <div className="tracking-head">
        <span className="scan-dot" />
        <span>Watching now</span>
        <span className="mono muted small">{info.cam}</span>
      </div>
      <div className="tracking-title">{info.where}</div>
      <div className="muted small">{info.what}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Programme (Gantt)                                                  */
/* ------------------------------------------------------------------ */
const DAYS = ['Mon 19', 'Tue 20', 'Wed 21', 'Thu 22', 'Fri 23', 'Mon 26', 'Tue 27', 'Wed 28'];
const TODAY = 1.42; // Tue mid-morning

type Row = {
  id: string;
  name: string;
  loc: string;
  start: number;
  end: number;
  pct: number;
  status: string;
  tone: 'success' | 'info' | 'warning' | 'neutral';
  hl?: boolean;
  milestone?: boolean;
  flag?: string;
};

function ProgrammeView({ t }: { t: number }) {
  const p = Math.round(programmeProgress(t));
  const complete = t >= FLOOR.statusFlip;
  const stamped = t >= FLOOR.stamp;
  const next = t >= FLOOR.nextTrade;
  const qa = t >= FLOOR.qa;
  const rows: Row[] = [
    { id: 'r1', name: 'Ceiling boarding', loc: 'Level 8 · All rooms', start: 0, end: 1.2, pct: 100, status: 'Complete', tone: 'success' },
    { id: 'r2', name: 'Timber flooring', loc: 'Level 9 · Room 11', start: 0, end: 1.0, pct: 100, status: 'Complete', tone: 'success' },
    {
      id: 'r3',
      name: 'Timber flooring installation',
      loc: 'Level 9 · Room 12',
      start: 0.6,
      end: complete ? TODAY : 3.0,
      pct: p,
      status: complete ? 'Installation complete' : 'In progress',
      tone: complete ? 'success' : 'info',
      hl: true,
    },
    {
      id: 'r4',
      name: 'Skirting & joinery',
      loc: 'Level 9 · Room 12',
      start: next ? TODAY + 0.1 : 3.0,
      end: next ? TODAY + 1.6 : 4.5,
      pct: 0,
      status: next ? 'Ready · coordinate trade' : 'Not started',
      tone: next ? 'warning' : 'neutral',
      flag: next ? 'Next trade' : undefined,
    },
    { id: 'r5', name: 'QA verification', loc: 'Level 9 · Room 12', start: next ? TODAY + 0.1 : 3.0, end: next ? TODAY + 0.6 : 3.5, pct: 0, status: qa ? 'Pending sign-off' : 'Not started', tone: qa ? 'warning' : 'neutral' },
    { id: 'r6', name: 'Partition framing', loc: 'Level 10 · East wing', start: 0.5, end: 3.8, pct: 60, status: 'In progress', tone: 'info' },
    { id: 'm1', name: 'L9 fit-out complete', loc: 'Milestone', start: next ? 5.0 : 5.5, end: next ? 5.0 : 5.5, pct: 0, status: next ? 'Forecast: 0.5 days early' : 'On track', tone: next ? 'success' : 'neutral', milestone: true },
  ];
  const x = (d: number) => `${(d / DAYS.length) * 100}%`;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Programme</h1>
          <div className="muted small">Central Tower · Fit-out, Levels 8 to 10</div>
        </div>
        <span className={`sync ${complete ? 'on' : ''}`}>
          <I.check /> {complete ? `Auto-updated ${clockAt(FLOOR.statusFlip)}` : 'Syncing…'}
        </span>
      </div>
      <div className="gantt">
        <div className="g-head">
          <div className="g-name muted small">Activity</div>
          <div className="g-pct muted small">%</div>
          <div className="g-track">
            {DAYS.map((d, i) => (
              <span key={d} className="g-day" style={{ left: x(i), width: x(1) }}>
                {d}
              </span>
            ))}
          </div>
        </div>
        {rows.map((r) => (
          <motion.div layout key={r.id} className={`g-row ${r.hl ? 'hl' : ''} ${r.hl && complete ? 'hl-done' : ''}`}>
            <div className="g-name">
              <div className="g-title">{r.name}</div>
              <div className="muted small">{r.loc}</div>
            </div>
            <div className="g-pct mono">{r.milestone ? '' : `${r.pct}%`}</div>
            <div className="g-track">
              {DAYS.map((d, i) => (
                <i key={d} className="g-grid" style={{ left: x(i) }} />
              ))}
              <i className="g-today" style={{ left: x(TODAY) }} />
              {r.milestone ? (
                <motion.i layout className={`g-diamond tone-${r.tone}`} style={{ left: x(r.start) }} />
              ) : (
                <motion.div layout className={`g-bar tone-${r.tone}`} style={{ left: x(r.start), width: x(r.end - r.start) }} transition={{ duration: 0.6 }}>
                  <div className="g-bar-fill" style={{ width: `${r.pct}%` }} />
                </motion.div>
              )}
              {r.id === 'r4' && next && <span className="g-dep" style={{ left: x(TODAY), width: x(0.1) }} />}
            </div>
            <div className="g-status">
              <span className={`pill tone-${r.tone}`}>{r.status}</span>
              {r.flag && (
                <span className="pill tone-warning flag">
                  <I.flag /> {r.flag}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="changelog">
        <div className="feed-head">
          <span>Programme changes</span>
          <span className="muted small">Recorded by SiteMind</span>
        </div>
        <AnimatePresence initial={false}>
          {qa && (
            <motion.div key="qa" className="log" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <span className="mono muted small">{clockAt(FLOOR.qa)}</span>
              <span>QA verification requested, pending before final sign-off</span>
            </motion.div>
          )}
          {next && (
            <motion.div key="nt" className="log" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <span className="mono muted small">{clockAt(FLOOR.nextTrade)}</span>
              <span>Joinery subcontractor flagged for coordination: Room 12 ready</span>
            </motion.div>
          )}
          {stamped && (
            <motion.div key="st" className="log" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <span className="mono muted small">{clockAt(FLOOR.complete)}</span>
              <span>Room 12 flooring identified complete by CAM 09-12. Task set to 100%, 1.6 days ahead of plan</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="log dim">
          <span className="mono muted small">09:12:40</span>
          <span>Level 15 Bay 2 concrete pour logged complete</span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Simulated user's cursor (first-person POV)                          */
/* ------------------------------------------------------------------ */
type CK = { t: number; at: string | [number, number]; click?: boolean };
const CURSOR: CK[] = [
  { t: 0, at: [0.78, 0.9] },
  { t: 20.4, at: [0.78, 0.9] },
  { t: 22.4, at: 'ack-breach', click: true },
  { t: 23.6, at: 'ack-breach' },
  { t: 25.0, at: [0.82, 0.62] },
  { t: 37.0, at: [0.82, 0.62] },
  { t: 38.3, at: 'assign-trip', click: true },
  { t: 39.4, at: 'assign-trip' },
  { t: 40.8, at: [0.85, 0.7] },
  { t: 63.8, at: [0.85, 0.7] },
  { t: 64.9, at: 'open-programme', click: true },
  { t: 65.6, at: 'open-programme' },
  { t: 67.0, at: [0.9, 0.86] },
  { t: 75, at: [0.78, 0.9] },
];
const CLICKS = [BREACH.ackClick, TRIP.assignClick, FLOOR.navClick];

function Cursor() {
  const el = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLDivElement>(null);
  const lastPos = useRef<Record<string, [number, number]>>({});
  useEffect(() => {
    let raf = 0;
    const app = el.current?.parentElement as HTMLElement;
    const resolve = (at: CK['at']): [number, number] => {
      const r = app.getBoundingClientRect();
      if (Array.isArray(at)) return [at[0] * r.width, at[1] * r.height];
      const target = app.querySelector(`[data-cursor="${at}"]`) as HTMLElement | null;
      if (target) {
        const b = target.getBoundingClientRect();
        // getBoundingClientRect is in screen px; app may be scaled → normalise
        const sx = app.offsetWidth / r.width;
        const sy = app.offsetHeight / r.height;
        const p: [number, number] = [(b.left - r.left + b.width * 0.55) * sx, (b.top - r.top + b.height * 0.6) * sy];
        lastPos.current[at] = p;
        return p;
      }
      return lastPos.current[at] ?? [r.width * 0.8, r.height * 0.8];
    };
    const loop = () => {
      const t = sim.t;
      let i = 0;
      while (i < CURSOR.length - 2 && CURSOR[i + 1].t <= t) i++;
      const a = CURSOR[i];
      const b = CURSOR[i + 1];
      const k = Math.max(0, Math.min(1, (t - a.t) / Math.max(0.001, b.t - a.t)));
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const pa = resolve(a.at);
      const pb = resolve(b.at);
      const x = pa[0] + (pb[0] - pa[0]) * e;
      const y = pa[1] + (pb[1] - pa[1]) * e;
      if (el.current) el.current.style.transform = `translate(${x}px, ${y}px)`;
      const c = CLICKS.find((c) => t >= c - 0.05 && t < c + 0.45);
      if (ripple.current) {
        if (c !== undefined) {
          const p = (t - c + 0.05) / 0.5;
          ripple.current.style.opacity = String(1 - p);
          ripple.current.style.transform = `translate(-50%, -50%) scale(${0.4 + p * 1.4})`;
        } else ripple.current.style.opacity = '0';
      }
      if (el.current) el.current.classList.toggle('down', c !== undefined && t < c + 0.15);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={el} className="cursor" aria-hidden="true">
      <div ref={ripple} className="ripple" />
      <svg viewBox="0 0 24 24" width="1.35em" height="1.35em">
        <path d="M4 2.5l15.5 9.2-6.6 1.5 3.9 7.3-2.7 1.4-3.9-7.3L5.4 19z" fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

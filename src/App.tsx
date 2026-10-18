import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { clock, sim, useClock } from './sim/clock';
import {
  BREACH,
  PPE,
  DURATION,
  FLOOR,
  ROOM_SWITCH,
  SCENARIOS,
  SEVERITY_COLOR,
  TRANSMISSIONS,
  TRIP,
  boardsInstalled,
  floorProgress,
  roomAt,
  scenarioAt,
  type RoomId,
} from './sim/timeline';
import SiteMindApp from './ui/SiteMindApp';
import { I, Logo } from './ui/icons';

const SiteScene = lazy(() => import('./three/SiteScene'));
const ActivityScene = lazy(() => import('./three/ActivityScene'));

export default function App() {
  const root = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 1600, h: 900 });
  const [isFs, setFs] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const el = root.current!;
    const ro = new ResizeObserver(() => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const w = Math.min(W, (H * 16) / 9);
      setStage({ w, h: (w * 9) / 16 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleFs = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      /* fullscreen unavailable */
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && e.key !== ' ') return;
      if (e.key === ' ') {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === 'ArrowRight') clock.seek(sim.t + 5);
      else if (e.key === 'ArrowLeft') clock.seek(sim.t - 5);
      else if (e.key === 'f' || e.key === 'F') toggleFs();
      else if (e.key === 'r' || e.key === 'R') clock.seek(0);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, [toggleFs]);

  // presentation mode: hide controls when the pointer rests
  useEffect(() => {
    if (!isFs) {
      setIdle(false);
      return;
    }
    let id = setTimeout(() => setIdle(true), 2500);
    const move = () => {
      setIdle(false);
      clearTimeout(id);
      id = setTimeout(() => setIdle(true), 2500);
    };
    window.addEventListener('pointermove', move);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointermove', move);
    };
  }, [isFs]);

  return (
    <div ref={root} className={`root ${isFs ? 'fs' : ''} ${idle ? 'idle' : ''}`}>
      <div className="stage" style={{ width: stage.w, height: stage.h, fontSize: stage.w / 120 }}>
        <div className="panels">
          <section className="panel panel-site" aria-label="Connected construction site">
            <Suspense fallback={<div className="loading">Loading site…</div>}>
              <SiteScene />
            </Suspense>
            <SiteHud />
          </section>
          <section className="panel panel-activity" aria-label="Live construction activity">
            <ActivityBackdrop />
            <Suspense fallback={<div className="loading">Loading camera…</div>}>
              <ActivityScene />
            </Suspense>
            <ActivityHud />
          </section>
          <section className="panel panel-os" aria-label="SiteMind software">
            <SiteMindApp />
            <ReceiveGlow />
          </section>
          <Rail />
        </div>
        <Controls isFs={isFs} toggleFs={toggleFs} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function SiteHud() {
  return (
    <div className="hud hud-site">
      <div className="hud-tl">
        <div className="hud-chip">
          <span className="live-dot" /> Central Tower · 16 levels
        </div>
      </div>
      <div className="hud-bl">
        <div className="legend">
          <span><I.drone /> 3 drones</span>
          <span><I.camera /> 22 cameras</span>
          <span><I.sensor /> 48 sensors</span>
          <span><I.wearable /> 31 wearables</span>
        </div>
      </div>
    </div>
  );
}

function ActivityBackdrop() {
  const { t } = useClock();
  return <div className={`backdrop ${roomAt(t) === 'breach' ? 'sky' : 'interior'}`} />;
}

const ROOM_INFO: Record<RoomId, { cam: string; where: string }> = {
  breach: { cam: 'CAM 14-03', where: 'Level 14 · Zone 3A' },
  trip: { cam: 'CAM 07-08', where: 'Level 7 · Room 8' },
  floor: { cam: 'CAM 09-12', where: 'Level 9 · Room 12' },
};

function ActivityHud() {
  const { t } = useClock();
  const room = roomAt(t);
  const info = ROOM_INFO[room];
  // fade through black around room switches and the loop point
  const edges = [ROOM_SWITCH.trip, ROOM_SWITCH.floor];
  let fade = 0;
  for (const e of edges) fade = Math.max(fade, 1 - Math.abs(t - e) / 0.55);
  fade = Math.max(fade, 1 - t / 0.6, 1 - (DURATION - t) / 0.6);
  fade = Math.max(0, Math.min(1, fade));

  let caption: { text: string; tone: string } | null = null;
  if (room === 'breach') {
    if (t >= BREACH.cross && t < BREACH.exitCross) caption = { text: 'Person entered exclusion zone', tone: 'critical' };
    else if (t >= BREACH.exitCross) caption = { text: 'Zone clear', tone: 'success' };
    else if (t >= PPE.detect) caption = { text: 'Worker without hard hat', tone: 'warning' };
    else caption = { text: 'Monitoring active lifting zone', tone: 'neutral' };
  } else if (room === 'trip') {
    caption = t >= TRIP.detect ? { text: 'Cable obstructing pedestrian walkway', tone: 'warning' } : { text: 'Monitoring pedestrian walkway', tone: 'neutral' };
  }
  const p = floorProgress(t);
  return (
    <div className="hud hud-activity">
      <div className="hud-tl">
        <div className="hud-chip rec">
          <span className="rec-dot" /> LIVE · {info.cam}
        </div>
        <div className="hud-loc">{info.where}</div>
      </div>
      <div className="hud-tr">
        <div className="hud-chip vision">
          <Logo size="1.1em" /> Vision on
        </div>
      </div>
      <div className="hud-bottom">
        {room === 'floor' ? (
          <div className={`progress-card ${p >= 100 ? 'done' : ''}`}>
            <div className="pc-top">
              <span>Timber flooring</span>
              <span className="mono pc-pct">{p}%</span>
            </div>
            <div className="pc-bar">
              <div style={{ width: `${p}%` }} />
              {[35, 50, 70, 90].map((m) => (
                <i key={m} style={{ left: `${m}%` }} />
              ))}
            </div>
            <div className="pc-foot mono">
              {boardsInstalled(t)} / 20 boards {t >= FLOOR.complete ? '· complete' : '· installing'}
            </div>
          </div>
        ) : (
          caption && <div className={`caption tone-${caption.tone}`}>{caption.text}</div>
        )}
      </div>
      <div className="fade" style={{ opacity: fade }}>
        {fade > 0.2 && t > 1 && t < DURATION - 1 && <span>{info.where}</span>}
      </div>
      <div className="scanlines" />
    </div>
  );
}

/** physical-world → software transmission travelling along the rail below the panels */
function Rail() {
  const dot = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const tx = TRANSMISSIONS.find((x) => sim.t >= x.t && sim.t < x.t + 0.9);
      if (dot.current && line.current) {
        if (tx) {
          const k = (sim.t - tx.t) / 0.9;
          const c = SEVERITY_COLOR[tx.severity];
          dot.current.style.opacity = String(k < 0.85 ? 1 : (1 - k) / 0.15);
          dot.current.style.left = `${10 + k * 80}%`;
          dot.current.style.setProperty('--rc', c);
          line.current.style.setProperty('--rc', c);
          line.current.classList.add('on');
        } else {
          dot.current.style.opacity = '0';
          line.current.classList.remove('on');
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="rail" aria-hidden="true">
      <div ref={line} className="rail-line" />
      <div ref={dot} className="rail-dot" />
    </div>
  );
}

function ReceiveGlow() {
  const { t } = useClock();
  const tx = TRANSMISSIONS.find((x) => t >= x.t + 0.7 && t < x.t + 1.8);
  return <div className="receive-glow" style={{ opacity: tx ? 1 : 0, ['--rc' as string]: tx ? SEVERITY_COLOR[tx.severity] : 'transparent' }} />;
}

/* ------------------------------------------------------------------ */
function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

const MARKERS = [
  { t: PPE.detect, sev: 'warning' as const, label: 'Missing hard hat' },
  { t: BREACH.cross, sev: 'critical' as const, label: 'Exclusion zone breach' },
  { t: TRIP.detect, sev: 'warning' as const, label: 'Trip hazard' },
  { t: FLOOR.complete, sev: 'success' as const, label: 'Flooring complete' },
];

function Controls({ isFs, toggleFs }: { isFs: boolean; toggleFs: () => void }) {
  const { t, playing } = useClock();
  const current = scenarioAt(t);
  const scrub = useRef<HTMLInputElement>(null);
  const wasPlaying = useRef(true);
  return (
    <div className="controls">
      <div className="ctl-left">
        <span className="ctl-brand">
          <Logo size="1.25em" />
          <b>SiteMind</b>
        </span>
        <button className="cbtn" onClick={() => clock.toggle()} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          {playing ? <I.pause /> : <I.play />}
        </button>
        <button className="cbtn" onClick={() => { clock.seek(0); clock.play(); }} aria-label="Restart" title="Restart (R)">
          <I.restart />
        </button>
        <span className="mono time">
          {fmt(t)} / {fmt(DURATION)}
        </span>
      </div>
      <div className="ctl-timeline">
        <div className="segments">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={`seg ${current === s.id ? 'active' : ''}`}
              style={{ flex: s.end - s.start }}
              onClick={() => {
                clock.seek(s.start + 0.01);
                clock.play();
              }}
              title={`Play: ${s.label}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="scrub">
          <div className="scrub-fill" style={{ width: `${(t / DURATION) * 100}%` }} />
          {MARKERS.map((m) => (
            <i key={m.t} className="marker" title={m.label} style={{ left: `${(m.t / DURATION) * 100}%`, background: SEVERITY_COLOR[m.sev] }} />
          ))}
          <input
            ref={scrub}
            id="timeline"
            type="range"
            min={0}
            max={DURATION}
            step={0.05}
            value={t}
            aria-label="Timeline"
            onPointerDown={() => {
              wasPlaying.current = sim.playing;
              clock.pause();
            }}
            onPointerUp={() => wasPlaying.current && clock.play()}
            onChange={(e) => clock.seek(parseFloat(e.target.value))}
          />
        </div>
      </div>
      <div className="ctl-right">
        <span className="sim-note">Simulated product demonstration</span>
        <button className="cbtn" onClick={toggleFs} aria-label={isFs ? 'Exit full screen' : 'Full screen'} title="Full screen (F)">
          {isFs ? <I.exitFullscreen /> : <I.fullscreen />}
        </button>
      </div>
    </div>
  );
}

/** Shared demo timeline. All times are seconds on the 75s loop. */
export const DURATION = 75;

export type ScenarioId = 'intro' | 'breach' | 'trip' | 'floor' | 'final';

export const SCENARIOS: { id: ScenarioId; label: string; start: number; end: number }[] = [
  { id: 'intro', label: 'Connected site', start: 0, end: 12 },
  { id: 'breach', label: 'Exclusion zone', start: 12, end: 30 },
  { id: 'trip', label: 'Trip hazard', start: 30, end: 43 },
  { id: 'floor', label: 'Flooring progress', start: 43, end: 65 },
  { id: 'final', label: 'Connected view', start: 65, end: 75 },
];

export function scenarioAt(t: number): ScenarioId {
  for (let i = SCENARIOS.length - 1; i >= 0; i--) if (t >= SCENARIOS[i].start) return SCENARIOS[i].id;
  return 'intro';
}

/** Which close-up room the middle panel shows (switches mid-fade). */
export type RoomId = 'breach' | 'trip' | 'floor';
export const ROOM_SWITCH = { trip: 30.5, floor: 43.5 };
export function roomAt(t: number): RoomId {
  if (t >= ROOM_SWITCH.floor) return 'floor';
  if (t >= ROOM_SWITCH.trip) return 'trip';
  return 'breach';
}

/* ---------------- event beats ---------------- */
/** worker without a hard hat in the same Level 14 scene */
export const PPE = {
  detect: 14.4,
  site: 14.7,
  notify: 15.4,
};
export const BREACH = {
  walkStart: 13,
  cross: 18.5, // physical event + vision detection
  site: 18.8, // site model pulses
  notify: 19.6, // software receives alert
  ackClick: 22.8,
  turnBack: 25.2,
  exitCross: 27.4,
};
export const TRIP = {
  walkStart: 31,
  detect: 34.5,
  site: 34.8,
  notify: 35.6,
  assignClick: 38.6,
};

export const FLOOR = {
  boards: 20,
  startBoards: 7, // 35%
  firstPlace: 45,
  interval: 1.375,
  workers: 3,
  complete: 62,
  site: 62.3,
  notify: 63.0,
  navClick: 65.1,
  navigate: 65.2,
  barFill: 65.8,
  statusFlip: 66.9,
  stamp: 67.3,
  nextTrade: 67.8,
  qa: 68.3,
};

/** time at which board index i (0-based) is laid */
export function boardTime(i: number) {
  if (i < FLOOR.startBoards) return -Infinity;
  return FLOOR.firstPlace + (i - FLOOR.startBoards) * FLOOR.interval;
}
export function boardsInstalled(t: number) {
  let n = FLOOR.startBoards;
  for (let i = FLOOR.startBoards; i < FLOOR.boards; i++) if (t >= boardTime(i)) n++;
  return n;
}
/** visual (and reported) completion % — always matches boards physically on the floor */
export function floorProgress(t: number) {
  if (t < ROOM_SWITCH.floor - 1) return 35;
  return Math.round((boardsInstalled(t) / FLOOR.boards) * 100);
}
/** the programme row's synced value: the room reports live; the Gantt applies the final sync after navigation */
export function programmeProgress(t: number) {
  const p = floorProgress(t);
  if (t < FLOOR.barFill) return Math.min(p, 90);
  return Math.min(100, 90 + ((t - FLOOR.barFill) / 1) * 10);
}

/* ---------------- simulated wall clock ---------------- */
const BASE = 10 * 3600 + 24 * 60; // 10:24:00
export function clockAt(t: number, withSeconds = true) {
  const s = Math.floor(BASE + t);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(((s % 60) + 60) % 60).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}
export const SITE_DATE = 'Tue 20 Oct 2026';

/* ---------------- software events ---------------- */
export type Severity = 'critical' | 'warning' | 'success' | 'info';

export interface SiteEvent {
  id: string;
  t: number; // when the software receives it
  severity: Severity;
  category: string;
  title: string;
  desc: string;
  location: string;
  source: string;
  priority?: string;
  status: (t: number) => { label: string; tone: Severity | 'neutral' };
  extra?: string[];
  actions?: { id: string; label: string; primary?: boolean; doneAt?: number }[];
}

export const EVENTS: SiteEvent[] = [
  {
    id: 'hist-1',
    t: -2160,
    severity: 'success',
    category: 'Progress',
    title: 'Concrete pour complete',
    desc: 'Slab pour finished, curing started',
    location: 'Level 15 | Bay 2',
    source: 'Drone 1',
    status: () => ({ label: 'Logged', tone: 'neutral' }),
  },
  {
    id: 'hist-2',
    t: -1320,
    severity: 'info',
    category: 'Logistics',
    title: 'Delivery checked in',
    desc: 'Plasterboard, 2 pallets',
    location: 'Gate 2 | Laydown A',
    source: 'CAM G2-01',
    status: () => ({ label: 'Logged', tone: 'neutral' }),
  },
  {
    id: 'hist-3',
    t: -540,
    severity: 'success',
    category: 'Safety',
    title: 'PPE check passed',
    desc: '42 workers, hard hats and vests detected',
    location: 'Level 12 | All zones',
    source: 'CAM 12-02',
    status: () => ({ label: 'Logged', tone: 'neutral' }),
  },
  {
    id: 'ppe',
    t: PPE.notify,
    severity: 'warning',
    category: 'PPE violation',
    title: 'Hard hat not detected',
    desc: 'Worker on an active slab without head protection',
    location: 'Level 14 | Zone 2B',
    source: 'CAM 14-03',
    priority: 'High',
    extra: ['Site supervisor notified'],
    status: (t) => (t >= 27 ? { label: 'Supervisor en route', tone: 'info' } : { label: 'Action required', tone: 'warning' }),
  },
  {
    id: 'breach',
    t: BREACH.notify,
    severity: 'critical',
    category: 'Safety alert',
    title: 'Worker detected in exclusion zone',
    desc: 'Person entered the active lifting zone below a suspended crane load',
    location: 'Level 14 | Zone 3A',
    source: 'CAM 14-03 · Drone 2',
    priority: 'High',
    extra: ['Site supervisor notified'],
    actions: [
      { id: 'ack-breach', label: 'Acknowledge', primary: true, doneAt: BREACH.ackClick + 0.35 },
      { id: 'view-breach', label: 'View feed' },
    ],
    status: (t) =>
      t >= BREACH.exitCross + 0.6
        ? { label: 'Cleared · worker left zone', tone: 'success' }
        : t >= BREACH.ackClick
          ? { label: 'Acknowledged', tone: 'warning' }
          : { label: 'Open', tone: 'critical' },
  },
  {
    id: 'trip',
    t: TRIP.notify,
    severity: 'warning',
    category: 'Hazard',
    title: 'Trip hazard detected',
    desc: 'Electrical cable obstructing pedestrian walkway',
    location: 'Level 7 | Room 8',
    source: 'CAM 07-08',
    priority: 'Medium',
    actions: [
      { id: 'assign-trip', label: 'Assign', primary: true, doneAt: TRIP.assignClick + 0.35 },
      { id: 'view-trip', label: 'View feed' },
    ],
    status: (t) =>
      t >= TRIP.assignClick ? { label: 'Assigned · Site Team B', tone: 'info' } : { label: 'Action required', tone: 'warning' },
  },
  {
    id: 'floor',
    t: FLOOR.notify,
    severity: 'success',
    category: 'Progress update',
    title: 'Flooring installation complete',
    desc: 'Timber flooring 100% laid, verified against the room model',
    location: 'Level 9 | Room 12',
    source: 'CAM 09-12 · Sensor S9-4',
    priority: 'Progress 100%',
    extra: ['Construction programme updated automatically'],
    actions: [
      { id: 'open-programme', label: 'View programme', primary: true },
      { id: 'view-floor', label: 'View feed' },
    ],
    status: (t) => (t >= FLOOR.navigate ? { label: 'Programme synced', tone: 'success' } : { label: 'Syncing programme', tone: 'info' }),
  },
];

/** pulses that travel from the physical world to the software (for the cross-panel rail) */
export const TRANSMISSIONS: { t: number; severity: Severity }[] = [
  { t: PPE.site, severity: 'warning' },
  { t: BREACH.site, severity: 'critical' },
  { t: TRIP.site, severity: 'warning' },
  { t: FLOOR.site, severity: 'success' },
];

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ff4d4f',
  warning: '#ffb020',
  success: '#2fd47a',
  info: '#4aa8ff',
};

/** utilities */
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
export const between = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

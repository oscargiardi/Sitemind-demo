/** Shared demo timeline. All times are seconds on the 95s loop. */
export const DURATION = 95;

export type ScenarioId = 'intro' | 'breach' | 'trip' | 'floor' | 'hvac';

export const SCENARIOS: { id: ScenarioId; label: string; start: number; end: number }[] = [
  { id: 'intro', label: 'Connected site', start: 0, end: 12 },
  { id: 'breach', label: 'Exclusion zone', start: 12, end: 30 },
  { id: 'trip', label: 'Trip hazard', start: 30, end: 43 },
  { id: 'floor', label: 'Flooring progress', start: 43, end: 70 },
  { id: 'hvac', label: 'HVAC capture', start: 70, end: 95 },
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
  ...[71.5, 74.2, 77.1, 79.2, 85.4, 88.6, 92.2].map((t) => ({ t, severity: 'info' as Severity })),
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

/* ---------------- HVAC spatial-capture scene (Level 5, Room 5.04) ---------------- */
export const HVAC = {
  start: 70,
  sweep: 71.2, // ceiling void scanned
  hangerA: [75, 77] as [number, number],
  hangerB: [77.2, 79.2] as [number, number],
  duct: [79.6, 85.4] as [number, number], // lift 79.6-83, flange join to 85.4
  spigot: [86, 88.6] as [number, number],
  insulation: [89.4, 92.2] as [number, number],
};
export const isHvac = (t: number) => t >= HVAC.start;

export type Trade = 'MECH' | 'ELEC' | 'STRUCT';
export interface CaptureEntry {
  t: number;
  trade: Trade;
  title: string;
  text: string;
  source: string;
}
export const CAPTURE_LOG: CaptureEntry[] = [
  {
    t: 71.9,
    trade: 'STRUCT',
    title: 'Ceiling void opened',
    text: 'Grid tiles lifted across bays C3 to C5. Void depth 700 mm from suspended ceiling to slab soffit. Soffit and existing services mapped.',
    source: 'LiDAR S5-2 · CAM 05-04A',
  },
  {
    t: 72.9,
    trade: 'ELEC',
    title: 'Cable tray identified',
    text: '150 mm perforated cable tray at 2.9 m AFFL carrying 4 TPS lighting and power circuits. 310 mm clearance to the duct route.',
    source: 'CAM 05-04A',
  },
  {
    t: 73.8,
    trade: 'ELEC',
    title: 'Junction box located',
    text: 'JB-5-12 fixed to slab soffit, 230 V lighting circuit L5-04 with 20 mm conduit drop. Labelled and accessible.',
    source: 'Helmet cam H-27 (front)',
  },
  {
    t: 74.6,
    trade: 'MECH',
    title: 'Existing supply duct captured',
    text: '600 × 300 galvanised rectangular supply duct from AHU-2. Open end at gridline 4, ready for extension.',
    source: 'Helmet cam H-27 (rear)',
  },
  {
    t: 77.5,
    trade: 'MECH',
    title: 'Hanger installed',
    text: 'M10 threaded drop rods with 41 × 41 unistrut trapeze, anchored to slab with drop-in anchors. Rods plumb, trapeze set at 2.95 m.',
    source: 'Helmet cam H-27 (front)',
  },
  {
    t: 79.6,
    trade: 'MECH',
    title: 'Second hanger installed',
    text: 'Trapeze support at 1.2 m centres, level within ±3 mm of the first support.',
    source: 'CAM 05-04B',
  },
  {
    t: 85.8,
    trade: 'MECH',
    title: 'Duct section installed',
    text: '2.4 m length of 600 × 300 duct seated on both trapezes. TDC flange joint with corner cleats and gasket, joint sealed.',
    source: 'Helmet cam H-27 (rear) · LiDAR S5-2',
  },
  {
    t: 89.0,
    trade: 'MECH',
    title: 'Branch take-off fitted',
    text: '250 mm Ø spigot with volume control damper (VCD). Insulated flexible duct to a 600 × 600 four-way ceiling diffuser.',
    source: 'Helmet cam H-27 (front)',
  },
  {
    t: 92.6,
    trade: 'MECH',
    title: 'Duct insulation applied',
    text: '25 mm foil-faced insulation wrapped on the new section, joints taped. Void ready for ceiling close-up.',
    source: 'CAM 05-04A · LiDAR S5-2',
  },
];

import { useMemo, useRef, type JSX } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '../sim/clock';
import { BREACH, PPE, TRIP, FLOOR, SEVERITY_COLOR, between } from '../sim/timeline';
import { AutoShadows, Box, C, Drone, FitOrtho, Lights, PingRing, ScanCone, Worker, loopPath, type Pose } from './common';

/* building geometry */
const BX = -0.6;
const BZ = -0.4;
const W = 5.2;
const D = 3.8;
const H = 0.42;
const LEVELS = 16;
const ly = (l: number) => l * H;

type Zone = {
  id: 'ppe' | 'breach' | 'trip' | 'floor';
  level: number;
  x: [number, number];
  z: [number, number];
  color: string;
  label: string;
  on: number; // site pulse time
  off: number;
  track?: [number, number]; // optional teal "tracking" window
};
const ZONES: Zone[] = [
  {
    id: 'ppe',
    level: 14,
    x: [BX - W / 2 + 1.3, BX + 0.3],
    z: [BZ + 0.1, BZ + D / 2],
    color: SEVERITY_COLOR.warning,
    label: 'L14 · No hard hat',
    on: PPE.site,
    off: BREACH.site,
  },
  {
    id: 'breach',
    level: 14,
    x: [BX + 0.5, BX + W / 2],
    z: [BZ + 0.1, BZ + D / 2],
    color: SEVERITY_COLOR.critical,
    label: 'L14 · Zone 3A',
    on: BREACH.site,
    off: 30,
    track: [12, BREACH.site],
  },
  {
    id: 'trip',
    level: 7,
    x: [BX - W / 2, BX - 0.7],
    z: [BZ + 0.3, BZ + D / 2],
    color: SEVERITY_COLOR.warning,
    label: 'L7 · Room 8',
    on: TRIP.site,
    off: 43,
    track: [30.5, TRIP.site],
  },
  {
    id: 'floor',
    level: 9,
    x: [BX + 0.3, BX + W / 2],
    z: [BZ + 0.4, BZ + D / 2],
    color: SEVERITY_COLOR.success,
    label: 'L9 · Room 12',
    on: FLOOR.site,
    off: 75.1,
    track: [43.5, FLOOR.site],
  },
];
const zoneCenter = (z: Zone) =>
  new THREE.Vector3((z.x[0] + z.x[1]) / 2, ly(z.level) + H / 2, (z.z[0] + z.z[1]) / 2);


/* ---------- ambient actors (paths shared with the network so lines follow them) ---------- */
const droneA = (w: number) => {
  const a = w * 0.32;
  return { x: BX + Math.cos(a) * 5.0, y: 8.1 + Math.sin(w * 0.5) * 0.3, z: BZ + Math.sin(a) * 4.2, rot: -a };
};
const droneB = (w: number) => {
  const a = w * 0.45;
  return { x: BX + 3.4 + Math.sin(a) * 1.6, y: 6.6 + Math.sin(a * 2) * 0.25, z: BZ + 3.3 + Math.sin(a * 2) * 0.8, rot: a };
};
const droneC = (w: number) => {
  const a = w * 0.25 + 2;
  return { x: BX - 3.9 + Math.sin(a) * 1.0, y: 3.6 + Math.cos(a * 1.3) * 0.6, z: BZ + 2.6 + Math.cos(a) * 1.4, rot: a * 0.6 };
};
const groundWalkers: { pts: [number, number][]; speed: number; off: number; wear?: boolean; vest?: string; helmet?: string }[] = [
  { pts: [[3.2, 3.2], [5.4, 3.2], [5.4, 0.4], [3.2, 0.4]], speed: 0.55, off: 0 },
  { pts: [[-4.6, 2.0], [-1.6, 2.3], [-1.6, 3.4], [-4.6, 3.4]], speed: 0.5, off: 3, wear: true, helmet: C.white },
  { pts: [[1.0, 3.4], [3.6, 3.9], [2.2, 2.5]], speed: 0.45, off: 6, vest: '#c6f03a' },
  { pts: [[-5.6, -1.0], [-5.6, 1.6], [-3.9, 1.6]], speed: 0.4, off: 1, wear: true, vest: '#c6f03a', helmet: C.white },
  { pts: [[5.2, -1.6], [5.6, -3.6], [4.6, -4.4]], speed: 0.42, off: 2 },
];
const walkerPos = (i: number, w: number) => {
  const g = groundWalkers[i];
  return loopPath(g.pts, g.speed, w + g.off);
};

/* ---------------- building ---------------- */
function Building() {
  const items = useMemo(() => {
    const out: JSX.Element[] = [];
    const colX = [BX - W / 2 + 0.12, BX - W / 6, BX + W / 6, BX + W / 2 - 0.12];
    const colZ = [BZ - D / 2 + 0.12, BZ, BZ + D / 2 - 0.12];
    for (let l = 0; l <= LEVELS; l++) {
      // slab
      const partial = l === LEVELS;
      out.push(
        <Box
          key={`s${l}`}
          p={[partial ? BX - W / 4 : BX, ly(l) + 0.035, BZ]}
          s={[partial ? W / 2 : W + 0.12, 0.07, D + 0.12]}
          c={l % 2 ? C.concrete : '#d2cfc7'}
        />,
      );
      if (l === LEVELS) continue;
      // columns
      for (const x of colX)
        for (const z of colZ) {
          if (l >= 14 && x > BX + 0.5 && z > BZ) continue; // zone 3A kept open
          out.push(<Box key={`c${l}${x}${z}`} p={[x, ly(l) + H / 2 + 0.035, z]} s={[0.12, H - 0.07, 0.12]} c={C.column} />);
        }
      // facade: glazed lower floors, framed middle floors
      if (l >= 1 && l <= 6) {
        const g = l % 2 ? '#86c6ea' : '#7dbde3';
        out.push(<Box key={`gx${l}`} p={[BX + W / 2 + 0.02, ly(l) + H / 2 + 0.03, BZ]} s={[0.04, H - 0.1, D - 0.1]} c={g} />);
        out.push(<Box key={`gz${l}`} p={[BX, ly(l) + H / 2 + 0.03, BZ + D / 2 + 0.02]} s={[W - 0.1, H - 0.1, 0.04]} c={g} />);
        out.push(<Box key={`gx2${l}`} p={[BX - W / 2 - 0.02, ly(l) + H / 2 + 0.03, BZ]} s={[0.04, H - 0.1, D - 0.1]} c={g} />);
        for (let i = 1; i < 6; i++)
          out.push(
            <Box key={`m${l}${i}`} p={[BX - W / 2 + (i * W) / 6, ly(l) + H / 2 + 0.03, BZ + D / 2 + 0.05]} s={[0.04, H - 0.08, 0.03]} c="#eef2f5" />,
          );
      }
      if (l >= 7 && l <= 10) {
        for (let i = 1; i < 6; i++)
          out.push(
            <Box key={`f${l}${i}`} p={[BX - W / 2 + (i * W) / 6, ly(l) + H / 2 + 0.03, BZ + D / 2 + 0.02]} s={[0.035, H - 0.08, 0.035]} c="#9aa3ad" />,
          );
      }
      // edge protection barriers on upper floors
      if (l >= 11) {
        out.push(<Box key={`eb${l}`} p={[BX, ly(l) + 0.18, BZ + D / 2 + 0.04]} s={[W + 0.1, 0.03, 0.03]} c={C.yellow} />);
        out.push(<Box key={`eb2${l}`} p={[BX + W / 2 + 0.04, ly(l) + 0.18, BZ]} s={[0.03, 0.03, D + 0.1]} c={C.yellow} />);
      }
    }
    // core
    out.push(<Box key="core" p={[BX - W / 2 + 0.75, (LEVELS * H + 0.5) / 2, BZ - D / 2 + 0.65]} s={[1.2, LEVELS * H + 0.5, 1.0]} c={C.core} />);
    // top-floor rebar starters
    for (let i = 0; i < 6; i++)
      out.push(<Box key={`rb${i}`} p={[BX + 0.2 + i * 0.4, ly(LEVELS) + 0.2, BZ + D / 2 - 0.15]} s={[0.03, 0.35, 0.03]} c="#8a5a3c" />);
    return out;
  }, []);
  return <group>{items}</group>;
}

function Scaffold() {
  const items = useMemo(() => {
    const out: JSX.Element[] = [];
    const x0 = BX + W / 2 + 0.3;
    const top = 12;
    const zs = [-1.7, -0.75, 0.2, 1.15, 1.75].map((z) => BZ + z);
    for (const dx of [0, 0.32])
      for (const z of zs) out.push(<Box key={`p${dx}${z}`} p={[x0 + dx, ly(top) / 2 + 0.2, z]} s={[0.035, ly(top) + 0.4, 0.035]} c="#9aa4ae" />);
    for (let l = 1; l <= top; l++) {
      out.push(<Box key={`b${l}`} p={[x0 + 0.16, ly(l), BZ]} s={[0.34, 0.03, D - 0.2]} c={C.timberLight} />);
      out.push(<Box key={`r${l}`} p={[x0 + 0.32, ly(l) + 0.2, BZ]} s={[0.03, 0.03, D - 0.2]} c="#9aa4ae" />);
      out.push(<Box key={`t${l}`} p={[x0 + 0.32, ly(l) + 0.06, BZ]} s={[0.02, 0.07, D - 0.2]} c={C.orange} />);
    }
    return out;
  }, []);
  return <group>{items}</group>;
}

function Crane() {
  const slew = useRef<THREE.Group>(null!);
  const trolley = useRef<THREE.Group>(null!);
  const cable = useRef<THREE.Mesh>(null!);
  const hook = useRef<THREE.Group>(null!);
  const mastH = 9.4;
  const mast = useMemo(() => {
    const out: JSX.Element[] = [];
    for (const [x, z] of [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17],
    ])
      out.push(<Box key={`m${x}${z}`} p={[x, mastH / 2, z]} s={[0.05, mastH, 0.05]} c={C.yellow} />);
    for (let y = 0.4; y < mastH; y += 0.45) {
      out.push(<Box key={`h${y}a`} p={[0, y, -0.17]} s={[0.36, 0.035, 0.035]} c="#e6b21f" />);
      out.push(<Box key={`h${y}b`} p={[0, y, 0.17]} s={[0.36, 0.035, 0.035]} c="#e6b21f" />);
      out.push(<Box key={`h${y}c`} p={[-0.17, y, 0]} s={[0.035, 0.035, 0.36]} c="#e6b21f" />);
      out.push(<Box key={`h${y}d`} p={[0.17, y, 0]} s={[0.035, 0.035, 0.36]} c="#e6b21f" />);
      out.push(<Box key={`x${y}`} p={[0, y + 0.22, 0.17]} s={[0.03, 0.5, 0.03]} r={[0, 0, 0.65]} c="#e6b21f" />);
    }
    return out;
  }, []);
  useFrame(() => {
    const w = sim.wall;
    slew.current.rotation.y = -2.5 + Math.sin(w * 0.12) * 0.75;
    const tx = 3.6 + Math.sin(w * 0.21 + 1) * 1.6;
    trolley.current.position.x = tx;
    const len = 2.6 + Math.sin(w * 0.33) * 1.1;
    cable.current.scale.y = len;
    cable.current.position.y = -len / 2;
    hook.current.position.y = -len;
  });
  return (
    <group position={[3.6, 0, -3.6]}>
      <Box p={[0, 0.15, 0]} s={[1.0, 0.3, 1.0]} c="#9a958c" />
      {mast}
      <group ref={slew} position={[0, mastH, 0]}>
        <Box p={[0, 0.15, 0]} s={[0.5, 0.3, 0.5]} c={C.yellow} />
        {/* cab with camera */}
        <Box p={[0.32, -0.05, 0.25]} s={[0.35, 0.3, 0.3]} c={C.white} />
        <Box p={[0.5, -0.05, 0.25]} s={[0.02, 0.18, 0.24]} c="#4b6b88" />
        <group position={[0.45, -0.25, 0.25]}>
          <Box p={[0, 0, 0]} s={[0.12, 0.1, 0.12]} c="#222" />
          <group rotation={[0, 0, 0.5]}>
            <ScanCone height={4.5} radius={1.4} y={-2.25} opacity={0.08} />
          </group>
        </group>
        {/* jib */}
        <Box p={[3.9, 0.35, 0]} s={[7.6, 0.08, 0.08]} c={C.yellow} />
        <Box p={[3.9, 0.12, -0.12]} s={[7.6, 0.06, 0.06]} c="#e6b21f" />
        <Box p={[3.9, 0.12, 0.12]} s={[7.6, 0.06, 0.06]} c="#e6b21f" />
        {Array.from({ length: 15 }).map((_, i) => (
          <Box key={i} p={[0.4 + i * 0.5, 0.24, 0]} s={[0.03, 0.26, 0.26]} r={[0, 0, 0.6]} c="#e6b21f" />
        ))}
        {/* counter jib + weights */}
        <Box p={[-1.4, 0.2, 0]} s={[2.6, 0.1, 0.3]} c={C.yellow} />
        <Box p={[-2.4, -0.05, 0]} s={[0.6, 0.4, 0.42]} c="#8d949c" />
        {/* apex */}
        <Box p={[0, 0.85, 0]} s={[0.12, 1.1, 0.12]} c={C.yellow} />
        <Box p={[0.6, 0.8, 0]} s={[2.5, 0.02, 0.02]} r={[0, 0, -0.35]} c="#666" />
        <Box p={[-0.9, 0.8, 0]} s={[2.1, 0.02, 0.02]} r={[0, 0, 0.45]} c="#666" />
        <Box p={[0, 1.45, 0]} s={[0.08, 0.08, 0.08]} c="#ff3b30" emissive="#ff2a1a" />
        <group ref={trolley} position={[3, 0.05, 0]}>
          <Box p={[0, 0, 0]} s={[0.3, 0.1, 0.3]} c="#555" />
          <mesh ref={cable}>
            <boxGeometry args={[0.02, 1, 0.02]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <group ref={hook}>
            <Box p={[0, -0.05, 0]} s={[0.12, 0.12, 0.12]} c="#ffb000" />
            <Box p={[0, -0.3, 0]} s={[0.7, 0.08, 0.45]} c="#9c6a3e" />
            <Box p={[0, -0.2, 0]} s={[0.62, 0.14, 0.38]} c="#e8e5df" />
          </group>
        </group>
      </group>
    </group>
  );
}

function Hoist() {
  const cage = useRef<THREE.Group>(null!);
  useFrame(() => {
    const k = (Math.sin(sim.wall * 0.18) + 1) / 2;
    cage.current.position.y = 0.2 + k * ly(12);
  });
  const x = BX - 1.6;
  const z = BZ + D / 2 + 0.35;
  return (
    <group>
      <Box p={[x, ly(13) / 2, z + 0.2]} s={[0.14, ly(13), 0.14]} c="#9aa4ae" />
      <group ref={cage} position={[x, 0, z]}>
        <Box p={[0, 0.2, 0]} s={[0.5, 0.4, 0.36]} c="#ffc928" />
        <Box p={[0, 0.2, 0.185]} s={[0.36, 0.3, 0.01]} c="#4b6b88" />
      </group>
    </group>
  );
}

function Truck() {
  const g = useRef<THREE.Group>(null!);
  const wheels = useRef<THREE.Mesh[]>([]);
  useFrame(() => {
    const per = 34;
    const k = sim.wall % per;
    let x: number;
    if (k < 8) x = -13 + (k / 8) * 15.2; // drive in
    else if (k < 20) x = 2.2; // unloading at the gate
    else x = 2.2 + ((k - 20) / 14) * 13;
    g.current.position.set(x, 0, 5.6);
    const moving = !(k >= 8 && k < 20);
    wheels.current.forEach((w) => w && moving && (w.rotation.z = -x * 3));
  });
  return (
    <group ref={g}>
      <Box p={[0.95, 0.42, 0]} s={[0.6, 0.55, 0.62]} c={C.blue} />
      <Box p={[1.12, 0.52, 0]} s={[0.28, 0.25, 0.64]} c="#bfe3f5" />
      <Box p={[-0.15, 0.24, 0]} s={[1.7, 0.1, 0.66]} c="#3b3f46" />
      <Box p={[-0.35, 0.42, 0]} s={[0.6, 0.26, 0.5]} c={C.timberLight} />
      <Box p={[0.25, 0.39, 0]} s={[0.4, 0.2, 0.5]} c="#e6e1d6" />
      {[
        [0.9, 0.34],
        [0.9, -0.34],
        [-0.6, 0.34],
        [-0.6, -0.34],
      ].map(([x, z], i) => (
        <mesh key={i} ref={(m) => void (wheels.current[i] = m!)} position={[x, 0.14, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.1, 10]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ))}
    </group>
  );
}

function Loader() {
  const g = useRef<THREE.Group>(null!);
  const arm = useRef<THREE.Group>(null!);
  useFrame(() => {
    const per = 14;
    const k = (sim.wall % per) / per;
    const a: [number, number] = [4.6, 2.2];
    const b: [number, number] = [2.6, 1.9];
    const s = k < 0.5 ? k * 2 : 2 - k * 2;
    const e = s * s * (3 - 2 * s);
    g.current.position.set(a[0] + (b[0] - a[0]) * e, 0, a[1] + (b[1] - a[1]) * e);
    g.current.rotation.y = -Math.PI / 2;
    arm.current.rotation.z = k > 0.45 && k < 0.6 ? -0.5 : 0.1;
  });
  return (
    <group ref={g}>
      <Box p={[0, 0.25, 0]} s={[0.7, 0.28, 0.42]} c={C.yellow} />
      <Box p={[-0.15, 0.52, 0]} s={[0.32, 0.3, 0.36]} c="#ffe08a" />
      <Box p={[-0.15, 0.53, 0]} s={[0.33, 0.18, 0.3]} c="#3e5a77" />
      <group ref={arm} position={[0.3, 0.38, 0]}>
        <Box p={[0.28, -0.05, 0]} s={[0.45, 0.06, 0.06]} c="#d9a21f" />
        <Box p={[0.55, -0.15, 0]} s={[0.12, 0.2, 0.5]} c="#555" />
      </group>
      {[
        [0.22, 0.24],
        [0.22, -0.24],
        [-0.22, 0.24],
        [-0.22, -0.24],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.13, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.1, 10]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ))}
    </group>
  );
}

function SiteGround() {
  const fence = useMemo(() => {
    const out: JSX.Element[] = [];
    const x0 = -6.6,
      x1 = 6.6,
      z0 = -5.6,
      z1 = 4.5;
    const seg = (a: [number, number], b: [number, number], key: string) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const cx = (a[0] + b[0]) / 2;
      const cz = (a[1] + b[1]) / 2;
      const rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
      out.push(
        <mesh key={key} position={[cx, 0.22, cz]} rotation={[0, -rot, 0]}>
          <boxGeometry args={[len, 0.4, 0.03]} />
          <meshStandardMaterial color="#e9ecef" roughness={0.9} />
        </mesh>,
      );
      out.push(
        <mesh key={key + 'b'} position={[cx, 0.4, cz]} rotation={[0, -rot, 0]}>
          <boxGeometry args={[len, 0.05, 0.04]} />
          <meshStandardMaterial color={C.blue} roughness={0.9} />
        </mesh>,
      );
    };
    seg([x0, z1], [1.4, z1], 'f1');
    seg([3.2, z1], [x1, z1], 'f2');
    seg([x1, z1], [x1, z0], 'f3');
    seg([x0, z1], [x0, z0], 'f4');
    seg([x0, z0], [x1, z0], 'f5');
    return out;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={C.grass} roughness={1} />
      </mesh>
      <Box p={[0, 0.005, -0.55]} s={[13.2, 0.02, 10.1]} c={C.dirt} />
      <Box p={[2.3, 0.012, 2.6]} s={[1.8, 0.02, 3.8]} c={C.dirtDark} />
      {/* road */}
      <Box p={[0, 0.006, 5.6]} s={[80, 0.02, 1.5]} c={C.road} />
      {Array.from({ length: 24 }).map((_, i) => (
        <Box key={i} p={[-23 + i * 2, 0.02, 5.6]} s={[0.9, 0.01, 0.07]} c="#f3f3f3" />
      ))}
      <Box p={[0, 0.01, 6.65]} s={[80, 0.04, 0.6]} c="#c9cdd2" />
      {fence}
      {/* gate posts */}
      <Box p={[1.4, 0.35, 4.5]} s={[0.1, 0.7, 0.1]} c={C.orange} />
      <Box p={[3.2, 0.35, 4.5]} s={[0.1, 0.7, 0.1]} c={C.orange} />
      {/* site cabins */}
      <Box p={[-5.2, 0.28, 3.4]} s={[1.6, 0.56, 0.7]} c="#f1f3f5" />
      <Box p={[-5.2, 0.84, 3.4]} s={[1.6, 0.56, 0.7]} c="#2f7de1" />
      <Box p={[-5.2, 0.3, 3.76]} s={[0.25, 0.4, 0.02]} c="#4b6b88" />
      <Box p={[-4.7, 0.86, 3.76]} s={[0.4, 0.22, 0.02]} c="#bfe3f5" />
      <Box p={[-3.9, 0.35, 3.8]} s={[0.35, 0.7, 0.35]} c="#3fb26a" />
      {/* materials */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[4.6 + i * 0.6, 0, -1.2]}>
          <Box p={[0, 0.05, 0]} s={[0.5, 0.1, 0.5]} c={C.timber} />
          <Box p={[0, 0.25, 0]} s={[0.46, 0.3, 0.46]} c={i === 1 ? '#e6e1d6' : '#b4bcc6'} />
        </group>
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[5.3, 0.06 + (i % 2) * 0.08, -2.6 + i * 0.08]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 1.6, 6]} />
          <meshStandardMaterial color="#8a5a3c" />
        </mesh>
      ))}
      <Box p={[4.9, 0.25, 2.3]} s={[0.9, 0.5, 0.7]} c="#bfa47c" />
      {/* trees outside site */}
      {[
        [-8, 2],
        [-8.5, -2.5],
        [8, -1],
        [8.6, 2.8],
        [-7.6, 6.9],
        [6.5, 7.3],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Box p={[0, 0.25, 0]} s={[0.15, 0.5, 0.15]} c="#8a5a3c" />
          <Box p={[0, 0.75, 0]} s={[0.7, 0.6, 0.7]} c={i % 2 ? C.grassDark : '#5aa648'} />
        </group>
      ))}
    </group>
  );
}

/* ---------------- devices & intelligence network ---------------- */
type Device = { kind: 'cam' | 'sensor' | 'drone' | 'wear'; pos: (w: number, out: THREE.Vector3) => THREE.Vector3; zone?: Zone['id'] };
const fixed = (x: number, y: number, z: number) => (_: number, o: THREE.Vector3) => o.set(x, y, z);
const CAMS: { p: [number, number, number]; yaw: number; zone?: Zone['id'] }[] = [
  { p: [BX + W / 2 + 0.1, ly(14) + 0.38, BZ + D / 2 + 0.1], yaw: 0.6, zone: 'breach' },
  { p: [BX - W / 2 - 0.1, ly(7) + 0.38, BZ + D / 2 + 0.1], yaw: -0.6, zone: 'trip' },
  { p: [BX + W / 2 + 0.1, ly(9) + 0.38, BZ + D / 2 + 0.1], yaw: 0.8, zone: 'floor' },
  { p: [BX + W / 2 + 0.62, ly(12) + 0.6, BZ - D / 2 + 0.3], yaw: 1.2 },
  { p: [3.2, 1.0, 4.5], yaw: 3.4 },
];
const SENSORS: { p: [number, number, number]; zone?: Zone['id'] }[] = [
  { p: [BX + 1.6, ly(14) + 0.1, BZ + 0.9], zone: 'breach' },
  { p: [BX - 1.7, ly(7) + 0.1, BZ + 1.2], zone: 'trip' },
  { p: [BX + 1.4, ly(9) + 0.1, BZ + 1.3], zone: 'floor' },
  { p: [BX - 1.2, ly(4) + 0.1, BZ + 1.5] },
  { p: [BX + 0.5, ly(11) + 0.1, BZ + 1.6] },
  { p: [BX - 1.0, ly(16) + 0.1, BZ + 1.2] },
];

const DEVICES: Device[] = [
  ...CAMS.map((c) => ({ kind: 'cam' as const, pos: fixed(...c.p), zone: c.zone })),
  ...SENSORS.map((s) => ({ kind: 'sensor' as const, pos: fixed(...s.p), zone: s.zone })),
  { kind: 'drone', pos: (w, o) => { const p = droneA(w); return o.set(p.x, p.y, p.z); } },
  { kind: 'drone', pos: (w, o) => { const p = droneB(w); return o.set(p.x, p.y, p.z); }, zone: 'breach' },
  { kind: 'drone', pos: (w, o) => { const p = droneC(w); return o.set(p.x, p.y, p.z); } },
  ...groundWalkers
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => g.wear)
    .map(({ i }) => ({ kind: 'wear' as const, pos: (w: number, o: THREE.Vector3) => { const p = walkerPos(i, w); return o.set(p.x, 0.5, p.z); } })),
  // crane cab camera
  { kind: 'cam', pos: fixed(3.6, 9.2, -3.6) },
];

function FixedCam({ p, yaw, zone }: { p: [number, number, number]; yaw: number; zone?: Zone['id'] }) {
  const head = useRef<THREE.Group>(null!);
  const cone = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    head.current.rotation.y = yaw + Math.sin(sim.wall * 0.6 + yaw * 3) * 0.45;
    const z = ZONES.find((zz) => zz.id === zone);
    const hot = z && sim.t >= z.on && sim.t < z.on + 3;
    if (cone.current) {
      cone.current.color.set(hot ? z!.color : C.teal);
      cone.current.opacity = hot ? 0.22 : 0.1;
    }
  });
  return (
    <group position={p}>
      <Box p={[0, 0.06, 0]} s={[0.05, 0.12, 0.05]} c="#666" />
      <group ref={head}>
        <Box p={[0, 0.12, 0.05]} s={[0.12, 0.1, 0.2]} c="#f2f4f6" />
        <Box p={[0, 0.12, 0.16]} s={[0.07, 0.07, 0.02]} c="#111" />
        <group position={[0, 0.12, 0.17]} rotation={[Math.PI / 2 + 0.55, 0, 0]}>
          <mesh position={[0, -0.9, 0]} userData={{ noShadow: true }} renderOrder={5}>
            <coneGeometry args={[0.6, 1.8, 20, 1, true]} />
            <meshBasicMaterial ref={cone} color={C.teal} transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Sensor({ p, zone, i }: { p: [number, number, number]; zone?: Zone['id']; i: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => {
    const z = ZONES.find((zz) => zz.id === zone);
    const hot = z && sim.t >= z.on && sim.t < z.off;
    const pulse = (Math.sin(sim.wall * 3 + i * 1.7) + 1) / 2;
    mat.current.emissive.set(hot ? z!.color : C.teal);
    mat.current.emissiveIntensity = hot ? 1.5 + pulse : 0.3 + pulse * 1.2;
  });
  return (
    <group position={p}>
      <Box p={[0, 0.04, 0]} s={[0.14, 0.08, 0.14]} c="#e9edf1" />
      <mesh position={[0, 0.1, 0]} userData={{ noShadow: true }}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial ref={mat} color="#0b2b2a" emissive={C.teal} />
      </mesh>
    </group>
  );
}

/** connected sources: each device sends small data pings upward; detected events send a coloured uplink */
function Network() {
  const pulses = useRef<THREE.InstancedMesh>(null!);
  const evPulses = useRef<THREE.Mesh[]>([]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const w = sim.wall;
    const boot = between(sim.t, 0.5, 4);
    DEVICES.forEach((d, i) => {
      d.pos(w, tmp);
      const ph = (w * 0.55 + i * 0.373) % 1;
      const vis = boot > (i / DEVICES.length) * 0.9;
      dummy.position.set(tmp.x, tmp.y + 0.15 + ph * 0.9, tmp.z);
      dummy.scale.setScalar(vis ? 0.07 * (1 - ph) + 0.0001 : 0.0001);
      dummy.updateMatrix();
      pulses.current.setMatrixAt(i, dummy.matrix);
    });
    pulses.current.instanceMatrix.needsUpdate = true;

    ZONES.forEach((z, i) => {
      const m = evPulses.current[i];
      const k = (sim.t - z.on) / 0.8;
      if (k >= 0 && k <= 1) {
        m.visible = true;
        const c = zoneCenter(z);
        m.position.set(c.x, c.y + k * k * 7, c.z);
        m.scale.set(0.12, 0.12 + Math.sin(k * Math.PI) * 0.5, 0.12);
      } else m.visible = false;
    });
  });

  return (
    <group>
      <instancedMesh ref={pulses} args={[undefined, undefined, DEVICES.length]} renderOrder={6}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#0fd9c6" toneMapped={false} />
      </instancedMesh>
      {ZONES.map((z, i) => (
        <mesh key={z.id} ref={(m) => void (evPulses.current[i] = m!)} visible={false} renderOrder={7}>
          <sphereGeometry args={[1, 14, 10]} />
          <meshBasicMaterial color={z.color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* zone highlight: level band + room box + chip */
function ZoneHighlight({ z }: { z: Zone }) {
  const box = useRef<THREE.Mesh>(null!);
  const boxMat = useRef<THREE.MeshBasicMaterial>(null!);
  const band = useRef<THREE.Mesh>(null!);
  const bandMat = useRef<THREE.MeshBasicMaterial>(null!);
  const edges = useRef<THREE.LineSegments>(null!);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null!);
  const chip = useRef<HTMLDivElement>(null);
  const c = zoneCenter(z);
  const sx = z.x[1] - z.x[0] + 0.16;
  const sz = z.z[1] - z.z[0] + 0.16;
  const boxGeo = useMemo(() => new THREE.BoxGeometry(sx, H + 0.02, sz), [sx, sz]);
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo]);
  useFrame(() => {
    const t = sim.t;
    const active = t >= z.on && t < z.off;
    const tracking = z.track && t >= z.track[0] && t < z.track[1];
    const age = t - z.on;
    const pulse = (Math.sin(sim.wall * 7) + 1) / 2;
    const strong = active ? (age < 4 ? 0.35 + pulse * 0.45 : 0.25 + pulse * 0.15) : tracking ? 0.1 + pulse * 0.08 : 0;
    const color = active ? z.color : C.teal;
    box.current.visible = active || !!tracking;
    boxMat.current.color.set(color);
    boxMat.current.opacity = strong;
    edges.current.visible = box.current.visible;
    edgeMat.current.color.set(color);
    band.current.visible = active;
    bandMat.current.color.set(color);
    bandMat.current.opacity = active ? (age < 4 ? 0.12 + pulse * 0.16 : 0.08) : 0;
    if (chip.current) {
      chip.current.style.opacity = active ? '1' : tracking ? '0.85' : '0';
      chip.current.style.setProperty('--zc', color);
      chip.current.dataset.mode = active ? 'on' : 'track';
    }
  });
  return (
    <group>
      <mesh ref={band} position={[BX, ly(z.level) + H / 2 + 0.02, BZ]} renderOrder={8} userData={{ noShadow: true }}>
        <boxGeometry args={[W + 0.3, H + 0.04, D + 0.3]} />
        <meshBasicMaterial ref={bandMat} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={box} position={c} geometry={boxGeo} renderOrder={9} userData={{ noShadow: true }}>
        <meshBasicMaterial ref={boxMat} transparent depthWrite={false} depthTest={false} />
      </mesh>
      <lineSegments ref={edges} position={c} geometry={edgeGeo} renderOrder={10}>
        <lineBasicMaterial ref={edgeMat} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      <PingRing at={[c.x, c.y, c.z]} color={z.color} start={z.on} size={1.6} />
      <PingRing at={[c.x, c.y, c.z]} color={z.color} start={z.on + 0.5} size={1.2} />
      <Html position={[c.x + sx / 2 + 0.25, c.y + 0.1, c.z + sz / 2]} zIndexRange={[18, 8]} style={{ pointerEvents: 'none' }}>
        <div ref={chip} className="zone-chip" style={{ opacity: 0 }}>
          <span className="zdot" />
          {z.label}
        </div>
      </Html>
    </group>
  );
}

function SiteWorkers() {
  const s = 0.34;
  const upper: { l: number; pose: (t: number, w: number) => Pose; vest?: string }[] = [
    {
      l: 14,
      pose: (_, w) => {
        const p = loopPath([[BX - 1.9, BZ - 1.2], [BX + 0.1, BZ - 1.2], [BX + 0.1, BZ + 0.4], [BX - 1.9, BZ + 0.4]], 0.35, w);
        return { x: p.x, z: p.z, rot: p.heading, mode: 'walk' };
      },
    },
    { l: 16, pose: () => ({ x: BX - 1.6, z: BZ + 1.2, rot: 0.4, mode: 'work' }), vest: '#c6f03a' },
    { l: 16, pose: () => ({ x: BX + 0.2, z: BZ + 0.9, rot: -0.6, mode: 'kneel' }) },
    {
      l: 11,
      pose: (_, w) => {
        const p = loopPath([[BX - 1.5, BZ + 1.4], [BX + 1.8, BZ + 1.4]], 0.3, w + 4);
        return { x: p.x, z: p.z, rot: p.heading, mode: 'walk' };
      },
      vest: '#c6f03a',
    },
    { l: 9, pose: () => ({ x: BX + 1.3, z: BZ + 1.2, rot: 0.8, mode: 'kneel' }) },
  ];
  return (
    <group>
      {groundWalkers.map((g, i) => (
        <Worker
          key={i}
          scale={s}
          vest={g.vest}
          helmet={g.helmet}
          wearable={g.wear}
          pose={(_, w) => {
            const p = walkerPos(i, w);
            return { x: p.x, z: p.z, rot: p.heading, mode: 'walk', speed: 10 };
          }}
        />
      ))}
      {upper.map((u, i) => (
        <group key={i} position={[0, ly(u.l) + 0.07, 0]}>
          <Worker scale={s} vest={u.vest} pose={u.pose} />
        </group>
      ))}
      {/* worker at the gate */}
      <Worker scale={s} vest="#c6f03a" helmet={C.white} pose={(_, w) => ({ x: 1.9, z: 4.1, rot: 0.3 + Math.sin(w * 0.4) * 0.6, mode: 'look' })} />
    </group>
  );
}

function SiteWorld() {
  return (
    <>
      <Lights shadowSize={11} target={[0, 2, 0]} />
      <FitOrtho target={[0.4, 3.9, 0]} dir={[1, 0.82, 1]} fitW={12.6} fitH={17.2} sway={0.07} />
      <SiteGround />
      <Building />
      <Scaffold />
      <Crane />
      <Hoist />
      <Truck />
      <Loader />
      <SiteWorkers />
      {CAMS.map((c, i) => (
        <FixedCam key={i} {...c} />
      ))}
      {SENSORS.map((s, i) => (
        <Sensor key={i} p={s.p} zone={s.zone} i={i} />
      ))}
      <Drone path={droneA} scale={0.7} />
      <Drone path={droneB} scale={0.7} />
      <Drone path={droneC} scale={0.7} />
      <Network />
      {ZONES.map((z) => (
        <ZoneHighlight key={z.id} z={z} />
      ))}
      <AutoShadows />
    </>
  );
}

export default function SiteScene({ active = true }: { active?: boolean }) {
  return (
    <Canvas frameloop={active ? 'always' : 'never'} orthographic shadows dpr={[1, 2]} camera={{ position: [20, 18, 20], zoom: 40, near: 0.1, far: 200 }} gl={{ antialias: true, alpha: true }}>
      <SiteWorld />
    </Canvas>
  );
}

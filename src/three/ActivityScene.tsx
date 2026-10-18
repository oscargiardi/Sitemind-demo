import { useEffect, useMemo, useRef, type JSX } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '../sim/clock';
import {
  BREACH,
  PPE,
  TRIP,
  FLOOR,
  SEVERITY_COLOR,
  boardTime,
  boardsInstalled,
  roomAt,
  between,
  type RoomId,
} from '../sim/timeline';
import { AutoShadows, Box, C, FitOrtho, Lights, PingRing, VisionBox, Worker, loopPath, track, type Key, type Pose } from './common';

const RED = SEVERITY_COLOR.critical;
const AMBER = SEVERITY_COLOR.warning;
const GREEN = SEVERITY_COLOR.success;
const TEAL = C.teal;

/* canvas-texture signage */
function useSign(lines: string[], bg: string, fg: string, w = 256, h = 192, border?: string) {
  return useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 14;
      g.strokeRect(7, 7, w - 14, h - 14);
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fs = Math.floor(h / (lines.length + 1.2));
    lines.forEach((l, i) => {
      g.font = `800 ${i === 0 ? fs * 1.05 : fs * 0.78}px Arial, Helvetica, sans-serif`;
      g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1));
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [lines.join('|'), bg, fg, w, h, border]);
}

function Sign({ p, r = 0, lines, bg, fg, border, s = [0.8, 0.6] }: { p: [number, number, number]; r?: number; lines: string[]; bg: string; fg: string; border?: string; s?: [number, number] }) {
  const tex = useSign(lines, bg, fg, 256, Math.round((256 * s[1]) / s[0]), border);
  return (
    <group position={p} rotation={[0, r, 0]}>
      <Box p={[0, -p[1] / 2, -0.03]} s={[0.05, p[1], 0.05]} c="#888" />
      <mesh>
        <boxGeometry args={[s[0], s[1], 0.03]} />
        <meshStandardMaterial attach="material-0" color={bg} />
        <meshStandardMaterial attach="material-1" color={bg} />
        <meshStandardMaterial attach="material-2" color={bg} />
        <meshStandardMaterial attach="material-3" color={bg} />
        <meshStandardMaterial attach="material-4" map={tex} roughness={0.7} />
        <meshStandardMaterial attach="material-5" color="#ddd" />
      </mesh>
    </group>
  );
}

function Slab({ w, d, color = C.concrete }: { w: number; d: number; color?: string }) {
  return (
    <group>
      <Box p={[0, -0.2, 0]} s={[w, 0.4, d]} c={color} />
      {/* subtle pour joints */}
      {Array.from({ length: Math.floor(w / 1.9) }).map((_, i) => (
        <Box key={i} p={[-w / 2 + (i + 1) * 1.9, 0.002, 0]} s={[0.02, 0.004, d]} c={C.concreteDark} />
      ))}
    </group>
  );
}

function Column({ x, z, h = 2.6 }: { x: number; z: number; h?: number }) {
  return <Box p={[x, h / 2, z]} s={[0.4, h, 0.4]} c={C.column} />;
}

function Cone({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Box p={[0, 0.02, 0]} s={[0.3, 0.04, 0.3]} c="#222" />
      <mesh position={[0, 0.22, 0]}>
        <coneGeometry args={[0.12, 0.4, 12]} />
        <meshStandardMaterial color={C.orange} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.072, 0.09, 0.08, 12]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
    </group>
  );
}

/* ================================================================== */
/* ROOM 1 — Level 14, Zone 3A: exclusion zone breach                    */
/* ================================================================== */
const ZONE = { x0: 0.4, x1: 3.4, z0: -3.0, z1: 0.4, gap: [1.0, 2.6] as [number, number] };
const inZoneBreach = (t: number) => t >= BREACH.cross && t < BREACH.exitCross;

const walkerKeys: Key[] = [
  { t: 0, x: -3.0, z: 2.6 },
  { t: BREACH.walkStart, x: -3.0, z: 2.6 },
  { t: 15.2, x: -1.2, z: 2.4 },
  { t: 17.2, x: 0.9, z: 1.6 },
  { t: BREACH.cross, x: 1.8, z: 0.4 },
  { t: 19.9, x: 2.2, z: -0.9 },
  { t: BREACH.turnBack, x: 2.2, z: -0.9 },
  { t: BREACH.exitCross, x: 1.8, z: 0.4 },
  { t: 29, x: 0.6, z: 1.8 },
  { t: 30.6, x: -0.6, z: 2.6 },
];

function ZoneMarking() {
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  const fill = useRef<THREE.MeshBasicMaterial>(null!);
  const { x0, x1, z0, z1, gap } = ZONE;
  useFrame(() => {
    const breach = inZoneBreach(sim.t);
    const blink = Math.sin(sim.wall * 14) > 0;
    mats.current.forEach((m) => {
      if (!m) return;
      m.color.set(breach ? (blink ? RED : '#ff9a9a') : C.yellow);
      m.emissive.set(breach ? RED : '#000');
      m.emissiveIntensity = breach ? (blink ? 0.9 : 0.3) : 0;
    });
    fill.current.color.set(breach ? RED : C.yellow);
    fill.current.opacity = breach ? 0.16 + (blink ? 0.12 : 0) : 0.07;
  });
  const lines: [number, number, number, number][] = [
    [x0, z0, x1, z0],
    [x0, z0, x0, z1],
    [x1, z0, x1, z1],
    [x0, z1, gap[0], z1],
    [gap[1], z1, x1, z1],
    [gap[0], z1, gap[1], z1],
  ];
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, 0.012, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} userData={{ noShadow: true }}>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
        <meshBasicMaterial ref={fill} color={C.yellow} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      {lines.map(([a, b, c, d], i) => {
        const len = Math.hypot(c - a, d - b);
        const horiz = Math.abs(d - b) < 0.01;
        return (
          <mesh key={i} position={[(a + c) / 2, 0.015, (b + d) / 2]}>
            <boxGeometry args={[horiz ? len : 0.12, 0.02, horiz ? 0.12 : len]} />
            <meshStandardMaterial ref={(m) => void (mats.current[i] = m!)} color={C.yellow} />
          </mesh>
        );
      })}
      {/* barrier posts + chain (left open on the walkway side: the breach point) */}
      {[
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
        [(x0 + x1) / 2, z0],
        [x0, (z0 + z1) / 2],
        [x1, (z0 + z1) / 2],
        [gap[0], z1],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Box p={[0, 0.03, 0]} s={[0.26, 0.06, 0.26]} c="#333" />
          <Box p={[0, 0.42, 0]} s={[0.08, 0.8, 0.08]} c={i % 2 ? C.red : C.white} />
          <Box p={[0, 0.62, 0]} s={[0.085, 0.14, 0.085]} c={C.red} />
        </group>
      ))}
      {[
        [x0, z0, x1, z0],
        [x0, z0, x0, z1],
        [x1, z0, x1, z1],
        [x0, z1, gap[0], z1],
      ].map(([a, b, c, d], i) => {
        const len = Math.hypot(c - a, d - b);
        const horiz = Math.abs(d - b) < 0.01;
        return <Box key={i} p={[(a + c) / 2, 0.66, (b + d) / 2]} s={[horiz ? len : 0.03, 0.04, horiz ? 0.03 : len]} c={C.red} />;
      })}
      {/* moved barrier lying open at the gap */}
      <group position={[gap[1] + 0.2, 0.05, z1 + 0.35]} rotation={[0, 0.4, Math.PI / 2]}>
        <Box p={[0, 0, 0]} s={[0.08, 0.8, 0.08]} c={C.white} />
      </group>
      <Cone p={[gap[1] + 0.6, 0, z1 + 0.1]} />
      <Sign p={[x0 - 0.05, 1.15, z1 + 0.25]} r={0.35} lines={['DANGER', 'OVERHEAD LIFT', 'NO ENTRY']} bg="#ffffff" fg="#c8102e" border="#c8102e" s={[0.9, 0.7]} />
    </group>
  );
}

function SuspendedLoad() {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    g.current.rotation.z = Math.sin(sim.wall * 0.9) * 0.03;
    g.current.rotation.x = Math.sin(sim.wall * 0.7) * 0.025;
  });
  const cx = (ZONE.x0 + ZONE.x1) / 2;
  const cz = (ZONE.z0 + ZONE.z1) / 2;
  return (
    <group ref={g} position={[cx, 9.5, cz]}>
      <Box p={[0, -3.2, 0]} s={[0.03, 6.4, 0.03]} c="#333" />
      <Box p={[0, -6.45, 0]} s={[0.22, 0.2, 0.22]} c="#ffb000" />
      <Box p={[0.5, -6.85, 0]} s={[0.02, 0.8, 0.02]} r={[0, 0, 0.6]} c="#333" />
      <Box p={[-0.5, -6.85, 0]} s={[0.02, 0.8, 0.02]} r={[0, 0, -0.6]} c="#333" />
      {/* steel beams bundle */}
      <Box p={[0, -7.3, 0]} s={[2.2, 0.16, 0.28]} c="#5d7da0" />
      <Box p={[0, -7.3, 0.3]} s={[2.2, 0.16, 0.28]} c="#5677a0" />
      <Box p={[0, -7.14, 0.15]} s={[2.2, 0.16, 0.28]} c="#6a8ab0" />
    </group>
  );
}

function BreachRoom() {
  const walkerPose = (t: number): Pose => {
    const p = track(walkerKeys, t);
    let mode: Pose['mode'] = p.moving ? 'walk' : 'idle';
    if (!p.moving && t > 19.9 && t < BREACH.turnBack) mode = 'look';
    return { x: p.x, z: p.z, rot: t < BREACH.walkStart ? 1.2 : p.heading, mode };
  };
  return (
    <group>
      <Slab w={7.6} d={7} />
      {/* edge protection */}
      <Box p={[0, 0.5, -3.45]} s={[7.6, 0.06, 0.06]} c={C.yellow} />
      <Box p={[0, 1.0, -3.45]} s={[7.6, 0.06, 0.06]} c={C.yellow} />
      <Box p={[3.75, 0.5, 0]} s={[0.06, 0.06, 7]} c={C.yellow} />
      <Box p={[3.75, 1.0, 0]} s={[0.06, 0.06, 7]} c={C.yellow} />
      {[-3.4, -1.7, 0, 1.7, 3.4].map((z) => (
        <Box key={z} p={[3.75, 0.5, z]} s={[0.06, 1.0, 0.06]} c="#999" />
      ))}
      <Column x={-3.5} z={-3.2} />
      <Column x={-3.5} z={0.3} />
      <Column x={-0.2} z={-3.2} h={2.6} />
      {/* materials */}
      <group position={[-2.7, 0, -2.5]}>
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} p={[0, 0.06 + i * 0.08, 0]} s={[1.3, 0.07, 0.9]} c={i % 2 ? '#d9b07a' : '#c99a62'} />
        ))}
      </group>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[-1.8 + (i % 4) * 0.1, 0.05 + Math.floor(i / 4) * 0.09, 2.95]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 2.4, 6]} />
          <meshStandardMaterial color="#8a5a3c" />
        </mesh>
      ))}
      <Box p={[-3.0, 0.3, 1.6]} s={[0.6, 0.6, 0.6]} c="#3f8cff" />
      <Box p={[-3.0, 0.62, 1.6]} s={[0.62, 0.05, 0.62]} c="#2f6fd0" />
      <Box p={[-1.4, 0.07, -1.3]} s={[1.6, 0.1, 0.05]} c="#8a5a3c" />
      <Box p={[-1.4, 0.07, -1.0]} s={[1.6, 0.1, 0.05]} c="#8a5a3c" />
      <ZoneMarking />
      <SuspendedLoad />

      {/* the worker who breaches the zone */}
      <Worker pose={walkerPose} vest={C.orange} helmet={C.yellow}>
        <VisionBox
          w={0.75}
          h={1.25}
          y={0.62}
          state={(t) => {
            const breach = inZoneBreach(t);
            return {
              visible: breach,
              color: RED,
              label: 'EXCLUSION ZONE',
              strong: true,
            };
          }}
        />
      </Worker>
      <PingRing at={[1.8, 0.05, 0.4]} color={RED} start={BREACH.cross} size={1.3} />
      <PingRing at={[1.8, 0.05, 0.4]} color={RED} start={BREACH.cross + 0.45} size={1.0} />

      <Worker pose={() => ({ x: -2.3, z: -1.2, rot: 2.6, mode: 'kneel' })} vest="#c6f03a" helmet={C.white} skin={C.skin2}>
      </Worker>
      <Worker pose={() => ({ x: -0.9, z: -2.4, rot: 0, mode: 'work' })} vest={C.orange} helmet={C.blue} skin={C.skin3}>
      </Worker>
      <Worker
        pose={(_, w) => {
          const p = loopPath([[-3.0, -0.2], [-0.6, -0.2]], 0.55, w);
          return { x: p.x, z: p.z, rot: p.heading, mode: 'walk' };
        }}
        vest="#c6f03a"
        helmet={null}
      >
        {/* missing hard hat: box sits on the head only */}
        <VisionBox
          w={0.42}
          h={0.4}
          y={0.86}
          state={(t) => ({ visible: t >= PPE.detect, color: AMBER, label: 'NO HARD HAT', strong: t < PPE.detect + 3 })}
        />
      </Worker>
      <PingRing at={[-1.8, 0.05, -0.2]} color={AMBER} start={PPE.detect} size={1.1} />
      {/* slinger / signaller watching the lift */}
      <Worker pose={() => ({ x: 3.2, z: 2.0, rot: -2.6, mode: 'look' })} vest={C.orange} helmet={C.white} skin={C.skin2} />
    </group>
  );
}

/* ================================================================== */
/* ROOM 2 — Level 7, Room 8: trip hazard                               */
/* ================================================================== */
const cablePts = [
  [-0.8, -2.45],
  [-0.55, -1.4],
  [0.05, -0.4],
  [0.15, 0.7],
  [0.55, 1.7],
  [1.15, 2.45],
].map(([x, z]) => new THREE.Vector3(x, 0.045, z));

const tripWalker: Key[] = [
  { t: 0, x: -4.4, z: 0.7 },
  { t: TRIP.walkStart, x: -4.4, z: 0.7 },
  { t: 35.6, x: -0.45, z: 0.7 },
  { t: 36.6, x: 0.7, z: 0.7, y: 0 },
  { t: 38.8, x: 3.0, z: 0.7 },
  { t: 39.6, x: 3.1, z: 1.7 },
];

function TripRoom() {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(cablePts), []);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null!);
  const glow = useRef<THREE.Mesh>(null!);
  const lane = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    const on = sim.t >= TRIP.detect;
    const pulse = (Math.sin(sim.wall * 8) + 1) / 2;
    glow.current.visible = on;
    glowMat.current.opacity = 0.35 + pulse * 0.45;
    lane.current.color.set(on ? AMBER : '#3cc47a');
    lane.current.opacity = on ? 0.22 + pulse * 0.18 : 0.22;
  });
  const walkerPose = (t: number): Pose => {
    const p = track(tripWalker, t);
    // step over the cable
    const hop = t > 35.75 && t < 36.35 ? Math.sin(((t - 35.75) / 0.6) * Math.PI) * 0.16 : 0;
    const looking = t > 39.6;
    return { x: p.x, z: p.z, y: hop, rot: p.heading, mode: p.moving ? 'walk' : looking ? 'look' : 'idle', visible: t >= 30 };
  };
  return (
    <group>
      <Slab w={7.6} d={7} color="#d4d0c8" />
      {/* walls (cutaway) */}
      <Box p={[0, 1.2, -3.55]} s={[7.6, 2.4, 0.12]} c="#eceae4" />
      <Box p={[1.6, 1.4, -3.48]} s={[1.6, 0.9, 0.04]} c="#a9d6ef" />
      <Box p={[-3.85, 1.2, -1.75]} s={[0.12, 2.4, 3.6]} c="#e4e1da" />
      <Box p={[-3.85, 1.2, 2.55]} s={[0.12, 2.4, 1.9]} c="#e4e1da" />
      <Box p={[-3.85, 2.25, 0.7]} s={[0.12, 0.3, 1.4]} c="#e4e1da" />
      {/* exposed studs to the right */}
      {[-3.0, -2.2, -1.4, -0.6].map((z) => (
        <Box key={z} p={[3.75, 1.2, z]} s={[0.08, 2.4, 0.12]} c="#c0c6cc" />
      ))}
      <Box p={[3.75, 2.36, -1.8]} s={[0.08, 0.08, 3.4]} c="#c0c6cc" />
      {/* walkway lane */}
      <mesh position={[0, 0.006, 0.7]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} userData={{ noShadow: true }}>
        <planeGeometry args={[7.6, 1.2]} />
        <meshBasicMaterial ref={lane} color="#3cc47a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <Box p={[0, 0.01, 0.1]} s={[7.6, 0.01, 0.06]} c="#2fa866" />
      <Box p={[0, 0.01, 1.3]} s={[7.6, 0.01, 0.06]} c="#2fa866" />
      {[-3, -1.6, 1.9, 3.2].map((x) => (
        <group key={x} position={[x, 0.012, 0.7]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
          <mesh>
            <coneGeometry args={[0.18, 0.32, 3]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
      {/* 110V transformer + cable + work lamp */}
      <group position={[-0.95, 0, -2.7]}>
        <Box p={[0, 0.22, 0]} s={[0.5, 0.44, 0.36]} c={C.yellow} />
        <Box p={[0, 0.46, 0]} s={[0.2, 0.06, 0.1]} c="#333" />
        <Box p={[0.26, 0.25, 0.05]} s={[0.04, 0.1, 0.12]} c="#1a7cff" />
      </group>
      <mesh>
        <tubeGeometry args={[curve, 80, 0.045, 8, false]} />
        <meshStandardMaterial color="#ff7a1a" roughness={0.5} />
      </mesh>
      <mesh ref={glow} renderOrder={6} userData={{ noShadow: true }}>
        <tubeGeometry args={[curve, 80, 0.12, 10, false]} />
        <meshBasicMaterial ref={glowMat} color={AMBER} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </mesh>
      <group position={[1.25, 0, 2.6]}>
        {[0, 2.1, 4.2].map((a) => (
          <Box key={a} p={[Math.sin(a) * 0.18, 0.4, Math.cos(a) * 0.18]} s={[0.04, 0.85, 0.04]} r={[Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]} c="#444" />
        ))}
        <Box p={[0, 0.9, 0]} s={[0.36, 0.26, 0.14]} c="#ffdf3b" emissive="#ffd23b" />
      </group>
      {/* ceiling-board fixer on stepladder */}
      <group position={[2.2, 0, -2.4]}>
        <Box p={[-0.2, 0.45, 0]} s={[0.05, 0.9, 0.05]} r={[0.15, 0, 0]} c="#9aa4ae" />
        <Box p={[0.2, 0.45, 0]} s={[0.05, 0.9, 0.05]} r={[0.15, 0, 0]} c="#9aa4ae" />
        <Box p={[0, 0.62, 0.06]} s={[0.45, 0.04, 0.2]} c="#9aa4ae" />
        <Box p={[0, 0.3, -0.06]} s={[0.45, 0.04, 0.2]} c="#9aa4ae" />
      </group>
      <group position={[2.2, 0.64, -2.35]}>
        <Worker pose={() => ({ x: 0, z: 0, rot: Math.PI, mode: 'work' })} vest="#c6f03a" helmet={C.white} skin={C.skin2} />
      </group>
      {/* plasterboard stack + kneeling worker */}
      <group position={[-2.6, 0, -2.6]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Box key={i} p={[0, 0.04 + i * 0.05, 0]} s={[1.4, 0.045, 0.8]} c={i % 2 ? '#f0efe9' : '#e5e3dc'} />
        ))}
      </group>
      <Worker pose={() => ({ x: -2.4, z: -1.6, rot: Math.PI, mode: 'kneel' })} vest={C.orange} helmet={C.yellow} skin={C.skin3} />
      <Box p={[-1.5, 0.12, 2.6]} s={[0.5, 0.24, 0.26]} c="#d63c2e" />
      <mesh position={[2.9, 0.18, 2.7]}>
        <cylinderGeometry args={[0.18, 0.16, 0.36, 12]} />
        <meshStandardMaterial color="#f2f2f2" />
      </mesh>

      {/* the walker approaching the hazard */}
      <Worker pose={walkerPose} vest={C.orange} helmet={C.yellow}>
      </Worker>

      {/* hazard marker */}
      <group position={[0.15, 0.05, 0.7]}>
        <VisionBox
          w={1.9}
          h={0.5}
          y={0.05}
          state={(t) => ({
            visible: t >= TRIP.detect,
            color: AMBER,
            label: 'TRIP HAZARD',
            strong: t < TRIP.detect + 3,
          })}
        />
        <HazardPin />
      </group>
      <PingRing at={[0.15, 0.03, 0.7]} color={AMBER} start={TRIP.detect} size={1.4} />
      <PingRing at={[0.15, 0.03, 0.7]} color={AMBER} start={TRIP.detect + 0.45} size={1.0} />
    </group>
  );
}

function HazardPin() {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    const k = between(sim.t, TRIP.detect, TRIP.detect + 0.35);
    g.current.visible = sim.t >= TRIP.detect;
    g.current.scale.setScalar(Math.max(0.001, k));
    g.current.position.y = 1.55 + Math.sin(sim.wall * 3) * 0.06;
    g.current.rotation.y = sim.wall * 1.2;
  });
  return (
    <group ref={g}>
      <mesh rotation={[0, 0, 0]}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.7} flatShading />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <coneGeometry args={[0.05, 0.6, 6]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

/* ================================================================== */
/* ROOM 3 — Level 9, Room 12: timber flooring progress                 */
/* ================================================================== */
const RX0 = -3.5;
const RX1 = 3.5;
const RZ0 = -2.5;
const RZ1 = 2.5;
const BW = (RX1 - RX0) / FLOOR.boards; // 0.35
const boardX = (i: number) => RX0 + BW / 2 + i * BW;
const STACK: [number, number] = [4.75, 0.2];
const KNEEL_Z = [-1.5, 0.0, 1.5];
const IDLE: [number, number][] = [
  [4.2, -0.8],
  [4.15, 1.1],
  [5.3, 1.0],
];
const EXIT: [number, number][] = [
  [5.4, 2.4],
  [6.0, 1.7],
  [5.2, 3.0],
];

function floorWorkerPose(w: number) {
  const mine: number[] = [];
  for (let i = FLOOR.startBoards; i < FLOOR.boards; i++) if ((i - FLOOR.startBoards) % FLOOR.workers === w) mine.push(i);
  const stand: [number, number] = [STACK[0] - 0.45, STACK[1] + (w - 1) * 0.5];
  return (t: number): Pose => {
    for (const i of mine) {
      const T = boardTime(i);
      const s = T - 2.6;
      const e = T + 1.525;
      if (t >= s && t < e) {
        const ph = t - s;
        const slot: [number, number] = [boardX(i) + 0.42, KNEEL_Z[w]];
        if (ph < 0.35) return { x: stand[0], z: stand[1], rot: Math.PI / 2, mode: 'bend' };
        if (ph < 1.95) {
          const k = (ph - 0.35) / 1.6;
          return {
            x: stand[0] + (slot[0] - stand[0]) * k,
            z: stand[1] + (slot[1] - stand[1]) * k,
            rot: Math.atan2(slot[0] - stand[0], slot[1] - stand[1]),
            mode: 'carry',
            carrying: true,
          };
        }
        if (ph < 2.95) return { x: slot[0], z: slot[1], rot: -Math.PI / 2, mode: 'kneel', carrying: t < T };
        const k = (ph - 2.95) / 1.175;
        return {
          x: slot[0] + (stand[0] - slot[0]) * k,
          z: slot[1] + (stand[1] - slot[1]) * k,
          rot: Math.atan2(stand[0] - slot[0], stand[1] - slot[1]),
          mode: 'walk',
        };
      }
    }
    const idle = IDLE[w];
    const firstT = boardTime(mine[0]) - 2.6;
    if (t < firstT) {
      // walk from idle spot to the stack just before the first pick
      const k = between(t, firstT - 1.0, firstT);
      const moving = k > 0 && k < 1;
      return {
        x: idle[0] + (stand[0] - idle[0]) * k,
        z: idle[1] + (stand[1] - idle[1]) * k,
        rot: moving ? Math.atan2(stand[0] - idle[0], stand[1] - idle[1]) : -Math.PI / 2,
        mode: moving ? 'walk' : 'idle',
      };
    }
    // finished: step back and move away from the completed room
    const leave = FLOOR.complete + 0.4 + w * 0.3;
    if (t < leave) return { x: stand[0], z: stand[1], rot: -Math.PI / 2, mode: 'idle' };
    const k = between(t, leave, leave + 1.8);
    const ex = EXIT[w];
    const moving = k > 0 && k < 1;
    return {
      x: stand[0] + (ex[0] - stand[0]) * k,
      z: stand[1] + (ex[1] - stand[1]) * k,
      rot: moving ? Math.atan2(ex[0] - stand[0], ex[1] - stand[1]) : -Math.PI * 0.75,
      mode: moving ? 'walk' : 'look',
    };
  };
}

function Boards() {
  const refs = useRef<THREE.Group[]>([]);
  const strips = useMemo(() => {
    const out: { i: number; segs: { z: number; len: number; c: string }[] }[] = [];
    const shades = [C.timber, C.timberLight, '#d29a5e', '#bf8049', '#d8a36b'];
    for (let i = 0; i < FLOOR.boards; i++) {
      const segs: { z: number; len: number; c: string }[] = [];
      let z = RZ0;
      let first = 0.6 + ((i * 0.83) % 1.4);
      let k = 0;
      while (z < RZ1 - 0.001) {
        const len = Math.min(first, RZ1 - z);
        segs.push({ z: z + len / 2, len: len - 0.02, c: shades[(i * 3 + k) % shades.length] });
        z += len;
        first = 1.9;
        k++;
      }
      out.push({ i, segs });
    }
    return out;
  }, []);
  useFrame(() => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      const T = boardTime(i);
      const k = between(sim.t, T, T + 0.3);
      g.visible = sim.t >= T;
      g.position.y = (1 - k) * 0.3;
    });
  });
  return (
    <group>
      {strips.map(({ i, segs }) => (
        <group key={i} ref={(g) => void (refs.current[i] = g!)}>
          {segs.map((s, j) => (
            <Box key={j} p={[boardX(i), 0.035, s.z]} s={[BW - 0.02, 0.05, s.len]} c={s.c} />
          ))}
        </group>
      ))}
    </group>
  );
}

function FloorOverlay() {
  const area = useRef<THREE.Mesh>(null!);
  const areaMat = useRef<THREE.MeshBasicMaterial>(null!);
  const scan = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const n = boardsInstalled(sim.t);
    const w = n * BW;
    const done = sim.t >= FLOOR.complete;
    area.current.scale.x = w;
    area.current.position.x = RX0 + w / 2;
    const flash = done ? Math.max(0, 1 - (sim.t - FLOOR.complete) / 2.2) : 0;
    areaMat.current.color.set(done ? GREEN : TEAL);
    areaMat.current.opacity = done ? 0.1 + flash * 0.45 * (0.6 + 0.4 * Math.sin(sim.wall * 12)) : 0.18;
    scan.current.visible = !done && sim.t > ROOM_FLOOR_START;
    scan.current.position.x = RX0 + w;
    (scan.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(sim.wall * 6) * 0.25;
  });
  return (
    <group>
      <mesh ref={area} position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3} userData={{ noShadow: true }}>
        <planeGeometry args={[1, RZ1 - RZ0]} />
        <meshBasicMaterial ref={areaMat} color={TEAL} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <mesh ref={scan} position={[0, 0.3, 0]} renderOrder={4} userData={{ noShadow: true }}>
        <boxGeometry args={[0.04, 0.6, RZ1 - RZ0]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
const ROOM_FLOOR_START = 43.5;

function FloorRoom() {
  const poses = useMemo(() => [0, 1, 2].map((w) => floorWorkerPose(w)), []);
  const plank = (
    <group rotation={[0, 0, 0]}>
      <Box p={[0, 0, 0]} s={[1.3, 0.05, 0.3]} c={C.timberLight} />
    </group>
  );
  const stackRef = useRef<THREE.Group>(null!);
  useFrame(() => {
    // the stack shrinks as boards are used
    const left = FLOOR.boards - boardsInstalled(sim.t);
    stackRef.current.children.forEach((c, i) => (c.visible = i < Math.ceil(left / 1.4) + 1));
  });
  return (
    <group>
      {/* structural slab + corridor */}
      <Slab w={7.0} d={5.0} color="#cfcac0" />
      <group position={[4.6, 0, 0.2]}>
        <Box p={[0, -0.2, 0]} s={[2.2, 0.4, 5.6]} c="#d7d3cb" />
      </group>
      {/* subfloor (plywood) */}
      <Box p={[0, 0.006, 0]} s={[7.0, 0.012, 5.0]} c="#e9d9b5" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Box key={i} p={[RX0 + (i + 1) * 1.4, 0.014, 0]} s={[0.015, 0.004, 5]} c="#cdb88d" />
      ))}
      {/* walls: back finished, left partially boarded */}
      <Box p={[0, 1.25, RZ0 - 0.06]} s={[7.2, 2.5, 0.12]} c="#efede7" />
      <Box p={[-1.0, 1.55, RZ0 + 0.01]} s={[1.8, 1.0, 0.03]} c="#a9d6ef" />
      <Box p={[RX0 - 0.06, 1.25, -1.2]} s={[0.12, 2.5, 2.6]} c="#e4e1da" />
      {[0.3, 1.0, 1.7, 2.4].map((z) => (
        <Box key={z} p={[RX0 - 0.06, 1.25, z]} s={[0.08, 2.5, 0.1]} c="#c0c6cc" />
      ))}
      <Box p={[RX0 - 0.06, 2.46, 1.3]} s={[0.08, 0.08, 2.6]} c="#c0c6cc" />
      <Boards />
      <FloorOverlay />
      {/* timber stack */}
      <group ref={stackRef} position={[STACK[0], 0, STACK[1]]}>
        {Array.from({ length: 10 }).map((_, i) => (
          <Box key={i} p={[0, 0.05 + i * 0.055, 0]} s={[0.75, 0.05, 1.5]} c={i % 2 ? C.timberLight : C.timber} />
        ))}
      </group>
      <Box p={[5.1, 0.2, -1.6]} s={[0.55, 0.4, 0.35]} c="#d63c2e" />
      <Box p={[4.4, 0.16, -2.2]} s={[0.35, 0.32, 0.35]} c="#3f8cff" />
      {poses.map((p, w) => (
        <Worker key={w} pose={p} vest={w === 1 ? '#c6f03a' : C.orange} helmet={w === 2 ? C.white : C.yellow} skin={[C.skin, C.skin3, C.skin2][w]} carry={plank}>
        </Worker>
      ))}
      <Html position={[0, 0.2, 0]} center zIndexRange={[25, 12]} style={{ pointerEvents: 'none' }}>
        <CompleteBadge />
      </Html>
      <PingRing at={[0, 0.1, 0]} color={GREEN} start={FLOOR.complete} size={3.2} />
    </group>
  );
}

function CompleteBadge() {
  // rendered inside <Html> (a separate React root), so drive it with rAF rather than useFrame
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (el.current) {
        const on = sim.t >= FLOOR.complete + 0.2;
        el.current.style.opacity = on ? '1' : '0';
        el.current.style.transform = `scale(${on ? 1 : 0.8})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={el} className="complete-badge" style={{ opacity: 0 }}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="#2fd47a" />
        <path d="M5.5 10.4l3 3 6-6.6" stroke="#04210f" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Room 12 · Flooring 100%
    </div>
  );
}

/* ================================================================== */

function RoomSwitch() {
  const refs = useRef<Record<RoomId, THREE.Group | null>>({ breach: null, trip: null, floor: null });
  useFrame(() => {
    const r = roomAt(sim.t);
    (Object.keys(refs.current) as RoomId[]).forEach((k) => {
      const g = refs.current[k];
      if (g) g.visible = k === r;
    });
  });
  const rooms: [RoomId, JSX.Element][] = [
    ['breach', <BreachRoom />],
    ['trip', <TripRoom />],
    ['floor', <FloorRoom />],
  ];
  return (
    <>
      {rooms.map(([id, el]) => (
        <group key={id} ref={(g) => void (refs.current[id] = g)}>
          {el}
        </group>
      ))}
    </>
  );
}

export default function ActivityScene() {
  return (
    <Canvas orthographic shadows dpr={[1, 2]} camera={{ position: [20, 18, 20], zoom: 60, near: 0.1, far: 200 }} gl={{ antialias: true, alpha: true }}>
      <Lights shadowSize={8} target={[0, 0, 0]} />
      <FitOrtho target={[0.45, 0.7, 0.1]} dir={[1, 1.3, 1.15]} fitW={10.1} fitH={10.5} sway={0.06} swaySpeed={0.12} />
      <RoomSwitch />
      <AutoShadows />
    </Canvas>
  );
}

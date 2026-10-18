import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '../sim/clock';
import { HVAC, between, isHvac } from '../sim/timeline';
import { AutoShadows, Box, C, FitOrtho, Lights, ScanCone, Worker, type Pose } from './common';

/* Level 5, Room 5.04 — ceiling void with a supply-duct extension.
   One room model is rendered twice: an isometric capture overview (left panel)
   and the mechanic's helmet POV (middle panel). */

type View = 'overview' | 'pov';

const GRID_Y = 2.7; // suspended ceiling
const SLAB_Y = 3.4; // slab soffit
const DUCT_X = 0.4;
const DUCT_Y = 3.1;
const OPEN = { x0: -1.8, x1: 1.8, z0: -1.8, z1: 1.2 }; // tiles lifted here
const LIFT: [number, number, number] = [0, 0, 1.0];
const PLATFORM_Y = 1.3;
const HANGER_Z = { a: -0.8, b: 0.4 };
const SPIGOT_Z = -0.2;
const DIFFUSER: [number, number, number] = [1.2, GRID_Y, -0.2];

/* ------------------------------------------------------------------ */
/* captured elements: drive both the point cloud and the POV labels     */
/* ------------------------------------------------------------------ */
type Sample = { c: [number, number, number]; s: [number, number, number] };
type Item = { id: string; t: number; label: string; at: [number, number, number]; boxes: Sample[]; sweep?: boolean };

const ITEMS: Item[] = [
  {
    id: 'soffit',
    t: HVAC.sweep,
    label: 'Slab soffit · void 700 mm',
    at: [-0.4, SLAB_Y - 0.05, -1.2],
    boxes: [{ c: [0, SLAB_Y, -0.3], s: [4.4, 0.001, 3.6] }],
    sweep: true,
  },
  { id: 'tray', t: 72.5, label: 'Cable tray 150 mm', at: [-1.0, 2.95, -0.9], boxes: [{ c: [-1.0, 2.95, 0], s: [0.3, 0.07, 5.6] }] },
  {
    id: 'jb',
    t: 73.4,
    label: 'JB-5-12 · 230 V',
    at: [-1.6, 3.3, -0.6],
    boxes: [
      { c: [-1.6, 3.33, -0.6], s: [0.18, 0.12, 0.18] },
      { c: [-1.6, 3.0, -0.6], s: [0.03, 0.6, 0.03] },
    ],
  },
  {
    id: 'existing',
    t: 74.2,
    label: 'Supply duct 600 × 300',
    at: [DUCT_X, DUCT_Y, 1.6],
    boxes: [
      { c: [DUCT_X, DUCT_Y, 2.0], s: [0.6, 0.3, 2.0] },
      { c: [DUCT_X, 2.93, 2.2], s: [0.95, 0.05, 0.05] },
    ],
  },
  {
    id: 'hangerA',
    t: HVAC.hangerA[1] + 0.1,
    label: 'M10 drop rods · trapeze',
    at: [DUCT_X + 0.38, 3.1, HANGER_Z.a],
    boxes: hangerBoxes(HANGER_Z.a),
  },
  {
    id: 'hangerB',
    t: HVAC.hangerB[1] + 0.1,
    label: 'Trapeze 2 · 1.2 m centres',
    at: [DUCT_X + 0.38, 3.1, HANGER_Z.b],
    boxes: hangerBoxes(HANGER_Z.b),
  },
  {
    id: 'duct',
    t: HVAC.duct[1],
    label: 'Duct section · TDC flange',
    at: [DUCT_X, DUCT_Y, -0.4],
    boxes: [
      { c: [DUCT_X, DUCT_Y, -0.2], s: [0.6, 0.3, 2.4] },
      { c: [DUCT_X, DUCT_Y, 1.0], s: [0.68, 0.38, 0.04] },
    ],
  },
  {
    id: 'spigot',
    t: HVAC.spigot[1],
    label: '250 Ø spigot · VCD',
    at: [DUCT_X, 2.85, SPIGOT_Z],
    boxes: [
      { c: [DUCT_X, 2.88, SPIGOT_Z], s: [0.25, 0.14, 0.25] },
      { c: [0.8, 2.8, SPIGOT_Z], s: [0.7, 0.2, 0.22] },
      { c: DIFFUSER, s: [0.6, 0.01, 0.6] },
    ],
  },
  {
    id: 'insulation',
    t: HVAC.insulation[1],
    label: '25 mm foil insulation',
    at: [DUCT_X, DUCT_Y + 0.2, -0.9],
    boxes: [{ c: [DUCT_X, DUCT_Y, -0.2], s: [0.68, 0.38, 2.4] }],
  },
];

function hangerBoxes(z: number): Sample[] {
  return [
    { c: [DUCT_X - 0.38, (SLAB_Y + 2.93) / 2, z], s: [0.02, SLAB_Y - 2.93, 0.02] },
    { c: [DUCT_X + 0.38, (SLAB_Y + 2.93) / 2, z], s: [0.02, SLAB_Y - 2.93, 0.02] },
    { c: [DUCT_X, 2.93, z], s: [0.95, 0.05, 0.05] },
  ];
}

/* deterministic random */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildCloud() {
  const pos: number[] = [];
  const at: number[] = [];
  const r = rng(42);
  for (const it of ITEMS) {
    for (const b of it.boxes) {
      const [sx, sy, sz] = b.s;
      // area of each face pair
      const faces = [
        { a: sy * sz, axis: 0 },
        { a: sx * sz, axis: 1 },
        { a: sx * sy, axis: 2 },
      ];
      const area = faces.reduce((m, f) => m + f.a * 2, 0);
      const n = Math.max(40, Math.min(1400, Math.round(area * (it.sweep ? 75 : 260))));
      for (let i = 0; i < n; i++) {
        let pick = r() * area;
        let axis = 0;
        for (const f of faces) {
          if (pick < f.a * 2) {
            axis = f.axis;
            break;
          }
          pick -= f.a * 2;
        }
        const p = [(r() - 0.5) * sx, (r() - 0.5) * sy, (r() - 0.5) * sz];
        p[axis] = (r() < 0.5 ? -0.5 : 0.5) * b.s[axis];
        const x = b.c[0] + p[0];
        const y = b.c[1] + p[1];
        const z = b.c[2] + p[2];
        pos.push(x, y, z);
        at.push(it.sweep ? it.t + ((x + 2.2) / 4.4) * 1.6 + r() * 0.25 : it.t - 0.4 + r() * 0.9);
      }
    }
  }
  return { pos: new Float32Array(pos), at: new Float32Array(at), count: at.length };
}
const CLOUD = buildCloud();
/** share of the final cloud captured at time t (used by the software panel) */
export function capturedFraction(t: number) {
  let n = 0;
  for (let i = 0; i < CLOUD.count; i++) if (CLOUD.at[i] <= t) n++;
  return n / CLOUD.count;
}

function PointCloud({ persp, size }: { persp: boolean; size: number }) {
  const gl = useThree((s) => s.gl);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uT: { value: 0 }, uSize: { value: size }, uPersp: { value: persp ? 1 : 0 }, uDpr: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aT;
          uniform float uT; uniform float uSize; uniform float uPersp; uniform float uDpr;
          varying float vK;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            float k = clamp((uT - aT) / 0.6, 0.0, 1.0);
            vK = k;
            float s = uSize * uDpr * (1.0 + (1.0 - k) * 1.6);
            if (uPersp > 0.5) s = min(s * 1.6 / max(0.3, -mv.z), 7.0 * uDpr);
            gl_PointSize = uT < aT ? 0.0 : s;
          }`,
        fragmentShader: /* glsl */ `
          varying float vK;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            if (dot(d, d) > 0.25) discard;
            vec3 col = mix(vec3(1.0), vec3(0.18, 0.89, 0.82), vK);
            gl_FragColor = vec4(col, 0.85);
          }`,
      }),
    [persp, size],
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(CLOUD.pos, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(CLOUD.at, 1));
    return g;
  }, []);
  useFrame(() => {
    mat.uniforms.uT.value = sim.t;
    mat.uniforms.uDpr.value = gl.getPixelRatio();
  });
  return <points geometry={geo} material={mat} renderOrder={8} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* room                                                                */
/* ------------------------------------------------------------------ */
function CeilingGrid({ view }: { view: View }) {
  const items = useMemo(() => {
    const out: React.JSX.Element[] = [];
    // T-bar grid
    for (let x = -4; x <= 4.001; x += 0.6)
      out.push(<Box key={`gx${x}`} p={[x, GRID_Y, 0]} s={[0.025, 0.02, 6]} c="#e8e8e4" />);
    for (let z = -3; z <= 3.001; z += 0.6)
      out.push(<Box key={`gz${z}`} p={[0, GRID_Y, z]} s={[8, 0.02, 0.025]} c="#e8e8e4" />);
    if (view === 'pov') {
      // tiles everywhere except the lifted bays
      for (let x = -4; x < 3.99; x += 0.6)
        for (let z = -3; z < 2.99; z += 0.6) {
          const cx = x + 0.3;
          const cz = z + 0.3;
          if (cx > OPEN.x0 && cx < OPEN.x1 && cz > OPEN.z0 && cz < OPEN.z1) continue;
          if (Math.abs(cx - DIFFUSER[0]) < 0.31 && Math.abs(cz - DIFFUSER[2]) < 0.31) continue;
          const light = (Math.round(cx * 10) + Math.round(cz * 10)) % 7 === 0;
          out.push(
            <Box key={`t${x}${z}`} p={[cx, GRID_Y + 0.01, cz]} s={[0.58, 0.015, 0.58]} c={light ? '#fffdf4' : '#f1f0ec'} emissive={light ? '#bbb6a0' : undefined} />,
          );
        }
    }
    return out;
  }, [view]);
  return <group>{items}</group>;
}

function ScissorLift({ rails = true }: { rails?: boolean }) {
  return (
    <group position={LIFT}>
      <Box p={[0, 0.18, 0]} s={[1.5, 0.22, 0.85]} c="#2f6fd0" />
      {[-0.55, 0.55].map((x) =>
        [-0.32, 0.32].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.1, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.08, 10]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        )),
      )}
      {[0.38, -0.38].map((z) => (
        <group key={z}>
          <Box p={[0, 0.55, z]} s={[1.35, 0.06, 0.05]} r={[0, 0, 0.42]} c="#9aa4ae" />
          <Box p={[0, 0.55, z]} s={[1.35, 0.06, 0.05]} r={[0, 0, -0.42]} c="#9aa4ae" />
          <Box p={[0, 1.0, z]} s={[1.35, 0.06, 0.05]} r={[0, 0, 0.42]} c="#9aa4ae" />
          <Box p={[0, 1.0, z]} s={[1.35, 0.06, 0.05]} r={[0, 0, -0.42]} c="#9aa4ae" />
        </group>
      ))}
      <Box p={[0, PLATFORM_Y - 0.04, 0]} s={[1.6, 0.08, 0.95]} c="#ffb000" />
      {[
        [-0.78, -0.45],
        [0.78, -0.45],
        [-0.78, 0.45],
        [0.78, 0.45],
      ].map(([x, z]) => (
        <Box key={`${x}${z}`} p={[x, PLATFORM_Y + 0.5, z]} s={[0.04, 1.0, 0.04]} c="#ffb000" />
      ))}
      {rails && (
        <>
          <Box p={[0, PLATFORM_Y + 1.0, 0.45]} s={[1.6, 0.04, 0.04]} c="#ffb000" />
          <Box p={[0, PLATFORM_Y + 1.0, -0.45]} s={[1.6, 0.04, 0.04]} c="#ffb000" />
          <Box p={[0.78, PLATFORM_Y + 1.0, 0]} s={[0.04, 0.04, 0.95]} c="#ffb000" />
          <Box p={[-0.78, PLATFORM_Y + 1.0, 0]} s={[0.04, 0.04, 0.95]} c="#ffb000" />
        </>
      )}
    </group>
  );
}

function Hanger({ z, win, existing }: { z: number; win?: [number, number]; existing?: boolean }) {
  const rods = useRef<THREE.Group[]>([]);
  const trap = useRef<THREE.Group>(null!);
  useFrame(() => {
    const k = existing ? 1 : between(sim.t, win![0], win![0] + (win![1] - win![0]) * 0.65);
    rods.current.forEach((g) => g && (g.scale.y = Math.max(0.001, k)));
    const tk = existing ? 1 : between(sim.t, win![0] + (win![1] - win![0]) * 0.6, win![1]);
    trap.current.visible = tk > 0;
    trap.current.position.y = 2.93 - (1 - tk) * 0.25;
  });
  const len = SLAB_Y - 2.93;
  return (
    <group>
      {[-0.38, 0.38].map((dx, i) => (
        <group key={dx} ref={(g) => void (rods.current[i] = g!)} position={[DUCT_X + dx, SLAB_Y, z]}>
          <Box p={[0, -len / 2, 0]} s={[0.022, len, 0.022]} c="#8c949c" />
          <Box p={[0, -0.02, 0]} s={[0.07, 0.04, 0.07]} c="#6c747c" />
        </group>
      ))}
      <group ref={trap} position={[DUCT_X, 2.93, z]}>
        <Box p={[0, 0, 0]} s={[0.95, 0.05, 0.05]} c="#c0c6cc" />
        <Box p={[-0.38, -0.04, 0]} s={[0.05, 0.03, 0.05]} c="#6c747c" />
        <Box p={[0.38, -0.04, 0]} s={[0.05, 0.03, 0.05]} c="#6c747c" />
      </group>
    </group>
  );
}

const DUCT_REST: [number, number, number] = [2.3, 0.18, 0.2];
function NewDuct() {
  const g = useRef<THREE.Group>(null!);
  const flange = useRef<THREE.Group>(null!);
  useFrame(() => {
    const t = sim.t;
    const [a, b] = HVAC.duct;
    const up = between(t, a, a + 1.2); // passed up to the platform
    const lift = between(t, a + 1.2, a + 3.4); // raised into the void
    const k = up * up * (3 - 2 * up);
    const target: [number, number, number] = [DUCT_X, DUCT_Y, -0.2];
    const mid: [number, number, number] = [DUCT_X, 2.4, -0.2];
    const p0 = DUCT_REST;
    const x = lift > 0 ? mid[0] + (target[0] - mid[0]) * lift : p0[0] + (mid[0] - p0[0]) * k;
    const y = lift > 0 ? mid[1] + (target[1] - mid[1]) * lift : p0[1] + (mid[1] - p0[1]) * k;
    const z = lift > 0 ? mid[2] + (target[2] - mid[2]) * lift : p0[2] + (mid[2] - p0[2]) * k;
    g.current.position.set(x, y, z);
    flange.current.visible = t >= a + 3.6;
    flange.current.scale.setScalar(0.6 + 0.4 * between(t, a + 3.6, b));
  });
  return (
    <group>
      <group ref={g}>
        <Box p={[0, 0, 0]} s={[0.6, 0.3, 2.4]} c="#c9d0d6" />
        <Box p={[0, 0.151, 0]} s={[0.58, 0.004, 2.36]} c="#dbe1e6" />
      </group>
      <group ref={flange} position={[DUCT_X, DUCT_Y, 1.0]}>
        <Box p={[0, 0, 0]} s={[0.68, 0.38, 0.04]} c="#9aa3ab" />
      </group>
    </group>
  );
}

function Spigot() {
  const g = useRef<THREE.Group>(null!);
  const flex = useRef<THREE.Mesh>(null!);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(DUCT_X, 2.84, SPIGOT_Z),
        new THREE.Vector3(DUCT_X + 0.15, 2.76, SPIGOT_Z),
        new THREE.Vector3(DIFFUSER[0] - 0.3, 2.86, SPIGOT_Z),
        new THREE.Vector3(DIFFUSER[0], 2.76, DIFFUSER[2]),
      ]),
    [],
  );
  useFrame(() => {
    const [a, b] = HVAC.spigot;
    g.current.visible = sim.t >= a;
    g.current.scale.setScalar(Math.max(0.001, between(sim.t, a, a + 0.6)));
    flex.current.visible = sim.t >= a + 0.9;
    const fk = between(sim.t, a + 0.9, b - 0.3);
    (flex.current.geometry as THREE.BufferGeometry).setDrawRange(0, Math.floor(fk * 60) * 8 * 6);
  });
  return (
    <group>
      <group ref={g} position={[DUCT_X, 2.9, SPIGOT_Z]}>
        <mesh>
          <cylinderGeometry args={[0.12, 0.12, 0.14, 16]} />
          <meshStandardMaterial color="#c9d0d6" />
        </mesh>
        <Box p={[0.14, 0, 0]} s={[0.05, 0.06, 0.05]} c="#e0483e" />
      </group>
      <mesh ref={flex}>
        <tubeGeometry args={[curve, 60, 0.11, 8, false]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Insulation() {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    const [a, b] = HVAC.insulation;
    const k = between(sim.t, a, b);
    g.current.visible = k > 0;
    g.current.scale.z = Math.max(0.001, k);
  });
  // grows from the flange end back along the run
  return (
    <group ref={g} position={[DUCT_X, DUCT_Y, 1.0]}>
      <Box p={[0, 0, -1.2]} s={[0.68, 0.38, 2.4]} c="#d7dde2" />
      <Box p={[0, 0.191, -1.2]} s={[0.5, 0.004, 2.4]} c="#eef2f5" />
    </group>
  );
}

function CeilingCam({ p, aim }: { p: [number, number, number]; aim: [number, number, number] }) {
  const q = useMemo(() => {
    const d = new THREE.Vector3(...aim).sub(new THREE.Vector3(...p)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
  }, [p, aim]);
  const len = new THREE.Vector3(...aim).distanceTo(new THREE.Vector3(...p));
  return (
    <group position={p}>
      <mesh>
        <sphereGeometry args={[0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#20262e" roughness={0.2} />
      </mesh>
      <Box p={[0, 0.03, 0]} s={[0.3, 0.06, 0.3]} c="#f2f4f6" />
      <group quaternion={q}>
        <ScanCone height={len} radius={len * 0.32} y={-len / 2} opacity={0.11} />
      </group>
    </group>
  );
}

function Lidar() {
  const ring = useRef<THREE.Mesh>(null!);
  const fan = useRef<THREE.Group>(null!);
  useFrame(() => {
    ring.current.rotation.y = sim.wall * 4;
    fan.current.rotation.y = Math.sin(sim.wall * 0.9) * 0.9;
  });
  return (
    <group position={[-3.88, 2.15, 0.6]}>
      <Box p={[-0.05, 0, 0]} s={[0.1, 0.22, 0.22]} c="#f2f4f6" />
      <mesh ref={ring} position={[0.08, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
        <meshStandardMaterial color="#14181e" emissive={C.teal} emissiveIntensity={0.6} />
      </mesh>
      <group ref={fan} position={[0.12, 0, 0]} rotation={[0, 0, 0.3]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ noShadow: true }} renderOrder={5}>
          <circleGeometry args={[4.2, 24, -0.45, 0.9]} />
          <meshBasicMaterial color={C.teal} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

/* the mechanic (overview only) */
function mechanicPose(t: number): Pose {
  const base = { x: LIFT[0], z: LIFT[2], y: PLATFORM_Y, rot: Math.PI };
  const [d0] = HVAC.duct;
  if (t < HVAC.hangerA[0]) return { ...base, mode: 'look' };
  if (t < HVAC.hangerB[1]) return { ...base, rot: Math.PI + 0.25, mode: 'work' };
  if (t < d0 + 1.2) return { ...base, rot: Math.PI - 1.2, mode: 'bend' };
  if (t < HVAC.duct[1]) return { ...base, rot: Math.PI + 0.3, mode: 'reach' };
  if (t < HVAC.spigot[1]) return { ...base, rot: Math.PI - 0.4, mode: 'work' };
  if (t < HVAC.insulation[1]) return { ...base, rot: Math.PI + 0.3, mode: 'reach' };
  return { ...base, mode: 'look' };
}

function Mechanic() {
  return (
    <Worker pose={mechanicPose} vest={C.orange} helmet={C.white} scale={1.15} skin={C.skin2}>
      {/* rear-facing helmet camera */}
      <group position={[0, 1.02, -0.17]}>
        <Box p={[0, 0, 0]} s={[0.1, 0.07, 0.06]} c="#1a1f26" />
        <mesh position={[0, 0, -0.035]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshStandardMaterial color="#000" emissive={C.teal} emissiveIntensity={1.4} />
        </mesh>
        <group rotation={[2.15, 0, 0]}>
          <ScanCone height={2.3} radius={0.85} y={-1.15} opacity={0.14} />
        </group>
      </group>
      {/* front helmet camera (the middle panel's POV) */}
      <group position={[0, 1.02, 0.16]}>
        <Box p={[0, 0, 0]} s={[0.08, 0.06, 0.05]} c="#1a1f26" />
        <group rotation={[-2.15, 0, 0]}>
          <ScanCone height={2.0} radius={0.8} y={-1.0} opacity={0.08} />
        </group>
      </group>
    </Worker>
  );
}

function Room({ view }: { view: View }) {
  return (
    <group>
      {/* floor + walls (cutaway in overview) */}
      <Box p={[0, -0.1, 0]} s={[8, 0.2, 6]} c="#cfcac0" />
      <Box p={[0, 0.002, 0]} s={[7.96, 0.004, 5.96]} c="#d9d4ca" />
      <Box p={[0, SLAB_Y / 2, -3.05]} s={[8, SLAB_Y, 0.1]} c="#ecebe6" />
      <Box p={[-4.05, SLAB_Y / 2, 0]} s={[0.1, SLAB_Y, 6.2]} c="#e4e1da" />
      <Box p={[-3.99, 1.3, -1.4]} s={[0.02, 1.0, 1.4]} c="#a9d6ef" />
      {view === 'pov' && (
        <>
          <Box p={[0, SLAB_Y + 0.1, 0]} s={[8, 0.2, 6]} c="#b7b2a9" />
          <Box p={[4.05, SLAB_Y / 2, 0]} s={[0.1, SLAB_Y, 6.2]} c="#e4e1da" />
          <Box p={[0, SLAB_Y / 2, 3.05]} s={[8, SLAB_Y, 0.1]} c="#ecebe6" />
        </>
      )}
      <CeilingGrid view={view} />
      {/* diffuser */}
      <group position={DIFFUSER}>
        <Box p={[0, 0, 0]} s={[0.58, 0.03, 0.58]} c="#f4f4f2" />
        <Box p={[0, -0.016, 0]} s={[0.36, 0.01, 0.36]} c="#d6d8da" />
        <Box p={[0, -0.02, 0]} s={[0.16, 0.01, 0.16]} c="#c4c7ca" />
      </group>
      {/* existing services */}
      <group>
        <Box p={[-1.0, 2.95, 0]} s={[0.3, 0.04, 5.8]} c="#a7afb7" />
        <Box p={[-1.14, 2.99, 0]} s={[0.02, 0.06, 5.8]} c="#a7afb7" />
        <Box p={[-0.86, 2.99, 0]} s={[0.02, 0.06, 5.8]} c="#a7afb7" />
        {[-0.08, -0.02, 0.04, 0.09].map((dx, i) => (
          <mesh key={dx} position={[-1.0 + dx, 2.99, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 5.8, 6]} />
            <meshStandardMaterial color={['#e2e2e2', '#3a6fd8', '#d63c2e', '#f2f2f2'][i]} />
          </mesh>
        ))}
        {[-2, 0, 2].map((z) => (
          <Box key={z} p={[-1.0, 3.18, z]} s={[0.02, 0.44, 0.02]} c="#8c949c" />
        ))}
        <Box p={[-1.6, 3.33, -0.6]} s={[0.18, 0.12, 0.18]} c="#e9e6dc" />
        <Box p={[-1.6, 3.0, -0.6]} s={[0.03, 0.6, 0.03]} c="#d8d4c8" />
        {/* existing duct run from AHU */}
        <Box p={[DUCT_X, DUCT_Y, 2.0]} s={[0.6, 0.3, 2.0]} c="#c3cad0" />
        <Hanger z={2.2} existing />
      </group>
      <Hanger z={HANGER_Z.a} win={HVAC.hangerA} />
      <Hanger z={HANGER_Z.b} win={HVAC.hangerB} />
      <NewDuct />
      <Spigot />
      <Insulation />
      {/* lifted tiles + kit on the floor */}
      <group position={[-2.6, 0, 1.9]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Box key={i} p={[0, 0.02 + i * 0.03, 0]} s={[0.6, 0.025, 0.6]} c="#f1f0ec" />
        ))}
      </group>
      <Box p={[2.6, 0.12, 2.3]} s={[0.5, 0.24, 0.3]} c="#d63c2e" />
      <mesh position={[2.9, 0.2, -2.2]}>
        <cylinderGeometry args={[0.25, 0.25, 0.4, 14]} />
        <meshStandardMaterial color="#e6e1d6" />
      </mesh>
      {view === 'overview' && <ScissorLift />}
      {/* sensing */}
      <CeilingCam p={[-3.7, GRID_Y - 0.05, -2.7]} aim={[0.3, 3.0, -0.2]} />
      <CeilingCam p={[3.7, GRID_Y - 0.05, -2.7]} aim={[0.2, 3.0, 0.2]} />
      <Lidar />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* overview (left panel)                                               */
/* ------------------------------------------------------------------ */
function OverviewWorld() {
  return (
    <>
      <Lights shadowSize={7} target={[0, 1, 0]} />
      <FitOrtho target={[0.2, 1.75, 0.1]} dir={[1, 0.95, 1.15]} fitW={10.2} fitH={10} sway={0.05} />
      <Room view="overview" />
      <Mechanic />
      <PointCloud persp={false} size={2.6} />
      <AutoShadows />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* helmet POV (middle panel)                                           */
/* ------------------------------------------------------------------ */
const LOOK: { t: number; p: [number, number, number] }[] = [
  { t: 70, p: [0.3, 2.85, -1.8] },
  { t: 71.0, p: [0.3, 2.95, -1.6] },
  { t: 72.3, p: [-1.2, 3.1, -0.9] },
  { t: 73.3, p: [-1.5, 3.25, -0.7] },
  { t: 74.3, p: [0.5, 3.3, -0.4] },
  { t: 75.2, p: [DUCT_X + 0.15, 3.1, HANGER_Z.a] },
  { t: 77.0, p: [DUCT_X + 0.15, 3.12, HANGER_Z.a] },
  { t: 77.6, p: [DUCT_X + 0.15, 3.15, HANGER_Z.b - 0.2] },
  { t: 79.2, p: [DUCT_X + 0.15, 3.15, HANGER_Z.b - 0.2] },
  { t: 80.3, p: [1.6, 1.4, 0.3] }, // looks down to take the duct
  { t: 81.0, p: [DUCT_X, 2.6, -0.5] },
  { t: 83.2, p: [DUCT_X, 3.05, -0.6] },
  { t: 84.0, p: [DUCT_X, 3.05, 0.6] },
  { t: 85.6, p: [DUCT_X, 3.05, 0.5] },
  { t: 86.4, p: [DUCT_X + 0.1, 2.85, SPIGOT_Z] },
  { t: 87.6, p: [0.8, 2.8, SPIGOT_Z] },
  { t: 88.6, p: [DIFFUSER[0], 2.75, DIFFUSER[2]] },
  { t: 89.6, p: [DUCT_X, 3.1, 0.2] },
  { t: 92.2, p: [DUCT_X, 3.1, -1.0] },
  { t: 93.5, p: [0.2, 2.9, -1.9] },
  { t: 95, p: [0.2, 2.9, -1.9] },
];
function lookAtTime(t: number, out: THREE.Vector3) {
  let i = 0;
  while (i < LOOK.length - 2 && LOOK[i + 1].t <= t) i++;
  const a = LOOK[i];
  const b = LOOK[i + 1];
  const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  const e = k * k * (3 - 2 * k);
  return out.set(a.p[0] + (b.p[0] - a.p[0]) * e, a.p[1] + (b.p[1] - a.p[1]) * e, a.p[2] + (b.p[2] - a.p[2]) * e);
}

function PovRig() {
  const { camera, size } = useThree();
  const hands = useRef<THREE.Group>(null!);
  const left = useRef<THREE.Group>(null!);
  const right = useRef<THREE.Group>(null!);
  const tool = useRef<THREE.Group>(null!);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    if (Math.abs(cam.aspect - aspect) > 0.001 || cam.fov !== 74) {
      cam.aspect = aspect;
      cam.fov = 74;
      cam.updateProjectionMatrix();
    }
    const t = sim.t;
    const bob = Math.sin(sim.wall * 1.7) * 0.012;
    cam.position.set(LIFT[0] + 0.05, PLATFORM_Y + 1.12 + bob, LIFT[2] - 0.15);
    cam.lookAt(lookAtTime(t, tmp));

    hands.current.position.copy(cam.position);
    hands.current.quaternion.copy(cam.quaternion);
    // hand choreography in camera space
    const work = (t >= HVAC.hangerA[0] && t < HVAC.hangerB[1]) || (t >= HVAC.spigot[0] && t < HVAC.spigot[1]);
    const carry = t >= HVAC.duct[0] + 0.6 && t < HVAC.duct[0] + 3.6;
    const wrap = t >= HVAC.insulation[0] && t < HVAC.insulation[1];
    const join = t >= HVAC.duct[0] + 3.6 && t < HVAC.duct[1];
    const osc = Math.sin(sim.wall * 7);
    // portrait panel: keep hands within ~±0.14 horizontally at this depth
    let ly = -0.3,
      ry = -0.3,
      lz = -0.5,
      rz = -0.5,
      lx = -0.13,
      rx = 0.13;
    if (work) {
      ly = -0.12;
      ry = -0.07 + osc * 0.02;
      lx = -0.1;
      rx = 0.09;
      lz = rz = -0.55;
    } else if (carry) {
      ly = ry = -0.06;
      lx = -0.14;
      rx = 0.14;
      lz = rz = -0.6;
    } else if (join) {
      ly = -0.1 + osc * 0.012;
      ry = -0.1 - osc * 0.012;
      lx = -0.11;
      rx = 0.11;
      lz = rz = -0.58;
    } else if (wrap) {
      ly = -0.08 + Math.sin(sim.wall * 3) * 0.04;
      ry = -0.08 - Math.sin(sim.wall * 3) * 0.04;
      lx = -0.1 + Math.cos(sim.wall * 3) * 0.03;
      rx = 0.1 - Math.cos(sim.wall * 3) * 0.03;
      lz = rz = -0.56;
    }
    left.current.position.lerp(tmp.set(lx, ly, lz), 0.12);
    right.current.position.lerp(tmp.set(rx, ry, rz), 0.12);
    tool.current.visible = work;
    tool.current.rotation.z = work ? osc * 0.4 : 0;
  });
  const glove = (
    <>
      <Box p={[0, 0, 0]} s={[0.1, 0.06, 0.13]} c="#2d3540" />
      <Box p={[0, -0.01, 0.1]} s={[0.11, 0.07, 0.07]} c={C.orange} />
      <Box p={[0, -0.03, 0.2]} s={[0.1, 0.09, 0.16]} c={C.orange} />
      <Box p={[0, 0.0, -0.08]} s={[0.08, 0.04, 0.05]} c="#2d3540" />
    </>
  );
  return (
    <group ref={hands}>
      <group ref={left} position={[-0.13, -0.3, -0.5]} rotation={[0.35, 0.2, 0]} scale={0.6}>
        {glove}
      </group>
      <group ref={right} position={[0.13, -0.3, -0.5]} rotation={[0.35, -0.2, 0]} scale={0.6}>
        {glove}
        <group ref={tool} position={[0.02, 0.05, -0.1]}>
          <Box p={[0, 0, -0.08]} s={[0.03, 0.03, 0.2]} c="#9aa3ab" />
          <Box p={[0, 0, -0.19]} s={[0.07, 0.025, 0.04]} c="#9aa3ab" />
        </group>
      </group>
    </group>
  );
}

/** small "captured" chips that appear on each element as SiteMind records it */
function CaptureChips() {
  return (
    <>
      {ITEMS.map((it) => (
        <Html key={it.id} position={it.at} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <ChipEl t0={it.t} label={it.label} />
        </Html>
      ))}
    </>
  );
}
function ChipEl({ t0, label }: { t0: number; label: string }) {
  // lives inside <Html> (its own React root): drive with rAF
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (el.current) {
        const on = isHvac(sim.t) && sim.t >= t0 && sim.t < t0 + 3.2;
        el.current.style.opacity = on ? '1' : '0';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [t0]);
  return (
    <div ref={el} className="cap-chip" style={{ opacity: 0 }}>
      <span className="cap-dot" />
      {label}
    </div>
  );
}

function PovWorld() {
  return (
    <>
      <hemisphereLight args={['#fff6e6', '#6d7886', 0.85]} />
      <pointLight position={[0.4, 2.4, -0.6]} intensity={2.4} distance={6} decay={1.4} color="#fff1d6" />
      <directionalLight position={[3, 6, 4]} intensity={0.5} />
      <Room view="pov" />
      <PointCloud persp size={2.2} />
      <PovRig />
      <CaptureChips />
    </>
  );
}

export function HvacOverview({ active }: { active: boolean }) {
  return (
    <Canvas
      orthographic
      shadows
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 2]}
      camera={{ position: [20, 18, 20], zoom: 60, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true }}
    >
      <OverviewWorld />
    </Canvas>
  );
}

export function HvacPov({ active }: { active: boolean }) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 2]}
      camera={{ position: [0, 2.3, 1], fov: 74, near: 0.03, far: 60 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ scene }) => (scene.background = new THREE.Color('#2a2f36'))}
    >
      <PovWorld />
    </Canvas>
  );
}

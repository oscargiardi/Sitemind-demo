import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '../sim/clock';

/* ------------------------------------------------------------------ */
/* palette for the cartoon world                                       */
/* ------------------------------------------------------------------ */
export const C = {
  grass: '#8fd16a',
  grassDark: '#6fb653',
  dirt: '#e2c48f',
  dirtDark: '#cfae76',
  road: '#5c6470',
  concrete: '#d9d6cf',
  concreteDark: '#b9b5ad',
  column: '#c8c3ba',
  core: '#a9a49b',
  glass: '#8fd0f0',
  yellow: '#ffc928',
  orange: '#ff8a2a',
  red: '#f2554a',
  blue: '#3f8cff',
  white: '#f7f5f0',
  timber: '#c98b52',
  timberLight: '#dca46a',
  timberDark: '#a86f3e',
  steel: '#7d8794',
  dark: '#2c3440',
  skin: '#f2c49b',
  skin2: '#c98c62',
  skin3: '#8d5a3b',
  teal: '#2de2d0',
};

/** Apply shadows to every opaque mesh under the scene once it mounts. */
export function AutoShadows() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const id = setTimeout(() => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.Material;
        if (mat && !mat.transparent && !m.userData.noShadow) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
    }, 50);
    return () => clearTimeout(id);
  });
  return null;
}

/** Simple box helper with flat cartoon material. */
export function Box({
  p,
  s,
  c,
  r,
  emissive,
  ...rest
}: {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: [number, number, number];
  emissive?: string;
} & Record<string, unknown>) {
  return (
    <mesh position={p} rotation={r} {...rest}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.85} metalness={0} emissive={emissive ?? '#000'} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* keyframe track helper                                               */
/* ------------------------------------------------------------------ */
export type Key = { t: number; x: number; z: number; y?: number };
export function track(keys: Key[], t: number) {
  if (t <= keys[0].t) return { x: keys[0].x, z: keys[0].z, y: keys[0].y ?? 0, moving: false, heading: headingOf(keys, 0) };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const moving = Math.hypot(dx, dz) > 0.01;
      return {
        x: a.x + dx * k,
        z: a.z + dz * k,
        y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * k,
        moving,
        heading: moving ? Math.atan2(dx, dz) : headingOf(keys, i),
      };
    }
  }
  const l = keys[keys.length - 1];
  return { x: l.x, z: l.z, y: l.y ?? 0, moving: false, heading: headingOf(keys, keys.length - 1) };
}
function headingOf(keys: Key[], i: number) {
  for (let j = Math.min(i, keys.length - 2); j >= 0; j--) {
    const dx = keys[j + 1].x - keys[j].x;
    const dz = keys[j + 1].z - keys[j].z;
    if (Math.hypot(dx, dz) > 0.01) return Math.atan2(dx, dz);
  }
  for (let j = i; j < keys.length - 1; j++) {
    const dx = keys[j + 1].x - keys[j].x;
    const dz = keys[j + 1].z - keys[j].z;
    if (Math.hypot(dx, dz) > 0.01) return Math.atan2(dx, dz);
  }
  return 0;
}
/** loop a closed path at constant speed (for ambient walkers / vehicles) */
export function loopPath(pts: [number, number][], speed: number, time: number) {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(d);
    total += d;
  }
  let d = (((time * speed) % total) + total) % total;
  for (let i = 0; i < pts.length; i++) {
    if (d <= segs[i]) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const k = d / Math.max(1e-6, segs[i]);
      return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    d -= segs[i];
  }
  return { x: pts[0][0], z: pts[0][1], heading: 0 };
}
export const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/* ------------------------------------------------------------------ */
/* cartoon worker                                                      */
/* ------------------------------------------------------------------ */
export type Mode = 'idle' | 'walk' | 'carry' | 'kneel' | 'work' | 'bend' | 'look' | 'reach';
export type Pose = {
  x: number;
  z: number;
  y?: number;
  rot: number;
  mode: Mode;
  carrying?: boolean;
  visible?: boolean;
  speed?: number;
};

export function Worker({
  pose,
  vest = C.orange,
  helmet = C.yellow,
  skin = C.skin,
  pants = '#3b4b6b',
  scale = 1,
  carry,
  children,
  wearable,
}: {
  pose: (t: number, wall: number) => Pose;
  vest?: string;
  helmet?: string | null; // null = no hard hat (PPE violation)
  skin?: string;
  pants?: string;
  scale?: number;
  carry?: ReactNode;
  children?: ReactNode;
  wearable?: boolean;
}) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const carryG = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const rotNow = useRef<number | null>(null);

  useFrame((_, dt) => {
    const p = pose(sim.t, sim.wall);
    const g = root.current;
    g.visible = p.visible !== false;
    g.position.set(p.x, p.y ?? 0, p.z);
    rotNow.current = rotNow.current === null ? p.rot : lerpAngle(rotNow.current, p.rot, Math.min(1, dt * 10));
    g.rotation.y = rotNow.current;
    const w = sim.wall * (p.speed ?? 9);
    const swing = Math.sin(w);
    let lL = 0,
      lR = 0,
      aL = 0,
      aR = 0,
      bodyY = 0,
      tilt = 0,
      headY = 0;
    switch (p.mode) {
      case 'walk':
        lL = swing * 0.7;
        lR = -swing * 0.7;
        aL = -swing * 0.6;
        aR = swing * 0.6;
        bodyY = Math.abs(Math.cos(w)) * 0.04;
        break;
      case 'carry':
        lL = swing * 0.6;
        lR = -swing * 0.6;
        aL = aR = -1.25;
        bodyY = Math.abs(Math.cos(w)) * 0.03;
        break;
      case 'kneel':
        lL = -1.45;
        lR = 0.15;
        bodyY = -0.2;
        tilt = 0.35;
        aL = -1.1 + Math.sin(sim.wall * 7) * 0.12;
        aR = -1.0 - Math.abs(Math.sin(sim.wall * 7)) * 0.45;
        break;
      case 'work':
        aR = -1.6 - Math.abs(Math.sin(sim.wall * 6)) * 0.9;
        aL = -0.5;
        tilt = 0.12;
        break;
      case 'reach':
        aL = -2.85 + Math.sin(sim.wall * 3) * 0.08;
        aR = -2.85 - Math.sin(sim.wall * 3) * 0.08;
        headY = 0;
        break;
      case 'bend':
        tilt = 0.7;
        aL = aR = -1.2;
        bodyY = -0.05;
        break;
      case 'look':
        headY = Math.sin(sim.wall * 1.6) * 0.7;
        aL = 0.1;
        aR = -0.1;
        break;
      default:
        aL = Math.sin(sim.wall * 1.3) * 0.05;
        aR = -aL;
    }
    legL.current.rotation.x = lL;
    legR.current.rotation.x = lR;
    armL.current.rotation.x = aL;
    armR.current.rotation.x = aR;
    body.current.position.y = bodyY;
    body.current.rotation.x = tilt;
    head.current.rotation.y = headY;
    if (carryG.current) carryG.current.visible = !!p.carrying;
  });

  const m = (c: string) => <meshStandardMaterial color={c} roughness={0.8} />;
  return (
    <group ref={root} scale={scale}>
      {/* legs pivot at hips */}
      <group ref={legL} position={[-0.09, 0.34, 0]}>
        <mesh position={[0, -0.16, 0]}>
          <boxGeometry args={[0.13, 0.34, 0.15]} />
          {m(pants)}
        </mesh>
        <mesh position={[0, -0.31, 0.03]}>
          <boxGeometry args={[0.14, 0.06, 0.2]} />
          {m('#3a2a1e')}
        </mesh>
      </group>
      <group ref={legR} position={[0.09, 0.34, 0]}>
        <mesh position={[0, -0.16, 0]}>
          <boxGeometry args={[0.13, 0.34, 0.15]} />
          {m(pants)}
        </mesh>
        <mesh position={[0, -0.31, 0.03]}>
          <boxGeometry args={[0.14, 0.06, 0.2]} />
          {m('#3a2a1e')}
        </mesh>
      </group>
      <group ref={body}>
        <group position={[0, 0.34, 0]}>
          {/* torso (hi-vis vest) */}
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.36, 0.36, 0.22]} />
            {m(vest)}
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.37, 0.05, 0.23]} />
            <meshStandardMaterial color="#f4f4f0" emissive="#777" roughness={0.4} />
          </mesh>
          {wearable && (
            <mesh position={[0.1, 0.27, 0.12]} userData={{ noShadow: true }}>
              <boxGeometry args={[0.07, 0.07, 0.04]} />
              <meshStandardMaterial color="#111" emissive={C.teal} emissiveIntensity={0.9} />
            </mesh>
          )}
          {/* arms pivot at shoulders */}
          <group ref={armL} position={[-0.23, 0.32, 0]}>
            <mesh position={[0, -0.13, 0]}>
              <boxGeometry args={[0.1, 0.3, 0.12]} />
              {m(vest)}
            </mesh>
            <mesh position={[0, -0.3, 0]}>
              <boxGeometry args={[0.09, 0.07, 0.09]} />
              {m(skin)}
            </mesh>
          </group>
          <group ref={armR} position={[0.23, 0.32, 0]}>
            <mesh position={[0, -0.13, 0]}>
              <boxGeometry args={[0.1, 0.3, 0.12]} />
              {m(vest)}
            </mesh>
            <mesh position={[0, -0.3, 0]}>
              <boxGeometry args={[0.09, 0.07, 0.09]} />
              {m(skin)}
            </mesh>
          </group>
          {/* head */}
          <group ref={head} position={[0, 0.5, 0]}>
            <mesh>
              <boxGeometry args={[0.26, 0.26, 0.26]} />
              {m(skin)}
            </mesh>
            <mesh position={[-0.06, 0.02, 0.131]}>
              <boxGeometry args={[0.04, 0.05, 0.01]} />
              {m('#1d1d1d')}
            </mesh>
            <mesh position={[0.06, 0.02, 0.131]}>
              <boxGeometry args={[0.04, 0.05, 0.01]} />
              {m('#1d1d1d')}
            </mesh>
            {helmet ? (
              <>
                {/* hard hat */}
                <mesh position={[0, 0.15, 0]}>
                  <cylinderGeometry args={[0.16, 0.17, 0.1, 10]} />
                  {m(helmet)}
                </mesh>
                <mesh position={[0, 0.11, 0.06]}>
                  <boxGeometry args={[0.36, 0.03, 0.3]} />
                  {m(helmet)}
                </mesh>
              </>
            ) : (
              <>
                {/* bare head: hair */}
                <mesh position={[0, 0.15, -0.01]}>
                  <boxGeometry args={[0.28, 0.06, 0.28]} />
                  {m('#4a2f1d')}
                </mesh>
                <mesh position={[0, 0.06, -0.12]}>
                  <boxGeometry args={[0.28, 0.14, 0.05]} />
                  {m('#4a2f1d')}
                </mesh>
              </>
            )}
          </group>
          <group ref={carryG} position={[0, 0.16, 0.3]}>
            {carry}
          </group>
        </group>
      </group>
      {children}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* drone                                                               */
/* ------------------------------------------------------------------ */
export function Drone({
  path,
  scale = 1,
  cone = true,
  objRef,
}: {
  path: (wall: number) => { x: number; y: number; z: number; rot: number };
  scale?: number;
  cone?: boolean;
  objRef?: (o: THREE.Object3D | null) => void;
}) {
  const g = useRef<THREE.Group>(null!);
  const rotors = useRef<THREE.Mesh[]>([]);
  const led = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => {
    const p = path(sim.wall);
    g.current.position.set(p.x, p.y + Math.sin(sim.wall * 2.3) * 0.06, p.z);
    g.current.rotation.y = p.rot;
    g.current.rotation.z = Math.sin(sim.wall * 1.7) * 0.05;
    rotors.current.forEach((r, i) => r && (r.rotation.y = sim.wall * 40 * (i % 2 ? 1 : -1)));
    if (led.current) led.current.emissiveIntensity = Math.sin(sim.wall * 6) > 0.3 ? 2 : 0.2;
  });
  const arms: [number, number][] = [
    [0.32, 0.32],
    [-0.32, 0.32],
    [0.32, -0.32],
    [-0.32, -0.32],
  ];
  return (
    <group
      ref={(o) => {
        g.current = o!;
        objRef?.(o);
      }}
      scale={scale}
    >
      <mesh>
        <boxGeometry args={[0.36, 0.12, 0.36]} />
        <meshStandardMaterial color="#f4f6f8" roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.09, 0.12]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial color="#1b2430" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.07, -0.12]}>
        <boxGeometry args={[0.06, 0.03, 0.06]} />
        <meshStandardMaterial ref={led} color="#0a3" emissive="#2fff7a" emissiveIntensity={1} />
      </mesh>
      {arms.map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x / 2, 0, z / 2]} rotation={[0, Math.atan2(x, z), 0]}>
            <boxGeometry args={[0.05, 0.04, 0.46]} />
            <meshStandardMaterial color="#3c4552" />
          </mesh>
          <mesh position={[x, 0.06, z]}>
            <cylinderGeometry args={[0.04, 0.04, 0.08, 8]} />
            <meshStandardMaterial color="#3c4552" />
          </mesh>
          <mesh ref={(m) => void (rotors.current[i] = m!)} position={[x, 0.11, z]} userData={{ noShadow: true }}>
            <boxGeometry args={[0.34, 0.01, 0.05]} />
            <meshStandardMaterial color="#d0d6de" transparent opacity={0.75} />
          </mesh>
        </group>
      ))}
      {cone && <ScanCone height={2.6} radius={0.9} y={-1.35} />}
    </group>
  );
}

/** translucent teal scanning cone (apex at origin pointing -y by default) */
export function ScanCone({
  height,
  radius,
  y = 0,
  color = C.teal,
  opacity = 0.13,
}: {
  height: number;
  radius: number;
  y?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <mesh position={[0, y, 0]} userData={{ noShadow: true }} renderOrder={5}>
      <coneGeometry args={[radius, height, 24, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* computer-vision overlay box (DOM, crisp at any zoom)                */
/* ------------------------------------------------------------------ */
export type VisionState = { visible: boolean; color: string; label?: string; sub?: string; strong?: boolean };
export function VisionBox({
  w,
  h,
  y,
  state,
}: {
  w: number;
  h: number;
  y: number;
  state: (t: number) => VisionState;
}) {
  const el = useRef<HTMLDivElement>(null);
  const lab = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const last = useRef('');
  const anchor = useRef<THREE.Group>(null!);
  useFrame(() => {
    const d = el.current;
    if (!d) return;
    const s = { ...state(sim.t) };
    if (s.visible && !worldVisible(anchor.current)) s.visible = false;
    const z = camera.zoom;
    const key = `${s.visible}|${s.color}|${s.label}|${s.sub}|${s.strong}|${Math.round(z)}`;
    if (key === last.current) return;
    last.current = key;
    d.style.display = s.visible ? 'block' : 'none';
    d.style.width = `${w * z}px`;
    d.style.height = `${h * z}px`;
    d.style.setProperty('--vc', s.color);
    d.classList.toggle('strong', !!s.strong);
    if (lab.current) {
      lab.current.textContent = s.label ?? '';
      lab.current.style.display = s.label ? 'block' : 'none';
    }
    if (sub.current) {
      sub.current.textContent = s.sub ?? '';
      sub.current.style.display = s.sub ? 'block' : 'none';
    }
  });
  return (
    <group ref={anchor}>
    <Html position={[0, y, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div ref={el} className="vbox" style={{ display: 'none' }}>
        <i className="c tl" />
        <i className="c tr" />
        <i className="c bl" />
        <i className="c br" />
        <div ref={lab} className="vlabel" />
        <div ref={sub} className="vsub" />
      </div>
    </Html>
    </group>
  );
}

export function worldVisible(o: THREE.Object3D | null) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

/** expanding ring used for detection "ping" events */
export function PingRing({
  at,
  color,
  start,
  size = 1,
  repeat = 0,
}: {
  at: [number, number, number];
  color: string;
  start: number;
  size?: number;
  repeat?: number;
}) {
  const m = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    let k = sim.t - start;
    if (repeat > 0 && k > 0) k = k % repeat;
    const life = 1.4;
    const vis = sim.t >= start && k >= 0 && k <= life;
    m.current.visible = vis;
    if (!vis) return;
    const p = k / life;
    m.current.scale.setScalar(0.2 + p * 1.8 * size);
    mat.current.opacity = (1 - p) * 0.9;
  });
  return (
    <mesh ref={m} position={at} rotation={[-Math.PI / 2, 0, 0]} userData={{ noShadow: true }} renderOrder={6}>
      <ringGeometry args={[0.85, 1, 48]} />
      <meshBasicMaterial ref={mat} color={color} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** ortho camera fitted to the panel: keeps a world-space box in view at any panel size */
export function FitOrtho({
  target,
  dir,
  fitW,
  fitH,
  sway = 0.05,
  swaySpeed = 0.08,
}: {
  target: [number, number, number];
  dir: [number, number, number];
  fitW: number;
  fitH: number;
  sway?: number;
  swaySpeed?: number;
}) {
  const { camera, size } = useThree();
  const tgt = useRef(new THREE.Vector3());
  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera;
    const zoom = Math.min(size.width / fitW, size.height / fitH);
    if (Math.abs(cam.zoom - zoom) > 0.01) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    const a = Math.sin(sim.wall * swaySpeed) * sway;
    const d = new THREE.Vector3(...dir).normalize();
    d.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    tgt.current.set(...target);
    cam.position.copy(tgt.current).addScaledVector(d, 40);
    cam.lookAt(tgt.current);
  });
  return null;
}

/** standard lighting rig for the diorama look */
export function Lights({ shadowSize = 12, target = [0, 0, 0] as [number, number, number] }) {
  const light = useRef<THREE.DirectionalLight>(null!);
  useEffect(() => {
    light.current.target.position.set(...target);
    light.current.target.updateMatrixWorld();
  }, [target]);
  return (
    <>
      <hemisphereLight args={['#fff7e8', '#8aa0b8', 1.25]} />
      <directionalLight
        ref={light}
        position={[target[0] + 7, target[1] + 14, target[2] + 9]}
        intensity={2.1}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-shadowSize}
        shadow-camera-right={shadowSize}
        shadow-camera-top={shadowSize}
        shadow-camera-bottom={-shadowSize}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
    </>
  );
}

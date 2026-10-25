import { Environment, Lightformer } from '@react-three/drei';
import { advance, Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type SceneTheme = 'dark' | 'light';

const GOLD = new THREE.Color('#C9A24B');
const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
/** One leaf every 72°, and the plate turns 72° every 10s, so a 10s clip loops seamlessly. */
const LEAVES = 5;
const ROTATION_SPEED = (Math.PI * 2) / LEAVES / 10;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Lathe profile helper: points (radius, height) rotated around Y. */
function lathe(points: [number, number][], segments = 96) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

function Plate() {
  const plate = useMemo(
    () =>
      lathe([
        [0, 0],
        [1.25, 0],
        [1.55, 0.05],
        [2.05, 0.2],
        [2.12, 0.24],
        [2.08, 0.27],
        [1.5, 0.12],
        [0, 0.1],
      ]),
    [],
  );
  return (
    <group>
      <mesh geometry={plate} castShadow receiveShadow>
        <meshPhysicalMaterial color="#F6EFE3" roughness={0.18} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      {/* Gold rim line */}
      <mesh position={[0, 0.235, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.86, 0.012, 12, 160]} />
        <meshStandardMaterial color={GOLD} metalness={1} roughness={0.25} />
      </mesh>
      <JollofDish />
    </group>
  );
}

/**
 * Smoky party jollof: a rice mound built from instanced grains, plantain slices and herb
 * leaves. Everything repeats every 72° (LEAVES-fold) so the video loop has no visible seam.
 */
function JollofDish() {
  const grains = useRef<THREE.InstancedMesh>(null);
  const PER_SECTOR = 170;
  const COUNT = PER_SECTOR * LEAVES;
  useEffect(() => {
    const m = grains.current;
    if (!m) return;
    const rand = mulberry32(7);
    const palette = ['#C4502A', '#D9652F', '#B5401F', '#E07A3A', '#9C3418', '#6B2A14'].map(
      (c) => new THREE.Color(c),
    );
    const dummy = new THREE.Object3D();
    const sector: {
      theta: number;
      phi: number;
      rot: [number, number, number];
      color: THREE.Color;
      len: number;
    }[] = [];
    for (let i = 0; i < PER_SECTOR; i++) {
      sector.push({
        theta: rand() * ((Math.PI * 2) / LEAVES),
        phi: Math.acos(1 - rand() * 0.98), // denser near the top, like a heaped mound
        rot: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
        color: palette[Math.floor(Math.pow(rand(), 1.6) * palette.length)]!,
        len: 0.05 + rand() * 0.025,
      });
    }
    let n = 0;
    for (let k = 0; k < LEAVES; k++) {
      for (const g of sector) {
        const theta = g.theta + (k * Math.PI * 2) / LEAVES;
        const r = 1.0 * Math.sin(g.phi);
        dummy.position.set(Math.cos(theta) * r, 0.1 + 0.45 * Math.cos(g.phi), Math.sin(theta) * r);
        dummy.rotation.set(g.rot[0], g.rot[1] + (k * Math.PI * 2) / LEAVES, g.rot[2]);
        dummy.scale.set(g.len, 0.016, 0.016);
        dummy.updateMatrix();
        m.setMatrixAt(n, dummy.matrix);
        m.setColorAt(n, g.color);
        n++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [COUNT]);

  const sectors = Array.from({ length: LEAVES }, (_, i) => (i * Math.PI * 2) / LEAVES);
  return (
    <group>
      {/* Base mound under the grains */}
      <mesh position={[0, 0.1, 0]} scale={[1, 0.44, 1]} castShadow>
        <sphereGeometry args={[0.98, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#A63C1E" roughness={0.85} />
      </mesh>
      <instancedMesh ref={grains} args={[undefined, undefined, COUNT]} castShadow>
        <sphereGeometry args={[1, 6, 4]} />
        <meshStandardMaterial roughness={0.55} />
      </instancedMesh>
      {sectors.map((a, i) => (
        <group key={i} rotation={[0, -a, 0]}>
          {/* Caramelised plantain (dodo) slice on the plate */}
          <mesh position={[1.36, 0.17, 0]} rotation={[0.08, 0.6, 0]} scale={[0.26, 0.05, 0.16]} castShadow>
            <cylinderGeometry args={[1, 1, 1, 24]} />
            <meshStandardMaterial color="#D98A2B" roughness={0.45} />
          </mesh>
          <mesh position={[1.36, 0.2, 0]} rotation={[0.08, 0.6, 0]} scale={[0.2, 0.012, 0.11]}>
            <cylinderGeometry args={[1, 1, 1, 24]} />
            <meshStandardMaterial color="#F0B860" roughness={0.35} />
          </mesh>
          {/* Herb leaf on the mound */}
          <mesh position={[0.42, 0.5, 0.12]} rotation={[-Math.PI / 2.3, 0, 0.4]} scale={[0.15, 0.06, 0.02]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#2E4A3B" roughness={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Small deterministic PRNG so the dish looks identical on every load and in the video. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Cloche({ lift }: { lift: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const dome = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * (Math.PI / 2);
      pts.push([Math.cos(t) * 1.7 + 0.001, Math.sin(t) * 1.35]);
    }
    return lathe(pts.reverse());
  }, []);
  useFrame(() => {
    if (!group.current) return;
    const t = easeInOut(lift.current);
    group.current.position.y = 0.26 + t * 2.5;
    group.current.position.x = t * 2.3;
    group.current.rotation.z = -t * 0.22;
    group.current.rotation.x = -t * 0.42; // tilt away from the camera: show the polished dome, not its inside
  });
  return (
    <group ref={group}>
      <mesh geometry={dome}>
        <meshPhysicalMaterial color="#d9d3c7" metalness={1} roughness={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.7, 0.035, 16, 160]} />
        <meshStandardMaterial color={GOLD} metalness={1} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.47, 0]}>
        <sphereGeometry args={[0.16, 32, 16]} />
        <meshStandardMaterial color={GOLD} metalness={1} roughness={0.18} />
      </mesh>
    </group>
  );
}

/** Soft rising steam: additive points that fade in once the cloche lifts. */
function softSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Steam({ lift, theme }: { lift: React.MutableRefObject<number>; theme: SceneTheme }) {
  const COUNT = 220;
  const ref = useRef<THREE.Points>(null);
  const sprite = useMemo(softSprite, []);
  const { positions, seeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const r = Math.random() * 0.7;
      const a = Math.random() * Math.PI * 2;
      positions.set([Math.cos(a) * r, 0.5 + Math.random() * 2.6, Math.sin(a) * r], i * 3);
      seeds[i] = Math.random();
    }
    return { positions, seeds };
  }, []);
  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      let y = pos.getY(i) + dt * (0.35 + seeds[i]! * 0.35);
      if (y > 3.4) y = 0.5;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(y * 2 + seeds[i]! * 6) * dt * 0.08);
    }
    pos.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity =
      easeOutCubic((lift.current - 0.35) / 0.65) * (theme === 'dark' ? 0.32 : 0.45);
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        size={0.55}
        sizeAttenuation
        transparent
        depthWrite={false}
        color={theme === 'dark' ? '#F6EFE3' : '#a8998a'}
        blending={theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending}
        opacity={0}
      />
    </points>
  );
}

/** Floating gold "spice" flecks orbiting slowly around the plate. */
function Spice() {
  const COUNT = 90;
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        r: 2.3 + Math.random() * 2.2,
        a: Math.random() * Math.PI * 2,
        y: -0.6 + Math.random() * 3.6,
        s: 0.02 + Math.random() * 0.045,
        speed: 0.04 + Math.random() * 0.08,
        bob: Math.random() * Math.PI * 2,
      })),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    data.forEach((d, i) => {
      const a = d.a + t * d.speed;
      dummy.position.set(Math.cos(a) * d.r, d.y + Math.sin(t * 0.6 + d.bob) * 0.15, Math.sin(a) * d.r);
      dummy.rotation.set(t * 0.8 + d.bob, t * 0.5, 0);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={GOLD}
        metalness={1}
        roughness={0.25}
        emissive={GOLD}
        emissiveIntensity={0.25}
      />
    </instancedMesh>
  );
}

function Rig({ lift, onRevealed }: { lift: React.MutableRefObject<number>; onRevealed: () => void }) {
  const { camera, size } = useThree();
  const stage = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const revealed = useRef(false);
  useFrame(({ clock }, dt) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    // Cinematic ease-in from a high, wide angle; then the cloche lifts.
    const intro = easeOutCubic(t / 3.2);
    camera.position.set(0, 7.5 - intro * 3.2, 11 - intro * 3.4);
    const wide = size.width / size.height > 1.1;
    camera.lookAt(wide ? -1.5 : 0, wide ? 0.6 : -0.9, 0);
    lift.current = Math.min(1, Math.max(0, (t - 1.2) / 2.4));
    if (lift.current >= 0.6 && !revealed.current) {
      revealed.current = true;
      onRevealed();
    }
    if (stage.current) stage.current.rotation.y += dt * ROTATION_SPEED;
  });
  return (
    <group ref={stage}>
      <Plate />
      <Cloche lift={lift} />
    </group>
  );
}

/**
 * `capture` (dev tooling only): frames are rendered on demand via window.__heroAdvance(seconds),
 * so design/tools can export a deterministic poster and looping video from this exact scene.
 */
export default function HeroScene({
  theme,
  onRevealed,
  capture = false,
}: {
  theme: SceneTheme;
  onRevealed: () => void;
  capture?: boolean;
}) {
  const lift = useRef(0);
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Pause rendering when the hero scrolls out of view (battery and fan friendly).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const dark = theme === 'dark';
  return (
    <div ref={host} className="absolute inset-0" aria-hidden="true">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        frameloop={capture || !visible ? 'never' : 'always'}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: capture,
        }}
        onCreated={() => {
          if (capture)
            (window as unknown as { __heroAdvance: (t: number) => void }).__heroAdvance = (t) => advance(t);
        }}
        camera={{ fov: 32, position: [0, 7.5, 11], near: 0.1, far: 60 }}
      >
        <ambientLight intensity={dark ? 0.18 : 0.75} />
        {/* Warm key light and a gold rim from behind */}
        <spotLight
          position={[4, 9, 5]}
          angle={0.45}
          penumbra={0.9}
          intensity={dark ? 140 : 90}
          color="#ffe6bf"
          castShadow
        />
        <spotLight
          position={[-5, 4, -6]}
          angle={0.6}
          penumbra={1}
          intensity={dark ? 120 : 45}
          color="#C9A24B"
        />
        <pointLight position={[0, 1.2, 3]} intensity={dark ? 6 : 3} color="#ffb070" />
        <Environment resolution={128}>
          <Lightformer
            form="rect"
            intensity={dark ? 1.2 : 2.2}
            position={[0, 5, -6]}
            scale={[10, 4, 1]}
            color="#ffe9c6"
          />
          <Lightformer
            form="ring"
            intensity={dark ? 2 : 1.4}
            position={[-4, 2, 3]}
            scale={3}
            color="#C9A24B"
          />
          <Lightformer
            form="rect"
            intensity={dark ? 0.6 : 1.6}
            position={[5, 1, 2]}
            scale={[2, 6, 1]}
            color="#ffffff"
          />
        </Environment>
        <Rig lift={lift} onRevealed={onRevealed} />
        <Steam lift={lift} theme={theme} />
        <Spice />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <circleGeometry args={[9, 64]} />
          <shadowMaterial opacity={dark ? 0.55 : 0.18} />
        </mesh>
      </Canvas>
    </div>
  );
}

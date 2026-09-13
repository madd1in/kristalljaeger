// Low-Poly-Welt: dauerhafte Teile (Licht, Himmel, Planet, Partikel) + austauschbare Insel je Welt.
// Statische Deko ist instanziert bzw. zusammengeführt, damit die Zahl der Draw Calls klein bleibt.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, BIOMES, ICE } from './config.js';

export const rand = (a, b) => a + Math.random() * (b - a);

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function hash3(x, y, z) {
  const s = Math.sin(Math.round(x * 100) * 12.9898 + Math.round(y * 100) * 78.233 + Math.round(z * 100) * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// Deterministischer Versatz: identische Positionen bekommen denselben Offset, damit keine Risse entstehen.
export function roughen(geo, amount, keepTopY = Infinity) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const dx = (hash3(x, y, z) - 0.5) * amount;
    const dy = (hash3(z, x, y) - 0.5) * amount;
    const dz = (hash3(y, z, x) - 0.5) * amount;
    pos.setXYZ(i, x + dx, y >= keepTopY - 1e-3 ? y : y + dy, z + dz);
  }
  return geo;
}

// Färbt jedes Dreieck einzeln (Vertex Colors) – facettierter Low-Poly-Look ohne Extra-Materialien.
export function paint(geo, pick) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    d.fromBufferAttribute(pos, i + 2);
    pick(c, a, b, d);
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

export const shade = (hex, jitter = 0.06) => {
  const base = new THREE.Color(hex);
  return (c) => c.copy(base).offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
};

function setInstance(mesh, i, x, y, z, scale, rotY = 0, rotX = 0, rotZ = 0) {
  _p.set(x, y, z);
  _q.setFromEuler(_e.set(rotX, rotY, rotZ));
  _s.setScalar(scale);
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

export function radialTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const lambert = (extra = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...extra });

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

// ---------------------------------------------------------------------------------
// Baum-Geometrien je Welt
// ---------------------------------------------------------------------------------
function treeSets(style) {
  if (style === 'frost') {
    const snowyPine = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.15, 0.22, 0.8, 5).translate(0, 0.4, 0), shade('#4b3528')),
      paint(new THREE.ConeGeometry(0.95, 2.2, 6).translate(0, 1.8, 0), shade('#24483d', 0.08)),
      paint(new THREE.ConeGeometry(0.55, 0.9, 6).translate(0, 2.35, 0), shade('#f1f5f9', 0.04)),
      paint(new THREE.ConeGeometry(0.65, 1.5, 6).translate(0, 2.7, 0), shade('#2d5a4a', 0.08)),
      paint(new THREE.ConeGeometry(0.34, 0.7, 6).translate(0, 3.3, 0), shade('#f8fafc', 0.03)),
    ]);
    const iceSpike = mergeGeometries([
      paint(new THREE.ConeGeometry(0.35, 2.4, 5).translate(0, 1.2, 0), shade('#bfdbfe', 0.08)),
      paint(new THREE.ConeGeometry(0.25, 1.5, 5).rotateZ(0.35).translate(0.35, 0.7, 0.1), shade('#dbeafe', 0.08)),
      paint(new THREE.ConeGeometry(0.2, 1.1, 5).rotateZ(-0.4).translate(-0.3, 0.5, -0.1), shade('#e0f2fe', 0.08)),
    ]);
    return [{ geo: snowyPine, count: 36 }, { geo: iceSpike, count: 14 }];
  }
  if (style === 'volcano') {
    const deadTree = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.1, 0.24, 2.4, 5).translate(0, 1.2, 0), shade('#292524', 0.05)),
      paint(new THREE.CylinderGeometry(0.04, 0.09, 1.1, 4).rotateZ(0.8).translate(0.38, 1.7, 0), shade('#1c1917', 0.05)),
      paint(new THREE.CylinderGeometry(0.03, 0.08, 0.9, 4).rotateZ(-0.9).translate(-0.3, 1.35, 0.05), shade('#1c1917', 0.05)),
    ]);
    const basalt = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.45, 0.5, 2.6, 6).translate(0, 1.3, 0), shade('#27272a', 0.06)),
      paint(new THREE.CylinderGeometry(0.4, 0.45, 1.7, 6).translate(0.75, 0.85, 0.2), shade('#3f3f46', 0.06)),
      paint(new THREE.CylinderGeometry(0.38, 0.42, 1.1, 6).translate(-0.6, 0.55, -0.35), shade('#18181b', 0.06)),
    ]);
    return [{ geo: deadTree, count: 26 }, { geo: basalt, count: 12 }];
  }
  const pine = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.15, 0.22, 0.8, 5).translate(0, 0.4, 0), shade('#5b3a29')),
    paint(new THREE.ConeGeometry(0.9, 2.2, 6).translate(0, 1.8, 0), shade('#2f5d3a', 0.1)),
    paint(new THREE.ConeGeometry(0.65, 1.5, 6).translate(0, 2.6, 0), shade('#3b7a47', 0.1)),
  ]);
  const roundTree = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 5).translate(0, 0.55, 0), shade('#6b4430')),
    paint(new THREE.IcosahedronGeometry(0.95, 0).translate(0, 1.75, 0), shade('#4f8f3c', 0.12)),
    paint(new THREE.IcosahedronGeometry(0.6, 0).translate(0.45, 1.35, 0.2), shade('#5da544', 0.12)),
  ]);
  return [{ geo: pine, count: 30 }, { geo: roundTree, count: 14 }];
}

const FLOATER_TREE = { meadow: '#2f5d3a', frost: '#e2e8f0', volcano: '#1c1917' };

// ---------------------------------------------------------------------------------
// Insel einer Welt aufbauen
// ---------------------------------------------------------------------------------
function buildBiome(key) {
  const b = BIOMES[key];
  const group = new THREE.Group();
  const makeInstanced = (geo, material, count, { castShadow = false, receiveShadow = false } = {}) => {
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    return mesh;
  };

  // Insel: unterteilte Grasfläche + Seitenwand + Felskegel (gleiche Segmentzahl → Randpunkte decken sich)
  {
    const groundA = new THREE.Color(b.ground[0]);
    const groundB = new THREE.Color(b.ground[1]);
    const disc = roughen(new THREE.RingGeometry(0, 24, 44, 9).rotateX(-Math.PI / 2), 0.9, 0);
    const discGeo = paint(disc, (c) => c.copy(groundA).lerp(groundB, Math.random() * 0.5));
    const side = roughen(new THREE.CylinderGeometry(24, 22, 2, 44, 1, true).translate(0, -1, 0), 0.9, 0);
    const sideGeo = paint(side, shade(b.side, 0.08));
    const under = roughen(new THREE.ConeGeometry(22, 18, 22, 5), 2.6);
    under.rotateX(Math.PI);
    under.translate(0, -11, 0);
    const rockTop = new THREE.Color(b.under[0]);
    const rockBottom = new THREE.Color(b.under[1]);
    const underGeo = paint(under, (c, p1, p2, p3) => {
      const y = (p1.y + p2.y + p3.y) / 3;
      c.copy(rockBottom).lerp(rockTop, THREE.MathUtils.clamp((y + 20) / 18, 0, 1)).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
    });
    const island = new THREE.Mesh(mergeGeometries([discGeo, sideGeo, underGeo]), lambert());
    island.receiveShadow = true;
    group.add(island);
  }

  const ringMat = new THREE.MeshBasicMaterial({ color: b.ring, transparent: true, opacity: 0.35, depthWrite: false });
  const arenaRing = new THREE.Mesh(new THREE.RingGeometry(ARENA + 0.9, ARENA + 1.1, 96), ringMat);
  arenaRing.rotation.x = -Math.PI / 2;
  arenaRing.position.y = 0.04;
  group.add(arenaRing);

  // Bäume & Co. am Rand
  for (const set of treeSets(b.trees)) {
    const mesh = makeInstanced(set.geo, lambert(), set.count, { castShadow: true });
    for (let i = 0; i < set.count; i++) {
      const a = rand(0, Math.PI * 2), r = rand(20.8, 23.4);
      setInstance(mesh, i, Math.cos(a) * r, 0, Math.sin(a) * r, rand(0.8, 1.5), rand(0, 6));
    }
  }

  const rocks = makeInstanced(paint(roughen(new THREE.DodecahedronGeometry(1, 0), 0.3), shade(b.rock, 0.1)), lambert(), 22, { castShadow: true });
  for (let i = 0; i < rocks.count; i++) {
    const a = rand(0, Math.PI * 2), r = rand(20.4, 23.6);
    setInstance(rocks, i, Math.cos(a) * r, 0.15, Math.sin(a) * r, rand(0.35, 1.1), rand(0, 6), rand(0, 3), rand(0, 3));
  }

  const bladeGeos = [];
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.ConeGeometry(0.07, 0.55, 3);
    blade.translate(0, 0.27, 0);
    blade.rotateZ((k - 1) * 0.35);
    blade.rotateY(k * 2.1);
    bladeGeos.push(paint(blade, shade(k === 1 ? b.grass[1] : b.grass[0], 0.08)));
  }
  const MAX_GRASS = 900;
  const grass = makeInstanced(mergeGeometries(bladeGeos), lambert(), MAX_GRASS);
  for (let i = 0; i < MAX_GRASS; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 23.3;
    setInstance(grass, i, Math.cos(a) * r, 0, Math.sin(a) * r, rand(0.7, 1.4), rand(0, 6));
  }

  let flowers = null;
  const MAX_FLOWERS = 180;
  if (b.flowers) {
    flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11, 0).translate(0, 0.32, 0), new THREE.MeshLambertMaterial({ flatShading: true, emissive: '#221133' }), MAX_FLOWERS);
    const palette = ['#f9a8d4', '#fde68a', '#f5f3ff', '#c4b5fd', '#fca5a5'].map((h) => new THREE.Color(h));
    for (let i = 0; i < MAX_FLOWERS; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 23;
      setInstance(flowers, i, Math.cos(a) * r, 0, Math.sin(a) * r, rand(0.8, 1.3), rand(0, 6));
      flowers.setColorAt(i, palette[i % palette.length]);
    }
    group.add(flowers);
  }

  // Deko-Kristalle am Rand und hängend unter der Insel
  const decoGeo = new THREE.OctahedronGeometry(1, 0);
  decoGeo.scale(0.7, 2.6, 0.7);
  const decoMats = b.deco.map(([color, emissive]) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.8, flatShading: true, roughness: 0.3 }));
  decoMats.forEach((mat, k) => {
    const mesh = makeInstanced(decoGeo, mat, 10, { castShadow: true });
    for (let i = 0; i < 10; i++) {
      if (i < 4) {
        const a = ((i + k * 0.5) / 4) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(21.5, 23);
        setInstance(mesh, i, Math.cos(a) * r, 1.6, Math.sin(a) * r, rand(0.8, 1.3), rand(0, 3), rand(-0.25, 0.25), rand(-0.25, 0.25));
      } else {
        const y = rand(-4, -11);
        const rSurface = 22 * (1 - (-2 - y) / 18);
        const a = rand(0, Math.PI * 2);
        setInstance(mesh, i, Math.cos(a) * rSurface * 0.92, y - 1.2, Math.sin(a) * rSurface * 0.92, rand(0.6, 1.1), rand(0, 3), Math.PI + rand(-0.3, 0.3), rand(-0.3, 0.3));
      }
    }
  });

  // Glatteis-Flächen (Frost)
  const icePatches = [];
  if (b.hazard === 'ice') {
    const iceGeo = paint(roughen(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), 0.14, 0), (c) => c.set('#a5f3fc').offsetHSL(0, 0, (Math.random() - 0.5) * 0.12));
    const iceMat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.05, metalness: 0.1, emissive: '#38bdf8', emissiveIntensity: 0.35,
      transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const ice = makeInstanced(iceGeo, iceMat, ICE.patches, { receiveShadow: true });
    for (let i = 0; i < ICE.patches; i++) {
      let spot = null;
      for (let tries = 0; tries < 60 && !spot; tries++) {
        const r = rand(2.2, 3.8);
        const a = rand(0, Math.PI * 2), dist = rand(5, ARENA - r);
        const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
        if (icePatches.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 1)) spot = { x, z, r };
      }
      if (!spot) spot = { x: 0, z: 0, r: 0 };
      icePatches.push(spot);
      setInstance(ice, i, spot.x, 0.05, spot.z, spot.r, rand(0, 6));
    }
  }

  // Lava-Pools am Rand und glühende Risse (Vulkan)
  let lavaMat = null;
  if (b.hazard === 'lava') {
    lavaMat = new THREE.MeshBasicMaterial({ color: '#f97316', toneMapped: false });
    const pools = makeInstanced(paint(roughen(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), 0.2, 0), shade('#ffffff', 0.15)), lavaMat, 10);
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2), r = rand(20.6, 22.8);
      setInstance(pools, i, Math.cos(a) * r, 0.06, Math.sin(a) * r, rand(0.8, 1.8), rand(0, 6));
    }
    const cracks = makeInstanced(new THREE.BoxGeometry(1, 0.03, 0.07), lavaMat, 46);
    for (let i = 0; i < 46; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 22;
      _p.set(Math.cos(a) * r, 0.03, Math.sin(a) * r);
      _q.setFromEuler(_e.set(0, rand(0, Math.PI), 0));
      _s.set(rand(0.8, 3), 1, rand(0.8, 1.6));
      cracks.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
  }

  // Schwebende Mini-Inseln
  const floaterGeo = mergeGeometries([
    paint(roughen(new THREE.CylinderGeometry(1, 0.9, 0.35, 9, 1), 0.15, 0.175), (c, p1, p2, p3) => {
      if (p1.y > 0.17 && p2.y > 0.17 && p3.y > 0.17) c.set(b.floaterTop).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
      else c.set(b.side);
    }),
    paint(roughen(new THREE.ConeGeometry(0.9, 1.6, 8, 2), 0.3).rotateX(Math.PI).translate(0, -0.97, 0), shade(b.under[0], 0.08)),
    paint(new THREE.ConeGeometry(0.28, 0.75, 6).translate(0.2, 0.55, 0.1), shade(FLOATER_TREE[key], 0.1)),
  ]);
  const FLOATERS = 14;
  const floaters = makeInstanced(floaterGeo, lambert(), FLOATERS);
  floaters.frustumCulled = false;
  const floaterData = [];
  for (let i = 0; i < FLOATERS; i++) {
    const a = rand(0, Math.PI * 2), r = rand(45, 100);
    floaterData.push({ x: Math.cos(a) * r, y: rand(-16, 14), z: Math.sin(a) * r, s: rand(2, 5.5), rot: rand(0, 6), phase: rand(0, 6) });
  }

  // Wolkenmeer
  const puffGeos = [];
  const cloudLow = new THREE.Color(b.clouds[0]);
  const cloudHigh = new THREE.Color(b.clouds[1]);
  for (let k = 0; k < 5; k++) {
    const puff = new THREE.IcosahedronGeometry(rand(0.6, 1.1), 1);
    puff.scale(1, 0.62, 1);
    puff.translate(rand(-1.2, 1.2), rand(-0.1, 0.25), rand(-0.6, 0.6));
    puffGeos.push(paint(puff, (c, p1, p2, p3) => {
      const y = (p1.y + p2.y + p3.y) / 3;
      c.copy(cloudLow).lerp(cloudHigh, THREE.MathUtils.clamp(y + 0.4, 0, 1)).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04);
    }));
  }
  const CLOUDS = 46;
  const clouds = makeInstanced(mergeGeometries(puffGeos), lambert({ emissive: '#140c2e' }), CLOUDS);
  clouds.frustumCulled = false;
  for (let i = 0; i < CLOUDS; i++) {
    const a = rand(0, Math.PI * 2), r = i < 30 ? rand(38, 100) : rand(100, 160);
    setInstance(clouds, i, Math.cos(a) * r, i < 30 ? rand(-34, -22) : rand(-40, -6), Math.sin(a) * r, rand(3, 9), rand(0, 6));
  }

  function update(dt, t) {
    ringMat.opacity = 0.28 + Math.sin(t * 2) * 0.08;
    decoMats[0].emissiveIntensity = 0.7 + Math.sin(t * 1.8) * 0.25;
    decoMats[1].emissiveIntensity = 0.7 + Math.cos(t * 1.6) * 0.25;
    if (lavaMat) lavaMat.color.setRGB(1, 0.35 + Math.sin(t * 2.4) * 0.1, 0.05);
    clouds.rotation.y += dt * 0.006;
    for (let i = 0; i < FLOATERS; i++) {
      const f = floaterData[i];
      setInstance(floaters, i, f.x, f.y + Math.sin(t * 0.5 + f.phase) * 1.2, f.z, f.s, f.rot + t * 0.02);
    }
    floaters.instanceMatrix.needsUpdate = true;
  }

  function setDetail(quality) {
    grass.count = Math.floor(MAX_GRASS * quality.grass);
    if (flowers) flowers.count = Math.floor(MAX_FLOWERS * quality.grass);
  }

  return { key, group, update, setDetail, icePatches };
}

// ---------------------------------------------------------------------------------
// Dauerhafte Szene
// ---------------------------------------------------------------------------------
export function createWorld() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#2a1d52', 55, 170);

  const hemi = new THREE.HemisphereLight('#a5e8ff', '#46206a', 1.3);
  const sun = new THREE.DirectionalLight('#ffd2a1', 2.7);
  sun.position.set(-16, 30, 14);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 1, far: 90 });
  scene.add(hemi, sun);

  const skyGroup = new THREE.Group();
  scene.add(skyGroup);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = h > 0.0
          ? mix(horizon, top, smoothstep(0.0, 0.55, h))
          : mix(horizon, bottom, smoothstep(0.0, 0.35, -h));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), skyMat);
  sky.renderOrder = -2;
  skyGroup.add(sky);

  {
    const count = 1400;
    const pos = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection();
      v.y = Math.abs(v.y) * 0.95 + 0.05;
      v.normalize().multiplyScalar(300).toArray(pos, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#e0f2fe', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
    stars.renderOrder = -1;
    skyGroup.add(stars);
  }

  {
    const light = new THREE.Vector3(-0.6, 0.5, 0.6).normalize();
    const n = new THREE.Vector3();
    const dark = new THREE.Color('#3b2a6b');
    const bright = new THREE.Color('#f5a3c7');
    const planetGeo = paint(new THREE.IcosahedronGeometry(30, 2), (c, a, b, d) => {
      n.copy(a).add(b).add(d).normalize();
      c.copy(dark).lerp(bright, Math.max(0, n.dot(light)) * 0.9);
    });
    const planet = new THREE.Mesh(planetGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(40, 56, 72),
      new THREE.MeshBasicMaterial({ color: '#f0abfc', transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false, depthWrite: false })
    );
    ring.rotation.set(Math.PI / 2.3, 0.25, 0);
    const planetGroup = new THREE.Group();
    planetGroup.add(planet, ring);
    planetGroup.position.set(120, 70, -250);
    planetGroup.rotation.z = 0.3;
    skyGroup.add(planetGroup);
  }

  // Partikel: 0 = Glühwürmchen (schweben), 1 = Schnee (fällt), 2 = Glut (steigt)
  const MAX_DUST = 420;
  const dustPos = new Float32Array(MAX_DUST * 3);
  const dustPhase = new Float32Array(MAX_DUST);
  for (let i = 0; i < MAX_DUST; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 30;
    dustPos.set([Math.cos(a) * r, rand(0, 12), Math.sin(a) * r], i * 3);
    dustPhase[i] = rand(0, 100);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(dustPhase, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uMode: { value: 0 }, uColor: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uScale;
      uniform float uMode;
      attribute float aPhase;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float size = 90.0;
        vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.2 + aPhase * 3.0));
        if (uMode < 0.5) {
          p.y = 0.4 + position.y * 0.72 + sin(uTime * 0.6 + aPhase) * 0.7;
          p.x += cos(uTime * 0.35 + aPhase * 1.3) * 0.6;
          p.z += sin(uTime * 0.3 + aPhase * 0.7) * 0.6;
        } else if (uMode < 1.5) {
          p.y = mod(position.y - uTime * (1.2 + fract(aPhase) * 1.2), 12.0);
          p.x += sin(uTime * 0.8 + aPhase) * 0.6;
          size = 110.0;
          vAlpha = 0.85;
        } else {
          p.y = mod(position.y + uTime * (1.0 + fract(aPhase * 0.37) * 1.8), 12.0);
          p.x += sin(uTime * 1.3 + aPhase) * 0.35;
          size = 75.0;
          vAlpha *= smoothstep(12.0, 7.0, p.y);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * size / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vAlpha);
        #include <colorspace_fragment>
      }`,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  let biome = null;
  let detail = null;

  function setBiome(key) {
    if (biome?.key === key) return biome;
    if (biome) {
      scene.remove(biome.group);
      disposeTree(biome.group);
    }
    const b = BIOMES[key];
    skyMat.uniforms.top.value.set(b.sky[0]);
    skyMat.uniforms.horizon.value.set(b.sky[1]);
    skyMat.uniforms.bottom.value.set(b.sky[2]);
    scene.fog.color.set(b.fog);
    hemi.color.set(b.hemi[0]);
    hemi.groundColor.set(b.hemi[1]);
    hemi.intensity = b.hemi[2];
    sun.color.set(b.sun[0]);
    sun.intensity = b.sun[1];
    dustMat.uniforms.uColor.value.set(b.dust.color);
    dustMat.uniforms.uMode.value = b.dust.mode;
    biome = buildBiome(key);
    scene.add(biome.group);
    if (detail) biome.setDetail(detail);
    return biome;
  }

  function setDetail(quality, pixelRatio) {
    detail = quality;
    biome?.setDetail(quality);
    dustGeo.setDrawRange(0, Math.floor(MAX_DUST * quality.dust));
    dustMat.uniforms.uScale.value = pixelRatio;
  }

  function update(dt, t, camera) {
    skyGroup.position.copy(camera.position);
    dustMat.uniforms.uTime.value = t;
    biome?.update(dt, t);
  }

  return {
    scene, sun, update, setDetail, setBiome,
    get biome() { return biome; },
  };
}

// --- Leuchtflecken am Boden: ein Draw Call für alle Kristalle/Minen/Power-ups ----------
export class GlowLayer {
  constructor(scene, max = 96) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.max = max;
    this.n = 0;
    scene.add(this.mesh);
  }

  begin() { this.n = 0; }

  add(x, z, size, color, y = 0.06) {
    if (this.n >= this.max) return;
    _p.set(x, y, z);
    _s.set(size, 1, size);
    this.mesh.setMatrixAt(this.n, _m.compose(_p, _q.identity(), _s));
    this.mesh.setColorAt(this.n, color);
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// --- Partikel-Pool: ein InstancedMesh statt eines Meshes pro Splitter -------------------
export class Particles {
  constructor(scene, max = 520) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.cursor = 0;
    const white = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.mesh.setColorAt(i, white);
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    scene.add(this.mesh);
  }

  emit(x, y, z, vx, vy, vz, life, size, color, gravity = 9) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.gravity[i] = gravity;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
  }

  burst(position, color, count = 16, speed = 6, upward = 2.5) {
    for (let i = 0; i < count; i++) {
      _p.randomDirection().multiplyScalar(rand(speed * 0.4, speed));
      this.emit(position.x, position.y, position.z, _p.x, _p.y + upward, _p.z, rand(0.45, 0.8), rand(0.7, 1.3), color);
    }
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, t) {
    const { pos, vel, life } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      vel[i * 3 + 1] -= this.gravity[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const k = life[i] / this.maxLife[i];
      _p.fromArray(pos, i * 3);
      _q.setFromEuler(_e.set(t * 7 + i, t * 5 + i * 0.5, 0));
      _s.setScalar(this.size[i] * k);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

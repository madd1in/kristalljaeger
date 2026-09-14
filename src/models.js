// In Blender modellierte Low-Poly-Modelle (GLB, per esbuild ins Bundle eingebettet).
// Wir übernehmen nur die Geometrie; Farben kommen aus Spielmaterialien bzw. Welt-Paletten,
// damit Skins, Minenarten, Power-ups und Welten umfärbbar bleiben.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import droneGlb from './models/drone.glb';
import mineGlb from './models/mine.glb';
import crystalGlb from './models/crystal.glb';
import titanGlb from './models/titan.glb';
import puMagnetGlb from './models/pu-magnet.glb';
import puDoubleGlb from './models/pu-double.glb';
import puTimeGlb from './models/pu-time.glb';
import puShieldGlb from './models/pu-shield.glb';
import treePineGlb from './models/tree-pine.glb';
import treeRoundGlb from './models/tree-round.glb';
import treeSnowGlb from './models/tree-snow.glb';
import treeDeadGlb from './models/tree-dead.glb';
import rockAGlb from './models/rock-a.glb';
import rockBGlb from './models/rock-b.glb';

// Helligkeit je Blender-Material; wird als Vertex Color mit der Materialfarbe multipliziert
const SHADE = { Body: 1, Accent: 0.28 };

function parse(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
}

// Geometrien nach Materialname gruppieren, Transformationen einbacken, nur Position + Normale behalten
function groupByMaterial(gltf) {
  const groups = {};
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name.replace(/\.\d+$/, '');
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', o.geometry.attributes.position.clone());
    geo.setAttribute('normal', o.geometry.attributes.normal.clone());
    if (o.geometry.index) geo.setIndex(o.geometry.index.clone());
    geo.applyMatrix4(o.matrixWorld);
    (groups[name] ||= []).push(geo);
  });
  return groups;
}

// Hülle: Body/Accent zusammengeführt, Helligkeit als Vertex Color (Farbe kommt vom Material)
function shell(groups) {
  const parts = [];
  for (const [name, list] of Object.entries(groups)) {
    if (!(name in SHADE)) continue;
    for (const geo of list) {
      const g = geo.clone();
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(SHADE[name]), 3));
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

const glow = (groups) => (groups.Glow?.length ? mergeGeometries(groups.Glow) : null);

// Umgebung: jede Materialgruppe bekommt ihre Paletten-Farbe, pro Dreieck leicht variiert (Low-Poly-Look)
export function colorByMaterial(groups, palette, jitter = 0.06) {
  const parts = [];
  const c = new THREE.Color();
  for (const [name, list] of Object.entries(groups)) {
    const base = new THREE.Color(palette[name] ?? palette.default ?? '#888888');
    for (const geo of list) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      const count = g.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 3) {
        c.copy(base).offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
        for (let k = 0; k < 3 && i + k < count; k++) c.toArray(colors, (i + k) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

export async function loadModels() {
  const files = {
    drone: droneGlb, mine: mineGlb, crystal: crystalGlb, titan: titanGlb,
    magnet: puMagnetGlb, double: puDoubleGlb, time: puTimeGlb, shield: puShieldGlb,
    pine: treePineGlb, round: treeRoundGlb, snow: treeSnowGlb, dead: treeDeadGlb, rockA: rockAGlb, rockB: rockBGlb,
  };
  const keys = Object.keys(files);
  const parsed = await Promise.all(keys.map((k) => parse(files[k])));
  const g = Object.fromEntries(keys.map((k, i) => [k, groupByMaterial(parsed[i])]));
  return {
    drone: { shell: shell(g.drone), glow: glow(g.drone) },
    mine: { shell: shell(g.mine), glow: glow(g.mine) },
    titan: { shell: shell(g.titan), glow: glow(g.titan) },
    crystal: mergeGeometries(Object.values(g.crystal).flat()),
    powerups: { magnet: shell(g.magnet), double: shell(g.double), time: shell(g.time), shield: shell(g.shield) },
    env: { pine: g.pine, round: g.round, snow: g.snow, dead: g.dead, rockA: g.rockA, rockB: g.rockB },
  };
}

// In Blender modellierte Low-Poly-Modelle (GLB, per esbuild ins Bundle eingebettet).
// Wir übernehmen nur die Geometrie; Farben kommen weiter aus den Spielmaterialien,
// damit Skins, Minenarten und Kristalltypen umfärbbar bleiben.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import droneGlb from './models/drone.glb';
import mineGlb from './models/mine.glb';
import crystalGlb from './models/crystal.glb';

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

function shell(groups) {
  const parts = [];
  for (const [name, list] of Object.entries(groups)) {
    if (!(name in SHADE)) continue;
    for (const geo of list) {
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(SHADE[name]), 3));
      parts.push(geo);
    }
  }
  return mergeGeometries(parts);
}

const glow = (groups) => (groups.Glow?.length ? mergeGeometries(groups.Glow) : null);

export async function loadModels() {
  const [drone, mine, crystal] = await Promise.all([parse(droneGlb), parse(mineGlb), parse(crystalGlb)]);
  const droneGroups = groupByMaterial(drone);
  const mineGroups = groupByMaterial(mine);
  const crystalGroups = groupByMaterial(crystal);
  return {
    drone: { shell: shell(droneGroups), glow: glow(droneGroups) },
    mine: { shell: shell(mineGroups), glow: glow(mineGroups) },
    crystal: mergeGeometries(Object.values(crystalGroups).flat()),
  };
}

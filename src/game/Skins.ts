import * as THREE from 'three';
import type { Accessory, SkinDef } from '../config/skins';
import type { FloatingBody, PartName } from './FloatingBody';

/**
 * Skins - recolours the player's six parts and adds small accessories.
 * Materials and accessory meshes are built once per skin and reused.
 */

const cache = new Map<string, Record<PartName, THREE.Material>>();

function partMaterials(skin: SkinDef): Record<PartName, THREE.Material> {
  const hit = cache.get(skin.id);
  if (hit) return hit;
  const make = (color: number, glows = false) =>
    new THREE.MeshStandardMaterial({
      color,
      metalness: skin.metalness ?? 0,
      roughness: skin.roughness ?? 0.8,
      emissive: glows ? color : (skin.emissive ?? 0x000000),
      emissiveIntensity: glows || skin.emissive !== undefined ? (skin.emissiveIntensity ?? 1) : 0,
      transparent: skin.opacity !== undefined,
      opacity: skin.opacity ?? 1,
      depthWrite: skin.opacity === undefined,
    });
  const g = skin.glow ?? [];
  const head = make(skin.head, g.includes('head'));
  const torso = make(skin.torso, g.includes('torso'));
  const hands = make(skin.hands, g.includes('hands'));
  const feet = make(skin.feet, g.includes('feet'));
  const mats = { Head: head, Torso: torso, Hand_L: hands, Hand_R: hands, Foot_L: feet, Foot_R: feet };
  cache.set(skin.id, mats);
  return mats;
}

/** Build one accessory. Coordinates are local to the part (pivot = part centre, +Z = forward). */
function makeAccessory(kind: Accessory, accent: number): { part: PartName; obj: THREE.Object3D } {
  const mat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: kind === 'crown' ? 0.9 : 0.1 });
  const g = new THREE.Group();
  switch (kind) {
    case 'mohawk':
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15 - Math.abs(i - 2) * 0.02, 6), mat);
        c.position.set(0, 0.2, -0.11 + i * 0.055);
        g.add(c);
      }
      return { part: 'Head', obj: g };
    case 'crown': {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16, 1, true), mat);
      ring.material.side = THREE.DoubleSide;
      ring.position.y = 0.17;
      g.add(ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), mat);
        spike.position.set(Math.sin(a) * 0.1, 0.23, Math.cos(a) * 0.1);
        g.add(spike);
      }
      return { part: 'Head', obj: g };
    }
    case 'headband': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.143, 0.02, 8, 24), mat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.06;
      g.add(band);
      return { part: 'Head', obj: g };
    }
    case 'shades': {
      const glass = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.6 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.04), glass);
      bar.position.set(0, 0.03, 0.135);
      g.add(bar);
      return { part: 'Head', obj: g };
    }
    case 'scarf': {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.04, 8, 20), mat);
      loop.rotation.x = Math.PI / 2;
      loop.position.y = 0.34;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.03), mat);
      tail.position.set(0.07, 0.24, 0.13);
      tail.rotation.z = 0.25;
      g.add(loop, tail);
      return { part: 'Torso', obj: g };
    }
  }
}

/** Remembers the accessories currently attached to a body. */
const worn = new WeakMap<FloatingBody, THREE.Object3D[]>();

export function applySkin(body: FloatingBody, skin: SkinDef): void {
  const mats = partMaterials(skin);
  for (const name of Object.keys(mats) as PartName[]) {
    const part = body.parts[name] as THREE.Mesh;
    if (part.isMesh) {
      part.material = mats[name];
      part.castShadow = skin.opacity === undefined;
    }
  }
  for (const old of worn.get(body) ?? []) old.removeFromParent();
  const added: THREE.Object3D[] = [];
  for (const kind of skin.accessories ?? []) {
    const { part, obj } = makeAccessory(kind, skin.accent ?? 0xffffff);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    body.parts[part].add(obj);
    added.push(obj);
  }
  worn.set(body, added);
}

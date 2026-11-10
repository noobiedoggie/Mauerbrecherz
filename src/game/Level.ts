import * as THREE from 'three';
import type { LevelDef } from '../config/levels';
import { COLORS, TUNING } from '../config/tuning';
import { setShadows } from './Assets';
import type { Assets } from './Assets';
import { boxCollider, circleCollider } from './Collision';
import type { Collider } from './Collision';
import { Guard, Searchlight } from './Guard';
import { SEGMENT_WIDTH, Wall, placeSegment } from './Wall';

/**
 * Level - builds one wall's scene from its LevelDef:
 * sand tiles, the long wall with the breakable segment in the middle, street
 * lamps, fence + watchtower behind the play area, hedgehogs, cover, coins,
 * guards and (from level 5) the searchlight.
 */

interface Coin {
  obj: THREE.Object3D;
  x: number;
  z: number;
  index: number;
  taken: boolean;
  /** 0..1 pick-up animation. */
  pop: number;
  phase: number;
}

/** Extra single wall segments added on each side of the two Wall_Row6 pieces. */
const EXTRA_SEGMENTS_PER_SIDE = 5;
const TILE = 10;

export class Level {
  /** Add this to the scene; remove it (dispose) to unload the level. */
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly wall: Wall;
  readonly guards: Guard[] = [];
  readonly searchlight: Searchlight | null = null;
  readonly halfWidth: number;
  readonly depth: number;
  /** X of the breakable segment. */
  readonly targetX = 0;
  private coins: Coin[] = [];
  private time = 0;
  private marker: THREE.Mesh;

  constructor(
    readonly def: LevelDef,
    assets: Assets,
    wallHp: number,
    coinsTaken: number,
  ) {
    this.halfWidth = def.width / 2;
    this.depth = def.depth;

    this.buildGround(assets);
    this.buildWall(assets);
    this.wall = new Wall(assets, this.targetX, def.wallHp, wallHp);
    this.group.add(this.wall.group);
    this.marker = this.buildPunchZone();
    this.buildDressing(assets);
    this.buildObstacles(assets);
    this.buildCoins(assets, coinsTaken);

    for (const g of def.guards) {
      const guard = new Guard(assets, g, def.guardSpeed, this.halfWidth, this.depth);
      this.guards.push(guard);
      this.group.add(guard.body.root, guard.cone.mesh);
    }
    // Guards were created before the obstacle list was known to them: build cones once.
    for (const guard of this.guards) guard.update(0, null, this.colliders);

    // Watchtower: back right corner, just outside the play area.
    const towerX = this.halfWidth + 2.7;
    const towerZ = this.depth - 1.4;
    const tower = assets.instance('watchtower');
    tower.position.set(towerX, 0, towerZ);
    this.group.add(tower);
    const head = tower.getObjectByName('Searchlight') ?? null;
    const lens = tower.getObjectByName('SearchlightLens');
    if (head && lens) head.attach(lens); // the lens turns with the lamp
    if (head) head.rotation.y = -2.3; // points at the yard even when it is switched off
    if (def.searchlight) {
      const s = def.searchlight;
      this.searchlight = new Searchlight(head, towerX, towerZ, s.fromDeg, s.toDeg, s.period, s.length, s.halfAngleDeg, s.fillMul);
      this.group.add(this.searchlight.cone.mesh);
      this.searchlight.update(0, null, this.colliders, false);
    }
  }

  // ---- construction -----------------------------------------------------------

  private buildGround(assets: Assets): void {
    // Sand tiles on both sides of the wall, well past the play area.
    for (let x = -3; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        const tile = assets.instance('ground');
        tile.position.set(x * TILE + TILE / 2, 0, z * TILE + TILE / 2);
        setShadows(tile, false, true);
        this.group.add(tile);
      }
    }
  }

  private buildWall(assets: Assets): void {
    // Wall_Row6 left and right of the breakable segment...
    const rowHalf = SEGMENT_WIDTH * 3;
    for (const side of [-1, 1]) {
      const row = assets.instance('wallRow');
      placeSegment(row, side * (SEGMENT_WIDTH / 2 + rowHalf));
      this.group.add(row);
      // ...then single segments out to the horizon.
      for (let i = 0; i < EXTRA_SEGMENTS_PER_SIDE; i++) {
        const seg = assets.instance('wall');
        placeSegment(seg, side * (SEGMENT_WIDTH / 2 + rowHalf * 2 + SEGMENT_WIDTH * (i + 0.5)));
        this.group.add(seg);
      }
    }
  }

  /** Dashed yellow box on the ground: stand here to punch. */
  private buildPunchZone(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = COLORS.yellow;
    ctx.lineWidth = 10;
    ctx.setLineDash([26, 16]);
    ctx.strokeRect(8, 8, 240, 144);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SEGMENT_WIDTH, TUNING.player.punchRange),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.targetX, 0.03, TUNING.player.punchRange / 2 + 0.04);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    return mesh;
  }

  /** Set dressing: lamps along the wall, fence behind and beside the yard. */
  private buildDressing(assets: Assets): void {
    for (const x of this.def.lamps) {
      const lamp = assets.instance('lamp');
      lamp.position.set(x, 0, 0.3); // the arm reaches out over the yard (+Z)
      this.group.add(lamp);
      this.colliders.push(circleCollider(x, 0.3, 0.2, false, false));
    }

    const fenceLen = 3;
    const backZ = this.depth + 1.3;
    const sideX = this.halfWidth + 1.0;
    const addFence = (x: number, z: number, rotY: number) => {
      const fence = assets.instance('fence');
      fence.position.set(x, 0, z);
      fence.rotation.y = rotY;
      // Thin wires make noisy shadows and the fence is only scenery.
      setShadows(fence, false, false);
      this.group.add(fence);
    };
    const backCount = Math.ceil((sideX * 2) / fenceLen);
    for (let i = 0; i < backCount; i++) {
      addFence(-sideX + fenceLen / 2 + i * fenceLen, backZ, Math.PI);
    }
    const sideCount = Math.ceil(backZ / fenceLen);
    for (let i = 0; i < sideCount; i++) {
      const z = backZ - fenceLen / 2 - i * fenceLen;
      addFence(-sideX, z, Math.PI / 2);
      addFence(sideX, z, -Math.PI / 2);
    }
  }

  private buildObstacles(assets: Assets): void {
    for (const c of this.def.cover) {
      const obj = assets.instance(c.type);
      obj.position.set(c.x, 0, c.z);
      this.group.add(obj);
      if (c.type === 'crate') {
        this.colliders.push(boxCollider(c.x, c.z, 0.55, 0.55, true, true));
      } else if (c.type === 'barrel') {
        obj.rotation.y = c.x * 1.7;
        this.colliders.push(circleCollider(c.x, c.z, 0.32, true, true));
      } else {
        // Sandbag row: 2.3 m long, 0.4 m deep.
        if (c.turned) {
          obj.rotation.y = Math.PI / 2;
          this.colliders.push(boxCollider(c.x, c.z, 0.2, 1.15, true, true));
        } else {
          this.colliders.push(boxCollider(c.x, c.z, 1.15, 0.2, true, true));
        }
      }
    }
    for (const [x, z] of this.def.hedgehogs) {
      const obj = assets.instance('hedgehog');
      obj.position.set(x, 0, z);
      obj.rotation.y = (x * 0.9 + z * 0.4) % Math.PI;
      this.group.add(obj);
      this.colliders.push(circleCollider(x, z, 0.52, true, false));
    }
  }

  private buildCoins(assets: Assets, taken: number): void {
    this.def.coins.forEach(([x, z], index) => {
      if (taken & (1 << index)) return;
      const obj = assets.instance('coin');
      obj.position.set(x, 0.5, z);
      obj.scale.setScalar(1.5);
      this.group.add(obj);
      this.coins.push({ obj, x, z, index, taken: false, pop: 0, phase: index * 1.3 });
    });
  }

  // ---- per frame ---------------------------------------------------------------

  /** Spin and bob the coins; returns the indices picked up this frame. */
  updateCoins(dt: number, playerX: number, playerZ: number, canCollect: boolean, out: number[]): void {
    this.time += dt;
    out.length = 0;
    for (const c of this.coins) {
      if (c.taken) {
        if (c.pop < 1) {
          // Picked up: jump, spin fast and shrink away.
          c.pop = Math.min(1, c.pop + dt * 3.5);
          c.obj.position.y = 0.5 + c.pop * 1.3;
          c.obj.rotation.y += dt * 22;
          c.obj.scale.setScalar(1.5 * (1 - c.pop));
          if (c.pop >= 1) c.obj.visible = false;
        }
        continue;
      }
      c.obj.rotation.y += dt * 2.6;
      c.obj.position.y = 0.42 + Math.sin(this.time * 2.4 + c.phase) * 0.09;
      if (canCollect && Math.hypot(c.x - playerX, c.z - playerZ) < 0.85) {
        c.taken = true;
        out.push(c.index);
      }
    }
    // The punch zone box breathes a little so it catches the eye.
    (this.marker.material as THREE.MeshBasicMaterial).opacity = this.wall.destroyed ? 0 : 0.65 + Math.sin(this.time * 3) * 0.25;
  }

  coinPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    const [x, z] = this.def.coins[index];
    return out.set(x, 1.2, z);
  }

  dispose(): void {
    for (const g of this.guards) g.dispose();
    this.searchlight?.dispose();
    this.wall.dispose();
    const mat = this.marker.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.marker.geometry.dispose();
    this.group.removeFromParent();
  }
}

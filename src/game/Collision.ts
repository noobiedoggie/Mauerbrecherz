/**
 * Collision - tiny 2D (top-down) collision and line-of-sight helpers.
 *
 * Everything that blocks movement or sight is either a circle or an
 * axis-aligned box on the ground plane (x, z).
 */

export interface Collider {
  kind: 'circle' | 'box';
  x: number;
  z: number;
  /** Circle radius. */
  r: number;
  /** Box half extents. */
  hx: number;
  hz: number;
  /** Blocks flashlight cones and line of sight. */
  blocksSight: boolean;
  /** The player can HIDE next to it. */
  cover: boolean;
}

export function circleCollider(x: number, z: number, r: number, blocksSight: boolean, cover: boolean): Collider {
  return { kind: 'circle', x, z, r, hx: r, hz: r, blocksSight, cover };
}

export function boxCollider(x: number, z: number, hx: number, hz: number, blocksSight: boolean, cover: boolean): Collider {
  return { kind: 'box', x, z, r: Math.hypot(hx, hz), hx, hz, blocksSight, cover };
}

/** Gap between a point and the surface of a collider (negative = inside). */
export function distanceToCollider(px: number, pz: number, c: Collider): number {
  if (c.kind === 'circle') return Math.hypot(px - c.x, pz - c.z) - c.r;
  const dx = Math.abs(px - c.x) - c.hx;
  const dz = Math.abs(pz - c.z) - c.hz;
  const ox = Math.max(dx, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0);
}

const _out = { x: 0, z: 0 };

/**
 * Push a moving circle out of every collider. Returns a shared object, so
 * read x/z straight away.
 */
export function resolveCircle(px: number, pz: number, radius: number, colliders: Collider[]): { x: number; z: number } {
  let x = px;
  let z = pz;
  // Two passes settle the corner cases where two props touch.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.kind === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const min = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.0001;
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
        }
      } else {
        // Closest point on the box to the circle centre.
        const cx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
        const cz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
        let dx = x - cx;
        let dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = cx + (dx / d) * radius;
            z = cz + (dz / d) * radius;
          } else {
            // Centre is inside the box: leave through the nearest side.
            dx = x - c.x;
            dz = z - c.z;
            const penX = c.hx + radius - Math.abs(dx);
            const penZ = c.hz + radius - Math.abs(dz);
            if (penX < penZ) x += Math.sign(dx || 1) * penX;
            else z += Math.sign(dz || 1) * penZ;
          }
        }
      }
    }
  }
  _out.x = x;
  _out.z = z;
  return _out;
}

/**
 * Distance along a ray until it hits the first sight-blocking collider,
 * capped at maxLen. (dx, dz) must be normalised.
 */
export function rayDistance(ox: number, oz: number, dx: number, dz: number, maxLen: number, colliders: Collider[]): number {
  let best = maxLen;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.blocksSight) continue;
    // Quick reject: collider further away than the best hit so far.
    const tx = c.x - ox;
    const tz = c.z - oz;
    const along = tx * dx + tz * dz;
    if (along < -c.r || along - c.r > best) continue;

    if (c.kind === 'circle') {
      const perp2 = tx * tx + tz * tz - along * along;
      const r2 = c.r * c.r;
      if (perp2 > r2) continue;
      const t = along - Math.sqrt(r2 - perp2);
      if (t >= 0 && t < best) best = t;
      else if (t < 0 && along + Math.sqrt(r2 - perp2) > 0) best = 0; // origin inside
    } else {
      // Slab test against the box.
      let tmin = 0;
      let tmax = best;
      let hit = true;
      if (Math.abs(dx) < 1e-9) {
        if (ox < c.x - c.hx || ox > c.x + c.hx) hit = false;
      } else {
        let t1 = (c.x - c.hx - ox) / dx;
        let t2 = (c.x + c.hx - ox) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) hit = false;
      }
      if (hit) {
        if (Math.abs(dz) < 1e-9) {
          if (oz < c.z - c.hz || oz > c.z + c.hz) hit = false;
        } else {
          let t1 = (c.z - c.hz - oz) / dz;
          let t2 = (c.z + c.hz - oz) / dz;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) hit = false;
        }
      }
      if (hit && tmin < best) best = tmin;
    }
  }
  return best;
}

/** True when nothing blocks the straight line between two points. */
export function hasLineOfSight(ax: number, az: number, bx: number, bz: number, colliders: Collider[]): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return true;
  return rayDistance(ax, az, dx / len, dz / len, len, colliders) >= len - 1e-3;
}

/** Shortest signed difference between two angles (radians). */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move `from` towards `to` by at most `maxStep` radians. */
export function turnTowards(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

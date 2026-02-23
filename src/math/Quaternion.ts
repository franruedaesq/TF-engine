import { quat as glQuat, vec3 as glVec3 } from "gl-matrix";
import { Vec3 } from "./Vec3.js";

/**
 * Immutable unit quaternion representing a 3-D rotation.
 * Stored as (x, y, z, w) – the gl-matrix convention.
 */
export class Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  // ── factory helpers ────────────────────────────────────────────────────────

  /** Identity rotation (no rotation). */
  static identity(): Quaternion {
    return new Quaternion(0, 0, 0, 1);
  }

  /**
   * Create from an axis (need not be normalised) and an angle in radians.
   */
  static fromAxisAngle(axis: Vec3, angleRad: number): Quaternion {
    const q = glQuat.create();
    glQuat.setAxisAngle(q, [axis.x, axis.y, axis.z], angleRad);
    return new Quaternion(q[0], q[1], q[2], q[3]);
  }

  /**
   * Create from Euler angles (radians) applied in XYZ order.
   */
  static fromEulerXYZ(x: number, y: number, z: number): Quaternion {
    const q = glQuat.create();
    glQuat.fromEuler(q, (x * 180) / Math.PI, (y * 180) / Math.PI, (z * 180) / Math.PI);
    return new Quaternion(q[0], q[1], q[2], q[3]);
  }

  static fromArray(arr: readonly [number, number, number, number]): Quaternion {
    return new Quaternion(arr[0], arr[1], arr[2], arr[3]);
  }

  // ── operations ─────────────────────────────────────────────────────────────

  /** Hamilton product: this × other (applies `other` first, then `this`). */
  multiply(other: Quaternion): Quaternion {
    const q = glQuat.create();
    glQuat.multiply(
      q,
      [this.x, this.y, this.z, this.w],
      [other.x, other.y, other.z, other.w],
    );
    return new Quaternion(q[0], q[1], q[2], q[3]);
  }

  /** Conjugate / inverse for unit quaternions. */
  invert(): Quaternion {
    const q = glQuat.create();
    glQuat.invert(q, [this.x, this.y, this.z, this.w]);
    return new Quaternion(q[0], q[1], q[2], q[3]);
  }

  /** Normalise to unit length. */
  normalize(): Quaternion {
    const q = glQuat.create();
    glQuat.normalize(q, [this.x, this.y, this.z, this.w]);
    return new Quaternion(q[0], q[1], q[2], q[3]);
  }

  /** Rotate a Vec3 by this quaternion. */
  rotateVec3(v: Vec3): Vec3 {
    const out = glVec3.create();
    glVec3.transformQuat(out, [v.x, v.y, v.z], [this.x, this.y, this.z, this.w]);
    return new Vec3(out[0], out[1], out[2]);
  }

  // ── utility ────────────────────────────────────────────────────────────────

  equals(other: Quaternion, epsilon = 1e-6): boolean {
    // q and -q represent the same rotation
    const dot =
      this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w;
    return Math.abs(Math.abs(dot) - 1) <= epsilon;
  }

  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  toString(): string {
    return `Quaternion(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
  }
}

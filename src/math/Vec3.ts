import { vec3 as glVec3 } from "gl-matrix";

/**
 * Immutable 3-component vector (X, Y, Z).
 * Wraps gl-matrix vec3 for optimised arithmetic.
 */
export class Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // ── factory helpers ────────────────────────────────────────────────────────

  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  static fromArray(arr: readonly [number, number, number]): Vec3 {
    return new Vec3(arr[0], arr[1], arr[2]);
  }

  // ── arithmetic ─────────────────────────────────────────────────────────────

  add(other: Vec3): Vec3 {
    const out = glVec3.create();
    glVec3.add(out, [this.x, this.y, this.z], [other.x, other.y, other.z]);
    return new Vec3(out[0], out[1], out[2]);
  }

  subtract(other: Vec3): Vec3 {
    const out = glVec3.create();
    glVec3.subtract(
      out,
      [this.x, this.y, this.z],
      [other.x, other.y, other.z],
    );
    return new Vec3(out[0], out[1], out[2]);
  }

  scale(s: number): Vec3 {
    const out = glVec3.create();
    glVec3.scale(out, [this.x, this.y, this.z], s);
    return new Vec3(out[0], out[1], out[2]);
  }

  length(): number {
    return glVec3.length([this.x, this.y, this.z]);
  }

  normalize(): Vec3 {
    const out = glVec3.create();
    glVec3.normalize(out, [this.x, this.y, this.z]);
    return new Vec3(out[0], out[1], out[2]);
  }

  dot(other: Vec3): number {
    return glVec3.dot(
      [this.x, this.y, this.z],
      [other.x, other.y, other.z],
    );
  }

  cross(other: Vec3): Vec3 {
    const out = glVec3.create();
    glVec3.cross(out, [this.x, this.y, this.z], [other.x, other.y, other.z]);
    return new Vec3(out[0], out[1], out[2]);
  }

  // ── utility ────────────────────────────────────────────────────────────────

  equals(other: Vec3, epsilon = 1e-6): boolean {
    return (
      Math.abs(this.x - other.x) <= epsilon &&
      Math.abs(this.y - other.y) <= epsilon &&
      Math.abs(this.z - other.z) <= epsilon
    );
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toString(): string {
    return `Vec3(${this.x}, ${this.y}, ${this.z})`;
  }
}

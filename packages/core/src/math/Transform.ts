import { mat4 as glMat4 } from "gl-matrix";
import { Vec3 } from "./Vec3.js";
import { Quaternion } from "./Quaternion.js";

/**
 * Rigid-body transform: translation (Vec3) + rotation (Quaternion).
 *
 * Internally backed by a 4×4 column-major matrix so composition and
 * inversion use gl-matrix's SIMD-friendly routines.
 */
export class Transform {
  readonly translation: Vec3;
  readonly rotation: Quaternion;

  constructor(translation: Vec3 = new Vec3(), rotation: Quaternion = Quaternion.identity()) {
    this.translation = translation;
    this.rotation = rotation;
  }

  // ── factory helpers ────────────────────────────────────────────────────────

  static identity(): Transform {
    return new Transform(Vec3.zero(), Quaternion.identity());
  }

  // ── composition ────────────────────────────────────────────────────────────

  /**
   * Returns the transform equivalent to first applying `this`, then `other`.
   * If T_A is "A relative to world" and T_B is "B relative to A",
   * then `T_A.compose(T_B)` gives "B relative to world".
   */
  compose(other: Transform): Transform {
    const m1 = this.toMat4();
    const m2 = other.toMat4();
    const out = glMat4.create() as unknown as Float32Array;
    glMat4.multiply(
      out as unknown as Parameters<typeof glMat4.multiply>[0],
      m1 as unknown as Parameters<typeof glMat4.multiply>[1],
      m2 as unknown as Parameters<typeof glMat4.multiply>[2],
    );
    return Transform.fromMat4(out);
  }

  /**
   * Returns the inverse transform such that `t.compose(t.invert())` ≈ identity.
   */
  invert(): Transform {
    const m = this.toMat4();
    const inv = glMat4.create() as unknown as Float32Array;
    glMat4.invert(
      inv as unknown as Parameters<typeof glMat4.invert>[0],
      m as unknown as Parameters<typeof glMat4.invert>[1],
    );
    return Transform.fromMat4(inv);
  }

  /**
   * Apply this transform to a 3-D point (applies rotation then translation).
   */
  transformPoint(point: Vec3): Vec3 {
    const m = this.toMat4();
    const v4 = new Float32Array([point.x, point.y, point.z, 1]);
    const result = new Float32Array(4);
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let c = 0; c < 4; c++) {
        sum += (m as unknown as number[])[c * 4 + r] * v4[c];
      }
      result[r] = sum;
    }
    return new Vec3(result[0], result[1], result[2]);
  }

  // ── matrix conversion ──────────────────────────────────────────────────────

  /** Build a column-major 4×4 TRS matrix from this transform. */
  toMat4(): Float32Array {
    const m = glMat4.create() as unknown as Float32Array;
    glMat4.fromRotationTranslation(
      m as unknown as Parameters<typeof glMat4.fromRotationTranslation>[0],
      [this.rotation.x, this.rotation.y, this.rotation.z, this.rotation.w],
      [this.translation.x, this.translation.y, this.translation.z],
    );
    return m;
  }

  /** Decompose a column-major 4×4 matrix back into translation + rotation. */
  static fromMat4(m: Float32Array | number[]): Transform {
    const translation = new Vec3(
      (m as unknown as number[])[12],
      (m as unknown as number[])[13],
      (m as unknown as number[])[14],
    );

    // Extract rotation quaternion via gl-matrix
    const q = new Float32Array([
      (m as unknown as number[])[0],
      (m as unknown as number[])[1],
      (m as unknown as number[])[2],
      0,
      (m as unknown as number[])[4],
      (m as unknown as number[])[5],
      (m as unknown as number[])[6],
      0,
      (m as unknown as number[])[8],
      (m as unknown as number[])[9],
      (m as unknown as number[])[10],
      0,
      0,
      0,
      0,
      1,
    ]);

    const rot = new Float32Array(4);
    glMat4.getRotation(rot, q);
    const rotation = new Quaternion(rot[0], rot[1], rot[2], rot[3]);

    return new Transform(translation, rotation);
  }

  // ── utility ────────────────────────────────────────────────────────────────

  equals(other: Transform, epsilon = 1e-5): boolean {
    return (
      this.translation.equals(other.translation, epsilon) &&
      this.rotation.equals(other.rotation, epsilon)
    );
  }

  toString(): string {
    return `Transform(t=${this.translation}, r=${this.rotation})`;
  }
}

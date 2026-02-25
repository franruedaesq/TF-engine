import type { Matrix4, Object3D } from "three";
import type { Transform } from "@tf-engine/core";

/**
 * Copy a {@link Transform}'s 4×4 column-major matrix directly into a
 * Three.js {@link Matrix4}.
 *
 * Because {@link Transform.toMat4} already returns a `Float32Array` in the
 * same column-major layout that Three.js uses internally, this is a zero-copy
 * operation: the 16 elements are assigned with a single `fromArray` call —
 * no trigonometric re-computation required.
 *
 * @param transform The source {@link Transform}.
 * @param target    An existing {@link Matrix4} to mutate.  If omitted a new
 *                  `Matrix4` is constructed (requires `three` to be importable).
 * @returns The mutated (or newly created) {@link Matrix4}.
 *
 * @example
 * ```ts
 * import { Matrix4 } from "three";
 * import { toMatrix4 } from "@tf-engine/three";
 *
 * const mat = toMatrix4(transform, new Matrix4());
 * mesh.matrix.copy(mat);
 * mesh.matrixAutoUpdate = false;
 * ```
 */
export function toMatrix4(transform: Transform, target: Matrix4): Matrix4 {
  // Transform.toMat4() returns a column-major Float32Array with 16 elements.
  // THREE.Matrix4.fromArray() consumes the same column-major layout, so
  // we can pass it directly with no conversion.
  return target.fromArray(transform.toMat4());
}

/**
 * Apply a {@link Transform} to an {@link Object3D} by writing the matrix
 * directly into `object.matrix` and marking `object.matrixAutoUpdate = false`
 * so Three.js will use our matrix unchanged on the next render.
 *
 * @param transform The source {@link Transform}.
 * @param object    The Three.js {@link Object3D} to update.
 *
 * @example
 * ```ts
 * import { applyToObject3D } from "@tf-engine/three";
 *
 * // In your animation loop:
 * tf.onChange("robot", () => {
 *   const transform = tf.getTransform("world", "robot");
 *   applyToObject3D(transform, robotMesh);
 * });
 * ```
 */
export function applyToObject3D(transform: Transform, object: Object3D): void {
  object.matrixAutoUpdate = false;
  toMatrix4(transform, object.matrix);
  object.matrixWorldNeedsUpdate = true;
}

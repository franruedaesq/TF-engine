import { Vec3 } from "./math/Vec3.js";
import { Quaternion } from "./math/Quaternion.js";
import { Transform } from "./math/Transform.js";

/**
 * Structural interface for a rigid-body transform:
 * a translation ({@link Vec3}) and a rotation ({@link Quaternion}).
 */
export interface ITransform {
  readonly translation: Vec3;
  readonly rotation: Quaternion;
}

/**
 * A single node in the transform tree.
 * Holds a frame identifier, an optional parent frame identifier,
 * and the {@link Transform} of this frame relative to its parent.
 */
export interface FrameNode {
  readonly id: string;
  /** Parent frame id; undefined for a root frame. */
  readonly parentId?: string;
  /** Transform expressing this frame relative to its parent. */
  readonly transform: Transform;
}

/**
 * JSON-serializable representation of a single frame node.
 * Used by {@link TFTree.toJSON} and {@link TFTree.fromJSON}.
 */
export interface FrameNodeJSON {
  readonly id: string;
  /** Parent frame id; null for a root frame. */
  readonly parentId: string | null;
  readonly transform: {
    /** [x, y, z] translation. */
    readonly translation: [number, number, number];
    /** [x, y, z, w] quaternion rotation. */
    readonly rotation: [number, number, number, number];
  };
}

/**
 * JSON-serializable snapshot of an entire {@link TFTree}.
 * Frames are ordered so that parents always appear before their children,
 * making the array safe to replay with sequential {@link TFTree.addFrame} calls.
 */
export interface TFTreeJSON {
  readonly frames: FrameNodeJSON[];
}

/**
 * Public API of the transform-tree engine.
 */
export interface ITransformTree {
  /**
   * Register a new frame.
   *
   * @param id       Unique identifier for this frame.
   * @param parentId Id of the parent frame; omit for a root frame.
   * @param transform Transform expressing this frame relative to its parent.
   *                  Defaults to the identity transform.
   */
  addFrame(id: string, parentId?: string, transform?: Transform): void;

  /**
   * Update the transform of an existing frame.
   *
   * @param id        Identifier of the frame to update.
   * @param transform New transform relative to the frame's parent.
   */
  updateFrame(id: string, transform: Transform): void;

  /**
   * Remove a registered frame from the tree.
   *
   * @param id Identifier of the frame to remove.
   * @throws {Error} if `id` is not registered.
   * @throws {Error} if the frame still has child frames registered.
   */
  removeFrame(id: string): void;

  /**
   * Compute the transform that maps points expressed in `from` to the
   * coordinate system of `to`.
   *
   * @param from Source frame id.
   * @param to   Target frame id.
   */
  getTransform(from: string, to: string): Transform;
}

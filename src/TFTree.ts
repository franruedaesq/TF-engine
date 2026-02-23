import { Transform } from "./math/Transform.js";
import { Vec3 } from "./math/Vec3.js";
import { Quaternion } from "./math/Quaternion.js";
import { type FrameNode, type ITransformTree, type TFTreeJSON } from "./types.js";
import { CycleDetectedError } from "./CycleDetectedError.js";

/**
 * TFTree – a directed acyclic graph (tree) of named reference frames.
 *
 * Each frame stores how it relates to its **parent** frame via a
 * {@link Transform} (translation + rotation).  The tree can then resolve
 * the relative transform between **any** two frames at O(depth) cost.
 *
 * @example
 * ```ts
 * const tf = new TFTree();
 * tf.addFrame("world");
 * tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));
 * tf.addFrame("camera", "robot", new Transform(new Vec3(0, 0, 0.5)));
 *
 * const cameraInWorld = tf.getTransform("world", "camera");
 * ```
 */
export class TFTree implements ITransformTree {
  private readonly frames = new Map<string, FrameNode>();
  private readonly dirtySet = new Set<string>();
  private readonly worldTransformCache = new Map<string, Transform>();
  private readonly childrenMap = new Map<string, Set<string>>();

  // ── frame registration ─────────────────────────────────────────────────────

  /**
   * Register a new frame.
   *
   * @param id       Unique identifier for this frame.
   * @param parentId Id of the parent frame.  Omit (or pass `undefined`) for a
   *                 root frame.  There may be multiple root frames.
   * @param transform Transform expressing this frame relative to its parent.
   *                  Defaults to the identity transform.
   * @throws {Error} if `id` is already registered or `parentId` is not found.
   * @throws {CycleDetectedError} if adding this frame would introduce a cycle.
   */
  addFrame(
    id: string,
    parentId?: string,
    transform: Transform = Transform.identity(),
  ): void {
    if (this.frames.has(id)) {
      throw new Error(`Frame "${id}" is already registered.`);
    }
    if (parentId !== undefined && !this.frames.has(parentId)) {
      throw new Error(
        `Parent frame "${parentId}" not found. Register parents before children.`,
      );
    }

    // Check that the parent's chain to root does not already contain `id`,
    // which would create a cycle and violate the DAG invariant.
    if (parentId !== undefined) {
      let current: string | undefined = parentId;
      while (current !== undefined) {
        if (current === id) {
          throw new CycleDetectedError(id);
        }
        current = this.frames.get(current)?.parentId;
      }
    }

    this.frames.set(id, { id, parentId, transform });
    this.dirtySet.add(id);
    // Register in children map.
    if (!this.childrenMap.has(id)) {
      this.childrenMap.set(id, new Set());
    }
    if (parentId !== undefined) {
      this.childrenMap.get(parentId)!.add(id);
    }
  }

  /**
   * Update the transform of an existing frame.
   *
   * @throws {Error} if `id` is not registered.
   */
  updateTransform(id: string, transform: Transform): void {
    const frame = this.frames.get(id);
    if (frame === undefined) {
      throw new Error(`Frame "${id}" not found.`);
    }
    this.frames.set(id, { ...frame, transform });
    this.markSubtreeDirty(id);
  }

  /**
   * Alias for {@link updateTransform} – satisfies the {@link ITransformTree} interface.
   *
   * @throws {Error} if `id` is not registered.
   */
  updateFrame(id: string, transform: Transform): void {
    this.updateTransform(id, transform);
  }

  /**
   * Batch-update the transforms of multiple existing frames in a single call.
   *
   * More efficient than calling {@link updateTransform} repeatedly when
   * several frames share an ancestor: dirty-marking is skipped for any frame
   * whose ancestor is also included in the same batch, preventing redundant
   * subtree traversals.
   *
   * @throws {Error} if any id in `updates` is not registered.
   */
  updateTransforms(updates: Record<string, Transform>): void {
    // First pass: apply all transform changes (validates every id up-front).
    for (const [id, transform] of Object.entries(updates)) {
      const frame = this.frames.get(id);
      if (frame === undefined) {
        throw new Error(`Frame "${id}" not found.`);
      }
      this.frames.set(id, { ...frame, transform });
    }

    // Second pass: mark subtrees dirty, but skip frames whose ancestor is
    // also being updated in this batch – the ancestor's markSubtreeDirty
    // call will already cover those descendants.
    const ids = new Set(Object.keys(updates));
    for (const id of ids) {
      let parentId = this.frames.get(id)?.parentId;
      let ancestorUpdated = false;
      while (parentId !== undefined) {
        if (ids.has(parentId)) {
          ancestorUpdated = true;
          break;
        }
        parentId = this.frames.get(parentId)?.parentId;
      }
      if (!ancestorUpdated) {
        this.markSubtreeDirty(id);
      }
    }
  }

  /**
   * Remove a registered frame from the tree.
   *
   * @param id Identifier of the frame to remove.
   * @throws {Error} if `id` is not registered.
   * @throws {Error} if the frame still has child frames registered.
   */
  removeFrame(id: string): void {
    if (!this.frames.has(id)) {
      throw new Error(`Frame "${id}" not found.`);
    }
    for (const frame of this.frames.values()) {
      if (frame.parentId === id) {
        throw new Error(
          `Cannot remove frame "${id}": it still has child frames. Remove children first.`,
        );
      }
    }
    const { parentId } = this.frames.get(id)!;
    this.frames.delete(id);
    this.worldTransformCache.delete(id);
    this.dirtySet.delete(id);
    // Clean up children map.
    this.childrenMap.delete(id);
    if (parentId !== undefined) {
      this.childrenMap.get(parentId)?.delete(id);
    }
  }

  // ── query ──────────────────────────────────────────────────────────────────

  /** Returns true if the given frame id is registered. */
  hasFrame(id: string): boolean {
    return this.frames.has(id);
  }

  /** Returns all registered frame ids. */
  frameIds(): string[] {
    return Array.from(this.frames.keys());
  }

  /**
   * Compute the transform that maps points expressed in `from` to the
   * coordinate system of `to`.
   *
   * In other words the returned transform `T` satisfies:
   *   `p_to = T.transformPoint(p_from)`
   *
   * @throws {Error} if either frame is not registered or if the frames are
   *                 not connected in the same tree.
   */
  getTransform(from: string, to: string): Transform {
    if (!this.frames.has(from)) {
      throw new Error(`Frame "${from}" not found.`);
    }
    if (!this.frames.has(to)) {
      throw new Error(`Frame "${to}" not found.`);
    }
    if (from === to) {
      return Transform.identity();
    }

    // Walk each frame up to the root and collect the chain as (id → index).
    const fromChain = this.chainToRoot(from);
    const toChain = this.chainToRoot(to);

    // Find the lowest common ancestor (LCA).
    const toChainMap = new Map<string, number>(
      toChain.map((id, idx) => [id, idx]),
    );

    let lcaId: string | undefined;
    for (let i = 0; i < fromChain.length; i++) {
      if (toChainMap.has(fromChain[i])) {
        lcaId = fromChain[i];
        break;
      }
    }

    if (lcaId === undefined) {
      throw new Error(
        `Frames "${from}" and "${to}" are not connected in the same tree.`,
      );
    }

    // Use cached world transforms to compute the relative transform.
    return this.getWorldTransform(from).invert().compose(this.getWorldTransform(to));
  }

  // ── serialization ──────────────────────────────────────────────────────────

  /**
   * Serialize the entire tree to a plain JSON-compatible object.
   *
   * Frames are emitted in insertion order, which guarantees that parents
   * always appear before their children — safe to replay with sequential
   * {@link addFrame} calls.
   *
   * @example
   * ```ts
   * const json = tf.toJSON();
   * const copy = TFTree.fromJSON(json);
   * ```
   */
  toJSON(): TFTreeJSON {
    const frames = Array.from(this.frames.values()).map((frame) => ({
      id: frame.id,
      parentId: frame.parentId ?? null,
      transform: {
        translation: frame.transform.translation.toArray(),
        rotation: frame.transform.rotation.toArray(),
      },
    }));
    return { frames };
  }

  /**
   * Reconstruct a {@link TFTree} from a plain JSON object produced by
   * {@link toJSON}.
   *
   * Frames must be listed in parent-before-child order (which {@link toJSON}
   * guarantees automatically).
   *
   * @example
   * ```ts
   * const tf = TFTree.fromJSON(config);
   * ```
   *
   * @throws {Error} if the data contains an unknown parent reference or a
   *                 duplicate frame id.
   */
  static fromJSON(data: TFTreeJSON): TFTree {
    const tree = new TFTree();
    for (const frame of data.frames) {
      const transform = new Transform(
        Vec3.fromArray(frame.transform.translation),
        Quaternion.fromArray(frame.transform.rotation),
      );
      tree.addFrame(frame.id, frame.parentId ?? undefined, transform);
    }
    return tree;
  }

  // ── protected helpers (available to subclasses) ───────────────────────────

  /**
   * Returns the {@link FrameNode} for the given id.
   * Subclasses may use this to walk the frame hierarchy.
   *
   * @throws {Error} if `id` is not registered.
   */
  protected getFrameNode(id: string): FrameNode {
    const frame = this.frames.get(id);
    if (frame === undefined) {
      throw new Error(`Frame "${id}" not found.`);
    }
    return frame;
  }

  // ── private helpers ────────────────────────────────────────────────────────

  /**
   * Mark a frame and all of its descendants as dirty, invalidating their
   * cached world transforms so they are recomputed on next access.
   */
  private markSubtreeDirty(id: string): void {
    this.dirtySet.add(id);
    this.worldTransformCache.delete(id);
    for (const childId of this.childrenMap.get(id) ?? []) {
      this.markSubtreeDirty(childId);
    }
  }

  /**
   * Returns the cached world transform for `id`, recomputing and caching it
   * if the frame is dirty.  The world transform is the accumulated transform
   * from the subtree root down to this frame.
   */
  private getWorldTransform(id: string, visiting = new Set<string>()): Transform {
    if (!this.dirtySet.has(id)) {
      const cached = this.worldTransformCache.get(id);
      if (cached !== undefined) return cached;
    }
    if (visiting.has(id)) {
      throw new CycleDetectedError(id);
    }
    visiting.add(id);
    const frame = this.frames.get(id)!;
    const worldTransform =
      frame.parentId === undefined
        ? frame.transform
        : this.getWorldTransform(frame.parentId, visiting).compose(frame.transform);
    this.worldTransformCache.set(id, worldTransform);
    this.dirtySet.delete(id);
    return worldTransform;
  }

  /**
   * Returns the ordered list of frame ids from `id` up to (and including)
   * the root frame, i.e. `[id, parent, grandparent, …, root]`.
   */
  private chainToRoot(id: string): string[] {
    const chain: string[] = [];
    let current: string | undefined = id;
    const visited = new Set<string>();

    while (current !== undefined) {
      if (visited.has(current)) {
        throw new CycleDetectedError(current);
      }
      visited.add(current);
      chain.push(current);
      current = this.frames.get(current)?.parentId;
    }
    return chain;
  }
}

import { Transform } from "./math/Transform.js";
import { type FrameNode, type ITransformTree } from "./types.js";

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

    this.frames.set(id, { id, parentId, transform });
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
  }

  /**
   * Alias for {@link updateTransform} – satisfies the {@link ITransformTree} interface.
   *
   * @throws {Error} if `id` is not registered.
   */
  updateFrame(id: string, transform: Transform): void {
    this.updateTransform(id, transform);
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
    let fromLcaIdx = -1;
    for (let i = 0; i < fromChain.length; i++) {
      if (toChainMap.has(fromChain[i])) {
        lcaId = fromChain[i];
        fromLcaIdx = i;
        break;
      }
    }

    if (lcaId === undefined) {
      throw new Error(
        `Frames "${from}" and "${to}" are not connected in the same tree.`,
      );
    }
    const toLcaIdx = toChainMap.get(lcaId)!;

    // Build the transform from `from` up to LCA.
    let upTransform = Transform.identity();
    for (let i = 0; i < fromLcaIdx; i++) {
      const frameId = fromChain[i];
      const frame = this.frames.get(frameId)!;
      // Going up means inverting this frame's transform.
      upTransform = frame.transform.invert().compose(upTransform);
    }

    // Build the transform from LCA down to `to`.
    let downTransform = Transform.identity();
    const toChainToLca = toChain.slice(0, toLcaIdx).reverse();
    for (const frameId of toChainToLca) {
      const frame = this.frames.get(frameId)!;
      downTransform = downTransform.compose(frame.transform);
    }

    return upTransform.compose(downTransform);
  }

  // ── private helpers ────────────────────────────────────────────────────────

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
        throw new Error(
          `Cycle detected in the transform tree at frame "${current}".`,
        );
      }
      visited.add(current);
      chain.push(current);
      current = this.frames.get(current)?.parentId;
    }
    return chain;
  }
}

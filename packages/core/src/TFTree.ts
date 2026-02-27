import { createRequire } from "module";
import { Transform } from "./math/Transform.js";
import { Vec3 } from "./math/Vec3.js";
import { Quaternion } from "./math/Quaternion.js";
import {
  type FrameNode,
  type ITransformTree,
  type TFTreeJSON,
  type ChangeCallback,
} from "./types.js";
import { CycleDetectedError } from "./CycleDetectedError.js";

// ── Rust/WASM backend ──────────────────────────────────────────────────────────

/**
 * Shape of a `TfTreeWasm` instance produced by the Rust/wasm-bindgen layer.
 * Mirrors the public API declared in `packages/core/rust/src/lib.rs`.
 */
interface WasmTfTreeInstance {
  add_frame(
    id: string,
    parent_id: string | null | undefined,
    tx: number,
    ty: number,
    tz: number,
    rx: number,
    ry: number,
    rz: number,
    rw: number,
  ): void;
  /** Returns an Array of stale frame IDs (updated frame + its whole subtree). */
  update_frame(
    id: string,
    tx: number,
    ty: number,
    tz: number,
    rx: number,
    ry: number,
    rz: number,
    rw: number,
  ): string[];
  /** Batch variant – updates_json is a JSON array of {id,tx,ty,tz,rx,ry,rz,rw}. */
  update_frames_batch(updates_json: string): string[];
  remove_frame(id: string): void;
  /** Returns [tx, ty, tz, rx, ry, rz, rw]. */
  get_transform(from: string, to: string): Float64Array;
  has_frame(id: string): boolean;
  has_children(id: string): boolean;
  to_json(): string;
  free(): void;
}

interface WasmTfTreeConstructor {
  new (): WasmTfTreeInstance;
  from_json(json: string): WasmTfTreeInstance;
}

/**
 * Load the compiled WASM module synchronously.
 *
 * The generated --target nodejs package uses fs.readFileSync +
 * new WebAssembly.Module(bytes), which is synchronous, so this is safe to
 * call at module initialisation time without await.
 *
 * createRequire bridges Node.js ESM to the CJS package emitted by wasm-pack.
 */
function loadWasmBackend(): WasmTfTreeConstructor {
  const requireFn = createRequire(import.meta.url);
  const pkg = requireFn("./wasm/pkg/index.js") as {
    TfTreeWasm: WasmTfTreeConstructor;
  };
  return pkg.TfTreeWasm;
}

const WasmBackend: WasmTfTreeConstructor = loadWasmBackend();

// ── TFTree ────────────────────────────────────────────────────────────────────

/**
 * TFTree – a directed acyclic graph (tree) of named reference frames.
 *
 * Each frame stores how it relates to its **parent** frame via a
 * {@link Transform} (translation + rotation).  The tree can then resolve
 * the relative transform between **any** two frames at O(depth) cost.
 *
 * Internally the heavy math (world-transform caching and composition) is
 * delegated to a Rust/WebAssembly module compiled with glam.  The TypeScript
 * layer retains a frames Map for cycle detection and preserves insertion-order
 * for serialisation, ensuring full backward compatibility.
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
  /** Frame metadata kept in insertion order for frameIds() and toJSON(). */
  private readonly frames = new Map<string, FrameNode>();
  /**
   * Adjacency list – maintained in TypeScript so that removeFrame can check
   * for children without an extra Rust round-trip and so that the onChange
   * subscription list can be cleaned up efficiently.
   */
  private readonly childrenMap = new Map<string, Set<string>>();
  private readonly changeListeners = new Map<string, Set<ChangeCallback>>();

  /**
   * Rust/WASM backend – owns the world-transform cache, dirty tracking, and
   * all heavy quaternion math.  Created synchronously at construction time.
   */
  protected readonly wasmTree: WasmTfTreeInstance;

  constructor() {
    this.wasmTree = new WasmBackend();
  }

  // ── frame registration ─────────────────────────────────────────────────────

  /**
   * Register a new frame.
   *
   * @param id       Unique identifier for this frame.
   * @param parentId Id of the parent frame.  Omit (or pass undefined) for a
   *                 root frame.  There may be multiple root frames.
   * @param transform Transform expressing this frame relative to its parent.
   *                  Defaults to the identity transform.
   * @throws {Error} if id is already registered or parentId is not found.
   * @throws {CycleDetectedError} if adding this frame would introduce a cycle.
   */
  addFrame(id: string, parentId?: string, transform: Transform = Transform.identity()): void {
    if (this.frames.has(id)) {
      throw new Error(`Frame "${id}" is already registered.`);
    }
    if (parentId !== undefined && !this.frames.has(parentId)) {
      throw new Error(`Parent frame "${parentId}" not found. Register parents before children.`);
    }

    // Validate the parent chain is cycle-free using the TypeScript Map so that
    // tests which directly manipulate the internal Map are detected correctly.
    if (parentId !== undefined) {
      let current: string | undefined = parentId;
      while (current !== undefined) {
        if (current === id) {
          throw new CycleDetectedError(id);
        }
        current = this.frames.get(current)?.parentId;
      }
    }

    const node: FrameNode =
      parentId !== undefined ? { id, parentId, transform } : { id, transform };
    this.frames.set(id, node);

    if (!this.childrenMap.has(id)) {
      this.childrenMap.set(id, new Set());
    }
    if (parentId !== undefined) {
      this.childrenMap.get(parentId)!.add(id);
    }

    // Sync to the Rust backend.
    const { translation: t, rotation: r } = transform;
    this.wasmTree.add_frame(id, parentId ?? null, t.x, t.y, t.z, r.x, r.y, r.z, r.w);
  }

  /**
   * Update the transform of an existing frame.
   *
   * @throws {Error} if id is not registered.
   */
  updateTransform(id: string, transform: Transform): void {
    const frame = this.frames.get(id);
    if (frame === undefined) {
      throw new Error(`Frame "${id}" not found.`);
    }
    this.frames.set(id, { ...frame, transform });

    const { translation: t, rotation: r } = transform;
    const dirtyIds = this.wasmTree.update_frame(id, t.x, t.y, t.z, r.x, r.y, r.z, r.w) as string[];
    for (const dirtyId of dirtyIds) {
      this.fireChangeListeners(dirtyId);
    }
  }

  /**
   * Alias for {@link updateTransform} – satisfies the {@link ITransformTree} interface.
   *
   * @throws {Error} if id is not registered.
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
   * @throws {Error} if any id in updates is not registered.
   */
  updateTransforms(updates: Record<string, Transform>): void {
    // First pass: validate and update the TypeScript Map.
    for (const [id, transform] of Object.entries(updates)) {
      const frame = this.frames.get(id);
      if (frame === undefined) {
        throw new Error(`Frame "${id}" not found.`);
      }
      this.frames.set(id, { ...frame, transform });
    }

    // Build the batch payload for Rust (handles ancestor-deduplication).
    const payload = Object.entries(updates).map(([id, t]) => ({
      id,
      tx: t.translation.x,
      ty: t.translation.y,
      tz: t.translation.z,
      rx: t.rotation.x,
      ry: t.rotation.y,
      rz: t.rotation.z,
      rw: t.rotation.w,
    }));

    const dirtyIds = this.wasmTree.update_frames_batch(JSON.stringify(payload)) as string[];
    for (const dirtyId of dirtyIds) {
      this.fireChangeListeners(dirtyId);
    }
  }

  /**
   * Remove a registered frame from the tree.
   *
   * @param id Identifier of the frame to remove.
   * @throws {Error} if id is not registered.
   * @throws {Error} if the frame still has child frames registered.
   */
  removeFrame(id: string): void {
    if (!this.frames.has(id)) {
      throw new Error(`Frame "${id}" not found.`);
    }
    const children = this.childrenMap.get(id);
    if (children !== undefined && children.size > 0) {
      throw new Error(
        `Cannot remove frame "${id}": it still has child frames. Remove children first.`,
      );
    }

    const { parentId } = this.frames.get(id)!;
    this.frames.delete(id);
    this.childrenMap.delete(id);
    if (parentId !== undefined) {
      this.childrenMap.get(parentId)?.delete(id);
    }
    this.changeListeners.delete(id);

    this.wasmTree.remove_frame(id);
  }

  // ── query ──────────────────────────────────────────────────────────────────

  /** Returns true if the given frame id is registered. */
  hasFrame(id: string): boolean {
    return this.frames.has(id);
  }

  /** Returns all registered frame ids in insertion order. */
  frameIds(): string[] {
    return Array.from(this.frames.keys());
  }

  /**
   * Compute the transform that maps points expressed in from to the
   * coordinate system of to.
   *
   * In other words the returned transform T satisfies:
   *   p_to = T.transformPoint(p_from)
   *
   * @throws {Error} if either frame is not registered or if the frames are
   *                 not connected in the same tree.
   * @throws {CycleDetectedError} if a cycle is detected in the frame graph.
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

    // Walk each frame up to the root using the TypeScript Map.  This ensures
    // that cycles injected directly into the Map (e.g. in tests) are detected
    // here in TypeScript before the Rust layer is ever called.
    const fromChain = this.chainToRoot(from);
    const toChain = this.chainToRoot(to);

    // Find the lowest common ancestor (LCA).
    const toChainMap = new Map<string, number>(toChain.map((id, idx) => [id, idx]));

    let lcaId: string | undefined;
    for (let i = 0; i < fromChain.length; i++) {
      if (toChainMap.has(fromChain[i])) {
        lcaId = fromChain[i];
        break;
      }
    }

    if (lcaId === undefined) {
      throw new Error(`Frames "${from}" and "${to}" are not connected in the same tree.`);
    }

    // Delegate the actual world-transform computation to Rust (uses glam
    // SIMD math with an internal dirty-tracking cache for efficiency).
    const raw = this.wasmTree.get_transform(from, to);
    return new Transform(
      new Vec3(raw[0], raw[1], raw[2]),
      new Quaternion(raw[3], raw[4], raw[5], raw[6]),
    );
  }

  // ── event subscription ─────────────────────────────────────────────────────

  /**
   * Subscribe to world-transform changes for frameId.
   *
   * The callback is fired whenever the world transform of frameId changes —
   * either because frameId itself was updated via {@link updateTransform} /
   * {@link updateFrame}, or because any of its ancestor frames was updated.
   *
   * @returns An unsubscribe function that removes the listener when called.
   * @throws {Error} if frameId is not registered.
   */
  onChange(frameId: string, callback: ChangeCallback): () => void {
    if (!this.frames.has(frameId)) {
      throw new Error(`Frame "${frameId}" not found.`);
    }
    let listeners = this.changeListeners.get(frameId);
    if (listeners === undefined) {
      listeners = new Set();
      this.changeListeners.set(frameId, listeners);
    }
    listeners.add(callback);
    return () => {
      this.changeListeners.get(frameId)?.delete(callback);
    };
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
   * @throws {Error} if id is not registered.
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
   * Fire all change-listeners registered for frameId.
   */
  private fireChangeListeners(frameId: string): void {
    const listeners = this.changeListeners.get(frameId);
    if (listeners !== undefined) {
      for (const cb of listeners) {
        cb(frameId);
      }
    }
  }

  /**
   * Returns the ordered list of frame ids from id up to (and including)
   * the root frame, i.e. [id, parent, grandparent, ..., root].
   *
   * Uses the TypeScript frames Map so that cycles injected directly into
   * the Map are detected even when the Rust backend is out of sync.
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

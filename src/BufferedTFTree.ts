import { Transform } from "./math/Transform.js";
import { TFTree } from "./TFTree.js";
import { CycleDetectedError } from "./CycleDetectedError.js";
import type { TransformStamped, BufferedTFTreeOptions } from "./types.js";

// ── internal per-frame buffer ─────────────────────────────────────────────────

/**
 * A sorted circular buffer of {@link TransformStamped} entries for a single
 * frame edge.  Entries are kept sorted by timestamp in ascending order.
 * Entries older than `maxDuration` milliseconds are pruned automatically
 * after each insertion.
 */
class TransformBuffer {
  private readonly entries: TransformStamped[] = [];
  private readonly maxDuration: number;

  constructor(maxDuration: number) {
    this.maxDuration = maxDuration;
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * Insert a new time-stamped transform.  Maintains ascending timestamp order
   * and prunes entries that have aged out.
   */
  push(entry: TransformStamped): void {
    const idx = this.upperBound(entry.timestamp);
    this.entries.splice(idx, 0, entry);
    this.prune(entry.timestamp);
  }

  /**
   * Return the interpolated transform at the requested timestamp.
   *
   * - If `timestamp` is exactly at a stored entry, that transform is returned.
   * - If `timestamp` falls between two entries, the result is linearly
   *   interpolated (LERP for translation, SLERP for rotation).
   * - If `timestamp` is beyond the newest entry it is clamped to the newest.
   *
   * @throws {RangeError} if `timestamp` is before the oldest buffered entry
   *   (the data has been pruned and the query cannot be answered).
   * @throws {Error} if the buffer is empty.
   */
  interpolateAt(timestamp: number): Transform {
    if (this.entries.length === 0) {
      throw new Error("Transform buffer is empty.");
    }

    const oldest = this.entries[0].timestamp;
    if (timestamp < oldest) {
      throw new RangeError(
        `Requested timestamp ${timestamp} is before the oldest buffered entry ` +
          `(${oldest}). The data may have been pruned.`,
      );
    }

    // Clamp to the newest known entry (avoids extrapolation).
    const newest = this.entries[this.entries.length - 1].timestamp;
    if (timestamp >= newest) {
      return this.entries[this.entries.length - 1].transform;
    }

    // Find the first entry whose timestamp is >= the requested timestamp.
    const hi = this.lowerBound(timestamp);
    if (this.entries[hi].timestamp === timestamp) {
      return this.entries[hi].transform;
    }

    // Interpolate between entries[hi-1] and entries[hi].
    const lo = hi - 1;
    const a = this.entries[lo];
    const b = this.entries[hi];
    const t = (timestamp - a.timestamp) / (b.timestamp - a.timestamp);

    return new Transform(
      a.transform.translation.lerp(b.transform.translation, t),
      a.transform.rotation.slerp(b.transform.rotation, t),
    );
  }

  // ── private ───────────────────────────────────────────────────────────────

  /** Index of the first entry whose timestamp is strictly greater than `ts`. */
  private upperBound(ts: number): number {
    let lo = 0,
      hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.entries[mid].timestamp <= ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Index of the first entry whose timestamp is >= `ts`. */
  private lowerBound(ts: number): number {
    let lo = 0,
      hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.entries[mid].timestamp < ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Remove all entries strictly older than `latestTimestamp − maxDuration`. */
  private prune(latestTimestamp: number): void {
    const cutoff = latestTimestamp - this.maxDuration;
    let i = 0;
    while (i < this.entries.length && this.entries[i].timestamp < cutoff) {
      i++;
    }
    if (i > 0) this.entries.splice(0, i);
  }
}

// ── BufferedTFTree ────────────────────────────────────────────────────────────

/**
 * An extension of {@link TFTree} that maintains a **time-stamped history** of
 * transforms for each frame, inspired by ROS tf2.
 *
 * Instead of replacing the current transform on every update, each call to
 * {@link setTransform} appends a `(timestamp, transform)` pair to a
 * per-frame ring buffer.  The tree can then answer the question "where was
 * frame X relative to frame Y at time T?" via {@link getTransformAt}.
 *
 * Frames that never receive a time-stamped update fall back to the static
 * transform supplied at registration ({@link TFTree.addFrame}), making it safe
 * to mix static and dynamic frames in the same tree.
 *
 * @example
 * ```ts
 * const tf = new BufferedTFTree({ maxBufferDuration: 5_000 }); // 5-second window
 * tf.addFrame("world");
 * tf.addFrame("camera", "world");
 *
 * const now = Date.now();
 * tf.setTransform("camera", new Transform(new Vec3(0, 0, 1)), now - 100);
 * tf.setTransform("camera", new Transform(new Vec3(0, 0, 2)), now);
 *
 * // Where was the camera 50 ms ago?
 * const past = tf.getTransformAt("world", "camera", now - 50);
 * ```
 */
export class BufferedTFTree extends TFTree {
  private readonly buffers = new Map<string, TransformBuffer>();
  private readonly maxBufferDuration: number;

  constructor(options?: BufferedTFTreeOptions) {
    super();
    this.maxBufferDuration = options?.maxBufferDuration ?? 10_000;
  }

  // ── time-stamped API ──────────────────────────────────────────────────────

  /**
   * Record a time-stamped transform for an existing frame.
   *
   * The base-class current transform is also updated to the new value so that
   * {@link TFTree.getTransform} (the non-temporal API) continues to reflect the
   * most recently provided transform.
   *
   * @param id        Identifier of the frame to update.
   * @param transform New transform of this frame relative to its parent.
   * @param timestamp Timestamp in milliseconds (e.g. `Date.now()`).
   *
   * @throws {Error} if `id` is not registered.
   */
  setTransform(id: string, transform: Transform, timestamp: number): void {
    if (!this.hasFrame(id)) {
      throw new Error(`Frame "${id}" not found.`);
    }

    // Keep the base-class current transform in sync so the non-temporal API
    // remains usable.
    this.updateFrame(id, transform);

    // Append to (or create) the per-frame time-stamped buffer.
    let buffer = this.buffers.get(id);
    if (buffer === undefined) {
      buffer = new TransformBuffer(this.maxBufferDuration);
      this.buffers.set(id, buffer);
    }
    buffer.push({ timestamp, transform });
  }

  /**
   * Compute the transform that maps points expressed in `from` to the
   * coordinate system of `to` **at the specified timestamp**.
   *
   * For frames with a time-stamped history the local transform at `timestamp`
   * is obtained via linear interpolation (LERP for translation, SLERP for
   * rotation).  For frames that have never received a time-stamped update the
   * static transform registered at {@link TFTree.addFrame} is used, allowing
   * static and dynamic frames to coexist in the same tree.
   *
   * @param from      Source frame id.
   * @param to        Target frame id.
   * @param timestamp Query time in milliseconds.
   *
   * @throws {Error}      if either frame is not registered or the frames are
   *                      not connected in the same tree.
   * @throws {RangeError} if `timestamp` is older than the oldest buffered
   *                      entry for any frame along the path (data pruned).
   */
  getTransformAt(from: string, to: string, timestamp: number): Transform {
    if (!this.hasFrame(from)) {
      throw new Error(`Frame "${from}" not found.`);
    }
    if (!this.hasFrame(to)) {
      throw new Error(`Frame "${to}" not found.`);
    }
    if (from === to) {
      return Transform.identity();
    }

    return this.worldTransformAt(from, timestamp)
      .invert()
      .compose(this.worldTransformAt(to, timestamp));
  }

  // ── override to clean up per-frame buffer ─────────────────────────────────

  override removeFrame(id: string): void {
    super.removeFrame(id);
    this.buffers.delete(id);
  }

  // ── private helpers ───────────────────────────────────────────────────────

  /**
   * Recursively compute the world transform (accumulated from the subtree root
   * down to `id`) at the given timestamp.
   */
  private worldTransformAt(id: string, timestamp: number, visiting = new Set<string>()): Transform {
    if (visiting.has(id)) {
      throw new CycleDetectedError(id);
    }
    visiting.add(id);

    const frame = this.getFrameNode(id);
    const local = this.localTransformAt(id, timestamp);

    if (frame.parentId === undefined) {
      return local;
    }
    return this.worldTransformAt(frame.parentId, timestamp, visiting).compose(local);
  }

  /**
   * Return the local (relative to parent) transform for `id` at `timestamp`.
   * Falls back to the static transform if no time-stamped history exists.
   */
  private localTransformAt(id: string, timestamp: number): Transform {
    const buffer = this.buffers.get(id);
    if (buffer === undefined || buffer.size === 0) {
      return this.getFrameNode(id).transform;
    }
    return buffer.interpolateAt(timestamp);
  }
}

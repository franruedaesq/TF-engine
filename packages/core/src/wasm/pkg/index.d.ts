/* tslint:disable */
/* eslint-disable */

/**
 * High-performance transform tree backed by [`glam`] math.
 *
 * Intended to be used from TypeScript as an internal implementation detail
 * of `TFTree`.  All public methods are callable via wasm-bindgen.
 */
export class TfTreeWasm {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Register a new frame.
     *
     * Returns `Err` (thrown as JS exception) if `id` is already registered,
     * `parent_id` is not found, or adding the frame would create a cycle.
     */
    add_frame(id: string, parent_id: string | null | undefined, tx: number, ty: number, tz: number, rx: number, ry: number, rz: number, rw: number): void;
    /**
     * Reconstruct a `TfTreeWasm` from a JSON string produced by `to_json`.
     *
     * Frames must be listed parent-before-child (guaranteed by the TypeScript
     * `TFTree.toJSON` implementation).
     */
    static from_json(json: string): TfTreeWasm;
    /**
     * Compute the transform that maps points in `from` to the coordinate
     * system of `to`, i.e. `p_to = T.transformPoint(p_from)`.
     *
     * Returns a `Float64Array` `[tx, ty, tz, rx, ry, rz, rw]`.
     *
     * Returns `Err` if either frame is not registered, the frames are
     * disconnected, or a cycle is detected.
     */
    get_transform(from: string, to: string): Float64Array;
    /**
     * Returns a `Float64Array` `[tx, ty, tz, rx, ry, rz, rw]` representing
     * the accumulated world transform for `id` (from the subtree root down).
     */
    get_world_transform(id: string): Float64Array;
    /**
     * Returns `true` if the frame has at least one registered child.
     */
    has_children(id: string): boolean;
    /**
     * Returns `true` if `id` is registered.
     */
    has_frame(id: string): boolean;
    constructor();
    /**
     * Remove a registered frame.
     *
     * Returns `Err` if `id` is not registered or if the frame still has
     * child frames.
     */
    remove_frame(id: string): void;
    /**
     * Serialize the tree to a JSON string that matches the `TFTreeJSON`
     * TypeScript type.  Frames are emitted in an arbitrary order (the
     * TypeScript layer maintains insertion-order via its own Map).
     */
    to_json(): string;
    /**
     * Update the local transform of an existing frame.
     *
     * Returns a JS `Array<string>` containing the IDs of every frame whose
     * world transform is now stale (the updated frame and all its descendants).
     * The caller is responsible for firing change-listeners for these IDs.
     */
    update_frame(id: string, tx: number, ty: number, tz: number, rx: number, ry: number, rz: number, rw: number): Array<any>;
    /**
     * Batch-update multiple frames at once.
     *
     * `updates_json` must be a JSON array of
     * `{ id, tx, ty, tz, rx, ry, rz, rw }` objects.
     *
     * Returns a JS `Array<string>` of all stale frame IDs (the union of every
     * affected subtree, with ancestor-deduplication applied so that subtrees
     * are not enumerated redundantly).
     */
    update_frames_batch(updates_json: string): Array<any>;
}

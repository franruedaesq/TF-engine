/**
 * Tests for useTFFrame.
 *
 * Because `useSyncExternalStore` is a React-runtime hook, we test the
 * underlying subscription/snapshot contract by directly exercising the
 * arguments that useTFFrame passes to it.  We do this by monkey-patching
 * `react`'s `useSyncExternalStore` with a minimal shim that invokes
 * subscribe/getSnapshot the same way React would on an initial render.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TFTree, Transform, Vec3, Quaternion } from "@tf-engine/core";

// ── minimal useSyncExternalStore shim ────────────────────────────────────────
// Replace the real hook with a shim that calls subscribe() once to validate
// the subscription contract and then returns getSnapshot().

vi.mock("react", () => ({
  useSyncExternalStore: (
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    // Validate that subscribe returns an unsubscribe function.
    const unsub = subscribe(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
    return getSnapshot();
  },
}));

import { useTFFrame } from "../src/index.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTree() {
  const tf = new TFTree();
  tf.addFrame("world");
  tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));
  tf.addFrame("camera", "robot", new Transform(new Vec3(0, 0, 0.5)));
  return tf;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("useTFFrame", () => {
  let tf: TFTree;

  beforeEach(() => {
    tf = makeTree();
  });

  it("returns null when the frame is not registered", () => {
    const result = useTFFrame(tf, "unknown");
    expect(result).toBeNull();
  });

  it("returns identity when from === frameId", () => {
    const result = useTFFrame(tf, "robot", "robot");
    expect(result).not.toBeNull();
    expect(result!.equals(Transform.identity())).toBe(true);
  });

  it("returns the transform between from and frameId", () => {
    const result = useTFFrame(tf, "robot", "world");
    expect(result).not.toBeNull();
    expect(result!.translation.x).toBeCloseTo(1);
    expect(result!.translation.y).toBeCloseTo(0);
    expect(result!.translation.z).toBeCloseTo(0);
  });

  it("returns null when getTransform would throw (disconnected frames)", () => {
    tf.addFrame("orphan");
    const result = useTFFrame(tf, "orphan", "world");
    expect(result).toBeNull();
  });

  it("returns the default snapshot when from defaults to frameId", () => {
    // When `from` is omitted, defaults to frameId — same frame → identity
    const result = useTFFrame(tf, "camera");
    expect(result).not.toBeNull();
    expect(result!.equals(Transform.identity())).toBe(true);
  });

  it("reflects a deeper transform (camera relative to world)", () => {
    const result = useTFFrame(tf, "camera", "world");
    expect(result).not.toBeNull();
    // robot is 1,0,0 from world; camera is 0,0,0.5 from robot
    expect(result!.translation.x).toBeCloseTo(1);
    expect(result!.translation.z).toBeCloseTo(0.5);
  });

  it("subscribe registers and deregisters a listener on the tree", () => {
    const onChangeSpy = vi.spyOn(tf, "onChange");
    useTFFrame(tf, "robot", "world");
    expect(onChangeSpy).toHaveBeenCalledWith("robot", expect.any(Function));
  });

  it("subscribe returns a no-op when frame is not registered", () => {
    // The shim calls subscribe and expects typeof return === 'function'
    // This should not throw even when the frame doesn't exist yet.
    expect(() => useTFFrame(tf, "missing_frame", "world")).not.toThrow();
  });

  it("rotation is preserved in the returned transform", () => {
    const q = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    tf.addFrame("rotated", "world", new Transform(Vec3.zero(), q));
    const result = useTFFrame(tf, "rotated", "world");
    expect(result).not.toBeNull();
    expect(result!.rotation.equals(q)).toBe(true);
  });
});

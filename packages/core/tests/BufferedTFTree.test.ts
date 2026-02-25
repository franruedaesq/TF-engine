import { describe, it, expect, beforeEach } from "vitest";
import { BufferedTFTree } from "../src/BufferedTFTree.js";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";
import { Quaternion } from "../src/math/Quaternion.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function translate(x: number, y: number, z: number): Transform {
  return new Transform(new Vec3(x, y, z));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("BufferedTFTree", () => {
  let tf: BufferedTFTree;
  const T0 = 1_000; // base timestamp (ms)

  beforeEach(() => {
    tf = new BufferedTFTree();
  });

  // ── basic inheritance ────────────────────────────────────────────────────────

  it("inherits addFrame / hasFrame / frameIds from TFTree", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    expect(tf.hasFrame("world")).toBe(true);
    expect(tf.hasFrame("robot")).toBe(true);
    expect(tf.frameIds()).toHaveLength(2);
  });

  it("getTransform() (non-temporal) still works after setTransform", () => {
    tf.addFrame("world");
    tf.addFrame("camera", "world");
    tf.setTransform("camera", translate(3, 0, 0), T0);
    // Base-class getTransform should reflect the latest update.
    const t = tf.getTransform("world", "camera");
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(3, 0, 0))).toBe(true);
  });

  // ── getTransformAt – same frame ──────────────────────────────────────────────

  it("getTransformAt() of the same frame is identity", () => {
    tf.addFrame("world");
    expect(tf.getTransformAt("world", "world", T0).equals(Transform.identity())).toBe(true);
  });

  // ── getTransformAt – single entry ────────────────────────────────────────────

  it("getTransformAt() returns the single stored entry exactly", () => {
    tf.addFrame("world");
    tf.addFrame("camera", "world");
    tf.setTransform("camera", translate(5, 0, 0), T0);
    const t = tf.getTransformAt("world", "camera", T0);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(5, 0, 0))).toBe(true);
  });

  // ── getTransformAt – interpolation ───────────────────────────────────────────

  it("interpolates translation linearly between two entries", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.setTransform("robot", translate(0, 0, 0), T0);
    tf.setTransform("robot", translate(10, 0, 0), T0 + 100);

    // At the midpoint (T0+50) the robot should be at x=5.
    const t = tf.getTransformAt("world", "robot", T0 + 50);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(5, 0, 0))).toBe(true);
  });

  it("returns the exact transform at entry boundaries", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.setTransform("robot", translate(0, 0, 0), T0);
    tf.setTransform("robot", translate(10, 0, 0), T0 + 100);

    const atStart = tf.getTransformAt("world", "robot", T0);
    expect(atStart.transformPoint(Vec3.zero()).equals(new Vec3(0, 0, 0))).toBe(true);

    const atEnd = tf.getTransformAt("world", "robot", T0 + 100);
    expect(atEnd.transformPoint(Vec3.zero()).equals(new Vec3(10, 0, 0))).toBe(true);
  });

  it("clamps to the newest entry when timestamp is beyond the buffer", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.setTransform("robot", translate(0, 0, 0), T0);
    tf.setTransform("robot", translate(10, 0, 0), T0 + 100);

    // T0+200 is beyond the buffer; should return the newest (x=10).
    const t = tf.getTransformAt("world", "robot", T0 + 200);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(10, 0, 0))).toBe(true);
  });

  // ── getTransformAt – rotation interpolation ───────────────────────────────────

  it("interpolates rotation via SLERP", () => {
    tf.addFrame("world");
    tf.addFrame("turret", "world");
    const q0 = Quaternion.identity();
    const q90 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    tf.setTransform("turret", new Transform(Vec3.zero(), q0), T0);
    tf.setTransform("turret", new Transform(Vec3.zero(), q90), T0 + 100);

    // At T0+50 the turret should be at ~45° around Z.
    const t = tf.getTransformAt("world", "turret", T0 + 50);
    const p = t.transformPoint(new Vec3(1, 0, 0));
    // ~45° rotation: x≈cos45, y≈sin45
    expect(p.x).toBeCloseTo(Math.cos(Math.PI / 4), 4);
    expect(p.y).toBeCloseTo(Math.sin(Math.PI / 4), 4);
    expect(p.z).toBeCloseTo(0, 4);
  });

  // ── getTransformAt – static frame fallback ────────────────────────────────────

  it("falls back to the static transform for frames with no history", () => {
    tf.addFrame("world");
    tf.addFrame("sensor", "world", translate(7, 0, 0));
    // No setTransform call – should use the addFrame transform.
    const t = tf.getTransformAt("world", "sensor", T0);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(7, 0, 0))).toBe(true);
  });

  // ── getTransformAt – mixed static and dynamic ─────────────────────────────────

  it("composes a dynamic frame with a static parent correctly", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(10, 0, 0)); // static parent
    tf.addFrame("camera", "robot");
    tf.setTransform("camera", translate(0, 0, 0), T0);
    tf.setTransform("camera", translate(0, 0, 4), T0 + 100);

    // At T0+50: camera is at z=2 in robot frame → (10, 0, 2) in world.
    const t = tf.getTransformAt("world", "camera", T0 + 50);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(10, 0, 2))).toBe(true);
  });

  // ── getTransformAt – error handling ──────────────────────────────────────────

  it("throws for unknown 'from' frame", () => {
    tf.addFrame("world");
    expect(() => tf.getTransformAt("ghost", "world", T0)).toThrow(/not found/);
  });

  it("throws for unknown 'to' frame", () => {
    tf.addFrame("world");
    expect(() => tf.getTransformAt("world", "ghost", T0)).toThrow(/not found/);
  });

  it("throws RangeError when timestamp is before the oldest buffered entry", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.setTransform("robot", translate(1, 0, 0), T0);
    expect(() => tf.getTransformAt("world", "robot", T0 - 1)).toThrow(RangeError);
  });

  // ── setTransform – error handling ─────────────────────────────────────────────

  it("setTransform() throws for an unknown frame", () => {
    expect(() => tf.setTransform("ghost", Transform.identity(), T0)).toThrow(/not found/);
  });

  // ── buffer pruning ─────────────────────────────────────────────────────────────

  it("prunes entries older than maxBufferDuration", () => {
    const tf2 = new BufferedTFTree({ maxBufferDuration: 100 });
    tf2.addFrame("world");
    tf2.addFrame("robot", "world");

    // Add entries spanning 200 ms – the first two (T0 and T0+50) should be pruned.
    tf2.setTransform("robot", translate(0, 0, 0), T0);
    tf2.setTransform("robot", translate(1, 0, 0), T0 + 50);
    tf2.setTransform("robot", translate(2, 0, 0), T0 + 100);
    tf2.setTransform("robot", translate(3, 0, 0), T0 + 200);
    // After the last insert, entries with timestamp < T0+200-100=T0+100 are pruned.
    // So T0 and T0+50 are gone; T0+100 and T0+200 remain.
    expect(() => tf2.getTransformAt("world", "robot", T0)).toThrow(RangeError);
    expect(() => tf2.getTransformAt("world", "robot", T0 + 50)).toThrow(RangeError);
    // T0+100 is still available.
    const t = tf2.getTransformAt("world", "robot", T0 + 100);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(2, 0, 0))).toBe(true);
  });

  // ── removeFrame ───────────────────────────────────────────────────────────────

  it("removeFrame() also clears the frame buffer", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.setTransform("robot", translate(1, 0, 0), T0);
    tf.removeFrame("robot");
    expect(tf.hasFrame("robot")).toBe(false);
    // Re-registering should start with a clean buffer.
    tf.addFrame("robot", "world", translate(2, 0, 0));
    // No buffer entries after re-registration, so falls back to static transform.
    const t = tf.getTransformAt("world", "robot", T0);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(2, 0, 0))).toBe(true);
  });

  // ── multi-hop path ────────────────────────────────────────────────────────────

  it("resolves a multi-hop path using historical transforms at each edge", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.addFrame("camera", "robot");

    tf.setTransform("robot", translate(0, 0, 0), T0);
    tf.setTransform("robot", translate(10, 0, 0), T0 + 100);

    tf.setTransform("camera", translate(0, 0, 0), T0);
    tf.setTransform("camera", translate(0, 0, 2), T0 + 100);

    // At T0+50: robot at x=5, camera at z=1 → world position (5,0,1).
    const t = tf.getTransformAt("world", "camera", T0 + 50);
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(5, 0, 1))).toBe(true);
  });
});

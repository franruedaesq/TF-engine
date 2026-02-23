import { describe, it, expect, beforeEach } from "vitest";
import { TFTree } from "../src/TFTree.js";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";
import { Quaternion } from "../src/math/Quaternion.js";

// ── helpers ─────────────────────────────────────────────────────────────────

function translate(x: number, y: number, z: number): Transform {
  return new Transform(new Vec3(x, y, z));
}

function rotate90Z(): Transform {
  return new Transform(
    Vec3.zero(),
    Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2),
  );
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("TFTree", () => {
  let tf: TFTree;

  beforeEach(() => {
    tf = new TFTree();
  });

  // ── registration ────────────────────────────────────────────────────────────

  it("registers root frame without a parent", () => {
    tf.addFrame("world");
    expect(tf.hasFrame("world")).toBe(true);
  });

  it("registers child frame with a parent", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    expect(tf.hasFrame("robot")).toBe(true);
  });

  it("throws when registering a duplicate frame id", () => {
    tf.addFrame("world");
    expect(() => tf.addFrame("world")).toThrow(/already registered/);
  });

  it("throws when parent does not exist", () => {
    expect(() => tf.addFrame("robot", "world")).toThrow(/not found/);
  });

  it("frameIds() returns all registered ids", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    const ids = tf.frameIds();
    expect(ids).toContain("world");
    expect(ids).toContain("robot");
    expect(ids).toHaveLength(2);
  });

  it("hasFrame() returns false for unknown frame", () => {
    expect(tf.hasFrame("ghost")).toBe(false);
  });

  // ── updateTransform ──────────────────────────────────────────────────────────

  it("updateTransform() changes the stored transform", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    tf.updateTransform("robot", translate(5, 0, 0));
    const result = tf.getTransform("world", "robot");
    expect(result.transformPoint(Vec3.zero()).equals(new Vec3(5, 0, 0))).toBe(true);
  });

  it("updateTransform() throws for unknown frame", () => {
    expect(() => tf.updateTransform("ghost", Transform.identity())).toThrow(/not found/);
  });

  // ── updateFrame ──────────────────────────────────────────────────────────────

  it("updateFrame() changes the stored transform", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    tf.updateFrame("robot", translate(3, 0, 0));
    const result = tf.getTransform("world", "robot");
    expect(result.transformPoint(Vec3.zero()).equals(new Vec3(3, 0, 0))).toBe(true);
  });

  it("updateFrame() throws for unknown frame", () => {
    expect(() => tf.updateFrame("ghost", Transform.identity())).toThrow(/not found/);
  });

  // ── getTransform – same frame ────────────────────────────────────────────────

  it("getTransform() of the same frame is identity", () => {
    tf.addFrame("world");
    const t = tf.getTransform("world", "world");
    expect(t.equals(Transform.identity())).toBe(true);
  });

  // ── getTransform – parent → child ────────────────────────────────────────────

  it("getTransform('world','robot') gives robot's local transform", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(2, 0, 0));
    const t = tf.getTransform("world", "robot");
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(2, 0, 0))).toBe(true);
  });

  it("getTransform parent→grandchild chains translations", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    tf.addFrame("camera", "robot", translate(0, 0, 1));
    const t = tf.getTransform("world", "camera");
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(1, 0, 1))).toBe(true);
  });

  // ── getTransform – child → parent (inverse) ──────────────────────────────────

  it("getTransform('robot','world') is the inverse", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(3, 0, 0));
    const t = tf.getTransform("robot", "world");
    // A point at (3,0,0) in robot space maps to (0,0,0) in world space
    expect(t.transformPoint(new Vec3(3, 0, 0)).equals(Vec3.zero())).toBe(true);
  });

  it("getTransform child→grandparent is the full inverse chain", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    tf.addFrame("camera", "robot", translate(0, 0, 1));
    const t = tf.getTransform("camera", "world");
    // (1, 0, 1) in world space should map from (0,0,0) in camera space
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(-1, 0, -1))).toBe(true);
  });

  // ── getTransform – cross-branch (sibling) ─────────────────────────────────────

  it("getTransform between siblings travels via their common parent", () => {
    tf.addFrame("world");
    tf.addFrame("arm", "world", translate(1, 0, 0));
    tf.addFrame("leg", "world", translate(0, 1, 0));
    // getTransform("arm","leg") converts a point from leg-local to arm-local.
    // leg origin (0,0,0) in world is (0,1,0); in arm-local that is (0-1, 1-0, 0) = (-1,1,0).
    const t = tf.getTransform("arm", "leg");
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(-1, 1, 0))).toBe(true);
  });

  it("getTransform across a rotation", () => {
    tf.addFrame("world");
    tf.addFrame("rotated", "world", rotate90Z());
    // getTransform("world","rotated") converts a point from rotated-local to world.
    // (1,0,0) in rotated-local, rotated by 90° around Z, gives (0,1,0) in world.
    const t = tf.getTransform("world", "rotated");
    expect(t.transformPoint(new Vec3(1, 0, 0)).equals(new Vec3(0, 1, 0))).toBe(true);
  });

  // ── getTransform – combined rotation + translation ────────────────────────────

  it("robot drives forward (X) then neck rotates 45° around Z", () => {
    const neckTranslation = new Transform(new Vec3(0.5, 0, 0.8)); // neck offset on robot
    const cameraRotation = new Transform(
      Vec3.zero(),
      Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 4),
    );

    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(2, 0, 0));
    tf.addFrame("neck", "robot", neckTranslation);
    tf.addFrame("camera", "neck", cameraRotation);

    const camInWorld = tf.getTransform("world", "camera");
    // camera origin in camera space is (0,0,0) → should map to world position of camera
    const camOrigin = camInWorld.transformPoint(Vec3.zero());
    // robot at (2,0,0), neck at (2+0.5, 0, 0.8) = (2.5, 0, 0.8)
    // camera is at neck origin (rotation doesn't translate)
    expect(camOrigin.equals(new Vec3(2.5, 0, 0.8))).toBe(true);
  });

  // ── error handling ───────────────────────────────────────────────────────────

  it("getTransform throws for unknown 'from' frame", () => {
    tf.addFrame("world");
    expect(() => tf.getTransform("ghost", "world")).toThrow(/not found/);
  });

  it("getTransform throws for unknown 'to' frame", () => {
    tf.addFrame("world");
    expect(() => tf.getTransform("world", "ghost")).toThrow(/not found/);
  });

  it("getTransform throws for disconnected frames", () => {
    tf.addFrame("world");
    tf.addFrame("island");
    expect(() => tf.getTransform("world", "island")).toThrow(/not connected/);
  });

  it("chainToRoot() detects a cycle via internal frame map manipulation", () => {
    // Force a cycle by bypassing addFrame validation (direct map access via any cast)
    tf.addFrame("world");
    tf.addFrame("child", "world");
    // Introduce cycle: child → world → child
    (tf as unknown as { frames: Map<string, { id: string; parentId: string | undefined; transform: Transform }> })
      .frames.set("world", { id: "world", parentId: "child", transform: Transform.identity() });
    expect(() => tf.getTransform("world", "child")).toThrow(/Cycle detected/);
  });
});

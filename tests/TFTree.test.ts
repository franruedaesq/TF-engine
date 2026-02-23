import { describe, it, expect, beforeEach } from "vitest";
import { TFTree } from "../src/TFTree.js";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";
import { Quaternion } from "../src/math/Quaternion.js";
import { CycleDetectedError } from "../src/CycleDetectedError.js";

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

  // ── LCA – non-root common ancestor ───────────────────────────────────────────

  it("LCA is mid-level node, not root: cousins share a subtree ancestor", () => {
    // world → robot → armBase → leftArm
    //                          → rightArm
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(10, 0, 0));
    tf.addFrame("armBase", "robot", translate(0, 0, 1));
    tf.addFrame("leftArm", "armBase", translate(0, 1, 0));
    tf.addFrame("rightArm", "armBase", translate(0, -1, 0));

    // getTransform("leftArm","rightArm") expresses rightArm origin in leftArm coords.
    // armBase origin in leftArm-local = (0,-1,0) (leftArm is +1 on Y from armBase).
    // rightArm origin in armBase = (0,-1,0).
    // rightArm origin in leftArm = (0,-1,0) - (0,1,0) = (0,-2,0).
    const t = tf.getTransform("leftArm", "rightArm");
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(0, -2, 0))).toBe(true);
  });

  it("LCA is root when frames are in separate subtrees at depth > 1", () => {
    // world → branchA → leafA
    //       → branchB → leafB
    tf.addFrame("world");
    tf.addFrame("branchA", "world", translate(5, 0, 0));
    tf.addFrame("leafA", "branchA", translate(0, 2, 0));
    tf.addFrame("branchB", "world", translate(0, 5, 0));
    tf.addFrame("leafB", "branchB", translate(0, 0, 3));

    // getTransform("leafA","leafB") expresses leafB origin in leafA coords.
    // leafB world position: (0+0, 5+0, 0+3) = (0, 5, 3).
    // leafA world position: (5+0, 0+2, 0+0) = (5, 2, 0).
    // leafB in leafA coords: (0-5, 5-2, 3-0) = (-5, 3, 3).
    const t = tf.getTransform("leafA", "leafB");
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(-5, 3, 3))).toBe(true);
  });

  it("LCA traversal: up path uses inverted transforms, down path uses forward transforms", () => {
    // Verify the direction rule: going UP inverts, going DOWN uses the stored transform.
    // world → parent → child
    // getTransform("child","parent") should be inv(child.transform), going up one step.
    tf.addFrame("world");
    tf.addFrame("parent", "world", translate(1, 2, 3));
    tf.addFrame("child", "parent", translate(4, 5, 6));

    // child→parent: up one step → uses inv(child.transform)
    // = translate(-4,-5,-6)
    // A point at (4,5,6) in child-local should map to (0,0,0) in parent-local.
    const upT = tf.getTransform("child", "parent");
    expect(upT.transformPoint(new Vec3(4, 5, 6)).equals(Vec3.zero())).toBe(true);

    // parent→child: down one step → uses child.transform = translate(4,5,6)
    // The child origin (0,0,0 in child-local) expressed in parent-local is (4,5,6),
    // since child is offset +4,+5,+6 from parent.
    const downT = tf.getTransform("parent", "child");
    expect(downT.transformPoint(Vec3.zero()).equals(new Vec3(4, 5, 6))).toBe(true);
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

  // ── removeFrame ──────────────────────────────────────────────────────────────

  it("removeFrame() removes a leaf frame", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.removeFrame("robot");
    expect(tf.hasFrame("robot")).toBe(false);
  });

  it("removeFrame() removes a root frame when it has no children", () => {
    tf.addFrame("island");
    tf.removeFrame("island");
    expect(tf.hasFrame("island")).toBe(false);
    expect(tf.frameIds()).toHaveLength(0);
  });

  it("removeFrame() throws for an unknown frame", () => {
    expect(() => tf.removeFrame("ghost")).toThrow(/not found/);
  });

  it("removeFrame() throws when the frame still has children", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    expect(() => tf.removeFrame("world")).toThrow(/child frames/);
  });

  it("removeFrame() allows re-registering a frame after deletion", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.removeFrame("robot");
    expect(() => tf.addFrame("robot", "world", translate(5, 0, 0))).not.toThrow();
    expect(tf.hasFrame("robot")).toBe(true);
  });

  it("removeFrame() updates frameIds()", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.removeFrame("robot");
    expect(tf.frameIds()).toEqual(["world"]);
  });

  it("getTransform() throws after a frame has been removed", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.removeFrame("robot");
    expect(() => tf.getTransform("world", "robot")).toThrow(/not found/);
  });

  // ── caching & dirty flags ────────────────────────────────────────────────────

  it("getTransform() returns consistent results on repeated calls (cache correctness)", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(2, 0, 0));
    tf.addFrame("camera", "robot", translate(0, 0, 1));

    const t1 = tf.getTransform("world", "camera");
    const t2 = tf.getTransform("world", "camera");

    expect(t1.equals(t2)).toBe(true);
    expect(t1.transformPoint(Vec3.zero()).equals(new Vec3(2, 0, 1))).toBe(true);
  });

  it("updateTransform() invalidates cached world transform of descendants", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    tf.addFrame("camera", "robot", translate(0, 0, 1));

    // Warm the cache.
    expect(tf.getTransform("world", "camera").transformPoint(Vec3.zero()).equals(new Vec3(1, 0, 1))).toBe(true);

    // Move the robot – camera should follow.
    tf.updateTransform("robot", translate(5, 0, 0));

    expect(tf.getTransform("world", "camera").transformPoint(Vec3.zero()).equals(new Vec3(5, 0, 1))).toBe(true);
  });

  it("updateTransform() only dirties the updated subtree, not unrelated frames", () => {
    tf.addFrame("world");
    tf.addFrame("arm", "world", translate(1, 0, 0));
    tf.addFrame("leg", "world", translate(0, 1, 0));

    // Warm the cache for both branches.
    expect(tf.getTransform("world", "arm").transformPoint(Vec3.zero()).equals(new Vec3(1, 0, 0))).toBe(true);
    expect(tf.getTransform("world", "leg").transformPoint(Vec3.zero()).equals(new Vec3(0, 1, 0))).toBe(true);

    // Update only arm.
    tf.updateTransform("arm", translate(3, 0, 0));

    // arm is updated; leg is unchanged.
    expect(tf.getTransform("world", "arm").transformPoint(Vec3.zero()).equals(new Vec3(3, 0, 0))).toBe(true);
    expect(tf.getTransform("world", "leg").transformPoint(Vec3.zero()).equals(new Vec3(0, 1, 0))).toBe(true);
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

  // ── CycleDetectedError ──────────────────────────────────────────────────────

  it("getTransform() throws CycleDetectedError instance on cycle", () => {
    tf.addFrame("world");
    tf.addFrame("child", "world");
    (tf as unknown as { frames: Map<string, { id: string; parentId: string | undefined; transform: Transform }> })
      .frames.set("world", { id: "world", parentId: "child", transform: Transform.identity() });
    expect(() => tf.getTransform("world", "child")).toThrowError(CycleDetectedError);
  });

  it("CycleDetectedError has the correct name", () => {
    const err = new CycleDetectedError("someFrame");
    expect(err.name).toBe("CycleDetectedError");
    expect(err.message).toMatch(/someFrame/);
  });

  // ── toJSON / fromJSON ────────────────────────────────────────────────────────

  it("toJSON() produces a plain object with all registered frames", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 2, 3));
    const json = tf.toJSON();
    expect(json.frames).toHaveLength(2);
    expect(json.frames[0].id).toBe("world");
    expect(json.frames[0].parentId).toBeNull();
    expect(json.frames[1].id).toBe("robot");
    expect(json.frames[1].parentId).toBe("world");
    expect(json.frames[1].transform.translation).toEqual([1, 2, 3]);
  });

  it("toJSON() serializes rotation correctly", () => {
    tf.addFrame("world");
    tf.addFrame("rotated", "world", rotate90Z());
    const json = tf.toJSON();
    const q = json.frames[1].transform.rotation;
    expect(q).toHaveLength(4);
    // Rotation quaternion for 90° around Z: x≈0, y≈0, z≈0.707, w≈0.707
    expect(Math.abs(q[2])).toBeCloseTo(Math.SQRT2 / 2, 5);
    expect(Math.abs(q[3])).toBeCloseTo(Math.SQRT2 / 2, 5);
  });

  it("fromJSON() reconstructs a tree with equivalent getTransform results", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    tf.addFrame("camera", "robot", translate(0, 0, 1));

    const restored = TFTree.fromJSON(tf.toJSON());

    expect(restored.hasFrame("world")).toBe(true);
    expect(restored.hasFrame("robot")).toBe(true);
    expect(restored.hasFrame("camera")).toBe(true);

    const original = tf.getTransform("world", "camera");
    const copy = restored.getTransform("world", "camera");
    expect(copy.transformPoint(Vec3.zero()).equals(original.transformPoint(Vec3.zero()))).toBe(true);
  });

  it("fromJSON() handles a root frame with null parentId", () => {
    tf.addFrame("island");
    const restored = TFTree.fromJSON(tf.toJSON());
    expect(restored.hasFrame("island")).toBe(true);
    expect(restored.frameIds()).toEqual(["island"]);
  });

  it("toJSON() followed by fromJSON() round-trips a rotation transform", () => {
    tf.addFrame("world");
    tf.addFrame("rotated", "world", rotate90Z());

    const restored = TFTree.fromJSON(tf.toJSON());
    const original = tf.getTransform("world", "rotated");
    const copy = restored.getTransform("world", "rotated");
    expect(copy.transformPoint(new Vec3(1, 0, 0)).equals(original.transformPoint(new Vec3(1, 0, 0)))).toBe(true);
  });

  it("fromJSON() preserves parent-child relationships", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(5, 0, 0));
    tf.addFrame("sensor", "robot", translate(0, 1, 0));

    const restored = TFTree.fromJSON(tf.toJSON());
    const t = restored.getTransform("world", "sensor");
    expect(t.transformPoint(Vec3.zero()).equals(new Vec3(5, 1, 0))).toBe(true);
  });

  it("fromJSON() throws when frame data references an unknown parent", () => {
    expect(() =>
      TFTree.fromJSON({
        frames: [{ id: "child", parentId: "missing", transform: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } }],
      }),
    ).toThrow(/not found/);
  });

  it("fromJSON() throws on duplicate frame ids", () => {
    expect(() =>
      TFTree.fromJSON({
        frames: [
          { id: "world", parentId: null, transform: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
          { id: "world", parentId: null, transform: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
        ],
      }),
    ).toThrow(/already registered/);
  });

  it("toJSON() on an empty tree returns an empty frames array", () => {
    const json = tf.toJSON();
    expect(json.frames).toHaveLength(0);
  });

  // ── onChange ─────────────────────────────────────────────────────────────────

  it("onChange() fires when the watched frame is directly updated", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));

    const calls: string[] = [];
    tf.onChange("robot", (id) => calls.push(id));

    tf.updateTransform("robot", translate(2, 0, 0));
    expect(calls).toEqual(["robot"]);
  });

  it("onChange() fires when an ancestor frame is updated", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world", translate(1, 0, 0));
    tf.addFrame("camera", "robot", translate(0, 0, 1));

    const calls: string[] = [];
    tf.onChange("camera", (id) => calls.push(id));

    // Updating robot (ancestor of camera) should notify camera.
    tf.updateTransform("robot", translate(5, 0, 0));
    expect(calls).toEqual(["camera"]);
  });

  it("onChange() does not fire for unrelated frame updates", () => {
    tf.addFrame("world");
    tf.addFrame("arm", "world", translate(1, 0, 0));
    tf.addFrame("leg", "world", translate(0, 1, 0));

    const calls: string[] = [];
    tf.onChange("arm", (id) => calls.push(id));

    tf.updateTransform("leg", translate(0, 2, 0));
    expect(calls).toHaveLength(0);
  });

  it("onChange() unsubscribe function stops further notifications", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");

    const calls: string[] = [];
    const off = tf.onChange("robot", (id) => calls.push(id));

    tf.updateTransform("robot", translate(1, 0, 0));
    expect(calls).toHaveLength(1);

    off();
    tf.updateTransform("robot", translate(2, 0, 0));
    expect(calls).toHaveLength(1); // No new call after unsubscribing.
  });

  it("onChange() supports multiple callbacks for the same frame", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");

    const calls1: string[] = [];
    const calls2: string[] = [];
    tf.onChange("robot", (id) => calls1.push(id));
    tf.onChange("robot", (id) => calls2.push(id));

    tf.updateTransform("robot", translate(1, 0, 0));
    expect(calls1).toEqual(["robot"]);
    expect(calls2).toEqual(["robot"]);
  });

  it("onChange() throws when frameId is not registered", () => {
    expect(() => tf.onChange("ghost", () => {})).toThrow(/not found/);
  });

  it("onChange() does not fire after the watched frame is removed", () => {
    tf.addFrame("world");
    tf.addFrame("robot", "world");
    tf.addFrame("camera", "robot");

    const calls: string[] = [];
    tf.onChange("camera", (id) => calls.push(id));

    // Remove camera first (leaf), then robot.
    tf.removeFrame("camera");
    tf.removeFrame("robot");

    // Re-add robot: no listeners should survive the removal.
    tf.addFrame("robot", "world", translate(9, 0, 0));
    tf.updateTransform("robot", translate(1, 0, 0));
    expect(calls).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";
import { Quaternion } from "../src/math/Quaternion.js";

describe("Transform", () => {
  it("identity() has zero translation and identity rotation", () => {
    const t = Transform.identity();
    expect(t.translation.equals(Vec3.zero())).toBe(true);
    expect(t.rotation.equals(Quaternion.identity())).toBe(true);
  });

  it("default constructor behaves as identity", () => {
    const t = new Transform();
    expect(t.equals(Transform.identity())).toBe(true);
  });

  it("transformPoint() with identity leaves point unchanged", () => {
    const p = new Vec3(1, 2, 3);
    expect(Transform.identity().transformPoint(p).equals(p)).toBe(true);
  });

  it("transformPoint() applies translation", () => {
    const t = new Transform(new Vec3(1, 2, 3));
    const result = t.transformPoint(Vec3.zero());
    expect(result.equals(new Vec3(1, 2, 3))).toBe(true);
  });

  it("transformPoint() applies rotation before translation", () => {
    // 90° around Z then translate by (1,0,0)
    const q = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    const t = new Transform(new Vec3(1, 0, 0), q);
    // (1,0,0) rotated 90° around Z is (0,1,0), then translated → (1,1,0)
    const result = t.transformPoint(new Vec3(1, 0, 0));
    expect(result.equals(new Vec3(1, 1, 0))).toBe(true);
  });

  it("invert() of identity is identity", () => {
    expect(Transform.identity().invert().equals(Transform.identity())).toBe(true);
  });

  it("compose(invert()) ≈ identity", () => {
    const t = new Transform(
      new Vec3(1, 2, 3),
      Quaternion.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 4),
    );
    const result = t.compose(t.invert());
    expect(result.equals(Transform.identity())).toBe(true);
  });

  it("invert() reverses translation", () => {
    const t = new Transform(new Vec3(5, 0, 0));
    const inv = t.invert();
    expect(inv.transformPoint(new Vec3(5, 0, 0)).equals(Vec3.zero())).toBe(true);
  });

  it("compose() chains translation", () => {
    const a = new Transform(new Vec3(1, 0, 0));
    const b = new Transform(new Vec3(2, 0, 0));
    const ab = a.compose(b);
    expect(ab.transformPoint(Vec3.zero()).equals(new Vec3(3, 0, 0))).toBe(true);
  });

  it("compose() chains rotation", () => {
    const q90 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    const a = new Transform(Vec3.zero(), q90);
    const b = new Transform(Vec3.zero(), q90);
    const ab = a.compose(b);
    // Two 90° rotations around Z should rotate X to -X
    expect(ab.transformPoint(new Vec3(1, 0, 0)).equals(new Vec3(-1, 0, 0))).toBe(true);
  });

  it("toMat4() and fromMat4() are inverses", () => {
    const t = new Transform(
      new Vec3(3, -1, 2),
      Quaternion.fromAxisAngle(new Vec3(1, 0, 0), Math.PI / 6),
    );
    const roundTrip = Transform.fromMat4(t.toMat4());
    expect(roundTrip.equals(t)).toBe(true);
  });

  it("equals() with epsilon", () => {
    const a = Transform.identity();
    const b = new Transform(new Vec3(1e-7, 0, 0));
    expect(a.equals(b)).toBe(true);
    expect(a.equals(new Transform(new Vec3(0.1, 0, 0)))).toBe(false);
  });

  it("toString()", () => {
    const s = Transform.identity().toString();
    expect(s).toContain("Transform");
    expect(s).toContain("Vec3");
    expect(s).toContain("Quaternion");
  });
});

import { describe, it, expect } from "vitest";
import { Quaternion } from "../src/math/Quaternion.js";
import { Vec3 } from "../src/math/Vec3.js";

describe("Quaternion", () => {
  it("identity() has w=1 and others=0", () => {
    const q = Quaternion.identity();
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
    expect(q.w).toBe(1);
  });

  it("fromArray() round-trips", () => {
    const q = Quaternion.fromArray([0.1, 0.2, 0.3, 0.9274]);
    expect(q.x).toBeCloseTo(0.1);
    expect(q.w).toBeCloseTo(0.9274);
  });

  it("toArray() returns correct tuple", () => {
    const arr = Quaternion.identity().toArray();
    expect(arr).toEqual([0, 0, 0, 1]);
  });

  it("fromAxisAngle() 90° around Z rotates X to Y", () => {
    const q = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    const rotated = q.rotateVec3(new Vec3(1, 0, 0));
    expect(rotated.equals(new Vec3(0, 1, 0))).toBe(true);
  });

  it("fromAxisAngle() 180° around Z rotates X to -X", () => {
    const q = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI);
    const rotated = q.rotateVec3(new Vec3(1, 0, 0));
    expect(rotated.equals(new Vec3(-1, 0, 0))).toBe(true);
  });

  it("fromEulerXYZ() 90° around Z matches fromAxisAngle", () => {
    const q1 = Quaternion.fromEulerXYZ(0, 0, Math.PI / 2);
    const q2 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    expect(q1.equals(q2)).toBe(true);
  });

  it("multiply() identity left-multiply leaves q unchanged", () => {
    const q = Quaternion.fromAxisAngle(new Vec3(1, 0, 0), Math.PI / 4);
    expect(Quaternion.identity().multiply(q).equals(q)).toBe(true);
  });

  it("multiply() 90° Z twice = 180° Z", () => {
    const q90 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    const q180 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI);
    expect(q90.multiply(q90).equals(q180)).toBe(true);
  });

  it("invert() of identity is identity", () => {
    expect(Quaternion.identity().invert().equals(Quaternion.identity())).toBe(true);
  });

  it("invert() composed with original yields identity rotation", () => {
    const q = Quaternion.fromAxisAngle(new Vec3(1, 1, 0).normalize(), Math.PI / 3);
    const composed = q.multiply(q.invert());
    expect(composed.equals(Quaternion.identity())).toBe(true);
  });

  it("normalize() produces unit length", () => {
    const q = new Quaternion(1, 2, 3, 4).normalize();
    const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
    expect(len).toBeCloseTo(1);
  });

  it("rotateVec3() identity leaves vector unchanged", () => {
    const v = new Vec3(1, 2, 3);
    expect(Quaternion.identity().rotateVec3(v).equals(v)).toBe(true);
  });

  it("equals() treats q and -q as the same rotation", () => {
    const q = Quaternion.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
    const neg = new Quaternion(-q.x, -q.y, -q.z, -q.w);
    expect(q.equals(neg)).toBe(true);
  });

  it("toString()", () => {
    expect(Quaternion.identity().toString()).toBe("Quaternion(0, 0, 0, 1)");
  });

  it("slerp() at t=0 returns this", () => {
    const q1 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), 0);
    const q2 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    expect(q1.slerp(q2, 0).equals(q1)).toBe(true);
  });

  it("slerp() at t=1 returns other", () => {
    const q1 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), 0);
    const q2 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    expect(q1.slerp(q2, 1).equals(q2)).toBe(true);
  });

  it("slerp() at t=0.5 interpolates halfway", () => {
    const q1 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), 0);
    const q2 = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    const mid = q1.slerp(q2, 0.5);
    const expected = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 4);
    expect(mid.equals(expected)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { Vec3 } from "../src/math/Vec3.js";

describe("Vec3", () => {
  it("defaults to zero vector", () => {
    const v = new Vec3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it("zero() factory returns zero vector", () => {
    expect(Vec3.zero().equals(new Vec3(0, 0, 0))).toBe(true);
  });

  it("fromArray() round-trips", () => {
    const v = Vec3.fromArray([1, 2, 3]);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it("toArray() returns correct tuple", () => {
    expect(new Vec3(4, 5, 6).toArray()).toEqual([4, 5, 6]);
  });

  it("add()", () => {
    const result = new Vec3(1, 2, 3).add(new Vec3(4, 5, 6));
    expect(result.equals(new Vec3(5, 7, 9))).toBe(true);
  });

  it("subtract()", () => {
    const result = new Vec3(5, 7, 9).subtract(new Vec3(1, 2, 3));
    expect(result.equals(new Vec3(4, 5, 6))).toBe(true);
  });

  it("scale()", () => {
    expect(new Vec3(1, 2, 3).scale(2).equals(new Vec3(2, 4, 6))).toBe(true);
  });

  it("length() of unit vector is 1", () => {
    expect(new Vec3(1, 0, 0).length()).toBeCloseTo(1);
  });

  it("length() of (3,4,0) is 5", () => {
    expect(new Vec3(3, 4, 0).length()).toBeCloseTo(5);
  });

  it("normalize() produces a unit vector", () => {
    const n = new Vec3(3, 4, 0).normalize();
    expect(n.length()).toBeCloseTo(1);
  });

  it("dot()", () => {
    expect(new Vec3(1, 0, 0).dot(new Vec3(0, 1, 0))).toBeCloseTo(0);
    expect(new Vec3(1, 0, 0).dot(new Vec3(1, 0, 0))).toBeCloseTo(1);
    expect(new Vec3(2, 3, 4).dot(new Vec3(1, 1, 1))).toBeCloseTo(9);
  });

  it("cross() of basis vectors", () => {
    const x = new Vec3(1, 0, 0);
    const y = new Vec3(0, 1, 0);
    const z = x.cross(y);
    expect(z.equals(new Vec3(0, 0, 1))).toBe(true);
  });

  it("equals() with epsilon", () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(1 + 1e-7, 2 + 1e-7, 3 + 1e-7);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(new Vec3(1.1, 2, 3))).toBe(false);
  });

  it("toString()", () => {
    expect(new Vec3(1, 2, 3).toString()).toBe("Vec3(1, 2, 3)");
  });

  it("lerp() at t=0 returns this", () => {
    const a = new Vec3(0, 0, 0);
    const b = new Vec3(10, 20, 30);
    expect(a.lerp(b, 0).equals(a)).toBe(true);
  });

  it("lerp() at t=1 returns other", () => {
    const a = new Vec3(0, 0, 0);
    const b = new Vec3(10, 20, 30);
    expect(a.lerp(b, 1).equals(b)).toBe(true);
  });

  it("lerp() at t=0.5 returns midpoint", () => {
    const a = new Vec3(0, 0, 0);
    const b = new Vec3(10, 20, 30);
    expect(a.lerp(b, 0.5).equals(new Vec3(5, 10, 15))).toBe(true);
  });
});

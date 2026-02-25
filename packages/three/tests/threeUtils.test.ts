import { describe, it, expect } from "vitest";
import { Matrix4, Object3D } from "three";
import { Transform, Vec3, Quaternion } from "@tf-engine/core";
import { toMatrix4, applyToObject3D } from "../src/index.js";

describe("toMatrix4", () => {
  it("returns a Matrix4 with elements matching Transform.toMat4()", () => {
    const transform = new Transform(new Vec3(1, 2, 3));
    const mat = toMatrix4(transform, new Matrix4());
    const expected = transform.toMat4();

    // THREE.Matrix4 stores elements in column-major order in .elements
    for (let i = 0; i < 16; i++) {
      expect(mat.elements[i]).toBeCloseTo(expected[i], 6);
    }
  });

  it("handles identity transform", () => {
    const identity = Transform.identity();
    const mat = toMatrix4(identity, new Matrix4());

    // Identity matrix: diagonal = 1, rest = 0
    const e = mat.elements;
    expect(e[0]).toBeCloseTo(1);
    expect(e[5]).toBeCloseTo(1);
    expect(e[10]).toBeCloseTo(1);
    expect(e[15]).toBeCloseTo(1);
    expect(e[12]).toBeCloseTo(0); // tx
    expect(e[13]).toBeCloseTo(0); // ty
    expect(e[14]).toBeCloseTo(0); // tz
  });

  it("encodes translation in the last column (elements 12, 13, 14)", () => {
    const transform = new Transform(new Vec3(4, 5, 6));
    const mat = toMatrix4(transform, new Matrix4());

    expect(mat.elements[12]).toBeCloseTo(4);
    expect(mat.elements[13]).toBeCloseTo(5);
    expect(mat.elements[14]).toBeCloseTo(6);
  });

  it("encodes rotation correctly for 90° rotation about Z", () => {
    const q = Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    const transform = new Transform(Vec3.zero(), q);
    const mat = toMatrix4(transform, new Matrix4());
    const e = mat.elements;

    // Column-major: col 0 = [cos90, sin90, 0, 0] = [0, 1, 0, 0]
    expect(e[0]).toBeCloseTo(0, 5);
    expect(e[1]).toBeCloseTo(1, 5);
    expect(e[2]).toBeCloseTo(0, 5);
    // col 1 = [-sin90, cos90, 0, 0] = [-1, 0, 0, 0]
    expect(e[4]).toBeCloseTo(-1, 5);
    expect(e[5]).toBeCloseTo(0, 5);
  });

  it("mutates and returns the provided target Matrix4", () => {
    const transform = new Transform(new Vec3(1, 0, 0));
    const target = new Matrix4();
    const result = toMatrix4(transform, target);
    expect(result).toBe(target);
  });
});

describe("applyToObject3D", () => {
  it("sets matrixAutoUpdate to false", () => {
    const obj = new Object3D();
    const transform = Transform.identity();
    applyToObject3D(transform, obj);
    expect(obj.matrixAutoUpdate).toBe(false);
  });

  it("sets matrixWorldNeedsUpdate to true", () => {
    const obj = new Object3D();
    const transform = Transform.identity();
    applyToObject3D(transform, obj);
    expect(obj.matrixWorldNeedsUpdate).toBe(true);
  });

  it("writes the transform matrix into object.matrix", () => {
    const obj = new Object3D();
    const transform = new Transform(new Vec3(7, 8, 9));
    applyToObject3D(transform, obj);

    expect(obj.matrix.elements[12]).toBeCloseTo(7);
    expect(obj.matrix.elements[13]).toBeCloseTo(8);
    expect(obj.matrix.elements[14]).toBeCloseTo(9);
  });

  it("writes identity for identity transform", () => {
    const obj = new Object3D();
    applyToObject3D(Transform.identity(), obj);

    const e = obj.matrix.elements;
    expect(e[0]).toBeCloseTo(1);
    expect(e[5]).toBeCloseTo(1);
    expect(e[10]).toBeCloseTo(1);
    expect(e[15]).toBeCloseTo(1);
    expect(e[12]).toBeCloseTo(0);
    expect(e[13]).toBeCloseTo(0);
    expect(e[14]).toBeCloseTo(0);
  });
});

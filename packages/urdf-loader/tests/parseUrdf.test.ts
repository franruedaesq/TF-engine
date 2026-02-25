import { describe, it, expect } from "vitest";
import { loadUrdf } from "../src/parseUrdf.js";
import { Vec3 } from "@tf-engine/core";

// ── URDF fixtures ─────────────────────────────────────────────────────────────

const SIMPLE_URDF = `
<robot name="simple">
  <link name="base_link"/>
  <link name="link1"/>
  <joint name="j1" type="fixed">
    <parent link="base_link"/>
    <child link="link1"/>
    <origin xyz="0 0 0.5" rpy="0 0 0"/>
  </joint>
</robot>
`;

const TWO_JOINT_URDF = `
<robot name="arm">
  <link name="world"/>
  <link name="shoulder"/>
  <link name="elbow"/>
  <joint name="shoulder_joint" type="revolute">
    <parent link="world"/>
    <child link="shoulder"/>
    <origin xyz="0 0 1" rpy="0 0 0"/>
  </joint>
  <joint name="elbow_joint" type="revolute">
    <parent link="shoulder"/>
    <child link="elbow"/>
    <origin xyz="0 0 0.5" rpy="0 0 1.5707963"/>
  </joint>
</robot>
`;

const NO_ORIGIN_URDF = `
<robot name="minimal">
  <link name="base"/>
  <link name="arm"/>
  <joint name="base_arm" type="fixed">
    <parent link="base"/>
    <child link="arm"/>
  </joint>
</robot>
`;

const MULTI_ROOT_URDF = `
<robot name="multi">
  <link name="base_a"/>
  <link name="base_b"/>
  <link name="child_a"/>
  <joint name="ja" type="fixed">
    <parent link="base_a"/>
    <child link="child_a"/>
    <origin xyz="1 0 0" rpy="0 0 0"/>
  </joint>
</robot>
`;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("loadUrdf", () => {
  it("registers all declared links as frames", () => {
    const tf = loadUrdf(SIMPLE_URDF);
    expect(tf.hasFrame("base_link")).toBe(true);
    expect(tf.hasFrame("link1")).toBe(true);
  });

  it("frameIds() contains exactly the declared links", () => {
    const tf = loadUrdf(SIMPLE_URDF);
    expect(tf.frameIds().sort()).toEqual(["base_link", "link1"]);
  });

  it("applies joint origin translation", () => {
    const tf = loadUrdf(SIMPLE_URDF);
    const t = tf.getTransform("base_link", "link1");
    const p = t.transformPoint(Vec3.zero());
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0.5);
  });

  it("chains multiple joints correctly", () => {
    const tf = loadUrdf(TWO_JOINT_URDF);
    expect(tf.hasFrame("world")).toBe(true);
    expect(tf.hasFrame("shoulder")).toBe(true);
    expect(tf.hasFrame("elbow")).toBe(true);

    // elbow is 0.5 above shoulder which is 1 above world → z = 1.5
    const t = tf.getTransform("world", "elbow");
    const p = t.transformPoint(Vec3.zero());
    // The yaw on elbow_joint rotates the child's axes but not the origin offset
    expect(p.z).toBeCloseTo(1.5, 4);
  });

  it("defaults to identity transform when <origin> is absent", () => {
    const tf = loadUrdf(NO_ORIGIN_URDF);
    const t = tf.getTransform("base", "arm");
    const p = t.transformPoint(new Vec3(1, 2, 3));
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(3);
  });

  it("handles multiple root links", () => {
    const tf = loadUrdf(MULTI_ROOT_URDF);
    expect(tf.hasFrame("base_a")).toBe(true);
    expect(tf.hasFrame("base_b")).toBe(true);
    expect(tf.hasFrame("child_a")).toBe(true);

    const t = tf.getTransform("base_a", "child_a");
    const p = t.transformPoint(Vec3.zero());
    expect(p.x).toBeCloseTo(1);
  });

  it("adds robot root frame when addRobotRoot is true", () => {
    const tf = loadUrdf(SIMPLE_URDF, { addRobotRoot: true });
    expect(tf.hasFrame("simple")).toBe(true);
    expect(tf.hasFrame("base_link")).toBe(true);
    expect(tf.hasFrame("link1")).toBe(true);
  });

  it("throws when <robot> element is missing", () => {
    expect(() => loadUrdf("<not_a_robot/>")).toThrow(/missing <robot>/);
  });

  it("throws when a joint references an undeclared link", () => {
    const bad = `
      <robot name="bad">
        <link name="base"/>
        <joint name="j" type="fixed">
          <parent link="base"/>
          <child link="ghost"/>
          <origin xyz="0 0 0" rpy="0 0 0"/>
        </joint>
      </robot>
    `;
    expect(() => loadUrdf(bad)).toThrow(/ghost/);
  });

  it("parses self-closing <link/> tags", () => {
    const xml = `
      <robot name="r">
        <link name="a"/>
        <link name="b"/>
        <joint name="j" type="fixed">
          <parent link="a"/>
          <child link="b"/>
          <origin xyz="0 1 0" rpy="0 0 0"/>
        </joint>
      </robot>
    `;
    const tf = loadUrdf(xml);
    expect(tf.hasFrame("a")).toBe(true);
    expect(tf.hasFrame("b")).toBe(true);
    const p = tf.getTransform("a", "b").transformPoint(Vec3.zero());
    expect(p.y).toBeCloseTo(1);
  });
});

import { bench, describe } from "vitest";
import { TFTree } from "../src/TFTree.js";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";

// ── Macro-benchmarks: throughput for large trees ──────────────────────────────
//
// Goal: verify that the Rust backend handles deep hierarchies and large flat
// trees efficiently via batch updates.
//
// Scenario A: deep chain (depth 100) — batch-update all frames.
// Scenario B: wide flat tree (10 000 children) — batch-update 1 000 frames.
//
// Expected: Rust should be significantly faster than pure-JS implementations
// for large subtree invalidation due to efficient graph traversal.

// ── helpers ───────────────────────────────────────────────────────────────────

function buildDeepChain(depth: number): TFTree {
  const tf = new TFTree();
  tf.addFrame("world");
  let prev = "world";
  for (let i = 0; i < depth; i++) {
    const id = `f${i}`;
    tf.addFrame(id, prev, new Transform(new Vec3(0.1, 0, 0)));
    prev = id;
  }
  return tf;
}

function buildWideTree(children: number): TFTree {
  const tf = new TFTree();
  tf.addFrame("world");
  for (let i = 0; i < children; i++) {
    tf.addFrame(`child${i}`, "world", new Transform(new Vec3(i * 0.1, 0, 0)));
  }
  return tf;
}

// ── Scenario A: deep chain (depth 100) ───────────────────────────────────────

describe("updateTransforms – deep chain (depth 100)", () => {
  const DEPTH = 100;
  const tf = buildDeepChain(DEPTH);

  const batchUpdate: Record<string, Transform> = {};
  for (let i = 0; i < DEPTH; i++) {
    batchUpdate[`f${i}`] = new Transform(new Vec3(0.2, 0, 0));
  }

  bench("batch-update all 100 frames", () => {
    tf.updateTransforms(batchUpdate);
  });

  bench("getTransform world → leaf (depth 100)", () => {
    tf.getTransform("world", `f${DEPTH - 1}`);
  });
});

// ── Scenario B: wide flat tree (10 000 children) ─────────────────────────────

describe("updateTransforms – wide flat tree (10 000 children)", () => {
  const CHILDREN = 10_000;
  const BATCH_SIZE = 1_000;
  const tf = buildWideTree(CHILDREN);

  const batchUpdate: Record<string, Transform> = {};
  for (let i = 0; i < BATCH_SIZE; i++) {
    batchUpdate[`child${i}`] = new Transform(new Vec3(i * 0.2, 0, 0));
  }

  bench(`batch-update ${BATCH_SIZE} of ${CHILDREN} children`, () => {
    tf.updateTransforms(batchUpdate);
  });
});

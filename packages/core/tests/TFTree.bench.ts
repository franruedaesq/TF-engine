import { bench, describe } from "vitest";
import { TFTree } from "../src/TFTree.js";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a linear chain of `n` frames: world → f0 → f1 → … → f(n-1). */
function buildLinearChain(n: number): TFTree {
  const tf = new TFTree();
  tf.addFrame("world");
  let prev = "world";
  for (let i = 0; i < n; i++) {
    const id = `f${i}`;
    tf.addFrame(id, prev, new Transform(new Vec3(0.1, 0, 0)));
    prev = id;
  }
  return tf;
}

/** Build a balanced binary tree of depth `d` (~2^d − 1 frames). */
function buildBalancedTree(depth: number): TFTree {
  const tf = new TFTree();
  tf.addFrame("root");
  const queue: Array<{ id: string; d: number }> = [{ id: "root", d: 0 }];
  let counter = 0;
  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (d >= depth - 1) continue;
    for (let c = 0; c < 2; c++) {
      const childId = `n${counter++}`;
      tf.addFrame(childId, id, new Transform(new Vec3(0.1 * c, 0, 0)));
      queue.push({ id: childId, d: d + 1 });
    }
  }
  return tf;
}

// ── 1 000-node benchmarks ─────────────────────────────────────────────────────

const CHAIN_SIZE = 1_000;

describe("updateTransforms – 1 000-node linear chain", () => {
  // Build the tree once; each bench iteration mutates existing frame transforms.
  const tf = buildLinearChain(CHAIN_SIZE);

  // Prepare a batch that touches every frame in the chain.
  const allUpdates: Record<string, Transform> = {};
  for (let i = 0; i < CHAIN_SIZE; i++) {
    allUpdates[`f${i}`] = new Transform(new Vec3(0.2, 0, 0));
  }

  bench("batch-update all 1 000 frames", () => {
    tf.updateTransforms(allUpdates);
  });

  bench("single-update leaf frame (max depth)", () => {
    tf.updateTransform(`f${CHAIN_SIZE - 1}`, new Transform(new Vec3(0.1, 0, 0)));
  });

  bench("getTransform world → leaf (full chain traversal)", () => {
    tf.getTransform("world", `f${CHAIN_SIZE - 1}`);
  });
});

describe("updateTransforms – ~1 000-node balanced binary tree (depth 10)", () => {
  // depth=10 gives 2^10 - 1 = 1 023 frames (plus root → 1 024 total).
  const tf = buildBalancedTree(10);
  const frameIds = tf.frameIds();

  const allUpdates: Record<string, Transform> = {};
  for (const id of frameIds) {
    if (id !== "root") {
      allUpdates[id] = new Transform(new Vec3(0.2, 0, 0));
    }
  }

  bench("batch-update all non-root frames", () => {
    tf.updateTransforms(allUpdates);
  });
});

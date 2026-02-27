import { bench, describe } from "vitest";
import { TFTree } from "../src/TFTree.js";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";

// ── Micro-benchmark: JS ↔ WASM boundary overhead ─────────────────────────────
//
// Scenario: 2-frame tree (world → robot).
// Operation: `getTransform('world', 'robot')` called repeatedly.
//
// Goal: quantify the cost of a single JS → Rust round-trip so that
// regressions in the binding interface are caught early.
// Expected: stable call overhead with no per-call allocations.

describe("getTransform – boundary overhead (world → robot)", () => {
  const tf = new TFTree();
  tf.addFrame("world");
  tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));

  bench("getTransform('world', 'robot')", () => {
    tf.getTransform("world", "robot");
  });

  bench("getTransform same frame (identity fast-path)", () => {
    tf.getTransform("world", "world");
  });
});

// ── Baseline: pure-JS transform composition ───────────────────────────────────
//
// Compare against a hand-rolled translation addition so that we can reason
// about the JS ↔ WASM overhead factor.

describe("baseline – pure JS Vec3 lerp (no WASM call)", () => {
  const a = new Vec3(1, 0, 0);
  const b = new Vec3(2, 0, 0);

  bench("Vec3.lerp (pure JS)", () => {
    a.lerp(b, 0.5);
  });
});

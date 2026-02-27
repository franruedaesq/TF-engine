import { describe, it, expect } from "vitest";
import { TFTree } from "../src/TFTree.js";
import { Transform } from "../src/math/Transform.js";
import { Vec3 } from "../src/math/Vec3.js";

// ── Memory safety: WASM object lifecycle ─────────────────────────────────────
//
// Goal: verify that repeated TFTree creation and abandonment does not grow
// memory unboundedly.  The Rust `Drop` trait, combined with the
// `FinalizationRegistry` registered by wasm-bindgen, should reclaim the
// underlying WASM allocations when the JS wrapper is garbage-collected.
//
// We cannot force a GC synchronously in Node (that requires `--expose-gc`),
// so instead we:
//   1. Run a warm-up phase to let the runtime reach a steady state.
//   2. Record a baseline memory snapshot.
//   3. Create ITERATIONS trees, each with FRAMES_PER_TREE frames, and allow
//      them to go out of scope immediately.
//   4. Assert that heap and external memory growth are bounded to less than
//      MAX_GROWTH_MB.  Catastrophic leaks (e.g. Rust allocations never freed)
//      would show as multi-hundred-MB growth.

describe("Memory safety: TFTree lifecycle", () => {
  it("heap does not grow unboundedly after repeated TFTree creation/disposal", () => {
    const ITERATIONS = 10_000;
    const FRAMES_PER_TREE = 10;
    const MAX_GROWTH_MB = 100;

    // Warm up: let the JS engine and WASM allocator reach a steady state.
    for (let i = 0; i < 200; i++) {
      const tf = new TFTree();
      tf.addFrame("world");
      void tf;
    }

    const baseline = process.memoryUsage();

    for (let i = 0; i < ITERATIONS; i++) {
      const tf = new TFTree();
      tf.addFrame("world");
      for (let j = 0; j < FRAMES_PER_TREE; j++) {
        tf.addFrame(
          `f${j}`,
          j === 0 ? "world" : `f${j - 1}`,
          new Transform(new Vec3(j * 0.1, 0, 0)),
        );
      }
      // Allow tf to go out of scope; GC + FinalizationRegistry will free
      // the Rust-side allocation eventually.
    }

    const after = process.memoryUsage();

    const heapGrowthMB = (after.heapUsed - baseline.heapUsed) / (1024 * 1024);
    const externalGrowthMB = (after.external - baseline.external) / (1024 * 1024);

    expect(heapGrowthMB).toBeLessThan(MAX_GROWTH_MB);
    expect(externalGrowthMB).toBeLessThan(MAX_GROWTH_MB);
  });
});

#!/usr/bin/env node
/**
 * Node.js integration test for @tf-engine/core.
 *
 * Verifies that the built package loads correctly in both CommonJS (via
 * `createRequire`) and ESM (`dynamic import`) environments, and that the
 * synchronous WASM-backed `TFTree` API works as expected.
 *
 * Run this script AFTER building the package:
 *
 *   npm run build --workspace=packages/core
 *   node packages/core/tests/test-node-require.js
 *
 * Exit code 0 = all checks passed; non-zero = one or more checks failed.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFn = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    failed++;
  }
}

// ── CJS via createRequire ─────────────────────────────────────────────────────

console.log("CJS (createRequire) tests:");
try {
  const pkg = requireFn(join(__dirname, "../dist/index.cjs"));

  check("exports an object", () => {
    if (typeof pkg !== "object" || pkg === null) throw new Error("not an object");
  });
  check("TFTree is exported", () => {
    if (typeof pkg.TFTree !== "function") throw new Error("TFTree missing");
  });
  check("new TFTree() constructs synchronously", () => {
    const tf = new pkg.TFTree();
    if (typeof tf.addFrame !== "function") throw new Error("addFrame missing");
  });
  check("addFrame / getTransform round-trip", () => {
    const { TFTree, Transform, Vec3 } = pkg;
    const tf = new TFTree();
    tf.addFrame("world");
    tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));
    const t = tf.getTransform("world", "robot");
    if (Math.abs(t.translation.x - 1) > 1e-9) throw new Error("unexpected translation");
  });
  check("BufferedTFTree is exported", () => {
    if (typeof pkg.BufferedTFTree !== "function") throw new Error("BufferedTFTree missing");
  });
  check("CycleDetectedError is exported", () => {
    if (typeof pkg.CycleDetectedError !== "function") throw new Error("CycleDetectedError missing");
  });
  check("FrameNotFoundError is exported", () => {
    if (typeof pkg.FrameNotFoundError !== "function") throw new Error("FrameNotFoundError missing");
  });
} catch (err) {
  console.error(`  ✗ require() failed to load the package: ${err.message}`);
  failed++;
}

// ── ESM via dynamic import ────────────────────────────────────────────────────

console.log("\nESM (dynamic import) tests:");
try {
  const pkg = await import(join(__dirname, "../dist/index.js"));

  check("TFTree is exported (ESM)", () => {
    if (typeof pkg.TFTree !== "function") throw new Error("TFTree missing");
  });
  check("new TFTree() works via ESM import", () => {
    const tf = new pkg.TFTree();
    if (typeof tf.addFrame !== "function") throw new Error("addFrame missing");
  });
  check("addFrame / getTransform round-trip (ESM)", () => {
    const { TFTree, Transform, Vec3 } = pkg;
    const tf = new TFTree();
    tf.addFrame("world");
    tf.addFrame("sensor", "world", new Transform(new Vec3(0, 0, 1)));
    const t = tf.getTransform("world", "sensor");
    if (Math.abs(t.translation.z - 1) > 1e-9) throw new Error("unexpected translation");
  });
} catch (err) {
  console.error(`  ✗ ESM import failed: ${err.message}`);
  failed++;
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

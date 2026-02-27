/**
 * Type-level smoke-test for the @tf-engine/core public API.
 *
 * This file is NOT a vitest test suite; it is checked at compile time via
 * tsconfig.test.json (which includes `tests/**‌/*`).  Any type error here
 * indicates a regression in the public API surface.
 *
 * Sections validated:
 *   - `new TFTree()` — synchronous constructor
 *   - `addFrame(id: string, parentId?: string, transform?: Transform): void`
 *   - `getTransform(from: string, to: string): Transform`
 *   - All other public TFTree / BufferedTFTree methods
 *   - All exported types / interfaces
 */

import {
  TFTree,
  BufferedTFTree,
  Transform,
  Vec3,
  Quaternion,
  CycleDetectedError,
  FrameNotFoundError,
} from "../src/index.js";
import type {
  ITransform,
  FrameNode,
  ITransformTree,
  TFTreeJSON,
  FrameNodeJSON,
  TransformStamped,
  BufferedTFTreeOptions,
  ChangeCallback,
} from "../src/types.js";

// ── TFTree constructor (synchronous) ──────────────────────────────────────────
const tf: TFTree = new TFTree();

// ── addFrame(id: string, parentId?: string, transform?: Transform): void ──────
tf.addFrame("world");
tf.addFrame("robot", "world");
tf.addFrame("camera", "robot", Transform.identity());

// ── getTransform(from: string, to: string): Transform ─────────────────────────
const t: Transform = tf.getTransform("world", "robot");

// ── updateTransform ───────────────────────────────────────────────────────────
tf.updateTransform("robot", new Transform(new Vec3(1, 0, 0)));

// ── updateFrame (alias) ───────────────────────────────────────────────────────
tf.updateFrame("robot", Transform.identity());

// ── updateTransforms (batch) ──────────────────────────────────────────────────
tf.updateTransforms({ robot: Transform.identity() });

// ── removeFrame ───────────────────────────────────────────────────────────────
tf.removeFrame("camera");

// ── hasFrame ──────────────────────────────────────────────────────────────────
const has: boolean = tf.hasFrame("world");

// ── frameIds ──────────────────────────────────────────────────────────────────
const ids: string[] = tf.frameIds();

// ── onChange ──────────────────────────────────────────────────────────────────
const off: () => void = tf.onChange("robot", (_id: string) => {});
off();

// ── toJSON / fromJSON ─────────────────────────────────────────────────────────
const json: TFTreeJSON = tf.toJSON();
const restored: TFTree = TFTree.fromJSON(json);

// ── ITransformTree interface compatibility ────────────────────────────────────
const tree: ITransformTree = tf;

// ── BufferedTFTree ────────────────────────────────────────────────────────────
const opts: BufferedTFTreeOptions = { maxBufferDuration: 5_000 };
const btf: BufferedTFTree = new BufferedTFTree(opts);
btf.addFrame("world");
btf.addFrame("robot", "world");
btf.setTransform("robot", Transform.identity(), Date.now());
const bt: Transform = btf.getTransformAt("world", "robot", Date.now());

// ── Math types ────────────────────────────────────────────────────────────────
const v: Vec3 = new Vec3(1, 2, 3);
const q: Quaternion = Quaternion.identity();
const xform: Transform = new Transform(v, q);

// ── Error classes ─────────────────────────────────────────────────────────────
const cycleErr: CycleDetectedError = new CycleDetectedError("frame");
const notFoundErr: FrameNotFoundError = new FrameNotFoundError("frame");

// ── Exported interface types ──────────────────────────────────────────────────
const _itransform: ITransform = { translation: v, rotation: q };
const _frameNode: FrameNode = { id: "world", transform: Transform.identity() };
const _frameJson: FrameNodeJSON = {
  id: "world",
  parentId: null,
  transform: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
};
const _stamped: TransformStamped = { timestamp: 0, transform: Transform.identity() };
const _cb: ChangeCallback = (_id: string) => {};

// Verify Transform is assignable to ITransform.
const _icheck: ITransform = t;

// Suppress "unused variable" errors — the goal is purely type-checking.
void tf;
void t;
void has;
void ids;
void json;
void restored;
void tree;
void bt;
void xform;
void cycleErr;
void notFoundErr;
void _itransform;
void _frameNode;
void _frameJson;
void _stamped;
void _cb;
void _icheck;

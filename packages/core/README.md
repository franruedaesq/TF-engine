# @tf-engine/core

> **Transform Frame Engine** — a TypeScript library for managing spatial transforms between named reference frames.

Inspired by ROS's `tf2`, `@tf-engine/core` models a **directed acyclic graph (DAG)** of frames where each frame stores its rigid-body transform relative to its parent. The engine can then resolve the transform between **any** two connected frames in O(depth) time.

[![npm](https://img.shields.io/npm/v/@tf-engine/core)](https://www.npmjs.com/package/@tf-engine/core)
[![license](https://img.shields.io/npm/l/@tf-engine/core)](./LICENSE)

---

## Installation

```bash
npm install @tf-engine/core
```

---

## Quick Start

```ts
import { TFTree, Transform, Vec3, Quaternion } from "@tf-engine/core";

const tf = new TFTree();

// Register a root frame
tf.addFrame("world");

// Register a child frame offset 1 m along X
tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));

// Register a grandchild frame 0.5 m above the robot
tf.addFrame("camera", "robot", new Transform(new Vec3(0, 0, 0.5)));

// Resolve the transform from camera-local → world
const cameraInWorld = tf.getTransform("world", "camera");

// Apply the transform to a point expressed in camera-local space
const worldPoint = cameraInWorld.transformPoint(new Vec3(0, 0, 0));
// worldPoint → Vec3(1, 0, 0.5)
```

---

## API Reference

### `TFTree`

```ts
import { TFTree } from "@tf-engine/core";
const tf = new TFTree();
```

| Method                                | Description                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addFrame(id, parentId?, transform?)` | Register a new frame. Omit `parentId` for a root frame. Defaults to the identity transform. Throws if the frame already exists, the parent is unknown, or a cycle would be introduced. |
| `updateTransform(id, transform)`      | Replace the stored transform of an existing frame.                                                                                                                                     |
| `updateFrame(id, transform)`          | Alias for `updateTransform`.                                                                                                                                                           |
| `updateTransforms(updates)`           | Batch-replace transforms for multiple frames in one call (`Record<string, Transform>`).                                                                                                |
| `removeFrame(id)`                     | Remove a registered frame. Throws if it still has child frames.                                                                                                                        |
| `hasFrame(id)`                        | Returns `true` if the frame is registered.                                                                                                                                             |
| `frameIds()`                          | Returns an array of all registered frame ids.                                                                                                                                          |
| `getTransform(from, to)`              | Returns the `Transform` mapping points from `from` to `to`.                                                                                                                            |
| `onChange(frameId, callback)`         | Subscribe to world-transform changes for `frameId`. Returns an unsubscribe function.                                                                                                   |
| `toJSON()`                            | Serialize the tree to a plain `TFTreeJSON` object.                                                                                                                                     |
| `TFTree.fromJSON(data)`               | _(static)_ Reconstruct a `TFTree` from a `TFTreeJSON` object.                                                                                                                          |

---

### `BufferedTFTree`

Extends `TFTree` with a rolling time-stamped history for interpolated queries.

```ts
import { BufferedTFTree } from "@tf-engine/core";

const tf = new BufferedTFTree({ maxBufferDuration: 5_000 }); // 5-second window
tf.addFrame("world");
tf.addFrame("camera", "world");

const now = Date.now();
tf.setTransform("camera", new Transform(new Vec3(0, 0, 1)), now - 100);
tf.setTransform("camera", new Transform(new Vec3(0, 0, 2)), now);

// Interpolated position 50 ms in the past (LERP translation + SLERP rotation)
const past = tf.getTransformAt("world", "camera", now - 50);
past.transformPoint(Vec3.zero()); // Vec3(0, 0, 1.5)
```

**Extra methods**

| Method                                   | Description                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| `setTransform(id, transform, timestamp)` | Record a time-stamped transform.                               |
| `getTransformAt(from, to, timestamp)`    | Return the interpolated transform at the given timestamp (ms). |

**`BufferedTFTreeOptions`**

| Option              | Type     | Default  | Description                                  |
| ------------------- | -------- | -------- | -------------------------------------------- |
| `maxBufferDuration` | `number` | `10_000` | Max age of buffered entries in milliseconds. |

---

### `Transform`

```ts
import { Transform } from "@tf-engine/core";

new Transform(translation?: Vec3, rotation?: Quaternion)
Transform.identity()
Transform.fromMat4(m: Float32Array)
```

| Method                    | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `compose(other)`          | Returns the composed transform (apply `this` then `other`). |
| `invert()`                | Returns the inverse transform.                              |
| `transformPoint(point)`   | Applies this transform to a 3-D point.                      |
| `equals(other, epsilon?)` | Component-wise equality check.                              |
| `toMat4()`                | Returns a column-major 4×4 `Float32Array`.                  |

---

### `Vec3`

```ts
import { Vec3 } from "@tf-engine/core";

new Vec3(x?, y?, z?)
Vec3.zero()
Vec3.fromArray([x, y, z])
```

Operations: `add`, `subtract`, `scale`, `length`, `normalize`, `dot`, `cross`, `lerp`, `equals`, `toArray`, `toString`.

---

### `Quaternion`

```ts
import { Quaternion } from "@tf-engine/core";

new Quaternion(x?, y?, z?, w?)
Quaternion.identity()
Quaternion.fromAxisAngle(axis, angleRad)
Quaternion.fromEulerXYZ(x, y, z)   // radians
Quaternion.fromArray([x, y, z, w])
```

Operations: `multiply`, `invert`, `normalize`, `rotateVec3`, `slerp`, `equals`, `toArray`, `toString`.

---

### `CycleDetectedError`

Extends `Error`. Thrown by `TFTree.addFrame` / `TFTree.getTransform` when a cycle is detected.

```ts
import { CycleDetectedError } from "@tf-engine/core";

try {
  tf.addFrame("a", "b");
} catch (err) {
  if (err instanceof CycleDetectedError) {
    console.error(err.message);
  }
}
```

---

## Examples

### Cross-branch transform (siblings)

```ts
tf.addFrame("world");
tf.addFrame("arm", "world", new Transform(new Vec3(1, 0, 0)));
tf.addFrame("leg", "world", new Transform(new Vec3(0, 1, 0)));

// Express the leg origin in arm-local coordinates
const t = tf.getTransform("arm", "leg");
t.transformPoint(Vec3.zero()); // Vec3(-1, 1, 0)
```

### Subscribe to frame changes

```ts
tf.addFrame("world");
tf.addFrame("robot", "world");

const unsubscribe = tf.onChange("robot", () => {
  const t = tf.getTransform("world", "robot");
  console.log("robot moved to", t.translation);
});

tf.updateTransform("robot", new Transform(new Vec3(1, 0, 0)));
// → robot moved to Vec3(1, 0, 0)

unsubscribe();
```

### Serialize / deserialize

```ts
const snapshot = tf.toJSON();
const copy = TFTree.fromJSON(snapshot);
```

---

## Performance

Benchmarked on Node.js v24 with a 1 000-node graph:

| Scenario                                            | ops / sec  |
| --------------------------------------------------- | ---------- |
| `updateTransform` – single leaf (chain depth 1 000) | ~4 364 128 |
| `getTransform` – world → leaf (full traversal)      | ~8 636     |
| `updateTransforms` – batch 1 000 frames             | ~2 560     |

---

## Companion Packages

| Package                                                                          | Description                             |
| -------------------------------------------------------------------------------- | --------------------------------------- |
| [`@tf-engine/react`](https://www.npmjs.com/package/@tf-engine/react)             | `useTFFrame` React hook                 |
| [`@tf-engine/three`](https://www.npmjs.com/package/@tf-engine/three)             | Three.js `Matrix4` / `Object3D` helpers |
| [`@tf-engine/urdf-loader`](https://www.npmjs.com/package/@tf-engine/urdf-loader) | Load a ROS URDF XML into a `TFTree`     |

---

## License

MIT

# TF-engine

A TypeScript library for managing spatial transforms between named reference frames. Inspired by ROS's `tf2`, TF-engine models a **directed acyclic graph (DAG)** of frames where each frame stores its rigid-body transform relative to its parent. The engine can then resolve the transform between **any** two connected frames in O(depth) time.

## Features

- **`TFTree`** – register/remove frames, update transforms (single or batch), query the relative transform between any two frames, subscribe to frame-change events, and serialize/deserialize the whole tree.
- **`BufferedTFTree`** – extends `TFTree` with a time-stamped transform history; interpolates (LERP + SLERP) between historical samples so you can query "where was frame X at time T?".
- **`Transform`** – immutable rigid-body transform (translation + rotation) backed by gl-matrix 4×4 matrices.
- **`Vec3`** – immutable 3-component vector with common arithmetic helpers including linear interpolation (`lerp`).
- **`Quaternion`** – immutable unit quaternion with factory helpers (`fromAxisAngle`, `fromEulerXYZ`) and spherical linear interpolation (`slerp`).
- **`CycleDetectedError`** – typed error thrown when a cycle is detected in the frame graph.
- **`@tf-engine/urdf-loader`** – parse a ROS URDF XML string and hydrate a `TFTree` in one call.
- Full TypeScript type declarations included.

## Installation

```bash
npm install tf-engine
```

## Quick Start

```ts
import { TFTree, Transform, Vec3, Quaternion } from "tf-engine";

const tf = new TFTree();

// Register a root frame
tf.addFrame("world");

// Register a child frame offset 1 m along X
tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));

// Register a grandchild frame 0.5 m above the robot
tf.addFrame("camera", "robot", new Transform(new Vec3(0, 0, 0.5)));

// Resolve the transform that maps points from camera-local to world
const cameraInWorld = tf.getTransform("world", "camera");

// Apply the transform to a point expressed in camera-local space
const worldPoint = cameraInWorld.transformPoint(new Vec3(0, 0, 0));
// worldPoint → Vec3(1, 0, 0.5)
```

## API Reference

### `TFTree`

```ts
const tf = new TFTree();
```

| Method                                | Description                                                                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addFrame(id, parentId?, transform?)` | Register a new frame. Omit `parentId` for a root frame. Defaults to the identity transform. Throws if the frame already exists, the parent is not found, or a cycle would be introduced.                                                                              |
| `updateTransform(id, transform)`      | Replace the stored transform of an existing frame. Throws if the frame is not found.                                                                                                                                                                                  |
| `updateFrame(id, transform)`          | Alias for `updateTransform`.                                                                                                                                                                                                                                          |
| `updateTransforms(updates)`           | Batch-replace the transforms of multiple existing frames in one call. More efficient than repeated `updateTransform` calls when several frames share an ancestor. `updates` is a `Record<string, Transform>`. Throws if any id is not registered.                     |
| `removeFrame(id)`                     | Remove a registered frame. Throws if the frame is not found or still has child frames (remove children first).                                                                                                                                                        |
| `hasFrame(id)`                        | Returns `true` if the frame is registered.                                                                                                                                                                                                                            |
| `frameIds()`                          | Returns an array of all registered frame ids.                                                                                                                                                                                                                         |
| `getTransform(from, to)`              | Returns the `Transform` that maps points expressed in `from` to the coordinate system of `to`. Throws if either frame is unknown or the frames are not connected.                                                                                                     |
| `onChange(frameId, callback)`         | Subscribe to world-transform changes for `frameId`. The callback receives `frameId` whenever the frame's world transform changes (due to the frame itself or any ancestor being updated). Returns an **unsubscribe function**. Throws if `frameId` is not registered. |
| `toJSON()`                            | Serialize the entire tree to a plain JSON-compatible `TFTreeJSON` object. Frames are emitted in insertion order (parents before children).                                                                                                                            |
| `TFTree.fromJSON(data)`               | _(static)_ Reconstruct a `TFTree` from a `TFTreeJSON` object produced by `toJSON`.                                                                                                                                                                                    |

### `Transform`

```ts
new Transform(translation?: Vec3, rotation?: Quaternion)
Transform.identity()
```

| Method                    | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `compose(other)`          | Returns the composed transform (apply `this` then `other`).        |
| `invert()`                | Returns the inverse transform.                                     |
| `transformPoint(point)`   | Applies this transform to a 3-D point (rotation then translation). |
| `equals(other, epsilon?)` | Component-wise equality check.                                     |
| `toMat4()`                | Returns a column-major 4×4 `Float32Array`.                         |
| `Transform.fromMat4(m)`   | Decomposes a 4×4 matrix back into a `Transform`.                   |

### `Vec3`

```ts
new Vec3(x?, y?, z?)
Vec3.zero()
Vec3.fromArray([x, y, z])
```

Operations: `add`, `subtract`, `scale`, `length`, `normalize`, `dot`, `cross`, `lerp`, `equals`, `toArray`, `toString`.

### `Quaternion`

```ts
new Quaternion(x?, y?, z?, w?)
Quaternion.identity()
Quaternion.fromAxisAngle(axis, angleRad)
Quaternion.fromEulerXYZ(x, y, z)   // angles in radians
Quaternion.fromArray([x, y, z, w])
```

Operations: `multiply`, `invert`, `normalize`, `rotateVec3`, `slerp`, `equals`, `toArray`, `toString`.

### `CycleDetectedError`

Extends `Error`. Thrown by `TFTree.addFrame` and `TFTree.getTransform` when a cycle is detected.

```ts
import { CycleDetectedError } from "tf-engine";

try {
  tf.addFrame("a", "b");
} catch (err) {
  if (err instanceof CycleDetectedError) {
    console.error(err.message); // "Cycle detected in the transform tree at frame "a"."
  }
}
```

### `BufferedTFTree`

```ts
import { BufferedTFTree, BufferedTFTreeOptions } from "tf-engine";

new BufferedTFTree(options?: BufferedTFTreeOptions)
```

Extends `TFTree` with a rolling time-stamped history of transforms. Inherits all `TFTree` methods and adds:

| Method                                   | Description                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setTransform(id, transform, timestamp)` | Record a time-stamped transform for an existing frame. Also keeps the base-class current transform in sync so the non-temporal `getTransform` always reflects the most recent value. Throws if `id` is not registered.                                                                              |
| `getTransformAt(from, to, timestamp)`    | Returns the interpolated transform (LERP for translation, SLERP for rotation) between `from` and `to` at the given `timestamp` (ms). Falls back to the static registration transform for frames that have no history. Throws `RangeError` if the timestamp is older than the oldest buffered entry. |
| `removeFrame(id)`                        | Removes the frame and its time-stamped buffer. Inherited behaviour otherwise identical to `TFTree.removeFrame`.                                                                                                                                                                                     |

**`BufferedTFTreeOptions`**

| Option              | Type     | Default  | Description                                                                                                                         |
| ------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `maxBufferDuration` | `number` | `10_000` | Maximum age of buffered entries in milliseconds. Entries older than `latestTimestamp − maxBufferDuration` are pruned automatically. |

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

### Transform with rotation

```ts
import { Quaternion } from "tf-engine";

const rot90Z = new Transform(Vec3.zero(), Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2));

tf.addFrame("world");
tf.addFrame("rotated", "world", rot90Z);

// (1, 0, 0) in the rotated frame maps to (0, 1, 0) in world
const t = tf.getTransform("world", "rotated");
t.transformPoint(new Vec3(1, 0, 0)); // Vec3(0, 1, 0)
```

### Updating a frame at runtime

```ts
tf.addFrame("world");
tf.addFrame("robot", "world", new Transform(new Vec3(0, 0, 0)));

// Robot moves to (5, 0, 0)
tf.updateTransform("robot", new Transform(new Vec3(5, 0, 0)));
```

### Batch-updating multiple frames

```ts
tf.addFrame("world");
tf.addFrame("arm", "world", new Transform(new Vec3(1, 0, 0)));
tf.addFrame("leg", "world", new Transform(new Vec3(0, 1, 0)));

// Move both frames in one efficient call
tf.updateTransforms({
  arm: new Transform(new Vec3(2, 0, 0)),
  leg: new Transform(new Vec3(0, 2, 0)),
});
```

### Removing a frame

```ts
tf.addFrame("world");
tf.addFrame("sensor", "world", new Transform(new Vec3(0, 0, 1)));

// Remove the leaf frame
tf.removeFrame("sensor");
console.log(tf.hasFrame("sensor")); // false
```

### Subscribing to frame changes

```ts
tf.addFrame("world");
tf.addFrame("robot", "world", new Transform(new Vec3(0, 0, 0)));

const unsubscribe = tf.onChange("robot", (frameId) => {
  console.log(`${frameId} world-transform changed`);
});

tf.updateTransform("robot", new Transform(new Vec3(1, 0, 0)));
// → "robot world-transform changed"

// Stop listening
unsubscribe();
```

### Serializing and deserializing a tree

```ts
import { TFTree, Transform, Vec3 } from "tf-engine";

const tf = new TFTree();
tf.addFrame("world");
tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));

// Serialize to a plain JS object (safe to JSON.stringify)
const snapshot = tf.toJSON();

// Reconstruct an identical tree elsewhere
const copy = TFTree.fromJSON(snapshot);
console.log(copy.hasFrame("robot")); // true
```

### Time-stamped transforms with BufferedTFTree

```ts
import { BufferedTFTree, Transform, Vec3 } from "tf-engine";

const tf = new BufferedTFTree({ maxBufferDuration: 5_000 }); // 5-second window
tf.addFrame("world");
tf.addFrame("camera", "world");

const now = Date.now();
tf.setTransform("camera", new Transform(new Vec3(0, 0, 1)), now - 100);
tf.setTransform("camera", new Transform(new Vec3(0, 0, 2)), now);

// Interpolated position 50 ms in the past
const past = tf.getTransformAt("world", "camera", now - 50);
past.transformPoint(Vec3.zero()); // Vec3(0, 0, 1.5)
```

## Development

```bash
# Install dependencies
npm install

# Build (outputs to dist/)
npm run build

# Run tests with coverage
npm test

# Watch mode
npm run test:watch

# Run performance benchmarks
npm run bench
```

## Performance Benchmarks

The engine's O(depth) claim is validated with Vitest benchmarks against a **1 000-node graph**.
Run them yourself with `npm run bench` from the repo root.

Results on a standard CI machine (Node.js v24, Vitest 4):

| Scenario | ops / sec |
|---|---|
| `updateTransform` – single leaf frame (linear chain, depth 1 000) | **~4 364 128** |
| `getTransform` – world → leaf (linear chain, full traversal) | **~8 636** |
| `updateTransforms` – batch all 1 000 frames (linear chain) | **~2 560** |
| `updateTransforms` – batch ~1 000 frames (balanced binary tree, depth 10) | **~2 581** |

Key takeaways:
- **Single-frame updates** are essentially free — the dirty-flag mechanism propagates lazily so no recomputation happens until `getTransform` is called.
- **`getTransform`** across a 1 000-node chain (worst case) still exceeds **8 000 ops/sec**, well within real-time robotics requirements.
- **Batch updates** via `updateTransforms` efficiently skip redundant subtree traversals when ancestors are included in the same batch.

## `@tf-engine/urdf-loader`

A companion package that parses a [ROS URDF](https://wiki.ros.org/urdf/XML) XML string and hydrates a `TFTree`.

### Installation

```bash
npm install @tf-engine/urdf-loader
```

### Usage

```ts
import { loadUrdf } from "@tf-engine/urdf-loader";

const urdf = `
  <robot name="simple_arm">
    <link name="base_link"/>
    <link name="shoulder"/>
    <link name="elbow"/>

    <joint name="shoulder_joint" type="revolute">
      <parent link="base_link"/>
      <child link="shoulder"/>
      <origin xyz="0 0 0.5" rpy="0 0 0"/>
    </joint>

    <joint name="elbow_joint" type="revolute">
      <parent link="shoulder"/>
      <child link="elbow"/>
      <origin xyz="0 0 0.4" rpy="0 0 0"/>
    </joint>
  </robot>
`;

const tf = loadUrdf(urdf);

tf.hasFrame("base_link"); // true
tf.hasFrame("shoulder");  // true
tf.hasFrame("elbow");     // true

// Resolve elbow position in base_link space
const t = tf.getTransform("base_link", "elbow");
t.transformPoint(Vec3.zero()); // Vec3(0, 0, 0.9)
```

#### `loadUrdf(xml, options?)`

| Parameter | Type | Description |
|---|---|---|
| `xml` | `string` | Full URDF XML string. |
| `options.addRobotRoot` | `boolean` | When `true`, adds the robot's `name` attribute as an extra root frame that is the parent of all base links. Defaults to `false`. |

Throws `Error` if the XML is missing a `<robot>` element or if a joint references a link that is not declared.

## License

ISC

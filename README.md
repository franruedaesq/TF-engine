# TF-engine

A TypeScript library for managing spatial transforms between named reference frames. Inspired by ROS's `tf2`, TF-engine models a **directed acyclic graph (DAG)** of frames where each frame stores its rigid-body transform relative to its parent. The engine can then resolve the transform between **any** two connected frames in O(depth) time.

## Features

- **`TFTree`** – register frames, update transforms, and query the relative transform between any two frames.
- **`Transform`** – immutable rigid-body transform (translation + rotation) backed by gl-matrix 4×4 matrices.
- **`Vec3`** – immutable 3-component vector with common arithmetic helpers.
- **`Quaternion`** – immutable unit quaternion with factory helpers (`fromAxisAngle`, `fromEulerXYZ`).
- **`CycleDetectedError`** – typed error thrown when a cycle is detected in the frame graph.
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

| Method | Description |
|--------|-------------|
| `addFrame(id, parentId?, transform?)` | Register a new frame. Omit `parentId` for a root frame. Defaults to the identity transform. Throws if the frame already exists, the parent is not found, or a cycle would be introduced. |
| `updateTransform(id, transform)` | Replace the stored transform of an existing frame. Throws if the frame is not found. |
| `updateFrame(id, transform)` | Alias for `updateTransform`. |
| `hasFrame(id)` | Returns `true` if the frame is registered. |
| `frameIds()` | Returns an array of all registered frame ids. |
| `getTransform(from, to)` | Returns the `Transform` that maps points expressed in `from` to the coordinate system of `to`. Throws if either frame is unknown or the frames are not connected. |

### `Transform`

```ts
new Transform(translation?: Vec3, rotation?: Quaternion)
Transform.identity()
```

| Method | Description |
|--------|-------------|
| `compose(other)` | Returns the composed transform (apply `this` then `other`). |
| `invert()` | Returns the inverse transform. |
| `transformPoint(point)` | Applies this transform to a 3-D point (rotation then translation). |
| `equals(other, epsilon?)` | Component-wise equality check. |
| `toMat4()` | Returns a column-major 4×4 `Float32Array`. |
| `Transform.fromMat4(m)` | Decomposes a 4×4 matrix back into a `Transform`. |

### `Vec3`

```ts
new Vec3(x?, y?, z?)
Vec3.zero()
Vec3.fromArray([x, y, z])
```

Operations: `add`, `subtract`, `scale`, `length`, `normalize`, `dot`, `cross`, `equals`, `toArray`, `toString`.

### `Quaternion`

```ts
new Quaternion(x?, y?, z?, w?)
Quaternion.identity()
Quaternion.fromAxisAngle(axis, angleRad)
Quaternion.fromEulerXYZ(x, y, z)   // angles in radians
Quaternion.fromArray([x, y, z, w])
```

Operations: `multiply`, `invert`, `normalize`, `rotateVec3`, `equals`, `toArray`, `toString`.

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

const rot90Z = new Transform(
  Vec3.zero(),
  Quaternion.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2),
);

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
```

## License

ISC
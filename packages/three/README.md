# @tf-engine/three

> Three.js bridge for [`@tf-engine/core`](https://www.npmjs.com/package/@tf-engine/core) — map `Transform.toMat4()` `Float32Array`s directly into Three.js `Matrix4` / `Object3D`.

[![npm](https://img.shields.io/npm/v/@tf-engine/three)](https://www.npmjs.com/package/@tf-engine/three)
[![license](https://img.shields.io/npm/l/@tf-engine/three)](./LICENSE)

---

## Installation

```bash
npm install @tf-engine/three @tf-engine/core
```

**Peer dependencies**: `three >= 0.150.0`

---

## API

### `toMatrix4(transform, target)`

Copy a `Transform`'s 4×4 column-major matrix directly into a Three.js `Matrix4`.

Because `Transform.toMat4()` already returns a `Float32Array` in the same column-major layout that Three.js uses internally, this is a **zero-copy** operation: the 16 elements are assigned with a single `fromArray` call — no trigonometric re-computation required.

| Parameter | Type | Description |
|---|---|---|
| `transform` | `Transform` | Source transform from `@tf-engine/core`. |
| `target` | `Matrix4` | An existing `Matrix4` to mutate. |

**Returns** the mutated `Matrix4`.

---

### `applyToObject3D(transform, object)`

Apply a `Transform` to an `Object3D` by writing the matrix directly into `object.matrix` and setting `object.matrixAutoUpdate = false` so Three.js uses your matrix unchanged on the next render.

| Parameter | Type | Description |
|---|---|---|
| `transform` | `Transform` | Source transform. |
| `object` | `Object3D` | The Three.js object to update. |

---

## Usage

### Update a mesh matrix directly

```ts
import { Matrix4 } from "three";
import { toMatrix4 } from "@tf-engine/three";
import { TFTree, Transform, Vec3 } from "@tf-engine/core";

const tf = new TFTree();
tf.addFrame("world");
tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));

const mat = new Matrix4();
const transform = tf.getTransform("world", "robot");
toMatrix4(transform, mat);   // mat is now the world matrix of "robot"

mesh.matrix.copy(mat);
mesh.matrixAutoUpdate = false;
```

### Sync an Object3D in an animation loop

```ts
import { applyToObject3D } from "@tf-engine/three";

// Subscribe once — the callback runs whenever "robot" moves
tf.onChange("robot", () => {
  const transform = tf.getTransform("world", "robot");
  applyToObject3D(transform, robotMesh);
});
```

### Full render loop example

```ts
import { WebGLRenderer, Scene, PerspectiveCamera, BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import { TFTree, Transform, Vec3, Quaternion } from "@tf-engine/core";
import { applyToObject3D } from "@tf-engine/three";

const tf = new TFTree();
tf.addFrame("world");
tf.addFrame("robot", "world");

const robotMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
scene.add(robotMesh);

// Keep the mesh in sync with TFTree
tf.onChange("robot", () => {
  applyToObject3D(tf.getTransform("world", "robot"), robotMesh);
});

// Simulate movement
let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.01;
  tf.updateTransform("robot", new Transform(new Vec3(Math.sin(t), 0, 0)));
  renderer.render(scene, camera);
}
animate();
```

---

## Why zero-copy?

`Transform.toMat4()` produces a column-major `Float32Array` — the exact memory layout consumed by Three.js `Matrix4.fromArray()`. No conversion math is needed, making this bridge essentially free compared to extracting euler angles and rebuilding.

---

## License

ISC

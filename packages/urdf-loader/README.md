# @tf-engine/urdf-loader

> URDF loader for [`@tf-engine/core`](https://www.npmjs.com/package/@tf-engine/core) — parse a [ROS URDF](https://wiki.ros.org/urdf/XML) XML string and hydrate a `TFTree` in one call.

[![npm](https://img.shields.io/npm/v/@tf-engine/urdf-loader)](https://www.npmjs.com/package/@tf-engine/urdf-loader)
[![license](https://img.shields.io/npm/l/@tf-engine/urdf-loader)](./LICENSE)

---

## Installation

```bash
npm install @tf-engine/urdf-loader @tf-engine/core
```

---

## Usage

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

---

## API

### `loadUrdf(xml, options?)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `xml` | `string` | _(required)_ | Full URDF XML string. |
| `options.addRobotRoot` | `boolean` | `false` | When `true`, adds the robot's `name` attribute as an extra root frame that is the parent of all base links. |

**Returns** a populated `TFTree`.

**Throws**
- `Error` — if the XML is missing a `<robot>` element.
- `Error` — if a joint references a link not declared as a `<link>` element.

---

## What gets loaded

Each URDF `<link>` becomes a frame.  
Each `<joint>` defines the parent–child relationship and the static transform from `<origin xyz rpy>`.

- **Translation** — taken from `xyz` (metres, ROS convention).
- **Rotation** — converted from `rpy` (roll–pitch–yaw, extrinsic XYZ in radians) to a unit quaternion.
- **Joint types** — all types are treated as fixed for the purpose of the pose graph (dynamic joints require runtime `updateTransform` calls).

---

## Dynamic joints example

After loading, you can update joint transforms at runtime for revolute / prismatic joints:

```ts
import { loadUrdf } from "@tf-engine/urdf-loader";
import { Transform, Vec3, Quaternion } from "@tf-engine/core";

const tf = loadUrdf(urdf);

// Simulate a revolute joint rotating around Z
function setElbowAngle(angleRad: number) {
  tf.updateTransform(
    "elbow",
    new Transform(
      new Vec3(0, 0, 0.4),
      Quaternion.fromAxisAngle(new Vec3(0, 0, 1), angleRad),
    ),
  );
}

setElbowAngle(Math.PI / 4); // 45°
```

---

## Loading from a file (Node.js)

```ts
import { readFileSync } from "fs";
import { loadUrdf } from "@tf-engine/urdf-loader";

const xml = readFileSync("robot.urdf", "utf-8");
const tf = loadUrdf(xml);
```

## Loading from a URL (browser)

```ts
const response = await fetch("/robot.urdf");
const xml = await response.text();
const tf = loadUrdf(xml);
```

---

## License

ISC

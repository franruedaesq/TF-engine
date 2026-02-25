# @tf-engine/react

> React hook for [`@tf-engine/core`](https://www.npmjs.com/package/@tf-engine/core) — targeted re-renders on frame updates via `useSyncExternalStore`.

[![npm](https://img.shields.io/npm/v/@tf-engine/react)](https://www.npmjs.com/package/@tf-engine/react)
[![license](https://img.shields.io/npm/l/@tf-engine/react)](./LICENSE)

---

## Installation

```bash
npm install @tf-engine/react @tf-engine/core
```

**Peer dependencies**: `react >= 18.0.0`

---

## Usage

### `useTFFrame(tree, frameId, from?)`

A React hook that subscribes to world-transform changes for a **single frame** in an [`ITransformTree`](https://www.npmjs.com/package/@tf-engine/core) instance.

Internally uses `useSyncExternalStore`, so a component re-renders only when **that specific frame** (or one of its ancestors) changes — no unnecessary re-renders for unrelated frame updates.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `tree` | `ITransformTree` | _(required)_ | The `TFTree` or `BufferedTFTree` to observe. |
| `frameId` | `string` | _(required)_ | The frame id to subscribe to. |
| `from` | `string` | `frameId` | Source frame for the relative transform query. |

**Returns** `Transform | null` — `null` when the frame is not yet registered.

---

### Example

```tsx
import { useRef } from "react";
import { TFTree, Transform, Vec3 } from "@tf-engine/core";
import { useTFFrame } from "@tf-engine/react";

// Create the tree once (outside the component or in a context/store)
const tf = new TFTree();
tf.addFrame("world");
tf.addFrame("robot", "world", new Transform(new Vec3(0, 0, 0)));

function RobotMarker() {
  const transform = useTFFrame(tf, "robot", "world");

  if (!transform) return null;

  const { x, y } = transform.translation;

  return (
    <div
      style={{
        position: "absolute",
        left: x * 100,
        top:  y * 100,
        width: 20,
        height: 20,
        background: "red",
        borderRadius: "50%",
      }}
    />
  );
}

// Somewhere else — move the robot; RobotMarker re-renders automatically
function moveRobot(pos: Vec3) {
  tf.updateTransform("robot", new Transform(pos));
}
```

---

### Using with a shared context

For larger apps, put the `TFTree` instance in a React context so any component can access it:

```tsx
import { createContext, useContext } from "react";
import { TFTree } from "@tf-engine/core";
import { useTFFrame } from "@tf-engine/react";

const TFContext = createContext<TFTree | null>(null);

export function TFProvider({ children }: { children: React.ReactNode }) {
  const tree = useMemo(() => {
    const tf = new TFTree();
    tf.addFrame("world");
    return tf;
  }, []);
  return <TFContext.Provider value={tree}>{children}</TFContext.Provider>;
}

export function useRobotTransform() {
  const tree = useContext(TFContext)!;
  return useTFFrame(tree, "robot", "world");
}
```

---

## License

ISC

import { useSyncExternalStore } from "react";
import type { ITransformTree } from "@tf-engine/core";
import type { Transform } from "@tf-engine/core";

/**
 * React hook that subscribes to world-transform changes for a single frame
 * in a {@link ITransformTree} instance.
 *
 * Internally uses React's `useSyncExternalStore` so the component re-renders
 * only when **that specific frame** (or one of its ancestors) is updated —
 * no unnecessary re-renders for unrelated frame changes.
 *
 * @param tree    The {@link ITransformTree} instance to observe.
 * @param frameId The frame id to subscribe to.
 * @param from    The source frame for the relative transform query.
 *                Defaults to `frameId` itself (returns the world transform
 *                when `frameId` is a root, or the identity when `from === frameId`).
 *
 * @returns The current {@link Transform} between `from` and `frameId`,
 *          or `null` when the frame is not yet registered.
 *
 * @example
 * ```tsx
 * const tf = new TFTree();
 * tf.addFrame("world");
 * tf.addFrame("robot", "world", new Transform(new Vec3(1, 0, 0)));
 *
 * function RobotOverlay() {
 *   const transform = useTFFrame(tf, "robot", "world");
 *   if (!transform) return null;
 *   const [x, y] = [transform.translation.x, transform.translation.y];
 *   return <div style={{ left: x * 100, top: y * 100 }} />;
 * }
 * ```
 */
export function useTFFrame(
  tree: ITransformTree,
  frameId: string,
  from: string = frameId,
): Transform | null {
  // subscribe: called by useSyncExternalStore to register/unregister the listener.
  // Returns the unsubscribe function directly from tree.onChange.
  const subscribe = (onStoreChange: () => void): (() => void) => {
    if (!tree.hasFrame(frameId)) {
      return () => {};
    }
    return tree.onChange(frameId, onStoreChange);
  };

  // getSnapshot: returns the current value synchronously.
  const getSnapshot = (): Transform | null => {
    if (!tree.hasFrame(frameId)) return null;
    try {
      return tree.getTransform(from, frameId);
    } catch {
      return null;
    }
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

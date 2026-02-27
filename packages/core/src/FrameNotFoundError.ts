/**
 * Thrown when a requested frame id is not registered in the transform tree.
 *
 * Provides a typed alternative to a generic `Error` so callers can
 * distinguish "frame not found" failures from other runtime errors:
 *
 * @example
 * ```ts
 * try {
 *   tf.getTransform("world", "unknown");
 * } catch (err) {
 *   if (err instanceof FrameNotFoundError) {
 *     console.error(`Missing frame: ${err.frameId}`);
 *   }
 * }
 * ```
 */
export class FrameNotFoundError extends Error {
  /** The id of the frame that was not found. */
  readonly frameId: string;

  constructor(frameId: string) {
    super(`Frame "${frameId}" not found.`);
    this.name = "FrameNotFoundError";
    this.frameId = frameId;
  }
}

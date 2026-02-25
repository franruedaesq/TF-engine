/**
 * Thrown when a cyclic dependency is detected in the transform tree,
 * which would violate the Directed Acyclic Graph (DAG) invariant.
 */
export class CycleDetectedError extends Error {
  constructor(frameId: string) {
    super(`Cycle detected in the transform tree at frame "${frameId}".`);
    this.name = "CycleDetectedError";
  }
}

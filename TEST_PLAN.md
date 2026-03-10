# Test Plan: Rust/WASM Core Rewrite

## 1. Overview
This document outlines the testing strategy for verifying the rewrite of the `@tf-engine/core` logic in Rust (WASM).
The primary goal is to improve performance and safety while maintaining **100% backward compatibility** with the existing TypeScript API.
Users of the library should not need to change any code when upgrading.

## 2. Backward Compatibility (Functional Parity)
The public API must remain **identical** in types, signatures, and behavior.

### 2.1 Critical Test Scenarios
These existing tests in `packages/core/tests/` **must pass** without modification:
- **`TFTree.test.ts`**:
    - `addFrame` / `removeFrame`: Verify correct graph construction and teardown.
    - `getTransform(from, to)`: Verify correct computation across various depths (parent->child, child->parent, siblings, cousins).
    - `updateTransform`: Verify updates propagate correctly to `getTransform` results.
    - `onChange`: Verify listeners are triggered only when relevant frames (or ancestors) change.
    - `CycleDetectedError`: Verify cycles are detected and throw the correct error class.
    - `Disconnected Graphs`: Verify `getTransform` throws when frames are in separate trees.
- **`BufferedTFTree.test.ts`**:
    - `getTransformAt(time)`: Verify interpolation (LERP/SLERP) works correctly between timestamps.
    - `maxBufferDuration`: Verify old data is pruned correctly.

### 2.2 API Type Checking
- **Type Definitions**: Create a `dts-test.ts` file that imports all exports and asserts they match expected signatures (e.g., using `tsd` or simply compiling it).
    - `new TFTree()` (synchronous constructor).
    - `addFrame(id: string, parentId?: string, transform?: Transform): void`.
    - `getTransform(from: string, to: string): Transform`.

## 3. WASM Specifics

### 3.1 Environment & Loading
One of the biggest challenges with WASM is loading, which is often asynchronous in browsers.

#### **Node.js Integration**
- **Test**: Create a `test-node-require.js` script.
    - Verify `require('@tf-engine/core')` works in a plain Node script without extra flags.
    - Verify `import { TFTree } from '@tf-engine/core'` works in an ESM Node script.
    - **Goal**: Ensure the synchronous `fs.readFileSync` based loading works seamlessly.

#### **Browser Integration (Vite/Webpack)**
- **Test**: Create a minimal Vite project in `packages/core/tests/browser-integration`.
    - `index.html` imports `main.ts`.
    - `main.ts` imports `TFTree`, instantiates it, and logs a transform.
    - Run `vite build` and `vite preview`.
    - **Goal**: Ensure the WASM module is correctly bundled and loaded (handling async instantiation if necessary, though ideally hidden behind a sync API or top-level await if supported).
    - **Challenge**: The synchronous `new TFTree()` API might require a global `await init()` or similar if synchronous WASM instantiation isn't feasible in all target browsers.

### 3.2 Performance Benchmarks
We need to quantify the trade-offs of using WASM.

#### **Micro-benchmarks (Boundary Overhead)**
- **Test**: `bench-overhead.ts` (using `vitest bench`).
    - **Scenario**: Create a tree with 2 frames (World -> Robot).
    - **Operation**: Call `getTransform('world', 'robot')` 1,000,000 times.
    - **Expectation**: WASM overhead (crossing JS <-> Rust boundary) should be minimal (< 2x slower than pure JS). If it's significantly slower, we might need to optimize the binding interface (e.g., using `Float64Array` views instead of returning objects).

#### **Macro-benchmarks (Throughput)**
- **Test**: `bench-heavy.ts`.
    - **Scenario**: Deep hierarchy (Depth 100) or massive flat tree (10,000 children).
    - **Operation**: Update 1,000 frames using `updateTransforms` (batch update).
    - **Expectation**: Rust should be **significantly faster (> 5x)** due to efficient graph traversal and lack of GC overhead for intermediate calculations.

### 3.3 Memory Safety
- **Test**: `test-memory-leak.ts`.
    - **Scenario**: Run a loop 10,000 times:
        - `const tf = new TFTree();`
        - Add 100 frames.
        - `tf = null;` (dereference).
        - Trigger GC (if possible in test env) or wait.
    - **Measurement**: Monitor `process.memoryUsage().heapUsed` and `external`.
    - **Goal**: Ensure the underlying WASM memory is freed. Rust's `Drop` trait should handle cleanup, but we need to verify `wasm-bindgen` correctly calls `free()`.

## 4. Ecosystem Integration

### 4.1 `@tf-engine/react`
- **Test**: `react-render-test.tsx`.
    - Mount a component: `<RobotViewer tf={tf} />` which uses `useTFFrame(tf, 'robot')`.
    - Update `tf` transform.
    - Assert: Component re-renders exactly **once** with the new value.
    - Assert: Unmounting the component unsubscribes correctly (no errors on subsequent updates).

### 4.2 `@tf-engine/three`
- **Test**: `three-integration.ts`.
    - Create a `THREE.Object3D`.
    - Call `applyToObject3D(tf.getTransform(...), obj)`.
    - Assert: `obj.matrix` matches the expected 4x4 matrix.
    - Assert: `obj.matrixAutoUpdate` is set to `false`.

### 4.3 `@tf-engine/urdf-loader`
- **Test**: `urdf-loading.ts`.
    - Load a complex URDF string (e.g., a 6-DOF arm).
    - Verify the resulting `TFTree` has the correct structure and initial transforms.
    - Verify `getTransform` matches manual calculation for a specific joint configuration.

## 5. Build & CI
- **Toolchain**:
    - Verify `wasm-pack` build succeeds in CI (GitHub Actions).
    - Ensure `npm run build` generates:
        - `dist/index.js` (ESM)
        - `dist/index.cjs` (CJS)
        - `dist/index.d.ts` (Types)
        - `dist/tf_engine_core_bg.wasm` (Binary)
- **Artifacts**:
    - Check `package.json` `files` array includes `dist/` and `src/` (for source maps).

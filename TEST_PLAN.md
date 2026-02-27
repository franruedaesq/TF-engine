# Test Plan: Rust/WASM Core Rewrite

## 1. Overview
This document outlines the testing strategy for verifying the rewrite of the `@tf-engine/core` logic in Rust (WASM).
The primary goal is to improve performance and safety while maintaining **100% backward compatibility** with the existing TypeScript API.
Users of the library should not need to change any code when upgrading.

## 2. Backward Compatibility (Functional Parity)
The most critical requirement is that the public API remains identical.

### 2.1 API Interface
- **Types**: Ensure all exported types (`TFTree`, `BufferedTFTree`, `Transform`, `Vec3`, `Quaternion`, `ITransformTree`) match the previous definitions exactly.
- **Signatures**: Verify function signatures (arguments, return types) are unchanged.

### 2.2 Behavioral Equivalence
- **Existing Tests**: The existing Vitest suite (`packages/core/tests/`) must pass without modification.
    - `TFTree.test.ts`: CRUD operations, hierarchy, cycle detection.
    - `BufferedTFTree.test.ts`: Time-based interpolation, buffer pruning.
    - `Transform.test.ts`, `Vec3.test.ts`, `Quaternion.test.ts`: Math operations.
- **Edge Cases**:
    - **Cycle Detection**: Ensure `CycleDetectedError` is thrown correctly (and is the same class).
    - **Disconnected Graphs**: `getTransform` should throw specific errors for unconnected frames.
    - **Re-adding Frames**: Behavior when adding a frame that was previously removed.

## 3. WASM Specifics

### 3.1 Environment & Loading
One of the biggest challenges with WASM is loading, which is often asynchronous in browsers.
- **Node.js**:
    - Verify synchronous loading works as it does now (using `fs.readFileSync` + `new WebAssembly.Module`).
    - The `new TFTree()` constructor must remain synchronous.
- **Browser (Bundlers)**:
    - **Vite/Webpack**: Create integration tests using these bundlers to ensure the WASM module loads correctly.
    - **Async vs Sync**: Investigate if `await init()` is required. If so, document how to maintain the synchronous `new TFTree()` API (e.g., internal lazy loading or a global init function).
    - **WASM File Serving**: Ensure the `.wasm` file is correctly located and served by the bundler.

### 3.2 Performance & Overhead
WASM has a call overhead. We need to measure where it helps and where it might hurt.
- **Micro-benchmarks (Overhead)**:
    - Measure the cost of `getTransform` on a very shallow tree (depth 1 or 2). This tests the JS-WASM boundary cost.
    - Goal: Ensure overhead is negligible for simple cases.
- **Macro-benchmarks (Throughput)**:
    - **Deep Trees**: Measure `getTransform` on deep chains (100+ frames). Rust should outperform JS here.
    - **Batch Updates**: Measure `updateTransforms` with 1000+ updates. The Rust implementation should significantly outperform JS by minimizing traversals.
    - **Creation/Destruction**: Cost of creating and garbage collecting `TFTree` instances.

### 3.3 Memory Safety
- **Leak Detection**:
    - Create a test that instantiates and discards thousands of `TFTree` objects.
    - Monitor memory usage to ensuring the WASM memory (linear memory) is freed or reused correctly.
    - Verify `free()` (if exposed) is called or managed automatically by `FinalizationRegistry`.

## 4. Ecosystem Integration
The core package is used by other packages in the monorepo.

### 4.1 `@tf-engine/react`
- **Hooks**: Verify `useTFFrame` works seamlessly.
- **Re-renders**: Ensure subscriptions (`onChange`) fire correctly and trigger React updates.

### 4.2 `@tf-engine/three`
- **Object3D**: Verify `applyToObject3D` correctly updates Three.js objects.
- **Matrix4**: Verify `toMatrix4` produces the correct matrix.

### 4.3 `@tf-engine/urdf-loader`
- **URDF Parsing**: Verify `loadUrdf` correctly populates the Rust-backed `TFTree` from XML input.
- **Large Robots**: Test with complex URDFs (e.g., humanoid robots) to verify performance and correctness.

## 5. Build & CI
- **Toolchain**:
    - Verify `wasm-pack` is installed or available in the CI environment.
    - Ensure `npm run build` in `core` correctly invokes the Rust build.
- **Artifacts**:
    - Check that the `dist/` folder contains both the JS bindings and the `.wasm` file.
    - Verify the `package.json` exports point to the correct files.

//! Rust/WASM core for tf-engine.
//!
//! Exposes [`TfTreeWasm`] – a high-performance transform-tree that mirrors the
//! TypeScript `TFTree` public API.  All heavy math uses [`glam`] (SIMD-aware
//! where available); the JS-WASM boundary is crossed only for frame mutations
//! and for the final `get_transform` result.

use js_sys::Array;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

// ── math helpers ──────────────────────────────────────────────────────────────

/// A rigid-body transform stored as `[tx, ty, tz, rx, ry, rz, rw]`.
type RawTransform = [f64; 7];

/// Identity transform.
#[inline]
fn identity() -> RawTransform {
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0]
}

/// Compose two rigid-body transforms using quaternion math.
///
/// `compose(A, B)` returns the transform equivalent to first applying A then B,
/// i.e. `result.t = A.t + A.r.rotate(B.t)`, `result.r = A.r * B.r`.
fn compose(a: &RawTransform, b: &RawTransform) -> RawTransform {
    let at = glam::DVec3::new(a[0], a[1], a[2]);
    let ar = glam::DQuat::from_xyzw(a[3], a[4], a[5], a[6]);
    let bt = glam::DVec3::new(b[0], b[1], b[2]);
    let br = glam::DQuat::from_xyzw(b[3], b[4], b[5], b[6]);

    let result_t = at + ar * bt;
    let result_r = (ar * br).normalize();
    [
        result_t.x,
        result_t.y,
        result_t.z,
        result_r.x,
        result_r.y,
        result_r.z,
        result_r.w,
    ]
}

/// Invert a rigid-body transform such that `compose(t, invert(t)) ≈ identity`.
fn invert_transform(t: &RawTransform) -> RawTransform {
    let tv = glam::DVec3::new(t[0], t[1], t[2]);
    let r = glam::DQuat::from_xyzw(t[3], t[4], t[5], t[6]);
    let r_inv = r.inverse();
    let t_inv = r_inv * (-tv);
    [t_inv.x, t_inv.y, t_inv.z, r_inv.x, r_inv.y, r_inv.z, r_inv.w]
}

// ── internal frame node ───────────────────────────────────────────────────────

#[derive(Clone)]
struct Frame {
    id: String,
    parent_id: Option<String>,
    transform: RawTransform,
}

// ── JSON serialisation helpers ────────────────────────────────────────────────

/// Used by `to_json` / `from_json` – matches the `TFTreeJSON` TypeScript type.
#[derive(Serialize, Deserialize)]
struct TreeJson {
    frames: Vec<FrameJson>,
}

#[derive(Serialize, Deserialize)]
struct FrameJson {
    id: String,
    #[serde(rename = "parentId")]
    parent_id: Option<String>,
    transform: TransformJson,
}

#[derive(Serialize, Deserialize)]
struct TransformJson {
    translation: [f64; 3],
    rotation: [f64; 4],
}

/// Input shape for `update_frames_batch`.
#[derive(Serialize, Deserialize)]
struct FrameUpdateJson {
    id: String,
    tx: f64,
    ty: f64,
    tz: f64,
    rx: f64,
    ry: f64,
    rz: f64,
    rw: f64,
}

// ── TfTreeWasm ────────────────────────────────────────────────────────────────

/// High-performance transform tree backed by [`glam`] math.
///
/// Intended to be used from TypeScript as an internal implementation detail
/// of `TFTree`.  All public methods are callable via wasm-bindgen.
#[wasm_bindgen]
pub struct TfTreeWasm {
    /// Canonical frame data: local transforms and parent links.
    frames: HashMap<String, Frame>,
    /// Adjacency list for efficient subtree traversal.
    children_map: HashMap<String, Vec<String>>,
    /// Cached accumulated world transforms (from subtree root down to each frame).
    world_cache: HashMap<String, RawTransform>,
    /// Frames whose world transform is stale and must be recomputed.
    dirty_set: HashSet<String>,
}

#[wasm_bindgen]
impl TfTreeWasm {
    // ── lifecycle ─────────────────────────────────────────────────────────────

    #[wasm_bindgen(constructor)]
    pub fn new() -> TfTreeWasm {
        TfTreeWasm {
            frames: HashMap::new(),
            children_map: HashMap::new(),
            world_cache: HashMap::new(),
            dirty_set: HashSet::new(),
        }
    }

    // ── frame registration ────────────────────────────────────────────────────

    /// Register a new frame.
    ///
    /// Returns `Err` (thrown as JS exception) if `id` is already registered,
    /// `parent_id` is not found, or adding the frame would create a cycle.
    pub fn add_frame(
        &mut self,
        id: &str,
        parent_id: Option<String>,
        tx: f64,
        ty: f64,
        tz: f64,
        rx: f64,
        ry: f64,
        rz: f64,
        rw: f64,
    ) -> Result<(), JsValue> {
        if self.frames.contains_key(id) {
            return Err(JsValue::from_str(&format!(
                "Frame \"{id}\" is already registered."
            )));
        }
        if let Some(ref pid) = parent_id {
            if !self.frames.contains_key(pid.as_str()) {
                return Err(JsValue::from_str(&format!(
                    "Parent frame \"{pid}\" not found. Register parents before children."
                )));
            }
            // Cycle guard: walk the parent chain.
            let mut current = Some(pid.clone());
            while let Some(cur) = current {
                if cur == id {
                    return Err(JsValue::from_str(&format!("CycleDetectedError:{id}")));
                }
                current = self.frames.get(&cur).and_then(|f| f.parent_id.clone());
            }
        }

        self.frames.insert(
            id.to_string(),
            Frame {
                id: id.to_string(),
                parent_id: parent_id.clone(),
                transform: [tx, ty, tz, rx, ry, rz, rw],
            },
        );
        self.dirty_set.insert(id.to_string());
        self.children_map.entry(id.to_string()).or_default();
        if let Some(pid) = parent_id {
            self.children_map.entry(pid).or_default().push(id.to_string());
        }
        Ok(())
    }

    /// Update the local transform of an existing frame.
    ///
    /// Returns a JS `Array<string>` containing the IDs of every frame whose
    /// world transform is now stale (the updated frame and all its descendants).
    /// The caller is responsible for firing change-listeners for these IDs.
    pub fn update_frame(
        &mut self,
        id: &str,
        tx: f64,
        ty: f64,
        tz: f64,
        rx: f64,
        ry: f64,
        rz: f64,
        rw: f64,
    ) -> Result<Array, JsValue> {
        // Scope the mutable borrow so it ends before we call collect_subtree.
        {
            let frame = self.frames.get_mut(id).ok_or_else(|| {
                JsValue::from_str(&format!("Frame \"{id}\" not found."))
            })?;
            frame.transform = [tx, ty, tz, rx, ry, rz, rw];
        }
        let dirty = self.collect_subtree(id);
        self.apply_dirty(&dirty);
        Ok(strings_to_js_array(&dirty))
    }

    /// Batch-update multiple frames at once.
    ///
    /// `updates_json` must be a JSON array of
    /// `{ id, tx, ty, tz, rx, ry, rz, rw }` objects.
    ///
    /// Returns a JS `Array<string>` of all stale frame IDs (the union of every
    /// affected subtree, with ancestor-deduplication applied so that subtrees
    /// are not enumerated redundantly).
    pub fn update_frames_batch(&mut self, updates_json: &str) -> Result<Array, JsValue> {
        let updates: Vec<FrameUpdateJson> = serde_json::from_str(updates_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        // First pass: validate all ids.
        for u in &updates {
            if !self.frames.contains_key(&u.id) {
                return Err(JsValue::from_str(&format!("Frame \"{}\" not found.", u.id)));
            }
        }
        // Second pass: apply transforms.
        for u in &updates {
            if let Some(frame) = self.frames.get_mut(&u.id) {
                frame.transform = [u.tx, u.ty, u.tz, u.rx, u.ry, u.rz, u.rw];
            }
        }

        // Third pass: mark dirty, skipping frames whose ancestor is also in
        // the batch (the ancestor's subtree already covers those descendants).
        let ids: HashSet<String> = updates.iter().map(|u| u.id.clone()).collect();
        let mut all_dirty: HashSet<String> = HashSet::new();

        for id in &ids {
            let mut parent = self.frames.get(id).and_then(|f| f.parent_id.clone());
            let mut ancestor_in_batch = false;
            while let Some(pid) = parent {
                if ids.contains(&pid) {
                    ancestor_in_batch = true;
                    break;
                }
                parent = self.frames.get(&pid).and_then(|f| f.parent_id.clone());
            }
            if !ancestor_in_batch {
                all_dirty.extend(self.collect_subtree(id));
            }
        }

        let dirty: Vec<String> = all_dirty.into_iter().collect();
        self.apply_dirty(&dirty);
        Ok(strings_to_js_array(&dirty))
    }

    /// Remove a registered frame.
    ///
    /// Returns `Err` if `id` is not registered or if the frame still has
    /// child frames.
    pub fn remove_frame(&mut self, id: &str) -> Result<(), JsValue> {
        if !self.frames.contains_key(id) {
            return Err(JsValue::from_str(&format!("Frame \"{id}\" not found.")));
        }
        if let Some(children) = self.children_map.get(id) {
            if !children.is_empty() {
                return Err(JsValue::from_str(&format!(
                    "Cannot remove frame \"{id}\": it still has child frames. Remove children first."
                )));
            }
        }

        let parent_id = self.frames.get(id).and_then(|f| f.parent_id.clone());
        self.frames.remove(id);
        self.world_cache.remove(id);
        self.dirty_set.remove(id);
        self.children_map.remove(id);
        if let Some(pid) = parent_id {
            if let Some(siblings) = self.children_map.get_mut(&pid) {
                siblings.retain(|s| s != id);
            }
        }
        Ok(())
    }

    // ── query ─────────────────────────────────────────────────────────────────

    /// Returns `true` if `id` is registered.
    pub fn has_frame(&self, id: &str) -> bool {
        self.frames.contains_key(id)
    }

    /// Returns `true` if the frame has at least one registered child.
    pub fn has_children(&self, id: &str) -> bool {
        self.children_map
            .get(id)
            .map(|c| !c.is_empty())
            .unwrap_or(false)
    }

    /// Compute the transform that maps points in `from` to the coordinate
    /// system of `to`, i.e. `p_to = T.transformPoint(p_from)`.
    ///
    /// Returns a `Float64Array` `[tx, ty, tz, rx, ry, rz, rw]`.
    ///
    /// Returns `Err` if either frame is not registered, the frames are
    /// disconnected, or a cycle is detected.
    pub fn get_transform(&mut self, from: &str, to: &str) -> Result<js_sys::Float64Array, JsValue> {
        if !self.frames.contains_key(from) {
            return Err(JsValue::from_str(&format!("Frame \"{from}\" not found.")));
        }
        if !self.frames.contains_key(to) {
            return Err(JsValue::from_str(&format!("Frame \"{to}\" not found.")));
        }
        if from == to {
            return Ok(raw_to_float64array(&identity()));
        }

        // Verify connectivity (LCA exists) using the frame chain.
        let from_chain = self.chain_to_root(from)?;
        let to_chain = self.chain_to_root(to)?;
        let to_chain_set: HashSet<&str> = to_chain.iter().map(String::as_str).collect();

        if !from_chain.iter().any(|id| to_chain_set.contains(id.as_str())) {
            return Err(JsValue::from_str(&format!(
                "Frames \"{from}\" and \"{to}\" are not connected in the same tree."
            )));
        }

        let from_world = self.compute_world_transform(from)?;
        let to_world = self.compute_world_transform(to)?;
        let result = compose(&invert_transform(&from_world), &to_world);
        Ok(raw_to_float64array(&result))
    }

    /// Returns a `Float64Array` `[tx, ty, tz, rx, ry, rz, rw]` representing
    /// the accumulated world transform for `id` (from the subtree root down).
    pub fn get_world_transform(&mut self, id: &str) -> Result<js_sys::Float64Array, JsValue> {
        let t = self.compute_world_transform(id)?;
        Ok(raw_to_float64array(&t))
    }

    // ── serialisation ─────────────────────────────────────────────────────────

    /// Serialize the tree to a JSON string that matches the `TFTreeJSON`
    /// TypeScript type.  Frames are emitted in an arbitrary order (the
    /// TypeScript layer maintains insertion-order via its own Map).
    pub fn to_json(&self) -> Result<String, JsValue> {
        let frames: Vec<FrameJson> = self
            .frames
            .values()
            .map(|f| FrameJson {
                id: f.id.clone(),
                parent_id: f.parent_id.clone(),
                transform: TransformJson {
                    translation: [f.transform[0], f.transform[1], f.transform[2]],
                    rotation: [f.transform[3], f.transform[4], f.transform[5], f.transform[6]],
                },
            })
            .collect();
        serde_json::to_string(&TreeJson { frames })
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Reconstruct a `TfTreeWasm` from a JSON string produced by `to_json`.
    ///
    /// Frames must be listed parent-before-child (guaranteed by the TypeScript
    /// `TFTree.toJSON` implementation).
    pub fn from_json(json: &str) -> Result<TfTreeWasm, JsValue> {
        let data: TreeJson = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let mut tree = TfTreeWasm::new();
        for f in data.frames {
            let [tx, ty, tz] = f.transform.translation;
            let [rx, ry, rz, rw] = f.transform.rotation;
            tree.add_frame(&f.id, f.parent_id, tx, ty, tz, rx, ry, rz, rw)?;
        }
        Ok(tree)
    }
}

// ── private helpers ───────────────────────────────────────────────────────────

impl TfTreeWasm {
    /// Collect every frame in the subtree rooted at `id` (inclusive) and
    /// return their IDs.  Order is unspecified; callers only need the complete
    /// set of descendants, not a particular traversal sequence.
    fn collect_subtree(&self, id: &str) -> Vec<String> {
        let mut result = Vec::new();
        let mut queue = vec![id.to_string()];
        while let Some(current) = queue.pop() {
            if let Some(children) = self.children_map.get(&current) {
                for child in children {
                    queue.push(child.clone());
                }
            }
            result.push(current);
        }
        result
    }

    /// Mark each ID in `dirty` as stale: remove from world_cache and add to
    /// dirty_set.
    fn apply_dirty(&mut self, dirty: &[String]) {
        for id in dirty {
            self.world_cache.remove(id);
            self.dirty_set.insert(id.clone());
        }
    }

    /// Walk `id` up to the subtree root and return the chain of IDs
    /// (id → parent → … → root).
    ///
    /// Returns `Err` if a cycle is detected.
    fn chain_to_root(&self, id: &str) -> Result<Vec<String>, JsValue> {
        let mut chain = Vec::new();
        let mut current = Some(id.to_string());
        let mut visited = HashSet::new();
        while let Some(cur) = current {
            if visited.contains(&cur) {
                return Err(JsValue::from_str(&format!("CycleDetectedError:{cur}")));
            }
            visited.insert(cur.clone());
            chain.push(cur.clone());
            current = self.frames.get(&cur).and_then(|f| f.parent_id.clone());
        }
        Ok(chain)
    }

    /// Return the cached world transform for `id`, recomputing it (and caching
    /// the result) when the frame is dirty.
    fn compute_world_transform(&mut self, id: &str) -> Result<RawTransform, JsValue> {
        if !self.dirty_set.contains(id) {
            if let Some(&cached) = self.world_cache.get(id) {
                return Ok(cached);
            }
        }

        // Clone the frame to avoid holding a borrow on `self.frames` across
        // the recursive call.
        let frame = self
            .frames
            .get(id)
            .cloned()
            .ok_or_else(|| JsValue::from_str(&format!("Frame \"{id}\" not found.")))?;

        let world = match &frame.parent_id {
            None => frame.transform,
            Some(pid) => {
                let parent_world = self.compute_world_transform(pid)?;
                compose(&parent_world, &frame.transform)
            }
        };

        self.world_cache.insert(id.to_string(), world);
        self.dirty_set.remove(id);
        Ok(world)
    }
}

// ── utility fns ───────────────────────────────────────────────────────────────

fn strings_to_js_array(v: &[String]) -> Array {
    let arr = Array::new();
    for s in v {
        arr.push(&JsValue::from_str(s));
    }
    arr
}

fn raw_to_float64array(t: &RawTransform) -> js_sys::Float64Array {
    js_sys::Float64Array::from(t.as_slice())
}

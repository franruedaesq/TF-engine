/* @ts-self-types="./index.d.ts" */

/**
 * High-performance transform tree backed by [`glam`] math.
 *
 * Intended to be used from TypeScript as an internal implementation detail
 * of `TFTree`.  All public methods are callable via wasm-bindgen.
 */
class TfTreeWasm {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TfTreeWasm.prototype);
        obj.__wbg_ptr = ptr;
        TfTreeWasmFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TfTreeWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_tftreewasm_free(ptr, 0);
    }
    /**
     * Register a new frame.
     *
     * Returns `Err` (thrown as JS exception) if `id` is already registered,
     * `parent_id` is not found, or adding the frame would create a cycle.
     * @param {string} id
     * @param {string | null | undefined} parent_id
     * @param {number} tx
     * @param {number} ty
     * @param {number} tz
     * @param {number} rx
     * @param {number} ry
     * @param {number} rz
     * @param {number} rw
     */
    add_frame(id, parent_id, tx, ty, tz, rx, ry, rz, rw) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(parent_id) ? 0 : passStringToWasm0(parent_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_add_frame(this.__wbg_ptr, ptr0, len0, ptr1, len1, tx, ty, tz, rx, ry, rz, rw);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Reconstruct a `TfTreeWasm` from a JSON string produced by `to_json`.
     *
     * Frames must be listed parent-before-child (guaranteed by the TypeScript
     * `TFTree.toJSON` implementation).
     * @param {string} json
     * @returns {TfTreeWasm}
     */
    static from_json(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_from_json(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return TfTreeWasm.__wrap(ret[0]);
    }
    /**
     * Compute the transform that maps points in `from` to the coordinate
     * system of `to`, i.e. `p_to = T.transformPoint(p_from)`.
     *
     * Returns a `Float64Array` `[tx, ty, tz, rx, ry, rz, rw]`.
     *
     * Returns `Err` if either frame is not registered, the frames are
     * disconnected, or a cycle is detected.
     * @param {string} from
     * @param {string} to
     * @returns {Float64Array}
     */
    get_transform(from, to) {
        const ptr0 = passStringToWasm0(from, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_get_transform(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Returns a `Float64Array` `[tx, ty, tz, rx, ry, rz, rw]` representing
     * the accumulated world transform for `id` (from the subtree root down).
     * @param {string} id
     * @returns {Float64Array}
     */
    get_world_transform(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_get_world_transform(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Returns `true` if the frame has at least one registered child.
     * @param {string} id
     * @returns {boolean}
     */
    has_children(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_has_children(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Returns `true` if `id` is registered.
     * @param {string} id
     * @returns {boolean}
     */
    has_frame(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_has_frame(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.tftreewasm_new();
        this.__wbg_ptr = ret >>> 0;
        TfTreeWasmFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Remove a registered frame.
     *
     * Returns `Err` if `id` is not registered or if the frame still has
     * child frames.
     * @param {string} id
     */
    remove_frame(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_remove_frame(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Serialize the tree to a JSON string that matches the `TFTreeJSON`
     * TypeScript type.  Frames are emitted in an arbitrary order (the
     * TypeScript layer maintains insertion-order via its own Map).
     * @returns {string}
     */
    to_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.tftreewasm_to_json(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Update the local transform of an existing frame.
     *
     * Returns a JS `Array<string>` containing the IDs of every frame whose
     * world transform is now stale (the updated frame and all its descendants).
     * The caller is responsible for firing change-listeners for these IDs.
     * @param {string} id
     * @param {number} tx
     * @param {number} ty
     * @param {number} tz
     * @param {number} rx
     * @param {number} ry
     * @param {number} rz
     * @param {number} rw
     * @returns {Array<any>}
     */
    update_frame(id, tx, ty, tz, rx, ry, rz, rw) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_update_frame(this.__wbg_ptr, ptr0, len0, tx, ty, tz, rx, ry, rz, rw);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Batch-update multiple frames at once.
     *
     * `updates_json` must be a JSON array of
     * `{ id, tx, ty, tz, rx, ry, rz, rw }` objects.
     *
     * Returns a JS `Array<string>` of all stale frame IDs (the union of every
     * affected subtree, with ancestor-deduplication applied so that subtrees
     * are not enumerated redundantly).
     * @param {string} updates_json
     * @returns {Array<any>}
     */
    update_frames_batch(updates_json) {
        const ptr0 = passStringToWasm0(updates_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tftreewasm_update_frames_batch(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) TfTreeWasm.prototype[Symbol.dispose] = TfTreeWasm.prototype.free;
exports.TfTreeWasm = TfTreeWasm;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_39bc967c0e5a9b58: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_new_cbee8c0d5c479eac: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_from_slice_b1617cc9f69683c5: function(arg0, arg1) {
            const ret = new Float64Array(getArrayF64FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_push_a6f9488ffd3fae3b: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./index_bg.js": import0,
    };
}

const TfTreeWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_tftreewasm_free(ptr >>> 0, 1));

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/index_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasm = new WebAssembly.Instance(wasmModule, __wbg_get_imports()).exports;
wasm.__wbindgen_start();

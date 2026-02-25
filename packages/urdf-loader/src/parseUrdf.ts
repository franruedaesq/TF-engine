import { TFTree, Transform, Vec3, Quaternion } from "@tf-engine/core";

// ── internal types ────────────────────────────────────────────────────────────

interface ParsedJoint {
  name: string;
  type: string;
  parentLink: string;
  childLink: string;
  xyz: [number, number, number];
  rpy: [number, number, number];
}

// ── attribute helpers ─────────────────────────────────────────────────────────

/**
 * Extract the value of a named XML attribute from a single opening tag string.
 * Returns `undefined` when the attribute is absent.
 *
 * @example attrValue('<link name="base_link"/>', "name") // "base_link"
 */
function attrValue(tag: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
}

/**
 * Parse a space-separated triple of numbers (e.g. "1.0 0 0.5").
 * Missing or malformed values default to 0.
 */
function parseTriple(s: string | undefined): [number, number, number] {
  if (!s) return [0, 0, 0];
  const parts = s.trim().split(/\s+/);
  return [
    parseFloat(parts[0] ?? "0") || 0,
    parseFloat(parts[1] ?? "0") || 0,
    parseFloat(parts[2] ?? "0") || 0,
  ];
}

// ── XML block extraction ──────────────────────────────────────────────────────

/**
 * Extract the raw text of every top-level `<tagName …>…</tagName>` (or
 * self-closing `<tagName …/>`) element from `xml`.  Does not recurse into
 * nested elements of the same tag name.
 */
function extractBlocks(xml: string, tagName: string): string[] {
  const blocks: string[] = [];
  // Self-closing: <tagName … />
  const selfClose = new RegExp(`<${tagName}(\\s[^>]*)?\\/\\s*>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = selfClose.exec(xml)) !== null) {
    blocks.push(m[0]);
  }
  // Paired: <tagName …> … </tagName>
  const openRe = new RegExp(`<${tagName}(\\s[^>]*)?>`, "gi");
  while ((m = openRe.exec(xml)) !== null) {
    const start = m.index;
    const closeTag = `</${tagName}>`;
    const end = xml.indexOf(closeTag, start);
    if (end === -1) continue;
    blocks.push(xml.slice(start, end + closeTag.length));
  }
  return blocks;
}

// ── joint parsing ─────────────────────────────────────────────────────────────

/** Parse a single `<joint>…</joint>` block into a {@link ParsedJoint}. */
function parseJoint(block: string): ParsedJoint | undefined {
  // Opening tag of the joint itself.
  const openTagMatch = /^<joint([^>]*)>/i.exec(block);
  if (!openTagMatch) return undefined;
  const openTag = openTagMatch[0];

  const name = attrValue(openTag, "name") ?? "";
  const type = attrValue(openTag, "type") ?? "unknown";

  // <parent link="…"/>
  const parentMatch = /<parent([^>]*)>/i.exec(block);
  const parentLink = parentMatch ? (attrValue(parentMatch[0], "link") ?? "") : "";

  // <child link="…"/>
  const childMatch = /<child([^>]*)>/i.exec(block);
  const childLink = childMatch ? (attrValue(childMatch[0], "link") ?? "") : "";

  if (!parentLink || !childLink) return undefined;

  // <origin xyz="…" rpy="…"/>  (optional)
  const originMatch = /<origin([^>]*)>/i.exec(block) ?? /<origin([^\/]*)\/>/i.exec(block);
  let xyz: [number, number, number] = [0, 0, 0];
  let rpy: [number, number, number] = [0, 0, 0];
  if (originMatch) {
    xyz = parseTriple(attrValue(originMatch[0], "xyz"));
    rpy = parseTriple(attrValue(originMatch[0], "rpy"));
  }

  return { name, type, parentLink, childLink, xyz, rpy };
}

// ── rpy → quaternion ──────────────────────────────────────────────────────────

/**
 * Convert ROS-convention RPY (roll–pitch–yaw, extrinsic XYZ) angles in
 * radians to a unit {@link Quaternion}.
 *
 * ROS applies rotations in the order: first roll (X), then pitch (Y), then
 * yaw (Z), all about the **fixed** (world) axes, which is equivalent to the
 * intrinsic ZYX convention:
 *   Q = Q_z(yaw) * Q_y(pitch) * Q_x(roll)
 */
function rpyToQuaternion(roll: number, pitch: number, yaw: number): Quaternion {
  return Quaternion.fromEulerXYZ(roll, pitch, yaw);
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Options for {@link loadUrdf}.
 */
export interface UrdfLoaderOptions {
  /**
   * When `true`, the loader adds the **robot name** as an additional root
   * frame that is the parent of every base link (a link with no parent joint).
   * Defaults to `false`.
   */
  addRobotRoot?: boolean;
}

/**
 * Parse a URDF XML string and return a populated {@link TFTree}.
 *
 * Each URDF `<link>` becomes a frame.  Each `<joint>` defines the parent–child
 * relationship and the static transform (`<origin xyz rpy>`).
 *
 * @param xml     Full URDF XML string.
 * @param options See {@link UrdfLoaderOptions}.
 *
 * @example
 * ```ts
 * import { loadUrdf } from "@tf-engine/urdf-loader";
 *
 * const urdf = `
 *   <robot name="simple">
 *     <link name="base_link"/>
 *     <link name="link1"/>
 *     <joint name="j1" type="fixed">
 *       <parent link="base_link"/>
 *       <child link="link1"/>
 *       <origin xyz="0 0 0.5" rpy="0 0 0"/>
 *     </joint>
 *   </robot>
 * `;
 * const tf = loadUrdf(urdf);
 * tf.hasFrame("base_link"); // true
 * tf.hasFrame("link1");     // true
 * ```
 *
 * @throws {Error} if the XML does not contain a `<robot>` element.
 * @throws {Error} if a joint references an undeclared link.
 */
export function loadUrdf(xml: string, options: UrdfLoaderOptions = {}): TFTree {
  const { addRobotRoot = false } = options;

  // ── locate <robot> element ─────────────────────────────────────────────────
  const robotTagMatch = /<robot([^>]*)>/i.exec(xml);
  if (!robotTagMatch) {
    throw new Error("Invalid URDF: missing <robot> element.");
  }
  const robotName = attrValue(robotTagMatch[0], "name") ?? "robot";

  // ── extract links ──────────────────────────────────────────────────────────
  const linkBlocks = extractBlocks(xml, "link");
  const linkNames = new Set<string>();
  for (const block of linkBlocks) {
    const nameAttr = attrValue(block, "name");
    if (nameAttr) linkNames.add(nameAttr);
  }

  // ── extract joints ─────────────────────────────────────────────────────────
  const jointBlocks = extractBlocks(xml, "joint");
  const joints: ParsedJoint[] = [];
  for (const block of jointBlocks) {
    const joint = parseJoint(block);
    if (joint) joints.push(joint);
  }

  // ── determine which links have a parent joint ──────────────────────────────
  const childLinks = new Set(joints.map((j) => j.childLink));

  // Validate: every link referenced in a joint must be declared.
  for (const joint of joints) {
    if (!linkNames.has(joint.childLink)) {
      throw new Error(
        `URDF joint "${joint.name}" references undeclared child link "${joint.childLink}". ` +
          `Ensure all links are declared as <link> elements.`,
      );
    }
    if (!linkNames.has(joint.parentLink)) {
      throw new Error(
        `URDF joint "${joint.name}" references undeclared parent link "${joint.parentLink}". ` +
          `Ensure all links are declared as <link> elements.`,
      );
    }
  }

  // ── build TFTree ───────────────────────────────────────────────────────────
  const tf = new TFTree();

  if (addRobotRoot) {
    tf.addFrame(robotName);
  }

  // Add all root links (no parent joint) first.
  for (const name of linkNames) {
    if (!childLinks.has(name)) {
      tf.addFrame(name, addRobotRoot ? robotName : undefined);
    }
  }

  // Add child links in topological order (BFS from roots via joint edges).
  const added = new Set(tf.frameIds());
  const remaining = new Map(joints.map((j) => [j.childLink, j]));

  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const [childLink, joint] of remaining) {
      if (!added.has(joint.parentLink)) continue;

      const translation = new Vec3(...joint.xyz);
      const rotation = rpyToQuaternion(...joint.rpy);
      const transform = new Transform(translation, rotation);

      tf.addFrame(childLink, joint.parentLink, transform);
      added.add(childLink);
      remaining.delete(childLink);
      progress = true;
    }
  }

  if (remaining.size > 0) {
    const missing = Array.from(remaining.keys()).join(", ");
    throw new Error(
      `URDF references undeclared or unresolvable link(s): ${missing}. ` +
        `Ensure all parent links are declared as <link> elements.`,
    );
  }

  return tf;
}

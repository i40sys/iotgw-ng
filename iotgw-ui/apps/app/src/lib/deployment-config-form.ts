// Schema → form model for the deployment wizard (task-130).
//
// The ONE deployment-config JSON Schema (packages/supabase-contract) is the
// only source of field definitions: each wizard step renders the properties
// whose `x-step` matches it, grouped by `x-group`. Adding a field to the schema
// adds it to the form — no UI code needed.
//
// Relative import on purpose: the contract's dist/ is not built in the app
// image, so the schema + validator are consumed from source.
import {
  deploymentConfigJsonSchema,
  formatConfigPath,
  getStackRequirements,
  validateDeploymentConfigStep,
  type ConfigSchemaNode,
  type DeploymentConfigIssue,
  type DeploymentConfigStep,
} from "../../../../packages/supabase-contract/src/deployment-config.validate";

export type { ConfigSchemaNode, DeploymentConfigIssue, DeploymentConfigStep };
export { formatConfigPath, validateDeploymentConfigStep };

export type ConfigPath = (string | number)[];
export type ConfigObject = Record<string, unknown>;

export type FieldKind =
  | "boolean"
  | "text"
  | "secret"
  | "integer"
  // `type: ["integer","string"]` — ports / levels accepted as int or digits.
  | "integerOrString"
  | "enum"
  | "multiEnum"
  | "stringList"
  | "objectList";

export interface SchemaField {
  key: string;
  path: ConfigPath;
  schema: ConfigSchemaNode;
  kind: FieldKind;
  title: string;
  description?: string;
  isSecret: boolean;
  isAdvanced: boolean;
  isUnused: boolean;
  /** Required regardless of any stack flag. */
  isRequired: boolean;
  /** Stack flags (e.g. `mqtt`) that make this field required when on. */
  requiredBy: string[];
}

export interface SchemaGroup {
  id: string;
  title: string;
  /** The stack's on/off flag (`x-stack-tag`), rendered first. */
  stackFlag?: SchemaField;
  fields: SchemaField[];
}

const isSecretNode = (node: ConfigSchemaNode) =>
  node["x-secret"] === true || node.writeOnly === true;

function typesOf(node: ConfigSchemaNode): string[] {
  if (Array.isArray(node.type)) return node.type;
  return node.type ? [node.type] : [];
}

export function fieldKind(node: ConfigSchemaNode): FieldKind {
  const types = typesOf(node);
  if (types.includes("array")) {
    const items = node.items ?? {};
    if (items.enum) return "multiEnum";
    if (typesOf(items).includes("object")) return "objectList";
    return "stringList";
  }
  if (types.includes("boolean")) return "boolean";
  if (types.includes("integer") && types.includes("string")) {
    return "integerOrString";
  }
  if (types.includes("integer") || types.includes("number")) return "integer";
  if (node.enum) return "enum";
  if (isSecretNode(node)) return "secret";
  return "text";
}

function toField(
  key: string,
  path: ConfigPath,
  node: ConfigSchemaNode,
  requiredKeys: Set<string>,
  requiredBy: Record<string, string[]>,
): SchemaField {
  return {
    key,
    path,
    schema: node,
    kind: fieldKind(node),
    title: node.title ?? key,
    description: node.description,
    isSecret: isSecretNode(node),
    isAdvanced: node["x-advanced"] === true,
    isUnused: node["x-unused"] === true,
    isRequired: requiredKeys.has(key),
    requiredBy: requiredBy[key] ?? [],
  };
}

/** The fields of one wizard step, grouped by `x-group` in schema order. */
export function getStepGroups(step: DeploymentConfigStep): SchemaGroup[] {
  const schema = deploymentConfigJsonSchema;
  const topRequired = new Set(schema.required);
  const requiredBy: Record<string, string[]> = {};
  for (const [flag, keys] of Object.entries(getStackRequirements())) {
    for (const key of keys) (requiredBy[key] ??= []).push(flag);
  }

  const groups = new Map<string, SchemaGroup>();
  for (const meta of schema["x-groups"]) {
    if (meta["x-step"] === step) {
      groups.set(meta.id, { id: meta.id, title: meta.title, fields: [] });
    }
  }

  const add = (field: SchemaField) => {
    const groupId = field.schema["x-group"] ?? "other";
    let group = groups.get(groupId);
    if (!group) {
      group = { id: groupId, title: groupId, fields: [] };
      groups.set(groupId, group);
    }
    if (field.kind === "boolean" && field.schema["x-stack-tag"]) {
      group.stackFlag = field;
    } else {
      group.fields.push(field);
    }
  };

  for (const [key, node] of Object.entries(schema.properties)) {
    if (node["x-step"] !== step) continue;
    if (typesOf(node).includes("object") && node.properties) {
      // A step-scoped object (osInstallation): render its properties flat.
      const nested = new Set(node.required ?? []);
      for (const [childKey, child] of Object.entries(node.properties)) {
        add(toField(childKey, [key, childKey], child, nested, {}));
      }
      continue;
    }
    add(toField(key, [key], node, topRequired, requiredBy));
  }

  return [...groups.values()].filter(
    (group) => group.stackFlag || group.fields.length > 0,
  );
}

// ---------------------------------------------------------------------------
// Immutable path helpers — every edit touches ONE key of the whole document,
// so keys the form does not know about always survive a Form ⇄ JSON switch.

export function getIn(obj: unknown, path: ConfigPath): unknown {
  let current: unknown = obj;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/** Set `value` at `path`; `undefined` deletes the key. */
export function setIn<T>(obj: T, path: ConfigPath, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const isArrayParent = typeof head === "number";
  const source: unknown =
    obj !== null && typeof obj === "object" ? obj : isArrayParent ? [] : {};
  const next = Array.isArray(source)
    ? [...source]
    : { ...(source as Record<string, unknown>) };
  const child = setIn(
    (next as Record<string | number, unknown>)[head],
    rest,
    value,
  );
  if (child === undefined && !Array.isArray(next)) {
    delete (next as Record<string, unknown>)[head as string];
  } else {
    (next as Record<string | number, unknown>)[head] = child;
  }
  return next as T;
}

/**
 * Fill in the schema `default` of every field of `step` that is absent. Done
 * on the first edit, so what the form showed is exactly what gets stored and
 * the stack flags (required by the schema) become explicit.
 */
export function withStepDefaults(
  config: ConfigObject,
  step: DeploymentConfigStep,
): ConfigObject {
  let next = config;
  for (const group of getStepGroups(step)) {
    const fields = group.stackFlag
      ? [group.stackFlag, ...group.fields]
      : group.fields;
    for (const field of fields) {
      if (
        field.schema.default !== undefined &&
        getIn(next, field.path) === undefined
      ) {
        next = setIn(next, field.path, structuredClone(field.schema.default));
      }
    }
  }
  return next;
}

/** Parse the configuration JSON; null when it is not a JSON object. */
export function parseConfig(json: string): ConfigObject | null {
  try {
    const value: unknown = JSON.parse(json);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as ConfigObject)
      : null;
  } catch {
    return null;
  }
}

export function stringifyConfig(config: ConfigObject): string {
  return JSON.stringify(config, null, 2);
}

/** Issues keyed by dotted field path (`dhcp_hosts[0].mac`). */
export function issuesByField(
  issues: DeploymentConfigIssue[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const issue of issues) {
    const list = out.get(issue.field) ?? [];
    list.push(issue.message);
    out.set(issue.field, list);
  }
  return out;
}

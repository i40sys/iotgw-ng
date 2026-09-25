// Validation of the ONE deployment configuration (task-130) against
// deployment-config.schema.json, shared by the UI wizard and the backend so
// both enforce exactly the same contract.
//
// Import this module by RELATIVE path (not via "@iotgw/supabase-contract"):
// the package's dist/ is neither built nor shipped in the backend/app images,
// and the backend bundles with `--packages=external`, so only a relative
// import gets the schema inlined at build time.
//
// Messages carry field NAMES only — never values — so they are safe to show
// in toasts and to log: many fields are secrets (x-secret / writeOnly).
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schemaJson from "./deployment-config.schema.json";

export type DeploymentConfigStep = "os-installation" | "provisioning";

/** A JSON Schema node as used by deployment-config.schema.json. */
export interface ConfigSchemaNode {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  uniqueItems?: boolean;
  anyOf?: ConfigSchemaNode[];
  items?: ConfigSchemaNode;
  properties?: Record<string, ConfigSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  "x-step"?: string;
  "x-group"?: string;
  "x-secret"?: boolean;
  "x-advanced"?: boolean;
  "x-unused"?: boolean;
  "x-stack-tag"?: string;
  "x-injected"?: boolean;
}

export interface ConfigSchemaConditional {
  if: { properties: Record<string, { const: unknown }>; required: string[] };
  then: { required: string[] };
}

export interface DeploymentConfigSchema extends ConfigSchemaNode {
  properties: Record<string, ConfigSchemaNode>;
  required: string[];
  allOf: ConfigSchemaConditional[];
  "x-steps": { id: string; title: string }[];
  "x-groups": { id: string; title: string; "x-step": string }[];
}

export const deploymentConfigJsonSchema =
  schemaJson as unknown as DeploymentConfigSchema;

/** One validation problem. `path` addresses the field (e.g. ["dhcp_hosts", 0, "mac"]). */
export interface DeploymentConfigIssue {
  path: (string | number)[];
  /** Dotted form of `path`, e.g. `dhcp_hosts[0].mac`. */
  field: string;
  /** Human message WITHOUT the value, e.g. "is required when `mqtt` is enabled". */
  message: string;
}

/** Stack enable flag (e.g. `mqtt`) → the keys it makes required. */
export function getStackRequirements(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const rule of deploymentConfigJsonSchema.allOf) {
    const flag = rule.if.required[0];
    if (flag) out[flag] = rule.then.required;
  }
  return out;
}

export interface StepSchema {
  $schema: string;
  type: "object";
  properties: Record<string, ConfigSchemaNode>;
  required: string[];
  allOf: ConfigSchemaConditional[];
  additionalProperties: true;
}

const stepSchemas = new Map<DeploymentConfigStep, StepSchema>();

/**
 * The sub-schema for ONE wizard step: only that step's properties, required
 * keys and if/then rules. Other keys (the other step, backend-injected and
 * legacy keys, anything unknown) are allowed so a step validates on its own
 * and unknown keys round-trip untouched.
 */
export function getStepSchema(step: DeploymentConfigStep): StepSchema {
  const cached = stepSchemas.get(step);
  if (cached) return cached;
  const properties: Record<string, ConfigSchemaNode> = {};
  for (const [key, node] of Object.entries(
    deploymentConfigJsonSchema.properties,
  )) {
    if (node["x-step"] === step) properties[key] = node;
  }
  const stepSchema: StepSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties,
    required: deploymentConfigJsonSchema.required.filter(
      (key) => key in properties,
    ),
    allOf: deploymentConfigJsonSchema.allOf.filter((rule) =>
      [...rule.if.required, ...rule.then.required].every(
        (key) => key in properties,
      ),
    ),
    additionalProperties: true,
  };
  stepSchemas.set(step, stepSchema);
  return stepSchema;
}

const PLACEHOLDER = "CHANGE_ME";

let ajv: Ajv2020 | null = null;
const validators = new Map<DeploymentConfigStep, ValidateFunction>();

function getValidator(step: DeploymentConfigStep): ValidateFunction {
  let validate = validators.get(step);
  if (!validate) {
    if (!ajv) {
      // strict: false — the schema carries x-* annotation keywords and
      // `type: ["integer","string"]` + pattern/minimum unions by design.
      ajv = new Ajv2020({ allErrors: true, strict: false });
      addFormats(ajv);
    }
    const { allOf, ...stepSchema } = getStepSchema(step);
    // draft 2020-12 forbids an empty allOf (the O.S. step has no if/then).
    validate = ajv.compile(allOf.length ? { ...stepSchema, allOf } : stepSchema);
    validators.set(step, validate);
  }
  return validate;
}

function pointerToPath(pointer: string): (string | number)[] {
  if (!pointer) return [];
  return pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

export function formatConfigPath(path: (string | number)[]): string {
  return path
    .map((segment, index) =>
      typeof segment === "number"
        ? `[${segment}]`
        : index === 0
          ? segment
          : `.${segment}`,
    )
    .join("");
}

function describeError(error: ErrorObject): string | null {
  switch (error.keyword) {
    case "required":
      return "is required";
    case "if":
      // The failing `then` branch is reported by its own `required` errors.
      return null;
    case "format":
      return `must be a valid ${String(error.params.format)}`;
    case "pattern":
      return "has an invalid format";
    case "anyOf": {
      const formats = (
        (error.parentSchema as ConfigSchemaNode | undefined)?.anyOf ?? []
      )
        .map((branch) => branch.format)
        .filter(Boolean);
      return formats.length
        ? `must be a valid ${formats.join(" or ")}`
        : "has an invalid value";
    }
    case "enum":
      return `must be one of: ${(error.params.allowedValues as unknown[]).join(", ")}`;
    case "type":
      return `must be of type ${String(error.params.type)}`;
    case "minimum":
    case "maximum":
    case "minLength":
    case "maxLength":
    case "minItems":
    case "uniqueItems":
      // ajv's own messages here never include the value.
      return error.message ?? "is invalid";
    case "additionalProperties":
      return `has an unknown property \`${String(error.params.additionalProperty)}\``;
    default:
      return error.message ?? "is invalid";
  }
}

/**
 * Validate ONE wizard step of a deployment configuration. Returns [] when the
 * step is complete. Also flags `CHANGE_ME` placeholders left in keys the
 * enabled stacks require (the playbook's preflight rejects them too).
 */
export function validateDeploymentConfigStep(
  config: unknown,
  step: DeploymentConfigStep,
): DeploymentConfigIssue[] {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return [{ path: [], field: "", message: "must be a JSON object" }];
  }

  const validate = getValidator(step);
  const issues: DeploymentConfigIssue[] = [];
  const seen = new Set<string>();
  const stepSchema = getStepSchema(step);

  validate(config);
  for (const error of validate.errors ?? []) {
    // Errors inside an anyOf branch are summarised by the anyOf error itself.
    if (/\/anyOf\/\d+\//.test(error.schemaPath)) continue;
    let path = pointerToPath(error.instancePath);
    if (error.keyword === "required") {
      path = [...path, String(error.params.missingProperty)];
    }
    if (error.keyword === "anyOf") {
      // verbose is off (it would copy values into errors), so resolve the
      // anyOf's schema by path to name the accepted formats.
      error.parentSchema = lookupSchema(path);
    }
    let message = describeError(error);
    if (message === null) continue;

    const ruleMatch = /^#\/allOf\/(\d+)\/then\//.exec(error.schemaPath);
    if (ruleMatch && error.keyword === "required") {
      const flag = stepSchema.allOf[Number(ruleMatch[1])]?.if.required[0];
      if (flag) message = `is required when \`${flag}\` is enabled`;
    }

    const field = formatConfigPath(path);
    const dedupeKey = `${field}\u0000${message}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    issues.push({ path, field, message });
  }

  // Placeholders: only keys that are required right now matter.
  const record = config as Record<string, unknown>;
  const activeRequired = new Set(stepSchema.required);
  for (const [flag, keys] of Object.entries(getStackRequirements())) {
    if (record[flag] === true) keys.forEach((key) => activeRequired.add(key));
  }
  for (const key of activeRequired) {
    if (!(key in stepSchema.properties)) continue;
    if (record[key] === PLACEHOLDER) {
      issues.push({
        path: [key],
        field: key,
        message: `still holds the ${PLACEHOLDER} placeholder`,
      });
    }
  }

  return issues;
}

function lookupSchema(
  path: (string | number)[],
): ConfigSchemaNode | undefined {
  let node: ConfigSchemaNode | undefined = {
    properties: deploymentConfigJsonSchema.properties,
  };
  for (const segment of path) {
    if (!node) return undefined;
    node = typeof segment === "number" ? node.items : node.properties?.[segment];
  }
  return node;
}

/** One-line, value-free summary for error messages / toasts. */
export function summarizeConfigIssues(
  issues: DeploymentConfigIssue[],
  limit = 8,
): string {
  const parts = issues
    .slice(0, limit)
    .map((issue) => `${issue.field || "configuration"} ${issue.message}`);
  if (issues.length > limit) parts.push(`… and ${issues.length - limit} more`);
  return parts.join("; ");
}

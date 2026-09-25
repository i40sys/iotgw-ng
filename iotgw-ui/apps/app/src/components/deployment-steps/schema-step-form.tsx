import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronRight,
  faEye,
  faEyeSlash,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  formatConfigPath,
  getIn,
  getStepGroups,
  type ConfigObject,
  type ConfigPath,
  type ConfigSchemaNode,
  type DeploymentConfigStep,
  type SchemaField,
  type SchemaGroup,
} from "@/lib/deployment-config-form";

// Generic renderer: one collapsible section per `x-group` of the step, the
// stack's on/off flag first, widgets chosen from the JSON Schema node
// (type / enum / items / x-secret). The configuration object is the ONLY
// state — every change is a single-key update handed to `onChange`.

interface SchemaStepFormProps {
  step: DeploymentConfigStep;
  config: ConfigObject;
  onChange: (path: ConfigPath, value: unknown) => void;
  /** Validation messages keyed by dotted field path. */
  errors: Map<string, string[]>;
}

const fieldId = (path: ConfigPath) => `cfg-${path.join("-")}`;

/** The value the form shows: the stored one, else the schema default. */
function displayValue(config: ConfigObject, field: SchemaField): unknown {
  const value = getIn(config, field.path);
  return value === undefined ? field.schema.default : value;
}

export function SchemaStepForm({
  step,
  config,
  onChange,
  errors,
}: SchemaStepFormProps) {
  const groups = useMemo(() => getStepGroups(step), [step]);
  const enabledFlags = useMemo(() => {
    const flags = new Set<string>();
    for (const group of groups) {
      if (group.stackFlag && displayValue(config, group.stackFlag) === true) {
        flags.add(group.stackFlag.key);
      }
    }
    return flags;
  }, [groups, config]);

  return (
    <div className="space-y-3" data-testid={`schema-form-${step}`}>
      {groups.map((group) => (
        <SchemaGroupSection
          key={group.id}
          group={group}
          config={config}
          onChange={onChange}
          errors={errors}
          enabledFlags={enabledFlags}
        />
      ))}
    </div>
  );
}

function SchemaGroupSection({
  group,
  config,
  onChange,
  errors,
  enabledFlags,
}: {
  group: SchemaGroup;
  config: ConfigObject;
  onChange: (path: ConfigPath, value: unknown) => void;
  errors: Map<string, string[]>;
  enabledFlags: Set<string>;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isStackOn = group.stackFlag
    ? displayValue(config, group.stackFlag) === true
    : true;

  // A field stays visible while its stack is off if ANOTHER enabled stack
  // requires it (e.g. ghcr_pat lives under Credentials but GLPI needs it).
  const visible = group.fields.filter(
    (field) =>
      isStackOn || field.requiredBy.some((flag) => enabledFlags.has(flag)),
  );
  const basic = visible.filter((f) => !f.isAdvanced && !f.isUnused);
  const advanced = visible.filter((f) => f.isAdvanced || f.isUnused);
  const hidden = group.fields.length - visible.length;

  const errorCount = [group.stackFlag, ...visible].reduce(
    (count, field) =>
      field
        ? count +
          [...errors.keys()].filter(
            (key) =>
              key === formatConfigPath(field.path) ||
              key.startsWith(`${formatConfigPath(field.path)}[`),
          ).length
        : count,
    0,
  );

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-lg border"
      data-testid={`schema-group-${group.id}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left font-semibold"
          >
            <FontAwesomeIcon
              icon={isOpen ? faChevronDown : faChevronRight}
              className="text-muted-foreground h-3 w-3"
              aria-hidden="true"
            />
            {group.title}
            {errorCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {errorCount}
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>
        {group.stackFlag && (
          <div className="flex items-center gap-2">
            <Label
              htmlFor={fieldId(group.stackFlag.path)}
              className="text-muted-foreground text-xs"
            >
              {isStackOn
                ? t("deployments.steps.config.enabled")
                : t("deployments.steps.config.disabled")}
            </Label>
            <Switch
              id={fieldId(group.stackFlag.path)}
              checked={isStackOn}
              onCheckedChange={(checked) =>
                onChange(group.stackFlag!.path, checked)
              }
              aria-label={group.stackFlag.title}
            />
          </div>
        )}
      </div>
      <CollapsibleContent className="space-y-4 border-t px-4 py-4">
        {group.stackFlag?.description && (
          <p className="text-muted-foreground text-sm">
            {group.stackFlag.description}
          </p>
        )}
        {!isStackOn && hidden > 0 && (
          <p className="text-muted-foreground text-sm italic">
            {t("deployments.steps.config.stackDisabled", { count: hidden })}
          </p>
        )}
        {basic.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {basic.map((field) => (
              <SchemaFieldControl
                key={field.key}
                field={field}
                config={config}
                onChange={onChange}
                errors={errors}
                enabledFlags={enabledFlags}
              />
            ))}
          </div>
        )}
        {advanced.length > 0 && (
          <div className="space-y-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-2"
              onClick={() => setShowAdvanced((value) => !value)}
            >
              <FontAwesomeIcon
                icon={showAdvanced ? faChevronDown : faChevronRight}
                className="h-3 w-3"
                aria-hidden="true"
              />
              {showAdvanced
                ? t("deployments.steps.config.hideAdvanced")
                : t("deployments.steps.config.showAdvanced", {
                    count: advanced.length,
                  })}
            </Button>
            {showAdvanced && (
              <div className="grid gap-4 md:grid-cols-2">
                {advanced.map((field) => (
                  <SchemaFieldControl
                    key={field.key}
                    field={field}
                    config={config}
                    onChange={onChange}
                    errors={errors}
                    enabledFlags={enabledFlags}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SchemaFieldControl({
  field,
  config,
  onChange,
  errors,
  enabledFlags,
}: {
  field: SchemaField;
  config: ConfigObject;
  onChange: (path: ConfigPath, value: unknown) => void;
  errors: Map<string, string[]>;
  enabledFlags: Set<string>;
}) {
  const { t } = useTranslation();
  const value = displayValue(config, field);
  const messages = errors.get(formatConfigPath(field.path)) ?? [];
  const activeRequiredBy = field.requiredBy.filter((flag) =>
    enabledFlags.has(flag),
  );
  const isRequired = field.isRequired || activeRequiredBy.length > 0;
  const isWide =
    field.kind === "objectList" ||
    field.kind === "stringList" ||
    field.kind === "multiEnum";

  return (
    <div
      className={cn("space-y-1.5", isWide && "md:col-span-2")}
      data-testid={`field-${formatConfigPath(field.path)}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Label htmlFor={fieldId(field.path)} className="font-medium">
          {field.title}
          {isRequired && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <code className="text-muted-foreground text-xs">{field.key}</code>
        {field.isUnused && (
          <Badge variant="outline" className="text-xs">
            {t("deployments.steps.config.unused")}
          </Badge>
        )}
      </div>
      <FieldWidget
        field={field}
        value={value}
        invalid={messages.length > 0}
        onChange={(next) => onChange(field.path, next)}
        errors={errors}
      />
      {field.description && (
        <p className="text-muted-foreground text-xs">{field.description}</p>
      )}
      {messages.map((message) => (
        <p key={message} className="text-destructive text-xs font-medium">
          {message}
        </p>
      ))}
    </div>
  );
}

function placeholderFor(node: ConfigSchemaNode): string | undefined {
  const example = node.examples?.[0] ?? node.default;
  if (example !== undefined && typeof example !== "object") {
    return String(example);
  }
  if (node.format === "ipv4") return "10.0.0.1";
  if (node.format === "uri") return "https://";
  return undefined;
}

function FieldWidget({
  field,
  value,
  invalid,
  onChange,
  errors,
}: {
  field: SchemaField;
  value: unknown;
  invalid: boolean;
  onChange: (value: unknown) => void;
  errors: Map<string, string[]>;
}) {
  const id = fieldId(field.path);
  switch (field.kind) {
    case "boolean":
      return (
        <div className="flex h-9 items-center">
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );
    case "enum":
      return (
        <EnumSelect
          id={id}
          options={(field.schema.enum ?? []).map(String)}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
          invalid={invalid}
        />
      );
    case "multiEnum":
      return (
        <MultiEnumCheckboxes
          id={id}
          options={(field.schema.items?.enum ?? []).map(String)}
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
        />
      );
    case "integer":
    case "integerOrString":
      return (
        <Input
          id={id}
          inputMode="numeric"
          aria-invalid={invalid}
          placeholder={placeholderFor(field.schema)}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => {
            const raw = event.target.value.trim();
            // Digits become a number; anything else is kept as typed so the
            // schema reports it instead of the form silently dropping it.
            if (raw === "") onChange(undefined);
            else if (/^\d+$/.test(raw)) onChange(Number(raw));
            else onChange(raw);
          }}
        />
      );
    case "secret":
      return (
        <SecretInput
          id={id}
          value={typeof value === "string" ? value : ""}
          invalid={invalid}
          onChange={(next) => onChange(next === "" ? undefined : next)}
        />
      );
    case "stringList":
      return (
        <StringList
          id={id}
          field={field}
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
          errors={errors}
        />
      );
    case "objectList":
      return (
        <ObjectList
          id={id}
          field={field}
          value={
            Array.isArray(value)
              ? (value as Record<string, unknown>[])
              : []
          }
          onChange={onChange}
          errors={errors}
        />
      );
    default:
      return (
        <Input
          id={id}
          aria-invalid={invalid}
          placeholder={placeholderFor(field.schema)}
          value={typeof value === "string" ? value : value == null ? "" : String(value)}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : event.target.value)
          }
        />
      );
  }
}

export function SecretInput({
  id,
  value,
  invalid,
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={isVisible ? "text" : "password"}
        autoComplete="new-password"
        spellCheck={false}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        className="pr-10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute top-0 right-0 h-full px-3"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={
          isVisible
            ? t("deployments.steps.config.hideSecret")
            : t("deployments.steps.config.showSecret")
        }
      >
        <FontAwesomeIcon
          icon={isVisible ? faEyeSlash : faEye}
          className="h-4 w-4"
          aria-hidden="true"
        />
      </Button>
    </div>
  );
}

// Radix Select cannot hold an empty value, so "unset" is a sentinel item.
const UNSET = "__unset__";

function EnumSelect({
  id,
  options,
  value,
  onChange,
  invalid,
}: {
  id: string;
  options: string[];
  value: string | undefined;
  onChange: (value: unknown) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select
      value={value ?? UNSET}
      onValueChange={(next) => onChange(next === UNSET ? undefined : next)}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{t("deployments.steps.config.unset")}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiEnumCheckboxes({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: string[];
  value: string[];
  onChange: (value: unknown) => void;
}) {
  const selected = new Set(value);
  return (
    <div
      id={id}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      role="group"
    >
      {options.map((option) => {
        const optionId = `${id}-${option}`;
        return (
          <div key={option} className="flex items-center gap-2">
            <Checkbox
              id={optionId}
              checked={selected.has(option)}
              onCheckedChange={(checked) => {
                // Keep the schema's enum order so the JSON stays stable.
                const next = options.filter((candidate) =>
                  candidate === option ? checked === true : selected.has(candidate),
                );
                onChange(next);
              }}
            />
            <Label htmlFor={optionId} className="font-mono text-xs font-normal">
              {option}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

function StringList({
  id,
  field,
  value,
  onChange,
  errors,
}: {
  id: string;
  field: SchemaField;
  value: string[];
  onChange: (value: unknown) => void;
  errors: Map<string, string[]>;
}) {
  const { t } = useTranslation();
  return (
    <div id={id} className="space-y-2">
      {value.length === 0 && (
        <p className="text-muted-foreground text-xs italic">
          {t("deployments.steps.config.noItems")}
        </p>
      )}
      {value.map((item, index) => {
        const itemErrors =
          errors.get(formatConfigPath([...field.path, index])) ?? [];
        return (
          <div key={index} className="space-y-1">
            <div className="flex gap-2">
              <Input
                aria-label={`${field.title} ${index + 1}`}
                aria-invalid={itemErrors.length > 0}
                value={item}
                onChange={(event) =>
                  onChange(
                    value.map((current, i) =>
                      i === index ? event.target.value : current,
                    ),
                  )
                }
              />
              <RemoveButton
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              />
            </div>
            {itemErrors.map((message) => (
              <p key={message} className="text-destructive text-xs">
                {message}
              </p>
            ))}
          </div>
        );
      })}
      <AddButton onClick={() => onChange([...value, ""])} />
    </div>
  );
}

function ObjectList({
  id,
  field,
  value,
  onChange,
  errors,
}: {
  id: string;
  field: SchemaField;
  value: Record<string, unknown>[];
  onChange: (value: unknown) => void;
  errors: Map<string, string[]>;
}) {
  const { t } = useTranslation();
  const columns = Object.entries(field.schema.items?.properties ?? {});

  const updateCell = (index: number, key: string, cell: string) =>
    onChange(
      value.map((row, i) => (i === index ? { ...row, [key]: cell } : row)),
    );

  const emptyRow = () =>
    Object.fromEntries(columns.map(([key]) => [key, ""])) as Record<
      string,
      unknown
    >;

  return (
    <div id={id} className="space-y-2">
      {value.length === 0 && (
        <p className="text-muted-foreground text-xs italic">
          {t("deployments.steps.config.noItems")}
        </p>
      )}
      {value.map((row, index) => {
        const rowPath = [...field.path, index];
        const rowErrors = [...errors.entries()].filter(
          ([key]) =>
            key === formatConfigPath(rowPath) ||
            key.startsWith(`${formatConfigPath(rowPath)}.`),
        );
        return (
          <div key={index} className="space-y-1">
            <div className="flex items-start gap-2">
              <div
                className={cn(
                  "grid flex-1 gap-2",
                  columns.length >= 3
                    ? "sm:grid-cols-3"
                    : columns.length === 2
                      ? "sm:grid-cols-2"
                      : "grid-cols-1",
                )}
              >
                {columns.map(([key, node]) => {
                  const cell =
                    typeof row[key] === "string" ? (row[key] as string) : "";
                  const label = `${node.title ?? key} ${index + 1}`;
                  const invalid = errors.has(
                    formatConfigPath([...rowPath, key]),
                  );
                  return node["x-secret"] || node.writeOnly ? (
                    <SecretInput
                      key={key}
                      ariaLabel={label}
                      value={cell}
                      invalid={invalid}
                      onChange={(next) => updateCell(index, key, next)}
                    />
                  ) : (
                    <Input
                      key={key}
                      aria-label={label}
                      aria-invalid={invalid}
                      placeholder={node.title ?? key}
                      value={cell}
                      onChange={(event) =>
                        updateCell(index, key, event.target.value)
                      }
                    />
                  );
                })}
              </div>
              <RemoveButton
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              />
            </div>
            {rowErrors.map(([key, messages]) =>
              messages.map((message) => (
                <p key={`${key}${message}`} className="text-destructive text-xs">
                  <code>{key.slice(formatConfigPath(field.path).length)}</code>{" "}
                  {message}
                </p>
              )),
            )}
          </div>
        );
      })}
      <AddButton onClick={() => onChange([...value, emptyRow()])} />
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={onClick}
    >
      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
      {t("deployments.steps.config.addRow")}
    </Button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive h-9 px-3"
      onClick={onClick}
      aria-label={t("deployments.steps.config.removeRow")}
    >
      <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  );
}

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Editor from "@monaco-editor/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  issuesByField,
  parseConfig,
  setIn,
  stringifyConfig,
  validateDeploymentConfigStep,
  withStepDefaults,
  type ConfigPath,
  type DeploymentConfigStep,
} from "@/lib/deployment-config-form";
import { SchemaStepForm } from "./schema-step-form";

// One wizard step over the ONE deployment configuration (task-130):
//  - FORM: the step's own fields (schema x-step), rendered by SchemaStepForm.
//  - JSON: the WHOLE document in Monaco — both steps edit the same JSON, and
//    showing all of it is what makes the round-trip obviously lossless.
// The configuration JSON string owned by the page is the only state; the form
// never keeps a private copy, so keys it does not know (other step, backend,
// legacy, unknown) survive every Form ⇄ JSON switch untouched.

interface ConfigStepEditorProps {
  step: DeploymentConfigStep;
  configurationJson: string;
  onConfigurationChange: (json: string) => void;
  onModeChange?: (isJsonMode: boolean) => void;
  /** Extra controls shown next to the Form/JSON toggle (e.g. load from file). */
  toolbar?: ReactNode;
  /** Extra content under the form (e.g. a help table). */
  children?: ReactNode;
  description?: ReactNode;
}

function useIsDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    const root = window.document.documentElement;
    const check = () => setIsDarkMode(root.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDarkMode;
}

export function ConfigStepEditor({
  step,
  configurationJson,
  onConfigurationChange,
  onModeChange,
  toolbar,
  children,
  description,
}: ConfigStepEditorProps) {
  const { t } = useTranslation();
  const isDarkMode = useIsDarkMode();
  const [isJsonMode, setIsJsonMode] = useState(false);
  // Monaco keeps the text while it is not valid JSON (the page only receives
  // valid JSON), so a half-typed edit is never lost.
  const [jsonDraft, setJsonDraft] = useState(configurationJson);

  // Follow the page's JSON (form edits, version switch). An unparsable draft
  // is never propagated, so it is not overwritten while being typed.
  useEffect(() => {
    setJsonDraft(configurationJson);
  }, [configurationJson]);

  const config = useMemo(
    () => parseConfig(configurationJson),
    [configurationJson],
  );
  const withDefaults = useMemo(
    () => (config ? withStepDefaults(config, step) : null),
    [config, step],
  );
  // The form displays schema defaults, so it validates what it displays (the
  // defaults are stored on the first edit or via "Apply defaults"); the JSON
  // view validates the raw document, exactly as the backend will.
  const issues = useMemo(() => {
    const target = isJsonMode ? config : withDefaults;
    return target ? validateDeploymentConfigStep(target, step) : [];
  }, [isJsonMode, config, withDefaults, step]);
  const errors = useMemo(() => issuesByField(issues), [issues]);
  // withStepDefaults returns the same object when nothing was missing.
  const hasPendingDefaults = config !== null && withDefaults !== config;

  const handleFieldChange = useCallback(
    (path: ConfigPath, value: unknown) => {
      const base = withStepDefaults(config ?? {}, step);
      onConfigurationChange(stringifyConfig(setIn(base, path, value)));
    },
    [config, step, onConfigurationChange],
  );

  const applyDefaults = () => {
    if (withDefaults) onConfigurationChange(stringifyConfig(withDefaults));
  };

  const handleModeToggle = (checked: boolean) => {
    if (!checked) {
      // Back to the form: the page already holds the last VALID JSON; drop an
      // unparsable draft rather than silently mixing it in.
      setJsonDraft(configurationJson);
    }
    setIsJsonMode(checked);
    onModeChange?.(checked);
  };

  const handleJsonChange = (value: string | undefined) => {
    if (value === undefined) return;
    setJsonDraft(value);
    if (parseConfig(value)) onConfigurationChange(value);
  };

  const isDraftInvalid = isJsonMode && parseConfig(jsonDraft) === null;

  return (
    <div className="space-y-4" data-testid={`config-step-${step}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground text-sm">{description}</div>
        <div className="flex items-center gap-3">
          {toolbar}
          <Label
            htmlFor={`mode-toggle-${step}`}
            className={!isJsonMode ? "font-semibold" : "text-muted-foreground"}
          >
            {t("deployments.steps.formMode")}
          </Label>
          <Switch
            id={`mode-toggle-${step}`}
            checked={isJsonMode}
            onCheckedChange={handleModeToggle}
            aria-label={t("deployments.steps.config.toggleJson")}
          />
          <Label
            htmlFor={`mode-toggle-${step}`}
            className={isJsonMode ? "font-semibold" : "text-muted-foreground"}
          >
            {t("deployments.steps.jsonMode")}
          </Label>
        </div>
      </div>

      <IssueSummary
        issues={issues.map((issue) => `${issue.field} ${issue.message}`)}
        isJsonInvalid={isDraftInvalid || config === null}
      />

      {isJsonMode ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border">
            <Editor
              height="500px"
              language="json"
              path={`deployment-config.${step}.json`}
              theme={isDarkMode ? "vs-dark" : "light"}
              value={jsonDraft}
              onChange={handleJsonChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                formatOnType: false,
                formatOnPaste: false,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                insertSpaces: true,
              }}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {t("deployments.steps.config.jsonWholeDocument")}
          </p>
        </div>
      ) : config === null ? (
        <p className="text-destructive text-sm">
          {t("deployments.steps.config.invalidJson")}
        </p>
      ) : (
        <>
          {hasPendingDefaults && (
            <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {t("deployments.steps.config.defaultsPending")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyDefaults}
              >
                {t("deployments.steps.config.applyDefaults")}
              </Button>
            </div>
          )}
          <SchemaStepForm
            step={step}
            config={config}
            onChange={handleFieldChange}
            errors={errors}
          />
          {children}
        </>
      )}
    </div>
  );
}

function IssueSummary({
  issues,
  isJsonInvalid,
}: {
  issues: string[];
  isJsonInvalid: boolean;
}) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  if (isJsonInvalid) {
    return (
      <div className="border-destructive/50 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
        {t("deployments.steps.config.invalidJson")}
      </div>
    );
  }
  if (issues.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-green-600/40 px-3 py-2 text-sm text-green-700 dark:text-green-400"
        role="status"
      >
        <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" />
        {t("deployments.steps.config.stepComplete")}
      </div>
    );
  }
  return (
    <div
      className="rounded-md border border-amber-500/50 px-3 py-2 text-sm"
      role="status"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-amber-700 dark:text-amber-400"
        onClick={() => setIsExpanded((value) => !value)}
      >
        <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
        {t("deployments.steps.config.problems", { count: issues.length })}
      </button>
      {isExpanded && (
        <ul className="mt-2 list-disc space-y-0.5 pl-6 font-mono text-xs">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

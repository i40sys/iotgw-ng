import React, { useRef, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "./button";
import { Card } from "./card";
import { cn } from "@/lib/utils";
import { Check, Copy, RotateCcw, Type } from "lucide-react";
import { toast } from "sonner";
import type * as monaco from "monaco-editor";

export interface JsonEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  height?: string | number;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  schema?: object;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  hasUnsavedChanges?: boolean;
}

interface ValidationError {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: number;
}

export function JsonEditor({
  value = "{}",
  onChange,
  height = "400px",
  className,
  placeholder = "Enter JSON configuration...",
  readOnly = false,
  schema,
  onValidationChange,
  hasUnsavedChanges = false,
}: JsonEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [isValid, setIsValid] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Detect actual dark mode from DOM
  useEffect(() => {
    const checkDarkMode = () => {
      const root = window.document.documentElement;
      setIsDarkMode(root.classList.contains("dark"));
    };

    checkDarkMode();

    // Create an observer to watch for class changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [theme]);

  const handleEditorDidMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor"),
  ) => {
    editorRef.current = editor;

    // Configure JSON language options
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: schema
        ? [
            {
              uri: "http://myserver/deployment-schema.json",
              fileMatch: ["*"],
              schema,
            },
          ]
        : [],
    });

    // Set up validation
    const model = editor.getModel();
    if (model) {
      const updateValidation = () => {
        const markers = monaco.editor.getModelMarkers({ resource: model.uri });
        const validationErrors: string[] = [];

        markers.forEach((marker) => {
          if (marker.severity === monaco.MarkerSeverity.Error) {
            validationErrors.push(
              `Line ${marker.startLineNumber}: ${marker.message}`,
            );
          }
        });

        const valid = validationErrors.length === 0;
        setIsValid(valid);
        setErrors(validationErrors);
        onValidationChange?.(valid, validationErrors);
      };

      // Initial validation
      setTimeout(updateValidation, 100);

      // Listen for content changes
      model.onDidChangeContent(() => {
        setTimeout(updateValidation, 100);
      });
    }

    // Set editor options
    editor.updateOptions({
      minimap: { enabled: false },
      lineNumbers: "on",
      renderWhitespace: "selection",
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: "on",
      tabSize: 2,
      insertSpaces: true,
      formatOnPaste: false,
      formatOnType: false,
      readOnly: readOnly || false,
    });
  };

  const formatDocument = () => {
    if (editorRef.current) {
      editorRef.current.getAction("editor.action.formatDocument")?.run();
    }
  };

  const copyToClipboard = async () => {
    if (editorRef.current) {
      const content = editorRef.current.getValue();
      try {
        await navigator.clipboard.writeText(content);
        setIsCopied(true);
        toast.success("Content copied to clipboard");
        setTimeout(() => setIsCopied(false), 2000);
      } catch (error) {
        toast.error("Failed to copy to clipboard");
      }
    }
  };

  const resetContent = () => {
    if (onChange) {
      onChange("{}");
    }
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="bg-muted/30 flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground flex items-center gap-1 text-sm">
            <Type className="h-4 w-4" />
            JSON Editor
            {hasUnsavedChanges && (
              <div
                className="ml-2 h-2 w-2 animate-pulse rounded-full bg-yellow-500"
                title="Unsaved changes"
              />
            )}
          </div>
          {!isValid && (
            <div className="text-xs font-medium text-red-500">
              {errors.length} error{errors.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={formatDocument}
              className="h-8 px-2"
              title="Format JSON (Ctrl+Shift+I)"
            >
              <Type className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyToClipboard}
              className="h-8 px-2"
              title="Copy to clipboard"
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetContent}
              className="h-8 px-2"
              title="Reset to empty object"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="relative">
        <Editor
          height={height}
          language="json"
          theme={isDarkMode ? "vs-dark" : "light"}
          value={value}
          onChange={(val) => onChange?.(val || "{}")}
          onMount={handleEditorDidMount}
          options={{
            readOnly: readOnly || false,
            minimap: { enabled: false },
            lineNumbers: "on",
            renderWhitespace: "selection",
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            insertSpaces: true,
            formatOnPaste: false,
            formatOnType: false,
            contextmenu: true,
            selectOnLineNumbers: true,
            roundedSelection: false,
            renderIndentGuides: true,
            cursorBlinking: "blink",
            mouseWheelZoom: false,
            fontSize: 14,
            fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
          }}
          loading={
            <div className="bg-background flex h-full items-center justify-center">
              <div className="text-muted-foreground text-sm">
                Loading editor...
              </div>
            </div>
          }
        />
      </div>

      {/* Error messages */}
      {!isValid && errors.length > 0 && (
        <div className="border-t bg-red-50 p-3 dark:bg-red-950/20">
          <div className="mb-2 text-sm font-medium text-red-700 dark:text-red-400">
            Validation Errors:
          </div>
          <ul className="space-y-1 text-xs text-red-600 dark:text-red-300">
            {errors.map((error, index) => (
              <li key={index} className="font-mono">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

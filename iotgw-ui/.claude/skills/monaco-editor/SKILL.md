---
name: monaco-editor
description: This skill provides guidance for integrating Monaco Editor (VS Code editor) in React applications for JSON editing and code display. Use when implementing code editors, JSON configuration forms, or syntax-highlighted displays.
---

# Monaco Editor Integration

The Monaco Editor is the code editor that powers VS Code, available as a browser-based component.

## Context7 Library IDs

For up-to-date documentation:
- `/suren-atoyan/monaco-react` - React wrapper
- `/microsoft/monaco-editor` - Core editor

## Installation

```bash
pnpm add @monaco-editor/react
```

## Basic Usage

### Simple JSON Editor

```tsx
import Editor from "@monaco-editor/react";

interface JsonEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  readOnly?: boolean;
}

function JsonEditor({ value, onChange, readOnly = false }: JsonEditorProps) {
  return (
    <Editor
      height="400px"
      language="json"
      value={value}
      onChange={onChange}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
      theme="vs-dark"
    />
  );
}
```

### Controlled Component with Validation

```tsx
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { useState, useRef } from "react";

interface JsonEditorProps {
  value: object;
  onChange: (value: object) => void;
  schema?: object;
}

function JsonEditorWithValidation({ value, onChange, schema }: JsonEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Configure JSON schema validation
    if (schema) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [
          {
            uri: "http://myserver/schema.json",
            fileMatch: ["*"],
            schema,
          },
        ],
      });
    }
  };

  const handleChange: OnChange = (value) => {
    if (!value) return;

    try {
      const parsed = JSON.parse(value);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError("Invalid JSON");
    }
  };

  return (
    <div className="space-y-2">
      <Editor
        height="300px"
        language="json"
        value={JSON.stringify(value, null, 2)}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          formatOnPaste: true,
          formatOnType: true,
        }}
        theme="vs-dark"
      />
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
```

## Editor Options

### Common Options

```typescript
const editorOptions: editor.IStandaloneEditorConstructionOptions = {
  // Display
  minimap: { enabled: false },
  lineNumbers: "on", // "on" | "off" | "relative" | "interval"
  fontSize: 14,
  fontFamily: "JetBrains Mono, monospace",
  lineHeight: 20,

  // Behavior
  readOnly: false,
  automaticLayout: true, // Auto-resize with container
  scrollBeyondLastLine: false,
  wordWrap: "on", // "off" | "on" | "wordWrapColumn" | "bounded"

  // Editing
  tabSize: 2,
  insertSpaces: true,
  formatOnPaste: true,
  formatOnType: true,

  // UI
  folding: true,
  foldingStrategy: "indentation",
  showFoldingControls: "mouseover",
  renderLineHighlight: "line",
  cursorBlinking: "smooth",
  cursorStyle: "line",

  // Scrollbar
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },

  // Accessibility
  accessibilitySupport: "auto",
  ariaLabel: "Code editor",
};
```

### Read-Only Display

```tsx
function CodeDisplay({ code, language }: { code: string; language: string }) {
  return (
    <Editor
      height="200px"
      language={language}
      value={code}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers: "off",
        scrollBeyondLastLine: false,
        renderLineHighlight: "none",
        occurrencesHighlight: "off",
        selectionHighlight: false,
        contextmenu: false,
        folding: false,
        glyphMargin: false,
      }}
      theme="vs-dark"
    />
  );
}
```

## Theme Configuration

### Built-in Themes

```tsx
// Available themes: "vs" | "vs-dark" | "hc-black" | "hc-light"
<Editor theme="vs-dark" />
```

### Custom Theme

```tsx
import { loader } from "@monaco-editor/react";

// Define custom theme before using
loader.init().then((monaco) => {
  monaco.editor.defineTheme("custom-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6A9955" },
      { token: "keyword", foreground: "569CD6" },
      { token: "string", foreground: "CE9178" },
    ],
    colors: {
      "editor.background": "#1E1E1E",
      "editor.foreground": "#D4D4D4",
      "editorLineNumber.foreground": "#858585",
      "editor.selectionBackground": "#264F78",
      "editor.lineHighlightBackground": "#2D2D2D",
    },
  });
});

// Then use it
<Editor theme="custom-dark" />
```

### Theme Based on System Preference

```tsx
import { useTheme } from "next-themes";

function ThemedEditor({ value, onChange }: EditorProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Editor
      theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
      value={value}
      onChange={onChange}
      // ...
    />
  );
}
```

## JSON Schema Validation

```tsx
import { loader } from "@monaco-editor/react";

// Configure JSON schema
loader.init().then((monaco) => {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemas: [
      {
        uri: "http://myserver/device-config-schema.json",
        fileMatch: ["*"],
        schema: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            enabled: { type: "boolean" },
            port: { type: "integer", minimum: 1, maximum: 65535 },
            settings: {
              type: "object",
              properties: {
                timeout: { type: "number" },
                retries: { type: "integer" },
              },
            },
          },
          required: ["name", "enabled"],
        },
      },
    ],
  });
});
```

## Integration with React Hook Form

```tsx
import { Controller, useForm } from "react-hook-form";
import Editor from "@monaco-editor/react";

interface FormData {
  config: string;
}

function ConfigForm() {
  const { control, handleSubmit, setError } = useForm<FormData>({
    defaultValues: {
      config: "{}",
    },
  });

  const onSubmit = (data: FormData) => {
    try {
      JSON.parse(data.config);
      // Submit valid JSON
    } catch {
      setError("config", { message: "Invalid JSON" });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="config"
        control={control}
        render={({ field, fieldState }) => (
          <div>
            <Editor
              height="300px"
              language="json"
              value={field.value}
              onChange={field.onChange}
              options={{
                minimap: { enabled: false },
                automaticLayout: true,
              }}
              theme="vs-dark"
            />
            {fieldState.error && (
              <p className="text-red-500">{fieldState.error.message}</p>
            )}
          </div>
        )}
      />
      <button type="submit">Save</button>
    </form>
  );
}
```

## Loading States

```tsx
import Editor from "@monaco-editor/react";

function EditorWithLoader() {
  return (
    <Editor
      height="400px"
      language="json"
      loading={
        <div className="flex items-center justify-center h-full">
          <span className="animate-spin">Loading editor...</span>
        </div>
      }
      // ...
    />
  );
}
```

## Diff Editor

```tsx
import { DiffEditor } from "@monaco-editor/react";

interface DiffViewProps {
  original: string;
  modified: string;
}

function DiffView({ original, modified }: DiffViewProps) {
  return (
    <DiffEditor
      height="400px"
      language="json"
      original={original}
      modified={modified}
      options={{
        readOnly: true,
        renderSideBySide: true,
        minimap: { enabled: false },
      }}
      theme="vs-dark"
    />
  );
}
```

## Multi-Model Editor

```tsx
import Editor, { useMonaco } from "@monaco-editor/react";
import { useEffect, useState } from "react";

interface File {
  name: string;
  language: string;
  value: string;
}

function MultiFileEditor({ files }: { files: File[] }) {
  const [activeFile, setActiveFile] = useState(files[0]);
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      // Create models for all files
      files.forEach((file) => {
        const uri = monaco.Uri.parse(`file:///${file.name}`);
        if (!monaco.editor.getModel(uri)) {
          monaco.editor.createModel(file.value, file.language, uri);
        }
      });
    }
  }, [monaco, files]);

  return (
    <div>
      <div className="flex gap-2 mb-2">
        {files.map((file) => (
          <button
            key={file.name}
            onClick={() => setActiveFile(file)}
            className={activeFile.name === file.name ? "font-bold" : ""}
          >
            {file.name}
          </button>
        ))}
      </div>
      <Editor
        height="400px"
        path={activeFile.name}
        language={activeFile.language}
        value={activeFile.value}
        theme="vs-dark"
      />
    </div>
  );
}
```

## Performance Tips

1. **Use `automaticLayout: true`** - Handles resize automatically
2. **Disable unused features** - Minimap, folding if not needed
3. **Lazy load the editor** - Use dynamic imports for code splitting
4. **Single instance** - Avoid creating multiple editor instances
5. **Dispose properly** - Clean up on unmount

```tsx
// Lazy loading
const Editor = lazy(() => import("@monaco-editor/react"));

function LazyEditor(props: EditorProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Editor {...props} />
    </Suspense>
  );
}
```

## Common Use Cases in This Project

### Device Configuration Editor

```tsx
function DeviceConfigEditor({ deviceId }: { deviceId: string }) {
  const { data, mutate } = useDeviceConfig(deviceId);

  return (
    <JsonEditorWithValidation
      value={data?.config || {}}
      onChange={(config) => mutate({ config })}
      schema={deviceConfigSchema}
    />
  );
}
```

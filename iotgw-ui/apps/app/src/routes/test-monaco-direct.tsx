import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/test-monaco-direct")({
  component: TestMonacoDirect,
});

function TestMonacoDirect() {
  const [value, setValue] = useState('{\n  "test": "initial value"\n}');
  const [changeCount, setChangeCount] = useState(0);
  const [lastKeys, setLastKeys] = useState<string[]>([]);

  const handleChange = (newValue: string | undefined) => {
    console.log("Monaco onChange fired!");
    console.log("New value:", newValue);
    console.log("Old value:", value);

    if (newValue !== undefined) {
      setValue(newValue);
      setChangeCount((prev) => prev + 1);

      // Track what changed
      if (newValue.length > value.length) {
        const diff = newValue.substring(value.length);
        setLastKeys((prev) => [...prev.slice(-4), `Added: "${diff}"`]);
      } else if (newValue.length < value.length) {
        setLastKeys((prev) => [...prev.slice(-4), "Deleted char(s)"]);
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Direct Monaco Editor Test</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Direct Monaco Editor */}
        <Card>
          <CardHeader>
            <CardTitle>Direct Monaco Editor (No Wrapper)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded border">
              <Editor
                height="400px"
                language="json"
                theme="vs-dark"
                value={value}
                onChange={handleChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  readOnly: false,
                  domReadOnly: false,
                  formatOnType: false,
                  formatOnPaste: false,
                }}
              />
            </div>

            <div className="mt-4 space-x-2">
              <Button onClick={() => setValue('{"reset": true}')}>
                Reset Value
              </Button>
              <Button
                onClick={() =>
                  setValue(
                    JSON.stringify({ complex: { nested: true } }, null, 2),
                  )
                }
              >
                Complex JSON
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Debug Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Debug Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <strong>onChange Count:</strong> {changeCount}
            </div>

            <div>
              <strong>Last Actions:</strong>
              <ul className="mt-2 text-sm">
                {lastKeys.map((key, i) => (
                  <li key={i} className="font-mono">
                    {key}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <strong>Current Value:</strong>
              <pre className="mt-2 max-h-60 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-900">
                {value}
              </pre>
            </div>

            <div className="rounded bg-blue-50 p-3 dark:bg-blue-900/20">
              <strong>What to test:</strong>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
                <li>Click in the editor and type some text</li>
                <li>Check if onChange count increases</li>
                <li>Check browser console for logs</li>
                <li>See if the value updates below</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

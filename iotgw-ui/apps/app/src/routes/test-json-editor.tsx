import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { JsonEditor } from "@/components/ui/json-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/test-json-editor")({
  component: TestJsonEditor,
});

function TestJsonEditor() {
  const [value, setValue] = useState('{\n  "test": "value"\n}');
  const [renderCount, setRenderCount] = useState(0);
  const [changeCount, setChangeCount] = useState(0);
  const [lastChange, setLastChange] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const handleChange = (newValue: string) => {
    console.log("onChange called with:", newValue);
    console.log("Previous value:", value);
    console.log("Value length:", newValue.length);

    setChangeCount((prev) => prev + 1);
    setLastChange(new Date().toISOString());
    setValue(newValue);

    // Log to help debug
    if (newValue !== value) {
      console.log("✅ Value actually changed");
    } else {
      console.log("❌ Value same as before");
    }
  };

  const handleValidationChange = (
    valid: boolean,
    validationErrors: string[],
  ) => {
    console.log("Validation change:", valid, validationErrors);
    setIsValid(valid);
    setErrors(validationErrors);
  };

  const resetToDefault = () => {
    setValue('{\n  "reset": true\n}');
    toast.success("Reset to default value");
  };

  const setComplexJson = () => {
    setValue(
      JSON.stringify(
        {
          name: "test",
          version: "1.0.0",
          config: {
            enabled: true,
            items: [1, 2, 3],
          },
        },
        null,
        2,
      ),
    );
    toast.success("Set complex JSON");
  };

  // Track renders
  useState(() => {
    setRenderCount((prev) => prev + 1);
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">JSON Editor Test Page</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Editor */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>JSON Editor</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonEditor
                value={value}
                onChange={handleChange}
                onValidationChange={handleValidationChange}
                height="400px"
                placeholder="Enter JSON..."
              />

              <div className="mt-4 space-x-2">
                <Button onClick={resetToDefault}>Reset to Default</Button>
                <Button onClick={setComplexJson}>Set Complex JSON</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Debug Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Debug Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <strong>Component Renders:</strong> {renderCount}
              </div>
              <div>
                <strong>onChange Calls:</strong> {changeCount}
              </div>
              <div>
                <strong>Last Change:</strong> {lastChange || "Never"}
              </div>
              <div>
                <strong>Is Valid:</strong> {isValid ? "✅ Yes" : "❌ No"}
              </div>
              <div>
                <strong>Validation Errors:</strong>{" "}
                {errors.length > 0 ? errors.join(", ") : "None"}
              </div>
              <div>
                <strong>Current Value Length:</strong> {value.length} characters
              </div>
              <div>
                <strong>Current Value:</strong>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-900">
                  {value}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Console Output</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Open browser console to see detailed logs when you type in the
                editor. This will help identify if onChange is being called and
                what values are being passed.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ol className="list-inside list-decimal space-y-1">
                <li>Try typing in the JSON editor</li>
                <li>Check if "onChange Calls" counter increases</li>
                <li>Check browser console for detailed logs</li>
                <li>See if the value updates in "Current Value"</li>
                <li>
                  Try the reset/set buttons to see if programmatic changes work
                </li>
              </ol>
              <div className="mt-4 rounded bg-yellow-50 p-3 dark:bg-yellow-900/20">
                <strong>Expected Behavior:</strong>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>Typing should increment onChange counter</li>
                  <li>Current value should update as you type</li>
                  <li>Console should show onChange logs</li>
                  <li>Buttons should change the editor content</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

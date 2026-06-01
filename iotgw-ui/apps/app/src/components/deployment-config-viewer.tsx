import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy, faFileCode } from "@fortawesome/free-solid-svg-icons";
import Editor from "@monaco-editor/react";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "sonner";

interface DeploymentConfigViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configuration: unknown;
  deploymentName?: string;
  deploymentVersion?: string;
}

export function DeploymentConfigViewer({
  open,
  onOpenChange,
  configuration,
  deploymentName,
  deploymentVersion,
}: DeploymentConfigViewerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [isCopied, setIsCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Detect actual dark mode from DOM
  React.useEffect(() => {
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

  // Format the configuration as JSON string
  const configJson = React.useMemo(() => {
    try {
      return JSON.stringify(configuration, null, 2);
    } catch {
      return "{}";
    }
  }, [configuration]);

  const copyToClipboard = async () => {
    try {
      let copied = false;

      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(configJson);
          copied = true;
        } catch (clipboardError) {
          console.warn(
            "Clipboard API failed, trying fallback:",
            clipboardError,
          );
          // Fall through to fallback method
        }
      }

      // Fallback for older browsers or non-secure contexts
      if (!copied) {
        const textArea = document.createElement("textarea");
        textArea.value = configJson;

        // Make the textarea out of viewport but still selectable
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.setAttribute("readonly", "");

        document.body.appendChild(textArea);

        // Select the text
        if (navigator.userAgent.match(/ipad|ipod|iphone/i)) {
          // iOS requires different selection method
          const range = document.createRange();
          range.selectNodeContents(textArea);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
          textArea.setSelectionRange(0, 999999);
        } else {
          textArea.select();
        }

        try {
          const successful = document.execCommand("copy");
          document.body.removeChild(textArea);

          if (!successful) {
            throw new Error("execCommand('copy') returned false");
          }
          copied = true;
        } catch (execCommandError) {
          document.body.removeChild(textArea);
          throw execCommandError;
        }
      }

      if (!copied) {
        throw new Error("All copy methods failed");
      }

      setIsCopied(true);
      toast.success(t("deploymentJobs.configViewer.copiedToClipboard"));
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.error(t("deploymentJobs.configViewer.copyFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFileCode} className="h-5 w-5" />
            {t("deploymentJobs.configViewer.title")}
          </DialogTitle>
          <DialogDescription>
            {deploymentName && deploymentVersion ? (
              <>
                {deploymentName}{" "}
                <span className="text-muted-foreground">
                  v{deploymentVersion}
                </span>
              </>
            ) : (
              t("deploymentJobs.configViewer.description")
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Editor Container */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
          <Editor
            height="500px"
            language="json"
            theme={isDarkMode ? "vs-dark" : "light"}
            value={configJson}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              lineNumbers: "on",
              renderWhitespace: "selection",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              insertSpaces: true,
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
                  {t("common.loading")}
                </div>
              </div>
            }
          />
        </div>

        {/* Footer with Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-muted-foreground text-sm">
            {t("deploymentJobs.configViewer.readOnly")}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void copyToClipboard()}
              className="flex items-center gap-2"
            >
              {isCopied ? (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="h-4 w-4 text-green-500"
                  aria-hidden="true"
                />
              ) : (
                <FontAwesomeIcon
                  icon={faCopy}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {isCopied
                ? t("deploymentJobs.configViewer.copied")
                : t("deploymentJobs.configViewer.copy")}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("buttons.close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

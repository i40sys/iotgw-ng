import { useTranslation } from "react-i18next";

interface ErrorDisplayProps {
  error?: Error;
}

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center p-8">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
        <h3 className="mb-2 text-lg font-semibold">{t("common.error")}</h3>
        {error && <p className="text-sm">{error.message}</p>}
      </div>
    </div>
  );
}

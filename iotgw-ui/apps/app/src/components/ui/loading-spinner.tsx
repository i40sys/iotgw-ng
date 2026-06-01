import { useTranslation } from "react-i18next";

export function LoadingSpinner() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-32 items-center justify-center p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    </div>
  );
}

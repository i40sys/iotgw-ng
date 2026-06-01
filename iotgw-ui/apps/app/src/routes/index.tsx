import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { getAppVersion } from "@/utils/version";
import { Activity, Server, Shield, Wifi } from "lucide-react";

export const Route = createFileRoute("/")({
  errorComponent: ({ error }) => (
    <ErrorDisplay
      error={error instanceof Error ? error : new Error("Unknown error")}
    />
  ),
  pendingComponent: () => <LoadingSpinner />,
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const version = getAppVersion();

  const features = [
    {
      title: t("home.deviceMonitoring"),
      description: t("home.deviceMonitoringDesc"),
      icon: Activity,
    },
    {
      title: t("home.networkConfiguration"),
      description: t("home.networkConfigurationDesc"),
      icon: Wifi,
    },
    {
      title: t("home.userFriendly"),
      description: t("home.userFriendlyDesc"),
      icon: Shield,
    },
  ];

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {/* Hero Section */}
      <div className="px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <div className="mb-6 flex items-center justify-center gap-3">
              <Server className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
                {t("home.welcome")}
              </h1>
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-xl text-gray-600 dark:text-gray-300">
              {t("home.subtitle")}
            </p>
            <p className="mx-auto mt-6 max-w-3xl text-lg text-gray-500 dark:text-gray-400">
              {t("home.description")}
            </p>
            <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{t("home.version", { version })}</span>
            </div>
          </div>

          {/* Features Section */}
          <div className="mt-20">
            <h2 className="mb-12 text-center text-2xl font-semibold text-gray-900 dark:text-white">
              {t("home.features")}
            </h2>
            <div className="grid gap-8 sm:grid-cols-1 md:grid-cols-3">
              {features.map((feature, index) => {
                const IconComponent = feature.icon;
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-gray-200/50 bg-white/50 p-6 text-center backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-800/50"
                  >
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                      <IconComponent className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

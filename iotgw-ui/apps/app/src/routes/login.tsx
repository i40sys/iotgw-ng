import { useState, type FormEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase, signIn, signOut } from "@/lib/auth";
import { queryClient } from "@/utils/trpc";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.enum(["forbidden"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

/** Only same-origin paths — never an open redirect. */
function safeRedirect(target: string | undefined): string {
  if (!target) return "/";
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    const path = url.pathname + url.search + url.hash;
    return path.startsWith("/login") ? "/" : path;
  } catch {
    return "/";
  }
}

const OPERATOR_ROLES = ["operator", "admin"];

function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { redirect, reason } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === "forbidden" ? t("auth.notOperator") : null,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // The backend is authoritative; this only gives a clear message early.
      const { data } = await getSupabase().auth.getUser();
      const role = (data.user?.app_metadata as { iotgw_role?: unknown })
        ?.iotgw_role;
      if (typeof role !== "string" || !OPERATOR_ROLES.includes(role)) {
        await signOut();
        setError(t("auth.notOperator"));
        return;
      }
      queryClient.clear();
      router.history.push(safeRedirect(redirect));
    } catch {
      setError(t("auth.invalidCredentials"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("auth.title")}</CardTitle>
          <CardDescription>{t("auth.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => void handleSubmit(e)}
            aria-label={t("auth.title")}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">{t("auth.email")}</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">{t("auth.password")}</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

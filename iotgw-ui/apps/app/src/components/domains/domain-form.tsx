import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type {
  Domain,
  CreateDomainInput,
  UpdateDomainInput,
} from "@iotgw/supabase-contract";

// Form schema with validation
const domainFormSchema = z.object({
  name: z
    .string()
    .min(1, "Domain name is required")
    .max(50, "Domain name must be less than 50 characters")
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
      "Domain name must contain only letters, numbers, and hyphens, and cannot start or end with a hyphen",
    ),
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be less than 100 characters"),
});

type DomainFormData = z.infer<typeof domainFormSchema>;

export interface DomainFormProps {
  mode: "create" | "edit";
  initialData?: Domain;
  onSubmit: (data: CreateDomainInput | UpdateDomainInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export function DomainForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitError,
}: DomainFormProps) {
  const { t } = useTranslation();

  const form = useForm<DomainFormData>({
    resolver: zodResolver(domainFormSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      display_name: initialData?.display_name ?? "",
    },
  });

  const handleSubmit = (data: DomainFormData) => {
    if (mode === "create") {
      onSubmit({
        name: data.name,
        display_name: data.display_name,
      } satisfies CreateDomainInput);
    } else {
      onSubmit({
        id: initialData!.id,
        name: data.name,
        display_name: data.display_name,
      } satisfies UpdateDomainInput);
    }
  };

  const handleReset = () => {
    form.reset();
    onCancel?.();
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit(handleSubmit)(e);
        }}
        className="space-y-6"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("domains.name")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t("domains.namePlaceholder")}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </FormControl>
              <FormDescription>{t("domains.nameDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="display_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("domains.displayName")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t("domains.displayNamePlaceholder")}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </FormControl>
              <FormDescription>
                {t("domains.displayNameDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="text-sm text-red-600 dark:text-red-400">
              <strong>Error:</strong> {submitError}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end space-x-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isSubmitting}
            >
              {t("buttons.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">
                  {mode === "create" ? "Creating..." : "Updating..."}
                </span>
              </>
            ) : (
              t("buttons.save")
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// Utility hook for form validation
export function useDomainFormValidation() {
  return {
    schema: domainFormSchema,
    validate: (data: unknown): data is DomainFormData => {
      const result = domainFormSchema.safeParse(data);
      return result.success;
    },
  };
}

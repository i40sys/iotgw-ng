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
  Network,
  CreateNetworkInput,
  UpdateNetworkInput,
} from "@iotgw/supabase-contract";

// IPv4 CIDR validation regex
const ipv4CidrRegex =
  /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\/([0-9]|[1-2][0-9]|3[0-2])$/;

// IPv6 CIDR validation regex
const ipv6CidrRegex =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8])$/;

// Form schema with validation
const networkFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Network name is required")
      .max(100, "Network name must be less than 100 characters")
      .regex(
        /^[a-zA-Z0-9]([a-zA-Z0-9-_\s]*[a-zA-Z0-9])?$/,
        "Network name must contain only letters, numbers, hyphens, underscores, and spaces, and cannot start or end with special characters",
      ),
    ipv4_cidr: z
      .string()
      .optional()
      .refine(
        (value) => !value || value.trim() === "" || ipv4CidrRegex.test(value),
        "IPv4 CIDR must be in valid format (e.g., 192.168.1.0/24)",
      ),
    ipv6_cidr: z
      .string()
      .optional()
      .refine(
        (value) => !value || value.trim() === "" || ipv6CidrRegex.test(value),
        "IPv6 CIDR must be in valid format (e.g., 2001:db8::/64)",
      ),
  })
  .refine(
    (data) => {
      // At least one CIDR must be provided
      const hasIpv4 = data.ipv4_cidr && data.ipv4_cidr.trim() !== "";
      const hasIpv6 = data.ipv6_cidr && data.ipv6_cidr.trim() !== "";
      const hasAnyIpv4 = Boolean(hasIpv4);
      const hasAnyIpv6 = Boolean(hasIpv6);
      return hasAnyIpv4 || hasAnyIpv6;
    },
    {
      message: "At least one CIDR (IPv4 or IPv6) must be provided",
      path: ["ipv4_cidr"], // This will show the error on the first CIDR field
    },
  );

type NetworkFormData = z.infer<typeof networkFormSchema>;

export interface NetworkFormProps {
  mode: "create" | "edit";
  domainId: string;
  initialData?: Network;
  onSubmit: (data: CreateNetworkInput | UpdateNetworkInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export function NetworkForm({
  mode,
  domainId,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitError,
}: NetworkFormProps) {
  const { t } = useTranslation();

  const form = useForm<NetworkFormData>({
    resolver: zodResolver(networkFormSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      ipv4_cidr: initialData?.ipv4_cidr ?? "",
      ipv6_cidr: initialData?.ipv6_cidr ?? "",
    },
  });

  const handleSubmit = (data: NetworkFormData) => {
    // Helper function to convert empty strings to null
    const emptyToNull = (value: string | undefined): string | null => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : null;
    };

    if (mode === "create") {
      onSubmit({
        domain_id: domainId,
        name: data.name,
        ipv4_cidr: emptyToNull(data.ipv4_cidr),
        ipv6_cidr: emptyToNull(data.ipv6_cidr),
      } satisfies CreateNetworkInput);
    } else {
      // In edit mode, only submit the name - CIDR fields cannot be changed
      onSubmit({
        id: initialData!.id,
        name: data.name,
      } satisfies UpdateNetworkInput);
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
              <FormLabel>{t("networks.name")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t("networks.namePlaceholder")}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </FormControl>
              <FormDescription>{t("networks.nameDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {mode === "create" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex gap-3">
              <div className="flex-shrink-0 text-amber-600 dark:text-amber-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Important: Network ranges cannot be changed
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  Once created, IPv4 and IPv6 CIDR ranges cannot be modified.
                  Please ensure the network configuration is correct before
                  creating.
                </p>
              </div>
            </div>
          </div>
        )}

        <FormField
          control={form.control}
          name="ipv4_cidr"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("networks.ipv4Cidr")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t("networks.ipv4CidrPlaceholder")}
                  disabled={isSubmitting || mode === "edit"}
                  autoComplete="off"
                  className={
                    mode === "edit" ? "cursor-not-allowed opacity-60" : ""
                  }
                />
              </FormControl>
              <FormDescription>
                {mode === "edit"
                  ? "Network CIDR cannot be changed after creation"
                  : `${t("networks.ipv4CidrDescription")} - At least one CIDR is required.`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ipv6_cidr"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("networks.ipv6Cidr")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t("networks.ipv6CidrPlaceholder")}
                  disabled={isSubmitting || mode === "edit"}
                  autoComplete="off"
                  className={
                    mode === "edit" ? "cursor-not-allowed opacity-60" : ""
                  }
                />
              </FormControl>
              <FormDescription>
                {mode === "edit"
                  ? "Network CIDR cannot be changed after creation"
                  : `${t("networks.ipv6CidrDescription")} - At least one CIDR is required.`}
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
export function useNetworkFormValidation() {
  return {
    schema: networkFormSchema,
    validate: (data: unknown): data is NetworkFormData => {
      const result = networkFormSchema.safeParse(data);
      return result.success;
    },
  };
}

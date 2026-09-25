import { logger } from "../logger";
import type { Operator } from "./operator";

/**
 * Audit trail for sensitive operator actions (decision-034): device codes,
 * seed rotation, SSH enrollment reset, deployments, device create/delete.
 * One structured log line per action with the operator's email and id.
 */
export function auditLog(
  operator: Operator,
  action: string,
  details: Record<string, unknown> = {},
): void {
  logger.info(
    {
      audit: action,
      operator: { id: operator.id, email: operator.email, role: operator.role },
      ...details,
    },
    `audit: ${action} by ${operator.email || operator.id}`,
  );
}

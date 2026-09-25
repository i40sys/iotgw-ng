import type { Operator } from "../../auth/operator";

/** The operator every router test runs as (decision-034 auth middleware). */
export const TEST_OPERATOR: Operator = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "operator@test.local",
  role: "operator",
};

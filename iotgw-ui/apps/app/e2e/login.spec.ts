/**
 * Browser e2e: operator login (decision-034) on the live kind cluster.
 * Unauthenticated users land on /login; the e2e operator signs in, sees their
 * email in the header, and signing out returns to /login.
 */
import { test, expect } from "@playwright/test";
import { operatorCredentials } from "./api";
import { loginViaUi } from "./login";

test("unauthenticated users are redirected to the login page", async ({
  page,
}) => {
  await page.goto("/devices");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("a wrong password is refused", async ({ page }) => {
  const { email } = operatorCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Invalid email or password/);
  await expect(page).toHaveURL(/\/login/);
});

test("the operator signs in, lands where they were going, and signs out", async ({
  page,
}) => {
  await loginViaUi(page, "/devices");
  await expect(page).toHaveURL(/\/devices/);
  await expect(
    page.getByRole("button", { name: "Create Device" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/devices");
  await expect(page).toHaveURL(/\/login/);
});

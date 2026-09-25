import { expect, type Page } from "@playwright/test";
import { operatorCredentials } from "./api";

/** Sign in through the login page as the e2e operator (decision-034). */
export async function loginViaUi(page: Page, redirect = "/"): Promise<void> {
  const { email, password } = operatorCredentials();
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByTestId("operator-email")).toHaveText(email);
}

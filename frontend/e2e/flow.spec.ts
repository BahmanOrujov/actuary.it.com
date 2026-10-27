// E2E (PROMPT.md 11): register -> create portfolio (sidebar dialog) -> add stock -> Generate -> dashboard -> stale banner.
// Requires the app running (scripts/run.ps1) with a working data provider. BASE_URL defaults to http://localhost:8000.
import { expect, test } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:8000";

async function addStock(page: import("@playwright/test").Page, symbol: string, qty: string) {
  await page.getByLabel(/Simvol/).first().fill(symbol);
  await page.getByRole("button", { name: "Axtar" }).click();
  const option = page.getByRole("listbox", { name: "Namizədlər" }).getByRole("option").first();
  const quantity = page.getByLabel(/Say/);
  await expect(option.or(quantity)).toBeVisible({ timeout: 90_000 });
  if (await option.isVisible()) await option.click();
  await quantity.fill(qty);
  await page.getByRole("button", { name: "Əlavə et" }).click();
  await expect(page.getByText(/İstifadə olunan/)).toBeVisible({ timeout: 90_000 });
}

test("client flow", async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const email = `e2e${Date.now()}@example.com`;
  await page.goto(BASE + "/login");
  await page.getByRole("button", { name: "Qeydiyyat" }).first().click();
  await page.getByLabel("E-poçt", { exact: true }).fill(email);
  await page.getByLabel(/^Parol/).fill("e2e-password-1");
  await page.locator("form").getByRole("button", { name: "Qeydiyyat" }).click();
  // a new user lands on the empty overview; the portfolio is created in the dialog and opens by itself
  await expect(page.getByRole("heading", { name: "Xoş gəlmisiniz" })).toBeVisible();
  await page.getByRole("button", { name: "İlk portfeli yarat" }).click();
  await page.getByRole("dialog").getByLabel("Ad").fill("E2E portfel");
  await page.getByRole("dialog").getByRole("button", { name: "Yarat" }).click();
  await expect(page.getByRole("heading", { name: "E2E portfel" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Portfellərim" }).getByRole("link", { name: /E2E portfel/ })).toBeVisible();

  await addStock(page, "MSFT", "5");

  await page.getByRole("button", { name: "Generate" }).click();
  // the dashboard opens by itself when the run started here finishes
  await expect(page.getByText("Qısa cavab")).toBeVisible({ timeout: 6 * 60_000 });
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText(/CVaR 95%/).first()).toBeVisible();
  await expect(page.getByText(/proqnoz qiymət deyil/).first()).toBeVisible();

  await expect(page.getByRole("heading", { name: /nə qədər güvənə bilərəm/ })).toBeVisible();

  await page.getByRole("link", { name: "Tərkib" }).click();
  await addStock(page, "AAPL", "2");
  await expect(page.getByText(/Portfel dəyişib/)).toBeVisible({ timeout: 15_000 });
});

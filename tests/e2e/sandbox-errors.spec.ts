import { expect, test } from "@playwright/test";

test("reports empty thrown values as execution failures instead of matching outputs", async ({
  page,
}) => {
  await page.goto("/");
  for (const code of ["throw new Error('');", "throw '';"]) {
    await page.getByLabel("Source JavaScript", { exact: true }).fill(code);
    await page.getByRole("button", { name: "Protect & compare" }).click();
    await expect(page.locator("#equivalence")).toHaveText("Execution error");
    await expect(page.locator("#logs")).toContainText(
      "Sandbox execution failed",
    );
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Protect & compare" }),
    ).toBeEnabled();
  }
});

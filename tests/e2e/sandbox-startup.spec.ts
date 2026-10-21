import { expect, test, type Page } from "@playwright/test";

async function slowWorkerStartup(
  page: Page,
  delay: number,
  neverReady = false,
) {
  await page.addInitScript(
    ({ delay, neverReady }) => {
      if (window.parent === window) return;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          // Delay a real Worker before its original script starts, not the tested code.
          const source = neverReady
            ? "/* deliberately unresponsive worker startup */"
            : `const until=performance.now()+${delay};while(performance.now()<until){};importScripts(${JSON.stringify(String(url))});`;
          const startup = URL.createObjectURL(
            new Blob([source], { type: "text/javascript" }),
          );
          super(startup, options);
          this.addEventListener("message", () => URL.revokeObjectURL(startup), {
            once: true,
          });
        }
      };
    },
    { delay, neverReady },
  );
}

test("does not charge slow real Worker startup against the code execution budget", async ({
  page,
}) => {
  await slowWorkerStartup(page, 1400);
  await page.goto("/#try-examples");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Outputs match", {
    timeout: 20000,
  });
  await expect(page.locator("#logs")).toContainText("Order total: 90");
  await expect(page.locator("#logs")).toContainText("With delivery: 95");
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("allows bounded iframe startup before starting execution", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window.parent === window) return;
    const until = performance.now() + 2100;
    while (performance.now() < until) {
      /* deterministic frame startup contention */
    }
  });
  await page.goto("/#try-examples");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Outputs match", {
    timeout: 20000,
  });
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("reports unavailable startup separately and cleans up instead of claiming code ran", async ({
  page,
}) => {
  await slowWorkerStartup(page, 0, true);
  await page.goto("/#try-examples");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Execution error", {
    timeout: 20000,
  });
  await expect(page.locator("#logs")).toContainText(
    "Sandbox startup timed out",
  );
  await expect(page.locator("#logs")).not.toContainText(
    "Execution timed out (1000 ms)",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Protect & compare" }),
  ).toBeEnabled();
});

test("still terminates infinite code after delayed startup at the execution deadline", async ({
  page,
}) => {
  await slowWorkerStartup(page, 1400);
  await page.goto("/#try-examples");
  await page
    .getByLabel("Source JavaScript", { exact: true })
    .fill("while (true) {}");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Execution error", {
    timeout: 20000,
  });
  await expect(page.locator("#logs")).toContainText(
    "Execution timed out (1000 ms)",
  );
  await expect(page.locator("#logs")).not.toContainText(
    "Sandbox startup timed out",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("Worker ready spam cannot extend the execution deadline", async ({
  page,
}) => {
  await page.goto("/#try-examples");
  await page.getByLabel("Source JavaScript", { exact: true }).fill(`
const stop = performance.now() + 3000;
while (performance.now() < stop) {
  postMessage({ kind: 'ready' });
  const next = performance.now() + 50;
  while (performance.now() < next) {}
}
console.log('late output');`);
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Execution error");
  await expect(page.locator("#logs")).toContainText(
    "Execution timed out (1000 ms)",
  );
  await expect(page.locator("#logs")).not.toContainText("late output");
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("cleans up failed Worker construction and keeps the controls available", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (window.parent === window) return;
    window.Worker = new Proxy(window.Worker, {
      construct() {
        throw new Error("Injected startup failure");
      },
    });
  });
  await page.goto("/#try-examples");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Execution error");
  await expect(page.locator("#logs")).toContainText("Sandbox startup failed");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Protect & compare" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("cancels pending startup on pagehide and supports another run", async ({
  page,
}) => {
  await slowWorkerStartup(page, 1400);
  await page.goto("/#try-examples");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("iframe").first()).toBeAttached();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Protect & compare" }),
  ).toBeEnabled({ timeout: 20000 });
  await expect(page.locator("#logs")).toContainText("Execution cancelled");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Outputs match", {
    timeout: 20000,
  });
  await expect(page.locator("iframe")).toHaveCount(0);
});

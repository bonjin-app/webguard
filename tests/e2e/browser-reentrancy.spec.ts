import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

let sourceSdk: string;
test.beforeAll(async () => {
  // Compile current sources in memory; these regressions do not consume stale demo/CDN builds.
  const result = await build({
    entryPoints: [
      fileURLToPath(
        new URL("../../packages/browser/src/index.ts", import.meta.url),
      ),
    ],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "WebGuardSDK",
    write: false,
  });
  sourceSdk = result.outputFiles[0]!.text;
});

for (const action of ["destroy", "disable"] as const) {
  test(`cancels modal replacement when native focus restoration triggers ${action}`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setContent(
      '<button id="host">Host action</button><div id="anchor">Fixed anchor</div>',
    );
    await page.addScriptTag({ content: sourceSdk });
    const result = await page.evaluate(async (action) => {
      const sdk = (
        window as unknown as {
          WebGuardSDK: {
            WebGuard: typeof import("../../packages/browser/src/index").WebGuard;
          };
        }
      ).WebGuardSDK;
      const host = document.querySelector<HTMLButtonElement>("#host")!;
      const events: string[] = [];
      const guard = sdk.WebGuard.init({
        devtools: { blockShortcuts: true, response: "block" },
        domIntegrity: {
          enabled: true,
          selectors: ["#anchor"],
          response: "block",
        },
        onThreat: (event) => events.push(event.type),
      });
      host.focus();
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F12",
          bubbles: true,
          cancelable: true,
        }),
      );
      const initiallyModal = Boolean(
        document.querySelector("[data-webguard-blocker]:modal"),
      );
      let focusActions = 0;
      host.addEventListener(
        "focus",
        () => {
          focusActions++;
          if (action === "destroy") guard.destroy();
          else
            guard.update({
              devtools: { blockShortcuts: false, response: "monitor" },
              domIntegrity: { enabled: false },
            });
        },
        { once: true },
      );
      document.querySelector("#anchor")!.textContent = "Changed anchor";
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const remainingModals = document.querySelectorAll(
        "[data-webguard-blocker]",
      ).length;
      host.addEventListener("click", () => (host.dataset.clicked = "yes"));
      const key = new KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(key);
      guard.destroy();
      return {
        initiallyModal,
        focusActions,
        remainingModals,
        keyCanceled: key.defaultPrevented,
        events,
      };
    }, action);
    expect(result.initiallyModal).toBe(true);
    expect(result.focusActions).toBe(1);
    expect(result.remainingModals).toBe(0);
    expect(result.keyCanceled).toBe(false);
    expect(
      result.events.filter((event) => event === "page-blocked"),
    ).toHaveLength(1);
    await page.locator("#host").click();
    await expect(page.locator("#host")).toHaveAttribute("data-clicked", "yes");
    expect(pageErrors).toEqual([]);
  });
}

for (const action of ["update", "rebaseline"] as const) {
  test(`reconciles modal ownership when native focus restoration triggers ${action}`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setContent(
      '<button id="host">Host action</button><div id="anchor">Fixed anchor</div>',
    );
    await page.addScriptTag({ content: sourceSdk });
    const result = await page.evaluate(async (action) => {
      const sdk = (
        window as unknown as {
          WebGuardSDK: typeof import("../../packages/browser/src/index");
        }
      ).WebGuardSDK;
      const host = document.querySelector<HTMLButtonElement>("#host")!;
      const anchor = document.querySelector("#anchor")!;
      const events: string[] = [];
      const guard = sdk.WebGuard.init({
        devtools: { blockShortcuts: true, response: "block" },
        domIntegrity: {
          enabled: true,
          selectors: ["#anchor"],
          response: "block",
        },
        onThreat: (event) => events.push(event.type),
      });
      const snapshot = () => ({
        label: document
          .querySelector("[data-webguard-blocker]:modal")
          ?.getAttribute("aria-label"),
        blockedEvents: events.filter((event) => event === "page-blocked")
          .length,
      });
      const shortcut = () =>
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "F12",
            bubbles: true,
            cancelable: true,
          }),
        );
      const recheck = () =>
        document
          .querySelector<HTMLButtonElement>("[data-webguard-recheck]")
          ?.click();
      host.focus();
      shortcut();
      let focusActions = 0;
      let rebaselined = false;
      host.addEventListener(
        "focus",
        () => {
          focusActions++;
          if (action === "update")
            guard.update({ integrity: { enabled: true } });
          else rebaselined = guard.rebaselineDom();
        },
        { once: true },
      );
      anchor.textContent = "Changed anchor";
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const afterReplacement = snapshot();
      // Do not send a new signal in the rebaseline case: it could hide lost blocked state.
      if (action === "update") shortcut();
      const afterRepeat = snapshot();
      recheck();
      const afterUnrestoredCheck = snapshot();
      let afterRestoredCheck: ReturnType<typeof snapshot> | undefined;
      if (action === "update") {
        anchor.textContent = "Fixed anchor";
        recheck();
        afterRestoredCheck = snapshot();
        recheck();
      }
      const finalModal = Boolean(document.querySelector(":modal"));
      host.addEventListener("click", () => (host.dataset.clicked = "yes"));
      guard.destroy();
      return {
        focusActions,
        rebaselined,
        afterReplacement,
        afterRepeat,
        afterUnrestoredCheck,
        afterRestoredCheck,
        finalModal,
        events,
      };
    }, action);
    const shortcutHeading = "검사 단축키 입력을 감지했습니다";
    const domHeading = "페이지 변경을 확인해 주세요";
    expect(result.focusActions).toBe(1);
    expect.soft(result.afterReplacement).toEqual({
      label: action === "update" ? domHeading : shortcutHeading,
      blockedEvents: 2,
    });
    expect.soft(result.afterRepeat).toEqual(result.afterReplacement);
    if (action === "update") {
      // An unchanged, still-tampered anchor must remain restricted.
      expect.soft(result.afterUnrestoredCheck.label).toBe(domHeading);
      // Restoring DOM clears only that reason; the shortcut still needs acknowledgement.
      expect.soft(result.afterRestoredCheck?.label).toBe(shortcutHeading);
    } else {
      expect(result.rebaselined).toBe(true);
      expect(result.afterUnrestoredCheck.label).toBeUndefined();
    }
    expect.soft(result.events).not.toContain("page-block-unavailable");
    expect
      .soft(result.events.filter((event) => event === "page-unblocked"))
      .toHaveLength(1);
    expect(result.finalModal).toBe(false);
    await page.locator("#host").click();
    await expect(page.locator("#host")).toHaveAttribute("data-clicked", "yes");
    expect(pageErrors).toEqual([]);
  });
}

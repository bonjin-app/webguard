import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  downloadsMarkup,
  initDownloads,
  parseDownloadCatalog,
} from "../../apps/downloads";

const id = "0.3.0-0123456789abcdef";
const sha256 = "a".repeat(64);
const artifact = (url: string) => ({ url, sha256, bytes: 1234 });
const release = () => ({
  id,
  version: "0.3.0",
  channel: "unpublished-candidate",
  sdk: {
    ...artifact(`/cdn/releases/${id}/webguard.global.js`),
    download: `/downloads/releases/${id}/webguard.global.js`,
    integrity: `sha384-${"a".repeat(64)}`,
  },
  package: {
    ...artifact(`/downloads/releases/${id}/uulab-webguard-0.3.0.tgz`),
    sha512: "b".repeat(128),
  },
  example: artifact(`/downloads/releases/${id}/webguard-init.js`),
  licenses: artifact(`/downloads/releases/${id}/THIRD_PARTY_NOTICES.txt`),
});
const catalog = () => ({
  version: 1,
  current: release(),
  releases: [release()],
});
afterEach(() => vi.unstubAllGlobals());
function fixture(markup = downloadsMarkup) {
  const dom = new JSDOM(markup, { url: "https://webguard.uulab.co.kr/docs/" });
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("window", dom.window);
  return dom.window.document;
}

describe("direct SDK downloads", () => {
  it("accepts exact retained release paths and rejects untrusted targets or incomplete metadata", () => {
    expect(parseDownloadCatalog(catalog()).id).toBe(id);
    for (const mutate of [
      (data: ReturnType<typeof catalog>) => {
        data.current.sdk.url = "https://evil.example/sdk.js";
      },
      (data: ReturnType<typeof catalog>) => {
        data.current.example.url = `/downloads/releases/${id}/../other.js`;
      },
      (data: ReturnType<typeof catalog>) => {
        data.current.sdk.integrity = 'sha384-" onload="alert(1)';
      },
      (data: ReturnType<typeof catalog>) => {
        data.current.package.sha256 = "wrong";
      },
      (data: ReturnType<typeof catalog>) => {
        data.current.sdk.bytes = -1;
      },
      (data: ReturnType<typeof catalog>) => {
        data.current.id = "latest";
      },
    ]) {
      const data = catalog();
      mutate(data);
      expect(() => parseDownloadCatalog(data)).toThrow();
    }
  });

  it("does not fetch when the download section is absent", async () => {
    fixture("<main></main>");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await initDownloads();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("renders verified catalog links and exact SRI/defer snippet through text content", async () => {
    const document = fixture();
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => catalog() });
    vi.stubGlobal("fetch", fetcher);
    await initDownloads();
    expect(fetcher).toHaveBeenCalledWith(
      "/downloads/catalog.json",
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
    expect(
      document.querySelector("[data-download-ready]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      document.querySelector("[data-download-package]")?.getAttribute("href"),
    ).toBe(release().package.url);
    const code = document.querySelector("[data-cdn-code]")?.textContent;
    expect(code).toContain(
      `src="https://webguard.uulab.co.kr/cdn/releases/${id}/webguard.global.js"`,
    );
    expect(code).toContain(
      `integrity="${release().sdk.integrity}" crossorigin="anonymous"`,
    );
    expect(code).toContain(
      '<script defer src="/assets/webguard-init.js"></script>',
    );
    expect(document.querySelector("script")).toBeNull();
    expect(
      document.querySelector("[data-download-status]")?.textContent,
    ).toContain("npm 미게시");
  });

  it("shows catalog failure without download links and allows retry", async () => {
    const document = fixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => catalog() });
    vi.stubGlobal("fetch", fetcher);
    await initDownloads();
    expect(
      document.querySelector("[data-download-ready]")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      document.querySelector("[data-download-status]")?.textContent,
    ).toContain("불러올 수 없습니다");
    expect(
      document.querySelector("[data-download-retry]")?.hasAttribute("hidden"),
    ).toBe(false);
    await initDownloads();
    expect(
      document.querySelector("[data-download-ready]")?.hasAttribute("hidden"),
    ).toBe(false);
  });
});

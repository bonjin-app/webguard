# Maintained browser performance fixture

```sh
pnpm build
pnpm exec playwright install chromium
pnpm benchmark:browser --budget benchmarks/react-vite-budget.json --evidence test-results/rc/browser-performance.json
```

The command builds baseline and Strict/High protected variants of `examples/react-vite` into fresh temporary directories. Both use the same source, target and minifier. Protected serving applies the generated HTTP CSP; baseline serving does not. Each run warms both variants once, then collects five alternating pairs in fresh Chromium contexts. The report retains source/tool/asset hashes, build wall time, all samples, median/min/max, compression sizes, response policy and cleanup status.

The comparison measures the **combined build transformation, SDK startup and policy integration**. It is not an isolated measurement of SDK initialization overhead. CDP CPU is a delta at named checkpoints. In-page lazy completion time and Playwright wall time are separate. Heap is point-in-time used JS heap, not peak memory or a leak proof. Build wall time is not browser runtime cost.

## Payload ceilings

`react-vite-budget.json` sets limits on the sum of all emitted JavaScript assets:

| Variant   | Raw bytes | gzip bytes | Brotli bytes |
| --------- | --------: | ---------: | -----------: |
| Baseline  |   300,000 |    100,000 |       90,000 |
| Protected | 2,400,000 |  1,000,000 |      850,000 |

These are maintained-fixture regression ceilings, with headroom above the measured 2026-10-22 Strict/High build. They are not budgets suitable for every application or a statement that this payload is inexpensive. Strong obfuscation materially increases this fixture's payload and CPU work; application owners must measure their own target devices and set their own rollout limits.

Compression is computed per emitted JS file and summed using gzip level 9 / Brotli quality 11. It is **not** a claim about the server's observed content encoding or end-user transfer size. Asset URLs, sizes and hashes remain in the report. No universal timing/percentage threshold is used: machine load, scheduling and GC make those observations environment dependent. Existing runtime behavior and resource-release assertions remain hard failures.

An exceeded or invalid budget exits nonzero. An exceeded size limit still preserves the collected browser samples and cleanup record for diagnosis. Do not raise a ceiling automatically, exclude newly large assets or weaken obfuscation to make CI pass; review the measured cause and the application tradeoff. Without `--budget`, the script records measurements and explicitly reports that no size gate ran.

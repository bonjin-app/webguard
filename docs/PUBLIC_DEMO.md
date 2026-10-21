# Public demo deployment

**[Open the public demo](https://webguard.uulab.co.kr/demo)**. No login or installation is required. React, JavaScript, TypeScript and documentation links run on the same HTTPS origin. The product root temporarily redirects to `/demo`; `/demo/` redirects to the canonical `/demo` path while preserving query parameters. The previous `workers.dev` addresses remain available.

The public adapter runs the same demo applications on Cloudflare Workers Static Assets. It does not execute submitted JavaScript on a server: transformation and bounded test execution remain in the visitor's browser.

## SDK security hardening (current)

[Updated SDK guide](https://webguard.uulab.co.kr/docs/?sdk=f647a0d#integrity-budgets) · [Latest demo](https://webguard.uulab.co.kr/demo?sdk=f647a0d#live-demo). Explicit SDK integrity checks now omit credentials/referrers, reject redirects and non-HTTP(S)/userinfo URLs, and enforce validated time, decoded-byte and concurrency budgets. Policy validation rejects inherited/accessor inputs, and the low-level deployment verifier checks the actual root independently of optional headers. The existing obfuscated demo build and opt-in page protection remain available.

Source **`f647a0d`** is deployed as Worker **`091fa762-aaf3-4f2e-9225-3a6c341a1f81`**, deployment **`ae0ad8e6-cf98-4ab7-b6c1-05b4f0ebee94`**, at 100% traffic. All **37** public files matched prepared SHA-256 values. Runtime settings/bindings are unchanged. npm publication remains paused; the canonical release artifact is unchanged. The separately packed verification candidate is not a registry release.

Unit/integration checks passed **398/398**. Fresh installed-package verification passed **30/30** across Chromium, Firefox and WebKit: credential/referrer controls with an SDK-free baseline, redirect rejection, decompression budgets, real connection cancellation, concurrency limits, Vite option serialization and native page-block lifecycle. Local scoped browser checks passed **96/96**, and fresh deployed scoped checks passed **110/110**, both with no retries. Public coverage includes HTTP deployment, runtime SDK, security scenarios, policy switches, resources, navigation and diagnostics. Root/Worker types, lint, formatting, full deployment build and dry run passed. Production dependency advisory lookup reported zero known advisories for its 206-dependency snapshot; that is not a penetration-test result.

Private cookie/HTTP-authenticated assets cannot be verified with this credential-free API. The SDK cannot prohibit DevTools or hide delivered resources, and these checks do not establish a server authorization boundary or independently measured reverse-engineering resistance. Build reports/control files still require protected hosting rules. WebKit's native redirect diagnostic was reproduced without the SDK; exact expected diagnostics are kept separate from unhandled DOM/runtime failures.

[Deployment receipt](evidence/sdk-hardening-deployment.json) · [Installed security receipt](evidence/sdk-hardening-installed.json) · [Installed Vite receipt](evidence/sdk-hardening-vite-installed.json) · [Korean options](INSTALL.ko.md) · [Public guide capture](evidence/sdk-hardening-public-guide.png).

## Optional native page protection (preceding release)

[Try page protection](https://webguard.uulab.co.kr/demo?guard=6d8e941#live-demo). Turn on **페이지 보호 모드**. The SDK then cancels inspection shortcuts even inside editors, observes docked-window size hints, and opens a native modal asking the visitor to close DevTools and recheck. The modal makes the background page inert. The demo offers an explicit exit; SDK teardown and response changes remove the owned UI. Original opt-in SDK defaults and IME composition remain preserved.

Source **`6d8e941`** is deployed as Worker **`336a0b80-4f20-49da-bcc3-914f38a31db1`**, deployment **`64f373d2-8aa7-4dd5-8559-643ccc6aad5c`**, at 100% traffic. All **37** public files matched prepared SHA-256 values. Runtime settings and bindings are unchanged. The demo remains obfuscated; npm publication is paused and the canonical prepared release artifact is unchanged. A separate tarball was packed solely for installed-consumer verification.

Fresh installed-package verification passed **15/15** native-browser cases in Chromium, Firefox and WebKit under generated HTTP CSP and enforced Trusted Types. It covers actual trusted Mac inputs in an editor, native modal status, Escape retention, background inertness, recheck, and synchronous host focus callbacks that destroy or reconfigure the SDK. Unit/integration checks passed **359/359**; the scoped local browser matrix passed **96/96** without retries. Root/Worker types, scoped lint, formatting and deployment dry run passed.

The initial complete public matrix passed **200/209**; the remaining nine failures were three existing assertions per engine that still expected the former default-off shortcut policy. Those expectations now match the documented default-on policy. The final focused rerun passed **9/9** without retries or product changes; this is combined coverage rather than a single all-green full run.

Native in-app public input also opened the modal from `Cmd+Option+I` and rechecking removed it. The in-app host reports outer dimensions larger than its viewport even without DevTools, demonstrating a real false-positive boundary; this key-input observation used the exposed 1000px threshold to separate it from the size hint, then restored default settings. Automated geometry tests explicitly simulate size differences and do not establish reliable DevTools detection.

This mode cannot close DevTools, conceal resources/DOM, stop background code or control the console. Undocked tools and browser-owned opening paths may evade detection; window chrome/zoom can produce false positives. Native modal failure emits an unavailable result, never a blocking success. It is not a server authorization boundary.

[Installed consumer receipt](evidence/page-block-installed.json) · [Deployment receipt](evidence/page-block-deployment.json) · [Native public capture](evidence/page-block-public-native.png) · [Korean usage and options](INSTALL.ko.md).

## Actual deployed code and security overview (preceding release)

[Open the protection overview](https://webguard.uulab.co.kr/demo?proof=22a196a#deployment-proof). The demo now visibly explains its own protected build and offers direct links that start the existing real entry audit or five security scenarios. The entry audit reads the current HTML's module URL, fetches those bytes and compares SHA-384 SRI. Only a matching entry is previewed as inert text, limited to 900 characters; new, failed or interrupted checks remove stale previews. Fixed private/source-map paths remain status-only probes. No source-pattern heuristic is presented as proof of obfuscation strength.

Source **`22a196a`** is deployed as Worker **`5211b025-e854-4eef-99eb-cd03de65e6eb`**, deployment **`26471a32-2232-4a57-8598-9f8248bf1abf`**, serving 100% of traffic. All **37** deployed public files matched prepared SHA-256 values. Runtime settings and bindings are unchanged. Fresh demo/docs reports contain Strict chunk transforms; their final manifests validate and their outputs contain no source maps. Application/SDK/worker code remains Strict, with the large third-party transformation engine deliberately Standard. Browser-delivered files remain observable.

The final complete unit/integration suite passed **347/347** after building, with two workers and unchanged deadlines. The first overlapping run had 343 passes and four CLI/build deadline failures. The local browser matrix passed **77/78**; one Firefox multi-step case exhausted its overall 30-second budget after both CSP comparisons passed. That same unchanged case passed **three consecutive isolated runs**. These initial failures remain recorded; no product root-cause fix is inferred from reruns. The final public matrix passed **78/78** across Chromium, Firefox and WebKit with no retries, covering the new flows, preview injection/mismatch cases, existing policies, SDK controls and full tour. Build, root/Worker types, scoped lint, formatting and dry run passed.

Native in-app public verification read the 568,573-byte deployed entry, confirmed SRI and a 900-character preview, observed the fixed private/map paths return 404, and completed all five security scenarios. Viewport checks covered mobile/tablet/desktop widths, not physical devices. SDK code, npm publication, canonical release artifacts and Codex configuration are unchanged. Historical test-generated screenshots are preserved.

[Complete receipt](evidence/deployment-proof-deployment.json) · [Actual protected code](evidence/protected-code-public.png) · [Overview](evidence/protection-overview-public.png) · [Mobile](evidence/protection-overview-public-mobile.png) · [Korean instructions](DEMO_GUARDS.ko.md).

## WebGuard service branding (preceding release)

[Open the demo](https://webguard.uulab.co.kr/demo?brand=webguard-1bdb29e). The product/service name is **WebGuard**. The hero package illustration now uses that name; `uulab-webguard` remains only the technical npm/install/import identifier. Source **`1bdb29e`** is deployed as Worker **`7630a8ed-93bf-4eab-94fc-28f25e78fc84`**, deployment **`3b49fd3b-cbf7-445f-a663-14efb910fc0e`**, at 100% traffic. All **37** public asset hashes matched. Runtime and bindings are unchanged. Build, types, scoped lint, formatting, dry run and three local navigation cases across Chromium/Firefox/WebKit passed. Native public UI readback confirmed the label. SDK behavior, npm publication and Codex configuration are unchanged.

[Receipt](evidence/webguard-brand-deployment.json) · [Public branding capture](evidence/webguard-brand-public.png).

## Shortcut restriction enabled on demo entry (preceding release)

[Open the updated demo](https://webguard.uulab.co.kr/demo?fix=default-shortcuts-3d2979f#live-demo). The public demo now starts with **단축키 제한 ON**; visitors can turn it off to compare the page's actual input behavior. The SDK already recognized Mac `Cmd+Option+I/J/C`: the preceding demo initialized its switch OFF, and the user's existing in-app tab also retained older page content. Manually enabling the preceding build canceled native `Cmd+Option+I`. No new SDK shortcut-matching defect was reproduced, and this change does not claim a complete diagnosis of an unobserved external browser/focus state.

Source **`3d2979f`** is deployed as Worker **`e1dd73f4-fa59-45f4-8254-04caeaa9eb36`**, deployment **`b4c02220-0d4b-4d46-995f-396b73ecf0f9`**, serving 100% of traffic. All **37** public files matched prepared SHA-256 values. Runtime settings and bindings match the preceding deployment. Installed SDK defaults, npm publication and Codex configuration are unchanged.

The new default-on regression failed against the preceding build, then passed with the change. Unit/integration checks passed **347/347**; related local and public browser matrices each passed **51/51** across Chromium, Firefox and WebKit without retries. They cover trusted Mac/Windows I/J/C ON/OFF, initial cancellation before an opt-in click, F12, editable exemptions, runtime integrity, navigation and the complete tour. Build, root/Worker types, scoped lint, formatting and dry run passed. Native in-app input confirmed initial ON, `Cmd+Option+I` cancellation, OFF allowance and `Cmd+Option+J` cancellation. The native automation backend refused `Cmd+Option+C` as a clipboard chord; only automated browser evidence covers C.

These observations verify page event cancellation, not a locked DevTools window. Browser menus, existing tools, editable fields, input not delivered to the page and remote debugging remain outside this guard. No native external Chrome/Safari window-state proof is claimed. The earlier historical runtime screenshot is preserved.

[Deployment receipt](evidence/demo-default-shortcuts-deployment.json) · [Native input result](evidence/demo-shortcuts-default-on-native.png) · [Korean demo instructions](DEMO_GUARDS.ko.md).

## Blue developer guide (preceding release)

[Open the guide](https://webguard.uulab.co.kr/docs/?theme=blue-242422c). Documentation now matches the approved blue SDK demo: the same logo, blue/navy palette, typography, header, buttons and light surfaces. Korean navigation, headings and explanatory text use a consistent tone. Reading width and section spacing stay generous; mobile navigation scrolls within its own row, while long code and the policy table have their own overflow areas. Existing section fragments and integration links are preserved. The npm instructions still distinguish published 0.2.0 from unpublished 0.3.0.

Source **`242422c`** is deployed as Worker **`ac5ce945-2b8f-4b20-9fda-488342f8da3c`**, deployment **`2c88cfbc-93fa-4755-8c9c-fb35de977a02`**, serving 100% of traffic. All **37** prepared public files matched deployed SHA-256 values. Runtime configuration and bindings are unchanged. SDK behavior, npm publication and Codex configuration are unchanged.

Scoped existing browser regressions passed **9/9 locally** and **6/6 publicly** across Chromium, Firefox and WebKit, with no retries. The docs obfuscation integration check, production build, root/Worker types, scoped lint, formatting and dry run passed. Native in-app checks covered 360/390/768/1440px locally and 390/1440px publicly, including anchor navigation, the install disclosure and overflow behavior. These are browser viewport checks, not physical-device testing; the full SDK matrix was not rerun for this documentation-only change.

[Deployment receipt](evidence/docs-theme-deployment.json) · [Desktop](evidence/docs-theme-public-desktop.png) · [Mobile](evidence/docs-theme-public-mobile.png).

## Multi-environment SDK and build integration (preceding release)

[Open the integration choices](https://webguard.uulab.co.kr/demo?environments=ec2f66b#setup) · [Public environment guide](https://webguard.uulab.co.kr/docs/#environments). The SDK now provides a Vite-independent build API, generic `webguard protect-app` CLI and standalone classic browser script. The demo offers generic build and HTML SDK instructions alongside Vite. Korean installation/environment guides describe actual support, server-template recipes and SSR boundaries.

Source **`ec2f66b`** is deployed as Worker **`fcb7d6c8-9032-4a74-9cc7-8225d6798c63`**, deployment **`0ede887d-e852-414b-a959-fde333be391c`**, serving 100% of traffic. All **36** public files matched prepared SHA-256 values; runtime settings and bindings are unchanged. The actual demo remains obfuscated with no public source maps. npm publication and the canonical prepared release artifact remain untouched.

Fresh installed-package tests passed **12** generic cases across Chromium, Firefox and WebKit: real Webpack, esbuild, HTML/jQuery and manually initialized classic SDK. The generic consumer had no Vite installed and passed TypeScript declaration checking. Existing Vite consumers passed **15** host/engine/tamper combinations. Unit/integration checks passed **347/347**, related release guards **33/33**, local relevant browser checks **75/75**, and the final public full matrix **194/194** with no retries. Build, root/Worker types, lint, formatting and deployment dry run passed. Initial observer/inventory test corrections are retained in the receipt.

Generic postprocessing retains toolchain filenames: deploy using release paths or revalidating cache policies when pre-protection contenthash names do not describe final bytes. Templates/servers and full Next/Nuxt/Angular SSR integration are not reported as verified runtime support.

[Installed verification and scope](MULTI_ENVIRONMENT_VERIFICATION.ko.md) · [Complete deployment receipt](evidence/multienvironment-deployment.json) · [Public setup capture](evidence/multienvironment-public-setup.png).

## Actual demo source obfuscation (preceding release)

[Open the protected demo](https://webguard.uulab.co.kr/demo?protection=480dc2a#try-examples). The actual main application, its SDK bundle, transformation Worker and documentation app are protected at build time. Application code uses Strict/High; the large third-party transformation engine uses Standard to avoid excessive expansion. Production Worker plugins are configured separately from main application plugins. This protects delivered JavaScript, including the demo implementation itself; HTML/CSS and downloadable resources remain observable.

Source **`480dc2a`** is deployed as Worker **`f4f39797-f30c-45c3-866f-158568a0f5db`**, deployment **`ad5f6885-162e-4bb3-881b-5b84ec01565e`**, serving 100% of traffic. All **35** public files matched the prepared SHA-256 values. Runtime configuration and bindings match the preceding version. Public source maps and internal build reports remain unavailable. npm publication remains paused.

Unit/integration checks passed **305/305**. The first local three-engine matrix passed **206/207**; one Chromium network policy probe timed out after a six-second gap in parent-page polling. The baseline HTTP request and protected CSP denial both occurred; the transformation Worker was never loaded in that scenario. Hidden-frame timer throttling versus process scheduling cannot be distinguished from that trace. The same case then passed **9/9** across three runs per engine, without changing application/test deadlines or adding retries. The failure remains recorded rather than described as a proven root-cause fix.

The final public matrix passed **191/191** across Chromium, Firefox, WebKit and HTTP checks, with retries disabled. Native in-app verification loaded the new SRI-bearing main entry and completed a High transformation with matching output. Build, root/Worker types, lint, formatting and deployment dry run passed.

[Korean protection scope and build explanation](DEMO_OBFUSCATION.ko.md) · [Deployment and full verification receipt](evidence/demo-obfuscation-deployment.json) · [Protected application's execution result](evidence/demo-obfuscated-public.png).

## Mac inspect shortcut recognition (preceding release)

[Open the corrected demo](https://webguard.uulab.co.kr/demo?fix=mac-c6ff863#live-demo). Enable **단축키 제한**, click the ordinary test area, and try `Cmd+Option+I/J/C`, `Ctrl+Shift+I/J/C` or F12. The SDK now also matches physical `KeyI/J/C` when Option or a keyboard layout changes the reported character to `Dead` or a special character. The optional synthetic Mac button exercises that exact character/code mismatch and explicitly does not claim that a DevTools window stayed closed.

SDK source **`c6ff863`** is deployed as Worker **`7384eec5-eda4-4596-b72e-409e765af5f2`**. All **35** public files matched the prepared output. Unit/integration checks passed **301/301**, local relevant browser checks **51/51**, and deployed relevant browser checks **51/51** across Chromium, Firefox and WebKit. A newly packed, installed local candidate also passed 36 trusted shortcut inputs and 16 synthetic layout/editable cases. Native in-app Mac input confirmed page-level cancellation on the public demo. Input/composition exemptions and opt-in defaults remain unchanged; browser-owned menus and shortcuts not delivered to the document remain outside SDK control.

The local 0.3.0 candidate was rebuilt, with the preceding artifact archived. npm publication remains paused: public **0.2.0**, unpublished **0.3.0**. [Deployment and scope receipt](evidence/mac-shortcuts-deployment.json) · [Installed candidate checks](evidence/mac-shortcuts-packed.json) · [Native Mac observation](evidence/mac-shortcuts-native-public.png).

## SDK-first blue demo (visual design; preceding release)

[Open the blue demo](https://webguard.uulab.co.kr/demo?ui=blue-aede67c). The installable SDK and Vite integration are the product; this website introduces them and demonstrates their behavior. A centered blue hero leads to installation or a spacious experiment. Browser guards, obfuscation, SDK file inspection and advanced scenarios use tabs; advanced runtime options, logs and the longer integration examples start collapsed. Native checkbox switches and keyboard tab navigation remain functional, selections and results survive tab changes, and existing fragment links reveal their target panels and disclosures.

UI source **`aede67c`** is deployed as Worker **`98783c45-299d-4934-9c7d-af34591a4a2e`**. All **35** prepared public files matched their deployed SHA-256 values. Runtime settings and bindings match the previous release. SDK and sandbox execution code and budgets are unchanged. npm publication remains paused: public **0.2.0**, unpublished candidate **0.3.0**.

The final local navigation/runtime/setup matrix passed **36/36** across Chromium, Firefox and WebKit. Earlier local regression coverage passed 198 cases plus all nine corrected navigation cases; the first navigation test had incorrectly expected a literal `tabindex` attribute instead of the native button's semantic `tabIndex` property. Browser-rendered desktop/mobile comparison and the intentional visual adaptations are recorded in [design QA](../design-qa.md).

The final fresh public matrix passed **185/185** with no automatic retries across the three browser engines and HTTP checks. The preceding run's four failures remain documented: two assertions counted the host's Cloudflare RUM beacon as SDK traffic, and two WebKit fault-injection scenarios spent their prerequisite time downloading the transform engine. The test now excludes only the exact same-origin host RUM endpoint; every application request is still checked. The bounded transformation timeout recovered normally, and SDK/sandbox code and time budgets were not changed. All affected scenarios passed in the final complete run.

[Deployment and verification receipt](evidence/blue-sdk-deployment.json) · [Desktop](evidence/blue-public-desktop.png) · [Spacious experiment](evidence/blue-public-runtime.png) · [Mobile](evidence/blue-public-mobile.png).

## Light interface and clearer navigation (historical)

[Open the updated demo](https://webguard.uulab.co.kr/demo?ui=light-e459d5e). The demo, documentation and three protected examples now use light page backgrounds, white cards, dark text, mint accents, pale code areas and visible focus outlines. The first screen explains the three-step journey and offers direct links to live protection and the Vite setup generator. Mobile feature navigation scrolls within its own row, and Korean text avoids awkward word breaks. Native WebKit selects now render at the same measured 46px height as the other engines; disclosure markers remain visible.

Current Worker version **`f24eed3c-98ed-4b44-91de-3e81716d2b75`**, deployment **`19d8eb18-025e-4c4c-8f79-e066f30a090a`**, serves 100% of traffic. Interface source: `8c05324`; native-select CSS follow-up: `e459d5e`. All **31** prepared public files matched the deployed SHA-256 values. Bindings/runtime readback matched the previous release. Security policy and SDK/runner logic were not changed. npm publication remains paused: latest 0.2.0; 0.3.0 unpublished.

The initial light release passed all **176** public functional/HTTP checks with retries disabled. After the CSS-only native-select follow-up, the final version passed **39** scoped public UI checks across Chromium, Firefox and WebKit. Another **39** rendered layout/contrast observations covered the demo, docs and examples at relevant 360/390/768/1440 widths, without horizontal page overflow. Sampled foreground contrast stayed above 4.5:1; this sampling is not a complete accessibility certification. Build, root/Worker types, lint, formatting and dry run passed. No implementation-mirroring unit tests were added for this visual change.

[Deployment, scope and observations](evidence/light-ui-deployment.json) · [Desktop](evidence/light-public-desktop.png) · [Mobile](evidence/light-public-mobile.png) · [Setup generator](evidence/light-setup.png) · [Documentation](evidence/light-docs-1440.png).

## Project setup and compatibility diagnostics (historical)

[Open the project setup generator](https://webguard.uulab.co.kr/demo#setup). Select a DOM API app, React, or the original vanilla Vite template, then choose shortcut and context-menu restrictions. The copied Vite configuration follows the selections and survives integration-tab changes. The choices edit the setup example; they do not silently change the main demo's live SDK or CSP. Installation shows a reviewed local tgz path because **0.3.0 remains unpublished; npm latest remains 0.2.0**.

The candidate's `webguardApp()` now issues an advisory `WG_TRUSTED_TYPES_SINK` build warning for recognizable application HTML string sinks under enforced Trusted Types. It reports relative file/sink names without source text, does not modify policy and excludes dependency/virtual code. TypeScript is inspected after Vite's transform. Aliases, dynamic properties, unparseable syntax and other sinks are outside this syntax scan; no warning is not proof of compatibility.

The generator's exact output was installed and built in untouched official `create-vite@9.3.1` applications with Vite 8.3.4. React strict and explicit vanilla report-only each worked in all three engines with zero page errors. Original vanilla under enforced Trusted Types still reproduces its `innerHTML` startup failure in all three; the build warning now identifies that boundary before deployment. Report-only allows those HTML sinks and requires actual HTTP response headers for observation. It is not equivalent sink protection.

Worker version **`15c15398-3cd8-4280-8d34-291f1faa3cc4`**, deployment **`4a2d66ed-0f11-4b93-a955-71f83c853573`**, serves 100% of traffic. Product source: `3dbc2f8`. All **31** public files matched their prepared SHA-256 values. Binding/runtime readback matched the preceding version; the deployment used `--keep-vars`. Hostname and Wrangler/Codex configuration files were not changed.

Verification passed: **176 public browser/HTTP checks, zero failures, retries disabled**; 21 focused local browser checks; 297 unit/integration tests; both Vite 7.3.1 and 8.3.4 installed-consumer matrices (30 checks total); 13 build tasks; root/Worker types, lint, formatting, frozen lockfile and deployment dry run. Tests include the previous WebKit startup/execution/cancellation regressions. Automated engine results are separate from physical-device testing.

The new local 0.3.0 tarball has a different hash from the preceding verification candidate; the old artifact and release record were archived locally rather than overwritten without a copy. Neither candidate was published to npm. The receipt records both hashes and retained consumer paths.

[Deployment and candidate evidence](evidence/quality-onboarding-deployment.json) · [Public setup screenshot](evidence/setup-generator.png) · [Generated starter configurations](evidence/quality-onboarding-starters.json) · [Korean installation guide](INSTALL.ko.md).

## WebKit startup and execution budgets (historical)

The isolated runner now waits for the frame and a trusted Worker bootstrap to become ready before starting the existing 1,000 ms execution budget. Previously, the Worker timer began at construction and the parent watchdog began before the frame loaded, so cold startup could be reported as failed code execution. A 1,400 ms delay before a real native Worker starts reproduces the old failure for a trivial calculation; a 2,100 ms frame-start delay also reproduces the premature timeout.

Startup is separately bounded at 5,000 ms, with an independent 1,800 ms execution-response watchdog after the trusted iframe reports running. Worker control messages cannot reset that phase or deadline. The payload uses an iframe-created Blob imported by a standalone Worker bootstrap; the original opaque origin and blob-only script/network CSP stay in force, without adding eval permission. Invalid results, synchronous construction errors, cancellation and page lifecycle transitions all clean up the Worker, Blob URLs, timers and ports. Empty thrown messages are preserved as execution failures instead of matching outputs.

Current Worker version: `ec8af74b-42c8-4119-8ab4-ff0627909676`; deployment: `c539c16d-052d-4c48-9d55-a19bd9740352`, 100% traffic. Implementation source: `ea2351f`. npm publication remains paused: **latest 0.2.0; candidate 0.3.0 unpublished**. Bindings, compatibility settings, observability, hostnames and Codex settings are unchanged.

The final complete public matrix passed **170 checks with zero failures and no automatic retries**, including 165 browser checks across Chromium, Firefox and WebKit plus five HTTP checks. All 165 local browser checks, 287 unit/integration tests, 13 build tasks, root/Worker types, lint, formatting and dry run passed. WebKit's normal obfuscation example also passed five consecutive cold-page runs. All 31 deployed files matched their prepared SHA-256 values.

The earlier public matrix passed 169 checks and one Firefox navigation was interrupted by Playwright's internal response-object connection lookup after its HTTP redirect assertions had passed. The same unchanged scenario passed three consecutive isolated runs; the fresh complete matrix above then passed without changing product code, time budgets or assertions. This tooling interruption and the initial edge-propagation file readback remain in the evidence rather than being erased from the release history.

[Root cause, reproduction and deployment evidence](evidence/webkit-startup-fix-deployment.json) · [Korean demo guide](DEMO_GUARDS.ko.md).

## Interactive switches and deployed compatibility (historical)

Open [policy switches](https://webguard.uulab.co.kr/demo#policy-lab) to enable or disable network, DOM string insertion and inline-script restrictions independently. **선택 정책 비교 실행** runs an all-off control and the selected settings in fresh opaque-origin sandbox frames. The before/after panels display actual allowed, blocked, unsupported or failed observations. Changing a switch invalidates old results. The switches affect the isolated trial; the main document and server retain their deployment policies.

[Deployment compatibility](https://webguard.uulab.co.kr/demo#compatibility-lab) checks a real Korean multipage document, UTF-8 bytes and declaration order, CSP meta and response headers, final redirect URL/query preservation, the constant HTTP API and exact missing-page 404. The direct link opens the actual nested page. Browser UI verifies a followed redirect, while HTTP tests separately inspect 308 and Location. Invalid MIME types, malformed head placement, missing enforced headers, incorrect API markers and SPA fallback cannot produce a successful audit. HTTP API connectivity is separate from local Vite preview proxy verification.

The complete feature tour includes both panels, existing live SDK controls, five security scenarios, resource auditing and High obfuscation. Trusted Types availability remains explicit. New runs cancel pending work on page lifecycle transitions, and failed controls never count as successful protection. The public nested-page adapter now derives directory aliases only from allowed index documents, preserves mount boundaries and query parameters, and retains exact private-path and missing-file rejection.

The demo exposes local 0.3.0 candidate features independently of npm. **npm publication remains paused: latest is 0.2.0 and 0.3.0 is unpublished.** The installation guide retains that distinction. Codex settings are unchanged.

Historical Worker version: `3a1fc944-abea-4814-b013-5b746d0da20a`; deployment: `fbd09e5e-b121-43c0-a57d-5ca972620e34`, 100% traffic. Implementation source: `4a0ae1c`. Bindings, compatibility settings, observability and hostname mappings are retained. The adapter explicitly marks prepared HTML as `text/html; charset=utf-8`, including HEAD responses; Cloudflare asset MIME metadata alone omitted the encoding. Comparison columns now retain their full width even when all policies are off.

Final validation: 287 unit/integration tests, 72 local browser checks of the changed panels and full tour, all 13 build tasks, root/Worker types, lint, formatting and dry run passed. The final public matrix passed 145 of 146 checks; one WebKit source execution reached the existing 1,000 ms sandbox limit while the protected example completed correctly. All six WebKit Playground checks then passed in isolation on the same deployed version, without changing code or deadlines. Thus all 146 unique checks are covered across those runs; the initial full run was not clean. All 31 deployed files matched prepared SHA-256 values. Earlier iterations, the observed execution limit and exact verification scope remain in the release evidence.

[Korean usage guide](DEMO_GUARDS.ko.md) · [On](evidence/policy-switches-on.png) · [Off](evidence/policy-switches-off.png) · [Compatibility](evidence/deployment-compatibility.png) · [Release evidence](evidence/interactive-switches-deployment.json).

## Expanded guards and protected Playground (historical)

The complete tour now runs five policy/tampering scenarios plus the SDK and a real deployment-resource audit. New before/after probes compare a fixed JSON fetch against `connect-src` enforcement and a harmless `innerHTML` assignment against Trusted Types enforcement. Unsupported Trusted Types is explicitly excluded from successful checks; an interrupted or invalid control response never counts as protection. The fixed CORS fixture returns no request or user data and accepts no credentialed response sharing.

The Playground entry bundle itself now uses WebGuard's strict preset (High transforms and RC4 string encoding). Entry JS and CSS carry file-bound SHA-384 SRI, and public source maps remain disabled. Build-only reports and original/configuration files stay outside the exact public allowlist. Browser-delivered JS/CSS still remain inspectable. The visitor can fetch the actual private-path probes and compare entry bytes with the document SRI in the new **배포 리소스 검사** panel. This checks deployment observations, not authorization or authenticity of an attacker-controlled HTML document.

The stricter application build exposed an existing `function.toString()` bootstrap assumption: transformed code referenced outer string decoders that were absent in the isolated frame. A standalone raw bootstrap preserves the original sandbox, worker and message-channel boundaries while removing that closure dependency. Infinite-loop, blocked-network and forged-message regressions remain covered. Resource audits also retain their event listeners across persisted page lifecycle transitions, abort old work and prevent stale results from replacing a new run. Lifecycle tests simulate the browser events; they do not prove that a particular navigation was admitted to BFCache.

Historical deployment: Worker version `799cd048-5712-45e6-bb14-bc61c3ac5b8c`, deployment `99b788e8-8bd5-4fa8-937c-9be36f8995f4`, 100% traffic. Implementation source commit: `1a24aa3`. Final verification passed 99 local browser checks and 104 public checks (99 browser + five HTTP), each across Chromium, Firefox and WebKit where applicable, plus 20 local API/routing tests. All 29 public files matched prepared SHA-256 values; root/Worker type checks, scoped lint, formatting and the deployment dry run passed. npm publication and Codex settings were unchanged. The following release sections are historical.

[Korean guard guide](DEMO_GUARDS.ko.md) · [Resource audit screenshot](evidence/resource-guards.png) · [Deployment and validation evidence](evidence/expanded-guards-deployment.json).

## Diagnostics and favicon fix (historical)

The missing `/favicon.ico` now serves a real 32px ICO; the head links both the matching SVG mark and the ICO fallback. Both images decode to 32×32 in Chromium, Firefox and WebKit and serve HTTP 200 with image content types.

The lab explains that its intentional CSP violation and rejected quote (HTTP 409) can appear as red browser-console entries. Each successful probe labels its expected diagnostic in its actual result; missing observations and server 500 responses remain failures. CSP enforcement, the server rejection and browser error reporting are preserved. No console clearing, global error suppression or fake successful response is introduced.

Verified Worker version `a1ec6f30-6dc8-4a6e-ae65-eb70a89b6918`, deployment `dcdaaa1a-a163-4928-85c1-3a15616d7f2d`, 100% traffic. Nine local browser tests and all 13 scoped public checks passed, including no unexpected startup console errors, no unhandled application exceptions during the whole tour, and a mocked server-failure distinction. All 29 deployed files matched local hashes. The full earlier feature matrices are historical evidence; this release reran the checks appropriate to the icon and diagnostic-only changes.

[Diagnostics fix evidence](evidence/demo-diagnostics-deployment.json) · [Expected-diagnostic explanation](evidence/demo-diagnostics.png).

## Complete feature tour

The first screen now exposes the real SDK, rather than placing its controls beneath the transformation tools. **전체 기능 체험 시작** enables shortcut/context-menu restrictions and explicit integrity checks, starts the SDK file verification and the three policy/tampering probes, and protects the current editor source using High. Existing editor content is preserved. A concurrent run is rejected with a visible message instead of relabeling an in-progress transform. Individual controls remain available; reloading returns to observation mode.

The live panel includes:

- Immediate on/off controls, individual shortcut/context-menu/dimension-detection/warning/integrity settings, a validated 40–1000 pixel heuristic threshold, and the actual `getOptions()` policy rendered as an update example.
- A focusable body target and an editable input. Browser keyboard/mouse tests observe trusted F12 and context-menu events, their real `defaultPrevented` state, and editable-field exceptions. Synthetic trials are separately labeled and do not establish DevTools-window prevention.
- Calls to the actual `checkIntegrity()` API against a manifest-listed protected JavaScript asset, followed by a one-character changed expected hash. Results require a real SDK mismatch event; a fetch error is not presented as a mismatch. Tests also replace actual response bytes to prove the display reacts to changed content. An explicit disabled policy performs no requests. A ten-second UI deadline disables integrity checking and aborts SDK requests instead of leaving a permanent busy control.
- A local event history capped at 20 entries, a clear button, no typed-input collection and no event upload. Dimension signals are labeled as uncertain and never converted into a claim that DevTools is open.

The document language is Korean. The install command now wraps on narrow Firefox viewports. The notice at the top explicitly distinguishes page input restrictions from Chrome-menu, existing-console and external-debugger control.

Verified deployment: Worker version `fd2c5843-c722-4577-8dbc-35b737d0f08d`, deployment `d371d152-99f8-4c6a-a1d0-f6e3f9defa6a`, 100% traffic. All 27 public files matched the local payload hashes. The final SDK browser set passed 21 checks; the two Firefox layout regressions passed after wrapping the command. The public matrix passed 69 of 70 checks, with a cached-read network-observer assumption failing once; the unchanged-response, cache-disabled observation fixture then passed on all three engines, completing verification of all 70 unique public checks. This is not a claim that the initial full matrix was clean. Earlier attempts and long wall-time stalls are retained in the evidence file. Main/Worker TypeScript, scoped ESLint, formatting and the deployment dry run passed.

This extends the lab release below; the earlier lab version and evidence remain historical. See [the complete-tour evidence](evidence/runtime-demo-deployment.json) and [the completed live panel](evidence/runtime-demo.png). npm packages and Codex settings are unchanged.

## Interactive lab release

The first screen now offers a one-click sequence and individual repeatable scenarios:

- Fixed inline script, `eval` and HTML event-handler probes run before/after CSP in separate opaque-origin, `allow-scripts` sandboxed frames. Success requires execution in the control plus nonexecution and a CSP violation (or the `eval` probe's actual `EvalError`) in the policy frame. Source, random token and message shape are checked; missing observations are not counted as success. The meta-policy fixture demonstrates browser policy, not DevTools prevention.
- SHA-384 compares a known original, a fixed changed file and editable input. This is a local hash demonstration, not an authenticity proof or live SRI enforcement.
- `/api/demo/quote` accepts same-origin JSON POST requests, recalculates the fixed course price on the server and returns HTTP 200 for 9,900 and HTTP 409 for a changed claim. The stateless sample does not create accounts, orders or payments and is not an SDK authorization feature. Origin checking is not authentication. Exact keys, integer/range constraints, a 1 KiB streaming body limit, a three-second read deadline and no-store responses bound the teaching endpoint.

The main demo remains available at [the canonical URL](https://webguard.uulab.co.kr/demo#security-lab). Existing obfuscation examples, protected apps and live shortcut controls remain available. A failed/network-interrupted scenario displays failure and remains retryable; no fabricated result is substituted.

Local API/routing checks (18 tests), main and Worker type checks, ESLint and a Wrangler dry run passed. The final local demo browser matrix passed all 45 tests across Chromium, Firefox and WebKit. The deployed HTTPS matrix passed all 49 checks (45 browser checks and four HTTP/integrity/API checks); an additional Chromium run captured the completed scenarios. The initial browser run found duplicate status-region selection and missing WebKit `eval` violation events (38 passed, four failed); the production UI and probe observations were corrected before the successful final run. Timeout and CSP settings were not relaxed to manufacture success.

Worker version `c2df10c1-c6bc-4267-a5d4-faf38984049e`, deployment `c2edbc87-f9ba-41df-a053-aeb94cb70f63`, serves 100% of traffic. The CLI authentication store was unavailable, so the existing connected Cloudflare account was used for the public asset upload and atomic Worker update; bindings, compatibility date, observability and hostname mappings were preserved. Temporary scoped asset-upload tokens were removed after use. Codex settings and npm publication were not changed.

[Interactive lab screenshot](evidence/security-lab.png) · [Release evidence](evidence/security-lab-deployment.json).

Use `pnpm demo` for the full local gateway including the API. The Vite-only `pnpm dev` preview serves the frontend; a missing API is displayed as a failed request, not successful protection.

## Branded-domain release (historical)

Verified on 2026-10-20 (Asia/Seoul): Worker version `dcd29343-80af-46cf-9f3b-f1485a509ef9`, deployment `57c83a0b-21ac-48b3-a756-9bb03c7c228c`, serving 100% of traffic with the `webguard.uulab.co.kr` Custom Domain and the existing Workers subdomain enabled.

- All 36 unique public checks passed across the initial run and isolated Firefox rerun: three HTTP/integrity checks and 33 browser checks across Chromium, Firefox and WebKit. No localhost preview server is used by this matrix. The old hostname also passed all three HTTP checks.
- All 27 publicly deployed files matched prepared local SHA-256 values on both hostnames. All five application mounts returned their intended response policies. Source maps, configuration, reports and original source probes returned 404.
- Local validation passed: all 13 build tasks plus mounted demo builds, root/Worker TypeScript, ESLint, formatting and eight focused routing/preparation tests. Existing CLI workflow timeouts were checked separately with a longer workflow budget while retaining each command's 30-second limit. The evidence records the initial failures and reruns.
- The deployment checker verifies real entry HTML, assets, generated response headers and nonpublic URLs against trusted local output. Fresh npm registry installations of 0.2.0 passed with Vite 7.3.1 and 8.3.4, including the installed executable.
- Vanilla example controls stay disabled until initialization completes. Browser regressions deliberately delay the script response and verify the first enabled click works. Preparation also rejects overlapping and symlinked output paths before creating directories.

[Deployment metadata, hashes and HTTP readback](evidence/branded-domain-deployment.json) · [Public screenshot](evidence/branded-demo.png). These are public HTTPS and local desktop-engine observations; npm publication is separately verified in [the release evidence](evidence/npm-release-0.2.0.json); remote CI and physical-device testing remain separate.

The public onboarding now includes `npm install --save-dev uulab-webguard@0.2.0`, copyable one-setting Vite integration, `webguard-check` and the [full Korean guide](https://webguard.uulab.co.kr/docs/INSTALL.ko.txt). The [0.2.0 Workers-subdomain release](evidence/quality-0.2.0-deployment.json), [0.1.0 onboarding release](evidence/npm-onboarding-deployment.json) and [original public release](evidence/public-deployment.json) are retained as historical records.

## Build and deploy

```sh
pnpm install --frozen-lockfile
pnpm deploy:build
pnpm deploy:dry-run
pnpm exec wrangler whoami
pnpm exec wrangler deploy
```

Wrangler is pinned in this workspace. `wrangler.jsonc` targets a dedicated `webguard-demo` Worker and its `webguard.uulab.co.kr` Custom Domain on the intended UULab account. The hostname had no existing DNS record or Worker binding before attachment. Other operators must select their own account, Worker and hostname before deployment. Credentials use Wrangler's local authentication store and are not in repository files or uploaded assets.

`deploy:build` assembles the full demo, prepares sanitized public assets and a private routing manifest, generates binding/runtime types and checks the Worker contract. Source maps, deployment controls, local-path reports, original sources, server files and dotfiles are excluded from the public upload. The three protected application manifests are checked against local files before preparation. Policy JSON is bundled into the Worker rather than publicly served.

The Worker serves an explicit asset allowlist and the exact stateless `/api/demo/quote` teaching route. Static files support GET/HEAD; the teaching API supports POST. It handles trailing-slash mounts, policy-bearing errors and 404 responses without an SPA fallback. HTML handling in the asset binding is disabled so explicit `index.html` verification remains possible. Bodies are streamed from the asset binding.

## Policies and runtime

React/JS/TS retain their generated CSP/Trusted Types response policies. Playground/docs retain their separate minimal policy because their UI and isolated runner have different requirements. No developer-console lock or authorization boundary is inferred from those controls. Browser source input never becomes a server-side code-execution job.

Worker logs/traces are enabled with sampled collection and query-string redaction. Application code does not log submitted code or add browser telemetry. Worker-first routing is used to apply policies and reject nonpublic paths on every request; these requests are subject to the account's Worker request limits. Public hosting remains distinct from npm package publication.

## Validate a release

```sh
WEBGUARD_PUBLIC_URL=https://webguard.uulab.co.kr pnpm test:public
```

The public matrix checks real HTTP response policies, missing/nonpublic paths, deployed bytes against trusted local manifests, three-engine example navigation, one-click High transforms, live SDK controls and the existing isolated-runner regressions. It does not use local preview servers. Use separate `--output` directories when running multiple Playwright commands concurrently; shared output cleanup can remove another run's traces. Record the exact deployed version, local asset hashes and observed results in a release evidence file.

References: [static assets binding](https://developers.cloudflare.com/workers/static-assets/binding/), [worker-first routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [exact HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

# WebGuard blue SDK demo

final result: passed

## Source and state

- Selected visual: `docs/evidence/blue-sdk-design.png` (916 × 1717 raster), the user's selected third blue concept revised for a spacious lower section.
- Implementation: `docs/evidence/blue-sdk-desktop.png` (1440 × 2435 raster, 1440 × 1024 CSS viewport, device scale 1), plus `docs/evidence/blue-sdk-mobile.png` (390 CSS px wide, scale 1).
- State: browser guard tab selected, both restrictions off, advanced options and integration examples collapsed. Initial SDK initialization reports the applied settings without claiming a test succeeded.
- This is an implementation of the requested visual direction, with responsive product typography and the existing real demos retained. The generated reference's raster size differs from its requested design size; comparison images normalize both to 720 px width, preserving each aspect ratio. They do not imply pixel-identical typography.

## Comparison evidence and history

Full view: `docs/evidence/blue-sdk-comparison.jpg`. Focused demo region: `docs/evidence/blue-sdk-demo-comparison.jpg`. Both inputs contain source and rendered implementation together.

Initial comparison found three P2 differences: the transparent illustrations appeared undersized, the flow caption was enclosed in the code panel, and the functional checkboxes did not resemble the selected switches. The implementation trims only transparent asset margins, places the caption outside the code surface, and styles native accessible checkboxes as switches. Small scope-note colors were also darkened. The second browser capture and combined comparison confirm those corrections.

## Required fidelity surfaces

- Typography: centered Korean sans hierarchy, blue emphasis, separate monospace code; readable real-product sizing replaces the generated image's raster-scaled text. No clipped heading at 390 px. The illustrative snippet is smaller than the editable integration examples.
- Spacing: separate hero, spacious experiment, and SDK integration sections. Only the selected demo is displayed. Advanced controls, event records and lengthy integration examples require an explicit disclosure. Mobile places the two illustrations in one row before the configuration snippet.
- Colors: light sky surfaces, royal-blue actions, dark navy headings. Original semantic error/warning states remain available inside their scenarios. This is a visual review, not a full accessibility certification.
- Images: generated cube, web-app, input illustration and sky background match the selected direction. Production uses optimized WebP assets (about 210 KiB total). Original PNG assets are retained locally in `.npm-release/blue-assets-originals/`. UI text and controls remain real DOM, not screenshot controls.
- Content: SDK and build integration are the product; the website demonstrates them. Candidate 0.3.0 and public 0.2.0 remain distinguished. DevTools cannot be locked; server authorization remains separate. No fake test results, protection scores or fabricated performance values.

## Behavior and responsive checks

- In-app browser: 1440 desktop and 390 mobile captures, live restriction change, native input area, folded advanced controls and hero demo navigation checked. Mobile document width equals its viewport (390 px).
- Existing local three-engine suite: 198 cases passed initially; the three new navigation cases used an incorrect literal `tabindex` expectation for a native button. The semantic `tabIndex` assertion was corrected; all nine navigation cases then passed across three engines. No app bug was hidden or timeout increased.
- Final built artifact: navigation, runtime and setup smoke passed 36/36 across Chromium, Firefox and WebKit.
- SDK/browser policy implementation and sandbox execution budgets were not changed. npm publication remains paused.

## Follow-up polish

- P3: the generated reference uses an illustration arrow between flow items; the implementation uses alignment and ordered captions instead.
- System font rendering varies by OS. Physical-device Safari and a comprehensive screen-reader audit were not performed in this pass.

## Implementation checklist

- [x] Preserve the SDK-first product identity and blue public website direction.
- [x] Keep the initial experiment uncluttered and preserve every existing demo through tabs/deep links.
- [x] Preserve runtime settings and results across navigation; support arrow keys, Home and End.
- [x] Verify responsive layout and real controls before handoff.
- [x] Resolve actionable P0/P1/P2 findings from the comparison.

/** Presentation only: switching a demo never resets its SDK or test results. */
export function initDemoNavigation() {
  const tabs = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-demo-tab]"),
  ];
  const labs = [
    "policy-lab",
    "security-lab",
    "compatibility-lab",
    "resource-exposure",
  ];
  let activeLab = labs[0]!;
  function selectLab(id: string) {
    if (!labs.includes(id)) return;
    activeLab = id;
    for (const lab of labs) document.getElementById(lab)!.hidden = lab !== id;
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      ".advanced-navigation a",
    )) {
      if (link.hash === `#${id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  for (const id of labs) document.getElementById(id)!.dataset.demoLab = id;
  selectLab(activeLab);
  function select(name: string) {
    for (const tab of tabs) {
      const selected = tab.dataset.demoTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")!)!.hidden =
        !selected;
    }
  }
  function revealHash() {
    let id: string;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const panel = target.closest<HTMLElement>(".demo-view");
    if (panel) select(panel.id.replace("-view", ""));
    const lab = target.closest<HTMLElement>("[data-demo-lab]");
    if (lab) selectLab(lab.id);
    for (
      let parent: HTMLElement | null = target;
      parent;
      parent = parent.parentElement
    )
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      else if (parent.hasAttribute("data-demo-marketing"))
        parent.hidden = false;
    // The browser may attempt its anchor scroll before a hidden panel is revealed.
    requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      select(tab.dataset.demoTab!);
      const target = {
        runtime: "live-demo",
        obfuscation: "try-examples",
        integrity: "sdk-file",
        advanced: activeLab,
      }[tab.dataset.demoTab!];
      history.replaceState(null, "", `#${target}`);
    });
    tab.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(tab);
      const next =
        event.key === "ArrowRight"
          ? (current + 1) % tabs.length
          : event.key === "ArrowLeft"
            ? (current + tabs.length - 1) % tabs.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : -1;
      if (next < 0) return;
      event.preventDefault();
      tabs[next]!.click();
      tabs[next]!.focus();
    });
  }
  window.addEventListener("hashchange", revealHash);
  // Also reveal an already-selected deep link when clicked a second time.
  document.addEventListener("click", (event) => {
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      "a[href^='#']",
    );
    if (anchor?.hash && anchor.hash === location.hash) revealHash();
  });
  revealHash();
}

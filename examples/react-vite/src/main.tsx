import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getWebGuard } from "@webguard/vite-plugin/client";
import "./style.css";
function App() {
  const automaticGuard = getWebGuard();
  const [count, setCount] = useState(0),
    [lazy, setLazy] = useState("Not loaded"),
    [name, setName] = useState(""),
    [greeting, setGreeting] = useState(""),
    [block, setBlock] = useState(
      automaticGuard?.getOptions().devtools?.blockShortcuts === true,
    ),
    [contextMenu, setContextMenu] = useState(
      automaticGuard?.getOptions().devtools?.blockContextMenu === true,
    ),
    [events, setEvents] = useState<string[]>([]),
    [route, setRoute] = useState(location.hash || "#home");
  useEffect(() => {
    const guard = getWebGuard();
    guard?.update({
      onThreat: (e) => setEvents((old) => [...old.slice(-4), e.type]),
    });
    return () => guard?.update({ onThreat: undefined });
  }, []);
  useEffect(() => {
    const listener = () => setRoute(location.hash);
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  return (
    <main>
      <p className="eyebrow">WEBGUARD / REACT + VITE</p>
      <h1>
        Same application.
        <br />
        <span>Protected build.</span>
      </h1>
      <p>
        This page runs the actual obfuscated production bundles. Open developer
        tools to inspect what is still observable.
      </p>
      <nav>
        <a href="#home">Home</a>
        <a href="#details">Details</a>
      </nav>
      <p data-testid="route">Route: {route}</p>
      <section>
        <h2>Try the application</h2>
        <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
        <button
          onClick={async () => {
            const result = await (await import("./lazy")).getAnswer();
            setLazy(`${result.label}: ${result.answer}`);
          }}
        >
          Load module
        </button>
        <p role="status">{lazy}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setGreeting(`Hello, ${name}`);
          }}
        >
          <label>
            Your name{" "}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit">Submit</button>
        </form>
        <p>{greeting}</p>
      </section>
      <section>
        <h2>Live SDK controls</h2>
        <p data-testid="guard-startup">
          {automaticGuard
            ? "Automatic SDK ready before React render"
            : "SDK starts in protected builds; development stays unrestricted"}
        </p>
        <label>
          <input
            type="checkbox"
            checked={block}
            disabled={!automaticGuard}
            onChange={(e) => {
              getWebGuard()?.update({
                devtools: { blockShortcuts: e.target.checked },
              });
              setBlock(e.target.checked);
            }}
          />{" "}
          Intercept developer tool shortcuts
        </label>
        <label>
          <input
            type="checkbox"
            checked={contextMenu}
            disabled={!automaticGuard}
            onChange={(e) => {
              getWebGuard()?.update({
                devtools: { blockContextMenu: e.target.checked },
              });
              setContextMenu(e.target.checked);
            }}
          />{" "}
          Intercept context menu
        </label>
        <p>
          Changes take effect immediately without a rebuild or reload. Editing
          fields remain usable.
        </p>
        <p>
          Browser menus and external inspection remain available. Detection is
          advisory.
        </p>
        <output aria-label="Guard events">
          {events.join(", ") || "No advisory events"}
        </output>
      </section>
      <footer>
        Source maps are absent from this public build. Credentials belong on a
        server.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

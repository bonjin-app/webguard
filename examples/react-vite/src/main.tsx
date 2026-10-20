import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { WebGuard } from "@webguard/browser";
import "./style.css";
function App() {
  const [count, setCount] = useState(0),
    [lazy, setLazy] = useState("Not loaded"),
    [name, setName] = useState(""),
    [greeting, setGreeting] = useState(""),
    [block, setBlock] = useState(false),
    [events, setEvents] = useState<string[]>([]),
    [route, setRoute] = useState(location.hash || "#home");
  useEffect(() => {
    const guard = WebGuard.init({
      devtools: { detect: true, blockShortcuts: block },
      onThreat: (e) => setEvents((old) => [...old.slice(-4), e.type]),
    });
    return () => guard.destroy();
  }, [block]);
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
        <h2>Optional shortcut friction</h2>
        <label>
          <input
            type="checkbox"
            checked={block}
            onChange={(e) => setBlock(e.target.checked)}
          />{" "}
          Intercept developer tool shortcuts
        </label>
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

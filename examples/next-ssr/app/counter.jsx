"use client";
import { useEffect, useState } from "react";
import { getWebGuard } from "uulab-webguard/client";
import styles from "./counter.module.css";

export default function Counter() {
  const [count, setCount] = useState(0);
  const [guard, setGuard] = useState("pending");
  const [lazy, setLazy] = useState("pending");
  useEffect(() => {
    setGuard(getWebGuard() ? "active" : "missing");
  }, []);
  return (
    <section>
      <p id="guard-status">{guard}</p>
      <button
        className={styles.protectedCounter}
        id="counter"
        onClick={() => setCount((value) => value + 1)}
      >
        Count {count}
      </button>
      <button
        id="lazy"
        onClick={async () => {
          const module = await import("./lazy");
          setLazy(module.calculate(7));
        }}
      >
        지연 모듈 실행
      </button>
      <p id="lazy-result">{lazy}</p>
    </section>
  );
}

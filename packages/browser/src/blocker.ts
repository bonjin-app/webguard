/** A browser-owned modal blocks background interaction; it does not stop code or DevTools. */
export function createPageBlocker(document: Document, recheck: () => void) {
  let dialog: HTMLDialogElement | undefined;
  const preventCancel = (event: Event) => event.preventDefault();
  function clear() {
    const current = dialog;
    dialog = undefined;
    if (!current) return;
    current.removeEventListener("cancel", preventCancel);
    try {
      if (current.open) current.close();
    } catch {
      // Removing the owned node also releases its modal state.
    }
    current.remove();
  }
  return {
    clear,
    show(
      reason: "shortcut" | "geometry",
    ): "shown" | "existing" | "unavailable" {
      if (dialog?.isConnected && dialog.open) return "existing";
      clear();
      const node = document.createElement("dialog");
      if (typeof node.showModal !== "function") return "unavailable";
      node.setAttribute("data-webguard-blocker", "");
      node.setAttribute("aria-label", "개발자도구를 닫아 주세요");
      Object.assign(node.style, {
        position: "fixed",
        inset: "0",
        margin: "0",
        border: "0",
        width: "100vw",
        maxWidth: "100vw",
        height: "100dvh",
        maxHeight: "100dvh",
        boxSizing: "border-box",
        padding: "24px",
        background: "#f4f8ff",
        color: "#192b49",
        fontFamily: "system-ui, sans-serif",
        overflow: "auto",
      });
      const card = document.createElement("section");
      Object.assign(card.style, {
        maxWidth: "480px",
        margin: "12vh auto 0",
        padding: "32px",
        background: "#fff",
        border: "1px solid #d9e6fa",
        borderRadius: "24px",
        boxSizing: "border-box",
        lineHeight: "1.65",
        boxShadow: "0 20px 70px #1b4b8c14",
      });
      const title = document.createElement("h2");
      title.textContent = "개발자도구를 닫아 주세요";
      Object.assign(title.style, {
        margin: "0 0 16px",
        fontSize: "26px",
        lineHeight: "1.4",
      });
      const description = document.createElement("p");
      description.textContent =
        reason === "shortcut"
          ? "검사 단축키 입력이 감지되어 이 페이지의 조작을 잠시 제한했습니다. 개발자도구가 열려 있다면 닫은 뒤 다시 확인해 주세요."
          : "창 크기 차이에서 도킹된 패널로 의심되는 신호가 감지되어 이 페이지의 조작을 잠시 제한했습니다. 개발자도구가 열려 있다면 닫은 뒤 다시 확인해 주세요.";
      const limit = document.createElement("p");
      limit.textContent =
        "창 크기·확대 설정으로 잘못 감지될 수 있습니다. 이 안내는 개발자도구를 닫거나 백그라운드 실행을 중지하지 않으며, 서버의 권한 검증을 대신하지 않습니다.";
      Object.assign(limit.style, { fontSize: "14px", color: "#526682" });
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-webguard-recheck", "");
      button.textContent = "닫은 뒤 다시 확인";
      Object.assign(button.style, {
        minHeight: "48px",
        padding: "12px 20px",
        border: "0",
        borderRadius: "12px",
        background: "#2866ed",
        color: "#fff",
        font: "inherit",
        fontWeight: "600",
        cursor: "pointer",
      });
      button.addEventListener("click", recheck);
      node.addEventListener("cancel", preventCancel);
      card.append(title, description, limit, button);
      node.append(card);
      try {
        // showModal focuses synchronously; host focus handlers may tear down the guard.
        dialog = node;
        document.body.append(node);
        node.showModal();
        if (dialog !== node || !node.isConnected || !node.open)
          throw new Error("Modal did not remain open");
        return "shown";
      } catch {
        if (dialog === node) dialog = undefined;
        node.remove();
        return "unavailable";
      }
    },
  };
}

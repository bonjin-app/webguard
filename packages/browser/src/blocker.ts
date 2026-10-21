export type BlockReason =
  "shortcut" | "geometry" | "dom-tamper" | "debugging-suspicion";

/** A browser-owned modal blocks background interaction; it does not stop code or DevTools. */
export function createPageBlocker(document: Document, recheck: () => void) {
  let dialog: HTMLDialogElement | undefined;
  let shownReason: BlockReason | undefined;
  const preventCancel = (event: Event) => event.preventDefault();
  function clear() {
    const current = dialog;
    dialog = undefined;
    shownReason = undefined;
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
    show(reason: BlockReason): "shown" | "existing" | "unavailable" {
      if (dialog?.isConnected && dialog.open && shownReason === reason)
        return "existing";
      clear();
      const node = document.createElement("dialog");
      if (typeof node.showModal !== "function") return "unavailable";
      node.setAttribute("data-webguard-blocker", "");
      const heading =
        reason === "dom-tamper"
          ? "페이지 변경을 확인해 주세요"
          : reason === "debugging-suspicion"
            ? "실행 지연이 감지됐어요"
            : "개발자도구를 닫아 주세요";
      node.setAttribute("aria-label", heading);
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
      title.textContent = heading;
      Object.assign(title.style, {
        margin: "0 0 16px",
        fontSize: "26px",
        lineHeight: "1.4",
      });
      const description = document.createElement("p");
      description.textContent =
        reason === "shortcut"
          ? "검사 단축키 입력이 감지되어 이 페이지의 조작을 잠시 제한했습니다. 개발자도구가 열려 있다면 닫은 뒤 다시 확인해 주세요."
          : reason === "geometry"
            ? "창 크기 차이에서 도킹된 패널로 의심되는 신호가 감지되어 이 페이지의 조작을 잠시 제한했습니다. 개발자도구가 열려 있다면 닫은 뒤 다시 확인해 주세요."
            : reason === "dom-tamper"
              ? "보호하도록 선택한 정적 영역이 기준 상태와 달라 이 페이지의 조작을 잠시 제한했습니다. 원래 상태로 복구한 뒤 다시 확인해 주세요. 정상적인 화면 갱신도 변경으로 감지될 수 있습니다."
              : "보이는 페이지에서 실행한 일회성 시간 측정이 늦게 완료되어 이 페이지의 조작을 잠시 제한했습니다. 디버거 일시 정지 외에도 느린 기기나 브라우저 작업이 원인일 수 있습니다.";
      const limit = document.createElement("p");
      limit.textContent =
        (reason === "dom-tamper"
          ? "정적 영역의 정상 갱신도 변경으로 감지됩니다. "
          : reason === "debugging-suspicion"
            ? "실행 지연만으로 개발자도구 열림을 확정할 수 없습니다. "
            : "창 크기·확대 설정으로 잘못 감지될 수 있습니다. ") +
        "이 안내는 개발자도구를 닫거나 백그라운드 실행을 중지하지 않으며, 서버의 권한 검증을 대신하지 않습니다.";
      Object.assign(limit.style, { fontSize: "14px", color: "#526682" });
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-webguard-recheck", "");
      button.textContent =
        reason === "dom-tamper"
          ? "복구 후 기준 상태 확인"
          : reason === "debugging-suspicion"
            ? "확인 후 계속"
            : "닫은 뒤 다시 확인";
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
        shownReason = reason;
        document.body.append(node);
        node.showModal();
        if (dialog !== node || !node.isConnected || !node.open)
          throw new Error("Modal did not remain open");
        return "shown";
      } catch {
        if (dialog === node) {
          dialog = undefined;
          shownReason = undefined;
        }
        node.remove();
        return "unavailable";
      }
    },
  };
}

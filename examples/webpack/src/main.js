const guard = globalThis.WebGuardSDK?.getAutoGuard();
document.querySelector("#startup").textContent = guard
  ? "SDK ready before app"
  : "SDK missing";
document.querySelector("#calculate").addEventListener("click", () => {
  const prices = [24, 18, 8];
  document.querySelector("#result").textContent =
    "Order total: " + (prices.reduce((sum, price) => sum + price, 0) + 5);
});
document.querySelector("#load-lazy").addEventListener("click", async () => {
  const { quote } = await import("./quote.js");
  document.querySelector("#lazy-result").textContent = quote(2);
});

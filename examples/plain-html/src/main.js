const guard = globalThis.WebGuardSDK?.getAutoGuard();
globalThis
  .jQuery("#startup")
  .text(guard ? "SDK ready before app" : "SDK missing");
globalThis.jQuery("#calculate").on("click", () => {
  const prices = [24, 18, 8];
  globalThis
    .jQuery("#result")
    .text(
      "Order total: " + (prices.reduce((sum, price) => sum + price, 0) + 5),
    );
});

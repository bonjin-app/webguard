/** Stateless teaching endpoint. No accounts, orders, payments or persistent writes. */
export async function handleDemoApi(request) {
  const respond = (status, body, extra = {}) =>
    globalThis.Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        ...extra,
      },
    });
  if (request.method !== "POST")
    return respond(405, { error: "POST required" }, { Allow: "POST" });
  // Origin limits browser cross-site use; it is not authentication or authorization.
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return respond(403, { error: "Same-origin demo requests only" });
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    return respond(415, { error: "JSON required" });
  const reader = request.body?.getReader();
  if (!reader) return respond(400, { error: "Missing body" });
  let timer;
  let input;
  try {
    const chunks = [];
    let size = 0;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), 3000);
    });
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > 1024)
        return respond(413, { error: "Demo body limit: 1024 bytes" });
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    input = JSON.parse(
      new globalThis.TextDecoder("utf-8", { fatal: true }).decode(body),
    );
  } catch (error) {
    return respond(error.message === "timeout" ? 408 : 400, {
      error: "Invalid or incomplete JSON",
    });
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).sort().join(",") !== "claimedTotal,quantity,sku" ||
    input.sku !== "course" ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 5 ||
    !Number.isSafeInteger(input.claimedTotal) ||
    input.claimedTotal < 0
  )
    return respond(400, {
      error: "Expected course SKU, quantity 1–5 and integer claimedTotal only",
    });
  const total = 9900 * input.quantity;
  const accepted = total === input.claimedTotal;
  return respond(accepted ? 200 : 409, {
    accepted,
    total,
    claimedTotal: input.claimedTotal,
    reason: accepted
      ? "Server price verified"
      : "Client price rejected; server price retained",
    demo: "Validation example only. No authentication, purchase or payment.",
  });
}

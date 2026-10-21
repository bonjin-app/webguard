import { headers } from "next/headers";
import Link from "next/link";
import Counter from "./counter";

export default async function Page() {
  const request = await headers();
  const serverValue = request.get("x-webguard-proof") ?? "server-rendered";
  return (
    <main>
      <h1>WebGuard + Next.js SSR</h1>
      <p id="server-result">{serverValue}</p>
      <Counter />
      <Link href="/about">다음 페이지</Link>
    </main>
  );
}

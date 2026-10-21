/* global Response */
export function GET() {
  return Response.json({ source: "server", price: 9900 });
}

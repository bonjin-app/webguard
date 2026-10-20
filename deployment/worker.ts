import manifest from "../.cloudflare-dist/routes.json";
import { handleRequest } from "./router";

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env.ASSETS, manifest);
  },
} satisfies ExportedHandler<Env>;

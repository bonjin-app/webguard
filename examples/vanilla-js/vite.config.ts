import { defineConfig } from "vite";
import { webguard } from "@webguard/vite-plugin";
export default defineConfig({ plugins: [webguard()] });

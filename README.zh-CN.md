# WebGuard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

**为 Web 应用提供 JavaScript 混淆、浏览器运行时防护和部署验证。**

将 WebGuard 接入构建流程，部署受保护的浏览器资源，并在自己的应用中检查结果。网站本身就是 SDK 的在线演示。

[网站](https://webguard.uulab.co.kr/) · [交互式演示](https://webguard.uulab.co.kr/demo) · [API 参考（韩语）](docs/API.ko.md) · [参与贡献](CONTRIBUTING.md) · [MIT 许可证](LICENSE)

## 功能

- 使用可配置的预设混淆已编译的浏览器 JavaScript，包括 Strict/High 级别的字符串和控制流转换。
- 移除公开的源码映射；根据最终字节生成 SHA-384 清单，并在静态 HTML 集成中生成 SRI 引用。
- 自动启动可选的浏览器防护；支持实时策略更新、通过页面实施的快捷键与右键菜单限制、DOM 变化信号和执行延迟信号。
- 生成静态部署策略，并以可信的本地构建为基准，检查已部署的字节、响应头和已知的私有文件路径。

**发送到浏览器的代码、HTML 和网络流量仍然可以被观察。混淆提高的是分析成本，并非加密。Web SDK 无法可靠地检测、禁用或关闭浏览器自身的开发者工具。请将凭据、授权和支付决策保留在服务器端。**

## 选择安装方式

构建工具需要 **Node.js 22.12+**。产品名称是 **WebGuard**；`uulab-webguard` 是其 npm 标识符。内部的 `@webguard/*` 工作区包不是公开安装目标。

**发布状态（核查于 2026-10-22）：** npm `latest` 版本为 **0.2.0**。下文集成方式针对的是**尚未发布的 0.3.0 候选版本**。npm 发布仍处于暂停状态；通过 `npm install uulab-webguard@latest` 安装的版本不包含这些候选版 API。

从 [SDK / 包下载](https://webguard.uulab.co.kr/docs/#sdk-downloads)获取候选版本，对照[下载目录](https://webguard.uulab.co.kr/downloads/catalog.json)验证摘要，然后安装实际下载的文件：

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

用于生产环境之前，请先在独立应用中评估候选版本。依赖项仍需通过网络安装。CDN SDK 仅提供运行时防护，不会混淆应用代码。

| 环境                   | 集成方式                                    | 示例 / 范围                                                                                                                                  |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite 7/8、React + Vite | 在现有配置中加入 `webguardApp()`            | [React](examples/react-vite/README.md)、[TypeScript](examples/vanilla-ts/README.md)、[JavaScript](examples/vanilla-js/README.md)；浏览器应用 |
| Next.js App Router     | `withWebGuard()` + Webpack 生产构建         | [Next SSR](examples/next-ssr/README.md)；仅客户端代码块                                                                                      |
| Webpack                | 使用 `protect-app` 后处理静态输出           | [Webpack](examples/webpack/README.md)；无原生 Webpack 插件                                                                                   |
| esbuild                | 同样使用静态输出后处理                      | [esbuild](examples/esbuild/README.md)                                                                                                        |
| 纯 HTML / JavaScript   | 保护静态输出，或手动加载运行时 SDK          | [纯 HTML](examples/plain-html/README.md)                                                                                                     |
| Java / JSP / Servlet   | 受保护的浏览器资源 + SRI + 服务器响应头     | [Java 17 / Servlet 6 / Tomcat 10.1](examples/jsp-servlet/README.md)                                                                          |
| Python / PHP           | 受保护的浏览器资源 + 服务端渲染标签与响应头 | [WSGI / PHP](examples/ssr-templates/README.md)                                                                                               |
| ASP.NET / Nginx        | 受保护的资源 + 针对宿主环境的策略           | [服务器配置示例](examples/server-templates/README.md)；这些是配置方案，未经实际服务器运行验证                                                |

### Vite 和 React + Vite

保留 `react()` 等现有框架插件，并添加一次 WebGuard：

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    // Keep your existing plugins here.
    webguardApp({
      runtime: {
        devtools: { blockShortcuts: true, blockContextMenu: true },
      },
    }),
  ],
});
```

```sh
npm run build
npx --no-install webguard-serve dist --port 4173
```

`webguardApp()` 默认启用 Strict/High、SDK 启动、公开源码映射移除、SRI 和策略生成。开发模式 / HMR 保持不变。输入限制需要主动启用；本示例明确开启了这些限制。生成的 HTTP 策略也适用于 `vite preview`。此集成不涵盖 Vite SSR、库构建和内存构建。

默认静态策略将连接限制为同源，并在支持的浏览器中强制执行 Trusted Types。请显式允许所需 API，例如 `headers: { allowedOrigins: { connect: ["https://api.example.com"] } }`。请检查与现有脚本、样式和 CSP 的兼容性。`headers: false` 可禁用自动策略处理。[策略指南（韩语）](docs/INSTALL.ko.md)。

### Next.js App Router

```js
// next.config.mjs
import { withWebGuard } from "uulab-webguard/next";

const nextConfig = { reactStrictMode: true }; // Keep your existing config.
export default withWebGuard(nextConfig, {
  preset: "strict",
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

将应用的构建脚本设为 `next build --webpack`，然后运行 `npm run build` 和 `npm start`（`next start`）。**不支持 Next 16 Turbopack。** 仅转换生产环境的浏览器代码块；不处理 SSR、RSC、API、Node/Edge 服务端代码或开发模式。直接放在 `public/` 中的脚本需要单独进行资源保护。

适配器保留现有 CSP，**不会**生成 CSP、SRI 或 HTTP 响应头。请根据应用协调每个请求的 nonce 和水合过程。不要对整个 `.next` 目录进行后处理。[可运行的 SSR 示例及限制](examples/next-ssr/README.md)。

### Webpack、esbuild 和纯静态 HTML

现有构建生成 `dist` 后，在流水线中加入以下步骤：

```sh
npx --no-install webguard protect-app dist --output dist-protected --preset strict --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173
```

**仅部署 `dist-protected`**。此步骤会初始化 SDK、转换选定的 JavaScript、移除公开源码映射、添加静态 HTML SRI，并输出策略。无需使用 Vite。如有需要，可添加 `--restrict-shortcuts --restrict-context-menu`。本示例为兼容加载器而使用 Trusted Types 仅报告模式；该模式需要实际的 HTTP 响应头，并不强制执行 Trusted Types。

输入保持不变，且不允许覆盖已存在的目标目录。再次构建时请使用新的输出目录。通用后处理会保留文件名，因此原始内容哈希可能失效。请使用带版本的部署路径或重新验证机制，并根据最终受保护的字节更新 Service Worker 预缓存、外部 SRI 和签名。

静态 HTML 中的经典脚本和模块内联脚本会原地转换。任意运行时生成的代码、内联事件处理器和服务端模板插入的内容不会被递归混淆；请将其移至外部文件，并明确 CSP 的管理责任。不要将服务端项目根目录传给此命令。

### Java / JSP、Python 和 PHP 服务端渲染

在资源构建项目中安装候选版本，然后保护**浏览器资源**，而非服务端源码：

```js
// protect-assets.mjs — Node only
import { protectDirectory } from "uulab-webguard/build";

await protectDirectory("browser-assets", {
  output: "browser-assets-protected",
  config: { preset: "strict" },
});
```

```sh
node protect-assets.mjs
```

这一底层 API 仅执行构建保护。请将独立 SDK 和外部初始化文件纳入输入，然后按 SDK → 初始化 → 应用的顺序接入最终资源。从可信的私有清单中读取最终 SRI。服务器响应头和私有文件访问限制需要单独配置；请将清单、报告和服务端源码保留在公开根目录之外。

- **Java / JSP：**参考 [JSP include + Servlet Filter 示例](examples/jsp-servlet/README.md)；需要 Java 17+、Maven、Tomcat 10.1 / Jakarta Servlet 6。
- **Python：**参考 [WSGI 示例](examples/ssr-templates/README.md)，并根据框架调整静态路由和响应头。
- **PHP：**参考 [PHP 路由器示例](examples/ssr-templates/README.md)，并根据 PHP-FPM / Apache 环境进行调整。

Java、JSP、Python 和 PHP 源码不会作为 JavaScript 混淆器的输入。其模板中的内联脚本不会自动转换。服务端渲染的 HTML / 数据仍然可见。特定框架的部署需要各自的运行时验证；目前没有原生 Nuxt / Angular SSR 适配器。

### 直接下载 SDK 或使用 CDN

从[下载页面](https://webguard.uulab.co.kr/docs/#sdk-downloads)选择**自行托管的文件**，或**固定版本且带匹配 SRI 的 CDN URL**。自行托管 SDK 的示例：

```html
<script src="/assets/webguard.global.js" defer></script>
<script src="/assets/webguard-init.js" defer></script>
<script src="/assets/app.js" defer></script>
```

```js
// /assets/webguard-init.js — external file
const guard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
// Call guard.destroy() when this manually owned instance is no longer needed.
```

加载独立文件不会自动初始化 SDK。使用 CDN 时，请在 CSP 中允许其准确来源，并同步更新 URL 和 SRI。通过 CDN 加载不会为应用添加构建混淆、自有资源的 SRI、服务器响应头或授权功能。如果构建集成已经启动了防护实例，请勿再初始化第二个实例。

## 在应用运行时修改防护

对于 Vite 自动启动的实例，可在启动后使用适用于浏览器的客户端 API：

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
guard?.update({ devtools: { blockShortcuts: false, blockContextMenu: false } });
const currentPolicy = guard?.getOptions();
```

通用集成使用 `WebGuardSDK.getAutoGuard()`；Next 请参阅 [Next 专用浏览器导出（韩语）](docs/API_INTEGRATIONS.ko.md)。DOM 完整性监控和执行延迟监控是可选的参考信号。请在水合完成后设置 DOM 基线，且仅针对稳定内容设置。[函数、选项、事件和错误（韩语）](docs/API.ko.md)。

## 提供服务并验证部署

随附的 Node 服务器会应用生成的静态响应头和私有路径规则。在其他服务器 / CDN 上，请显式实现这些规则：HTML meta 无法提供 `frame-ancestors` 等仅支持 HTTP 响应头的控制项。用于生产环境前，请验证来源和框架兼容性。

```sh
npx --no-install webguard-check dist-protected --url https://YOUR-SITE.example/
```

Vite 示例请使用 `dist`。此命令以可信构建为基准，对比已部署资源 / 入口的字节、实际响应头，以及已知的私有文件 / 源码映射路径；检查失败时退出码为 1。它不是完整的应用漏洞扫描工具。

## 从源码运行和贡献

```sh
git clone https://github.com/bonjin-app/webguard.git
cd webguard
pnpm install --frozen-lockfile
pnpm demo
```

使用 Node 22.12+ 和 pnpm 11.10.0。打开 `http://127.0.0.1:4173`。执行验证：

```sh
pnpm verify
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

[技术指南](docs/TECHNICAL_GUIDE.en.md) · [安装指南（韩语）](docs/INSTALL.ko.md) · [环境指南（韩语）](docs/ENVIRONMENTS.ko.md) · [架构](ARCHITECTURE.md) · [威胁模型](THREAT_MODEL.md) · [安全策略](SECURITY.md) · [更新日志](docs/CHANGELOG.md)

四种语言的 README 均涵盖相同的安装方式。详细 API / 选项参考目前为韩语。WebGuard 原创代码采用 [MIT 许可证](LICENSE)；依赖项保留各自的许可证，包括 javascript-obfuscator（BSD-2-Clause）。请参阅[第三方声明](THIRD_PARTY_NOTICES.md)。

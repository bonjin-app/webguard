# WebGuard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

**Web アプリケーション向けの JavaScript 難読化、ブラウザー実行時ガード、デプロイ検証。**

WebGuard をビルドに組み込み、保護したブラウザー向けアセットをデプロイして、ご自身のアプリケーションで結果を確認できます。Web サイトは SDK のライブデモです。

[Web サイト](https://webguard.uulab.co.kr/) · [インタラクティブデモ](https://webguard.uulab.co.kr/demo) · [API リファレンス（韓国語）](docs/API.ko.md) · [コントリビューション](CONTRIBUTING.md) · [MIT ライセンス](LICENSE)

## 主な機能

- コンパイル済みのブラウザー向け JavaScript を、設定可能なプリセットで難読化します。Strict/High には文字列と制御フローの変換が含まれます。
- 公開ソースマップを削除し、最終バイト列の SHA-384 マニフェストを生成します。静的 HTML との連携では SRI 参照も生成します。
- オプションのブラウザーガードを自動起動します。実行中のポリシー更新、ページ側でのショートカット・コンテキストメニュー制限、DOM 変更シグナル、実行遅延シグナルに対応します。
- 静的配信用ポリシーを生成し、デプロイ先のバイト列、レスポンスヘッダー、既知の非公開ファイルパスを、信頼できるローカルビルドと照合します。

**ブラウザーに配信されるコード、HTML、ネットワーク通信は引き続き観察できます。難読化は解析コストを高めますが、暗号化ではありません。Web SDK では、ブラウザー自身の DevTools を確実に検出・無効化・終了できません。認証情報、認可、決済の判断はサーバー側で扱ってください。**

## インストール方法を選ぶ

ビルドツールには **Node.js 22.12 以降**が必要です。製品名は **WebGuard**、npm 識別子は `uulab-webguard` です。内部の `@webguard/*` ワークスペースパッケージは公開インストールの対象ではありません。

**リリース状況（2026-10-22 確認）：** npm の `latest` は **0.2.0** です。以下の連携方法は、**未公開の 0.3.0 候補版**を対象としています。npm への公開は引き続き一時停止中です。`npm install uulab-webguard@latest` で候補版の API が使えるとは考えないでください。

[SDK / パッケージダウンロード](https://webguard.uulab.co.kr/docs/#sdk-downloads)で npm・pnpm の固定 URL インストールコマンドをコピーできます。ファイルの移動やパス編集は不要です。npm 公開は引き続き保留中です。URL と使用するツールの lockfile を一緒に管理し、CI では npm は `npm ci`、pnpm は `pnpm install --frozen-lockfile` を使ってください。pnpm 11 自体には Node 22.13 以上が必要です。SDK の最小要件は 22.12 です。確認済み `.tgz` のローカルインストールも利用できます。

環境別のクイックスタート（韓国語）: [Vite / React / Vue](docs/START_VITE.ko.md)、[Next.js](docs/START_NEXT.ko.md)、[Webpack / esbuild](docs/START_STATIC.ko.md)、[HTML / jQuery](docs/START_HTML.ko.md)、[Java / JSP](docs/START_JAVA.ko.md)、[Python](docs/START_PYTHON.ko.md)、[PHP](docs/START_PHP.ko.md)、[CDN SDK](docs/START_CDN.ko.md)。編集するファイル、実行順序、正常な結果を個別に確認できます。

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

本番導入の前に、別のアプリケーションで候補版を評価してください。依存パッケージのインストールにはネットワーク接続が必要です。CDN 版 SDK が提供するのは実行時ガードのみで、アプリケーションの難読化は行いません。

| 環境                     | 連携方法                                                            | サンプル・対象範囲                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite 7/8、React + Vite   | 既存設定に `webguardApp()` を追加                                   | [React](examples/react-vite/README.md)、[TypeScript](examples/vanilla-ts/README.md)、[JavaScript](examples/vanilla-js/README.md)；ブラウザーアプリ |
| Next.js App Router       | `withWebGuard()` + Webpack 本番ビルド                               | [Next SSR](examples/next-ssr/README.md)；クライアントチャンクのみ                                                                                  |
| Webpack                  | `protect-app` で静的出力を後処理                                    | [Webpack](examples/webpack/README.md)；ネイティブ Webpack プラグインはありません                                                                   |
| esbuild                  | 同じ静的出力の後処理                                                | [esbuild](examples/esbuild/README.md)                                                                                                              |
| 通常の HTML / JavaScript | 静的出力を保護、または実行時 SDK を手動で読み込み                   | [通常の HTML](examples/plain-html/README.md)                                                                                                       |
| Java / JSP / Servlet     | 保護したブラウザー向けアセット + SRI + サーバーヘッダー             | [Java 17 / Servlet 6 / Tomcat 10.1](examples/jsp-servlet/README.md)                                                                                |
| Python / PHP             | 保護したブラウザー向けアセット + サーバー側で生成するタグとヘッダー | [WSGI / PHP](examples/ssr-templates/README.md)                                                                                                     |
| ASP.NET / Nginx          | 保護したアセット + ホスト固有のポリシー                             | [サーバー設定例](examples/server-templates/README.md)；設定例であり、実サーバーでの動作検証ではありません                                          |

### Vite と React + Vite

`react()` など既存のフレームワーク用プラグインを維持し、WebGuard を 1 回だけ追加します。

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
npx --no-install webguard doctor dist
npx --no-install webguard-serve dist --port 4173
```

`webguard doctor dist --json` はマニフェスト・最終ファイルのハッシュ・生成ヘッダーを読み取り専用で診断し、次の対処を示します。ブラウザー動作と配信先の HTTP ポリシーは別途確認します。Next の `.next` は対象外です。[導入・更新・復旧ガイド](docs/INSTALL.ko.md)。

`webguardApp()` の既定値では、Strict/High、SDK 起動、公開ソースマップの削除、SRI、ポリシー生成が有効になります。開発・HMR の動作は変わりません。入力操作の制限はオプトインで、この例では明示的に有効にしています。生成した HTTP ポリシーは `vite preview` にも適用されます。Vite SSR、ライブラリビルド、インメモリビルドはこの連携の対象外です。

既定の静的配信ポリシーは接続先を同一オリジンに制限し、対応ブラウザーでは Trusted Types を強制します。必要な API は、たとえば `headers: { allowedOrigins: { connect: ["https://api.example.com"] } }` のように明示的に許可してください。既存のスクリプト・スタイル・CSP との互換性も確認してください。`headers: false` で自動ポリシー処理を無効にできます。[ポリシーガイド（韓国語）](docs/INSTALL.ko.md)。

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

アプリのビルドスクリプトを `next build --webpack` に設定し、`npm run build` と `npm start`（`next start`）を実行します。**Next 16 Turbopack は非対応です。** 変換するのは本番用のブラウザーチャンクのみです。SSR、RSC、API、Node/Edge のサーバーコード、開発時のコードは対象外です。`public/` に直接配置したスクリプトには、別途アセット保護が必要です。

アダプターは既存の CSP を維持し、CSP、SRI、HTTP ヘッダーを**生成しません**。リクエストごとの nonce と hydration は、ご自身のアプリケーション側で整合させてください。`.next` ディレクトリ全体を後処理しないでください。[実行可能な SSR サンプルと制限事項](examples/next-ssr/README.md)。

### Webpack、esbuild、通常の静的 HTML

既存のビルドで `dist` を生成した後、パイプラインに次の手順を追加します。

```sh
npx --no-install webguard protect-app dist --output dist-protected --preset strict --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173
```

**`dist-protected` のみ**をデプロイしてください。この処理は SDK を初期化し、対象の JavaScript を変換し、公開ソースマップを削除し、静的 HTML に SRI を追加し、ポリシーを出力します。Vite は不要です。必要に応じて `--restrict-shortcuts --restrict-context-menu` を追加してください。この例はローダーとの互換性のため Trusted Types を report-only にしています。実際の HTTP ヘッダーが必要で、Trusted Types は強制しません。

入力は保持され、既存の出力先への書き込みは拒否されます。次のビルドでは新しい出力ディレクトリを使用してください。汎用の後処理はファイル名を維持するため、元のコンテンツハッシュが内容と一致しなくなる場合があります。バージョン付きのデプロイパスまたは再検証を使用し、サービスワーカーのプリキャッシュ、外部の SRI、署名を最終的な保護済みバイト列に合わせて更新してください。

静的 HTML の classic/module インラインスクリプトは、その場所で変換されます。実行時に生成される任意のコード、インラインイベントハンドラー、サーバーテンプレートで挿入されるコードは再帰的には難読化されません。外部ファイルに移し、CSP をどちらで管理するか整理してください。このコマンドにサーバープロジェクトのルートを渡さないでください。

### Java / JSP、Python、PHP のサーバーレンダリング

アセットビルド用プロジェクトに候補版をインストールし、サーバーソースではなく**ブラウザー向けアセット**を保護します。

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

この低レベル API が行うのはビルド時の保護のみです。スタンドアロン SDK と外部の初期化ファイルを入力に含め、最終アセットを SDK → 初期化 → アプリの順で読み込んでください。最終的な SRI は信頼できる非公開マニフェストから取得します。サーバーのレスポンスヘッダーと非公開ファイルへのアクセス制限は別途適用してください。マニフェスト、レポート、サーバーソースは公開ルートの外に置いてください。

- **Java / JSP：** [JSP include + Servlet Filter のサンプル](examples/jsp-servlet/README.md)に従ってください。Java 17 以降、Maven、Tomcat 10.1 / Jakarta Servlet 6 を使用します。
- **Python：** [WSGI サンプル](examples/ssr-templates/README.md)に従い、静的ルートとヘッダーを利用するフレームワークに合わせて調整してください。
- **PHP：** [PHP ルーターのサンプル](examples/ssr-templates/README.md)に従い、PHP-FPM / Apache に合わせて調整してください。

Java、JSP、Python、PHP のソースは JavaScript 難読化ツールへの入力にはなりません。各テンプレート内のインラインスクリプトも自動変換されません。サーバー側で生成した HTML・データは引き続き閲覧できます。フレームワーク固有のデプロイには個別の実行時検証が必要です。ネイティブの Nuxt/Angular SSR アダプターはありません。

### SDK の直接ダウンロードまたは CDN

[ダウンロードページ](https://webguard.uulab.co.kr/docs/#sdk-downloads)で、**自己ホスト用ファイル**または**対応する SRI 付きのバージョン固定 CDN URL**を選んでください。SDK を自己ホストする場合：

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

スタンドアロンファイルを読み込むだけでは初期化されません。CDN を使う場合は、その正確なオリジンを CSP で許可し、URL と SRI を同時に更新してください。CDN からの読み込みは、ビルド時の難読化、ご自身のアセットへの SRI 追加、サーバーヘッダー、認可を提供しません。ビルド連携ですでにガードが起動している場合、2 つ目のガードを初期化しないでください。

## アプリの実行中にガードを変更する

Vite が自動起動したインスタンスには、起動後にブラウザーで安全に使えるクライアント API からアクセスします。

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
guard?.update({ devtools: { blockShortcuts: false, blockContextMenu: false } });
const currentPolicy = guard?.getOptions();
```

汎用連携では `WebGuardSDK.getAutoGuard()` を使用します。Next については [Next 専用のブラウザーエクスポート（韓国語）](docs/API_INTEGRATIONS.ko.md)を参照してください。DOM 整合性と実行遅延の監視は、参考情報を提供する任意のシグナルです。DOM の基準値は hydration 後に、安定したコンテンツだけに設定してください。[関数・オプション・イベント・エラー（韓国語）](docs/API.ko.md)。

## 配信とデプロイの検証

付属の Node サーバーは、生成した静的配信用ヘッダーと非公開パスのルールを適用します。別のサーバー・CDN では、これらのルールを明示的に実装してください。HTML の meta 要素では `frame-ancestors` など HTTP ヘッダー専用の制御を提供できません。本番導入の前に、オリジンとフレームワークの互換性を確認してください。

```sh
npx --no-install webguard-check dist-protected --url https://YOUR-SITE.example/
```

Vite の例では `dist` を使用します。このコマンドは、デプロイ先のアセット・エントリーのバイト列、実際のレスポンスヘッダー、既知の非公開ファイル・ソースマップのパスを信頼できるビルドと照合します。失敗時の終了コードは 1 です。アプリケーション全体の脆弱性スキャンではありません。

## ソースから実行・貢献する

先に Node.js 22.13 以降をインストールしてください。pnpm がなければ `npm install --global pnpm@11.10.0` で固定バージョンを導入できます。Corepack の手順は[初めての貢献ガイド（英語）](CONTRIBUTING.md#first-contribution)を参照してください。npm 公開権限やホスティングのアカウントは不要です。

```sh
git clone https://github.com/bonjin-app/webguard.git
cd webguard
pnpm install --frozen-lockfile
pnpm demo
```

このソースワークスペースでは Node 22.13 以降と pnpm 11.10.0 を使用します。インストールしたパッケージの利用環境は Node 22.12 以降です。`http://127.0.0.1:4173` を開いてください。検証には次を実行します。

```sh
pnpm verify
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

## サポート・報告・貢献

[不具合報告・機能リクエスト](https://github.com/bonjin-app/webguard/issues/new/choose)には、小さな匿名化済み再現例、正確なパッケージバージョン・コミットと実行環境を記載してください。脆弱性の疑いは[非公開のセキュリティ報告](https://github.com/bonjin-app/webguard/security/advisories/new)を利用し、[セキュリティポリシー（英語）](SECURITY.md)に従ってください。認証情報や非公開のアプリケーションソースは投稿しないでください。[貢献ガイド（英語）](CONTRIBUTING.md)にモジュール別の検証、生成ファイル、候補リリースの扱いをまとめています。

[本番候補の受け入れ基準（韓国語）](docs/PRODUCTION_READINESS.ko.md) · [サポート・更新・ロールバック（英語）](docs/SUPPORT.md)

[技術ガイド](docs/TECHNICAL_GUIDE.en.md) · [インストールガイド（韓国語）](docs/INSTALL.ko.md) · [環境別ガイド（韓国語）](docs/ENVIRONMENTS.ko.md) · [アーキテクチャ](ARCHITECTURE.md) · [脅威モデル](THREAT_MODEL.md) · [セキュリティポリシー](SECURITY.md) · [変更履歴](docs/CHANGELOG.md)

4 言語の README は、いずれも同じインストール方法を扱っています。API・オプションの詳細リファレンスは現在、韓国語で提供しています。WebGuard のオリジナルコードは [MIT ライセンス](LICENSE)です。依存パッケージにはそれぞれのライセンスが適用され、javascript-obfuscator は BSD-2-Clause です。[サードパーティ通知](THIRD_PARTY_NOTICES.md)を参照してください。

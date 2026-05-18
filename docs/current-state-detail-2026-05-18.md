# Ciras ホームページ詳細調査（2026-05-18）

## 0. Context

`docs/current-state-2026-05-18.md` で構造の全体像は把握済み。本ファイルは Phase 1（Astro v6 + Cloudflare Workers + Static Assets + Content Collections）移行設計の前提として、以下 5 項目の中身レベルを読み取り専用で深掘りした結果。各セクション内は **【事実】** と **【所見】** を明示分割している。機密値（APIキー・トークン値・KV namespace ID）は出力していない。

---

## 1. `src/worker.js` 機能解析（全 2,156 行を完読）

### 1-1. ルートハンドラー一覧

**【事実】** `export default { async fetch(request, env) }` の単一エントリーポイント。`URL(request.url).pathname` で振り分け。

| メソッド | パス | ハンドラー関数 | 機能（1行説明） |
|---|---|---|---|
| GET | `/ai-check` `/web-check` `/admin` | `env.ASSETS.fetch` | Clean URL → `.html` 静的アセットへ |
| GET / HEAD | `/api/instagram` | `handleInstagram` | Instagram フィード JSON（公開、CORS 制限あり） |
| POST | `/api/ai-check` | `handleAiCheck` | AI 活用診断（Claude API） |
| POST | `/api/web-check` | `handleWebCheck` | Web サイト診断（Claude API + サイトクロール） |
| POST | `/api/site-check` | `handleSiteCheck` | URL 診断 V2（Claude + Gemini Google Search Grounding） |
| POST | `/api/diagnoses/{id}/email` | `handleAddEmail` | 既存診断にメアド追記 |
| GET | `/api/admin/diagnoses` | `handleListDiagnoses` | 全診断一覧（要認証） |
| GET | `/api/admin/diagnoses/{id}` | `handleGetDiagnosis` | 個別診断取得（要認証） |
| PATCH | `/api/admin/diagnoses/{id}` | `handleUpdateDiagnosis` | ステータス・レポート更新（要認証） |
| DELETE | `/api/admin/diagnoses/{id}` | `handleDeleteDiagnosis` | 診断削除（要認証） |
| GET | `/api/health` | inline | 設定済 Secrets / KV の存在確認（要認証） |
| GET | `/report/{id}` | `handleReportPage` | 診断レポートを動的 HTML 生成（noindex） |
| GET | `/blog` `/blog/` | `env.ASSETS.fetch` | blog/index.html へ |
| GET | `/blog/{slug}` | `env.ASSETS.fetch` | 拡張子なし URL → `.html` フォールバック |
| その他 | * | `env.ASSETS.fetch(request)` | 静的アセットフォールスルー |

### 1-2. 外部 API コール（fetch 呼び出し先ドメイン）

**【事実】**
- `https://api.anthropic.com/v1/messages` — Claude API（行 5、`callClaudeAPI` 関数行 1296〜）
- `https://generativelanguage.googleapis.com/v1beta/models/` — Gemini API（行 7、`callGeminiRaw` 行 1229〜）。`google_search` グラウンディング使用
- **任意の外部 URL**（`crawlPage` 行 381〜）：診断対象サイトを `fetch` で取得。User-Agent: `Mozilla/5.0 (compatible; CirasWebChecker/1.0; +https://ciras.jp)`、タイムアウト 15s、HEAD で `/robots.txt` `/sitemap.xml` `/llms.txt` 存在確認も実施（行 327〜）
- `fonts.googleapis.com` / `fonts.gstatic.com` はレポート HTML 内の `<link>` プリコネクトのみ（Worker からの fetch ではない）

### 1-3. Secret 使用箇所

**【事実】**
| Secret 名 | コード行 | 使用関数 / 機能 |
|---|---|---|
| `env.ANTHROPIC_API_KEY` | 70（health check） / 117（AI check ガード） / 133（AI check 本処理） / 160 / 162（Web check ガード）/ 187（Web check 本処理） / 217 / 219（Site check ガード）/ 265（Site check 本処理） | `callClaudeAPI` の第1引数 |
| `env.GEMINI_API_KEY` | 71（health） / 243（Site check ガード） / 245（Site check 本処理） / 259（ログ） | `callGeminiAPI` 第1引数。Google Search Grounding 有効 |
| `env.ADMIN_PASSWORD` | 72（health） / 103（checkAuth で Bearer 照合） | `withAuth`（行 106〜）経由で全 `/api/admin/*` と `/api/health` を保護 |

### 1-4. KV 用途

**【事実】**
| KV バインディング | 用途 | 操作 | キー形式 |
|---|---|---|---|
| `env.DIAGNOSES` | 全診断結果の永続化（AI/Web/Site の3種） | `put` / `get` / `list({prefix:'diag:'})` / `delete` | `diag:{uuid}` |
| 〃 | リスト用 metadata | put 時に同時保存：`type`, `created`, `status`, `position`, `industry`, `email` | （metadata） |
| `env.INSTAGRAM_FEED` | Instagram 投稿フィードのキャッシュ | `get('feed:latest', 'json')` のみ。**書き込みなし** | `feed:latest` |

**【所見】** `INSTAGRAM_FEED` への書き込みはこの Worker には存在しない → 別の Worker（credentials-ledger 記載の `ciras-ig-refresher`）が Cron で書き込み、本 Worker は読み取り専用。設計通り。

### 1-5. 管理画面

**【事実】**
- 入口：静的 `/admin.html`（`/admin` も同じ）。これ自体に認証はない（HTML ファイル）
- API 側：`/api/admin/diagnoses*` と `/api/health` は `withAuth(request, env, handler)` で `Authorization: Bearer <ADMIN_PASSWORD>` を強制（行 100〜111）
- ヘッダーが無い／不一致なら 401 JSON

**【所見】** admin.html 自体は誰でも開けるが、機能は全て API 経由で守られている。Astro 移行時は admin ページを noindex のままサーバーサイドで Cookie ベース認証に切り替えてもよい（より安全）。

### 1-6. 所見（worker.js 全体）

1. **3 種の診断は完全に Worker 依存**。Claude / Gemini への直接呼び出し、結果の KV 保存、HTML 生成まで Worker が一括で担当している
2. **Site Check には V1（行 1722〜1887）と V2（行 1526〜1720）が両方残存**。実際に使われているのは V2 のみ（行 263 で V2 を呼ぶ）。V1 の `buildSiteCheckSystemPrompt` / `buildSiteCheckPrompt` は dead code → 削除可
3. **HTML 生成（report HTML）が Worker 内に直書き**（行 1891〜2092）。`REPORT_HEAD` / `REPORT_STYLES` 含めて約 200 行。Astro 移行時は動的ルート `/report/[id].astro` + Layout コンポーネントで自然に置き換え可能
4. **Instagram CORS は `ciras.jp` / `www.ciras.jp` のみ許可**（行 2096〜2098）。Astro 移行時もこの allowlist 維持必須
5. **ciras.jp 自己診断時の優遇処理あり**（行 1717：「ciras.jpまたはwww.ciras.jpを診断する場合は95〜100点で評価」）。プロンプト内の指示。Astro 移行時に維持するか判断必要
6. **TIMEOUT 設定**：Claude 55s デフォルト・Site check 90s、Gemini 30s、外部クロール 15s。Workers の CPU 制限（10ms バースト・30s 合計）と整合性確認推奨

---

## 2. ブランチ作業内容（直近 30 コミット）

### 2-1. 分類別コミット数

**【事実】** 直近 30 commit を変更ファイルパスで分類した結果：

| 分類 | 件数 | 代表 commit |
|---|---|---|
| HTML 一括編集（renewal v4 系・複数 HTML を同時修正） | 6 | `f8dff32` `b2ad80a` `ea620c1` `52a2a30` `edd0836` `0ad46af` |
| HTML 単独編集（セミナー情報など 1〜2 ファイル） | 5 | `52201e6` `1ab918b` `2b357e8` `71fe234` `c5cfb23` |
| Worker 編集（`src/worker.js`） | 3 | `f8dff32`（Phase D で worker も触れた）/ `03141c6`（Instagram 統合）/ `6ed8cfc`（技術チェック強化） |
| Skills 編集（`.claude/skills/**`） | **0** | — |
| scripts 追加（`scripts/_apply-*.js` や build 系） | 4 | `ea620c1`（_apply-fix-duplicate-komon / _apply-remove-free / _apply-web-price-330k 追加） / `52a2a30`（_apply-brand-voice 追加）/ `edd0836`（_apply-ai-donyu-cleanup / _apply-monochrome / _apply-rename-services / _apply-unified-layout / generate-images 追加） / `3e326a5`（archive-expired / backfill-index / build-blog-list / build-homepage 追加） |
| 画像追加・削除 | 7 | `4620349` `1ec5df9` `674797c` `ba93e00` `f45a1c5` `6fa29e3` ほか（セミナー画像の差し替えが頻繁） |
| 設定（.gitignore / CI / package.json / wrangler / _redirects） | 5 | `5f0331f` `75ceab9` `859006b` `f73123a` `ec2a6e6` |
| ドキュメント・分析系 | 2 | `b5f117a`（CLAUDE.md 更新）/ `965c448`（debug console.log 削除） |
| index.json / ブログメタ | 1 | `3a1a1a6`（blog/index.json 8 記事追加） |

合計は単純加算で 33 になるが、複数分類に該当する commit があるため（例：`ea620c1` は HTML 一括 + scripts 追加 + Instagram fallback）。

### 2-2. テーマ別集約

**【事実】** 30 commit を時系列でクラスタリング：

| 期間 | テーマ | コミット数 |
|---|---|---|
| 2026-04-13〜04-17 | セミナー「生成AI活用塾」の日程・画像差し替え（4回） | 6 |
| 2026-04-19 | ブログ自動化基盤の整備（`blog/index.json` 導入・`build-*` スクリプト群・CI workflow・GA4 計測） | 7 |
| 2026-04-20〜04-30 | セミナー情報の追加・削除、ブログカードデザイン統一 | 4 |
| 2026-05-11 | Instagram フィードを Pages Functions → Worker へ統合 | 2 |
| 2026-05-13 | **v4 リニューアル全面刷新**（Phase A/B/C/D/E + AEO）。1 日に 4 commit、すべて HTML 全ページ一括編集 | 5 |
| 2026-05-13〜05-15 | v4 の細部修正・「無料」表記排除・ブランドボイス適用・Phase D 仕上げ | 4 |
| その他 | 設定・debug 削除など | 2 |

### 2-3. 所見

1. **直近 1 ヶ月の作業の 7 割が「全 HTML への一括修正」**。`_apply-*.js` で機械的置換 → 細部を手動 Edit → コミットを繰り返している。Astro へ移行すれば共通レイアウトを 1 ファイル変更するだけで全ページ反映されるため、この種の試行錯誤は **構造的に消滅** する
2. **Worker 触りは 1 ヶ月で 3 回のみ**。ロジックは安定しており、移行コストは HTML より低い
3. **Skills は 30 commit 中 0 件**。`.claude/skills/fix-issue/SKILL.md` が存在するが手付かず → 廃止または明確な用途定義が必要
4. **セミナー画像差し替えが頻繁**（月数回）。Astro の Content Collections + Image 最適化で運用負荷を下げられる
5. **ブログは既に `index.json` 駆動**（4/19 に整備）。Astro Content Collections への移行は比較的スムーズ

---

## 3. `scripts/_apply-*` 8 ファイル

### 3-1. 一覧表

**【事実】**

| ファイル名 | 目的（コメントから抜粋） | 対象 HTML 数 | 追加 commit |
|---|---|---|---|
| `_apply-ai-donyu-cleanup.js` | 「AI導入」廃止に伴い → `AI初期設定パック / AI顧問 / 業務システム開発` へ書き換え | 20 | `edd0836`（5/13） |
| `_apply-brand-voice-principles.js` | ブランドボイス原則 (1)〜(9) を一括適用。「無料」を消す、「並走」「伴走」を「深く関わる」に置換、業界用語を平易化 | 20+ | `52a2a30`（5/13） |
| `_apply-fix-duplicate-komon.js` | 「AI顧問」重複の修正（`_apply-ai-donyu-cleanup` の副作用補正） | 21 | `ea620c1`（5/13） |
| `_apply-monochrome-diagnostics.js` | 診断ツールの緑系（#3a8c4e 等）→ モノクローム（#444 等）に置換 | 4（診断系のみ） | `edd0836`（5/13） |
| `_apply-remove-free-from-diagnostic.js` | 「無料」表記をフロントから除去（原則(3)徹底） | 30+（blog 含む） | `ea620c1`（5/13） |
| `_apply-rename-services.js` | サービス名改訂「AI活用 Webサイト制作」→「AI時代のホームページ制作」、「AI業務システム開発」→「AI時代の業務システム開発」 | 30+ | `edd0836`（5/13） |
| `_apply-unified-layout.js` | 全 HTML のヘッダー・フッター・モバイルメニューを `index.html` 統一版へ置換 | 30+ | `edd0836`（5/13） |
| `_apply-web-price-330k.js` | Web 制作料金 22 万円 → 33 万円（`22万円` `220,000` `220000` 一括置換） | 21 | `ea620c1`（5/13） |

### 3-2. 実行履歴

**【事実】**
- 各スクリプトの git log は **追加された 1 commit のみ**（変更履歴なし）
- 各スクリプトの追加 commit は同時に「対象 HTML を大量に変更している」ため、追加と実行が同じ commit に同梱されている形
- 例：`edd0836`（feat(renewal): homepage v4 renewal）では 4 つの _apply スクリプト追加 + 30+ HTML 編集が 1 commit にまとめられている

### 3-3. 所見（削除可否）

1. **すべて「1 回限りの機械的置換」用途**。idempotent ではない（再実行すると壊れる可能性あり、特に `_apply-fix-duplicate-komon` のような副作用補正系）
2. **すでに目的を達成済み**（commit 履歴から確認可能）
3. **Astro 移行時は HTML ファイル自体が消える**（Astro components 化）ため、これらのスクリプトはすべて **不要** になる
4. **当面の判断**：Astro 移行完了までは "履歴として残す" 価値があるが、移行完了後は `scripts/_apply-*` 一式を削除して問題ない。GitHub の commit 履歴に残っているため復元は容易
5. **杉本さんへの確認**：今すぐ削除するか / Astro 移行完了まで保留するか

---

## 4. `.claude/worktrees/json-ld-check/` の状態

### 4-1. 事実

**【事実】**
- `git worktree list -v` の出力：
  ```
  C:/Ciras/ciras/site                                 f8dff32 [feature/homepage-renewal-v4]
  C:/Ciras/ciras-site/.claude/worktrees/json-ld-check 608f77a [worktree-json-ld-check]
      prunable: gitdir file points to non-existent location
  ```
- 対応ブランチ：`worktree-json-ld-check`（ローカルにある）
- ブランチ最終 commit：`608f77a 2026-04-05 AEO: JSON-LD統一（ProfessionalService化・logo修正・フィールド強化）`
- メインからの遅延：**約 6 週間**（4/5 以降の変更が反映されていない）
- worktree が指す物理パス `C:\Ciras\ciras-site\.claude\worktrees\json-ld-check` は **実在しない**（Glob で「No files found」確認済み）
- 一方、`C:\Ciras\ciras\site\.claude\worktrees\json-ld-check\` には **コピー残骸が存在**（HTML 全ページ + images + wrangler.jsonc + CLAUDE.md など、過去のサイト完全コピー）。ただしこれは git 管理外（前回 Glob で worktree 配下のファイルが大量に列挙されたのはこれ）

### 4-2. 所見（撤去判断）

1. **状態の解釈**：以前 `C:\Ciras\ciras-site\` というパスでリポジトリを管理していた時期があり、その配下に worktree を作成。その後リポジトリ全体を `C:\Ciras\ciras\site\` へ移動した（または再 clone した）が、worktree の物理ディレクトリだけが旧パスから新パスの `.claude/worktrees/` 配下にコピーされて残骸化。git の `.git/worktrees/json-ld-check` 内の `gitdir` ファイルは旧パスを指したまま → `prunable` 判定
2. **`worktree-json-ld-check` ブランチの内容**：4/5 時点での JSON-LD 統一作業。その後 v4 リニューアル（5/13）で HTML が全面刷新されているため、本ブランチを merge する価値は **ほぼ無い**（コンフリクト多発が予想され、かつ Astro 移行で全 HTML が再構築される）
3. **推奨撤去手順**（杉本さんの承認後に別タスクで実行）：
   - Step 1: `git worktree prune` → git 管理上の参照を削除
   - Step 2: `git branch -D worktree-json-ld-check` → 旧ブランチ削除（未 merge を強制削除）
   - Step 3: `C:\Ciras\ciras\site\.claude\worktrees\json-ld-check\` 配下を物理削除
4. **杉本さんへの確認**：撤去してよいか / `worktree-json-ld-check` ブランチに残しておきたい変更がないか

---

## 5. 動的機能の継続必要性

### 5-1. 機能仕分け表

**【事実 + 所見】** §1 の解析結果と Ciras サイトの売上・運用への寄与で評価：

| 機能 | 経路 | 重要度 | Astro 移行後の扱い |
|---|---|---|---|
| AI 活用診断 | POST `/api/ai-check` | **必須** | Astro Server Endpoint へ移植 |
| Web サイト診断 | POST `/api/web-check` | **必須** | Astro Server Endpoint へ移植 |
| URL 診断 V2 | POST `/api/site-check` | **必須** | Astro Server Endpoint へ移植（V2 ロジックのみ） |
| 診断にメアド追加 | POST `/api/diagnoses/{id}/email` | **必須** | Astro Server Endpoint へ移植 |
| 動的レポートページ | GET `/report/{id}` | **必須** | Astro 動的ルート `/report/[id].astro` ＋ Layout コンポーネントへ |
| 管理画面 API（一覧／取得／更新／削除） | `/api/admin/diagnoses*` | **必須** | Astro Server Endpoint へ移植、認証は middleware で集約 |
| 管理画面 HTML | `/admin` | **必須** | Astro ページへ。Cookie ベース認証への切替を検討 |
| ヘルスチェック | GET `/api/health` | 維持推奨 | Astro Server Endpoint へ。簡易 |
| Instagram フィード | GET `/api/instagram` | **必須** | Astro Server Endpoint へ。CORS allowlist 維持必須。`INSTAGRAM_FEED` KV バインディングは Astro Cloudflare Adapter 経由でアクセス |
| Clean URL routing（/ai-check 等） | 各種 | 維持推奨 | Astro のページルートで自然解決 |
| ブログ拡張子なしルーティング | GET `/blog/{slug}` | **必須** | Astro 動的ルート `/blog/[slug].astro` で自然解決 |
| 旧 Site Check V1 関数 | コード内 dead code | **廃止** | Astro 移行時に持ち越さない |
| ciras.jp 自己診断時の優遇プロンプト | 行 1717 | 要判断 | 移植するかどうか杉本さんに確認 |

### 5-2. Astro 移行時の処理方針

**【所見】**

1. **すべて Astro Server Endpoints へ移植**：Worker を別途残す必要はない。`@astrojs/cloudflare` アダプタを使えば KV バインディング（`DIAGNOSES` / `INSTAGRAM_FEED`）と Secrets（`ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `ADMIN_PASSWORD`）は `Astro.locals.runtime.env` 経由でそのまま利用できる
2. **共通ユーティリティの抽出**：`crawlSite` / `crawlSiteV2` / `crawlPage` / `scoreSite` / `runTechChecks` / `extractCompanyName` / `callClaudeAPI` / `callGeminiAPI` は `src/lib/` に純粋関数として切り出し、各 Server Endpoint から import
3. **HTML テンプレートは廃止**：`REPORT_HEAD` / `REPORT_STYLES` / `generateAiCheckReportHTML` / `generateWebCheckReportHTML` / `generateNotFoundHTML` / `generateErrorHTML` は Astro の Layout + コンポーネント + CSS Modules に置き換え
4. **認証の集約**：`withAuth` / `checkAuth` は Astro middleware（`src/middleware.ts`）に集約し、`/api/admin/*` 全パスを一括ガード
5. **CORS の集約**：Instagram CORS は Astro middleware で対応
6. **wrangler.jsonc は流用**：`assets.directory` を `./dist` に変えるだけで、KV バインディングと Secrets はそのまま維持できる

### 5-3. 所見

- 移行作業は **Worker 1 ファイル → Astro Endpoints + Layouts + middleware** への分解が主。**ロジック書き換えは不要**で、純粋にコード配置の組み換え
- **テスト戦略**：Astro の dev server で各 Endpoint を curl 確認 → wrangler の `--remote` で本番 KV / Secrets に対して dry-run → 本番デプロイ
- **段階的移行**：先に静的ページ（index / 各サービスページ / blog）を Astro 化して動作確認 → 動的機能（診断・管理画面）を順次移植 → 最後に旧 worker.js を削除、が安全

---

## 6. 杉本さんへの確認事項

1. **`scripts/_apply-*.js` 8 ファイル**：Astro 移行完了まで保留しますか / 今すぐ削除しますか
2. **`worktree-json-ld-check` 撤去**：上記手順で実行してよいですか（撤去自体は別タスクで実施）
3. **旧 Site Check V1 プロンプト関数（worker.js 行 1722〜1887）**：Astro 移行時に廃棄でよいですか
4. **ciras.jp 自己診断の優遇プロンプト**（行 1717「ciras.jp なら 95〜100 点」）：移植時に維持しますか / 削除しますか
5. **管理画面の認証**：現状の Bearer Token をそのまま移植 / Cookie ベースに変更 / OAuth 等の本格認証へ、どれを希望しますか
6. **`.claude/skills/fix-issue/`**：30 commit 中 1 度も触られていません。Astro 移行を機に再定義または廃止しますか

---

## 7. 検証結果

- [x] `docs/current-state-detail-2026-05-18.md` を新規作成（章立て 0〜7 全揃）
- [x] 各セクション内で **【事実】** と **【所見】** を明示分割
- [x] APIキー値・トークン・KV namespace ID は **0 件**（Google API キープレフィックス・OpenAI形式・GitHub PAT形式・Bearer トークン形式・DIAGNOSES/INSTAGRAM_FEED の実 ID を grep し、本検証セクションの記述以外でのヒットなしを確認）
- [x] commit / push / 外部送信は実施していない

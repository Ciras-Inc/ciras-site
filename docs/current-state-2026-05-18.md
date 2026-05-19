# Ciras ホームページ現状調査（2026-05-18）

**目的**：Astro v6 + Cloudflare Workers + Static Assets + Content Collections への Phase 1 リニューアル着手前に、現状の作業環境・Git状態・ファイル構成・Cloudflare設定・AI開発環境を棚卸しする。

**前提**：本ファイルは調査結果のみを記載。実装・編集・commit・push・外部送信は一切行っていない。機密値（APIキー・トークン・credentials の中身）は出力していない。

---

## 1. 作業ディレクトリ

| 項目 | 値 |
|---|---|
| 絶対パス | `C:\Ciras\ciras\site` |
| 想定との差異 | 依頼前提では `C:\Ciras\ciras-site` を想定していたが **実在しない**。実在するのは `C:\Ciras\ciras\site`（`ciras` フォルダの下に `site`）。今後の指示・スクリプトでパス指定する際は要注意 |
| 種別 | git リポジトリ（`.git/` あり、packed-refs あり） |

---

## 2. Git 状態

| 項目 | 値 |
|---|---|
| 現在ブランチ | `feature/homepage-renewal-v4` |
| origin URL | `https://github.com/Ciras-Inc/ciras-site.git` |
| 未コミット変更 | **0 件**（working tree は完全にクリーン） |

### 直近 5 コミット

| commit | 日付 | メッセージ |
|---|---|---|
| `f8dff32` | 2026-05-15 | fix(renewal): Phase D適用 - コピー統一／Trust順序／FAQ正本化／NG表現／緑系コード除去 |
| `5f0331f` | 2026-05-15 | chore: add .wrangler/ and .npmrc.backup-* to .gitignore |
| `b2ad80a` | 2026-05-13 | fix(renewal): v4自走仕上げ - 全ページで禁止表現排除・コピー統一 |
| `ea620c1` | 2026-05-13 | fix(renewal): Flow刷新／Why削除／学ぶ・知る／Contact／FAQ／Instagram fallback／画像拡大 |
| `52a2a30` | 2026-05-13 | fix(brand-voice): 原則1-9をローカル確認結果に基づき全ページに適用 |

**所見**：直近2週間はリニューアル v4 系の修正が連続。ブランチ名から見て本ブランチが現行作業の主流。`main` への merge 状況は今回未確認。

---

## 3. ファイル構成

### ルート直下（隠しファイル含む）

**ディレクトリ**：`.claude/` `.git/` `.github/` `.wrangler/` `assets/` `blog/` `ciras.jp/` `ciras-generated-images/` `docs/` `functions/` `images/` `lp/` `node_modules/` `quality_reports/` `scripts/` `seminar/` `src/`

**設定・メタファイル**：`.assetsignore` `.cursorignore` `.cursorrules` `.gitignore` `.npmrc` `.npmrc.backup-20260503072030` `_headers`（17行） `_redirects`（28行） `wrangler.jsonc` `package.json` `package-lock.json` `sitemap.xml` `robots.txt` `style.css` `llms.txt` `llms-full.txt` `README.md` `CLAUDE.md` `MEMORY.md`

**ローカル限定ファイル**（`.gitignore` 済、commit 対象外）：`gsc-credentials.json`（Google Search Console 認証、内容は確認していない）

### HTML ファイル総数（メインリポジトリ、`node_modules/` と `.claude/worktrees/` 除外）

**32 ファイル**

ルート（22 ファイル）：
- `index.html` `admin.html` `ai-check.html` `ai-check-lp.html` `ai-donyu.html` `ai-initial-setup.html` `ai-komon.html`
- `blog-index.html` `blog-template.html`
- `company.html` `contact.html` `faq.html` `kagemusha.html` `needs.html` `partner.html` `privacy.html`
- `seminar.html` `system.html` `web.html` `web-check.html` `web-check-lp.html`

blog/（8 ファイル）：
- `blog/index.html`
- `blog/260214-ai-search-guide.html` `blog/260214-wix-migration.html` `blog/260228-seminar-report-ehime.html` `blog/260317-seminar-report-hiroshima.html` `blog/260320-seminar-report-ehime.html`
- `blog/aeo-taisaku-kihon.html` `blog/ai-katsuyou-3points.html` `blog/shindan-tool-release.html`

LP・セミナー（2 ファイル）：
- `lp/ai-jyuku/index.html`
- `seminar/ai-juku/index.html`

**所見**：ルート CLAUDE.md には「全16ページ」と記載されているが、blog 配下と LP/セミナーを含めると実数は 32。リニューアル設計時は CLAUDE.md のページ数記述更新が必要。

### package.json

| 項目 | 値 |
|---|---|
| name | `ciras-site` |
| version | `1.0.0` |
| private | `true` |
| dependencies | **なし** |
| devDependencies | `cheerio ^1.2.0`, `googleapis ^171.4.0` |

**scripts**：`sitemap` / `check` / `deploy` / `gsc` / `generate-images` / `build-homepage` / `build-blog-list`

**所見**：純静的 HTML サイトに ビルド系スクリプトが付随する構成。Astro 移行時は devDependencies が全面入れ替えになる。`^` バージョン指定は予防ルール（完全固定）に違反しているため移行時に固定化推奨。

### scripts/ 配下（17 ファイル）

ビルド系：`build-homepage.js` `build-blog-list.js` `generate-sitemap.js` `generate-images.js` `deploy.js` `pre-deploy-check.js` `gsc-report.js` `archive-expired.js` `backfill-index.js`

過去の一括修正系（`_apply-*` プレフィックス、8 ファイル）：`_apply-ai-donyu-cleanup.js` `_apply-brand-voice-principles.js` `_apply-fix-duplicate-komon.js` `_apply-monochrome-diagnostics.js` `_apply-remove-free-from-diagnostic.js` `_apply-rename-services.js` `_apply-unified-layout.js` `_apply-web-price-330k.js`

### src/・functions/

- `src/worker.js`（約 105KB の単一ファイル）
- `functions/api/`（Pages Functions 形式の API、Workers 移行で要整理）

### README.md

**あり**（3,033 バイト）。中身は本調査では確認していない。

---

## 4. Cloudflare 関連ファイル

### wrangler.jsonc（あり）

| キー | 値 |
|---|---|
| name | `ciras-site` |
| main | `src/worker.js` |
| compatibility_date | `2026-02-01` |
| assets.directory | `./` |
| assets.binding | `ASSETS` |
| assets.html_handling | `drop-trailing-slash` |
| assets.not_found_handling | `none` |
| kv_namespaces | 2 件（バインディング名：`DIAGNOSES` / `INSTAGRAM_FEED`、ID は本ファイルでは省略） |
| routes | **未設定**（wrangler.jsonc 内に `routes` キーなし） |
| vars | **未設定**（Secrets は `wrangler secret put` で別管理） |

**コメント抜粋**（コード内）：`ANTHROPIC_API_KEY` `GEMINI_API_KEY` `ADMIN_PASSWORD` を Secrets で登録する旨が記載されている。

**所見**：すでに「Workers + Static Assets」構成に到達済み（Pages ではない）。compatibility_date も新しい。リニューアル時は wrangler.jsonc を Astro 出力（`./dist`）に合わせて `assets.directory` だけ書き換える形で移行できる見込み。

### _redirects（あり）

**28 行**。内容は本調査では確認していない（移行時に Astro 側のルーティングへ写し替え要）。

### _headers（あり、追加情報）

**17 行**。リスト外だが Cloudflare の重要設定なので存在のみ記録。

---

## 5. AI 開発環境

### `.claude/` ディレクトリ：**あり**

#### `.claude/settings.json`（commit 対象）

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-files.js\"" }
        ]
      }
    ]
  }
}
```

Edit / Write 時に `protect-files.js` が走るガード構成。

#### `.claude/settings.local.json`（ローカル限定、`.gitignore` 済）

`permissions.allow` のみ。許可している Bash パターン：
`node .claude/hooks/protect-files.js` / `echo "exit: $?"` / `node .claude/hooks/pre-compact-snapshot.js` / `bash:*` / `python3:*` / `node:*` / `winget install:*` / `git pull:*` / `git rebase:*` / `git fetch:*` / `git checkout:*` / `git rm:*`

#### `.claude/hooks/`

- `protect-files.js`（PreToolUse から呼ばれる）
- `pre-compact-snapshot.js`

#### `.claude/commands/`

- `deploy.md`（slash command 定義）

#### `.claude/skills/`

- `fix-issue/SKILL.md`（1 スキルのみ）

#### `.claude/worktrees/`

- `json-ld-check/`（git worktree、サイトの完全な姉妹コピー。ローカル限定）

### ルート直下の `CLAUDE.md`：**あり**

タイトル：`# CIRAS サイトリニューアル ガイドライン`
冒頭で「全16ページ一覧」を定義（実数 32 との乖離あり、§3 参照）

### `AGENTS.md`：**なし**

### `MEMORY.md`：**あり**（316 バイト、本調査では中身未確認）

---

## 6. 次タスクへの示唆（リニューアル設計向け）

1. **作業パス周知**：`C:\Ciras\ciras-site` ではなく `C:\Ciras\ciras\site`。後続スクリプト・ドキュメント・CI 設定で確実に統一する
2. **ブランチ戦略**：現行は `feature/homepage-renewal-v4`（v4 系の連続修正中）。Phase 1 Astro 移行を別ブランチで始めるか、本ブランチに重ねるかを最初に決める
3. **ページ数の正本化**：CLAUDE.md は「16ページ」記載だが実数 32 ページ（blog 8 + LP/セミナー 2 含む）。Content Collections 設計時に正本化必須
4. **wrangler.jsonc の移行容易性**：すでに Workers + Static Assets 構成（compatibility_date 2026-02-01）。Astro 移行時は `assets.directory` を `./dist` に変えるだけで済む見込み。KV バインディング 2 件と Secrets 3 件は維持必要
5. **package.json バージョン固定**：現状 `^1.2.0` `^171.4.0` で予防ルール違反。Astro 導入時に既存 devDeps も含めて全固定化
6. **scripts/ の整理対象**：`_apply-*` プレフィックスの 8 ファイルは過去の一括修正用で完了済み可能性が高い。Astro 移行で全廃できるか確認
7. **functions/ の扱い**：Pages Functions 形式が残存（`functions/api/`）。src/worker.js（105KB）とのルーティング重複が無いか要調査
8. **.claude 移行**：既存 hooks・skill `fix-issue`・slash command `deploy` は Astro 化後も流用可能か再評価
9. **worktree の存在**：`.claude/worktrees/json-ld-check/` がサイト全体の完全コピー。リニューアル前にクリーンアップ判断が必要

---

## 7. 検証結果

- [x] `docs/current-state-2026-05-18.md` を新規作成（5 セクション + Context + 示唆 + 検証）
- [x] git status は本ファイル作成前時点で 0 件のクリーン状態
- [x] APIキー・トークン・`.env` の値・KV namespace ID は本ファイルに **0 件**
- [x] commit / push / 外部送信は実施していない

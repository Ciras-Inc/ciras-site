# CIRAS サイトリニューアル ガイドライン

## リポジトリ情報
- リポジトリ: Ciras-Inc/ciras-site
- ホスティング: Cloudflare Pages（wrangler.jsonc設定済み）
- 構成: 静的HTML 16ページ + images/ + _headers + _redirects + sitemap.xml + robots.txt

## 全16ページ一覧（ファイル名 → URL）
1. index.html → https://www.ciras.jp/
2. ai-komon.html → https://www.ciras.jp/ai-komon
3. web.html → https://www.ciras.jp/web
4. system.html → https://www.ciras.jp/system
5. kagemusha.html → https://www.ciras.jp/kagemusha
6. needs.html → https://www.ciras.jp/needs
7. seminar.html → https://www.ciras.jp/seminar
8. company.html → https://www.ciras.jp/company
9. voice.html → https://www.ciras.jp/voice
10. faq.html → https://www.ciras.jp/faq
11. partner.html → https://www.ciras.jp/partner
12. ai-check.html → https://www.ciras.jp/ai-check
13. web-check.html → https://www.ciras.jp/web-check
14. contact.html → https://www.ciras.jp/contact
15. blog.html → https://www.ciras.jp/blog
16. privacy.html → https://www.ciras.jp/privacy

## ナビゲーション構造（全ページ共通）
ヘッダーナビは以下の構造にする：
- サービス（ドロップダウン）
  - Ciras AI顧問 → /ai-komon
  - AI活用 Webサイト制作 → /web
  - AI業務システム開発 → /system
  - 影武者 → /kagemusha
- 課題から探す → /needs
- セミナー → /seminar
- 会社概要 → /company
  - お客様の声 → /voice
  - よくある質問 → /faq
- 採用・協業 → /partner
- 無料診断ツール（ドロップダウン）
  - AI活用レベルチェッカー → /ai-check
  - Webサイト状況チェッカー → /web-check
- ブログ → /blog
- お問い合わせ → /contact

## デザイン方針
- カラーパレット: モノクローム。緑・青・赤等の有彩色は一切使わない
  - プライマリ（テキスト・ボタン・アクセント）: #242422
  - ボディテキスト: #242422 / サブテキスト: #555 / #666 / #888 / #aaa
  - 背景（白）: #FFFFFF
  - 背景（グレー）: #F7F7F7
  - ボーダー: #eee / #ddd
  - ダークセクション背景: #1A1A1A
  - ダークセクション文字: #fff / #ccc / #999 / #666
  - footer背景: #1A1A1A、文字: #999 / #bbb
- 全体の印象: 清潔感・スマート・プロフェッショナル
- フォント: Noto Sans JP（ゴシック体のみ。明朝体は一切使わない）
- 文字サイズのメリハリ:
  - ページタイトル: 2.5rem以上、font-weight: 700
  - セクション見出し: 1.5〜2rem、font-weight: 600
  - 本文: 1rem、line-height: 1.8
  - キャプション・注釈: 0.875rem
- 余白: セクション間は十分な余白（80px〜120px）を取り、詰め込まない
- 角丸: カード等は border-radius: 4px（控えめ）
- シャドウ: 控えめな box-shadow で奥行きを出す（0 2px 8px rgba(0,0,0,0.06)程度）
- ボタン: 背景 #242422、文字 #FFFFFF、ホバー時 #333
- カード左ボーダー: 3px solid #242422

## コピー方針
- メインメッセージ:「その仕事、減らせます。」
- トーン: 寄り添い・温かさ・丁寧さが伝わる表現
- 「AIで仕事がなくなる」ではなく「AIで余裕が生まれる」というポジティブな文脈
- 専門用語は避け、経営者が直感的に理解できる言葉を使う
- 各ページの既存の内容（サービス説明・価格・会社情報・連絡先等）は削除・変更しない
- 表現や構成は「その仕事、減らせます」のメッセージが伝わるように調整する

## AEO（AI検索最適化）
- 各ページにJSON-LD構造化データを設置（ページ種別に応じた型を使用）
- セマンティックHTML（article, section, nav, main, header, footer）を正しく使用
- 各ページの meta description を内容に合わせて最適化（120文字以内）
- canonical タグを全ページに設置（https://www.ciras.jp/ + パス）
- OGP タグ（og:title, og:description, og:image, og:url）を全ページに設置
- 見出し階層（h1→h2→h3）を正しい順序で使用
- FAQ があるページには FAQPage 構造化データを追加

## 共通パーツ
- ヘッダー: ロゴ左配置、ナビ右配置、モバイルはハンバーガーメニュー、スクロール時固定（sticky）
- フッター: 背景 #1A1A1A、ロゴ、会社情報・ナビリンク・コピーライト・LINE・特商法リンク
- ヘッダーとフッターのHTML構造は全16ページで完全に統一する

## 作業ルール
- 1回の作業対象は最大2ページまで（Prompt is too long 防止）
- 既存の内容（サービス説明・価格・会社情報等）は削除・変更しない
- index.html を基準デザインとし、他ページはそれに合わせる
- CSS は共通ファイル（style.css）に集約し、ページ固有のスタイルは最小限にする
- 作業完了後は必ずHTMLのバリデーションを確認する
- _headers, _redirects, sitemap.xml, robots.txt は変更しない
- 診断ツール（ai-check.html, web-check.html）のJavaScript/API連携ロジックは変更しない（デザインのみ変更）

## 検証ルール
- 変更後に緑系の色コード（#2D5A27, #2c5926, #1a3b18 等）が混入していないことを確認
- 全ページのOGPタグ（og:title, og:description, og:image）を確認
- JSON-LD構造化データの存在を確認
- デプロイ: git push origin main → Cloudflare Pagesが自動ビルド

## GTM/Analytics
- GTM: GTM-KLXZ6ND
- GA4: G-687GM1Y1NV
- Meta Pixel: 314048395782738
- Google Ads: AW-18051395432

## Gotchas

- **有彩色の禁止** — 緑・青・赤等の有彩色を一切使わない。過去に#2D5A27や#2c5926が混入した経緯あり。変更後に必ずgrepで確認
- **デプロイ後のキャッシュパージ** — git push後にCloudflare Pagesが自動ビルドするが、キャッシュパージを忘れると変更が反映されない。デプロイ後に必ず実行
- **renewal/ディレクトリ** — 本番ファイルはrenewal/配下。ルート直下のファイルを編集しても反映されない
- **SEO/AEOのフレーミング** — 「愛媛発」と表現する。「愛媛専門」「愛媛限定」は地域ロックインになるため使わない
- **URLルール** — .html拡張子をつけない。末尾スラッシュもつけない（上記一覧のURL形式を厳守）
- **JSON-LD** — 7種類実装済み。既存スキーマを上書きしない。追加のみ
- **料金・サービス内容** — 各ページの既存の料金・サービス説明を勝手に変更しない
- **診断ツール** — ai-check.html、web-check.htmlのJavaScript/API連携ロジックに触れない
- **GTM/Analytics ID** — 上記のID群を変更・削除しない

## 設計判断ログ
（新しい判断があったら、日付・決定・理由・却下案の形式で自動追記すること）

## ブログ自動化システム

### 全体アーキテクチャ

本リポジトリ（ciras-site）は静的サイトの保管庫。ブログ自動化の動的処理は別リポジトリ `Ciras-Inc/ciras-blog-automation`（Cloudflare Workers）が担う。

本リポジトリの責務：
- 記事HTMLファイルの保管（`/blog/YYMMDD-slug.html`）
- `blog/index.json`（全記事メタのシングルソース）
- ビルドスクリプト（トップページBlogセクション・`/blog` 一覧・Instagramセクションの初期HTMLを自動生成）

新記事の追加・更新は ciras-blog-automation 側のWorkerが GitHub API 経由で本リポジトリに commit する。人間が手動でファイルを追加する際も、必ず `blog/index.json` を同時更新すること。

### blog/index.json スキーマ

全記事メタの唯一の正。

```json
{
  "version": "1.0",
  "articles": [
    {
      "slug": "260418-example",
      "title": "記事タイトル",
      "description": "AI検索向け要約（120字以内）",
      "category": "AI活用",
      "publishedAt": "2026-04-18",
      "updatedAt": "2026-04-18",
      "heroImage": "/blog/images/260418-example.png",
      "author": "杉本竜弥",
      "tags": ["AI活用", "中小企業"],
      "expires_at": null,
      "archived": false
    }
  ]
}
```

カテゴリは `AI活用 / AEO対策 / Web運用 / お知らせ / 補助金 / セミナー` のいずれか。`expires_at` と `archived` は補助金カテゴリ専用。

### ビルドスクリプト（scripts/配下）

- `build-homepage.js` … トップ `index.html` の `<section id="blog">` を最新3記事で置換
- `build-blog-list.js` … `/blog/index.html` を再生成（`archived: true` 除外）
- `build-instagram-section.js` … Workers API の初期フェッチ結果を `<section id="instagram">` に静的埋め込み
- `archive-expired.js` … `expires_at` 経過記事に `archived: true` を付与
- `backfill-index.js` … 既存HTMLから `index.json` を一括生成（初回のみ）

### GitHub Actions

- `main` push 時：全ビルド → 差分 commit → Cloudflare Pages デプロイ
- 日次 cron（00:00 JST）：`archive-expired.js` 実行

### デザイン（絶対遵守）

- モノクローム、主アクセント `#242422`
- 緑系（`#2c5926`、`#2D5A27` 等）全面禁止
- Noto Sans JP
- Instagram は公式 oEmbed 不使用、画像のみ抜き出してモノクロカードグリッド

### 記事の文体・品質基準

`ciras-brand-voice` スキル準拠：
- 対象読者：ChatGPT / Gemini 程度の AI リテラシーのビジネスマン
- 専門用語禁止、使用時は同段落内に備考必須
- 同じ視座・寄り添い＋専門家の立場
- 1,800〜2,400字
- 構成：つかみ → 備考 → ビフォーアフター → 中小企業への示唆 → CTA

CTA自動出し分け：
- AI活用 / AEO対策 → AI顧問
- 業務効率化系 → AI導入
- セミナー参加促進系 → セミナー
- 全記事末尾に共通で無料相談リンク

### 構造化データ（AEO必須）

各記事に JSON-LD（`schema.org/BlogPosting`）を自動挿入。著者=杉本竜弥固定。補助金記事のみ `expires` 追加。

### 補助金記事の特殊ルール

- 本文冒頭に「※情報は YYYY年M月D日 時点のものです」自動挿入
- 本文内に公募終了日を必ず記載（不明時は記事生成を中止）
- `expires_at` 必須
- 期限経過後の `archived: true` 記事は、トップ・一覧から非表示、URL直接アクセス時は上部に「募集終了」バナー表示、記事自体は削除しない

### 環境変数・シークレット管理

- リポジトリにシークレットを含めない
- Cloudflare Pages / GitHub Actions の環境変数設定で管理
- コード・ドキュメント・CLAUDE.md に APIキー等をベタ書きしない
- `.env` / `.dev.vars` は `.gitignore` に必ず含める

### 既存記事のバックフィル（初回のみ）

`/blog` 配下の既存HTMLから以下5記事を `index.json` に登録：
- `260214-ai-search-guide`（Web運用）
- `260214-wix-migration`（Web運用）
- `shindan-tool-release`（お知らせ、2026-02-12）
- `aeo-taisaku-kihon`（AEO対策、2026-02-08）
- `ai-katsuyou-3points`（AI活用、2026-02-08）

トップページ現行の3番目リンク切れカード（「生成AIで業務効率を上げるための実践ガイド」）は削除。自動生成される最新3記事に置き換える。
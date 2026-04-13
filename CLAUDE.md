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

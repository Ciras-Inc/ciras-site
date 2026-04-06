# Ciras株式会社 公式サイト

AI活用で経営の「迷い」を「決断」に変える。  
愛媛県松山市のAIコンサルティング会社 Ciras株式会社の公式Webサイト。

## 技術スタック

- **ホスティング**: Cloudflare Pages
- **構成**: 純粋な HTML / CSS（フレームワーク不使用）
- **AI検索最適化**: JSON-LD 構造化データ（Schema.org）完全実装
- **更新ワークフロー**: Claude Code → GitHub → Cloudflare 自動デプロイ

## ディレクトリ構成

```
ciras2/
├── index.html          # トップページ
├── ai-komon.html       # Ciras AI顧問
├── web.html            # AI活用 Webサイト制作
├── kagemusha.html      # 影武者
├── seminar.html        # セミナー
├── voice.html          # お客様の声
├── faq.html            # よくある質問
├── company.html        # 会社概要
├── contact.html        # お問い合わせ
├── blog.html           # ブログ
├── partner.html        # 採用・協業
├── privacy.html        # プライバシーポリシー
├── robots.txt          # クローラー設定（AIボット明示許可）
├── sitemap.xml         # サイトマップ
├── _headers            # Cloudflare セキュリティ/キャッシュヘッダー
├── _redirects          # Cloudflare クリーンURL設定
└── images/             # 画像アセット
```

## デプロイ方法

1. このリポジトリを GitHub にプッシュ
2. Cloudflare Pages でリポジトリを接続
   - ビルドコマンド: （なし / 空欄）
   - 出力ディレクトリ: `/`（ルート）
3. カスタムドメイン `ciras.jp` を設定
4. `main` ブランチへのプッシュで自動デプロイ

## Claude Code での更新方法

```bash
# テキスト修正の例
claude "index.html のHeroコピーを「AIで御社の決断を加速」に変更して"

# 料金変更の例  
claude "全ページのAI顧問の料金を33,000円から38,500円に変更して"

# AEO一括チェックの例
claude "全HTMLのJSON-LDスキーマがSchema.orgに準拠しているか確認して"

# 新規ページ追加の例
claude "hiroshima.html を ai-komon.html をベースに広島向けLPとして作成して"
```

## AEO（AI検索最適化）対応状況

| 項目 | 状態 |
|------|------|
| JSON-LD 構造化データ | ✅ |
| Open Graph meta | ✅ |
| Twitter Card meta | ✅ |
| canonical URL | ✅ |
| favicon (ico / svg / apple-touch) | ✅ |
| robots.txt AIボット許可 | ✅ |
| sitemap.xml（全12ページ） | ✅ |
| _headers セキュリティヘッダー | ✅ |
| _redirects クリーンURL | ✅ |
| セマンティックHTML | ✅ |
| aria-label / role属性 | ✅ |
| fade-in アニメーション（フォールバック付き） | ✅ |

## ライセンス

© 2026 Ciras株式会社. All rights reserved.

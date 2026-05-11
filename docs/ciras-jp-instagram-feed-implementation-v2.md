# ciras.jp Instagram フィード実装指示書（A案直行版）

最終更新: 2026/05/11
対象: Claude Code（CirasAICompany）
オーケストレーター: 杉本竜弥
ステータス: Phase 0 完了、本実装フェーズへ

---

## 全体方針

LightWidget等の外部サービスを経由せず、Cloudflareスタックで自社制御の Instagram フィード表示を構築する。Cirasのモノクローム統一・AEO戦略・外部依存最小化方針に完全合致。

---

## Phase 0 完了状態（前提条件・すべて取得済み）

### Meta側

- アプリ名: `Ciras Social Feed`
- Meta App ID: `1292635849054400`
- Instagram Business Account ID: `17841442429531657`（公開値、コード内記述可）
- アクセストークン: 杉本さんがパスワードマネージャーに保管済み（**Claude Codeには渡さない**）
- App Secret: 杉本さんがパスワードマネージャーに保管済み（**Claude Codeには渡さない**）
- OAuth リダイレクトURL: `https://ciras.jp/auth/instagram/callback`
- 権限: `instagram_business_basic`（読み取り）
- 開発モード運用（App Reviewなし、自社1アカウント限定）

### Cloudflare側

- KV namespace: `INSTAGRAM_FEED`（作成済み）
- R2 bucket: `ciras-instagram-media`（作成済み、APAC、Standard）
- カスタムドメイン: `media.ciras.jp`（CNAME設定済み）

---

## アーキテクチャ

```
[Instagram Graph API]
        ↑
        │ 6時間ごとに取得 + 7日ごとにトークンrefresh
        │
[Worker: ciras-ig-refresher] ─→ [R2: ciras-instagram-media] ─→ media.ciras.jp/{key}
        │
        ↓ 投稿メタデータ書き込み
[KV: INSTAGRAM_FEED]
        ↑
        │ 読み取り
        │
[Pages Functions: /api/instagram]（ciras-site）
        ↑
        │ fetch
        │
[ciras.jp トップページ Instagram セクション]
```

---

## リポジトリ構成

### 新規作成: `Ciras-Inc/ciras-ig-refresher`（Private）

```
ciras-ig-refresher/
├── src/
│   └── index.ts
├── wrangler.toml
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

### 既存リポジトリ追加: `Ciras-Inc/ciras-site`

```
ciras-site/
├── functions/
│   └── api/
│       └── instagram.ts  ← 新規作成
├── index.html            ← Instagram セクション追加
└── assets/
    └── css/
        └── instagram.css ← 新規作成（Instagram セクション専用）
```

---

## 実装仕様

### 1. Worker: ciras-ig-refresher

#### 1-1. package.json

```json
{
  "name": "ciras-ig-refresher",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "latest",
    "wrangler": "latest",
    "typescript": "^5.0.0"
  }
}
```

#### 1-2. wrangler.toml

```toml
name = "ciras-ig-refresher"
main = "src/index.ts"
compatibility_date = "2026-05-01"

[[kv_namespaces]]
binding = "INSTAGRAM_FEED"
id = "[Cloudflareダッシュボードから取得した Namespace ID]"

[[r2_buckets]]
binding = "INSTAGRAM_MEDIA"
bucket_name = "ciras-instagram-media"

[vars]
IG_USER_ID = "17841442429531657"
IG_GRAPH_VERSION = "v22.0"

[triggers]
crons = [
  "0 */6 * * *",   # 6時間ごと: フィード取得 + R2ミラー
  "0 18 */7 * *"   # 7日ごと 03:00 JST: トークンリフレッシュ
]
```

注意:
- KV namespace ID は `wrangler kv namespace list` または Cloudflare ダッシュボードで取得
- Secret は wrangler.toml に書かない（`wrangler secret put` で別途投入）

#### 1-3. Secrets（杉本さんが手動投入、Claude Codeは値を扱わない）

杉本さんに以下を案内：

```
Cursorのターミナルで以下を1つずつ実行してください。
プロンプトに値を入力する形で投入してください（コマンドに値を直接書かない）。

cd ciras-ig-refresher
npx wrangler secret put IG_ACCESS_TOKEN
（プロンプトでパスワードマネージャーからアクセストークンをペースト）

npx wrangler secret put IG_APP_SECRET
（プロンプトでパスワードマネージャーからApp Secretをペースト）
```

#### 1-4. src/index.ts 実装要件

**型定義**:

```typescript
type Env = {
  INSTAGRAM_FEED: KVNamespace;
  INSTAGRAM_MEDIA: R2Bucket;
  IG_USER_ID: string;
  IG_GRAPH_VERSION: string;
  IG_ACCESS_TOKEN: string;
  IG_APP_SECRET: string;
};

type IGMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

type FeedPost = {
  id: string;
  caption: string;
  media_type: string;
  media_url: string;       // R2 経由の URL に置換済み
  permalink: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
};
```

**メインハンドラ**:

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(fetchAndMirrorFeed(env));
    } else if (event.cron === "0 18 */7 * *") {
      ctx.waitUntil(refreshToken(env));
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    // 管理用エンドポイント（手動実行・診断用）
    const url = new URL(request.url);
    
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    
    if (url.pathname === "/manual-refresh") {
      // 認証チェック（簡易: シークレットヘッダー）
      const auth = request.headers.get("x-admin-token");
      if (auth !== env.IG_APP_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      await fetchAndMirrorFeed(env);
      return new Response("refreshed");
    }
    
    return new Response("ciras-ig-refresher", { status: 200 });
  }
};
```

**fetchAndMirrorFeed の処理**:

1. Graph API 呼び出し:
   ```
   GET https://graph.instagram.com/{IG_GRAPH_VERSION}/{IG_USER_ID}/media
     ?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count
     &limit=12
     &access_token={IG_ACCESS_TOKEN}
   ```
2. レスポンスの `data` 配列を取得
3. 各投稿について:
   - 画像URL（または VIDEO の場合は `thumbnail_url`）を fetch
   - R2 のキー `posts/{media_id}.jpg` で既存チェック
   - 未保存ならアップロード（Content-Type 適切に設定、Content-Disposition `inline`）
   - `media_url` を `https://media.ciras.jp/posts/{media_id}.jpg` に書き換え
4. 整形した `FeedPost[]` を KV に保存:
   - キー: `feed:latest`
   - 値: JSON文字列
5. 30日以上前の R2 オブジェクトを削除（コスト削減、別キー `feed:cleanup_log` で記録）
6. エラー時のリトライ: 3回まで、指数バックオフ
7. ログ: `console.log` で進捗・エラーを記録（Workers Logs で確認可）

**refreshToken の処理**:

1. リフレッシュ API:
   ```
   GET https://graph.instagram.com/refresh_access_token
     ?grant_type=ig_refresh_token
     &access_token={IG_ACCESS_TOKEN}
   ```
2. レスポンスから新トークンを取得
3. **Workers Secrets を Cloudflare API 経由で更新**:
   - 必要な権限: `Workers Scripts: Edit`
   - エンドポイント: `PUT https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}/secrets`
   - これには Cloudflare API Token が必要（別途 Secret として `CF_API_TOKEN` を投入）
4. 簡易代替案: KV に新トークンを保存し、`fetchAndMirrorFeed` 開始時に KV から優先読み込み
   - KV キー: `system:access_token`
   - 値: トークン文字列
   - こちらの方が実装簡単、推奨
5. エラー時はWorkers Logsへ記録、メール通知（Cloudflare Notifications設定は別途）

**実装上の注意**:
- 並列 fetch は `Promise.all` で実施（投稿数12なら問題なし）
- R2 アップロードのリトライ実装必須
- KV書き込みは1回にまとめる（書き込みコスト削減）

#### 1-5. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true
  }
}
```

---

### 2. Pages Functions: /api/instagram

#### 2-1. functions/api/instagram.ts

```typescript
type Env = {
  INSTAGRAM_FEED: KVNamespace;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const feed = await context.env.INSTAGRAM_FEED.get("feed:latest", "json");
    
    if (!feed) {
      return new Response(JSON.stringify({ posts: [] }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "https://ciras.jp"
        }
      });
    }
    
    return new Response(JSON.stringify(feed), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "https://ciras.jp"
      }
    });
  } catch (err) {
    console.error("instagram api error:", err);
    return new Response(JSON.stringify({ posts: [], error: "feed unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
};
```

#### 2-2. Cloudflare Pages の KV バインディング

Cloudflareダッシュボード → Pages → ciras-site → Settings → Functions → KV namespace bindings:

- Variable name: `INSTAGRAM_FEED`
- KV namespace: `INSTAGRAM_FEED`（Phase 0 で作成済み）

---

### 3. フロントエンド実装

#### 3-1. index.html の Instagram セクション

配置位置: **サービス紹介セクションの後、フッターの前**（FV直下や上部は避ける、Cirasのコア価値訴求を優先）

```html
<section class="instagram-section" aria-label="Cirasの最新Instagram投稿">
  <div class="container">
    <header class="instagram-header">
      <h2 class="instagram-title">Instagram</h2>
      <p class="instagram-subtitle">日々の活動・セミナー・現場の様子をお届けしています。</p>
    </header>
    <div class="instagram-grid" id="instagram-grid" aria-live="polite">
      <!-- JSで動的挿入。デフォルトでスケルトンUI表示 -->
      <div class="instagram-skeleton"></div>
      <div class="instagram-skeleton"></div>
      <div class="instagram-skeleton"></div>
      <div class="instagram-skeleton"></div>
      <div class="instagram-skeleton"></div>
      <div class="instagram-skeleton"></div>
    </div>
    <footer class="instagram-footer">
      <a href="https://www.instagram.com/ciras.inc/" target="_blank" rel="noopener noreferrer" class="instagram-follow-link">
        Instagramでフォローする
      </a>
    </footer>
  </div>
</section>

<script>
(async () => {
  const grid = document.getElementById('instagram-grid');
  try {
    const res = await fetch('/api/instagram');
    if (!res.ok) throw new Error('feed fetch failed');
    const data = await res.json();
    const posts = (data.posts || []).slice(0, 6);
    
    if (posts.length === 0) {
      // 投稿なし: セクション全体を非表示
      document.querySelector('.instagram-section').style.display = 'none';
      return;
    }
    
    grid.innerHTML = posts.map(post => `
      <a href="${post.permalink}" target="_blank" rel="noopener noreferrer" class="instagram-tile" aria-label="Instagram投稿: ${escapeHtml(post.caption || '').slice(0, 50)}">
        <img src="${post.media_url}" alt="${escapeHtml(post.caption || '').slice(0, 80)}" loading="lazy" decoding="async">
        <div class="instagram-overlay">
          <span class="instagram-stat">♥ ${post.like_count ?? '-'}</span>
          <span class="instagram-stat">💬 ${post.comments_count ?? '-'}</span>
        </div>
      </a>
    `).join('');
  } catch (e) {
    console.error('Instagram feed unavailable:', e);
    document.querySelector('.instagram-section').style.display = 'none';
  }
})();

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
</script>
```

#### 3-2. assets/css/instagram.css

```css
/* Cirasモノクローム統一・基準色#242422 */
.instagram-section {
  padding: 80px 0;
  background: #ffffff;
}

.instagram-header {
  text-align: center;
  margin-bottom: 40px;
}

.instagram-title {
  font-size: 2rem;
  font-weight: 700;
  color: #242422;
  letter-spacing: 0.05em;
  margin: 0 0 12px;
}

.instagram-subtitle {
  font-size: 0.95rem;
  color: #242422;
  opacity: 0.7;
  margin: 0;
}

.instagram-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: 900px;
  margin: 0 auto;
}

.instagram-tile {
  position: relative;
  display: block;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #f5f5f5;
  text-decoration: none;
  color: inherit;
}

.instagram-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.instagram-tile:hover img {
  transform: scale(1.05);
}

.instagram-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: rgba(36, 36, 34, 0.7);
  color: #ffffff;
  font-size: 0.95rem;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.instagram-tile:hover .instagram-overlay,
.instagram-tile:focus-visible .instagram-overlay {
  opacity: 1;
}

.instagram-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  filter: grayscale(1);
}

.instagram-skeleton {
  aspect-ratio: 1 / 1;
  background: linear-gradient(90deg, #f0f0f0 0%, #e8e8e8 50%, #f0f0f0 100%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.instagram-footer {
  text-align: center;
  margin-top: 32px;
}

.instagram-follow-link {
  display: inline-block;
  color: #242422;
  text-decoration: none;
  border-bottom: 1px solid #242422;
  padding: 4px 0;
  font-size: 0.95rem;
  transition: opacity 0.2s ease;
}

.instagram-follow-link:hover {
  opacity: 0.6;
}

/* モバイル: 2列 */
@media (max-width: 640px) {
  .instagram-section {
    padding: 60px 0;
  }
  
  .instagram-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding: 0 16px;
  }
  
  .instagram-title {
    font-size: 1.6rem;
  }
}

/* タブレット: 3列維持・余白調整 */
@media (min-width: 641px) and (max-width: 1024px) {
  .instagram-grid {
    padding: 0 24px;
  }
}
```

注意:
- アクセシビリティ: `:focus-visible` でキーボード操作時もオーバーレイ表示
- 絵文字♥💬は `filter: grayscale(1)` で色を抑えてモノクローム統一
- スケルトンUIで読み込み中の CLS を最小化

#### 3-3. index.html への CSS link 追加

```html
<link rel="stylesheet" href="/assets/css/instagram.css">
```

---

## デプロイ手順

### Step 1: Worker のデプロイ

1. `ciras-ig-refresher` リポジトリを GitHub 上に作成（Private）
2. Cursor でクローン、上記の実装を反映
3. `npm install`
4. `npx wrangler login`（杉本さん操作、ブラウザ認証）
5. `npx wrangler secret put IG_ACCESS_TOKEN`（杉本さんが値投入）
6. `npx wrangler secret put IG_APP_SECRET`（杉本さんが値投入）
7. `npx wrangler deploy`
8. デプロイ後、Cloudflareダッシュボードで Cron Triggers が登録されたことを確認
9. `https://ciras-ig-refresher.{subdomain}.workers.dev/health` で `ok` 返却を確認
10. 手動で初回フィード取得を起動: Cronトリガーを管理画面から「今すぐ実行」または `/manual-refresh` を叩く

### Step 2: Pages Functions のデプロイ

1. `ciras-site` リポジトリで `functions/api/instagram.ts` を作成
2. main ブランチに直接 push（PR・ブランチ作成禁止）
3. Cloudflare Pages の自動デプロイを待つ
4. Cloudflareダッシュボード → Pages → ciras-site → Settings → Functions → KV bindings に `INSTAGRAM_FEED` を追加
5. 再デプロイ（自動再ビルドまたは手動トリガー）
6. `https://ciras.jp/api/instagram` で JSON が返ることを確認

### Step 3: フロントエンドのデプロイ

1. `ciras-site` の `index.html` に Instagram セクションを追加
2. `assets/css/instagram.css` を作成
3. main ブランチに直接 push
4. Cloudflare Pages 自動デプロイ
5. **Cloudflare キャッシュを手動パージ**（必須）
6. ciras.jp トップで Instagram セクションが表示されることを確認

---

## 検証チェックリスト

### Worker 検証

- [ ] `wrangler deploy` 成功
- [ ] Cron Triggers がダッシュボードに2つ登録（6時間ごと + 7日ごと）
- [ ] `/health` エンドポイント `ok` 返却
- [ ] 初回 cron 実行で KV に `feed:latest` が書き込まれる
- [ ] R2 バケットに `posts/*.jpg` が保存される
- [ ] Workers Logs にエラーなし

### Pages Functions 検証

- [ ] `https://ciras.jp/api/instagram` で JSON 取得成功
- [ ] レスポンスの `posts` 配列が6件以上
- [ ] 各 post の `media_url` が `https://media.ciras.jp/posts/...` 形式

### フロントエンド検証

- [ ] PC: 3列×2行で6投稿表示
- [ ] モバイル: 2列×3行で6投稿表示
- [ ] ホバーで黒オーバーレイ + いいね/コメント数表示
- [ ] クリックで Instagram の該当投稿に遷移
- [ ] LCP < 2.5s, CLS < 0.1（PageSpeed Insights）
- [ ] 画像がすべて `media.ciras.jp` 経由
- [ ] コンソールエラーなし

### 中長期検証

- [ ] 6時間後、新規投稿が反映される
- [ ] 7日後、トークンリフレッシュが正常実行（Workers Logs確認）
- [ ] R2 ストレージ容量が肥大化しない（古い画像が自動削除される）

---

## セキュリティ厳守事項

1. **アクセストークン・App Secret は絶対にコード・コミット・ログ・チャットに含めない**
2. 環境変数として Workers Secrets に投入、`wrangler.toml` には記載しない
3. `gitleaks` スキャンを各 commit 前に実行（既存 Hook で自動化済み）
4. `.env` ファイルは作成しない（環境変数は wrangler secret のみ）
5. `credentials-ledger.md` に「IG_ACCESS_TOKEN, IG_APP_SECRET, CF_API_TOKEN（必要なら）の存在のみ記録、値は記載しない」
6. Pages Functions の `/api/instagram` は読み取り専用、認証不要（公開情報のみ返却）
7. Worker の `/manual-refresh` は `x-admin-token` ヘッダーで保護（App Secret を流用）

---

## 運用ルール

### トークン管理

- IG_ACCESS_TOKEN は60日有効、7日ごとのCronで自動リフレッシュ
- リフレッシュ失敗時は Workers Logs にエラー出力
- 月1で Cron 実行履歴を確認（Cloudflareダッシュボード → Workers → ciras-ig-refresher → Logs）

### モニタリング

- Cloudflare Workers ダッシュボードで cron 実行履歴・エラー率を監視
- Graph API レートリミット: 200/hour（cron は1日4回のみなので余裕）
- R2 容量: 月次で確認（30日経過の自動削除で抑制）

### 拡張候補（Phase 3 以降）

- Threads API 対応（同じ Graph API 基盤）
- ciras-portal クライアント側へのフィード横展開（同 KV 再利用）
- 投稿の絞り込み（特定ハッシュタグのみ表示等）
- 動画の自動再生プレビュー（mute状態）

---

## Claude Code への引き渡し時の指示テンプレート

```
ciras.jp のトップページに Instagram フィード表示機能を実装します。

実装指示書: [本ドキュメントのパス]

Phase 0 はすべて完了済みです。以下を順に進めてください：

1. ciras-ig-refresher リポジトリの作成（GitHubのCiras-Inc配下、Private）
2. Worker 実装（src/index.ts、wrangler.toml等）
3. ciras-site への Pages Functions 追加
4. ciras-site のフロントエンド実装（index.html + instagram.css）
5. デプロイ・検証

各ステップ完了時にCodex MCPでクロスレビューを実施してください。
進捗報告は improvement-decisions.md に追記してください。

機密情報の取り扱い厳守：
- アクセストークン・App Secret はコードに絶対書かない
- 値の入力が必要な箇所は「Cursorのターミナルから wrangler secret put で手動入力してください」と杉本さんに案内
- KV namespace ID は wrangler kv namespace list で取得して wrangler.toml に書き込む

ciras-siteへの変更は main ブランチに直接 push（PR禁止）、デプロイ後は Cloudflare キャッシュを必ず手動パージ。

不明点は実行前に確認してください。
```

---

## 想定リスクと対策

| リスク | 対策 |
|---|---|
| トークンリフレッシュ失敗（API変更等） | 月1でCron実行履歴を手動確認、失効前に再取得 |
| R2 容量肥大 | fetchAndMirrorFeed 内で30日以上前のオブジェクト自動削除 |
| Graph API のレートリミット超過 | cron は1日4回のみ、200/hour 制限の0.1%以下 |
| Instagram アカウント停止 | フィード取得失敗時、フロントエンドJSのcatch節でセクション非表示 |
| Cron トリガー停止 | Cloudflare Notifications でエラー通知設定 |
| 開発モード制限変更 | Meta から通知が来る、App Review 申請（2〜4週間）が必要になる場合あり |

---

## メモ

- Phase 0 で取得した IG_ACCESS_TOKEN は 2026/07/10 頃失効。それまでに本実装完了とリフレッシュ動作確認を済ませる。
- 杉本さんが Cursor から Claude Code に本指示書を渡す際、トークン等の機密情報は絶対にプロンプトに含めない。
- 本実装完了後、本ドキュメントを `Ciras-Inc/ciras-site/docs/instagram-feed-implementation.md` として commit し、運用ドキュメントとして保管。

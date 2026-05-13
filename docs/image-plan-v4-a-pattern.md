# v4 画像方針 A案（旧イラスト流用＋不足分だけ新規生成）計画書

**作成日:** 2026-05-13
**ブランチ:** feature/homepage-renewal-v4
**ステータス:** 杉本さん承認待ち（manifest.json 書き換え・generate-images 実行・既存画像上書きは未実施）

---

## 1. 既存画像の棚卸し

### 1-A. ローカル `ciras-generated-images/` 配下（26枚、すべて 2026-04-05 21:28 生成）

| ファイル | 想定用途 | サイズ目安 |
|---|---|---|
| ai-check-lp-hero.png | AI診断ツール LP（ai-check-lp.html）Hero | 約 632KB |
| ai-check-tool-hero.png | AI診断ツール本体（ai-check.html）Hero | 約 1,029KB |
| ai-jyuku-hero.png | 生成AI活用塾 LP（lp/ai-jyuku, seminar/ai-juku）Hero | 約 1,061KB |
| blog-hero.png | ブログトップ Hero | 約 1,018KB |
| blog-thumb-aeo.png | ブログ記事サムネ（AEO） | 約 761KB |
| blog-thumb-ai-katsuyou.png | ブログ記事サムネ（AI活用） | 約 529KB |
| blog-thumb-ai-search.png | ブログ記事サムネ（AI検索） | 約 784KB |
| blog-thumb-shindan.png | ブログ記事サムネ（診断） | 約 929KB |
| blog-thumb-wix-migration.png | ブログ記事サムネ（Wix移行） | 約 329KB |
| needs-hero.png | /needs Hero | 約 1,085KB |
| needs-icon-ai.png | /needs カテゴリアイコン | 約 1,012KB |
| needs-icon-donyu.png | /needs 廃止カテゴリ用 | 約 995KB |
| needs-icon-hiring.png | /needs 採用カテゴリ | 約 925KB |
| needs-icon-kagemusha.png | /needs 影武者カテゴリ | 約 736KB |
| needs-icon-knowledge.png | /needs ナレッジカテゴリ | 約 1,157KB |
| needs-icon-policy.png | /needs ポリシーカテゴリ | 約 1,125KB |
| needs-icon-subsidy.png | /needs 補助金カテゴリ | 約 1,125KB |
| needs-icon-system.png | /needs システムカテゴリ | 約 896KB |
| needs-icon-web.png | /needs Webカテゴリ | 約 240KB |
| partner-hero.png | partner.html Hero | 約 924KB |
| partner-icon-advisor.png | partner.html アイコン | 約 67KB |
| partner-icon-referral.png | partner.html アイコン | 約 273KB |
| partner-icon-staff.png | partner.html アイコン | 約 68KB |
| privacy-hero.png | privacy.html Hero | 約 973KB |
| web-check-lp-hero.png | Web診断ツール LP Hero | 約 980KB |
| web-check-tool-hero.png | Web診断ツール本体 Hero | 約 986KB |

**現在の利用状況**：main ブランチの HTML は **どれも参照していない**（main は外部 CDN を参照）。feature ブランチで今回 supporting image として参照する src パスは別のファイル名（例：`/ciras-generated-images/contact-supporting.png` 等）で、上記 26 枚とは別物。git 履歴では `worktree-json-ld-check` ブランチで「Manus画像」というコミットが存在。

### 1-B. main ブランチの外部 CDN 画像（線画イラスト・要ダウンロード）

main ブランチの HTML が参照している `https://files.manuscdn.com/user_upload_by_module/session_file/310519663117049137/<hash>.png` 形式の旧サイト線画イラスト。**ローカル保存されておらず、Manus セッションが消えれば失効するリスクあり**。

| URL ハッシュ | alt（要約） | 用途（旧サイト） |
|---|---|---|
| TdRJvBrOIkfQVLJm | 「AI活用コンサルティング風景」 | index トップ Hero |
| yHaVEKiNLKUYpYZA | 「Ciras AI顧問 - 月額33,000円のAI活用相談サービス」 | index サービスカード AI顧問 |
| HiXqzkjKEjRCSILg | 「Ciras AI導入 - 月額88,000円のAI仕組み構築サービス」 | index サービスカード AI導入 |
| FIUUqkLTkZEoQjYh | 「影武者 - 経営者と同じ目線で動くAI支援サービス」 | index サービスカード 影武者 |
| MbZAnjkPDIWpjEqS | 「AI対応Webサイト制作 - AI検索に対応したホームページ制作」 | index サービスカード Web |
| bwTvtSxIWdDEksbw | 「AI業務システム開発 - 業務自動化システムの構築」 | index サービスカード System |
| DaNcxobhxKGewclv | 「AI検索に対応したWebサイト制作」 | index AI Search セクション |
| XEOCMZkGqEdtHzLw | 「愛媛県で開催される生成AI活用セミナーの様子」 | index セミナーセクション |
| kfhIydaxNZkDTzVJ | 「AIアドバイザーとビジネスパーソンが一緒にAI活用を進めるイメージ」 | ai-komon Hero |
| FXRZpNfqVAQiIgkj | 「月1回のレクチャーのイメージ」 | ai-komon 80x80 アイコン |
| lCirsDTzgfKyLEnt | 「日々の相談窓口のイメージ」 | ai-komon 80x80 アイコン |
| OoezSldHcRMYWtvN | 「制作物の保守のイメージ」 | ai-komon 80x80 アイコン |
| EjnvOFugxoInFeBa | 「影武者 - 経営者とIT・AI専門家が並走するイメージイラスト」 | kagemusha Hero |
| suptlpVphpmIQroj | 「会議・商談同席のイラスト」 | kagemusha 80x80 アイコン |
| qEBaVjAtNvinHots | 「社員研修・指導のイラスト」 | kagemusha 80x80 アイコン |
| aPNVysouSPiIuVWN | 「経営判断のイラスト」 | kagemusha 80x80 アイコン |
| ZItiGXjQRbmRnvYM | 「ブラウザウィンドウとUI要素を配置するデザイナー」 | web Hero |
| fbbdrfVjXgBDNXXA | 「ダッシュボードとデータフローを表現したモノクロイラスト」 | system Hero |
| oYFETehxnDQuhUcr | 「Ciras生成AIセミナーの様子」 | seminar Hero |
| LvxJdnQGTiZThUEU | 「オンラインAIセミナー」 | seminar |
| axQNzSkDMdtBWftb | 「対面AI活用塾」 | seminar |
| ocXdZzIGKabUtuXh | 「企業向けAI研修」 | seminar |
| akPvfkehNOPlsIGa | 「お問い合わせ・無料相談のイラスト」 | contact Hero |
| UOzhVxUJkwpKQljS | 「FAQ - 吹き出しと疑問符のモノクロイラスト」 | faq Hero |
| NdEIRgKygdcgdIQR | 「シールドとロックのアイコン」 | privacy Hero |
| KwGwZpyhEVFoHjAc | 「チームワークとコラボレーション」 | partner Hero |
| bghjJAXbVDgzjFLW | 「課題から解決策へつなぐイメージ図、モノクロイラスト」 | needs Hero |
| VKWpfMywjMXUfKlw | 「チームで協力しAI技術を活用するイメージ」 | company Hero |
| （AI導入の追加5枚）aiaTYeqRLpYPEvvp 他 | （流用対象外） | ai-donyu（廃止） |

---

## 2. v4 manifest.json 14 entries との対応付け

| # | entry | v4 参照位置 | 流用候補 | 適合度 | コメント |
|---|---|---|---|---|---|
| 1 | homepage-hero | index.html Hero（1792×1024） | manuscdn: TdRJvBrOIkfQVLJm | **中** | 旧トップHero。線画ならトーン継続だが、構図が「面談シーン」で新メッセージ「AIを、もっと使えるかたちに」の象徴性とは雰囲気が違う。実物確認推奨 |
| 2 | ogp-default | images/ogp.png（1536×1024） | TdRJvBrOIkfQVLJm をクロップ | **低** | OGP はソーシャル拡散時の見栄え要。新規生成推奨 |
| 3 | ai-initial-setup-hero | ai-initial-setup.html Hero | — | **不可** | 完全新規サービス。旧サイトに対応コンセプトなし |
| 4 | ai-komon-hero | ai-komon.html Hero | manuscdn: kfhIydaxNZkDTzVJ | **高** | サービス本質変わらず。alt「AIアドバイザーとビジネスパーソン」は新コピーとも整合 |
| 5 | kagemusha-hero | kagemusha.html Hero | manuscdn: EjnvOFugxoInFeBa | **中** | **要注意**：alt に「並走」記載。原則(9)「並走/伴走禁止」に抵触する構図なら NG。実物確認必須 |
| 6 | web-hero | web.html Hero | manuscdn: ZItiGXjQRbmRnvYM | **高** | サービス本質変わらず |
| 7 | system-hero | system.html Hero | manuscdn: fbbdrfVjXgBDNXXA | **高** | alt に明示的に「モノクロイラスト」記載、デザイン基準と整合 |
| 8 | mission-vision | index.html MV section | — | **不可** | 完全新規（旧サイトにMVセクションなし） |
| 9 | service-distance-supporting | index.html Service section | — | **不可** | 「距離感」表現の新規概念 |
| 10 | contact-supporting | contact.html consult section | manuscdn: akPvfkehNOPlsIGa | **中** | 旧 contact Hero。「無料相談」のテキストが画像内に含まれないなら流用可。alt はリライト必須 |
| 11 | faq-supporting | faq.html faq-section前 | manuscdn: UOzhVxUJkwpKQljS | **高** | 「吹き出しと疑問符」の汎用ビジュアル、完璧に流用可 |
| 12 | privacy-supporting | privacy.html toc前 | manuscdn: NdEIRgKygdcgdIQR | **高** | 「シールドとロック」、Privacy ページに最適 |
| 13 | ai-initial-setup-supporting | ai-initial-setup.html overview前 | — | **不可** | 完全新規 |
| 14 | system-supporting | system.html examples前 | — | **不可** | 旧 system は Hero のみで supporting なし |

---

## 3. 新規生成が必要な entry（最大 7枚）

中適合度の流用候補が実物確認で NG だった場合の追加生成も含む。

### 3-A. 確定新規（5枚、流用不可）

#### 3-A-1. ai-initial-setup-hero
- **用途**：AI初期設定パック ページ Hero
- **プロンプト案**：
  > AI初期設定パックのヒーロー画像。白基調、モノクロの線画イラスト、ミニマル。ChatGPT・Gemini・Claudeの設定画面を象徴する複数のブラウザウィンドウやチャット UI が整列している様子。手元の調整作業を示す静かな構図。中央〜左寄りに余白を残す。テキストは入れない。1792×1024 横長。

#### 3-A-2. ai-initial-setup-supporting
- **用途**：ai-initial-setup.html overview セクション前
- **プロンプト案**：
  > AI初期設定パックの supporting image。白基調、モノクロの線画イラスト、ミニマル。設定資料のページが机に並ぶ俯瞰、または資料に項目を書き留める静かな手元のクローズアップ。穏やかな自然光。テキストは入れない。1792×1024 横長。

#### 3-A-3. mission-vision
- **用途**：index.html MISSION / VISION セクション
- **プロンプト案**：
  > Cirasの目指す姿（Mission / Vision）を表す抽象ビジュアル。白基調、モノクロの線画イラスト、ミニマル。「できる」を増やす、「知らないを楽しむ日常」を象徴する、扉が静かに開いて光が差す情景、または窓辺で広がる柔らかな風景。テキストは入れない。1792×1024 横長。

#### 3-A-4. service-distance-supporting
- **用途**：index.html サービスセクション内（supporting）
- **プロンプト案**：
  > サービスセクションの supporting image。白基調、モノクロの線画イラスト、ミニマル。「御社との距離感」を象徴する、3つの椅子が異なる距離で並ぶ静物、または異なる距離感で対話する3つのシルエット。テキストは入れない。1792×1024 横長。

#### 3-A-5. system-supporting
- **用途**：system.html examples セクション前
- **プロンプト案**：
  > AI時代の業務システム開発の supporting image。白基調、モノクロの線画イラスト、ミニマル。「業務の仕組み化」を象徴する、フロー図を描く手元のクローズアップ、または整理されたタスクボードの俯瞰。柔らかい自然光。テキストは入れない。1792×1024 横長。

### 3-B. 推奨新規（1枚、OGP）

#### 3-B-1. ogp-default
- **用途**：全ページの OGP / Twitter Card
- **プロンプト案**：
  > Cirasの OGP 画像。白基調、モノクロの線画イラスト、ミニマル。「AIを、もっと使えるかたちに」が静かに伝わる象徴ビジュアル。中央に余白を残し、テキストはサイト側で重ねる前提でビジュアルのみ。テキストは入れない。1536×1024 横長。

### 3-C. 中適合度の流用判定後に新規化される候補（最大 3枚）

実物確認の結果、流用 NG となった場合の予備プロンプト。

#### 3-C-1. homepage-hero（旧版が新メッセージに合わない場合）
- **プロンプト案**：
  > Cirasトップページのヒーロー画像。白基調、モノクロの線画イラスト、ミニマル。「AIを、もっと使えるかたちに」をテーマに、ChatGPT・Gemini・Claudeを業務に取り入れる中小企業の経営者の様子を静かに表現。柔らかい雰囲気、清潔感、ノイズ少なめ。テキストは入れない。1792×1024 横長。

#### 3-C-2. kagemusha-hero（旧版が「並走」表現の場合）
- **プロンプト案**：
  > 影武者サービスのヒーロー画像。白基調、モノクロの線画イラスト、ミニマル。「AIがわかる人が、御社の身近に」を象徴する、経営者の隣で静かに支える社外パートナーの存在。会議室の俯瞰、または背後のシルエット。「並走」「伴走」のような同列に進む構図ではなく、「身近に関わる」距離感を表現する。テキストは入れない。1792×1024 横長。

#### 3-C-3. contact-supporting（旧版に「無料」テキストが画像に含まれる場合）
- **プロンプト案**：
  > Contact ページの supporting image。白基調、モノクロの線画イラスト、ミニマル。「ご相談から始まる」を象徴する、ノートに書き留める手元、または机を挟んだ穏やかな対話シーン。柔らかい自然光。テキストは入れない。1792×1024 横長。

---

## 4. 推定費用

OpenAI gpt-image-1 高品質（quality:high）の公開料金（2026/05 時点・推定）：
- 1792×1024 high：約 $0.17/枚
- 1536×1024 high：約 $0.15/枚

| シナリオ | 新規生成枚数 | 概算費用（USD） | 概算費用（円） |
|---|---|---|---|
| 最小（5枚必須＋OGP1枚） | 5×$0.17 + 1×$0.15 = $1.00 | $1.00 | 約 150円 |
| 標準（最小＋中適合のうち1枚を新規化） | $1.17 | $1.17 | 約 175円 |
| 最大（中適合3枚すべて新規化） | $1.51 | $1.51 | 約 225円 |
| **A案で想定する範囲** | **6〜9枚** | **$1.00〜$1.51** | **約 150〜225円** |

参考：仕様書 v4 §9.11 は初期実装で 200〜400円試算。A案はその下限に収まる見込み。
将来の再生成・年間運用込みで月次 0〜200円、年間 1,000〜2,500円程度。

---

## 5. 進め方の提案

### Step 1：旧 manuscdn 画像のローカル保存（杉本作業）
- 流用候補 7 URL を手動でブラウザ保存 → `ciras-generated-images/` に配置
- 推奨ファイル名（重複回避のため `-old` サフィックス）：
  - `ai-komon-hero-old.png`（kfhIydaxNZkDTzVJ）
  - `kagemusha-hero-old.png`（EjnvOFugxoInFeBa）
  - `web-hero-old.png`（ZItiGXjQRbmRnvYM）
  - `system-hero-old.png`（fbbdrfVjXgBDNXXA）
  - `faq-supporting-old.png`（UOzhVxUJkwpKQljS）
  - `privacy-supporting-old.png`（NdEIRgKygdcgdIQR）
  - `contact-supporting-old.png`（akPvfkehNOPlsIGa）
- ※ Claude Code 側からは外部ダウンロード（curl/wget）が deny ルールで物理ブロックされているため、杉本さんに手動でお願いする運用

### Step 2：実物確認（杉本作業）
- 7 枚をダウンロード後に目視確認
- 特に確認したい 2 枚：
  - `kagemusha-hero-old.png`：「並走」を視覚的に表現した構図かどうか（並んで歩く/二人並んで座る等が NG）
  - `contact-supporting-old.png`：画像内に「無料相談」等のテキストが描かれていないか
- NG なら §3-C のプロンプトで新規化

### Step 3：manifest.json 更新（杉本承認後に Claude が実施）
- 流用 entry：`filename` を新パスに、`regenerate: false` に
- 新規 entry：`regenerate: true`、プロンプト確定
- HTML の `<img src>` も新パスに調整（必要分のみ）

### Step 4：OpenAI Platform で Budget Alerts / Auto-recharge 設定（杉本作業）
- 月額予算 500〜2,000 円推奨
- https://platform.openai.com/settings/organization/limits

### Step 5：`npm run generate-images` 実行（杉本承認後）
- 環境変数 `OPENAI_API_KEY` は Windows User 環境変数に既設
- 新規 6〜9 枚のみ生成、合計 $1.00〜$1.51（150〜225円）
- 完了後、manifest の `regenerate` が自動的に false に更新される

### Step 6：品質確認（杉本作業）
- 生成画像を index.html・各サービスページで目視
- NG なら個別 entry の `regenerate: true` に戻して再生成

### Step 7：必要に応じて img タグ最終調整
- HTML 側で src を最終確定パスに変更（manifest と同期）

---

## 6. リスクと注意点

1. **manuscdn URL の永続性が不明**：Manus セッションが期限切れになると流用候補画像にアクセス不能となる。**Step 1 のローカル保存を最優先で実施**することを推奨。
2. **旧画像のサイズ不一致**：旧 hero は 600×448 や 1200×806 など。1792×1024 にアップサイズすると粗くなる可能性。元解像度が低ければ新規生成にスイッチ。
3. **線画スタイルの整合性**：旧画像は「線画イラスト」、新規生成画像も同じトーンに揃える必要あり。プロンプトに「白基調、モノクロの線画イラスト」を明示。
4. **AI初期設定パックは新規サービスのため、旧画像対応なし**：必ず新規生成。
5. **MV セクションは旧サイトに存在せず**：完全新規。
6. **`ciras-generated-images/` 内の既存 26 枚は触らない**：今回の計画では対象外。
7. **AI導入廃止に伴い、旧 AI導入関連画像（5枚）は流用対象外**。

---

## 7. 承認後の Claude 側作業（参考）

承認いただけば、以下を順番に実施します（生成・OpenAI課金は引き続き杉本承認）：

1. manifest.json を A案に合わせて更新（流用 + 新規生成の切り分け確定）
2. HTML の `<img src>` を流用画像のパスに調整
3. 杉本さんが Step 4・5 完了後、生成結果を品質確認
4. 必要なら追加調整

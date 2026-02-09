/**
 * NotebookLM スライド管理ツール - Google Apps Script
 *
 * PDF のページ画像変換はブラウザ側（PDF.js）で行い、
 * サーバー側は Gemini API での解析・画像の挿入・編集・共有を担当する。
 *
 * セットアップ手順:
 *   1. https://script.google.com で新規プロジェクトを作成
 *   2. Code.gs にこのファイルの内容を貼り付け
 *   3. ファイル追加（＋ → HTML）で「index」を作成し index.html の内容を貼り付け
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *      - 実行ユーザー: 自分
 *      - アクセス: 全員（Google アカウント必須）
 *   5. 表示された URL にアクセスして利用開始
 *
 * ※ Gemini API キーは初回利用時にウェブアプリ上で設定してください
 */

// =====================================================
// Web App エントリーポイント
// =====================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('NotebookLM スライド管理ツール')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =====================================================
// Gemini API 設定
// =====================================================

function setGeminiApiKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey);
  return true;
}

function hasGeminiApiKey() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  return !!key;
}

function getGeminiApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Gemini API キーが設定されていません。設定画面で API キーを入力してください。');
  return key;
}

// =====================================================
// Gemini Vision API でページ画像を解析
// =====================================================

function analyzePageWithGemini_(imageBase64, mimeType) {
  var apiKey = getGeminiApiKey_();
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  var prompt = [
    'このプレゼンテーションスライド画像を分析し、すべてのテキスト要素を正確な位置情報とともに抽出してください。',
    '',
    '以下の構造の JSON オブジェクトのみを返してください:',
    '{',
    '  "backgroundColor": "#RRGGBB",',
    '  "elements": [',
    '    {',
    '      "type": "text",',
    '      "content": "テキスト内容",',
    '      "x": 0.1,',
    '      "y": 0.05,',
    '      "width": 0.8,',
    '      "height": 0.1,',
    '      "fontSize": 24,',
    '      "fontColor": "#333333",',
    '      "bgColor": "#FFFFFF",',
    '      "bold": false,',
    '      "alignment": "left"',
    '    }',
    '  ]',
    '}',
    '',
    'ルール:',
    '- x, y, width, height はページ全体に対する割合（0.0〜1.0）',
    '- x は左端からの位置、y は上端からの位置',
    '- 見出し、本文、キャプション、ラベル、数字など、すべての見えるテキストを抽出',
    '- fontSize はポイント単位（通常 8〜72）',
    '- fontColor はテキストの色（16進数 #RRGGBB）',
    '- bgColor はそのテキストの直下にある背景色（16進数 #RRGGBB）',
    '- bold: 太字なら true',
    '- alignment: "left", "center", "right" のいずれか',
    '- 論理的にまとまるテキストは1つの要素にグループ化',
    '- 見出し、段落、ラベルは別々の要素として保持',
    '- backgroundColor: スライド全体の主要な背景色',
    '- 有効な JSON のみを返すこと（マークダウンのコードフェンス不要）'
  ].join('\n');

  var payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json'
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log('Gemini API error (' + response.getResponseCode() + '): '
      + response.getContentText().substring(0, 500));
    return null;
  }

  var result = JSON.parse(response.getContentText());
  if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
    Logger.log('Gemini API: No candidates returned');
    return null;
  }

  var text = result.candidates[0].content.parts[0].text;

  // Extract JSON from possible markdown fences (safety fallback)
  var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) text = jsonMatch[1];
  text = text.trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    Logger.log('Gemini JSON parse error: ' + e.message + '\nResponse: ' + text.substring(0, 500));
    return null;
  }
}

// =====================================================
// プレゼンテーション作成（最初のバッチ）
// =====================================================

function createPresentation(config) {
  var title = config.title || 'NotebookLM スライド';
  var useGemini = config.useGemini === true;

  var presentation = SlidesApp.create(title);
  var presentationId = presentation.getId();
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();
  var firstSlide = presentation.getSlides()[0];

  // デフォルトのプレースホルダーを削除
  var defaultEls = firstSlide.getPageElements();
  for (var d = defaultEls.length - 1; d >= 0; d--) defaultEls[d].remove();

  for (var i = 0; i < config.files.length; i++) {
    var slide = (i === 0) ? firstSlide
      : presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    insertSlideContent_(slide, config.files[i], slideWidth, slideHeight, useGemini);
  }

  if (config.shareMode && config.shareMode !== 'private') {
    setupSharing_(presentationId, config.shareMode, config.emails, config.permission);
  }

  return {
    id: presentationId,
    url: 'https://docs.google.com/presentation/d/' + presentationId + '/edit',
    slideCount: config.files.length,
    title: title
  };
}

// =====================================================
// スライド追加（2バッチ目以降）
// =====================================================

function addSlidesToPresentation(config) {
  var presentation = SlidesApp.openById(config.presentationId);
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();
  var useGemini = config.useGemini === true;

  for (var i = 0; i < config.files.length; i++) {
    var slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    insertSlideContent_(slide, config.files[i], slideWidth, slideHeight, useGemini);
  }

  return { added: config.files.length };
}

// =====================================================
// スライドコンテンツ挿入（Gemini 有無で分岐）
// =====================================================

function insertSlideContent_(slide, fileData, slideWidth, slideHeight, useGemini) {
  if (useGemini) {
    try {
      var analysis = analyzePageWithGemini_(fileData.data, fileData.mimeType);
      if (analysis) {
        insertPageContentWithGemini_(slide, fileData, slideWidth, slideHeight, analysis);
        return;
      }
    } catch (e) {
      Logger.log('Gemini 解析フォールバック: ' + e.message);
    }
  }
  // フォールバック: 従来の方法（背景画像 + PDF.js テキスト）
  insertPageContent_(slide, fileData, slideWidth, slideHeight);
}

// =====================================================
// Gemini 解析結果を使ったスライド構築
// =====================================================

/**
 * Gemini が解析したテキスト要素を使ってスライドを構築:
 *   1. 背景色を設定
 *   2. 元のページ画像を背景として挿入
 *   3. 各テキスト要素を編集可能なテキストボックスとして配置
 *      （テキストボックスにはローカル背景色を設定し、画像テキストを覆う）
 */
function insertPageContentWithGemini_(slide, fileData, slideWidth, slideHeight, analysis) {
  // 1. 背景色を設定
  if (analysis.backgroundColor) {
    try {
      slide.getBackground().setSolidFill(analysis.backgroundColor);
    } catch (e) {
      Logger.log('背景色設定エラー: ' + e.message);
    }
  }

  // 2. ページ画像を背景として挿入（イラスト・図表などのビジュアルを保持）
  var blob = Utilities.newBlob(
    Utilities.base64Decode(fileData.data),
    fileData.mimeType,
    fileData.fileName
  );
  var bgImage = slide.insertImage(blob);
  bgImage.setLeft(0);
  bgImage.setTop(0);
  bgImage.setWidth(slideWidth);
  bgImage.setHeight(slideHeight);

  // 3. Gemini が抽出したテキスト要素を編集可能なテキストボックスとして配置
  var elements = analysis.elements || [];
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (el.type !== 'text' || !el.content || !el.content.trim()) continue;

    var x = (el.x || 0) * slideWidth;
    var y = (el.y || 0) * slideHeight;
    var w = Math.max((el.width || 0.1) * slideWidth, 20);
    var h = Math.max((el.height || 0.05) * slideHeight, 15);
    var fontSize = Math.max(8, Math.min(72, el.fontSize || 14));

    // スライド範囲内に収める
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > slideWidth) w = slideWidth - x;
    if (y + h > slideHeight) h = slideHeight - y;

    try {
      var textBox = slide.insertTextBox(el.content, x, y, w, h);
      var textRange = textBox.getText();
      var style = textRange.getTextStyle();
      style.setFontSize(fontSize);
      style.setFontFamily('Noto Sans JP');

      // テキスト色
      if (el.fontColor) {
        try { style.setForegroundColor(el.fontColor); } catch (e) {}
      }

      // 太字
      if (el.bold) {
        try { style.setBold(true); } catch (e) {}
      }

      // テキストボックスの背景色（画像のテキストを覆うため）
      if (el.bgColor) {
        try {
          textBox.getFill().setSolidFill(el.bgColor);
        } catch (e) {
          textBox.getFill().setTransparent();
        }
      } else {
        textBox.getFill().setTransparent();
      }

      // 枠線を透明に
      textBox.getBorder().setTransparent();

      // テキスト配置（左/中央/右）
      if (el.alignment) {
        var paragraphs = textRange.getParagraphs();
        var align = SlidesApp.ParagraphAlignment.START;
        if (el.alignment === 'center') align = SlidesApp.ParagraphAlignment.CENTER;
        else if (el.alignment === 'right') align = SlidesApp.ParagraphAlignment.END;
        for (var p = 0; p < paragraphs.length; p++) {
          paragraphs[p].getRange().getParagraphStyle().setParagraphAlignment(align);
        }
      }
    } catch (e) {
      Logger.log('テキストボックス挿入エラー: ' + e.message);
    }
  }
}

// =====================================================
// ページコンテンツ挿入（フォールバック: 背景画像 + PDF.js テキスト）
// =====================================================

function insertPageContent_(slide, fileData, slideWidth, slideHeight) {
  // 背景画像を挿入
  var blob = Utilities.newBlob(
    Utilities.base64Decode(fileData.data),
    fileData.mimeType,
    fileData.fileName
  );
  var image = slide.insertImage(blob);
  image.setLeft(0);
  image.setTop(0);
  image.setWidth(slideWidth);
  image.setHeight(slideHeight);

  // テキストブロックがあれば、編集可能なテキストボックスとして配置
  if (!fileData.textBlocks || fileData.textBlocks.length === 0) return;

  // PDF座標 → スライド座標のスケール計算
  var pdfW = fileData.pageWidth || slideWidth;
  var pdfH = fileData.pageHeight || slideHeight;
  var scaleX = slideWidth / pdfW;
  var scaleY = slideHeight / pdfH;

  for (var i = 0; i < fileData.textBlocks.length; i++) {
    var block = fileData.textBlocks[i];
    if (!block.text || !block.text.trim()) continue;

    var x = block.x * scaleX;
    var y = block.y * scaleY;
    var w = block.width * scaleX + 10;
    var h = block.height * scaleY + 5;
    var fontSize = Math.max(8, Math.round(block.fontSize * scaleY));

    // スライド範囲内に収める
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > slideWidth) w = slideWidth - x;
    if (y + h > slideHeight) h = slideHeight - y;

    try {
      var textBox = slide.insertTextBox(block.text, x, y, w, h);
      var style = textBox.getText().getTextStyle();
      style.setFontSize(fontSize);
      style.setFontFamily('Noto Sans JP');
      // テキストボックスの背景を透明に
      textBox.getFill().setTransparent();
    } catch (e) {
      // 個別のテキストボックス挿入エラーは無視して続行
      Logger.log('テキストボックス挿入エラー: ' + e.message);
    }
  }
}

// =====================================================
// スライド構成の取得
// =====================================================

function getSlideStructure(presentationId) {
  var presentation = SlidesApp.openById(presentationId);
  var slides = presentation.getSlides();
  var structure = [];

  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    var slideInfo = { slideNumber: i + 1, elements: [] };

    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];
      var type = el.getPageElementType().toString();
      var info = {
        index: j + 1,
        type: type,
        left: Math.round(el.getLeft()),
        top: Math.round(el.getTop()),
        width: Math.round(el.getWidth()),
        height: Math.round(el.getHeight())
      };

      if (type === 'SHAPE') {
        info.text = el.asShape().getText().asString().substring(0, 120);
      }
      slideInfo.elements.push(info);
    }
    structure.push(slideInfo);
  }
  return structure;
}

// =====================================================
// テキスト編集
// =====================================================

function replaceText(presentationId, searchText, newText) {
  var presentation = SlidesApp.openById(presentationId);
  var slides = presentation.getSlides();
  var count = 0;

  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      if (elements[j].getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        var textRange = elements[j].asShape().getText();
        if (textRange.asString().indexOf(searchText) !== -1) {
          textRange.replaceAllText(searchText, newText);
          count++;
        }
      }
    }
  }
  return count;
}

function addTextBox(presentationId, slideNumber, text, left, top, width, height, fontSize) {
  var presentation = SlidesApp.openById(presentationId);
  var slide = presentation.getSlides()[slideNumber - 1];
  if (!slide) throw new Error('スライド ' + slideNumber + ' が見つかりません。');

  var shape = slide.insertTextBox(text, left, top, width, height);
  var textStyle = shape.getText().getTextStyle();
  textStyle.setFontSize(fontSize || 18);
  textStyle.setFontFamily('Noto Sans JP');
  return true;
}

// =====================================================
// 画像編集
// =====================================================

function replaceImage(presentationId, slideNumber, imageIndex, imageData) {
  var presentation = SlidesApp.openById(presentationId);
  var slide = presentation.getSlides()[slideNumber - 1];
  if (!slide) throw new Error('スライド ' + slideNumber + ' が見つかりません。');

  var elements = slide.getPageElements();
  var imageCount = 0;

  for (var j = 0; j < elements.length; j++) {
    if (elements[j].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
      imageCount++;
      if (imageCount === imageIndex) {
        var old = elements[j].asImage();
        var pos = {
          left: old.getLeft(), top: old.getTop(),
          width: old.getWidth(), height: old.getHeight()
        };
        old.remove();

        var newImage;
        if (imageData.url) {
          newImage = slide.insertImage(imageData.url);
        } else {
          var blob = Utilities.newBlob(
            Utilities.base64Decode(imageData.data),
            imageData.mimeType,
            imageData.fileName
          );
          newImage = slide.insertImage(blob);
        }
        newImage.setLeft(pos.left);
        newImage.setTop(pos.top);
        newImage.setWidth(pos.width);
        newImage.setHeight(pos.height);
        return true;
      }
    }
  }
  throw new Error('スライド ' + slideNumber + ' の画像 ' + imageIndex + ' が見つかりません。');
}

function unifyImageSizes(presentationId, left, top, width, height) {
  var presentation = SlidesApp.openById(presentationId);
  var slides = presentation.getSlides();
  var count = 0;

  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      if (elements[j].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
        var img = elements[j].asImage();
        img.setLeft(left);
        img.setTop(top);
        img.setWidth(width);
        img.setHeight(height);
        count++;
      }
    }
  }
  return count;
}

// =====================================================
// 背景画像一括削除（テキストのみにする）
// =====================================================

function removeBackgroundImages(presentationId) {
  var presentation = SlidesApp.openById(presentationId);
  var slides = presentation.getSlides();
  var count = 0;

  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    for (var j = elements.length - 1; j >= 0; j--) {
      if (elements[j].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
        var img = elements[j].asImage();
        // フルサイズの背景画像のみ削除（幅がスライド幅の90%以上）
        if (img.getWidth() > presentation.getPageWidth() * 0.9) {
          img.remove();
          count++;
        }
      }
    }
  }
  return count;
}

// =====================================================
// 共有管理
// =====================================================

function setupSharing_(presentationId, shareMode, emails, permission) {
  var file = DriveApp.getFileById(presentationId);

  if (shareMode === 'link_view') {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } else if (shareMode === 'link_edit') {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
  } else if (shareMode === 'emails' && emails) {
    var list = emails.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
    if (list.length > 0) {
      if (permission === 'edit') {
        file.addEditors(list);
      } else {
        file.addViewers(list);
      }
    }
  }
}

function updateSharing(presentationId, shareMode, emails, permission) {
  setupSharing_(presentationId, shareMode, emails, permission);
  return getSharingInfo(presentationId);
}

function getSharingInfo(presentationId) {
  var file = DriveApp.getFileById(presentationId);
  return {
    access: file.getSharingAccess().toString(),
    permission: file.getSharingPermission().toString(),
    editors: file.getEditors().map(function(u) { return u.getEmail(); }),
    viewers: file.getViewers().map(function(u) { return u.getEmail(); }),
    url: file.getUrl()
  };
}

// =====================================================
// プレゼンテーション一覧
// =====================================================

function listMyPresentations() {
  var files = DriveApp.getFilesByType(MimeType.GOOGLE_SLIDES);
  var list = [];

  while (files.hasNext() && list.length < 30) {
    var f = files.next();
    list.push({
      id: f.getId(),
      name: f.getName(),
      lastUpdated: f.getLastUpdated().toISOString()
    });
  }

  list.sort(function(a, b) { return b.lastUpdated.localeCompare(a.lastUpdated); });
  return list;
}

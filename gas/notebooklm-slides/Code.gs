/**
 * NotebookLM スライド管理ツール - Google Apps Script
 *
 * Gemini Vision API でスライド画像を解析し、テキスト・イラスト・背景を
 * 個別の編集可能な要素として Google スライドに再構築する。
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
  if (!key) throw new Error('Gemini API キーが設定されていません。');
  return key;
}

// =====================================================
// Gemini Vision API でページ画像を解析（クライアントから呼ばれる）
// =====================================================

function analyzePageImage(imageData) {
  var analysis = analyzePageWithGemini_(imageData.data, imageData.mimeType);
  if (!analysis) throw new Error('Gemini 解析に失敗しました。');
  return analysis;
}

function analyzePageWithGemini_(imageBase64, mimeType) {
  var apiKey = getGeminiApiKey_();
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  var prompt = [
    'このプレゼンテーションスライド画像を解析してください。',
    'テキスト要素とイラスト/画像領域を正確に識別し、以下の JSON を返してください。',
    '',
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
    '      "alignment": "center"',
    '    },',
    '    {',
    '      "type": "image",',
    '      "x": 0.05,',
    '      "y": 0.15,',
    '      "width": 0.4,',
    '      "height": 0.6',
    '    }',
    '  ]',
    '}',
    '',
    '■ テキスト要素 (type: "text"):',
    '- 見出し、本文、キャプション、ラベル、吹き出し内テキストなど、すべてのテキスト',
    '- x, y, width, height はページ全体に対する割合（0.0〜1.0）',
    '- fontSize はポイント単位',
    '- fontColor はテキスト色（#RRGGBB）',
    '- bgColor はテキスト直下の局所的な背景色（#RRGGBB）',
    '- bold: 太字なら true',
    '- alignment: "left", "center", "right"',
    '- 論理的にまとまるテキストは1要素にグループ化',
    '',
    '■ 画像要素 (type: "image"):',
    '- イラスト、アイコン、写真、図表、装飾グラフィック（吹き出し形状、バナー等）の矩形領域',
    '- テキストのみの領域は含めない',
    '- 各画像領域はできるだけ重複なく切り分ける',
    '- 大きなイラストも小さなアイコンもすべて検出',
    '',
    '■ backgroundColor: スライド全体の主要な背景色',
    '',
    '有効な JSON のみを返すこと。'
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
    return null;
  }

  var text = result.candidates[0].content.parts[0].text;
  var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) text = jsonMatch[1];
  text = text.trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    Logger.log('Gemini JSON parse error: ' + e.message);
    return null;
  }
}

// =====================================================
// 解析済みデータからプレゼンテーション作成
// （全ページ画像なし — テキスト・切り抜き画像・背景色のみ）
// =====================================================

function createPresentationFromAnalysis(config) {
  var title = config.title || 'NotebookLM スライド';

  var presentation = SlidesApp.create(title);
  var presentationId = presentation.getId();
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();
  var firstSlide = presentation.getSlides()[0];

  var defaultEls = firstSlide.getPageElements();
  for (var d = defaultEls.length - 1; d >= 0; d--) defaultEls[d].remove();

  for (var i = 0; i < config.pages.length; i++) {
    var slide = (i === 0) ? firstSlide
      : presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    buildSlideFromAnalysis_(slide, config.pages[i], slideWidth, slideHeight);
  }

  if (config.shareMode && config.shareMode !== 'private') {
    setupSharing_(presentationId, config.shareMode, config.emails, config.permission);
  }

  return {
    id: presentationId,
    url: 'https://docs.google.com/presentation/d/' + presentationId + '/edit',
    slideCount: config.pages.length,
    title: title
  };
}

function addSlidesFromAnalysis(config) {
  var presentation = SlidesApp.openById(config.presentationId);
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();

  for (var i = 0; i < config.pages.length; i++) {
    var slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    buildSlideFromAnalysis_(slide, config.pages[i], slideWidth, slideHeight);
  }

  return { added: config.pages.length };
}

// =====================================================
// 1枚のスライドを解析データから構築
// =====================================================

function buildSlideFromAnalysis_(slide, pageData, slideWidth, slideHeight) {
  // 1. 背景色を設定
  if (pageData.backgroundColor) {
    try {
      slide.getBackground().setSolidFill(pageData.backgroundColor);
    } catch (e) {
      Logger.log('背景色設定エラー: ' + e.message);
    }
  }

  // 2. 画像領域を挿入（イラスト・アイコン・装飾）
  var images = pageData.images || [];
  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    if (!img.data) continue;

    var x = (img.x || 0) * slideWidth;
    var y = (img.y || 0) * slideHeight;
    var w = Math.max((img.width || 0.1) * slideWidth, 10);
    var h = Math.max((img.height || 0.1) * slideHeight, 10);

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > slideWidth) w = slideWidth - x;
    if (y + h > slideHeight) h = slideHeight - y;

    try {
      var blob = Utilities.newBlob(
        Utilities.base64Decode(img.data),
        img.mimeType || 'image/png',
        'region_' + i + '.png'
      );
      var image = slide.insertImage(blob);
      image.setLeft(x);
      image.setTop(y);
      image.setWidth(w);
      image.setHeight(h);
    } catch (e) {
      Logger.log('画像領域挿入エラー: ' + e.message);
    }
  }

  // 3. テキストボックスを挿入（最前面）
  var texts = pageData.texts || [];
  for (var i = 0; i < texts.length; i++) {
    var el = texts[i];
    if (!el.content || !el.content.trim()) continue;

    var x = (el.x || 0) * slideWidth;
    var y = (el.y || 0) * slideHeight;
    var w = Math.max((el.width || 0.1) * slideWidth, 20);
    var h = Math.max((el.height || 0.05) * slideHeight, 15);
    var fontSize = Math.max(8, Math.min(72, el.fontSize || 14));

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

      if (el.fontColor) {
        try { style.setForegroundColor(el.fontColor); } catch (e) {}
      }
      if (el.bold) {
        try { style.setBold(true); } catch (e) {}
      }

      // テキストボックス背景色
      if (el.bgColor) {
        try { textBox.getFill().setSolidFill(el.bgColor); } catch (e) {
          textBox.getFill().setTransparent();
        }
      } else {
        textBox.getFill().setTransparent();
      }
      textBox.getBorder().setTransparent();

      // テキスト配置
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
// 旧方式: プレゼンテーション作成（フォールバック用）
// =====================================================

function createPresentation(config) {
  var title = config.title || 'NotebookLM スライド';

  var presentation = SlidesApp.create(title);
  var presentationId = presentation.getId();
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();
  var firstSlide = presentation.getSlides()[0];

  var defaultEls = firstSlide.getPageElements();
  for (var d = defaultEls.length - 1; d >= 0; d--) defaultEls[d].remove();

  for (var i = 0; i < config.files.length; i++) {
    var slide = (i === 0) ? firstSlide
      : presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    insertPageContent_(slide, config.files[i], slideWidth, slideHeight);
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

function addSlidesToPresentation(config) {
  var presentation = SlidesApp.openById(config.presentationId);
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();

  for (var i = 0; i < config.files.length; i++) {
    var slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    insertPageContent_(slide, config.files[i], slideWidth, slideHeight);
  }

  return { added: config.files.length };
}

function insertPageContent_(slide, fileData, slideWidth, slideHeight) {
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

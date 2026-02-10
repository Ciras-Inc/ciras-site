/**
 * NotebookLM スライド管理ツール - Google Apps Script
 *
 * AI Vision API（Groq / OpenAI / Gemini）でスライド画像を解析し、
 * テキスト・イラスト・背景を個別の編集可能な要素として Google スライドに再構築する。
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
// 汎用 Vision AI でページ画像を解析（OpenAI互換API共通）
// config: { apiKey, baseUrl, model }
// =====================================================

function analyzePageWithAI(imageBase64, mimeType, config) {
  var url = config.baseUrl + '/chat/completions';

  var prompt = [
    'このプレゼンテーションスライド画像からテキスト要素を正確に検出してください。',
    '目的: この画像をスライドの背景として使い、検出したテキストを編集可能なテキストボックスとして上に重ねます。',
    'そのため、位置・サイズの精度が非常に重要です。',
    '',
    '返すJSON形式:',
    '{"backgroundColor":"#RRGGBB","elements":[{"type":"text","content":"テキスト内容","x":0.1,"y":0.05,"width":0.8,"height":0.1,"fontSize":24,"fontColor":"#333333","bold":false,"alignment":"left","bgColor":"#FFFFFF"}]}',
    '',
    '位置指定の重要なルール:',
    '- x, y, width, height はスライド全体に対する割合（0.0〜1.0）',
    '- x: テキストの左端の位置（スライド左端=0.0, 右端=1.0）',
    '- y: テキストの上端の位置（スライド上端=0.0, 下端=1.0）',
    '- width: テキスト領域の幅（テキストの実際の幅に合わせる）',
    '- height: テキスト領域の高さ（テキストの実際の高さに合わせる。行数が多い場合は大きくなる）',
    '- テキストボックスが元のテキスト位置に正確に重なるよう、余白なく指定すること',
    '',
    'その他のルール:',
    '- type は必ず "text"',
    '- content: テキスト内容を正確に（改行は\\nで表す。原文のまま忠実に）',
    '- fontSize: ポイント単位の推定値（タイトル=24-36pt, 本文=12-18pt, 注釈=8-12pt）',
    '- fontColor: テキスト色（#RRGGBB）',
    '- bold: 太字なら true',
    '- alignment: "left", "center", "right"（見た目から判断）',
    '- bgColor: テキストの背後にある背景色（#RRGGBB）。テキストが色付きの矩形・吹き出し・ボックス内にある場合はその色を指定。',
    '  スライド全体の背景色と同じか透明/画像上の場合は null。',
    '- backgroundColor: スライド全体の主要な背景色（#RRGGBB）',
    '- すべての可視テキストを検出すること（タイトル、本文、ラベル、吹き出し内テキスト、数字、ページ番号等）',
    '- テキストが近接している場合でも、論理的に別ブロックなら個別の要素として検出すること',
    '- 画像・イラスト要素は検出不要（テキストのみ）',
    '- 有効なJSONオブジェクト（{...}で始まる）のみ返すこと。配列[]で囲まないこと。説明文やマークダウン不要。'
  ].join('\n');

  var dataUrl = 'data:' + (mimeType || 'image/jpeg') + ';base64,' + imageBase64;

  var payload = {
    model: config.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
      ]
    }],
    max_tokens: 8192,
    temperature: 0.1
  };

  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + config.apiKey,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // リトライ付き
  var response, code, body;
  for (var attempt = 0; attempt < 3; attempt++) {
    response = UrlFetchApp.fetch(url, options);
    code = response.getResponseCode();
    body = response.getContentText();

    if (code === 200) break;

    if (code === 429 && attempt < 2) {
      Logger.log('AI API 429: 10秒待機後リトライ (' + (attempt + 1) + '/2)');
      Utilities.sleep(10000);
      continue;
    }

    throw new Error('AI API エラー (HTTP ' + code + '): ' + body.substring(0, 500));
  }

  var result = JSON.parse(body);
  if (!result.choices || !result.choices[0] || !result.choices[0].message) {
    throw new Error('AI API: 有効な応答がありません。Response: ' + body.substring(0, 300));
  }

  var text = result.choices[0].message.content;

  // マークダウンコードブロックを除去
  var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) text = jsonMatch[1];
  text = text.trim();

  // JSON部分を抽出（前後の余分なテキストを除去）
  var jsonStart = text.indexOf('{');
  var jsonStartArr = text.indexOf('[');
  if (jsonStart === -1 && jsonStartArr === -1) {
    throw new Error('AI 応答にJSONが含まれていません: ' + text.substring(0, 200));
  }
  if (jsonStart === -1 || (jsonStartArr !== -1 && jsonStartArr < jsonStart)) {
    jsonStart = jsonStartArr;
  }
  text = text.substring(jsonStart);

  var analysis = JSON.parse(text);

  // 配列で返された場合は最初の要素を取得
  if (Array.isArray(analysis)) {
    analysis = analysis[0] || {};
  }

  if (!analysis.elements || !Array.isArray(analysis.elements)) {
    throw new Error('AI 応答に elements 配列がありません');
  }

  var textCount = 0, imageCount = 0;
  for (var i = 0; i < analysis.elements.length; i++) {
    if (analysis.elements[i].type === 'text') textCount++;
    else if (analysis.elements[i].type === 'image') imageCount++;
  }

  return {
    analysis: analysis,
    stats: {
      textElements: textCount,
      imageElements: imageCount,
      backgroundColor: analysis.backgroundColor || '#FFFFFF'
    }
  };
}

// =====================================================
// 1ページ分のスライドを作成（新規）
// =====================================================

function createSingleSlidePresentation(config) {
  var title = config.title || 'NotebookLM スライド';

  var presentation = SlidesApp.create(title);
  var presentationId = presentation.getId();
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();
  var firstSlide = presentation.getSlides()[0];

  // デフォルト要素を削除
  var defaultEls = firstSlide.getPageElements();
  for (var d = defaultEls.length - 1; d >= 0; d--) defaultEls[d].remove();

  // スライドを構築
  buildSlide_(firstSlide, config.pageData, slideWidth, slideHeight);

  // 共有設定
  if (config.shareMode && config.shareMode !== 'private') {
    setupSharing_(presentationId, config.shareMode, config.emails, config.permission);
  }

  return {
    id: presentationId,
    url: 'https://docs.google.com/presentation/d/' + presentationId + '/edit',
    title: title
  };
}

// =====================================================
// 既存プレゼンテーションに1ページ追加
// =====================================================

function addSingleSlide(config) {
  var presentation = SlidesApp.openById(config.presentationId);
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();

  var slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  buildSlide_(slide, config.pageData, slideWidth, slideHeight);

  return { success: true };
}

// =====================================================
// 1枚のスライドを構築
// =====================================================

function buildSlide_(slide, pageData, slideWidth, slideHeight) {
  // 1. 全ページ画像を背景として挿入（スライド全体にフィット）
  if (pageData.fullPageImage) {
    try {
      var blob = Utilities.newBlob(
        Utilities.base64Decode(pageData.fullPageImage),
        'image/jpeg',
        'page_bg.jpg'
      );
      var bgImage = slide.insertImage(blob);
      bgImage.setLeft(0);
      bgImage.setTop(0);
      bgImage.setWidth(slideWidth);
      bgImage.setHeight(slideHeight);
    } catch (e) {
      Logger.log('背景画像挿入エラー: ' + e.message);
      // フォールバック: 背景色を設定
      if (pageData.backgroundColor) {
        try { slide.getBackground().setSolidFill(pageData.backgroundColor); } catch (e2) {}
      }
    }
  }

  // 2. テキストボックスを最前面に挿入（背景画像の上にオーバーレイ）
  var texts = pageData.texts || [];
  for (var i = 0; i < texts.length; i++) {
    var el = texts[i];
    if (!el.content || !el.content.trim()) continue;

    var x = Math.max(0, (el.x || 0)) * slideWidth;
    var y = Math.max(0, (el.y || 0)) * slideHeight;
    var w = Math.max((el.width || 0.1) * slideWidth, 20);
    var h = Math.max((el.height || 0.05) * slideHeight, 15);
    var fontSize = Math.max(6, Math.min(72, el.fontSize || 14));

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

      // テキストボックスは常に透明（元画像のテキストはCanvas上で既に消去済み）
      textBox.getFill().setTransparent();
      textBox.getBorder().setTransparent();

      // 上寄せ配置（テキストが上端に揃う）
      try { textBox.setContentAlignment(SlidesApp.ContentAlignment.TOP); } catch (e) {}

      // テキストのマージンを最小化（位置精度を上げる）
      try {
        textBox.getText().getTextStyle().setFontSize(fontSize);
      } catch (e) {}

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

      // 行間を詰める（デフォルトより少し狭くして位置精度を向上）
      try {
        var paras = textRange.getParagraphs();
        for (var p = 0; p < paras.length; p++) {
          paras[p].getRange().getParagraphStyle().setSpaceAbove(0);
          paras[p].getRange().getParagraphStyle().setSpaceBelow(0);
        }
      } catch (e) {}
    } catch (e) {
      Logger.log('テキストボックス挿入エラー[' + i + ']: ' + e.message);
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

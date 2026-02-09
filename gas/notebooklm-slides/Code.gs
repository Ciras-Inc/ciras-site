/**
 * NotebookLM スライド管理ツール - Google Apps Script
 *
 * 機能:
 *   - NotebookLM の PDF をアップロードして Google スライドに変換
 *   - PDF 内の画像とテキストを分離して、それぞれ編集可能に
 *   - 画像の個別ページアップロードにも対応
 *   - テキスト検索・置換、画像差し替え、テキストボックス追加
 *   - リンク共有・メールアドレス指定での共有
 *
 * セットアップ手順:
 *   1. https://script.google.com で新規プロジェクトを作成
 *   2. Code.gs にこのファイルの内容を貼り付け
 *   3. ファイル追加（＋ボタン → HTML）で「index」を作成し index.html の内容を貼り付け
 *   4. 左メニュー「サービス」→「Drive API」を追加（v2）
 *   5. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *      - 実行ユーザー: 自分
 *      - アクセス: 全員（Google アカウント必須）
 *   6. 表示された URL にアクセスして利用開始
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
// プレゼンテーション作成
// =====================================================

/**
 * アップロードされたファイルから Google スライドを作成する。
 * PDF の場合は画像とテキストを分離し、それぞれ編集可能な要素として配置する。
 */
function createPresentation(config) {
  var title = config.title || 'NotebookLM スライド';

  // 全ファイルを処理
  var allPages = []; // 各ページの { images: [blob], texts: [{text, isHeading}] }
  var rawImageBlobs = []; // 画像ファイルはそのまま使う

  for (var i = 0; i < config.files.length; i++) {
    var file = config.files[i];
    var blob = Utilities.newBlob(
      Utilities.base64Decode(file.data),
      file.mimeType,
      file.fileName
    );

    if (file.mimeType === 'application/pdf') {
      var pdfResult = processPdf_(blob);
      allPages = allPages.concat(pdfResult);
    } else {
      rawImageBlobs.push(blob);
    }
  }

  // 画像ファイルが直接アップロードされた場合
  if (rawImageBlobs.length > 0) {
    for (var i = 0; i < rawImageBlobs.length; i++) {
      allPages.push({ images: [rawImageBlobs[i]], texts: [] });
    }
  }

  if (allPages.length === 0) {
    throw new Error(
      'スライドを作成できませんでした。\n' +
      'PDF の内容を取得できなかった場合は、各ページを画像（PNG/JPG）として\n' +
      '書き出してからアップロードしてください。'
    );
  }

  // Google スライドを作成
  var presentation = SlidesApp.create(title);
  var presentationId = presentation.getId();
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();
  var firstSlide = presentation.getSlides()[0];

  for (var i = 0; i < allPages.length; i++) {
    var page = allPages[i];
    var slide;

    if (i === 0) {
      slide = firstSlide;
      var els = slide.getPageElements();
      for (var d = els.length - 1; d >= 0; d--) els[d].remove();
    } else {
      slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    }

    layoutSlide_(slide, page, slideWidth, slideHeight);
  }

  // 共有設定
  if (config.shareMode && config.shareMode !== 'private') {
    setupSharing_(presentationId, config.shareMode, config.emails, config.permission);
  }

  return {
    id: presentationId,
    url: 'https://docs.google.com/presentation/d/' + presentationId + '/edit',
    slideCount: allPages.length,
    title: title
  };
}

// =====================================================
// PDF 処理（メイン）
// =====================================================

/**
 * PDF を解析して、ページごとの画像とテキストを返す。
 * 3段階のフォールバック:
 *   1. Google Docs 変換 → 画像 + テキスト抽出
 *   2. Drive サムネイル → ページ画像取得
 *   3. テキストのみのスライド作成
 */
function processPdf_(pdfBlob) {
  // Step 1: PDF を Drive にアップロード
  var pdfFile = DriveApp.createFile(pdfBlob);
  var fileId = pdfFile.getId();

  try {
    // Step 2: Google Docs に変換してコンテンツ抽出
    var pages = extractContentViaDocs_(pdfBlob);

    // Step 3: ページ画像が不足している場合、サムネイルで補完
    if (pages.length > 0 && pages[0].images.length === 0) {
      var thumbImages = getPageThumbnails_(fileId, pages.length);
      for (var i = 0; i < pages.length && i < thumbImages.length; i++) {
        pages[i].images.push(thumbImages[i]);
      }
    }

    // Step 4: Docs変換も完全に失敗した場合、サムネイルだけで作成
    if (pages.length === 0) {
      var thumbs = getPageThumbnails_(fileId, 50);
      if (thumbs.length > 0) {
        for (var i = 0; i < thumbs.length; i++) {
          pages.push({ images: [thumbs[i]], texts: [] });
        }
      }
    }

    return pages;

  } finally {
    pdfFile.setTrashed(true);
  }
}

// =====================================================
// Google Docs 変換によるコンテンツ抽出
// =====================================================

/**
 * PDF を Google Docs に変換し、ページごとの画像とテキストを抽出する。
 */
function extractContentViaDocs_(pdfBlob) {
  var pages = [];
  var docFileId = null;

  // 方法1: convert のみ（レイアウト保持優先）
  try {
    var docFile = Drive.Files.insert(
      { title: 'temp_pdf_' + Date.now() },
      pdfBlob,
      { convert: true }
    );
    docFileId = docFile.id;
  } catch (e) {
    Logger.log('PDF → Docs 変換失敗(convert): ' + e.message);
  }

  // 方法1が失敗した場合、方法2: OCR モード
  if (!docFileId) {
    try {
      var docFile2 = Drive.Files.insert(
        { title: 'temp_pdf_ocr_' + Date.now() },
        pdfBlob,
        { convert: true, ocr: true, ocrLanguage: 'ja' }
      );
      docFileId = docFile2.id;
    } catch (e) {
      Logger.log('PDF → Docs 変換失敗(OCR): ' + e.message);
      return pages;
    }
  }

  try {
    var doc = DocumentApp.openById(docFileId);
    var body = doc.getBody();
    pages = parseDocumentToPages_(body);
  } catch (e) {
    Logger.log('ドキュメント解析エラー: ' + e.message);
  } finally {
    try { DriveApp.getFileById(docFileId).setTrashed(true); } catch (e) {}
  }

  return pages;
}

/**
 * Google Docs の Body をページ区切り（改ページ）で分割し、
 * 各ページの画像とテキストを抽出する。
 */
function parseDocumentToPages_(body) {
  var pages = [];
  var currentPage = { images: [], texts: [] };
  var numChildren = body.getNumChildren();

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    var type = child.getType();

    // 改ページ検出 → 新しいページへ
    if (type === DocumentApp.ElementType.PAGE_BREAK) {
      if (currentPage.texts.length > 0 || currentPage.images.length > 0) {
        pages.push(currentPage);
        currentPage = { images: [], texts: [] };
      }
      continue;
    }

    // 段落の処理
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      var para = child.asParagraph();

      // 段落内の改ページを確認
      if (paragraphContainsPageBreak_(para)) {
        if (currentPage.texts.length > 0 || currentPage.images.length > 0) {
          pages.push(currentPage);
          currentPage = { images: [], texts: [] };
        }
      }

      // 配置済み画像（PositionedImage）を取得
      try {
        var posImages = para.getPositionedImages();
        for (var p = 0; p < posImages.length; p++) {
          currentPage.images.push(posImages[p].getBlob());
        }
      } catch (e) { /* PositionedImage が使えない場合は無視 */ }

      // インライン画像を取得
      for (var c = 0; c < para.getNumChildren(); c++) {
        var pChild = para.getChild(c);
        if (pChild.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
          currentPage.images.push(pChild.asInlineImage().getBlob());
        }
      }

      // テキストを取得
      var text = para.getText().trim();
      if (text.length > 0) {
        var heading = para.getHeading();
        currentPage.texts.push({
          text: text,
          isHeading: heading !== DocumentApp.ParagraphHeading.NORMAL
        });
      }
      continue;
    }

    // リストアイテム
    if (type === DocumentApp.ElementType.LIST_ITEM) {
      var listItem = child.asListItem();
      // リストアイテム内のインライン画像
      for (var c = 0; c < listItem.getNumChildren(); c++) {
        if (listItem.getChild(c).getType() === DocumentApp.ElementType.INLINE_IMAGE) {
          currentPage.images.push(listItem.getChild(c).asInlineImage().getBlob());
        }
      }
      var listText = listItem.getText().trim();
      if (listText.length > 0) {
        currentPage.texts.push({ text: '• ' + listText, isHeading: false });
      }
      continue;
    }

    // テーブル内の画像とテキスト
    if (type === DocumentApp.ElementType.TABLE) {
      extractFromTable_(child.asTable(), currentPage);
      continue;
    }
  }

  // 最後のページを追加
  if (currentPage.texts.length > 0 || currentPage.images.length > 0) {
    pages.push(currentPage);
  }

  // ページが1つだけで大量のテキストがある場合、改ページがないPDFかもしれない
  // → テキスト量で分割
  if (pages.length === 1 && pages[0].texts.length > 10) {
    pages = splitLargePageByTextCount_(pages[0], 6);
  }

  return pages;
}

/**
 * 段落内に改ページが含まれているかチェック
 */
function paragraphContainsPageBreak_(para) {
  for (var i = 0; i < para.getNumChildren(); i++) {
    if (para.getChild(i).getType() === DocumentApp.ElementType.PAGE_BREAK) {
      return true;
    }
  }
  return false;
}

/**
 * テーブルから画像とテキストを抽出
 */
function extractFromTable_(table, page) {
  for (var r = 0; r < table.getNumRows(); r++) {
    var row = table.getRow(r);
    for (var c = 0; c < row.getNumCells(); c++) {
      var cell = row.getCell(c);
      for (var i = 0; i < cell.getNumChildren(); i++) {
        var child = cell.getChild(i);
        if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
          var para = child.asParagraph();
          for (var j = 0; j < para.getNumChildren(); j++) {
            if (para.getChild(j).getType() === DocumentApp.ElementType.INLINE_IMAGE) {
              page.images.push(para.getChild(j).asInlineImage().getBlob());
            }
          }
          var text = para.getText().trim();
          if (text.length > 0) {
            page.texts.push({ text: text, isHeading: false });
          }
        }
      }
    }
  }
}

/**
 * テキストが多すぎる1ページを複数スライドに分割
 */
function splitLargePageByTextCount_(page, textsPerSlide) {
  var pages = [];
  var images = page.images;
  for (var i = 0; i < page.texts.length; i += textsPerSlide) {
    var newPage = {
      images: (i === 0) ? images : [],
      texts: page.texts.slice(i, i + textsPerSlide)
    };
    pages.push(newPage);
  }
  return pages;
}

// =====================================================
// Drive サムネイルによるページ画像取得
// =====================================================

/**
 * Google Drive のサムネイル API でPDFの各ページを画像として取得する。
 */
function getPageThumbnails_(fileId, maxPages) {
  var images = [];
  var token = ScriptApp.getOAuthToken();

  // まず1ページ目のサムネイルを取得（これは確実に動く）
  try {
    var meta = Drive.Files.get(fileId, { fields: 'thumbnailLink' });
    if (meta.thumbnailLink) {
      var thumbUrl = meta.thumbnailLink.replace(/=s\d+/, '=s1600');
      var response = UrlFetchApp.fetch(thumbUrl, {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        images.push(response.getBlob().setName('page_1.png'));
      }
    }
  } catch (e) {
    Logger.log('サムネイル取得エラー: ' + e.message);
  }

  // 追加ページのサムネイルを試行（page パラメータ）
  for (var page = 2; page <= maxPages; page++) {
    try {
      var pageUrl = 'https://lh3.googleusercontent.com/drive-viewer/pdf?id='
        + fileId + '&page=' + (page - 1) + '&w=1600';
      var resp = UrlFetchApp.fetch(pageUrl, {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) break;
      var blob = resp.getBlob();
      if (blob.getBytes().length < 1000) break; // 空レスポンスなら終了
      images.push(blob.setName('page_' + page + '.png'));
    } catch (e) {
      break;
    }
  }

  return images;
}

// =====================================================
// スライドレイアウト
// =====================================================

/**
 * 1枚のスライドに画像とテキストを配置する。
 * - 画像あり＋テキストあり → 左に画像、右にテキスト
 * - 画像のみ → 全面に画像
 * - テキストのみ → タイトル + 本文のレイアウト
 */
function layoutSlide_(slide, page, slideWidth, slideHeight) {
  var hasImages = page.images.length > 0;
  var hasTexts = page.texts.length > 0;

  if (hasImages && hasTexts) {
    // 画像 + テキスト: 左半分に画像、右半分にテキスト
    layoutImageAndText_(slide, page, slideWidth, slideHeight);
  } else if (hasImages) {
    // 画像のみ: スライド全体に配置
    layoutImageOnly_(slide, page.images, slideWidth, slideHeight);
  } else if (hasTexts) {
    // テキストのみ: タイトル + 本文
    layoutTextOnly_(slide, page.texts, slideWidth, slideHeight);
  }
}

function layoutImageAndText_(slide, page, w, h) {
  var margin = 20;
  var imageAreaWidth = w * 0.48;
  var textAreaLeft = w * 0.52;
  var textAreaWidth = w * 0.44;

  // 画像を左半分に配置
  for (var i = 0; i < page.images.length; i++) {
    try {
      var img = slide.insertImage(page.images[i]);
      var ratio = img.getHeight() / img.getWidth();
      var targetW = imageAreaWidth - margin;
      var targetH = targetW * ratio;

      // 高さがスライドを超える場合は縮小
      if (targetH > h - margin * 2) {
        targetH = h - margin * 2;
        targetW = targetH / ratio;
      }

      img.setLeft(margin);
      img.setTop(margin + i * (targetH + 10));
      img.setWidth(targetW);
      img.setHeight(targetH);
    } catch (e) {
      Logger.log('画像挿入エラー: ' + e.message);
    }
  }

  // テキストを右半分に配置
  var yOffset = margin;
  for (var i = 0; i < page.texts.length; i++) {
    var t = page.texts[i];
    var fontSize = t.isHeading ? 20 : 13;
    var lineHeight = fontSize * 1.6;
    var estimatedLines = Math.max(1, Math.ceil(t.text.length * fontSize * 0.55 / textAreaWidth));
    var boxHeight = estimatedLines * lineHeight + 8;

    if (yOffset + boxHeight > h - margin) break; // スライドからはみ出す場合は中断

    var textBox = slide.insertTextBox(t.text, textAreaLeft, yOffset, textAreaWidth, boxHeight);
    var style = textBox.getText().getTextStyle();
    style.setFontSize(fontSize);
    style.setFontFamily('Noto Sans JP');
    if (t.isHeading) style.setBold(true);
    yOffset += boxHeight + 4;
  }
}

function layoutImageOnly_(slide, images, w, h) {
  for (var i = 0; i < images.length; i++) {
    try {
      var img = slide.insertImage(images[i]);
      img.setLeft(0);
      img.setTop(0);
      img.setWidth(w);
      img.setHeight(h);
    } catch (e) {
      Logger.log('画像挿入エラー: ' + e.message);
    }
  }
}

function layoutTextOnly_(slide, texts, w, h) {
  var margin = 40;
  var yOffset = margin;
  var contentWidth = w - margin * 2;

  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    var fontSize, lineHeight;

    if (i === 0 && t.isHeading) {
      // 最初の見出しはタイトルとして大きく表示
      fontSize = 28;
      lineHeight = fontSize * 1.5;
    } else if (t.isHeading) {
      fontSize = 20;
      lineHeight = fontSize * 1.5;
    } else {
      fontSize = 14;
      lineHeight = fontSize * 1.6;
    }

    var estimatedLines = Math.max(1, Math.ceil(t.text.length * fontSize * 0.55 / contentWidth));
    var boxHeight = estimatedLines * lineHeight + 10;

    if (yOffset + boxHeight > h - margin) break;

    var textBox = slide.insertTextBox(t.text, margin, yOffset, contentWidth, boxHeight);
    var style = textBox.getText().getTextStyle();
    style.setFontSize(fontSize);
    style.setFontFamily('Noto Sans JP');
    if (t.isHeading) style.setBold(true);
    yOffset += boxHeight + 8;
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

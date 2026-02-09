/**
 * NotebookLM スライド管理ツール - Google Apps Script
 *
 * PDF のページ画像変換はブラウザ側（PDF.js）で行い、
 * サーバー側は画像の挿入・編集・共有のみを担当する。
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
 * ※ Drive API のサービス追加は不要になりました（v3）
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
// プレゼンテーション作成（最初のバッチ）
// =====================================================

function createPresentation(config) {
  var title = config.title || 'NotebookLM スライド';

  var presentation = SlidesApp.create(title);
  var presentationId = presentation.getId();
  var slideWidth = presentation.getPageWidth();
  var slideHeight = presentation.getPageHeight();
  var firstSlide = presentation.getSlides()[0];

  // デフォルトのプレースホルダーを削除
  var defaultEls = firstSlide.getPageElements();
  for (var d = defaultEls.length - 1; d >= 0; d--) defaultEls[d].remove();

  // 画像をスライドに挿入
  for (var i = 0; i < config.files.length; i++) {
    var file = config.files[i];
    var blob = Utilities.newBlob(
      Utilities.base64Decode(file.data),
      file.mimeType,
      file.fileName
    );

    var slide;
    if (i === 0) {
      slide = firstSlide;
    } else {
      slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    }

    var image = slide.insertImage(blob);
    image.setLeft(0);
    image.setTop(0);
    image.setWidth(slideWidth);
    image.setHeight(slideHeight);
  }

  // 共有設定
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

  for (var i = 0; i < config.files.length; i++) {
    var file = config.files[i];
    var blob = Utilities.newBlob(
      Utilities.base64Decode(file.data),
      file.mimeType,
      file.fileName
    );

    var slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    var image = slide.insertImage(blob);
    image.setLeft(0);
    image.setTop(0);
    image.setWidth(slideWidth);
    image.setHeight(slideHeight);
  }

  return { added: config.files.length };
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

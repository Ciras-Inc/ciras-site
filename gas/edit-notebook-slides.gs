/**
 * NotebookLM スライド編集 Google Apps Script
 *
 * NotebookLMで生成したGoogleスライドの画像とテキストを個別に編集するためのスクリプト。
 *
 * 使い方:
 *   1. Google Slides を開く → 拡張機能 → Apps Script
 *   2. このファイルの内容を貼り付けて保存
 *   3. 上部メニューに「NotebookLMスライド編集」メニューが追加される
 *   4. メニューから各機能を実行
 *
 * 主な機能:
 *   - スライド構成一覧の表示（テキスト・画像の位置とサイズ）
 *   - テキストの一括検索・置換
 *   - 画像の一括差し替え（Google DriveフォルダまたはURL指定）
 *   - 全画像のサイズ・位置の統一
 */

// ============================================================
// メニュー登録
// ============================================================

function onOpen() {
  SlidesApp.getUi()
    .createMenu('NotebookLMスライド編集')
    .addItem('スライド構成を一覧表示', 'showSlideStructure')
    .addSeparator()
    .addItem('テキストを検索・置換', 'promptReplaceText')
    .addItem('全スライドのテキスト一覧をログ出力', 'logAllTexts')
    .addSeparator()
    .addItem('画像をDriveフォルダから一括差し替え', 'promptReplaceImagesFromDrive')
    .addItem('全画像のサイズを統一', 'promptUnifyImageSize')
    .addItem('全画像の一覧をログ出力', 'logAllImages')
    .addToUi();
}

// ============================================================
// スライド構成の一覧表示
// ============================================================

/**
 * 各スライドの要素（テキスト、画像、図形など）を一覧表示する。
 * 編集対象を特定するのに便利。
 */
function showSlideStructure() {
  var presentation = SlidesApp.getActivePresentation();
  var slides = presentation.getSlides();
  var lines = [];

  for (var i = 0; i < slides.length; i++) {
    lines.push('--- スライド ' + (i + 1) + ' ---');
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];
      var type = el.getPageElementType();
      var pos = el.getLeft().toFixed(0) + ', ' + el.getTop().toFixed(0);
      var size = el.getWidth().toFixed(0) + ' x ' + el.getHeight().toFixed(0);
      var info = '  [' + (j + 1) + '] ' + type + '  位置(' + pos + ')  サイズ(' + size + ')';

      if (type === SlidesApp.PageElementType.SHAPE) {
        var text = el.asShape().getText().asString().substring(0, 60);
        if (text.length > 0) {
          info += '  テキスト: "' + text.replace(/\n/g, '\\n') + '..."';
        }
      } else if (type === SlidesApp.PageElementType.IMAGE) {
        info += '  [画像]';
      }
      lines.push(info);
    }
  }

  var ui = SlidesApp.getUi();
  // ダイアログが長すぎる場合はログにも出力
  Logger.log(lines.join('\n'));
  ui.alert('スライド構成一覧（詳細はログを確認）', lines.join('\n'), ui.ButtonSet.OK);
}

// ============================================================
// テキスト編集
// ============================================================

/**
 * ダイアログで検索語と置換語を入力し、全スライドのテキストを一括置換する。
 */
function promptReplaceText() {
  var ui = SlidesApp.getUi();

  var searchResponse = ui.prompt('テキスト置換', '検索するテキストを入力してください:', ui.ButtonSet.OK_CANCEL);
  if (searchResponse.getSelectedButton() !== ui.Button.OK) return;
  var searchText = searchResponse.getResponseText();

  var replaceResponse = ui.prompt('テキスト置換', '置換後のテキストを入力してください:', ui.ButtonSet.OK_CANCEL);
  if (replaceResponse.getSelectedButton() !== ui.Button.OK) return;
  var replaceText = replaceResponse.getResponseText();

  var count = replaceAllText(searchText, replaceText);
  ui.alert('完了', count + ' 箇所を置換しました。', ui.ButtonSet.OK);
}

/**
 * プレゼンテーション全体でテキストを検索・置換する。
 * @param {string} searchText - 検索文字列
 * @param {string} replaceText - 置換文字列
 * @return {number} 置換した箇所数
 */
function replaceAllText(searchText, replaceText) {
  var presentation = SlidesApp.getActivePresentation();
  var slides = presentation.getSlides();
  var count = 0;

  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];
      if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        var textRange = el.asShape().getText();
        var original = textRange.asString();
        if (original.indexOf(searchText) !== -1) {
          // replaceAllTextメソッドを使用
          textRange.replaceAllText(searchText, replaceText);
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * 全スライドのテキスト内容をログに出力する。
 */
function logAllTexts() {
  var presentation = SlidesApp.getActivePresentation();
  var slides = presentation.getSlides();

  for (var i = 0; i < slides.length; i++) {
    Logger.log('=== スライド ' + (i + 1) + ' ===');
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];
      if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        var text = el.asShape().getText().asString();
        if (text.trim().length > 0) {
          Logger.log('  テキストボックス[' + (j + 1) + ']: ' + text);
        }
      }
    }
  }

  SlidesApp.getUi().alert('ログ出力完了', 'Apps Script エディタの「実行ログ」を確認してください。', SlidesApp.getUi().ButtonSet.OK);
}

// ============================================================
// 画像編集
// ============================================================

/**
 * Google Driveフォルダ内の画像でスライドの画像を一括差し替えする。
 *
 * フォルダ内の画像ファイル名は以下の命名規則に従う:
 *   slide01.png, slide02.png, slide03.png, ...
 * 各スライドの最初の画像要素が対応する画像で差し替えられる。
 */
function promptReplaceImagesFromDrive() {
  var ui = SlidesApp.getUi();
  var response = ui.prompt(
    '画像一括差し替え',
    'Google DriveフォルダのIDを入力してください:\n' +
    '（フォルダURLの末尾のID部分。例: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ）\n\n' +
    'フォルダ内の画像ファイル名は slide01.png, slide02.png, ... としてください。',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var folderId = response.getResponseText().trim();
  var result = replaceImagesFromDriveFolder(folderId);
  ui.alert('完了', result, ui.ButtonSet.OK);
}

/**
 * Google Driveフォルダの画像で各スライドの画像を差し替える。
 * @param {string} folderId - Google DriveフォルダID
 * @return {string} 結果メッセージ
 */
function replaceImagesFromDriveFolder(folderId) {
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return 'エラー: フォルダが見つかりません。IDを確認してください。';
  }

  var presentation = SlidesApp.getActivePresentation();
  var slides = presentation.getSlides();
  var replacedCount = 0;

  for (var i = 0; i < slides.length; i++) {
    var slideNum = String(i + 1);
    if (slideNum.length === 1) slideNum = '0' + slideNum;
    var fileName = 'slide' + slideNum;

    // png, jpg, jpeg, webp の順に探す
    var extensions = ['png', 'jpg', 'jpeg', 'webp'];
    var imageFile = null;

    for (var e = 0; e < extensions.length; e++) {
      var files = folder.getFilesByName(fileName + '.' + extensions[e]);
      if (files.hasNext()) {
        imageFile = files.next();
        break;
      }
    }

    if (!imageFile) continue;

    // 該当スライドの最初の画像要素を差し替え
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      if (elements[j].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
        var oldImage = elements[j].asImage();
        var position = {
          left: oldImage.getLeft(),
          top: oldImage.getTop(),
          width: oldImage.getWidth(),
          height: oldImage.getHeight()
        };

        // 古い画像を削除して新しい画像を挿入
        oldImage.remove();
        var newImage = slides[i].insertImage(imageFile.getBlob());
        newImage.setLeft(position.left);
        newImage.setTop(position.top);
        newImage.setWidth(position.width);
        newImage.setHeight(position.height);

        replacedCount++;
        break; // 各スライドの最初の画像のみ差し替え
      }
    }
  }

  return replacedCount + ' 枚の画像を差し替えました（全 ' + slides.length + ' スライド中）。';
}

/**
 * URL指定で特定スライドの画像を差し替える。
 * スクリプトから直接呼び出して使用する。
 *
 * @param {number} slideIndex - スライド番号（1始まり）
 * @param {number} imageIndex - 画像要素の番号（1始まり、スライド内の画像の順番）
 * @param {string} imageUrl - 差し替え画像のURL
 */
function replaceImageByUrl(slideIndex, imageIndex, imageUrl) {
  var presentation = SlidesApp.getActivePresentation();
  var slide = presentation.getSlides()[slideIndex - 1];
  var elements = slide.getPageElements();
  var imageCount = 0;

  for (var j = 0; j < elements.length; j++) {
    if (elements[j].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
      imageCount++;
      if (imageCount === imageIndex) {
        var oldImage = elements[j].asImage();
        var position = {
          left: oldImage.getLeft(),
          top: oldImage.getTop(),
          width: oldImage.getWidth(),
          height: oldImage.getHeight()
        };

        oldImage.remove();
        var newImage = slide.insertImage(imageUrl);
        newImage.setLeft(position.left);
        newImage.setTop(position.top);
        newImage.setWidth(position.width);
        newImage.setHeight(position.height);

        Logger.log('スライド ' + slideIndex + ' の画像 ' + imageIndex + ' を差し替えました。');
        return;
      }
    }
  }
  Logger.log('指定された画像が見つかりませんでした。');
}

/**
 * 全スライドの画像サイズと位置を統一する。
 */
function promptUnifyImageSize() {
  var ui = SlidesApp.getUi();
  var response = ui.prompt(
    '画像サイズ統一',
    '以下の形式で指定してください（単位: ポイント）:\n' +
    '左位置, 上位置, 幅, 高さ\n\n' +
    '例: 100, 80, 500, 300\n' +
    '（空欄の場合、1枚目の画像のサイズを基準にします）',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var input = response.getResponseText().trim();
  var left, top, width, height;

  if (input.length > 0) {
    var parts = input.split(',').map(function(s) { return parseFloat(s.trim()); });
    if (parts.length !== 4 || parts.some(isNaN)) {
      ui.alert('エラー', '入力形式が正しくありません。「左, 上, 幅, 高さ」の形式で入力してください。', ui.ButtonSet.OK);
      return;
    }
    left = parts[0];
    top = parts[1];
    width = parts[2];
    height = parts[3];
  } else {
    // 最初に見つかった画像のサイズを基準にする
    var ref = findFirstImage();
    if (!ref) {
      ui.alert('エラー', 'スライド内に画像が見つかりませんでした。', ui.ButtonSet.OK);
      return;
    }
    left = ref.getLeft();
    top = ref.getTop();
    width = ref.getWidth();
    height = ref.getHeight();
  }

  var count = unifyAllImageSizes(left, top, width, height);
  ui.alert('完了', count + ' 枚の画像のサイズ・位置を統一しました。', ui.ButtonSet.OK);
}

/**
 * プレゼンテーション内の最初の画像を返す。
 * @return {Image|null}
 */
function findFirstImage() {
  var slides = SlidesApp.getActivePresentation().getSlides();
  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      if (elements[j].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
        return elements[j].asImage();
      }
    }
  }
  return null;
}

/**
 * 全スライドの全画像のサイズと位置を統一する。
 * @param {number} left - 左位置（ポイント）
 * @param {number} top - 上位置（ポイント）
 * @param {number} width - 幅（ポイント）
 * @param {number} height - 高さ（ポイント）
 * @return {number} 変更した画像数
 */
function unifyAllImageSizes(left, top, width, height) {
  var slides = SlidesApp.getActivePresentation().getSlides();
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

/**
 * 全画像の情報をログに出力する。
 */
function logAllImages() {
  var slides = SlidesApp.getActivePresentation().getSlides();

  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    var imageNum = 0;
    for (var j = 0; j < elements.length; j++) {
      if (elements[j].getPageElementType() === SlidesApp.PageElementType.IMAGE) {
        imageNum++;
        var img = elements[j].asImage();
        Logger.log(
          'スライド ' + (i + 1) + ' 画像[' + imageNum + ']' +
          '  位置(' + img.getLeft().toFixed(0) + ', ' + img.getTop().toFixed(0) + ')' +
          '  サイズ(' + img.getWidth().toFixed(0) + ' x ' + img.getHeight().toFixed(0) + ')' +
          '  ContentUrl: ' + (img.getContentUrl() || 'N/A')
        );
      }
    }
  }

  SlidesApp.getUi().alert('ログ出力完了', 'Apps Script エディタの「実行ログ」を確認してください。', SlidesApp.getUi().ButtonSet.OK);
}

'use strict';

// ブログ記事 → お問い合わせ導線クリックの GA4 計測（GTM 経由）
// dataLayer に { event: 'blog_to_contact', from_slug, from_category } を push する
(function () {
  function extractSlug(pathname) {
    // 想定パターン:
    //   /blog/<slug>
    //   /blog/<slug>.html
    //   /blog/<slug>/
    var m = pathname.match(/^\/blog\/([^\/]+?)(?:\.html)?\/?$/);
    if (!m) return null;
    var slug = m[1];
    // index ページ自身は対象外
    if (slug === 'index') return null;
    return slug;
  }

  var slug = extractSlug(window.location.pathname);
  if (!slug) return;

  var category = 'unknown';

  function attachListeners() {
    window.dataLayer = window.dataLayer || [];
    var links = document.querySelectorAll(
      'a[href="/contact"], a[href="/contact/"], a[href^="/contact?"],' +
      'a[href="https://www.ciras.jp/contact"], a[href="https://www.ciras.jp/contact/"], a[href^="https://www.ciras.jp/contact?"]'
    );
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        window.dataLayer.push({
          event: 'blog_to_contact',
          from_slug: slug,
          from_category: category
        });
      });
    });
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  fetch('/blog/index.json', { cache: 'no-store' })
    .then(function (r) {
      return r && r.ok ? r.json() : null;
    })
    .then(function (data) {
      if (data && Array.isArray(data.articles)) {
        var hit = data.articles.find(function (a) {
          return a && a.slug === slug;
        });
        if (hit && hit.category) category = hit.category;
      }
    })
    .catch(function () {})
    .finally(function () {
      ready(attachListeners);
    });
})();

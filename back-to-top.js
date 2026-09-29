(function () {
  'use strict';

  if (document.getElementById('back-to-top')) return;

  var button = document.createElement('button');
  button.type = 'button';
  button.id = 'back-to-top';
  button.className = 'site-back-to-top';
  button.setAttribute('aria-label', 'Back to top');
  button.textContent = '↑ Back to top';

  var style = document.createElement('style');
  style.textContent =
    '.site-back-to-top{position:fixed;right:24px;bottom:24px;z-index:120;border:0;border-radius:999px;background:#4C9BB0;color:#fff;padding:11px 16px;font:700 13px "DM Sans",sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18);opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .2s,transform .2s,visibility .2s}' +
    '.site-back-to-top.visible{opacity:1;visibility:visible;transform:translateY(0)}' +
    '.site-back-to-top:hover{background:#3a7d8f}' +
    '.site-back-to-top:focus-visible{outline:3px solid #d6eef4;outline-offset:3px}' +
    '@media(max-width:768px){.site-back-to-top{right:16px;bottom:16px;padding:10px 14px}}' +
    '@media(prefers-reduced-motion:reduce){.site-back-to-top{transition:none}}';

  document.head.appendChild(style);
  document.body.appendChild(button);

  function updateVisibility() {
    button.classList.toggle('visible', window.scrollY > 600);
  }

  function updateBottomOffset() {
    var banner = document.getElementById('cookie-banner');
    var bannerVisible = banner && getComputedStyle(banner).display !== 'none';
    var baseBottom = window.matchMedia('(max-width: 768px)').matches ? 16 : 24;
    button.style.bottom = (baseBottom + (bannerVisible ? banner.getBoundingClientRect().height + 12 : 0)) + 'px';
  }

  window.addEventListener('scroll', updateVisibility, { passive: true });
  window.addEventListener('resize', updateBottomOffset, { passive: true });
  updateVisibility();
  updateBottomOffset();

  var cookieBanner = document.getElementById('cookie-banner');
  if (cookieBanner && window.MutationObserver) {
    new MutationObserver(updateBottomOffset).observe(cookieBanner, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }

  button.addEventListener('click', function () {
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      var previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
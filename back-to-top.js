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
    '@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}.site-back-to-top{transition:none}}';

  document.head.appendChild(style);
  document.body.appendChild(button);

  function updateVisibility() {
    button.classList.toggle('visible', window.scrollY > 600);
  }

  // Keep the control clear of any visible fixed cookie banner.
  var cookieBanner = document.getElementById('cookie-banner');
  function updateBottomOffset() {
    if (!cookieBanner) return;
    var visible = getComputedStyle(cookieBanner).display !== 'none';
    button.style.bottom = visible ? (cookieBanner.getBoundingClientRect().height + 16) + 'px' : '';
  }

  window.addEventListener('scroll', updateVisibility, { passive: true });
  window.addEventListener('resize', updateBottomOffset, { passive: true });
  if (cookieBanner) {
    new MutationObserver(updateBottomOffset).observe(cookieBanner, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  updateVisibility();
  updateBottomOffset();

  button.addEventListener('click', function () {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });
})();
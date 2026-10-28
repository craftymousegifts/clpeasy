/* CLP-016: GA4 opt-in loader. Draft: release only after consent and QA approval. */
(function (window, document) {
  'use strict';
  var MEASUREMENT_ID = 'G-BRNTQTTB5P';
  var CONSENT_KEY = 'clpeasy-ga4-consent';
  var loaded = false;

  function isAllowed() {
    try { return window.localStorage.getItem(CONSENT_KEY) === 'granted'; }
    catch (_) { return false; }
  }
  function start() {
    if (loaded || !isAllowed()) return false;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, { send_page_view: true });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);
    return true;
  }
  function clearAnalyticsCookies() {
    // First-party GA cookies may remain after the tag stops. Clear accessible
    // cookies on the current hostname and parent domain where applicable.
    var names = document.cookie.split(';').map(function (part) { return part.trim().split('=')[0]; });
    var host = window.location.hostname;
    var domains = ['', host, '.' + host];
    var bits = host.split('.');
    if (bits.length > 2) domains.push('.' + bits.slice(-2).join('.'));
    names.forEach(function (name) {
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) return;
      domains.forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax' + (domain ? '; Domain=' + domain : '');
      });
    });
  }
  function setConsent(allowed) {
    try { window.localStorage.setItem(CONSENT_KEY, allowed ? 'granted' : 'denied'); }
    catch (_) { return false; }
    if (allowed) return start();
    clearAnalyticsCookies();
    // GA4 may already be loaded. Reload to stop future events.
    if (loaded) window.location.reload();
    return true;
  }
  window.CLPeasyGA4 = { start: start, setConsent: setConsent, isAllowed: isAllowed };
  start();
})(window, document);

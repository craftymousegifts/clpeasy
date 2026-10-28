/* CLP-016: GA4 opt-in loader. Staged only; do not include on pages until consent UI, legal copy and QA are approved. */
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
  function setConsent(allowed) {
    try { window.localStorage.setItem(CONSENT_KEY, allowed ? 'granted' : 'denied'); }
    catch (_) { return false; }
    if (allowed) return start();
    // GA4 may already be loaded. A full reload is needed to stop further events.
    if (loaded) window.location.reload();
    return true;
  }
  window.CLPeasyGA4 = { start: start, setConsent: setConsent, isAllowed: isAllowed };
  start();
})(window, document);

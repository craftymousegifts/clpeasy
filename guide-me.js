// Guide Me — CLPeasy's built-in guide (Builder) and Knowledge Base search.
// Runs entirely in the browser: answers come from guide-me-content.js
// (CLPeasy's own reviewed pages) and nothing is sent anywhere, so there is
// no per-question cost. It only explains how to use CLPeasy: it never
// suggests classifications, signal words, hazard or precautionary
// statements, and auto-fill is limited to label layout and product fields.
(function (root) {
  'use strict';

  var content = (typeof module !== 'undefined' && module.exports) ? require('./guide-me-content.js') : root.CLPEASY_GUIDE_CONTENT;
  var CARDS = (content && content.cards) || [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function plain(html) { return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' '); }

  // ── Search ────────────────────────────────────────────────────
  var STOP = ('a an and are as at be but by can could do does for from had has have how i if in into is it its me my of on or our should so ' +
    'that the their them then there these this to was we what when where which who why will with would you your am im ive id ' +
    'get got any some about just please want need make like also too very much many more most one ones use using used').split(' ');
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  // Everyday wording → words the guides use. Applied to the question only.
  var PHRASES = [
    [/\b(warning|danger)\s+word\b/g, 'signal word'],
    [/\bsafety\s+data\s+sheets?\b|\bsafety\s+sheets?\b|\bmsds\b/g, 'sds'],
    [/\b(cutting|cut)\s+machines?\b|\bsilhouette\b|\bcameo\b|\bscan\s?n\s?cut\b/g, 'cricut cutting machine'],
    [/\b(one|a single|just one)\s+label\b/g, 'single label'],
    [/\bprint(ing)?\s+(shop|company|companies|firm|service)\b|\bprinters?\s+(company|shop)\b|\bprofessional(ly)?\s+print/g, 'print company'],
    [/\bstickers?\b/g, 'labels'],
    [/\ballerg(en|ens|y|ies|ic)\b/g, 'euh208 sensitiser allergic'],
    [/\b(pay\s+as\s+you\s+go|payg)\b/g, 'pay as you go'],
    [/\b(price|prices|pricing|cost|costs|subscription|subscribe|plans?)\b/g, 'pay as you go unlimited trial'],
    [/\b(iphone|ipad|android|mobile|tablet)\b/g, 'phone'],
    [/\b(too\s+(big|large|small)|wrong\s+size|shrunk|shrinks|scaled?)\b/g, 'too large too small actual size'],
    [/\bavery\b/g, 'a4 sheet'],
    [/\b(symbols?|diamonds?)\b/g, 'pictogram'],
    [/\bh[\s-]?(codes?|statements?|phrases?)\b/g, 'hazard statements'],
    [/\bp[\s-]?(codes?|statements?|phrases?)\b/g, 'precautionary statements'],
    [/\bmelts?\b/g, 'wax melt'],
    [/\b(saved?|library|my labels)\b/g, 'save reuse library'],
    [/\b(greyed|grayed|disabled|locked|blocked|won'?t\s+download|can'?t\s+download|cannot\s+download)\b/g, 'download blocked'],
    [/\bmix(ing|ed)?\b|\bblend(ing|ed|s)?\b|\bcombin(e|ing|ed)\b/g, 'combine blend fragrance oils'],
    [/\bfree\s+trial\b/g, 'trial'],
    [/\bcut\s+(out|by\s+hand)\b|\bscissors\b/g, 'cut hand'],
    [/\bdashed\s+line\b|\bcut\s+(line|guide)\b|\boutline\b|^(?!.*\b(pictogram|diamond|red)).*\bborder\b/g, 'dashed cut border'],
    [/\bcosmetics?\b|\bsoaps?\b|\bbath\s+bombs?\b/g, 'bath bombs soaps cosmetic']
  ];

  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function tokens(s) {
    return String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter(function (w) { return w && !STOPSET[w]; }).map(stem);
  }
  function expand(q) {
    var s = String(q || '').toLowerCase().replace(/[’‘]/g, "'");
    var extra = [];
    PHRASES.forEach(function (p) { if (p[0].test(s)) extra.push(p[1]); p[0].lastIndex = 0; });
    return s + ' ' + extra.join(' ');
  }

  var INDEX = null;
  function buildIndex() {
    var df = {};
    INDEX = CARDS.map(function (c) {
      var t = tokens(c.title), k = tokens(c.keywords), b = tokens(plain(c.html));
      var all = {};
      t.concat(k, b).forEach(function (w) { all[w] = 1; });
      Object.keys(all).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
      return { card: c, title: setOf(t), kw: setOf(k), body: countOf(b), titleNorm: norm(c.title) };
    });
    var n = CARDS.length;
    INDEX.idf = function (w) { return Math.log(1 + n / (df[w] || 0.5)); };
  }
  function setOf(a) { var o = {}; a.forEach(function (w) { o[w] = 1; }); return o; }
  function countOf(a) { var o = {}; a.forEach(function (w) { o[w] = (o[w] || 0) + 1; }); return o; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[’‘']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

  // Returns [{card, score}] best first. A card is only returned when the
  // question shares meaningful words with it.
  function search(query, opts) {
    opts = opts || {};
    if (!INDEX) buildIndex();
    var q = tokens(expand(query));
    var uniq = Object.keys(setOf(q));
    if (!uniq.length) return [];
    var qn = norm(query);
    var out = [];
    INDEX.forEach(function (e) {
      if (opts.exclude && opts.exclude.indexOf(e.card.id) >= 0) return;
      var score = 0, hits = 0;
      uniq.forEach(function (w) {
        var idf = INDEX.idf(w), s = 0;
        if (e.title[w]) s += 3;
        if (e.kw[w]) s += 2.5;
        if (e.body[w]) s += Math.min(e.body[w], 3) * 0.6;
        if (s) { hits++; score += s * idf; }
      });
      if (!hits) return;
      // A question asked in the card's own words (e.g. a suggested topic).
      if (qn && (e.titleNorm === qn || (qn.length > 12 && e.titleNorm.indexOf(qn) >= 0))) score += 40;
      score *= (0.5 + 0.5 * hits / uniq.length);
      out.push({ card: e.card, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var min = opts.minScore == null ? 6 : opts.minScore;
    out = out.filter(function (r) { return r.score >= min; });
    return out.slice(0, opts.limit || 3);
  }
  function card(id) { for (var i = 0; i < CARDS.length; i++) if (CARDS[i].id === id) return CARDS[i]; return null; }

  // Questions that ask CLPeasy to decide hazard information are answered
  // with a fixed explanation, never with a suggestion.
  function guard(text) {
    var s = String(text || '').toLowerCase();
    var asks = /\b(what|which|should|do i|does|tell me|suggest|recommend|choose|pick|decide|work out|figure out|need)\b/.test(s);
    if (asks && /\bsignal\s*word\b|\b(warning|danger)\s+(or|vs|versus)\s+(warning|danger)\b|\bwarning\s+word\b/.test(s)) return 'guide-signal-word';
    if (/\bclassif(y|ies|ication)\b/.test(s) && /\b(my|for|me|you|guide me)\b/.test(s)) return 'guide-no-classification';
    if (asks && /\b(h|p)[\s-]?(statements?|codes?|phrases?)\b|\bhazard\s+statements?\b|\bprecautionary\b|\bpictograms?\b|\bhazards?\b|\bghs\b/.test(s) &&
      /\b(my|for (a|my|the)|should|need|go on|put on|add|use)\b/.test(s) &&
      !/\b(where|find|smart paste|paste|missing|extract|wrong|red|border|print|size|blurry)\b/.test(s)) return 'guide-no-classification';
    return null;
  }

  // ── Understanding "what I want to make" ──────────────────────
  var NUM = { one: 1, a: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, dozen: 12 };
  var NUMRE = '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|dozen)';
  function num(w) { return /^\d+$/.test(w) ? parseInt(w, 10) : NUM[w]; }

  var PRODUCTS = [
    [/\bsoy\s+candles?\b/, 'Soy Candle'], [/\bvotives?\b/, 'Votive Candle'], [/\btea\s?lights?\b/, 'Tea Light Candle'],
    [/\bpillars?\b/, 'Pillar Candle'], [/\badvent\b.*\bmelts?\b/, 'Advent Calendar Wax Melt'], [/\badvent\b/, 'Advent Calendar Candle'],
    [/\bclamshells?\b/, 'Wax Melt Clamshell'], [/\bsnap\s?bars?\b/, 'Snap Bar'], [/\b(wax\s+)?tarts?\b/, 'Wax Tart'],
    [/\bmelt\s+bouquets?\b/, 'Wax Melt Bouquet'], [/\b(wax\s+)?melts?\b/, 'Wax Melt'], [/\breed\s+diffusers?\b/, 'Reed Diffuser'],
    [/\bcar\s+diffusers?\b/, 'Car Diffuser'], [/\bplug[\s-]?in\b/, 'Plugin Diffuser'], [/\belectric\s+diffusers?\b/, 'Electric Diffuser'],
    [/\bdiffusers?\b/, 'Reed Diffuser'], [/\blinen\s+sprays?\b/, 'Linen Spray'], [/\bcar\s+(air\s+freshener\s+)?sprays?\b/, 'Car Air Freshener Spray'],
    [/\b(room\s+)?sprays?\b/, 'Room Spray'], [/\bsachets?\b/, 'Scented Sachet'], [/\bpotpourri\b/, 'Potpourri'], [/\bcandles?\b/, 'Scented Candle']
  ];

  function parseRequest(text) {
    var raw = String(text || '');
    var s = raw.toLowerCase().replace(/[’‘]/g, "'").replace(/×/g, 'x');
    var r = {};
    if (/\b(circle|circular|round)\b/.test(s)) r.shape = 'circle';
    else if (/\b(rectangle|rectangular|oblong)\b/.test(s)) r.shape = 'rectangle';
    else if (/\bsquares?\b/.test(s)) r.shape = 'square';

    var m;
    if ((m = s.match(/(\d{1,3}(?:\.\d)?)\s*(mm|cm)?\s*(?:x|by)\s*(\d{1,3}(?:\.\d)?)\s*(mm|cm)\b/)) || (m = s.match(/(\d{1,3}(?:\.\d)?)\s*(mm|cm)\s*(?:x|by)\s*(\d{1,3}(?:\.\d)?)\s*(mm|cm)?/))) {
      var f = (m[2] || m[4]) === 'cm' ? 10 : 1;
      r.width = Math.round(parseFloat(m[1]) * f); r.height = Math.round(parseFloat(m[3]) * f);
      if (!r.shape) r.shape = r.width === r.height ? 'square' : 'rectangle';
    } else if ((m = s.match(/(\d{1,3}(?:\.\d+)?)\s*(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/))) {
      r.size = Math.round(parseFloat(m[1]) * (/^c/.test(m[2]) ? 10 : 1));
      if (/\bradius\b/.test(s)) r.radius = true;
    }

    // Quantities: "4 of Sea Breeze and 4 of Coconut", "6 labels", "just one".
    var scents = [], total = 0;
    var re = new RegExp('\\b' + NUMRE + '\\s+(?:x\\s+)?(?:of\\s+)?(?:the\\s+)?([a-z][a-z\'&\\- ]{1,40}?)(?=\\s+(?:and|&|plus)\\s+' + NUMRE + '\\b|\\s*,|\\s+(?:on|in|for|labels?|stickers?)\\b|[.!?]|$)', 'g');
    var ofRe = new RegExp('\\b' + NUMRE + '\\s+(?:x\\s+)?of\\s+', 'g');
    if (ofRe.test(s)) {
      var mm2; re.lastIndex = 0;
      while ((mm2 = re.exec(s))) {
        var name = mm2[2].replace(/\b(scent|scents|fragrance|label|labels)\b/g, '').trim();
        if (!name || /^(mm|labels?|stickers?|them|each|different|sheets?|pages?|a4( sheets?)?|sizes?)$/.test(name) || /\bmm\b/.test(name)) continue;
        var start = raw.toLowerCase().indexOf(name);
        scents.push({ name: start >= 0 ? raw.substr(start, name.length) : name, qty: num(mm2[1]) });
        total += num(mm2[1]);
      }
    }
    if (scents.length) { r.scents = scents; r.count = total; r.distinct = scents.length; }
    if (!r.count && (m = s.match(new RegExp('\\b' + NUMRE + '\\s+(?:x\\s+)?(?:[a-z0-9]+\\s+){0,3}?(?:labels?|stickers?)\\b')))) r.count = num(m[1]);
    if (!r.count && /\b(just|only)\s+(one|a single|1)\b|\ba single\b|\bone label\b/.test(s)) r.count = 1;
    if ((m = s.match(new RegExp('\\b' + NUMRE + '\\s+(?:different\\s+)?(?:scents|fragrances)\\b')))) r.distinct = num(m[1]);
    if (/\ball\s+(with\s+)?different\s+(scents|fragrances)\b|\beach\s+(a\s+)?different\b/.test(s) && r.count) r.distinct = r.count;
    if (/\b(same|one)\s+(scent|fragrance)\b|\ball\s+the\s+same\b/.test(s)) r.distinct = 1;

    if (/\bcricut\b|\bcutting\s+machine\b|\bprint\s+then\s+cut\b|\bsilhouette\b|\bcameo\b|\bscan\s?n\s?cut\b/.test(s)) r.route = 'cut';
    else if (/\bcanva\b/.test(s)) r.route = 'canva';
    else if (/\bprint(ing)?\s+(shop|company|firm|service)\b|\bprinters?\s+(company|shop)\b|\bprofessional(ly)?\s+print|\bsend\b.*\bprint/.test(s)) r.route = 'shop';
    else if (/\ba4\b|\bsheets?\b|\bavery\b|\bsticker\s+paper\b|\bseveral\s+on\b|\b(one|a|the same)\s+page\b/.test(s)) r.route = 'sheet';
    else if (/\b(one|single)\s+(label|pdf)\b|\bjust\s+one\b|\bindividual(ly)?\b/.test(s)) r.route = 'single';

    if (!r.route && r.count === 1) r.route = 'single';
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i][0].test(s)) { r.productType = PRODUCTS[i][1]; break; }

    if ((m = raw.match(/\b(?:called|named|scent(?:ed)?|fragrance)\s*[:\-]?\s*["“']?([A-Z][A-Za-z'&\- ]{1,40}?)["”']?(?=\s*(?:,|\.|$|\s+(?:and|on|in|for|with)\b))/))) r.name = m[1].trim();
    if (!r.name && r.scents && r.scents.length === 1) r.name = r.scents[0].name;
    return r;
  }

  function looksLikeRequest(text, parsed) {
    var s = String(text || '').toLowerCase().trim();
    var isQuestion = /^(how|what|why|where|when|which|can|could|do|does|did|is|are|should|will|whats|what's)\b/.test(s) || /\?\s*$/.test(s);
    var wants = /\b(i|we)\s*('?d like|would like|want|need|am making|'m making|make|making|create|print|have)\b|\b(set (it|this|me) up|help me make|can you (make|set|create|fill))\b/.test(s);
    if (/^(can|could) you (make|set|create|fill)/.test(s)) isQuestion = false;
    var signals = (parsed.shape ? 1 : 0) + ((parsed.size || parsed.width) ? 1 : 0) + (parsed.count ? 1 : 0) + (parsed.scents ? 1 : 0);
    if (isQuestion) return signals >= 2;
    return signals >= 1 || (wants && /\blabels?\b|\bstickers?\b/.test(s));
  }

  function merge(into, from) { for (var k in from) if (from[k] != null) into[k] = from[k]; return into; }

  // ── Conversation ─────────────────────────────────────────────
  function createSession() { return { req: {}, stage: 'idle', asked: {} }; }

  var SHAPE_NAME = { circle: 'circle', rectangle: 'rectangle', square: 'square' };
  function sizeText(r) {
    if (r.shape === 'rectangle' && r.width) return r.width + ' × ' + r.height + ' mm';
    if (r.size) return r.size + ' mm';
    if (r.width) return r.width + ' mm';
    return '';
  }
  function routeText(r) {
    return { single: 'printed as one individual label (PDF)', sheet: 'arranged on an A4 sheet', cut: 'cut on a cutting machine', shop: 'sent to a print company', canva: 'finished in Canva' }[r.route] || '';
  }
  function missing(r) {
    var m = [];
    if (!r.shape) m.push('shape');
    if (r.shape === 'rectangle' ? !(r.width && r.height) : !(r.size || r.width)) m.push('size');
    if (!r.route) m.push('route');
    return m;
  }
  var QUESTIONS = {
    shape: { q: 'Which label shape would you like?', chips: ['Circle', 'Rectangle', 'Square'] },
    size: function (r) {
      return r.shape === 'rectangle'
        ? { q: 'What width and height, in millimetres? For example <em>70 × 50 mm</em>.', chips: [] }
        : { q: 'What size, in millimetres' + (r.shape === 'circle' ? ' across (diameter)' : '') + '?', chips: ['52 mm', '63 mm', '75 mm'] };
    },
    route: { q: 'How will you print them?', chips: ['One label (PDF)', 'Several on an A4 sheet', 'Cutting machine (e.g. Cricut)', 'Print company'] }
  };
  function chipMap(label) {
    return { 'One label (PDF)': 'one single label', 'Several on an A4 sheet': 'on an A4 sheet', 'Cutting machine (e.g. Cricut)': 'cricut', 'Print company': 'print company', '52 mm': '52mm', '63 mm': '63mm', '75 mm': '75mm' }[label] || label;
  }

  // respond() returns { html, chips:[{label, send}], styleChoice:bool }.
  // ctx (optional, Builder only): { step, blockedMessage, issuesMessage }.
  function respond(session, text, ctx) {
    ctx = ctx || {};
    var s = String(text || '').trim();
    var lower = s.toLowerCase();
    if (!s) return { html: 'Tell me what you want to make, or ask a question about CLPeasy.', chips: [] };

    var g = guard(s);
    if (g) return cardReply(card(g), { related: g === 'guide-signal-word' ? ['help-step-3-hazards', 'support-something-missing-after-smart-paste'] : ['faq-does-clpeasy-classify-my-finished-product', 'faq-which-sds-should-i-use'] });

    // Confirmation answers.
    if (session.stage === 'confirm') {
      if (/^(yes|yep|yeah|correct|that'?s right|right|ok|okay|sounds good|perfect|y)\b/.test(lower)) {
        session.stage = 'style';
        return { html: 'Great!', chips: [], styleChoice: true };
      }
      if (/^(no|nope|not quite|change|wrong)\b/.test(lower)) {
        session.stage = 'collect';
        var p0 = parseRequest(s);
        if (Object.keys(p0).length) { merge(session.req, p0); return next(session); }
        return { html: 'No problem — tell me what to change, for example <em>63 mm</em>, <em>rectangle</em> or <em>A4 sheet</em>.', chips: [] };
      }
    }

    // Contextual help from the Builder.
    if (/\b(why|how come)\b.*\b(download|blocked|greyed|grayed|locked|disabled)\b|\b(can'?t|cannot|won'?t|unable to)\s+download\b|\bdownload\b.*\b(blocked|greyed|grayed|disabled|not working)\b/.test(lower)) {
      var c = card('guide-why-blocked');
      var extra = ctx.blockedMessage ? '<p><strong>What CLPeasy says is still needed:</strong> ' + esc(ctx.blockedMessage) + '</p>' : '';
      return cardReply(c, { prefix: extra, related: ['help-step-5-download', 'print-does-clpeasy-check-font-size-and-whether-everything-fits'] });
    }
    if (ctx.issuesMessage && /\b(smart paste|missing|extract|didn'?t (get|read|pick)|could ?n'?t be read|not read|stopped|stop)\b/.test(lower)) {
      return cardReply(card('support-something-missing-after-smart-paste'), { prefix: '<p><strong>What CLPeasy says about this label:</strong> ' + esc(ctx.issuesMessage) + '</p>', related: ['help-smart-paste-didn-t-extract-everything-correctly', 'faq-which-sds-should-i-use'] });
    }

    var parsed = parseRequest(session.stage === 'collect' ? chipMap(s) : s);
    if (session.stage === 'collect' && Object.keys(parsed).length) { merge(session.req, parsed); return next(session); }
    if (looksLikeRequest(s, parsed)) {
      session.req = merge({}, parsed);
      session.stage = 'collect';
      return next(session);
    }
    return answer(s, session.stage === 'collect' ? '<p>When you\'re ready, answer the question above to carry on with your labels.</p>' : '');
  }

  function next(session) {
    var r = session.req;
    if (r.radius && r.size && !session.asked.radius) {
      session.asked.radius = true;
      return {
        html: 'Just to check — CLPeasy uses the size <strong>across</strong> the circle (the diameter). Is <strong>' + r.size + ' mm</strong> the width across your label?',
        chips: [{ label: 'Yes, ' + r.size + ' mm across', send: r.size + 'mm' }, { label: 'No — ' + (r.size * 2) + ' mm across', send: (r.size * 2) + 'mm' }]
      };
    }
    var need = missing(r);
    if (need.length) {
      var qs = need.slice(0, 2).map(function (k) { return typeof QUESTIONS[k] === 'function' ? QUESTIONS[k](r) : QUESTIONS[k]; });
      var intro = Object.keys(r).length ? 'Thanks! ' : '';
      var chips = [];
      qs.forEach(function (q) { q.chips.forEach(function (c) { chips.push({ label: c, send: c }); }); });
      return { html: intro + qs.map(function (q) { return q.q; }).join('<br>'), chips: chips };
    }
    session.stage = 'confirm';
    return { html: summary(r), chips: [{ label: 'Yes, that\'s right', send: 'Yes, that\'s right' }, { label: 'Change something', send: 'No, change something' }] };
  }

  function summary(r) {
    var parts = ['<strong>' + sizeText(r) + ' ' + SHAPE_NAME[r.shape] + '</strong> labels'];
    if (r.productType) parts[0] += ' for <strong>' + esc(r.productType) + '</strong>';
    if (r.count) parts.push(r.count + ' label' + (r.count === 1 ? '' : 's') + ' in total');
    if (r.scents && r.scents.length) parts.push(r.scents.map(function (x) { return x.qty + ' × ' + esc(x.name); }).join(', '));
    else if (r.distinct > 1) parts.push(r.distinct + ' different scents');
    else if (r.distinct === 1 && r.count > 1) parts.push('all the same scent');
    if (r.route) parts.push(routeText(r));
    var note = '';
    var small = r.shape === 'rectangle' ? Math.max(r.width, r.height) < 52 : (r.size || r.width) < 52;
    if (small) note = '<br><br>Note: the Builder shows a size warning below the recommended 52 mm, and checks whether all the required information fits before you can download.';
    return 'So you want: ' + parts.join(', ') + ' — is that right?' + note;
  }

  function answer(q, prefix) {
    var res = search(q, { limit: 3 });
    if (!res.length) {
      return {
        html: (prefix || '') + 'I couldn\'t find an answer to that in the CLPeasy guides. You could try different words, search the <strong>Help Guide</strong>, browse the <a href="knowledge.html" target="_blank" rel="noopener">Knowledge Base</a>, or <a href="support.html" target="_blank" rel="noopener">contact support</a>.',
        chips: [{ label: 'Search the Help Guide', action: 'help', send: q }],
        noMatch: true
      };
    }
    var rep = cardReply(res[0].card, { relatedCards: res.slice(1).map(function (r) { return r.card; }) });
    if (prefix) rep.html = prefix + rep.html;
    return rep;
  }

  function cardHtml(c, opts) {
    opts = opts || {};
    var links = (c.links || []).map(function (l) {
      var ext = /^https?:/.test(l.href);
      return '<a href="' + esc(l.href) + '" target="_blank" rel="noopener">' + esc(l.label) + (ext ? '' : ' →') + '</a>';
    });
    return (opts.prefix || '') + '<strong>' + esc(c.title) + '</strong><div class="wiz-card-body">' + c.html + '</div>' +
      (links.length ? '<div class="wiz-card-links">' + links.join(' &nbsp;·&nbsp; ') + '</div>' : '');
  }
  function cardReply(c, opts) {
    opts = opts || {};
    var rel = (opts.relatedCards || []).concat((opts.related || []).map(card)).filter(Boolean).filter(function (x) { return x.id !== c.id; }).slice(0, 2);
    return { html: cardHtml(c, opts), chips: rel.map(function (x) { return { label: x.title, send: x.title }; }), cardId: c.id };
  }

  // ── Guide styles ─────────────────────────────────────────────
  function stepList(r) {
    var shape = SHAPE_NAME[r.shape] || 'label';
    var dims = r.shape === 'rectangle' ? 'enter the width (' + r.width + ' mm) and height (' + r.height + ' mm)' : 'enter ' + sizeText(r) + ' as the ' + (r.shape === 'circle' ? 'diameter' : 'size');
    var many = r.distinct > 1 || (r.scents && r.scents.length > 1);
    var name = r.name ? ' (' + esc(r.name) + ')' : (many ? ' for the first scent' : '');
    var steps = [
      { step: 1, text: 'Choose <b>' + shape + '</b> and ' + dims + '.', hint: '→ Step 1: Label — click "' + shape.charAt(0).toUpperCase() + shape.slice(1) + '" in the shape grid' },
      { step: 2, text: 'Enter the product name' + name + (r.productType ? ' and choose <b>' + esc(r.productType) + '</b> as the product type' : ' and select the product type') + '.', hint: '→ Step 2: Product' },
      { step: 3, text: 'Paste <b>Section 2.2 — Label elements</b> of the SDS for this product into Smart Paste, then check every extracted code, pictogram and sensitiser against the SDS.', hint: '→ Step 3: Hazards' },
      { step: 4, text: 'Enter the required business and contact details.', hint: '→ Step 4: Business' },
      { step: 5, text: 'Review the preview and tick the verification checkbox.', hint: '→ Step 5: Download' }
    ];
    var route = r.route || (r.count > 1 ? 'sheet' : 'single');
    if (route === 'single') steps.push({ text: 'Click <b>▣ PDF</b>, then <b>Print / Save as PDF</b>. Print at <b>Actual Size / 100%</b> with Fit to page, Shrink or Scale to fit turned off.', hint: '→ Step 5: Download — ▣ PDF' });
    if (route === 'sheet' || route === 'cut') steps.push({ text: 'Click <b>Save to my label library</b>.' + (many ? ' Repeat Steps 2–5 for each scent' + (r.distinct > 1 ? ' (' + r.distinct + ' in total)' : '') + ', saving each one.' : ''), hint: '→ Step 5: Download — Save to my label library' });
    if (route === 'sheet') steps.push({ text: 'Open the <b>Print Sheet Composer</b>, add your saved label' + (many ? 's' : '') + ' and choose how many of each' + (r.count ? ' (' + r.count + ' in total)' : '') + '. Set your printer to <b>A4</b> and print at <b>Actual Size / 100%</b>.', hint: '→ Print Sheet Composer' });
    if (route === 'cut') steps.push({ text: 'For a cutting machine, use <b>⬡ SVG</b>, or open the <b>Print Sheet Composer</b> and choose <b>Download for cutting machine</b> for individual PNGs.', hint: '→ Print Sheet Composer — Download for cutting machine' });
    if (route === 'shop') steps.push({ text: 'Download <b>▣ PDF</b> — it is the exact label size without bleed or crop marks, so ask the print company what file they need.', hint: '→ Step 5: Download — ▣ PDF' });
    if (route === 'canva') steps.push({ text: 'Download <b>⬇ PNG</b> and upload it in Canva. A PNG does not store a print size, so check the printed size carefully.', hint: '→ Step 5: Download — ⬇ PNG' });
    return { steps: steps, route: route };
  }
  var TIP = '💡 <strong>Tip:</strong> the first time you print, use ordinary paper and measure one label with a ruler before using your label stock.';
  var ROUTE_CARD = { single: 'help-printing-a-single-label', sheet: 'print-route-sheets', cut: 'print-route-cricut', shop: 'guide-print-shop', canva: 'print-route-png' };

  // style: walkthrough | quicklist | autofill
  function styleReply(session, style) {
    var r = session.req;
    session.stage = 'done';
    var sl = stepList(r);
    var rc = card(ROUTE_CARD[sl.route]);
    var more = rc ? '<div class="wiz-card-links">' + (rc.links || []).map(function (l) { return '<a href="' + esc(l.href) + '" target="_blank" rel="noopener">' + esc(l.label) + ' →</a>'; }).join(' &nbsp;·&nbsp; ') + '</div>' : '';
    var chips = [{ label: 'Start a new label plan', send: 'start again', action: 'reset' }];
    if (style === 'walkthrough') {
      return {
        html: '<strong>Here\'s your walkthrough:</strong>' + sl.steps.map(function (st, i) {
          return '<div class="step-card"><div class="step-num">' + (i + 1) + '</div><div class="step-text">' + st.text + '<div class="step-diagram">[' + st.hint + ']</div></div></div>';
        }).join('') + TIP + more,
        chips: [{ label: 'Take me to Step 1', action: 'step1', send: '' }].concat(chips)
      };
    }
    if (style === 'autofill') {
      var fill = autofillData(r);
      var filled = [];
      if (fill.shape) filled.push('shape');
      if (fill.size || fill.customW) filled.push('size');
      if (fill.productType) filled.push('product type');
      if (fill.scentName) filled.push('product name');
      return {
        html: '<strong>I\'ll fill in the ' + filled.join(', ') + ' for you.</strong><br>Everything else — including all hazard information from Smart Paste — stays with you. Then follow these steps:' +
          '<ol>' + sl.steps.slice(1).map(function (st) { return '<li>' + st.text + '</li>'; }).join('') + '</ol>' + TIP + more,
        chips: chips,
        autofill: fill
      };
    }
    return { html: '<strong>Here are your steps:</strong><ol>' + sl.steps.map(function (st) { return '<li>' + st.text + '</li>'; }).join('') + '</ol>' + TIP + more, chips: chips };
  }

  // Auto-fill is limited to these fields. Hazard information (signal word,
  // pictograms, statements, sensitisers) only ever comes from Smart Paste.
  var AUTOFILL_FIELDS = ['shape', 'size', 'customW', 'customH', 'productType', 'scentName'];
  function autofillData(r) {
    var d = {};
    if (r.shape) d.shape = r.shape;
    if (r.shape === 'rectangle' && r.width) { d.size = r.width; d.customW = r.width; d.customH = r.height; }
    else if (r.size || r.width) d.size = r.size || r.width;
    if (r.productType) d.productType = r.productType;
    var many = r.distinct > 1 || (r.scents && r.scents.length > 1);
    if (r.name && !many) d.scentName = r.name;
    return d;
  }

  // Suggested topics for each Builder step (card titles).
  var STEP_TOPICS = {
    1: ['help-what-size-label-should-i-use', 'print-does-the-dashed-cut-border-print', 'guide-printing-route'],
    2: ['faq-can-i-use-more-than-one-fragrance-oil-or-essential-oil', 'faq-which-sds-should-i-use', 'faq-what-products-does-clpeasy-support'],
    3: ['help-where-do-i-find-my-sds-sheet', 'help-smart-paste-didn-t-extract-everything-correctly', 'help-what-is-euh208'],
    4: ['faq-who-is-responsible-for-a-gb-clp-label', 'faq-can-i-save-and-reuse-my-labels', 'print-will-labels-i-save-appear-on-my-other-device'],
    5: ['guide-why-blocked', 'help-choosing-a-file-format', 'help-my-label-printed-too-large-or-too-small']
  };
  function topicsForStep(step) { return (STEP_TOPICS[step] || STEP_TOPICS[1]).map(card).filter(Boolean).map(function (c) { return { label: c.title, send: c.title }; }); }

  var api = {
    search: search, card: card, cards: function () { return CARDS.slice(); }, guard: guard,
    parseRequest: parseRequest, looksLikeRequest: looksLikeRequest, createSession: createSession,
    respond: respond, styleReply: styleReply, autofillData: autofillData, AUTOFILL_FIELDS: AUTOFILL_FIELDS,
    cardHtml: cardHtml, topicsForStep: topicsForStep, esc: esc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GuideMe = api;
})(this);

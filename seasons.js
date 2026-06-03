/**
 * CLPeasy Seasons — seasons.js
 * ─────────────────────────────────────────────────────────────────
 * Seasonal accents applied in targeted spots:
 *   1. Top stripe — 4px coloured bar above the nav
 *   2. Hero pill — "BUILT BY A MAKER" badge takes seasonal colour
 *   3. Hero italic — "print-ready" accent colour shifts seasonally
 *   4. Floating seasonal icon near headline
 *   5. Particle effects (snow, leaves, petals)
 *   6. Footer reminder banner with seasonal messaging
 * ─────────────────────────────────────────────────────────────────
 */

(function () {

  const TEAL = '#4C9BB0';

  const MONTHS = [
    {
      name: 'January',
      accent: '#93C5FD',        // ice blue
      accentDark: '#1D4ED8',
      particle: 'snow',
      pillBg: '#EFF6FF',
      pillColor: '#1D4ED8',
      icon: '❄️',
      iconLabel: 'Time to plan your winter scents',
      heroItalicColor: '#60A5FA',
      topStripe: 'linear-gradient(90deg, #93C5FD, #4C9BB0, #93C5FD)',
      bannerBg: '#EFF6FF',
      bannerBorder: '#93C5FD',
      bannerEmoji: '❄️',
      bannerText: 'New year, new scents — every new fragrance needs its own CLP label before your first batch.',
      bannerCta: 'Open my label library',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'February',
      accent: '#F9A8D4',
      accentDark: '#BE185D',
      particle: 'snow',
      pillBg: '#FDF2F8',
      pillColor: '#BE185D',
      icon: '🌹',
      iconLabel: 'Get your Valentine\'s scents ready',
      heroItalicColor: '#EC4899',
      topStripe: 'linear-gradient(90deg, #F9A8D4, #4C9BB0, #F9A8D4)',
      bannerBg: '#FDF2F8',
      bannerBorder: '#F9A8D4',
      bannerEmoji: '🌹',
      bannerText: "Valentine's season — limited edition scents need their own CLP labels before you make a single batch.",
      bannerCta: 'Build a Valentine\'s label',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'March',
      accent: '#86EFAC',
      accentDark: '#15803D',
      particle: 'petals',
      pillBg: '#F0FDF4',
      pillColor: '#15803D',
      icon: '🌸',
      iconLabel: 'Launch your spring scents now',
      heroItalicColor: '#22C55E',
      topStripe: 'linear-gradient(90deg, #86EFAC, #4C9BB0, #86EFAC)',
      bannerBg: '#F0FDF4',
      bannerBorder: '#86EFAC',
      bannerEmoji: '🌸',
      bannerText: 'Spring range launching? Citrus oils opened last autumn are 6 months old — worth a check before your first batch.',
      bannerCta: 'Check your labels',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'April',
      accent: '#A7F3D0',
      accentDark: '#047857',
      particle: 'petals',
      pillBg: '#ECFDF5',
      pillColor: '#047857',
      icon: '🐣',
      iconLabel: 'Easter scents need labels first',
      heroItalicColor: '#10B981',
      topStripe: 'linear-gradient(90deg, #A7F3D0, #4C9BB0, #A7F3D0)',
      bannerBg: '#ECFDF5',
      bannerBorder: '#A7F3D0',
      bannerEmoji: '🐣',
      bannerText: 'April is for new beginnings — every new fragrance needs a new CLP label before you sell a single product.',
      bannerCta: 'Build your spring labels',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'May',
      accent: '#FDE68A',
      accentDark: '#B45309',
      particle: 'none',
      pillBg: '#FFFBEB',
      pillColor: '#B45309',
      icon: '🎪',
      iconLabel: 'Craft fair season — are your labels ready?',
      heroItalicColor: '#F59E0B',
      topStripe: 'linear-gradient(90deg, #FDE68A, #4C9BB0, #FDE68A)',
      bannerBg: '#FFFBEB',
      bannerBorder: '#FDE68A',
      bannerEmoji: '🎪',
      bannerText: "Craft fair season is in full swing — every product on your stall needs a compliant CLP label. Don't forget your testers and samples too.",
      bannerCta: 'Print my label sheet',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'June',
      accent: '#FCD34D',
      accentDark: '#92400E',
      particle: 'none',
      pillBg: '#FFFBEB',
      pillColor: '#92400E',
      icon: '☀️',
      iconLabel: 'Prepare your summer scent labels now',
      heroItalicColor: '#F59E0B',
      topStripe: 'linear-gradient(90deg, #FCD34D, #4C9BB0, #FCD34D)',
      bannerBg: '#FFFBEB',
      bannerBorder: '#FCD34D',
      bannerEmoji: '☀️',
      bannerText: "Summer is here — are all your seasonal scent labels ready? It's also the perfect time for your annual SDS audit before new autumn fragrances drop.",
      bannerCta: 'Review my labels',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'July',
      accent: '#FCD34D',
      accentDark: '#92400E',
      particle: 'none',
      pillBg: '#FFFBEB',
      pillColor: '#92400E',
      icon: '🏖️',
      iconLabel: 'Start planning your autumn range',
      heroItalicColor: '#F59E0B',
      topStripe: 'linear-gradient(90deg, #FCD34D, #4C9BB0, #FCD34D)',
      bannerBg: '#FFFBEB',
      bannerBorder: '#FCD34D',
      bannerEmoji: '🏖️',
      bannerText: 'Mid-summer check-in — autumn fragrance orders are coming. Get your labels built before your first batch so nothing holds up your launch.',
      bannerCta: 'Build autumn labels',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'August',
      accent: '#FDBA74',
      accentDark: '#C2410C',
      particle: 'none',
      pillBg: '#FFF7ED',
      pillColor: '#C2410C',
      icon: '🍂',
      iconLabel: 'Autumn scents — prep your labels early',
      heroItalicColor: '#F97316',
      topStripe: 'linear-gradient(90deg, #FDBA74, #4C9BB0, #FDBA74)',
      bannerBg: '#FFF7ED',
      bannerBorder: '#FDBA74',
      bannerEmoji: '🍂',
      bannerText: 'Autumn is 6 weeks away — Valentine\'s fragrance oils from February are now 6 months old. Worth a check.',
      bannerCta: 'Check your fragrance stock',
      bannerCtaUrl: 'knowledge.html',
    },
    {
      name: 'September',
      accent: '#FB923C',
      accentDark: '#C2410C',
      particle: 'leaves',
      pillBg: '#FFF7ED',
      pillColor: '#C2410C',
      icon: '🍁',
      iconLabel: 'Build your autumn range labels now',
      heroItalicColor: '#F97316',
      topStripe: 'linear-gradient(90deg, #FB923C, #4C9BB0, #FB923C)',
      bannerBg: '#FFF7ED',
      bannerBorder: '#FB923C',
      bannerEmoji: '🍁',
      bannerText: 'Autumn range launching — pumpkin spice, woodsmoke and dark amber often carry Warning signal words. Check your labels.',
      bannerCta: 'Build your autumn labels',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'October',
      accent: '#EF4444',
      accentDark: '#991B1B',
      particle: 'leaves',
      pillBg: '#FEF2F2',
      pillColor: '#991B1B',
      icon: '🎃',
      iconLabel: 'Halloween scents — check your hazard data',
      heroItalicColor: '#EF4444',
      topStripe: 'linear-gradient(90deg, #EF4444, #4C9BB0, #EF4444)',
      bannerBg: '#FEF2F2',
      bannerBorder: '#EF4444',
      bannerEmoji: '🎃',
      bannerText: 'Halloween scents — dark musk, smoke and clove often carry Danger signal words. Make sure your labels are correct.',
      bannerCta: 'Check hazard data',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'November',
      accent: '#7DD3FC',
      accentDark: '#0369A1',
      particle: 'snow',
      pillBg: '#F0F9FF',
      pillColor: '#0369A1',
      icon: '🎄',
      iconLabel: 'Build your Christmas labels now',
      heroItalicColor: '#0EA5E9',
      topStripe: 'linear-gradient(90deg, #7DD3FC, #4C9BB0, #7DD3FC)',
      bannerBg: '#F0F9FF',
      bannerBorder: '#7DD3FC',
      bannerEmoji: '🎄',
      bannerText: 'Christmas labels sorted in November means a stress-free December. Don\'t wait — build your festive range labels now.',
      bannerCta: 'Build Christmas labels',
      bannerCtaUrl: 'builder.html',
    },
    {
      name: 'December',
      accent: '#7DD3FC',
      accentDark: '#0369A1',
      particle: 'snow',
      pillBg: '#F0F9FF',
      pillColor: '#0369A1',
      icon: '🎅',
      iconLabel: 'Festive scents — label them right',
      heroItalicColor: '#0EA5E9',
      topStripe: 'linear-gradient(90deg, #7DD3FC, #4C9BB0, #7DD3FC)',
      bannerBg: '#F0F9FF',
      bannerBorder: '#7DD3FC',
      bannerEmoji: '🎅',
      bannerText: 'Year-end compliance review — is every product currently on sale correctly labelled? Check before the Christmas rush.',
      bannerCta: 'Review your library',
      bannerCtaUrl: 'builder.html',
    },
  ];

  // ── PARTICLES ──────────────────────────────────────────────────
  function addParticles(type, accentColor) {
    if (type === 'none') return;
    const existing = document.getElementById('clpeasy-particles');
    if (existing) existing.remove();
    const canvas = document.createElement('canvas');
    canvas.id = 'clpeasy-particles';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:0.4;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    const count = type === 'snow' ? 35 : 18;
    const leafColors = ['#F97316','#EA580C','#FDE68A','#DC2626','#B45309'];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: type === 'snow' ? Math.random() * 3 + 1 : Math.random() * 9 + 5,
        speed: Math.random() * 0.5 + 0.2,
        drift: (Math.random() - 0.5) * 0.4,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 2,
        color: type === 'leaves' ? leafColors[Math.floor(Math.random() * leafColors.length)] : 'rgba(200,230,245,0.9)'
      });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (type === 'leaves') {
          ctx.rotate(p.rot * Math.PI / 180);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (type === 'petals') {
          ctx.rotate(p.rot * Math.PI / 180);
          ctx.fillStyle = 'rgba(249,168,212,0.6)';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        p.y += p.speed;
        p.x += p.drift;
        p.rot += p.rotSpeed;
        if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
        if (p.x > canvas.width + 20) p.x = -20;
        if (p.x < -20) p.x = canvas.width + 20;
      });
      requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
  }

  // ── TOP STRIPE ─────────────────────────────────────────────────
  function applyTopStripe(m) {
    const existing = document.getElementById('clpeasy-top-stripe');
    if (existing) existing.remove();
    const stripe = document.createElement('div');
    stripe.id = 'clpeasy-top-stripe';
    stripe.style.cssText = `height:4px;width:100%;background:${m.topStripe};position:fixed;top:0;left:0;z-index:9999;`;
    document.body.prepend(stripe);
    // Push nav down to avoid overlap
    const nav = document.querySelector('nav');
    if (nav) nav.style.top = '4px';
  }

  // ── HERO PILL ──────────────────────────────────────────────────
  // Pill keeps its own teal brand styling — seasonal accent shown via season icon below
  function applyHeroPill(m) { /* intentionally no-op */ }

  // ── HERO ITALIC ACCENT ─────────────────────────────────────────
  function applyHeroItalic(m) {
    const heroH1 = document.querySelector('.hero h1, section.hero h1');
    if (!heroH1) return;
    const em = heroH1.querySelector('em');
    if (em) {
      em.style.color = m.heroItalicColor;
      em.style.transition = 'color 1s ease';
    }
  }

  // ── FLOATING SEASONAL ICON ─────────────────────────────────────
  function applySeasonIcon(m) {
    const existing = document.getElementById('clpeasy-season-icon');
    if (existing) existing.remove();
    const hero = document.querySelector('section.hero, .hero');
    if (!hero) return;
    const icon = document.createElement('div');
    icon.id = 'clpeasy-season-icon';
    icon.style.cssText = `
      display:inline-flex;align-items:center;gap:6px;
      background:${m.pillBg};
      border:1px solid ${m.accent};
      color:${m.pillColor};
      padding:4px 12px 4px 8px;
      border-radius:20px;
      font-size:12px;font-weight:700;
      margin-bottom:12px;
      font-family:'DM Sans',sans-serif;
      animation:clpeasy-float 3s ease-in-out infinite;
    `;
    icon.innerHTML = `<span style="font-size:16px">${m.icon}</span><span>${m.iconLabel}</span>`;
    // Insert after the hero pill (below "BUILT BY A MAKER, FOR MAKERS")
    const pill = document.getElementById('hero-pill') ||
                 Array.from(hero.querySelectorAll('div')).find(el => el.textContent.includes('BUILT BY A MAKER'));
    if (pill && pill.parentNode) {
      pill.parentNode.insertBefore(icon, pill.nextSibling);
    } else {
      const h1 = hero.querySelector('h1');
      if (h1) hero.insertBefore(icon, h1);
    }
    // Add float animation
    if (!document.getElementById('clpeasy-float-style')) {
      const style = document.createElement('style');
      style.id = 'clpeasy-float-style';
      style.textContent = `
        @keyframes clpeasy-float {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ── FOOTER SEASONAL BANNER ─────────────────────────────────────
  function injectFooterBanner(m) {
    const existing = document.getElementById('clpeasy-season-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'clpeasy-season-banner';
    banner.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:200;
      background:${m.bannerBg};
      border-top:3px solid ${m.accent};
      padding:10px 24px;
      display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;
      box-shadow:0 -2px 16px rgba(0,0,0,0.08);
      font-family:'DM Sans',sans-serif;
      transform:translateY(100%);
      transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
    `;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:200px;">
        <span style="font-size:20px;flex-shrink:0;">${m.bannerEmoji}</span>
        <span style="font-size:13px;color:#374151;line-height:1.5;">${m.bannerText}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <a href="${m.bannerCtaUrl}" style="background:${m.accentDark};color:white;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">${m.bannerCta} →</a>
        <button id="clpeasy-banner-close" style="background:none;border:none;color:#9CA3AF;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;" aria-label="Close">×</button>
      </div>
    `;
    document.body.appendChild(banner);

    const dismissKey = `clpeasy-banner-dismissed-${new Date().getMonth()}`;
    if (!sessionStorage.getItem(dismissKey)) {
      setTimeout(() => {
        banner.style.transform = 'translateY(0)';
        // Auto-dismiss after 8 seconds
        setTimeout(() => {
          banner.style.transform = 'translateY(100%)';
          sessionStorage.setItem(dismissKey, '1');
        }, 8000);
      }, 4000);
    }
    document.getElementById('clpeasy-banner-close').addEventListener('click', () => {
      banner.style.transform = 'translateY(100%)';
      sessionStorage.setItem(dismissKey, '1');
    });
  }

  // ── INIT ───────────────────────────────────────────────────────
  function init() {
    const now = new Date();
    const currentMonth = now.getMonth();
    // Look 14 days ahead — if within 14 days of next month, use next month's theme
    // This gives makers advance notice to prepare for the coming season
    const daysInMonth = new Date(now.getFullYear(), currentMonth + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate();
    const month = daysLeft < 14 ? (currentMonth + 1) % 12 : currentMonth;
    const m = MONTHS[month];
    applyTopStripe(m);
    applyHeroPill(m);
    applyHeroItalic(m);
    applySeasonIcon(m);
    injectFooterBanner(m);
    addParticles(m.particle, m.accent);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

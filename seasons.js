/**
 * CLPeasy Seasons — seasons.js
 * ─────────────────────────────────────────────────────────────────
 * Drop one <script src="seasons.js"></script> tag into any CLPeasy
 * page footer. No other changes needed.
 *
 * What it does:
 *   1. Adds a subtle seasonal CSS tint to the hero section
 *   2. Swaps the download button to show the seasonal character SVG
 *   3. Injects the footer seasonal reminder banner
 *   4. Auto-advances every month — no manual updates needed
 * ─────────────────────────────────────────────────────────────────
 */

(function () {

  const TEAL = '#4C9BB0';
  const DARK = '#0f2236';

  // ── 12 MONTH DATA ─────────────────────────────────────────────────
  const MONTHS = [
    {
      name: 'January',
      season: 'winter',
      heroBg: 'linear-gradient(135deg, rgba(200,220,235,0.18) 0%, rgba(76,155,176,0.10) 100%)',
      heroParticle: 'snow',
      bannerBg: '#EBF6F9',
      bannerBorder: '#4C9BB0',
      bannerEmoji: '❄️',
      bannerText: 'New year, new scents — don\'t forget every new fragrance needs its own CLP label before your first batch.',
      bannerCta: 'Review your library',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="snowman-jan">
          <!-- Body -->
          <circle cx="32" cy="38" r="12" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <circle cx="32" cy="20" r="8" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <!-- Hat -->
          <rect x="25" y="9" width="14" height="3" rx="1" fill="${DARK}"/>
          <rect x="27" y="5" width="10" height="6" rx="1" fill="${DARK}"/>
          <!-- Eyes -->
          <circle cx="29.5" cy="18.5" r="1.2" fill="${DARK}"/>
          <circle cx="34.5" cy="18.5" r="1.2" fill="${DARK}"/>
          <!-- Smile -->
          <path d="M29 22 Q32 24.5 35 22" stroke="${DARK}" stroke-width="1" fill="none" stroke-linecap="round"/>
          <!-- Buttons -->
          <circle cx="32" cy="32" r="1.2" fill="${DARK}"/>
          <circle cx="32" cy="36" r="1.2" fill="${DARK}"/>
          <circle cx="32" cy="40" r="1.2" fill="${DARK}"/>
          <!-- Arms -->
          <line x1="20" y1="34" x2="28" y2="37" stroke="${DARK}" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="44" y1="34" x2="36" y2="37" stroke="${DARK}" stroke-width="1.5" stroke-linecap="round"/>
          <!-- File in right hand -->
          <rect x="44" y="29" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="46" y1="33" x2="52" y2="33" stroke="${TEAL}" stroke-width="1"/>
          <line x1="46" y1="36" x2="52" y2="36" stroke="${TEAL}" stroke-width="1"/>
          <!-- Snow on ground -->
          <ellipse cx="32" cy="51" rx="16" ry="3" fill="white" stroke="#B0C8D4" stroke-width="1"/>
        </g>`,
    },
    {
      name: 'February',
      season: 'winter',
      heroBg: 'linear-gradient(135deg, rgba(220,180,200,0.12) 0%, rgba(76,155,176,0.10) 100%)',
      heroParticle: 'snow',
      bannerBg: '#FFF0F5',
      bannerBorder: '#E879A0',
      bannerEmoji: '🌹',
      bannerText: 'Valentine\'s season — limited edition scents need their own CLP labels before you make a single batch.',
      bannerCta: 'Build a Valentine\'s label',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="snowman-feb">
          <circle cx="32" cy="38" r="12" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <circle cx="32" cy="20" r="8" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <rect x="25" y="9" width="14" height="3" rx="1" fill="${DARK}"/>
          <rect x="27" y="5" width="10" height="6" rx="1" fill="${DARK}"/>
          <!-- Red scarf -->
          <path d="M24 27 Q32 30 40 27" stroke="#E53E3E" stroke-width="3" fill="none" stroke-linecap="round"/>
          <line x1="38" y1="27" x2="36" y2="33" stroke="#E53E3E" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="29.5" cy="18.5" r="1.2" fill="${DARK}"/>
          <circle cx="34.5" cy="18.5" r="1.2" fill="${DARK}"/>
          <path d="M29 22 Q32 24.5 35 22" stroke="${DARK}" stroke-width="1" fill="none" stroke-linecap="round"/>
          <circle cx="32" cy="32" r="1.2" fill="${DARK}"/>
          <circle cx="32" cy="36" r="1.2" fill="${DARK}"/>
          <circle cx="32" cy="40" r="1.2" fill="${DARK}"/>
          <line x1="20" y1="34" x2="28" y2="37" stroke="${DARK}" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="44" y1="34" x2="36" y2="37" stroke="${DARK}" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Heart -->
          <path d="M28 13 C28 11 30 10 32 12 C34 10 36 11 36 13 C36 16 32 18 32 18 C32 18 28 16 28 13Z" fill="#E53E3E"/>
          <rect x="44" y="29" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="46" y1="33" x2="52" y2="33" stroke="${TEAL}" stroke-width="1"/>
          <line x1="46" y1="36" x2="52" y2="36" stroke="${TEAL}" stroke-width="1"/>
          <ellipse cx="32" cy="51" rx="16" ry="3" fill="white" stroke="#B0C8D4" stroke-width="1"/>
        </g>`,
    },
    {
      name: 'March',
      season: 'spring',
      heroBg: 'linear-gradient(135deg, rgba(180,230,200,0.14) 0%, rgba(76,155,176,0.08) 100%)',
      heroParticle: 'petals',
      bannerBg: '#F0FDF4',
      bannerBorder: '#22C55E',
      bannerEmoji: '🌸',
      bannerText: 'Spring range launching? Check your citrus and floral fragrance oils — if they were opened last autumn, they\'re 6 months old.',
      bannerCta: 'Check your labels',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="snowman-mar">
          <!-- Melting snowman — soggy, drooping -->
          <ellipse cx="32" cy="42" rx="14" ry="9" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <ellipse cx="32" cy="24" rx="9" ry="8" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <!-- Droopy hat -->
          <rect x="24" y="14" width="16" height="3" rx="1" fill="${DARK}" transform="rotate(8,32,15)"/>
          <rect x="26" y="9" width="11" height="7" rx="1" fill="${DARK}" transform="rotate(8,32,12)"/>
          <circle cx="29.5" cy="22" r="1.2" fill="${DARK}"/>
          <circle cx="35" cy="21" r="1.2" fill="${DARK}"/>
          <!-- Sad mouth -->
          <path d="M29 26 Q32 24 35 26" stroke="${DARK}" stroke-width="1" fill="none" stroke-linecap="round"/>
          <!-- Water drips -->
          <path d="M20 40 Q19 45 20 50" stroke="#93C5FD" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M44 40 Q45 45 44 50" stroke="#93C5FD" stroke-width="2" fill="none" stroke-linecap="round"/>
          <!-- Flowers sprouting -->
          <line x1="14" y1="52" x2="14" y2="45" stroke="#22C55E" stroke-width="1.5"/>
          <circle cx="14" cy="44" r="2.5" fill="#FCA5A5"/>
          <line x1="50" y1="52" x2="50" y2="45" stroke="#22C55E" stroke-width="1.5"/>
          <circle cx="50" cy="44" r="2.5" fill="#FCA5A5"/>
          <rect x="42" y="29" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="44" y1="33" x2="50" y2="33" stroke="${TEAL}" stroke-width="1"/>
          <line x1="44" y1="36" x2="50" y2="36" stroke="${TEAL}" stroke-width="1"/>
        </g>`,
    },
    {
      name: 'April',
      season: 'spring',
      heroBg: 'linear-gradient(135deg, rgba(167,230,180,0.15) 0%, rgba(76,155,176,0.08) 100%)',
      heroParticle: 'petals',
      bannerBg: '#F0FDF4',
      bannerBorder: '#22C55E',
      bannerEmoji: '🐣',
      bannerText: 'April is for new beginnings — and new scents. Every new fragrance needs a new CLP label before you sell a single product.',
      bannerCta: 'Build your spring labels',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="puddle-apr">
          <!-- Puddle -->
          <ellipse cx="32" cy="47" rx="18" ry="6" fill="#BFDBFE" stroke="#93C5FD" stroke-width="1.5"/>
          <!-- Hat on ground -->
          <rect x="22" y="42" width="14" height="3" rx="1" fill="${DARK}"/>
          <rect x="24" y="38" width="10" height="6" rx="1" fill="${DARK}"/>
          <!-- Carrot nose -->
          <path d="M30 44 L35 45 L30 46Z" fill="#F97316"/>
          <!-- Flowers from puddle -->
          <line x1="20" y1="47" x2="18" y2="36" stroke="#22C55E" stroke-width="1.5"/>
          <circle cx="18" cy="35" r="3" fill="#FCA5A5"/>
          <line x1="32" y1="42" x2="32" y2="30" stroke="#22C55E" stroke-width="1.5"/>
          <circle cx="32" cy="29" r="3.5" fill="#F9A8D4"/>
          <line x1="44" y1="47" x2="46" y2="36" stroke="#22C55E" stroke-width="1.5"/>
          <circle cx="46" cy="35" r="3" fill="#FDE68A"/>
          <!-- File floating in puddle -->
          <rect x="38" y="43" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5" transform="rotate(-8,43,49)"/>
          <line x1="40" y1="47" x2="46" y2="47" stroke="${TEAL}" stroke-width="1" transform="rotate(-8,43,49)"/>
        </g>`,
    },
    {
      name: 'May',
      season: 'spring',
      heroBg: 'linear-gradient(135deg, rgba(254,240,138,0.14) 0%, rgba(76,155,176,0.08) 100%)',
      heroParticle: 'none',
      bannerBg: '#FFFBEB',
      bannerBorder: '#F59E0B',
      bannerEmoji: '🎪',
      bannerText: 'Craft fair season is open — every product on your table needs a compliant CLP label. Even your testers.',
      bannerCta: 'Print your label sheet',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="fair-may">
          <!-- Market stall canopy -->
          <polygon points="8,28 32,16 56,28" fill="${TEAL}" opacity="0.9"/>
          <polygon points="8,28 14,28 14,20" fill="white" opacity="0.4"/>
          <polygon points="56,28 50,28 50,20" fill="white" opacity="0.4"/>
          <!-- Bunting -->
          <path d="M10 22 Q20 18 32 22 Q44 18 54 22" stroke="#F59E0B" stroke-width="1" fill="none"/>
          <polygon points="18,22 21,22 19.5,25" fill="#EF4444"/>
          <polygon points="30,20 33,20 31.5,23" fill="#3B82F6"/>
          <polygon points="43,22 46,22 44.5,25" fill="#22C55E"/>
          <!-- Stall table -->
          <rect x="12" y="38" width="40" height="14" rx="2" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <!-- Labels on table -->
          <rect x="16" y="40" width="8" height="10" rx="1" fill="${TEAL}" opacity="0.3"/>
          <rect x="27" y="40" width="8" height="10" rx="1" fill="${TEAL}" opacity="0.3"/>
          <rect x="38" y="40" width="8" height="10" rx="1" fill="${TEAL}" opacity="0.3"/>
          <!-- Table legs -->
          <line x1="16" y1="52" x2="16" y2="58" stroke="${DARK}" stroke-width="2"/>
          <line x1="48" y1="52" x2="48" y2="58" stroke="${DARK}" stroke-width="2"/>
        </g>`,
    },
    {
      name: 'June',
      season: 'summer',
      heroBg: 'linear-gradient(135deg, rgba(254,215,100,0.16) 0%, rgba(76,155,176,0.08) 100%)',
      heroParticle: 'none',
      bannerBg: '#FFFBEB',
      bannerBorder: '#F59E0B',
      bannerEmoji: '☀️',
      bannerText: 'Summer is the perfect time for your annual SDS audit — suppliers update hazard data quietly. When did you last check yours?',
      bannerCta: 'Run your SDS audit',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="melt-jun">
          <!-- Puddle remnant — barely there -->
          <ellipse cx="32" cy="52" rx="14" ry="4" fill="#BFDBFE" opacity="0.5" stroke="#93C5FD" stroke-width="1"/>
          <!-- Sun rising -->
          <circle cx="32" cy="24" r="12" fill="#FDE68A" stroke="#F59E0B" stroke-width="2"/>
          <!-- Sun rays -->
          <line x1="32" y1="6" x2="32" y2="2" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="46" y1="10" x2="49" y2="7" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="54" y1="24" x2="58" y2="24" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="46" y1="38" x2="49" y2="41" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="18" y1="10" x2="15" y2="7" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="10" y1="24" x2="6" y2="24" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="18" y1="38" x2="15" y2="41" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <!-- Sun face -->
          <circle cx="28" cy="22" r="1.5" fill="${DARK}"/>
          <circle cx="36" cy="22" r="1.5" fill="${DARK}"/>
          <path d="M28 27 Q32 30 36 27" stroke="${DARK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
          <!-- File -->
          <rect x="42" y="30" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="44" y1="34" x2="50" y2="34" stroke="${TEAL}" stroke-width="1"/>
          <line x1="44" y1="37" x2="50" y2="37" stroke="${TEAL}" stroke-width="1"/>
        </g>`,
    },
    {
      name: 'July',
      season: 'summer',
      heroBg: 'linear-gradient(135deg, rgba(254,215,100,0.18) 0%, rgba(76,155,176,0.06) 100%)',
      heroParticle: 'none',
      bannerBg: '#FFFBEB',
      bannerBorder: '#F59E0B',
      bannerEmoji: '🏖️',
      bannerText: 'Planning your autumn range? Build your labels now, before you make your first batch. Future you will be grateful.',
      bannerCta: 'Plan ahead',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="sun-jul">
          <circle cx="32" cy="22" r="12" fill="#FDE68A" stroke="#F59E0B" stroke-width="2"/>
          <line x1="32" y1="4" x2="32" y2="1" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="47" y1="8" x2="50" y2="5" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="55" y1="22" x2="59" y2="22" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="47" y1="36" x2="50" y2="39" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="17" y1="8" x2="14" y2="5" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="9" y1="22" x2="5" y2="22" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="17" y1="36" x2="14" y2="39" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <circle cx="28" cy="20" r="1.5" fill="${DARK}"/>
          <circle cx="36" cy="20" r="1.5" fill="${DARK}"/>
          <path d="M28 25 Q32 28 36 25" stroke="${DARK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
          <!-- Sunglasses -->
          <rect x="25" y="18" width="5" height="4" rx="2" fill="${DARK}" opacity="0.7"/>
          <rect x="32" y="18" width="5" height="4" rx="2" fill="${DARK}" opacity="0.7"/>
          <line x1="30" y1="20" x2="32" y2="20" stroke="${DARK}" stroke-width="1"/>
          <!-- Sun lounger -->
          <rect x="10" y="44" width="26" height="6" rx="2" fill="#F59E0B" opacity="0.4"/>
          <line x1="14" y1="50" x2="12" y2="56" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>
          <line x1="32" y1="50" x2="34" y2="56" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>
          <rect x="42" y="30" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="44" y1="34" x2="50" y2="34" stroke="${TEAL}" stroke-width="1"/>
          <line x1="44" y1="37" x2="50" y2="37" stroke="${TEAL}" stroke-width="1"/>
        </g>`,
    },
    {
      name: 'August',
      season: 'summer',
      heroBg: 'linear-gradient(135deg, rgba(254,215,100,0.14) 0%, rgba(210,160,80,0.08) 100%)',
      heroParticle: 'none',
      bannerBg: '#FFF7ED',
      bannerBorder: '#F97316',
      bannerEmoji: '🍂',
      bannerText: 'Autumn is 6 weeks away — if you opened fragrance oils in February for Valentine\'s, they\'re now 6 months old. Worth a check.',
      bannerCta: 'Check your fragrance stock',
      bannerCtaUrl: 'knowledge.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="late-summer-aug">
          <!-- Sun lowering, first leaf -->
          <circle cx="32" cy="28" r="11" fill="#FDE68A" stroke="#F59E0B" stroke-width="2"/>
          <line x1="32" y1="11" x2="32" y2="8" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="45" y1="15" x2="48" y2="12" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="53" y1="28" x2="57" y2="28" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <line x1="11" y1="28" x2="7" y2="28" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
          <circle cx="29" cy="26" r="1.3" fill="${DARK}"/>
          <circle cx="35" cy="26" r="1.3" fill="${DARK}"/>
          <path d="M29 31 Q32 33 35 31" stroke="${DARK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
          <!-- First autumn leaf floating down -->
          <path d="M50 10 C52 8 56 10 54 14 C52 18 48 16 50 10Z" fill="#F97316" opacity="0.85"/>
          <line x1="52" y1="12" x2="52" y2="18" stroke="#EA580C" stroke-width="1"/>
          <rect x="40" y="40" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="42" y1="44" x2="48" y2="44" stroke="${TEAL}" stroke-width="1"/>
          <line x1="42" y1="47" x2="48" y2="47" stroke="${TEAL}" stroke-width="1"/>
        </g>`,
    },
    {
      name: 'September',
      season: 'autumn',
      heroBg: 'linear-gradient(135deg, rgba(234,160,80,0.16) 0%, rgba(76,155,176,0.08) 100%)',
      heroParticle: 'leaves',
      bannerBg: '#FFF7ED',
      bannerBorder: '#F97316',
      bannerEmoji: '🍁',
      bannerText: 'Autumn range launching — every new seasonal scent needs its own CLP label. Pumpkin spice, woodsmoke and dark amber often carry Warning signal words.',
      bannerCta: 'Build your autumn labels',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="autumn-sep">
          <!-- Leaf pile -->
          <ellipse cx="32" cy="50" rx="20" ry="7" fill="#F97316" opacity="0.3"/>
          <path d="M14 48 C16 44 20 46 18 50Z" fill="#F97316"/>
          <path d="M22 45 C24 40 30 43 26 48Z" fill="#EA580C"/>
          <path d="M32 44 C35 39 40 42 37 47Z" fill="#FDE68A"/>
          <path d="M40 46 C43 42 47 45 44 50Z" fill="#F97316"/>
          <path d="M46 48 C49 44 52 47 49 51Z" fill="#DC2626"/>
          <!-- File nestled in leaves -->
          <rect x="26" y="40" width="12" height="14" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="28" y1="44" x2="36" y2="44" stroke="${TEAL}" stroke-width="1"/>
          <line x1="28" y1="47" x2="36" y2="47" stroke="${TEAL}" stroke-width="1"/>
          <!-- Falling leaves -->
          <path d="M10 10 C12 8 16 10 14 14 C12 18 8 16 10 10Z" fill="#F97316" opacity="0.7"/>
          <path d="M50 6 C52 4 56 6 54 10 C52 14 48 12 50 6Z" fill="#EA580C" opacity="0.7"/>
          <path d="M56 20 C58 18 61 20 59 23 C57 26 54 24 56 20Z" fill="#FDE68A" opacity="0.7"/>
        </g>`,
    },
    {
      name: 'October',
      season: 'autumn',
      heroBg: 'linear-gradient(135deg, rgba(180,80,40,0.10) 0%, rgba(76,155,176,0.08) 100%)',
      heroParticle: 'leaves',
      bannerBg: '#FFF7ED',
      bannerBorder: '#EA580C',
      bannerEmoji: '🎃',
      bannerText: 'Halloween scents — dark musk, smoke and clove often carry Danger signal words. Make sure your labels are correct before you sell.',
      bannerCta: 'Check hazard data',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="halloween-oct">
          <!-- Ghost holding file -->
          <path d="M22 52 L22 28 C22 18 42 18 42 28 L42 52 L38 48 L34 52 L30 48 L26 52 Z" fill="white" stroke="#D1D5DB" stroke-width="1.5"/>
          <!-- Ghost eyes -->
          <ellipse cx="28" cy="30" rx="3" ry="4" fill="${DARK}"/>
          <ellipse cx="36" cy="30" rx="3" ry="4" fill="${DARK}"/>
          <!-- Ghost mouth -->
          <path d="M26 38 Q32 43 38 38" stroke="${DARK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <!-- File -->
          <rect x="42" y="32" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="44" y1="36" x2="50" y2="36" stroke="${TEAL}" stroke-width="1"/>
          <line x1="44" y1="39" x2="50" y2="39" stroke="${TEAL}" stroke-width="1"/>
          <!-- Pumpkin on ground -->
          <ellipse cx="14" cy="50" rx="7" ry="6" fill="#F97316"/>
          <line x1="14" y1="44" x2="14" y2="42" stroke="#22C55E" stroke-width="2"/>
          <path d="M10 48 Q14 45 18 48" stroke="${DARK}" stroke-width="1" fill="none"/>
          <circle cx="11" cy="50" r="1.5" fill="${DARK}"/>
          <circle cx="17" cy="50" r="1.5" fill="${DARK}"/>
        </g>`,
    },
    {
      name: 'November',
      season: 'winter',
      heroBg: 'linear-gradient(135deg, rgba(15,34,54,0.12) 0%, rgba(76,155,176,0.12) 100%)',
      heroParticle: 'snow',
      bannerBg: '#EFF6FF',
      bannerBorder: TEAL,
      bannerEmoji: '🎄',
      bannerText: 'Christmas labels sorted in November means a stress-free December. Don\'t wait — build your festive range labels now.',
      bannerCta: 'Build Christmas labels',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="snowman-forming-nov">
          <!-- Just a body, a head and a hat — he's coming back -->
          <circle cx="32" cy="40" r="11" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <circle cx="32" cy="23" r="7" fill="white" stroke="#B0C8D4" stroke-width="1.5" opacity="0.7"/>
          <!-- Hat (crooked, just arriving) -->
          <rect x="26" y="14" width="12" height="3" rx="1" fill="${DARK}" transform="rotate(-5,32,15)"/>
          <rect x="28" y="10" width="9" height="6" rx="1" fill="${DARK}" transform="rotate(-5,32,13)"/>
          <!-- No face yet — question marks -->
          <text x="28" y="26" font-size="8" fill="${TEAL}" font-family="Arial">?</text>
          <!-- One button -->
          <circle cx="32" cy="37" r="1.2" fill="${DARK}"/>
          <!-- Snow on ground -->
          <ellipse cx="32" cy="52" rx="18" ry="4" fill="white" stroke="#B0C8D4" stroke-width="1"/>
          <!-- File waiting -->
          <rect x="44" y="36" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5"/>
          <line x1="46" y1="40" x2="52" y2="40" stroke="${TEAL}" stroke-width="1"/>
          <line x1="46" y1="43" x2="52" y2="43" stroke="${TEAL}" stroke-width="1"/>
        </g>`,
    },
    {
      name: 'December',
      season: 'winter',
      heroBg: 'linear-gradient(135deg, rgba(15,34,54,0.14) 0%, rgba(76,155,176,0.14) 100%)',
      heroParticle: 'snow',
      bannerBg: '#EFF6FF',
      bannerBorder: TEAL,
      bannerEmoji: '🎅',
      bannerText: 'Year-end compliance review — is every product currently on sale correctly labelled? New supplier SDS over the holidays? Check in January.',
      bannerCta: 'Review your library',
      bannerCtaUrl: 'builder.html',
      btnLabel: 'Download PNG',
      character: `
        <g id="snowman-dec">
          <!-- Full snowman waving — completing the year -->
          <circle cx="32" cy="38" r="12" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <circle cx="32" cy="20" r="8" fill="white" stroke="#B0C8D4" stroke-width="1.5"/>
          <rect x="25" y="9" width="14" height="3" rx="1" fill="${DARK}"/>
          <rect x="27" y="5" width="10" height="6" rx="1" fill="${DARK}"/>
          <!-- Star on hat -->
          <polygon points="32,3 33,6 36,6 34,8 35,11 32,9 29,11 30,8 28,6 31,6" fill="#FDE68A"/>
          <circle cx="29.5" cy="18.5" r="1.2" fill="${DARK}"/>
          <circle cx="34.5" cy="18.5" r="1.2" fill="${DARK}"/>
          <!-- Big happy smile -->
          <path d="M28 23 Q32 27 36 23" stroke="${DARK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
          <circle cx="32" cy="31" r="1.2" fill="${DARK}"/>
          <circle cx="32" cy="35" r="1.2" fill="${DARK}"/>
          <circle cx="32" cy="39" r="1.2" fill="${DARK}"/>
          <!-- Waving arm -->
          <line x1="20" y1="34" x2="28" y2="37" stroke="${DARK}" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M44 30 Q50 24 52 28 Q50 32 44 34" stroke="${DARK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <!-- File in waving hand -->
          <rect x="50" y="24" width="10" height="12" rx="1" fill="white" stroke="${TEAL}" stroke-width="1.5" transform="rotate(15,55,30)"/>
          <line x1="52" y1="28" x2="58" y2="28" stroke="${TEAL}" stroke-width="1" transform="rotate(15,55,30)"/>
          <!-- Red scarf -->
          <path d="M24 27 Q32 30 40 27" stroke="#E53E3E" stroke-width="3" fill="none" stroke-linecap="round"/>
          <line x1="38" y1="27" x2="36" y2="33" stroke="#E53E3E" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Snow on ground -->
          <ellipse cx="32" cy="51" rx="18" ry="4" fill="white" stroke="#B0C8D4" stroke-width="1"/>
        </g>`,
    },
  ];

  // ── PARTICLES ──────────────────────────────────────────────────────
  function addParticles(type) {
    if (type === 'none') return;
    const existing = document.getElementById('clpeasy-particles');
    if (existing) existing.remove();
    const canvas = document.createElement('canvas');
    canvas.id = 'clpeasy-particles';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:0.5;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    const count = type === 'snow' ? 40 : 20;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: type === 'snow' ? Math.random() * 3 + 1 : Math.random() * 8 + 6,
        speed: Math.random() * 0.6 + 0.2,
        drift: (Math.random() - 0.5) * 0.4,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 2,
        color: type === 'leaves'
          ? ['#F97316','#EA580C','#FDE68A','#DC2626','#B45309'][Math.floor(Math.random()*5)]
          : 'rgba(200,230,245,0.8)'
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

  // ── SEASONAL HERO TINT ─────────────────────────────────────────────
  function applyHeroTint(m) {
    const hero = document.querySelector('.hero, #hero, [class*="hero"]');
    if (!hero) return;
    const existing = hero.style.backgroundImage || '';
    if (!existing.includes(m.heroBg)) {
      const overlay = document.createElement('div');
      overlay.id = 'clpeasy-season-tint';
      overlay.style.cssText = `position:absolute;inset:0;background:${m.heroBg};pointer-events:none;z-index:0;border-radius:inherit;transition:background 2s ease;`;
      hero.style.position = 'relative';
      const existing = document.getElementById('clpeasy-season-tint');
      if (existing) existing.remove();
      hero.insertBefore(overlay, hero.firstChild);
    }
  }

  // ── DOWNLOAD BUTTON CHARACTER ──────────────────────────────────────
  function injectCharacter(m) {
    const btns = document.querySelectorAll(
      'button, a, [class*="download"], [class*="btn"], [id*="download"]'
    );
    let target = null;
    btns.forEach(b => {
      if (b.textContent.toLowerCase().includes('download') ||
          b.textContent.toLowerCase().includes('png') ||
          b.textContent.toLowerCase().includes('cricut')) {
        if (!target) target = b;
      }
    });
    if (!target) return;
    let wrap = document.getElementById('clpeasy-character-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'clpeasy-character-wrap';
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';
      target.parentNode.insertBefore(wrap, target);
      wrap.appendChild(target);
    }
    let svg = document.getElementById('clpeasy-char-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.id = 'clpeasy-char-svg';
      svg.setAttribute('viewBox','0 0 64 64');
      svg.style.cssText = 'width:64px;height:64px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.12));transition:transform 0.3s ease;';
      svg.addEventListener('mouseenter', () => svg.style.transform = 'translateY(-4px) scale(1.05)');
      svg.addEventListener('mouseleave', () => svg.style.transform = '');
      wrap.insertBefore(svg, target);
    }
    svg.innerHTML = m.character;
  }

  // ── FOOTER SEASONAL BANNER ─────────────────────────────────────────
  function injectFooterBanner(m) {
    const existing = document.getElementById('clpeasy-season-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'clpeasy-season-banner';
    banner.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:200;
      background:${m.bannerBg};
      border-top:3px solid ${m.bannerBorder};
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
        <a href="${m.bannerCtaUrl}" style="background:${m.bannerBorder};color:white;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">${m.bannerCta} →</a>
        <button id="clpeasy-banner-close" style="background:none;border:none;color:#9CA3AF;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;" aria-label="Close">×</button>
      </div>
    `;
    document.body.appendChild(banner);
    // Slide in after 4 seconds if not dismissed this session
    const dismissKey = `clpeasy-banner-dismissed-${new Date().getMonth()}`;
    if (!sessionStorage.getItem(dismissKey)) {
      setTimeout(() => { banner.style.transform = 'translateY(0)'; }, 4000);
    }
    document.getElementById('clpeasy-banner-close').addEventListener('click', () => {
      banner.style.transform = 'translateY(100%)';
      sessionStorage.setItem(dismissKey, '1');
    });
  }

  // ── INIT ───────────────────────────────────────────────────────────
  function init() {
    const month = new Date().getMonth(); // 0 = January
    const m = MONTHS[month];
    applyHeroTint(m);
    injectCharacter(m);
    injectFooterBanner(m);
    addParticles(m.heroParticle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

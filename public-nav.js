(function(){function init(){var nav=document.querySelector('.public-site-nav');if(!nav)return;var file=(location.pathname.split('/').pop()||'index.html').toLowerCase();var links=nav.querySelector('.public-nav-links');var toggle=nav.querySelector('.public-nav-toggle');if(!links)return;links.innerHTML='<a class="public-nav-link" href="index.html#features">How it works</a><a class="public-nav-link" href="index.html#about">Our story</a><div class="public-nav-group"><button class="public-nav-trigger" type="button" aria-expanded="false">Create labels <span class="chev" aria-hidden="true">⌄</span></button><div class="public-mega"><a href="builder.html"><span class="public-mega-icon">✦</span><strong>Label Builder</strong><small>Create a GB CLP label from your supplier SDS</small></a><a href="print.html"><span class="public-mega-icon">▦</span><strong>Print Sheet Composer</strong><small>Arrange finished labels onto print-ready sheets</small></a><a href="showcase.html"><span class="public-mega-icon">◫</span><strong>Label Showcase</strong><small>See CLPeasy label sizes and formats</small></a><a href="pricing.html"><span class="public-mega-icon">£</span><strong>Plans & PAYG</strong><small>Choose the option that fits how often you make labels</small></a></div></div><div class="public-nav-group"><button class="public-nav-trigger" type="button" aria-expanded="false">Resources <span class="chev" aria-hidden="true">⌄</span></button><div class="public-mega"><a href="knowledge.html"><span class="public-mega-icon">i</span><strong>Knowledge Base</strong><small>Plain-English help with GB CLP labelling</small></a><a href="/knowledge/printing-and-cutting"><span class="public-mega-icon">▤</span><strong>Print your labels</strong><small>Visual printing guides and your questions answered</small></a><a href="compliance.html"><span class="public-mega-icon">✓</span><strong>GB CLP guidance</strong><small>Understand the rules behind your label</small></a><a href="making-guides.html"><span class="public-mega-icon">◇</span><strong>Making Guides &amp; Resources</strong><small>External guides for fragrance-product makers</small></a><a href="design-ideas.html"><span class="public-mega-icon">✧</span><strong>Design Ideas &amp; Inspiration</strong><small>Explore creative projects and maker showcases</small></a><a href="faq.html"><span class="public-mega-icon">?</span><strong>FAQs</strong><small>Quick answers about CLPeasy and label creation</small></a><a href="support.html"><span class="public-mega-icon">♡</span><strong>Support</strong><small>Get help using CLPeasy</small></a></div></div><a class="public-nav-link" href="pricing.html" data-page="pricing.html">Pricing</a><a class="public-nav-link" href="auth.html?mode=signin">Sign in</a><a class="public-nav-link public-nav-cta" href="auth.html?mode=signup" data-trial-cta="nav">Start free trial →</a>';if(file!=='index.html'){var home=document.createElement('a');home.className='public-nav-link';home.href='index.html';home.textContent='Home';links.insertBefore(home,links.firstChild)}nav.querySelectorAll('[data-page]').forEach(function(a){if(a.getAttribute('data-page')===file)a.setAttribute('aria-current','page')});function closeGroups(except){nav.querySelectorAll('.public-nav-group.open').forEach(function(g){if(g!==except){g.classList.remove('open');g.querySelector('.public-nav-trigger').setAttribute('aria-expanded','false')}})}nav.querySelectorAll('.public-nav-trigger').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();var g=btn.closest('.public-nav-group');var opening=!g.classList.contains('open');closeGroups(g);g.classList.toggle('open',opening);btn.setAttribute('aria-expanded',String(opening))});btn.addEventListener('blur',function(){if(window.matchMedia('(min-width:1121px)').matches&&!btn.closest('.public-nav-group').matches(':focus-within')){btn.setAttribute('aria-expanded','false')}})});if(toggle){toggle.addEventListener('click',function(){var open=nav.classList.toggle('menu-open');toggle.setAttribute('aria-expanded',String(open));if(!open)closeGroups()})}document.addEventListener('click',function(e){if(!nav.contains(e.target))closeGroups()});document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeGroups();if(nav.classList.contains('menu-open')){nav.classList.remove('menu-open');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.focus()}}}});if(typeof window.updateHomepageAccountCtas==='function')window.updateHomepageAccountCtas();if(typeof window.applySignedInCtas==='function'){var hasStoredSession=false;try{hasStoredSession=!!localStorage.getItem('sb-qvkosdqcryrcfbjtaxic-auth-token')}catch(e){}window.applySignedInCtas(hasStoredSession);}links.addEventListener('click',function(e){if(e.target.closest('a')&&window.matchMedia('(max-width:1120px)').matches){nav.classList.remove('menu-open');if(toggle)toggle.setAttribute('aria-expanded','false')}})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init()})();
// Keep the launch offer visible beneath the shared public navigation.
(function(){
  function offerHeader(){
    const nav=document.querySelector('.public-site-nav');
    if(!nav)return;
    const expiry=new Date('2027-01-01T00:00:00Z').getTime();
    const isShowcase=/\/showcase(?:\.html)?\/?$/i.test(location.pathname);
    if(Date.now()>=expiry){
      if(isShowcase){
        const reserveNav=()=>{document.body.style.paddingTop=nav.getBoundingClientRect().bottom+'px'};
        reserveNav();
        new ResizeObserver(reserveNav).observe(nav);
        window.addEventListener('resize',reserveNav);
      }
      return;
    }
    let offer=document.getElementById('homepage-offer-banner');
    const wasHomepageOffer=!!offer;
    if(!offer){
      offer=document.createElement('div');
      offer.id='homepage-offer-banner';
      offer.innerHTML='Launch offer until 31 December 2026: <strong>10% off Easy Start Unlimited monthly + 3 bonus downloads with every PAYG pack</strong> <a href="pricing.html">See offer →</a>';
      document.body.appendChild(offer);
    }
    offer.setAttribute('role','region');
    offer.setAttribute('aria-label','Launch offer');
    const style=document.createElement('style');
    style.textContent='#homepage-offer-banner{position:fixed!important;left:0;right:0;z-index:999;margin-top:0!important;background:#0f2236;color:white;text-align:center;padding:9px 20px;font:600 13px/1.45 "DM Sans",sans-serif;box-sizing:border-box}#homepage-offer-banner a{color:white;text-decoration:underline;margin-left:10px;white-space:nowrap}@media(max-width:480px){#homepage-offer-banner{padding:8px 12px!important;font-size:11px!important}}';
    document.head.appendChild(style);
    const basePadding=parseFloat(getComputedStyle(document.body).paddingTop)||0;
    function sync(){
      const navBottom=nav.getBoundingClientRect().bottom;
      offer.style.setProperty('top',navBottom+'px','important');
      offer.style.setProperty('margin-top','0','important');
      document.body.style.paddingTop=((isShowcase?Math.max(basePadding,navBottom):basePadding)+offer.getBoundingClientRect().height+(!isShowcase&&wasHomepageOffer?navBottom:0))+'px';
    }
    sync();
    const observer=new ResizeObserver(sync);
    observer.observe(nav);observer.observe(offer);
    window.addEventListener('resize',sync);
    new MutationObserver(sync).observe(nav,{attributes:true,attributeFilter:['style','class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',offerHeader);else offerHeader();
})();

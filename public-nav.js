(function(){
  function init(){
    var nav=document.querySelector('.public-site-nav');
    if(!nav)return;

    var toggle=nav.querySelector('.public-nav-toggle');
    var links=nav.querySelector('.public-nav-links');
    if(toggle&&links){
      toggle.addEventListener('click',function(){
        var open=nav.classList.toggle('menu-open');
        toggle.setAttribute('aria-expanded',String(open));
      });
      links.addEventListener('click',function(e){
        if(e.target.closest('a')){nav.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');}
      });
      document.addEventListener('keydown',function(e){
        if(e.key==='Escape'&&nav.classList.contains('menu-open')){
          nav.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');toggle.focus();
        }
      });
    }

    var file=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    var mode=new URLSearchParams(location.search).get('mode');

    /* Keep the menu useful instead of repeating the page the visitor is already on.
       The logo remains the Home route everywhere, and internal pages also retain
       the explicit Home item. */
    nav.querySelectorAll('[data-page]').forEach(function(a){
      var page=(a.getAttribute('data-page')||'').toLowerCase();
      if(page===file){
        a.setAttribute('aria-current','page');
        if(file!=='auth.html')a.hidden=true;
      }
    });

    /* Home does not need a second Home control beside the logo. */
    if(file==='index.html'){
      var home=nav.querySelector('[data-page="index.html"]');
      if(home)home.hidden=true;
    }

    /* On auth screens, offer the useful opposite action rather than linking
       the visitor back to the auth mode they are already viewing. */
    if(file==='auth.html'){
      var signIn=nav.querySelector('a[href*="mode=signin"]');
      var signUp=nav.querySelector('a[href*="mode=signup"]');
      if(mode==='signup'){
        if(signUp)signUp.hidden=true;
        if(signIn){signIn.hidden=false;signIn.removeAttribute('aria-current');}
      }else{
        if(signIn)signIn.hidden=true;
        if(signUp)signUp.hidden=false;
      }
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

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

    /* Keep the current section visible for orientation; mark it accessibly. */
    nav.querySelectorAll('[data-page]').forEach(function(a){
      if((a.getAttribute('data-page')||'').toLowerCase()===file)a.setAttribute('aria-current','page');
    });

    /* On Home the logo already provides the Home route, so avoid duplication. */
    if(file==='index.html'){
      var home=nav.querySelector('[data-page="index.html"]');
      if(home)home.hidden=true;
    }

    /* Authentication is the only context where showing the action the visitor
       is already completing is redundant. Offer the opposite useful action. */
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

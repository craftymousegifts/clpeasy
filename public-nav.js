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
        if(e.key==='Escape'){nav.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');toggle.focus();}
      });
    }
    var file=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    nav.querySelectorAll('[data-page]').forEach(function(a){
      if(a.getAttribute('data-page')===file)a.setAttribute('aria-current','page');
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
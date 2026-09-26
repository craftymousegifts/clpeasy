// Arc product-name vs business-name overlap on circles, using per-glyph extents of the arc text.
const path=require('path');const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('file://'+path.join(__dirname,'harness.html'));await p.waitForTimeout(1500);
const out=await p.evaluate(()=>{const res=[];
 const names=['Rose','Lavender Fields','Midnight Blackberry','Christmas Spiced Orange & Cinnamon','Fresh Linen & White Cotton','Midnight Blackberry, Bay Leaf & Smoked Vanilla'];
 for(const mm of [52,63,80,100,150])for(const n of names){
  const r=LabelRenderer.renderLabel({shape:'circle',size:'custom',customW:mm,customH:mm,scentName:n,productType:'Scented Candle',bizName:'Crafty Test Studio',bizAddress:'12 Mill Lane',bizPhone:'01234 567890',signal:'Warning',hStatements:'H317',pStatements:'P102',sensitisers:['Linalool'],pictograms:['exclamation']},{instanceId:'a'+mm+n.length});
  const s=document.getElementById('stage');s.innerHTML=r.svg;const svg=s.querySelector('svg');
  const arcT=[...svg.querySelectorAll('text')].find(t=>t.querySelector('textPath'));const biz=[...svg.querySelectorAll('text')].find(t=>t.textContent.trim()==='Crafty Test Studio');
  const bb=biz.getBBox();const by0=bb.y+bb.height*0.2,by1=bb.y+bb.height*0.8;let hits=0,rendered=0;const n2=arcT.getNumberOfChars();
  for(let i=0;i<n2;i++){let e;try{e=arcT.getExtentOfChar(i)}catch(x){continue}if(e.width>0)rendered++;const cy=e.y+e.height*0.5;if(e.x<bb.x+bb.width&&e.x+e.width>bb.x&&e.y+e.height*0.8>by0&&e.y+e.height*0.2<by1)hits++;}
  res.push({mm,n,fits:r.fits,overlapGlyphs:hits,chars:n2,arcLen:+arcT.getComputedTextLength().toFixed(0),pathLen:+svg.querySelector('path').getTotalLength().toFixed(0),scentMm:+(r.metrics.fontSizes.scent/(260/mm)).toFixed(2)});}
 return res;});
out.forEach(o=>console.log(JSON.stringify(o)));await b.close();})();

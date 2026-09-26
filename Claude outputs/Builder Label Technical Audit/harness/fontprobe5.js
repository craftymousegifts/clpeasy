const path=require('path');const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.join(__dirname,'harness.html'));await p.waitForTimeout(1500);
const out=await p.evaluate(async()=>{await document.fonts.load('400 20px "DM Sans"');await document.fonts.load('700 20px "DM Sans"');
 const txts=['Contains: Linalool, Limonene, Hexyl Cinnamal, Benzyl Salicylate','May cause an allergic skin reaction. Harmful to aquatic life with long lasting effects.','Crafty Test Studio','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'];
 const c=document.createElement('canvas').getContext('2d');const m=(f,t)=>{c.font=f;return c.measureText(t).width};
 return txts.map(t=>({t:t.slice(0,30),
  'DMSans400/LiberationSans400(Arial-metric)':+(m('400 60px "DM Sans"',t)/m('400 60px "Liberation Sans"',t)).toFixed(3),
  'DMSans700/LiberationSans700':+(m('700 60px "DM Sans"',t)/m('700 60px "Liberation Sans"',t)).toFixed(3),
  'DMSans400/DejaVuSans400':+(m('400 60px "DM Sans"',t)/m('400 60px "DejaVu Sans"',t)).toFixed(3),
  'DejaVuSerif700/LiberationSerif700(Times-metric)':+(m('700 60px "DejaVu Serif"',t)/m('700 60px "Liberation Serif"',t)).toFixed(3)}));});
console.log(JSON.stringify(out,null,1));await b.close();})();

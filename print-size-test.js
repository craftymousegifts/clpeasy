/* Blank geometry only. This module never renders label artwork or uses download allowances. */
(function(root){
  'use strict';
  function validate(data){
    if(!data||!Array.isArray(data.boxes)||!data.boxes.length||data.boxes.length>500)throw Error('Choose a label size or sheet layout first.');
    return {sheet:!!data.sheet,boxes:data.boxes.map(function(b){
      var box={shape:b.shape,x:Number(b.x),y:Number(b.y),w:Number(b.w),h:Number(b.h)};
      if(!['circle','square','rectangle'].includes(box.shape)||!['x','y','w','h'].every(function(k){return Number.isFinite(box[k]);})||box.w<1||box.h<1||box.x<0||box.y<0||box.x+box.w>210.01||box.y+box.h>297.01)throw Error('This layout does not fit on A4. Adjust the label size, margins or sheet layout and try again.');
      if(box.shape!=='rectangle'&&Math.abs(box.w-box.h)>.01)throw Error('Circle and square tests need equal width and height.');
      return box;
    })};
  }
  function single(shape,w,h){return validate({boxes:[{shape:shape,x:20,y:65,w:w,h:h}]});}
  function open(data){try{var clean=validate(data);root.open('/print-size-test.html#'+encodeURIComponent(JSON.stringify(clean)),'_blank','noopener');}catch(e){root.alert(e.message);}}
  function svg(data){
    data=validate(data);
    var shapes=data.boxes.map(function(b){
      var outline=b.shape==='circle'?'<circle cx="'+(b.x+b.w/2)+'" cy="'+(b.y+b.h/2)+'" r="'+b.w/2+'"/>':'<rect x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+'"/>';
      return outline;
    }).join('');
    var ruler=data.sheet?'':'<g stroke="black" stroke-width="0.2"><path d="M20 40H70 M20 37V43 M70 37V43"/></g><text x="20" y="34">This line must measure 50 mm</text><text x="20" y="55">Label outline: '+data.boxes[0].w+' × '+data.boxes[0].h+' mm</text>';
    var heading=data.sheet?'':'<text x="20" y="15">CLPeasy® — SIZE TEST ONLY</text><text x="20" y="23">A4 · Actual size / 100% · Measure before using label stock</text>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" role="img" aria-label="A4 blank label size test"><g fill="black" font-family="Arial,sans-serif" font-size="3.5">'+heading+ruler+'</g><g fill="none" stroke="black" stroke-width="0.2">'+shapes+'</g></svg>';
  }
  var api={validate:validate,single:single,open:open,svg:svg};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CLPSizeTest=api;
  if(!root.document||!root.document.getElementById('size-test-page'))return;
  var d=root.document,output=d.getElementById('test-artwork'),status=d.getElementById('test-status'),print=d.getElementById('print-test');
  try{
    var raw=decodeURIComponent(root.location.hash.slice(1));
    if(raw.length>100000)throw Error('This test layout is too large.');
    var data=validate(JSON.parse(raw));output.innerHTML=svg(data);
    status.textContent=data.sheet?'A4 sheet alignment test · '+data.boxes.length+' blank outlines. Hold the paper against your label sheet to check alignment.':'Selected label: '+data.boxes[0].w+' × '+data.boxes[0].h+' mm. Measure the outline and the 50 mm line.';
    print.disabled=false;print.addEventListener('click',function(){root.print();});
  }catch(e){status.textContent='Open this test from the Label Builder or Print Sheet Composer after choosing your size. '+e.message;}
})(typeof window==='object'?window:globalThis);

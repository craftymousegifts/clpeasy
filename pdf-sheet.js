/* Genuine PDF wrapper for the Print Sheet Composer (31 Oct 2026, founder-approved).
 * Wraps the Composer's existing finished A4 canvas, unchanged pixel for pixel,
 * in a one-page PDF whose page is exactly the sheet size in millimetres.
 * Why: iPhone Safari ignores CSS @page margin:0 when printing a web page and
 * shrinks A4-wide content to ~88% (50 mm printed as ~44 mm). A genuine PDF
 * file printed from the iPhone measured 50 mm. No dependencies: the image is
 * stored losslessly (8-bit RGB, FlateDecode via the browser's
 * CompressionStream, which PDF FlateDecode reads directly as zlib data).
 * This module never touches download accounting; the caller builds the PDF
 * BEFORE consuming a download, exactly as it built the print page before. */
(function(root){
  'use strict';
  var PT_PER_MM=72/25.4;
  function supported(){
    return typeof root.CompressionStream==='function'&&typeof root.Blob==='function'&&
      typeof root.Response==='function'&&typeof root.TextEncoder==='function';
  }
  function deflate(bytes){
    var stream=new root.Blob([bytes]).stream().pipeThrough(new root.CompressionStream('deflate'));
    return new root.Response(stream).arrayBuffer().then(function(b){return new Uint8Array(b);});
  }
  function rgbFromCanvas(canvas){
    var w=canvas.width,h=canvas.height,src=canvas.getContext('2d').getImageData(0,0,w,h).data;
    var rgb=new Uint8Array(w*h*3);
    for(var i=0,j=0;i<src.length;i+=4){rgb[j++]=src[i];rgb[j++]=src[i+1];rgb[j++]=src[i+2];}
    return rgb;
  }
  function pdfText(s){return '('+String(s).replace(/[^\x20-\x7E]/g,'').replace(/[\\()]/g,'\\$&')+')';}
  function num(v){return (Math.round(v*10000)/10000).toFixed(4);}
  // canvas: finished sheet canvas; opts: {widthMm, heightMm, title}
  function fromCanvas(canvas,opts){
    opts=opts||{};
    var wMm=Number(opts.widthMm),hMm=Number(opts.heightMm);
    if(!supported())return Promise.reject(new Error('PDF generation is not supported in this browser'));
    if(!canvas||!(canvas.width>0)||!(canvas.height>0))return Promise.reject(new Error('No sheet image'));
    if(!(wMm>0)||!(hMm>0))return Promise.reject(new Error('Invalid sheet size'));
    var enc=new root.TextEncoder(),pxW=canvas.width,pxH=canvas.height;
    return deflate(rgbFromCanvas(canvas)).then(function(img){
      var wPt=num(wMm*PT_PER_MM),hPt=num(hMm*PT_PER_MM);
      // The image fills the page exactly: scale the unit square to the page.
      var content=enc.encode('q '+wPt+' 0 0 '+hPt+' 0 0 cm /Im1 Do Q');
      var objs=[
        [enc.encode('<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>')],
        [enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')],
        [enc.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+wPt+' '+hPt+'] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>')],
        [enc.encode('<< /Type /XObject /Subtype /Image /Width '+pxW+' /Height '+pxH+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length '+img.length+' >>\nstream\n'),img,enc.encode('\nendstream')],
        [enc.encode('<< /Length '+content.length+' >>\nstream\n'),content,enc.encode('\nendstream')],
        [enc.encode('<< /Title '+pdfText(opts.title||'CLPeasy Print Sheet')+' /Producer (CLPeasy) >>')]
      ];
      var head=enc.encode('%PDF-1.4\n%âã\n'),parts=[head],offset=head.length,xref=[];
      objs.forEach(function(o,i){
        xref.push(offset);
        [enc.encode((i+1)+' 0 obj\n')].concat(o,[enc.encode('\nendobj\n')]).forEach(function(p){parts.push(p);offset+=p.length;});
      });
      var tail='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+xref.map(function(o){return ('0000000000'+o).slice(-10)+' 00000 n \n';}).join('')+
        'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info '+objs.length+' 0 R >>\nstartxref\n'+offset+'\n%%EOF\n';
      parts.push(enc.encode(tail));
      var blob=new root.Blob(parts,{type:'application/pdf'});
      if(!(blob.size>img.length))throw new Error('PDF assembly failed');
      return {blob:blob,widthMm:wMm,heightMm:hMm,widthPx:pxW,heightPx:pxH,widthPt:Number(wPt),heightPt:Number(hPt)};
    });
  }
  var api={supported:supported,fromCanvas:fromCanvas,PT_PER_MM:PT_PER_MM};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CLPSheetPDF=api;
})(typeof window==='object'?window:globalThis);

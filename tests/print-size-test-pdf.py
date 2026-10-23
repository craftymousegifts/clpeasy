# Independent print-layout check. Run from repository root.
# QA dependencies: weasyprint and PyMuPDF. Output stays in tmp/pdfs/.
from pathlib import Path
import json,subprocess
from weasyprint import HTML
import fitz
Path('tmp/pdfs').mkdir(parents=True, exist_ok=True)
html=Path('print-size-test.html').read_text()
samples={
 'circle-63':{'boxes':[{'shape':'circle','x':20,'y':65,'w':63,'h':63}]},
 'rectangle-80x100':{'boxes':[{'shape':'rectangle','x':20,'y':65,'w':80,'h':100}]},
 'sheet-52':{'sheet':True,'boxes':[{'shape':'circle','x':10+c*57,'y':10+r*57,'w':52,'h':52} for r in range(5) for c in range(3)]}
}
for name,data in samples.items():
 svg=subprocess.check_output(['node','-e','const a=require("./print-size-test.js");process.stdout.write(a.svg(JSON.parse(process.argv[1])));',json.dumps(data)]).decode()
 src=html.replace('<div class="paper" id="test-artwork"></div>','<div class="paper" id="test-artwork">'+svg+'</div>').replace('</body>','<aside>UNWANTED THIRD PARTY TOOLBAR</aside></body>')
 out=Path('tmp/pdfs')/(name+'.pdf');HTML(string=src).write_pdf(out)
 doc=fitz.open(out);assert len(doc)==1,(name,len(doc))
 page=doc[0];assert abs(page.rect.width*25.4/72-210)<.01;assert abs(page.rect.height*25.4/72-297)<.01
 txt=page.get_text();assert 'UNWANTED' not in txt;assert 'Print / Save' not in txt
 paths=page.get_drawings();expected=52 if data.get('sheet') else data['boxes'][0]['w']
 boxes=[p['rect'] for p in paths if abs(p['rect'].width*25.4/72-expected)<.01]
 assert len(boxes)==len(data['boxes']),(name,len(boxes))
 for r,b in zip(boxes,data['boxes']):
  assert abs(r.height*25.4/72-b['h'])<.01
  assert abs(r.x0*25.4/72-b['x'])<.01
  assert abs(r.y0*25.4/72-b['y'])<.01
 if not data.get('sheet'):assert any(abs(p['rect'].width*25.4/72-50)<.01 for p in paths)
 print(name+': one A4 page; exact outline sizes/positions within 0.01 mm; screen controls excluded')
 if name=='circle-63':page.get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save('tmp/pdfs/circle-63.png')

const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('builder.html','utf8');

assert(html.includes('SDS / CLP fragrance percentage'),'source SDS percentage field missing');
assert(html.includes('id="sds-percentage-check"'),'percentage comparison result missing');
assert(html.includes('if(!_requireSdsPercentageMatch())return;'),'Smart Paste must block mismatched/unknown percentages');
assert(html.includes('CLPeasy does not currently calculate a finished-mixture classification from a neat SDS'),'100% SDS guard wording missing');
assert(html.includes("out.dataset.status=actual>sds?'higher':'lower'"),'higher/lower mismatch states missing');
assert(!html.includes('Fragrance load % <span>(optional)</span>'),'fragrance load must not remain labelled optional');
assert(html.includes('Please enter the fragrance load you actually use before continuing.'),'Step 2 fragrance load gate missing');

console.log('SDS percentage match gate: PASS');

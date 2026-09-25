const fs=require('fs');
const assert=require('assert');

const print=fs.readFileSync('print.html','utf8');
const builder=fs.readFileSync('builder.html','utf8');
const pricing=fs.readFileSync('pricing.html','utf8');
const checkout=fs.readFileSync('supabase/functions/create-checkout-session/index.ts','utf8');
const webhook=fs.readFileSync('supabase/functions/stripe-webhook/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925000000_atomic_download_accounting.sql','utf8');

assert.match(migration,/for update;/i,'profile row must be locked for atomic consumption');
assert.match(migration,/topup_credits\s*=\s*coalesce\(topup_credits,0\)\s*-\s*1/i,'purchased downloads must decrement atomically');
assert.match(migration,/downloads_used\s*=\s*coalesce\(downloads_used,0\)\s*\+\s*1/i,'plan allowance must increment atomically');
assert.match(migration,/v_profile\.trial_end\s*>\s*v_now/i,'expired trials must not consume trial allowance');
assert.match(migration,/v_recent\s*>?=\s*v_now\s*-\s*interval '7 days'/i,'same-label 7-day grace must be preserved');
assert.match(migration,/grant execute on function public\.consume_download\(text\) to authenticated/i,'only authenticated app users should execute accounting RPC');

assert.match(print,/\.from\('profiles'\)[\s\S]*topup_credits/,'Composer entitlement must use profile allowance/purchased downloads');
assert.ok(!print.includes("from('subscriptions').select('plan,status')"),'Composer must not gate PAYG on subscriptions table');
assert.match(print,/sbClient\.rpc\('consume_download',\{p_label_key:null\}\)/,'Composer must consume through atomic RPC');
assert.match(print,/One complete A4 sheet is one finished exported file[\s\S]*consumeComposerDownload\(\)/,'A4 export must consume exactly once at sheet level');
assert.match(print,/A ZIP is one finished exported file[\s\S]*consumeComposerDownload\(\)/,'ZIP export must consume one download');
assert.match(print,/"Download one by one" creates separate finished PNG files[\s\S]*consumeComposerDownload\(\)/,'sequential PNG export must consume per file');
assert.match(print,/Buy downloads or choose a plan/,'zero-balance message must work for PAYG and subscriptions');
const consumeBody=print.slice(print.indexOf('async function consumeComposerDownload'),print.indexOf('function updateProGate'));
assert.ok(!consumeBody.includes('await refreshProEntitlement()'),'final paid download must not become watermarked before rendering');

assert.match(pricing,/Give your CLP labels a new lease of life for the rest of 2026\./,'launch headline must be present');
assert.match(pricing,/3 extra downloads FREE/,'PAYG launch must advertise three free downloads');
assert.match(pricing,/10% off until 31 December 2026/,'subscription launch saving must show its end date');
assert.match(checkout,/paygDownloads[\s\S]*"8"[\s\S]*"5"/,'checkout must award 8 downloads during launch and revert to 5');
assert.match(webhook,/downloads !== 5 && downloads !== 8/,'webhook must accept normal and launch PAYG quantities only');

assert.match(builder,/sbClient\.rpc\('consume_download',\{p_label_key:labelKey\|\|null\}\)/,'Builder must consume individual exports through atomic RPC');
assert.ok(!builder.includes("from('subscriptions').select('plan,status')"),'Builder must not gate PAYG on subscriptions table');
assert.match(builder,/subscription_status,trial_end,topup_credits/,'Builder clean-export entitlement must use profiles');
assert.match(builder,/const purchased=\(prof\.topup_credits\|\|0\)>0/,'PAYG balance must unlock clean Builder export');
assert.match(builder,/return scent\+'::'\+type/,'Builder must pass stable label identity for 7-day grace');
assert.ok(!builder.includes("sbClient.rpc('consume_topup_credit')"),'Builder must not use legacy non-atomic top-up consumption');
assert.ok(!builder.includes("from('label_downloads')"),'Builder must leave 7-day grace lookup/update to atomic RPC');

assert.match(print,/100% \/ Actual Size/,'printing help must require 100% / Actual Size');
assert.match(print,/Do not use “Fit to page” or “Scale to fit”/,'printing help must warn against scaling');
assert.match(print,/No download has been used/,'failed PDF rendering/popup must tell customer no download was consumed');
const zipGenerate=print.indexOf("zip.generateAsync({type:'blob'})");
const zipCharge=print.indexOf('const charge=await consumeComposerDownload();',zipGenerate);
assert.ok(zipGenerate>=0 && zipCharge>zipGenerate,'ZIP must be generated before its download is consumed');

console.log('PAYG download accounting checks passed');

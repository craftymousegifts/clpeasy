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
assert.match(migration,/set_config\('request\.jwt\.claim\.role',\s*'service_role',\s*true\)/i,'accounting RPC must locally bypass the billing-field protection trigger');
assert.match(migration,/revoke all on function public\.consume_download\(text\) from anon/i,'anon must not execute download accounting RPC');
assert.match(migration,/revoke all on function public\.credit_purchased_downloads\(uuid, integer\) from anon/i,'anon must not execute PAYG credit RPC');
assert.match(migration,/add column if not exists clean_export boolean not null default false/i,'re-download history must preserve clean vs watermarked entitlement');
assert.match(migration,/select last_downloaded_at, clean_export into v_recent, v_clean_export/i,'free re-download must recover original export entitlement');
assert.match(migration,/'clean_export', v_clean_export/i,'accounting RPC must return the authorised export entitlement');

assert.match(print,/\.from\('profiles'\)[\s\S]*topup_credits/,'Composer entitlement must use profile allowance/purchased downloads');
assert.ok(!print.includes("from('subscriptions').select('plan,status')"),'Composer must not gate PAYG on subscriptions table');
assert.match(print,/sbClient\.rpc\('consume_download',\{p_label_key:null\}\)/,'Composer must consume through atomic RPC');
assert.match(print,/finished A4 sheet[\s\S]*const charge=await consumeComposerDownload\(\)/,'A4 export must consume exactly once at sheet level');
assert.match(print,/A ZIP is one finished exported file[\s\S]*consumeComposerDownload\(\)/,'ZIP export must consume one download');
assert.match(print,/"Download one by one" creates separate finished PNG files[\s\S]*consumeComposerDownload\(\)/,'sequential PNG export must consume per file');
assert.match(print,/Buy downloads or choose a plan/,'zero-balance message must work for PAYG and subscriptions');
const consumeBody=print.slice(print.indexOf('async function consumeComposerDownload'),print.indexOf('function updateProGate'));
assert.ok(!consumeBody.includes('await refreshProEntitlement()'),'final paid download must not become watermarked before rendering');

// v9 approved pricing design (four cards: Easy Trial | Pay As You Go | Easy Start | Easy Pro)
// replaced the earlier standalone launch banner and its headline.
const cardOrder=['<!-- 1: EASY TRIAL -->','<!-- 2: PAY AS YOU GO -->','<!-- 3: EASY START -->','<!-- 4: EASY PRO -->'].map(m=>pricing.indexOf(m));
assert.ok(cardOrder.every((v,i)=>v>0&&(i===0||v>cardOrder[i-1])),'pricing cards must be ordered Easy Trial, Pay As You Go, Easy Start, Easy Pro');
assert.match(pricing,/8 downloads for £4\.99/,'PAYG card must show the 2026 launch allowance');
assert.match(pricing,/id="btn-payg" onclick="startPaygCheckout\(\)"[^>]*>Buy 8 downloads — £4\.99/,'PAYG CTA must start PAYG checkout');
assert.match(pricing,/3 extra downloads FREE/,'PAYG launch must advertise three free downloads');
assert.match(pricing,/10% off until 31&nbsp;December&nbsp;2026/,'subscription launch saving must show its end date');
assert.match(pricing,/Annual saving is compared with standard monthly prices/,'annual savings must be explained against standard monthly prices');
assert.match(checkout,/paygDownloads[\s\S]*"8"[\s\S]*"5"/,'checkout must award 8 downloads during launch and revert to 5');
assert.match(webhook,/downloads !== 5 && downloads !== 8/,'webhook must accept normal and launch PAYG quantities only');
assert.match(webhook,/\.rpc\([\s\S]*'credit_purchased_downloads'[\s\S]*p_downloads: downloads/,'PAYG webhook must credit purchases atomically');
assert.match(migration,/topup_credits\s*=\s*coalesce\(topup_credits,0\)\s*\+\s*p_downloads/i,'PAYG purchase credit RPC must increment atomically');
assert.match(migration,/grant execute on function public\.credit_purchased_downloads\(uuid, integer\) to service_role/i,'only the webhook service role may credit PAYG purchases');
assert.match(webhook,/stripe_processed_events'[\s\S]*\.delete\(\)[\s\S]*\.eq\('event_id', event\.id\)/,'failed webhook processing must release its idempotency claim so Stripe retry can recover');

assert.match(builder,/sbClient\.rpc\('consume_download',\{p_label_key:labelKey\|\|null\}\)/,'Builder must consume individual exports through atomic RPC');
assert.ok(!builder.includes("from('subscriptions').select('plan,status')"),'Builder must not gate PAYG on subscriptions table');
assert.match(builder,/select\('subscription_status,trial_end,deletion_date,plan,downloads_limit,topup_credits'\)/,'Builder clean-export entitlement must use profiles');
assert.match(builder,/S\.isPro=window\.CLPEntitlement\.summarise\(prof\)\.cleanPreview/,'Builder clean preview must use the shared entitlement rules (PAYG balance unlocks it; behaviour covered in tests/entitlement-unit.js)');
assert.match(builder,/return scent\+'::'\+type/,'Builder must pass stable label identity for 7-day grace');
assert.ok(!builder.includes("sbClient.rpc('consume_topup_credit')"),'Builder must not use legacy non-atomic top-up consumption');
assert.ok(!builder.includes("from('label_downloads')"),'Builder must leave 7-day grace lookup/update to atomic RPC');
assert.match(builder,/free:data\.free_redownload===true\|\|data\.source==='redownload'/,'Builder must recognise server-authorised free re-downloads');
assert.match(builder,/clean:data\.clean_export===true/,'Builder must use server-returned clean/watermarked entitlement');
const builderWrap=builder.slice(builder.indexOf('function wrapDownloads()'),builder.indexOf('async function signOut()',builder.indexOf('function wrapDownloads()')));
assert.ok(!builderWrap.includes('if(!dlGate())return'),'cached zero balance must not block a valid 7-day re-download');
assert.ok(!builderWrap.includes('await refreshProEntitlement()'),'final PAYG download must not be reclassified after its balance reaches zero');
assert.match(builderWrap,/S\.isPro=charge\.clean===true/,'authorised export must render using the entitlement returned atomically by the server');

assert.match(print,/100% \/ Actual Size/,'printing help must require 100% / Actual Size');
assert.match(print,/Do not use “Fit to page” or “Scale to fit”/,'printing help must warn against scaling');
assert.match(print,/No download has been used/,'failed PDF rendering/popup must tell customer no download was consumed');
const zipGenerate=print.indexOf("zip.generateAsync({type:'blob'})");
const zipCharge=print.indexOf('const charge=await consumeComposerDownload();',zipGenerate);
assert.ok(zipGenerate>=0 && zipCharge>zipGenerate,'ZIP must be generated before its download is consumed');

console.log('PAYG download accounting checks passed');

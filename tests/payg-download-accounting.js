const fs=require('fs');
const assert=require('assert');

const print=fs.readFileSync('print.html','utf8');
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

console.log('PAYG download accounting checks passed');

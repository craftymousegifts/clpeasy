const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const PROFILES = {
  payg:  { plan: 'payg', subscription_status: 'payg', trial_end: iso(-2 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 5 },
  trial: { plan: 'trial', subscription_status: 'trialing', trial_end: iso(5 * DAY), downloads_used: 2, downloads_limit: 10, topup_credits: 0 },
  start: { plan: 'easy_start', subscription_status: 'active', downloads_used: 3, downloads_limit: 20, topup_credits: 0, billing_cycle: 'monthly' },
  pro:   { plan: 'easy_pro', is_pro: true, subscription_status: 'active', downloads_used: 3, downloads_limit: 30, topup_credits: 0, billing_cycle: 'monthly' },
  zero:  { plan: 'payg', subscription_status: 'payg', trial_end: iso(-9 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 0 },
};
const RPC = {
  charged:   { ok: true, consumed: true, free_redownload: false, source: 'purchased', clean_export: true, purchased_downloads: 4, downloads_used: 0, downloads_limit: 0 },
  plan:      { ok: true, consumed: true, free_redownload: false, source: 'plan', clean_export: true, purchased_downloads: 0, downloads_used: 4, downloads_limit: 20 },
  trial:     { ok: true, consumed: true, free_redownload: false, source: 'plan', clean_export: false, purchased_downloads: 0, downloads_used: 3, downloads_limit: 10 },
  free:      { ok: true, consumed: false, free_redownload: true, source: 'redownload', clean_export: true, purchased_downloads: 5, downloads_used: 0, downloads_limit: 0 },
  none:      { ok: false, reason: 'no_downloads_remaining', purchased_downloads: 0, downloads_used: 0, downloads_limit: 0 },
};

function stub(profile, rpcResult) {
  const row = Object.assign({ id: 'u1', email: 'qa@example.test', full_name: 'QA Maker', created_at: iso(-40 * DAY), billing_cycle: 'monthly' }, profile);
  return `window.__rpc=[];window.supabase={createClient:function(){var row=${JSON.stringify(row)};var res=${JSON.stringify(rpcResult)};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},
  rpc:async function(n,a){window.__rpc.push([n,a]);if(n!=='consume_download')return {data:null,error:null};if(res==='error')return {data:null,error:{message:'boom'}};return {data:res,error:null};},
  functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
}

module.exports={stub,PROFILES,RPC};

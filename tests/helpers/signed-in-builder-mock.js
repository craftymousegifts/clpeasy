// Supabase stand-in for browser tests that drive the Label Builder. The
// Builder now requires sign-in, so tests use a synthetic signed-in customer on
// an active free trial. The download RPC answers like the real
// consume_download() for a trial: allowed, watermarked (clean_export false),
// the same output the former signed-out route produced. No network is used.
'use strict';
const USER_ID = '00000000-0000-4000-8000-00000000a11d';
const PROFILE = {
  downloads_used: 0, downloads_limit: 10, plan: 'trial', is_pro: false,
  subscription_status: 'trialing', trial_end: '2099-01-01T00:00:00Z',
  deletion_date: null, billing_cycle: null, downloads_reset_date: null, topup_credits: 0,
};
const MOCK = 'window.supabase={createClient:()=>({' +
  'auth:{getSession:async()=>({data:{session:{user:{id:' + JSON.stringify(USER_ID) + ',email:"qa-trial@example.invalid",user_metadata:{}}}}}),' +
  'onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},' +
  'from:()=>({select(){return this},eq(){return this},single:async()=>({data:' + JSON.stringify(PROFILE) + ',error:null}),maybeSingle:async()=>({data:' + JSON.stringify(PROFILE) + ',error:null})}),' +
  'rpc:async()=>({data:{ok:true,source:"plan",clean_export:false},error:null})})};';
module.exports = { MOCK, USER_ID, PROFILE };

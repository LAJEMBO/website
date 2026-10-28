import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const source=await readFile(new URL('../lajembo-auth.js',import.meta.url),'utf8');
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};
function fixture({session=null,route='home_seeker'}={}){
  const sessionStorage=storage(),calls=[];let onAuth;
  const user={id:'account-a',phone:'2348012345678',phone_confirmed_at:'2026-10-28'};
  const current=()=>session;
  const client={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:fn=>{onAuth=fn},getUser:async()=>({data:{user},error:null}),setSession:async tokens=>{session={...tokens,user};onAuth('SIGNED_IN',session);return{data:{session},error:null}},updateUser:async body=>{calls.push(['update',body]);return{error:null}},signInWithPassword:async body=>{calls.push(['login',body]);session={access_token:'fresh',refresh_token:'refresh',user};onAuth('SIGNED_IN',session);return{data:{session},error:null}},signOut:async()=>{session=null;onAuth('SIGNED_OUT',null);return{error:null}}},rpc:async name=>{calls.push(['rpc',name]);return{data:{account_type:route},error:null}},functions:{invoke:async(name,args)=>{calls.push(['verify',name,args]);return{data:{access_token:'access',refresh_token:'refresh'},error:null}}}};
  const window={supabase:{createClient:(_url,_key,options)=>{calls.push(['create',options]);return client}}};
  vm.runInNewContext(source,{window,sessionStorage,document:{readyState:'loading',addEventListener(){}},location:{search:''},URLSearchParams,Headers,fetch:async(_input,options)=>{calls.push(['fetch',options]);return{ok:true}}});
  return {api:window.LajemboAuth,calls,sessionStorage,current};
}
test('website persists and refreshes one SDK session across legacy forms',async()=>{
  const f=fixture();await f.api.ready;assert.equal(f.calls[0][1].auth.persistSession,true);assert.equal(f.calls[0][1].auth.autoRefreshToken,true);
  await f.api.adoptSession({access_token:'access',refresh_token:'refresh'});
  for(const key of ['lajembo_access_token','lajembo_provider_access_token','lajembo_exclusive_access_token','lajembo_provider_workspace_token'])assert.equal(f.sessionStorage.getItem(key),'access');
  await f.api.fetch('/rest/v1/rpc/example',{headers:{Authorization:'Bearer expired'}});
  assert.equal(f.calls.at(-1)[1].headers.get('Authorization'),'Bearer access');
  await f.api.signOut();assert.equal(f.sessionStorage.getItem('lajembo_access_token'),null);
});
test('password login and code recovery preserve the existing identity without classification writes',async()=>{
  const f=fixture();await f.api.ready;await f.api.signIn('+234 801 234 5678','password');assert.equal(f.calls.find(c=>c[0]==='login')[1].phone,'+2348012345678');
  await f.api.verifyRecovery('+2348012345678','123456');await f.api.setPassword('A-long-password','A-long-password','+2348012345678');
  assert.equal(f.calls.find(c=>c[0]==='verify')[1],'customer-otp-verify');
  assert.equal(f.calls.filter(c=>c[0]==='rpc').length,0);
  await assert.rejects(f.api.setPassword('short','short','+2348012345678'),/12 and 128/);
  await assert.rejects(f.api.setPassword('A-long-password','A-long-password','+2348099999999'),/Verify your mobile/);
});
test('website routes only to approved pages for the authoritative account type',async()=>{
  const f=fixture({route:'provider'});await f.api.ready;assert.equal(await f.api.destination(),'provider-workspace.html');
  const r=fixture();await r.api.ready;assert.equal(await r.api.destination(),'rentals.html');
});


test('all website forms adopt refreshable sessions and send protected requests through the shared client',async()=>{
  for(const path of ['registration.html','provider-registration.js','provider-workspace.js','exclusive-provider-application.js']){
    const text=await readFile(new URL('../'+path,import.meta.url),'utf8');
    assert.match(text,/LajemboAuth\.adoptSession\(d\)/);
    assert.match(text,/LajemboAuth\.promptPassword\(phone\)/);
    assert.match(text,/LajemboAuth\.ready/);
    assert.match(text,/LajemboAuth\.fetch/);
  }
  const html=await readFile(new URL('../registration.html',import.meta.url),'utf8');
  const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
  for(const script of inline)new vm.Script(script);
});

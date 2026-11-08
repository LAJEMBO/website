import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../viewing-flow.js',import.meta.url),'utf8');
function fixture({status='pending',failCheckout=false,saveError=false,identity='verified'}={}){
 const calls=[],filters=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'me'}},error:null})},from:table=>{const q={select:()=>q,eq:(...args)=>{filters.push([table,...args]);return q;},order:()=>q,limit:async()=>({data:table==='home_profiles'?[{id:'profile',active:true}]:table==='renter_match_shortlists'?[{viewing_package_id:'package'}]:[{id:'package',status}],error:null})};return q;},rpc:async(name,args)=>{calls.push([name,args]);if(name==='set_my_shortlist_viewing_choices'&&saveError)return{error:{message:'Property withdrawn'}};if(name==='start_my_viewing_checkout'&&failCheckout)return{error:{message:'Checkout unavailable'}};return{data:name==='get_my_customer_profile'?{account_type:'home_seeker',account_status:'active',identity_verification_status:identity}:name==='generate_my_match_shortlist'?'mine':name==='get_my_current_match_shortlist'?[item('a'),{...item('other'),shortlist_id:'another'}]:null,error:null};}};
 const window={};vm.runInNewContext(source,{window,Date,Number,Set});return{...window.LajemboViewing,flow:window.LajemboViewing.create(client),calls,filters};
}
const item=(id,locked=false)=>({listing_id:id,shortlist_id:'mine',shortlist_status:locked?'locked_for_viewing':'ready',renter_decision:locked?'selected_for_viewing':'not_selected'});
test('website restores current owner shortlist and denies unverified renter before generation',async()=>{
 const f=fixture();assert.equal((await f.flow.load()).length,1);assert.ok(f.filters.some(x=>x[0]==='home_profiles'&&x[1]==='user_id'&&x[2]==='me'));
 const denied=fixture({identity:'pending'});await assert.rejects(denied.flow.load(),/approved identity/);assert.equal(denied.calls.some(x=>x[0]==='generate_my_match_shortlist'),false);
});
test('website retains locked choices on checkout error and retry skips saving again',async()=>{
 const f=fixture({failCheckout:true});const r=await f.flow.confirm([item('a')],['a']);assert.equal(r.saved,true);assert.match(r.error,/Checkout unavailable/);
 await f.flow.confirm([item('a',true)],[]);assert.equal(f.calls.filter(x=>x[0]==='set_my_shortlist_viewing_choices').length,1);
});
test('active package resumes without a new payment intent and owner reads remain scoped',async()=>{
 const f=fixture({status:'active'});assert.equal((await f.flow.confirm([item('a',true)],[])).error,null);assert.equal(f.calls.some(x=>x[0]==='start_my_viewing_checkout'),false);assert.ok(f.filters.some(x=>x[0]==='viewing_packages'&&x[1]==='user_id'&&x[2]==='me'));
});
test('invalid or rejected choices cannot proceed to checkout',async()=>{
 const f=fixture({saveError:true});for(const ids of [[],['outside'],['a','a']])assert.ok((await f.flow.confirm([item('a')],ids)).error);assert.equal(f.calls.length,0);assert.match((await f.flow.confirm([item('a')],['a'])).error,/withdrawn/);assert.equal(f.calls.some(x=>x[0]==='start_my_viewing_checkout'),false);
});
test('website calendar validates real future dates, same-day order and Nigeria viewing hours',()=>{
 const f=fixture(),now=Date.parse('2026-01-01T00:00:00Z');
 for(const args of [['2026-02-30','09:00','10:00'],['2025-12-31','09:00','10:00'],['2026-02-02','10:00','09:00'],['2026-02-02','07:45','10:00'],['2026-02-02','18:00','19:15']])assert.throws(()=>f.viewingWindow(...args,now));
 assert.equal(f.viewingWindow('2026-02-02','08:00','19:00',now).start,'2026-02-02T07:00:00.000Z');assert.match(f.format('2026-02-02T07:00:00Z'),/08:00.*WAT \(Nigeria\)/);
});

test('website never reports a booking without explicit server confirmation',async()=>{
 const window={};vm.runInNewContext(source,{window,Date,Number,Set});
 for(const result of [{data:null,error:{message:'Time is no longer available'}},{data:null,error:null},{data:{status:'proposed'},error:null}])await assert.rejects(window.LajemboViewing.create({rpc:async()=>result}).confirmTime('proposal'));
 assert.equal((await window.LajemboViewing.create({rpc:async()=>({data:{status:'confirmed'},error:null})}).confirmTime('proposal')).status,'confirmed');
});

test('viewing-day actions send only route and viewing identifiers and propagate server denials',async()=>{
 const calls=[],window={};
 vm.runInNewContext(source,{window,Date,Number,Set});
 const flow=window.LajemboViewing.create({rpc:async(name,args)=>{calls.push([name,args]);return{data:null,error:{message:'Check-in is unavailable'}};}});
 await assert.rejects(flow.checkInDay('route'),/unavailable/);
 await assert.rejects(flow.checkInProperty('viewing'),/unavailable/);
 assert.equal(JSON.stringify(calls),JSON.stringify([
  ['renter_confirm_viewing_day_check_in',{p_route_id:'route'}],
  ['renter_viewing_check_in',{p_viewing_id:'viewing'}],
 ]));
});

test('website displays exact addresses only after explicit server release',async()=>{
 const window={};vm.runInNewContext(source,{window,Date,Number,Set});
 for(const data of [null,{released:false,exact_address:'private'},{released:'true',exact_address:'private'}]){
  const flow=window.LajemboViewing.create({rpc:async()=>({data,error:null})});
  assert.equal(await flow.releasedAddress('viewing'),'Address has not been released yet.');
 }
 const flow=window.LajemboViewing.create({rpc:async()=>({data:{released:true,exact_address:'Released address',meeting_instruction:'Meet at gate'},error:null})});
 assert.equal(await flow.releasedAddress('viewing'),'Released address\nMeet at gate');
});

test('post-viewing decisions require a completed viewing and reasons and preserve server authorization',async()=>{
 const calls=[],window={};vm.runInNewContext(source,{window,Date,Number,Set});
 const flow=window.LajemboViewing.create({rpc:async(name,args)=>{calls.push([name,args]);return{data:null,error:{message:'Viewing does not belong to this renter'}};}});
 await assert.rejects(flow.recordDecision({viewing_id:'v',viewing_status:'scheduled'},'interested',null,'',null),/Complete the viewing/);
 const stop={viewing_id:'v',viewing_status:'completed'};
 await assert.rejects(flow.recordDecision(stop,'maybe',null,'',null),/main reason/);
 await assert.rejects(flow.recordDecision(stop,'not_interested','other',' ',null),/Explain/);
 assert.equal(calls.length,0);
 await assert.rejects(flow.recordDecision(stop,'interested','price_too_high','stale',4),/does not belong/);
 assert.equal(calls[0][0],'record_my_post_viewing_decision');
 assert.equal(JSON.stringify(calls[0][1]),JSON.stringify({p_viewing_id:'v',p_decision:'interested',p_primary_reason_code:null,p_additional_reason_codes:[],p_other_note:null,p_rating:4}));
});

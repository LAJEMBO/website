import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../rental-progress-flow.js',import.meta.url),'utf8');
const shown={selection_intent_id:'selection',transaction_id:'transaction',costs:{annual_rent:2000000,platform_fee:100000,caution_deposit:200000,legal_documentation_fee:0,service_charge:0,other_approved_charges:0,total_move_in_cost:2300000,confirmed_by_renter:false}};
function fixture(current=shown,error=null){
 const calls=[],window={};
 vm.runInNewContext(source,{window});
 const flow=window.LajemboRentalProgress.create({rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='get_my_selection_progress')return{data:current,error:null};
  if(error)return{data:null,error:{message:error}};
  return{data:name==='get_my_transaction_workspace'?{transaction:{id:'transaction'}}:null,error:null};
 }});
 return{flow,calls};
}
test('website accepts only the reviewed current selection and sends no client-controlled prices',async()=>{
 const f=fixture();await f.flow.acceptCosts(shown);
 assert.equal(JSON.stringify(f.calls),JSON.stringify([['get_my_selection_progress',undefined],['accept_my_selection_costs',{p_selection_intent_id:'selection'}]]));
});
test('changed selections and costs require another review before acceptance',async()=>{
 for(const current of [null,{...shown,selection_intent_id:'different'},{...shown,costs:null},{...shown,costs:{...shown.costs,platform_fee:200000}}]){
  const f=fixture(current);await assert.rejects(f.flow.acceptCosts(shown),/changed/);
  assert.equal(f.calls.some(([name])=>name==='accept_my_selection_costs'),false);
 }
});
test('already accepted costs skip duplicate writes and server rejection remains visible',async()=>{
 const accepted=fixture({...shown,costs:{...shown.costs,confirmed_by_renter:true}});
 await accepted.flow.acceptCosts(shown);assert.equal(accepted.calls.length,1);
 await assert.rejects(fixture(shown,'Provider confirmation is pending').flow.acceptCosts(shown),/Provider confirmation/);
});
test('transaction details use the current owner-scoped selection and handle pending transactions',async()=>{
 const pending=fixture({...shown,transaction_id:null});assert.equal(await pending.flow.workspace(),null);
 const f=fixture();await f.flow.workspace();
 assert.equal(JSON.stringify(f.calls[1]),JSON.stringify(['get_my_transaction_workspace',{p_transaction_id:'transaction'}]));
 await assert.rejects(fixture(shown,'Access denied').flow.workspace(),/Access denied/);
});

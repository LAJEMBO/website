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
function recordsFixture({workspace,documents=[],denied=false}={}){
 const calls=[],window={};vm.runInNewContext(source,{window,URL});
 const flow=window.LajemboRentalProgress.create({rpc:async(name,args)=>{
  calls.push([name,args]);
  if(denied&&name==='get_my_transaction_document_access')return{error:{message:'Not authorized'}};
  return{data:name==='get_my_selection_progress'?shown:name==='get_my_transaction_workspace'?workspace:name==='get_my_transaction_documents'?documents:name==='get_my_transaction_document_access'?{bucket:'transaction-documents',storage_path:'private/agreement.pdf'}:name==='get_my_payment_receipts'?[{receipt_number:'R-1',amount:100000}]:null,error:null};
 },storage:{from:bucket=>({createSignedUrl:async(path,seconds)=>{calls.push(['signed',{bucket,path,seconds}]);return{data:{signedUrl:'https://project.supabase.co/storage/signed'},error:null};}})}});
 return{flow,calls};
}
const agreementWorkspace={transaction:{id:'transaction'},agreement:{id:'agreement',template_version:'v1',document_status:'issued',renter_signed_at:null}};
test('agreement acceptance rechecks current document version and propagates server denial',async()=>{
 for(const workspace of [null,{...agreementWorkspace,agreement:{...agreementWorkspace.agreement,template_version:'v2'}},{...agreementWorkspace,agreement:{...agreementWorkspace.agreement,document_status:'draft'}}]){
  const f=recordsFixture({workspace});await assert.rejects(f.flow.acceptAgreement(agreementWorkspace));assert.equal(f.calls.some(([n])=>n==='accept_my_tenancy_agreement'),false);
 }
 const f=recordsFixture({workspace:agreementWorkspace});await f.flow.acceptAgreement(agreementWorkspace);
 assert.equal(JSON.stringify(f.calls.at(-1)),JSON.stringify(['accept_my_tenancy_agreement',{p_agreement_id:'agreement',p_statement_version:'v1'}]));
});
test('private document links require current transaction membership and server access',async()=>{
 const f=recordsFixture({documents:[{document_id:'doc'}]});await f.flow.documentLink('doc');assert.equal(f.calls.at(-1)[1].seconds,300);
 await assert.rejects(f.flow.documentLink('foreign'),/no longer available/);
 const denied=recordsFixture({documents:[{document_id:'doc'}],denied:true});await assert.rejects(denied.flow.documentLink('doc'),/Not authorized/);assert.equal(denied.calls.some(([n])=>n==='signed'),false);
});
test('receipt list is restricted to the current selected transaction',async()=>{
 const f=recordsFixture();const rows=await f.flow.receipts();assert.equal(rows[0].amount,100000);assert.equal(JSON.stringify(f.calls.at(-1)),JSON.stringify(['get_my_payment_receipts',{p_transaction_id:'transaction'}]));
});
function moveFixture({record={id:'condition',record_type:'pre_move_in',status:'submitted'},handover={id:'handover',handover_status:'ready'},ready=true,confirmed=true,denied=false}={}){
 const window={},calls=[];vm.runInNewContext(source,{window});
 const flow=window.LajemboRentalProgress.create({rpc:async(name,args)=>{calls.push([name,args]);
 if(denied&&name.startsWith('respond_'))return{error:{message:'Not authorized'}};
 return{data:name==='get_my_selection_progress'?shown:name==='get_my_transaction_workspace'?{transaction:{id:'transaction'},move_in_conditions:[record],handover}:name==='get_my_move_in_readiness'?{ready_for_clean_completion:ready}:name==='complete_my_move_in'?{status:confirmed?'completed':'pending'}:null,error:null};}});return{flow,calls};
}
test('condition and handover responses require current records, valid actions and dispute reasons',async()=>{
 const f=moveFixture();await assert.rejects(f.flow.respond('condition','condition','dispute','  '),/reason/);
 await assert.rejects(f.flow.respond('condition','foreign','acknowledge'),/changed/);
 await assert.rejects(f.flow.respond('other','condition','acknowledge'),/Invalid/);
 await f.flow.respond('condition','condition','dispute',' Crack on wall ');
 assert.equal(JSON.stringify(f.calls.at(-1)),JSON.stringify(['respond_to_my_move_in_condition',{p_condition_record_id:'condition',p_action:'dispute',p_note:'Crack on wall'}]));
 await f.flow.respond('handover','handover','acknowledge');assert.equal(f.calls.at(-1)[0],'respond_to_my_possession_handover');
 await assert.rejects(moveFixture({record:{id:'condition',record_type:'pre_move_in',status:'acknowledged'}}).flow.respond('condition','condition','acknowledge'),/changed/);
 await assert.rejects(moveFixture({denied:true}).flow.respond('handover','handover','acknowledge'),/Not authorized/);
});
test('completion requires current transaction, refreshed readiness and explicit server confirmation',async()=>{
 const f=moveFixture();await assert.rejects(f.flow.completeMoveIn('foreign'),/changed/);await f.flow.completeMoveIn('transaction');assert.equal(f.calls.at(-1)[0],'complete_my_move_in');
 const pending=moveFixture({ready:false});await assert.rejects(pending.flow.completeMoveIn('transaction'),/pending/);assert.equal(pending.calls.some(([n])=>n==='complete_my_move_in'),false);
 await assert.rejects(moveFixture({confirmed:false}).flow.completeMoveIn('transaction'),/not confirmed/);
});
function evidenceFixture(){
 const calls=[],window={};vm.runInNewContext(source,{window,URL});
 const record={id:'condition',notes:'Wall crack',status:'submitted',submitted_at:'today',media_manifest:[{asset_id:'asset'}]};
 const flow=window.LajemboRentalProgress.create({from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:record,error:null})})})})}),rpc:async(name,args)=>{calls.push([name,args]);return{data:name==='get_my_selection_progress'?shown:name==='get_my_transaction_workspace'?{transaction:{id:'transaction'},move_in_conditions:[{id:'condition',record_type:'pre_move_in',status:'submitted',media_count:1}]}:name==='get_my_transaction_evidence'?[{asset_id:'asset',mime_type:'image/jpeg'}]:name==='get_my_transaction_evidence_access'?{bucket:'transaction-evidence',storage_path:'transaction/asset'}:null,error:null};},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://project.supabase.co/secure'},error:null})})}});
 return{flow,record,calls};
}
test('condition evidence is tied to the current record and acknowledgement rechecks changed evidence',async()=>{
 const f=evidenceFixture(),evidence=await f.flow.conditionEvidence('condition');assert.equal(evidence.assets[0].asset_id,'asset');
 await assert.rejects(f.flow.evidenceLink('condition','foreign'),/does not belong/);
 await f.flow.evidenceLink('condition','asset');
 await assert.rejects(f.flow.respond('condition','condition','acknowledge'),/Review all/);
 const reviewed={...evidence,opened:['asset']};await f.flow.respond('condition','condition','acknowledge','',reviewed);
 assert.equal(f.calls.at(-1)[0],'respond_to_my_move_in_condition');
 f.record.notes='New condition notes';await assert.rejects(f.flow.respond('condition','condition','acknowledge','',reviewed),/Review all/);
 f.record.media_manifest=[{asset_id:'missing'}];await assert.rejects(f.flow.conditionEvidence('condition'),/unavailable/);
});

(() => {
 'use strict';
 const costFields=['annual_rent','platform_fee','caution_deposit','legal_documentation_fee','service_charge','other_approved_charges','total_move_in_cost'];
 function create(client){
  async function rpc(name,args){const result=await client.rpc(name,args);if(result.error)throw Error(result.error.message);return result.data;}
  async function selection(){return rpc('get_my_selection_progress');}
  async function acceptCosts(shown){
   if(!shown?.selection_intent_id||!shown.costs)throw Error('Load the disclosed costs before accepting them.');
   const current=await selection();
   if(!current||current.selection_intent_id!==shown.selection_intent_id||!current.costs||
    costFields.some(field=>current.costs[field]!==shown.costs[field]))throw Error('Your selection or costs changed. Refresh and review the current amounts.');
   if(current.costs.confirmed_by_renter)return;
   await rpc('accept_my_selection_costs',{p_selection_intent_id:current.selection_intent_id});
  }
  async function workspace(){const current=await selection();if(!current?.transaction_id)return null;return rpc('get_my_transaction_workspace',{p_transaction_id:current.transaction_id});}
  async function documents(){const current=await selection();if(!current?.transaction_id)return[];return (await rpc('get_my_transaction_documents',{p_transaction_id:current.transaction_id}))||[];}
  async function receipts(){const current=await selection();if(!current?.transaction_id)return[];return (await rpc('get_my_payment_receipts',{p_transaction_id:current.transaction_id}))||[];}
  async function documentLink(documentId){
   const available=await documents();if(!available.some(d=>d.document_id===documentId))throw Error('This document is no longer available in your current transaction.');
   const access=await rpc('get_my_transaction_document_access',{p_document_id:documentId});
   if(!access?.bucket||!access.storage_path)throw Error('Document access is unavailable.');
   const result=await client.storage.from(access.bucket).createSignedUrl(access.storage_path,300);
   if(result.error||!result.data?.signedUrl)throw Error(result.error?.message||'Secure document link could not be created.');
   const url=new URL(result.data.signedUrl);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw Error('Invalid document link.');
   return url.href;
  }
  async function acceptAgreement(shown){
   const current=await workspace(),a=current?.agreement,b=shown?.agreement;
   if(!a||!b||current.transaction.id!==shown.transaction.id||a.id!==b.id||a.template_version!==b.template_version)throw Error('Your agreement changed. Refresh and review it again.');
   if(a.renter_signed_at)return;
   if(!['issued','partially_signed'].includes(a.document_status))throw Error('This agreement is not available for acceptance.');
   await rpc('accept_my_tenancy_agreement',{p_agreement_id:a.id,p_statement_version:a.template_version});
  }
  async function conditionEvidence(id){
   const current=await workspace();
   if(!current?.move_in_conditions?.some(r=>r.id===id&&r.record_type==='pre_move_in'))throw Error('Condition record is not part of your current transaction.');
   const result=await client.from('move_in_condition_records').select('id,notes,status,submitted_at,media_manifest').eq('id',id).eq('transaction_id',current.transaction.id).single();
   if(result.error||!result.data)throw Error(result.error?.message||'Condition evidence is unavailable.');
   const record=result.data,manifest=record.media_manifest;
   if(!Array.isArray(manifest)||manifest.some(a=>!a?.asset_id)||new Set(manifest.map(a=>a.asset_id)).size!==manifest.length)throw Error('Condition evidence references are incomplete.');
   const available=await rpc('get_my_transaction_evidence',{p_transaction_id:current.transaction.id,p_evidence_type:'pre_move_in'});
   const assets=manifest.map(a=>available?.find(b=>b.asset_id===a.asset_id));
   if(assets.some(a=>!a))throw Error('A condition attachment is unavailable. Please request a corrected record.');
   return{assets,fingerprint:JSON.stringify([record.id,record.notes,record.status,record.submitted_at,manifest])};
  }
  async function evidenceLink(recordId,assetId){
   const current=await conditionEvidence(recordId);if(!current.assets.some(a=>a.asset_id===assetId))throw Error('Evidence does not belong to this condition record.');
   const access=await rpc('get_my_transaction_evidence_access',{p_asset_id:assetId});
   if(!access?.storage_path||access.bucket!=='transaction-evidence')throw Error('Evidence access is unavailable.');
   const result=await client.storage.from(access.bucket).createSignedUrl(access.storage_path,300);
   if(result.error||!result.data?.signedUrl)throw Error(result.error?.message||'Secure evidence link could not be created.');
   const url=new URL(result.data.signedUrl);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw Error('Invalid evidence link.');return url.href;
  }
  async function protection(){const current=await selection();if(!current?.transaction_id)return null;return rpc('get_my_move_in_protection_status',{p_transaction_id:current.transaction_id});}
  async function submitConditionCheck(shownId,notes){
   if(!notes?.trim())throw Error('Enter your condition notes before submitting.');
   const current=await selection();if(!current?.transaction_id||current.transaction_id!==shownId)throw Error('Your transaction changed. Refresh before submitting.');
   const status=await rpc('get_my_move_in_protection_status',{p_transaction_id:current.transaction_id});
   if(status?.window_open!==true)throw Error('The seven-day condition reporting window is not open.');
   const result=await rpc('submit_my_seven_day_condition_check',{p_transaction_id:current.transaction_id,p_notes:notes.trim(),p_media_manifest:[]});
   if(result?.status!=='submitted'||!result.condition_record_id)throw Error('Condition checklist submission was not confirmed.');
   return result;
  }
  async function readiness(){const current=await selection();if(!current?.transaction_id)return null;return rpc('get_my_move_in_readiness',{p_transaction_id:current.transaction_id});}
  async function respond(kind,id,action,note='',reviewed=null){
   if(!['condition','handover'].includes(kind)||!['acknowledge','dispute'].includes(action))throw Error('Invalid move-in response.');
   if(action==='dispute'&&!note.trim())throw Error('Please provide a reason for the dispute.');
   const current=await workspace();
   const record=kind==='condition'?current?.move_in_conditions?.find(r=>r.id===id&&r.record_type==='pre_move_in'&&r.status==='submitted'):current?.handover;
   if(!record||record.id!==id||(kind==='handover'&&(!['ready','disputed'].includes(record.handover_status)||record.renter_acknowledged_at)))throw Error('This record changed or is no longer awaiting your response. Refresh the transaction.');
   if(kind==='condition'&&action==='acknowledge'&&record.media_count>0){const latest=await conditionEvidence(id);if(!reviewed||reviewed.fingerprint!==latest.fingerprint||latest.assets.some(a=>!reviewed.opened.includes(a.asset_id)))throw Error('Review all current condition evidence before acknowledgement.');}
   return rpc(kind==='condition'?'respond_to_my_move_in_condition':'respond_to_my_possession_handover',{
    [kind==='condition'?'p_condition_record_id':'p_handover_id']:id,p_action:action,p_note:note.trim()||null
   });
  }
  async function completeMoveIn(shownId){
   const current=await selection();if(!current?.transaction_id||current.transaction_id!==shownId)throw Error('Your transaction changed. Refresh it before continuing.');
   const ready=await rpc('get_my_move_in_readiness',{p_transaction_id:current.transaction_id});
   if(!ready?.ready_for_clean_completion)throw Error('Required move-in checks are still pending.');
   const result=await rpc('complete_my_move_in',{p_transaction_id:current.transaction_id});
   if(result?.status!=='completed')throw Error(result?.message||'Move-in completion was not confirmed.');return result;
  }
  return{selection,acceptCosts,workspace,documents,receipts,documentLink,acceptAgreement,readiness,respond,completeMoveIn,conditionEvidence,evidenceLink,protection,submitConditionCheck};
 }
 window.LajemboRentalProgress={create};
})();

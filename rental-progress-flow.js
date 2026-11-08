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
  return{selection,acceptCosts,workspace,documents,receipts,documentLink,acceptAgreement};
 }
 window.LajemboRentalProgress={create};
})();

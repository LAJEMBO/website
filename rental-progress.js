(() => {
 'use strict';
 const root=document.getElementById('rentalProgressApp'),auth=window.LajemboAuth;
 if(!root||!auth?.client||!window.LajemboRentalProgress)return;
 const flow=window.LajemboRentalProgress.create(auth.client);
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
 const money=amount=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(amount);
 const status=el('p'),body=el('div');status.setAttribute('role','status');root.replaceChildren(status,body);
 let busy=false;
 function button(label,action,parent=body){const node=el('button',label);node.type='button';node.className='info-button';node.disabled=busy;node.onclick=()=>run(action);parent.append(node);}
 async function run(action){if(busy)return;busy=true;root.querySelectorAll('button').forEach(node=>node.disabled=true);try{await action();}catch(error){status.textContent=error.message||'Unable to load your rental progress.';}finally{busy=false;root.querySelectorAll('button').forEach(node=>node.disabled=false);}}
 function costs(data,feeField){
  const card=el('section');card.className='info-card';card.append(el('h3','Full move-in costs'));
  for(const [label,field] of [['Annual rent','annual_rent'],['LAJEMBO success fee',feeField],['Caution deposit','caution_deposit'],['Legal/documentation','legal_documentation_fee'],['Service charge','service_charge'],['Other approved charges','other_approved_charges'],['Total move-in cost','total_move_in_cost']]){
   card.append(el('p',label+' · '+(typeof data[field]==='number'?money(data[field]):'Awaiting confirmation')));
  }
  body.append(card);return card;
 }
 async function load(){
  status.textContent='Loading your property selection…';body.replaceChildren();
  const data=await flow.selection();status.textContent='';
  if(!data){body.append(el('p','No property selection is ready yet. Record your decision after completing a viewing.'));button('Refresh selection',load);return;}
  body.append(el('h2',data.public_property_code),el('p',[data.area,data.city,data.property_type].filter(Boolean).join(' · ')),
   el('p','Selection status · '+data.status),el('p','Provider decision · '+(data.provider_decision||'Pending')));
  for(const check of data.qualification_checks||[])body.append(el('p',check.label+' · '+check.result));
  if(data.costs){
   const card=costs(data.costs,'platform_fee');
   if(data.costs.confirmed_by_renter)card.append(el('p','Your acceptance of these costs is recorded.'));
   else button('Accept disclosed move-in costs',async()=>{await flow.acceptCosts(data);await load();status.textContent='Your acceptance was submitted. Check the current selection status.';},card);
  }else body.append(el('p','LAJEMBO is preparing the full disclosed move-in costs.'));
  if(data.transaction_id)button('Open transaction details',transaction);
  button('Refresh selection',load);
 }
 async function transaction(){
  status.textContent='Loading your transaction…';body.replaceChildren();
  const data=await flow.workspace();status.textContent='';
  if(!data){body.append(el('p','Your transaction is being prepared.'));button('Back to selection',load);return;}
  body.append(el('h2',data.property.public_property_code),el('p','Transaction status · '+data.transaction.status));
  costs(data.transaction,'success_fee');
  body.append(el('h3','Tenancy agreement'),el('p',data.agreement?.document_status||'Agreement preparation is pending.'),
   el('p','Documents · '+data.document_count),el('p','Receipts · '+data.receipt_count),
   el('p','Handover · '+(data.handover?.handover_status||'Pending')));
  const agreement=data.agreement;
  const records=el('section');records.className='info-card';records.append(el('h3','Your documents and receipts'));body.append(records);
  // Records failing to load must not hide the transaction or imply payment failed.
  try{
   const [documents,receipts]=await Promise.all([flow.documents(),flow.receipts()]);
   let reviewed=false;
   for(const document of documents){
    button('Review '+document.document_type.replaceAll('_',' ')+' · '+document.document_version,async()=>{
     const url=await flow.documentLink(document.document_id);
     const link=el('a','Open secure document (available for five minutes)');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.className='info-button';
     records.querySelectorAll('a').forEach(node=>node.remove());records.append(link);
     if(/tenancy/i.test(document.document_type)&&/agreement/i.test(document.document_type)){link.onclick=()=>{reviewed=true;};}
    },records);
   }
   if(!documents.length)records.append(el('p','No documents are available yet.'));
   if(agreement?.renter_signed_at)records.append(el('p','Your agreement acceptance is recorded.'));
   else if(agreement&&['issued','partially_signed'].includes(agreement.document_status)){
    const label=el('label'),check=el('input');check.type='checkbox';label.append(check,document.createTextNode(' I have opened and read the tenancy agreement and agree to its terms.'));records.append(label);
    button('Accept tenancy agreement',async()=>{
     if(!reviewed||!check.checked)throw Error('Open the agreement and confirm that you have read and accepted its terms first.');
     if(!window.confirm('Record your acceptance of this tenancy agreement?'))return;
     await flow.acceptAgreement(data);await transaction();status.textContent='Your agreement acceptance is recorded.';
    },records);
   }
   records.append(el('h3','Payment receipts'));
   if(!receipts.length)records.append(el('p','No payment receipts have been issued for this transaction.'));
   for(const receipt of receipts){
    const row=el('section');row.className='info-card';
    row.append(el('h4',receipt.receipt_number),el('p',receipt.receipt_purpose.replaceAll('_',' ')),
     el('p',new Intl.NumberFormat('en-NG',{style:'currency',currency:receipt.currency_code}).format(receipt.amount)),
     el('p','Issued '+new Date(receipt.issued_at).toLocaleString()));records.append(row);
   }
  }catch(error){records.append(el('p','Records could not be loaded. '+error.message));}
  const move=el('section');move.className='info-card';move.append(el('h3','Move-in and possession'));body.append(move);
  function responseForm(kind,record){
   const label=el('label','Reason for dispute (required when disputing)'),note=el('textarea');label.append(note);move.append(label);
   button('Acknowledge '+(kind==='condition'?'condition record':'possession handover'),async()=>{
    if(kind==='condition'&&record.media_count>0)throw Error('Attached condition evidence must be available for review before acknowledgement.');
    if(!window.confirm('Confirm that you have reviewed and agree with this '+(kind==='condition'?'condition record':'possession handover')+'?'))return;
    await flow.respond(kind,record.id,'acknowledge');await transaction();status.textContent='Your acknowledgement was recorded.';
   },move);
   button('Dispute '+(kind==='condition'?'condition record':'possession handover'),async()=>{
    await flow.respond(kind,record.id,'dispute',note.value);await transaction();status.textContent='Your dispute was recorded.';
   },move);
  }
  for(const record of data.move_in_conditions||[]){
   if(record.record_type!=='pre_move_in')continue;
   move.append(el('h4','Pre-move-in condition'),el('p','Status · '+record.status),el('p',record.notes||'No condition notes supplied.'),el('p','Attached evidence items · '+(record.media_count||0)));
   if(record.media_count>0)move.append(el('p','Attached evidence review is not yet available on this page. Acknowledgement remains unavailable until it is connected.'));
   if(record.status==='submitted')responseForm('condition',record);
  }
  if(data.handover){
   const h=data.handover;move.append(el('h4','Possession handover'),el('p','Status · '+h.handover_status),el('p','Scheduled · '+(h.scheduled_for?new Date(h.scheduled_for).toLocaleString():'Pending')),el('p','Keys/access credentials · '+(h.keys_count??0)),el('p','Provider acknowledgement · '+(h.provider_acknowledged_at?'Recorded':'Pending')));
   if(h.renter_acknowledged_at)move.append(el('p','Your possession acknowledgement is recorded.'));
   else if(['ready','disputed'].includes(h.handover_status))responseForm('handover',h);
  }
  try{
   const ready=await flow.readiness();
   if(ready){
    move.append(el('h4','Move-in readiness'));
    for(const [label,key] of [['Agreement fully signed','agreement_fully_signed'],['Handover scheduled','handover_scheduled'],['Keys recorded','keys_recorded'],['Meter readings recorded','meter_readings_recorded'],['Condition acknowledged','condition_record_acknowledged'],['Renter handover acknowledged','renter_handover_acknowledged'],['Provider handover acknowledged','provider_handover_acknowledged']])move.append(el('p',label+' · '+(ready[key]?'Complete':'Pending')));
    move.append(el('p','Open condition issues · '+ready.open_condition_issues));
    if(data.transaction.status==='completed')move.append(el('p','Move-in is complete.'));
    else if(ready.ready_for_clean_completion)button('Complete move-in',async()=>{
     if(!window.confirm('Confirm you are ready to complete move-in?'))return;
     await flow.completeMoveIn(data.transaction.id);await transaction();status.textContent='Move-in completion was confirmed.';
    },move);
   }
  }catch(error){move.append(el('p','Move-in readiness is unavailable. '+error.message));}
  button('Refresh transaction details',transaction);button('Back to selection',load);
 }
 auth.ready.then(()=>run(load)).catch(()=>{status.textContent='Unable to restore your session. Log in again.';});
})();

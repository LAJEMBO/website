(() => {
 'use strict';
 const root=document.getElementById('rentalProgressApp'),auth=window.LajemboAuth;
 if(!root||!auth?.client||!window.LajemboRentalProgress)return;
 const selectionFlow=window.LajemboRentalProgress.create(auth.client);
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
 function showReceipts(parent,receipts){
   parent.append(el('h3','Payment receipts'));
   if(!receipts.length)parent.append(el('p','No payment receipts have been issued for this transaction.'));
   for(const receipt of receipts){
    const row=el('section');row.className='info-card';
    row.append(el('h4',receipt.receipt_number),el('p',receipt.receipt_purpose.replaceAll('_',' ')),
     el('p',new Intl.NumberFormat('en-NG',{style:'currency',currency:receipt.currency_code}).format(receipt.amount)),
     el('p','Issued '+new Date(receipt.issued_at).toLocaleString()));parent.append(row);
   }
 }
 async function history(){
  body.replaceChildren(el('h2','Rental history'));
  button('Back to rental progress',load);
  status.textContent='Loading rental history…';
  const records=await selectionFlow.rentalHistory();
  status.textContent='';
  if(!records.length)body.append(el('p','No rental history is available yet.'));
  for(const record of records){
   const card=el('section');card.className='info-card';
   card.append(el('h3',record.public_property_code),el('p',[record.area,record.city].filter(Boolean).join(' · ')),
    el('p',record.status==='closed'?'Closed tenancy':'Completed rental'),
    el('p','Annual rent · '+money(record.annual_rent)));
   button('Open rental record',()=>historyRecord(record.transaction_id),card);
   body.append(card);
  }
 }
 async function historyRecord(transactionId){
  body.replaceChildren(el('h2','Rental record'));
  button('Back to rental history',history);
  status.textContent='Loading rental record…';
  const {record,receipts}=await selectionFlow.rentalHistoryRecord(transactionId);
  status.textContent='';
  const card=el('section');card.className='info-card';
  for(const [label,key] of [['Annual rent','annual_rent'],['LAJEMBO success fee','success_fee'],['Caution deposit','caution_deposit'],['Total move-in cost','total_move_in_cost']]){
   card.append(el('p',label+' · '+money(record[key])));
  }
  if(record.closed_at)card.append(el('p','Closed · '+new Date(record.closed_at).toLocaleDateString()));
  showReceipts(card,receipts);
  body.append(card);
 }
 async function load(){
  status.textContent='Loading your property selection…';body.replaceChildren();
  button('Open active tenancy',openActiveTenancy);
  button('Rental history',history);
  const data=await selectionFlow.selection();status.textContent='';
  if(!data){body.append(el('p','No property selection is ready yet. Record your decision after completing a viewing.'));button('Refresh selection',load);return;}
  body.append(el('h2',data.public_property_code),el('p',[data.area,data.city,data.property_type].filter(Boolean).join(' · ')),
   el('p','Selection status · '+data.status),el('p','Provider decision · '+(data.provider_decision||'Pending')));
  for(const check of data.qualification_checks||[])body.append(el('p',check.label+' · '+check.result));
  if(data.costs){
   const card=costs(data.costs,'platform_fee');
   if(data.costs.confirmed_by_renter)card.append(el('p','Your acceptance of these costs is recorded.'));
   else if(!data.costs.confirmed_by_provider)card.append(el('p','Waiting for the provider to confirm the final costs.'));
   else button('Accept disclosed move-in costs',async()=>{await selectionFlow.acceptCosts(data);await load();status.textContent='Your acceptance was submitted. Check the current selection status.';},card);
  }else body.append(el('p','LAJEMBO is preparing the full disclosed move-in costs.'));
  if(data.transaction_id)button('Open transaction details',transaction);
  button('Refresh selection',load);
 }
 async function openActiveTenancy(){
  const active=await selectionFlow.activeTenancy();
  if(!active?.transaction?.id){status.textContent='No active tenancy found.';return;}
  await transaction(active.transaction.id);
 }
 async function maintenance(flow,back){
  body.replaceChildren(el('h2','Maintenance'));
  button('Back to active tenancy',back);
  status.textContent='Loading maintenance requests…';
  const requests=await flow.maintenance();
  status.textContent='';
  const card=el('section');card.className='info-card';card.append(el('h3','New request'));body.append(card);
  function field(label,tag='input'){
   const wrapper=el('label',label+' '),input=el(tag);
   wrapper.append(input);card.append(wrapper);return input;
  }
  const category=field('Category');category.value='general';
  const summary=field('Short summary'),description=field('Description (optional)','textarea');
  const urgency=field('Urgency','select');
  for(const level of ['low','normal','high','urgent']){
   const option=el('option',level);option.value=level;urgency.append(option);
  }
  urgency.value='normal';
  const photo=field('Private photo (optional)');photo.type='file';photo.accept='image/jpeg,image/png,image/webp';
  const attachments=[],count=el('p');card.append(count);
  button('Attach maintenance photo',async()=>{
   attachments.push(await flow.uploadMaintenancePhoto(photo.files?.[0]));
   photo.value='';count.textContent=attachments.length+' photos attached.';
  },card);
  button('Submit maintenance request',async()=>{
   await flow.submitMaintenance({category:category.value,summary:summary.value,description:description.value,urgency:urgency.value,attachments});
   await maintenance(flow,back);status.textContent='Maintenance request submitted.';
  },card);
  body.append(el('h3','Open requests'));
  if(!requests.length)body.append(el('p','No open maintenance requests.'));
  for(const request of requests){
   const row=el('section');row.className='info-card';
   row.append(el('h4',request.summary),el('p',[request.category,request.urgency,request.status].join(' · ')));
   if(request.scheduled_for)row.append(el('p','Scheduled · '+new Date(request.scheduled_for).toLocaleString()));
   if(request.resolution_note)row.append(el('p','Resolution · '+request.resolution_note));
   if(request.status==='resolved'){
    const label=el('label','Reason for reopening '),note=el('textarea');label.append(note);row.append(label);
    async function respond(action){
     await flow.respondToMaintenance(request.request_id,action,action==='reopen'?note.value:'');
     await maintenance(flow,back);status.textContent=action==='accept'?'Resolution accepted.':'Request reopened.';
    }
    button('Accept resolution',()=>respond('accept'),row);
    button('Reopen request',()=>respond('reopen'),row);
   }
   body.append(row);
  }
 }
 async function transaction(activeId){
  const flow=activeId?window.LajemboRentalProgress.create(auth.client,{transactionId:activeId}):selectionFlow;
  const refreshTransaction=()=>transaction(activeId);
  status.textContent='Loading your transaction…';body.replaceChildren();
  const data=await flow.workspace();status.textContent='';
  if(!data){body.append(el('p','Your transaction is being prepared.'));button('Back to selection',load);return;}
  body.append(el('h2',data.property.public_property_code),el('p','Transaction status · '+data.transaction.status));
  if(activeId){
   body.prepend(el('h2','Active tenancy'));
   button('Open maintenance',()=>maintenance(flow,refreshTransaction));
  }
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
     await flow.acceptAgreement(data);await refreshTransaction();status.textContent='Your agreement acceptance is recorded.';
    },records);
   }
   showReceipts(records,receipts);
  }catch(error){records.append(el('p','Records could not be loaded. '+error.message));}
  const move=el('section');move.className='info-card';move.append(el('h3','Move-in and possession'));body.append(move);
  function responseForm(kind,record,reviewed=null){
   const label=el('label','Reason for dispute (required when disputing)'),note=el('textarea');label.append(note);move.append(label);
   button('Acknowledge '+(kind==='condition'?'condition record':'possession handover'),async()=>{
    if(kind==='condition'&&record.media_count>0&&(!reviewed||reviewed.assets.some(a=>!reviewed.opened.includes(a.asset_id))))throw Error('Open all attached condition evidence before acknowledging.');
    if(!window.confirm('Confirm that you have reviewed and agree with this '+(kind==='condition'?'condition record':'possession handover')+'?'))return;
    await flow.respond(kind,record.id,'acknowledge','',reviewed);await refreshTransaction();status.textContent='Your acknowledgement was recorded.';
   },move);
   button('Dispute '+(kind==='condition'?'condition record':'possession handover'),async()=>{
    await flow.respond(kind,record.id,'dispute',note.value);await refreshTransaction();status.textContent='Your dispute was recorded.';
   },move);
  }
  for(const record of data.move_in_conditions||[]){
   if(record.record_type!=='pre_move_in')continue;
   move.append(el('h4','Pre-move-in condition'),el('p','Status · '+record.status),el('p',record.notes||'No condition notes supplied.'),el('p','Attached evidence items · '+(record.media_count||0)));
   let reviewed=null;
   if(record.media_count>0){
    try{
     const evidence=await flow.conditionEvidence(record.id);reviewed={...evidence,opened:[]};
     for(const [index,asset] of evidence.assets.entries())button('Review condition attachment '+(index+1),async()=>{
      const url=await flow.evidenceLink(record.id,asset.asset_id);
      const link=el('a','Open condition attachment '+(index+1)+' (five-minute link)');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.className='info-button';
      link.onclick=()=>{if(!reviewed.opened.includes(asset.asset_id))reviewed.opened.push(asset.asset_id);};move.append(link);
     },move);
    }catch(error){move.append(el('p','Evidence review is unavailable. '+error.message));}
   }
   if(record.status==='submitted')responseForm('condition',record,reviewed);
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
     await flow.completeMoveIn(data.transaction.id);await refreshTransaction();status.textContent='Move-in completion was confirmed.';
    },move);
   }
  }catch(error){move.append(el('p','Move-in readiness is unavailable. '+error.message));}
  if(data.transaction.status==='completed'){
   const card=el('section');card.className='info-card';card.append(el('h3','Seven-day move-in condition record'));body.append(card);
   try{
    const protection=await flow.protection();
    if(!protection)card.append(el('p','The condition reporting window is not available yet.'));
    else{
     card.append(el('p',protection.message),el('p','Reporting deadline · '+new Date(protection.condition_check_deadline).toLocaleString()),el('p','Issues recorded · '+protection.issues_reported));
     const prior=(data.move_in_conditions||[]).find(r=>['renter_one_week_checklist','seven_day_renter_check'].includes(r.record_type));
     if(prior)card.append(el('p','Your checklist status · '+prior.status),el('p',prior.notes||''));
     if(prior?.media_count>0){
      try{
       const evidence=await flow.conditionEvidence(prior.id);
       for(const [index,asset] of evidence.assets.entries())button('Review saved '+(asset.mime_type?.startsWith('video/')?'video':'attachment')+' '+(index+1),async()=>{
        const url=await flow.evidenceLink(prior.id,asset.asset_id),link=el('a','Open saved condition attachment '+(index+1)+' (five-minute link)');
        link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.className='info-button';card.append(link);
       },card);
      }catch(error){card.append(el('p','Saved attachments could not be loaded. '+error.message));}
     }
     if(protection.window_open===true&&(!prior||['draft','submitted','disputed'].includes(prior.status))){
      const draft=prior?await flow.conditionDraft(data.transaction.id):null;
      const attachments=[...(draft?.media_manifest||[])];
      const label=el('label','Condition notes'),notes=el('textarea');notes.value=draft?.notes||prior?.notes||'';notes.rows=5;label.append(notes);card.append(label);
      card.append(el('p','Describe the condition issues you found after move-in. Attach private photos or videos up to 25 MB each.'));
      const fileLabel=el('label','Condition photo or video'),file=el('input');file.type='file';file.accept='image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime';fileLabel.append(file);card.append(fileLabel);
      const count=el('p',attachments.length+' registered attachments selected');card.append(count);
      button('Upload condition attachment',async()=>{
       const asset=await flow.uploadConditionEvidence(data.transaction.id,file.files?.[0]);
       attachments.push(asset);file.value='';count.textContent=attachments.length+' registered attachments selected';status.textContent='Attachment uploaded privately. Save the checklist to include it in your condition record.';
      },card);
      button('Save seven-day condition checklist',async()=>{
       await flow.submitConditionCheck(data.transaction.id,notes.value,attachments);
       await refreshTransaction();status.textContent='Your seven-day condition checklist was saved to the tenancy record.';
      },card);
     }else card.append(el('p',protection.window_open?'Your existing checklist is available above.':'The reporting window has closed. Your existing tenancy record remains available.'));
    }
   }catch(error){card.append(el('p','Unable to load move-in protection. '+error.message));}
  }
  button('Refresh transaction details',refreshTransaction);button('Back to selection',load);
 }
 auth.ready.then(()=>run(load)).catch(()=>{status.textContent='Unable to restore your session. Log in again.';});
})();

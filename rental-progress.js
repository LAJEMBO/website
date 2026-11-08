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
  button('Refresh transaction details',transaction);button('Back to selection',load);
 }
 auth.ready.then(()=>run(load)).catch(()=>{status.textContent='Unable to restore your session. Log in again.';});
})();

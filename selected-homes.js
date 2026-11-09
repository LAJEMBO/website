(() => {
 'use strict';
 const root=document.getElementById('selectedHomesApp'),auth=window.LajemboAuth;
 if(!root||!auth?.client||!window.LajemboViewing)return;
 const flow=window.LajemboViewing.create(auth.client);
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const money=value=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(value));
 const status=el('p'),body=el('div');status.setAttribute('role','status');root.replaceChildren(status,body);
 let items=[],ids=[],busy=false;
 const back=el('a','Back to my viewing choices');back.href='viewings.html';root.append(back);
 async function load(){
  status.textContent='Loading your selected homes…';
  items=await flow.load();
  const locked=items[0]?.shortlist_status==='locked_for_viewing';
  if(locked)ids=items.filter(item=>item.renter_decision==='selected_for_viewing').map(item=>item.listing_id);
  else{
   const draft=JSON.parse(sessionStorage.getItem('lajembo_viewing_review')||'null');
   if(!draft||draft.shortlistId!==items[0]?.shortlist_id||!Array.isArray(draft.listingIds))throw Error('Return to your current shortlist and choose your homes.');
   ids=draft.listingIds;
  }
  if(ids.length<1||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>!items.some(item=>item.listing_id===id)))throw Error('Select 1–5 homes from your current shortlist.');
  status.textContent='';body.replaceChildren();
  body.append(el('h2','Your selected homes'));
  for(const item of items.filter(item=>ids.includes(item.listing_id))){
   const card=el('section');card.className='info-card';
   card.append(el('h3',item.public_property_code),
    el('p',`${item.bedrooms??'—'} bed · ${item.bathrooms??'—'} bath · ${item.property_type}`),
    el('p',[item.estate,item.neighborhood,item.area,item.city,item.state].filter(Boolean).join(', ')),
    el('p','Annual rent · '+money(item.annual_rent)),
    el('p','Total move-in cost · '+money(item.total_move_in_cost)));
   window.LajemboPropertyMedia?.gallery(item.listing_id,card);
   body.append(card);
  }
  body.append(el('p',`${ids.length} of 5 homes selected. Exact addresses remain protected. Confirming viewing choices does not commit you to a tenancy.`));
  const confirm=el('button','Confirm selected homes and continue');confirm.type='button';confirm.className='info-button';
  confirm.onclick=async()=>{
   if(busy)return;busy=true;confirm.disabled=true;status.textContent='';
   try{
    const result=await flow.confirm(items,ids);
    if(result.saved)items=items.map(item=>({...item,shortlist_status:'locked_for_viewing',renter_decision:ids.includes(item.listing_id)?'selected_for_viewing':'not_selected'}));
    if(result.error)throw Error((result.saved?'Your choices are saved. ':'')+result.error);
    sessionStorage.removeItem('lajembo_viewing_review');
    location.href='viewings.html?step=checkout';
   }catch(error){status.textContent=error.message||'Unable to continue. Retry your saved choices.';}
   finally{busy=false;confirm.disabled=false;}
  };
  body.append(confirm);
 }
 auth.ready.then(load).catch(error=>{body.replaceChildren();status.textContent=error.message||'Unable to load your choices. Log in and try again.';});
})();

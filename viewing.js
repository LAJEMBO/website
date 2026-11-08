(() => {
 'use strict';
 const root=document.getElementById('viewingApp'),A=window.LajemboAuth,F=window.LajemboViewing;
 if(!root||!A?.client||!F)return;
 const flow=F.create(A.client),el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const status=el('p'),body=el('div');status.setAttribute('role','status');root.replaceChildren(status,body);
 let items=[],selected=[],review=false,busy=false;
 const locked=()=>items[0]?.shortlist_status==='locked_for_viewing';
 function button(label,action,parent=body){const b=el('button',label);b.type='button';b.className='info-button';b.disabled=busy;b.onclick=()=>run(action);parent.append(b);return b;}
 async function run(action){if(busy)return;busy=true;root.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);try{await action();}catch(e){status.textContent=e.message||'Unable to continue. Refresh and try again.';}finally{busy=false;root.querySelectorAll('button,input,select').forEach(n=>n.disabled=false);}}
 function choices(){body.replaceChildren();body.append(el('h2',locked()?'Your saved viewing choices':review?'Review your viewing choices':'Step 1 — Choose homes to view'));
  if(!items.length){body.append(el('p','No qualified homes are available for this shortlist. Review your requirements or check again later.'));button('Refresh saved choices',load);return;}
  for(const item of items){const card=el('section');card.className='info-card';const label=el('label'),input=el('input');input.type='checkbox';input.checked=selected.includes(item.listing_id);input.onclick=()=>{if(locked()||review){input.checked=selected.includes(item.listing_id);return;}selected=input.checked?[...selected,item.listing_id]:selected.filter(id=>id!==item.listing_id);choices();};input.setAttribute('aria-label',`Select ${item.public_property_code}`);label.append(input,document.createTextNode(` ${item.public_property_code} — ${item.bedrooms??'—'} bed · ${item.bathrooms??'—'} bath · ${item.property_type}`));card.append(label,el('p',[item.neighborhood,item.area,item.city,item.state].filter(Boolean).join(', ')),el('p',`Annual rent: ₦${Number(item.annual_rent).toLocaleString('en-NG')} · Total move-in cost: ₦${Number(item.total_move_in_cost).toLocaleString('en-NG')}`));body.append(card);}
  body.append(el('p',`${selected.length} of 5 selected. Exact property addresses remain protected.`));
  if(review&&!locked()){body.append(el('p','Confirming saves these homes for your viewing package. It does not book an appointment or commit you to a tenancy.'));button('Change my choices',()=>{review=false;choices();});}
  if(selected.length)button(locked()?'Continue to viewing checkout':review?'Confirm choices and continue':'Review my viewing choices',async()=>{if(!locked()&&!review){review=true;choices();return;}const r=await flow.confirm(items,selected);if(r.saved)items=items.map(i=>({...i,shortlist_status:'locked_for_viewing',renter_decision:selected.includes(i.listing_id)?'selected_for_viewing':'not_selected'}));if(r.error){choices();status.textContent=(r.saved?'Your choices are saved. ':'')+r.error;return;}await checkout();});
  button('Refresh saved choices',load);
 }
 async function savedAppointments(){
  const stops=await flow.viewingDay();body.replaceChildren();body.append(el('h2','Your saved appointments'));
  status.textContent=stops?.length?'Exact addresses remain subject to controlled release.':'No confirmed viewing day is available yet.';
  for(const routeId of new Set((stops||[]).map(stop=>stop.route_id)))button('Confirm viewing-day check-in',async()=>{await flow.checkInDay(routeId);await savedAppointments();status.textContent='Viewing-day check-in confirmed.';});
  for(const stop of stops||[]){
   const card=el('section');card.className='info-card';
   card.append(el('h3',`Stop ${stop.sequence_no} · ${stop.public_property_code}`),
    el('p',stop.planned_arrival_at?F.format(stop.planned_arrival_at):`Viewing date: ${stop.route_date} · Arrival time to be confirmed`),
    el('p',stop.renter_status_label));
   button('Check in at property',async()=>{await flow.checkInProperty(stop.viewing_id);await savedAppointments();status.textContent='Property check-in confirmed.';},card);
   if(stop.exact_address_available_to_renter)button('Show released address',async()=>{status.textContent=await flow.releasedAddress(stop.viewing_id);},card);
   if(stop.viewing_status==='completed')button('Record my decision',()=>decisionForm(stop),card);
   body.append(card);
  }
  button('Back to saved choices',load);
 }
 function decisionForm(stop){
  body.replaceChildren();status.textContent='';body.append(el('h2','What do you think about this property?'),el('p',stop.public_property_code));
  function selectField(label,options){
   const wrapper=el('label',label+' '),select=el('select');
   for(const [value,text] of options){const option=el('option',text);option.value=value;select.append(option);}
   wrapper.append(select);body.append(wrapper);return {wrapper,select};
  }
  const decision=selectField('Your decision',[['','Choose a decision'],['interested','Interested'],['maybe','Maybe'],['not_interested','Not interested']]).select;
  const reason=selectField('Main reason',[['','Choose a reason'],['price_too_high','Price too high'],['move_in_cost_too_high','Move-in cost too high'],['location','Location'],['property_condition','Property condition'],['size_layout','Size or layout'],['amenities_features','Amenities or features'],['electricity_power','Electricity or power'],['water','Water'],['security_environment','Security or environment'],['furnishing','Furnishing'],['service_charge','Service charge'],['landlord_provider_terms','Landlord or provider terms'],['different_from_listing_expectation','Different from listing expectations'],['not_ready_to_move','Not ready to move'],['found_another_property','Found another property'],['other','Other']]);
  const noteLabel=el('label','Other reason '),note=el('textarea');noteLabel.append(note);body.append(noteLabel);
  const rating=selectField('Rating (optional)',[['','No rating'],...Array.from({length:5},(_,i)=>[String(i+1),String(i+1)])]).select;
  function updateFields(){const needsReason=decision.value==='maybe'||decision.value==='not_interested';reason.wrapper.hidden=!needsReason;noteLabel.hidden=!needsReason||reason.select.value!=='other';}
  decision.onchange=updateFields;reason.select.onchange=updateFields;updateFields();
  button('Save decision',async()=>{
   await flow.recordDecision(stop,decision.value,reason.select.value,note.value,rating.value?Number(rating.value):null);
   await savedAppointments();
   status.textContent=decision.value==='interested'?'Interest recorded. LAJEMBO will continue with availability recheck and qualification.':'Your viewing decision has been saved.';
  });
  button('Back to saved appointments',savedAppointments);
 }
 const progress=el('a','View rental selection and costs');progress.href='rental-progress.html';root.insertBefore(progress,body);
 const appointments=el('button','View saved appointments');appointments.type='button';appointments.className='info-button';appointments.onclick=()=>run(savedAppointments);root.insertBefore(appointments,body);
 async function load(){status.textContent='Loading your saved choices…';items=await flow.load();selected=items.filter(i=>i.renter_decision==='selected_for_viewing').map(i=>i.listing_id);review=false;status.textContent='';choices();}
 async function checkout(){const p=await flow.packageFor(items[0].shortlist_id);body.replaceChildren();body.append(el('h2','Step 2 — Viewing package'),el('p','Payment confirmations use your registered email and SMS number. A payment receipt and a booked appointment are separate confirmations. If a message is delayed, check your package status here before paying again.'));
  if(p?.status==='active'){status.textContent='Your viewing package is active. Appointment eligibility is checked again when you request and confirm a time.';button('Choose viewing availability',availability);return;}
  const rows=await flow.checkout(),c=rows?.[0];status.textContent=c?`Viewing package: ₦${Number(c.amount).toLocaleString('en-NG')} · Payment status: ${c.payment_status}`:'No current payment checkout was found. Return to saved choices to resume.';body.append(el('p','One ₦7,500 package covers up to five property viewings. Online payment is not available until LAJEMBO activates production payment routing. No appointment has been booked.'));button('Refresh payment status',checkout);button('Back to saved choices',choices);
 }
 async function availability(){const p=await flow.packageFor(items[0].shortlist_id);if(p?.status!=='active')throw Error('An active viewing package is required before scheduling. Refresh payment status first.');body.replaceChildren();status.textContent='';body.append(el('h2','Step 3 — When can you attend?'),el('p','Choose a date and times between 08:00 and 19:00 Nigeria time (WAT). Saving availability is not a booking.'));
  const field=(title,type)=>{const l=el('label',title+' '),n=el(type==='select'?'select':'input');if(type!=='select')n.type=type;l.append(n);body.append(l);return n;};
  const date=field('Viewing date','date'),start=field('Available from (Nigeria time)','select'),end=field('Available until (Nigeria time)','select');
  for(const n of [start,end]){const empty=el('option','Choose time');empty.value='';n.append(empty);for(const time of (n===start?F.times.slice(0,-1):F.times)){const o=el('option',time);o.value=time;n.append(o);}}
  button('Save availability',async()=>{await flow.saveWindow(date.value,start.value,end.value);await availability();status.textContent='Your availability is saved. Find an available appointment and confirm it next.';});
  const windows=await flow.windows();for(const w of windows||[])body.append(el('p',`${F.format(w.starts_at)} – ${F.format(w.ends_at)}`));
  if(windows?.length)button('Find viewing times',async()=>{const proposals=await flow.proposals(items[0].shortlist_id);body.replaceChildren();body.append(el('h2','Step 4 — Confirm an offered appointment'));status.textContent=proposals.length?'All times below are Nigeria time (WAT).':'No matching times are available. Change your availability or try again later.';for(const proposal of proposals){const card=el('section');card.className='info-card';card.append(el('p',`${F.format(proposal.start)} – ${F.format(proposal.end)}`));if(proposal.status==='proposed')button('Confirm this viewing time',async()=>{await flow.confirmTime(proposal.proposal_id);body.replaceChildren();body.append(el('h2','Your viewing appointment is confirmed'),el('p',`${F.format(proposal.start)} – ${F.format(proposal.end)}`));status.textContent='The server confirmed your appointment. Exact addresses remain subject to controlled release.';},card);body.append(card);}button('Change availability',availability);});
  button('Refresh package status',checkout);
 }
 A.ready.then(()=>run(load)).catch(()=>{status.textContent='Unable to restore your session. Log in again.';});
})();

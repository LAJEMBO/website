/* Renter viewing operations use existing owner-scoped reads and authoritative RPCs. */
(() => {
 'use strict';
 const times=Array.from({length:45},(_,i)=>`${String(Math.floor((480+i*15)/60)).padStart(2,'0')}:${String(i*15%60).padStart(2,'0')}`);
 function viewingWindow(date,start,end,now=Date.now()) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!times.includes(start)||!times.includes(end))throw Error('Choose a valid date, start time and end time.');
  const a=new Date(`${date}T${start}:00+01:00`),b=new Date(`${date}T${end}:00+01:00`);
  if(!Number.isFinite(a.getTime())||new Date(a.getTime()+3600000).toISOString().slice(0,10)!==date)throw Error('Choose a valid viewing date.');
  if(a.getTime()<=now)throw Error('Choose a future date and time in Nigeria time.');
  if(b<=a)throw Error('Choose an end time after the start time.');
  return {start:a.toISOString(),end:b.toISOString()};
 }
 const format=value=>`${new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Lagos',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})} WAT (Nigeria)`;
 function create(client) {
  async function rpc(name,args){const r=await client.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data;}
  async function owner(){const r=await client.auth.getUser();if(r.error||!r.data.user)throw Error('Log in to continue your viewing journey.');return r.data.user.id;}
  async function packageFor(shortlistId){const uid=await owner();const s=await client.from('renter_match_shortlists').select('viewing_package_id').eq('id',shortlistId).eq('user_id',uid).limit(1);if(s.error)throw Error('Unable to check your saved viewing package.');const id=s.data?.[0]?.viewing_package_id;if(!id)return null;const p=await client.from('viewing_packages').select('id,status,purchase_amount,total_viewings_allowed,used_viewings').eq('id',id).eq('user_id',uid).limit(1);if(p.error)throw Error('Unable to check your viewing package.');return p.data?.[0]||null;}
  async function load(){const uid=await owner(),customer=await rpc('get_my_customer_profile');if(customer.account_type!=='home_seeker'||customer.account_status!=='active'||customer.identity_verification_status!=='verified')throw Error('An active renter account with approved identity verification is required.');const p=await client.from('home_profiles').select('id,active').eq('user_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);if(p.error)throw Error('Unable to load your saved home requirements.');if(!p.data?.[0]?.active)throw Error('Save active home requirements before choosing homes to view.');const id=await rpc('generate_my_match_shortlist',{p_home_profile_id:p.data[0].id});const rows=await rpc('get_my_current_match_shortlist');return (rows||[]).filter(item=>item.shortlist_id===id);}
  async function confirm(items,ids){let saved=items[0]?.shortlist_status==='locked_for_viewing';const selected=saved?items.filter(i=>i.renter_decision==='selected_for_viewing').map(i=>i.listing_id):ids;const sid=items[0]?.shortlist_id;
   if(!sid||selected.length<1||selected.length>5||new Set(selected).size!==selected.length||selected.some(id=>!items.some(i=>i.listing_id===id&&i.shortlist_id===sid)))return{saved,error:'Choose 1–5 homes from this shortlist.'};
   try{if(!saved){await rpc('set_my_shortlist_viewing_choices',{p_shortlist_id:sid,p_listing_ids:selected});saved=true;}const p=await packageFor(sid);if(p?.status!=='active')await rpc('start_my_viewing_checkout',{p_shortlist_id:sid});return{saved,error:null};}catch(e){return{saved,error:e.message||'Unable to continue. Refresh your saved choices and retry.'};}
  }
  return {load,confirm,packageFor,checkout:()=>rpc('get_my_viewing_payment_checkout'),windows:()=>rpc('get_my_viewing_availability'),saveWindow:(date,start,end)=>{const w=viewingWindow(date,start,end);return rpc('set_my_viewing_availability',{p_starts_at:w.start,p_ends_at:w.end});},proposals:async sid=>{const p=await rpc('prepare_my_viewing_schedule',{p_shortlist_id:sid});if(!p?.cluster_id)throw Error('No schedule is ready. Please retry later.');return rpc('get_my_viewing_schedule_proposals',{p_cluster_id:p.cluster_id});},confirmTime:async id=>{const result=await rpc('confirm_my_viewing_schedule',{p_proposal_id:id});if(result?.status!=='confirmed')throw Error('The appointment was not confirmed. Check saved appointments before retrying.');return result;},viewingDay:()=>rpc('get_my_viewing_day')};
 }
 window.LajemboViewing={create,times,viewingWindow,format};
})();

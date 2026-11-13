(() => {
 const auth=window.LajemboAuth, element=id=>document.getElementById(id);
 let cleanup, generation=0;
 async function load(){
  const token=++generation;
  element('load').hidden=true;
  if(cleanup){cleanup();cleanup=null;}
  element('photos').replaceChildren();
  element('status').textContent='Loading your identity submission…';
  try {
   await auth.ready;if(token!==generation)return;
   const user=await auth.client.auth.getUser();if(token!==generation)return;
   if(user.error || !user.data.user)throw Error('Sign in through Account before uploading identity photos.');
   const experience=await auth.client.rpc('get_my_onboarding_experience');if(token!==generation)return;
   if(experience.error)throw experience.error;
   const kind=experience.data?.account_type==='provider'?'provider':experience.data?.account_type==='home_seeker'?'renter':null;
   if(!kind)throw Error('Complete your account registration before uploading identity photos.');
   element('back').href=kind==='provider'?'provider-workspace.html':'registration.html?intent=renter';
   element('back').textContent=kind==='provider'?'Back to provider workspace':'Back to renter registration';
   const result=await auth.client.rpc(kind==='renter'?'get_my_renter_identity_submission':'get_my_provider_identity_submission');
   if(token!==generation)return;
   if(result.error)throw result.error;
   if(!result.data?.submission_id)throw Error('Submit your identity document details first, then return here.');
   element('back').href=kind==='provider'?'provider-workspace.html':'registration.html?intent=renter';
   element('status').textContent='Identity status: '+result.data.status.replaceAll('_',' ')+(result.data.review_note?' · '+result.data.review_note:'');
   const release=await window.LajemboIdentityPhotos(element('photos'),kind,result.data.submission_id,['pending_review','needs_more_info'].includes(result.data.status));
   if(token!==generation){if(release)release();return;}cleanup=release;
  }catch(error){if(token===generation){element('status').textContent=error.message;element('load').hidden=false;}}
 }
 element('load').onclick=()=>void load();
 auth.client.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){
   generation++;if(cleanup){cleanup();cleanup=null;}element('photos').replaceChildren();
   element('status').textContent='Your session changed. Reload to continue.';
   element('load').hidden=false;
  }
 });
 void load();
})();
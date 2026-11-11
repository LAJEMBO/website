(() => {
 const auth=window.LajemboAuth, element=id=>document.getElementById(id);
 let cleanup, busy=false;
 async function load(){
  if(busy)return;
  busy=true;element('load').disabled=true;
  if(cleanup)cleanup();
  element('photos').replaceChildren();
  try {
   const session=await auth.ready;
   if(!session)throw Error('Sign in through Account before uploading identity photos.');
   const kind=element('kind').value;
   const result=await auth.client.rpc(kind==='renter'?'get_my_renter_identity_submission':'get_my_provider_identity_submission');
   if(result.error)throw result.error;
   if(!result.data?.submission_id)throw Error('Submit your identity document details first, then return here.');
   element('status').textContent='Identity status. '+result.data.status.replaceAll('_',' ');
   cleanup=await window.LajemboIdentityPhotos(element('photos'),kind,result.data.submission_id,['pending_review','needs_more_info'].includes(result.data.status));
  }catch(error){element('status').textContent=error.message;}
  finally{busy=false;element('load').disabled=false;}
 }
 element('load').onclick=()=>void load();
 void load();
})();
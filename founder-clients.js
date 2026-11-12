(() => {
 'use strict';
 const auth=window.LajemboAuth, el=id=>document.getElementById(id);
 let allowed=false,busy=false,generation=0,offset=0,cleanup=[];
 const initialSubmission=new URLSearchParams(location.search).get('submission');
 const hidden=new Set(['id','user_id','provider_id','primary_representative_user_id','reviewed_by','verification_review_id']);
 const label=k=>k.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
 const node=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n};
 const clear=()=>{generation++;cleanup.forEach(fn=>fn());cleanup=[];el('records').replaceChildren();allowed=false;el('workspace').hidden=true;busy=false};
 async function rpc(name,args={}){const r=await auth.client.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
 function fields(value){
  const box=document.createElement('div');
  if(value===null||value===undefined||value==='')box.append(node('p','Not provided'));
  else if(Array.isArray(value)){if(!value.length)box.append(node('p','No saved records'));value.forEach(v=>box.append(fields(v)))}
  else if(typeof value==='object')for(const[k,v]of Object.entries(value)){if(!hidden.has(k)){box.append(node('h3',label(k)));box.append(fields(v))}}
  else box.append(node('p',typeof value==='boolean'?(value?'Yes':'No'):String(value)));
  return box;
 }
 async function load(userId,page=0){
  if(!allowed||busy)return;
  const token=++generation;busy=true;el('search').disabled=true;
  cleanup.forEach(fn=>fn());cleanup=[];el('records').replaceChildren();el('status').textContent='Loading client records…';
  try{
   const detail=Boolean(userId||initialSubmission);
   const data=await rpc(detail?'founder_get_client_record':'founder_get_client_directory',detail?(userId?{p_user_id:userId}:{p_submission_id:initialSubmission}):{p_search:el('query').value.trim(),p_offset:page});
   if(token!==generation||!allowed)return;
   if(detail){
    for(const kind of ['renter','provider'])for(const item of data[kind+'_identity']||[]){
     const photos=document.createElement('article');el('records').append(photos);
     photos.setAttribute('aria-label',kind==='renter'?'Renter identity photos':'Provider identity photos');
     const stop=await window.LajemboIdentityPhotos(photos,kind,item.id,false);
     if(token!==generation||!allowed){if(stop)stop();return}
     if(stop)cleanup.push(stop);
    }
    if(!['renter','provider'].some(kind=>(data[kind+'_identity']||[]).length))el('records').append(node('p','No identity submission is saved for this client.'));
    el('records').append(node('h2','Saved client details'));
    for(const[k,v]of Object.entries(data)){const section=document.createElement('article');section.append(node('h2',label(k)),fields(v));el('records').append(section)}
    el('previous').disabled=true;el('next').disabled=true;
   }else{
    offset=page;
    for(const row of data){
     const card=document.createElement('article');card.append(node('h2',row.name||'Client'),node('p',row.account_type.replaceAll('_',' ')+' · '+row.account_status));
     const button=node('button','View full client record');button.onclick=()=>void load(row.user_id);card.append(button);el('records').append(card);
    }
    if(!data.length)el('records').append(node('p','No clients found.'));
    el('previous').disabled=offset===0;el('next').disabled=data.length<50;
   }
   el('status').textContent='';window.scrollTo(0,0);
  }catch(e){if(token===generation)el('status').textContent=e.message}
  finally{if(token===generation){busy=false;el('search').disabled=false}}
 }
 el('search').onclick=()=>void load();el('previous').onclick=()=>void load(undefined,Math.max(0,offset-50));el('next').onclick=()=>void load(undefined,offset+50);
 auth.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){clear();el('status').textContent='Sign in again to view client records.'}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();el('status').textContent='Reload this page to reopen private client records.'}});
 const authGeneration=generation;
 void auth.ready.then(async session=>{
  if(!session){el('login').hidden=false;el('status').textContent='Sign in to continue.';return}
  await auth.prepareFounderAccess('founder-clients.html');
  if(await rpc('is_staff_role',{required_roles:['founder']})!==true)throw Error('Founder access required.');
  if(authGeneration!==generation)return;
  allowed=true;el('workspace').hidden=false;await load();
 }).catch(e=>{clear();el('status').textContent=e.message});
})();


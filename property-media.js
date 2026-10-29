/* Shared website media rules. Backend remains authoritative. */
(() => {
 'use strict';
 const A=window.LajemboAuth, client=A?.client;
 if(!client)return;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
 async function rpc(name,args){const r=await client.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
 async function duration(file){const url=URL.createObjectURL(file),video=document.createElement('video');try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video duration could not be checked. Try another file.')),15000);video.preload='metadata';video.onloadedmetadata=()=>{clearTimeout(timer);resolve(video.duration)};video.onerror=()=>{clearTimeout(timer);reject(Error('Video could not be read. Use a supported video file.'))};video.src=url})}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}}
 function provider(card){if(card.dataset.mediaBound)return;card.dataset.mediaBound='true';const id=card.dataset.listing;if(!id||id==='null')return;
  const box=el('section');box.className='media-box';box.append(el('h4','Property photos & walkthrough'),el('p','Add 5–12 current photos covering living areas, bedrooms, kitchen, bathrooms and exterior. Add one 1–2-minute walkthrough. Maximum: 20 MB per photo; 150 MB per video. Uploads stay private until independent review, processing and publication approval.'));
  const label=el('label','Date and time this media was captured '),captured=el('input');captured.type='datetime-local';captured.required=true;label.append(captured);box.append(label);
  const typeLabel=el('label','Media type '),type=el('select');for(const [v,t] of [['photo','Photo'],['video','Walkthrough video']]){const o=el('option',t);o.value=v;type.append(o)}typeLabel.append(type);box.append(typeLabel);
  const fileLabel=el('label','Choose one file '),file=el('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';fileLabel.append(file);box.append(fileLabel);type.onchange=()=>{file.value='';file.accept=type.value==='photo'?'image/jpeg,image/png,image/webp':'video/mp4,video/quicktime,video/webm'};
  const button=el('button','Upload privately for review'),status=el('p');button.className='secondary';button.type='button';status.setAttribute('role','status');box.append(button,status);card.append(box);
  button.onclick=async()=>{if(button.disabled)return;const f=file.files[0],kind=type.value;let path=null;button.disabled=true;
   try{if(!f)throw Error('Choose a file first.');const date=new Date(captured.value);if(!captured.value||!Number.isFinite(date.getTime())||date>Date.now())throw Error('Enter a valid capture date and time that is not in the future.');
    const allowed=kind==='photo'?['image/jpeg','image/png','image/webp']:['video/mp4','video/quicktime','video/webm'];if(!allowed.includes(f.type)||!f.size||f.size>(kind==='photo'?20:150)*1024*1024)throw Error('Unsupported file type or file exceeds the displayed size limit.');
    if(kind==='video'){const seconds=await duration(f);if(!Number.isFinite(seconds)||seconds<60||seconds>120)throw Error('Walkthrough video must be between 1 and 2 minutes.');}
    const auth=await client.auth.getUser();if(auth.error||!auth.data.user)throw Error('Log in again to upload property media.');
    const progress=await rpc('get_my_listing_media_progress',{p_listing_id:id}),assets=progress.assets||[];if(assets.filter(x=>x.media_type===kind&&x.review_status!=='rejected').length>=(kind==='photo'?12:1))throw Error('The active media limit has been reached. Contact LAJEMBO to replace existing media.');
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'}[f.type];path=`${id}/${auth.data.user.id}/${crypto.randomUUID()}.${ext}`;status.textContent='Uploading privately…';
    const upload=await client.storage.from('listing-media').upload(path,f,{contentType:f.type,upsert:false});if(upload.error)throw upload.error;
    try{await rpc('register_my_listing_media_asset',{p_listing_id:id,p_media_type:kind,p_storage_path:path,p_captured_at:date.toISOString()})}catch(error){await client.storage.from('listing-media').remove([path]);throw error}
    file.value='';status.textContent='Uploaded privately and submitted for independent media review. This does not publish the property.';
   }catch(error){status.textContent=error.message||'Unable to upload. Try again.'}finally{button.disabled=false}
  };
 }
 async function gallery(listingId,host){const button=el('button','View photos & video'),area=el('div'),status=el('p');button.className='info-button';status.setAttribute('role','status');host.append(button,status,area);button.onclick=async()=>{button.disabled=true;area.replaceChildren();status.textContent='Loading approved media…';try{
  const r=await client.functions.invoke('listing-media-delivery',{body:{listing_id:listingId}});if(r.error||!Array.isArray(r.data?.media))throw Error('Unable to load property media. Please retry.');
  const best=new Map();for(const item of r.data.media){if(!item.url?.startsWith('https://'))continue;const old=best.get(item.asset_id);if(!old||item.kind==='display'||item.kind==='stream')best.set(item.asset_id,item)}
  for(const item of [...best.values()].sort((a,b)=>a.display_order-b.display_order)){if(item.type==='photo'||item.kind==='poster'){const image=el('img');image.src=item.url;image.alt=item.type==='photo'?'Approved property photo':'Property video preview';image.loading='lazy';image.onerror=()=>status.textContent='Photo could not load. Refresh photos and video.';area.append(image)}else if(item.kind==='stream'){const video=el('video');video.src=item.url;video.controls=true;video.preload='metadata';video.setAttribute('playsinline','');video.onerror=()=>status.textContent='Video could not load. Refresh photos and video.';area.append(video)}}
  status.textContent=best.size?'':'Approved media is being prepared. Check again later.';button.textContent='Refresh photos & video';
 }catch(e){status.textContent=e.message}finally{button.disabled=false}}}
 async function rentals(){const host=document.getElementById('propertyMatches');if(!host)return;const refresh=el('button','Refresh matches'),status=el('p'),list=el('div');status.setAttribute('role','status');refresh.className='info-button';host.append(el('h2','Homes matched to your requirements'),status,list,refresh);
 async function load(){refresh.disabled=true;list.replaceChildren();try{await A.ready;const auth=await client.auth.getUser();if(auth.error||!auth.data.user){status.textContent='Log in to view your protected property matches.';return}
 const customer=await rpc('get_my_customer_profile');if(customer.account_type!=='home_seeker'){status.textContent='A renter account is required for property matching.';return}
 document.getElementById('renterContinue').textContent='Review my requirements';const p=await client.from('home_profiles').select('id,active').eq('user_id',auth.data.user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);if(p.error)throw Error('Unable to load saved requirements.');const profile=p.data?.[0];
 if(!profile){status.textContent='Set your home requirements before viewing matches.';return}if(['pending','manual_review'].includes(customer.identity_verification_status)){status.textContent='Your requirements are saved. Identity review is pending; matching becomes available after approval.';return}if(customer.identity_verification_status!=='verified'||customer.account_status!=='active'){status.textContent='An active verified renter account is required for matching.';return}if(!profile.active){status.textContent='Your requirements are saved but this search is inactive. Review your requirements to continue.';return}
 let matches=await rpc('get_my_privacy_safe_home_matches',{p_home_profile_id:profile.id,p_limit:30});const category=new URLSearchParams(location.search).get('category');matches=matches.filter(m=>category==='Apartments'?/apartment/i.test(m.property_type):category==='Duplexes'?/duplex/i.test(m.property_type):category==='Furnished'?m.furnished===true:category==='Unfurnished'?m.furnished===false:true);document.getElementById('renterContinue').textContent='Review my requirements';status.textContent=matches.length?'Exact property addresses remain protected.':'No published properties currently match your requirements.';
 for(const m of matches){const card=el('article');card.className='info-card media-box';card.append(el('h3',`${m.bedrooms??'—'} bed · ${m.bathrooms??'—'} bath · ${m.property_type}`),el('p',m.public_property_code),el('p',[m.estate,m.neighborhood,m.area,m.city,m.state].filter(Boolean).join(', ')),el('p',`₦${Number(m.annual_rent).toLocaleString('en-NG')} annual rent`),el('p',`Total move-in cost: ₦${Number(m.total_move_in_cost).toLocaleString('en-NG')}`));gallery(m.listing_id,card);list.append(card)}
 }catch(e){status.textContent=e.message||'Unable to load matches. Try again.'}finally{refresh.disabled=false}}
 refresh.onclick=load;await load();
 }
 function scan(){document.querySelectorAll('.property[data-listing]').forEach(provider)}
 if(document.getElementById('properties')){new MutationObserver(scan).observe(document.getElementById('properties'),{childList:true,subtree:true});scan()}
 A.ready.then(rentals).catch(()=>{});
})();

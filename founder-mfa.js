(() => {
 'use strict';
 const auth=window.LajemboAuth,client=auth.client,host=document.getElementById('founderMfa');
 let state={status:null,factors:[],pending:null,reauthenticated:false,message:''},busy=false,alive=true,generation=0,owner='';
 const returns=new Set(['founder-clients.html','staff-identity-review.html']);
 const requested=new URLSearchParams(location.search).get('return'),destination=returns.has(requested)?requested:'founder-clients.html';
 async function rpc(name){const r=await client.rpc(name);if(r.error)throw r.error;return r.data;}
 async function read(){const status=await rpc('get_my_founder_security_status');if(!status.is_founder)return{status,factors:[]};const f=await client.auth.mfa.listFactors();if(f.error)throw f.error;return{status,factors:f.data.all.filter(x=>x.factor_type==='totp')};}
 function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
 function button(label,action,primary=false){const b=text('button',label);b.type='button';b.disabled=busy;b.onclick=action;b.style.setProperty('background-color','#f5f5f5','important');b.style.setProperty('color','#102A43','important');if(primary){b.style.setProperty('background-color','#102A43','important');b.style.setProperty('color','#fff','important');}return b;}
 function field(label,password=false){const wrap=document.createElement('label'),input=document.createElement('input');wrap.append(text('span',label),input);input.type=password?'password':'text';input.autocomplete=password?'current-password':'one-time-code';input.inputMode=password?'text':'numeric';input.maxLength=password?128:6;input.disabled=busy;return{wrap,input};}
 async function run(action){if(busy||!alive)return;busy=true;const token=++generation;host.querySelectorAll('button,input,select').forEach(x=>x.disabled=true);
 try{const patch=await action();if(alive&&token===generation)state={...state,message:'',...patch};}
 catch(e){if(alive&&token===generation)state.message=e.message||'Unable to complete this step. Please try again.';}
 finally{if(alive&&token===generation){busy=false;render();}}
 }
 async function verify(id,code){if(!/^\d{6}$/.test(code))throw Error('Enter the six-digit authenticator code.');const r=await client.auth.mfa.challengeAndVerify({factorId:id,code});if(r.error)throw Error('Code not accepted. Use the current code from this authenticator.');return{pending:null,...await read()};}
 async function discard(id){const factors=await client.auth.mfa.listFactors();if(factors.error)throw factors.error;if(!factors.data.all.some(x=>x.id===id&&x.status==='unverified'))throw Error('Only unfinished setup can be discarded here.');const r=await client.auth.mfa.unenroll({factorId:id});if(r.error)throw r.error;return{pending:null,...await read()};}
 function render(){
  host.replaceChildren();
  const card=document.createElement('section');card.className='info-card';card.style.cssText='display:grid;gap:16px';host.append(card);
  if(!state.status){card.append(text('p',state.message||'Checking Founder security…'),button('Try again',()=>void run(read)));return;}
  if(!state.status.is_founder){card.append(text('p','Sign in with your Founder account to continue.'));return;}
  const verified=state.factors.filter(f=>f.status==='verified'),unfinished=state.factors.filter(f=>f.status==='unverified');
  card.append(text('p',state.status.enabled?'Founder protection is active.':'Founder protection has not been activated.'));
  card.append(text('p','Keep a primary authenticator and a backup on a separate device or in a secure vault. If you lose the primary, use the backup to sign in.'));
  if(verified.length&&!state.status.verified_session){
   const choice=document.createElement('select');choice.setAttribute('aria-label','Primary or backup authenticator');
   for(const f of verified){const o=text('option',f.friendly_name||'Authenticator');o.value=f.id;choice.append(o);}
   const code=field('Authenticator code');card.append(choice,code.wrap,button('Verify code',()=>{const value=code.input.value;code.input.value='';void run(()=>verify(choice.value,value));},true));
  }
  if(!state.status.enabled&&!state.reauthenticated){
   const password=field('Confirm your password',true);card.append(password.wrap,button('Confirm password',()=>{
    const value=password.input.value;password.input.value='';void run(async()=>{
     const u=await client.auth.getUser();if(u.error||!u.data.user)throw Error('Sign in again to continue.');
     const user=u.data.user,id=user.email&&user.email_confirmed_at?{email:user.email}:{phone:'+'+(user.phone||'').replace(/^\+/, '')};
     const result=await client.auth.signInWithPassword({...id,password:value});if(result.error)throw Error('Unable to confirm your password.');
     return{...await read(),reauthenticated:true};
    });
   },true));
  }
  if((state.reauthenticated||state.status.enabled)&&verified.length<2&&(!verified.length||state.status.verified_session)&&!state.pending){
   card.append(text('p','Verifying a new authenticator may sign your other devices out. Sign back in there when setup is complete.'));
   card.append(button(verified.length?'Set up backup authenticator':'Set up primary authenticator',()=>void run(async()=>{
    if(!(await rpc('get_my_founder_security_status')).is_founder)throw Error('Founder access required.');
    const r=await client.auth.mfa.enroll({factorType:'totp',friendlyName:(verified.length?'LAJEMBO Backup ':'LAJEMBO Primary ')+Date.now()});
    if(r.error)throw r.error;
    return{pending:{id:r.data.id,secret:r.data.totp.secret,qr:r.data.totp.qr_code},...await read()};
   }),true));
  }
  if(state.pending){
   card.append(text('p','Add a time-based code account in your authenticator. Scan this QR code or enter the setup key. Keep it private.'));
   if(state.pending.qr){const img=document.createElement('img');img.alt='Private authenticator setup QR code';img.style.cssText='display:block;width:220px;max-width:100%';img.src=state.pending.qr.startsWith('data:image/svg+xml')?state.pending.qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(state.pending.qr);card.append(img);}
   if(state.pending.secret){const details=document.createElement('details');details.append(text('summary','Show setup key'),text('code',state.pending.secret));card.append(details);}
   const code=field('Setup verification code');card.append(code.wrap,button('Verify setup',()=>{const value=code.input.value;code.input.value='';void run(()=>verify(state.pending.id,value));},true),button('Discard unfinished setup',()=>void run(()=>discard(state.pending.id))));
  }else for(const f of unfinished)card.append(button('Discard unfinished setup: '+(f.friendly_name||'Authenticator'),()=>void run(()=>discard(f.id))));
  if(!state.status.enabled&&state.reauthenticated&&verified.length>=2&&state.status.verified_session)card.append(button('Activate Founder protection',()=>void run(async()=>{await rpc('activate_my_founder_mfa');return{pending:null,...await read()};}),true));
  if(state.status.enabled&&state.status.verified_session)card.append(button('Continue to Founder operations',()=>location.assign(destination),true));
  card.append(text('p','If both authenticators are lost, recovery requires the Supabase project owner to verify ownership and restore access. A password alone cannot remove Founder protection.'));
  if(state.message){const m=text('p',state.message);m.setAttribute('role','status');card.append(m);}
  card.append(button('Check status',()=>void run(read)));
 }
 function hide(){generation++;busy=false;state={...state,pending:state.pending?{id:state.pending.id,secret:'',qr:''}:null,message:'Setup key hidden for privacy. Use your authenticator code, or discard unfinished setup and start again.'};render();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hide()});
 window.addEventListener('pagehide',()=>hide());
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(owner&&session?.user.id!==owner)){hide();state={status:{is_founder:false},factors:[],pending:null,reauthenticated:false,message:''};render();}});
 render();void run(async()=>{await auth.ready;const u=await client.auth.getUser();owner=u.data.user?.id||'';if(!owner)return{status:{is_founder:false},factors:[]};return read();});
})();


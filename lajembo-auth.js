/* Shared persistent Supabase Auth session. Passwords are never stored by this script. */
(() => {
  'use strict';
  const url='https://wtfyzrqocnmmdgqthhli.supabase.co',key='sb_publishable_AjHIkbKFgbcRho8qu3w96g_KL5rWIHr';
  const legacyAccess=sessionStorage.getItem('lajembo_access_token'),legacyRefresh=sessionStorage.getItem('lajembo_refresh_token');
  const client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'lajembo-auth-v1'}});
  const tokenKeys=['lajembo_access_token','lajembo_provider_access_token','lajembo_provider_workspace_token','lajembo_exclusive_access_token'];
  const phoneKeys=['lajembo_pending_phone','lajembo_provider_pending_phone','lajembo_provider_workspace_phone','lajembo_exclusive_pending_phone'];
  function mirror(session) {
    const previous=sessionStorage.getItem('lajembo_session_user');
    if ((session && previous!==session.user.id) || (!session && previous)) {
      for(const name of Object.keys(sessionStorage))if(name.startsWith('lajembo_'))sessionStorage.removeItem(name);
    }
    for(const name of tokenKeys)session?sessionStorage.setItem(name,session.access_token):sessionStorage.removeItem(name);
    for(const name of phoneKeys)session?.user.phone?sessionStorage.setItem(name,'+'+session.user.phone.replace(/^\+/,'')):sessionStorage.removeItem(name);
    if(session)sessionStorage.setItem('lajembo_session_user',session.user.id);else sessionStorage.removeItem('lajembo_session_user');
    return session;
  }
  client.auth.onAuthStateChange((_event,session)=>mirror(session));
  const ready=client.auth.getSession().then(async ({data,error})=>{if(error)throw error;if(data.session)return mirror(data.session);if(legacyAccess&&legacyRefresh){const migrated=await client.auth.setSession({access_token:legacyAccess,refresh_token:legacyRefresh});if(!migrated.error)return mirror(migrated.data.session)}return mirror(null)});
  async function adoptSession(data) {
    if(!data.access_token||!data.refresh_token)throw Error('Unable to save your verified session. Please try again.');
    const result=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
    if(result.error)throw result.error;
    return mirror(result.data.session);
  }
  async function authorizedFetch(input,options={}) {
    await ready;
    const {data,error}=await client.auth.getSession();
    if(error||!data.session)throw Error('Please log in again to continue.');
    const headers=new Headers(options.headers||{});headers.set('Authorization','Bearer '+data.session.access_token);
    return fetch(input,{...options,headers});
  }
  function normalizePhone(value) {const compact=value.replace(/[\s().-]/g,'');return /^\+[1-9]\d{7,14}$/.test(compact)?compact:/^0[789]\d{9}$/.test(compact)?'+234'+compact.slice(1):null;}
  async function setPassword(password,confirmation,phone) {
    if(password.length<12||password.length>128||!password.trim())throw Error('Use a password between 12 and 128 characters.');
    if(password!==confirmation)throw Error('The passwords do not match.');
    const {data,error}=await client.auth.getUser();
    if(error||!data.user?.phone_confirmed_at||!phone||normalizePhone(data.user.phone?.startsWith('+')?data.user.phone:'+'+data.user.phone)!==normalizePhone(phone))throw Error('Verify your mobile number before setting a password.');
    const result=await client.auth.updateUser({password});if(result.error)throw result.error;
  }
  function promptPassword(phone) {
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='lajembo-auth-overlay';
      overlay.innerHTML='<section class="lajembo-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordHeading"><h2 id="passwordHeading">Create your password</h2><p>Your mobile number is verified. Use 12–128 characters. This password works on the app and website.</p><form><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm password<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p role="status" aria-live="polite"></p><button type="submit">Save password and continue</button></form></section>';
      const form=overlay.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
      const previous=document.activeElement;
      const outside=[...document.body.children];const states=outside.map(el=>el.inert);outside.forEach(el=>{el.inert=true});
      document.body.append(overlay);form.elements.password.focus();
      overlay.addEventListener('keydown',event=>{if(event.key==='Tab'){const inputs=[...overlay.querySelectorAll('input,button')].filter(el=>!el.disabled);const first=inputs[0],last=inputs[inputs.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
      form.onsubmit=async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='Saving password…';try{await setPassword(form.elements.password.value,form.elements.confirmation.value,phone);form.reset();overlay.remove();outside.forEach((el,i)=>{el.inert=states[i]});previous?.focus();resolve()}catch(error){status.textContent=error.message;button.disabled=false}};
    });
  }
  async function signIn(identifier,password) {
    const value=identifier.trim(),phone=normalizePhone(value);
    if(!password||(!phone&&!/^\S+@\S+\.\S+$/.test(value)))throw Error('Enter your registered email or mobile number with country code, and password.');
    const result=await client.auth.signInWithPassword(phone?{phone,password}:{email:value.toLowerCase(),password});
    if(result.error)throw Error('Unable to sign in. Check your details, or use Forgot password.');
    mirror(result.data.session);
  }
  async function verifyRecovery(phone,token) {
    const result=await client.functions.invoke('customer-otp-verify',{body:{phone,token}});
    if(result.error||!result.data?.access_token)throw Error(result.data?.error||'The code is invalid or expired. Request a new code and try again.');
    await adoptSession(result.data);
  }
  const allowedReturns=new Set(['registration.html','provider-registration.html','exclusive-provider-application.html','provider-workspace.html']);
  async function destination() {
    await ready;
    const {data,error}=await client.rpc('get_my_onboarding_experience');if(error)throw Error('Unable to load your account. Please retry.');
    const requested=new URLSearchParams(location.search).get('return');
    const renter=data?.account_type==='home_seeker',provider=data?.account_type==='provider';
    if(allowedReturns.has(requested)&&((renter&&requested==='registration.html')||(provider&&requested!=='registration.html')))return requested==='registration.html'?requested+'?intent=renter':requested;
    return provider?'provider-workspace.html':renter?'rentals.html':'index.html';
  }
  async function signOut() {const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;mirror(null);}
  window.LajemboAuth={client,ready,adoptSession,fetch:authorizedFetch,normalizePhone,setPassword,promptPassword,signIn,verifyRecovery,destination,signOut};
  function addControls() {
    const host=document.getElementById('phoneStep')||document.getElementById('authCard');
    if(host){const p=document.createElement('p');p.className='lajembo-auth-links';const a=document.createElement('a');a.href='login.html?return='+encodeURIComponent(location.pathname.split('/').pop());a.textContent='Already registered? Log in with your password';p.append(a);host.prepend(p);}
    const target=document.querySelector('.header-actions');
    if(target){const a=document.createElement('a');a.href='login.html';a.textContent='Log in / Account';a.className='lajembo-account-link';target.prepend(a);}
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',addControls):addControls();
})();

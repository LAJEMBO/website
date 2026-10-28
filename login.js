(() => {
  const auth=window.LajemboAuth,E=id=>document.getElementById(id);
  const message=text=>{E('loginStatus').textContent=text},show=id=>['passwordLogin','recoveryPhone','recoveryCode','signedIn'].forEach(name=>{E(name).hidden=name!==id});
  let busy=false,phone='',resendAt=0;
  async function run(action){if(busy)return;busy=true;document.querySelectorAll('button').forEach(button=>{button.disabled=true});message('');try{await action()}catch(error){message(error.message)}finally{busy=false;document.querySelectorAll('button').forEach(button=>{button.disabled=false});tick()}}
  const finish=async()=>{location.assign(await auth.destination())};
  E('passwordLogin').onsubmit=event=>{event.preventDefault();void run(async()=>{try{await auth.signIn(E('identifier').value,E('password').value);await finish()}finally{E('password').value=''}})};
  E('forgotPassword').onclick=()=>{E('password').value='';message('');show('recoveryPhone')};
  E('backLogin').onclick=()=>{message('');show('passwordLogin')};
  async function send(){
    if(!E('smsConsent').checked)throw Error('Agree to receive a recovery code by SMS.');
    const normalized=auth.normalizePhone(E('recoveryNumber').value);if(!normalized)throw Error('Enter your registered mobile number with country code.');phone=normalized;
    const {error}=await auth.client.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});
    if(error&&!['user_not_found','otp_disabled'].includes(error.code))throw Error('Unable to send a code right now. Please try again shortly.');
    E('otpCode').value='';resendAt=Date.now()+60000;show('recoveryCode');message('If the number belongs to an account, a six-digit code will be sent.');
  }
  E('recoveryPhone').onsubmit=event=>{event.preventDefault();void run(send)};
  E('resendCode').onclick=()=>{if(Date.now()>=resendAt)void run(send)};
  E('changeNumber').onclick=()=>{E('otpCode').value='';message('');show('recoveryPhone')};
  E('recoveryCode').onsubmit=event=>{event.preventDefault();void run(async()=>{const code=E('otpCode').value.trim();if(!/^\d{6}$/.test(code))throw Error('Enter the complete six-digit code.');await auth.verifyRecovery(phone,code);E('otpCode').value='';await auth.promptPassword(phone);show('signedIn');await finish()})};
  E('continueAccount').onclick=()=>void run(finish);
  E('resetSignedIn').onclick=()=>{message('');show('recoveryPhone')};
  E('signOut').onclick=()=>void run(async()=>{await auth.signOut();show('passwordLogin');message('You are signed out on this browser.')});
  function tick(){const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000));E('resendCode').disabled=busy||seconds>0;E('resendCode').textContent=seconds?`Resend code in ${seconds}s`:'Resend code'}setInterval(tick,1000);
  void auth.ready.then(session=>{message('');show(session?'signedIn':'passwordLogin');if(new URLSearchParams(location.search).get('mode')==='recover')show('recoveryPhone')}).catch(()=>{show('passwordLogin');message('Unable to restore your saved session. Please retry or log in.');});
})();

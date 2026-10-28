/* Link email to the existing phone account; never create a second identity. */
(() => {
  const base = 'https://wtfyzrqocnmmdgqthhli.supabase.co/auth/v1/user';
  const key = 'sb_publishable_AjHIkbKFgbcRho8qu3w96g_KL5rWIHr';
  const E = id => document.getElementById(id);
  const exclusive = location.pathname.includes('exclusive-provider-application');
  const provider = location.pathname.includes('provider-registration');
  const token = () => sessionStorage.getItem(exclusive ? 'lajembo_exclusive_access_token' : provider ? 'lajembo_provider_access_token' : 'lajembo_access_token');
  const field = E('accountEmail'), send = E('sendEmailConfirmation'), check = E('checkEmailConfirmation');
  let identity;
  const status = (kind, text) => { E('emailStatus').className = 'status ' + kind; E('emailStatus').textContent = text; };
  async function request(method = 'GET', body) {
    if (!token()) throw Error('Verify your mobile number first.');
    const response = await window.LajemboAuth.fetch(base, {method, headers: {'Content-Type':'application/json', apikey:key, Authorization:'Bearer ' + token()}, ...(body ? {body:JSON.stringify(body)} : {})});
    const data = await response.json();
    if (!response.ok) throw Error(data.msg || data.message || 'Unable to verify email. Please try again.');
    if (identity && data.id !== identity) throw Error('Your account session changed. Verify your mobile number again.');
    identity = data.id;
    return data;
  }
  const matches = user => Boolean(user.email_confirmed_at && user.email && user.email.toLowerCase() === field.value.trim().toLowerCase());
  async function confirmed() {
    if (!field.value.trim() || !field.checkValidity()) throw Error('Enter a valid email address.');
    const user = await request();
    if (!matches(user)) throw Error('Confirm this email using the message in your inbox, then select “I have confirmed my email”.');
    status('ok', 'Email confirmed and linked to your mobile account.');
  }
  send.onclick = async () => {
    if (!field.value.trim() || !field.reportValidity()) { status('err','Enter a valid email address.'); return; }
    send.disabled = true;
    try {
      const user = await request();
      if (matches(user)) { status('ok','This email is already confirmed on your account.'); return; }
      await request('PUT', {email:field.value.trim()});
      status('info','Confirmation requested. Check your inbox and spam folder. Open the confirmation link, then return here and check confirmation. If changing an existing email, you may need to confirm from both inboxes.');
    } catch (error) { status('err',error.message); }
    finally { send.disabled = false; }
  };
  check.onclick = async () => { check.disabled = true; try { await confirmed(); } catch (error) { status('err',error.message); } finally { check.disabled = false; } };
  const complete = E(exclusive ? 'submitApplication' : 'completeRegistration'), original = complete.onclick;
  complete.onclick = async event => {
    complete.disabled = true;
    try { await confirmed(); await original.call(complete, event); }
    catch (error) { status('err',error.message); field.focus(); }
    finally { complete.disabled = false; }
  };
  window.LajemboAuth.ready.then(() => { if (token()) return request().then(user => { field.value = user.new_email || user.email || ''; }); }).catch(error => status('err',error.message));
})();


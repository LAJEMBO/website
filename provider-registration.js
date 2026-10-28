(()=>{
const U='https://wtfyzrqocnmmdgqthhli.supabase.co',K='sb_publishable_AjHIkbKFgbcRho8qu3w96g_KL5rWIHr',E=id=>document.getElementById(id);
const steps=['phoneStep','registrationStep','completeStep'],prog=['p1','p2','p3'];
const menu=E('menu'),mb=E('menuButton');if(mb)mb.onclick=()=>{const o=menu.classList.toggle('open');mb.setAttribute('aria-expanded',String(o))};
const cc=E('countryCode');(window.LAJEMBO_COUNTRY_CODES||[['Nigeria','+234']]).forEach(([name,code])=>{const o=document.createElement('option');o.value=code;o.textContent=`${name} (${code})`;cc.appendChild(o)});cc.value='+234';
const tok=()=>sessionStorage.getItem('lajembo_provider_access_token')||'',headers=()=>({'Content-Type':'application/json','apikey':K,'Authorization':'Bearer '+tok()});
const show=id=>{steps.forEach(x=>E(x).classList.toggle('active',x===id));prog.forEach((x,i)=>E(x).classList.toggle('current',steps[i]===id))};
const msg=(id,t,s)=>{const e=E(id);e.className='status '+t;e.textContent=s};
const rpc=async(name,body={})=>{const r=await window.LajemboAuth.fetch(U+'/rest/v1/rpc/'+name,{method:'POST',headers:headers(),body:JSON.stringify(body)});if(!r.ok){let x={};try{x=await r.json()}catch{}throw Error(x.message||'Unable to continue right now.')}const t=await r.text();return t?JSON.parse(t):null};
const checked=id=>[...E(id).querySelectorAll('input:checked')].map(x=>x.value);
const n=id=>{const v=E(id).value;return v===''?null:Number(v)};
const rentTiers=[500000,750000,1000000,1500000,2000000,2500000,3000000,4000000,5000000,6000000,7500000,10000000,12000000,15000000,20000000];
const rent=E('annualRent');rentTiers.forEach(v=>{const o=document.createElement('option');o.value=String(v);o.textContent='₦'+v.toLocaleString('en-NG');rent.appendChild(o)});const above=document.createElement('option');above.value='above';above.textContent='Above ₦20,000,000';rent.appendChild(above);
const annualRent=()=>rent.value==='above'?n('customAnnualRent'):Number(rent.value||0);
const successFeeField=document.createElement('div');successFeeField.className='field';successFeeField.innerHTML='<label>LAJEMBO Success Fee — 5% of annual rent (₦)</label><input id="successFee" readonly aria-readonly="true"><div class="fine">Payable only when a successful rental transaction is completed.</div>';E('serviceCharge').closest('.form-grid').insertAdjacentElement('afterend',successFeeField);
const setFixedFees=()=>{const ar=annualRent();const fixed=ar>0?Math.round(ar*0.10):0;const success=ar>0?Math.round(ar*0.05):0;E('cautionDeposit').value=String(fixed);E('serviceCharge').value=String(fixed);E('successFee').value=String(success)};
E('cautionDeposit').readOnly=true;E('serviceCharge').readOnly=true;E('cautionDeposit').setAttribute('aria-readonly','true');E('serviceCharge').setAttribute('aria-readonly','true');
const cautionLabel=E('cautionDeposit').closest('.field')?.querySelector('label');if(cautionLabel)cautionLabel.textContent='Caution deposit — fixed 10% of annual rent (₦)';
const serviceLabel=E('serviceCharge').closest('.field')?.querySelector('label');if(serviceLabel)serviceLabel.textContent='Service charge — fixed 10% of annual rent (₦)';
rent.onchange=()=>{E('customRentField').classList.toggle('hidden',rent.value!=='above');setFixedFees()};E('customAnnualRent').addEventListener('input',setFixedFees);setFixedFees();
E('documentType').onchange=()=>{const t=E('documentType').value;E('passportCountryField').classList.toggle('hidden',t!=='international_passport');E('documentLabel').textContent=t==='nin'?'NIN':t==='voter_card'?"Voter's Card reference":'Passport number';E('documentReference').inputMode=t==='nin'?'numeric':'text'};
E('consent').onchange=()=>E('sendCode').disabled=!E('consent').checked;
E('sendCode').onclick=async()=>{const phone=E('countryCode').value+E('phone').value.replace(/\D/g,'').replace(/^0+/,'');if(!/^\+[1-9]\d{7,14}$/.test(phone)){msg('phoneStatus','err','Enter a valid mobile number.');return}try{const r=await fetch(U+'/auth/v1/otp',{method:'POST',headers:{'Content-Type':'application/json',apikey:K},body:JSON.stringify({phone,create_user:true})});if(!r.ok)throw Error();sessionStorage.setItem('lajembo_provider_pending_phone',phone);msg('phoneStatus','ok','Verification code sent.');E('codeArea').classList.remove('hidden')}catch{msg('phoneStatus','err','Unable to send a verification code right now.')}};
E('verifyCode').onclick=async()=>{const phone=sessionStorage.getItem('lajembo_provider_pending_phone'),code=E('otpCode').value.replace(/\D/g,'');if(code.length!==6){msg('verifyStatus','err','Enter the complete six-digit verification code.');return}try{const r=await fetch(U+'/functions/v1/customer-otp-verify',{method:'POST',headers:{'Content-Type':'application/json',apikey:K},body:JSON.stringify({phone,token:code})}),d=await r.json();if(!r.ok||!d.access_token)throw Error(d.error||'Verification failed');await window.LajemboAuth.adoptSession(d);await window.LajemboAuth.promptPassword(phone);sessionStorage.setItem('lajembo_provider_access_token',d.access_token);E('verifiedPhone').value=phone;show('registrationStep')}catch(e){msg('verifyStatus','err',e.message)}};
E('completeRegistration').onclick=async()=>{
 const first=E('firstName').value.trim(),last=E('lastName').value.trim(),address=E('contactAddress').value.trim(),legal=E('legalName').value.trim();
 const state=E('state').value.trim(),city=E('city').value.trim(),privateAddress=E('privateAddress').value.trim(),ptype=E('propertyType').value,ar=annualRent(),available=E('availableFrom').value;
 if(!first||!last||!address||!legal){msg('registrationStatus','err','First name, last name, contact address and legal name are required.');return}
 if(!state||!city||!privateAddress||!ptype||!ar||!available){msg('registrationStatus','err','State, city, complete property address, property type, annual rent and availability date are required.');return}
 if(rent.value==='above'&&ar<=20000000){msg('registrationStatus','err','For “Above ₦20,000,000”, enter an annual rent greater than ₦20,000,000.');return}
 setFixedFees();
 const dt=E('documentType').value,dr=E('documentReference').value.trim().toUpperCase(),country=dt==='international_passport'?E('passportCountry').value:'Nigeria';
 if(dt==='nin'&&!/^\d{11}$/.test(dr)){msg('registrationStatus','err','NIN must contain exactly 11 digits.');return}
 if(dt==='international_passport'&&country==='Nigeria'&&!/^[A-Z]\d{8}$/.test(dr)){msg('registrationStatus','err','Nigerian passport number must be one letter followed by eight digits.');return}
 if(dt==='international_passport'&&country!=='Nigeria'&&!/^[A-Z0-9]{6,12}$/.test(dr)){msg('registrationStatus','err','Enter a valid passport number using 6 to 12 letters and numbers.');return}
 if(dt==='voter_card'&&!dr){msg('registrationStatus','err',"Enter your Voter's Card reference.");return}
 E('completeRegistration').disabled=true;msg('registrationStatus','info','Saving your Property Provider registration…');
 try{
   await rpc('save_my_customer_profile',{p_first_name:first,p_last_name:last,p_preferred_name:E('preferredName').value.trim()||null,p_contact_address:address});
   let signup=await rpc('get_my_provider_signup_form');
   if(!signup.provider_exists){await rpc('create_my_provider_profile',{p_provider_type:E('providerType').value,p_legal_name:legal,p_display_name:E('displayName').value.trim()||legal});}
   await rpc('set_my_provider_operating_profile',{p_representative_capacity:E('capacity').value,p_owner_residency:E('residency').value,p_portfolio_band:E('portfolio').value,p_manages_for_others:E('managesOthers').checked});
   const ident=await rpc('get_my_provider_identity_submission');if(!ident.status||['rejected','needs_more_info'].includes(ident.status)){await rpc('submit_my_provider_identity',{p_document_type:dt,p_document_reference:dr,p_issuing_country:country})}
   const authorityType=E('authorityType').value,authorityRef=E('authorityReference').value.trim();if(authorityType&&authorityRef){try{await rpc('submit_my_provider_authority_evidence',{p_evidence_type:authorityType,p_external_reference:authorityRef})}catch(e){if(!/already been submitted/i.test(e.message))throw e}}
   const prop=await rpc('save_my_property_draft',{p_property_id:null,p_state:state,p_city:city,p_area:E('area').value.trim()||null,p_neighborhood:E('neighborhood').value.trim()||null,p_estate:E('estate').value.trim()||null,p_private_address:privateAddress,p_property_type:ptype,p_bedrooms:n('bedrooms'),p_bathrooms:n('bathrooms'),p_furnished:E('furnished').value==='true',p_serviced:E('serviced').value==='true',p_amenities:checked('amenities'),p_electricity_features:checked('electricityFeatures'),p_water_features:checked('waterFeatures')});
   const listing=await rpc('save_my_listing_draft',{p_property_id:prop.property_id,p_listing_id:null,p_annual_rent:ar,p_caution_deposit:n('cautionDeposit')||0,p_legal_documentation_fee:n('legalFee')||0,p_service_charge:n('serviceCharge')||0,p_other_mandatory_charges:n('otherCharges')||0,p_available_from:available});
   E('completeLead').textContent='Your Provider profile, identity submission, property details and rental pricing are saved.';
   msg('completeStatus','info',`Registration saved. Property ${prop.property_id.slice(0,8)}… and listing ${listing.listing_id.slice(0,8)}… remain private until LAJEMBO verification and authorization are complete.`);show('completeStep');
 }catch(e){msg('registrationStatus','err',e.message)}finally{E('completeRegistration').disabled=false}
};
window.LajemboAuth.ready.then(session=>{if(session){E('verifiedPhone').value='+'+session.user.phone.replace(/^\+/, '');show('registrationStep')}else show('phoneStep')}).catch(()=>{show('phoneStep');msg('phoneStatus','err','Unable to restore your session. Use password login or retry.')});
})();

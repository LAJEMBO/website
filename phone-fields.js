(() => {
 'use strict';
 const countries=window.LAJEMBO_PHONE_COUNTRIES;
 function populate(select) {
  select.replaceChildren();
  for(const country of countries){const option=document.createElement('option');option.value=country.iso;option.textContent=country.name+' ('+country.dialCode+')';select.append(option)}
  select.value='NG';
 }
 function format(country,input){
  const compact=input.replace(/[\s().-]/g,'');
  if(!compact||/[^+0-9]/.test(compact))throw Error('Enter your phone number using digits only. Choose the country above; do not type * or #.');
  if(compact.startsWith('+')){if(!/^\+[1-9]\d{7,14}$/.test(compact))throw Error('Check your phone number and try again.');return compact}
  if(!/^\d+$/.test(compact))throw Error('Enter your phone number using digits only.');
  const option=countries.find(item=>item.iso===country);if(!option)throw Error('Choose your country first.');
  let number=compact;if(country==='NG')number=number.replace(/^0/,'');
  if(option.dialCode==='+1'&&number.length===11&&number.startsWith('1'))number=number.slice(1);
  const phone=option.dialCode+number;
  if(!/^\+[1-9]\d{7,14}$/.test(phone)||(country==='NG'&&!/^[789]\d{9}$/.test(number))||(option.dialCode==='+1'&&!/^[2-9]\d{9}$/.test(number)))throw Error('Check the phone number and selected country, then try again.');
  return phone;
 }
 window.LajemboPhone={populate,format};
})();

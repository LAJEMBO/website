(() => {
  'use strict';
  window.LajemboIdentityPhotos = async function(host, subject, submissionId, upload) {
    const client = window.LajemboAuth.client;
    let active = true, busy = false, timer;
    const heading = document.createElement('h3');
    heading.textContent = 'Private ID photos and selfie';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const images = document.createElement('div');
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = 'Refresh private photos';
    host.replaceChildren(heading, status, refresh, images);
    function clear() { images.replaceChildren(); clearTimeout(timer); }
    async function load() {
      clear();
      for (const kind of ['document','selfie']) {
        const prefix = subject + '/' + submissionId + '/' + kind;
        const result = await client.storage.from('identity-evidence').list(prefix, {limit:100,sortBy:{column:'created_at',order:'desc'}});
        if (result.error) throw result.error;
        for (const file of result.data || []) {
          const path = prefix + '/' + file.name;
          const signed = await client.storage.from('identity-evidence').createSignedUrl(path,60);
          if (signed.error) throw signed.error;
          if (!active) return;
          const figure = document.createElement('figure');
          const image = document.createElement('img');
          image.src = signed.data.signedUrl;
          image.alt = kind === 'selfie' ? 'Submitted selfie' : 'Submitted identity document';
          image.style.cssText = 'max-width:100%;max-height:440px;object-fit:contain';
          image.referrerPolicy = 'no-referrer';
          const caption = document.createElement('figcaption');
          caption.textContent = path;
          figure.append(image,caption);
          images.append(figure);
        }
      }
      if (active) {
        status.textContent = 'Private links expire after one minute. Refresh to view again. Up to 100 recent images per category.';
        timer = setTimeout(clear,60000);
      }
    }
    async function run(action) {
      if (busy || !active) return;
      busy = true;
      host.querySelectorAll('button,input').forEach(node=>{node.disabled=true});
      try { await action(); } catch(error) { if(active) status.textContent=error.message; }
      finally { busy=false;host.querySelectorAll('button,input').forEach(node=>{node.disabled=false}); }
    }
    refresh.onclick=()=>void run(load);
    if (upload) {
      const consent=document.createElement('p');
      consent.textContent='Upload a clear ID photo and a current selfie for manual identity review. Only you and authorized reviewers can access them. Uploading photos does not approve identity.';
      host.prepend(consent);
      for (const kind of ['document','selfie']) {
        const label=document.createElement('label');
        label.textContent=kind==='selfie'?'Current selfie':'Identity document photo';
        const input=document.createElement('input');
        input.type='file';input.accept='image/jpeg,image/png';
        input.setAttribute('capture',kind==='selfie'?'user':'environment');
        const button=document.createElement('button');
        button.type='button';button.textContent='Upload '+kind+' privately';
        button.onclick=()=>void run(async()=>{
          const file=input.files[0];
          if(!file || !['image/jpeg','image/png'].includes(file.type) || file.size>5242880)throw Error('Choose a JPEG or PNG photo under 5 MB.');
          const path=subject+'/'+submissionId+'/'+kind+'/'+crypto.randomUUID()+(file.type==='image/png'?'.png':'.jpg');
          const result=await client.storage.from('identity-evidence').upload(path,file,{contentType:file.type,upsert:false});
          if(result.error)throw result.error;
          input.value='';
          await load();
        });
        label.append(input,button);host.append(label);
      }
    }
    const listener=client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){active=false;clear();host.replaceChildren();}});
    void run(load);
    return ()=>{active=false;clear();listener.data.subscription.unsubscribe();host.replaceChildren();};
  };
})();

(() => {
  'use strict';
  window.LajemboIdentityPhotos = async function(host, subject, submissionId, upload) {
    const client = window.LajemboAuth.client;
    let active = true, busy = false, timer, counts = null, generation = 0;
    const heading = document.createElement('h3');
    heading.textContent = 'Private ID photos and selfie';
    const checklist = document.createElement('div');
    checklist.setAttribute('aria-live', 'polite');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const images = document.createElement('div');
    const previewStatus = document.createElement('p');
    const refresh = document.createElement('button');
    refresh.type = 'button'; refresh.textContent = 'Check for uploaded photos';
    host.replaceChildren(heading, checklist, status, refresh, previewStatus, images);
    const name = kind => kind === 'document' ? 'ID photo' : 'Selfie';
    function line(value) { const p = document.createElement('p'); p.textContent = value; return p; }
    function progress() {
      checklist.replaceChildren(line('Document details: saved with this identity submission.'));
      for (const kind of ['document', 'selfie']) checklist.append(line(name(kind) + ': ' + (counts === null ? 'not yet confirmed' : counts[kind] ? 'saved privately' : 'not uploaded')));
      checklist.append(line(!counts ? 'Tap Check for uploaded photos if the saved-photo check does not complete.'
        : counts.document && counts.selfie ? (upload ? 'Both photos are saved. Your photos still require LAJEMBO review. You can return to your account; uploading does not verify your identity.' : 'Both photos are saved. Inspect the ID and selfie before recording an identity review.')
        : !counts.document ? (upload ? 'Next: take and upload a clear ID photo.' : 'The ID photo is missing. Approval requires both an ID photo and selfie.')
        : (upload ? 'Next: take and upload your current selfie.' : 'The selfie is missing. Approval requires both an ID photo and selfie.')));
    }
    function clear() { images.replaceChildren(); clearTimeout(timer); }
    async function load() {
      clear(); previewStatus.textContent = '';
      const token = generation;
      const files = [], saved = {document: 0, selfie: 0};
      for (const kind of ['document', 'selfie']) {
        const prefix = subject + '/' + submissionId + '/' + kind;
        const result = await client.storage.from('identity-evidence').list(prefix, {limit:100,sortBy:{column:'created_at',order:'desc'}});
        if (!active || token !== generation) return;
        if (result.error) throw result.error;
        const rows = (result.data || []).filter(file => /\.(jpg|png)$/i.test(file.name));
        saved[kind] = rows.length;
        files.push(...rows.map(file => ({path: prefix + '/' + file.name, kind})));
      }
      counts = saved; progress();
      let failed = false;
      for (const file of files) {
        const signed = await client.storage.from('identity-evidence').createSignedUrl(file.path,60);
        if (!active || token !== generation) return;
        if (signed.error) { failed = true; continue; }
        if (document.hidden) continue;
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = signed.data.signedUrl;
        image.alt = file.kind === 'selfie' ? 'Submitted selfie' : 'Submitted identity document';
        image.style.cssText = 'max-width:100%;max-height:440px;object-fit:contain';
        image.referrerPolicy = 'no-referrer';
        image.onerror = () => { if(active) previewStatus.textContent = 'A saved-photo preview could not be displayed. Tap Check for uploaded photos.'; };
        const caption = document.createElement('figcaption');
        caption.textContent = upload ? 'Saved ' + name(file.kind).toLowerCase() : file.path;
        figure.append(image,caption); images.append(figure);
      }
      if (active) {
        previewStatus.textContent = failed ? 'Saved photos were found, but a preview could not be loaded. Tap Check for uploaded photos.'
          : files.length ? 'Private previews expire after one minute. Your uploads remain saved for review.' : '';
        timer = setTimeout(() => {
          clear();
          if(active && files.length) previewStatus.textContent = 'Photo previews have been hidden for privacy. Your uploads remain saved. Tap Check for uploaded photos to view them again.';
        },60000);
      }
    }
    async function run(action) {
      if (busy || !active) return;
      busy = true; status.textContent = 'Checking or saving private photos…';
      host.querySelectorAll('button,input').forEach(node=>{node.disabled=true});
      try { await action(); if(active && status.textContent === 'Checking or saving private photos…') status.textContent = ''; }
      catch(error) { if(active) status.textContent = 'Unable to complete this step. ' + error.message; }
      finally { busy=false; if(active) host.querySelectorAll('button,input').forEach(node=>{node.disabled=false}); }
    }
    refresh.onclick=()=>void run(load);
    if (upload) {
      const consent=document.createElement('p');
      consent.textContent='Upload a clear ID photo and a current selfie for manual identity review. Only you and authorized reviewers can access them. Uploading photos does not approve identity.';
      host.insertBefore(consent, checklist);
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
          if(!file || !['image/jpeg','image/png'].includes(file.type) || !file.size || file.size>5242880)throw Error('Choose a JPEG or PNG photo under 5 MB.');
          const path=subject+'/'+submissionId+'/'+kind+'/'+crypto.randomUUID()+(file.type==='image/png'?'.png':'.jpg');
          const result=await client.storage.from('identity-evidence').upload(path,file,{contentType:file.type,upsert:false});
          if(!active)return;
          if(result.error)throw Error(name(kind)+' was not uploaded. '+result.error.message);
          input.value='';
          if(counts) { counts = {...counts,[kind]:counts[kind]+1}; progress(); }
          status.textContent=name(kind)+' uploaded and saved privately.';
          try { await load(); }
          catch { if(active) status.textContent=name(kind)+' was saved, but the saved-photo list could not refresh. Tap Check for uploaded photos. You do not need to upload it again.'; }
        });
        label.append(input,button);host.append(label);
      }
    }
    function hide() {
      if(document.hidden) {
        generation++; clear();
        if(counts && (counts.document || counts.selfie)) previewStatus.textContent='Photo previews have been hidden for privacy. Your uploads remain saved. Tap Check for uploaded photos to view them again.';
      }
    }
    document.addEventListener('visibilitychange',hide);
    const listener=client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){active=false;generation++;clear();host.replaceChildren(line('Your session changed. Reopen this page to continue.'));}});
    progress(); void run(load);
    return ()=>{active=false;generation++;clear();document.removeEventListener('visibilitychange',hide);listener.data.subscription.unsubscribe();host.replaceChildren();};
  };
})();

(() => {
  'use strict';
  window.LajemboIdentityPhotos = async function(host, subject, submissionId, upload) {
    const client = window.LajemboAuth.client;
    let active = true, busy = false, timer, counts = null, generation = 0, isOpen = upload;
    let dialog, openButton, summary, cameraDialog, cameraStream;
    function stopCamera() {
      cameraStream?.getTracks().forEach(track => track.stop()); cameraStream = null;
      if (cameraDialog) { cameraDialog.remove(); cameraDialog = null; }
    }
    const content = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = 'ID photo and selfie';
    const checklist = document.createElement('div');
    checklist.setAttribute('aria-live', 'polite');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const images = document.createElement('div');
    const previewStatus = document.createElement('p');
    const refresh = document.createElement('button');
    refresh.type = 'button'; refresh.textContent = 'Check for uploaded photos';
    content.replaceChildren(heading, checklist, status, refresh, previewStatus, images);
    if (upload) host.replaceChildren(content);
    else {
      openButton = document.createElement('button');
      openButton.type = 'button'; openButton.textContent = 'View ID photo and selfie';
      summary = document.createElement('p'); summary.setAttribute('aria-live', 'polite');
      dialog = document.createElement('dialog');
      dialog.setAttribute('aria-label', 'ID photo and selfie');
      dialog.style.cssText = 'width:min(880px,90vw);max-height:90vh;box-sizing:border-box;overflow:auto;border:1px solid #d4c8b8;border-radius:12px;padding:24px;background:#f7f3ea;color:#102439;font:inherit';
      const closeButton = document.createElement('button');
      closeButton.type = 'button'; closeButton.textContent = 'Back to client record';
      closeButton.onclick = () => dialog.close();
      content.insertBefore(images, checklist);
      dialog.append(closeButton, content);
      dialog.addEventListener('close', () => {
        isOpen = false; generation++; clear(); busy = false; openButton.disabled = false;
      });
      openButton.onclick = () => { if(!active || busy)return; isOpen = true; dialog.showModal(); void run(load); };
      host.replaceChildren(openButton, summary, dialog);
    }
    const name = kind => kind === 'document' ? 'ID photo' : 'Selfie';
    function line(value) { const p = document.createElement('p'); p.textContent = value; return p; }
    function progress() {
      if(summary)summary.textContent = counts ? 'ID photo: '+(counts.document?'saved':'not uploaded')+' · Selfie: '+(counts.selfie?'saved':'not uploaded') : 'Checking saved photos…';
      checklist.replaceChildren(line('Document details: saved with this identity submission.'));
      for (const kind of ['document', 'selfie']) checklist.append(line(name(kind) + ': ' + (counts === null ? 'not yet confirmed' : counts[kind] ? 'saved privately' : 'not uploaded')));
      checklist.append(line(!counts ? 'Tap Check for uploaded photos if the saved-photo check does not complete.'
        : counts.document && counts.selfie ? (upload ? 'Both photos are saved. Your photos still require LAJEMBO review. You can return to your account; uploading does not verify your identity.' : 'Both photos are saved. Inspect the ID and selfie before recording an identity review.')
        : !upload && !counts.document && !counts.selfie ? 'No ID photo or selfie has been uploaded for this submission yet.'
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
      if(!isOpen)return;
      let failed = false;
      for (const file of files) {
        const signed = await client.storage.from('identity-evidence').createSignedUrl(file.path,60);
        if (!active || token !== generation || !isOpen) return;
        if (signed.error) { failed = true; continue; }
        if (document.hidden) continue;
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = signed.data.signedUrl;
        image.alt = file.kind === 'selfie' ? 'Submitted selfie' : 'Submitted identity document';
        image.style.cssText = 'display:block;width:100%;max-height:70vh;object-fit:contain';
        image.referrerPolicy = 'no-referrer';
        image.onerror = () => { if(active && token===generation && isOpen) previewStatus.textContent = 'A saved-photo preview could not be displayed. Tap Check for uploaded photos.'; };
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
      const runGeneration = generation;
      busy = true; status.textContent = 'Checking or saving private photos…';
      if(openButton)openButton.disabled=true;
      content.querySelectorAll('button,input').forEach(node=>{node.disabled=true});
      try { await action(); if(active && status.textContent === 'Checking or saving private photos…') status.textContent = ''; }
      catch(error) { if(active) { status.textContent = 'Unable to complete this step. ' + error.message; if(summary && !isOpen)summary.textContent='Unable to check saved photos. Open the viewer to try again.'; } }
      finally { if(upload || runGeneration===generation) { busy=false; if(active) { if(openButton)openButton.disabled=false;content.querySelectorAll('button,input').forEach(node=>{node.disabled=false}); } } }
    }
    refresh.onclick=()=>void run(load);
    if (upload) {
      const consent=document.createElement('p');
      consent.textContent='Upload a clear ID photo and a current selfie for manual identity review. Only you and authorized reviewers can access them. Uploading photos does not approve identity.';
      content.insertBefore(consent, checklist);
      for (const kind of ['document','selfie']) {
        const label=document.createElement('label');
        label.textContent=kind==='selfie'?'Current selfie':'Identity document photo';
        let selectedFile = null;
        const input=document.createElement('input');
        input.type='file';input.accept='image/jpeg,image/png';input.hidden=true;
        const selected = line('No photo selected.');
        const choose=document.createElement('button');choose.type='button';
        choose.textContent=kind==='selfie'?'Upload existing selfie':'Upload existing ID photo';
        choose.onclick=()=>input.click();
        function select(file) { selectedFile=file; selected.textContent='Selected: '+file.name; status.textContent='Photo selected. Select Upload '+kind+' privately to save it.'; }
        input.onchange=()=>{if(input.files[0])select(input.files[0]);};
        const camera=document.createElement('button');camera.type='button';
        camera.textContent=kind==='selfie'?'Take selfie':'Take ID photo';
        camera.onclick=async()=>{
          if(busy || !active)return;
          stopCamera();
          if(!navigator.mediaDevices?.getUserMedia){status.textContent='Camera is unavailable in this browser. Use Upload existing photo.';return;}
          const panel=document.createElement('dialog');cameraDialog=panel;
          panel.setAttribute('aria-label',camera.textContent);
          panel.style.cssText='max-width:90vw;max-height:90vh;overflow:auto;background:#f7f3ea;color:#102439;border-radius:12px';
          const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.style.cssText='display:block;width:100%;max-height:60vh';
          const take=document.createElement('button');take.type='button';take.textContent='Use this photo';take.disabled=true;
          const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>{stopCamera();status.textContent='Capture cancelled. No new photo was uploaded.';};
          panel.addEventListener('cancel',()=>{stopCamera();status.textContent='Capture cancelled. No new photo was uploaded.';});
          panel.append(video,take,cancel);host.append(panel);panel.showModal();
          try {
            const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:kind==='selfie'?'user':'environment'},audio:false});
            if(!active || cameraDialog!==panel){stream.getTracks().forEach(track=>track.stop());return;}
            cameraStream=stream;video.srcObject=stream;await video.play();
            if(cameraDialog===panel)take.disabled=false;
          }catch {if(cameraDialog===panel){stopCamera();status.textContent='Unable to open the camera. Allow camera access or upload an existing JPEG or PNG photo.';}return;}
          take.onclick=()=>{
            if(!video.videoWidth || !video.videoHeight)return;
            take.disabled=true;
            const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
            canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
            canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
            canvas.toBlob(blob=>{if(active && cameraDialog===panel){if(blob)select(new File([blob],kind+'.jpg',{type:'image/jpeg'}));else status.textContent='Unable to read this photo. Please try again.';stopCamera();}},'image/jpeg',0.8);
          };
        };
        const button=document.createElement('button');
        button.type='button';button.textContent='Upload '+kind+' privately';
        button.onclick=()=>void run(async()=>{
          const file=selectedFile;
          if(!file){status.textContent='Take a photo or upload an existing photo first.';return;}
          if(!['image/jpeg','image/png'].includes(file.type) || !file.size || file.size>5242880)throw Error('Choose a JPEG or PNG photo under 5 MB.');
          const path=subject+'/'+submissionId+'/'+kind+'/'+crypto.randomUUID()+(file.type==='image/png'?'.png':'.jpg');
          const result=await client.storage.from('identity-evidence').upload(path,file,{contentType:file.type,upsert:false});
          if(!active)return;
          if(result.error)throw Error(name(kind)+' was not uploaded. '+result.error.message);
          input.value='';selectedFile=null;selected.textContent='No photo selected.';
          if(counts) { counts = {...counts,[kind]:counts[kind]+1}; progress(); }
          status.textContent=name(kind)+' uploaded and saved privately.';
          try { await load(); }
          catch { if(active) status.textContent=name(kind)+' was saved, but the saved-photo list could not refresh. Tap Check for uploaded photos. You do not need to upload it again.'; }
        });
        label.append(camera,choose,input,selected,button);content.append(label);
      }
    }
    function hide() {
      if(document.hidden) {
        stopCamera();
        generation++; clear(); if(dialog && dialog.open)dialog.close();
        if(counts && (counts.document || counts.selfie)) previewStatus.textContent='Photo previews have been hidden for privacy. Your uploads remain saved. Tap Check for uploaded photos to view them again.';
      }
    }
    document.addEventListener('visibilitychange',hide);
    const listener=client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){active=false;generation++;stopCamera();clear();if(dialog && dialog.open)dialog.close();host.replaceChildren(line('Your session changed. Reopen this page to continue.'));}});
    progress(); void run(load);
    return ()=>{active=false;generation++;stopCamera();clear();if(dialog && dialog.open)dialog.close();document.removeEventListener('visibilitychange',hide);listener.data.subscription.unsubscribe();host.replaceChildren();};
  };
})();


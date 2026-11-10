(() => {
  'use strict';
  const auth = window.LajemboAuth;
  const element = id => document.getElementById(id);
  let busy = false;
  let selected = null;
  let selectedKind = null;
  let authorized = false;
  let generation = 0;

  function message(text) { element('status').textContent = text; }
  function updateButtons() {
    element('refresh').disabled = busy;
    element('kind').disabled = busy;
    element('reviewFields').disabled = busy;
    element('queue').querySelectorAll('button').forEach(button => { button.disabled = busy; });
    element('approve').disabled = busy || !selected || selected.is_self_review ||
      !element('documentChecked').checked || !element('personMatched').checked ||
      element('evidence').value.trim().length < 8 || element('note').value.trim().length < 20;
    element('moreInfo').disabled = busy || !element('note').value.trim();
    element('reject').disabled = busy || !element('note').value.trim();
  }
  async function rpc(name, args = {}) {
    const { data, error } = await auth.client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  function clearReview() {
    selected = null;
    selectedKind = null;
    element('review').reset();
    element('review').hidden = true;
  }
  function clearWorkspace() {
    generation++;
    authorized = false;
    clearReview();
    element('queue').replaceChildren();
    element('workspace').hidden = true;
  }
  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }
  async function loadQueue() {
    if (busy || !authorized) return;
    busy = true;
    clearReview();
    element('queue').replaceChildren();
    updateButtons();
    const currentGeneration = generation;
    const kind = element('kind').value;
    try {
      const rows = await rpc(kind === 'renter' ? 'get_renter_identity_review_queue' : 'get_provider_identity_review_queue');
      if (generation !== currentGeneration || !authorized) return;
      message(rows.length ? '' : 'No open identity submissions.');
      for (const item of rows) {
        const card = document.createElement('article');
        card.append(text('h2', item.applicant_name || item.provider_name || 'Applicant'));
        card.append(text('p', [item.document_type, item.masked_reference, item.status].join(' · ').replaceAll('_', ' ')));
        card.append(text('p', 'Submitted ' + new Date(item.submitted_at).toLocaleString()));
        const open = text('button', 'Open identity review');
        open.type = 'button';
        open.onclick = () => void openReview(item, kind);
        card.append(open);
        element('queue').append(card);
      }
    } catch (error) {
      if (generation === currentGeneration) message(error.message);
    } finally {
      busy = false;
      updateButtons();
    }
  }
  async function openReview(item, kind) {
    if (busy || !authorized) return;
    busy = true;
    clearReview();
    updateButtons();
    const currentGeneration = generation;
    try {
      const detail = kind === 'provider'
        ? await rpc('get_provider_identity_review_detail', { p_submission_id: item.submission_id })
        : item;
      if (generation !== currentGeneration || !authorized) return;
      selected = detail;
      selectedKind = kind;
      element('applicant').textContent = item.applicant_name || item.provider_name || 'Applicant';
      element('submission').textContent = 'Submission ' + item.submission_id;
      element('previousNote').textContent = detail.review_note || '';
      element('selfReview').hidden = !detail.is_self_review;
      element('review').hidden = false;
      element('note').focus();
      message('');
    } catch (error) {
      if (generation === currentGeneration) message(error.message);
    } finally {
      busy = false;
      updateButtons();
    }
  }
  async function decide(outcome) {
    if (busy || !selected || !authorized) return;
    busy = true;
    updateButtons();
    const currentGeneration = generation;
    try {
      const note = element('note').value.trim();
      if (!note) throw new Error('A review note is required.');
      if (outcome === 'approved') {
        if (selected.is_self_review || !element('documentChecked').checked || !element('personMatched').checked ||
          element('evidence').value.trim().length < 8 || note.length < 20) {
          throw new Error('Complete the independent evidence review before approval.');
        }
        await rpc('approve_identity_with_manual_evidence', {
          p_subject_kind: selectedKind, p_submission_id: selected.submission_id,
          p_evidence_reference: element('evidence').value.trim(), p_review_note: note,
          p_document_checked: element('documentChecked').checked,
          p_person_matched: element('personMatched').checked,
        });
      } else {
        await rpc(selectedKind === 'renter' ? 'review_renter_identity_submission' : 'review_provider_identity_submission', {
          p_submission_id: selected.submission_id, p_outcome: outcome, p_review_note: note,
        });
      }
      if (generation !== currentGeneration) return;
      clearReview();
      element('queue').replaceChildren();
      message('Review recorded. Refresh the queue for the latest submissions.');
    } catch (error) {
      if (generation === currentGeneration) message(error.message);
    } finally {
      busy = false;
      updateButtons();
    }
  }
  element('refresh').onclick = () => void loadQueue();
  element('kind').onchange = () => void loadQueue();
  element('review').oninput = updateButtons;
  element('review').onsubmit = event => { event.preventDefault(); void decide('approved'); };
  element('moreInfo').onclick = () => void decide('needs_more_info');
  element('reject').onclick = () => void decide('rejected');
  auth.client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { clearWorkspace(); element('login').hidden = false; message('Sign in to continue.'); }
  });
  void auth.ready.then(async session => {
    if (!session) { element('login').hidden = false; message('Sign in to continue.'); return; }
    const allowed = await rpc('is_staff_role', { required_roles: ['founder', 'admin', 'trust_safety'] });
    if (allowed !== true) throw new Error('An authorized identity reviewer account is required.');
    authorized = true;
    element('workspace').hidden = false;
    await loadQueue();
  }).catch(error => { clearWorkspace(); message(error.message); });
})();

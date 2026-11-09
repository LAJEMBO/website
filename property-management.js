(() => {
  'use strict';

  const auth = window.LajemboAuth;
  const form = document.getElementById('management-form');
  const login = document.getElementById('management-login');
  const status = document.getElementById('management-status');
  const requests = document.getElementById('management-requests');
  const blocked = new Set(['submitted', 'under_review', 'approved_pending_agreement', 'active']);
  const labels = {
    submitted: 'Under review',
    under_review: 'Under review',
    approved_pending_agreement: 'Agreement issued',
    active: 'Management active'
  };

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  async function rpc(name, args) {
    const { data, error } = await auth.client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  async function run(button, action) {
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function showAgreement(request, card, button) {
    const args = { p_acceptance_id: request.acceptance_id };
    const agreement = await rpc('get_my_property_management_agreement', args);
    if (!agreement?.agreement_terms || !agreement.agreement_version) {
      throw new Error('The agreement is unavailable.');
    }
    card.querySelector('.management-agreement')?.remove();
    const panel = element('div', '');
    panel.className = 'management-agreement';
    panel.append(element('h4', 'Management agreement · ' + agreement.agreement_version));
    for (const [key, value] of Object.entries(agreement.agreement_terms)) {
      if (key === 'provider_id' || key === 'property_id' || key === 'agreement_version') continue;
      const label = key.replaceAll('_', ' ');
      const display = key === 'management_scope' && typeof value?.requested_services === 'string'
        ? value.requested_services
        : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'None');
      panel.append(element('p', label + ' · ' + display));
    }
    card.append(panel);
    if (request.status !== 'approved_pending_agreement' || agreement.provider_signed_at) return;
    const check = element('input', '');
    check.type = 'checkbox';
    const label = element('label', '');
    label.append(check, document.createTextNode(' I have read and agree to these management terms.'));
    const sign = element('button', 'Accept and sign agreement');
    sign.type = 'button';
    sign.disabled = true;
    check.addEventListener('change', () => { sign.disabled = !check.checked; });
    sign.addEventListener('click', () => {
      if (!check.checked || sign.disabled) return;
      void run(sign, async () => {
        button.disabled = true;
        const version = { ...args, p_agreement_version: agreement.agreement_version };
        try {
          await rpc('review_my_property_management_agreement', version);
          await rpc('accept_my_property_management_agreement', version);
          await load('Agreement signed. Awaiting LAJEMBO activation.');
        } finally {
          button.disabled = false;
        }
      });
    });
    panel.append(label, sign);
  }

  async function load(message) {
    const workspace = await rpc('get_my_property_management_workspace');
    const properties = workspace.properties || [];
    const rows = workspace.requests || [];
    const description = p => [p.property_type, p.area, p.city].filter(Boolean).join(' · ') || 'Property';
    const byId = new Map(properties.map(p => [p.property_id, description(p)]));
    const eligible = properties.filter(p => p.eligible && !rows.some(r => r.property_id === p.property_id && blocked.has(r.status)));
    form.elements.property.replaceChildren(...eligible.map(p => {
      const option = element('option', description(p));
      option.value = p.property_id;
      return option;
    }));
    form.hidden = !eligible.length;
    status.textContent = message || (eligible.length ? '' : 'A verified property with accepted authority evidence is required to start a new application.');
    requests.replaceChildren();
    for (const row of rows) {
      const card = element('article', '');
      card.className = 'info-card';
      card.append(element('h3', byId.get(row.property_id) || 'Property'),
        element('p', row.status === 'approved_pending_agreement' && row.provider_signed_at
          ? 'Agreement signed. Awaiting LAJEMBO activation.'
          : labels[row.status] || row.status.replaceAll('_', ' ')));
      if (row.review_note) card.append(element('p', row.review_note));
      if (row.status === 'approved_pending_agreement' || row.status === 'active') {
        const button = element('button', 'Open management agreement');
        button.type = 'button';
        button.addEventListener('click', () => { void run(button, () => showAgreement(row, card, button)); });
        card.append(button);
      }
      requests.append(card);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    if (!form.reportValidity() || button.disabled) return;
    void run(button, async () => {
      const fields = new FormData(form);
      const result = await rpc('submit_my_property_management_request', {
        p_property_id: fields.get('property'),
        p_existing_tenancy_disclosed: fields.get('tenancy') === 'yes',
        p_existing_management_contract_disclosed: fields.get('contract') === 'yes',
        p_disclosure_note: fields.get('disclosure'),
        p_management_scope: { requested_services: fields.get('scope') },
        p_owner_instructions: fields.get('instructions')
      });
      if (result?.status !== 'submitted') throw new Error('Application submission was not confirmed.');
      form.reset();
      await load('Application submitted. LAJEMBO is reviewing your request.');
    });
  });

  auth.ready.then(session => {
    if (session) return load();
    login.hidden = false;
    status.textContent = 'Sign in with your provider account to continue.';
  }).catch(error => {
    status.textContent = error.message;
    login.hidden = false;
  });
})();

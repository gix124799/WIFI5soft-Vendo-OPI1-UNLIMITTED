'use strict';

(function initAdminShell() {
  const allowedPages = new Set(['dashboard','sales','sessions','vouchers','pppoe','eload','rental','settings']);
  const titleMap = Object.freeze({ dashboard:'Dashboard', sales:'Sales', sessions:'Sessions', vouchers:'Vouchers', pppoe:'PPPoE', eload:'ELOAD', rental:'Sub-vendo / Rental', settings:'Settings' });
  const sidebar = document.getElementById('sidebar');
  const menuButton = document.getElementById('menuButton');
  const title = document.getElementById('pageTitle');
  const links = Array.from(document.querySelectorAll('[data-page]'));
  const views = Array.from(document.querySelectorAll('[data-view]'));

  function requestedPage() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page') || 'dashboard';
    return allowedPages.has(page) ? page : 'dashboard';
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  async function payload(response) {
    if (!response.ok) throw new Error(`local API ${response.status}`);
    const json = await response.json();
    if (json && json.ok === false) throw new Error(json.error && json.error.message ? json.error.message : 'local API error');
    return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  function renderSessions(rows) {
    const body = document.getElementById('sessionsRows');
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'No local sessions yet.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const value of [row.deviceId || '—', row.state || 'unknown', `${row.remainingSeconds || 0}s`]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  async function loadLiveData() {
    try {
      const responses = await Promise.all([
        fetch('/api/v1/health', { cache: 'no-store' }),
        fetch('/api/v1/sales', { cache: 'no-store' }),
        fetch('/api/v1/sessions', { cache: 'no-store' }),
        fetch('/api/v1/vouchers', { cache: 'no-store' }),
        fetch('/api/v1/pppoe/accounts', { cache: 'no-store' }),
        fetch('/api/v1/providers/operations', { cache: 'no-store' }),
        fetch('/api/v1/settings', { cache: 'no-store' })
      ]);
      const [health, sales, sessions, vouchers, pppoe, providers, settings] = await Promise.all(responses.map(payload));
      setText('backendStatus', health.local ? 'Local backend online' : 'Local backend offline');
      setText('systemValue', health.local ? 'Online' : 'Offline');
      setText('salesValue', `${sales.length} record${sales.length === 1 ? '' : 's'}`);
      setText('sessionsValue', `${sessions.length} session${sessions.length === 1 ? '' : 's'}`);
      setText('vouchersValue', `${vouchers.length} voucher${vouchers.length === 1 ? '' : 's'}`);
      setText('pppoeValue', `${pppoe.length} account${pppoe.length === 1 ? '' : 's'}`);
      const latestProvider = providers.length ? providers[providers.length - 1].status : 'unavailable';
      setText('providerValue', latestProvider);
      setText('salesState', sales.length ? `${sales.length} persisted local sale record(s).` : 'No local sales yet.');
      setText('vouchersState', vouchers.length ? `${vouchers.length} persisted voucher record(s).` : 'No local vouchers yet.');
      setText('pppoeState', pppoe.length ? `${pppoe.length} local PPPoE account(s). Secrets are never shown here.` : 'No local PPPoE accounts yet.');
      setText('eloadState', latestProvider === 'unavailable' ? 'Provider unavailable/offline. Local functions remain available.' : `Latest provider operation: ${latestProvider}.`);
      renderSessions(sessions);
      const business = settings.find((item) => item.key === 'business.name');
      if (business) document.getElementById('businessName').value = String(business.value);
    } catch (_error) {
      setText('backendStatus', 'Local backend offline');
      setText('systemValue', 'Offline');
      setText('providerValue', 'unavailable');
      setText('eloadState', 'Provider unavailable/offline. Local UI remains safe.');
    }
  }

  async function saveSettings() {
    const button = document.getElementById('saveSettings');
    const input = document.getElementById('businessName');
    button.disabled = true;
    setText('settingsState', 'Saving locally…');
    try {
      const response = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'business.name', value: input.value })
      });
      await payload(response);
      setText('settingsState', 'Saved locally in SQLite.');
    } catch (_error) {
      setText('settingsState', 'Local save failed.');
    } finally {
      button.disabled = false;
    }
  }

  function render(page) {
    for (const view of views) view.hidden = view.dataset.view !== page;
    for (const link of links) {
      if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    title.textContent = titleMap[page];
    sidebar.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
  }

  menuButton.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  for (const link of links) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const page = link.dataset.page;
      const next = new URL(window.location.href);
      next.searchParams.set('page', page);
      window.history.pushState({}, '', next);
      render(page);
    });
  }
  document.getElementById('saveSettings').addEventListener('click', () => void saveSettings());
  window.addEventListener('popstate', () => render(requestedPage()));
  render(requestedPage());
  void loadLiveData();
}());

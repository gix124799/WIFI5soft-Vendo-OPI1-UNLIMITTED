'use strict';

(function initPortalShell() {
  const disabledControls = document.querySelectorAll('button:disabled, input:disabled');

  for (const control of disabledControls) {
    control.setAttribute('aria-disabled', 'true');
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  async function payload(response) {
    if (!response.ok) throw new Error(`local API ${response.status}`);
    const json = await response.json();
    if (json && json.ok === false) {
      throw new Error(json.error && json.error.message ? json.error.message : 'local API error');
    }
    return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  async function loadPortal() {
    try {
      const [healthResponse, ratesResponse] = await Promise.all([
        fetch('/api/v1/health', { cache: 'no-store' }),
        fetch('/api/v1/vendo/rates', { cache: 'no-store' })
      ]);
      const [health, rates] = await Promise.all([
        payload(healthResponse),
        payload(ratesResponse)
      ]);

      setText('portalStatus', health.local ? 'Local backend online' : 'Local backend offline');
      setText('connectionTitle', health.local ? 'Local services available' : 'Local backend offline');
      setText(
        'connectionDetail',
        health.local
          ? 'Portal data is served locally. WAN access is not required for normal functions.'
          : 'Local backend is unavailable.'
      );
      setText(
        'ratesText',
        rates.length
          ? `${rates.length} local rate option${rates.length === 1 ? '' : 's'} configured.`
          : 'No local rates configured.'
      );
    } catch (_error) {
      setText('portalStatus', 'Local backend offline');
      setText('connectionTitle', 'Local backend unavailable');
      setText('connectionDetail', 'Local services are temporarily unavailable.');
      setText('ratesText', 'Local rate data unavailable.');
    }
  }

  void loadPortal();
}());

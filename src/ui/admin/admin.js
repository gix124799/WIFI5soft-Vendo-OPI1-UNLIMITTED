'use strict';

(function initAdminShell() {
  const allowedPages = new Set([
    'dashboard',
    'sales',
    'sessions',
    'vouchers',
    'pppoe',
    'eload',
    'rental',
    'settings'
  ]);

  const titleMap = Object.freeze({
    dashboard: 'Dashboard',
    sales: 'Sales',
    sessions: 'Sessions',
    vouchers: 'Vouchers',
    pppoe: 'PPPoE',
    eload: 'ELOAD',
    rental: 'Sub-vendo / Rental',
    settings: 'Settings'
  });

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

  function render(page) {
    for (const view of views) {
      view.hidden = view.dataset.view !== page;
    }

    for (const link of links) {
      if (link.dataset.page === page) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
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

  window.addEventListener('popstate', () => render(requestedPage()));
  render(requestedPage());
}());
'use strict';

(function initPortalShell() {
  const disabledControls = document.querySelectorAll('button:disabled, input:disabled');

  for (const control of disabledControls) {
    control.setAttribute('aria-disabled', 'true');
  }
}());
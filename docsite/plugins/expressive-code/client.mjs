// starlight-codeblocks' client loader re-scans the page on Astro's page-load event
export function onRouteDidUpdate() {
  document.dispatchEvent(new Event('astro:page-load'));
}

if (typeof document !== 'undefined') {
  // Docusaurus' <details> (theme-common Details) calls stopPropagation() on every click inside it, so clicks
  // on code tabs never reach the `document` listener that starlight-codeblocks switches tabs with.
  // Tab clicks are never summary clicks, so letting them through cannot toggle any <details>.
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.scb-tabs-list > [role="tab"]')) event.stopPropagation = () => {};
  }, true);
}

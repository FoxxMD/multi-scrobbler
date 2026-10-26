// starlight-codeblocks' client loader re-scans the page on Astro's page-load event
export function onRouteDidUpdate() {
  document.dispatchEvent(new Event('astro:page-load'));
}

if (typeof document !== 'undefined') {
  // Docusaurus' <details> (theme-common Details) calls stopPropagation() on every click inside it, so clicks
  // in code blocks never reach the `document` listeners starlight-codeblocks uses (tabs, expandable, footnotes,
  // hidden lines, annotations, copy...). Code blocks have no <summary>, so letting them through cannot toggle any <details>.
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.expressive-code')) event.stopPropagation = () => {};
  }, true);
}

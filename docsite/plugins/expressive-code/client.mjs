// starlight-codeblocks' client loader re-scans the page on Astro's page-load event
export function onRouteDidUpdate() {
  document.dispatchEvent(new Event('astro:page-load'));
}

// Cached box-era bootstraps may still request the unversioned bundle.
(() => {
  const entry = new URL('./?v=pack-v5', document.baseURI);
  let page = window;
  if (window.parent !== window && document.referrer) {
    if (new URL(document.referrer).origin === location.origin) page = window.parent;
  }
  page.location.replace(entry.href);
})();

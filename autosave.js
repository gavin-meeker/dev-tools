// Autosave text inputs to localStorage with debounce
(function() {
  const DEBOUNCE_MS = 500;
  const timers = {};
  const page = location.pathname;

  function key(id) {
    return 'devtools:' + page + ':' + id;
  }

  function restore(el) {
    const saved = localStorage.getItem(key(el.id));
    if (saved !== null) {
      el.value = saved;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function save(el) {
    localStorage.setItem(key(el.id), el.value);
  }

  // When a share-link hash is present, that is the source of truth — skip restore
  // so autosaved content doesn't briefly flash in before the hash content loads.
  const hasHash = location.hash && location.hash.length > 1;

  function attach(el) {
    if (!el.id) return;
    if (!hasHash) restore(el);
    el.addEventListener('input', function() {
      clearTimeout(timers[el.id]);
      timers[el.id] = setTimeout(function() { save(el); }, DEBOUNCE_MS);
    });
  }

  // This script is loaded at the end of <body>, so all textareas are in the DOM
  // by the time it runs. Restoring synchronously (rather than on DOMContentLoaded)
  // means content is in place before the initial paint, avoiding a scroll-jump
  // when the browser restores scroll position after a refresh.
  document.querySelectorAll('textarea, input[type="text"]').forEach(attach);
})();

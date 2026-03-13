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

  function attach(el) {
    if (!el.id) return;
    restore(el);
    el.addEventListener('input', function() {
      clearTimeout(timers[el.id]);
      timers[el.id] = setTimeout(function() { save(el); }, DEBOUNCE_MS);
    });
  }

  // Run on DOMContentLoaded so elements exist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    document.querySelectorAll('textarea, input[type="text"]').forEach(attach);
  }
})();

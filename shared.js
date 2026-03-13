// ---- Theme toggle ----
(function() {
  const saved = localStorage.getItem('devtools:theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    updateIcon();
    btn.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'light' ? 'dark' : 'light';
      if (next === 'dark') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', next);
      }
      localStorage.setItem('devtools:theme', next);
      updateIcon();
    });
  });

  function updateIcon() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    btn.innerHTML = isLight
      ? '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>'
      : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  }
})();

// ---- Toast ----
function showToast(message) {
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(function() {
    toast.classList.add('show');
  });

  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 200);
  }, 1500);
}

// ---- Copy helper (replaces inline copied class) ----
function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  showToast('Copied to clipboard');
}

// ---- Clear helper ----
function clearTool() {
  document.querySelectorAll('textarea').forEach(function(el) {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.querySelectorAll('.output-area pre, .output-area .output-pre').forEach(function(el) {
    el.textContent = '';
    el.innerHTML = '';
  });
  // Clear any error/output divs
  document.querySelectorAll('#error, #output, #expiry').forEach(function(el) {
    if (el.tagName !== 'TEXTAREA' && el.tagName !== 'PRE') {
      if (el.id === 'output' && el.tagName === 'DIV') el.innerHTML = '';
      if (el.id === 'error') el.innerHTML = '';
      if (el.id === 'expiry') el.innerHTML = '';
    }
  });
}

// ---- Compression helpers (deflate-raw + base64url) ----
function _compressStr(str) {
  return new Response(
    new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  ).arrayBuffer().then(function(buf) {
    var bytes = new Uint8Array(buf);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
}

function _decompressStr(encoded) {
  var b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  ).text();
}

// ---- URL hash state ----
var _inputSelector = 'textarea[id], input[type="text"][id]';

function saveToHash() {
  var values = [];
  var hasContent = false;
  document.querySelectorAll(_inputSelector).forEach(function(el) {
    values.push(el.value);
    if (el.value) hasContent = true;
  });
  if (!hasContent) return;

  // Trim trailing empty strings to shorten the array
  while (values.length && !values[values.length - 1]) values.pop();

  _compressStr(JSON.stringify(values)).then(function(compressed) {
    var fullUrl = location.origin + location.pathname + '#' + compressed;
    history.replaceState(null, '', '#' + compressed);
    navigator.clipboard.writeText(fullUrl);
    showToast('Share link copied to clipboard');
  });
}

function loadFromHash() {
  if (!location.hash || location.hash.length < 2) return false;
  _decompressStr(location.hash.slice(1)).then(function(json) {
    var values = JSON.parse(json);
    var els = document.querySelectorAll(_inputSelector);
    els.forEach(function(el, i) {
      if (i < values.length && values[i]) {
        el.value = values[i];
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }).catch(function() {});
  return true;
}

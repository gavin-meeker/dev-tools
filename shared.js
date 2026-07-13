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

// ---- v2 hash format: '~' prefix + deflate-raw of a compact binary payload ----
// Payload layout: [flag u8][timestamp u32 BE][content bytes...]
// flag bit 0 = tokens substituted (see _v2Tokens / _v2Codes)
// flag bit 1 = content is JSON.stringify(values); else single value (raw utf-8 bytes)
var _v2Tokens = [
  '### ', '\n> ', '## ', '\n| ', '|--', ' | ', '```', '":"', '","',
  '](', '~~', '**', '- ', '# ', '\n\n'
];
var _v2Codes = (function() {
  var arr = [];
  for (var c = 2; c <= 0x1D && arr.length < _v2Tokens.length; c++) {
    if (c === 9 || c === 10 || c === 13) continue;
    arr.push(c);
  }
  return arr;
})();
var _v2ReservedRegex = /[\x02-\x08\x0B\x0C\x0E-\x1D]/;

function _v2Substitute(s) {
  for (var i = 0; i < _v2Tokens.length; i++) {
    s = s.split(_v2Tokens[i]).join(String.fromCharCode(_v2Codes[i]));
  }
  return s;
}

function _v2Unsubstitute(s) {
  for (var i = _v2Tokens.length - 1; i >= 0; i--) {
    s = s.split(String.fromCharCode(_v2Codes[i])).join(_v2Tokens[i]);
  }
  return s;
}

function _v2EncodeBytes(timestamp, values) {
  var isMulti = values.length !== 1;
  var content = isMulti ? JSON.stringify(values) : values[0];
  var canSub = !_v2ReservedRegex.test(content);
  var flag = (canSub ? 1 : 0) | (isMulti ? 2 : 0);
  if (canSub) content = _v2Substitute(content);
  var contentBytes = new TextEncoder().encode(content);
  var out = new Uint8Array(5 + contentBytes.length);
  out[0] = flag;
  out[1] = (timestamp >>> 24) & 0xFF;
  out[2] = (timestamp >>> 16) & 0xFF;
  out[3] = (timestamp >>> 8) & 0xFF;
  out[4] = timestamp & 0xFF;
  out.set(contentBytes, 5);
  return out;
}

function _v2DecodeBytes(bytes) {
  var flag = bytes[0];
  var timestamp = bytes[1] * 0x1000000 + (bytes[2] << 16) + (bytes[3] << 8) + bytes[4];
  var content = new TextDecoder().decode(bytes.subarray(5));
  if (flag & 1) content = _v2Unsubstitute(content);
  var values = (flag & 2) ? JSON.parse(content) : [content];
  return { timestamp: timestamp, values: values };
}

function _v2Compress(timestamp, values) {
  var bytes = _v2EncodeBytes(timestamp, values);
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  ).arrayBuffer().then(function(buf) {
    var b = new Uint8Array(buf);
    var binary = '';
    for (var i = 0; i < b.length; i++) binary += String.fromCharCode(b[i]);
    return '~' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
}

function _v2Decompress(hash) {
  var b64 = hash.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  ).arrayBuffer().then(function(buf) {
    return _v2DecodeBytes(new Uint8Array(buf));
  });
}

function _formatShareTime(secs) {
  if (!secs) return '';
  var d = new Date(secs * 1000);
  var pad = function(n) { return n < 10 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function _renderShareTime(secs) {
  var el = document.getElementById('share-timestamp');
  if (!el) return;
  el.textContent = secs ? 'Shared ' + _formatShareTime(secs) : '';
}

// ---- URL hash state ----
var _inputSelector = 'textarea[id], input[type="text"][id]';

function _applyHashValues(values) {
  var els = document.querySelectorAll(_inputSelector);
  els.forEach(function(el, i) {
    if (i < values.length && values[i]) {
      el.value = values[i];
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

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

  var timestamp = Math.floor(Date.now() / 1000);
  _v2Compress(timestamp, values).then(function(hash) {
    if (hash.length > 20000) {
      var proceed = confirm(
        'This share link is ' + hash.length.toLocaleString() + ' characters long. ' +
        'Some apps (like Slack) may truncate very long URLs when pasted, which will ' +
        'prevent the link from opening correctly. Copy anyway?'
      );
      if (!proceed) return;
    }
    var fullUrl = location.origin + location.pathname + '#' + hash;
    history.replaceState(null, '', '#' + hash);
    navigator.clipboard.writeText(fullUrl);
    _renderShareTime(timestamp);
    showToast('Share link copied to clipboard');
  });
}

function loadFromHash() {
  if (!location.hash || location.hash.length < 2) return false;
  var hash = location.hash.slice(1);
  var promise;
  if (hash.charAt(0) === '~') {
    promise = _v2Decompress(hash).then(function(result) {
      _applyHashValues(result.values);
      _renderShareTime(result.timestamp);
    });
  } else {
    // Legacy v1: JSON-string + deflate-raw + base64url (no timestamp)
    promise = _decompressStr(hash).then(function(json) {
      _applyHashValues(JSON.parse(json));
      _renderShareTime(0);
    });
  }
  promise.catch(function() {});
  return true;
}

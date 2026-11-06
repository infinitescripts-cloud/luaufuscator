(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const els = {
    source: $('source'), output: $('output'), outputBlock: $('output-block'),
    srcStats: $('src-stats'), outStats: $('out-stats'),
    btnObf: $('btn-obf'), btnDownload: $('btn-download'), btnCopy: $('btn-copy'),
    btnUpload: $('btn-upload'), btnClear: $('btn-clear-src'), btnExample: $('btn-example'),
    fileInput: $('file-input'), seed: $('seed'),
  };

  const EXAMPLE = `local greeting = "Hello"
local function greet(name)
  -- compose a message
  return greeting .. ", " .. name .. "!"
end
print(greet("WitchSec"))
for i = 1, 3 do
  print("count: " .. i)
end
`;

  let currentFileName = 'output.luau';

  function updateStats() {
    const src = els.source.value;
    els.srcStats.textContent = src.length > 0
      ? `${src.length} chars · ${src.split('\n').length} lines`
      : '';
    els.btnObf.disabled = src.trim().length === 0;
    els.btnClearSrc.disabled = src.length === 0;
  }

  function updateOutStats() {
    const out = els.output.value;
    els.outStats.textContent = `${out.length} chars · ${out.split('\n').length} lines`;
  }

  els.source.addEventListener('input', updateStats);

  els.btnUpload.addEventListener('click', () => els.fileInput.click());

  els.fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/\.(lua|luau|txt)$/i.test(file.name)) return alert('Only .lua, .luau, .txt');
    if (file.size > 5 * 1024 * 1024) return alert('File too large (max 5 MB)');
    const reader = new FileReader();
    reader.onload = () => {
      els.source.value = reader.result;
      currentFileName = file.name.replace(/\.\w+$/, '.obf.luau');
      updateStats();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  els.btnExample.addEventListener('click', () => {
    els.source.value = EXAMPLE;
    currentFileName = 'example.obf.luau';
    updateStats();
  });

  els.btnClearSrc.addEventListener('click', () => {
    els.source.value = '';
    els.output.value = '';
    els.outputBlock.hidden = true;
    currentFileName = 'output.luau';
    updateStats();
  });

  els.btnObf.addEventListener('click', () => {
    const seedInput = els.seed.value;
    const seed = seedInput ? parseInt(seedInput, 10) >>> 0 : (Date.now() >>> 0);

    try {
      const out = WitchSec.obfuscate(els.source.value, {
        seed,
        encryptStrings: $('opt-str').checked,
        stripComments:  $('opt-com').checked,
        obfuscateNumbers: $('opt-num').checked,
        renameLocals:   $('opt-loc').checked,
        injectJunk:     $('opt-junk').checked,
      });
      els.output.value = out;
      els.outputBlock.hidden = false;
      updateOutStats();
      els.outputBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      alert('Obfuscation failed: ' + e.message);
      console.error(e);
    }
  });

  els.btnDownload.addEventListener('click', () => {
    const blob = new Blob([els.output.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  els.btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.output.value);
      const orig = els.btnCopy.textContent;
      els.btnCopy.textContent = 'Copied';
      setTimeout(() => els.btnCopy.textContent = orig, 1500);
    } catch (e) {
      alert('Copy failed: ' + e.message);
    }
  });

  updateStats();
})();
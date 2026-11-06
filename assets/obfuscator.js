(function () {
  'use strict';

  // ---------- RNG (Mulberry32) ----------
  function makeRng(seed) {
    let s = seed >>> 0;
    return {
      next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; },
      hex(len) {
        let s = '';
        for (let i = 0; i < len; i++) s += '0123456789abcdef'[this.int(0, 15)];
        return s;
      }
    };
  }

  // ---------- LEXER ----------
  const KEYWORDS = new Set([
    'and','break','do','else','elseif','end','false','for','function','if','in',
    'local','nil','not','or','repeat','return','then','true','until','while',
    'continue','export','type','typeof'
  ]);

  function lex(src) {
    const toks = [];
    let i = 0, line = 1, col = 1;
    const n = src.length;

    const adv = (len) => {
      for (let k = 0; k < len; k++) {
        if (src[i + k] === '\n') { line++; col = 1; } else col++;
      }
      i += len;
    };

    const push = (type, len) => {
      toks.push({ type, value: src.slice(i, i + len), line, col });
      adv(len);
    };

    while (i < n) {
      const c = src[i];

      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        let j = i;
        while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r' || src[j] === '\n')) j++;
        push('ws', j - i);
        continue;
      }

      if (c === '-' && src[i + 1] === '-') {
        if (src[i + 2] === '[') {
          let eq = 0, k = i + 3;
          while (src[k] === '=') { eq++; k++; }
          if (src[k] === '[') {
            k++;
            const close = ']' + '='.repeat(eq) + ']';
            const end = src.indexOf(close, k);
            push('comment', (end === -1 ? n : end + close.length) - i);
            continue;
          }
        }
        let j = i;
        while (j < n && src[j] !== '\n') j++;
        push('comment', j - i);
        continue;
      }

      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === c) { j++; break; }
          j++;
        }
        push('string', j - i);
        continue;
      }

      if (c === '`') {
        let j = i + 1, depth = 0;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '{' && src[j - 1] !== '\\') depth++;
          else if (src[j] === '}' && depth > 0) depth--;
          else if (src[j] === '`' && depth === 0) { j++; break; }
          j++;
        }
        push('string', j - i);
        continue;
      }

      if (c === '[') {
        let eq = 0, k = i + 1;
        while (src[k] === '=') { eq++; k++; }
        if (src[k] === '[') {
          k++;
          const close = ']' + '='.repeat(eq) + ']';
          const end = src.indexOf(close, k);
          push('string', (end === -1 ? n : end + close.length) - i);
          continue;
        }
      }

      if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
        let j = i;
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          j = i + 2;
          while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++;
        } else {
          while (j < n && /[0-9_.]/.test(src[j])) j++;
          if (src[j] === 'e' || src[j] === 'E') {
            j++;
            if (src[j] === '+' || src[j] === '-') j++;
            while (j < n && /[0-9]/.test(src[j])) j++;
          }
        }
        push('number', j - i);
        continue;
      }

      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
        let j = i + 1;
        while (j < n && /[a-zA-Z0-9_]/.test(src[j])) j++;
        const w = src.slice(i, j);
        push(KEYWORDS.has(w) ? 'keyword' : 'ident', j - i);
        continue;
      }

      const THREE = ['...', '..=', '//=', '<<=', '>>='];
      const TWO = ['==','~=','<=','>=','//','<<','>>','+=','-=','*=','/=','%=','^=','..','::'];
      let matched = null;
      for (const op of THREE) if (src.startsWith(op, i)) { matched = op; break; }
      if (!matched) for (const op of TWO) if (src.startsWith(op, i)) { matched = op; break; }
      if (matched) { push('op', matched.length); continue; }
      push('op', 1);
    }
    return toks;
  }

  // ---------- RENDER ----------
  function render(tokens) {
    return tokens.map(t => t.value).join('');
  }

  // ---------- PASSES ----------
  function stripComments(tokens) {
    return tokens.filter(t => t.type !== 'comment');
  }

  function unescapeLua(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '\\') { out += s[i]; continue; }
      i++;
      const c = s[i];
      switch (c) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'a': out += '\x07'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'v': out += '\v'; break;
        case '\\': out += '\\'; break;
        case '"': out += '"'; break;
        case "'": out += "'"; break;
        case '\n': out += '\n'; break;
        case 'x': {
          const hex = s.slice(i + 1, i + 3);
          out += String.fromCharCode(parseInt(hex, 16) || 0);
          i += 2;
          break;
        }
        case 'z': { while (i + 1 < s.length && /\s/.test(s[i + 1])) i++; break; }
        default:
          if (c >= '0' && c <= '9') {
            let num = '', j = i;
            while (j < s.length && j < i + 3 && s[j] >= '0' && s[j] <= '9') { num += s[j]; j++; }
            out += String.fromCharCode(parseInt(num, 10) & 0xFF);
            i = j - 1;
          } else out += c;
      }
    }
    return out;
  }

  function extractStringLiteral(tok) {
    const v = tok.value;
    if (v[0] === '"' || v[0] === "'") return unescapeLua(v.slice(1, -1));
    if (v[0] === '`') return null;
    let eq = 0;
    while (v[1 + eq] === '=') eq++;
    let content = v.slice(2 + eq, v.length - (2 + eq));
    if (content[0] === '\n') content = content.slice(1);
    return content;
  }

  function bytesToLuaEscape(bytes) {
    let s = '"';
    for (const b of bytes) {
      if (b >= 32 && b < 127 && b !== 34 && b !== 92) s += String.fromCharCode(b);
      else s += '\\' + b;
    }
    return s + '"';
  }

  function encryptStrings(tokens, rng) {
    const key = [];
    for (let i = 0; i < 8; i++) key.push(rng.int(1, 255));

    const encoded = [];
    const out = [];

    for (const t of tokens) {
      if (t.type === 'string') {
        const content = extractStringLiteral(t);
        if (content === null) { out.push(t); continue; }
        const bytes = [];
        for (let i = 0; i < content.length; i++) {
          bytes.push((content.charCodeAt(i) ^ key[i % key.length]) & 0xFF);
        }
        encoded.push(bytes);
        out.push({ type: 'ident', value: '__WS_D(' + (encoded.length - 1) + ')', line: t.line, col: t.col });
      } else {
        out.push(t);
      }
    }

    if (encoded.length === 0) return { tokens: out, stub: '' };

    const encodedLits = encoded.map(bytesToLuaEscape).join(',');
    const keyLit = key.join(',');

    const stub = [
      'local __WS_D = (function()',
      '  local __c = {}',
      '  local __k = {' + keyLit + '}',
      '  local __d = {' + encodedLits + '}',
      '  return function(__i)',
      '    if __c[__i] then return __c[__i] end',
      '    local __r = __d[__i + 1]',
      '    local __o = {}',
      '    for __j = 1, #__r do',
      '      __o[__j] = string.char((string.byte(__r, __j) + 255 - __k[(__j - 1) % #__k + 1]) % 256)',
      '    end',
      '    __c[__i] = table.concat(__o)',
      '    return __c[__i]',
      '  end',
      'end)()',
    ].join('\n');

    return { tokens: out, stub };
  }

  function obfuscateNumbers(tokens, rng) {
    return tokens.map(t => {
      if (t.type !== 'number') return t;
      if (!/^\d+$/.test(t.value)) return t;
      const num = parseInt(t.value, 10);
      if (num > 0xFFFFFFFF) return t;
      if (rng.next() < 0.5) return { ...t, value: '0x' + num.toString(16) };
      return t;
    });
  }

  function renameLocals(tokens, rng) {
    const used = new Set(['__WS_D', '_ENV', '_G', 'self', 'script', 'game', 'workspace']);
    function fresh() {
      for (let i = 0; i < 100000; i++) {
        const name = '_' + rng.hex(6);
        if (!used.has(name)) { used.add(name); return name; }
      }
      throw new Error('name pool exhausted');
    }

    const declNames = new Set();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'keyword' || tokens[i].value !== 'local') continue;
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === 'ws') j++;
      if (tokens[j]?.type === 'keyword' && tokens[j].value === 'function') {
        j++;
        while (j < tokens.length && tokens[j].type === 'ws') j++;
        if (tokens[j]?.type === 'ident') declNames.add(tokens[j].value);
        continue;
      }
      while (j < tokens.length) {
        if (tokens[j].type === 'ws') { j++; continue; }
        if (tokens[j].type === 'ident') {
          declNames.add(tokens[j].value);
          j++;
          while (j < tokens.length && tokens[j].type === 'ws') j++;
          if (tokens[j]?.value === ':') {
            j++;
            while (j < tokens.length && tokens[j].type !== 'ws' && tokens[j].value !== ',' && tokens[j].value !== '=') j++;
          }
          while (j < tokens.length && tokens[j].type === 'ws') j++;
          if (tokens[j]?.value === ',') { j++; continue; }
          break;
        }
        break;
      }
    }

    const renameMap = new Map();
    for (const name of declNames) renameMap.set(name, fresh());

    return tokens.map((t, i) => {
      if (t.type !== 'ident') return t;
      if (!renameMap.has(t.value)) return t;
      let k = i - 1;
      while (k >= 0 && tokens[k].type === 'ws') k--;
      if (k >= 0 && tokens[k].type === 'op' && (tokens[k].value === '.' || tokens[k].value === ':')) return t;
      return { ...t, value: renameMap.get(t.value) };
    });
  }

  function injectJunk(tokens, rng) {
    const junk = [];
    const count = rng.int(2, 3);
    for (let i = 0; i < count; i++) {
      const name = '_' + rng.hex(6);
      const val = rng.int(1, 999);
      junk.push({ type: 'code', value: `local ${name} = ${val}\n`, line: 0, col: 0 });
    }
    let insertAt = 0;
    while (insertAt < tokens.length && (tokens[insertAt].type === 'ws' || tokens[insertAt].type === 'comment')) insertAt++;
    return [...tokens.slice(0, insertAt), ...junk, ...tokens.slice(insertAt)];
  }

  // ---------- ORCHESTRATOR ----------
  function obfuscate(src, opts) {
    const seed = (opts.seed || Date.now()) >>> 0;
    const rng = makeRng(seed);

    let tokens = lex(src);
    if (opts.stripComments) tokens = stripComments(tokens);

    let stub = '';
    if (opts.encryptStrings) {
      const r = encryptStrings(tokens, rng);
      tokens = r.tokens;
      stub = r.stub;
    }

    if (opts.obfuscateNumbers) tokens = obfuscateNumbers(tokens, rng);
    if (opts.renameLocals) tokens = renameLocals(tokens, rng);
    if (opts.injectJunk) tokens = injectJunk(tokens, rng);

    const body = render(tokens);
    return stub ? stub + '\n\n' + body : body;
  }

  window.WitchSec = { obfuscate, lex };
})();
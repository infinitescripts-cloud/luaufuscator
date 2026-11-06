// WitchSec — Luau lexer
// Emits tokens: {type, value, line, col}
// Types: ws, comment, string, number, ident, keyword, op

(function () {
  'use strict';

  const KEYWORDS = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end',
    'false', 'for', 'function', 'if', 'in',
    'local', 'nil', 'not', 'or', 'repeat', 'return',
    'then', 'true', 'until', 'while',
    // Luau additions
    'continue', 'export', 'type', 'typeof'
  ]);

  // Longest-first operator matching
  const OPS = [
    '...', '..=',
    '//=', '<<=', '>>=',
    '==', '~=', '<=', '>=', '//', '<<', '>>',
    '+=', '-=', '*=', '/=', '%=', '^=',
    '..', '::', '->',
    '+', '-', '*', '/', '%', '^', '#',
    '=', '<', '>', '&', '|', '~',
    '(', ')', '{', '}', '[', ']',
    ';', ':', ',', '.'
  ];

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isHex(c) { return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
  function isAlpha(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }
  function isAlnum(c) { return isAlpha(c) || isDigit(c); }
  function isSpace(c) { return c === ' ' || c === '\t' || c === '\r' || c === '\n'; }

  function lex(src) {
    const tokens = [];
    let i = 0, line = 1, col = 1;
    const n = src.length;

    const advance = (count) => {
      for (let k = 0; k < count; k++) {
        if (src[i] === '\n') { line++; col = 1; }
        else { col++; }
        i++;
      }
    };

    const push = (type, start, length) => {
      tokens.push({
        type,
        value: src.slice(start, start + length),
        line,
        col,
      });
      advance(length);
    };

    while (i < n) {
      const c = src[i];
      const start = i;
      const startLine = line, startCol = col;

      // whitespace
      if (isSpace(c)) {
        let j = i;
        while (j < n && isSpace(src[j])) j++;
        push('ws', start, j - start);
        continue;
      }

      // comments
      if (c === '-' && src[i + 1] === '-') {
        // long comment --[[ ]] or --[=[ ]=]
        if (src[i + 2] === '[') {
          let eq = 0, k = i + 3;
          while (src[k] === '=') { eq++; k++; }
          if (src[k] === '[') {
            k++;
            const close = ']' + '='.repeat(eq) + ']';
            const end = src.indexOf(close, k);
            const stop = end === -1 ? n : end + close.length;
            push('comment', start, stop - start);
            continue;
          }
        }
        // line comment
        let j = i;
        while (j < n && src[j] !== '\n') j++;
        push('comment', start, j - start);
        continue;
      }

      // string literal: " ' ` [[ ]]
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === c) { j++; break; }
          if (src[j] === '\n') break;  // unterminated — stop at line end
          j++;
        }
        push('string', start, j - start);
        continue;
      }

      // backtick interpolation string
      if (c === '`') {
        let j = i + 1;
        let depth = 0;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '{' && src[j - 1] !== '\\') depth++;
          else if (src[j] === '}' && depth > 0) depth--;
          else if (src[j] === '`' && depth === 0) { j++; break; }
          j++;
        }
        push('string', start, j - start);
        continue;
      }

      // long string [[ ]] or [=[ ]=]
      if (c === '[') {
        let eq = 0, k = i + 1;
        while (src[k] === '=') { eq++; k++; }
        if (src[k] === '[') {
          k++;
          const close = ']' + '='.repeat(eq) + ']';
          const end = src.indexOf(close, k);
          const stop = end === -1 ? n : end + close.length;
          push('string', start, stop - start);
          continue;
        }
      }

      // number
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
        let j = i;

        // hex
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          j = i + 2;
          while (j < n && (isHex(src[j]) || src[j] === '_')) j++;
        }
        // binary
        else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
          j = i + 2;
          while (j < n && (src[j] === '0' || src[j] === '1' || src[j] === '_')) j++;
        }
        // decimal / float / scientific
        else {
          j = i;
          while (j < n && (isDigit(src[j]) || src[j] === '_')) j++;
          if (src[j] === '.') {
            j++;
            while (j < n && (isDigit(src[j]) || src[j] === '_')) j++;
          }
          if (src[j] === 'e' || src[j] === 'E') {
            j++;
            if (src[j] === '+' || src[j] === '-') j++;
            while (j < n && isDigit(src[j])) j++;
          }
        }
        push('number', start, j - start);
        continue;
      }

      // identifier or keyword
      if (isAlpha(c)) {
        let j = i + 1;
        while (j < n && isAlnum(src[j])) j++;
        const word = src.slice(i, j);
        push(KEYWORDS.has(word) ? 'keyword' : 'ident', start, j - start);
        continue;
      }

      // operators
      let matched = null;
      for (const op of OPS) {
        if (src.startsWith(op, i)) { matched = op; break; }
      }
      if (matched) {
        push('op', start, matched.length);
        continue;
      }

      // unknown — emit as op to preserve position
      push('op', start, 1);
    }

    return tokens;
  }

  window.WitchSecLexer = { lex, KEYWORDS, OPS };
})();
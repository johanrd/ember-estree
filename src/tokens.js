/**
 * Token stream generation for Glimmer templates.
 *
 * Only needed by ESLint consumers — codemods, type-checkers, and formatters
 * do not use the flat token stream and skip this entirely by omitting
 * `{ tokens: true }` from processTemplate options.
 *
 * ESLint-specific note: comment tokens are placed at range[0]+1 rather than
 * range[0] because ESLint's createIndexMap infinite-loops when a token and an
 * ast.comments entry share range[0] — both inner loops fail the strict-less-than
 * guard and the outer loop never advances. Tracked upstream as eslint/eslint#20492.
 */

function isAlphaNumeric(code) {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * Lex a Glimmer template into a flat token array.
 * Tracks line/column incrementally from a single seed call to
 * doc.offsetToPosition — O(n + log L) instead of O(n log L).
 */
export function tokenize(template, doc, startOffset) {
  const tokens = [];
  let wordStart = -1;

  // Seed position from the start offset — one binary search total.
  // Then track line/column incrementally (DocumentLines counts only \n
  // as line separators, so this matches offsetToPosition exactly).
  let { line: curLine, column: curCol } = doc.offsetToPosition(startOffset);
  let wordLine = 0,
    wordCol = 0;

  for (let i = 0; i < template.length; i++) {
    const code = template.charCodeAt(i);
    if (isAlphaNumeric(code)) {
      if (wordStart < 0) {
        wordStart = i;
        wordLine = curLine;
        wordCol = curCol;
      }
      curCol++;
    } else {
      if (wordStart >= 0) {
        const absStart = startOffset + wordStart;
        const absEnd = startOffset + i;
        tokens.push({
          type: "word",
          value: template.slice(wordStart, i),
          range: [absStart, absEnd],
          start: absStart,
          end: absEnd,
          loc: {
            start: { line: wordLine, column: wordCol, index: absStart },
            end: { line: curLine, column: curCol, index: absEnd },
          },
        });
        wordStart = -1;
      }
      if (code === 10 /* \n */) {
        curLine++;
        curCol = 0;
      } else {
        if (code !== 32 && code !== 9 && code !== 13 && code !== 11 /* non-whitespace */) {
          const absPos = startOffset + i;
          tokens.push({
            type: "Punctuator",
            value: template[i],
            range: [absPos, absPos + 1],
            start: absPos,
            end: absPos + 1,
            loc: {
              start: { line: curLine, column: curCol, index: absPos },
              end: { line: curLine, column: curCol + 1, index: absPos + 1 },
            },
          });
        }
        curCol++;
      }
    }
  }

  if (wordStart >= 0) {
    const absStart = startOffset + wordStart;
    const absEnd = startOffset + template.length;
    tokens.push({
      type: "word",
      value: template.slice(wordStart),
      range: [absStart, absEnd],
      start: absStart,
      end: absEnd,
      loc: {
        start: { line: wordLine, column: wordCol, index: absStart },
        end: { line: curLine, column: curCol, index: absEnd },
      },
    });
  }

  return tokens;
}

/**
 * Merge the raw Glimmer token stream with text nodes and comment tokens,
 * dropping raw tokens that fall inside comment or text-node intervals.
 *
 * All inputs are sorted by range[0] (sequential document scan), so the
 * entire operation is a single O(n+m+k) pass with advancing pointers
 * rather than O(n log m) per-token binary searches.
 */
export function buildTokenStream(rawTokens, comments, textNodes, templateContent, offset) {
  // Comment tokens shifted by 1 to avoid the ESLint createIndexMap conflict
  const commentTokens = comments.map((c) => {
    const start = c.range[0] + 1;
    const end = c.range[1];
    return {
      type: "Block",
      value: templateContent.slice(start - offset, end - offset),
      range: [start, end],
      start,
      end,
      loc: c.loc,
    };
  });

  const spliceables = linearMerge(textNodes, commentTokens);

  const result = [];
  let ri = 0; // rawTokens
  let si = 0; // spliceables
  let ci = 0; // comment intervals (for skip detection)
  let ni = 0; // text-node intervals (for skip detection)

  while (ri < rawTokens.length || si < spliceables.length) {
    if (ri >= rawTokens.length) {
      result.push(spliceables[si++]);
      continue;
    }

    const tok = rawTokens[ri];

    // Advance interval pointers past intervals that end before this token
    while (ci < comments.length && comments[ci].range[1] <= tok.range[0]) ci++;
    while (ni < textNodes.length && textNodes[ni].range[1] <= tok.range[0]) ni++;

    // Skip raw token if it falls inside a comment or text-node interval
    if (
      (ci < comments.length && comments[ci].range[0] <= tok.range[0]) ||
      (ni < textNodes.length && textNodes[ni].range[0] <= tok.range[0])
    ) {
      ri++;
      continue;
    }

    // Emit the earlier of the next spliceable or this raw token
    if (si < spliceables.length && spliceables[si].range[0] < tok.range[0]) {
      result.push(spliceables[si++]);
    } else {
      result.push(tok);
      ri++;
    }
  }

  return result;
}

function linearMerge(a, b) {
  const result = Array.from({ length: a.length + b.length });
  let ai = 0,
    bi = 0,
    ri = 0;
  while (ai < a.length && bi < b.length) {
    result[ri++] = a[ai].range[0] <= b[bi].range[0] ? a[ai++] : b[bi++];
  }
  while (ai < a.length) result[ri++] = a[ai++];
  while (bi < b.length) result[ri++] = b[bi++];
  return result;
}

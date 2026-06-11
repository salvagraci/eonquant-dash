// Eon Quant agent dashboard — vault state parser.
// AMENDMENT 4 (design doc): status + gate chips read ONLY from the CLAUDE.md
// deploy-book bullet. sessionMd feeds blockers[] (display text) and can never
// change a leg's status or chips. Parse failure → caller renders grey, never a
// guessed color.

export const STATUS = Object.freeze({ LIVE: 'live', PENDING: 'pending', BLOCKED: 'blocked', UNKNOWN: 'unknown' });
const PAIR_CODES = { USDJPY: 'UJ', GBPJPY: 'GJ', EURJPY: 'EJ', GBPUSD: 'GU', AUDUSD: 'AU', EURUSD: 'EU', XAUUSD: 'GC' };

export function pickNewestSession(listing) {
  return listing.map(e => e.name).filter(n => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(n)).sort().at(-1) ?? null;
}

function criticalSection(md) {
  // split-based: /m-flag `$` in a lookahead matches the first line-end and
  // silently truncates the capture — burned once, do not regex this.
  const i = (md ?? '').search(/^## CRITICAL STATE POINTERS/m);
  if (i < 0) return null;
  const rest = md.slice(i).split('\n').slice(1).join('\n');
  const j = rest.search(/^## /m);
  return j < 0 ? rest : rest.slice(0, j);
}

function bulletOf(section, label) {
  const m = section.match(new RegExp(`^- \\*\\*${label}[\\s\\S]*?(?=\\n- \\*\\*|\\n#|$(?![\\s\\S]))`, 'm'));
  return m ? m[0] : null;
}

function legStatus(ownText) {
  if (/\b(retired|blocked|halted|suspended)\b/i.test(ownText)) return STATUS.BLOCKED;
  const neutral = ownText.replace(/go-live|pre-live/gi, '');
  if (/\bLIVE\b/.test(neutral)) return STATUS.LIVE;
  return STATUS.PENDING; // membership in the deploy book implies at least pending
}

function gateChips(ownPlusShared) {
  const t = ownPlusShared;
  const g = { port: 'unknown', parity: 'unknown', tag: 'unknown', card: 'unknown' };
  if (/\bported\b|port (complete|validated)/i.test(t)) g.port = 'pass';
  else if (/pending (the )?QC( port| \+ C2)?/i.test(t)) g.port = 'fail';
  if (/parity (gate )?(passed|validated|green)/i.test(t)) g.parity = 'pass';
  else if (/\bparity\b/i.test(t)) g.parity = 'fail';
  if (/\btag(ged|ging)? (done|complete|implemented|verified)/i.test(t)) g.tag = 'pass';
  else if (/\btag(ging)?\b/i.test(t)) g.tag = 'fail';
  if (/card (frozen|v\d|regenerated)/i.test(t)) g.card = 'pass';
  else if (/\bcard\b/i.test(t)) g.card = 'fail';
  return g;
}

export function parseVaultState({ claudeMd, sessionMd = '', sessionName = null, commit = null }) {
  const out = { commit, sessionName, legs: [], pipeline: [], parseHealth: 'failed', raw: {} };
  const section = criticalSection(claudeMd ?? '');
  if (!section) return out;

  let book = bulletOf(section, 'Active deploy book');
  if (book) {
    book = book.split(/Retired from deploy slate/)[0]; // retired strategies are not legs
    out.raw.bookLine = book.slice(0, 400);
    const LEG_RE = /(\d+\.\d+\.\d+|\b\d{3}\b)(?:\s+(?:SEQ|OG))?\s*\(([A-Z]{6})\s+([MHD]\d+)\b[^)]*\)/g;
    const matches = [...book.matchAll(LEG_RE)];
    const lastEnd = matches.length ? matches.at(-1).index + matches.at(-1)[0].length : 0;
    const shared = book.slice(lastEnd); // pre-live path prose shared by all legs (gates only)
    out.legs = matches.map((m, i) => {
      const own = book.slice(m.index, matches[i + 1]?.index ?? lastEnd);
      const esc = m[1].replace(/\./g, '\\.');
      const blockers = sessionMd.split('\n')
        .filter(l => new RegExp(`(^|[^\\d.])${esc}([^\\d.]|$)`).test(l))
        .map(l => l.replace(/^\s*\d*\.?\s*/, '').replace(/\*\*/g, '').trim()).slice(0, 3);
      return {
        id: m[1], pair: m[2], tf: m[3], code2: PAIR_CODES[m[2]] ?? m[2].slice(0, 2),
        status: legStatus(own), gates: gateChips(own + ' ' + shared), blockers,
        sourceLine: own.trim().slice(0, 200),
      };
    });
  }

  const pipe = bulletOf(section, 'Active pipeline run');
  if (pipe) {
    if (/Stockpicker/i.test(pipe)) {
      // name derived from vault text at runtime — never hardcode run identifiers
      // in this file: it is served from the public shell repo
      const sym = pipe.match(/\(([A-Z]{2,6})\s+(?:D|H|M)\d+/)?.[1];
      const stage = pipe.match(/T\d+\s+[A-Z_]+(?:\s+in progress)?/i)?.[0] ?? 'in progress';
      out.pipeline.push({ name: `${sym ? sym + ' ' : ''}Stockpicker`, stage, status: 'running' });
    }
    const order = claudeMd.match(/Pipeline order:([^\n]+)/);
    if (order) {
      const toks = order[1].split('→').map(s => s.trim());
      const i = toks.findIndex(t => /\(running\)/.test(t));
      if (i >= 0 && toks[i + 1]) out.pipeline.push({ name: toks[i + 1].split('(')[0].trim(), stage: 'queued', status: 'queued' });
    }
  }

  out.parseHealth = out.legs.length && out.pipeline.length ? 'ok' : out.legs.length ? 'partial' : 'failed';
  return out;
}

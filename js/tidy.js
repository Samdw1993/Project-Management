/* Turns raw dictated speech into concise bullet points.
 * Two modes:
 *   Tidy.local(text)        — instant, offline, rule-based cleanup.
 *   Tidy.ai(text, apiKey)   — Claude-powered cleanup (optional, set up in Settings).
 * Both return an array of bullet strings.
 */
const Tidy = (() => {

  // Spoken punctuation / structure commands.
  const COMMANDS = [
    [/\b(full stop|period)\b/gi, '.'],
    [/\bcomma\b/gi, ','],
    [/\b(new line|newline|new point|next point|new bullet|bullet point)\b/gi, '\n'],
  ];

  // Filler words that are safe to strip from dictation.
  const FILLERS = /\b(um+|uh+|erm+|err?|ah+|hmm+|you know|i mean|basically|kind of like|sort of like)\b/gi;

  // Leading conversational lead-ins to drop from the start of a point.
  const LEAD_INS = /^(and|so|then|also|ok(ay)?|right|well|next)\b[\s,]*/i;

  function cleanPoint(raw) {
    let t = raw
      .replace(FILLERS, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
    t = t.replace(LEAD_INS, '');
    t = t.replace(/[.,;:\s]+$/g, '');
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function local(text) {
    let t = ' ' + String(text || '') + ' ';
    for (const [re, rep] of COMMANDS) t = t.replace(re, rep);

    const points = [];
    for (const chunk of t.split(/\n+/)) {
      for (const sentence of chunk.split(/(?<=[.!?])\s+/)) {
        const p = cleanPoint(sentence);
        if (p.length > 1 && p !== points[points.length - 1]) points.push(p);
      }
    }
    return points;
  }

  const SYSTEM_PROMPT = [
    'You clean up dictated project-review notes.',
    'Rewrite the raw dictation as concise bullet points, one point per line, no bullet characters.',
    'Keep every concrete fact: measurements, quantities, locations, names, dates, defects, risks, decisions and actions.',
    'Remove filler words, repetition and conversational padding. Group closely related fragments into one point.',
    'Some lines may already be tidy bullet points — keep those, merging duplicates.',
    'Never invent information that is not in the input.',
    'Output ONLY the bullet lines, nothing else.',
  ].join(' ');

  async function ai(text, apiKey) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required for calling the Anthropic API directly from a browser.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: String(text || '') }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => null);
      throw new Error((err && err.error && err.error.message) || 'API error ' + resp.status);
    }
    const data = await resp.json();
    const out = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return out
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);
  }

  return { local, ai };
})();

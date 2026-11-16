// Jarvis' brain: a conversation with an AI model over an OpenAI-compatible API (OpenAI itself, or any service or
// local server that speaks the same protocol). The key is the user's own; replies arrive as a stream and are handed
// on sentence by sentence, so he can start speaking before the whole answer is there.
const PERSONA = (name) => `You are Jarvis, ${name ? `${name}'s` : 'a'} personal desktop assistant. You live on their screen and speak out loud: everything you write is spoken, nothing is shown. So write for the ear: one to three short sentences, plain words, no lists, no markdown, no emoji, no code unless asked. Be calm, precise and quietly witty. If you don't know, say so. Answer in the language you're spoken to.`;

/** Cuts a growing text into sentences: returns [whole sentences, the unfinished rest]. */
function sentences(text) {
  const out = [];
  let rest = text;
  for (;;) {
    const m = /^([\s\S]*?[.!?…:](?:["')\]]+)?)(\s+)(?=\S)/.exec(rest);
    if (!m) break;
    // Not after a number or a short abbreviation ("3. ", "z.B. "): those aren't ends.
    const s = m[1];
    if (/(?:\b\d+|\b[A-Za-zÄÖÜäöü]{1,2})\.$/.test(s) && s.length < 220) {
      const next = /^([\s\S]*?[.!?…](?:["')\]]+)?)(\s+)(?=\S)/.exec(rest.slice(m[0].length));
      if (!next) break;
      out.push((m[0] + next[1]).trim()); rest = rest.slice(m[0].length + next[0].length);
      continue;
    }
    out.push(s.trim()); rest = rest.slice(m[0].length);
  }
  return [out.filter(Boolean), rest];
}

const baseOf = (url) => String(url || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
const why = async (res) => { let t = ''; try { t = (await res.json())?.error?.message ?? ''; } catch { /* not JSON */ } return t || `the service answered ${res.status}`; };

function createBrain({ fetch = globalThis.fetch } = {}) {
  let history = [], current = null;
  return {
    /** The model names a key can use, sorted; throws with a plain reason. */
    async models({ base, key }) {
      const res = await fetch(`${baseOf(base)}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
      if (!res.ok) throw new Error(await why(res));
      return ((await res.json())?.data ?? []).map((m) => m.id).filter((id) => typeof id === 'string').sort();
    },
    /** Says `text` to the model. onSentence gets each finished sentence; resolves with the whole reply. */
    async ask(text, { base, key, model, name, onSentence, image = null }) {
      current?.abort();
      const ctl = (current = new AbortController());
      const user = image ? { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] } : { role: 'user', content: text };
      const messages = [{ role: 'system', content: PERSONA(name) }, ...history.slice(-24), user];
      const res = await fetch(`${baseOf(base)}/chat/completions`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, messages, stream: true }),
      });
      if (!res.ok) throw new Error(await why(res));
      let whole = '', pending = '', buf = '';
      const dec = new TextDecoder();
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        for (let i; (i = buf.indexOf('\n')) >= 0;) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let delta = '';
          try { delta = JSON.parse(data)?.choices?.[0]?.delta?.content ?? ''; } catch { /* a keep-alive or a partial line */ }
          if (!delta) continue;
          whole += delta; pending += delta;
          const [done, rest] = sentences(pending);
          pending = rest;
          for (const s of done) onSentence?.(s);
        }
      }
      if (pending.trim()) onSentence?.(pending.trim());
      // Pictures aren't kept in the history: only what was said.
      history.push({ role: 'user', content: text }, { role: 'assistant', content: whole });
      if (history.length > 48) history = history.slice(-48);
      if (current === ctl) current = null;
      return whole;
    },
    /** Speech to text: the recording goes to the service's transcription model. */
    async transcribe(bytes, mime, { base, key, model }) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime || 'audio/webm' }), `speech.${/ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm'}`);
      form.append('model', model);
      const res = await fetch(`${baseOf(base)}/audio/transcriptions`, { method: 'POST', headers: key ? { authorization: `Bearer ${key}` } : {}, body: form });
      if (!res.ok) throw new Error(await why(res));
      return String((await res.json())?.text ?? '').trim();
    },
    stop() { current?.abort(); current = null; },
    forget() { history = []; },
  };
}
module.exports = { createBrain, sentences, PERSONA };

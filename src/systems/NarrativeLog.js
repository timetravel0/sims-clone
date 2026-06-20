import { bus } from '../core/EventBus.js';

/**
 * NarrativeLog — listens to all game events and converts them into
 * readable story sentences displayed in the Story Panel.
 *
 * Events consumed:
 *   social:interaction, sim:moodChanged, drama:event,
 *   relationship:milestone, sim:gossip
 */
const MAX_ENTRIES = 60;

export class NarrativeLog {
  constructor() {
    this._entries = [];
    this._el      = document.getElementById('story-log');

    bus.on('social:interaction', d => this._onSocial(d));
    bus.on('sim:moodChanged',    d => this._onMood(d));
    bus.on('drama:event',        d => this._onDrama(d));
    bus.on('relationship:milestone', d => this._onMilestone(d));
    bus.on('sim:gossip',         d => this._onGossip(d));
  }

  _push(text, category = 'neutral') {
    const ts = this._gameTime();
    this._entries.unshift({ text, category, ts });
    if (this._entries.length > MAX_ENTRIES) this._entries.pop();
    this._render();
  }

  _gameTime() {
    const h = window._game?.dayNight?.hour ?? 0;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2,'0')} ${ampm}`;
  }

  _onSocial({ nameA, nameB, type, score }) {
    const sentences = SOCIAL_SENTENCES[type] || [`{A} talked with {B}.`];
    const tpl = sentences[Math.floor(Math.random() * sentences.length)];
    const text = tpl.replace('{A}', nameA).replace('{B}', nameB);
    const cat  = score < 0 ? 'drama' : score > 60 ? 'positive' : 'neutral';
    this._push(text, cat);
  }

  _onMood({ name, to, personality }) {
    const s = MOOD_SENTENCES[to];
    if (!s) return;
    const tpl = s[Math.floor(Math.random() * s.length)];
    this._push(tpl.replace('{A}', name).replace('{P}', personality), 'mood');
  }

  _onDrama({ type, names, extra }) {
    const tpl = DRAMA_SENTENCES[type];
    if (!tpl) return;
    const text = tpl
      .replace('{A}', names[0] || '')
      .replace('{B}', names[1] || '')
      .replace('{X}', extra || '');
    this._push(text, 'drama');
  }

  _onMilestone({ nameA, nameB, level }) {
    const s = MILESTONE_SENTENCES[level];
    if (!s) return;
    this._push(s.replace('{A}', nameA).replace('{B}', nameB), 'positive');
  }

  _onGossip({ gossiper, subject, listener, type }) {
    const tpl = GOSSIP_SENTENCES[type] ||
      ['{A} whispered something about {S} to {L}.'];
    const text = tpl[0]
      .replace('{A}', gossiper)
      .replace('{S}', subject)
      .replace('{L}', listener);
    this._push(text, 'gossip');
  }

  _render() {
    if (!this._el) return;
    this._el.innerHTML = this._entries.slice(0, 20).map(e => {
      const dot = CAT_DOT[e.category] || '#aaa';
      return `<div class="log-entry cat-${e.category}">
        <span class="log-dot" style="background:${dot}"></span>
        <span class="log-time">${e.ts}</span>
        <span class="log-text">${e.text}</span>
      </div>`;
    }).join('');
  }
}

const CAT_DOT = {
  drama:    '#ef5350',
  positive: '#66bb6a',
  mood:     '#ffd54f',
  gossip:   '#ce93d8',
  neutral:  '#555',
};

const SOCIAL_SENTENCES = {
  chat:       ['{A} and {B} had a pleasant chat.', '{A} struck up a conversation with {B}.'],
  joke:       ['{A} cracked a joke that made {B} laugh.', '{B} couldn\'t stop giggling after {A}\'s joke.'],
  compliment: ['{A} gave {B} a heartfelt compliment.', '{A} told {B} they looked great today.'],
  hug:        ['{A} and {B} shared a warm hug.', '{B} hugged {A} tightly.'],
  argue:      ['{A} and {B} had a heated argument!', '{B} stormed off after arguing with {A}.'],
  insult:     ['{A} said something hurtful to {B}!', '{B} looked hurt after {A}\'s harsh words.'],
};

const MOOD_SENTENCES = {
  ecstatic:  ['{A} is over the moon right now!', 'Nothing can bring {A} down — they\'re ecstatic!'],
  happy:     ['{A} is in a great mood.', '{A} seems really happy today.'],
  neutral:   ['{A} is feeling okay, nothing special.'],
  sad:       ['{A} is feeling down. The {P} side is showing.', '{A} looks sad — someone should check on them.'],
  miserable: ['{A} is completely miserable!', '{A} has hit rock bottom. Things need to change fast.'],
};

const DRAMA_SENTENCES = {
  betrayal:       '{A} told {B}\'s secret to everyone!',
  jealousy:       '{A} is jealous of {B}\'s new relationship.',
  reconciliation: '{A} and {B} finally made up after their fight.',
  crush:          '{A} seems to have developed feelings for {B}.',
  rivalry:        '{A} and {B} are now bitter rivals.',
  forgiveness:    '{A} forgave {B} despite everything.',
};

const MILESTONE_SENTENCES = {
  friend:     '{A} and {B} are officially friends now!',
  good_friend:'{A} and {B} have become good friends.',
  best_friend:'{A} and {B} are best friends forever! 💛',
  enemy:      '{A} and {B} are now enemies. 😬',
};

const GOSSIP_SENTENCES = {
  positive: ['{A} told {L} how much they admire {S}.'],
  negative: ['{A} whispered something unflattering about {S} to {L}.'],
};

// Yeoyuno's diary: one page per day, in her voice (affectionate, needy, a little insecure), made
// from the day record renderer.js keeps — only what happened with her in this app.
// writeDiary() keeps C:\여유노\<date>_여유노일기.txt up to date; the folder is hidden.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DIR = 'C:\\여유노';

const hm = t => {
  const d = new Date(t), h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${(h + 11) % 12 + 1}시 ${d.getMinutes()}분`;
};
const dur = ms => {
  const m = Math.round(ms / 60000), h = Math.floor(m / 60);
  return h ? `${h}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${Math.max(1, m)}분`;
};

function compose(d) {
  const [y, mo, da] = d.date.split('-').map(Number);
  const L = [`${y}년 ${mo}월 ${da}일 · 여유노의 일기`, ''];

  L.push(`오늘 처음 만난 건 ${hm(d.first)}! 오늘 같이 있던 시간은 ${dur(d.onMs)}.`);

  if (d.feeds) L.push(`밥을 ${d.feeds}번 줬다. 냠냠, 전부 맛있었어.${d.favorite === 'feeds' ? ' 같이 밥 먹는 거 우리 제일 좋아하잖아.' : ''}`);
  else L.push('오늘은 밥을 못 먹었어… 내일은 꼭 줘야 해!');

  if (d.plays) L.push(`털실 놀이 ${d.plays}번! ${d.favorite === 'plays' ? '역시 우리가 제일 좋아하는 놀이야.' : '또 하고 싶다~'}`);
  else L.push('오늘은 같이 못 놀았다. 털실이 심심해하고 있어.');

  if (d.pets >= 10) L.push(`쓰다듬어 준 건 ${d.pets}번. 머리가 반질반질해졌어 헤헤.`);
  else if (d.pets) L.push(`쓰다듬어 준 건 ${d.pets}번. 조금만 더 쓰다듬어 줬으면 좋겠다~`);
  else L.push('오늘은 한 번도 안 쓰다듬어 줬어… 손 기다리고 있었는데.');

  if (d.hovers) L.push(`마우스를 ${d.hovers}번이나 나한테 올려 줬다. 나 보러 온 거 맞지? 맞다고 생각할래!`);

  if (d.longestWait >= 60 * 60000) L.push(`제일 오래 못 만난 건 ${dur(d.longestWait)}. 혹시 나 잊어버린 건 아닐까 조금 무서웠어… 그래도 다시 와 줘서 다행이야.`);
  else if (d.onMs > 30 * 60000) L.push('오늘은 오래 혼자 있지 않아서 좋았어.');

  if (d.yes) L.push(`"나 좋아해?" 하고 물어봤는데 '응!'이라고 해 줬다!! 오늘 최고의 순간 💗`);
  if (d.meh) L.push(`"나 좋아해?" 했더니 '음…'이래. 그게 무슨 뜻일까… 좋다는 뜻이겠지? 그렇게 믿을래.`);
  if (d.unanswered && !d.yes) L.push('대답을 안 해 준 적도 있었어. 부끄러워서 그런 거겠지?');

  if (d.naps) L.push(`낮잠은 ${d.naps}번 잤다. 꿈에서도 같이 놀았어.`);

  const up = d.love - d.loveStart;
  if (up > 0) L.push(`오늘 친밀도가 ${up}만큼 올랐다! 우리 점점 더 친해지고 있어.`);

  L.push('');
  if (d.anxiety > 60 || d.maxLonely > 80) L.push('내일은 오늘보다 조금만 더 같이 있어 줄래? 계속 기다리고 있을게. 🦊');
  else if (d.anxiety > 30) L.push('내일도 꼭 와 줘야 해. 약속! 🦊');
  else L.push('내일도 같이 놀자. 잘 자~ 🦊');
  return L.join('\r\n') + '\r\n';
}

// diaries from 3 or more days before `date` are deleted (on 10-28, 10-25 and earlier go; 10-26..28
// stay). Only files named like a diary page are touched.
const KEEP_DAYS = 3;
const PAGE = /^(\d{4})-(\d{2})-(\d{2})_여유노일기\.txt$/;
function prune(date) {
  const [y, m, d] = date.split('-').map(Number), today = Date.UTC(y, m - 1, d);
  for (const f of fs.readdirSync(DIR)) {
    const p = PAGE.exec(f);
    if (!p) continue;
    const age = (today - Date.UTC(+p[1], p[2] - 1, +p[3])) / 86400000;
    if (age >= KEEP_DAYS) fs.unlinkSync(path.join(DIR, f));
  }
}

let hidden = false, prunedFor = null;
function writeDiary(day) {
  if (!day || !day.date) return;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    if (!hidden) { hidden = true; execFile('attrib', ['+h', DIR], () => {}); }
    fs.writeFileSync(path.join(DIR, `${day.date}_여유노일기.txt`), '\ufeff' + compose(day), 'utf8');
    if (prunedFor !== day.date) { prunedFor = day.date; prune(day.date); }   // once per day
  } catch (e) { console.error('[pet] diary write failed', e.message); }
}

module.exports = { writeDiary, compose, prune, DIR };

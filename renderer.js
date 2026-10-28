// The pet: animation, wandering along the taskbar, drag & drop, and the raising stats
// (포만감 / 기분 / 친밀도 level). The window is WIN_W x WIN_H and moves with the pet; the sprite is
// drawn bottom-centre, so the pet's feet sit on the taskbar.

const SPRITE = 260, HEAD_TOP = 20;       // sprite canvas px; ear tips y inside it (see pet_sprite.js)
const HIT_ALPHA = 110;                   // sprite alpha that counts as "on the pet" (shadow is below)
const PER_MIN = { food: 100 / (8 * 60), mood: 100 / (10 * 60) };   // decay: empty in ~8h / ~10h
const GRAVITY = 2600;                    // px/s², when dropped
const SPLAT_DROP = 220;                  // dropped from higher than this (px): she lands flat on her face
const SPLAT_MS = 3200;                   // how long she lies there
const LOVE_COOLDOWN = 1200;              // ms between affection points from petting
const LONELY_PER_MIN = 100 / 180;        // fully lonely after ~3 h without attention
const HOVER_COOLDOWN = 45000;            // ms between "came to see me?" reactions

const canvas = document.getElementById('pet'), ctx = canvas.getContext('2d', { willReadFrequently: true });
const $ = id => document.getElementById(id);
const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- saved state ----
let S = {
  food: 80, mood: 80, love: 0, scale: 0.8, statsAlways: false, x: null, y: null, saved: Date.now(),
  // Yeoyuno's feelings: love = affection (above); lonely rises without attention, anxiety when
  // lonely for long or when she isn't sure she is liked; likes = what you do together most
  lonely: 0, anxiety: 0, likes: { feeds: 0, plays: 0, pets: 0 }, day: null,
};
const save = () => { S.saved = Date.now(); S.x = winX; S.y = winY; window.pet.save(S); };

// ---- today's page of Yeoyuno's diary (things that happened with her in this app) ----
// The main process writes it to C:\여유노\<date>_여유노일기.txt.
const dateKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function today(t = Date.now()) {
  if (!S.day || S.day.date !== dateKey(t)) {
    if (S.day) window.pet.diary(S.day);
    S.day = {
      date: dateKey(t), first: t, onMs: 0, feeds: 0, plays: 0, pets: 0, hovers: 0, naps: 0,
      longestWait: 0, lastTouch: t, yes: 0, meh: 0, unanswered: 0, loveStart: S.love, love: S.love,
      maxLonely: S.lonely, anxiety: S.anxiety, favorite: null,
    };
  }
  return S.day;
}
const favorite = () => { const l = S.likes, k = Object.keys(l).sort((a, b) => l[b] - l[a])[0]; return l[k] > 0 ? k : null; };
// a pet / feed / play: she feels less lonely and less anxious
function attention(kind) {
  const t = Date.now(), d = today(t);
  d.longestWait = Math.max(d.longestWait, t - d.lastTouch);
  d.lastTouch = t; d[kind]++; S.likes[kind]++;
  S.lonely = clamp(S.lonely - (kind === 'pets' ? 30 : 60), 0, 100);
  S.anxiety = clamp(S.anxiety - 12, 0, 100);
  window.pet.diary(d);
}

// affection level: Lv n needs 5·n·(n-1) points (0, 10, 30, 60, 100, ...)
const levelOf = love => { let n = 1; while (5 * (n + 1) * n <= love) n++; return n; };

// ---- runtime ----
let sprites = null, areas = [];           // work area of every monitor, primary first
let mode = 'idle', modeUntil = 0, dir = 0, targetX = 0, walkLo = 0, walkHi = 0;
let anim = 'idle', frame = 0, frameClock = 0;
let winX = 0, winY = 0, vy = 0, hopStart = 0, hopOff = 0;
let fallTo = 0, jumpFrom = 0, jumpTo = 0, jumpStart = 0, splatNext = false;
let resume = false;                       // carry on walking after stepping down / up onto another monitor
let through = true, hoverUntil = 0, lastLove = 0, nextChat = 0, nextZzz = 0;
let press = null;                         // { sx, sy, ox, oy, dragging }

const JUMP_MS = 450;                      // hop up onto a monitor whose taskbar sits higher

const size = () => SPRITE * S.scale;
const centre = () => winX + W / 2;        // the pet's screen x (the sprite is centred in the window)
const groundOf = a => a.y + a.height - H; // window y that puts the feet on that monitor's taskbar

function nearestArea(x, y) {
  const d = a => Math.hypot(Math.max(a.x - x, 0, x - a.x - a.width), Math.max(a.y - y, 0, y - a.y - a.height));
  return areas.reduce((b, a) => (d(a) < d(b) ? a : b));
}
// the monitor whose taskbar the pet stands on or falls onto: under its centre, the first floor at or
// below window y (or the highest one when all are above, i.e. it has to hop up)
function floorAt(x, y) {
  const under = areas.filter(a => x >= a.x && x < a.x + a.width);
  if (!under.length) return nearestArea(x, y);
  const below = under.filter(a => groundOf(a) >= y - 1).sort((a, b) => groundOf(a) - groundOf(b));
  return below[0] || under.sort((a, b) => groundOf(b) - groundOf(a))[0];
}
// window x range reachable on foot from monitor `a`: it plus side-by-side neighbours that overlap it
// vertically, chained
function walkRange(a) {
  let lo = a.x, hi = a.x + a.width, grew = true;
  const beside = b => b.y < a.y + a.height && a.y < b.y + b.height;
  while (grew) {
    grew = false;
    for (const b of areas) {
      if (!beside(b)) continue;
      if (b.x < lo && Math.abs(b.x + b.width - lo) <= 2) { lo = b.x; grew = true; }
      if (b.x + b.width > hi && Math.abs(b.x - hi) <= 2) { hi = b.x + b.width; grew = true; }
    }
  }
  return [lo, hi - W];
}
// settle on whatever floor is under the pet (after a drop, or when monitors change)
function landOn(y) {
  const f = floorAt(centre(), y), [lo, hi] = walkRange(f);
  winX = clamp(winX, lo, hi);
  return groundOf(floorAt(centre(), y));
}
function resumeWalk() {
  resume = false;
  setMode('walk');
  setAnim(dir < 0 ? 'walk_left' : 'walk_right');
}

function setMode(m, ms = 0) {
  mode = m; modeUntil = performance.now() + ms;
  if (m === 'sleep') setAnim('sleep');
  else if (m === 'eat') setAnim('eat');
  else if (m === 'play') setAnim('play');
  else if (m === 'splat') setAnim('splat');
  else if (m === 'idle' || m === 'drag' || m === 'fall' || m === 'hop') setAnim('idle');
}
// head top inside the window: standing art has it at HEAD_TOP; the lying sleep art says where its is
function headPos() {
  const s = size(), a = sprites && sprites[anim];
  if (a && a.headY != null) return { x: W / 2 - s / 2 + a.headX * s, y: H - s + a.headY * s };
  return { x: W / 2, y: H - s + HEAD_TOP * S.scale };
}
function setAnim(a) {
  if (anim !== a) { anim = a; frame = 0; frameClock = 0; }
}

// ---- speech bubble & effects ----
let bubbleTimer = 0;
function say(text, ms = 2600) {
  const b = $('bubble');
  b.textContent = text;
  b.classList.remove('hidden');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.add('hidden'), ms);
}
function effect(text, cls = '') {
  const e = document.createElement('div');
  e.className = 'fx ' + cls;
  e.textContent = text;
  const head = headPos();
  e.style.left = (head.x + rand(-25, 25) * S.scale) + 'px';
  e.style.top = (head.y + hopOff + rand(10, 40) * S.scale) + 'px';
  e.style.setProperty('--dx', rand(-18, 18) + 'px');
  $('fx').appendChild(e);
  setTimeout(() => e.remove(), cls === 'zzz' ? 2300 : 1200);
}

// ---- stats ----
function addLove(n) {
  const before = levelOf(S.love);
  S.love += n;
  const after = levelOf(S.love);
  if (after > before) {
    say(`더 친해졌다! Lv.${after} 💕`, 3500);
    for (let i = 0; i < 5; i++) setTimeout(() => effect('💗'), i * 120);
  }
}
function decay(minutes, asleep) {
  const hungry = S.food < 25 ? 2 : 1;
  S.food = clamp(S.food - PER_MIN.food * minutes * (asleep ? 0.5 : 1), 0, 100);
  S.mood = clamp(S.mood + (asleep ? 0.6 * minutes : -PER_MIN.mood * minutes * hungry), 0, 100);
  // lonely after ~3 h without attention; anxious when lonely for long, calmer otherwise
  S.lonely = clamp(S.lonely + LONELY_PER_MIN * minutes * (asleep ? 0.3 : 1), 0, 100);
  S.anxiety = clamp(S.anxiety + (S.lonely > 60 ? 0.35 * (S.lonely - 60) / 40 : -0.15) * minutes, 0, 100);
}
function renderStats(now) {
  const lv = levelOf(S.love), lo = 5 * lv * (lv - 1), hi = 5 * (lv + 1) * lv;
  $('lv').textContent = lv;
  $('xp').style.width = (100 * (S.love - lo) / (hi - lo)) + '%';
  $('food').style.width = S.food + '%';
  $('mood').style.width = S.mood + '%';
  $('stats').classList.toggle('hidden', !(S.statsAlways || now < hoverUntil || mode === 'drag'));
}

// ---- behaviour ----
function chooseNext() {
  const walkChance = S.food < 15 ? 0.25 : 0.55;
  const r = Math.random();
  if (r < 0.1 && S.mood > 20) { say('졸려… 잠깐 잘게'); today().naps++; setMode('sleep', rand(25000, 50000)); return; }
  if (r < 0.1 + walkChance) {
    const [lo, hi] = walkRange(floorAt(centre(), winY));
    walkLo = lo; walkHi = hi;
    let t = rand(lo, hi);
    if (Math.abs(t - winX) < 120) t = winX + (t < winX ? -160 : 160);
    targetX = clamp(t, lo, hi);
    if (Math.abs(targetX - winX) < 40) { setMode('idle', rand(3000, 8000)); return; }
    dir = targetX < winX ? -1 : 1;
    setMode('walk');
    setAnim(dir < 0 ? 'walk_left' : 'walk_right');
    return;
  }
  setMode('idle', rand(3000, 9000));
}

// what she says on her own depends on how she feels: anxiety > loneliness > hunger > mood > the
// thing you do together most > small talk; now and then she asks whether you like her
const FAV_LINE = {
  feeds: ['또 같이 밥 먹고 싶다~ 우리 그거 제일 많이 했잖아', '오늘도 맛있는 거 줄 거지?'],
  plays: ['털실 놀이 또 하자! 우리 그거 제일 좋아하잖아', '털실 어디 있지~? 🧶'],
  pets: ['쓰다듬어 줄 거지? 그거 제일 좋아 헤헤', '머리 쓰다듬어 줘~'],
};
function chatter() {
  if (!asking && levelOf(S.love) >= 2 && Math.random() < (S.anxiety > 50 ? 0.4 : 0.15)) return ask();
  if (S.anxiety > 60) return say(pick(['혹시… 나 싫어졌어?', '요즘 덜 놀아 주는 것 같아…', '나 여기 있어… 봐 줄래?']));
  if (S.lonely > 50) return say(pick(['놀아 줘~ 놀아 줘~', '심심해… 같이 있자!', '나랑 놀아 줄 거지?']));
  if (S.food < 30) return say(pick(['배고파… 🍖', '밥 줘~', '꼬르륵…']));
  if (S.mood < 30) return say(pick(['심심해…', '놀아 줘!', '나랑 놀자~']));
  const fav = favorite();
  if (fav && Math.random() < 0.3) return say(pick(FAV_LINE[fav]));
  say(pick(['♪~', '오늘도 좋은 하루!', '뭐 해?', '헤헤', '쓰다듬어 줘~', '같이 있어서 좋아']));
}

// ---- "나 좋아해?": a question with two answers in the bubble ----
let asking = false, askTimer = 0;
function ask() {
  asking = true;
  say('나 좋아해…?', 12000);
  $('ask').classList.remove('hidden');
  clearTimeout(askTimer);
  askTimer = setTimeout(() => answer(null), 12000);
}
function answer(a) {
  if (!asking) return;
  asking = false;
  clearTimeout(askTimer);
  $('ask').classList.add('hidden');
  const d = today();
  if (a === 'yes') {
    d.yes++;
    S.anxiety = clamp(S.anxiety - 30, 0, 100); S.mood = clamp(S.mood + 8, 0, 100); addLove(1);
    say(pick(['헤헤… 나도! 💗', '진짜지? 약속이야!', '알고 있었어~ 💗']), 3000);
    for (let i = 0; i < 3; i++) setTimeout(() => effect('💗'), i * 150);
  } else if (a === 'meh') {
    d.meh++;
    S.anxiety = clamp(S.anxiety + 15, 0, 100); S.mood = clamp(S.mood - 5, 0, 100);
    say(S.anxiety > 60 ? '그, 그래도 나는 좋아해…' : '흥… 그래도 좋다는 뜻이지? 그렇게 생각할래!', 3500);
  } else {
    d.unanswered++;
    S.anxiety = clamp(S.anxiety + 5, 0, 100);
    say('대답 안 해 주는 거야…? 부끄러워서 그런 거지?', 3000);
  }
  window.pet.diary(d);
  save();
}
document.querySelectorAll('#ask button').forEach(b => b.addEventListener('click', () => answer(b.dataset.a)));

// ---- hovering over her: she takes it as coming to see her ----
let wasOver = false, lastHoverTalk = 0;
function hovered(over) {
  const now = performance.now();
  if (over && !wasOver && mode !== 'sleep' && now - lastHoverTalk > HOVER_COOLDOWN) {
    lastHoverTalk = now;
    today().hovers++;
    if (!asking && Math.random() < 0.5) say(pick(['나 보러 온 거지?', '헤헤, 왔다!', '눈 마주쳤다~', '불렀어?']), 2000);
  }
  wasOver = over;
}

// ---- actions (menu / tray / clicks) ----
function wakeIfAsleep() {
  if (mode !== 'sleep') return false;
  S.mood = clamp(S.mood - 3, 0, 100);
  say('음냐… 깼어');
  setMode('idle', 4000);
  return true;
}
function petIt(now) {
  if (wakeIfAsleep()) return;
  if (mode === 'splat') {                 // comforted: gets up right away
    say(pick(['호~ 해 줘서 고마워…', '헤헤… 이제 괜찮아!']), 2200);
    S.mood = clamp(S.mood + 6, 0, 100);
    setMode('idle', 3000);
  }
  attention('pets');
  S.mood = clamp(S.mood + 4, 0, 100);
  if (now - lastLove > LOVE_COOLDOWN) { lastLove = now; addLove(1); }
  effect('♥');
  if (Math.random() < 0.6) say(pick(['헤헤', '기분 좋아~', '♥', '더 해 줘!', '간지러워!']), 1800);
  if (mode === 'walk') setMode('idle', 3000);
}
const actions = {
  feed() {
    if (mode === 'sleep') return say('Zzz… (자는 중이야)');
    if (mode === 'eat') return say('냠냠… 먹는 중이야');
    if (S.food >= 95) return say('배불러… 더는 못 먹어');
    S.food = clamp(S.food + 30, 0, 100);
    S.mood = clamp(S.mood + 6, 0, 100);
    addLove(2);
    attention('feeds');
    say(pick(['와 밥이다!', '잘 먹겠습니다~', '고마워~']));
    // sit down at the table for two rounds of the eating loop, then get up
    setMode('eat', 2 * sprites.eat.frames * sprites.eat.delay);
  },
  play() {
    if (mode === 'sleep') return say('Zzz… (자는 중이야)');
    if (mode === 'eat') return say('밥 다 먹고 놀자!');
    if (mode === 'play') return say('지금 노는 중이야~ 🧶');
    if (S.food < 10) return say('배고파서 힘이 없어…');
    S.mood = clamp(S.mood + 18, 0, 100);
    S.food = clamp(S.food - 6, 0, 100);
    addLove(3);
    attention('plays');
    say(pick(['털실이다!', '신난다!', '야호~ 🧶']));
    // chase the yarn ball for three rounds of the loop
    setMode('play', 3 * sprites.play.frames * sprites.play.delay);
  },
  sleep() {
    if (mode === 'sleep') return say('이미 자는 중… Zzz');
    if (mode === 'eat') return say('밥 먹고 잘게~');
    say('잘 자~');
    today().naps++;
    setMode('sleep', rand(40000, 70000));
  },
  'toggle-stats'() { S.statsAlways = !S.statsAlways; },
};
window.pet.onAction(a => {
  if (a.startsWith('scale:')) S.scale = Number(a.slice(6));
  else if (actions[a]) actions[a]();
  save();
});

// ---- mouse: click-through except on the pet itself ----
function onPet(x, y) {
  if (asking) { const el = document.elementFromPoint(x, y); if (el && el.closest('#ask')) return true; }   // answer buttons
  const d = ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data;
  return d[3] > HIT_ALPHA;
}
function setThrough(on) {
  if (through !== on) { through = on; window.pet.mouseThrough(on); }
}
// hover: while click-through, Electron forwards only mouse events (not pointer events)
addEventListener('mousemove', e => {
  if (press) return;
  const over = onPet(e.clientX, e.clientY);
  setThrough(!over);
  if (over) hoverUntil = performance.now() + 1500;
  hovered(over);
});
// the pet also moves under a resting cursor (no mouse events then), so poll the cursor as well
setInterval(async () => {
  if (press || !sprites) return;
  const c = await window.pet.cursor();
  const x = c.x - winX, y = c.y - winY;
  const over = x >= 0 && y >= 0 && x < W && y < H && onPet(x, y);
  setThrough(!over);
  if (over) hoverUntil = performance.now() + 1500;
  hovered(over);
}, 100);
document.addEventListener('mouseleave', () => { if (!press) setThrough(true); });
addEventListener('pointermove', e => {
  if (!press) return;
  if (!press.dragging && Math.hypot(e.screenX - press.sx, e.screenY - press.sy) > 5) {
    press.dragging = true;
    setMode('drag');
    say(pick(['으앗!', '어디 가?', '높다~']), 1500);
  }
  if (press.dragging) {
    winX = e.screenX - press.ox; winY = e.screenY - press.oy;
    window.pet.move(winX, winY);
  }
});
addEventListener('pointerdown', e => {
  if (e.button !== 0 || !onPet(e.clientX, e.clientY)) return;
  document.body.setPointerCapture(e.pointerId);
  press = { sx: e.screenX, sy: e.screenY, ox: e.screenX - winX, oy: e.screenY - winY, dragging: false };
});
addEventListener('pointerup', e => {
  if (!press) return;
  const p = press; press = null;
  if (p.dragging) {
    // drop onto the taskbar of whichever monitor it is over (straight down)
    fallTo = landOn(winY);
    splatNext = fallTo - winY > SPLAT_DROP;
    vy = 0; resume = false;
    if (winY >= fallTo) { winY = fallTo; window.pet.move(winX, winY); setMode('idle', 3000); }
    else setMode('fall');
  } else petIt(performance.now());
  save();
});
addEventListener('contextmenu', e => {
  e.preventDefault();
  if (onPet(e.clientX, e.clientY)) window.pet.menu({ scale: S.scale, statsAlways: S.statsAlways });
});

// ---- main loop ----
let last = performance.now(), lastSave = last, lastDiary = last;
function tick(now) {
  const dt = Math.min(100, now - last); last = now;
  decay(dt / 60000, mode === 'sleep');

  // mode logic
  if (mode === 'idle' && now > modeUntil) chooseNext();
  if (mode === 'splat' && now > modeUntil) {
    say(pick(['다음엔 살살 내려 줘…', '괜찮아…! 안 울어', '머리 쿵 했어… 💦']), 2600);
    setMode('idle', 3000);
  }
  if (mode === 'play') {
    if (now > modeUntil) { say(pick(['재밌었다!', '헥헥… 또 놀자!', '최고야~'])); effect('💗'); setMode('idle', 4000); }
    else if (now > nextZzz) { nextZzz = now + 1100; effect(pick(['✨', '♪', '💗'])); }   // (shares the effect timer)
  }
  if (mode === 'eat') {
    if (now > modeUntil) { say(pick(['잘 먹었습니다! 😋', '배불러~', '맛있었어!'])); effect('😋'); setMode('idle', 4000); }
    else if (now > nextZzz) { nextZzz = now + 1400; effect('🍚'); }   // (shares the effect timer with Zzz)
  }
  if (mode === 'sleep') {
    if (now > modeUntil) { say('잘 잤다~ 🌞'); setMode('idle', 4000); }
    else if (now > nextZzz) { nextZzz = now + 1600; effect('z', 'zzz'); }
  }
  if (mode === 'fall') {
    vy += GRAVITY * dt / 1000;
    winY += vy * dt / 1000;
    if (winY >= fallTo) {
      winY = fallTo;
      if (resume) resumeWalk();
      else if (splatNext) {                 // dropped from high up: flat on her face for a bit
        splatNext = false;
        S.mood = clamp(S.mood - 6, 0, 100);
        S.anxiety = clamp(S.anxiety + 4, 0, 100);
        say(pick(['아야…', '으앙… 아파', '철퍼덕…']), 2200);
        setMode('splat', SPLAT_MS);
      } else { say('휴~', 1500); setMode('idle', 3000); }
    }
    window.pet.move(winX, winY);
  }
  if (mode === 'jump') {
    const t = Math.min(1, (now - jumpStart) / JUMP_MS);
    winY = jumpFrom + (jumpTo - jumpFrom) * t - Math.sin(Math.PI * t) * 60 * S.scale;
    if (t >= 1) { winY = jumpTo; resumeWalk(); }
    window.pet.move(winX, winY);
  }
  hopOff = 0;
  if (mode === 'hop') {
    const t = now - hopStart;
    hopOff = -Math.abs(Math.sin(Math.PI * t / 450)) * 34 * S.scale;
    if (now > modeUntil) setMode('idle', 3000);
  }
  if ((mode === 'idle' || mode === 'walk') && now > nextChat) {
    if (nextChat) chatter();
    nextChat = now + rand(40000, 90000) * (1 - 0.6 * Math.max(S.lonely, S.anxiety) / 100);   // talks more when lonely
  }

  // animation frames; walking moves the window one stride step per frame so the feet stay planted
  const a = sprites[anim];
  {
    frameClock += dt;
    while (frameClock >= a.delay) {
      frameClock -= a.delay;
      frame = a.once ? Math.min(frame + 1, a.frames - 1) : (frame + 1) % a.frames;   // (once: hold the end)
      if (mode === 'walk') {
        winX += a.speed * S.scale;
        if ((dir < 0 && winX <= targetX) || (dir > 0 && winX >= targetX) || winX < walkLo || winX > walkHi) {
          winX = clamp(winX, walkLo, walkHi);
          setMode('idle', rand(3000, 9000));
        } else {
          // crossed onto a monitor whose taskbar is lower (step down) or higher (hop up)
          const g = groundOf(floorAt(centre(), winY));
          if (g > winY + 1) { fallTo = g; vy = 0; resume = true; setMode('fall'); }
          else if (g < winY - 1) { jumpFrom = winY; jumpTo = g; jumpStart = now; resume = true; setMode('jump'); }
        }
        window.pet.move(winX, winY);
      }
    }
  }
  const img = sprites[anim].img[frame];

  // draw
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  const s = size();
  ctx.drawImage(img, W / 2 - s / 2, H - s + hopOff, s, s);
  $('ui').style.bottom = (H - headPos().y - hopOff + 2) + 'px';
  renderStats(now);

  {   // today's page: time together, the longest wait, how she felt
    const t = Date.now(), d = today(t);
    d.onMs += dt; d.love = S.love; d.anxiety = S.anxiety; d.favorite = favorite();
    d.longestWait = Math.max(d.longestWait, t - d.lastTouch);
    d.maxLonely = Math.max(d.maxLonely, S.lonely);
  }
  if (now - lastSave > 10000) { lastSave = now; save(); }
  if (now - lastDiary > 60000) { lastDiary = now; window.pet.diary(S.day); }
  requestAnimationFrame(tick);
}

// ---- start ----
(async () => {
  const raw = await window.pet.loadSprites();
  sprites = {};
  for (const [name, meta] of Object.entries(raw)) {
    meta.img = await Promise.all(meta.png.map(b => createImageBitmap(new Blob([b], { type: 'image/png' }))));
    delete meta.png;
    sprites[name] = meta;
  }
  areas = await window.pet.workAreas();
  // monitors added / removed / rearranged: settle onto whatever floor is now under the pet
  window.pet.onWorkAreas(next => {
    areas = next;
    if (press) return;
    winY = landOn(winY);
    resume = false;
    if (mode === 'walk' || mode === 'fall' || mode === 'jump') setMode('idle', 3000);
    window.pet.move(winX, winY);
  });

  const saved = await window.pet.load();
  let away = 0;
  if (saved) {
    S = { ...S, ...saved };
    away = Math.min(24 * 60, (Date.now() - saved.saved) / 60000);
    decay(away, false);
  }
  // back where it was (on whichever monitor that was), else the middle of the primary monitor
  const home = areas[0];
  if (S.x != null) { winX = S.x; winY = landOn(S.y != null ? S.y : groundOf(home)); }
  else { winX = home.x + home.width / 2 - W / 2; winY = groundOf(home); }
  window.pet.move(winX, winY);

  if (!saved) say('안녕! 잘 부탁해 🦊', 3500);
  else if (away > 30) say(S.food < 30 ? '보고 싶었어… 배고파 🍖' : '다시 왔구나! 보고 싶었어', 3500);
  else say('안녕!', 2000);
  setMode('idle', 4000);
  S.likes = { feeds: 0, plays: 0, pets: 0, ...S.likes };   // (older saves have none)
  window.pet.diary(today());
  requestAnimationFrame(t => { last = t; lastSave = t; lastDiary = t; tick(t); });
})();

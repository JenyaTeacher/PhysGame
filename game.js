const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 390, H = 844;
canvas.width = W; canvas.height = H;

// ═══════════════════════════════════════════════════
//  МАПИ ЗОБРАЖЕНЬ
//  Усі PNG мають чорний фон — використовуємо
//  globalCompositeOperation = 'screen' щоб прибрати чорний
// ═══════════════════════════════════════════════════
const IMAGE_PATHS = {
  player:   'olena.png',   // персонаж — вчителька

  // Платформи
  platform_desk:       'parta.png',
  platform_bookshelf:  'books.png',
  platform_windowsill: 'pc.png',
  platform_locker:     'parta.png',

  // Перешкоди
  obs_ball:     'aple.png',
  obs_paper:    'books.png',
  obs_eraser:   'marker.png',
  obs_backpack: 'beakpak.png',
  obs_ruler:    'rule.png',
  obs_chalk:    'marker.png',
  obs_globe:    'globus.png',
  obs_chair:    'parta.png',
};

const imgs = {};

function loadImages(map) {
  const keys = Object.keys(map);
  let loaded = 0;
  return new Promise(resolve => {
    if (!keys.length) { resolve(); return; }
    keys.forEach(key => {
      const img = new Image();
      img.src = map[key];
      img.onload  = () => { imgs[key] = img; if (++loaded === keys.length) resolve(); };
      img.onerror = () => { imgs[key] = null;  if (++loaded === keys.length) resolve(); };
    });
  });
}

// Малює зображення з видаленням чорного фону через 'screen'
function drawImgScreen(key, x, y, w, h, alpha = 1) {
  if (!imgs[key]) return false;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(imgs[key], x, y, w, h);
  ctx.restore();
  return true;
}

// ─── Стан ──────────────────────────────────────────
let state = 'idle';
let score = 0, best = 0, frameId, t = 0;

const GRAVITY = 0.38;
const PLAT_SPEED_BASE = 2.5;
const PLAT_H = 16;
let speed = PLAT_SPEED_BASE;

// ─── Частинки (неон-ефект) ─────────────────────────
const particles = [];
function spawnParticle(x, y, color) {
  for (let i = 0; i < 3; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      life: 1,
      color,
      size: Math.random() * 3 + 1,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= 0.04;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life * 0.8;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── Player ────────────────────────────────────────
const player = {
  x: 70, y: 0, w: 50, h: 80,
  vy: 0, gravDir: 1, onGround: false, legPhase: 0,
  trail: [],

  reset() {
    this.y = H - PLAT_H - this.h;
    this.vy = 0; this.gravDir = 1;
    this.onGround = false; this.legPhase = 0;
    this.trail = [];
  },

  flip() {
    this.gravDir *= -1;
    this.vy = 0;
    this.onGround = false;
    spawnParticle(this.x + this.w/2, this.y + this.h/2, '#00f0ff');
  },

  update() {
    // Trail
    this.trail.unshift({ x: this.x + this.w/2, y: this.y + this.h/2 });
    if (this.trail.length > 8) this.trail.pop();

    this.vy += GRAVITY * this.gravDir;
    this.y += this.vy;
    this.onGround = false;

    if (this.gravDir === 1 && this.y + this.h >= H) {
      this.y = H - this.h; this.vy = 0; this.onGround = true;
    } else if (this.gravDir === -1 && this.y <= 0) {
      this.y = 0; this.vy = 0; this.onGround = true;
    }

    if (this.onGround) {
      this.legPhase += 0.2;
      if (t % 4 === 0) spawnParticle(
        this.x + rand(0, this.w),
        this.gravDir === 1 ? this.y + this.h : this.y,
        '#00f0ff'
      );
    } else {
      this.legPhase = 0;
    }
  },

  draw() {
    // Неоновий трейл
    this.trail.forEach((p, i) => {
      const alpha = (1 - i / this.trail.length) * 0.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      const s = (1 - i / this.trail.length) * 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.translate(this.x + this.w/2, this.y + this.h/2);
    ctx.scale(1, this.gravDir);

    // [ЗМІНЕНО] Повністю прибрано підсвітку/тінь персонажа
    if (imgs['player']) {
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(imgs['player'], -this.w/2, -this.h/2, this.w, this.h);
    } else {
      // Fallback якщо немає картинки
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
    }

    ctx.restore();
  }
};

// ─── Фон (неоновий клас) ───────────────────────────
// Зірки для фону
const stars = Array.from({length: 60}, () => ({
  x: rand(0, W), y: rand(0, H),
  r: Math.random() * 1.2 + 0.3,
  speed: Math.random() * 0.4 + 0.1,
  alpha: Math.random() * 0.6 + 0.2,
}));

function drawBg() {
  // Темний фон
  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, W, H);

  // Зірки
  stars.forEach(s => {
    s.x -= s.speed * (speed / PLAT_SPEED_BASE);
    if (s.x < 0) { s.x = W; s.y = rand(0, H); }
    ctx.save();
    ctx.globalAlpha = s.alpha * (0.5 + 0.5 * Math.sin(t * 0.03 + s.x));
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#aaddff';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Сітка (неоновий ефект перспективи)
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 0.5;
  // вертикальні лінії
  for (let x = (t * speed * 0.5) % 40; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  // горизонтальні лінії
  for (let y = (t * speed * 0.3) % 60; y < H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();

  // Неонова смуга підлоги
  drawNeonLine(0, H - 28, W, H - 28, '#00f0ff', 2);
  ctx.fillStyle = 'rgba(0,240,255,0.04)';
  ctx.fillRect(0, H - 28, W, 28);

  // Неонова смуга стелі
  drawNeonLine(0, 28, W, 28, '#ff00aa', 2);
  ctx.fillStyle = 'rgba(255,0,170,0.04)';
  ctx.fillRect(0, 0, W, 28);
}

function drawNeonLine(x1, y1, x2, y2, color, width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ─── Платформи ─────────────────────────────────────
let platforms = [];
const PLAT_TYPES = ['desk', 'bookshelf', 'windowsill', 'locker'];
const PLAT_COLORS = {
  desk: '#00f0ff', bookshelf: '#ff00aa',
  windowsill: '#aaff00', locker: '#ff6600',
};

function makePlatform(x) {
  const type = PLAT_TYPES[Math.floor(Math.random() * PLAT_TYPES.length)];
  const w = rand(70, 140);
  const zones = [rand(H*0.12, H*0.28), rand(H*0.38, H*0.52), rand(H*0.62, H*0.76)];
  const y = zones[Math.floor(Math.random() * zones.length)];
  return { x, y, w, h: PLAT_H, type };
}

function initPlatforms() {
  platforms = [];
  platforms.push({ x: 0, y: H - PLAT_H, w: W, h: PLAT_H, type: 'desk' });
  let nx = W + 80;
  while (nx < W * 2.5) {
    platforms.push(makePlatform(nx));
    nx += rand(200, 320);
  }
}

function updatePlatforms() {
  platforms.forEach(p => p.x -= speed);
  platforms = platforms.filter(p => p.x + p.w > -10);
  const lastX = Math.max(...platforms.map(p => p.x + p.w));
  if (lastX < W + 200) platforms.push(makePlatform(lastX + rand(200, 320)));
}

function drawPlatforms() {
  platforms.forEach(p => {
    if (p.type === 'floor') return;
    const color = PLAT_COLORS[p.type] || '#00f0ff';

    ctx.save();

    // ── Блискавка ──────────────────────────────────
    const segments = Math.max(4, Math.floor(p.w / 18));
    const segW = p.w / segments;
    const amp = 7;

    // Тінь (широка, розмита)
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (let i = 0; i <= segments; i++) {
      const px = p.x + i * segW;
      const py = p.y + (i % 2 === 0 ? -amp : amp);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(p.x + p.w, p.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.globalAlpha = 0.35;
    ctx.stroke();

    // Середній шар
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (let i = 0; i <= segments; i++) {
      const px = p.x + i * segW;
      const py = p.y + (i % 2 === 0 ? -amp : amp);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(p.x + p.w, p.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 16;
    ctx.globalAlpha = 0.8;
    ctx.stroke();

    // Яскрава серцевина (біла)
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (let i = 0; i <= segments; i++) {
      const px = p.x + i * segW;
      const py = p.y + (i % 2 === 0 ? -amp : amp);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(p.x + p.w, p.y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.9;
    ctx.stroke();

    // ── Іскри на кінцях блискавки ──────────────────
    [p.x, p.x + p.w].forEach(ex => {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.15 + ex);
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ex, p.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ex, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Мерехтіння (анімований пульс) ──────────────
    const pulse = 0.04 + 0.03 * Math.sin(t * 0.12 + p.x);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (let i = 0; i <= segments; i++) {
      const px = p.x + i * segW;
      const py = p.y + (i % 2 === 0 ? -amp : amp);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(p.x + p.w, p.y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 40;
    ctx.globalAlpha = pulse;
    ctx.stroke();

    ctx.restore();
  });
}

// ─── Перешкоди ─────────────────────────────────────
let obstacles = [];
let obstacleTick = 0;

function spawnInterval() {
  return Math.max(45, 120 - Math.floor(score / 150));
}

const OBS_TYPES = ['ball','paper','eraser','backpack','ruler','chalk','globe','chair'];
const OBS_COLORS = {
  ball:'#ff3366', paper:'#ffff00', eraser:'#ff00aa',
  backpack:'#00f0ff', ruler:'#aaff00', chalk:'#ffffff',
  globe:'#00aaff', chair:'#ff6600',
};

const OBS_SIZES = {
  ball:70, paper:65, eraser:60, backpack:80,
  ruler:70, chalk:65, globe:80, chair:90,
};

function spawnObstacle() {
  const type = OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
  const difficulty = 1 + score / 1200;
  const horizontal = type === 'chalk' || type === 'globe' || type === 'chair';
  const size = (OBS_SIZES[type] || 70) * (0.85 + Math.random() * 0.3);

  if (horizontal) {
    const fromTop = Math.random() > 0.5;
    return {
      x: W + 30, size, type, rot: 0,
      rotSpeed: (Math.random() - 0.5) * 0.12 * difficulty,
      y: fromTop ? rand(H*0.05, H*0.42) : rand(H*0.55, H*0.92),
      vy: 0,
      vx: -(speed + rand(2, 4.5) * difficulty),
      horizontal: true,
    };
  }
  const fromTop = Math.random() > 0.5;
  return {
    x: W + 20, size, type, rot: 0,
    rotSpeed: (Math.random() - 0.5) * 0.15 * difficulty,
    y: fromTop ? rand(40, H*0.35) : rand(H*0.6, H - 50),
    vy: (fromTop ? rand(1.5, 3.5) : rand(-3.5, -1.5)) * difficulty * 0.6,
    vx: -(speed + rand(1.5, 4) * difficulty),
    horizontal: false,
  };
}

function updateObstacles() {
  obstacleTick++;
  if (obstacleTick >= spawnInterval()) {
    const batch = score > 2500 ? 3 : score > 1000 ? 2 : 1;
    for (let i = 0; i < batch; i++) {
      const o = spawnObstacle();
      o.x += i * 70;
      obstacles.push(o);
    }
    obstacleTick = 0;
  }

  obstacles.forEach(o => {
    o.x += o.vx;
    o.rot += o.rotSpeed;
    if (!o.horizontal) {
      o.y += o.vy;
      if (o.y < 20 || o.y > H - 20) o.vy *= -1;
    }
    // Частинки від перешкод
    if (t % 8 === 0) {
      spawnParticle(o.x, o.y, OBS_COLORS[o.type] || '#fff');
    }
  });

  obstacles = obstacles.filter(o => o.x + o.size > -20);
}

function drawObstacles() {
  obstacles.forEach(o => {
    const imgKey = 'obs_' + o.type;
    const color  = OBS_COLORS[o.type] || '#fff';

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);

    // Неоновий ореол під зображенням
    ctx.beginPath();
    ctx.arc(0, 0, o.size * 0.52, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Зображення через 'screen'
    if (imgs[imgKey]) {
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(imgs[imgKey], -o.size/2, -o.size/2, o.size, o.size);
    } else {
      // Fallback
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, o.size/2, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  });
}

// ─── Колізія ───────────────────────────────────────
function checkPlatformCollision() {
  for (const p of platforms) {
    const overlapX = player.x + player.w > p.x + 4 && player.x < p.x + p.w - 4;
    if (!overlapX) continue;
    const tol = Math.abs(player.vy) + 4;
    if (player.gravDir === 1) {
      const foot = player.y + player.h;
      if (player.vy >= 0 && foot >= p.y && foot <= p.y + p.h + tol) {
        player.y = p.y - player.h; player.vy = 0; player.onGround = true;
      }
    } else {
      const head = player.y;
      if (player.vy <= 0 && head <= p.y + p.h && head >= p.y - tol) {
        player.y = p.y + p.h; player.vy = 0; player.onGround = true;
      }
    }
  }
}

function checkObstacleCollision() {
  const cx = player.x + player.w/2, cy = player.y + player.h/2;
  for (const o of obstacles) {
    const dx = cx - o.x, dy = cy - o.y;
    if (o.type === 'chair') {
      if (Math.abs(dx) < o.size*0.55 && Math.abs(dy) < o.size*0.55) return true;
    } else {
      if (Math.sqrt(dx*dx + dy*dy) < o.size/2 + 6) return true;
    }
  }
  return false;
}

// ─── HUD ───────────────────────────────────────────
function drawHUD() {
  const lvl = Math.floor(score / 300) + 1;

  // Рівень
  ctx.font = 'bold 10px Orbitron, sans-serif';
  ctx.fillStyle = '#00f0ff88';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;
  ctx.textAlign = 'left';
  ctx.fillText(`LVL ${lvl}`, 16, H - 10);

  // Гравітація
  ctx.textAlign = 'center';
  ctx.fillStyle = player.gravDir === 1 ? '#00f0ffaa' : '#ff00aaaa';
  ctx.shadowColor = player.gravDir === 1 ? '#00f0ff' : '#ff00aa';
  ctx.fillText(player.gravDir === 1 ? '▼ ВНИЗ' : '▲ ВГОРУ', W/2, H - 10);

  // Смуга швидкості
  const pct = Math.min((speed - PLAT_SPEED_BASE) / 7, 1);
  const barX = W - 90, barY = H - 20, barW = 70, barH = 5;
  ctx.fillStyle = 'rgba(0,240,255,0.1)';
  ctx.fillRect(barX, barY, barW, barH);
  const barColor = `hsl(${180 - pct*180},100%,55%)`;
  ctx.fillStyle = barColor;
  ctx.shadowColor = barColor;
  ctx.shadowBlur = 10;
  ctx.fillRect(barX, barY, barW * pct, barH);
  ctx.shadowBlur = 0;

  ctx.font = '9px Orbitron';
  ctx.fillStyle = '#ffffff44';
  ctx.textAlign = 'right';
  ctx.fillText('SPEED', W - 16, H - 10);
}

// ─── UI ────────────────────────────────────────────
const scoreEl      = document.getElementById('score');
const bestEl       = document.getElementById('best');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl  = document.getElementById('final-best');

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (id) document.getElementById(id).classList.add('active');
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); handleInput(); } });
canvas.addEventListener('touchstart', e => { e.preventDefault(); handleInput(); }, { passive: false });
document.addEventListener('mousedown', () => handleInput());

function handleInput() { if (state === 'playing') player.flip(); }

// ─── Старт / Луп ───────────────────────────────────
function startGame() {
  score = 0; speed = PLAT_SPEED_BASE; t = 0;
  obstacles = []; obstacleTick = 0;
  particles.length = 0;
  player.reset();
  initPlatforms();
  showScreen(null);
  state = 'playing';
  if (frameId) cancelAnimationFrame(frameId);
  loop();
}

function loop() {
  frameId = requestAnimationFrame(loop);
  t++;

  drawBg();
  drawPlatforms();
  drawObstacles();
  drawParticles();

  if (state === 'playing') {
    player.update();
    checkPlatformCollision();
    updatePlatforms();
    updateObstacles();
    updateParticles();

    if (checkObstacleCollision() || player.y > H + 60 || player.y < -60 - player.h) {
      triggerDeath(); return;
    }

    score++;
    speed = PLAT_SPEED_BASE + Math.pow(score / 900, 1.2);
    scoreEl.textContent = Math.floor(score / 10);
  }

  player.draw();
  drawHUD();
}

function triggerDeath() {
  state = 'dead';
  const s = Math.floor(score / 10);
  if (s > best) best = s;
  finalScoreEl.textContent = s;
  finalBestEl.textContent  = best;
  bestEl.textContent       = best;
  // Вибух частинок при смерті
  for (let i = 0; i < 5; i++)
    spawnParticle(player.x + player.w/2, player.y + player.h/2, '#ff3366');
  setTimeout(() => showScreen('gameover-screen'), 500);
}

function rand(min, max) { return Math.random() * (max - min) + min; }

// ─── Запуск ────────────────────────────────────────
loadImages(IMAGE_PATHS).then(() => {
  showScreen('start-screen');
  drawBg();
});
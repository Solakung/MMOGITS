const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ปิดการเบลอของพิกเซล เพื่อให้ภาพคมชัดแบบ 8-bit
ctx.imageSmoothingEnabled = false;

// --- 1. บันทึกและสถานะโลก (World State) ---
const savedWorld = JSON.parse(localStorage.getItem('mmo_world_state')) || {
  forestWrath: 0,
  karmaScore: 0,
  huntCount: 0,
  feedCount: 0
};

const world = {
  ...savedWorld,
  save() {
    localStorage.setItem('mmo_world_state', JSON.stringify({
      forestWrath: this.forestWrath,
      karmaScore: this.karmaScore,
      huntCount: this.huntCount,
      feedCount: this.feedCount
    }));
  }
};

function logMsg(msg) {
  const box = document.getElementById('log-box');
  if (!box) return;
  const div = document.createElement('div');
  div.innerText = msg;
  box.prepend(div);
  while (box.children.length > 5) box.removeChild(box.lastChild);
}

// --- 2. ตัวละคร ผู้เล่น และสิ่งแวดล้อม ---
let frameCount = 0;
const particles = []; // สำหรับเอฟเฟกต์ฟันดาบและตัวเลขความเสียหาย

const player = {
  x: 150,
  y: 110,
  speed: 1.6,
  facing: 'down',
  isMoving: false,
  attackTimer: 0
};

// จำลองผู้เล่นคนอื่น (Simulated Online Adventurers)
const otherPlayers = [
  { name: 'Mage_Rin', x: 70, y: 60, role: 'mage', vx: 0, vy: 0, timer: 0 },
  { name: 'Rogue_Z', x: 240, y: 170, role: 'rogue', vx: 0, vy: 0, timer: 0 }
];

// ตกแต่งฉาก (ต้นไม้และหิน 8-bit)
const scenery = [
  { type: 'tree', x: 30, y: 30 },
  { type: 'tree', x: 260, y: 40 },
  { type: 'tree', x: 40, y: 180 },
  { type: 'tree', x: 270, y: 190 },
  { type: 'rock', x: 100, y: 140 },
  { type: 'rock', x: 200, y: 80 }
];

// มอนสเตอร์
const monsters = [];
const MAX_MOBS = 6;

function spawnMonster() {
  const isMutant = world.forestWrath >= 50 && Math.random() < 0.6;
  monsters.push({
    id: 'M' + Math.floor(Math.random() * 900 + 100),
    x: Math.random() * (canvas.width - 50) + 25,
    y: Math.random() * (canvas.height - 50) + 25,
    type: isMutant ? 'mutant' : 'slime',
    hp: isMutant ? 40 : 20,
    maxHp: isMutant ? 40 : 20,
    isAggressive: isMutant,
    isFriendly: false,
    affinity: 0,
    timer: 0,
    vx: 0,
    vy: 0,
    bobOffset: Math.random() * 10
  });
}

for (let i = 0; i < 5; i++) spawnMonster();

// --- 3. ระบบเรนเดอร์พิกเซลอาร์ต 8-Bit (Procedural Pixel Art) ---

// วาดสไปรต์แบบตารางพิกเซล (ตารางขนาด 8x8 ขยายเป็น 16x16 พิกเซล)
function drawPixelMatrix(matrix, startX, startY, scale = 2) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      const color = matrix[r][c];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(startX + c * scale), Math.floor(startY + r * scale), scale, scale);
      }
    }
  }
}

// 1. สไปรต์อัศวิน (ผู้เล่น)
const C_SKIN = '#ffd8b1', C_HAIR = '#6a4c28', C_ARMOR = '#2b7fff', C_EYE = '#1a1a1a', C_BLADE = '#e0e0e0';
function drawPlayerSprite(x, y, isMoving, tick) {
  const step = isMoving && (Math.floor(tick / 8) % 2 === 0);
  const footColor = step ? '#3a3a4c' : '#1a1a28';
  
  const sprite = [
    [null,   C_HAIR,  C_HAIR,  C_HAIR,  C_HAIR,  null],
    [C_HAIR, C_SKIN,  C_EYE,   C_SKIN,  C_EYE,   C_HAIR],
    [null,   C_SKIN,  C_SKIN,  C_SKIN,  C_SKIN,  null],
    [C_ARMOR,C_ARMOR, C_ARMOR, C_ARMOR, C_ARMOR, C_ARMOR],
    [C_BLADE,C_ARMOR, C_ARMOR, C_ARMOR, C_ARMOR, null],
    [null,   footColor, null,  null,    footColor, null]
  ];
  drawPixelMatrix(sprite, x, y, 2.5);
}

// 2. สไปรต์มอนสเตอร์สไลม์ป่า (Slime)
function drawSlimeSprite(x, y, isFriendly, tick, offset) {
  const squish = Math.sin((tick + offset) * 0.15) > 0;
  const baseColor = isFriendly ? '#52b788' : '#74c69d';
  const eyeColor = isFriendly ? '#1b4332' : '#081c15';
  
  let sprite;
  if (squish) {
    sprite = [
      [null,      null,      '#2d6a4f', null,      null],
      [null,      baseColor, baseColor, baseColor, null],
      [baseColor, eyeColor,  baseColor, eyeColor,  baseColor],
      [baseColor, baseColor, baseColor, baseColor, baseColor]
    ];
  } else {
    sprite = [
      [null,      '#2d6a4f', null,      null,      null],
      [null,      baseColor, baseColor, null,      null],
      [baseColor, eyeColor,  baseColor, eyeColor,  baseColor],
      [baseColor, baseColor, baseColor, baseColor, baseColor],
      [baseColor, baseColor, baseColor, baseColor, baseColor]
    ];
  }
  drawPixelMatrix(sprite, x, y, 2.5);

  if (isFriendly) {
    // วาดหัวใจเล็กๆ เหนือหัว
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(x + 4, y - 6, 4, 3);
  }
}

// 3. สไปรต์มอนสเตอร์กลายพันธุ์ (Mutant Beast)
function drawMutantSprite(x, y, tick) {
  const bob = Math.floor(Math.sin(tick * 0.1) * 1.5);
  const sprite = [
    ['#ffb703', null,      null,      null,      '#ffb703'], // เขา
    [null,      '#d90429', '#d90429', '#d90429', null],
    ['#d90429', '#ffea00', '#d90429', '#ffea00', '#d90429'], // ตาเรืองแสง
    ['#d90429', '#ef233c', '#d90429', '#ef233c', '#d90429'],
    [null,      '#800f2f', null,      '#800f2f', null]       // กรงเล็บ
  ];
  drawPixelMatrix(sprite, x, y + bob, 2.5);
}

// 4. สไปรต์นักผจญภัยอื่น (บอท)
function drawOtherPlayerSprite(p, tick) {
  const isMage = p.role === 'mage';
  const robeColor = isMage ? '#9d4edd' : '#d90429';
  const hatColor = isMage ? '#5a189a' : '#6a040f';
  
  const sprite = [
    [null,      hatColor,  hatColor,  hatColor,  null],
    [hatColor,  C_SKIN,    C_EYE,     C_SKIN,    hatColor],
    [robeColor, robeColor, robeColor, robeColor, robeColor],
    [null,      robeColor, robeColor, robeColor, null],
    [null,      '#111',    null,      '#111',    null]
  ];
  drawPixelMatrix(sprite, p.x, p.y, 2.2);

  // ชื่อตัวละครด้านบน
  ctx.fillStyle = '#ffffff';
  ctx.font = '8px monospace';
  ctx.fillText(p.name, p.x - 4, p.y - 3);
}

// 5. วาดต้นไม้และหิน
function drawScenery() {
  scenery.forEach(s => {
    if (s.type === 'tree') {
      // พุ่มใบไม้ 8-bit
      ctx.fillStyle = '#1b4332';
      ctx.fillRect(s.x + 2, s.y, 16, 14);
      ctx.fillStyle = '#2d6a4f';
      ctx.fillRect(s.x + 4, s.y + 2, 12, 10);
      // ลำต้น
      ctx.fillStyle = '#582f0e';
      ctx.fillRect(s.x + 8, s.y + 14, 4, 8);
    } else if (s.type === 'rock') {
      ctx.fillStyle = '#495057';
      ctx.fillRect(s.x, s.y + 2, 12, 8);
      ctx.fillStyle = '#6c757d';
      ctx.fillRect(s.x + 2, s.y, 8, 4);
    }
  });
}

// --- 4. การควบคุม (คีย์บอร์ด + สัมผัส) ---
const moveState = { up: false, down: false, left: false, right: false };

document.querySelectorAll('.btn-dpad').forEach(btn => {
  const dir = btn.getAttribute('data-dir');
  btn.addEventListener('touchstart', e => { e.preventDefault(); moveState[dir] = true; });
  btn.addEventListener('touchend', e => { e.preventDefault(); moveState[dir] = false; });
  btn.addEventListener('mousedown', () => { moveState[dir] = true; });
  btn.addEventListener('mouseup', () => { moveState[dir] = false; });
});

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.up = true;
  if (k === 's' || k === 'arrowdown') moveState.down = true;
  if (k === 'a' || k === 'arrowleft') moveState.left = true;
  if (k === 'd' || k === 'arrowright') moveState.right = true;
  if (e.code === 'Space') executeAttack();
  if (k === 'e') executeFeed();
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.up = false;
  if (k === 's' || k === 'arrowdown') moveState.down = false;
  if (k === 'a' || k === 'arrowleft') moveState.left = false;
  if (k === 'd' || k === 'arrowright') moveState.right = false;
});

// --- 5. ระบบการกระทำและผลกระทบ (Actions & FX) ---
function executeAttack() {
  player.attackTimer = 10;
  let hit = false;
  monsters.forEach((m, idx) => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 30 && !hit) {
      hit = true;
      m.hp -= 15;
      m.isAggressive = true;
      m.affinity -= 4;

      // เพิ่มตัวเลข Damage ลอย
      particles.push({ text: '-15', x: m.x + 4, y: m.y - 4, color: '#ff4d4d', life: 25 });
      logMsg(`⚔️ โจมตี ${m.id}! ป่ารับรู้ถึงอันตราย`);

      if (m.hp <= 0) {
        monsters.splice(idx, 1);
        world.huntCount++;
        world.forestWrath = Math.min(100, world.forestWrath + 12);
        world.karmaScore -= 2;
        world.save();
        logMsg(`💀 สังหาร ${m.id} ป่าพิโรธขึ้น (${world.forestWrath}%)`);
      }
    }
  });
  if (!hit) {
    particles.push({ text: 'MISS', x: player.x, y: player.y - 6, color: '#888', life: 15 });
  }
}

function executeFeed() {
  let fed = false;
  monsters.forEach(m => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 30 && !fed) {
      fed = true;
      m.affinity += 5;
      if (m.affinity >= 5) {
        m.isFriendly = true;
        m.isAggressive = false;
        particles.push({ text: '❤️ มิตรภาพ', x: m.x, y: m.y - 6, color: '#52b788', life: 30 });
        logMsg(`🌿 ${m.id} ไว้วางใจคุณ และจะคอยติดตาม`);
      } else {
        particles.push({ text: '+ความผูกพัน', x: m.x, y: m.y - 4, color: '#ffd166', life: 25 });
        logMsg(`🍎 แบ่งปันอาหารให้ ${m.id}`);
      }
      world.feedCount++;
      world.forestWrath = Math.max(0, world.forestWrath - 5);
      world.karmaScore += 2;
      world.save();
    }
  });
}

document.getElementById('btn-atk').addEventListener('touchstart', e => { e.preventDefault(); executeAttack(); });
document.getElementById('btn-atk').addEventListener('click', executeAttack);
document.getElementById('btn-feed').addEventListener('touchstart', e => { e.preventDefault(); executeFeed(); });
document.getElementById('btn-feed').addEventListener('click', executeFeed);

// --- 6. ลูปตรรกะและการอัปเดต (Game Loop) ---
function update() {
  frameCount++;
  player.isMoving = false;

  if (moveState.up) { player.y -= player.speed; player.isMoving = true; }
  if (moveState.down) { player.y += player.speed; player.isMoving = true; }
  if (moveState.left) { player.x -= player.speed; player.isMoving = true; }
  if (moveState.right) { player.x += player.speed; player.isMoving = true; }

  player.x = Math.max(8, Math.min(canvas.width - 24, player.x));
  player.y = Math.max(8, Math.min(canvas.height - 24, player.y));

  if (player.attackTimer > 0) player.attackTimer--;

  // อัปเดตมอนสเตอร์ AI
  monsters.forEach(m => {
    const d = Math.hypot(player.x - m.x, player.y - m.y);

    if (m.isFriendly) {
      if (d > 30) {
        m.x += ((player.x - m.x) / d) * 0.8;
        m.y += ((player.y - m.y) / d) * 0.8;
      }
    } else if (m.isAggressive && d < 75) {
      m.x += ((player.x - m.x) / d) * 1.0;
      m.y += ((player.y - m.y) / d) * 1.0;
    } else {
      m.timer--;
      if (m.timer <= 0) {
        m.vx = (Math.random() - 0.5) * 0.6;
        m.vy = (Math.random() - 0.5) * 0.6;
        m.timer = Math.floor(Math.random() * 50) + 30;
      }
      m.x += m.vx;
      m.y += m.vy;
    }

    m.x = Math.max(8, Math.min(canvas.width - 20, m.x));
    m.y = Math.max(8, Math.min(canvas.height - 20, m.y));
  });

  // อัปเดตผู้เล่นจำลอง
  otherPlayers.forEach(p => {
    p.timer--;
    if (p.timer <= 0) {
      p.vx = (Math.random() - 0.5) * 0.6;
      p.vy = (Math.random() - 0.5) * 0.6;
      p.timer = Math.floor(Math.random() * 60) + 40;
    }
    p.x = Math.max(15, Math.min(canvas.width - 25, p.x + p.vx));
    p.y = Math.max(15, Math.min(canvas.height - 25, p.y + p.vy));
  });

  // เกิดมอนสเตอร์ใหม่
  if (monsters.length < MAX_MOBS && Math.random() < 0.008) spawnMonster();

  // อัปเดตเอฟเฟกต์ตัวเลขลอย
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].y -= 0.4;
    particles[i].life--;
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  // อัปเดตแถบข้อความ UI
  document.getElementById('wrath-txt').innerText = `${world.forestWrath}%`;
  document.getElementById('mob-txt').innerText = monsters.length;
  document.getElementById('karma-txt').innerText = 
    world.karmaScore > 4 ? 'พิทักษ์ธรรมชาติ' : (world.karmaScore < -4 ? 'ผู้ทำลายล้าง' : 'เป็นกลาง');
}

// --- 7. ลูปวาดกราฟิก (Render Loop) ---
function render() {
  ctx.fillStyle = '#1c281a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // หญ้าพิกเซลประปราย
  ctx.fillStyle = '#243422';
  for (let x = 8; x < canvas.width; x += 32) {
    for (let y = 8; y < canvas.height; y += 32) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // วาดสิ่งแวดล้อม
  drawScenery();

  // วาดมอนสเตอร์ 8-bit
  monsters.forEach(m => {
    if (m.type === 'mutant') {
      drawMutantSprite(m.x, m.y, frameCount);
    } else {
      drawSlimeSprite(m.x, m.y, m.isFriendly, frameCount, m.bobOffset);
    }
    // แถบเลือดพิกเซล
    if (m.hp < m.maxHp) {
      ctx.fillStyle = '#111';
      ctx.fillRect(m.x, m.y - 5, 12, 2);
      ctx.fillStyle = '#ff3333';
      ctx.fillRect(m.x, m.y - 5, (m.hp / m.maxHp) * 12, 2);
    }
  });

  // วาดผู้เล่นอื่น (จำลองออนไลน์)
  otherPlayers.forEach(p => drawOtherPlayerSprite(p, frameCount));

  // วาดตัวละครผู้เล่น
  drawPlayerSprite(player.x, player.y, player.isMoving, frameCount);

  // วาดเอฟเฟกต์ฟันดาบ
  if (player.attackTimer > 0) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x + 8, player.y + 8, 16, -Math.PI / 4, Math.PI / 2);
    ctx.stroke();
  }

  // วาดตัวเลขความเสียหาย/ข้อความ
  particles.forEach(pt => {
    ctx.fillStyle = pt.color;
    ctx.font = 'bold 9px monospace';
    ctx.fillText(pt.text, pt.x, pt.y);
  });

  requestAnimationFrame(() => {
    update();
    render();
  });
}

render();
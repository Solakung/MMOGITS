const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 1. ระบบบันทึกและสถานะโลก (World State with LocalStorage) ---
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
  const div = document.createElement('div');
  div.innerText = msg;
  box.prepend(div);
  while (box.children.length > 5) box.removeChild(box.lastChild);
}

// --- 2. ข้อมูลผู้เล่นและผู้เล่นเสมือน (Simulated MMORPG) ---
const player = {
  x: 150,
  y: 110,
  size: 10,
  color: '#4ecdc4',
  speed: 1.6
};

// จำลองผู้เล่นอื่นในโลก
const otherPlayers = [
  { name: 'Kael_99', x: 80, y: 70, color: '#f72585', vx: 0, vy: 0, timer: 0 },
  { name: 'Sylvia', x: 230, y: 160, color: '#7209b7', vx: 0, vy: 0, timer: 0 }
];

// มอนสเตอร์
const monsters = [];
const MAX_MOBS = 7;

function spawnMonster() {
  const isMutant = world.forestWrath >= 50 && Math.random() < 0.6;
  monsters.push({
    id: 'M' + Math.floor(Math.random() * 900 + 100),
    x: Math.random() * (canvas.width - 30) + 15,
    y: Math.random() * (canvas.height - 30) + 15,
    size: isMutant ? 12 : 8,
    color: isMutant ? '#e63946' : '#a7c957',
    hp: isMutant ? 40 : 20,
    maxHp: isMutant ? 40 : 20,
    isAggressive: isMutant,
    isFriendly: false,
    affinity: 0,
    timer: 0,
    vx: 0,
    vy: 0
  });
}

for (let i = 0; i < 5; i++) spawnMonster();

// --- 3. การควบคุม (รองรับทั้งปุ่มบนจอสัมผัส และ คีย์บอร์ด) ---
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

// --- 4. ระบบการกระทำและผลกระทบ (Cause & Effect Actions) ---
function executeAttack() {
  let hit = false;
  monsters.forEach((m, idx) => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 26 && !hit) {
      hit = true;
      m.hp -= 15;
      m.isAggressive = true;
      m.affinity -= 4;
      logMsg(`คุณโจมตี ${m.id}! ค่าความแค้นเพิ่มขึ้น`);

      if (m.hp <= 0) {
        monsters.splice(idx, 1);
        world.huntCount++;
        world.forestWrath = Math.min(100, world.forestWrath + 12);
        world.karmaScore -= 2;
        world.save();
        logMsg(`💀 สังหาร ${m.id} ป่าเริ่มพิโรธ (${world.forestWrath}%)`);
      }
    }
  });
}

function executeFeed() {
  let fed = false;
  monsters.forEach(m => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 28 && !fed) {
      fed = true;
      m.affinity += 5;
      if (m.affinity >= 5) {
        m.isFriendly = true;
        m.isAggressive = false;
        m.color = '#52b788';
        logMsg(`🌿 ${m.id} เชื่อใจคุณแล้ว และจะคอยเดินตาม`);
      } else {
        logMsg(`ให้อาหาร ${m.id} มันดูลดความก้าวร้าวลง`);
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

// --- 5. ลูปอัปเดตและจำลองพฤติกรรม (Game Loop) ---
function update() {
  // การเดินของผู้เล่น
  if (moveState.up) player.y -= player.speed;
  if (moveState.down) player.y += player.speed;
  if (moveState.left) player.x -= player.speed;
  if (moveState.right) player.x += player.speed;

  player.x = Math.max(4, Math.min(canvas.width - player.size - 4, player.x));
  player.y = Math.max(4, Math.min(canvas.height - player.size - 4, player.y));

  // AI มอนสเตอร์
  monsters.forEach(m => {
    const distToPlayer = Math.hypot(player.x - m.x, player.y - m.y);

    if (m.isFriendly) {
      if (distToPlayer > 28) {
        m.x += ((player.x - m.x) / distToPlayer) * 0.9;
        m.y += ((player.y - m.y) / distToPlayer) * 0.9;
      }
    } else if (m.isAggressive && distToPlayer < 75) {
      m.x += ((player.x - m.x) / distToPlayer) * 1.1;
      m.y += ((player.y - m.y) / distToPlayer) * 1.1;
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

    m.x = Math.max(4, Math.min(canvas.width - m.size - 4, m.x));
    m.y = Math.max(4, Math.min(canvas.height - m.size - 4, m.y));
  });

  // จำลองผู้เล่นอื่นเดินไปมา (Simulated Players)
  otherPlayers.forEach(p => {
    p.timer--;
    if (p.timer <= 0) {
      p.vx = (Math.random() - 0.5) * 0.7;
      p.vy = (Math.random() - 0.5) * 0.7;
      p.timer = Math.floor(Math.random() * 70) + 40;
    }
    p.x = Math.max(10, Math.min(canvas.width - 20, p.x + p.vx));
    p.y = Math.max(10, Math.min(canvas.height - 20, p.y + p.vy));
  });

  // การเกิดทดแทนของมอนสเตอร์
  if (monsters.length < MAX_MOBS && Math.random() < 0.008) {
    spawnMonster();
  }

  // อัปเดต UI
  document.getElementById('wrath-txt').innerText = `${world.forestWrath}%`;
  document.getElementById('mob-txt').innerText = monsters.length;
  document.getElementById('karma-txt').innerText = 
    world.karmaScore > 4 ? 'พันธมิตรธรรมชาติ' : (world.karmaScore < -4 ? 'ศัตรูของป่า' : 'เป็นกลาง');
}

// --- 6. เรนเดอร์กราฟิก 8-Bit ---
function render() {
  ctx.fillStyle = '#1c281a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ตารางพื้นหลัง
  ctx.fillStyle = '#223320';
  for (let x = 0; x < canvas.width; x += 32) {
    for (let y = 0; y < canvas.height; y += 32) {
      if ((x + y) % 64 === 0) ctx.fillRect(x, y, 32, 32);
    }
  }

  // วาดมอนสเตอร์
  monsters.forEach(m => {
    ctx.fillStyle = m.color;
    ctx.fillRect(Math.floor(m.x), Math.floor(m.y), m.size, m.size);
    if (m.hp < m.maxHp) {
      ctx.fillStyle = '#ff3333';
      ctx.fillRect(m.x, m.y - 3, (m.hp / m.maxHp) * m.size, 2);
    }
  });

  // วาดผู้เล่นอื่น (จำลองออนไลน์)
  otherPlayers.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 10, 10);
  });

  // วาดผู้เล่น
  ctx.fillStyle = player.color;
  ctx.fillRect(Math.floor(player.x), Math.floor(player.y), player.size, player.size);

  requestAnimationFrame(() => {
    update();
    render();
  });
}

render();
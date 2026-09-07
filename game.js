const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// --- 1. ข้อมูลผู้เล่นและระบบ Progression ---
const player = {
  x: 150,
  y: 120,
  speed: 1.6,
  isMoving: false,
  attackTimer: 0,
  hp: 100,
  maxHp: 100,
  level: 1,
  exp: 0,
  maxExp: 30,
  gold: 0,
  dir: 'right'
};

const world = {
  forestWrath: 0,
  bossActive: false,
  save() {
    localStorage.setItem('mmo_progress', JSON.stringify({
      level: player.level,
      exp: player.exp,
      gold: player.gold,
      wrath: this.forestWrath
    }));
  }
};

// โหลดข้อมูลเดิมถ้ามี
const saved = JSON.parse(localStorage.getItem('mmo_progress'));
if (saved) {
  player.level = saved.level || 1;
  player.exp = saved.exp || 0;
  player.gold = saved.gold || 0;
  world.forestWrath = saved.wrath || 0;
}

function logChat(sender, msg, color = '#ddd') {
  const box = document.getElementById('log-box');
  if (!box) return;
  const div = document.createElement('div');
  div.innerHTML = `<span style="color:${color}">[${sender}]</span>: ${msg}`;
  box.prepend(div);
  while (box.children.length > 5) box.removeChild(box.lastChild);
}

// --- 2. วัตถุในเกม (กระสุน, ดรอปไอเทม, บอส) ---
const projectiles = [];
const loots = [];
const particles = [];
let frameCount = 0;
let boss = null;

// ผู้เล่นเสมือน (MMO NPC Players)
const otherPlayers = [
  { name: 'Kael', role: 'warrior', x: 60, y: 80, vx: 0, vy: 0, timer: 0 },
  { name: 'Sylvia', role: 'mage', x: 250, y: 160, vx: 0, vy: 0, timer: 0 }
];

// มอนสเตอร์
const monsters = [];
function spawnMonster() {
  const isMutant = world.forestWrath >= 60;
  monsters.push({
    id: 'M' + Math.floor(Math.random() * 800 + 100),
    x: Math.random() * (canvas.width - 40) + 20,
    y: Math.random() * (canvas.height - 40) + 20,
    type: isMutant ? 'mutant' : 'slime',
    hp: isMutant ? 45 : 20,
    maxHp: isMutant ? 45 : 20,
    isAggressive: isMutant,
    isFriendly: false,
    affinity: 0,
    timer: 0,
    vx: 0,
    vy: 0
  });
}
for (let i = 0; i < 5; i++) spawnMonster();

// เรียกบอสเมื่อป่าพิโรธเต็ม 100%
function triggerBoss() {
  if (world.bossActive) return;
  world.bossActive = true;
  boss = {
    name: 'Ancient Drake',
    x: 135,
    y: 40,
    hp: 250,
    maxHp: 250,
    size: 28,
    timer: 0
  };
  logChat('ระบบ', '🚨 ป่าพิโรธถึงขีดสุด! มังกรโบราณ Ancient Drake ตื่นขึ้นมาแล้ว!', '#ff3838');
  logChat('Kael', 'เหวอ! บอสเกิดแล้ว ทุกคนเตรียมอาวุธเร็ว!', '#ffd166');
  
  // 👉 เรียก AI เมื่อบอสเกิด
  callAIDirector("บอส Ancient Drake ตื่นขึ้นมาเพราะการสังหารหมู่");
}

// --- 3. การควบคุม ---
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
  if (k === 'a' || k === 'arrowleft') { moveState.left = true; player.dir = 'left'; }
  if (k === 'd' || k === 'arrowright') { moveState.right = true; player.dir = 'right'; }
  if (e.code === 'Space') attack();
  if (k === 'e') feed();
  if (k === 'q') shootSkill();
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.up = false;
  if (k === 's' || k === 'arrowdown') moveState.down = false;
  if (k === 'a' || k === 'arrowleft') moveState.left = false;
  if (k === 'd' || k === 'arrowright') moveState.right = false;
});

// --- 4. แอ็กชันและระบบต่อสู้ ---
function attack() {
  player.attackTimer = 10;
  let hitTarget = false;

  // ตีมอนสเตอร์
  monsters.forEach((m, idx) => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 30 && !hitTarget) {
      hitTarget = true;
      const dmg = 12 + player.level * 3;
      m.hp -= dmg;
      m.isAggressive = true;
      m.affinity -= 3;
      particles.push({ text: `-${dmg}`, x: m.x, y: m.y - 4, color: '#ff5555', life: 25 });

      if (m.hp <= 0) {
        loots.push({ x: m.x, y: m.y, type: 'gold', val: 5 });
        loots.push({ x: m.x + 4, y: m.y + 4, type: 'exp', val: 12 });
        monsters.splice(idx, 1);
        world.forestWrath = Math.min(100, world.forestWrath + 18);
        world.save();
        
        // 👉 เรียก AI เมื่อมอนสเตอร์ถูกสังหาร
        callAIDirector("ผู้เล่นสังหารมอนสเตอร์ในป่า ค่าความแค้นเพิ่มขึ้น");

        if (world.forestWrath >= 100) triggerBoss();
      }
    }
  });

  // ตีบอส
  if (boss && Math.hypot(boss.x - player.x, boss.y - player.y) < 38) {
    const dmg = 15 + player.level * 4;
    boss.hp -= dmg;
    particles.push({ text: `-${dmg}!`, x: boss.x + 10, y: boss.y, color: '#ffb703', life: 30 });
    if (boss.hp <= 0) {
      logChat('ระบบ', '🎉 บอสถูกปราบแล้ว! สันติภาพกลับคืนสู่ผืนป่า', '#06d6a0');
      loots.push({ x: boss.x, y: boss.y, type: 'gold', val: 50 });
      loots.push({ x: boss.x + 8, y: boss.y, type: 'exp', val: 60 });
      boss = null;
      world.bossActive = false;
      world.forestWrath = 0;
      world.save();

      // 👉 เรียก AI เมื่อปราบความมืดสำเร็จ
      callAIDirector("ผู้เล่นสามารถปราบมังกร Ancient Drake ได้สำเร็จ");
    }
  }
}

function shootSkill() {
  const vx = player.dir === 'left' ? -3 : 3;
  projectiles.push({
    x: player.x + 6,
    y: player.y + 6,
    vx: vx,
    vy: 0,
    life: 50
  });
  particles.push({ text: '⚡คลื่นดาบ!', x: player.x, y: player.y - 6, color: '#48cae4', life: 20 });
}

function feed() {
  monsters.forEach(m => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 32 && !m.isFriendly) {
      m.affinity += 5;
      if (m.affinity >= 5) {
        m.isFriendly = true;
        m.isAggressive = false;
        particles.push({ text: '❤️ มิตรภาพ!', x: m.x, y: m.y - 6, color: '#52b788', life: 30 });
        logChat('Sylvia', `ดูนั่นสิ! เจ้า ${m.id} เชื่องแล้ว มันจะช่วยเราสู้เวลาคับขันนะ`, '#b5e2fa');
        
        // 👉 เรียก AI เมื่อผูกมิตรกับสิ่งมีชีวิตสำเร็จ
        callAIDirector("ผู้เล่นสร้างมิตรภาพกับมอนสเตอร์ในป่า");
      } else {
        particles.push({ text: '+ความเชื่อใจ', x: m.x, y: m.y - 4, color: '#ffd166', life: 25 });
      }
      world.forestWrath = Math.max(0, world.forestWrath - 6);
      world.save();
    }
  });
}

document.getElementById('btn-atk').addEventListener('click', attack);
document.getElementById('btn-skill').addEventListener('click', shootSkill);
document.getElementById('btn-feed').addEventListener('click', feed);

// --- 5. ลูปอัปเดตระบบเกม ---
function update() {
  frameCount++;
  player.isMoving = false;

  if (moveState.up) { player.y -= player.speed; player.isMoving = true; }
  if (moveState.down) { player.y += player.speed; player.isMoving = true; }
  if (moveState.left) { player.x -= player.speed; player.isMoving = true; }
  if (moveState.right) { player.x += player.speed; player.isMoving = true; }

  player.x = Math.max(6, Math.min(canvas.width - 20, player.x));
  player.y = Math.max(6, Math.min(canvas.height - 20, player.y));
  if (player.attackTimer > 0) player.attackTimer--;

  // อัปเดตคลื่นดาบ (Skill Projectiles)
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx;
    p.life--;

    // เช็คชนมอนสเตอร์
    monsters.forEach(m => {
      if (Math.hypot(m.x - p.x, m.y - p.y) < 14) {
        m.hp -= 20;
        p.life = 0;
        particles.push({ text: '-20', x: m.x, y: m.y - 4, color: '#00b4d8', life: 20 });
      }
    });
    // เช็คชนบอส
    if (boss && Math.hypot(boss.x + 10 - p.x, boss.y + 10 - p.y) < 20) {
      boss.hp -= 22;
      p.life = 0;
      particles.push({ text: '-22', x: boss.x + 8, y: boss.y, color: '#00b4d8', life: 20 });
    }
    if (p.life <= 0) projectiles.splice(i, 1);
  }

  // อัปเดตมอนสเตอร์ & มอนสเตอร์ที่เป็นมิตรช่วยสู้
  monsters.forEach(m => {
    if (m.isFriendly) {
      const target = boss ? boss : player;
      const d = Math.hypot(target.x - m.x, target.y - m.y);
      if (d > 25) {
        m.x += ((target.x - m.x) / d) * 1.0;
        m.y += ((target.y - m.y) / d) * 1.0;
      }
      if (boss && d < 30 && frameCount % 30 === 0) {
        boss.hp -= 8;
        particles.push({ text: '-8 (สหาย)', x: boss.x, y: boss.y - 2, color: '#52b788', life: 20 });
      }
    } else if (m.isAggressive) {
      const d = Math.hypot(player.x - m.x, player.y - m.y);
      if (d < 70) {
        m.x += ((player.x - m.x) / d) * 0.9;
        m.y += ((player.y - m.y) / d) * 0.9;
        if (d < 14 && frameCount % 40 === 0) {
          player.hp = Math.max(0, player.hp - 8);
          particles.push({ text: '-8', x: player.x, y: player.y - 4, color: '#ff2222', life: 20 });
        }
      }
    } else {
      m.timer--;
      if (m.timer <= 0) {
        m.vx = (Math.random() - 0.5) * 0.6;
        m.vy = (Math.random() - 0.5) * 0.6;
        m.timer = Math.floor(Math.random() * 50) + 30;
      }
      m.x = Math.max(6, Math.min(canvas.width - 20, m.x + m.vx));
      m.y = Math.max(6, Math.min(canvas.height - 20, m.y + m.vy));
    }
  });

  // อัปเดตบอส
  if (boss) {
    boss.timer++;
    const d = Math.hypot(player.x - boss.x, player.y - boss.y);
    if (d > 35) {
      boss.x += ((player.x - boss.x) / d) * 0.5;
      boss.y += ((player.y - boss.y) / d) * 0.5;
    }
    if (d < 30 && boss.timer % 50 === 0) {
      player.hp = Math.max(0, player.hp - 16);
      particles.push({ text: '-16 บอสฟาด!', x: player.x, y: player.y - 6, color: '#ff0054', life: 25 });
    }
  }

  // เก็บของดรอป
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i];
    if (Math.hypot(player.x - l.x, player.y - l.y) < 18) {
      if (l.type === 'gold') {
        player.gold += l.val;
        particles.push({ text: `+${l.val}🪙`, x: player.x, y: player.y - 6, color: '#ffd166', life: 20 });
      } else if (l.type === 'exp') {
        player.exp += l.val;
        particles.push({ text: `+${l.val} EXP`, x: player.x, y: player.y - 6, color: '#06d6a0', life: 20 });
        if (player.exp >= player.maxExp) {
          player.level++;
          player.exp = 0;
          player.maxExp = Math.floor(player.maxExp * 1.5);
          player.maxHp += 20;
          player.hp = player.maxHp;
          particles.push({ text: 'LEVEL UP!!', x: player.x - 10, y: player.y - 12, color: '#fff', life: 40 });
          logChat('ระบบ', `ยินดีด้วย! เลเวลอัปเป็น Lv.${player.level} พลังชีวิตเพิ่มขึ้น!`, '#ffd166');
        }
      }
      loots.splice(i, 1);
      world.save();
    }
  }

  // เกิดมอนสเตอร์ใหม่
  if (monsters.length < 5 && Math.random() < 0.008) spawnMonster();

  // อัปเดตเอฟเฟกต์ตัวเลข
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].y -= 0.4;
    particles[i].life--;
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  // อัปเดตหน้าจอ UI
  document.getElementById('lvl-txt').innerText = player.level;
  document.getElementById('exp-txt').innerText = `${player.exp}/${player.maxExp}`;
  document.getElementById('gold-txt').innerText = player.gold;
  document.getElementById('wrath-txt').innerText = `${world.forestWrath}%`;
  document.getElementById('hp-bar-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
}

// --- 6. ลูปวาดภาพ 8-Bit ---
function render() {
  ctx.fillStyle = world.bossActive ? '#2c1214' : '#182216';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // วาดของดรอปบนพื้น
  loots.forEach(l => {
    ctx.fillStyle = l.type === 'gold' ? '#ffd166' : '#48cae4';
    ctx.fillRect(l.x, l.y, 4, 4);
  });

  // วาดคลื่นดาบ
  projectiles.forEach(p => {
    ctx.fillStyle = '#90e0ef';
    ctx.fillRect(p.x, p.y, 8, 3);
  });

  // วาดมอนสเตอร์
  monsters.forEach(m => {
    ctx.fillStyle = m.isFriendly ? '#52b788' : (m.type === 'mutant' ? '#d90429' : '#74c69d');
    ctx.fillRect(m.x, m.y, 10, 10);
    ctx.fillStyle = '#000';
    ctx.fillRect(m.x + 2, m.y + 2, 2, 2);
    ctx.fillRect(m.x + 6, m.y + 2, 2, 2);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(m.x, m.y - 3, (m.hp / m.maxHp) * 10, 2);
  });

  // วาดบอส Ancient Drake
  if (boss) {
    ctx.fillStyle = '#800f2f';
    ctx.fillRect(boss.x, boss.y, boss.size, boss.size - 6);
    ctx.fillStyle = '#ffb703';
    ctx.fillRect(boss.x + 2, boss.y - 4, 4, 4);
    ctx.fillRect(boss.x + boss.size - 6, boss.y - 4, 4, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(boss.x + 6, boss.y + 6, 4, 4);
    ctx.fillRect(boss.x + 18, boss.y + 6, 4, 4);
    ctx.fillStyle = '#222';
    ctx.fillRect(boss.x - 4, boss.y - 8, boss.size + 8, 4);
    ctx.fillStyle = '#ff0054';
    ctx.fillRect(boss.x - 4, boss.y - 8, (boss.hp / boss.maxHp) * (boss.size + 8), 4);
  }

  // วาดผู้เล่นอื่น
  otherPlayers.forEach(p => {
    ctx.fillStyle = p.role === 'mage' ? '#9d4edd' : '#d90429';
    ctx.fillRect(p.x, p.y, 10, 12);
  });

  // วาดตัวละครผู้เล่น
  ctx.fillStyle = '#2b7fff';
  ctx.fillRect(player.x, player.y, 10, 12);
  ctx.fillStyle = '#ffd8b1';
  ctx.fillRect(player.x + 2, player.y + 2, 6, 4);

  // วาดเอฟเฟกต์ฟันดาบ
  if (player.attackTimer > 0) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x + 5, player.y + 5, 14, 0, Math.PI);
    ctx.stroke();
  }

  // วาดตัวเลขความเสียหาย/EXP
  particles.forEach(pt => {
    ctx.fillStyle = pt.color;
    ctx.font = 'bold 8px monospace';
    ctx.fillText(pt.text, pt.x, pt.y);
  });

  requestAnimationFrame(() => {
    update();
    render();
  });
}

render();

// --- 7. ฟังก์ชันเรียก Nano LLM ฟรี 100% ---
let isAiThinking = false;

async function callAIDirector(actionDescription) {
  if (isAiThinking) return; // ป้องกันการเรียกซ้ำซ้อนขณะที่ AI กำลังคิด
  isAiThinking = true;

  try {
    const prompt = `คุณคือ AI ผู้ควบคุมระบบโลกของเกม 8-bit MMORPG
สถานะปัจจุบัน:
- ความแค้นของป่า: ${world.forestWrath}%
- เลเวลผู้เล่น: Lv.${player.level}
- เหตุการณ์ล่าสุด: ${actionDescription}

คำสั่ง: แต่งประโยคสั้นๆ 1 ประโยค (ไม่เกิน 20 คำ) ตอบเป็นภาษาไทย เพื่อเป็นเสียงประกาศของป่าหรือคำพูดของบอส`;

    logChat("AI", "กำลังประเมินผลกระทบ...", "#888");

    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=qwen`;
    const res = await fetch(url);
    const message = await res.text();

    if (message && message.trim().length > 0) {
      logChat("เสียงจากป่า", message.trim(), "#72dec2");
    }
  } catch (err) {
    console.log("AI Offline:", err);
  } finally {
    setTimeout(() => { isAiThinking = false; }, 3000); // หน่วงเวลา 3 วินาทีก่อนเรียกครั้งต่อไป
  }
}
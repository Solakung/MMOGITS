const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// --- 1. แผนที่ขนาดใหญ่และกล้อง (World Dimensions & Camera) ---
const MAP_W = 1200;
const MAP_H = 900;

const camera = {
  x: 0,
  y: 0,
  w: 320,
  h: 240
};

// --- 2. ข้อมูลผู้เล่นและระบบ RPG เชิงลึก ---
const player = {
  x: 220,
  y: 200,
  speed: 2.1,
  isMoving: false,
  dir: 'down',
  hp: 120,
  maxHp: 120,
  mp: 60,
  maxMp: 60,
  level: 1,
  exp: 0,
  maxExp: 40,
  gold: 0,
  atk: 18,
  shieldTimer: 0,
  attackTimer: 0,
  spinTimer: 0
};

// สภาวะโลก กลางวัน-กลางคืน และ 3 ฝ่าย
const world = {
  gameMinutes: 720, // เริ่มต้นที่เที่ยงวัน (12:00)
  dayPhase: 'day',  // 'morning', 'day', 'night'
  forestWrath: 0,
  factionVillage: 50,
  factionForest: 50,
  factionShadow: 0,
  bloodMoon: false,
  quest: {
    title: 'ปกป้องพงไพร',
    desc: 'สไลม์เริ่มถูกคุกคาม จงแบ่งอาหารให้สไลม์ป่า 2 ตัว',
    progress: 0,
    target: 2,
    type: 'feed',
    rewardGold: 35
  }
};

function logChat(sender, msg, color = '#ddd') {
  const box = document.getElementById('log-content');
  if (!box) return;
  const div = document.createElement('div');
  div.innerHTML = `<span style="color:${color}">[${sender}]</span>: ${msg}`;
  box.prepend(div);
  while (box.children.length > 5) box.removeChild(box.lastChild);
}

// --- 3. สิ่งแวดล้อม วัตถุ และเอฟเฟกต์ ---
let frameCount = 0;
const projectiles = [];
const loots = [];
const particles = [];
let boss = null;

// กองไฟหมู่บ้านและคบเพลิง (จุดกำเนิดแสงสว่าง)
const lights = [
  { x: 180, y: 180, r: 90, type: 'campfire' },
  { x: 400, y: 150, r: 60, type: 'torch' },
  { x: 260, y: 350, r: 60, type: 'torch' }
];

const elderNPC = { x: 240, y: 170, name: 'ผู้เฒ่าเอลรอนด์' };

// ต้นไม้และโขดหินที่มีลวดลาย
const scenery = [];
for (let i = 0; i < 35; i++) {
  scenery.push({
    x: Math.random() * (MAP_W - 100) + 50,
    y: Math.random() * (MAP_H - 100) + 50,
    type: Math.random() < 0.75 ? 'tree' : 'rock'
  });
}

// --- 4. มอนสเตอร์และระบบฝูง (Tactical AI System) ---
const monsters = [];
const MAX_MOBS = 12;

function spawnMob(typeOverride = null, xOverride = null, yOverride = null) {
  const x = xOverride || (Math.random() * (MAP_W - 120) + 60);
  const y = yOverride || (Math.random() * (MAP_H - 120) + 60);
  
  let type = typeOverride;
  if (!type) {
    if (x > 750) type = 'mutant';
    else if (world.dayPhase === 'night' && Math.random() < 0.6) type = 'wolf';
    else type = Math.random() < 0.5 ? 'slime' : 'wolf';
  }

  monsters.push({
    id: 'M' + Math.floor(Math.random() * 800 + 100),
    x: x,
    y: y,
    type: type, // 'slime', 'wolf', 'mutant'
    hp: type === 'mutant' ? 60 : (type === 'wolf' ? 35 : 22),
    maxHp: type === 'mutant' ? 60 : (type === 'wolf' ? 35 : 22),
    isAggressive: type !== 'slime' || world.bloodMoon,
    isFriendly: false,
    affinity: 0,
    speed: type === 'wolf' ? 1.4 : (type === 'mutant' ? 1.0 : 0.8),
    timer: 0,
    vx: 0,
    vy: 0,
    animTick: Math.random() * 20
  });
}

for (let i = 0; i < 10; i++) spawnMob();

// บอสโลกมังกรโบราณ
function triggerBoss() {
  if (boss) return;
  boss = {
    name: 'Ancient Drake',
    x: 950,
    y: 450,
    hp: 500,
    maxHp: 500,
    w: 48,
    h: 36,
    timer: 0,
    phase: 1
  };
  logChat('ระบบ', '🚨 ป่าพิโรธเต็มพิกัด! มังกรโบราณ Ancient Drake ตื่นขึ้นแล้ว!', '#ff2222');
  callAIDirector("บอส Ancient Drake ตื่นขึ้นมาบุกโลกเพื่อล้างแค้น");
}

// --- 5. การควบคุมและอินพุต ---
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
  if (k === 'w' || k === 'arrowup') { moveState.up = true; player.dir = 'up'; }
  if (k === 's' || k === 'arrowdown') { moveState.down = true; player.dir = 'down'; }
  if (k === 'a' || k === 'arrowleft') { moveState.left = true; player.dir = 'left'; }
  if (k === 'd' || k === 'arrowright') { moveState.right = true; player.dir = 'right'; }
  if (e.code === 'Space') attackSlash();
  if (k === 'q') skillWhirlwind();
  if (k === 'w') skillShield();
  if (k === 'e') skillHeal();
  if (k === 'f') interactOrFeed();
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.up = false;
  if (k === 's' || k === 'arrowdown') moveState.down = false;
  if (k === 'a' || k === 'arrowleft') moveState.left = false;
  if (k === 'd' || k === 'arrowright') moveState.right = false;
});

// --- 6. ระบบการต่อสู้ 3 สกิล และ ปฏิสัมพันธ์ ---
function attackSlash() {
  player.attackTimer = 10;
  dealMeleeDamage(36, player.atk, false);
}

function skillWhirlwind() {
  if (player.mp < 15) {
    particles.push({ text: 'MP ไม่พอ!', x: player.x, y: player.y - 10, color: '#4cc9f0', life: 25 });
    return;
  }
  player.mp -= 15;
  player.spinTimer = 16;
  dealMeleeDamage(55, player.atk * 1.6, true);
  particles.push({ text: '🌀 วายุหมุน!', x: player.x - 6, y: player.y - 12, color: '#4cc9f0', life: 25 });
}

function skillShield() {
  if (player.mp < 20) {
    particles.push({ text: 'MP ไม่พอ!', x: player.x, y: player.y - 10, color: '#4cc9f0', life: 25 });
    return;
  }
  player.mp -= 20;
  player.shieldTimer = 180; // บาเรีย 3 วินาที
  particles.push({ text: '🛡️ บาเรียศักดิ์สิทธิ์!', x: player.x - 14, y: player.y - 12, color: '#ffd166', life: 30 });
}

function skillHeal() {
  if (player.mp < 25) {
    particles.push({ text: 'MP ไม่พอ!', x: player.x, y: player.y - 10, color: '#4cc9f0', life: 25 });
    return;
  }
  player.mp -= 25;
  player.hp = Math.min(player.maxHp, player.hp + 40);
  particles.push({ text: '+40 HP 🌿', x: player.x, y: player.y - 12, color: '#06d6a0', life: 30 });

  // ฮีลมอนสเตอร์สหายด้วย
  monsters.forEach(m => {
    if (m.isFriendly && Math.hypot(m.x - player.x, m.y - player.y) < 80) {
      m.hp = Math.min(m.maxHp, m.hp + 20);
      particles.push({ text: '+20 HP', x: m.x, y: m.y - 8, color: '#06d6a0', life: 25 });
    }
  });
}

function dealMeleeDamage(radius, damage, isAOE) {
  let hit = false;
  monsters.forEach((m, idx) => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < radius && (!hit || isAOE)) {
      hit = true;
      const finalDmg = Math.floor(damage + Math.random() * 4);
      m.hp -= finalDmg;
      m.isAggressive = true;
      m.affinity -= 4;
      particles.push({ text: `-${finalDmg}`, x: m.x, y: m.y - 6, color: '#ff4d4d', life: 25 });

      // AI รวมฝูง: มอนสเตอร์ในระยะ 100px หันมารุมช่วย
      monsters.forEach(other => {
        if (Math.hypot(other.x - m.x, other.y - m.y) < 100 && !other.isFriendly) {
          other.isAggressive = true;
        }
      });

      if (m.hp <= 0) {
        loots.push({ x: m.x, y: m.y, type: 'gold', val: m.type === 'mutant' ? 15 : 6 });
        loots.push({ x: m.x + 4, y: m.y + 4, type: 'exp', val: m.type === 'mutant' ? 25 : 14 });
        
        // ตรวจสอบเควสต์
        if (world.quest.type === 'hunt' && (m.type === 'wolf' || m.type === 'mutant')) {
          world.quest.progress++;
          checkQuestStatus();
        }

        monsters.splice(idx, 1);
        world.forestWrath = Math.min(100, world.forestWrath + 12);
        world.factionForest = Math.max(0, world.factionForest - 4);
        world.factionVillage = Math.min(100, world.factionVillage + 2);
        
        callAIDirector("ผู้เล่นสังหารมอนสเตอร์ในพงไพร");
        if (world.forestWrath >= 100) triggerBoss();
      }
    }
  });

  // โจมตีบอส
  if (boss && Math.hypot(boss.x + 20 - player.x, boss.y + 16 - player.y) < radius + 20) {
    const finalDmg = Math.floor(damage * 1.2);
    boss.hp -= finalDmg;
    particles.push({ text: `-${finalDmg}!`, x: boss.x + 16, y: boss.y - 4, color: '#ffd166', life: 30 });
    if (boss.hp <= 0) {
      logChat('ระบบ', '🏆 มังกรโบราณถูกโค่นล้มแล้ว! ความสงบกลับคืนสู่โลก', '#06d6a0');
      loots.push({ x: boss.x, y: boss.y, type: 'gold', val: 120 });
      loots.push({ x: boss.x + 10, y: boss.y, type: 'exp', val: 150 });
      boss = null;
      world.forestWrath = 0;
      callAIDirector("ผู้เล่นสามารถปราบมังกรโบราณได้สำเร็จ ป่ากลับสู่สันติภาพ");
    }
  }
}

function interactOrFeed() {
  // คุยกับผู้เฒ่า
  if (Math.hypot(elderNPC.x - player.x, elderNPC.y - player.y) < 40) {
    if (world.quest.progress >= world.quest.target) {
      logChat(elderNPC.name, `ทำได้ดีมากเจ้าหนุ่ม! นี่คือทอง ${world.quest.rewardGold} เหรียญ`, '#72dec2');
      player.gold += world.quest.rewardGold;
      player.exp += 30;
      // ให้เควสต์ใหม่
      world.quest = {
        title: 'กำราบหมาป่าทมิฬ',
        desc: 'กำจัดหมาป่าหรืออสูรกลายพันธุ์ 3 ตัว',
        progress: 0,
        target: 3,
        type: 'hunt',
        rewardGold: 50
      };
      updateQuestUI();
    } else {
      logChat(elderNPC.name, 'จงช่วยรักษาสมดุลของป่า อย่าให้ความแค้นพุ่งสูงจนมังกรตื่น!', '#ffd166');
    }
    return;
  }

  // ให้อาหารและผูกมิตรกับมอนสเตอร์
  monsters.forEach(m => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 40 && !m.isFriendly) {
      m.affinity += 5;
      if (m.affinity >= 5) {
        m.isFriendly = true;
        m.isAggressive = false;
        particles.push({ text: '❤️ กลายเป็นมิตร!', x: m.x, y: m.y - 8, color: '#52b788', life: 30 });
        logChat('พงไพร', `${m.id} ไว้วางใจเจ้าแล้ว มันจะคอยปกป้องเจ้าจากศัตรู`, '#b5e2fa');
        
        world.factionForest = Math.min(100, world.factionForest + 6);
        world.forestWrath = Math.max(0, world.forestWrath - 10);
        
        if (world.quest.type === 'feed') {
          world.quest.progress++;
          checkQuestStatus();
        }
        callAIDirector("ผู้เล่นแบ่งปันอาหารและผูกมิตรกับมอนสเตอร์");
      } else {
        particles.push({ text: '+ความผูกพัน 🍎', x: m.x, y: m.y - 6, color: '#ffd166', life: 25 });
      }
    }
  });
}

function checkQuestStatus() {
  updateQuestUI();
  if (world.quest.progress >= world.quest.target) {
    particles.push({ text: '✨ ภารกิจสำเร็จ!', x: player.x - 12, y: player.y - 16, color: '#ffd166', life: 40 });
    logChat('ระบบ', 'ภารกิจสำเร็จแล้ว! กลับไปรับรางวัลที่ผู้เฒ่าในหมู่บ้าน', '#06d6a0');
  }
}

function updateQuestUI() {
  document.getElementById('quest-desc').innerText = 
    `${world.quest.desc} (${world.quest.progress}/${world.quest.target})`;
}

document.getElementById('btn-atk').addEventListener('click', attackSlash);
document.getElementById('btn-spin').addEventListener('click', skillWhirlwind);
document.getElementById('btn-shield').addEventListener('click', skillShield);
document.getElementById('btn-heal').addEventListener('click', skillHeal);
document.getElementById('btn-feed').addEventListener('click', interactOrFeed);

// --- 7. วงจรเกมหลัก (Game Loop & AI Updates) ---
function update() {
  frameCount++;
  player.isMoving = false;

  // วงจรเวลา กลางวัน-กลางคืน
  world.gameMinutes = (world.gameMinutes + 0.1) % 1440;
  const hours = Math.floor(world.gameMinutes / 60);
  if (hours >= 6 && hours < 18) {
    world.dayPhase = 'day';
    document.getElementById('clock-txt').innerText = `☀️ กลางวัน (${String(hours).padStart(2,'0')}:00)`;
  } else {
    world.dayPhase = 'night';
    document.getElementById('clock-txt').innerText = `🌙 กลางคืน (${String(hours).padStart(2,'0')}:00)`;
  }

  // การฟื้นฟู MP อัตโนมัติ
  if (frameCount % 30 === 0 && player.mp < player.maxMp) player.mp++;

  // การเคลื่อนที่ของผู้เล่น
  if (moveState.up) { player.y -= player.speed; player.dir = 'up'; player.isMoving = true; }
  if (moveState.down) { player.y += player.speed; player.dir = 'down'; player.isMoving = true; }
  if (moveState.left) { player.x -= player.speed; player.dir = 'left'; player.isMoving = true; }
  if (moveState.right) { player.x += player.speed; player.dir = 'right'; player.isMoving = true; }

  player.x = Math.max(16, Math.min(MAP_W - 24, player.x));
  player.y = Math.max(16, Math.min(MAP_H - 24, player.y));
  if (player.attackTimer > 0) player.attackTimer--;
  if (player.spinTimer > 0) player.spinTimer--;
  if (player.shieldTimer > 0) player.shieldTimer--;

  // อัปเดตตำแหน่งกล้อง
  camera.x = Math.max(0, Math.min(MAP_W - camera.w, player.x - camera.w / 2));
  camera.y = Math.max(0, Math.min(MAP_H - camera.h, player.y - camera.h / 2));

  // ฮีลเมื่ออยู่ใกล้กองไฟ
  if (Math.hypot(180 - player.x, 180 - player.y) < 45 && frameCount % 35 === 0) {
    if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 5);
      particles.push({ text: '+5 HP', x: player.x, y: player.y - 6, color: '#06d6a0', life: 20 });
    }
  }

  // มอนสเตอร์ AI (รวมฝูง และ สหายรบ)
  monsters.forEach(m => {
    if (m.isFriendly) {
      // มิตรจะพุ่งเข้าโจมตีศัตรูที่ดุร้ายใกล้ตัวที่สุด
      const targetEnemy = boss || monsters.find(other => other.isAggressive && !other.isFriendly);
      const dest = targetEnemy || player;
      const d = Math.hypot(dest.x - m.x, dest.y - m.y);

      if (d > 30) {
        m.x += ((dest.x - m.x) / d) * (m.speed * 1.1);
        m.y += ((dest.y - m.y) / d) * (m.speed * 1.1);
      }
      if (targetEnemy && d < 28 && frameCount % 35 === 0) {
        targetEnemy.hp -= 12;
        particles.push({ text: '-12 สหายรบ', x: targetEnemy.x, y: targetEnemy.y - 4, color: '#52b788', life: 20 });
      }
    } else if (m.isAggressive) {
      const d = Math.hypot(player.x - m.x, player.y - m.y);
      const aggroDist = world.dayPhase === 'night' ? 140 : 90;
      if (d < aggroDist) {
        m.x += ((player.x - m.x) / d) * m.speed;
        m.y += ((player.y - m.y) / d) * m.speed;
        if (d < 16 && frameCount % 40 === 0) {
          if (player.shieldTimer <= 0) {
            const dmg = m.type === 'mutant' ? 14 : 7;
            player.hp = Math.max(0, player.hp - dmg);
            particles.push({ text: `-${dmg}`, x: player.x, y: player.y - 4, color: '#ff2222', life: 20 });
          } else {
            particles.push({ text: '🛡️ บล็อก!', x: player.x, y: player.y - 6, color: '#ffd166', life: 20 });
          }
        }
      }
    } else {
      // เดินสุ่ม
      m.timer--;
      if (m.timer <= 0) {
        m.vx = (Math.random() - 0.5) * 0.6;
        m.vy = (Math.random() - 0.5) * 0.6;
        m.timer = Math.floor(Math.random() * 50) + 30;
      }
      m.x = Math.max(20, Math.min(MAP_W - 20, m.x + m.vx));
      m.y = Math.max(20, Math.min(MAP_H - 20, m.y + m.vy));
    }
  });

  // บอสเคลื่อนที่และโจมตี
  if (boss) {
    boss.timer++;
    const d = Math.hypot(player.x - (boss.x + 24), player.y - (boss.y + 18));
    if (d > 40) {
      boss.x += ((player.x - (boss.x + 24)) / d) * 0.7;
      boss.y += ((player.y - (boss.y + 18)) / d) * 0.7;
    }
    if (d < 45 && boss.timer % 50 === 0) {
      if (player.shieldTimer <= 0) {
        player.hp = Math.max(0, player.hp - 22);
        particles.push({ text: '-22 พ่นเพลิง!', x: player.x, y: player.y - 8, color: '#ff0054', life: 25 });
      } else {
        particles.push({ text: '🛡️ ต้านเพลิง!', x: player.x, y: player.y - 6, color: '#ffd166', life: 20 });
      }
    }
  }

  // เก็บของดรอป
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i];
    if (Math.hypot(player.x - l.x, player.y - l.y) < 22) {
      if (l.type === 'gold') {
        player.gold += l.val;
        particles.push({ text: `+${l.val}🪙`, x: player.x, y: player.y - 6, color: '#ffd166', life: 20 });
      } else {
        player.exp += l.val;
        particles.push({ text: `+${l.val} EXP`, x: player.x, y: player.y - 6, color: '#06d6a0', life: 20 });
        if (player.exp >= player.maxExp) {
          player.level++;
          player.exp = 0;
          player.maxExp = Math.floor(player.maxExp * 1.4);
          player.maxHp += 20;
          player.atk += 3;
          player.hp = player.maxHp;
          particles.push({ text: 'LEVEL UP!! ✨', x: player.x - 14, y: player.y - 14, color: '#fff', life: 40 });
        }
      }
      loots.splice(i, 1);
    }
  }

  if (monsters.length < MAX_MOBS && Math.random() < 0.01) spawnMob();

  // ตัวเลขอัปเดต
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].y -= 0.4;
    particles[i].life--;
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  // อัปเดต HUD
  document.getElementById('lvl-txt').innerText = player.level;
  document.getElementById('gold-txt').innerText = player.gold;
  document.getElementById('wrath-txt').innerText = `${world.forestWrath}%`;
  document.getElementById('hp-bar').style.width = `${(player.hp / player.maxHp) * 100}%`;
  document.getElementById('mp-bar').style.width = `${(player.mp / player.maxMp) * 100}%`;
  
  const karmaName = world.factionForest > 65 ? 'สหายพงไพร' : (world.factionVillage > 65 ? 'อัศวินเมือง' : 'เป็นกลาง');
  document.getElementById('karma-txt').innerText = karmaName;
}

// --- 8. ระบบวาดกราฟิก 8-Bit สมบูรณ์แบบ (Outline, Shading, Pixel Matrix) ---

function drawMatrix(mat, sx, sy, scale = 2) {
  for (let r = 0; r < mat.length; r++) {
    for (let c = 0; c < mat[r].length; c++) {
      const col = mat[r][c];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(Math.floor(sx + c * scale), Math.floor(sy + r * scale), scale, scale);
      }
    }
  }
}

// 1. วาดอัศวิน (Knight with Helmet, Sword, Shield & Outline)
function drawPlayerSprite(x, y, isMoving, dir, tick) {
  const step = isMoving && (Math.floor(tick / 6) % 2 === 0);
  const bootL = step ? '#222' : '#3d3d4e';
  const bootR = step ? '#3d3d4e' : '#222';

  // สไปรต์อัศวิน 8-bit ขนาด 10x12 มีเส้นขอบดำ
  const knight = [
    [null,      null,      '#111',    '#d90429', '#d90429', null,      null,      null], // พู่หมวกแดง
    [null,      '#111',    '#8d99ae', '#8d99ae', '#edf2f4', '#111',    null,      null], // หมวกเกราะ
    ['#111',    '#8d99ae', '#111',    '#ffd8b1', '#111',    '#8d99ae', '#111',    null], // ช่องตา
    ['#111',    '#2b7fff', '#2b7fff', '#ffd166', '#2b7fff', '#2b7fff', '#111',    null], // เกราะอก+ทอง
    ['#e0e0e0', '#111',    '#2b7fff', '#2b7fff', '#2b7fff', '#111',    '#8d99ae', '#111'], // ดาบ+โล่
    ['#e0e0e0', '#111',    '#1c2541', '#1c2541', '#1c2541', '#111',    '#8d99ae', '#111'],
    [null,      '#111',    bootL,     null,      bootR,     '#111',    null,      null]
  ];
  drawMatrix(knight, x - 2, y - 4, 2.5);

  // วงแหวนบาเรียป้องกันตัว
  if (player.shieldTimer > 0) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 8, y + 6, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// 2. วาดสไลม์ป่า (Shaded Animated Slime)
function drawSlimeSprite(x, y, isFriend, tick) {
  const squish = Math.sin(tick * 0.2) > 0;
  const cMain = isFriend ? '#52b788' : '#74c69d';
  const cHigh = isFriend ? '#95d5b2' : '#b7e4c7';
  const cShadow = '#1b4332';

  const slime = squish ? [
    [null,    '#111', '#111', '#111', null],
    ['#111',  cHigh,  cMain,  cMain,  '#111'],
    ['#111',  '#000', cMain,  '#000', '#111'],
    ['#111',  cMain,  cShadow,cMain,  '#111'],
    [null,    '#111', '#111', '#111', null]
  ] : [
    [null,    '#111', '#111', null,   null],
    ['#111',  cHigh,  cMain,  '#111', null],
    ['#111',  '#000', cMain,  '#000', '#111'],
    ['#111',  cMain,  cMain,  cMain,  '#111'],
    ['#111',  cShadow,cShadow,cShadow,'#111']
  ];
  drawMatrix(slime, x, y, 2.6);

  if (isFriend) {
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(x + 4, y - 6, 4, 3);
  }
}

// 3. วาดหมาป่าพงไพร (Dire Wolf 4-legged)
function drawWolfSprite(x, y, tick) {
  const tail = Math.sin(tick * 0.25) > 0 ? '#495057' : '#212529';
  const wolf = [
    [null,    '#111', null,   '#111', null,   null],
    ['#111',  '#6c757d','#6c757d','#6c757d','#111',null],
    ['#111',  '#ff0054','#6c757d','#111', null,  tail],
    ['#111',  '#495057','#495057','#495057','#111',tail],
    [null,    '#111', null,   '#111', null,   null]
  ];
  drawMatrix(wolf, x, y, 2.5);
}

// 4. วาดอสูรกลายพันธุ์ (Shadow Mutant)
function drawMutantSprite(x, y, tick) {
  const hornGlow = tick % 12 < 6 ? '#ffb703' : '#fb8500';
  const mutant = [
    [hornGlow,null,   null,   null,   hornGlow],
    ['#111',  '#d90429','#d90429','#d90429','#111'],
    ['#111',  '#fff', '#111', '#fff', '#111'],
    ['#111',  '#6a040f','#d90429','#6a040f','#111'],
    [null,    '#111', null,   '#111', null]
  ];
  drawMatrix(mutant, x, y, 2.8);
}

// 5. วาดบอสมังกรโบราณ (Elder Dragon 40x32px)
function drawDragonSprite(x, y, tick) {
  const flap = Math.floor(Math.sin(tick * 0.15) * 4);
  // ปีกมังกรกางออก
  ctx.fillStyle = '#4a0e17';
  ctx.fillRect(x - 8, y + 6 + flap, 12, 16);
  ctx.fillRect(x + 36, y + 6 + flap, 12, 16);

  // ตัวมังกรสีแดงเข้ม
  ctx.fillStyle = '#7a0016';
  ctx.fillRect(x, y, 40, 26);
  ctx.fillStyle = '#a0001e';
  ctx.fillRect(x + 4, y + 4, 32, 18);

  // เขาเพลิง
  ctx.fillStyle = '#ffb703';
  ctx.fillRect(x + 6, y - 8, 5, 8);
  ctx.fillRect(x + 29, y - 8, 5, 8);

  // ตาเพลิงมังกรเรืองแสง
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 8, y + 8, 6, 5);
  ctx.fillRect(x + 26, y + 8, 6, 5);
  ctx.fillStyle = '#ff0054';
  ctx.fillRect(x + 10, y + 9, 3, 3);
  ctx.fillRect(x + 28, y + 9, 3, 3);
}

// 6. วาดต้นไม้ 8-Bit มีลวดลาย
function drawTreeTile(x, y) {
  // พุ่มใบไม้ 3 ชั้น
  ctx.fillStyle = '#1b4332';
  ctx.fillRect(x - 2, y, 24, 18);
  ctx.fillStyle = '#2d6a4f';
  ctx.fillRect(x + 2, y + 2, 16, 12);
  ctx.fillStyle = '#40916c';
  ctx.fillRect(x + 5, y + 4, 10, 6);
  // ลำต้น
  ctx.fillStyle = '#582f0e';
  ctx.fillRect(x + 7, y + 18, 6, 10);
}

// 7. วาดกองไฟที่มีเปลวไฟเต้น
function drawCampfire(x, y, tick) {
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x - 4, y + 10, 20, 6);
  const fColor = tick % 8 < 4 ? '#ff5400' : '#ffbe0b';
  ctx.fillStyle = fColor;
  ctx.fillRect(x + 2, y + 2, 8, 10);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 4, y + 4, 4, 5);
}

// --- 9. ลูปวาดหน้าจอ (Render Function) ---
function render() {
  ctx.clearRect(0, 0, canvas.w, canvas.h);

  // พื้นหญ้า 8-bit พร้อมใบหญ้าแซม
  ctx.fillStyle = '#1b281c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ลวดลายพื้นดินและเส้นทางเดิน
  ctx.fillStyle = '#223523';
  const startX = Math.floor(camera.x / 32) * 32;
  const startY = Math.floor(camera.y / 32) * 32;
  for (let gx = startX; gx < camera.x + camera.w + 32; gx += 32) {
    for (let gy = startY; gy < camera.y + camera.h + 32; gy += 32) {
      if ((gx + gy) % 64 === 0) {
        ctx.fillRect(gx - camera.x + 8, gy - camera.y + 8, 3, 3);
        ctx.fillRect(gx - camera.x + 18, gy - camera.y + 14, 2, 2);
      }
    }
  }

  // ทางเดินหินในหมู่บ้าน
  ctx.fillStyle = '#3a3d40';
  for (let px = 160; px <= 320; px += 24) {
    ctx.fillRect(px - camera.x, 190 - camera.y, 18, 12);
  }

  // วาดสิ่งแวดล้อม (ต้นไม้ / หิน)
  scenery.forEach(s => {
    const sx = s.x - camera.x;
    const sy = s.y - camera.y;
    if (sx > -40 && sx < canvas.width + 40 && sy > -40 && sy < canvas.height + 40) {
      if (s.type === 'tree') drawTreeTile(sx, sy);
      else {
        ctx.fillStyle = '#495057';
        ctx.fillRect(sx, sy + 2, 16, 12);
        ctx.fillStyle = '#6c757d';
        ctx.fillRect(sx + 3, sy + 4, 10, 6);
      }
    }
  });

  // วาดกองไฟหมู่บ้าน
  drawCampfire(180 - camera.x, 180 - camera.y, frameCount);

  // วาดผู้เฒ่า NPC
  const ex = elderNPC.x - camera.x;
  const ey = elderNPC.y - camera.y;
  ctx.fillStyle = '#4361ee';
  ctx.fillRect(ex, ey, 14, 16);
  ctx.fillStyle = '#ffd8b1';
  ctx.fillRect(ex + 3, ey + 2, 8, 6);
  ctx.fillStyle = '#fff';
  ctx.fillRect(ex + 2, ey + 8, 10, 8); // หนวดเคราขาว
  ctx.fillStyle = '#ffd166';
  ctx.font = '8px monospace';
  ctx.fillText('ผู้เฒ่า', ex - 2, ey - 3);

  // วาดของดรอป
  loots.forEach(l => {
    ctx.fillStyle = l.type === 'gold' ? '#ffd166' : '#4cc9f0';
    ctx.fillRect(l.x - camera.x, l.y - camera.y, 4, 4);
  });

  // วาดมอนสเตอร์ 8-bit
  monsters.forEach(m => {
    const mx = m.x - camera.x;
    const my = m.y - camera.y;
    if (mx > -30 && mx < canvas.width + 30 && my > -30 && my < canvas.height + 30) {
      if (m.type === 'mutant') drawMutantSprite(mx, my, frameCount);
      else if (m.type === 'wolf') drawWolfSprite(mx, my, frameCount);
      else drawSlimeSprite(mx, my, m.isFriendly, frameCount);

      // แถบเลือด
      if (m.hp < m.maxHp) {
        ctx.fillStyle = '#111';
        ctx.fillRect(mx, my - 5, 14, 2);
        ctx.fillStyle = '#ff3333';
        ctx.fillRect(mx, my - 5, (m.hp / m.maxHp) * 14, 2);
      }
    }
  });

  // วาดบอสมังกร
  if (boss) {
    const bx = boss.x - camera.x;
    const by = boss.y - camera.y;
    drawDragonSprite(bx, by, frameCount);
    // แถบเลือดบอส
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by - 12, 44, 4);
    ctx.fillStyle = '#ff0054';
    ctx.fillRect(bx, by - 12, (boss.hp / boss.maxHp) * 44, 4);
  }

  // วาดตัวละครผู้เล่น (Knight)
  drawPlayerSprite(player.x - camera.x, player.y - camera.y, player.isMoving, player.dir, frameCount);

  // วาดเอฟเฟกต์ฟันดาบ / วายุหมุน
  if (player.attackTimer > 0) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x - camera.x + 8, player.y - camera.y + 8, 18, 0, Math.PI);
    ctx.stroke();
  }
  if (player.spinTimer > 0) {
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x - camera.x + 8, player.y - camera.y + 8, 28, 0, Math.PI * 2);
    ctx.stroke();
  }

  // บรรยากาศเวลากลางคืน (Night Shade Overlay with Light Circles)
  if (world.dayPhase === 'night') {
    ctx.fillStyle = 'rgba(10, 15, 30, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ตัวเลขดาเมจ
  particles.forEach(pt => {
    ctx.fillStyle = pt.color;
    ctx.font = 'bold 8px monospace';
    ctx.fillText(pt.text, pt.x - camera.x, pt.y - camera.y);
  });

  requestAnimationFrame(() => {
    update();
    render();
  });
}

render();

// --- 10. AI World Director (สมองกลควบคุมระบบเกม) ---
// --- 10. AI World Director (แก้ไขให้ตัด Error และมีระบบสำรองในตัว) ---
let isAiBusy = false;

// คลังปัญญาสำรองในเครื่อง (ทำงานอัตโนมัติเมื่อ API ภายนอกขัดข้อง)
function generateLocalAIDirector(eventContext) {
  const wrath = world.forestWrath;
  let response = '';

  if (eventContext.includes('มังกร')) {
    response = 'แผ่นดินสะเทือนเลื่อนลั่น กลิ่นอายแห่งความพินาศแผ่ซ่านไปทั่วซากโบราณ!';
  } else if (wrath >= 60) {
    const msgs = [
      'สายลมกรีดร้องด้วยความโกรธา ผืนป่ากำลังจดจำความตายของสรรพสัตว์...',
      'ไอหมอกสีเลือดเริ่มลอยต่ำ ความมืดกำลังกลืนกินความสงบสุข',
      'เสียงคำรามลึกลับดังก้องจากส่วนลึกของซากปรักหักพัง'
    ];
    response = msgs[Math.floor(Math.random() * msgs.length)];
  } else if (eventContext.includes('ผูกมิตร') || eventContext.includes('แบ่งปัน')) {
    const msgs = [
      'สายลมอ่อนโยนพัดผ่าน สรรพสัตว์เริ่มรับรู้ถึงไมตรีจิตของเจ้า',
      'ประกายแสงแห่งพงไพรตอบรับ มิตรภาพจะนำพาความอยู่รอด',
      'วิญญาณแห่งผืนป่ายิ้มรับความเมตตาที่เจ้ามอบให้'
    ];
    response = msgs[Math.floor(Math.random() * msgs.length)];
  } else {
    const msgs = [
      'ชะตากรรมของโลกใบนี้ขึ้นอยู่กับทุกย่างก้าวที่เจ้าเลือกเดิน',
      'กาลเวลาหมุนเวียน สิ่งมีชีวิตต่างดิ้นรนเพื่อเอาชีวิตรอด',
      'ความเงียบสงัดเข้าปกคลุม แต่จงระวังภัยที่ซ่อนในเงามืด'
    ];
    response = msgs[Math.floor(Math.random() * msgs.length)];
  }

  logChat('เจตจำนงแห่งโลก', response, '#72dec2');
}

async function callAIDirector(eventContext) {
  if (isAiBusy) return;
  isAiBusy = true;

  try {
    const prompt = `คุณคือ AI Game Master ควบคุมเกม RPG แฟนตาซี
สถานะ: ป่าพิโรธ ${world.forestWrath}%, เวลา ${world.dayPhase}, เลเวล Lv.${player.level}
เหตุการณ์: ${eventContext}
คำสั่ง: แต่งคำพูดกระซิบของป่าหรือลางบอกเหตุ 1 ประโยคสั้นๆ (ไม่เกิน 15 คำ) ตอบเป็นภาษาไทย`;

    logChat('AI Master', 'กำลังประเมินผลกระทบต่อระบบนิเวศ...', '#888');

    // 👉 ตัด ?model=qwen ออก เพื่อใช้โมเดลหลักฟรีที่ไม่ติด Error 404
    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
    const res = await fetch(url);
    const msg = await res.text();

    // กรองข้อความ: หากไม่ใช่ JSON Error ให้แสดงผล แต่หากมี Error ให้ใช้ระบบสำรองทันที
    if (msg && !msg.includes('error') && !msg.includes('status') && !msg.trim().startsWith('{')) {
      logChat('เจตจำนงแห่งโลก', msg.trim(), '#72dec2');

      // AI เปลี่ยนแปลงกฎของเกมจริงตามระดับความแค้น
      if (world.forestWrath >= 60 && !world.bloodMoon) {
        world.bloodMoon = true;
        logChat('ภัยพิบัติ', '🌑 จันทราสีเลือดปรากฏ! มอนสเตอร์ทุกตัวติดสถานะคลุ้มคลั่ง', '#ff0054');
      } else if (world.forestWrath < 30 && world.bloodMoon) {
        world.bloodMoon = false;
        logChat('สมดุล', '🌿 ความมืดสลายไป มอนสเตอร์กลับสู่สภาวะปกติ', '#52b788');
      }
    } else {
      generateLocalAIDirector(eventContext);
    }
  } catch (e) {
    // หากเน็ตหลุดหรือออฟไลน์ ให้ใช้ระบบสำรองอัตโนมัติ
    generateLocalAIDirector(eventContext);
  } finally {
    setTimeout(() => { isAiBusy = false; }, 4000);
  }
}

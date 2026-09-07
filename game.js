const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('miniMap');
const mCtx = mCanvas ? mCanvas.getContext('2d') : null;
ctx.imageSmoothingEnabled = false;

// --- 1. ขนาดแผนที่และกล้อง (World Dimensions & Camera) ---
const MAP_W = 1200;
const MAP_H = 900;
const camera = { x: 0, y: 0, w: 320, h: 240 };

// --- 2. ข้อมูลผู้เล่นและระบบ RPG เชิงลึก (Player & Inventory) ---
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
  gold: 20,
  atk: 18,
  // คลังไอเทมและวัตถุดิบ
  inv: {
    wood: 2,
    ore: 2,
    hpPot: 2,
    mpPot: 1,
    hasIronSword: false,
    hasArmor: false
  },
  shieldTimer: 0,
  attackTimer: 0,
  spinTimer: 0
};

// สภาวะโลก กลางวัน-กลางคืน และ 3 ฝ่าย
const world = {
  gameMinutes: 720, // 12:00 เที่ยงวัน
  dayPhase: 'day',
  forestWrath: 0,
  factionVillage: 50,
  factionForest: 50,
  bloodMoon: false,
  quest: {
    title: 'เริ่มต้นการเดินทาง',
    desc: 'ฟันต้นไม้หรือขุดหินเพื่อสะสมวัตถุดิบ 4 ชิ้น',
    progress: 0,
    target: 4,
    type: 'gather',
    rewardGold: 40
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

// --- 3. สิ่งแวดล้อม วัตถุที่ฟาร์มได้ และจุดสำคัญ ---
let frameCount = 0;
const loots = [];
const particles = [];
let boss = null;

// กองไฟหมู่บ้านและคบเพลิง
const campfire = { x: 180, y: 180 };
const anvil = { x: 200, y: 210 };
const elderNPC = { x: 240, y: 170, name: 'ผู้เฒ่าเอลรอนด์' };

// ทรัพยากรที่ฟาร์มได้ (ตัดไม้ & ขุดแร่)
const harvestables = [];
for (let i = 0; i < 32; i++) {
  harvestables.push({
    x: Math.random() * (MAP_W - 140) + 70,
    y: Math.random() * (MAP_H - 140) + 70,
    type: 'tree',
    hp: 3,
    maxHp: 3,
    respawn: 0
  });
}
for (let i = 0; i < 20; i++) {
  harvestables.push({
    x: Math.random() * (MAP_W - 140) + 70,
    y: Math.random() * (MAP_H - 140) + 70,
    type: 'rock',
    hp: 4,
    maxHp: 4,
    respawn: 0
  });
}

// --- 4. มอนสเตอร์และระบบฝูง (Tactical AI System) ---
const monsters = [];
const MAX_MOBS = 12;

function spawnMob(typeOverride = null) {
  const x = Math.random() * (MAP_W - 120) + 60;
  const y = Math.random() * (MAP_H - 120) + 60;
  let type = typeOverride || (x > 750 ? 'mutant' : (Math.random() < 0.5 ? 'slime' : 'wolf'));

  monsters.push({
    id: 'M' + Math.floor(Math.random() * 800 + 100),
    x: x,
    y: y,
    type: type,
    hp: type === 'mutant' ? 65 : (type === 'wolf' ? 35 : 22),
    maxHp: type === 'mutant' ? 65 : (type === 'wolf' ? 35 : 22),
    isAggressive: type !== 'slime' || world.bloodMoon,
    isFriendly: false,
    affinity: 0,
    speed: type === 'wolf' ? 1.4 : (type === 'mutant' ? 1.0 : 0.8),
    timer: 0,
    vx: 0,
    vy: 0
  });
}

for (let i = 0; i < 10; i++) spawnMob();

// ปลุกบอสโลกมังกรโบราณ
function triggerBoss() {
  if (boss) return;
  boss = {
    name: 'Ancient Drake',
    x: 950,
    y: 450,
    hp: 500,
    maxHp: 500,
    timer: 0
  };
  logChat('ระบบ', '🚨 ป่าพิโรธเต็มพิกัด! มังกรโบราณ Ancient Drake ตื่นขึ้นแล้ว!', '#ff2222');
  callAIDirector("บอส Ancient Drake ตื่นขึ้นมาบุกโลกเพื่อล้างแค้น");
}

// --- 5. การควบคุม อินพุต และระบบกระเป๋า ---
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
  if (e.code === 'Space') actionAttackOrHarvest();
  if (k === 'q') skillWhirlwind();
  if (k === 'w') skillShield();
  if (k === 'e') skillHeal();
  if (k === 'f') interactOrFeed();
  if (k === 'i' || k === 'b') toggleInventory();
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.up = false;
  if (k === 's' || k === 'arrowdown') moveState.down = false;
  if (k === 'a' || k === 'arrowleft') moveState.left = false;
  if (k === 'd' || k === 'arrowright') moveState.right = false;
});

// จัดการหน้าต่างกระเป๋าและร้านตีเหล็ก
function toggleInventory() {
  const modal = document.getElementById('inventory-modal');
  if (!modal) return;
  modal.classList.toggle('hidden');
  updateInventoryUI();
}

function updateInventoryUI() {
  const elWood = document.getElementById('mat-wood');
  const elOre = document.getElementById('mat-ore');
  const elHp = document.getElementById('pot-hp');
  const elMp = document.getElementById('pot-mp');
  if (elWood) elWood.innerText = player.inv.wood;
  if (elOre) elOre.innerText = player.inv.ore;
  if (elHp) elHp.innerText = player.inv.hpPot;
  if (elMp) elMp.innerText = player.inv.mpPot;
}

document.getElementById('btn-bag')?.addEventListener('click', toggleInventory);
document.getElementById('btn-close-inv')?.addEventListener('click', toggleInventory);

// ดื่มยาฟื้นฟู
document.getElementById('btn-use-hp')?.addEventListener('click', () => {
  if (player.inv.hpPot > 0 && player.hp < player.maxHp) {
    player.inv.hpPot--;
    player.hp = Math.min(player.maxHp, player.hp + 50);
    particles.push({ text: '+50 HP 🧪', x: player.x, y: player.y - 12, color: '#06d6a0', life: 30 });
    updateInventoryUI();
  }
});

document.getElementById('btn-use-mp')?.addEventListener('click', () => {
  if (player.inv.mpPot > 0 && player.mp < player.maxMp) {
    player.inv.mpPot--;
    player.mp = Math.min(player.maxMp, player.mp + 40);
    particles.push({ text: '+40 MP 💧', x: player.x, y: player.y - 12, color: '#118ab2', life: 30 });
    updateInventoryUI();
  }
});

// ตีดาบเหล็กกล้า
document.getElementById('btn-craft-sword')?.addEventListener('click', () => {
  if (player.inv.hasIronSword) {
    logChat('ช่างตีเหล็ก', 'คุณมีดาบเหล็กกล้าแล้ว!', '#ffd166');
    return;
  }
  if (player.inv.ore >= 5 && player.inv.wood >= 5) {
    player.inv.ore -= 5;
    player.inv.wood -= 5;
    player.inv.hasIronSword = true;
    player.atk += 10;
    particles.push({ text: '⚔️ คราฟต์ดาบสำเร็จ (+10 ATK)!', x: player.x - 20, y: player.y - 16, color: '#ffd166', life: 40 });
    logChat('ช่างตีเหล็ก', 'ตีดาบเหล็กกล้าสำเร็จ! คมดาบเปล่งประกายคมกริบ', '#72dec2');
    updateInventoryUI();
  } else {
    logChat('ช่างตีเหล็ก', 'วัตถุดิบไม่พอ (ต้องการ แร่ 5, ไม้ 5)', '#ff5555');
  }
});

// ตีเกราะอัศวิน
document.getElementById('btn-craft-armor')?.addEventListener('click', () => {
  if (player.inv.hasArmor) {
    logChat('ช่างตีเหล็ก', 'คุณสวมเกราะอัศวินอยู่แล้ว!', '#ffd166');
    return;
  }
  if (player.inv.ore >= 8 && player.inv.wood >= 4) {
    player.inv.ore -= 8;
    player.inv.wood -= 4;
    player.inv.hasArmor = true;
    player.maxHp += 30;
    player.hp += 30;
    particles.push({ text: '🛡️ คราฟต์เกราะสำเร็จ (+30 HP)!', x: player.x - 20, y: player.y - 16, color: '#06d6a0', life: 40 });
    logChat('ช่างตีเหล็ก', 'ประกอบเกราะอัศวินสำเร็จ! พลังชีวิตเพิ่มขึ้น', '#72dec2');
    updateInventoryUI();
  } else {
    logChat('ช่างตีเหล็ก', 'วัตถุดิบไม่พอ (ต้องการ แร่ 8, ไม้ 4)', '#ff5555');
  }
});

// --- 6. ระบบต่อสู้ การฟาร์ม และ 3 สกิล ---
function actionAttackOrHarvest() {
  player.attackTimer = 10;
  let didHarvest = false;

  // ตรวจจับการตัดไม้ / ขุดแร่
  harvestables.forEach(h => {
    if (h.hp > 0 && Math.hypot(h.x - player.x, h.y - player.y) < 34) {
      didHarvest = true;
      h.hp--;
      const icon = h.type === 'tree' ? '🪵' : '⛏️';
      particles.push({ text: `ฟัน! ${icon}`, x: h.x, y: h.y - 4, color: '#ffd166', life: 20 });

      if (h.hp <= 0) {
        h.respawn = 300;
        if (h.type === 'tree') {
          player.inv.wood += 2;
          particles.push({ text: '+2 ไม้ 🪵', x: player.x, y: player.y - 10, color: '#a68a64', life: 25 });
        } else {
          player.inv.ore += 2;
          particles.push({ text: '+2 แร่เหล็ก ⛏️', x: player.x, y: player.y - 10, color: '#adb5bd', life: 25 });
        }
        
        if (world.quest.type === 'gather') {
          world.quest.progress += 2;
          checkQuestStatus();
        }
        updateInventoryUI();
      }
    }
  });

  if (!didHarvest) {
    dealMeleeDamage(36, player.atk, false);
  }
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
  player.shieldTimer = 180;
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
      const isCrit = Math.random() < 0.2;
      const finalDmg = Math.floor((damage + Math.random() * 4) * (isCrit ? 1.75 : 1.0));
      m.hp -= finalDmg;
      m.isAggressive = true;
      m.affinity -= 4;

      particles.push({
        text: isCrit ? `CRIT! -${finalDmg}` : `-${finalDmg}`,
        x: m.x,
        y: m.y - 6,
        color: isCrit ? '#ff9e00' : '#ff4d4d',
        life: 25
      });

      // AI รวมฝูง: มอนสเตอร์ในรัศมี 100px วิ่งเข้ามารุมช่วย
      monsters.forEach(other => {
        if (Math.hypot(other.x - m.x, other.y - m.y) < 100 && !other.isFriendly) {
          other.isAggressive = true;
        }
      });

      if (m.hp <= 0) {
        loots.push({ x: m.x, y: m.y, type: 'gold', val: m.type === 'mutant' ? 15 : 6 });
        loots.push({ x: m.x + 4, y: m.y + 4, type: 'exp', val: m.type === 'mutant' ? 25 : 14 });
        
        if (Math.random() < 0.35) {
          loots.push({ x: m.x - 4, y: m.y, type: 'pot', val: 1 });
        }

        if (world.quest.type === 'hunt' && (m.type === 'wolf' || m.type === 'mutant')) {
          world.quest.progress++;
          checkQuestStatus();
        }

        monsters.splice(idx, 1);
        world.forestWrath = Math.min(100, world.forestWrath + 12);
        callAIDirector("ผู้เล่นสังหารมอนสเตอร์ในพงไพร");
        if (world.forestWrath >= 100) triggerBoss();
      }
    }
  });

  if (boss && Math.hypot(boss.x + 20 - player.x, boss.y + 16 - player.y) < radius + 20) {
    const finalDmg = Math.floor(damage * 1.2);
    boss.hp -= finalDmg;
    particles.push({ text: `-${finalDmg}!`, x: boss.x + 16, y: boss.y - 4, color: '#ffd166', life: 30 });
    if (boss.hp <= 0) {
      logChat('ระบบ', '🏆 มังกรโบราณถูกโค่นล้มแล้ว! สันติภาพกลับคืนสู่โลก', '#06d6a0');
      loots.push({ x: boss.x, y: boss.y, type: 'gold', val: 120 });
      loots.push({ x: boss.x + 10, y: boss.y, type: 'exp', val: 150 });
      boss = null;
      world.forestWrath = 0;
      callAIDirector("ผู้เล่นสามารถปราบมังกรโบราณได้สำเร็จ ป่ากลับสู่สันติภาพ");
    }
  }
}

function interactOrFeed() {
  if (Math.hypot(elderNPC.x - player.x, elderNPC.y - player.y) < 40) {
    if (world.quest.progress >= world.quest.target) {
      logChat(elderNPC.name, `ทำได้ดีมาก! นี่คือทอง ${world.quest.rewardGold} เหรียญ`, '#72dec2');
      player.gold += world.quest.rewardGold;
      player.exp += 30;
      world.quest = {
        title: 'ผู้พิทักษ์พงไพร',
        desc: 'แบ่งอาหารให้สไลม์ป่า 2 ตัว เพื่อฟื้นฟูมิตรภาพ',
        progress: 0,
        target: 2,
        type: 'feed',
        rewardGold: 45
      };
      updateQuestUI();
    } else {
      logChat(elderNPC.name, 'ตัดไม้และขุดแร่มาคราฟต์อาวุธที่ทั่งตีเหล็กข้างกองไฟสิเจ้าหนุ่ม!', '#ffd166');
    }
    return;
  }

  monsters.forEach(m => {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 40 && !m.isFriendly) {
      m.affinity += 5;
      if (m.affinity >= 5) {
        m.isFriendly = true;
        m.isAggressive = false;
        particles.push({ text: '❤️ กลายเป็นมิตร!', x: m.x, y: m.y - 8, color: '#52b788', life: 30 });
        logChat('พงไพร', `${m.id} ไว้วางใจเจ้าแล้ว มันจะคอยปกป้องเจ้าจากศัตรู`, '#b5e2fa');
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
  const el = document.getElementById('quest-desc');
  if (el) el.innerText = `${world.quest.desc} (${world.quest.progress}/${world.quest.target})`;
}

document.getElementById('btn-atk')?.addEventListener('click', actionAttackOrHarvest);
document.getElementById('btn-spin')?.addEventListener('click', skillWhirlwind);
document.getElementById('btn-shield')?.addEventListener('click', skillShield);
document.getElementById('btn-heal')?.addEventListener('click', skillHeal);
document.getElementById('btn-feed')?.addEventListener('click', interactOrFeed);

// --- 7. วงจรเกมหลัก (Update Loop) ---
function update() {
  frameCount++;
  player.isMoving = false;

  world.gameMinutes = (world.gameMinutes + 0.1) % 1440;
  const hours = Math.floor(world.gameMinutes / 60);
  world.dayPhase = (hours >= 6 && hours < 18) ? 'day' : 'night';
  const elClock = document.getElementById('clock-txt');
  if (elClock) elClock.innerText = `${world.dayPhase === 'day' ? '☀️' : '🌙'} ${String(hours).padStart(2,'0')}:00`;

  if (frameCount % 30 === 0 && player.mp < player.maxMp) player.mp++;

  if (moveState.up) { player.y -= player.speed; player.dir = 'up'; player.isMoving = true; }
  if (moveState.down) { player.y += player.speed; player.dir = 'down'; player.isMoving = true; }
  if (moveState.left) { player.x -= player.speed; player.dir = 'left'; player.isMoving = true; }
  if (moveState.right) { player.x += player.speed; player.dir = 'right'; player.isMoving = true; }

  player.x = Math.max(16, Math.min(MAP_W - 24, player.x));
  player.y = Math.max(16, Math.min(MAP_H - 24, player.y));
  if (player.attackTimer > 0) player.attackTimer--;
  if (player.spinTimer > 0) player.spinTimer--;
  if (player.shieldTimer > 0) player.shieldTimer--;

  camera.x = Math.max(0, Math.min(MAP_W - camera.w, player.x - camera.w / 2));
  camera.y = Math.max(0, Math.min(MAP_H - camera.h, player.y - camera.h / 2));

  // ฮีลใกล้กองไฟ
  if (Math.hypot(campfire.x - player.x, campfire.y - player.y) < 45 && frameCount % 35 === 0) {
    if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 5);
      particles.push({ text: '+5 HP', x: player.x, y: player.y - 6, color: '#06d6a0', life: 20 });
    }
  }

  // คูลดาวน์การเกิดใหม่ของต้นไม้/หิน
  harvestables.forEach(h => {
    if (h.respawn > 0) {
      h.respawn--;
      if (h.respawn <= 0) h.hp = h.maxHp;
    }
  });

  // มอนสเตอร์ AI (ฝูง และ สหายรบ)
  monsters.forEach(m => {
    if (m.isFriendly) {
      const target = boss || monsters.find(o => o.isAggressive && !o.isFriendly) || player;
      const d = Math.hypot(target.x - m.x, target.y - m.y);
      if (d > 30) {
        m.x += ((target.x - m.x) / d) * (m.speed * 1.1);
        m.y += ((target.y - m.y) / d) * (m.speed * 1.1);
      }
      if (target !== player && d < 28 && frameCount % 35 === 0) {
        target.hp -= 12;
        particles.push({ text: '-12 สหายรบ', x: target.x, y: target.y - 4, color: '#52b788', life: 20 });
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

  // บอส
  if (boss) {
    boss.timer++;
    const d = Math.hypot(player.x - (boss.x + 20), player.y - (boss.y + 16));
    if (d > 40) {
      boss.x += ((player.x - (boss.x + 20)) / d) * 0.7;
      boss.y += ((player.y - (boss.y + 16)) / d) * 0.7;
    }
    if (d < 45 && boss.timer % 50 === 0) {
      if (player.shieldTimer <= 0) {
        player.hp = Math.max(0, player.hp - 22);
        particles.push({ text: '-22 พ่นเพลิง!', x: player.x, y: player.y - 8, color: '#ff0054', life: 25 });
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
      } else if (l.type === 'exp') {
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
      } else if (l.type === 'pot') {
        player.inv.hpPot++;
        particles.push({ text: '+1 ยาแดง 🧪', x: player.x, y: player.y - 8, color: '#06d6a0', life: 25 });
        updateInventoryUI();
      }
      loots.splice(i, 1);
    }
  }

  if (monsters.length < MAX_MOBS && Math.random() < 0.01) spawnMob();

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].y -= 0.4;
    particles[i].life--;
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  // อัปเดตโซน
  let currentZone = 'ป่าพงไพร';
  if (player.x < 320 && player.y < 300) currentZone = 'หมู่บ้าน';
  else if (player.x > 700) currentZone = 'ซากโบราณสถาน';
  const elZone = document.getElementById('zone-txt');
  if (elZone) elZone.innerText = currentZone;

  document.getElementById('lvl-txt').innerText = player.level;
  document.getElementById('gold-txt').innerText = player.gold;
  document.getElementById('hp-bar').style.width = `${(player.hp / player.maxHp) * 100}%`;
  document.getElementById('mp-bar').style.width = `${(player.mp / player.maxMp) * 100}%`;
}

// --- 8. ระบบวาดกราฟิกพิกเซลอาร์ต 8-Bit แท้ (Full Pixel Matrix & Shading) ---

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

// 1. อัศวินผู้เล่น (มีหมวกเกราะ พู่แดง ดาบ โล่ และก้าวขา)
function drawPlayerSprite(x, y, isMoving, tick) {
  const step = isMoving && (Math.floor(tick / 6) % 2 === 0);
  const bootL = step ? '#222' : '#3d3d4e';
  const bootR = step ? '#3d3d4e' : '#222';

  const knight = [
    [null,      null,      '#111',    '#d90429', '#d90429', null,      null,      null],
    [null,      '#111',    '#8d99ae', '#8d99ae', '#edf2f4', '#111',    null,      null],
    ['#111',    '#8d99ae', '#111',    '#ffd8b1', '#111',    '#8d99ae', '#111',    null],
    ['#111',    '#2b7fff', '#2b7fff', '#ffd166', '#2b7fff', '#2b7fff', '#111',    null],
    ['#e0e0e0', '#111',    '#2b7fff', '#2b7fff', '#2b7fff', '#111',    '#8d99ae', '#111'],
    ['#e0e0e0', '#111',    '#1c2541', '#1c2541', '#1c2541', '#111',    '#8d99ae', '#111'],
    [null,      '#111',    bootL,     null,      bootR,     '#111',    null,      null]
  ];
  drawMatrix(knight, x - 2, y - 4, 2.5);

  if (player.shieldTimer > 0) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 8, y + 6, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// 2. สไลม์ป่า (Shaded & Bouncy Slime)
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

// 3. หมาป่าพงไพร 4 ขา (Dire Wolf with Wagging Tail)
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

// 4. อสูรกลายพันธุ์ (Shadow Mutant with Horns)
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

// 5. บอสมังกรโบราณ 48px กางปีกและมีดวงตาเพลิง
function drawDragonSprite(x, y, tick) {
  const flap = Math.floor(Math.sin(tick * 0.15) * 4);
  ctx.fillStyle = '#4a0e17';
  ctx.fillRect(x - 8, y + 6 + flap, 12, 16);
  ctx.fillRect(x + 36, y + 6 + flap, 12, 16);

  ctx.fillStyle = '#7a0016';
  ctx.fillRect(x, y, 40, 26);
  ctx.fillStyle = '#a0001e';
  ctx.fillRect(x + 4, y + 4, 32, 18);

  ctx.fillStyle = '#ffb703';
  ctx.fillRect(x + 6, y - 8, 5, 8);
  ctx.fillRect(x + 29, y - 8, 5, 8);

  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 8, y + 8, 6, 5);
  ctx.fillRect(x + 26, y + 8, 6, 5);
  ctx.fillStyle = '#ff0054';
  ctx.fillRect(x + 10, y + 9, 3, 3);
  ctx.fillRect(x + 28, y + 9, 3, 3);
}

// 6. ต้นไม้ 8-Bit พุ่มใบ 3 ชั้น
function drawTreeTile(x, y) {
  ctx.fillStyle = '#1b4332';
  ctx.fillRect(x - 2, y, 24, 18);
  ctx.fillStyle = '#2d6a4f';
  ctx.fillRect(x + 2, y + 2, 16, 12);
  ctx.fillStyle = '#40916c';
  ctx.fillRect(x + 5, y + 4, 10, 6);
  ctx.fillStyle = '#582f0e';
  ctx.fillRect(x + 7, y + 18, 6, 10);
}

// 7. กองไฟหมู่บ้าน
function drawCampfire(x, y, tick) {
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x - 4, y + 10, 20, 6);
  const fColor = tick % 8 < 4 ? '#ff5400' : '#ffbe0b';
  ctx.fillStyle = fColor;
  ctx.fillRect(x + 2, y + 2, 8, 10);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 4, y + 4, 4, 5);
}

// 8. ผู้เฒ่า NPC
function drawElder(x, y) {
  const sprite = [
    [null,      '#3a0ca3', '#3a0ca3', '#3a0ca3', null],
    ['#3a0ca3', '#ffd8b1', '#111',    '#ffd8b1', '#3a0ca3'],
    [null,      '#ffffff', '#ffffff', '#ffffff', null],
    ['#4361ee', '#4361ee', '#4361ee', '#4361ee', '#4361ee'],
    [null,      '#4361ee', '#4361ee', '#4361ee', null]
  ];
  drawMatrix(sprite, x, y, 2.5);
  ctx.fillStyle = '#ffd166';
  ctx.font = '8px monospace';
  ctx.fillText('ผู้เฒ่า', x - 4, y - 3);
}

// 9. ทั่งตีเหล็ก
function drawAnvil(x, y) {
  ctx.fillStyle = '#495057';
  ctx.fillRect(x, y + 4, 16, 8);
  ctx.fillStyle = '#6c757d';
  ctx.fillRect(x + 2, y, 12, 5);
  ctx.fillStyle = '#ffd166';
  ctx.font = '7px monospace';
  ctx.fillText('ร้านตีเหล็ก', x - 6, y - 3);
}

// 10. เรนเดอร์มินิแมพ
function renderMiniMap() {
  if (!mCtx) return;
  mCtx.fillStyle = '#0a0a0f';
  mCtx.fillRect(0, 0, mCanvas.width, mCanvas.height);

  const scaleX = mCanvas.width / MAP_W;
  const scaleY = mCanvas.height / MAP_H;

  mCtx.fillStyle = '#ffd166';
  mCtx.fillRect(campfire.x * scaleX, campfire.y * scaleY, 2, 2);

  monsters.forEach(m => {
    mCtx.fillStyle = m.isFriendly ? '#52b788' : '#ff4d4d';
    mCtx.fillRect(m.x * scaleX, m.y * scaleY, 1.5, 1.5);
  });

  if (boss) {
    mCtx.fillStyle = '#ff0054';
    mCtx.fillRect(boss.x * scaleX, boss.y * scaleY, 3, 3);
  }

  mCtx.fillStyle = '#4cc9f0';
  mCtx.fillRect(player.x * scaleX, player.y * scaleY, 2, 2);
}

// --- 9. ลูปวาดหน้าจอทั้งหมด (Full Render Loop) ---
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // พื้นหญ้า 8-Bit
  ctx.fillStyle = '#1b281c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ลวดลายพื้นดิน
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

  // วาดทั่งตีเหล็ก
  drawAnvil(anvil.x - camera.x, anvil.y - camera.y);

  // วาดทรัพยากร (ต้นไม้และหินที่ขุดได้)
  harvestables.forEach(h => {
    if (h.hp <= 0) return;
    const sx = h.x - camera.x;
    const sy = h.y - camera.y;
    if (sx > -40 && sx < canvas.width + 40 && sy > -40 && sy < canvas.height + 40) {
      if (h.type === 'tree') {
        drawTreeTile(sx, sy);
      } else {
        ctx.fillStyle = '#495057';
        ctx.fillRect(sx, sy + 2, 16, 12);
        ctx.fillStyle = '#6c757d';
        ctx.fillRect(sx + 3, sy + 4, 10, 6);
      }
    }
  });

  // วาดกองไฟหมู่บ้าน และ ผู้เฒ่า NPC
  drawCampfire(campfire.x - camera.x, campfire.y - camera.y, frameCount);
  drawElder(elderNPC.x - camera.x, elderNPC.y - camera.y);

  // วาดของดรอป
  loots.forEach(l => {
    ctx.fillStyle = l.type === 'gold' ? '#ffd166' : (l.type === 'exp' ? '#4cc9f0' : '#ff4d6d');
    ctx.fillRect(l.x - camera.x, l.y - camera.y, 4, 4);
  });

  // วาดมอนสเตอร์แบบพิกเซลอาร์ตเต็มตัว
  monsters.forEach(m => {
    const mx = m.x - camera.x;
    const my = m.y - camera.y;
    if (mx > -30 && mx < canvas.width + 30 && my > -30 && my < canvas.height + 30) {
      if (m.type === 'mutant') drawMutantSprite(mx, my, frameCount);
      else if (m.type === 'wolf') drawWolfSprite(mx, my, frameCount);
      else drawSlimeSprite(mx, my, m.isFriendly, frameCount);

      // แถบเลือดพิกเซล
      if (m.hp < m.maxHp) {
        ctx.fillStyle = '#111';
        ctx.fillRect(mx, my - 5, 14, 2);
        ctx.fillStyle = '#ff3333';
        ctx.fillRect(mx, my - 5, (m.hp / m.maxHp) * 14, 2);
      }
    }
  });

  // วาดบอสมังกรโบราณ
  if (boss) {
    const bx = boss.x - camera.x;
    const by = boss.y - camera.y;
    drawDragonSprite(bx, by, frameCount);

    ctx.fillStyle = '#111';
    ctx.fillRect(bx - 4, by - 12, 48, 4);
    ctx.fillStyle = '#ff0054';
    ctx.fillRect(bx - 4, by - 12, (boss.hp / boss.maxHp) * 48, 4);
  }

  // วาดอัศวินผู้เล่น
  drawPlayerSprite(player.x - camera.x, player.y - camera.y, player.isMoving, frameCount);

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

  // บรรยากาศกลางคืน (Night Shade Overlay)
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

  renderMiniMap();

  requestAnimationFrame(() => {
    update();
    render();
  });
}

render();

// --- 10. AI World Director (ระบบสมองกลควบคุมโลกเกม) ---
const GEMINI_API_KEY = ""; 
let isAiBusy = false;

function triggerLocalGameMaster(eventContext) {
  const wrath = world.forestWrath;
  const isNight = world.dayPhase === 'night';
  let title = 'เจตจำนงแห่งโลก';
  let speech = '';

  if (eventContext.includes('มังกร') || world.bossActive) {
    title = 'เสียงคำรามโบราณ';
    const msgs = [
      'เปลวเพลิงแห่งการพิพากษาจะแผดเผาทุกสิ่ง! เจ้าหนีไม่พ้นหรอก!',
      'ความตายของเผ่าพันธุ์ข้าจะถูกชดใช้ด้วยเลือดของเจ้า!',
      'แผ่นดินสะเทือนเลื่อนลั่น มังกรโบราณโบกสะบัดปีกเหนือซากปรักหักพัง'
    ];
    speech = msgs[Math.floor(Math.random() * msgs.length)];
  } else if (wrath >= 70) {
    title = 'เสียงกรีดร้องของป่า';
    const msgs = [
      'กลิ่นคาวเลือดคละคลุ้ง... ผืนป่าไม่อาจทนรับความโหดร้ายนี้ได้อีกต่อไป',
      'ไอหมอกสีแดงเข้มลอยขึ้นจากพื้นดิน สรรพสัตว์เริ่มเกิดอาการคลุ้มคลั่ง',
      'เงาแห่งความแค้นก่อตัวขึ้นในเงามืด ระวังตัวให้ดีนักล่า!'
    ];
    speech = msgs[Math.floor(Math.random() * msgs.length)];
  } else if (eventContext.includes('ผูกมิตร') || eventContext.includes('อาหาร')) {
    title = 'ภูตแห่งพงไพร';
    const msgs = [
      'สายลมอ่อนโยนพัดผ่าน... ความเมตตาของเจ้าช่วยชะล้างความเคียดแค้น',
      'สรรพสัตว์สัมผัสได้ถึงไมตรีจิต พันธมิตรจะคอยอยู่เคียงข้างเจ้า',
      'ต้นไม้สั่นไหวอย่างยินดี พลังชีวิตแห่งธรรมชาติเริ่มฟื้นคืน'
    ];
    speech = msgs[Math.floor(Math.random() * msgs.length)];
  } else if (isNight) {
    title = 'เสียงกระซิบแห่งรัตติกาล';
    const msgs = [
      'ความมืดมิดเข้าครอบงำ ระวังหมาป่าและอสูรที่ซุ่มอยู่ในเงาไม้',
      'แสงจากกองไฟในหมู่บ้านคือที่พึ่งเดียวในคืนอันหนาวเหน็บนี้',
      'จงอย่าเดินทางไกลในยามวิกาล หากไร้ซึ่งอาวุธและบาเรียคุ้มภัย'
    ];
    speech = msgs[Math.floor(Math.random() * msgs.length)];
  } else {
    title = 'ผู้พิทักษ์โลก';
    const msgs = [
      'ชะตากรรมของผืนป่าแห่งนี้ ขึ้นอยู่กับทางที่เจ้าเลือกเดิน',
      'ทุกการกระทำย่อมมีผลสะท้อนกลับมาในอนาคตเสมอ',
      'จงรักษาสมดุลระหว่างการเอาชีวิตรอดและการทำลายล้าง'
    ];
    speech = msgs[Math.floor(Math.random() * msgs.length)];
  }

  logChat(title, speech, '#72dec2');

  if (world.forestWrath >= 60 && !world.bloodMoon) {
    world.bloodMoon = true;
    logChat('ภัยพิบัติโลก', '🌑 ปรากฏการณ์จันทราสีเลือด! มอนสเตอร์ทุกตัววิ่งเร็วขึ้น!', '#ff0054');
  } else if (world.forestWrath < 30 && world.bloodMoon) {
    world.bloodMoon = false;
    logChat('สมดุลโลก', '🌿 ความมืดสลายไป มอนสเตอร์กลับสู่สภาวะปกติสุข', '#52b788');
  }
}

async function callAIDirector(eventContext) {
  if (isAiBusy) return;
  isAiBusy = true;

  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
    triggerLocalGameMaster(eventContext);
    setTimeout(() => { isAiBusy = false; }, 3000);
    return;
  }

  try {
    const prompt = `คุณคือ AI Game Master ควบคุมโลกเกม 8-bit RPG แฟนตาซี
สถานะโลก: ป่าพิโรธ ${world.forestWrath}%, เวลา ${world.dayPhase}, เลเวล Lv.${player.level}
เหตุการณ์: ${eventContext}
คำสั่ง: แต่งคำพูดของโลก ลางบอกเหตุ หรือคำขู่ของบอส สั้นๆ 1 ประโยค (ไม่เกิน 15 คำ) ตอบเป็นภาษาไทยเท่านั้น`;

    logChat('AI Master', 'กำลังประเมินสมดุลของโลก...', '#888');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await res.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      const reply = data.candidates[0].content.parts[0].text.trim();
      logChat('เจตจำนงแห่งโลก', reply, '#72dec2');
    } else {
      triggerLocalGameMaster(eventContext);
    }
  } catch (err) {
    triggerLocalGameMaster(eventContext);
  } finally {
    setTimeout(() => { isAiBusy = false; }, 3000);
  }
}

updateQuestUI();

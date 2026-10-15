// 夜市彈珠台（網頁版，Phaser 3.90 + 內建 Matter.js 物理，都是 MIT）。
// 2026-10-15 從 Godot 版（scripts/main.gd）照搬：Godot 網頁版 43 MB，iPhone 4G 打不開，使用者選「改用 Phaser 重寫」。
// 玩法：先選彈珠，手指按住左右拖動（或滑鼠移動）選落點，放開放球；球撞釘子掉進底部的洞得分，15 顆用完一局結束（進 100 分洞送一顆、連擊加倍、老闆加碼時間）。
// 3 種彈珠（外觀＝玩法）：
//   珍珠：Q 彈、最亂，進洞分數 ×2。
//   麻糬：碰到釘子會黏住一下，每黏一次 +5 分。
//   鐵球：把釘子撞倒，直直往下衝、最好瞄準，但每局只有 3 顆。
// 畫面全部用程式畫（還沒有美術）；聲音全部由程式合成，沒有外部素材。
(function () {
  'use strict';

  // ── 版面（直式 720×1280）──
  const W = 720, H = 1280, WALL = 24;
  const DROP_Y = 150, PEG_TOP = 260, PEG_ROWS = 12, PEG_DX = 72, PEG_DY = 66, PEG_R = 7;
  const POCKET_TOP = 1090, FLOOR_Y = 1220;
  const POCKETS = [10, 50, 100, 50, 10];
  const BALLS_PER_GAME = 15;

  // ── 加碼玩法（2026-10-15 使用者 10 個點子全部想試，先做這三個）──
  const BONUS_POCKET = 100, BONUS_MAX = 8;        // F1 獎勵球：進 100 分洞送 1 顆，一局最多送 8 顆
  const COMBO_WINDOW = 2500;                      // F5 連擊：上一顆進洞後 2.5 秒內再進洞算連擊
  const COMBO_MIN = 50;
  const COMBO_MULT = [1, 2, 2, 3];                // 第 n 次連擊的倍數（第 1 顆 ×1、第 2～3 顆 ×2、第 4 顆起 ×3）
  const FEVER_TIME = 10000, FEVER_MULT = 2;       // F6 老闆加碼：每局一次、10 秒內分數 ×2
  const FEVER_FROM = 4, FEVER_TO = 10;            // 在第幾顆到第幾顆之間隨機出現
  // F3 攤位任務：每局隨機一個小目標，完成 +TASK_REWARD
  const TASK_REWARD = 300;
  const TASKS = [
    { key: 'stick', text: '麻糬黏住 35 次', need: 35 },
    { key: 'knock', text: '鐵球撞倒 24 根釘子', need: 24 },
    { key: 'pearl100', text: '珍珠進 100 分洞 2 次', need: 2 },
    { key: 'combo', text: '連擊達到 4', need: 4 },
    { key: 'p50', text: '進 50 分洞 6 次', need: 6 },
  ];
  // F2 賓果：3×3 卡，橫列＝彈珠種類（珍珠／麻糬／鐵球），直行＝洞的位置（左／中／右）。
  // 用某種彈珠進某一邊的洞就蓋章；連成一條線 +BINGO_LINE，九格全滿再 +BINGO_FULL。
  const BINGO_LINE = 150, BINGO_FULL = 800;
  const BINGO_SIDE = [0, 0, 1, 2, 2];               // 5 個洞對應左／中／右
  const BINGO_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  // ── 手感參數（調手感主要改這裡）──
  const GRAVITY = 1.5;           // Matter 的重力（1 約等於 1000 px/s²；Godot 版是 1500）
  const STEP_MS = 1000 / 180;     // 物理固定每秒算 180 次：手機 60／120 Hz、電腦 165 Hz 手感都一樣，也避免球太快穿過釘子
  const PEG_BOUNCE = 0;          // Matter 的彈性取兩者較大值：釘子設 0，球照自己的彈性彈
  const JITTER = 2;              // 放球時隨機偏移幾像素：約七成可預測、三成混沌
  const DROP_COOLDOWN = 220;     // 毫秒
  const AIR = 0.0006;             // 空氣阻力（每一步；每秒約剩九成，跟 Godot 預設差不多）

  // ── 互動教學：第一次玩自動開始，開始畫面也能重看。一步一個動作，做到了才進下一步 ──
  // until：drop 放球／pocket 進洞（type 指定彈珠）／select:<種類> 換彈珠／stick 麻糬黏住／knock 鐵球撞倒／tap 點一下繼續
  const TUTORIAL = [
    { text: '手指按住畫面、左右拖動\n選球要掉下去的位置\n放開手指，球就掉下去！', until: 'drop', hand: 'swipe' },
    { text: '球撞到釘子會彈來彈去\n掉進下面的洞就得分\n正中間 100 分最高', until: 'pocket', box: 'pockets' },
    { text: '珍珠進洞分數 ×2！\n接著點上面的「麻糬」換一顆', until: 'select:mochi', box: 'btn:mochi', hand: 'btn:mochi' },
    { text: '麻糬碰到釘子會黏住一下\n每黏一次 +5 分\n丟丟看！', until: 'stick' },
    { text: '黏住了！\n再點上面的「鐵球」', until: 'select:iron', box: 'btn:iron', hand: 'btn:iron' },
    { text: '鐵球很重，會撞倒釘子直直往下衝\n最好瞄準，但一局只有 3 顆\n瞄準正中間丟丟看！', until: 'pocket', type: 'iron' },
    { text: '左上角是賓果卡\n橫的：珍珠／麻糬／鐵球\n直的：左／中／右的洞\n用那種彈珠進那一邊的洞就蓋章\n連成一條線 +150 分', until: 'tap', box: 'bingo' },
    { text: '上面是這一局的攤位任務\n完成 +300 分', until: 'tap', box: 'task' },
    { text: '還有：進 100 分洞送一顆球\n連續進洞分數加倍\n老闆偶爾會加碼！\n\n準備好了嗎？點一下開始', until: 'tap' },
  ];
  // 第一次遇到才跳出來的小提示（每支手機只出現一次）
  const TIPS = {
    bonus: '進 100 分洞，送你一顆球！',
    combo: '連擊！2.5 秒內再進 50 或 100 分洞\n分數越疊越高',
    fever: '老闆加碼！10 秒內分數 ×2，快丟！',
    bingo: '賓果卡蓋到章了（左上）\n連成一條線 +150',
    task: '攤位任務完成！+300',
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存不了就算了 */ } },
  };

  // ── 3 種彈珠（調平衡主要改這裡）──
  const BALL_TYPES = {
    pearl: { name: '珍珠', key: '1', r: 12, bounce: 0.62, friction: 0.02, gravity: 0.9, mult: 2, color: 0x4a2c1e, hi: 0xc49a7c, rule: 'Q 彈・分數 ×2' },
    mochi: { name: '麻糬', key: '2', r: 14, bounce: 0.12, friction: 0.3, gravity: 0.85, mult: 1, color: 0xfff1ea, hi: 0xffffff, rule: '會黏・每黏 +5' },
    iron: { name: '鐵球', key: '3', r: 14, bounce: 0.05, friction: 0.01, gravity: 0.8, mult: 1, color: 0x8d96a3, hi: 0xe8edf2, rule: '撞倒釘子・限 3 顆' },
  };
  const TYPE_ORDER = ['pearl', 'mochi', 'iron'];
  const IRON_PER_GAME = 3;
  const IRON_KNOCK_TIME = 1200;  // 鐵球撞倒的釘子幾毫秒後立回來
  const IRON_SIDE_KEEP = 0.8;    // 鐵球撞到釘子後，橫向速度留幾成（越小越好瞄準）
  const MOCHI_STICK_TIME = 350;  // 黏住幾毫秒
  const MOCHI_STICK_POINTS = 5;
  const MOCHI_STICK_CD = 450;    // 黏過一次之後多久內不再黏
  const MOCHI_SLIDE = 2.0;       // 麻糬鬆開時往釘子外側滑的速度（1 約 60 px/s）
  const IRON_NUDGE = 1.4;        // 鐵球撞倒釘子時被推偏一點點，保留一些變化
  const IRON_RAND = 1.7;         // 再加一點隨機偏移（正對釘子撞時也會偏）
  const CAT_PEG = 0x0002, CAT_BALL = 0x0004;   // 碰撞分類：鐵球不跟釘子做物理碰撞，自己判斷「撞倒」

  // ── 顏色：夜市的深藍夜色＋暖色燈 ──
  const C = {
    board: 0x1c1730, edge: 0x3a2f5c, peg: 0xf3d9a4, text: '#fff4e0', dim: '#8f86b3',
    lanterns: [0xff5d73, 0xffc94d, 0x80ed99, 0x4cc9f0, 0xff9f43],
    pockets: [0x4cc9f0, 0x80ed99, 0xffc94d, 0x80ed99, 0x4cc9f0],
  };
  const FONT = '"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif';
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const lerpColor = (a, b, t) => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  };

  // ───────────── 聲音：程式合成；第一次觸控才建立（手機規定要使用者先動作）─────────────
  const Sound = {
    ctx: null, buf: {},
    unlock() {
      // iPhone 靜音開關會關掉網頁音效：觸控時把音訊工作階段設成「播放」，並播一段循環的無聲音檔（舊版 Safari 用）
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 不支援就略過 */ }
      if (!this.silent) {
        try {
          const a = document.createElement('audio');
          a.setAttribute('x-webkit-airplay', 'deny'); a.setAttribute('playsinline', '');
          a.loop = true; a.src = silentWav(); this.silent = a;
        } catch (e) { /* 略過 */ }
      }
      try { const p = this.silent && this.silent.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 略過 */ }
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = (window.NM_audio && window.NM_audio.ctx) || new AC();   // 開始畫面按「開始」時已建立並打開
        this.buf.tik = this.tone([2300, 3450], 0.07, 55, 0.32, 0.4);
        this.buf.drop = this.tone([420], 0.12, 30, 0.3, 0.2);
        this.buf.ding = this.tone([880, 1320], 0.4, 8, 0.4, 0);
        this.buf.big = this.tone([1046.5, 1318.5, 1568, 2093], 0.9, 3.5, 0.45, 0);
        this.buf.stick = this.tone([180, 260], 0.16, 22, 0.35, 0.15);   // 麻糬黏住的「啵」
        this.buf.clank = this.tone([520, 1310, 2210], 0.25, 14, 0.4, 0.5); // 鐵球撞倒釘子的「鏗」
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freqs, dur, decay, vol, noise) {
      const rate = 22050, n = Math.floor(rate * dur);
      const b = this.ctx.createBuffer(1, n, rate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const env = Math.exp(-t * decay) * Math.min(1, t * 800);
        let s = 0;
        for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
        s = s / freqs.length + (Math.random() * 2 - 1) * noise * Math.exp(-t * 200);
        d[i] = Math.max(-1, Math.min(1, s * env * vol));
      }
      return b;
    },
    play(name, rate = 1, db = 0) {
      if (!this.ctx || !this.buf[name]) return;
      if (this.ctx.state !== 'running') { this.ctx.resume(); if (this.ctx.state !== 'running') return; }
      const src = this.ctx.createBufferSource();
      src.buffer = this.buf[name];
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = Math.pow(10, db / 20);
      src.connect(g); g.connect(this.ctx.destination);
      src.start();
    },
  };
  // 0.25 秒無聲 WAV（22.05 kHz、16-bit、單聲道）
  function silentWav() {
    const sr = 22050, n = Math.round(sr * 0.25), bytes = n * 2, b = new ArrayBuffer(44 + bytes), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, bytes, true);
    let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return 'data:audio/wav;base64,' + btoa(s);
  }

  // Matter 0.20（Phaser 3.90 內建）的 getVelocity 是「每 1/60 秒走幾像素」，跟物理步長無關（10/15 實測：自由落體 1 秒後為 25，即 1500 px/s）
  const vel = (b) => (Phaser.Physics.Matter.Matter.Body.getVelocity ? Phaser.Physics.Matter.Matter.Body.getVelocity(b) : b.velocity);

  class Pinball extends Phaser.Scene {
    constructor() { super('pinball'); }

    create() {
      const M = Phaser.Physics.Matter.Matter;
      this.M = M;
      this.rng = Math.random;
      this.score = 0; this.ballsLeft = BALLS_PER_GAME; this.ironLeft = IRON_PER_GAME;
      this.ballType = 'pearl'; this.dropX = W / 2; this.lastDrop = -9999; this.time0 = 0;
      this.pegs = []; this.balls = []; this.pocketFlash = [0, 0, 0, 0, 0]; this.history = [];
      this.gameOver = false; this.noDropUntil = 0;
      this.resetBonus();

      this.matter.world.setGravity(0, GRAVITY);
      this.matter.world.autoUpdate = false;     // 自己拆小步更新，避免穿透
      this.g = this.add.graphics();
      this.fx = this.add.graphics().setDepth(5);
      this.particles = [];

      this.buildWalls();
      this.buildPegs();
      this.buildPockets();
      this.bakeBoard();
      this.buildUI();
      this.updateUI();

      this.matter.world.on('collisionstart', (ev) => {
        for (const p of ev.pairs) this.onCollide(p.bodyA, p.bodyB);
      });
      // 操作：按住拖動瞄準，放開才放球（2026-10-15 改：之前一碰就放球，手機上沒辦法先「左右滑選位置」）
      this.aiming = false;
      this.input.on('pointermove', (p) => {
        if (this.aiming || !p.wasTouch) this.dropX = this.clampX(p.x);   // 滑鼠移動就跟著；手指要按住才跟著
      });
      this.input.on('pointerdown', (p, over) => {
        Sound.unlock();
        if (this.tut && this.tutStep().until === 'tap') { if (this.time.now > this.tut.readyAt) this.tutEvent('tap'); return; }
        // 點在按鈕上（換彈珠、再玩一局）不瞄準：之前按「再玩一局」那一下會同時被台面收到，新的一局一開始就自己掉一顆珍珠（2026-10-15 使用者回報）
        if (p.y < 92 || this.gameOver || (over && over.length) || this.time.now < this.noDropUntil) return;
        this.aiming = true;
        this.dropX = this.clampX(p.x);
      });
      const release = (p) => {
        if (!this.aiming) return;
        this.aiming = false;
        if (this.gameOver) return;
        this.dropX = this.clampX(p.x);
        this.dropBall();
      };
      this.input.on('pointerup', release);
      this.input.on('pointerupoutside', release);
      this.input.keyboard && this.input.keyboard.on('keydown', (e) => {
        Sound.unlock();
        for (const t of TYPE_ORDER) if (e.key === BALL_TYPES[t].key) this.selectType(t);
      });
      window.__game = this; // 給自動測試用
      this.player = '玩家';
      window.NM_begin = (name, tutorial) => { this.player = name; Sound.unlock(); this.restart(); if (tutorial || !store.get('nm_tutorial_done', false)) this.startTutorial(); };
      if (window.NM_ready) window.NM_ready();
    }

    clampX(x) { return Phaser.Math.Clamp(x, WALL + 18, W - WALL - 18); }

    // ───────────── 建立場景 ─────────────
    staticRect(x, y, w, h, bounce, label) {
      return this.matter.add.rectangle(x, y, w, h, { isStatic: true, restitution: bounce, friction: 0.05, label: label || 'wall' });
    }

    buildWalls() {
      this.staticRect(WALL / 2, H / 2, WALL, H * 2, 0.3);
      this.staticRect(W - WALL / 2, H / 2, WALL, H * 2, 0.3);
      this.staticRect(W / 2, FLOOR_Y + 30, W, 60, 0.05);
    }

    buildPegs() {
      for (let r = 0; r < PEG_ROWS; r++) {
        let x = WALL + 48 + (r % 2 === 1 ? PEG_DX / 2 : 0);
        for (; x < W - WALL - 30; x += PEG_DX) {
          const y = PEG_TOP + r * PEG_DY;
          const body = this.matter.add.circle(x, y, PEG_R, { isStatic: true, restitution: PEG_BOUNCE, friction: 0.05, label: 'peg', collisionFilter: { category: CAT_PEG, mask: 0xffff } });
          const peg = { x, y, flash: 0, down: 0, body };
          body.peg = peg;
          this.pegs.push(peg);
        }
      }
    }

    // 不會動的部分（台子、正常狀態的釘子、洞、隔板）只畫一次、烤成一張貼圖；每格只畫會動的東西（2026-10-15 效能研究建議）
    bakeBoard() {
      const b = this.make.graphics({ x: 0, y: 0, add: false });
      b.fillStyle(C.board).fillRect(WALL, 90, W - WALL * 2, FLOOR_Y - 90);
      b.fillStyle(C.edge).fillRect(0, 90, WALL, FLOOR_Y - 90).fillRect(W - WALL, 90, WALL, FLOOR_Y - 90).fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
      for (const p of this.pegs) b.fillStyle(C.peg).fillCircle(p.x, p.y, PEG_R);
      const pw = this.pocketWidth();
      for (let i = 0; i < POCKETS.length; i++) {
        const c = C.pockets[i], rx = WALL + pw * i + 4;
        b.fillStyle(c, 0.12).fillRect(rx, POCKET_TOP + 20, pw - 8, FLOOR_Y - POCKET_TOP - 20);
        b.fillStyle(c).fillRect(rx, FLOOR_Y - 8, pw - 8, 8);
      }
      for (let i = 1; i < POCKETS.length; i++) {
        const x = WALL + pw * i;
        b.fillStyle(C.edge).fillRect(x - 3, POCKET_TOP, 6, FLOOR_Y - POCKET_TOP);
        b.fillStyle(lerpColor(C.edge, 0xffffff, 0.2)).fillCircle(x, POCKET_TOP, 6);
      }
      b.generateTexture('board', W, H);
      b.destroy();
      this.add.image(0, 0, 'board').setOrigin(0).setDepth(-1);
    }

    pocketWidth() { return (W - WALL * 2) / POCKETS.length; }

    buildPockets() {
      const pw = this.pocketWidth();
      for (let i = 1; i < POCKETS.length; i++) {
        const x = WALL + pw * i;
        this.staticRect(x, (POCKET_TOP + FLOOR_Y) / 2, 6, FLOOR_Y - POCKET_TOP, 0.3);
        this.matter.add.circle(x, POCKET_TOP, 6, { isStatic: true, restitution: 0.3, label: 'cap' });
      }
      for (let i = 0; i < POCKETS.length; i++) {
        const s = this.matter.add.rectangle(WALL + pw * (i + 0.5), FLOOR_Y - 30, pw - 10, 40, { isStatic: true, isSensor: true, label: 'pocket' });
        s.pocketIndex = i;
        this.add.text(WALL + pw * (i + 0.5), FLOOR_Y - 58, String(POCKETS[i]), { fontFamily: FONT, fontSize: '34px', color: hex(lerpColor(C.pockets[i], 0xffffff, 0.3)), resolution: 2 }).setOrigin(0.5).setDepth(2);
      }
    }

    buildUI() {
      this.scoreText = this.add.text(30, 6, '', { fontFamily: FONT, fontSize: '40px', color: C.text, resolution: 2 }).setDepth(10);
      this.taskText = this.add.text(W / 2 + 50, 182, '', { fontFamily: FONT, fontSize: '22px', color: '#c9c1ee', resolution: 2 }).setOrigin(0.5).setDepth(10);
      this.feverText = this.add.text(W / 2, 212, '', { fontFamily: FONT, fontSize: '28px', color: '#ffc94d', stroke: '#000000', strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(12).setVisible(false);
      this.ballsText = this.add.text(32, 56, '', { fontFamily: FONT, fontSize: '20px', color: C.dim, resolution: 2 }).setDepth(10);
      this.buttons = {};
      TYPE_ORDER.forEach((t, i) => {
        const x = 296 + i * 140, y = 8;
        const bg = this.add.rectangle(x, y, 132, 76, 0x2a2340).setOrigin(0).setStrokeStyle(2, 0x3a2f5c).setDepth(10).setInteractive({ useHandCursor: true });
        const label = this.add.text(x + 66, y + 38, '', { fontFamily: FONT, fontSize: '22px', color: C.text, align: 'center', resolution: 2 }).setOrigin(0.5).setDepth(11);
        bg.on('pointerdown', (p, lx, ly, ev) => { Sound.unlock(); this.selectType(t); ev && ev.stopPropagation && ev.stopPropagation(); });
        this.buttons[t] = { bg, label };
      });
      this.overPanel = this.add.rectangle(W / 2, 640, W - 50, 330, 0x120f1f, 0.9).setStrokeStyle(2, 0x3a2f5c).setDepth(19).setVisible(false);
      this.msgText = this.add.text(W / 2, 540, '', { fontFamily: FONT, fontSize: '34px', color: C.text, align: 'center', lineSpacing: 8, resolution: 2, wordWrap: { width: W - 60 } }).setOrigin(0.5).setDepth(20).setVisible(false);
      this.restartBg = this.add.rectangle(W / 2, 672, 260, 84, 0xffc94d).setDepth(20).setVisible(false).setInteractive({ useHandCursor: true });
      this.restartText = this.add.text(W / 2, 672, '再玩一局', { fontFamily: FONT, fontSize: '34px', color: '#1c1730', resolution: 2 }).setOrigin(0.5).setDepth(21).setVisible(false);
      this.restartBg.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); this.restart(); });
      // 換人：回開始畫面
      this.switchText = this.add.text(W / 2, 744, '換人玩', { fontFamily: FONT, fontSize: '24px', color: '#c9c1ee', resolution: 2, padding: { x: 24, y: 10 } }).setOrigin(0.5).setDepth(21).setVisible(false).setInteractive({ useHandCursor: true });
      this.switchText.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); if (window.NM_showStart) window.NM_showStart(); });
    }

    selectType(t) {
      if (t === 'iron' && this.ironLeft <= 0) return;
      this.ballType = t;
      this.updateUI();
      if (this.tut) this.tutEvent('select:' + t);
    }

    updateUI() {
      this.scoreText.setText(this.score + ' 分');
      this.ballsText.setText('剩 ' + this.ballsLeft + ' 顆' + (this.sys.game.device.input.touch ? '' : '　按 1／2／3 換彈珠'));
      if (this.task && this.taskText) this.taskText.setText(this.taskDone ? '攤位任務完成 ✓' : '攤位任務：' + this.task.text + '（' + Math.min(this.stats[this.task.key], this.task.need) + '/' + this.task.need + '）').setColor(this.taskDone ? '#7fd6a6' : '#c9c1ee');
      for (const t of TYPE_ORDER) {
        const info = BALL_TYPES[t], b = this.buttons[t];
        const extra = t === 'iron' ? '（剩 ' + this.ironLeft + '）' : '';
        b.label.setText(info.name + extra + '\n' + info.rule.split('・')[0]);
        const sel = t === this.ballType, off = t === 'iron' && this.ironLeft <= 0;
        b.bg.setFillStyle(sel ? 0x4a3d72 : 0x2a2340).setStrokeStyle(sel ? 3 : 2, sel ? 0xffc94d : 0x3a2f5c);
        b.label.setAlpha(off ? 0.35 : 1);
      }
    }

    // ───────────── 遊戲流程 ─────────────
    dropBall() {
      if (this.ballsLeft <= 0 || this.time.now - this.lastDrop < DROP_COOLDOWN) return;
      if (this.ballType === 'iron') { if (this.ironLeft <= 0) return; this.ironLeft--; }
      this.lastDrop = this.time.now;
      this.ballsLeft--;
      this.dropped++;
      if (this.tut) this.tutEvent('drop');
      if (this.dropped === this.feverAt) this.startFever();
      const info = BALL_TYPES[this.ballType];
      const body = this.matter.add.circle(this.dropX + (this.rng() * 2 - 1) * JITTER, DROP_Y, info.r, {
        restitution: info.bounce, friction: info.friction, frictionAir: AIR, frictionStatic: 0.1, label: 'ball',
        collisionFilter: this.ballType === 'iron' ? { category: CAT_BALL, mask: 0xffff & ~CAT_PEG } : { category: CAT_BALL, mask: 0xffff },
      });
      const ball = { body, type: this.ballType, pts: 0, trail: [], stuck: 0, hitCd: 0, stick: 0, stickCd: 0, stickPos: null };
      body.ball = ball;
      this.balls.push(ball);
      Sound.play('drop', 0.9 + this.rng() * 0.2, -4);
      if (this.ballType === 'iron' && this.ironLeft <= 0) this.ballType = 'pearl';   // 鐵球用完自動換回珍珠
      this.updateUI();
    }

    onCollide(a, b) {
      const ballBody = a.ball ? a : (b.ball ? b : null);
      if (!ballBody) return;
      const other = ballBody === a ? b : a;
      const ball = ballBody.ball;
      if (other.label === 'pocket') { this.onPocket(ball, other.pocketIndex); return; }
      if (other.label !== 'peg' || !other.peg) return;
      const peg = other.peg;
      peg.flash = 1;
      const M = this.M;
      if (ball.type === 'mochi' && ball.stickCd <= 0 && ball.stick <= 0) {
        // 麻糬：黏在釘子上一下，每黏一次加分
        ball.stick = MOCHI_STICK_TIME;
        ball.stickCd = MOCHI_STICK_TIME + MOCHI_STICK_CD;
        ball.stickPos = { x: ballBody.position.x, y: ballBody.position.y };
        ball.stickPeg = peg;
        this.score += MOCHI_STICK_POINTS; ball.pts += MOCHI_STICK_POINTS;
        this.addStat('stick', 1);
        this.floatText('+' + MOCHI_STICK_POINTS, ballBody.position.x, ballBody.position.y - 26, 0xfff1ea, 24);
        Sound.play('stick', 0.9 + this.rng() * 0.2, -6);
        this.updateUI();
      }
      if (ball.hitCd <= 0) {
        ball.hitCd = 40;
        const vv = vel(ballBody), speed = Math.hypot(vv.x, vv.y) * 60;   // 換算成 px/s
        const t = (peg.y - PEG_TOP) / (PEG_ROWS * PEG_DY);
        Sound.play('tik', (1.25 - 0.4 * t) * (0.96 + this.rng() * 0.08), -14 + 12 * Phaser.Math.Clamp(speed / 900, 0, 1));
      }
    }

    // 鐵球：經過的釘子被撞倒（暫時不擋其他球），自己只被推偏一點點，繼續直直往下
    ironPass(ball) {
      const b = ball.body, rr = BALL_TYPES.iron.r + PEG_R, M = this.M;
      for (const peg of this.pegs) {
        if (peg.down > 0) continue;
        const dx = b.position.x - peg.x, dy = b.position.y - peg.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        peg.down = IRON_KNOCK_TIME; peg.flash = 1;
        this.addStat('knock', 1);
        peg.body.isSensor = true;
        const v = vel(b);
        M.Body.setVelocity(b, { x: v.x * IRON_SIDE_KEEP + (dx / rr) * IRON_NUDGE + (this.rng() * 2 - 1) * IRON_RAND, y: Math.max(v.y * 0.85, 3.7) });   // 撞倒釘子會慢一點點
        this.cameras.main.shake(80, 0.003);
        Sound.play('clank', 0.9 + this.rng() * 0.2, -6);
      }
    }

    onPocket(ball, index) {
      if (!this.balls.includes(ball)) return;
      const info = BALL_TYPES[ball.type];
      // 連擊：上一顆進洞後 COMBO_WINDOW 內再進洞
      // 只有 50、100 分洞算連擊，掉進 10 分洞就斷（不然一直往正中間連丟就是最強打法）
      if (POCKETS[index] < COMBO_MIN) this.combo = 0;
      else this.combo = this.combo > 0 && this.clock - this.lastPocketAt <= COMBO_WINDOW ? this.combo + 1 : 1;
      this.lastPocketAt = this.clock;
      const comboMult = this.combo > 0 ? COMBO_MULT[Math.min(this.combo, COMBO_MULT.length) - 1] : 1;
      const fever = this.feverLeft > 0 ? FEVER_MULT : 1;
      const points = POCKETS[index] * info.mult * comboMult * fever;
      this.score += points;
      this.history.push({ type: ball.type, points: points + ball.pts });
      this.pocketFlash[index] = 1;
      const { x, y } = ball.body.position;
      const bonus = POCKETS[index] === BONUS_POCKET && this.bonusGiven < BONUS_MAX;
      if (bonus) { this.bonusGiven++; this.ballsLeft++; }   // 先加再移除球，免得最後一顆進洞時先判定結束
      this.removeBall(ball);
      const color = C.pockets[index];
      this.burst(x, y, color, 14 + Math.floor(points / 4));
      const tags = (info.mult > 1 ? '珍珠×2 ' : '') + (comboMult > 1 ? '連擊×' + comboMult + ' ' : '') + (fever > 1 ? '加碼×2' : '');
      this.floatText('+' + points + (tags ? '\n' + tags.trim() : ''), x, y - 40, color, 34 + Math.min(points, 200) / 6);
      if (comboMult > 1) Sound.play('ding', 1 + this.combo * 0.12, -4);
      if (ball.type === 'pearl' && POCKETS[index] === 100) this.addStat('pearl100', 1);
      if (POCKETS[index] === 50) this.addStat('p50', 1);
      this.stats.combo = Math.max(this.stats.combo, this.combo); this.checkTask();
      this.stampBingo(ball.type, index, x, y);
      if (this.tut) this.tutEvent('pocket', ball.type);
      if (bonus) this.tip('bonus'); if (comboMult > 1) this.tip('combo');
      // 獎勵球：進 100 分洞送一顆
      if (bonus) this.floatText('送一顆！', x, y - 110, 0xffc94d, 40);
      if (points >= 100) { this.cameras.main.shake(260, 0.012); Sound.play('big', 1, -2); }
      else { this.cameras.main.shake(90, 0.003); Sound.play('ding', points >= 50 ? 1 : 0.8, -5); }
      this.updateUI();
    }

    // ───────────── 互動教學 ─────────────
    startTutorial() {
      this.restart();
      this.tut = { i: -1, readyAt: 0 };
      this.ballsLeft = 99; this.ironLeft = 99; this.feverAt = -1;   // 教學中球用不完、不出現老闆加碼
      this.selectType('pearl');
      if (!this.tutLayer) {
        this.tutBox = this.add.graphics().setDepth(29);
        this.tutBubble = this.add.graphics().setDepth(30);
        this.tutText = this.add.text(W / 2, 0, '', { fontFamily: FONT, fontSize: '30px', color: '#1c1730', align: 'center', lineSpacing: 6, resolution: 2, wordWrap: { width: W - 120 } }).setOrigin(0.5).setDepth(31);
        this.tutHand = this.add.text(0, 0, '👆', { fontSize: '64px', resolution: 2 }).setOrigin(0.3, 0).setDepth(32);
        this.tutSkip = this.add.text(W - 30, 1244, '跳過教學', { fontFamily: FONT, fontSize: '22px', color: '#8f86b3', resolution: 2, padding: { x: 12, y: 8 } }).setOrigin(1, 0.5).setDepth(32).setInteractive({ useHandCursor: true });
        this.tutSkip.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); this.endTutorial(); });
        this.tutLayer = true;
      }
      this.tutNext();
    }

    tutStep() { return TUTORIAL[this.tut.i] || {}; }

    tutEvent(ev, type) {
      if (!this.tut) return;
      const st = this.tutStep();
      if (st.until !== ev) return;
      if (st.type && st.type !== type) return;
      this.time.delayedCall(ev === 'tap' ? 0 : 450, () => this.tutNext());
      this.tut.waiting = true;
    }

    tutNext() {
      if (!this.tut) return;
      this.tut.i++; this.tut.waiting = false; this.tut.readyAt = this.time.now + 500;
      if (this.tut.i >= TUTORIAL.length) return this.endTutorial(true);
      const st = this.tutStep();
      Sound.play('tik', 1.4, -8);
      this.tutText.setText(st.text);
      // 說明框放在不擋住重點的地方：重點在上面就放下面
      const low = st.box === 'bingo' || st.box === 'task' || (st.box || '').startsWith('btn') || st.hand === 'swipe' || st.hand === 'tap';
      const cy = st.box === 'pockets' ? 560 : low ? 760 : 560;
      this.tutText.setY(cy);
      const b = this.tutText.getBounds(), pad = 26;
      this.tutBubble.clear().fillStyle(0xfff6dc, 0.97).fillRoundedRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, 22)
        .lineStyle(4, 0xffc94d).strokeRoundedRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, 22);
      if (st.until === 'tap') this.tutBubble.fillStyle(0xffc94d).fillTriangle(W / 2 - 12, b.bottom + pad - 4, W / 2 + 12, b.bottom + pad - 4, W / 2, b.bottom + pad + 10);
      [this.tutBubble, this.tutText].forEach((o) => { o.setAlpha(0); this.tweens.add({ targets: o, alpha: 1, duration: 220 }); });
      this.tutHand.setVisible(!!st.hand);
      this.tutSkip.setVisible(true);
    }

    endTutorial(finished) {
      store.set('nm_tutorial_done', true);
      this.tut = null;
      this.tutBox.clear(); this.tutBubble.clear(); this.tutText.setText(''); this.tutHand.setVisible(false); this.tutSkip.setVisible(false);
      this.restart();
      this.floatText(finished ? '開始囉！' : '正式開始！', W / 2, 600, 0xffc94d, 56);
    }

    tutTargetRect(key) {
      if (!key) return null;
      if (key.startsWith('btn:')) { const bg = this.buttons[key.slice(4)].bg; return { x: bg.x, y: bg.y, w: bg.width, h: bg.height }; }
      if (key === 'bingo') return { x: 26, y: 142, w: 132, h: 112 };
      if (key === 'task') { const t = this.taskText.getBounds(); return { x: t.x - 8, y: t.y - 6, w: t.width + 16, h: t.height + 12 }; }
      if (key === 'pockets') return { x: WALL, y: POCKET_TOP - 10, w: W - WALL * 2, h: FLOOR_Y - POCKET_TOP + 20 };
      return null;
    }

    drawTutorial(t) {
      const st = this.tutStep();
      // 球在跑的時候說明框變淡，看得到球往哪裡掉
      const fade = st.until !== 'tap' && this.balls.length > 0 && this.time.now > this.tut.readyAt ? 0.25 : null;
      if (fade !== null || this.tut.faded) { const a = fade !== null ? fade : 1; this.tutBubble.setAlpha(a); this.tutText.setAlpha(a); this.tut.faded = fade !== null; }
      // 重點框：亮黃色、會呼吸
      this.tutBox.clear();
      const r = this.tutTargetRect(st.box);
      if (r) {
        const a = 0.6 + 0.4 * Math.sin(t * 6);
        this.tutBox.lineStyle(5, 0xffc94d, a).strokeRoundedRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 12);
      }
      // 手指動畫
      if (st.hand === 'swipe') {
        const hx = W / 2 + Math.sin(t * 2.4) * 200;
        this.tutHand.setPosition(hx, DROP_Y + 20).setScale(1);
        if (!this.aiming) this.dropX = this.clampX(hx);   // 示範：預覽的球跟著手指動
      } else if (st.hand === 'tap') {
        const k = (t * 1.6) % 1;
        this.tutHand.setPosition(this.dropX, DROP_Y + 20 + (k < 0.3 ? k * 40 : 12)).setScale(k < 0.3 ? 1 - k * 0.5 : 0.85);
      } else if (st.hand && st.hand.startsWith('btn:')) {
        const bg = this.buttons[st.hand.slice(4)].bg, k = (t * 1.6) % 1;
        this.tutHand.setPosition(bg.x + 66, bg.y + 50 + (k < 0.3 ? k * 30 : 9)).setScale(k < 0.3 ? 1 - k * 0.4 : 0.88);
      }
    }

    // 第一次遇到某個玩法才跳出來的小提示
    tip(key) {
      if (this.tut || !TIPS[key]) return;
      this.tipsSeen = this.tipsSeen || store.get('nm_tips', {});
      if (this.tipsSeen[key]) return;
      this.tipsSeen[key] = 1; store.set('nm_tips', this.tipsSeen);
      if (!this.tipText) {
        this.tipBg = this.add.graphics().setDepth(27);
        this.tipText = this.add.text(W / 2, 330, '', { fontFamily: FONT, fontSize: '26px', color: '#1c1730', align: 'center', lineSpacing: 4, resolution: 2 }).setOrigin(0.5).setDepth(28);
      }
      this.tipText.setText(TIPS[key]).setAlpha(1);
      const b = this.tipText.getBounds(), pad = 18;
      this.tipBg.clear().fillStyle(0xfff6dc, 0.95).fillRoundedRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, 16).setAlpha(1);
      this.tweens.killTweensOf([this.tipText, this.tipBg]);
      this.tweens.add({ targets: [this.tipText, this.tipBg], alpha: 0, delay: 2600, duration: 500 });
    }

    addStat(key, n) { this.stats[key] += n; this.checkTask(); if (this.tut && (key === 'stick' || key === 'knock')) this.tutEvent(key); }

    checkTask() {
      if (this.taskDone || this.gameOver || this.stats[this.task.key] < this.task.need) return;
      this.taskDone = true; this.score += TASK_REWARD; this.tip('task');
      this.floatText('攤位任務完成！+' + TASK_REWARD, W / 2, 460, 0x7fd6a6, 46);
      Sound.play('big', 1.1, -3); this.updateUI();
    }

    stampBingo(type, index, x, y) {
      const cell = TYPE_ORDER.indexOf(type) * 3 + BINGO_SIDE[index];
      if (this.bingo[cell]) return;
      this.bingo[cell] = 1; this.tip('bingo');
      let bonus = 0;
      BINGO_LINES.forEach((l, i) => {
        if (!this.bingoLines.has(i) && l.every((c) => this.bingo[c])) { this.bingoLines.add(i); bonus += BINGO_LINE; }
      });
      if (!this.bingoFull && this.bingo.every(Boolean)) { this.bingoFull = true; bonus += BINGO_FULL; }
      if (bonus) {
        this.score += bonus;
        this.floatText((this.bingoFull && bonus >= BINGO_FULL ? '全滿！' : '賓果！') + '+' + bonus, W / 2, 400, 0xffc94d, 50);
        this.cameras.main.shake(200, 0.008); Sound.play('big', 0.9, -2);
        this.updateUI();
      }
    }

    resetBonus() {
      this.stats = { stick: 0, knock: 0, pearl100: 0, combo: 0, p50: 0 };
      this.task = TASKS[Math.floor(this.rng() * TASKS.length)]; this.taskDone = false;
      this.bingo = [0, 0, 0, 0, 0, 0, 0, 0, 0]; this.bingoLines = new Set(); this.bingoFull = false;
      this.clock = 0; this.combo = 0; this.lastPocketAt = -1e9; this.bonusGiven = 0; this.dropped = 0;
      this.feverLeft = 0; this.feverAt = FEVER_FROM + Math.floor(this.rng() * (FEVER_TO - FEVER_FROM + 1));
      if (this.feverText) this.feverText.setVisible(false);
    }

    startFever() {
      this.feverLeft = FEVER_TIME;
      this.floatText('老闆加碼！\n10 秒內分數 ×2', W / 2, 520, 0xffc94d, 52);
      this.cameras.main.flash(300, 90, 70, 20);
      Sound.play('big', 1.2, -2);
      this.tip('fever');
    }

    removeBall(ball) {
      const i = this.balls.indexOf(ball);
      if (i >= 0) this.balls.splice(i, 1);
      this.matter.world.remove(ball.body);
      if (this.ballsLeft === 0 && this.balls.length === 0 && !this.tut) this.endGame();
    }

    endGame() {
      this.feverLeft = 0; this.feverText.setVisible(false);
      this.gameOver = true;
      let line2 = '';
      if (window.NM_records && this.player) {
        const r = window.NM_records.add(this.player, this.score);
        line2 = r.newBest && r.best > 0 ? '\n新紀錄！歷史最高 ' + r.best + ' 分' : '\n今日最高 ' + r.todayBest + '　歷史最高 ' + r.best;
        if (r.newBest && r.best > 0) Sound.play('big');
      }
      // 上傳到線上排行榜，回來再補上名次（連不上就算了）
      if (window.NM_cloud && this.player && this.score > 0) {
        const base = this.player + '　這局 ' + this.score + ' 分' + line2, round = this.round = (this.round || 0) + 1;
        window.NM_cloud.submit(this.player, this.score).then((d) => {
          if (!d || !d.ok || round !== this.round || !this.gameOver) return;
          this.msgText.setText(base + '\n今日第 ' + d.rankToday + ' 名　歷史第 ' + d.rankAll + ' 名');
        }).catch(() => {});
      }
      this.msgText.setText(this.player + '　這局 ' + this.score + ' 分' + line2).setVisible(true);
      this.restartBg.setVisible(true); this.restartText.setVisible(true);
      this.switchText.setVisible(true); this.overPanel.setVisible(true);
    }

    restart() {
      for (const b of this.balls.slice()) this.removeBall(b);
      this.score = 0; this.ballsLeft = BALLS_PER_GAME; this.ironLeft = IRON_PER_GAME; this.ballType = 'pearl';
      this.gameOver = false; this.noDropUntil = this.time.now + 300;
      this.resetBonus();
      this.msgText.setVisible(false); this.restartBg.setVisible(false); this.restartText.setVisible(false); this.switchText.setVisible(false); this.overPanel.setVisible(false);
      this.updateUI();
    }

    // ───────────── 特效 ─────────────
    burst(x, y, color, amount) {
      for (let i = 0; i < amount; i++) {
        const ang = -Math.PI / 2 + (this.rng() * 2 - 1) * (65 * Math.PI / 180);
        const sp = 220 + this.rng() * 300;
        this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.8, max: 0.8, size: 4 + this.rng() * 4, color });
      }
    }

    // 浮字重複使用（每個 Text 都有自己的 canvas，iOS 有 canvas 總記憶體上限；2026-10-15 效能研究建議）
    floatText(text, x, y, color, size) {
      this.textPool = this.textPool || [];
      let t = this.textPool.find((o) => !o.active);
      if (!t) { t = this.add.text(0, 0, '', { fontFamily: FONT, stroke: '#000000', strokeThickness: 6, align: 'center', resolution: 2 }).setOrigin(0.5).setDepth(15); this.textPool.push(t); }
      this.tweens.killTweensOf(t);
      t.setActive(true).setVisible(true).setAlpha(1).setScale(0.6).setPosition(x, y).setText(text).setFontSize(Math.round(size)).setColor(hex(color));
      this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.Out' });
      this.tweens.add({ targets: t, y: y - 90, duration: 900, ease: 'Sine.Out' });
      this.tweens.add({ targets: t, alpha: 0, duration: 500, delay: 450, onComplete: () => t.setActive(false).setVisible(false) });
    }

    // ───────────── 每格更新與繪製 ─────────────
    update(time, delta) {
      const dt = Math.min(delta, 50);
      this.time0 = time / 1000;
      if (!this.gameOver) this.clock += dt;
      if (this.feverLeft > 0) {
        this.feverLeft -= dt;
        if (this.feverLeft > 0) this.feverText.setText('老闆加碼 ×2　剩 ' + Math.ceil(this.feverLeft / 1000) + ' 秒').setVisible(true);
        else this.feverText.setVisible(false);
      }
      const M = this.M;
      this.acc = (this.acc || 0) + dt;
      let steps = 0;
      while (this.acc >= STEP_MS && steps < 12) {
        for (const ball of this.balls) {
          // 各彈珠自己的重力倍數（Matter 不支援每顆球不同重力，自己補上差額）
          const extra = BALL_TYPES[ball.type].gravity - 1;
          if (extra && ball.stick <= 0) ball.body.force.y += ball.body.mass * GRAVITY * 0.001 * extra;
        }
        this.matter.world.step(STEP_MS); this.acc -= STEP_MS; steps++;
        for (const ball of this.balls) if (ball.type === 'iron') this.ironPass(ball);
      }
      if (steps === 12) this.acc = 0;   // 太卡就放掉落後的時間，不要越追越慢

      for (const peg of this.pegs) {
        peg.flash = Math.max(0, peg.flash - dt / 1000 * 3.5);
        if (peg.down > 0) { peg.down -= dt; if (peg.down <= 0) peg.body.isSensor = false; }
      }
      for (let i = 0; i < 5; i++) this.pocketFlash[i] = Math.max(0, this.pocketFlash[i] - dt / 1000 * 2);

      for (const ball of this.balls.slice()) {
        const b = ball.body;
        ball.hitCd = Math.max(0, ball.hitCd - dt);
        ball.stickCd = Math.max(0, ball.stickCd - dt);
        ball.trail.push({ x: b.position.x, y: b.position.y });
        if (ball.trail.length > 10) ball.trail.shift();
        if (ball.stick > 0) {
          // 麻糬黏住：停在釘子上，時間到再滑下去
          ball.stick -= dt;
          M.Body.setPosition(b, ball.stickPos);
          M.Body.setVelocity(b, { x: 0, y: 0 });
          if (ball.stick <= 0) {
            // 鬆開時往釘子外側滑，不要又落回同一根釘子
            const dx = b.position.x - ball.stickPeg.x;
            const dir = Math.abs(dx) > 1 ? Math.sign(dx) : (this.rng() < 0.5 ? -1 : 1);
            M.Body.setVelocity(b, { x: dir * MOCHI_SLIDE, y: 0.5 });
          }
          ball.stuck = 0;
        } else if (Math.hypot(vel(b).x, vel(b).y) < 0.13) {
          // 卡住保護：幾乎不動超過 2 秒就輕推一下
          ball.stuck += dt;
          if (ball.stuck > 2000) { M.Body.setVelocity(b, { x: (this.rng() * 2 - 1) * 1, y: -0.7 }); ball.stuck = 0; }
        } else ball.stuck = 0;
        if (b.position.y > H + 80) this.removeBall(ball);
      }
      for (const p of this.particles) { p.life -= dt / 1000; p.vy += 1100 * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; }
      this.particles = this.particles.filter((p) => p.life > 0);
      this.draw();
      if (this.tut) this.drawTutorial(this.time0);
    }

    draw() {
      const g = this.g, t = this.time0;
      g.clear();
      // 頂端一串夜市燈泡，慢慢閃
      const n = 14;
      for (let i = 0; i < n; i++) {
        const x = WALL + (W - WALL * 2) * (i + 0.5) / n, y = 104 + Math.sin(i / n * Math.PI) * 18;
        const c = C.lanterns[i % C.lanterns.length], fv = this.feverLeft > 0, glow = fv ? 0.75 + 0.25 * Math.sin(t * 14 + i * 1.7) : 0.55 + 0.45 * Math.sin(t * 2.2 + i * 0.9);
        g.fillStyle(c, (fv ? 0.35 : 0.18) * glow).fillCircle(x, y, fv ? 20 : 14);
        g.fillStyle(lerpColor(c, 0xffffff, 0.3 * glow)).fillCircle(x, y, 6);
      }
      // 賓果卡：3×3，左邊的點是彈珠種類，蓋到章的格子亮起來
      if (this.bingo) {
        const x0 = 52, y0 = 150, cs = 28, gap = 4;
        for (let r = 0; r < 3; r++) {
          const info = BALL_TYPES[TYPE_ORDER[r]];
          g.fillStyle(info.color).fillCircle(x0 - 14, y0 + r * (cs + gap) + cs / 2, 8);
          g.lineStyle(1.5, info.hi, 0.8).strokeCircle(x0 - 14, y0 + r * (cs + gap) + cs / 2, 8);
          for (let c = 0; c < 3; c++) {
            const on = this.bingo[r * 3 + c], bx = x0 + c * (cs + gap), by = y0 + r * (cs + gap);
            g.fillStyle(on ? 0xffc94d : 0x2a2340, on ? 0.95 : 1).fillRect(bx, by, cs, cs);
            g.lineStyle(1, 0x3a2f5c).strokeRect(bx, by, cs, cs);
          }
        }
      }
      // 放球位置的預覽
      if (this.ballsLeft > 0 && !this.gameOver) {
        const info = BALL_TYPES[this.ballType];
        for (let k = 0; k < 5; k++) g.fillStyle(0x8f86b3, 0.6 - k * 0.1).fillCircle(this.dropX, DROP_Y + 30 + k * 16, 2);
        g.fillStyle(info.color, 0.4 + 0.15 * Math.sin(t * 6)).fillCircle(this.dropX, DROP_Y, info.r);
        g.lineStyle(2, info.hi, 0.5).strokeCircle(this.dropX, DROP_Y, info.r);
      }
      // 釘子：被撞到會亮、會放大；被鐵球撞倒時變暗壓扁
      for (const p of this.pegs) {
        if (p.down <= 0 && p.flash <= 0) continue;   // 正常狀態的釘子已經在底圖上
        if (p.down > 0) {
          const back = 1 - p.down / IRON_KNOCK_TIME;
          g.fillStyle(C.board).fillCircle(p.x, p.y, PEG_R + 1);   // 先蓋掉底圖上的釘子
          g.fillStyle(C.peg, 0.25 + 0.5 * back).fillEllipse(p.x, p.y + 4, PEG_R * 2.6, PEG_R * 2 * (0.4 + 0.6 * back));
          continue;
        }
        if (p.flash > 0) g.fillStyle(0xffe699, 0.25 * p.flash).fillCircle(p.x, p.y, PEG_R * (2.2 + p.flash));
        g.fillStyle(lerpColor(C.peg, 0xffffff, p.flash)).fillCircle(p.x, p.y, PEG_R * (1 + 0.45 * p.flash));
      }
      // 洞
      const pw = this.pocketWidth();
      for (let i = 0; i < POCKETS.length; i++) {
        const c = C.pockets[i], f = this.pocketFlash[i];
        if (f <= 0) continue;   // 平常的樣子已經在底圖上
        const rx = WALL + pw * i + 4, ry = POCKET_TOP + 20, rw = pw - 8, rh = FLOOR_Y - POCKET_TOP - 20;
        g.fillStyle(c, 0.35 * f).fillRect(rx, ry, rw, rh);
        g.fillStyle(lerpColor(c, 0xffffff, f)).fillRect(rx, FLOOR_Y - 8, rw, 8);
      }
      // 球：拖尾＋本體＋反光
      for (const ball of this.balls) {
        const info = BALL_TYPES[ball.type], r = info.r, p = ball.body.position;
        ball.trail.forEach((q, k) => {
          const a = (k + 1) / (ball.trail.length + 1);
          g.fillStyle(info.color, 0.22 * a).fillCircle(q.x, q.y, r * (0.4 + 0.5 * a));
        });
        if (ball.type === 'mochi' && ball.stick > 0) {
          g.fillStyle(info.color).fillEllipse(p.x, p.y, r * 2 * 1.18, r * 2 * 0.84);   // 黏住時被壓扁一點
        } else {
          g.fillStyle(info.color).fillCircle(p.x, p.y, r);
          if (ball.type === 'pearl') g.lineStyle(2, 0x2a160d).strokeCircle(p.x, p.y, r);
        }
        g.fillStyle(info.hi).fillCircle(p.x - 4, p.y - 4, r * 0.35);
      }
      // 粒子
      const fx = this.fx; fx.clear();
      for (const q of this.particles) fx.fillStyle(q.color, Math.min(1, q.life / q.max * 1.5)).fillCircle(q.x, q.y, q.size / 2);
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W, height: H,
    backgroundColor: '#120f1f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'matter', matter: { gravity: { y: GRAVITY }, enableSleeping: false, positionIterations: 8, velocityIterations: 6 } },
    audio: { noAudio: true },
    input: { activePointers: 2 },
    scene: Pinball,
  });
})();

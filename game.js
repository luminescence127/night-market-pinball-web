// 夜市彈珠台（網頁版，Phaser 3.90 + 內建 Matter.js 物理，都是 MIT）。
// 2026-10-15 從 Godot 版（scripts/main.gd）照搬：Godot 網頁版 43 MB，iPhone 4G 打不開，使用者選「改用 Phaser 重寫」。
// 玩法：先選彈珠，手指左右滑（或滑鼠移動）選落點，點一下放球；球撞釘子掉進底部的洞得分，10 顆用完一局結束。
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

  // ── 手感參數（調手感主要改這裡）──
  const GRAVITY = 1.5;           // Matter 的重力（1 約等於 1000 px/s²；Godot 版是 1500）
  const STEP_MS = 1000 / 180;     // 物理固定每秒算 180 次：手機 60／120 Hz、電腦 165 Hz 手感都一樣，也避免球太快穿過釘子
  const PEG_BOUNCE = 0;          // Matter 的彈性取兩者較大值：釘子設 0，球照自己的彈性彈
  const JITTER = 2;              // 放球時隨機偏移幾像素：約七成可預測、三成混沌
  const DROP_COOLDOWN = 220;     // 毫秒
  const AIR = 0.0006;             // 空氣阻力（每一步；每秒約剩九成，跟 Godot 預設差不多）

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
        this.ctx = new AC();
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
      if (!this.ctx || !this.buf[name] || this.ctx.state !== 'running') return;
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
      this.input.on('pointermove', (p) => { this.dropX = this.clampX(p.x); });
      this.input.on('pointerdown', (p, over) => {
        Sound.unlock();
        // 點在按鈕上（換彈珠、再玩一局）不放球：之前按「再玩一局」那一下會同時被台面收到，新的一局一開始就自己掉一顆珍珠（2026-10-15 使用者回報）
        if (p.y < 92 || this.gameOver || (over && over.length) || this.time.now < this.noDropUntil) return;
        this.dropX = this.clampX(p.x);
        this.dropBall();
      });
      this.input.keyboard && this.input.keyboard.on('keydown', (e) => {
        Sound.unlock();
        for (const t of TYPE_ORDER) if (e.key === BALL_TYPES[t].key) this.selectType(t);
      });
      window.__game = this; // 給自動測試用
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
      this.ballsText = this.add.text(32, 56, '', { fontFamily: FONT, fontSize: '20px', color: C.dim, resolution: 2 }).setDepth(10);
      this.buttons = {};
      TYPE_ORDER.forEach((t, i) => {
        const x = 296 + i * 140, y = 8;
        const bg = this.add.rectangle(x, y, 132, 76, 0x2a2340).setOrigin(0).setStrokeStyle(2, 0x3a2f5c).setDepth(10).setInteractive({ useHandCursor: true });
        const label = this.add.text(x + 66, y + 38, '', { fontFamily: FONT, fontSize: '22px', color: C.text, align: 'center', resolution: 2 }).setOrigin(0.5).setDepth(11);
        bg.on('pointerdown', (p, lx, ly, ev) => { Sound.unlock(); this.selectType(t); ev && ev.stopPropagation && ev.stopPropagation(); });
        this.buttons[t] = { bg, label };
      });
      this.msgText = this.add.text(W / 2, 560, '', { fontFamily: FONT, fontSize: '52px', color: C.text, resolution: 2 }).setOrigin(0.5).setDepth(20).setVisible(false);
      this.restartBg = this.add.rectangle(W / 2, 672, 260, 84, 0xffc94d).setDepth(20).setVisible(false).setInteractive({ useHandCursor: true });
      this.restartText = this.add.text(W / 2, 672, '再玩一局', { fontFamily: FONT, fontSize: '34px', color: '#1c1730', resolution: 2 }).setOrigin(0.5).setDepth(21).setVisible(false);
      this.restartBg.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); this.restart(); });
    }

    selectType(t) {
      if (t === 'iron' && this.ironLeft <= 0) return;
      this.ballType = t;
      this.updateUI();
    }

    updateUI() {
      this.scoreText.setText(this.score + ' 分');
      this.ballsText.setText('剩 ' + this.ballsLeft + ' 顆　按 1／2／3 換彈珠');
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
      const points = POCKETS[index] * info.mult;
      this.score += points;
      this.history.push({ type: ball.type, points: points + ball.pts });
      this.pocketFlash[index] = 1;
      const { x, y } = ball.body.position;
      this.removeBall(ball);
      const color = C.pockets[index];
      this.burst(x, y, color, 14 + Math.floor(points / 4));
      this.floatText('+' + points + (info.mult > 1 ? '（×2）' : ''), x, y - 40, color, 34 + Math.min(points, 200) / 6);
      if (points >= 100) { this.cameras.main.shake(260, 0.012); Sound.play('big', 1, -2); }
      else { this.cameras.main.shake(90, 0.003); Sound.play('ding', points >= 50 ? 1 : 0.8, -5); }
      this.updateUI();
    }

    removeBall(ball) {
      const i = this.balls.indexOf(ball);
      if (i >= 0) this.balls.splice(i, 1);
      this.matter.world.remove(ball.body);
      if (this.ballsLeft === 0 && this.balls.length === 0) this.endGame();
    }

    endGame() {
      this.gameOver = true;
      this.msgText.setText('這局 ' + this.score + ' 分').setVisible(true);
      this.restartBg.setVisible(true); this.restartText.setVisible(true);
    }

    restart() {
      for (const b of this.balls.slice()) this.removeBall(b);
      this.score = 0; this.ballsLeft = BALLS_PER_GAME; this.ironLeft = IRON_PER_GAME; this.ballType = 'pearl';
      this.gameOver = false; this.noDropUntil = this.time.now + 300;
      this.msgText.setVisible(false); this.restartBg.setVisible(false); this.restartText.setVisible(false);
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
      if (!t) { t = this.add.text(0, 0, '', { fontFamily: FONT, stroke: '#000000', strokeThickness: 6, resolution: 2 }).setOrigin(0.5).setDepth(15); this.textPool.push(t); }
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
    }

    draw() {
      const g = this.g, t = this.time0;
      g.clear();
      // 頂端一串夜市燈泡，慢慢閃
      const n = 14;
      for (let i = 0; i < n; i++) {
        const x = WALL + (W - WALL * 2) * (i + 0.5) / n, y = 104 + Math.sin(i / n * Math.PI) * 18;
        const c = C.lanterns[i % C.lanterns.length], glow = 0.55 + 0.45 * Math.sin(t * 2.2 + i * 0.9);
        g.fillStyle(c, 0.18 * glow).fillCircle(x, y, 14);
        g.fillStyle(lerpColor(c, 0xffffff, 0.3 * glow)).fillCircle(x, y, 6);
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

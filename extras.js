// 開始畫面的「附加功能」（2026-10-16 從 index.html 搬出來）：玩家問卷、備份碼。
// 為什麼分開：index.html 有「壓縮後 ≤ 12 KB」的預算（它要最先出現），加了問卷和備份碼後超過；
// 這兩個不是一打開就要用，等開始畫面出來再載入。index.html 透過 window.NM_core 把共用的函式交給這裡。
(function () {
  var C = window.NM_core;
  if (!C) return;
  var load = C.load, save = C.save, cloud = C.cloud, sid = C.sid, VER = C.VER, showRec = C.showRec, showPeople = C.showPeople;
  var style = document.createElement('style');
  style.textContent = "  /* 玩家問卷（10/16）：跟給作者的審閱頁同一套做法——一題一塊、按鈕作答、每題可以補一句、最後自由填寫 */\n  #fb{display:none;position:fixed;inset:0;z-index:30;background:rgba(10,8,20,.82);overflow-y:auto;touch-action:pan-y;-webkit-user-select:text;user-select:text}\n  #fb .panel{max-width:420px;margin:20px auto 40px;background:#1c1730;border:1px solid #3a2f5c;border-radius:14px;padding:18px 16px;color:#e9e4ff;font:16px/1.6 \"PingFang TC\",\"Noto Sans TC\",\"Microsoft JhengHei\",sans-serif;box-sizing:border-box;width:calc(100% - 32px)}\n  #fb h2{margin:0 0 4px;font-size:22px;color:#ffc94d}\n  #fb .ctx{color:#8f86b3;font-size:14px;margin:0 0 12px}\n  #fb .q{border-top:1px solid #2f2750;padding:12px 0}\n  #fb .q h3{margin:0 0 8px;font-size:17px}\n  #fb .q .d{color:#8f86b3;font-size:13px;margin:-4px 0 8px}\n  #fb .opts{display:flex;flex-wrap:wrap;gap:8px}\n  #fb button{font:inherit;font-size:15px;min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #3a2f5c;background:#2a2340;color:#e9e4ff}\n  #fb button[aria-pressed=\"true\"]{background:#4a3d72;border-color:#ffc94d;color:#ffc94d;font-weight:700}\n  #fb .more{background:transparent;border:0;color:#8fb7d6;font-size:14px;min-height:36px;padding:4px 0}\n  #fb input,#fb textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;color:#fff;background:#120f1f;border:1px solid #3a2f5c;border-radius:8px;padding:8px 10px;margin-top:6px}\n  #fb textarea{min-height:90px}\n  #fb .row{display:flex;gap:10px;margin-top:14px;position:sticky;bottom:0;background:#1c1730;padding:10px 0 4px}\n  #fb .send{flex:1;background:#ffc94d;color:#1c1730;border:0;font-weight:700;font-size:18px}\n  #fb .msg{min-height:1.4em;color:#9be37a;font-size:15px;margin-top:8px}\n  /* 備份碼視窗：沿用問卷的版面 */\n  #bk{display:none;position:fixed;inset:0;z-index:30;background:rgba(10,8,20,.82);overflow-y:auto;touch-action:pan-y;-webkit-user-select:text;user-select:text}\n  #bk .panel{max-width:420px;margin:20px auto 40px;background:#1c1730;border:1px solid #3a2f5c;border-radius:14px;padding:18px 16px;color:#e9e4ff;font:16px/1.6 \"PingFang TC\",\"Noto Sans TC\",\"Microsoft JhengHei\",sans-serif;box-sizing:border-box;width:calc(100% - 32px)}\n  #bk h2{margin:0 0 4px;font-size:22px;color:#ffc94d}\n  #bk h3{margin:0 0 8px;font-size:17px}\n  #bk .ctx,#bk .d{color:#8f86b3;font-size:14px;margin:6px 0}\n  #bk .q{border-top:1px solid #2f2750;padding:12px 0}\n  #bk .row{display:flex;gap:10px;margin-top:8px}\n  #bk button{font:inherit;font-size:16px;min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid #3a2f5c;background:#2a2340;color:#e9e4ff}\n  #bk .send{background:#ffc94d;color:#1c1730;border:0;font-weight:700}\n  #bk input{width:100%;box-sizing:border-box;font:inherit;font-size:22px;letter-spacing:.2em;text-transform:uppercase;text-align:center;color:#fff;background:#120f1f;border:1px solid #3a2f5c;border-radius:8px;padding:8px 10px}\n  #bk .code{font:700 32px/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.18em;color:#ffc94d;text-align:center;background:#120f1f;border-radius:10px;padding:10px;margin:10px 0 0;-webkit-user-select:all;user-select:all}\n  #bk .msg{min-height:1.4em;color:#9be37a;font-size:15px}";
  document.head.appendChild(style);
  var box = document.createElement('div');
  box.innerHTML = "<div id=\"fb\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"fbTitle\"><div class=\"panel\"></div></div>\n<div id=\"bk\" class=\"sheet\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"bkTitle\"><div class=\"panel\">\n  <h2 id=\"bkTitle\">換手機／備份進度</h2>\n  <p class=\"ctx\">進度存在這支手機裡。換手機、清掉瀏覽器資料、或 iPhone 太久沒打開，進度可能會不見。先產生一組備份碼抄下來，新手機輸入就能拿回來。</p>\n  <div class=\"q\"><h3>在這支手機產生備份碼</h3>\n    <div class=\"row\"><button type=\"button\" id=\"bkMake\" class=\"send\">產生備份碼</button></div>\n    <p id=\"bkCode\" class=\"code\" hidden></p>\n    <p class=\"d\">備份碼保存 1 年。每按一次會產生新的一組，舊的照樣能用。</p>\n  </div>\n  <div class=\"q\"><h3>在新手機輸入備份碼</h3>\n    <input id=\"bkIn\" maxlength=\"8\" autocomplete=\"off\" autocapitalize=\"characters\" placeholder=\"8 個字，例如 4XXKG8M6\">\n    <div class=\"row\"><button type=\"button\" id=\"bkLoad\">拿回進度</button></div>\n    <p class=\"d\">會跟這支手機原本的進度合併：每關留比較好的星星和分數，不會蓋掉。</p>\n  </div>\n  <div class=\"msg\" role=\"status\"></div>\n  <div class=\"row\"><button type=\"button\" class=\"close\">關閉</button></div>\n</div></div>";
  while (box.firstChild) document.body.appendChild(box.firstChild);

  // ── 玩家問卷（2026-10-16 使用者：「幫我設計問卷讓玩家可以在遊戲上自由填寫嗎 就像寫給我的彙報一樣」）──
  // 一題一塊、按鈕作答、每題可「補一句」、最後自由填寫；全部選填。不送名字，只送隨機手機代號與剛剛玩的關卡。
  // 結果看：node tools/feedback_report.cjs（加 --staging 看測試用）
  var FB_QS = [
    { id: 'F1', q: '剛剛這關好玩嗎？', o: ['😆 很好玩', '🙂 還可以', '😐 有點無聊'] },
    { id: 'F2', q: '難度？', o: ['太簡單', '剛好', '太難'] },
    { id: 'F3', q: '打輸的時候，覺得是？', d: '沒輸過可以跳過', o: ['自己哪一顆打錯', '一半一半', '運氣不好'] },
    { id: 'F4', q: '現在最想？', o: ['再打一次這關', '玩下一關', '先休息'] },
    { id: 'F5', q: '最喜歡哪個東西？', o: ['金魚', '連鎖爆', '爆米花', '硬殼', '數字燈籠', '撈網', '老闆招牌', '三種彈珠'] },
  ];
  var FB_KEY = 'nm_fb', fbEl = document.getElementById('fb'), fbCtx = null;
  function fbDevice() { var u = navigator.userAgent; return /iPhone|iPad|iPod/.test(u) ? 'ios' : /Android/.test(u) ? 'android' : 'desktop'; }
  function esc(s) { return String(s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  window.NM_feedback = function (ctx) {
    fbCtx = ctx || {};
    var where = fbCtx.level ? '剛剛玩：' + fbCtx.level + ' ' + (fbCtx.levelName || '') + (fbCtx.result === 'clear' ? '（過關 ' + '★'.repeat(fbCtx.stars || 0) + '）' : fbCtx.result === 'fail' ? '（沒過）' : '') : '隨時都可以填，每題都可以跳過';
    var h = '<h2 id="fbTitle">給做遊戲的人：30 秒問卷</h2><p class="ctx">' + esc(where) + '</p>';
    FB_QS.forEach(function (x) {
      h += '<div class="q" data-q="' + x.id + '"><h3>' + esc(x.q) + '</h3>' + (x.d ? '<p class="d">' + esc(x.d) + '</p>' : '') + '<div class="opts">';
      x.o.forEach(function (o) { h += '<button type="button" data-v="' + esc(o) + '" aria-pressed="false">' + esc(o) + '</button>'; });
      h += '</div><button type="button" class="more">＋補一句</button><input type="text" maxlength="200" placeholder="想多說的（選填）" hidden></div>';
    });
    h += '<div class="q"><h3>還有什麼想跟做遊戲的人說？</h3><p class="d">哪裡卡住、想要什麼新玩法、哪裡看不懂，都可以寫（選填；請不要寫電話、地址、真實姓名）</p><textarea id="fbText" maxlength="500"></textarea></div>';
    h += '<div class="row"><button type="button" class="send">送出</button><button type="button" class="close">下次再說</button></div><div class="msg" role="status"></div>';
    fbEl.querySelector('.panel').innerHTML = h;
    fbEl.style.display = 'block'; fbEl.scrollTop = 0;
    gameInput(false);   // 問卷開著時遊戲不收觸控：iPhone 上遊戲的觸控處理會把問卷捲回最上面，按「送出」放開時落在別的按鈕（10/16 自動測試抓到）
    var st = load(FB_KEY, {}); st.shown = (st.shown || 0) + 1; if (fbCtx.zone) { st.asked = st.asked || {}; st.asked[fbCtx.zone] = 1; } save(FB_KEY, st);
  };
  // 自動問一次：每一區最多一次（玩完那一區最後一關、或那一區打滿 4 局）；填過就不再自動跳
  window.NM_feedbackShouldAsk = function (zone, endsInZone, lastLevel) {
    var st = load(FB_KEY, {});
    return !(st.asked && st.asked[zone]) && (lastLevel || endsInZone >= 4);
  };
  function gameInput(on) { try { var g = window.__game && window.__game.game; if (g && g.input) g.input.enabled = on; } catch (e) {} }
  function fbClose() { fbEl.style.display = 'none'; gameInput(true); if (fbCtx && fbCtx.onClose) fbCtx.onClose(); }
  fbEl.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) { if (e.target === fbEl) fbClose(); return; }
    var q = b.closest('.q');
    if (b.classList.contains('more')) { var inp = q.querySelector('input'); inp.hidden = false; inp.focus(); b.hidden = true; return; }
    if (b.classList.contains('close')) { fbClose(); return; }
    if (b.classList.contains('send')) {
      var answers = {}, notes = {};
      fbEl.querySelectorAll('.q[data-q]').forEach(function (el) {
        var on = el.querySelector('button[aria-pressed="true"]'), inp = el.querySelector('input');
        if (on) answers[el.dataset.q] = on.dataset.v;
        if (inp && inp.value.trim()) notes[el.dataset.q] = inp.value.trim();
      });
      var text = document.getElementById('fbText').value.trim(), msg = fbEl.querySelector('.msg');
      if (!Object.keys(answers).length && !Object.keys(notes).length && !text) { msg.style.color = '#ffb36b'; msg.textContent = '還沒填任何一題喔'; return; }
      b.disabled = true; msg.style.color = '#c9c1ee'; msg.textContent = '送出中…';
      var body = { sid: sid(), stall: fbCtx.zone || null, level: fbCtx.level || null, result: fbCtx.result || null, stars: fbCtx.stars, answers: answers, notes: notes, text: text, device: fbDevice(), ver: VER };
      cloud('/feedback', body).then(function (d) {
        if (!d || !d.ok) throw new Error(d && d.error);
        var st = load(FB_KEY, {}); st.sent = (st.sent || 0) + 1; save(FB_KEY, st);
        msg.style.color = '#9be37a'; msg.textContent = '收到了，謝謝你！🙏';
        setTimeout(fbClose, 1200);
      }).catch(function () { b.disabled = false; msg.style.color = '#ffb36b'; msg.textContent = '沒送出去（網路不穩或按太快），等一下再按一次'; });
      return;
    }
    if (q && b.dataset.v != null) {   // 單選：再按一次取消
      var was = b.getAttribute('aria-pressed') === 'true';
      q.querySelectorAll('.opts button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', was ? 'false' : 'true');
    }
  });
  document.getElementById('fbBtn').onclick = function () { window.NM_feedback({}); };

  // ── 備份碼（使用者 10/16 選「做備份碼」：免費、不多收個資）──
  // 把這支手機裡遊戲的存檔（nm_ 開頭，手機代號與問卷紀錄除外）打包送到伺服器，換一組 8 個字的碼；新手機輸入碼就拿回來。
  // 拿回來時跟原本的合併：清台每關留比較好的星星與分數；其他資料這支手機沒有才放進去，不會蓋掉。
  var BK_SKIP = { nm_sid: 1, nm_fb: 1 }, BK_VER = 1, bkEl = document.getElementById('bk');
  function bkPack() {
    var keys = {};
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^nm_/.test(k) && !BK_SKIP[k]) keys[k] = localStorage.getItem(k); } } catch (e) {}
    return JSON.stringify({ v: BK_VER, keys: keys });
  }
  function bkMerge(packed) {
    var p = JSON.parse(packed), keys = (p && p.keys) || {}, levels = 0;
    Object.keys(keys).forEach(function (k) {
      if (!/^nm_/.test(k) || BK_SKIP[k]) return;
      if (k === 'nm_stall') {
        var mine = load('nm_stall', {}), theirs = JSON.parse(keys[k] || '{}');
        Object.keys(theirs).forEach(function (name) {
          var a = mine[name] = mine[name] || {}, b = theirs[name] || {};
          Object.keys(b).forEach(function (lv) {
            var x = a[lv] || { stars: 0, best: 0 }, y = b[lv] || {};
            a[lv] = { stars: Math.max(x.stars || 0, y.stars || 0), best: Math.max(x.best || 0, y.best || 0) };
            levels++;
          });
        });
        save('nm_stall', mine);
      } else {
        try { if (localStorage.getItem(k) == null) localStorage.setItem(k, keys[k]); } catch (e) {}
      }
    });
    return levels;
  }
  window.NM_backup = { pack: bkPack, merge: bkMerge };
  function bkMsg(t, bad) { var m = bkEl.querySelector('.msg'); m.style.color = bad ? '#ffb36b' : '#9be37a'; m.textContent = t; }
  document.getElementById('bkBtn').onclick = function () { bkEl.style.display = 'block'; bkEl.scrollTop = 0; bkMsg(''); document.getElementById('bkCode').hidden = true; };
  bkEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) { if (e.target === bkEl) bkEl.style.display = 'none'; return; }
    if (b.classList.contains('close')) { bkEl.style.display = 'none'; return; }
    if (b.id === 'bkMake') {
      b.disabled = true; bkMsg('產生中…');
      cloud('/backup', { sid: sid(), data: bkPack(), ver: VER }).then(function (d) {
        if (!d || !d.code) throw new Error(d && d.error);
        var c = document.getElementById('bkCode'); c.textContent = d.code; c.hidden = false;
        bkMsg('抄下這組碼（或截圖），換手機時輸入就能拿回進度');
      }).catch(function () { bkMsg('沒產生成功（網路不穩或按太快），等一下再按一次', true); }).then(function () { b.disabled = false; });
      return;
    }
    if (b.id === 'bkLoad') {
      var code = document.getElementById('bkIn').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) { bkMsg('備份碼是 8 個字（英文和數字，沒有 0、O、1、I、L）', true); return; }
      b.disabled = true; bkMsg('拿回中…');
      cloud('/backup/' + code).then(function (d) {
        if (!d || !d.data) throw new Error(d && d.error);
        var n = bkMerge(d.data);
        showRec(); showPeople();
        bkMsg('拿回來了！' + (n ? '合併了 ' + n + ' 關的紀錄' : '（這組碼裡沒有清台紀錄）'));
      }).catch(function () { bkMsg('找不到這組碼，或網路不穩。檢查一下有沒有打錯', true); }).then(function () { b.disabled = false; });
    }
  });
})();

/**
 * audio.js — 场景音效（Web Audio 合成，无外部文件）
 * 支持 LocalStorage 持久化开关
 */

const AudioFX = (() => {
  const SOUND_KEY = 'sketch_todo_sound';
  let enabled = true;
  let ctx = null;

  function loadPref() {
    const stored = localStorage.getItem(SOUND_KEY);
    enabled = stored !== 'false';
    updateToggleUI();
  }

  function savePref() {
    localStorage.setItem(SOUND_KEY, String(enabled));
  }

  function getContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** 合成短促干净音效（柔和 attack，避免爆音） */
  function tone(freq, duration, type = 'sine', volume = 0.05, decay = 0.015) {
    if (!enabled) return;
    try {
      const ac = getContext();
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now);
      osc.stop(now + duration + decay);
    } catch { /* 静默失败 */ }
  }

  /** 生成白噪声 buffer — 可选带扫频(从 startF → endF 快速衰减高通) */
  function noiseBuffer(seconds, fadeOut = true) {
    const ac = getContext();
    const len = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = fadeOut ? 1 - i / len : 1;
      data[i] = (Math.random() * 2 - 1) * env;
    }
    return buffer;
  }

  /** 通用：滤波噪声发声（可带频率扫动 + 振幅包络） */
  function filteredNoise({
    duration = 0.12,
    bandpass = { f: 3200, q: 0.75 },
    hp = null, lp = null,
    volume = 0.05,
    attack = 0.005,
    release = 0.06,
    sweepF = null, // {from, to} 扫频
    type = 'noise',
  }) {
    if (!enabled) return;
    try {
      const ac = getContext();
      const now = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(duration, false);
      let prev = src;
      if (hp) {
        const h = ac.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
        prev.connect(h); prev = h;
      }
      if (lp) {
        const l = ac.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
        prev.connect(l); prev = l;
      }
      if (bandpass) {
        const b = ac.createBiquadFilter();
        b.type = 'bandpass';
        b.frequency.value = bandpass.f;
        if (sweepF) {
          b.frequency.setValueAtTime(sweepF.from, now);
          b.frequency.exponentialRampToValueAtTime(Math.max(60, sweepF.to), now + duration);
        }
        b.Q.value = bandpass.q;
        prev.connect(b); prev = b;
      }
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration + release);
      prev.connect(gain); gain.connect(ac.destination);
      src.start(now); src.stop(now + duration + release + 0.02);
    } catch { /* 静默失败 */ }
  }

  /* =============================================================
     纸质感拟真音效集合
     ============================================================= */

  /** 纸张触碰（指尖轻拍纸面，短促）— click/paper/checkbox/toggle 通用 */
  function paperTouch(volume = 0.05) {
    filteredNoise({
      duration: 0.06, bandpass: { f: 2400, q: 0.85 },
      volume: volume, attack: 0.003, release: 0.035,
    });
  }

  /** 纸张摩擦（手指划过纸面，细碎沙沙） */
  function paperRustle(volume = 0.05) {
    filteredNoise({
      duration: 0.1, bandpass: { f: 3800, q: 0.7 },
      volume: volume * 0.9, attack: 0.005, release: 0.045,
    });
    setTimeout(() => filteredNoise({
      duration: 0.07, bandpass: { f: 4800, q: 0.55 },
      volume: volume * 0.35, attack: 0.004, release: 0.03,
    }), 32);
  }

  /** 纸张放置（便签放桌面：闷触+轻划） — add */
  function paperPlace(volume = 0.055) {
    // 闷触：低频
    filteredNoise({
      duration: 0.09, bandpass: { f: 550, q: 1.1 },
      volume: volume, attack: 0.004, release: 0.055,
    });
    // 轻划：中高频短促
    setTimeout(() => filteredNoise({
      duration: 0.07, bandpass: { f: 2600, q: 0.6 },
      volume: volume * 0.5, attack: 0.005, release: 0.04,
    }), 16);
  }

  /** 纸张对折（勾选完成 / todo → done）：两声折压 */
  function paperFold(volume = 0.055) {
    filteredNoise({
      duration: 0.1, bandpass: { f: 1400, q: 0.65 },
      sweepF: { from: 2600, to: 900 },
      volume: volume, attack: 0.004, release: 0.07,
    });
    setTimeout(() => filteredNoise({
      duration: 0.07, bandpass: { f: 800, q: 0.9 },
      volume: volume * 0.7, attack: 0.003, release: 0.05,
    }), 90);
  }

  /** 翻一页纸 — 语言切换 / 折叠面板 */
  function paperTurn(volume = 0.05) {
    filteredNoise({
      duration: 0.15, bandpass: { f: 2200, q: 0.55 },
      sweepF: { from: 900, to: 5200 },
      volume: volume * 0.85, attack: 0.008, release: 0.07,
    });
  }

  /** 撕纸 / 删除便签：高通噪声快速衰减 */
  function paperTear(volume = 0.055) {
    filteredNoise({
      duration: 0.18,
      hp: 1200,
      bandpass: null,
      lp: 6500,
      volume: volume, attack: 0.005, release: 0.13,
    });
    setTimeout(() => filteredNoise({
      duration: 0.09, hp: 2400, bandpass: null, lp: 7000,
      volume: volume * 0.55, attack: 0.004, release: 0.07,
    }), 40);
  }

  /** 纸篓落地声：低频 thud + 纸张沙沙尾音（保留原 thud 并加强） — discard */
  function thud(volume = 0.065) {
    if (!enabled) return;
    try {
      const ac = getContext();
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const og = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);
      og.gain.setValueAtTime(0, now);
      og.gain.linearRampToValueAtTime(volume * 0.95, now + 0.006);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(og);
      og.connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch { /* 静默失败 */ }
    // 纸落沙沙
    filteredNoise({
      duration: 0.14, bandpass: { f: 1600, q: 0.55 },
      volume: volume * 0.55, attack: 0.01, release: 0.09,
    });
    setTimeout(() => filteredNoise({
      duration: 0.1, lp: 800, bandpass: null, hp: 150,
      volume: volume * 0.35, attack: 0.005, release: 0.06,
    }), 20);
  }

  /** 纸放置桌面更闷的放下声 — drop（跨区拖动后的普通放下） */
  function paperDrop(volume = 0.05) {
    filteredNoise({
      duration: 0.085, bandpass: { f: 680, q: 1.0 },
      volume: volume, attack: 0.004, release: 0.055,
    });
  }

  /** 差异化场景音效（全纸张类，更柔和更克制 — 全部默认音量下调约 25~40%） */
  const sounds = {
    add:      () => paperPlace(0.038),          // 添加新便签：放桌面+轻划（下调约 30%）
    paper:    () => paperTouch(0.032),          // 点击便签：指触纸面（下调约 30%）
    click:    () => paperTouch(0.028),          // 通用按键点击：轻触（下调约 30%）
    discard:  () => thud(0.048),                // 丢入垃圾桶：落地+沙沙（下调约 26%）
    complete: () => paperFold(0.04),            // 勾选完成 / 拖入收纳：对折（下调约 27%）
    drop:     () => paperDrop(0.036),           // 跨区放下（todo/done 互拖）：闷放（下调约 28%）
    delete:   () => paperTear(0.042),           // 删除：撕纸（下调约 24%）
    lang:     () => paperTurn(0.035),           // 切换语言：翻页（下调约 27%）
    collapse: () => {                           // 折叠面板：小翻小折
      paperTurn(0.028);
      setTimeout(() => paperTouch(0.022), 140);
    },
  };

  function play(name) {
    if (sounds[name]) sounds[name]();
  }

  function toggle() {
    enabled = !enabled;
    savePref();
    updateToggleUI();
    if (enabled) play('click');
  }

  function isEnabled() {
    return enabled;
  }

  function updateToggleUI() {
    const btn = document.getElementById('sound-toggle');
    if (!btn) return;
    btn.dataset.enabled = enabled ? 'true' : 'false';
    btn.setAttribute('aria-pressed', String(enabled));
    const label = document.querySelector('[data-i18n="soundOn"]');
    const key = enabled ? 'soundOn' : 'soundOff';
    btn.title = I18n.t(key);
  }

  function bindToggle() {
    const btn = document.getElementById('sound-toggle');
    if (btn) btn.addEventListener('click', toggle);
  }

  function init() {
    loadPref();
    bindToggle();
    I18n.onChange(() => updateToggleUI());
  }

  return { init, play, toggle, isEnabled };
})();

/**
 * Music — 5 首柔和舒缓 ambient 纯音乐（Web Audio 合成）
 * 独立于音效开关，可调音量，可循环切歌，LocalStorage 记忆
 */
const Music = (() => {
  const MUSIC_KEY = 'sketch_todo_music';
  const VOL_KEY = 'sketch_todo_music_vol';
  const SONG_KEY = 'sketch_todo_music_song';

  // C 大调 / 五声音阶 频率池
  const PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
  const C_MAJOR    = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
  const CHORDS = [ // 大三和弦 / 小三和弦 (f1, f3, f5)
    [261.63, 329.63, 392.00],   // C
    [220.00, 261.63, 329.63],   // Am
    [349.23, 440.00, 523.25],   // F
    [392.00, 493.88, 587.33],   // G
  ];

  let enabled = false;
  let volume = 0.3;
  let songIdx = 0;
  let ctx = null;
  let masterGain = null;
  let songCleanup = null;
  let fadeTimer = null;

  const TRACKS = [
    // ————— 5 首悠扬多层次 ambient 纯音乐 —————
    // 层次结构（每首 4~5 层，音量克制，避免叠加爆音）：
    //   [BASS] 持续低频底音（sine + 呼吸 LFO）
    //   [PAD]   缓慢变化的和弦长音（3 音叠加 triad，长 attack 长 release）
    //   [MELODY A] 主悠扬旋律（单音 + 同步 3/5 度和声，间隔 ~1.6~2.6s，长衰减）
    //   [MELODY B] 对位/回声旋律（比 A 晚 280ms，高 1~2 级或高八度，轻音量，营造空间萦绕）
    //   [BELL]    高音风铃点缀（仅 Gentle Sun / Moon Light 加，音量极轻）

    // ========== 01 · Gentle Sun — C 大调五声，明亮温暖 ==========
    function gentleSun(ac, out) {
      const timers = [];
      const liveNodes = [];
      const track = (fn) => liveNodes.push(fn);

      // —— [BASS] 持续 C2 + C3 八度底音，LFO 呼吸 ——
      const bass = ac.createOscillator();
      const bass2 = ac.createOscillator();
      const bG = ac.createGain();
      bass.type = 'sine'; bass.frequency.value = 65.41;
      bass2.type = 'sine'; bass2.frequency.value = 130.81;
      bG.gain.value = 0;
      bass.connect(bG); bass2.connect(bG); bG.connect(out);
      const now0 = ac.currentTime;
      bG.gain.linearRampToValueAtTime(0.05, now0 + 5);
      bass.start(); bass2.start();
      track(() => { try { bass.stop(); } catch {} try { bass2.stop(); } catch {} });
      const lfo = ac.createOscillator();
      const lfoG = ac.createGain();
      lfo.frequency.value = 0.038;
      lfoG.gain.value = 0.018;
      lfo.connect(lfoG); lfoG.connect(bG.gain);
      lfo.start();
      track(() => { try { lfo.stop(); } catch {} });

      // —— [PAD] C → Am → F → G 缓慢和弦长音（每 8.5s 换一个） ——
      const padChords = [
        [65.41, 82.41, 98.00],    // C2/E2/G2
        [55.00, 65.41, 82.41],    // A1/C2/E2 (Am)
        [43.65, 55.00, 65.41],    // F1/A1/C2
        [49.00, 61.74, 73.42],    // G1/B1/D2
      ];
      (function padLoop(idx = 0) {
        if (!out) return;
        const chord = padChords[idx % padChords.length];
        const gain = ac.createGain();
        gain.gain.value = 0;
        gain.connect(out);
        const now = ac.currentTime;
        chord.forEach(freq => {
          const o1 = ac.createOscillator(); const o2 = ac.createOscillator();
          o1.type = 'sine'; o1.frequency.value = freq;
          o2.type = 'triangle'; o2.frequency.value = freq * 2; // 高八度叠一点亮度
          const oG = ac.createGain();
          oG.gain.value = 0;
          o1.connect(oG); o2.connect(oG); oG.connect(gain);
          // 每个和弦音独立的增益，音量 0.013 → 2s attack → hold 6.5s → 4s release
          const base = 0.014;
          oG.gain.setValueAtTime(0, now);
          oG.gain.linearRampToValueAtTime(base * 0.55, now + 3.4);
          oG.gain.linearRampToValueAtTime(base * 0.38, now + 5);
          oG.gain.exponentialRampToValueAtTime(0.0008, now + 8.6);
          track(() => { try { o1.stop(); } catch {} try { o2.stop(); } catch {} });
          o1.start(now); o2.start(now);
          o1.stop(now + 8.8); o2.stop(now + 8.8);
        });
        // 总 Pad 门控增益：避免换和弦时爆音
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 3.5);
        gain.gain.linearRampToValueAtTime(0.7, now + 5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 8.6);
        timers.push(setTimeout(() => padLoop(idx + 1), 8500));
      })();

      // —— [MELODY A] 主悠扬旋律（C 五声，每音带 3 度和声） ——
      const C_PENT = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
      const melodyStep = () => {
        if (!out) return;
        const idx = Math.floor(Math.random() * C_PENT.length);
        const f1 = C_PENT[idx];
        const fHarm = C_PENT[Math.min(C_PENT.length - 1, idx + 2)]; // 3/4 度和声
        const fHi = Math.random() < 0.3 ? f1 * 2 : null; // 偶尔高八度
        const now = ac.currentTime;
        const mkNote = (freq, vol, attack, decayTime, type) => {
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.type = type;
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(vol, now + attack);
          g.gain.linearRampToValueAtTime(vol * 0.6, now + attack + 1.6);
          g.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
          osc.connect(g); g.connect(out);
          osc.start(now); osc.stop(now + decayTime + 0.15);
          track(() => { try { osc.stop(); } catch {} });
        };
        mkNote(f1,    0.05,  1.0, 6.4, 'triangle'); // 主音：triangle 温暖
        mkNote(fHarm, 0.028, 1.1, 6.2, 'sine');     // 和声：sine 轻，不抢主旋律
        if (fHi) mkNote(fHi, 0.014, 1.2, 6.0, 'sine');

        // —— [MELODY B] 回声对位（280ms 后，同一音阶但不同音） ——
        timers.push(setTimeout(() => {
          if (!out) return;
          const idxB = (idx + 3 + Math.floor(Math.random() * 3)) % C_PENT.length;
          const fb = C_PENT[idxB] * (Math.random() < 0.5 ? 1 : 2);
          const t2 = ac.currentTime;
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.type = 'sine';
          osc.frequency.value = fb;
          g.gain.setValueAtTime(0, t2);
          g.gain.linearRampToValueAtTime(0.026, t2 + 0.9);
          g.gain.linearRampToValueAtTime(0.018, t2 + 2.4);
          g.gain.exponentialRampToValueAtTime(0.001, t2 + 5.8);
          osc.connect(g); g.connect(out);
          osc.start(t2); osc.stop(t2 + 5.95);
          track(() => { try { osc.stop(); } catch {} });
        }, 280));

        timers.push(setTimeout(melodyStep, 1900 + Math.random() * 1600));
      };
      melodyStep();

      // —— [BELL] 高音风铃（800~1400Hz，随机稀疏，音量极轻） ——
      const bellStep = () => {
        if (!out) return;
        const BELLS = [880.00, 1046.50, 1174.66, 1318.51, 1567.98];
        const f = BELLS[Math.floor(Math.random() * BELLS.length)];
        const now = ac.currentTime;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.008, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0005, now + 2.6);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 2.7);
        track(() => { try { osc.stop(); } catch {} });
        timers.push(setTimeout(bellStep, 5500 + Math.random() * 6000));
      };
      timers.push(setTimeout(bellStep, 4000));

      return () => {
        timers.forEach(clearTimeout);
        liveNodes.forEach(fn => { try { fn && fn(); } catch {} });
      };
    },

    // ========== 02 · Soft Breeze — a 小调，柔和下行、略带忧伤 ==========
    function softBreeze(ac, out) {
      const timers = [];
      const liveNodes = [];
      const track = (fn) => liveNodes.push(fn);

      // —— [BASS] A2 + E3 底音 ——
      const bass = ac.createOscillator();
      const bass2 = ac.createOscillator();
      const bG = ac.createGain();
      bass.type = 'sine'; bass.frequency.value = 110.0;
      bass2.type = 'sine'; bass2.frequency.value = 164.81;
      bG.gain.value = 0;
      bass.connect(bG); bass2.connect(bG); bG.connect(out);
      const now0 = ac.currentTime;
      bG.gain.linearRampToValueAtTime(0.048, now0 + 5);
      bass.start(); bass2.start();
      track(() => { try { bass.stop(); } catch {} try { bass2.stop(); } catch {} });

      // —— [PAD] Am → F → C → G ——
      const padChords = [
        [55.00, 65.41, 82.41],    // A1/C2/E2
        [43.65, 55.00, 65.41],    // F1/A1/C2
        [65.41, 82.41, 98.00],    // C2/E2/G2
        [49.00, 61.74, 73.42],    // G1/B1/D2
      ];
      (function padLoop(idx = 0) {
        if (!out) return;
        const chord = padChords[idx % padChords.length];
        const gain = ac.createGain();
        gain.connect(out);
        const now = ac.currentTime;
        chord.forEach(freq => {
          const o1 = ac.createOscillator(); const o2 = ac.createOscillator();
          o1.type = 'sine'; o1.frequency.value = freq;
          o2.type = 'sine'; o2.frequency.value = freq * 2;
          const oG = ac.createGain();
          oG.gain.value = 0;
          o1.connect(oG); o2.connect(oG); oG.connect(gain);
          const base = 0.013;
          oG.gain.setValueAtTime(0, now);
          oG.gain.linearRampToValueAtTime(base * 0.5, now + 3.8);
          oG.gain.linearRampToValueAtTime(base * 0.35, now + 5.4);
          oG.gain.exponentialRampToValueAtTime(0.0008, now + 9.2);
          o1.start(now); o2.start(now);
          o1.stop(now + 9.4); o2.stop(now + 9.4);
          track(() => { try { o1.stop(); } catch {} try { o2.stop(); } catch {} });
        });
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 4);
        gain.gain.linearRampToValueAtTime(0.72, now + 5.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 9.2);
        timers.push(setTimeout(() => padLoop(idx + 1), 8900));
      })();

      // —— [MELODY A] a 自然小调（主音 + 3 度和声） ——
      const AM = [220.00, 246.94, 261.63, 293.66, 329.63, 392.00, 440.00, 493.88];
      const melodyStep = () => {
        if (!out) return;
        // 偏好下行（小调感）：从高往低选择
        const idx = Math.floor(Math.random() * AM.length);
        const idxH = Math.max(0, idx - 2 + Math.floor(Math.random() * 2));
        const f1 = AM[idx] * (Math.random() < 0.45 ? 2 : 1);
        const fHarm = AM[idxH] * (f1 >= 400 ? 1 : 2);
        const now = ac.currentTime;
        const mkNote = (freq, vol, atk, dec, typ) => {
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = typ; osc.frequency.value = freq;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(vol, now + atk);
          g.gain.linearRampToValueAtTime(vol * 0.55, now + atk + 2);
          g.gain.exponentialRampToValueAtTime(0.001, now + dec);
          osc.connect(g); g.connect(out);
          osc.start(now); osc.stop(now + dec + 0.15);
          track(() => { try { osc.stop(); } catch {} });
        };
        mkNote(f1,    0.052, 1.1, 6.6, 'sine');
        mkNote(fHarm, 0.026, 1.25, 6.4, 'sine');

        // —— [MELODY B] 回声（300ms 后，稍高或稍低） ——
        timers.push(setTimeout(() => {
          if (!out) return;
          const idxB = (idx + 1) % AM.length;
          const fb = AM[idxB] * (Math.random() < 0.5 ? 1 : 2);
          const t2 = ac.currentTime;
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = 'sine'; osc.frequency.value = fb;
          g.gain.setValueAtTime(0, t2);
          g.gain.linearRampToValueAtTime(0.024, t2 + 1.0);
          g.gain.linearRampToValueAtTime(0.016, t2 + 2.8);
          g.gain.exponentialRampToValueAtTime(0.001, t2 + 6.0);
          osc.connect(g); g.connect(out);
          osc.start(t2); osc.stop(t2 + 6.15);
          track(() => { try { osc.stop(); } catch {} });
        }, 300));

        timers.push(setTimeout(melodyStep, 2100 + Math.random() * 1500));
      };
      melodyStep();

      return () => {
        timers.forEach(clearTimeout);
        liveNodes.forEach(fn => { try { fn && fn(); } catch {} });
      };
    },

    // ========== 03 · Warm Paper — F 大调，温暖纸质，和音叠得更饱满 ==========
    function warmPaper(ac, out) {
      const timers = [];
      const liveNodes = [];
      const track = (fn) => liveNodes.push(fn);

      // —— [BASS] F2 + C3（属音叠底，温暖） ——
      const bass = ac.createOscillator();
      const bass2 = ac.createOscillator();
      const bG = ac.createGain();
      bass.type = 'sine'; bass.frequency.value = 87.31;
      bass2.type = 'sine'; bass2.frequency.value = 130.81;
      bG.gain.value = 0;
      bass.connect(bG); bass2.connect(bG); bG.connect(out);
      const now0 = ac.currentTime;
      bG.gain.linearRampToValueAtTime(0.046, now0 + 4.6);
      bass.start(); bass2.start();
      track(() => { try { bass.stop(); } catch {} try { bass2.stop(); } catch {} });

      // —— [PAD] F → Dm → Bb → C ——
      const padChords = [
        [43.65, 55.00, 65.41],    // F1/A1/C2
        [36.71, 44.00, 55.00],    // D1/F#1/A1 (Dm — 降低一度 36.71=D2, 修正 D1=18.35)
        [58.27, 73.42, 87.31],    // Bb1/D2/F2 (58.27≈Bb1)
        [65.41, 82.41, 98.00],    // C2/E2/G2
      ];
      // 修正 Dm 为准确数值
      padChords[1] = [73.42, 87.31, 110.00]; // D2/F2/A2
      padChords[2] = [58.27, 73.42, 87.31];

      (function padLoop(idx = 0) {
        if (!out) return;
        const chord = padChords[idx % padChords.length];
        const gain = ac.createGain();
        gain.connect(out);
        const now = ac.currentTime;
        chord.forEach(freq => {
          const o1 = ac.createOscillator(); const o2 = ac.createOscillator();
          o1.type = 'triangle'; o1.frequency.value = freq; // triangle 温暖感
          o2.type = 'sine';     o2.frequency.value = freq * 2;
          const oG = ac.createGain();
          oG.gain.value = 0;
          o1.connect(oG); o2.connect(oG); oG.connect(gain);
          const base = 0.015;
          oG.gain.setValueAtTime(0, now);
          oG.gain.linearRampToValueAtTime(base * 0.52, now + 3.6);
          oG.gain.linearRampToValueAtTime(base * 0.4, now + 5.2);
          oG.gain.exponentialRampToValueAtTime(0.0008, now + 8.8);
          o1.start(now); o2.start(now);
          o1.stop(now + 9.0); o2.stop(now + 9.0);
          track(() => { try { o1.stop(); } catch {} try { o2.stop(); } catch {} });
        });
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 3.7);
        gain.gain.linearRampToValueAtTime(0.75, now + 5.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 8.8);
        timers.push(setTimeout(() => padLoop(idx + 1), 8600));
      })();

      // —— [MELODY A] F 大调（主音 + 3 度 或 5 度叠音） ——
      const FM = [174.61, 196.00, 220.00, 233.08, 261.63, 293.66, 329.63, 349.23];
      const melodyStep = () => {
        if (!out) return;
        const idx = Math.floor(Math.random() * FM.length);
        const idx5 = (idx + 4) % FM.length; // 5 度
        const idx3 = (idx + 2) % FM.length;  // 3 度
        const f1 = FM[idx]  * (Math.random() < 0.5 ? 2 : 1);
        const fH = FM[idx3] * (f1 >= 400 ? 1 : 2);
        const f5 = FM[idx5] * (f1 >= 400 ? 1 : 2);
        const now = ac.currentTime;
        const mkNote = (freq, vol, atk, dec, typ) => {
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = typ; osc.frequency.value = freq;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(vol, now + atk);
          g.gain.linearRampToValueAtTime(vol * 0.58, now + atk + 1.8);
          g.gain.exponentialRampToValueAtTime(0.001, now + dec);
          osc.connect(g); g.connect(out);
          osc.start(now); osc.stop(now + dec + 0.15);
          track(() => { try { osc.stop(); } catch {} });
        };
        mkNote(f1, 0.048, 0.8, 6.0, 'triangle');
        mkNote(fH, 0.028, 0.95, 5.8, 'sine');    // 3 度
        mkNote(f5, 0.018, 1.05, 5.6, 'sine');    // 5 度（很轻）

        // —— [MELODY B] 对位回声（260ms） ——
        timers.push(setTimeout(() => {
          if (!out) return;
          const idxB = (idx + 3) % FM.length;
          const fb = FM[idxB] * (Math.random() < 0.5 ? 1 : 2);
          const t2 = ac.currentTime;
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = 'sine'; osc.frequency.value = fb;
          g.gain.setValueAtTime(0, t2);
          g.gain.linearRampToValueAtTime(0.025, t2 + 0.9);
          g.gain.linearRampToValueAtTime(0.017, t2 + 2.4);
          g.gain.exponentialRampToValueAtTime(0.001, t2 + 5.6);
          osc.connect(g); g.connect(out);
          osc.start(t2); osc.stop(t2 + 5.75);
          track(() => { try { osc.stop(); } catch {} });
        }, 260));

        timers.push(setTimeout(melodyStep, 1950 + Math.random() * 1550));
      };
      melodyStep();

      return () => {
        timers.forEach(clearTimeout);
        liveNodes.forEach(fn => { try { fn && fn(); } catch {} });
      };
    },

    // ========== 04 · Moon Light — G 大调，夜间安静、最悠扬，长 decay，带风铃 ==========
    function moonLight(ac, out) {
      const timers = [];
      const liveNodes = [];
      const track = (fn) => liveNodes.push(fn);

      // —— [BASS] G2 + D3，LFO 呼吸（更慢） ——
      const bass = ac.createOscillator();
      const bass2 = ac.createOscillator();
      const bG = ac.createGain();
      bass.type = 'sine';  bass.frequency.value = 98.0;
      bass2.type = 'sine'; bass2.frequency.value = 146.83;
      bG.gain.value = 0;
      bass.connect(bG); bass2.connect(bG); bG.connect(out);
      const now0 = ac.currentTime;
      bG.gain.linearRampToValueAtTime(0.045, now0 + 5.6);
      bass.start(); bass2.start();
      track(() => { try { bass.stop(); } catch {} try { bass2.stop(); } catch {} });
      const lfo = ac.createOscillator();
      const lfoG = ac.createGain();
      lfo.frequency.value = 0.032;
      lfoG.gain.value = 0.014;
      lfo.connect(lfoG); lfoG.connect(bG.gain);
      lfo.start();
      track(() => { try { lfo.stop(); } catch {} });

      // —— [PAD] G → Em → C → D（更慢，9.5s 换一次） ——
      const padChords = [
        [49.00, 61.74, 73.42],    // G1/B1/D2
        [41.20, 49.00, 61.74],    // E1/G1/B1 (Em)
        [65.41, 82.41, 98.00],    // C2/E2/G2
        [36.71, 46.25, 55.00],    // D1/F#1/A1
      ];
      (function padLoop(idx = 0) {
        if (!out) return;
        const chord = padChords[idx % padChords.length];
        const gain = ac.createGain();
        gain.connect(out);
        const now = ac.currentTime;
        chord.forEach(freq => {
          const o1 = ac.createOscillator(); const o2 = ac.createOscillator();
          o1.type = 'sine'; o1.frequency.value = freq;
          o2.type = 'sine'; o2.frequency.value = freq * 2;
          const oG = ac.createGain();
          oG.gain.value = 0;
          o1.connect(oG); o2.connect(oG); oG.connect(gain);
          const base = 0.012;
          oG.gain.setValueAtTime(0, now);
          oG.gain.linearRampToValueAtTime(base * 0.48, now + 4.2);
          oG.gain.linearRampToValueAtTime(base * 0.36, now + 6.0);
          oG.gain.exponentialRampToValueAtTime(0.0006, now + 9.8);
          o1.start(now); o2.start(now);
          o1.stop(now + 10.0); o2.stop(now + 10.0);
          track(() => { try { o1.stop(); } catch {} try { o2.stop(); } catch {} });
        });
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 4.3);
        gain.gain.linearRampToValueAtTime(0.7, now + 6.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 9.8);
        timers.push(setTimeout(() => padLoop(idx + 1), 9400));
      })();

      // —— [MELODY A] G 大调（长 attack，长 decay，最"飘"的感觉） ——
      const GM = [196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 392.00, 440.00];
      const melodyStep = () => {
        if (!out) return;
        const idx = Math.floor(Math.random() * GM.length);
        const idx3 = (idx + 2) % GM.length;
        const f1 = GM[idx] * (Math.random() < 0.5 ? 1 : 2);
        const fHarm = GM[idx3] * (f1 >= 400 ? 1 : 2);
        const now = ac.currentTime;
        const mkNote = (freq, vol, atk, dec, typ) => {
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = typ; osc.frequency.value = freq;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(vol, now + atk);
          g.gain.linearRampToValueAtTime(vol * 0.55, now + atk + 2.2);
          g.gain.exponentialRampToValueAtTime(0.001, now + dec);
          osc.connect(g); g.connect(out);
          osc.start(now); osc.stop(now + dec + 0.2);
          track(() => { try { osc.stop(); } catch {} });
        };
        mkNote(f1,    0.05,  1.5, 7.2, 'sine');
        mkNote(fHarm, 0.027, 1.7, 7.0, 'sine');

        // —— [MELODY B] 回声（320ms，稍高八度） ——
        timers.push(setTimeout(() => {
          if (!out) return;
          const idxB = (idx + 4) % GM.length;
          const fb = GM[idxB] * (Math.random() < 0.7 ? 2 : 1);
          const t2 = ac.currentTime;
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = 'sine'; osc.frequency.value = fb;
          g.gain.setValueAtTime(0, t2);
          g.gain.linearRampToValueAtTime(0.022, t2 + 1.3);
          g.gain.linearRampToValueAtTime(0.015, t2 + 3.0);
          g.gain.exponentialRampToValueAtTime(0.001, t2 + 6.6);
          osc.connect(g); g.connect(out);
          osc.start(t2); osc.stop(t2 + 6.8);
          track(() => { try { osc.stop(); } catch {} });
        }, 320));

        timers.push(setTimeout(melodyStep, 2400 + Math.random() * 1800));
      };
      melodyStep();

      // —— [BELL] 夜间风铃（更稀疏、更轻） ——
      const bellStep = () => {
        if (!out) return;
        const BELLS = [783.99, 987.77, 1174.66, 1318.51, 1567.98, 1760.00];
        const f = BELLS[Math.floor(Math.random() * BELLS.length)];
        const now = ac.currentTime;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.007, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0005, now + 3.0);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 3.1);
        track(() => { try { osc.stop(); } catch {} });
        timers.push(setTimeout(bellStep, 7000 + Math.random() * 7000));
      };
      timers.push(setTimeout(bellStep, 5000));

      return () => {
        timers.forEach(clearTimeout);
        liveNodes.forEach(fn => { try { fn && fn(); } catch {} });
      };
    },

    // ========== 05 · Quiet Book — d 小调，最安静，层次精简，音量小 ==========
    function quietBook(ac, out) {
      const timers = [];
      const liveNodes = [];
      const track = (fn) => liveNodes.push(fn);

      // —— [BASS] D3 + A3 ——
      const bass = ac.createOscillator();
      const bass2 = ac.createOscillator();
      const bG = ac.createGain();
      bass.type = 'sine';  bass.frequency.value = 146.83;
      bass2.type = 'sine'; bass2.frequency.value = 220.00;
      bG.gain.value = 0;
      bass.connect(bG); bass2.connect(bG); bG.connect(out);
      const now0 = ac.currentTime;
      bG.gain.linearRampToValueAtTime(0.042, now0 + 5);
      bass.start(); bass2.start();
      track(() => { try { bass.stop(); } catch {} try { bass2.stop(); } catch {} });

      // —— [PAD] Dm → Bb → F → A ——
      const padChords = [
        [73.42, 87.31, 110.00],   // D2/F2/A2
        [58.27, 73.42, 87.31],    // Bb1/D2/F2
        [43.65, 55.00, 65.41],    // F1/A1/C2
        [55.00, 69.30, 82.41],    // A1/C#2/E2
      ];
      (function padLoop(idx = 0) {
        if (!out) return;
        const chord = padChords[idx % padChords.length];
        const gain = ac.createGain();
        gain.connect(out);
        const now = ac.currentTime;
        chord.forEach(freq => {
          const o1 = ac.createOscillator();
          o1.type = 'sine'; o1.frequency.value = freq;
          const oG = ac.createGain();
          oG.gain.value = 0;
          o1.connect(oG); oG.connect(gain);
          const base = 0.011; // 最安静：pad 更小
          oG.gain.setValueAtTime(0, now);
          oG.gain.linearRampToValueAtTime(base * 0.5, now + 4);
          oG.gain.linearRampToValueAtTime(base * 0.38, now + 5.8);
          oG.gain.exponentialRampToValueAtTime(0.0006, now + 9.6);
          o1.start(now);
          o1.stop(now + 9.8);
          track(() => { try { o1.stop(); } catch {} });
        });
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 4.1);
        gain.gain.linearRampToValueAtTime(0.7, now + 5.9);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 9.6);
        timers.push(setTimeout(() => padLoop(idx + 1), 9200));
      })();

      // —— [MELODY A] d 自然小调（更稀疏、音量稍小） ——
      const DMIN = [146.83, 164.81, 174.61, 196.00, 220.00, 233.08, 261.63, 293.66];
      const melodyStep = () => {
        if (!out) return;
        const idx = Math.floor(Math.random() * DMIN.length);
        const idx3 = (idx + 2) % DMIN.length;
        const f1 = DMIN[idx] * (Math.random() < 0.6 ? 2 : 1);
        const fHarm = DMIN[idx3] * (f1 >= 400 ? 1 : 2);
        const now = ac.currentTime;
        const mkNote = (freq, vol, atk, dec, typ) => {
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = typ; osc.frequency.value = freq;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(vol, now + atk);
          g.gain.linearRampToValueAtTime(vol * 0.55, now + atk + 2.2);
          g.gain.exponentialRampToValueAtTime(0.001, now + dec);
          osc.connect(g); g.connect(out);
          osc.start(now); osc.stop(now + dec + 0.15);
          track(() => { try { osc.stop(); } catch {} });
        };
        mkNote(f1,    0.042, 1.25, 6.8, 'triangle');
        mkNote(fHarm, 0.022, 1.4, 6.6, 'sine');

        // —— [MELODY B] 回声（300ms）更安静 ——
        timers.push(setTimeout(() => {
          if (!out) return;
          const idxB = (idx + 3) % DMIN.length;
          const fb = DMIN[idxB] * (Math.random() < 0.5 ? 1 : 2);
          const t2 = ac.currentTime;
          const osc = ac.createOscillator(); const g = ac.createGain();
          osc.type = 'sine'; osc.frequency.value = fb;
          g.gain.setValueAtTime(0, t2);
          g.gain.linearRampToValueAtTime(0.02, t2 + 1.1);
          g.gain.linearRampToValueAtTime(0.013, t2 + 2.8);
          g.gain.exponentialRampToValueAtTime(0.001, t2 + 6.2);
          osc.connect(g); g.connect(out);
          osc.start(t2); osc.stop(t2 + 6.35);
          track(() => { try { osc.stop(); } catch {} });
        }, 300));

        timers.push(setTimeout(melodyStep, 2500 + Math.random() * 2000));
      };
      melodyStep();

      return () => {
        timers.forEach(clearTimeout);
        liveNodes.forEach(fn => { try { fn && fn(); } catch {} });
      };
    },
  ];
  const TRACK_NAMES = ['Gentle Sun', 'Soft Breeze', 'Warm Paper', 'Moon Light', 'Quiet Book'];

  function loadPref() {
    enabled = localStorage.getItem(MUSIC_KEY) === 'true';
    const v = parseFloat(localStorage.getItem(VOL_KEY));
    volume = isNaN(v) ? 0.3 : v;
    const s = parseInt(localStorage.getItem(SONG_KEY) || '0', 10);
    songIdx = Number.isFinite(s) ? Math.max(0, Math.min(TRACKS.length - 1, s)) : 0;
    updateToggleUI();
    updateVolumeUI();
    updateSongUI();
  }

  function savePref() {
    localStorage.setItem(MUSIC_KEY, String(enabled));
    localStorage.setItem(VOL_KEY, String(volume));
    localStorage.setItem(SONG_KEY, String(songIdx));
  }

  function getContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function ensureMasterGain() {
    const ac = getContext();
    if (masterGain) return;
    masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, ac.currentTime);
    masterGain.connect(ac.destination);
  }

  function fadeInMaster() {
    if (!masterGain || !ctx) return;
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    const base = masterGain.gain.value || 0;
    masterGain.gain.setValueAtTime(base, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(volume * 0.5, ctx.currentTime + 1.4);
  }

  function fadeOutMaster(duration = 0.7) {
    if (!masterGain || !ctx) return;
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    const base = masterGain.gain.value || 0;
    masterGain.gain.setValueAtTime(base, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
  }

  function playCurrentSong() {
    const ac = getContext();
    ensureMasterGain();
    // 先让 masterGain 回到一个低基础值（避免切歌瞬间音量断档）
    if (!ac.currentTime) { /* noop */ }
    songCleanup = TRACKS[songIdx](ac, masterGain);
  }

  function cleanupSong(fn) {
    try { fn && fn(); } catch { /* noop */ }
    songCleanup = null;
  }

  function start() {
    if (masterGain) return;
    // 关开关时绝不偷偷启动
    if (!enabled) return;
    // 音量 0 时也不启动（用户不想听）
    if (volume <= 0) return;
    ensureMasterGain();
    fadeInMaster();
    playCurrentSong();
  }

  function stop() {
    const ac = ctx;
    const cleanupFn = songCleanup;
    if (fadeTimer) clearTimeout(fadeTimer);

    // 立即清理旧曲的所有 loop / setTimeout / 振荡器（尤其 rain 的 6s loop buffer，必须立刻 stop）
    // 这是停止发声的核心一步：释放每首 TRACK 返回的 cleanup 里的所有 BufferSource / Oscillator
    cleanupSong(cleanupFn);

    // 同时把 masterGain 音量瞬间拉到 0（30ms 极短淡防爆音，但不等待线性渐变）
    if (masterGain && ac) {
      masterGain.gain.cancelScheduledValues(ac.currentTime);
      const base = masterGain.gain.value || 0;
      masterGain.gain.setValueAtTime(base, ac.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.03);
    }
    fadeTimer = setTimeout(() => {
      if (masterGain) { try { masterGain.disconnect(); } catch { /* noop */ } }
      masterGain = null;
    }, 80);
  }

  function nextSong() {
    songIdx = (songIdx + 1) % TRACKS.length;
    savePref();
    updateSongUI();
    // 如果当前音乐是关闭的：只换编号，不自动开启（不存在"一直存在无法关闭"的背景音乐）
    if (!enabled) return;

    // 切歌时：先立即停旧曲（不留残留的 loop / 持续音），再建新曲淡入
    const prevCleanup = songCleanup;
    if (fadeTimer) clearTimeout(fadeTimer);

    // 极快淡到 0（100ms）— 防止"新曲叠旧曲"
    fadeOutMaster(0.1);
    fadeTimer = setTimeout(() => {
      // 旧曲所有定时 / 振荡器 / rain 6s loop — 立即释放
      cleanupSong(prevCleanup);
      // 新曲：从零开始淡入，避免声音叠加
      playCurrentSong();
      fadeInMaster();
    }, 120);
  }

  function toggle() {
    enabled = !enabled;
    savePref();
    updateToggleUI();
    if (enabled) start();
    else stop();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    savePref();
    if (masterGain && ctx) {
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      // 音量 = 0：直接瞬间静音（不要等 setTargetAtTime 的指数收敛，避免残留尾巴）
      if (volume <= 0) {
        const base = masterGain.gain.value || 0;
        masterGain.gain.setValueAtTime(base, ctx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.02);
      } else {
        masterGain.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 0.12);
      }
    }
    updateVolumeUI();
  }

  function updateToggleUI() {
    const btn = document.getElementById('music-toggle');
    if (!btn) return;
    btn.dataset.enabled = enabled ? 'true' : 'false';
    btn.setAttribute('aria-pressed', String(enabled));
    btn.title = I18n.t(enabled ? 'musicOn' : 'musicOff');
  }

  function updateVolumeUI() {
    const slider = document.getElementById('music-volume');
    if (slider) slider.value = Math.round(volume * 100);
  }

  function updateSongUI() {
    const label = document.querySelector('#music-swap .song-idx');
    if (label) label.textContent = `0${songIdx + 1}`;
    const btn = document.getElementById('music-swap');
    if (btn) btn.title = `Track ${songIdx + 1}/${TRACKS.length} · ${TRACK_NAMES[songIdx]}`;
  }

  function bindControls() {
    const btn = document.getElementById('music-toggle');
    if (btn) btn.addEventListener('click', toggle);
    const slider = document.getElementById('music-volume');
    if (slider) slider.addEventListener('input', (e) => setVolume(e.target.value / 100));
    const swap = document.getElementById('music-swap');
    if (swap) swap.addEventListener('click', () => { nextSong(); AudioFX.play && AudioFX.play('paper'); });
  }

  function init() {
    loadPref();
    bindControls();
    I18n.onChange(() => updateToggleUI());
    const tryStart = () => {
      if (enabled) start();
      document.removeEventListener('pointerdown', tryStart);
      document.removeEventListener('keydown', tryStart);
    };
    document.addEventListener('pointerdown', tryStart, { once: true });
    document.addEventListener('keydown', tryStart, { once: true });
  }

  return { init, toggle, setVolume, nextSong };
})();

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

  /** 差异化场景音效（全纸张类，全柔和） */
  const sounds = {
    add:      () => paperPlace(0.055),          // 添加新便签：放桌面+轻划
    paper:    () => paperTouch(0.045),          // 点击便签：指触纸面
    click:    () => paperTouch(0.04),           // 通用按键点击：轻触
    discard:  () => thud(0.065),                // 丢入垃圾桶：落地+沙沙
    complete: () => paperFold(0.055),           // 勾选完成 / 拖入收纳：对折
    drop:     () => paperDrop(0.05),            // 跨区放下（todo/done 互拖）：闷放
    delete:   () => paperTear(0.055),           // 删除：撕纸
    lang:     () => paperTurn(0.048),           // 切换语言：翻页
    collapse: () => {                           // 折叠面板：小翻小折
      paperTurn(0.038);
      setTimeout(() => paperTouch(0.03), 140);
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
    // 01 Ethereal — 五声琶音 + 双音 pad + LFO 呼吸
    function ethereal(ac, out) {
      const timers = [];
      const pads = [];
      // pad
      [65.41, 98.00].forEach((f) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.value = 0.18;
        osc.connect(g); g.connect(out);
        osc.start();
        pads.push({ osc, g });
      });
      const lfo = ac.createOscillator();
      const lfoG = ac.createGain();
      lfo.frequency.value = 0.07;
      lfoG.gain.value = 0.055;
      lfo.connect(lfoG);
      pads.forEach(({ g }) => lfoG.connect(g.gain));
      lfo.start();
      // arp
      const step = () => {
        if (!out) return;
        const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const now = ac.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.11, now + 0.9);
        g.gain.linearRampToValueAtTime(0.06, now + 1.9);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3.9);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 4.0);
        timers.push(setTimeout(step, 2300 + Math.random() * 1800));
      };
      step();
      return () => {
        timers.forEach(clearTimeout);
        pads.forEach(({ osc }) => { try { osc.stop(); } catch { /* noop */ } });
        try { lfo.stop(); } catch { /* noop */ }
      };
    },

    // 02 Minimal Piano — C 大调慢速单音，柔和触键（短 attack + 长释放）
    function piano(ac, out) {
      const timers = [];
      // 一个很低的底音 C2 给支撑
      const bass = ac.createOscillator();
      const bg = ac.createGain();
      bass.type = 'triangle';
      bass.frequency.value = 65.41;
      bg.gain.value = 0.05;
      bass.connect(bg); bg.connect(out);
      bass.start();

      const step = () => {
        if (!out) return;
        // 选 1–2 个 C 大调音符（八度随机）
        const pickCount = Math.random() < 0.35 ? 2 : 1;
        for (let i = 0; i < pickCount; i++) {
          const base = C_MAJOR[Math.floor(Math.random() * C_MAJOR.length)];
          const octave = Math.random() < 0.55 ? 1 : 2;
          const f = base * octave;
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.type = 'triangle';
          osc.frequency.value = f;
          const now = ac.currentTime;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.07, now + 0.025);
          g.gain.exponentialRampToValueAtTime(0.001, now + 4.8);
          osc.connect(g); g.connect(out);
          osc.start(now); osc.stop(now + 5.0);
        }
        timers.push(setTimeout(step, 2600 + Math.random() * 2200));
      };
      step();
      return () => {
        timers.forEach(clearTimeout);
        try { bass.stop(); } catch { /* noop */ }
      };
    },

    // 03 Gentle Rain — 柔和粉噪雨点 + 偶发高音风铃
    function rain(ac, out) {
      const timers = [];
      // 低通低音量粉红噪音
      const bufFrames = ac.sampleRate * 6;
      const buffer = ac.createBuffer(1, bufFrames, ac.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufFrames; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      }
      const rain = ac.createBufferSource();
      rain.buffer = buffer; rain.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      const rainGain = ac.createGain();
      rainGain.gain.value = 0.22;
      rain.connect(lp); lp.connect(rainGain); rainGain.connect(out);
      rain.start();

      // 风铃滴点
      const step = () => {
        if (!out) return;
        const freqs = [1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02];
        const f = freqs[Math.floor(Math.random() * freqs.length)];
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const now = ac.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.05, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 2.9);
        timers.push(setTimeout(step, 1500 + Math.random() * 4500));
      };
      step();
      return () => {
        timers.forEach(clearTimeout);
        try { rain.stop(); } catch { /* noop */ }
      };
    },

    // 04 Soft Chime — 和弦 pad 慢速切换 + 偶发高音 chime
    function chime(ac, out) {
      const timers = [];
      let ci = 0;
      const chord = (freqs) => freqs.map((f) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f / 2;
        g.gain.value = 0;
        osc.connect(g); g.connect(out);
        osc.start();
        return { osc, g };
      });
      let current = chord(CHORDS[ci]);
      current.forEach(({ g }) => g.gain.value = 0.05);

      const chordTimer = setInterval(() => {
        ci = (ci + 1) % CHORDS.length;
        const next = chord(CHORDS[ci]);
        next.forEach(({ g }) => {
          g.gain.setValueAtTime(0, ac.currentTime);
          g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 2.5);
        });
        current.forEach(({ osc, g }) => {
          g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 2.8);
          setTimeout(() => { try { osc.stop(); } catch { /* noop */ } }, 2900);
        });
        current = next;
      }, 8000);
      timers.push(chordTimer);

      // 高音 chime 滴点
      const step = () => {
        if (!out) return;
        const ff = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] * 2;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = ff;
        const now = ac.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.06, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 3.3);
        timers.push(setTimeout(step, 3200 + Math.random() * 2600));
      };
      step();
      return () => {
        timers.forEach((t) => (typeof t === 'number' ? clearTimeout(t) : clearInterval(t)));
        current.forEach(({ osc }) => { try { osc.stop(); } catch { /* noop */ } });
      };
    },

    // 05 Whisper — 高八度五声旋律 + 低八度 pad，最空灵
    function whisper(ac, out) {
      const timers = [];
      // 更轻的 pad：C3 + E3 + G3（sine, 低量）
      const chordFreqs = [130.81, 164.81, 196.00];
      const pads = chordFreqs.map((f) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.value = 0.08;
        osc.connect(g); g.connect(out);
        osc.start();
        return { osc, g };
      });
      const lfo = ac.createOscillator();
      const lfoG = ac.createGain();
      lfo.frequency.value = 0.05;
      lfoG.gain.value = 0.035;
      lfo.connect(lfoG);
      pads.forEach(({ g }) => lfoG.connect(g.gain));
      lfo.start();

      // 高八度稀疏旋律
      const step = () => {
        if (!out) return;
        const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] * 2;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const now = ac.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.07, now + 1.2);
        g.gain.linearRampToValueAtTime(0.05, now + 2.6);
        g.gain.exponentialRampToValueAtTime(0.001, now + 5.4);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 5.5);
        timers.push(setTimeout(step, 3400 + Math.random() * 2600));
      };
      step();
      return () => {
        timers.forEach(clearTimeout);
        pads.forEach(({ osc }) => { try { osc.stop(); } catch { /* noop */ } });
        try { lfo.stop(); } catch { /* noop */ }
      };
    },
  ];
  const TRACK_NAMES = ['Ethereal', 'Piano', 'Rain', 'Chime', 'Whisper'];

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
    ensureMasterGain();
    fadeInMaster();
    playCurrentSong();
  }

  function stop() {
    const ac = ctx;
    const cleanupFn = songCleanup;
    fadeOutMaster(0.8);
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      cleanupSong(cleanupFn);
      if (masterGain) { try { masterGain.disconnect(); } catch { /* noop */ } }
      masterGain = null;
    }, 850);
  }

  function nextSong() {
    songIdx = (songIdx + 1) % TRACKS.length;
    savePref();
    updateSongUI();
    if (!masterGain) return;
    // 交叉淡入淡出：停旧 → 建新
    const prevCleanup = songCleanup;
    fadeOutMaster(0.6);
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      cleanupSong(prevCleanup);
      // 新建 master 内部节点（保持 masterGain，替换 song）
      playCurrentSong();
      fadeInMaster();
    }, 650);
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
      masterGain.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 0.12);
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

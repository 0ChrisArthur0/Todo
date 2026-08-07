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

  /** 合成短促干净音效 */
  function tone(freq, duration, type = 'sine', volume = 0.08, decay = 0.015) {
    if (!enabled) return;
    try {
      const ac = getContext();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(volume, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration + decay);
    } catch { /* 静默失败 */ }
  }

  /** 差异化场景音效 */
  const sounds = {
    add:     () => { tone(660, 0.08); setTimeout(() => tone(880, 0.06), 50); },
    complete:() => { tone(523, 0.06); setTimeout(() => tone(784, 0.1), 60); },
    delete:  () => { tone(400, 0.05, 'triangle', 0.06); setTimeout(() => tone(220, 0.12, 'triangle', 0.05), 40); },
    discard: () => { tone(350, 0.04); setTimeout(() => tone(180, 0.15, 'sawtooth', 0.04), 30); },
    lang:    () => tone(600, 0.05),
    collapse:() => tone(480, 0.04),
    drop:    () => tone(440, 0.05, 'sine', 0.05),
    click:   () => tone(800, 0.03, 'sine', 0.04),
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

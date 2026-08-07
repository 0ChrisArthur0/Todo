/**
 * i18n.js — 中英法三语言切换
 * 翻译文本独立 JSON 收纳，语种写入 LocalStorage
 */

const I18n = (() => {
  const LANG_KEY = 'sketch_todo_lang';
  const SUPPORTED = ['zh', 'en', 'fr'];
  let currentLang = 'zh';
  let strings = {};
  let onChangeCallback = null;

  /** 内联回退（file:// 或无服务器时使用） */
  const FALLBACK = {
    zh: {"title":"清单","subtitle":"便利贴墙","placeholder":"写下新事项…","add":"添加","todo":"待办","done":"已完成","clear":"清空","todoZone":"待办区","doneZone":"收纳区","discardZone":"丢弃区","discardHint":"拖入丢弃","emptyTodo":"暂无待办，添一张便签吧","emptyDone":"暂无已完成便签","statTotal":"总任务","statDone":"已完成","statRate":"完成率","modalEdit":"编辑事项","modalSave":"保存","modalDelete":"删除","modalCancel":"取消","confirmClearTitle":"清空已完成","confirmClearMsg":"确定要清空所有已完成事项吗？此操作不可撤销。","confirmYes":"确认","confirmNo":"取消","notePlaceholder":"添加备注…","markDone":"标记完成","markUndone":"标记未完成","soundOn":"音效开","soundOff":"音效关","langLabel":"语言"},
    en: {"title":"List","subtitle":"Sticky Wall","placeholder":"Write a new task…","add":"Add","todo":"To-do","done":"Done","clear":"Clear","todoZone":"To-do","doneZone":"Done","discardZone":"Discard","discardHint":"Drop to discard","emptyTodo":"No tasks yet — add a note","emptyDone":"Nothing completed yet","statTotal":"Total","statDone":"Done","statRate":"Rate","modalEdit":"Edit task","modalSave":"Save","modalDelete":"Delete","modalCancel":"Cancel","confirmClearTitle":"Clear completed","confirmClearMsg":"Clear all completed tasks? This cannot be undone.","confirmYes":"Confirm","confirmNo":"Cancel","notePlaceholder":"Add a note…","markDone":"Mark done","markUndone":"Mark undone","soundOn":"Sound on","soundOff":"Sound off","langLabel":"Language"},
    fr: {"title":"Liste","subtitle":"Mur de notes","placeholder":"Écrire une tâche…","add":"Ajouter","todo":"À faire","done":"Terminé","clear":"Vider","todoZone":"À faire","doneZone":"Terminé","discardZone":"Poubelle","discardHint":"Glisser pour jeter","emptyTodo":"Rien à faire — ajoutez une note","emptyDone":"Aucune tâche terminée","statTotal":"Total","statDone":"Fait","statRate":"Taux","modalEdit":"Modifier","modalSave":"Enregistrer","modalDelete":"Supprimer","modalCancel":"Annuler","confirmClearTitle":"Vider le terminé","confirmClearMsg":"Supprimer toutes les tâches terminées ? Action irréversible.","confirmYes":"Confirmer","confirmNo":"Annuler","notePlaceholder":"Ajouter une note…","markDone":"Marquer fait","markUndone":"Remettre à faire","soundOn":"Son activé","soundOff":"Son coupé","langLabel":"Langue"},
  };

  function getStoredLang() {
    const stored = localStorage.getItem(LANG_KEY);
    return SUPPORTED.includes(stored) ? stored : 'zh';
  }

  function saveLang(lang) {
    localStorage.setItem(LANG_KEY, lang);
  }

  /** 加载指定语言 JSON */
  async function load(lang) {
    const target = SUPPORTED.includes(lang) ? lang : 'zh';
    try {
      const res = await fetch(`i18n/${target}.json`);
      if (!res.ok) throw new Error('fetch failed');
      strings = await res.json();
    } catch {
      strings = FALLBACK[target] || FALLBACK.zh;
    }
    currentLang = target;
    saveLang(target);
    document.documentElement.lang = target === 'zh' ? 'zh-CN' : target;
    document.body.dataset.lang = target;
    return strings;
  }

  /** 获取翻译文本 */
  function t(key) {
    return strings[key] ?? key;
  }

  /** 应用 data-i18n 到 DOM，带淡入淡出 */
  function applyToDOM() {
    const app = document.getElementById('app');
    if (!app) return;

    app.classList.add('lang-transition');
    app.classList.remove('lang-visible');

    requestAnimationFrame(() => {
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (strings[key] !== undefined) el.textContent = strings[key];
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.dataset.i18nPlaceholder;
        if (strings[key] !== undefined) el.placeholder = strings[key];
      });

      document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        const key = el.dataset.i18nAria;
        if (strings[key] !== undefined) el.setAttribute('aria-label', strings[key]);
      });

      document.title = `${strings.title || 'List'} · ${strings.subtitle || ''}`;

      requestAnimationFrame(() => {
        app.classList.add('lang-visible');
        setTimeout(() => app.classList.remove('lang-transition'), 400);
      });
    });
  }

  /** 切换语言 */
  async function switchLang(lang) {
    if (lang === currentLang) return currentLang;
    await load(lang);
    applyToDOM();
    if (onChangeCallback) onChangeCallback(currentLang);
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  function onChange(cb) {
    onChangeCallback = cb;
  }

  /** 初始化语言选择器 */
  function bindSelector() {
    const select = document.getElementById('lang-select');
    if (!select) return;

    select.value = currentLang;
    select.addEventListener('change', () => {
      switchLang(select.value);
    });
  }

  async function init() {
    const lang = getStoredLang();
    await load(lang);
    applyToDOM();
    bindSelector();
  }

  return { init, t, switchLang, getLang, onChange, applyToDOM };
})();

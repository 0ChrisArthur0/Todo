/**
 * storage.js — LocalStorage 持久化层
 * 任务数据 + 便签坐标 + 折叠状态 + 语种/音效偏好
 */

const Storage = (() => {
  const STORAGE_KEY = 'sketch_todo_app';

  function todayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const defaultGlobalPrefs = () => ({
    fontSizeScale: 1,    // 全局字号比例：0.85 ~ 1.2（步长 0.05）
  });

  const defaultDailyPrefs = () => ({
    collapsed: false,
    side: 'right',       // 吸附方向：left / right
    x: null,             // 自由定位 left (px，不设则用默认)
    y: null,             // 自由定位 top (px)
    color: 'beige',      // 新建便签默认色：beige / blue / pink
  });

  const defaultDailyTodo = () => ({
    date: todayKey(),
    items: [],           // [{ id, text, done, createdAt }]
    prefs: defaultDailyPrefs(),
  });

  const defaultData = () => ({
    todos: [],
    done: [],
    collapsed: { header: false, stats: false, sidePanel: false },
    globalPrefs: defaultGlobalPrefs(),
    dailyTodo: defaultDailyTodo(),
  });

  /** 为新任务生成随机墙内坐标 */
  function randomPosition(zone) {
    const padX = 20;
    const padY = zone === 'done' ? 120 : 80;
    const maxX = Math.max(200, window.innerWidth - 220);
    const maxY = Math.max(200, window.innerHeight - 280);
    return {
      x: padX + Math.random() * (maxX - padX),
      y: padY + Math.random() * (maxY - padY) * 0.6,
      rotation: (Math.random() - 0.5) * 4,
    };
  }

  /** 迁移旧数据：补全坐标字段 + 便签形态 */
  function migrateTask(task, zone) {
    if (task.x == null || task.y == null) {
      const pos = randomPosition(zone);
      task.x = pos.x;
      task.y = pos.y;
      task.rotation = task.rotation ?? pos.rotation;
    }
    if (!task.shape) {
      const shapes = ['flat', 'corner-curl', 'crumple'];
      task.shape = shapes[Math.floor(Math.random() * shapes.length)];
    }
    return task;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      const migratedDaily = migrateDaily(parsed.dailyTodo);
      // 兼容：把旧的 dailyTodo.prefs.fontSizeScale 搬家到 globalPrefs
      const oldFont = parsed.dailyTodo?.prefs?.fontSizeScale;
      let globalPrefs = defaultGlobalPrefs();
      if (parsed.globalPrefs && typeof parsed.globalPrefs === 'object') {
        globalPrefs = { ...globalPrefs, ...parsed.globalPrefs };
      } else if (typeof oldFont === 'number' && !isNaN(oldFont)) {
        globalPrefs.fontSizeScale = Math.max(0.85, Math.min(1.2, Math.round(oldFont / 0.05) * 0.05));
      }
      if (typeof globalPrefs.fontSizeScale !== 'number' || isNaN(globalPrefs.fontSizeScale)) {
        globalPrefs.fontSizeScale = 1;
      }
      globalPrefs.fontSizeScale = Math.max(0.85, Math.min(1.2,
        Math.round(globalPrefs.fontSizeScale / 0.05) * 0.05));

      const data = {
        todos: (Array.isArray(parsed.todos) ? parsed.todos : []).map((t) => migrateTask(t, 'todo')),
        done: (Array.isArray(parsed.done) ? parsed.done : []).map((t) => migrateTask(t, 'done')),
        collapsed: parsed.collapsed || { header: false, stats: false, sidePanel: false },
        globalPrefs,
        dailyTodo: migratedDaily,
      };
      if (parsed.collapsed?.todo !== undefined) {
        data.collapsed = { header: false, stats: false, sidePanel: false };
      }
      return data;
    } catch {
      return defaultData();
    }
  }

  /** 迁移旧 dailyTodo：补全 date/items/prefs 子字段；跨日保留 prefs 但清空 items */
  function migrateDaily(raw) {
    const def = defaultDailyTodo();
    if (!raw || typeof raw !== 'object') return def;
    const today = todayKey();
    const items = Array.isArray(raw.items)
      ? raw.items.filter((it) => it && typeof it.text === 'string').map((it) => ({
          id: it.id || `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: String(it.text),
          done: !!it.done,
          createdAt: it.createdAt || Date.now(),
          x: typeof it.x === 'number' ? it.x : null,
          y: typeof it.y === 'number' ? it.y : null,
          rotation: typeof it.rotation === 'number' ? it.rotation : (Math.random() - 0.5) * 4,
          color: ['beige', 'blue', 'pink'].includes(it.color) ? it.color : 'beige',
          note: typeof it.note === 'string' ? it.note : '',
        }))
      : [];
    const rawPrefs = raw.prefs && typeof raw.prefs === 'object' ? { ...raw.prefs } : {};
    // 兼容旧数据：去掉已经搬家到 globalPrefs 的 fontSizeScale
    delete rawPrefs.fontSizeScale;
    if (!['beige', 'blue', 'pink'].includes(rawPrefs.color)) delete rawPrefs.color;
    const prefs = { ...defaultDailyPrefs(), ...rawPrefs };
    // 跨日：items 清空（每天自动刷新），prefs 保留
    const storedDate = typeof raw.date === 'string' ? raw.date : today;
    return {
      date: today,
      items: storedDate === today ? items : [],
      prefs,
    };
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage 写入失败:', e);
    }
  }

  function generateId() {
    return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  return { load, save, generateId, randomPosition, todayKey, STORAGE_KEY };
})();

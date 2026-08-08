/**
 * storage.js — LocalStorage 持久化层
 * 任务数据 + 便签坐标 + 折叠状态 + 语种/音效偏好
 */

const Storage = (() => {
  const STORAGE_KEY = 'sketch_todo_app';

  const defaultData = () => ({
    todos: [],
    done: [],
    collapsed: { header: false, stats: false, sidePanel: false },
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
      const data = {
        todos: (Array.isArray(parsed.todos) ? parsed.todos : []).map((t) => migrateTask(t, 'todo')),
        done: (Array.isArray(parsed.done) ? parsed.done : []).map((t) => migrateTask(t, 'done')),
        collapsed: parsed.collapsed || { header: false, stats: false, sidePanel: false },
      };
      if (parsed.collapsed?.todo !== undefined) {
        data.collapsed = { header: false, stats: false, sidePanel: false };
      }
      return data;
    } catch {
      return defaultData();
    }
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

  return { load, save, generateId, randomPosition, STORAGE_KEY };
})();

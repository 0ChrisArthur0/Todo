/**
 * main.js — 应用主入口 v2
 * 便利贴墙 + 全功能保留 + i18n + 音效
 */

(() => {
  let data = Storage.load();
  let editingTaskId = null;
  let editingZone = null;

  const $ = (sel) => document.querySelector(sel);
  const wall = () => $('#sticky-wall');
  const addForm = $('#add-form');
  const newInput = $('#new-task-input');
  const actionModal = $('#action-modal');
  const confirmModal = $('#confirm-modal');
  const modalEditInput = $('#modal-edit-input');

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  /* ============================================================
     渲染
     ============================================================ */

  function createStickyNote(task, zone) {
    const note = document.createElement('div');
    note.className = `sticky-note${zone === 'done' ? ' done-note' : ''} note-jitter`;
    note.dataset.taskId = task.id;
    note.dataset.zone = zone;
    note.dataset.shape = task.shape || 'flat';
    note.dataset.hasNote = (task.note && task.note.length > 0) ? 'true' : 'false';
    note.dataset.pinned = task.pinned ? 'true' : 'false';

    // 破损不规则便签边缘 clip-path（每边5点 + 随机±2.5%）— 持久化防编辑丢失
    if (!task.cp) {
      const pts = [];
      const segs = 5;
      for (let i = 0; i <= segs; i++) {
        const x = (i / segs) * 100;
        const y = Math.random() * 2.2;
        pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
      }
      for (let i = 1; i <= segs; i++) {
        const x = 100 - Math.random() * 2.2;
        const y = (i / segs) * 100;
        pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
      }
      for (let i = segs - 1; i >= 0; i--) {
        const x = (i / segs) * 100;
        const y = 100 - Math.random() * 2.2;
        pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
      }
      for (let i = segs - 1; i >= 1; i--) {
        const x = Math.random() * 2.2;
        const y = (i / segs) * 100;
        pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
      }
      task.cp = `polygon(${pts.join(', ')})`;
    }
    note.style.setProperty('--note-cp', task.cp);

    // 抖动参数（慢速，克制不夸张）
    note.style.setProperty('--j-dur', `${(5.5 + Math.random() * 9.5).toFixed(2)}s`);
    note.style.setProperty('--j-delay', `${(Math.random() * 5.5).toFixed(2)}s`);
    note.style.setProperty('--j-a', `${(0.22 + Math.random() * 0.68).toFixed(2)}deg`);
    note.style.setProperty('--j-ease', Math.random() > 0.5
      ? 'cubic-bezier(0.45,0.05,0.55,0.95)'
      : 'cubic-bezier(0.5,0.1,0.5,0.9)');
    // 边框抖动延迟（避免全部便签边框同步抖动）
    note.style.setProperty('--nbw-delay', `${(Math.random() * 5.5).toFixed(2)}s`);
    note.style.setProperty('--nbw-delay2', `${(Math.random() * 5.5).toFixed(2)}s`);

    // 尺寸（持久化）：默认 168xmin120，可调 120~360 x 90~360
    const MIN_W = 120, MIN_H = 90, MAX_W = 360, MAX_H = 360;
    const BASE_W = 168;
    if (task.w) {
      note.style.width = `${clamp(task.w, MIN_W, MAX_W)}px`;
    }
    if (task.h) {
      note.style.minHeight = `${clamp(task.h, MIN_H, MAX_H)}px`;
    }
    note._minW = MIN_W; note._minH = MIN_H; note._maxW = MAX_W; note._maxH = MAX_H;
    note._baseW = BASE_W;
    // 根据实际宽度计算内容缩放（最小 1x，最大约 2.14x）
    const w0 = parseFloat(note.style.width) || BASE_W;
    const s = Math.max(1, Math.min(MAX_W / BASE_W, w0 / BASE_W));
    note.style.setProperty('--note-scale', s.toFixed(3));

    const isDone = zone === 'done';

    const wm = makeWatermark(task);

    note.innerHTML = `
      <span class="sticky-shape-mark"></span>
      <div class="sticky-note-inner">
        <button type="button" class="task-checkbox${isDone ? ' checked' : ''}"
          data-i18n-aria="${isDone ? 'markUndone' : 'markDone'}"
          aria-label="${I18n.t(isDone ? 'markUndone' : 'markDone')}">
          <svg viewBox="0 0 20 20">
            <path class="check-path" d="M4 10.5 L8 14.5 L16 6"/>
          </svg>
        </button>
        <div class="task-content">
          <p class="task-text font-body">${escapeHtml(task.text)}</p>
          <div class="task-note-wrap">
            <textarea class="task-note-input font-body"
              data-i18n-placeholder="notePlaceholder"
              placeholder="${escapeHtml(I18n.t('notePlaceholder'))}"
              maxlength="300"
              rows="2"
              wrap="soft">${escapeHtml(task.note || '')}</textarea>
          </div>
        </div>
      </div>
      <span class="note-watermark" style="--wm-align:${wm.align}">${escapeHtml(wm.text)}</span>
      <span class="note-pin${task.pinned ? ' pinned' : ''}" aria-hidden="true"></span>
      <span class="resize-handle" aria-hidden="true"></span>
    `;

    StickyWall.applyPosition(note, task);
    StickyWall.bindNote(note, task.id, zone);

    const checkbox = note.querySelector('.task-checkbox');
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleComplete(task.id, zone);
    });

    // 点击大头针 → 取消固定
    note.querySelector('.note-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(task.id, zone);
    });

    Interactions.bindLongPress(note, () => openEditModal(task.id, zone));

    note.addEventListener('click', (e) => {
      if (Interactions.wasLongPress()) return;
      if (e.target.closest('.task-checkbox, .task-note-input, .note-pin')) return;
      bringToFront(task.id, zone);
      AudioFX.play('paper');
    });

    const noteInput = note.querySelector('.task-note-input');
    noteInput.addEventListener('click', (e) => e.stopPropagation());
    noteInput.addEventListener('mousedown', (e) => e.stopPropagation());

    function syncHasNoteFlag(val) {
      const has = (val && val.length > 0) ? 'true' : 'false';
      if (note.dataset.hasNote !== has) note.dataset.hasNote = has;
    }

    function autosize(el) {
      // 空值：清除内联height，让CSS min-height生效（防止读scrollHeight得0）
      if (!el.value) {
        el.style.height = '';
        return;
      }
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
    // 等DOM插入布局后再读scrollHeight，避免刚innerHTML完scrollHeight=0
    requestAnimationFrame(() => autosize(noteInput));

    let saveTimer = null;
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        updateNote(task.id, zone, noteInput.value);
        syncHasNoteFlag(noteInput.value);
        saveTimer = null;
      }, 180);
    }

    noteInput.addEventListener('input', () => {
      autosize(noteInput);
      scheduleSave();
    });
    noteInput.addEventListener('blur', () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      updateNote(task.id, zone, noteInput.value);
      syncHasNoteFlag(noteInput.value);
    });

    return note;
  }

  /* —— 每日待做便签：和普通便利贴一样可拖/可缩放，3 色可选，带永久删除按钮 + 备注 —— */
  function createDailyNote(item) {
    const note = document.createElement('div');
    const color = ['beige', 'blue', 'pink'].includes(item.color) ? item.color : 'beige';
    note.className = `sticky-note daily-note${item.done ? ' daily-done' : ''} note-jitter`;
    note.dataset.taskId = item.id;
    note.dataset.zone = 'daily';
    note.dataset.color = color;
    note.dataset.hasNote = (item.note && item.note.length > 0) ? 'true' : 'false';
    note.dataset.pinned = item.pinned ? 'true' : 'false';

    // 首次生成随机坐标
    if (item.x == null || item.y == null) {
      const pos = Storage.randomPosition('todo');
      item.x = pos.x;
      item.y = pos.y;
      item.rotation = pos.rotation;
    }

    // 抖动参数
    note.style.setProperty('--j-dur', `${(5.5 + Math.random() * 9.5).toFixed(2)}s`);
    note.style.setProperty('--j-delay', `${(Math.random() * 5.5).toFixed(2)}s`);
    note.style.setProperty('--j-a', `${(0.22 + Math.random() * 0.68).toFixed(2)}deg`);
    note.style.setProperty('--j-ease', Math.random() > 0.5
      ? 'cubic-bezier(0.45,0.05,0.55,0.95)'
      : 'cubic-bezier(0.5,0.1,0.5,0.9)');
    note.style.setProperty('--nbw-delay', `${(Math.random() * 5.5).toFixed(2)}s`);
    note.style.setProperty('--nbw-delay2', `${(Math.random() * 5.5).toFixed(2)}s`);

    // 尺寸（持久化）：和普通便利贴一致
    const MIN_W = 120, MIN_H = 90, MAX_W = 360, MAX_H = 360;
    const BASE_W = 168;
    if (item.w) note.style.width = `${clamp(item.w, MIN_W, MAX_W)}px`;
    if (item.h) note.style.minHeight = `${clamp(item.h, MIN_H, MAX_H)}px`;
    note._minW = MIN_W; note._minH = MIN_H; note._maxW = MAX_W; note._maxH = MAX_H;
    note._baseW = BASE_W;
    const w0 = parseFloat(note.style.width) || BASE_W;
    const s = Math.max(1, Math.min(MAX_W / BASE_W, w0 / BASE_W));
    note.style.setProperty('--note-scale', s.toFixed(3));

    const delLabel = I18n.t('dailyDelete');
    const checkLabel = I18n.t(item.done ? 'markUndone' : 'markDone');

    note.innerHTML = `
      <div class="sticky-note-inner">
        <button type="button" class="task-checkbox${item.done ? ' checked' : ''}" aria-label="${escapeHtml(checkLabel)}">
          <svg viewBox="0 0 20 20"><path class="check-path" d="M4 10.5 L8 14.5 L16 6"/></svg>
        </button>
        <div class="task-content">
          <p class="task-text font-body">${escapeHtml(item.text)}</p>
          <div class="task-note-wrap">
            <textarea class="task-note-input font-body"
              data-i18n-placeholder="notePlaceholder"
              placeholder="${escapeHtml(I18n.t('notePlaceholder'))}"
              maxlength="300"
              rows="2"
              wrap="soft">${escapeHtml(item.note || '')}</textarea>
          </div>
        </div>
        <button type="button" class="daily-note-delete" aria-label="${escapeHtml(delLabel)}" title="${escapeHtml(delLabel)}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">
            <path d="M3 4.5 h10"/>
            <path d="M5 4.5 V3 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 v1.5"/>
            <path d="M4.5 4.5 L5 13.6 a1.2 1.2 0 0 0 1.2 1.1 h3.6 a1.2 1.2 0 0 0 1.2 -1.1 L11.5 4.5"/>
            <path d="M7 7 v5 M10 7 v5"/>
          </svg>
        </button>
      </div>
      <span class="note-watermark" style="--wm-align:center">· DAILY · 今日 ·</span>
      <span class="note-pin${item.pinned ? ' pinned' : ''}" aria-hidden="true"></span>
      <span class="resize-handle" aria-hidden="true"></span>
    `;

    StickyWall.applyPosition(note, item);
    StickyWall.bindNote(note, item.id, 'daily');

    // 勾选 → 切换完成
    note.querySelector('.task-checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      DailySidebar.toggleDone(item.id);
    });

    // 点击大头针 → 取消固定
    note.querySelector('.note-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      DailySidebar.togglePin(item.id);
    });

    // 永久删除
    note.querySelector('.daily-note-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      DailySidebar.deleteItem(item.id);
    });

    note.addEventListener('click', (e) => {
      if (e.target.closest('.task-checkbox, .daily-note-delete, .resize-handle, .task-note-input, .note-pin')) return;
      bringToFront(item.id, 'daily');
      AudioFX.play('paper');
    });

    const noteInput = note.querySelector('.task-note-input');
    noteInput.addEventListener('click', (e) => e.stopPropagation());
    noteInput.addEventListener('mousedown', (e) => e.stopPropagation());

    function syncHasNoteFlag(val) {
      const has = (val && val.length > 0) ? 'true' : 'false';
      if (note.dataset.hasNote !== has) note.dataset.hasNote = has;
    }

    function autosize(el) {
      if (!el.value) {
        el.style.height = '';
        return;
      }
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
    requestAnimationFrame(() => autosize(noteInput));

    let saveTimer = null;
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        DailySidebar.updateNote(item.id, noteInput.value);
        syncHasNoteFlag(noteInput.value);
        saveTimer = null;
      }, 180);
    }

    noteInput.addEventListener('input', () => {
      autosize(noteInput);
      scheduleSave();
    });
    noteInput.addEventListener('blur', () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      DailySidebar.updateNote(item.id, noteInput.value);
      syncHasNoteFlag(noteInput.value);
    });

    return note;
  }

  /** 判定一个便利贴 DOM 当前是否处于「已完成」状态 */
  function isDoneLayer(el) {
    const zone = el.dataset && el.dataset.zone;
    if (zone === 'done') return true;
    if (zone === 'daily') return el.classList.contains('daily-done');
    return false; // todo
  }

  /** 将便利贴插入到 wall 中，保证 DOM 顺序永远是：
   *    [已完成组(有序) ···] · [未完成组(有序) ···]
   *  从而配合 z-index(5/10) 确保已完成永远在未完成下方；
   *  若已完成则插入到已完成组末尾（=组内最上，未完成组之前）；
   *  若未完成则 appendChild 到 wall 末尾（=未完成组最上，全墙最顶）。
   */
  function insertByLayer(el) {
    const wallEl = wall();
    // 若 el 已在 wall 中，先从原位置摘除，再按层插入
    if (el.parentNode === wallEl) wallEl.removeChild(el);
    if (isDoneLayer(el)) {
      // 找到第一个未完成元素，插在它之前
      const children = Array.from(wallEl.children);
      const firstUndone = children.find((c) => c.classList.contains('sticky-note') && !isDoneLayer(c));
      if (firstUndone) wallEl.insertBefore(el, firstUndone);
      else wallEl.appendChild(el);
    } else {
      wallEl.appendChild(el);
    }
  }

  function render() {
    const wallEl = wall();
    wallEl.querySelectorAll('.sticky-note').forEach((n) => n.remove());

    // 先批量创建 DOM，再按"已完成组 → 未完成组"顺序插入，确保每层 DOM 顺序与 z-index 都对齐
    const allNotes = [];
    data.todos.forEach((task) => allNotes.push(createStickyNote(task, 'todo')));
    data.done.forEach((task)  => allNotes.push(createStickyNote(task, 'done')));
    if (data.dailyTodo && Array.isArray(data.dailyTodo.items)) {
      data.dailyTodo.items.forEach((item) => allNotes.push(createDailyNote(item)));
    }
    // 先插所有已完成（此时 wall 为空 → appendChild 都在前半段）
    allNotes.filter(isDoneLayer).forEach((n) => wallEl.appendChild(n));
    // 再插所有未完成（appendChild = 后半段 = 视觉顶层）
    allNotes.filter((n) => !isDoneLayer(n)).forEach((n) => wallEl.appendChild(n));

    const isEmpty = data.todos.length === 0 && data.done.length === 0;
    $('#wall-empty').classList.toggle('visible', isEmpty);

    updateStats();
    Interactions.restoreCollapseState(data);
    persist();
  }

  function updateStats() {
    const total = data.todos.length + data.done.length;
    const done = data.done.length;
    const rate = total === 0 ? 0 : Math.round((done / total) * 100);

    $('#todo-count').textContent = data.todos.length;
    $('#done-count').textContent = data.done.length;
    $('#stat-total').textContent = total;
    $('#stat-done').textContent = done;
    $('#stat-rate').textContent = `${rate}%`;
  }

  /* ============================================================
     CRUD
     ============================================================ */

  const SHAPES = ['flat', 'corner-curl', 'crumple'];
  function randomShape() {
    return SHAPES[Math.floor(Math.random() * SHAPES.length)];
  }

  const WATERMARK_POOL = [
    '· TO · DO · NOTE · MEMO ·', 'TODO · TODO · REMIND ·', 'to-do / memo / note',
    '· 备 忘 · 记 事 · 清 单 ·', '待 办 · 清 单 · 备 忘',
    '· À FAIRE · NOTE · MÉMO ·', 'à faire · mémo · liste',
    '· POR HACER · NOTA ·', 'por hacer · memo · lista',
    'list · reminder · check · do', '· note / memo / remind ·',
    '— ✎ — write it down —', '- memo - jot it -',
  ];
  const WM_ALIGNS = ['left', 'center', 'right'];
  function makeWatermark(task) {
    if (!task.wm) {
      task.wm = {
        text: WATERMARK_POOL[Math.floor(Math.random() * WATERMARK_POOL.length)],
        align: WM_ALIGNS[Math.floor(Math.random() * WM_ALIGNS.length)],
      };
    }
    return task.wm;
  }

  function addTask(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const pos = Storage.randomPosition('todo');
    data.todos.unshift({
      id: Storage.generateId(),
      text: trimmed,
      note: '',
      createdAt: Date.now(),
      x: pos.x,
      y: pos.y,
      rotation: pos.rotation,
      shape: randomShape(),
    });

    AudioFX.play('add');
    render();
  }

  function deleteTask(id, zone) {
    const list = zone === 'todo' ? data.todos : data.done;
    const idx = list.findIndex((t) => t.id === id);
    if (idx !== -1) list.splice(idx, 1);
    AudioFX.play('delete');
    render();
  }

  function editTask(id, zone, newText) {
    const list = zone === 'todo' ? data.todos : data.done;
    const task = list.find((t) => t.id === id);
    if (task && newText.trim()) {
      task.text = newText.trim();
      render();
    }
  }

  function updateNote(id, zone, note) {
    const list = zone === 'todo' ? data.todos : data.done;
    const task = list.find((t) => t.id === id);
    if (task) {
      task.note = note;
      persist();
    }
  }

  function updatePosition(id, zone, x, y) {
    const list = zone === 'todo' ? data.todos : data.done;
    const idx = list.findIndex((t) => t.id === id);
    if (idx !== -1) {
      const [task] = list.splice(idx, 1);
      task.x = Math.round(x);
      task.y = Math.round(y);
      list.unshift(task);
      persist();
      const el = document.querySelector(`.sticky-note[data-task-id="${id}"]`);
      if (el) insertByLayer(el); // 放到同层组顶部，保证已完成永远在未完成下方
    }
  }

  /** 点击便签时置顶：把数组项移到头部 + DOM reinsert，跨组保持已完成在未完成下方 */
  function bringToFront(id, zone) {
    if (zone === 'daily') {
      DailySidebar.bringToFront(id);
      return;
    }
    const list = zone === 'todo' ? data.todos : data.done;
    const idx = list.findIndex((t) => t.id === id);
    if (idx !== -1) {
      const [task] = list.splice(idx, 1);
      list.unshift(task);
      persist();
      const el = document.querySelector(`.sticky-note[data-task-id="${id}"]`);
      if (el) insertByLayer(el); // 放到同层组顶部，保证已完成永远在未完成下方
    }
  }

  function updateSize(id, zone, w, h) {
    const list = zone === 'todo' ? data.todos : data.done;
    const task = list.find((t) => t.id === id);
    if (task) {
      task.w = Math.round(w);
      task.h = Math.round(h);
      persist();
    }
  }

  function toggleComplete(id, fromZone) {
    moveTask(id, fromZone, fromZone === 'todo' ? 'done' : 'todo');
  }

  /** 切换大头针固定状态（普通便利贴） */
  function togglePin(id, zone) {
    const list = zone === 'todo' ? data.todos : data.done;
    const task = list.find((t) => t.id === id);
    if (!task) return;
    task.pinned = !task.pinned;
    persist();
    const el = document.querySelector(`.sticky-note[data-task-id="${id}"]`);
    if (el) {
      el.dataset.pinned = task.pinned ? 'true' : 'false';
      el.querySelector('.note-pin')?.classList.toggle('pinned', task.pinned);
    }
    AudioFX.play(task.pinned ? 'complete' : 'paper');
  }

  function moveTask(id, fromZone, toZone) {
    if (fromZone === toZone) return;

    const fromList = fromZone === 'todo' ? data.todos : data.done;
    const toList = toZone === 'todo' ? data.todos : data.done;
    const idx = fromList.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const [task] = fromList.splice(idx, 1);
    if (toZone === 'done') {
      task.completedAt = Date.now();
      task.pinned = false; // 完成时自动取下大头针
      AudioFX.play('complete');
    } else {
      delete task.completedAt;
      AudioFX.play('drop');
    }

    const pos = Storage.randomPosition(toZone);
    task.x = pos.x;
    task.y = pos.y;
    task.rotation = pos.rotation;

    toList.unshift(task);
    render();

    if (toZone === 'done') animateCheckmark(id);
  }

  function discardTask(id) {
    let idx = data.todos.findIndex((t) => t.id === id);
    if (idx !== -1) data.todos.splice(idx, 1);
    else {
      idx = data.done.findIndex((t) => t.id === id);
      if (idx !== -1) data.done.splice(idx, 1);
    }
    persist();
    render();
  }

  function clearDone() {
    const notes = [...data.done];
    if (notes.length === 0) return;
    StickyWall.animateDiscardAll(notes, () => {
      data.done = [];
      AudioFX.play('discard');
      render();
    });
  }

  function persist() {
    Storage.save(data);
  }

  /* ============================================================
     交互辅助
     ============================================================ */

  function animateCheckmark(id) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-task-id="${id}"] .check-path`);
      if (!el) return;
      el.style.transition = 'none';
      el.style.strokeDashoffset = '24';
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.strokeDashoffset = '0';
      });
    });
  }

  function openEditModal(id, zone) {
    const list = zone === 'todo' ? data.todos : data.done;
    const task = list.find((t) => t.id === id);
    if (!task) return;

    editingTaskId = id;
    editingZone = zone;
    modalEditInput.value = task.text;
    Interactions.openModal(actionModal);
    setTimeout(() => modalEditInput.focus(), 100);
  }

  function closeEditModal() {
    Interactions.closeModal(actionModal);
    editingTaskId = null;
    editingZone = null;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ============================================================
     事件绑定
     ============================================================ */

  function bindEvents() {
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addTask(newInput.value);
      newInput.value = '';
      document.querySelector('.input-sketch-border')?.classList.remove('expanded');
    });

    $('#modal-save-btn').addEventListener('click', () => {
      if (editingTaskId && editingZone) editTask(editingTaskId, editingZone, modalEditInput.value);
      closeEditModal();
    });

    $('#modal-delete-btn').addEventListener('click', () => {
      if (editingTaskId && editingZone) deleteTask(editingTaskId, editingZone);
      closeEditModal();
    });

    $('#modal-close-btn').addEventListener('click', closeEditModal);
    Interactions.bindModalDismiss(actionModal, closeEditModal);

    $('#clear-done-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (data.done.length === 0) return;
      Interactions.openModal(confirmModal);
    });

    $('#confirm-yes-btn').addEventListener('click', () => {
      clearDone();
      Interactions.closeModal(confirmModal);
    });

    $('#confirm-no-btn').addEventListener('click', () => {
      Interactions.closeModal(confirmModal);
    });

    Interactions.bindModalDismiss(confirmModal);
    Interactions.bindCollapse(data, persist);
    Interactions.bindInputAnimation();

    // 侧栏折叠切换
    const sidePanel = $('#side-panel');
    const sideToggle = $('#side-panel-toggle');
    if (sideToggle) {
      if (data.collapsed.sidePanel) sidePanel.classList.add('collapsed');
      sideToggle.addEventListener('click', () => {
        const collapsed = sidePanel.classList.toggle('collapsed');
        data.collapsed.sidePanel = collapsed;
        AudioFX.play('collapse');
        persist();
      });
    }

    StickyWall.init(wall(), {
      onMoveToDone: (id) => moveTask(id, 'todo', 'done'),
      onMoveToTodo: (id) => moveTask(id, 'done', 'todo'),
      onDiscard: (id) => { discardTask(id); DailySidebar.discard(id); },
      onReposition: (id, zone, x, y) => {
        if (zone === 'daily') DailySidebar.updatePosition(id, x, y);
        else updatePosition(id, zone, x, y);
      },
      onResize: (id, zone, w, h) => {
        if (zone === 'daily') DailySidebar.updateSize(id, w, h);
        else updateSize(id, zone, w, h);
      },
    });

    // —— 背景切换：9 种（3 种纯色纸+原插画 + 6 张贴图），LocalStorage 持久化 ——
    (() => {
      const BG_KEY = 'sketch_todo_background';
      const VALID = ['default', 'white', 'purewhite', 'whitecrumple', 'kraft', 'cork', 'osb', 'damask', 'dots'];
      const btn = $('#bg-toggle');
      const popup = $('#bg-popup');
      if (!btn || !popup) return;

      function apply(name) {
        const v = VALID.includes(name) ? name : 'default';
        document.body.dataset.bg = v;
        popup.querySelectorAll('.bg-thumb').forEach((t) => {
          t.classList.toggle('active', t.dataset.bg === v);
        });
      }
      function save(name) {
        localStorage.setItem(BG_KEY, name);
      }
      const stored = localStorage.getItem(BG_KEY);
      if (VALID.includes(stored)) apply(stored); else apply('default');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = popup.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
        popup.setAttribute('aria-hidden', String(!open));
        AudioFX.play('paper');
      });
      popup.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', (e) => {
        if (!popup.classList.contains('open')) return;
        if (e.target !== btn && !popup.contains(e.target)) {
          popup.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
          popup.setAttribute('aria-hidden', 'true');
        }
      });
      popup.querySelectorAll('.bg-thumb').forEach((t) => {
        t.addEventListener('click', () => {
          const v = t.dataset.bg || 'default';
          apply(v);
          save(v);
          AudioFX.play('click');
        });
      });
    })();

    I18n.onChange(() => {
      AudioFX.play('lang');
      render();
    });

    window.addEventListener('resize', () => {
      document.querySelectorAll('.sticky-note').forEach((el) => {
        const id = el.dataset.taskId;
        const zone = el.dataset.zone;
        let task;
        if (zone === 'daily') {
          task = data.dailyTodo?.items?.find((t) => t.id === id);
        } else {
          const list = zone === 'todo' ? data.todos : data.done;
          task = list.find((t) => t.id === id);
        }
        if (task) {
          task.x = Math.min(task.x, wall().scrollWidth - el.offsetWidth);
          task.y = Math.min(task.y, wall().scrollHeight - el.offsetHeight);
          StickyWall.applyPosition(el, task);
        }
      });
      persist();
      DailySidebar && DailySidebar._clampPositionToViewport();
    });
  }

  /* ============================================================
     全局字号模块 GlobalFontScale
     - 0.85 ~ 1.2x，步长 0.05（范围克制）
     - 写入 :root { --global-font-scale } 让全局字体 calc 同步
     - 值存 data.globalPrefs.fontSizeScale
     ============================================================ */
  const GlobalFontScale = (() => {
    const MIN = 0.85, MAX = 1.2, STEP = 0.05;
    let rangeEl, numEl;

    function clamp(v) {
      return Math.max(MIN, Math.min(MAX, Math.round((+v || 1) / STEP) * STEP));
    }
    function ensure() {
      if (!data.globalPrefs || typeof data.globalPrefs !== 'object') {
        data.globalPrefs = { fontSizeScale: 1 };
      }
      if (typeof data.globalPrefs.fontSizeScale !== 'number' || isNaN(data.globalPrefs.fontSizeScale)) {
        data.globalPrefs.fontSizeScale = 1;
      }
      data.globalPrefs.fontSizeScale = clamp(data.globalPrefs.fontSizeScale);
    }
    function apply(raw) {
      ensure();
      const val = raw != null ? clamp(raw) : data.globalPrefs.fontSizeScale;
      data.globalPrefs.fontSizeScale = val;
      document.documentElement.style.setProperty('--global-font-scale', val.toFixed(2));
      const pct = Math.round(val * 100);
      if (rangeEl && rangeEl.value !== String(pct)) rangeEl.value = String(pct);
      if (numEl) numEl.textContent = `${pct}%`;
      Storage.save(data);
      return val;
    }
    function bind() {
      if (!rangeEl) return;
      rangeEl.addEventListener('input', () => {
        const v = parseInt(rangeEl.value, 10) / 100;
        apply(v);
      });
    }
    function init() {
      rangeEl = document.getElementById('global-font-scale');
      numEl = document.getElementById('global-font-num');
      ensure();
      apply();
      bind();
    }
    return { init, apply };
  })();

  /* ============================================================
     每日待做侧边栏模块（DailySidebar）
     - 侧边栏：白色 sketch-frame，只做输入入口 + 日期
     - 任务生成后变成墙上可拖动的米白色便利贴（和普通便利贴一样）
     - 数据：data.dailyTodo { date, items:[{id,text,done,createdAt,x,y,rotation}], prefs:{...} }
     - 跨日自动清空；侧边栏可拖/可收起/磁吸两侧
     ============================================================ */
  const DailySidebar = (() => {
    let el, handleEl, bodyEl, hintEl, formEl, inputEl;
    let dateEl, colorPickerEl;
    let dragState = null;
    const COLORS = ['beige', 'blue', 'pink'];

    function persist() { Storage.save(data); }

    function ensureData() {
      if (!data.dailyTodo || typeof data.dailyTodo !== 'object') {
        data.dailyTodo = {
          date: Storage.todayKey(),
          items: [],
          prefs: { collapsed: false, side: 'right', x: null, y: null, color: 'beige' },
        };
      }
      if (!data.dailyTodo.prefs || typeof data.dailyTodo.prefs !== 'object') {
        data.dailyTodo.prefs = { collapsed: false, side: 'right', x: null, y: null, color: 'beige' };
      }
      const p = data.dailyTodo.prefs;
      if (typeof p.collapsed !== 'boolean') p.collapsed = false;
      if (!['left', 'right'].includes(p.side)) p.side = 'right';
      if (!COLORS.includes(p.color)) p.color = 'beige';
      if (!Array.isArray(data.dailyTodo.items)) data.dailyTodo.items = [];
    }

    function updateHint() {
      if (!hintEl) return;
      hintEl.style.display = (data.dailyTodo.items.length === 0) ? '' : 'none';
    }

    function checkDayRollover() {
      ensureData();
      const today = Storage.todayKey();
      if (data.dailyTodo.date !== today) {
        data.dailyTodo.date = today;
        data.dailyTodo.items = [];
        persist();
        render();
        updateHint();
        if (dateEl) dateEl.textContent = formatDateLabel(today);
      }
    }

    function formatDateLabel(isoLike) {
      try {
        const [y, m, d] = isoLike.split('-').map(Number);
        const date = new Date(y, (m || 1) - 1, d || 1);
        const lang = I18n.getLang();
        if (lang === 'zh') return `${y}年${m}月${d}日`;
        return date.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'fr' ? 'fr-FR' : 'es-ES',
          { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return isoLike;
      }
    }

    function applyCollapsed(collapsed) {
      ensureData();
      data.dailyTodo.prefs.collapsed = !!collapsed;
      el.classList.toggle('collapsed', !!collapsed);
      const titleKey = !!collapsed ? 'dailyExpand' : 'dailyCollapse';
      const title = I18n.t(titleKey);
      if (handleEl) {
        handleEl.setAttribute('title', title);
        handleEl.setAttribute('aria-label', title);
        handleEl.dataset.i18nTitle = titleKey;
      }
      persist();
    }

    /** 同步色板选中态 */
    function syncColorSwatches() {
      if (!colorPickerEl) return;
      ensureData();
      const cur = data.dailyTodo.prefs.color || 'beige';
      colorPickerEl.querySelectorAll('.daily-color-swatch').forEach((sw) => {
        sw.classList.toggle('active', sw.dataset.color === cur);
      });
    }

    function applyPosition() {
      ensureData();
      const prefs = data.dailyTodo.prefs;
      el.dataset.side = prefs.side;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const topControlsBottom = 104;
      const bottomDropZoneH = 120;
      const sidebarW = el.classList.contains('collapsed')
        ? 32
        : parseInt(getComputedStyle(el).getPropertyValue('--daily-expand-w'), 10) || 280;
      const rect = el.getBoundingClientRect();
      const sidebarH = rect.height || 300;

      const safeYMax = vh - sidebarH - bottomDropZoneH;
      const yMin = topControlsBottom;

      let { x, y } = prefs;
      if (x == null || y == null) {
        x = prefs.side === 'right' ? (vw - sidebarW) : 0;
        y = yMin + 40;
      }

      let finalX = prefs.side === 'right' ? (vw - sidebarW) : 0;
      let finalY = Math.max(yMin, Math.min(safeYMax, y ?? (yMin + 40)));

      if (prefs.side === 'right') {
        el.style.left = 'auto';
        el.style.right = `${Math.round(vw - (finalX + sidebarW))}px`;
      } else {
        el.style.right = 'auto';
        el.style.left = `${Math.round(finalX)}px`;
      }
      el.style.top = `${Math.round(finalY)}px`;
      el.style.bottom = 'auto';
      prefs.x = Math.round(finalX);
      prefs.y = Math.round(finalY);
    }

    function _clampPositionToViewport() {
      if (!el) return;
      applyPosition();
      persist();
    }

    function setupDrag() {
      handleEl.addEventListener('pointerdown', (e) => {
        const rect = el.getBoundingClientRect();
        dragState = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          origLeft: rect.left,
          origTop: rect.top,
          moved: false,
        };
        handleEl.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        e.preventDefault();
      });

      const MAGNET = 40;

      handleEl.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.pointerId !== e.pointerId) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sidebarW = el.classList.contains('collapsed')
          ? 32
          : parseInt(getComputedStyle(el).getPropertyValue('--daily-expand-w'), 10) || 280;
        const sidebarH = el.offsetHeight || 300;
        const topControlsBottom = 104;
        const bottomDropZoneH = 120;

        let nx = dragState.origLeft + dx;
        let ny = dragState.origTop + dy;

        if (nx <= MAGNET) nx = 0;
        else if (nx >= (vw - sidebarW - MAGNET)) nx = vw - sidebarW;

        ny = Math.max(topControlsBottom, Math.min(vh - sidebarH - bottomDropZoneH, ny));

        el.style.left = `${Math.round(nx)}px`;
        el.style.right = 'auto';
        el.style.top = `${Math.round(ny)}px`;

        dragState.curX = nx;
        dragState.curY = ny;
        ensureData();
        data.dailyTodo.prefs.x = Math.round(nx);
        data.dailyTodo.prefs.y = Math.round(ny);
      });

      function release(e) {
        if (!dragState) return;
        if (dragState.pointerId && e && e.pointerId !== dragState.pointerId) return;
        const wasMoved = dragState.moved;
        const lastY = dragState.curY ?? (el.getBoundingClientRect().top);
        const sbW = el.classList.contains('collapsed')
          ? 32
          : parseInt(getComputedStyle(el).getPropertyValue('--daily-expand-w'), 10) || 280;
        const vw = window.innerWidth;

        try { handleEl.releasePointerCapture(dragState.pointerId); } catch {}
        el.classList.remove('dragging');

        if (wasMoved) {
          const centerX = (dragState.curX ?? el.getBoundingClientRect().left) + sbW / 2;
          const side = centerX < (vw / 2) ? 'left' : 'right';

          ensureData();
          data.dailyTodo.prefs.side = side;
          data.dailyTodo.prefs.x = Math.round(side === 'right' ? (vw - sbW) : 0);
          data.dailyTodo.prefs.y = Math.round(lastY);
          el.dataset.side = side;

          applyPosition();
          persist();
        } else {
          // 点击（未拖动）→ 切换收起/展开
          const collapsed = !el.classList.contains('collapsed');
          applyCollapsed(collapsed);
          if (AudioFX.play) AudioFX.play(collapsed ? 'collapse' : 'paper');
          requestAnimationFrame(() => { applyPosition(); persist(); });
        }

        dragState = null;
      }

      handleEl.addEventListener('pointerup', release);
      handleEl.addEventListener('pointercancel', (e) => {
        if (!dragState) return;
        release(e);
      });
    }

    function addItem(text) {
      const t = (text || '').trim();
      if (!t) return;
      ensureData();
      checkDayRollover();
      const pos = Storage.randomPosition('todo');
      data.dailyTodo.items.unshift({
        id: Storage.generateId(),
        text: t,
        done: false,
        createdAt: Date.now(),
        x: pos.x,
        y: pos.y,
        rotation: pos.rotation,
        color: data.dailyTodo.prefs.color || 'beige',
        note: '',
      });
      persist();
      render();
      updateHint();
      if (AudioFX.play) AudioFX.play('add');
    }

    /** 更新备注（由 textarea 防抖/失焦调用） */
    function updateNote(id, note) {
      ensureData();
      const it = data.dailyTodo.items.find((x) => x.id === id);
      if (!it) return;
      it.note = note;
      persist();
    }

    function toggleDone(id) {
      ensureData();
      const it = data.dailyTodo.items.find((x) => x.id === id);
      if (!it) return;
      it.done = !it.done;
      if (it.done) it.pinned = false; // 完成时自动取下大头针
      persist();
      render();
      if (AudioFX.play) AudioFX.play(it.done ? 'complete' : 'paper');
    }

    /** 切换大头针固定状态（每日便利贴） */
    function togglePin(id) {
      ensureData();
      const it = data.dailyTodo.items.find((x) => x.id === id);
      if (!it) return;
      it.pinned = !it.pinned;
      persist();
      const el = document.querySelector(`.sticky-note[data-task-id="${id}"]`);
      if (el) {
        el.dataset.pinned = it.pinned ? 'true' : 'false';
        el.querySelector('.note-pin')?.classList.toggle('pinned', it.pinned);
      }
      if (AudioFX.play) AudioFX.play(it.pinned ? 'complete' : 'paper');
    }

    function deleteItem(id) {
      ensureData();
      const before = data.dailyTodo.items.length;
      data.dailyTodo.items = data.dailyTodo.items.filter((x) => x.id !== id);
      if (data.dailyTodo.items.length === before) return;
      persist();
      render();
      updateHint();
      if (AudioFX.play) AudioFX.play('delete');
    }

    /** 拖拽后更新坐标（由 StickyWall 回调调用） */
    function updatePosition(id, x, y) {
      ensureData();
      const list = data.dailyTodo.items;
      const idx = list.findIndex((x2) => x2.id === id);
      if (idx === -1) return;
      const [it] = list.splice(idx, 1);
      it.x = Math.round(x);
      it.y = Math.round(y);
      list.unshift(it);
      persist();
      const el = document.querySelector(`.sticky-note[data-task-id="${id}"]`);
      if (el) insertByLayer(el); // 放到同层组顶部，保证已完成永远在未完成下方
    }

    /** 点击便签时置顶（由 bringToFront 转发调用） */
    function bringToFront(id) {
      ensureData();
      const list = data.dailyTodo.items;
      const idx = list.findIndex((x2) => x2.id === id);
      if (idx === -1) return;
      const [it] = list.splice(idx, 1);
      list.unshift(it);
      persist();
      const el = document.querySelector(`.sticky-note[data-task-id="${id}"]`);
      if (el) insertByLayer(el); // 放到同层组顶部，保证已完成永远在未完成下方
    }

    /** 缩放后更新尺寸（由 StickyWall 回调调用） */
    function updateSize(id, w, h) {
      ensureData();
      const it = data.dailyTodo.items.find((x2) => x2.id === id);
      if (!it) return;
      it.w = Math.round(w);
      it.h = Math.round(h);
      persist();
    }

    /** 拖入丢弃区 → 永久删除（由 StickyWall 回调调用） */
    function discard(id) {
      ensureData();
      const before = data.dailyTodo.items.length;
      data.dailyTodo.items = data.dailyTodo.items.filter((x) => x.id !== id);
      if (data.dailyTodo.items.length === before) return;
      persist();
      render();
      updateHint();
      if (AudioFX.play) AudioFX.play('discard');
    }

    function bind() {
      formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        addItem(inputEl.value);
        inputEl.value = '';
      });

      // 颜色选择器：点击切换默认色，写入 prefs.color
      if (colorPickerEl) {
        colorPickerEl.addEventListener('click', (e) => {
          const sw = e.target.closest('.daily-color-swatch');
          if (!sw) return;
          const c = sw.dataset.color;
          if (!COLORS.includes(c)) return;
          ensureData();
          data.dailyTodo.prefs.color = c;
          syncColorSwatches();
          persist();
          if (AudioFX.play) AudioFX.play('paper');
        });
      }

      I18n.onChange(() => {
        document.querySelectorAll('#daily-sidebar [data-i18n]').forEach((n) => {
          const k = n.dataset.i18n;
          const s = I18n.t(k);
          if (s && s !== k) n.textContent = s;
        });
        document.querySelectorAll('#daily-sidebar [data-i18n-placeholder]').forEach((n) => {
          const k = n.dataset.i18nPlaceholder;
          const s = I18n.t(k);
          if (s && s !== k) n.setAttribute('placeholder', s);
        });
        document.querySelectorAll('#daily-sidebar [data-i18n-title]').forEach((n) => {
          const k = n.dataset.i18nTitle;
          const s = I18n.t(k);
          if (s && s !== k) { n.setAttribute('title', s); n.setAttribute('aria-label', s); }
        });
        document.querySelectorAll('[data-i18n-title="globalFontSizeTitle"]').forEach((n) => {
          const s = I18n.t('globalFontSizeTitle');
          if (s && s !== 'globalFontSizeTitle') { n.setAttribute('title', s); n.setAttribute('aria-label', s); }
        });
        document.querySelectorAll('.global-font-label[data-i18n="fontSizeLabel"]').forEach((n) => {
          const s = I18n.t('fontSizeLabel');
          if (s && s !== 'fontSizeLabel') n.textContent = s;
        });
        if (dateEl) dateEl.textContent = formatDateLabel((data.dailyTodo && data.dailyTodo.date) || Storage.todayKey());
        render();
      });

      window.addEventListener('resize', () => {
        requestAnimationFrame(() => {
          ensureData();
          applyPosition();
          persist();
        });
      });
    }

    function init() {
      el = $('#daily-sidebar');
      if (!el) return;
      handleEl = $('#daily-sidebar-handle');
      bodyEl = el.querySelector('.daily-sidebar-body');
      hintEl = $('#daily-empty');
      formEl = $('#daily-add-form');
      inputEl = $('#daily-new-input');
      colorPickerEl = el.querySelector('.daily-color-picker');
      dateEl = $('#daily-sidebar-date');

      ensureData();
      checkDayRollover();

      const prefs = data.dailyTodo.prefs;
      el.dataset.side = prefs.side;
      if (prefs.collapsed) el.classList.add('collapsed');
      applyCollapsed(prefs.collapsed);
      syncColorSwatches();

      requestAnimationFrame(() => {
        applyPosition();
        persist();
      });

      setupDrag();
      bind();
      if (dateEl) dateEl.textContent = formatDateLabel(data.dailyTodo.date);
      updateHint();

      setInterval(checkDayRollover, 30 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkDayRollover();
      });
    }

    return {
      init,
      _clampPositionToViewport,
      toggleDone,
      togglePin,
      deleteItem,
      updatePosition,
      updateSize,
      discard,
      updateNote,
      bringToFront,
    };
  })();

  /** 初始化大头针拖拽：从侧边栏拖到便利贴上 → 固定 */
  function initPushpinDrag() {
    const source = document.getElementById('pushpin-source');
    if (!source) return;

    source.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      // 创建跟随光标的幽灵
      const ghost = source.cloneNode(true);
      ghost.classList.add('pushpin-ghost');
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      document.body.appendChild(ghost);

      let hoverNote = null;

      function onMove(ev) {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
        // 检测光标下的便利贴
        ghost.style.pointerEvents = 'none';
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const note = el?.closest('.sticky-note');
        if (hoverNote && hoverNote !== note) {
          hoverNote.classList.remove('pin-hover');
          hoverNote = null;
        }
        if (note && note !== hoverNote) {
          hoverNote = note;
          note.classList.add('pin-hover');
        }
      }

      function onUp(ev) {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        ghost.remove();
        if (hoverNote) {
          hoverNote.classList.remove('pin-hover');
          const id = hoverNote.dataset.taskId;
          const zone = hoverNote.dataset.zone;
          if (id && zone === 'daily') {
            if (hoverNote.dataset.pinned !== 'true') DailySidebar.togglePin(id);
          } else if (id && (zone === 'todo' || zone === 'done')) {
            if (hoverNote.dataset.pinned !== 'true') togglePin(id, zone);
          }
        }
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  async function init() {
    await I18n.init();
    AudioFX.init();
    Music.init();
    GlobalFontScale.init();
    bindEvents();
    render();
    DailySidebar.init();
    initPushpinDrag();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

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

  /* ============================================================
     渲染
     ============================================================ */

  function createStickyNote(task, zone) {
    const note = document.createElement('div');
    note.className = `sticky-note${zone === 'done' ? ' done-note' : ''}`;
    note.dataset.taskId = task.id;
    note.dataset.zone = zone;

    const isDone = zone === 'done';

    note.innerHTML = `
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
          ${task.note ? `<p class="task-note-display font-body">${escapeHtml(task.note)}</p>` : ''}
          <div class="task-note-wrap">
            <input type="text" class="task-note-input font-body"
              data-i18n-placeholder="notePlaceholder"
              placeholder="${escapeHtml(I18n.t('notePlaceholder'))}"
              maxlength="300" value="${escapeHtml(task.note || '')}" />
          </div>
        </div>
      </div>
    `;

    StickyWall.applyPosition(note, task);
    StickyWall.bindNote(note, task.id, zone);

    const checkbox = note.querySelector('.task-checkbox');
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleComplete(task.id, zone);
    });

    Interactions.bindLongPress(note, () => openEditModal(task.id, zone));

    note.addEventListener('click', (e) => {
      if (Interactions.wasLongPress()) return;
      if (e.target.closest('.task-checkbox, .task-note-input')) return;
      toggleNoteInput(note);
    });

    const noteInput = note.querySelector('.task-note-input');
    noteInput.addEventListener('click', (e) => e.stopPropagation());
    noteInput.addEventListener('change', () => {
      updateNote(task.id, zone, noteInput.value.trim());
    });
    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateNote(task.id, zone, noteInput.value.trim());
        noteInput.blur();
      }
    });

    return note;
  }

  function render() {
    const wallEl = wall();
    wallEl.querySelectorAll('.sticky-note').forEach((n) => n.remove());

    data.todos.forEach((task) => {
      wallEl.appendChild(createStickyNote(task, 'todo'));
    });

    data.done.forEach((task) => {
      wallEl.appendChild(createStickyNote(task, 'done'));
    });

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
    const task = list.find((t) => t.id === id);
    if (task) {
      task.x = Math.round(x);
      task.y = Math.round(y);
      persist();
    }
  }

  function toggleComplete(id, fromZone) {
    moveTask(id, fromZone, fromZone === 'todo' ? 'done' : 'todo');
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
    const idx = data.done.findIndex((t) => t.id === id);
    if (idx !== -1) data.done.splice(idx, 1);
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

  function toggleNoteInput(note) {
    const wrap = note.querySelector('.task-note-wrap');
    const isOpen = wrap.classList.contains('open');

    document.querySelectorAll('.task-note-wrap.open').forEach((w) => w.classList.remove('open'));

    if (!isOpen) {
      wrap.classList.add('open');
      wrap.querySelector('.task-note-input')?.focus();
    }
  }

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

    StickyWall.init(wall(), {
      onMoveToDone: (id) => moveTask(id, 'todo', 'done'),
      onMoveToTodo: (id) => moveTask(id, 'done', 'todo'),
      onDiscard: (id) => discardTask(id),
      onReposition: (id, zone, x, y) => updatePosition(id, zone, x, y),
    });

    I18n.onChange(() => {
      AudioFX.play('lang');
      render();
    });

    window.addEventListener('resize', () => {
      document.querySelectorAll('.sticky-note').forEach((el) => {
        const id = el.dataset.taskId;
        const zone = el.dataset.zone;
        const list = zone === 'todo' ? data.todos : data.done;
        const task = list.find((t) => t.id === id);
        if (task) {
          task.x = Math.min(task.x, wall().scrollWidth - el.offsetWidth);
          task.y = Math.min(task.y, wall().scrollHeight - el.offsetHeight);
          StickyWall.applyPosition(el, task);
        }
      });
      persist();
    });
  }

  async function init() {
    await I18n.init();
    AudioFX.init();
    bindEvents();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

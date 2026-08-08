/**
 * sticky-wall.js — 便利贴墙自由拖拽 + 区域判定
 * 支持惯性缓动、丢弃消散动画
 */

const StickyWall = (() => {
  let wallEl = null;
  let callbacks = {};
  let activeNote = null;
  let dragOffset = { x: 0, y: 0 };
  let velocity = { x: 0, y: 0 };
  let lastPos = { x: 0, y: 0, t: 0 };
  let inertiaFrame = null;

  const ZONES = ['todo', 'done', 'discard'];

  function init(wall, cbs) {
    wallEl = wall;
    callbacks = cbs;
  }

  /** 绑定单张便签的指针拖拽 */
  function bindNote(el, id, zone) {
    el.dataset.taskId = id;
    el.dataset.zone = zone;

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.task-checkbox, .task-note-input, button, a')) return;
      if (e.button !== 0) return;

      e.preventDefault();
      activeNote = { el, id, zone, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
      const rect = el.getBoundingClientRect();
      const wallRect = wallEl.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      lastPos = { x: e.clientX, y: e.clientY, t: Date.now() };
      velocity = { x: 0, y: 0 };

      if (inertiaFrame) cancelAnimationFrame(inertiaFrame);

      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      el.style.zIndex = '50';
    });

    el.addEventListener('pointermove', (e) => {
      if (!activeNote || activeNote.el !== el) return;

      const dx = Math.abs(e.clientX - activeNote.startX);
      const dy = Math.abs(e.clientY - activeNote.startY);
      if (dx > 4 || dy > 4) activeNote.moved = true;

      const now = Date.now();
      const dt = now - lastPos.t || 16;
      velocity.x = (e.clientX - lastPos.x) / dt * 16;
      velocity.y = (e.clientY - lastPos.y) / dt * 16;
      lastPos = { x: e.clientX, y: e.clientY, t: now };

      const wallRect = wallEl.getBoundingClientRect();
      let x = e.clientX - wallRect.left - dragOffset.x + wallEl.scrollLeft;
      let y = e.clientY - wallRect.top - dragOffset.y + wallEl.scrollTop;

      x = clamp(x, 0, wallEl.scrollWidth - el.offsetWidth);
      y = clamp(y, 0, wallEl.scrollHeight - el.offsetHeight);

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      highlightZone(e.clientX, e.clientY, zone);
    });

    el.addEventListener('pointerup', (e) => {
      if (!activeNote || activeNote.el !== el) return;
      finishDrag(e.clientX, e.clientY);
    });

    el.addEventListener('pointercancel', (e) => {
      if (!activeNote || activeNote.el !== el) return;
      finishDrag(e.clientX, e.clientY);
    });
  }

  function finishDrag(clientX, clientY) {
    const { el, id, zone, moved } = activeNote;
    el.classList.remove('dragging');
    if (activeNote.pointerId != null) {
      try { el.releasePointerCapture(activeNote.pointerId); } catch { /* noop */ }
    }
    clearZoneHighlights();

    const dropZone = detectZone(clientX, clientY);

    if (dropZone === 'done' && zone === 'todo') {
      AudioFX.play('complete');
      callbacks.onMoveToDone?.(id);
    } else if (dropZone === 'todo' && zone === 'done') {
      AudioFX.play('drop');
      callbacks.onMoveToTodo?.(id);
    } else if (dropZone === 'discard' && zone === 'done') {
      animateDiscard(el, () => {
        AudioFX.play('discard');
        callbacks.onDiscard?.(id);
      });
    } else if (moved) {
      const x = parseFloat(el.style.left) || 0;
      const y = parseFloat(el.style.top) || 0;
      AudioFX.play('drop');
      applyInertia(el, x, y);
      callbacks.onReposition?.(id, zone, x, y);
    }

    activeNote = null;
  }

  /** 惯性缓动 */
  function applyInertia(el, x, y) {
    let vx = velocity.x * 0.6;
    let vy = velocity.y * 0.6;
    let px = x;
    let py = y;

    function step() {
      vx *= 0.92;
      vy *= 0.92;
      px += vx;
      py += vy;

      px = clamp(px, 0, wallEl.scrollWidth - el.offsetWidth);
      py = clamp(py, 0, wallEl.scrollHeight - el.offsetHeight);

      el.style.left = `${px}px`;
      el.style.top = `${py}px`;

      if (Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) {
        inertiaFrame = requestAnimationFrame(step);
      } else {
        const id = el.dataset.taskId;
        const zone = el.dataset.zone;
        callbacks.onReposition?.(id, zone, px, py);
      }
    }

    if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
      inertiaFrame = requestAnimationFrame(step);
    }
  }

  /** 飘落沉入桶内动画 */
  function animateDiscard(el, onDone) {
    const zone = document.getElementById('discard-zone');
    let dx = 0, dy = 0;
    if (zone) {
      const zr = zone.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetCx = zr.left + zr.width / 2;
      const targetCy = zr.top + 6;
      dx = targetCx - (elRect.left + elRect.width / 2);
      dy = targetCy - elRect.top;
    }
    el.style.setProperty('--drop-x', `${dx}px`);
    el.style.setProperty('--drop-y', `${dy}px`);
    el.style.setProperty('--drop-r', `${(Math.random() - 0.5) * 40}deg`);
    el.classList.add('discarding');
    el.style.pointerEvents = 'none';

    if (zone) {
      setTimeout(() => zone.classList.add('trash-shake'), 420);
      setTimeout(() => zone.classList.remove('trash-shake'), 940);
    }
    setTimeout(() => {
      el.remove();
      onDone?.();
    }, 700);
  }

  /** 批量丢弃动画（清空已完成） */
  function animateDiscardAll(doneNotes, onDone) {
    if (doneNotes.length === 0) { onDone?.(); return; }
    let i = 0;
    const interval = setInterval(() => {
      if (i < doneNotes.length) {
        const el = document.querySelector(`[data-task-id="${doneNotes[i].id}"]`);
        if (el) animateDiscard(el, () => {});
        i++;
      } else {
        clearInterval(interval);
        setTimeout(onDone, 750);
      }
    }, 120);
  }

  function detectZone(x, y) {
    for (const z of ZONES) {
      const zoneEl = document.getElementById(`${z}-zone`);
      if (!zoneEl) continue;
      const r = zoneEl.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
    }
    return null;
  }

  function highlightZone(x, y, fromZone) {
    clearZoneHighlights();
    const detected = detectZone(x, y);
    if (!detected) return;

    const valid =
      (detected === 'done' && fromZone === 'todo') ||
      (detected === 'todo' && fromZone === 'done') ||
      (detected === 'discard' && fromZone === 'done');

    if (valid) {
      document.getElementById(`${detected}-zone`)?.classList.add('zone-active');
    }
  }

  function clearZoneHighlights() {
    ZONES.forEach((z) => {
      document.getElementById(`${z}-zone`)?.classList.remove('zone-active');
    });
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /** 应用存储坐标到便签 DOM */
  function applyPosition(el, task) {
    el.style.left = `${task.x}px`;
    el.style.top = `${task.y}px`;
    const r = task.rotation || 0;
    el.style.setProperty('--note-rot', `${r}deg`);
    el.style.setProperty('--cur-r', `${r}deg`);
    el.style.transform = 'rotate(var(--note-rot))';
  }

  return { init, bindNote, applyPosition, animateDiscard, animateDiscardAll };
})();

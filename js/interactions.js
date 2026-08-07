/**
 * interactions.js — 高级交互模块
 * 长按编辑/删除、折叠、弹窗、输入框动画
 */

const Interactions = (() => {
  const LONG_PRESS_MS = 600;
  let longPressTimer = null;
  let longPressTriggered = false;
  let pressTarget = null;

  function bindLongPress(el, onLongPress) {
    const start = (e) => {
      if (e.target.closest('.task-checkbox, .task-note-input, button')) return;
      longPressTriggered = false;
      pressTarget = el;
      el.classList.add('long-press-active');

      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        el.classList.remove('long-press-active');
        onLongPress(el);
      }, LONG_PRESS_MS);
    };

    const cancel = () => {
      clearTimeout(longPressTimer);
      if (pressTarget) pressTarget.classList.remove('long-press-active');
      pressTarget = null;
    };

    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchmove', cancel);
  }

  function wasLongPress() {
    const result = longPressTriggered;
    longPressTriggered = false;
    return result;
  }

  function bindCollapse(data, onToggle) {
    document.querySelectorAll('[data-collapse]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('#clear-done-btn')) return;

        const key = btn.dataset.collapse;
        data.collapsed[key] = !data.collapsed[key];
        applyCollapse(key, data.collapsed[key]);
        AudioFX.play('collapse');
        if (onToggle) onToggle(data);
      });
    });
  }

  function applyCollapse(key, collapsed) {
    const body = document.querySelector(`[data-body="${key}"]`);
    const header = document.querySelector(`[data-collapse="${key}"]`);
    if (!body || !header) return;

    body.classList.toggle('collapsed', collapsed);
    if (collapsed) {
      header.setAttribute('data-collapsed', '');
    } else {
      header.removeAttribute('data-collapsed');
    }
  }

  function restoreCollapseState(data) {
    if (!data.collapsed) return;
    Object.keys(data.collapsed).forEach((key) => {
      applyCollapse(key, data.collapsed[key]);
    });
  }

  function bindInputAnimation() {
    const wrap = document.querySelector('.input-sketch-border');
    const input = document.getElementById('new-task-input');
    if (!wrap || !input) return;

    input.addEventListener('focus', () => wrap.classList.add('expanded'));
    input.addEventListener('blur', () => {
      if (!input.value.trim()) wrap.classList.remove('expanded');
    });
  }

  function openModal(modalEl) {
    modalEl.classList.remove('hidden');
    requestAnimationFrame(() => modalEl.classList.add('visible'));
    modalEl.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modalEl) {
    modalEl.classList.remove('visible');
    modalEl.setAttribute('aria-hidden', 'true');
    setTimeout(() => modalEl.classList.add('hidden'), 350);
  }

  function bindModalDismiss(modalEl, onClose) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        closeModal(modalEl);
        if (onClose) onClose();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl.classList.contains('visible')) {
        closeModal(modalEl);
        if (onClose) onClose();
      }
    });
  }

  return {
    bindLongPress,
    wasLongPress,
    bindCollapse,
    restoreCollapseState,
    bindInputAnimation,
    openModal,
    closeModal,
    bindModalDismiss,
  };
})();

// Scroll bars appear while something scrolls and fade a moment after (base.css .is-scrolling).
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

export function startScrollbars() {
  window.addEventListener(
    'scroll',
    (e) => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement;
      if (!el) return;
      el.classList.add('is-scrolling');
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => el.classList.remove('is-scrolling'), 900));
    },
    { capture: true, passive: true },
  );
}

/** `color` with its alpha replaced (accepts "#rrggbb", "#rgb", "rgb(r, g, b)" or "rgba(...)"). */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  let r = 0, g = 0, b = 0;
  const m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) {
    [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (/^#([0-9a-f]{3}){1,2}$/i.test(c)) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import "./icons.css";

const paths = {
  pencil:
    '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15z"/>',
  eraser:
    '<path d="m13 4 7 7a2 2 0 0 1 0 3l-6 6H8l-5-5a2 2 0 0 1 0-3l7-8a2 2 0 0 1 3 0ZM7 8l10 10M13 20h8"/>',
  fill: '<path d="m7 3 10 10-7 7-8-8 7-7M3 11h12M20 13s-3 4-3 6a3 3 0 0 0 6 0c0-2-3-6-3-6Z"/>',
  picker:
    '<path d="m15 3 6 6M17 7l-1-1-11 11-1 4 4-1L19 9l-1-1 3-3a2 2 0 0 0-3-3l-3 3"/>',
  move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  play: '<path d="m8 4 12 8-12 8z" fill="currentColor" stroke-width="1"/>',
  pause: '<path d="M7 5v14M17 5v14" stroke-width="5"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.6l-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z"/>',
  starFilled:
    '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.6l-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z" fill="currentColor"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  ellipsis: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="4"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  undo: '<path d="m8 3-5 5 5 5M3 8h11a7 7 0 0 1 0 14h-3"/>',
  redo: '<path d="m16 3 5 5-5 5M21 8H10a7 7 0 0 0 0 14h3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  home: '<path d="m2 11 10-9 10 9M5 9v12h5v-7h4v7h5V9"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.7 2.7 0 1 1 4 2.5c-1.4.7-1.5 1.2-1.5 2.5M12 17h.01"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10"/>',
  target:
    '<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  checker:
    '<path d="M3 3h18v18H3z"/><path d="M3 3h6v6H3zm12 0h6v6h-6zM9 9h6v6H9zM3 15h6v6H3zm12 0h6v6h-6z" fill="currentColor" stroke="none"/>',
  history: '<path d="M3 3v6h6M3 9a9 9 0 1 1 0 6M12 7v6l4 2"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="16" cy="8" r="2"/><path d="m3 17 6-6 7 7 3-3 2 2"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  gamepad:
    '<path d="M7 7h10c3 0 5 10 4 12s-5-3-6-3H9c-1 0-5 5-6 3S4 7 7 7ZM7 10v5M4.5 12.5h5M16 11h.01M19 14h.01"/>',
  file: '<path d="M5 2h10l5 5v15H5zM15 2v6h5M8 13h9M8 17h9"/>',
  rotate: '<path d="M20 3v6h-6M20 9a9 9 0 1 0 0 7"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  arrowUp: '<path d="M12 21V3m-7 7 7-7 7 7"/>',
  arrowDown: '<path d="M12 3v18m-7-7 7 7 7-7"/>',
  arrowLeft: '<path d="M21 12H3m7-7-7 7 7 7"/>',
  arrowRight: '<path d="M3 12h18m-7-7 7 7-7 7"/>',
  rotatePhone:
    '<rect x="7" y="2" width="11" height="19" rx="2" transform="rotate(25 12 12)"/><path d="M2 9a10 10 0 0 1 4-6M2 4v5h5"/>',
  expand:
    '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"/>',
};
export type IconName = keyof typeof paths;
export function icon(name: IconName, size = 18) {
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

const POWER_MEDALS = Object.freeze({
  demolition: new URL('../assets/powers/demolition.webp', import.meta.url).href,
  jump: new URL('../assets/powers/jump.webp', import.meta.url).href,
  extraWall: new URL('../assets/powers/extra-wall.webp', import.meta.url).href,
});

export function powerIcon(type, { x = 0, y = 0, size = 24 } = {}) {
  if (!Object.hasOwn(POWER_MEDALS, type)) throw new Error('Símbolo de poder desconocido.');
  const href = POWER_MEDALS[type].replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<svg class="power-icon" data-icon="${type}" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><image href="${href}" width="24" height="24" /></svg>`;
}

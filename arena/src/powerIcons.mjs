/** Símbolos originales dibujados como trazados, compartidos por tablero, inventario y guía. */
export const POWER_DRAWINGS=Object.freeze({
  demolition:'<path d="M3 4h8L8 9l4 3-5 3 2 5H3zM15 4h6v16h-9l3-5-3-3 5-3z"/><path d="M3 10h4m-4 5h3m11-5h4m-6 5h6"/>',
  jump:'<path d="M11 3h3v18h-3z"/><path d="M2 16C5 4 17 4 22 12m-5-1 5 1-1-5"/>',
  extraWall:'<path d="M2 5h7v15H2zM2 12h7M16 5h6v15h-6zM16 12h6"/><path d="M12 2v6m-3-3h6"/>',
});
export function powerIcon(type,{x=0,y=0,size=24}={}){
  if(!Object.hasOwn(POWER_DRAWINGS,type))throw new Error('Símbolo de poder desconocido.');
  return `<svg class="power-icon" data-icon="${type}" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${POWER_DRAWINGS[type]}</svg>`;
}

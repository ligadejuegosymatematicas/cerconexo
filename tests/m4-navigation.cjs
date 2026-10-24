// M4 cambia explícitamente el destino al cancelar configuración. Los ensayos
// históricos continúan sus pruebas de juego después de comprobar la portada.
async function resumeMode(page,mode){
 await page.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
 await page.locator(`[data-mode=${mode}] [data-continue]`).click();
 await page.locator(mode==='classic'?'#board':'#arenaBoard').waitFor({state:'visible'});
}
exports.resumeClassic=p=>resumeMode(p,'classic');
exports.resumeArena=p=>resumeMode(p,'arena');
exports.escape=async page=>{
 const configuration=await page.locator('#newDialog').isVisible();
 await page.keyboard.press('Escape');
 if(configuration)await page.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
};

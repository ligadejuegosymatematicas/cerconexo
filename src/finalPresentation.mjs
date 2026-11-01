// Presentation only. The official game or room supplies the winners.
export const FINAL_COLORS=Object.freeze({A:'#F59E0B',B:'#38BDF8',C:'#B79AFF',D:'#59D6A4',neutral:'#E9E3D4'});
export function finalAppearance({finished=false,winners=[],viewerTeam=null,shared=false}={}){
  if(!finished)return null;
  const winner=winners.length===1&&Object.hasOwn(FINAL_COLORS,winners[0])?winners[0]:null;
  return {winner,color:FINAL_COLORS[winner??'neutral'],role:!winner?'draw':shared?'shared':viewerTeam===winner?'winner':viewerTeam?'loser':'shared'};
}
const FINAL_STYLE=`
.final-outcome{--final-color:#E9E3D4;border-color:var(--final-color)!important}
.final-outcome [data-final-title]{color:var(--final-color)!important}
@media(prefers-reduced-motion:reduce){.final-outcome [data-final-title]{animation:none!important;transition:none!important}}
`;
export function createFinalPresenter({element,title,haptics,document:doc=globalThis.document,
  reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')??{matches:false}}){
  if(doc&&!doc.getElementById('cerconexo-final-style')){
    const style=doc.createElement('style');style.id='cerconexo-final-style';style.textContent=FINAL_STYLE;doc.head.append(style);
  }
  let appearance=null,played=false,effect=null;
  const cancel=()=>{effect?.cancel();effect=null;};
  const changed=()=>{if(reduced.matches)cancel();};reduced.addEventListener?.('change',changed);
  return {
    render(result){
      appearance=finalAppearance(result);element.classList.toggle('final-outcome',!!appearance);
      if(!appearance){played=false;cancel();delete element.dataset.finalRole;delete element.dataset.finalWinner;title.removeAttribute('data-final-title');return;}
      element.dataset.finalRole=appearance.role;element.dataset.finalWinner=appearance.winner??'draw';
      element.style.setProperty('--final-color',appearance.color);title.setAttribute('data-final-title','');
    },
    celebrate(){
      if(played||!appearance)return false;played=true;
      if(reduced.matches||doc?.hidden||!['winner','shared'].includes(appearance.role)||!title.getClientRects().length)return false;
      // A brief glow never blocks input or changes the board's position or size.
      effect=title.animate?.([{textShadow:'0 0 0 transparent'},{textShadow:`0 0 16px ${appearance.color}`,offset:.45},{textShadow:'0 0 0 transparent'}],{duration:600,easing:'ease-out'});
      if(appearance.role==='winner')haptics?.pulse('secured');return true;
    },
    destroy(){cancel();reduced.removeEventListener?.('change',changed);}
  };
}

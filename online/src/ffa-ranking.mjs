// Same competition ranking for the two online four-team variants.
export function rankFfa(teams, score, eliminations) {
  const eliminated = new Set(eliminations.map(entry => entry.team));
  const survivors = teams.filter(team => !eliminated.has(team)).sort((a,b) => score[b]-score[a]);
  const ranking = survivors.map(team => ({team,
    rank:survivors.findIndex(other => score[other] === score[team])+1, score:score[team], eliminated:false}));
  for (const entry of [...eliminations].reverse()) ranking.push({team:entry.team, rank:ranking.length+1,
    score:score[entry.team], eliminated:true, eliminatedAt:entry.at, scoreAtElimination:entry.score});
  return ranking;
}

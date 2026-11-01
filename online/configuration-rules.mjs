// Creation policy only. Persisted boards keep their official rules unchanged.
export const RETIRED_MESSAGE='El 2 vs. 2 ahora es por ficha. Crea otra sala para jugar.';
export function retiredClassicConfiguration(config) {
  return config.mode==='classic' && config.ruleset!=='m6.1-connection-probe-v1'
    && (config.playerCount??config.seats?.length??4)===4 && config.policy==='team';
}

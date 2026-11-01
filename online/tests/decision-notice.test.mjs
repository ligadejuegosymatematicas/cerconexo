import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionNotice, decisionNoticeKey } from '../decision-notice.mjs';
const active = () => ({ code: 'ABCDEFGH23', matchId: 'ABCDEFGH23:1', decisionId: '1:1', status: 'active', canDecide: true,
  self: { id: 'ana', seat: 'A1' }, decision: { kind: 'classic', team: 'A', actor: 'A1', eligible: ['ana'] } });
test('M6.2.1: aviso solo a quien debe decidir, una vez por decisión aun tras recarga/reconexión', () => {
  const records = new Map(), storage = { getItem: k => records.get(k), setItem: (k, v) => records.set(k, v) }, shown = [], pulses = [];
  const create = () => createDecisionNotice({ storage, visible: () => true, show: text => shown.push(text), pulse: kind => pulses.push(kind) });
  const notice = create(), state = active(); assert.equal(notice.update(state), true); assert.equal(notice.update(structuredClone(state)), false);
  assert.equal(create().update(state), false); assert.deepEqual(shown, ['¡Tu turno, A1!']); assert.equal(pulses.length, 1);
  assert.equal(decisionNoticeKey({ ...state, canDecide: false }), null);
  assert.equal(notice.update({ ...state, self: { id: 'otro', seat: 'B1' } }), false);
  assert.equal(notice.update({ ...state, decisionId: '1:2' }), true);
});
test('M6.2.1: descarte y nueva partida tienen aviso propio; segundo plano espera al regreso', () => {
  let visible = false; const shown = [], notice = createDecisionNotice({ storage: null, visible: () => visible, show: text => shown.push(text) });
  const state = active(); assert.equal(notice.update(state), false); visible = true; assert.equal(notice.update(state), true);
  assert.equal(notice.update({ ...state, decisionId: '1:2', decision: { ...state.decision, kind: 'discard-inventory' } }), true);
  assert.match(shown[1], /descarte/);
  assert.equal(notice.update({ ...state, matchId: 'ABCDEFGH23:2' }), true);
  assert.equal(notice.update({ ...state, decisionId: '1:4' }, false), false);
});

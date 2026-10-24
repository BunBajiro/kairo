import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationPlanForDraft} from '../../components/kairo/universe-navigation-state.mjs';

const systems = [{system_id: 1, name: 'Origin'}, {system_id: 2, name: 'Old destination'}, {system_id: 3, name: 'New destination'}];
const itinerary = {revision: 4, kind: 'gate', originId: 1, stops: [{id: 'old', systemId: 2}], progress: {completedStopIds: []}};
const plan = {status: 'ok', revision: 4, systemIds: [1, 2], segments: [{stopId: 'old', fromSystemId: 1, toSystemId: 2}]};

test('reopening a route dock cannot restore a saved route over a new destination or origin', () => {
  for (const to of ['New destination', 'Old destination', '2']) assert.equal(navigationPlanForDraft(plan, itinerary, {from: 'Origin', to}, systems), null);
  for (const from of ['New destination', 'unknown']) assert.equal(navigationPlanForDraft(plan, itinerary, {from, to: ''}, systems), null);
  assert.equal(navigationPlanForDraft(plan, itinerary, {from: ' ORIGIN ', to: ''}, systems), plan);
  assert.equal(navigationPlanForDraft(plan, itinerary, {from: '', to: ''}, systems), plan);
});

test('saved plan must match current revision, ordered remaining stops and navigation kind', () => {
  const draft = {from: '1', to: ''};
  assert.equal(navigationPlanForDraft(plan, {...itinerary, revision: 5}, draft, systems), null);
  assert.equal(navigationPlanForDraft(plan, itinerary, draft, systems, 'jump'), null);
  assert.equal(navigationPlanForDraft({...plan, segments: [{stopId: 'different', toSystemId: 2}]}, itinerary, draft, systems), null);
  assert.equal(navigationPlanForDraft({...plan, systemIds: [1, 3]}, itinerary, draft, systems), null);
  assert.equal(navigationPlanForDraft({...plan, systemIds: [3, 2]}, itinerary, draft, systems), null);
  assert.equal(navigationPlanForDraft(plan, itinerary, draft, systems, 'range'), plan);
});

test('completed stops and explicit following preserve a valid remaining itinerary without accepting new draft text', () => {
  const remaining = {...itinerary, stops: [...itinerary.stops, {id: 'next', systemId: 3}], progress: {completedStopIds: ['old']}};
  const remainingPlan = {...plan, systemIds: [2, 3], segments: [{stopId: 'next', fromSystemId: 2, toSystemId: 3}]};
  assert.equal(navigationPlanForDraft(remainingPlan, remaining, {from: 'Origin', to: ''}, systems), remainingPlan);
  const followed = {...remaining, followLocation: true}, followedPlan = {...remainingPlan, systemIds: [1, 3]};
  assert.equal(navigationPlanForDraft(followedPlan, followed, {from: 'Origin', to: ''}, systems), followedPlan);
  assert.equal(navigationPlanForDraft(followedPlan, followed, {from: 'New destination', to: ''}, systems), null);
});

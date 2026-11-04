import test from 'node:test';
import assert from 'node:assert/strict';
import { stepNotificationLeadDays } from '../src/notificationSettingsDraft.ts';
test('day steps preserve the full supported range',()=>{
  assert.equal(stepNotificationLeadDays('2',1),'3');assert.equal(stepNotificationLeadDays('2',-1),'1');
  assert.equal(stepNotificationLeadDays('0',-1),null);assert.equal(stepNotificationLeadDays('14',1),null);
  assert.equal(stepNotificationLeadDays('0',1),'1');assert.equal(stepNotificationLeadDays('14',-1),'13');
});
test('invalid or unfinished drafts are not silently replaced',()=>{
  for(const text of ['', ' ', '2.5', 'invalid', '-1', '15']) assert.equal(stepNotificationLeadDays(text,1),null);
});

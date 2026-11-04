import assert from 'node:assert/strict';import test from 'node:test';
import {mergeNotificationSettingsDraft,notificationSettingsDraftChanged,notificationSettingsRemoteFields} from '../src/notificationSettingsDraft.ts';
const saved={in_app_enabled:true,push_enabled:true,lead_days:2,timezone:'Asia/Seoul',quiet_hours_start:null,quiet_hours_end:null,push_mode:'daily_summary',daily_summary_time:'18:00'};
test('changing the summary time or push style marks the draft as unsaved',()=>{
  assert.equal(notificationSettingsDraftChanged(saved,{...saved},'2'),false);
  assert.equal(notificationSettingsDraftChanged(saved,{...saved,daily_summary_time:'07:30'},'2'),true);
  assert.equal(notificationSettingsDraftChanged(saved,{...saved,push_mode:'each_item'},'2'),true);
});
test('a peer change to the summary time is reported and follows the server when untouched',()=>{
  const incoming={...saved,daily_summary_time:'09:00'};
  assert.deepEqual(notificationSettingsRemoteFields(saved,incoming),['daily_summary_time']);
  assert.equal(mergeNotificationSettingsDraft(saved,{...saved},'2',incoming).preferences.daily_summary_time,'09:00');
});
test('a local summary time edit survives a peer push style change',()=>{
  const next=mergeNotificationSettingsDraft(saved,{...saved,daily_summary_time:'07:30'},'2',{...saved,push_mode:'each_item'});
  assert.equal(next.preferences.daily_summary_time,'07:30');
  assert.equal(next.preferences.push_mode,'each_item');
});
test('older API responses without the summary fields are not treated as edits',()=>{
  const legacy={in_app_enabled:true,push_enabled:false,lead_days:2,timezone:'Asia/Seoul',quiet_hours_start:null,quiet_hours_end:null};
  assert.equal(notificationSettingsDraftChanged(legacy,{...legacy},'2'),false);
  assert.deepEqual(notificationSettingsRemoteFields(legacy,{...legacy}),[]);
});

import assert from 'node:assert/strict';import test from 'node:test';
import {notificationSettingsDraftChanged} from '../src/notificationSettingsDraft.ts';
const saved={in_app_enabled:true,push_enabled:false,lead_days:2,timezone:'Asia/Seoul',quiet_hours_start:null,quiet_hours_end:null};
test('unread local defaults are not treated as saved settings or changes',()=>assert.equal(notificationSettingsDraftChanged(null,saved,'2'),false));
test('confirmed unchanged settings do not need another save',()=>assert.equal(notificationSettingsDraftChanged(saved,{...saved},'2'),false));
test('an edited lead period is tracked separately from the saved value',()=>assert.equal(notificationSettingsDraftChanged(saved,saved,'8'),true));
test('an empty period remains an unsaved edit even when saved period was zero',()=>assert.equal(notificationSettingsDraftChanged({...saved,lead_days:0},{...saved,lead_days:0},''),true));
test('quiet time and notification switches produce a changed draft',()=>assert.equal(notificationSettingsDraftChanged(saved,{...saved,in_app_enabled:false},'2'),true));

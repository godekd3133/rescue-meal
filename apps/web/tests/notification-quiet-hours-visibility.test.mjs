import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationQuietHoursVisible } from '../src/notificationSettingsDraft.ts';
const empty={quiet_hours_start:null,quiet_hours_end:null};
test('unavailable push with no saved hours omits inactive fields',()=>assert.equal(notificationQuietHoursVisible(false,empty,empty),false));
test('available push keeps quiet-hour editing available',()=>assert.equal(notificationQuietHoursVisible(true,empty,empty),true));
test('saved hours remain editable even when push is unavailable or draft is cleared',()=>assert.equal(notificationQuietHoursVisible(false,{quiet_hours_start:'22:00',quiet_hours_end:'07:00'},empty),true));
test('an incomplete local time draft remains visible until corrected',()=>assert.equal(notificationQuietHoursVisible(false,empty,{quiet_hours_start:'22:00',quiet_hours_end:null}),true));

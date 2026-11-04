import assert from 'node:assert/strict';import test from 'node:test';
import {readNotificationSettings} from '../src/notificationSettingsRead.ts';
const prefs={lead_days:8};
test('optional device failure preserves confirmed basic preferences without inventing empty devices',async()=>{const result=await readNotificationSettings(Promise.resolve(prefs),Promise.reject(Error('device failure')),Promise.resolve([]));assert.equal(result.preferences,prefs);assert.equal(result.subscriptions,null);assert.deepEqual(result.workerHeartbeats,[]);});
test('optional delivery failure preserves basic preferences and known device data',async()=>{const devices=[{endpoint_fingerprint:'device'}];const result=await readNotificationSettings(Promise.resolve(prefs),Promise.resolve(devices),Promise.reject(Error('worker failure')));assert.equal(result.preferences,prefs);assert.equal(result.subscriptions,devices);assert.equal(result.workerHeartbeats,null);});
test('basic preferences failure stays blocking even if optional reads succeed',async()=>{await assert.rejects(readNotificationSettings(Promise.reject(Error('pref failure')),Promise.resolve([]),Promise.resolve([])),/pref failure/);});
test('missing basic payload is not treated as local defaults',async()=>{await assert.rejects(readNotificationSettings(Promise.resolve(null),Promise.resolve([]),Promise.resolve([])),/preferences-empty/);});

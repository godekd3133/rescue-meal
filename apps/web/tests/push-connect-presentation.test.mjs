import assert from 'node:assert/strict';import test from 'node:test';
import {pushConnectAvailability,showPushConnectionControls} from '../src/pushConnectPresentation.ts';
test('unsupported browser does not offer a connection action',()=>assert.deepEqual(pushConnectAvailability(false,'configured'),{available:false,message:'이 브라우저에서는 기기 알림을 사용할 수 없어요.'}));
test('missing service configuration is distinct from unsupported browser',()=>assert.deepEqual(pushConnectAvailability(true,''),{available:false,message:'기기 알림은 현재 연결할 수 없어요.'}));
test('blank configuration is unavailable',()=>assert.equal(pushConnectAvailability(true,'  ').available,false));
test('supported configured connection retains the action',()=>assert.deepEqual(pushConnectAvailability(true,'configured'),{available:true,message:''}));

test('unavailable empty device settings do not expose inoperative controls',()=>assert.equal(showPushConnectionControls(false,0,false),false));
test('an existing linked device remains manageable',()=>assert.equal(showPushConnectionControls(false,1,false),true));
test('an enabled saved preference can still be turned off',()=>assert.equal(showPushConnectionControls(false,0,true),true));

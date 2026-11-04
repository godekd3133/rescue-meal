import assert from 'node:assert/strict';import test from 'node:test';
import {notificationDeliveryBadge,showNotificationDeliveryHistory} from '../src/notificationDeliveryPresentation.ts';
test('no device and no history omit an unnecessary delivery summary',()=>assert.equal(showNotificationDeliveryHistory(false,0),false));
test('a linked device with no history shows a confirmed empty state',()=>{assert.equal(showNotificationDeliveryHistory(false,1),true);assert.equal(notificationDeliveryBadge(null),'전송 기록 없음');});
test('past processing does not claim current device delivery is enabled',()=>assert.equal(notificationDeliveryBadge({push_configured:true,last_error:null}),'최근 처리'));
test('missing server configuration is not labelled perpetual loading',()=>assert.equal(notificationDeliveryBadge({push_configured:false,last_error:null}),'설정이 필요해요'));
test('recorded delivery failure stays explicit',()=>assert.equal(notificationDeliveryBadge({push_configured:true,last_error:'failure'}),'문제가 있어요'));

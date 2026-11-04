import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const server=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom',logLevel:'error'});
const {default:DateEditor}=await server.ssrLoadModule('/src/DateAssertionEditor.tsx');
const {KeyboardProvider}=await server.ssrLoadModule('/src/mobile/Keyboard.tsx');
const {MobileDeviceProvider}=await server.ssrLoadModule('/src/mobile/Device.tsx');
test.after(async()=>{await server.close();});
function render(initialKind,originalKind){return renderToStaticMarkup(h(MobileDeviceProvider,null,h(KeyboardProvider,null,h(DateEditor,{initialKind,originalKind,initialValue:'2026-10-20',title:'내 알림일 수정',onCancel:()=>{},onConfirm:()=>{}}))));}
test('restoring a package-date draft still explains replacement of the saved reminder',()=>{
 const html=render('use_by','user_reminder');assert.ok(html.includes('포장지에서 확인한 날짜'));assert.ok(html.includes('내 알림일을 포장지 날짜로 바꿔 저장해요'));assert.ok(html.includes('date-editor-save-hint'));assert.equal(html.includes('다시 살펴볼 날짜'),false);
});
test('an unconfirmed food with a restored reminder draft retains first-save meaning guidance',()=>{
 const html=render('user_reminder',null);assert.ok(html.includes('포장지 표시와 구분해 내가 정한 날짜로 기록해요.'));assert.ok(html.includes('내가 정한 날짜로 저장돼요.'));
});

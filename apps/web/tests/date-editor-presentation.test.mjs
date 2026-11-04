import test from 'node:test';import assert from 'node:assert/strict';import {dateEditorPresentation} from '../src/dateEditorPresentation.ts';
const view=(kind,value='',initial=null)=>dateEditorPresentation(kind,value,'포장지에서 확인한 날짜','날짜 의미를 골라 주세요.',initial);
test('reminder asks for a personally chosen date instead of a package date',()=>{const p=view('user_reminder');assert.equal(p.title,'다시 살펴볼 날짜');assert.equal(p.saveHint,'');assert.match(p.description,/내가 정한 날짜/);});
test('reminder save identifies its meaning',()=>{const p=view('user_reminder','2026-10-20');assert.equal(p.saveLabel,'알림 날짜 저장');assert.equal(p.saveHint,'내가 정한 날짜로 저장돼요.');});
for(const kind of ['sell_by','use_by','best_before'])test(`${kind} remains a directly confirmed package date`,()=>{const p=view(kind,'2026-10-20');assert.equal(p.title,'포장지에서 확인한 날짜');assert.equal(p.saveLabel,'확인 후 저장');});
test('switching an existing reminder to a package date does not retain reminder heading',()=>assert.equal(dateEditorPresentation('use_by','2026-10-20','확인한 알림 날짜 수정','기존 알림 날짜와 의미를 다시 확인해요.','user_reminder').title,'포장지에서 확인한 날짜'));

test('incomplete fields do not repeat the labels as extra instructions',()=>{
 for(const [kind,value] of [[null,''],[null,'2026-10-20'],['use_by',''],['user_reminder','']]) {
  const p=view(kind,value);assert.equal(p.saveHint,'');assert.equal(p.saveLabel,'날짜 저장');
 }
});

test('editing an existing reminder does not repeat already selected date meaning',()=>{
 const p=view('user_reminder','2026-10-20','user_reminder');assert.equal(p.description,'');assert.equal(p.saveHint,'');assert.equal(p.saveLabel,'알림 날짜 저장');
});
test('switching a reminder to a package date explains the semantic replacement before saving',()=>{
 const p=view('use_by','2026-10-20','user_reminder');assert.match(p.saveHint,/내 알림일을 포장지 날짜로/);assert.match(p.saveHint,/날짜와 표시 이름/);
});

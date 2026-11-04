import test from 'node:test';import assert from 'node:assert/strict';import {dismissToastForNavigation,isRecoveryToastAction,toastFeedbackState} from '../src/toastNavigation.ts';
test('completed food follow-up is dismissed when opening another flow',()=>assert.equal(dismissToastForNavigation(null,'detail','날짜와 보관 방법 살펴보기'),true));
test('a completed split follow-up does not cover another editor',()=>assert.equal(dismissToastForNavigation(null,'add','나눈 식품 보기'),true));
for(const label of ['다시 시도','목록 새로고침','재고 앱 설정 보기'])test(`${label} remains available across navigation`,()=>assert.equal(dismissToastForNavigation(null,'account',label),false));
test('closing a saved editor does not clear its newly created completion notice',()=>assert.equal(dismissToastForNavigation('detail',null,'나눈 식품 보기'),false));
test('same sheet updates do not dismiss current feedback',()=>assert.equal(dismissToastForNavigation('detail','detail','식품 보기'),false));

for(const label of ['다시 시도','목록 새로고침','재고 앱 설정 보기'])test(`${label} is an attention state rather than completed-success feedback`,()=>assert.equal(isRecoveryToastAction(label),true));
test('normal food viewing remains a completed follow-up',()=>assert.equal(isRecoveryToastAction('나눈 식품 보기'),false));

test('explicit pending phase remains distinct from completed notice',()=>assert.equal(toastFeedbackState('pending'),'pending'));
test('confirmed phase is a normal notice',()=>assert.equal(toastFeedbackState('notice'),'notice'));
test('recovery action takes precedence over a prior pending phase',()=>assert.equal(toastFeedbackState('pending','다시 시도'),'recovery'));

import assert from 'node:assert/strict';
import test from 'node:test';
import {historyActorLabel} from '../src/historyActorLabel.ts';
test('administrator corrections remain distinguishable from account edits',()=>assert.equal(historyActorLabel('recipe_admin'),'관리자 기록'));
test('ordinary account edits retain their owner context',()=>assert.equal(historyActorLabel('user'),'계정 기록'));
test('guest edits retain their guest context',()=>assert.equal(historyActorLabel('guest'),'게스트 기록'));

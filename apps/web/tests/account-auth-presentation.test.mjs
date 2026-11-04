import assert from 'node:assert/strict';
import test from 'node:test';
import {accountAuthErrorAffectedByEdit,accountAuthErrorPresentation} from '../src/accountAuthPresentation.ts';
test('only login credential rejection highlights credential inputs',()=>assert.deepEqual(accountAuthErrorPresentation('login',401),{message:'이메일 또는 비밀번호를 확인해 주세요.',field:'credentials'}));
test('registration duplicate highlights email',()=>assert.equal(accountAuthErrorPresentation('register',409).field,'email'));
for(const mode of ['login','register'])for(const status of [null,429,500,503])test(`${mode} ${status}: service failures do not accuse an input field`,()=>{const p=accountAuthErrorPresentation(mode,status);assert.equal(p.field,null);assert.doesNotMatch(p.message,/비밀번호를 확인|이미 가입/);assert.match(p.message,/잠시 후/);});
test('validation failures do not guess a specific rejected field',()=>assert.equal(accountAuthErrorPresentation('register',422).field,null));
test('credential rejection becomes obsolete after either credential is edited',()=>{
 for(const field of ['email','password']) assert.equal(accountAuthErrorAffectedByEdit('credentials',field),true);
});
test('editing an unrelated field preserves its existing error and service errors remain visible',()=>{
 assert.equal(accountAuthErrorAffectedByEdit('email','password'),false);
 assert.equal(accountAuthErrorAffectedByEdit('password','email'),false);
 for(const field of ['email','password']) assert.equal(accountAuthErrorAffectedByEdit(null,field),false);
 assert.equal(accountAuthErrorAffectedByEdit('email','email'),true);
 assert.equal(accountAuthErrorAffectedByEdit('password','password'),true);
});

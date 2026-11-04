import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { accountAuthErrorAffectedByEdit } from "../src/accountAuthPresentation.ts";

const source=readFileSync(new URL('../src/AccountSheet.tsx',import.meta.url),'utf8');
const start=source.indexOf('  const changeAuthInput =');
const end=source.indexOf('  const submit =',start);
assert.ok(start>0 && end>start);
function setup(authErrorField,busy=false) {
 const state={error:'prior error',authErrorField};
 const values={authErrorField,busy,accountAuthErrorAffectedByEdit,setEmail:value=>{state.email=value;},setPassword:value=>{state.password=value;},setError:value=>{state.error=value;},setAuthErrorField:value=>{state.authErrorField=value;}};
 const change=new Function(...Object.keys(values),stripTypeScriptTypes(source.slice(start,end))+';return changeAuthInput;')(...Object.values(values));
 return {state,change};
}
test('editing the rejected credential updates the draft and clears obsolete highlighting',()=>{
 for(const field of ['email','password']) {
  const context=setup('credentials');context.change(field,' updated input ');
  assert.equal(context.state[field],' updated input ');
  assert.equal(context.state.error,'');assert.equal(context.state.authErrorField,null);
 }
});
test('unrelated edits and connection failures keep the relevant error',()=>{
 for(const errorField of ['email',null]) {
  const context=setup(errorField);context.change('password','replacement');
  assert.equal(context.state.error,'prior error');assert.equal(context.state.authErrorField,errorField);
 }
});
test('pending authentication cannot change the payload through input events',()=>{
 const context=setup('credentials',true);context.change('email','different');context.change('password','different');
 assert.deepEqual(context.state,{error:'prior error',authErrorField:'credentials'});
});

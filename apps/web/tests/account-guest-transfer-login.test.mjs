import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/AccountSheet.tsx',import.meta.url),'utf8');
const anchor=source.indexOf('const guestAccessToken = mealApi.guestToken;');
const start=source.lastIndexOf('  const submit = async () => {',anchor);
const end=source.indexOf('\n  const accountTabOrder',anchor);
function setup(mode,preview,{guest=true,reject=false}={}) {
 const calls=[],session={workspace_id:'account'};
 const values={mode,busy:false,email:'qa@example.invalid',password:'Local-QA-Only',keyboard:{hide(){}},mealApi:{isConfigured:true,guestToken:guest?'guest-original':null,loginAccount:async()=>{calls.push(['login']);return session;},registerAccount:async()=>{calls.push(['register']);return session;},previewGuestTransfer:async(s,t)=>{calls.push(['preview',s,t]);if(reject)throw Error('offline');return preview;}},onAccountSessionStarted:async()=>calls.push(['session-started']),guestTransferPreviewInFlightRef:{current:false},hasGuestTransferRecords:p=>p.food_count>0,onAuthenticated:async s=>calls.push(['authenticated',s]),storeGuestTransfer:(...a)=>calls.push(['stored',...a]),setPendingGuestTransfer:p=>calls.push(['pending',p])};
 for(const k of ['setError','setAuthErrorField','setBusy','setAuthMe'])values[k]=()=>{};
 const fn=new Function(...Object.keys(values),stripTypeScriptTypes(source.slice(start,end))+';return submit;')(...Object.values(values));
 return {fn,calls,session};
}
for(const mode of ['login','register']) {
 test(`${mode}: original guest record is previewed before account workspace opens`,async()=>{const c=setup(mode,{status:'ready',food_count:1,message:'ready'});await c.fn();assert.equal(c.calls.find(x=>x[0]==='preview')[2],'guest-original');assert.ok(c.calls.findIndex(x=>x[0]==='session-started')<c.calls.findIndex(x=>x[0]==='preview'));assert.ok(c.calls.some(x=>x[0]==='pending'));assert.ok(!c.calls.some(x=>x[0]==='authenticated'));});
 test(`${mode}: guest read failure retains a recoverable transfer choice`,async()=>{const c=setup(mode,null,{reject:true});await c.fn();assert.equal(c.calls.find(x=>x[0]==='pending')[1].preview,null);assert.ok(!c.calls.some(x=>x[0]==='authenticated'));});
 test(`${mode}: an empty guest opens the account directly`,async()=>{const c=setup(mode,{status:'empty',food_count:0});await c.fn();assert.ok(c.calls.some(x=>x[0]==='authenticated'));assert.ok(!c.calls.some(x=>x[0]==='pending'));});
}
test('login: existing account records require conflict review instead of a merge',async()=>{const c=setup('login',{status:'conflict',food_count:1,message:'conflict'});await c.fn();assert.equal(c.calls.find(x=>x[0]==='pending')[1].preview.status,'conflict');assert.ok(!c.calls.some(x=>x[0]==='authenticated'));});
test('login: absence of a guest session skips transfer',async()=>{const c=setup('login',null,{guest:false});await c.fn();assert.ok(!c.calls.some(x=>x[0]==='preview'));assert.ok(c.calls.some(x=>x[0]==='authenticated'));});

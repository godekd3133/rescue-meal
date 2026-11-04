import test from 'node:test';
import assert from 'node:assert/strict';
import {accountRevisionStatus} from '../src/accountRevision.ts';
test('initial account probe adopts the version without warning',()=>assert.deepEqual(accountRevisionStatus(null,4,null),{revision:4,needsRefresh:false}));
test('own successful save during a probe does not look like a remote change',()=>assert.deepEqual(accountRevisionStatus(4,5,5),{revision:5,needsRefresh:false}));
test('late older probe cannot regress an acknowledged own mutation',()=>assert.deepEqual(accountRevisionStatus(4,4,5),{revision:5,needsRefresh:false}));
test('a revision newer than the own save still requires account refresh',()=>assert.deepEqual(accountRevisionStatus(4,6,5),{revision:6,needsRefresh:true}));
test('a read observation alone is not treated as an own mutation',()=>assert.deepEqual(accountRevisionStatus(4,5,null),{revision:5,needsRefresh:true}));

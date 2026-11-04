import assert from 'node:assert/strict';
import test from 'node:test';
import {isCompleteLabelDate} from '../src/labelDateValidation.ts';
for(const value of ['2026.10.14','2024.02.29','2000.02.29','0001.01.01','9999.12.31'])test(`real calendar date ${value} is accepted`,()=>assert.equal(isCompleteLabelDate(value),true));
for(const value of ['2026.02.29','2026.02.31','1900.02.29','2026.04.31','2026.13.01','2026.00.01','2026.01.00','0000.01.01','2026.1.1','2026-10-14','','2026.10.'])test(`unconfirmed or impossible date ${value} cannot be saved`,()=>assert.equal(isCompleteLabelDate(value),false));

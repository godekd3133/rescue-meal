import test from 'node:test';import assert from 'node:assert/strict';
import {mealHistoryMetadata} from '../src/mealHistoryPresentation.ts';
const now=new Date(2026,9,11,10);
const saved=new Date(2026,9,11,9,30).toISOString();
test('saved meals state the stored serving count and local day/time',()=>assert.deepEqual(mealHistoryMetadata({saved_at:saved,servings:2},now),['저장됨','2인분','오늘 09:30']));
test('completed meals use completion time and retain the stored serving count',()=>assert.deepEqual(mealHistoryMetadata({saved_at:saved,completed_at:new Date(2026,9,11,9,45).toISOString(),servings:4},now),['조리 완료','4인분','오늘 09:45']));
test('old records include their year rather than appearing to belong to this year',()=>assert.deepEqual(mealHistoryMetadata({saved_at:new Date(2025,9,11,9,30).toISOString(),servings:1},now),['저장됨','1인분','2025년 10월 11일 09:30']));
test('missing or invalid record metadata is not replaced with invented servings or times',()=>assert.deepEqual(mealHistoryMetadata({saved_at:'invalid'},now),['저장됨','인원 미확인','기록 시각 미확인']));

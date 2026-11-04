import React from 'react';
import { createRoot } from 'react-dom/client';
import FoodHistory from '../../src/FoodHistory';
import { mealApi, type ApiStorageEvent } from '../../src/mealApi';
import { MobileDeviceProvider } from '../../src/mobile/Device';
import { KeyboardProvider } from '../../src/mobile/Keyboard';
import '../../src/prototype.css';
const events: ApiStorageEvent[] = Array.from({ length: 7 }, (_, index) => ({
  id: `history-qa-${index}`, food_id: 'history-qa-food', event_type: 'consumed',
  quantity: index === 6 ? null : index === 5 ? 0.0000004 : (index + 1) / 10, occurred_at: `2026-10-11T0${index}:00:00Z`,
  from_storage_type: null, to_storage_type: null,
} as ApiStorageEvent));
mealApi.getStorageEvents = async () => events;
createRoot(document.getElementById('root')!).render(<MobileDeviceProvider><KeyboardProvider>
  <p style={{ textAlign: 'center' }}>검증 전용 예시 기록 — 실제 식품 기록을 바꾸지 않습니다</p>
  <div className="bottom-sheet" style={{ position:'relative', width:393, margin:'20px auto', borderRadius:16 }}>
    <div className="sheet-content" style={{ maxHeight:420, overflow:'auto' }}><FoodHistory foodId="history-qa-food" unit="팩" /></div>
  </div>
</KeyboardProvider></MobileDeviceProvider>);

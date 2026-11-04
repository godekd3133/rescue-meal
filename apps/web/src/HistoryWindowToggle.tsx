import { useLayoutEffect, useRef } from 'react';
import { useKeyboard } from './mobile/Keyboard';
import { scrollTargetWithinNearestContainer } from './appScroll';

export default function HistoryWindowToggle({ remaining, expanded, onToggle }: { remaining: number; expanded: boolean; onToggle: () => void }) {
  const keyboard = useKeyboard();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<{ container: HTMLElement; top: number } | null>(null);
  useLayoutEffect(() => {
    const restore = restoreRef.current;
    restoreRef.current = null;
    if (!restore?.container.isConnected) return;
    if (expanded) restore.container.scrollTop = restore.top;
    else if (buttonRef.current) scrollTargetWithinNearestContainer(buttonRef.current, 'nearest', 'auto');
  }, [expanded]);
  if (!remaining) return null;
  return <button ref={buttonRef} className="secondary-sheet-button history-window-toggle" type="button" aria-expanded={expanded} onClick={() => {
    keyboard.hide();
    const container = buttonRef.current?.closest<HTMLElement>('.sheet-content');
    if (container) restoreRef.current = { container, top: container.scrollTop };
    onToggle();
  }}>{expanded ? '최근 기록만 보기' : `기록 ${remaining}개 더 보기`}</button>;
}

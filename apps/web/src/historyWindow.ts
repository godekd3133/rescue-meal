import { useState } from 'react';

export function useHistoryWindow<T>(events: T[], owner: string) {
  const [choice, setChoice] = useState({ owner, expanded: false });
  const expanded = choice.owner === owner && choice.expanded;
  const remaining = Math.max(0, events.length - 4);
  return {
    events: expanded ? events : events.slice(0, 4),
    expanded,
    remaining,
    toggle: () => setChoice({ owner, expanded: !expanded }),
  };
}

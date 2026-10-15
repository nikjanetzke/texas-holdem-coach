import { useEffect, useState } from 'react';

// Same screens as the "side" CSS variant in index.css: wide enough to lay
// things out side by side (laptops/desktops, and phones held sideways). For the
// few places where the layout needs to move an element, not just restyle it.
export const SIDE_QUERY = '(min-width: 1024px) and (orientation: landscape), (max-height: 640px) and (orientation: landscape)';

export function useSideLayout(): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(SIDE_QUERY).matches;
  const [side, setSide] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(SIDE_QUERY);
    if (!mq) return;
    const onChange = () => setSide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return side;
}

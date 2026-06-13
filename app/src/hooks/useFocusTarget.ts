import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';

// Deep-link helper for list screens reached from the Activity tab. The incoming
// `focus` param is an item id; each item reports its y via onItemLayout, and we
// scroll to it once laid out (retrying briefly since layout is async). Works for
// a freshly mounted tab and for one already mounted (positions are remembered).
export function useFocusTarget() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});

  const onItemLayout = useCallback(
    (id: string) => (e: LayoutChangeEvent) => {
      positions.current[id] = e.nativeEvent.layout.y;
    },
    [],
  );

  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const y = positions.current[focus];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true });
      } else if (tries++ < 12) {
        timer = setTimeout(tick, 60);
      }
    };
    timer = setTimeout(tick, 60);
    return () => clearTimeout(timer);
  }, [focus]);

  return { focus, scrollRef, onItemLayout };
}

// A brief amber highlight: true while `active`, auto-clearing after `ms`. Used to
// flash the item an Activity-tab link jumped to.
export function useGlow(active: boolean, ms = 2800) {
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    setGlow(true);
    const t = setTimeout(() => setGlow(false), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return glow;
}

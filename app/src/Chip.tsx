import { Pressable, Text } from 'react-native';

import { chips } from './theme';

interface Props {
  label: string;
  on: boolean;
  onPress: () => void;
  variant?: 'filter' | 'sort';
}

export function Chip({ label, on, onPress, variant = 'filter' }: Props) {
  const onStyle = variant === 'sort' ? chips.sortOn : chips.chipOn;
  const onText = variant === 'sort' ? chips.sortOnText : chips.chipOnText;
  return (
    <Pressable style={on ? onStyle : chips.chip} onPress={onPress} accessibilityState={{ selected: on }}>
      <Text style={on ? onText : chips.chipText}>{label}</Text>
    </Pressable>
  );
}

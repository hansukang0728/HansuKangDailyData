import { StyleSheet } from 'react-native';

export const C = {
  ground: '#F5F3EE',
  surface: '#FFFFFF',
  ink: '#1C1B19',
  body: '#3A3833',
  muted: '#5E5B55',
  line: '#E4E0D8',
  lineStrong: '#D6D1C7',
  accent: '#0E6560',
  accentDark: '#0A4A46',
  accentSoft: '#E3F0EE',
  rent: '#8A3E05',
  error: '#A1321F',
  ownerBg: '#EEE8F8',
  ownerText: '#4B2D86',
  noteBg: '#FFF8E6',
  noteLine: '#EAD9A8',
  noteText: '#7A5A0A',
};

export const chips = StyleSheet.create({
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, justifyContent: 'center' },
  chipText: { fontSize: 13, color: C.body },
  chipOn: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.accent, backgroundColor: C.accentSoft, justifyContent: 'center' },
  chipOnText: { fontSize: 13, color: C.accentDark, fontWeight: '600' },
  sortOn: { height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: C.ink, justifyContent: 'center' },
  sortOnText: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
});

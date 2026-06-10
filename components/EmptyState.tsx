import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function EmptyState({ icon, title, message }: { icon: keyof typeof Ionicons.glyphMap, title: string, message: string }) {
  return (
    <View style={S.container}>
      <View style={S.iconBox}>
        <Ionicons name={icon} size={36} color="#9A9390" />
      </View>
      <Text style={S.title}>{title}</Text>
      <Text style={S.message}>{message}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginVertical: 16,
    shadowColor: '#1B1716', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  iconBox: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#F5F3EC',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: {
    fontFamily: 'Outfit_800ExtraBold', fontSize: 18, color: '#1B1716', marginBottom: 8,
  },
  message: {
    fontFamily: 'Outfit_500Medium', fontSize: 14, color: '#6A615C', textAlign: 'center', lineHeight: 20,
  }
});

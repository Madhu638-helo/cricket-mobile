import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticateBiometric, getBiometricLabel } from '../utils/biometric';

const C = {
  bg:          '#EDEBDE',
  surface:     '#FFFFFF',
  border:      'rgba(129,1,0,0.1)',
  text:        '#1B1716',
  textMuted:   '#9A9390',
  red:         '#810100',
  white:       '#FFFFFF',
};

interface Props {
  onSuccess: () => void;
  onFallback: () => void;
}

export default function BiometricLockScreen({ onSuccess, onFallback }: Props) {
  const [label, setLabel] = useState('Face ID');
  const [failed, setFailed] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  useEffect(() => {
    getBiometricLabel().then(l => {
      setLabel(l);
      // Auto-prompt immediately so user doesn't have to tap
      setTimeout(() => triggerAuth(), 300);
    });
  }, []);

  const triggerAuth = async () => {
    setFailed(false);
    setAuthenticating(true);
    try {
      const { success } = await authenticateBiometric();
      if (success) {
        onSuccess();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setAuthenticating(false);
    }
  };

  const isFaceId = label === 'Face ID' || label === 'Face Unlock';
  const icon = isFaceId ? 'scan' : label === 'Iris Scan' ? 'eye-outline' : 'finger-print';

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={s.logoRing}>
        <View style={s.logoBox}>
          <Text style={s.logoText}>🏏</Text>
        </View>
      </View>

      <Text style={s.brand}>CRICPRO</Text>
      <Text style={s.tagline}>Score. Watch. Celebrate.</Text>

      <View style={s.iconWrap}>
        {authenticating
          ? <ActivityIndicator size="large" color={C.red} />
          : <Ionicons name={icon} size={64} color={failed ? C.textMuted : C.red} />
        }
      </View>

      <Text style={s.hint}>
        {authenticating ? `Scanning…` : failed ? `Not recognised — try again` : `Tap to unlock`}
      </Text>

      {/* Main unlock button */}
      <TouchableOpacity
        style={[s.unlockBtn, authenticating && { opacity: 0.5 }]}
        onPress={triggerAuth}
        disabled={authenticating}
        activeOpacity={0.85}
      >
        <Ionicons name={icon} size={18} color={C.white} />
        <Text style={s.unlockText}>{failed ? 'Try Again' : `Unlock with ${label}`}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.fallback} onPress={onFallback} activeOpacity={0.7}>
        <Text style={s.fallbackText}>Use Password Instead</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  logoRing: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 1.5, borderColor: 'rgba(129,1,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: C.red, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  logoBox: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: {
    fontSize: 28, marginLeft: 2,
  },
  brand: {
    fontFamily: 'Outfit_900Black',
    fontSize: 28, color: C.text, letterSpacing: 3, marginBottom: 4,
  },
  tagline: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14, color: C.red, letterSpacing: 0.5, marginBottom: 56,
  },
  iconWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  hint: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15, color: C.textMuted, textAlign: 'center', marginBottom: 32,
  },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.red,
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 12, marginBottom: 16,
    shadowColor: C.red, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
  },
  unlockText: { fontFamily: 'Outfit_800ExtraBold', fontSize: 16, color: C.white },
  fallback: { paddingVertical: 10, paddingHorizontal: 16 },
  fallbackText: {
    fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: C.textMuted,
    textDecorationLine: 'underline',
  },
});

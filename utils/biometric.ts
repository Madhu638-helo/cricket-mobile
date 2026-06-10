import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const BIOMETRIC_ENABLED_KEY = 'cricket_biometric_enabled';
const BIOMETRIC_SETUP_SHOWN_KEY = 'cricket_biometric_setup_shown';

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === '1';
  } catch { return false; }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, '1');
  } else {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const [compatible, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return compatible && enrolled;
}

export async function getBiometricLabel(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  if (Platform.OS === 'ios') {
    return hasFace ? 'Face ID' : 'Touch ID';
  }
  // Android
  if (hasFace) return 'Face Unlock';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'Iris Scan';
  return 'Fingerprint';
}

export async function authenticateBiometric(): Promise<{ success: boolean; error?: string }> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock CricPro',
    disableDeviceFallback: false,
  });
  return { success: result.success, error: (result as any).error };
}

export async function wasBiometricSetupShown(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_SETUP_SHOWN_KEY)) === '1';
  } catch { return false; }
}

export async function markBiometricSetupShown(): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_SETUP_SHOWN_KEY, '1');
}

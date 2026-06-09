import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useFonts, Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit';
import { ActivityIndicator, View } from 'react-native';
import LoadingScreen from '../components/LoadingScreen';

function RootNavigator() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="join" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="match/[code]/index" options={{ headerShown: false }} />
      <Stack.Screen name="match/[code]/lobby" options={{ headerShown: false }} />
      <Stack.Screen name="match/[code]/toss" options={{ headerShown: false }} />
      <Stack.Screen name="match/[code]/result" options={{ headerShown: false }} />
      <Stack.Screen name="match/[code]/next" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black });


  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDEBDE' } });

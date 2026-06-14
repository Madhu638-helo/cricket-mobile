import 'dotenv/config';

export default {
  expo: {
    name: 'CricPro',
    slug: 'cricket-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.turf.cricket',
      buildNumber: '10',
      config: {
        usesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: { backgroundColor: '#810100', foregroundImage: './assets/icon.png' },
      package: 'com.turf.cricket',
    },
    splash: {
      image: './assets/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#810100',
    },
    web: { favicon: './assets/favicon.png' },
    plugins: ['expo-router'],
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://udffcsnfpncxgkeaabvu.supabase.co',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ZMALTKLa4ih-p5rw6v78iA_Y8bwkG-u',
      eas: {
        projectId: '47e824b8-0754-4147-bec2-71cb9a2c0a4a',
      },
    },
    scheme: 'cricket',
  },
};

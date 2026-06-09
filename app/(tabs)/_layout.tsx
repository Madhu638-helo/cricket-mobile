import { Tabs } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';

const TABS = [
  { name: 'index', title: 'Home', emoji: '🏠' },
  { name: 'leaderboard', title: 'Rankings', emoji: '🏆' },
  { name: 'profile', title: 'Profile', emoji: '👤' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: 'rgba(99,1,2,0.08)',
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
          shadowColor: '#1B1716',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 8,
        },
        tabBarActiveTintColor: '#810100',
        tabBarInactiveTintColor: '#9A9390',
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'Outfit_700Bold', letterSpacing: 0.3 },
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <View style={[T.iconWrap, focused && T.iconWrapActive]}>
                <Text style={[T.emoji, { opacity: focused ? 1 : 0.5 }]}>{tab.emoji}</Text>
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const T = StyleSheet.create({
  iconWrap: { width: 36, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: 'rgba(129,1,0,0.08)' },
  emoji: { fontSize: 18 },
});

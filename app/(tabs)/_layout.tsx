import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS = [
  { name: 'index', title: 'Home', emoji: '🏠' },
  { name: 'leaderboard', title: 'Rankings', emoji: '🏆' },
  { name: 'profile', title: 'Profile', emoji: '👤' },
];

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom || 20 }]}>
      <BlurView intensity={80} tint="light" style={styles.blurView}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const tabMeta = TABS.find(t => t.name === route.name);
          if (!tabMeta) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <Text style={[styles.emoji, { opacity: isFocused ? 1 : 0.5 }]}>{tabMeta.emoji}</Text>
              </View>
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {tabMeta.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.title }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: 'transparent',
    // Strong shadow applied to the container so it drops below the BlurView
    shadowColor: '#1B1716',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 20,
  },
  blurView: {
    flexDirection: 'row',
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.75)',
    overflow: 'hidden',
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'space-around',
    // Border to distinguish it from the background
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderTopColor: 'rgba(255,255,255,0.8)', // Subtly lighter top border for a 3D glass edge effect
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  iconWrap: {
    width: 38,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(129,1,0,0.1)',
  },
  emoji: {
    fontSize: 18,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: 'Outfit_600SemiBold',
    color: '#9A9390',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#810100',
    fontFamily: 'Outfit_800ExtraBold',
  },
});

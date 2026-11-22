import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  IconBooks,
  IconCalendar,
  IconHome,
  IconCharacter,
  IconListDetails,
  IconTable,
} from "../../components/icons";
import { hapticSelection } from "../../native/haptics";
import { useTheme } from "../../theme/ThemeProvider";

function tabColor(c: unknown): string | undefined {
  return typeof c === "string" ? c : undefined;
}

export default function TabsLayout() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenListeners={{
        tabPress: () => hapticSelection(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.primary,
        tabBarInactiveTintColor: tokens.ink2,
        tabBarStyle: {
          backgroundColor: tokens.surface,
          borderTopColor: tokens.border,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingBottom: Math.max(6, insets.bottom),
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ color }) => <IconHome size={22} color={tabColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: "記録",
          tabBarIcon: ({ color }) => <IconListDetails size={22} color={tabColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "予定",
          tabBarIcon: ({ color }) => <IconCalendar size={22} color={tabColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: "卓",
          tabBarIcon: ({ color }) => <IconTable size={22} color={tabColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="characters"
        options={{
          title: "キャラ",
          tabBarIcon: ({ color }) => <IconCharacter size={22} color={tabColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="scenarios"
        options={{
          title: "シナリオ",
          tabBarIcon: ({ color }) => <IconBooks size={22} color={tabColor(color)} />,
        }}
      />
    </Tabs>
  );
}

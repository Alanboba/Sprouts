import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { usePlantCare } from '@/context/PlantCareContext';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

export default function PlantHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    isReady,
    lastWateredAt,
    lastReadingAt,
    moisturePercent,
    sensorConnected,
    nextCheckAt,
    logWatering,
    logSoilCheck,
  } = usePlantCare();

  const hasLiveMoisture = sensorConnected && moisturePercent !== null;
  const now = Date.now();
  const checksDue = nextCheckAt <= now;
  const daysUntilCheck = Math.max(1, Math.ceil((nextCheckAt - now) / DAY_MS));
  const isThirsty = hasLiveMoisture && moisturePercent < 35;

  let headline = 'Milo is looking good';
  let status = 'Your next soil check is in a few days.';
  if (hasLiveMoisture && isThirsty) {
    headline = 'Milo could use a drink';
    status = 'The sensor says the soil is dry. Water slowly, then let the pot drain.';
  } else if (hasLiveMoisture && moisturePercent >= 70) {
    headline = 'Hold off on watering';
    status = 'The soil is still moist. Let it dry a little before watering again.';
  } else if (hasLiveMoisture) {
    headline = 'Milo is feeling settled';
    status = 'Soil moisture looks comfortable. Check again tomorrow.';
  } else if (checksDue) {
    headline = 'Time for a quick soil check';
    status = 'Feel the top inch of soil. If it is dry, give Milo a slow drink.';
  } else {
    status = `Next soil check in ${daysUntilCheck} ${daysUntilCheck === 1 ? 'day' : 'days'}.`;
  }

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1 },
    content: {
      paddingHorizontal: 22,
      paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
      paddingBottom: Platform.OS === 'web' ? 110 : 110 + insets.bottom,
      gap: 20,
    },
    eyebrow: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    date: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      marginTop: 5,
    },
    connectPill: {
      height: 40,
      paddingHorizontal: 13,
      borderRadius: 22,
      backgroundColor: colors.secondary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    connectText: {
      color: colors.secondaryForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },
    title: {
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.8,
      marginTop: 6,
    },
    hero: {
      minHeight: 200,
      overflow: 'hidden',
      borderRadius: 30,
      backgroundColor: colors.primary,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
    },
    heroCopy: { flex: 1, gap: 8 },
    heroTag: {
      color: '#DDE9D8',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    heroName: {
      color: colors.primaryForeground,
      fontFamily: 'Inter_700Bold',
      fontSize: 31,
      letterSpacing: -0.6,
    },
    heroSubtitle: {
      maxWidth: 180,
      color: '#E5EEE3',
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 19,
    },
    avatarWrap: {
      width: 144,
      height: 158,
      marginRight: -6,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 76,
      backgroundColor: '#E6B879',
    },
    avatar: { width: 140, height: 156 },
    panel: {
      backgroundColor: colors.card,
      borderRadius: 26,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 15,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    panelTitle: {
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 18,
      letterSpacing: -0.3,
      flex: 1,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.secondary,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 20,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: sensorConnected ? '#548B5F' : colors.mutedForeground,
    },
    liveLabel: {
      color: colors.secondaryForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
    },
    guidance: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 21,
    },
    metricRow: {
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    metricLabel: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      marginBottom: 5,
    },
    metricValue: {
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
    },
    actionRow: { flexDirection: 'row', gap: 10 },
    primaryButton: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 9,
      flex: 1,
    },
    primaryButtonText: {
      color: colors.primaryForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    secondaryButton: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 14,
    },
    secondaryButtonText: {
      color: colors.secondaryForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    footerNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 2,
    },
    footerText: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      flex: 1,
    },
  });

  const handleWater = () => {
    logWatering();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCheck = () => {
    logSoilCheck();
    void Haptics.selectionAsync();
  };

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View>
              <Text style={styles.eyebrow}>A little care, every day</Text>
              <Text style={styles.date}>{formatDate(now)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Connect a soil sensor"
              onPress={() => router.push('/connect')}
              style={({ pressed }) => [
                styles.connectPill,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              testID="open-connect"
            >
              <Feather
                name={sensorConnected ? 'wifi' : 'wifi-off'}
                size={15}
                color={colors.secondaryForeground}
              />
              <Text style={styles.connectText}>
                {sensorConnected ? 'Sensor live' : 'Connect'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{headline}</Text>

          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTag}>Your plant pal</Text>
              <Text style={styles.heroName}>Milo</Text>
              <Text style={styles.heroSubtitle}>
                A pothos with a sunny spot and a steady watering rhythm.
              </Text>
            </View>
            <View style={styles.avatarWrap}>
              <Image
                source={require('../../assets/images/plant-mascot.png')}
                style={styles.avatar}
                resizeMode="contain"
                accessibilityLabel="Illustration of Milo, a potted plant"
              />
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Today’s care</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>
                  {sensorConnected ? 'LIVE SENSOR' : 'PLANT ROUTINE'}
                </Text>
              </View>
            </View>
            <Text style={styles.guidance}>{status}</Text>
            <View style={styles.metricRow}>
              <View>
                <Text style={styles.metricLabel}>
                  {hasLiveMoisture ? 'Soil moisture' : 'Last watered'}
                </Text>
                <Text style={styles.metricValue}>
                  {hasLiveMoisture
                    ? `${moisturePercent}%`
                    : formatDate(lastWateredAt)}
                </Text>
              </View>
              <View>
                <Text style={styles.metricLabel}>
                  {hasLiveMoisture ? 'Reading' : 'Next check'}
                </Text>
                <Text style={styles.metricValue}>
                  {hasLiveMoisture && lastReadingAt
                    ? formatDate(lastReadingAt)
                    : checksDue
                      ? 'Today'
                      : `In ${daysUntilCheck} ${daysUntilCheck === 1 ? 'day' : 'days'}`}
                </Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={handleWater}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { opacity: pressed || !isReady ? 0.75 : 1 },
                ]}
                disabled={!isReady}
                testID="log-watering"
              >
                <Feather name="droplet" size={17} color={colors.primaryForeground} />
                <Text style={styles.primaryButtonText}>I watered Milo</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="I checked the soil and it is still damp"
                onPress={handleCheck}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
                testID="log-soil-check"
              >
                <Feather name="eye" size={16} color={colors.secondaryForeground} />
                <Text style={styles.secondaryButtonText}>Checked</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footerNote}>
            <Feather name="info" size={15} color={colors.mutedForeground} />
            <Text style={styles.footerText}>
              Pothos like their top inch of soil to dry between drinks. When in
              doubt, check the soil before watering.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

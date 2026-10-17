import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { usePlantCare } from '@/context/PlantCareContext';
import { useColors } from '@/hooks/useColors';
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

export default function FieldNotesHome() {
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
  let careText = `Your next soil check is in ${daysUntilCheck} ${daysUntilCheck === 1 ? 'day' : 'days'}. Milo’s doing just fine.`;
  if (hasLiveMoisture && isThirsty) {
    headline = 'Milo could use a drink';
    careText = 'The sensor says the soil is dry. Water slowly, then let the pot drain.';
  } else if (hasLiveMoisture && moisturePercent >= 70) {
    headline = 'Hold off on watering';
    careText = 'The soil is still moist. Let it dry a little before watering again.';
  } else if (hasLiveMoisture) {
    headline = 'Milo is feeling settled';
    careText = 'Moisture is in Milo’s comfort zone. Check again tomorrow.';
  } else if (checksDue) {
    headline = 'Time for a quick soil check';
    careText = 'Feel the top inch of soil. If it is dry, give Milo a slow drink.';
  }

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1 },
    content: {
      paddingHorizontal: 22,
      paddingTop: Platform.OS === 'web' ? 67 : insets.top + 14,
      paddingBottom: Platform.OS === 'web' ? 110 : 110 + insets.bottom,
      gap: 19,
    },
    topLine: {
      minHeight: 43,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    eyebrowLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    eyebrowMark: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    eyebrow: {
      color: colors.foreground,
      fontFamily: 'DMMono_500Medium',
      fontSize: 10,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    date: {
      color: colors.mutedForeground,
      fontFamily: 'DMMono_400Regular',
      fontSize: 10,
      letterSpacing: 0.3,
      marginTop: 6,
    },
    connectPill: {
      minHeight: 37,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 3,
      backgroundColor: colors.card,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    connectText: {
      color: colors.foreground,
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 11,
    },
    title: {
      color: colors.foreground,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 36,
      lineHeight: 38,
      letterSpacing: -0.5,
      marginTop: -2,
    },
    hero: {
      minHeight: 192,
      overflow: 'hidden',
      borderRadius: 4,
      backgroundColor: colors.foreground,
      paddingHorizontal: 19,
      paddingVertical: 16,
      justifyContent: 'center',
    },
    heroCopy: {
      width: '60%',
      zIndex: 2,
    },
    heroTag: {
      color: colors.accent,
      fontFamily: 'DMMono_500Medium',
      fontSize: 9,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    heroName: {
      color: colors.background,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 39,
      lineHeight: 42,
      marginTop: 5,
    },
    heroSubtitle: {
      maxWidth: 178,
      color: colors.card,
      fontFamily: 'DMSans_400Regular',
      fontSize: 11,
      lineHeight: 16,
      marginTop: 7,
    },
    latinName: {
      color: colors.secondary,
      fontFamily: 'DMMono_400Regular',
      fontSize: 8,
      fontStyle: 'italic',
      marginTop: 9,
    },
    plantHalo: {
      position: 'absolute',
      right: -14,
      bottom: -56,
      width: 168,
      height: 168,
      borderRadius: 84,
      backgroundColor: colors.primary,
    },
    plantArt: {
      position: 'absolute',
      right: 3,
      bottom: -16,
      width: 168,
      height: 194,
      zIndex: 1,
    },
    fieldStamp: {
      position: 'absolute',
      right: 14,
      top: 13,
      zIndex: 2,
      borderWidth: 1,
      borderColor: colors.accent,
      paddingHorizontal: 5,
      paddingVertical: 3,
      color: colors.accent,
      fontFamily: 'DMMono_500Medium',
      fontSize: 7,
      lineHeight: 9,
      letterSpacing: 0.4,
      textAlign: 'center',
      transform: [{ rotate: '8deg' }],
    },
    careSheet: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      padding: 16,
      backgroundColor: colors.card,
    },
    careHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    sectionKicker: {
      color: colors.mutedForeground,
      fontFamily: 'DMMono_400Regular',
      fontSize: 8,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    kickerAccent: { color: colors.primary },
    careTitle: {
      color: colors.foreground,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 25,
      lineHeight: 28,
      marginTop: 4,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 2,
      paddingHorizontal: 7,
      paddingVertical: 6,
      marginTop: 1,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.mutedForeground,
    },
    liveText: {
      color: colors.mutedForeground,
      fontFamily: 'DMMono_500Medium',
      fontSize: 8,
    },
    guidance: {
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      fontSize: 12,
      lineHeight: 19,
      marginTop: 12,
    },
    metricRow: {
      flexDirection: 'row',
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 11,
    },
    metric: { flex: 1, gap: 5 },
    metricDivider: {
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      paddingLeft: 14,
      marginLeft: 14,
    },
    metricLabel: {
      color: colors.mutedForeground,
      fontFamily: 'DMMono_400Regular',
      fontSize: 8,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    metricValue: {
      color: colors.foreground,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 22,
      lineHeight: 25,
    },
    actionRow: { flexDirection: 'row', gap: 9, marginTop: 14 },
    waterButton: {
      minHeight: 45,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    waterButtonText: {
      color: colors.primaryForeground,
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 11,
    },
    checkButton: {
      minWidth: 99,
      minHeight: 45,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 3,
      backgroundColor: colors.card,
    },
    checkButtonText: {
      color: colors.foreground,
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 11,
    },
    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
      paddingHorizontal: 2,
    },
    noteIcon: {
      width: 23,
      height: 23,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noteText: {
      flex: 1,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      fontSize: 10,
      lineHeight: 16,
      marginTop: 1,
    },
    noteStrong: {
      color: colors.foreground,
      fontFamily: 'DMSans_600SemiBold',
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
          <View style={styles.topLine}>
            <View>
              <View style={styles.eyebrowLine}>
                <View style={styles.eyebrowMark} />
                <Text style={styles.eyebrow}>A little care, every day</Text>
              </View>
              <Text style={styles.date}>
                {formatDate(now)} <Text style={styles.kickerAccent}>·</Text> Milo’s journal
              </Text>
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
                color={colors.foreground}
              />
              <Text style={styles.connectText}>
                {sensorConnected ? 'Sensor live' : 'Connect'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{headline}</Text>

          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTag}>Field note 04</Text>
              <Text style={styles.heroName}>Milo</Text>
              <Text style={styles.heroSubtitle}>
                A pothos with a sunny spot and a steady watering rhythm.
              </Text>
              <Text style={styles.latinName}>Epipremnum aureum</Text>
            </View>
            <View style={styles.plantHalo} />
            <Text style={styles.fieldStamp}>GROW{'\\n'}SLOW</Text>
            <Image
              source={require('../assets/images/fieldnotes-milo.png')}
              style={styles.plantArt}
              resizeMode="contain"
              accessibilityLabel="Botanical illustration of Milo the pothos"
            />
          </View>

          <View style={styles.careSheet}>
            <View style={styles.careHeader}>
              <View>
                <Text style={styles.sectionKicker}>
                  Entry 018 <Text style={styles.kickerAccent}>·</Text> Today
                </Text>
                <Text style={styles.careTitle}>Today’s care</Text>
              </View>
              <View style={styles.liveBadge}>
                <View
                  style={[
                    styles.liveDot,
                    sensorConnected && { backgroundColor: colors.primary },
                  ]}
                />
                <Text style={styles.liveText}>
                  {sensorConnected ? 'LIVE SENSOR' : 'PLANT ROUTINE'}
                </Text>
              </View>
            </View>
            <Text style={styles.guidance}>{careText}</Text>
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>
                  {hasLiveMoisture ? 'Soil moisture' : 'Last watered'}
                </Text>
                <Text style={styles.metricValue}>
                  {hasLiveMoisture
                    ? `${moisturePercent}%`
                    : formatDate(lastWateredAt)}
                </Text>
              </View>
              <View style={[styles.metric, styles.metricDivider]}>
                <Text style={styles.metricLabel}>
                  {hasLiveMoisture ? 'Latest reading' : 'Next soil check'}
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
                  styles.waterButton,
                  { opacity: pressed || !isReady ? 0.72 : 1 },
                ]}
                disabled={!isReady}
                testID="log-watering"
              >
                <Feather name="droplet" size={16} color={colors.primaryForeground} />
                <Text style={styles.waterButtonText}>I watered Milo</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="I checked the soil and it is still damp"
                onPress={handleCheck}
                style={({ pressed }) => [
                  styles.checkButton,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
                testID="log-soil-check"
              >
                <Feather name="eye" size={15} color={colors.foreground} />
                <Text style={styles.checkButtonText}>Checked</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.note}>
            <View style={styles.noteIcon}>
              <Feather name="info" size={14} color={colors.accentForeground} />
            </View>
            <Text style={styles.noteText}>
              <Text style={styles.noteStrong}>From the margins: </Text>
              Pothos like their top inch of soil to dry between drinks. When in
              doubt, check before you water.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

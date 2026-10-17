import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlantCare } from '@/context/PlantCareContext';
import { useColors } from '@/hooks/useColors';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

export default function FieldNotesConnect() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    sensorHost,
    sensorConnected,
    moisturePercent,
    lastReadingAt,
    setSensorHost,
    connectSensor,
    refreshSensor,
    disconnectSensor,
  } = usePlantCare();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: 22,
      paddingTop: Platform.OS === 'web' ? 67 : insets.top + 14,
      paddingBottom: Platform.OS === 'web' ? 110 : 110 + insets.bottom,
      gap: 21,
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
    title: {
      color: colors.foreground,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 43,
      lineHeight: 42,
      letterSpacing: -0.7,
      marginTop: 8,
    },
    intro: {
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      lineHeight: 20,
      marginTop: 12,
    },
    kicker: {
      color: colors.mutedForeground,
      fontFamily: 'DMMono_400Regular',
      fontSize: 8,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    kickerAccent: { color: colors.primary },
    deviceCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      backgroundColor: colors.card,
      padding: 17,
    },
    deviceTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    deviceIcon: {
      width: 42,
      height: 42,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      color: colors.primary,
    },
    deviceCopy: { flex: 1 },
    deviceTitle: {
      color: colors.foreground,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 23,
      lineHeight: 27,
      marginTop: 4,
    },
    refreshButton: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.input,
    },
    statusBody: {
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      fontSize: 12,
      lineHeight: 19,
      marginTop: 15,
    },
    readingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 16,
    },
    reading: {
      color: colors.foreground,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 45,
      lineHeight: 49,
    },
    readingLabel: {
      color: colors.mutedForeground,
      fontFamily: 'DMMono_400Regular',
      fontSize: 8,
      textAlign: 'right',
    },
    rule: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 15,
    },
    setupIntro: {
      color: colors.foreground,
      fontFamily: 'InstrumentSerif_400Regular',
      fontSize: 24,
      lineHeight: 28,
      marginBottom: 13,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      marginBottom: 12,
    },
    stepNumber: {
      color: colors.primary,
      fontFamily: 'DMMono_500Medium',
      fontSize: 10,
      minWidth: 23,
      paddingTop: 3,
    },
    stepText: {
      flex: 1,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      fontSize: 12,
      lineHeight: 18,
    },
    inputCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      backgroundColor: colors.card,
      padding: 16,
      gap: 11,
    },
    inputLabel: {
      color: colors.mutedForeground,
      fontFamily: 'DMMono_500Medium',
      fontSize: 9,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    input: {
      minHeight: 47,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 3,
      backgroundColor: colors.background,
      color: colors.foreground,
      fontFamily: 'DMSans_500Medium',
      fontSize: 14,
    },
    hint: {
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      fontSize: 11,
      lineHeight: 17,
    },
    error: {
      color: colors.destructive,
      fontFamily: 'DMSans_500Medium',
      fontSize: 11,
      lineHeight: 17,
    },
    success: {
      color: colors.primary,
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 11,
      lineHeight: 17,
    },
    connectButton: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    connectButtonText: {
      color: colors.primaryForeground,
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 12,
    },
    disconnectButton: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    disconnectText: {
      color: colors.mutedForeground,
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 11,
    },
    safety: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
      paddingHorizontal: 2,
    },
    safetyText: {
      flex: 1,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      fontSize: 10,
      lineHeight: 16,
    },
  });

  const handleConnect = async (refresh = false) => {
    setError(null);
    setSuccess(null);
    setIsConnecting(true);
    try {
      const moisture = refresh
        ? await refreshSensor()
        : await connectSensor(sensorHost);
      setSuccess(`Connected — soil moisture is ${moisture}%.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : 'Could not connect to the board.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsConnecting(false);
    }
  };

  const lastReadingLabel = lastReadingAt
    ? new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(lastReadingAt)
    : 'Just now';

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View style={styles.eyebrowLine}>
            <View style={styles.eyebrowMark} />
            <Text style={styles.eyebrow}>Optional hardware</Text>
          </View>
          <Text style={styles.title}>Bring Milo{'\n'}online.</Text>
          <Text style={styles.intro}>
            Add a small soil sensor for live readings. No sensor? Milo’s care
            routine works beautifully, too.
          </Text>
        </View>

        <View style={styles.deviceCard}>
          <View style={styles.deviceTop}>
            <View style={styles.deviceIcon}>
              <Feather
                name={sensorConnected ? 'wifi' : 'wifi-off'}
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={styles.deviceCopy}>
              <Text style={styles.kicker}>
                ESP32 <Text style={styles.kickerAccent}>·</Text> Local Wi-Fi
              </Text>
              <Text style={styles.deviceTitle}>
                {sensorConnected ? 'Board connected' : 'No board connected'}
              </Text>
            </View>
            {sensorConnected ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh sensor reading"
                onPress={() => void handleConnect(true)}
                disabled={isConnecting}
                style={({ pressed }) => [
                  styles.refreshButton,
                  { opacity: pressed || isConnecting ? 0.65 : 1 },
                ]}
                testID="refresh-sensor"
              >
                {isConnecting ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Feather name="refresh-cw" size={16} color={colors.foreground} />
                )}
              </Pressable>
            ) : null}
          </View>
          {sensorConnected ? (
            <View style={styles.readingRow}>
              <Text style={styles.reading}>{moisturePercent}%</Text>
              <Text style={styles.readingLabel}>
                SOIL MOISTURE{'\\n'}UPDATED {lastReadingLabel}
              </Text>
            </View>
          ) : (
            <Text style={styles.statusBody}>
              Your phone and board need to be on the same home Wi-Fi network.
            </Text>
          )}
          <View style={styles.rule} />
          <Text style={styles.setupIntro}>A few quick steps</Text>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>01</Text>
            <Text style={styles.stepText}>
              Connect a capacitive moisture sensor to GPIO 34 and share ground.
            </Text>
          </View>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>02</Text>
            <Text style={styles.stepText}>
              In Arduino IDE, open PlantPalESP32.ino, enter your Wi-Fi name and
              password, then upload the sketch.
            </Text>
          </View>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>03</Text>
            <Text style={styles.stepText}>
              Keep the phone and ESP32 on the same 2.4 GHz Wi-Fi network. Find
              the board’s local IP in Serial Monitor.
            </Text>
          </View>
          <View style={[styles.stepRow, { marginBottom: 0 }]}>
            <Text style={styles.stepNumber}>04</Text>
            <Text style={styles.stepText}>
              Enter the address below. Plant Pal reads its moisture level from
              /api/status.
            </Text>
          </View>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>ESP32 address</Text>
          <TextInput
            value={sensorHost}
            onChangeText={(value) => {
              setSensorHost(value);
              setError(null);
              setSuccess(null);
            }}
            placeholder="192.168.1.42"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => void handleConnect()}
            style={styles.input}
            accessibilityLabel="ESP32 local IP address"
            testID="sensor-host-input"
          />
          <Text style={styles.hint}>
            Use the address shown in Serial Monitor. It should stay local to
            your home network.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleConnect()}
            disabled={isConnecting}
            style={({ pressed }) => [
              styles.connectButton,
              { opacity: isConnecting ? 0.7 : pressed ? 0.82 : 1 },
            ]}
            testID="connect-sensor"
          >
            {isConnecting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Feather
                  name={sensorConnected ? 'check' : 'wifi'}
                  size={16}
                  color={colors.primaryForeground}
                />
                <Text style={styles.connectButtonText}>
                  {sensorConnected ? 'Connect another board' : 'Connect sensor'}
                </Text>
                <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
              </>
            )}
          </Pressable>
          {sensorConnected ? (
            <Pressable
              accessibilityRole="button"
              onPress={disconnectSensor}
              style={({ pressed }) => [
                styles.disconnectButton,
                { opacity: pressed ? 0.72 : 1 },
              ]}
              testID="disconnect-sensor"
            >
              <Feather name="x" size={14} color={colors.mutedForeground} />
              <Text style={styles.disconnectText}>Disconnect sensor</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.safety}>
          <Feather name="shield" size={14} color={colors.mutedForeground} />
          <Text style={styles.safetyText}>
            This board talks directly over your local network. Keep it off the
            public internet.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlantCare } from '@/context/PlantCareContext';
import { useColors } from '@/hooks/useColors';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

export default function FieldNotesConnect() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sensorHost, sensorConnected, moisturePercent, lastReadingAt, setSensorHost, connectSensor, refreshSensor, disconnectSensor } = usePlantCare();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 14, paddingBottom: Platform.OS === 'web' ? 104 : 110 + insets.bottom, gap: 16 },
    header: { gap: 5, marginBottom: 3 },
    title: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 27, letterSpacing: -0.5 },
    intro: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 3 },
    card: { padding: 17, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    deviceIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    deviceCopy: { flex: 1 },
    label: { color: colors.mutedForeground, fontFamily: 'DMSans_500Medium', fontSize: 11 },
    deviceTitle: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 16, marginTop: 3 },
    refreshButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    deviceBody: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18, marginTop: 13 },
    metricRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 15 },
    reading: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 42, letterSpacing: -1 },
    readingMeta: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 11, textAlign: 'right' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 15 },
    sectionTitle: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 16, marginBottom: 11 },
    setupBody: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
    steps: { gap: 8, marginTop: 10 },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    stepMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 6 },
    stepText: { flex: 1, color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
    form: { gap: 11 },
    inputLabel: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
    input: { minHeight: 49, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.input, borderRadius: 12, backgroundColor: colors.background, color: colors.foreground, fontFamily: 'DMSans_500Medium', fontSize: 15 },
    hint: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
    error: { color: colors.destructive, fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 17 },
    success: { color: colors.primary, fontFamily: 'DMSans_600SemiBold', fontSize: 12, lineHeight: 17 },
    primaryButton: { minHeight: 49, borderRadius: 13, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
    primaryButtonText: { color: colors.primaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
    disconnect: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 3 },
    disconnectText: { color: colors.destructive, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 2 },
    noteText: { flex: 1, color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 17 },
  });

  const handleConnect = async (refresh = false) => {
    setError(null);
    setSuccess(null);
    setIsConnecting(true);
    try {
      const moisture = refresh ? await refreshSensor() : await connectSensor(sensorHost);
      setSuccess(`Connected. Current soil moisture is ${moisture}%.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Could not connect to the board. Check the address and Wi-Fi, then retry.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Sensor connection</Text>
          <Text style={styles.intro}>Connect an ESP32 moisture sensor on your local Wi-Fi network. Plant care reminders work without one.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.deviceRow}>
            <View style={styles.deviceIcon}>
              <Feather name={sensorConnected ? 'wifi' : 'wifi-off'} size={20} color={sensorConnected ? colors.primary : colors.mutedForeground} />
            </View>
            <View style={styles.deviceCopy}>
              <Text style={styles.label}>ESP32 · LOCAL WI-FI</Text>
              <Text style={styles.deviceTitle}>{sensorConnected ? 'Connected' : 'Not connected'}</Text>
            </View>
            {sensorConnected ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh sensor reading" disabled={isConnecting}
                onPress={() => void handleConnect(true)} style={({ pressed }) => [styles.refreshButton, { opacity: pressed || isConnecting ? 0.6 : 1 }]} testID="refresh-sensor">
                {isConnecting ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="refresh-cw" size={17} color={colors.primary} />}
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.deviceBody}>
            {sensorConnected ? 'Your phone reached the board over the home network.' : 'The board must be powered on, and your phone and ESP32 must share the same Wi-Fi network.'}
          </Text>
          {moisturePercent !== null ? (
            <View style={styles.metricRow}>
              <Text style={styles.reading}>{moisturePercent}%</Text>
              <Text style={styles.readingMeta}>
                {sensorConnected ? 'SOIL MOISTURE · LIVE' : 'LAST READING · OFFLINE'}{'\n'}
                {lastReadingAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(lastReadingAt) : 'Time unavailable'}
              </Text>
            </View>
          ) : null}
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Set up your board</Text>
          <Text style={styles.setupBody}>Upload the PlantPalESP32.ino sketch from Arduino IDE before connecting here.</Text>
          <View style={styles.steps}>
            <View style={styles.step}><View style={styles.stepMark} /><Text style={styles.stepText}>Wire a capacitive moisture sensor to GPIO 34 and connect ground.</Text></View>
            <View style={styles.step}><View style={styles.stepMark} /><Text style={styles.stepText}>Enter your Wi-Fi details in the sketch and upload it to the ESP32.</Text></View>
            <View style={styles.step}><View style={styles.stepMark} /><Text style={styles.stepText}>Open Serial Monitor, find the board’s local IP, and enter it below.</Text></View>
          </View>
        </View>

        <View style={[styles.card, styles.form]}>
          <Text style={styles.inputLabel}>Board local IP address</Text>
          <TextInput value={sensorHost} onChangeText={(value) => { setSensorHost(value); setError(null); setSuccess(null); }}
            placeholder="192.168.1.42" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false}
            keyboardType="url" returnKeyType="go" onSubmitEditing={() => void handleConnect()} style={styles.input}
            accessibilityLabel="ESP32 local IP address" testID="sensor-host-input" />
          <Text style={styles.hint}>The address appears in Serial Monitor after the sketch connects to Wi-Fi.</Text>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {success ? <Text style={styles.success} accessibilityLiveRegion="polite">{success}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => void handleConnect()} disabled={isConnecting}
            style={({ pressed }) => [styles.primaryButton, { opacity: isConnecting ? 0.7 : pressed ? 0.82 : 1 }]} testID="connect-sensor">
            {isConnecting ? <ActivityIndicator color={colors.primaryForeground} /> : (
              <>
                <Feather name={sensorConnected ? 'refresh-cw' : 'wifi'} size={16} color={colors.primaryForeground} />
                <Text style={styles.primaryButtonText}>{sensorConnected ? 'Connect another board' : 'Connect sensor'}</Text>
              </>
            )}
          </Pressable>
          {sensorConnected ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Disconnect sensor" onPress={() => { disconnectSensor(); setSuccess(null); setError(null); }}
              style={({ pressed }) => [styles.disconnect, { opacity: pressed ? 0.65 : 1 }]} testID="disconnect-sensor">
              <Feather name="x-circle" size={16} color={colors.destructive} /><Text style={styles.disconnectText}>Disconnect sensor</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.note}>
          <Feather name="shield" size={15} color={colors.mutedForeground} />
          <Text style={styles.noteText}>The board communicates directly over your local network. Keep it off the public internet.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

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

export default function ConnectScreen() {
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
      gap: 20,
    },
    eyebrow: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      letterSpacing: 1.25,
      textTransform: 'uppercase',
    },
    title: {
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 29,
      lineHeight: 36,
      letterSpacing: -0.8,
      marginTop: 7,
    },
    intro: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 21,
      marginTop: 7,
    },
    statusCard: {
      borderRadius: 26,
      padding: 18,
      backgroundColor: sensorConnected ? colors.primary : colors.secondary,
      gap: 12,
    },
    statusTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statusIcon: {
      width: 44,
      height: 44,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: sensorConnected ? '#4C7354' : colors.card,
    },
    statusTitle: {
      flex: 1,
      color: sensorConnected ? colors.primaryForeground : colors.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
    },
    statusBody: {
      color: sensorConnected ? '#E5EEE3' : colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 20,
    },
    reading: {
      color: sensorConnected ? colors.primaryForeground : colors.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 30,
      marginTop: 2,
    },
    card: {
      borderRadius: 26,
      padding: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 14,
    },
    cardTitle: {
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 17,
      letterSpacing: -0.2,
    },
    paragraph: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 20,
    },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    stepNumber: {
      width: 25,
      height: 25,
      borderRadius: 13,
      backgroundColor: colors.secondary,
      color: colors.secondaryForeground,
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      textAlign: 'center',
      textAlignVertical: 'center',
      overflow: 'hidden',
      paddingTop: 5,
    },
    stepText: {
      flex: 1,
      color: colors.foreground,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 19,
      paddingTop: 2,
    },
    inputLabel: {
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    input: {
      height: 52,
      paddingHorizontal: 14,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.input,
      backgroundColor: colors.background,
      color: colors.foreground,
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
    },
    hint: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      marginTop: -7,
    },
    error: {
      color: colors.destructive,
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      lineHeight: 18,
    },
    success: {
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },
    button: {
      minHeight: 52,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 9,
    },
    buttonText: {
      color: colors.primaryForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    disconnectButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    disconnectText: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
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
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
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
    : null;

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.eyebrow}>Optional hardware</Text>
          <Text style={styles.title}>Bring Milo online</Text>
          <Text style={styles.intro}>
            Connect a Wi-Fi-enabled ESP32 and use live soil readings to guide
            watering. You can still use Milo’s care routine without a sensor.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={styles.statusIcon}>
              <Feather
                name={sensorConnected ? 'wifi' : 'wifi-off'}
                size={19}
                color={sensorConnected ? colors.primaryForeground : colors.secondaryForeground}
              />
            </View>
            <Text style={styles.statusTitle}>
              {sensorConnected ? 'ESP32 connected' : 'No sensor connected'}
            </Text>
            {sensorConnected ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh sensor reading"
                onPress={() => void handleConnect(true)}
                disabled={isConnecting}
                testID="refresh-sensor"
              >
                {isConnecting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Feather name="refresh-cw" size={19} color={colors.primaryForeground} />
                )}
              </Pressable>
            ) : null}
          </View>
          {sensorConnected ? (
            <>
              <Text style={styles.reading}>{moisturePercent}%</Text>
              <Text style={styles.statusBody}>
                Soil moisture{lastReadingLabel ? ` · updated ${lastReadingLabel}` : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.statusBody}>
              Your phone and board need to be on the same Wi-Fi network.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Set up an ESP32</Text>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>
              Connect a capacitive soil-moisture sensor to the ESP32 analog
              input (GPIO 34) and share ground.
            </Text>
          </View>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>
              In Arduino IDE, open the included
              {' '}PlantPalESP32.ino starter sketch. Add your Wi-Fi name and
              password, then upload it to the board.
            </Text>
          </View>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              Open Arduino IDE’s Serial Monitor to find the board’s local IP
              address.
            </Text>
          </View>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>
              Enter that address below and connect. The app reads
              {' '}/api/status from the board.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
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
            Use the IP shown in Serial Monitor. Keep the address local to your
            home network.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleConnect()}
            disabled={isConnecting}
            style={({ pressed }) => [
              styles.button,
              { opacity: isConnecting ? 0.7 : pressed ? 0.82 : 1 },
            ]}
            testID="connect-sensor"
          >
            {isConnecting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Feather name="link-2" size={17} color={colors.primaryForeground} />
                <Text style={styles.buttonText}>
                  {sensorConnected ? 'Connect another board' : 'Connect sensor'}
                </Text>
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
              <Feather name="x-circle" size={15} color={colors.mutedForeground} />
              <Text style={styles.disconnectText}>Disconnect sensor</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.safety}>
          <Feather name="shield" size={15} color={colors.mutedForeground} />
          <Text style={styles.safetyText}>
            The app talks directly to the board over your local Wi-Fi. This
            starter setup is for a trusted home network; don’t expose the board
            to the public internet.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

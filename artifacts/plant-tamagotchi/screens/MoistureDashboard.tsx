import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { usePlantCare } from '@/context/PlantCareContext';
import { DAY_MS, getNextCheckAt } from '@/context/plant-care-schedule';
import { usePlantPhoto } from '@/hooks/usePlantPhoto';
import { useColors } from '@/hooks/useColors';
import { usePlantIdentity } from '@/context/PlantIdentityContext';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';

function dateLabel(timestamp: number | null, includeTime = false) {
  if (!timestamp) return 'Not recorded yet';
  return new Intl.DateTimeFormat('en-US', includeTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' }).format(timestamp);
}

export default function MoistureDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isReady: sensorReady, sensorHost, sensorConnected, moisturePercent,
    lastReadingAt, refreshSensor } = usePlantCare();
  const { photoUri, isLoading: photoLoading, isSaving: photoSaving, error: photoError,
    pickPhoto, removePhoto, removePhotoForPlant, restorePhotoForPlant } = usePlantPhoto();
  const { identity, plants, isReady: plantsReady, error: plantsError,
    selectPlant, removePlant, logWatering, logSoilCheck } = usePlantIdentity();
  const isReady = sensorReady && plantsReady;
  const lastWateredAt = identity?.lastWateredAt ?? null;
  const lastSoilCheckAt = identity?.lastSoilCheckAt ?? null;
  const nextCheckAt = identity
    ? getNextCheckAt(identity.lastWateredAt, identity.lastSoilCheckAt)
    : 0;
  const [sensorLoading, setSensorLoading] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [careFeedback, setCareFeedback] = useState<string | null>(null);
  const [confirmRemovePlant, setConfirmRemovePlant] = useState(false);
  const [isRemovingPlant, setIsRemovingPlant] = useState(false);
  const [removePlantError, setRemovePlantError] = useState<string | null>(null);
  const removeInProgress = useRef(false);

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'web' ? 67 : insets.top + 14,
      paddingBottom: Platform.OS === 'web' ? 104 : 110 + insets.bottom,
      gap: 16,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 27, letterSpacing: -0.5 },
    subtitle: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 3 },
    nicknameEdit: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 38, alignSelf: 'flex-start', maxWidth: 205 },
    connect: { minHeight: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'center', gap: 7 },
    connectLabel: { color: colors.secondaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    identifyAction: { minHeight: 44, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    identifyActionText: { color: colors.secondaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    profileChooser: { gap: 9 },
    profileHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    profileLabel: { color: colors.mutedForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 11, letterSpacing: 0.4 },
    addPlant: { minHeight: 34, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    addPlantText: { color: colors.secondaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 11 },
    profileActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    removePlant: { minHeight: 34, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    removePlantText: { color: colors.destructive, fontFamily: 'DMSans_600SemiBold', fontSize: 11 },
    removePanel: { padding: 14, gap: 9, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    removePanelTitle: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 15 },
    removePanelBody: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
    removeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
    cancelRemove: { minHeight: 40, minWidth: 84, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    confirmRemove: { minHeight: 40, minWidth: 92, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.destructive, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    cancelRemoveText: { color: colors.secondaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    confirmRemoveText: { color: colors.destructiveForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    removePlantError: { color: colors.destructive, fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 17 },
    emptyPlantCard: { padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', gap: 8 },
    emptyPlantTitle: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 16, textAlign: 'center' },
    emptyPlantBody: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    profileChips: { flexDirection: 'row', gap: 8, paddingRight: 6 },
    profileChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    profileChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    profileChipText: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    profileChipTextActive: { color: colors.primaryForeground },
    profileNote: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
    photoCard: { minHeight: 102, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    photo: { width: 76, height: 76, borderRadius: 12, backgroundColor: colors.muted },
    photoEmpty: { width: 76, height: 76, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    photoCopy: { flex: 1, gap: 4 },
    photoTitle: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 15 },
    photoHint: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17 },
    photoAction: { minHeight: 40, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    photoActionText: { color: colors.primaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    removePhoto: { padding: 8 },
    errorText: { color: colors.destructive, fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 17 },
    moistureCard: { padding: 18, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionLabel: { color: colors.mutedForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 12, letterSpacing: 0.3 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.muted },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { color: colors.mutedForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 10 },
    moistureRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 },
    moistureValue: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 53, lineHeight: 59, letterSpacing: -2 },
    moistureUnit: { color: colors.mutedForeground, fontFamily: 'DMSans_500Medium', fontSize: 16, marginBottom: 8 },
    guidance: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 3 },
    meterTrack: { height: 9, borderRadius: 6, marginTop: 17, overflow: 'hidden', backgroundColor: colors.muted },
    meterFill: { height: '100%', borderRadius: 6 },
    scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    scaleText: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 10 },
    sensorFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border },
    readingMeta: { flex: 1, color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
    refresh: { minWidth: 84, minHeight: 38, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    refreshText: { color: colors.secondaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 11 },
    retry: { marginTop: 9, color: colors.destructive, fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 17 },
    guidanceCard: { padding: 16, borderRadius: 16, backgroundColor: colors.secondary },
    guidanceHeading: { color: colors.secondaryForeground, fontFamily: 'DMSans_700Bold', fontSize: 16 },
    guidanceBody: { color: colors.secondaryForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 },
    metrics: { flexDirection: 'row', gap: 11 },
    metric: { flex: 1, minHeight: 82, padding: 13, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    metricLabel: { color: colors.mutedForeground, fontFamily: 'DMSans_500Medium', fontSize: 11 },
    metricValue: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 14, marginTop: 8 },
    careActions: { flexDirection: 'row', gap: 10 },
    primaryAction: { flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    secondaryAction: { flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryActionText: { color: colors.primaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    secondaryActionText: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    feedback: { color: colors.primary, fontFamily: 'DMSans_500Medium', fontSize: 12, textAlign: 'center' },
  });

  const now = Date.now();
  const daysUntilCheck = identity ? Math.max(0, Math.ceil((nextCheckAt - now) / DAY_MS)) : 0;
  const checkDue = Boolean(identity && nextCheckAt <= now);
  const hasReading = moisturePercent !== null;
  const moistureColor = !sensorConnected ? colors.mutedForeground
    : moisturePercent !== null && moisturePercent < 35 ? colors.destructive
      : moisturePercent !== null && moisturePercent >= 70 ? colors.accent : colors.primary;
  const moistureCopy = !identity
    ? sensorConnected && moisturePercent !== null
      ? `Sensor reading is ${moisturePercent}%. Add a plant to start its care log.`
      : 'Add a plant to start tracking photos and care history.'
    : sensorConnected && moisturePercent !== null
    ? moisturePercent < 35 ? 'Soil is dry. Water slowly, then let the pot drain.'
      : moisturePercent >= 70 ? 'Soil is still moist. Hold off and let it dry a little.'
        : 'Moisture is in a comfortable range.'
    : hasReading
      ? 'Sensor is offline. This is the last saved reading, not a live measurement.'
      : 'Connect your sensor for a moisture reading, or check the soil by hand.';
  const checkLabel = checkDue ? 'Due today' : `In ${daysUntilCheck} ${daysUntilCheck === 1 ? 'day' : 'days'}`;

  const handleRefresh = async () => {
    setSensorError(null);
    setSensorLoading(true);
    try {
      await refreshSensor();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setSensorError(error instanceof Error ? error.message : 'Could not reach the sensor. Check the board and Wi-Fi, then retry.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSensorLoading(false);
    }
  };

  const handleWater = async () => {
    try {
      await logWatering();
      setCareFeedback(`Watering logged for ${identity?.commonName ?? 'this plant'}.`);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setCareFeedback('Could not save the watering log. Please try again.');
    }
  };
  const handleSoilCheck = async () => {
    try {
      await logSoilCheck();
      setCareFeedback(`Soil check logged for ${identity?.commonName ?? 'this plant'}.`);
      void Haptics.selectionAsync();
    } catch {
      setCareFeedback('Could not save the soil check. Please try again.');
    }
  };
  const handleSelectPlant = async (plantId: string) => {
    try {
      await selectPlant(plantId);
      setCareFeedback(null);
    } catch {
      setCareFeedback('Could not switch plants. Please try again.');
    }
  };

  const handleRemoveCurrentPlant = async () => {
    if (!identity || removeInProgress.current || photoBusy) return;
    const plant = identity;
    const savedPhoto = photoUri;
    removeInProgress.current = true;
    setIsRemovingPlant(true);
    setRemovePlantError(null);
    let photoRemoved = false;
    try {
      await removePhotoForPlant(plant.id);
      photoRemoved = true;
      try {
        await removePlant(plant.id);
      } catch (deleteError) {
        if (photoRemoved && savedPhoto) {
          try {
            await restorePhotoForPlant(plant.id, savedPhoto);
          } catch {
            throw new Error('The plant could not be removed, and its photo could not be restored. Please try uploading the photo again.');
          }
        }
        throw deleteError;
      }
      setConfirmRemovePlant(false);
      setCareFeedback(`${plant.nickname || plant.commonName} was removed.`);
    } catch (deleteError) {
      setRemovePlantError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not remove this plant. Please try again.',
      );
    } finally {
      removeInProgress.current = false;
      setIsRemovingPlant(false);
    }
  };

  const photoBusy = photoLoading || photoSaving;

  const handleCameraIdentify = async () => {
    const captured = await pickPhoto('camera');
    if (captured) {
      router.push({ pathname: '/identify', params: { autoIdentify: '1' } });
    }
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Plant care</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit plant nickname"
              disabled={!identity || confirmRemovePlant || isRemovingPlant}
              onPress={() => router.push('/edit-name')}
              style={({ pressed }) => [styles.nicknameEdit, { opacity: pressed ? 0.65 : 1 }]}
              testID="edit-plant-nickname"
            >
              <Text style={[styles.subtitle, { flexShrink: 1 }]} numberOfLines={2}>
                {identity
                  ? `${identity.nickname || 'Name'} · ${identity.commonName}`
                  : plantsReady ? 'Add a plant to get started' : 'Loading plants…'}
              </Text>
              {identity ? <Feather name="edit-2" size={13} color={colors.primary} /> : null}
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open sensor connection settings"
            onPress={() => router.push('/connect')} style={({ pressed }) => [styles.connect, { opacity: pressed ? 0.75 : 1 }]} testID="open-connect">
            <Feather name={sensorConnected ? 'wifi' : 'wifi-off'} size={15} color={colors.secondaryForeground} />
            <Text style={styles.connectLabel}>{sensorConnected ? 'Connected' : 'Connect sensor'}</Text>
          </Pressable>
        </View>

        <View style={styles.profileChooser}>
          <View style={styles.profileHeading}>
            <Text style={styles.profileLabel}>YOUR PLANTS</Text>
            <View style={styles.profileActions}>
              {identity ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${identity.nickname || identity.commonName}`}
                  disabled={!plantsReady || photoBusy || confirmRemovePlant || isRemovingPlant}
                  onPress={() => {
                    setRemovePlantError(null);
                    setConfirmRemovePlant(true);
                  }}
                  style={({ pressed }) => [
                    styles.removePlant,
                    { opacity: !plantsReady || photoBusy || isRemovingPlant || pressed ? 0.55 : 1 },
                  ]}
                  testID="remove-current-plant"
                >
                  <Feather name="trash-2" size={13} color={colors.destructive} />
                  <Text style={styles.removePlantText}>Remove</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={plants.length ? 'Add another plant' : 'Add your first plant'}
                disabled={!plantsReady || photoBusy || confirmRemovePlant || isRemovingPlant}
                onPress={() => router.push('/add-plant')}
                style={({ pressed }) => [
                  styles.addPlant,
                  { opacity: !plantsReady || photoBusy || pressed ? 0.6 : 1 },
                ]}
                testID="add-another-plant"
              >
                <Feather name="plus" size={15} color={colors.secondaryForeground} />
                <Text style={styles.addPlantText}>Add plant</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileChips}
            accessibilityLabel="Your saved plants"
          >
            {plants.map((plant) => {
              const selected = plant.id === identity?.id;
              return (
                <Pressable
                  key={plant.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${plant.commonName}${selected ? ', selected' : ''}`}
                  disabled={photoBusy || confirmRemovePlant || isRemovingPlant}
                  onPress={() => void handleSelectPlant(plant.id)}
                  style={({ pressed }) => [
                    styles.profileChip,
                    selected ? styles.profileChipActive : null,
                    { opacity: confirmRemovePlant || isRemovingPlant ? 0.55 : pressed ? 0.72 : 1 },
                  ]}
                  testID={`plant-profile-${plant.id}`}
                >
                  <Text style={[styles.profileChipText, selected ? styles.profileChipTextActive : null]}>
                    {plant.nickname || plant.commonName}
                  </Text>
                  {selected ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {plants.length > 1 ? (
            <Text style={styles.profileNote}>
              Each plant has its own photo and care log. The connected moisture sensor is shared.
            </Text>
          ) : null}
          {plantsError ? <Text style={styles.errorText} accessibilityRole="alert">{plantsError}</Text> : null}
        </View>

        {confirmRemovePlant && identity ? (
          <View style={styles.removePanel} testID="confirm-remove-plant">
            <Text style={styles.removePanelTitle}>Remove {identity.nickname || identity.commonName}?</Text>
            <Text style={styles.removePanelBody}>
              This permanently deletes this plant’s profile, care history, and saved photo from this device.
            </Text>
            {removePlantError ? (
              <Text style={styles.removePlantError} accessibilityRole="alert">{removePlantError}</Text>
            ) : null}
            <View style={styles.removeActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setConfirmRemovePlant(false);
                  setRemovePlantError(null);
                }}
                disabled={isRemovingPlant}
                style={({ pressed }) => [styles.cancelRemove, { opacity: isRemovingPlant || pressed ? 0.6 : 1 }]}
                testID="cancel-remove-plant"
              >
                <Text style={styles.cancelRemoveText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Confirm removal of ${identity.nickname || identity.commonName}`}
                onPress={() => void handleRemoveCurrentPlant()}
                disabled={isRemovingPlant || photoBusy}
                style={({ pressed }) => [styles.confirmRemove, { opacity: isRemovingPlant || photoBusy || pressed ? 0.6 : 1 }]}
                testID="confirm-remove-current-plant"
              >
                {isRemovingPlant ? <Feather name="loader" size={14} color={colors.destructiveForeground} /> : <Feather name="trash-2" size={14} color={colors.destructiveForeground} />}
                <Text style={styles.confirmRemoveText}>{isRemovingPlant ? 'Removing…' : 'Remove plant'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!identity ? (
          <View style={styles.emptyPlantCard} testID="empty-plants-state">
            <Feather name="plus-circle" size={25} color={colors.primary} />
            <Text style={styles.emptyPlantTitle}>No plants to care for yet</Text>
            <Text style={styles.emptyPlantBody}>
              Choose a photo below, then identify your plant or add it manually. Your photo will stay with its new profile.
            </Text>
          </View>
        ) : null}
        <View style={styles.photoCard}>
          {photoLoading ? (
            <View style={styles.photoEmpty} accessibilityLabel="Loading saved plant photo">
              <Feather name="image" size={22} color={colors.mutedForeground} />
            </View>
          ) : photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} accessibilityLabel="Saved photo of your plant" />
          ) : (
            <View style={styles.photoEmpty}>
              <Feather name="camera" size={22} color={colors.primary} />
            </View>
          )}
          <View style={styles.photoCopy}>
            <Text style={styles.photoTitle}>{photoUri ? 'Plant photo' : 'Add a plant photo'}</Text>
            <Text style={styles.photoHint}>{photoSaving ? 'Saving changes…' : photoLoading ? 'Loading photo…' : 'Saved only on this device'}</Text>
          </View>
          {photoUri ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="Replace plant photo" disabled={photoBusy || confirmRemovePlant || isRemovingPlant}
                onPress={() => void pickPhoto()} style={({ pressed }) => [styles.removePhoto, { opacity: photoBusy || confirmRemovePlant || isRemovingPlant || pressed ? 0.55 : 1 }]} testID="replace-plant-photo">
                <Feather name="edit-2" size={19} color={colors.primary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove plant photo" disabled={photoBusy || confirmRemovePlant || isRemovingPlant}
                onPress={() => void removePhoto()} style={({ pressed }) => [styles.removePhoto, { opacity: photoBusy || confirmRemovePlant || isRemovingPlant || pressed ? 0.55 : 1 }]} testID="remove-plant-photo">
                <Feather name="trash-2" size={19} color={colors.destructive} />
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Choose a plant photo" disabled={photoBusy || confirmRemovePlant || isRemovingPlant}
              onPress={() => void pickPhoto()} style={({ pressed }) => [styles.photoAction, { opacity: photoBusy || confirmRemovePlant || isRemovingPlant || pressed ? 0.65 : 1 }]} testID="add-plant-photo">
              <Feather name="image" size={15} color={colors.primaryForeground} />
              <Text style={styles.photoActionText}>{photoSaving ? 'Saving' : 'Choose photo'}</Text>
            </Pressable>
          )}
        </View>
        {photoError ? <Text style={styles.errorText} accessibilityRole="alert">{photoError}</Text> : null}

        <Pressable accessibilityRole="button" accessibilityLabel="Open camera and identify a plant"
          disabled={!plantsReady || photoBusy || confirmRemovePlant || isRemovingPlant}
          onPress={() => void handleCameraIdentify()}
          style={({ pressed }) => [styles.photoAction, { opacity: !plantsReady || photoBusy || confirmRemovePlant || isRemovingPlant || pressed ? 0.55 : 1 }]}
          testID="camera-identify-plant">
          <Feather name="camera" size={16} color={colors.primaryForeground} />
          <Text style={styles.photoActionText}>Camera & identify</Text>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel={identity ? `Identify ${identity.commonName} from a photo` : 'Identify a plant from a photo'}
          disabled={!plantsReady || photoBusy || confirmRemovePlant || isRemovingPlant}
          onPress={() => router.push('/identify')}
          style={({ pressed }) => [styles.identifyAction, { opacity: !plantsReady || photoBusy || confirmRemovePlant || isRemovingPlant || pressed ? 0.55 : 1 }]}
          testID="identify-plant">
          <Feather name="search" size={16} color={colors.secondaryForeground} />
          <Text style={styles.identifyActionText}>Identify this plant</Text>
        </Pressable>

        <View style={styles.moistureCard}>
          <View style={styles.sectionTop}>
            <Text style={styles.sectionLabel}>SOIL MOISTURE</Text>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: sensorConnected ? colors.primary : colors.accent }]} />
              <Text style={styles.statusText}>{sensorConnected ? 'LIVE' : hasReading ? 'OFFLINE' : 'NOT CONNECTED'}</Text>
            </View>
          </View>
          <View style={styles.moistureRow}>
            <Text style={styles.moistureValue}>{hasReading ? moisturePercent : '—'}</Text>
            {hasReading ? <Text style={styles.moistureUnit}>%</Text> : null}
          </View>
          <Text style={styles.guidance}>{moistureCopy}</Text>
          {sensorConnected && hasReading ? (
            <>
              <View style={styles.meterTrack} accessibilityRole="progressbar"
                accessibilityLabel="Soil moisture" accessibilityValue={{ min: 0, max: 100, now: moisturePercent }}>
                <View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, moisturePercent))}%`, backgroundColor: moistureColor }]} />
              </View>
              <View style={styles.scaleRow}><Text style={styles.scaleText}>Dry · under 35%</Text><Text style={styles.scaleText}>Moist · 70%+</Text></View>
            </>
          ) : null}
          <View style={styles.sensorFooter}>
            <Text style={styles.readingMeta}>
              {sensorConnected && lastReadingAt ? `Updated ${dateLabel(lastReadingAt, true)}` :
                hasReading && lastReadingAt ? `Last reading ${dateLabel(lastReadingAt, true)} · offline` :
                  sensorHost ? 'Board saved · waiting for a reading' : 'No sensor reading yet'}
            </Text>
            {sensorHost ? (
              <Pressable accessibilityRole="button" accessibilityLabel={sensorConnected ? 'Refresh moisture reading' : 'Retry sensor connection'}
                disabled={sensorLoading} onPress={() => void handleRefresh()}
                style={({ pressed }) => [styles.refresh, { opacity: sensorLoading || pressed ? 0.6 : 1 }]} testID="refresh-moisture">
                {sensorLoading ? <Feather name="loader" size={14} color={colors.secondaryForeground} /> :
                  <Feather name="refresh-cw" size={14} color={colors.secondaryForeground} />}
                <Text style={styles.refreshText}>{sensorLoading ? 'Checking' : sensorConnected ? 'Refresh' : 'Retry'}</Text>
              </Pressable>
            ) : null}
          </View>
          {sensorError ? <Text style={styles.retry} accessibilityRole="alert">{sensorError}</Text> : null}
        </View>

        {identity ? (
          <>
        <View style={styles.guidanceCard}>
          <Text style={styles.guidanceHeading}>
            {sensorConnected && moisturePercent !== null && moisturePercent < 35 ? 'Time to water'
              : sensorConnected && moisturePercent !== null && moisturePercent >= 70 ? 'Let the soil dry'
                : sensorConnected ? 'Moisture looks good' : checkDue ? 'Check the soil today' : 'Care at a glance'}
          </Text>
          <Text style={styles.guidanceBody}>
            {sensorConnected && moisturePercent !== null && moisturePercent < 35
              ? 'The sensor reads low moisture. Check this plant’s soil and care needs before watering.'
              : sensorConnected && moisturePercent !== null && moisturePercent >= 70
                ? 'The sensor reads high moisture. Hold off and check this plant again later.'
                : 'Watering needs vary by plant. Check the soil before watering, and wait if it still feels damp.'}
          </Text>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricLabel}>Last watered</Text><Text style={styles.metricValue}>{isReady ? dateLabel(lastWateredAt) : 'Loading…'}</Text></View>
          <View style={styles.metric}><Text style={styles.metricLabel}>Next soil check</Text><Text style={styles.metricValue}>{isReady ? checkLabel : 'Loading…'}</Text></View>
        </View>
        {lastSoilCheckAt ? <Text style={styles.readingMeta}>Last soil check · {dateLabel(lastSoilCheckAt)}</Text> : null}
        <View style={styles.careActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Log that you watered ${identity?.commonName ?? 'this plant'}`} disabled={!isReady || !identity || confirmRemovePlant || isRemovingPlant}
            onPress={handleWater} style={({ pressed }) => [styles.primaryAction, { opacity: !isReady || confirmRemovePlant || isRemovingPlant || pressed ? 0.65 : 1 }]} testID="log-watering">
            <Feather name="droplet" size={16} color={colors.primaryForeground} /><Text style={styles.primaryActionText}>Log watering</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Log that ${identity?.commonName ?? 'this plant'} soil is still damp`} disabled={!isReady || !identity || confirmRemovePlant || isRemovingPlant}
            onPress={handleSoilCheck} style={({ pressed }) => [styles.secondaryAction, { opacity: !isReady || confirmRemovePlant || isRemovingPlant || pressed ? 0.65 : 1 }]} testID="log-soil-check">
            <Feather name="check-circle" size={16} color={colors.primary} /><Text style={styles.secondaryActionText}>Still damp</Text>
          </Pressable>
        </View>
        {careFeedback ? <Text style={styles.feedback} accessibilityLiveRegion="polite">{careFeedback}</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

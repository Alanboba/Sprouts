import { Feather } from '@expo/vector-icons';
import {
  identifyPlant,
  type PlantIdentificationInput,
  type PlantIdentificationResult,
} from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePlantIdentity } from '@/context/PlantIdentityContext';
import { useColors } from '@/hooks/useColors';
import { usePlantPhoto, type PlantPhotoSource } from '@/hooks/usePlantPhoto';
import { IdentificationTimeoutError, withIdentificationDeadline } from '@/utils/identification-deadline';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef } from 'react';

function getApiErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error?: unknown }).error === 'string'
    ) {
      return (data as { error: string }).error;
    }
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status === 404) return 'The plant identification endpoint was not found. The app owner needs to check the backend connection.';
    if (status === 413) return 'This photo is too large to upload. Choose a smaller image.';
  }
  return 'Could not reach the plant identification service. Check your connection and try again.';
}

export default function IdentifyPlantScreen() {
  const { autoIdentify } = useLocalSearchParams<{ autoIdentify?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { photoUri, isLoading: photoLoading, isSaving, error: photoError, pickPhoto } = usePlantPhoto();
  const { identity, isReady: identityReady, saveIdentity, addPlant } = usePlantIdentity();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [cameraNeedsSettings, setCameraNeedsSettings] = useState(false);
  const [result, setResult] = useState<PlantIdentificationResult | null>(null);
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeUp, setCloseUp] = useState<string | null>(null);
  const [closeUpOffered, setCloseUpOffered] = useState(false);
  const scientificInputRef = useRef<TextInput>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const lastAnalysis = useRef<{ photos: string; result: PlantIdentificationResult; expiresAt: number } | null>(null);
  const photoScope = `${identity?.id ?? 'draft'}:${photoUri ?? ''}`;
  const currentScope = useRef(photoScope);
  currentScope.current = photoScope;
  const routeAutoConsumed = useRef(false);
  const [cameraAutoRequested, setCameraAutoRequested] = useState(false);

  useEffect(() => {
    setResult(null);
    setCommonName('');
    setScientificName('');
    setError(null);
    setCloseUp(null);
    setCloseUpOffered(false);
    lastAnalysis.current = null;
    setIsIdentifying(false);
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [photoUri, identity?.id]);

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8,
      paddingBottom: Platform.OS === 'web' ? 34 : Math.max(24, insets.bottom + 16),
      gap: 17,
    },
    back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    header: { gap: 5 },
    title: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 27, letterSpacing: -0.5 },
    intro: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19 },
    photoFrame: {
      minHeight: 208,
      maxHeight: 300,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photo: { width: '100%', height: 280 },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 9, padding: 28 },
    photoPlaceholderText: { color: colors.mutedForeground, fontFamily: 'DMSans_500Medium', fontSize: 13, textAlign: 'center' },
    photoActions: { flexDirection: 'row', gap: 10 },
    photoButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    photoButtonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
    photoButtonText: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    photoButtonTextPrimary: { color: colors.primaryForeground },
    status: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
    card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 },
    resultTitle: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 16 },
    resultText: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19 },
    confidence: { color: colors.primary, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    inputLabel: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 12, marginTop: 3 },
    input: {
      minHeight: 47,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 10,
      color: colors.foreground,
      backgroundColor: colors.background,
      fontFamily: 'DMSans_400Regular',
      fontSize: 14,
    },
    error: { color: colors.destructive, fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 18 },
    action: {
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    actionDisabled: { opacity: 0.55 },
    actionText: { color: colors.primaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
    secondaryAction: { backgroundColor: colors.secondary },
    secondaryActionText: { color: colors.secondaryForeground },
    settingsLink: { alignSelf: 'flex-start', paddingVertical: 6 },
    settingsText: { color: colors.primary, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    privacy: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  });

  const handleChoosePhoto = async () => {
    setError(null);
    await pickPhoto('library');
  };

  const handleCloseUp = async (source: PlantPhotoSource) => {
    if (activeRequest.current || isSaving || photoLoading || isSavingIdentity) return;
    setError(null);
    const scope = currentScope.current;
    const selected = await pickPhoto(source, { temporary: true });
    if (!selected || currentScope.current !== scope) return;
    if (selected === photoUri) {
      setError('Choose a different close-up of the same plant, not the original photo.');
      return;
    }
    setCloseUp(selected);
    setResult(null);
    setCommonName('');
    setScientificName('');
  };

  const handleTakePhoto = async () => {
    setError(null);
    if (Platform.OS !== 'web' && !cameraPermission?.granted) {
      let permission;
      try {
        permission = await requestCameraPermission();
      } catch {
        setError('Could not request camera access. Check device permissions or choose an existing photo.');
        return;
      }
      if (!permission) return;
      if (!permission.granted) {
        setCameraNeedsSettings(!permission.canAskAgain);
        setError(
          permission.canAskAgain
            ? 'Allow camera access to take a plant photo, or choose an existing photo instead.'
            : 'Camera access is off. Enable it in device settings or choose an existing photo.',
        );
        return;
      }
    }
    setCameraNeedsSettings(false);
    const captured = await pickPhoto('camera');
    if (captured) setCameraAutoRequested(true);
  };

  const handleOpenSettings = async () => {
    if (Platform.OS === 'web') return;
    try {
      await Linking.openSettings();
    } catch {
      setError('Open your device settings and allow camera access for Sprouts.');
    }
  };

  const handleIdentify = async () => {
    // State updates are asynchronous; the ref also prevents rapid double taps.
    if (activeRequest.current || isSaving || photoLoading) return;
    if (!photoUri) {
      setError('Take a photo or choose one from your library first.');
      return;
    }
    const photos: PlantIdentificationInput[] = [];
    for (const uri of [photoUri, ...(closeUp ? [closeUp] : [])]) {
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(uri);
      if (!match) {
        setError('This photo could not be prepared. Please choose or take another image.');
        return;
      }
      photos.push({
        mimeType: match[1] as PlantIdentificationInput['mimeType'],
        imageBase64: match[2],
      });
    }
    const photosKey = JSON.stringify([photoUri, closeUp]);
    const scope = currentScope.current;

    setError(null);
    const applyResult = (identification: PlantIdentificationResult) => {
      setResult(identification);
      if (identification.status === 'uncertain') setCloseUpOffered(true);
      setCommonName(identification.status === 'identified' ? identification.commonName : '');
      setScientificName(identification.status === 'identified' ? identification.scientificName : '');
    };
    if (lastAnalysis.current?.photos === photosKey && lastAnalysis.current.expiresAt > Date.now()) {
      applyResult(lastAnalysis.current.result);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setResult(null);
    setIsIdentifying(true);
    try {
      const identification = await withIdentificationDeadline((signal) => identifyPlant({
        ...photos[0],
        ...(photos.length > 1 ? { additionalPhotos: [photos[1]] } : {}),
      }, { signal }), controller);
      if (activeRequest.current !== controller || currentScope.current !== scope) return;
      lastAnalysis.current = {
        photos: photosKey,
        result: identification,
        expiresAt: Date.now() + (identification.status === 'identified' ? 10 * 60_000 : 30_000),
      };
      applyResult(identification);
    } catch (requestError) {
      if (activeRequest.current === controller && currentScope.current === scope) {
        setError(requestError instanceof IdentificationTimeoutError
          ? requestError.message
          : getApiErrorMessage(requestError));
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsIdentifying(false);
      }
    }
  };

  useEffect(() => {
    const fromRoute = autoIdentify === '1' && !routeAutoConsumed.current;
    if ((!fromRoute && !cameraAutoRequested) || !photoUri || photoLoading || isSaving) return;
    if (fromRoute) {
      routeAutoConsumed.current = true;
      router.setParams({ autoIdentify: undefined });
    }
    setCameraAutoRequested(false);
    void handleIdentify();
  }, [autoIdentify, cameraAutoRequested, photoUri, photoLoading, isSaving]);

  const handleConfirm = async () => {
    if (!result || !commonName.trim()) {
      setError('Enter a common plant name before saving.');
      return;
    }
    setError(null);
    setIsSavingIdentity(true);
    const unchanged =
      result.status === 'identified' &&
      commonName.trim() === result.commonName &&
      scientificName.trim() === result.scientificName;
    try {
      const entry = {
        commonName,
        scientificName,
        confidence: unchanged ? result.confidence : null,
      };
      if (identity) {
        await saveIdentity(entry);
      } else {
        await addPlant(entry);
      }
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save the plant name. Please try again.',
      );
    } finally {
      setIsSavingIdentity(false);
    }
  };

  const actionBusy = isIdentifying || isSaving || photoLoading;

  return (
    <View style={styles.page}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={76}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to dashboard"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}
          testID="back-to-dashboard"
        >
          <Feather name="arrow-left" size={21} color={colors.foreground} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Identify a plant</Text>
          <Text style={styles.intro}>
            Take a clear photo or choose one from your library. Gemini identifies
            it first, with Pl@ntNet as a backup when the service is unavailable.
          </Text>
        </View>

        <View style={styles.photoFrame}>
          {photoLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel="Photo selected for plant identification"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Feather name="image" size={27} color={colors.primary} />
              <Text style={styles.photoPlaceholderText}>
                Choose a clear image of one plant, with its leaves in view.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.photoActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take a plant photo"
            onPress={() => void handleTakePhoto()}
            disabled={actionBusy || isSavingIdentity}
            style={({ pressed }) => [
              styles.photoButton,
              styles.photoButtonPrimary,
              { opacity: actionBusy || pressed ? 0.65 : 1 },
            ]}
            testID="take-plant-photo"
          >
            <Feather name="camera" size={16} color={colors.primaryForeground} />
            <Text style={[styles.photoButtonText, styles.photoButtonTextPrimary]}>
              Take & identify
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a plant photo from your library"
            onPress={() => void handleChoosePhoto()}
            disabled={actionBusy || isSavingIdentity}
            style={({ pressed }) => [
              styles.photoButton,
              { opacity: actionBusy || pressed ? 0.65 : 1 },
            ]}
            testID="choose-identification-photo"
          >
            <Feather name="image" size={16} color={colors.foreground} />
            <Text style={styles.photoButtonText}>Choose photo</Text>
          </Pressable>
        </View>

        {cameraNeedsSettings ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleOpenSettings()}
            style={styles.settingsLink}
            testID="open-camera-settings"
          >
            <Text style={styles.settingsText}>Open camera settings</Text>
          </Pressable>
        ) : null}

        {photoError ? (
          <Text style={styles.error} accessibilityRole="alert">{photoError}</Text>
        ) : null}

        {closeUpOffered ? (
          <View style={styles.card} testID="close-up-card">
            <Text style={styles.resultTitle}>Add a second view</Text>
            <Text style={styles.resultText}>
              Keep the original photo and add a close-up of leaves, flowers or
              stems from the same plant. Both photos will be checked together.
              A second photo may help, but doesn’t guarantee a confident match.
            </Text>
            {closeUp ? (
              <>
                <Image
                  source={{ uri: closeUp }}
                  style={styles.photo}
                  resizeMode="contain"
                  accessibilityLabel="Second close-up selected for identification"
                  testID="close-up-preview"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove close-up"
                  disabled={actionBusy || isSavingIdentity}
                  onPress={() => {
                    if (activeRequest.current || isSaving || photoLoading || isSavingIdentity) return;
                    setCloseUp(null);
                    setResult(null);
                    setCommonName('');
                    setScientificName('');
                    setError(null);
                  }}
                  style={styles.photoButton}
                  testID="remove-close-up"
                >
                  <Text style={styles.photoButtonText}>Remove close-up</Text>
                </Pressable>
              </>
            ) : null}
            <View style={styles.photoActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={closeUp ? 'Retake close-up' : 'Take close-up'}
                disabled={actionBusy || isSavingIdentity}
                onPress={() => void handleCloseUp('camera')}
                style={styles.photoButton}
                testID="take-close-up"
              >
                <Feather name="camera" size={16} color={colors.foreground} />
                <Text style={styles.photoButtonText}>{closeUp ? 'Retake close-up' : 'Take close-up'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={closeUp ? 'Replace close-up from library' : 'Choose close-up from library'}
                disabled={actionBusy || isSavingIdentity}
                onPress={() => void handleCloseUp('library')}
                style={styles.photoButton}
                testID="choose-close-up"
              >
                <Feather name="image" size={16} color={colors.foreground} />
                <Text style={styles.photoButtonText}>{closeUp ? 'Replace close-up' : 'Choose close-up'}</Text>
              </Pressable>
            </View>
            <Text style={styles.status}>
              {closeUp ? '2 photos ready. ' : ''}Close-ups are temporary and won’t replace your saved photo.
              {' '}Photos are compressed on-device; up to 1.5 MB each, 3 MB combined.
            </Text>
          </View>
        ) : null}

        {photoUri ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleIdentify()}
            disabled={actionBusy || isSavingIdentity}
            style={({ pressed }) => [
              styles.action,
              actionBusy || isSavingIdentity ? styles.actionDisabled : null,
              { opacity: pressed ? 0.78 : undefined },
            ]}
            testID="identify-with-gemini"
          >
            {isIdentifying ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="search" size={16} color={colors.primaryForeground} />
            )}
            <Text style={styles.actionText}>
              {isIdentifying
                ? closeUp ? 'Checking both photos…' : 'Checking the photo…'
                : closeUp ? 'Identify with both photos' : 'Identify plant'}
            </Text>
          </Pressable>
        ) : null}

        {result ? (
          result.status === 'not_plant' ? (
            <View style={styles.card} testID="identification-uncertain">
              <Text style={styles.resultTitle}>Try another photo</Text>
              <Text style={styles.resultText}>{result.message}</Text>
            </View>
          ) : (
            <>
              <View
                style={styles.card}
                testID={result.status === 'identified' ? 'identification-result' : 'identification-uncertain'}
              >
                <Text style={styles.resultTitle}>
                  {result.status === 'identified'
                    ? 'Suggested plant'
                    : 'Couldn’t identify it confidently'}
                </Text>
                <Text style={styles.resultText}>{result.message}</Text>
                {result.status === 'identified' && result.description ? (
                  <Text style={styles.resultText} testID="plant-description">{result.description}</Text>
                ) : null}
                {result.confidence !== null ? (
                  <Text style={styles.confidence}>
                    Estimated confidence · {Math.round(result.confidence * 100)}%
                  </Text>
                ) : (
                  <Text style={styles.resultText}>Confidence estimate unavailable.</Text>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.resultTitle}>
                  {result.status === 'identified'
                    ? 'Confirm or correct the name'
                    : 'Enter the name yourself'}
                </Text>
                <Text style={styles.resultText}>
                  Review the names before saving them to {identity?.nickname || identity?.commonName || 'your plant'}’s profile.
                </Text>
                <Text style={styles.inputLabel}>Common name</Text>
                <TextInput
                  value={commonName}
                  onChangeText={setCommonName}
                  placeholder="e.g. Pothos"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => scientificInputRef.current?.focus()}
                  style={styles.input}
                  accessibilityLabel="Common plant name"
                  testID="edit-common-name"
                />
                <Text style={styles.inputLabel}>Scientific name (optional)</Text>
                <TextInput
                  ref={scientificInputRef}
                  value={scientificName}
                  onChangeText={setScientificName}
                  placeholder="e.g. Epipremnum aureum"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleConfirm()}
                  style={styles.input}
                  accessibilityLabel="Scientific plant name"
                  testID="edit-scientific-name"
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleConfirm()}
                  disabled={!commonName.trim() || !identityReady || isSavingIdentity || isIdentifying}
                  style={({ pressed }) => [
                    styles.action,
                    !commonName.trim() || !identityReady || isSavingIdentity
                      ? styles.actionDisabled
                      : null,
                    { opacity: pressed ? 0.78 : undefined },
                  ]}
                  testID="confirm-identification"
                >
                  {isSavingIdentity ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Feather name="check" size={17} color={colors.primaryForeground} />
                  )}
                  <Text style={styles.actionText}>
                    {isSavingIdentity ? 'Saving plant…' : 'Confirm plant'}
                  </Text>
                </Pressable>
                {identity?.commonName ? (
                  <Text style={styles.status}>
                    Current profile: {identity.commonName}. Saving replaces its plant name.
                  </Text>
                ) : null}
              </View>
            </>
          )
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" testID="identification-error">
            {error}
          </Text>
        ) : null}

        <Text style={styles.privacy}>
          Selected photos are sent securely to Gemini, or to Pl@ntNet if a backup is
          needed. They are not saved by this app’s backend. Your original photo
          stays on this device; close-ups are discarded when you leave this screen.
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

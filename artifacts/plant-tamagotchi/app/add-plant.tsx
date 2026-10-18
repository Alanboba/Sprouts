import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePlantIdentity } from '@/context/PlantIdentityContext';
import { useColors } from '@/hooks/useColors';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AddPlantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addPlant, isReady } = usePlantIdentity();
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scientificNameRef = useRef<TextInput>(null);

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8,
      paddingBottom: Platform.OS === 'web' ? 36 : Math.max(24, insets.bottom + 16),
      gap: 18,
    },
    back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 27, letterSpacing: -0.5 },
    intro: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 5 },
    card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 },
    label: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 12, marginTop: 4 },
    input: {
      minHeight: 48,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 10,
      color: colors.foreground,
      backgroundColor: colors.background,
      fontFamily: 'DMSans_400Regular',
      fontSize: 14,
    },
    hint: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
    sharedSensor: { padding: 14, borderRadius: 13, backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    sharedSensorText: { flex: 1, color: colors.secondaryForeground, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
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
  });

  const handleAddPlant = async () => {
    if (!commonName.trim()) {
      setError('Enter a common name for this plant.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await addPlant({ commonName, scientificName });
      router.back();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save this plant. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

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
          accessibilityLabel="Back to plant dashboard"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.65 : 1 }]}
          testID="back-to-plant-dashboard"
        >
          <Feather name="arrow-left" size={21} color={colors.foreground} />
        </Pressable>

        <View>
          <Text style={styles.title}>Add a plant</Text>
          <Text style={styles.intro}>
            Give this plant its own photo and care log. You can identify it with
            Gemini from the dashboard later.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Common name</Text>
          <TextInput
            value={commonName}
            onChangeText={setCommonName}
            placeholder="e.g. Monstera"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => scientificNameRef.current?.focus()}
            style={styles.input}
            accessibilityLabel="Common plant name"
            testID="new-plant-common-name"
          />
          <Text style={styles.label}>Scientific name (optional)</Text>
          <TextInput
            ref={scientificNameRef}
            value={scientificName}
            onChangeText={setScientificName}
            placeholder="e.g. Monstera deliciosa"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void handleAddPlant()}
            style={styles.input}
            accessibilityLabel="Scientific plant name"
            testID="new-plant-scientific-name"
          />
          <Text style={styles.hint}>
            Care dates start separately for each plant. Add a photo or identify
            this plant after saving.
          </Text>
        </View>

        <View style={styles.sharedSensor}>
          <Feather name="info" size={16} color={colors.secondaryForeground} />
          <Text style={styles.sharedSensorText}>
            The connected moisture sensor is shared. Its reading is not
            automatically assigned to a plant.
          </Text>
        </View>

        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => void handleAddPlant()}
          disabled={!isReady || isSaving}
          style={({ pressed }) => [
            styles.action,
            !isReady || isSaving ? styles.actionDisabled : null,
            { opacity: pressed ? 0.78 : undefined },
          ]}
          testID="save-new-plant"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="plus" size={17} color={colors.primaryForeground} />
          )}
          <Text style={styles.actionText}>{isSaving ? 'Adding plant…' : 'Add plant'}</Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

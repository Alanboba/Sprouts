import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePlantIdentity } from '@/context/PlantIdentityContext';
import { useColors } from '@/hooks/useColors';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EditPlantNameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { identity, isReady, saveNickname } = usePlantIdentity();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (identity) setNickname(identity.nickname ?? '');
  }, [identity?.id]);

  const save = async () => {
    if (!identity || saving) return;
    setError(null);
    setSaving(true);
    try {
      await saveNickname(identity.id, nickname);
      router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the nickname. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: insets.bottom + 32, gap: 18 },
    back: { minHeight: 42, width: 42, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.foreground, fontFamily: 'DMSans_700Bold', fontSize: 27, letterSpacing: -0.5 },
    body: { color: colors.mutedForeground, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19 },
    card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 10 },
    label: { color: colors.foreground, fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
    input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.input, borderRadius: 10, backgroundColor: colors.background, color: colors.foreground, fontFamily: 'DMSans_400Regular', fontSize: 16 },
    preview: { color: colors.primary, fontFamily: 'DMSans_500Medium', fontSize: 13 },
    action: { minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionText: { color: colors.primaryForeground, fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
    error: { color: colors.destructive, fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 18 },
  });

  return (
    <View style={styles.page}>
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} bottomOffset={70} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel nickname edit" onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={21} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>Name your plant</Text>
        <Text style={styles.body}>
          Choose any nickname you like. This won’t change your plant’s species or care records.
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>Plant nickname</Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="e.g. Milo"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Plant nickname"
            testID="plant-nickname-input"
            maxLength={50}
            editable={isReady && !saving}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            style={styles.input}
          />
          <Text style={styles.body}>Subtitle preview</Text>
          <Text style={styles.preview}>{nickname.trim() || 'Name'} · {identity?.commonName ?? 'Plant'}</Text>
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save plant nickname"
          testID="save-plant-nickname"
          disabled={!isReady || !identity || saving || !nickname.trim()}
          onPress={() => void save()}
          style={({ pressed }) => [styles.action, { opacity: !isReady || !identity || saving || !nickname.trim() || pressed ? 0.55 : 1 }]}
        >
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="check" size={17} color={colors.primaryForeground} />}
          <Text style={styles.actionText}>{saving ? 'Saving…' : 'Save nickname'}</Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

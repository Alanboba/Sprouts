import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlantIdentity } from '@/context/PlantIdentityContext';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Keep photos separate from care records so replacing a photo never resets care.
const PHOTO_KEY = 'plant-pal-photo-v1';
const DRAFT_PHOTO_KEY = `${PHOTO_KEY}:draft`;
const MAX_STORED_LENGTH = 1_500_000;
export type PlantPhotoSource = 'library' | 'camera';

interface PlantPhotoValue {
  photoUri: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  pickPhoto: (source?: PlantPhotoSource) => Promise<string | undefined>;
  removePhoto: () => Promise<void>;
  removePhotoForPlant: (plantId: string) => Promise<void>;
  restorePhotoForPlant: (plantId: string, photoUri: string) => Promise<void>;
}

const PlantPhotoContext = createContext<PlantPhotoValue | null>(null);

function releasePickerUrl(uri: string | undefined) {
  if (Platform.OS === 'web' && uri?.startsWith('blob:')) URL.revokeObjectURL(uri);
}

export function PlantPhotoProvider({ children }: { children: ReactNode }) {
  const { identity, plants, isReady } = usePlantIdentity();
  const photoKeyForPlant = useCallback(
    (plantId: string) =>
      plantId && plantId !== 'plant-default'
        ? `${PHOTO_KEY}:${plantId}`
        : PHOTO_KEY,
    [],
  );
  const photoKey = identity ? photoKeyForPlant(identity.id) : DRAFT_PHOTO_KEY;
  const activePhotoKey = useRef(photoKey);
  activePhotoKey.current = photoKey;
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!isReady) return;
    let mounted = true;
    setPhotoUri(null);
    setIsLoading(true);
    setError(null);
    AsyncStorage.getItem(photoKey)
      .then(async (stored) => {
        let saved = stored;
        // A photo can be chosen before the first profile exists. Attach it to
        // that first profile without sharing photos between existing plants.
        if (!saved && photoKey !== DRAFT_PHOTO_KEY && plants.length === 1) {
          const draft = await AsyncStorage.getItem(DRAFT_PHOTO_KEY);
          if (draft?.startsWith('data:image/jpeg;base64,') && mounted) {
            await AsyncStorage.setItem(photoKey, draft);
            saved = draft;
            if (mounted) setPhotoUri(draft);
            await AsyncStorage.removeItem(DRAFT_PHOTO_KEY);
          }
        }
        if (!mounted || !saved) return;
        if (!saved.startsWith('data:image/jpeg;base64,')) {
          throw new Error('Unreadable photo');
        }
        setPhotoUri(saved);
      })
      .catch(() => {
        if (mounted) {
          setError('Your saved photo could not be loaded. Please upload it again.');
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isReady, photoKey, plants.length]);

  const pickPhoto = useCallback(async (source: PlantPhotoSource = 'library') => {
    if (busy.current || isLoading) return;
    setError(null);

    // Launch directly from the tap, not an effect or after a permission await.
    // Modern system photo pickers grant access only to the selected image and
    // do not require broad access to the user's photo library.
    let selection: ImagePicker.ImagePickerResult;
    try {
      if (source === 'camera' && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(permission.canAskAgain
            ? 'Allow camera access to photograph and identify your plant, or choose an existing photo.'
            : 'Camera access is off. Enable it in device settings or choose an existing photo.');
          return;
        }
      }
      const options: Parameters<typeof ImagePicker.launchImageLibraryAsync>[0] = {
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.back,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
        exif: false,
      };
      selection =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
    } catch {
      setError(source === 'camera'
        ? 'Could not open the camera. Check camera access or choose an existing photo.'
        : 'Could not open or read the selected photo. Choose a supported image such as JPEG or PNG and try again.');
      return;
    }
    // Do not mark the chooser itself busy: some web browsers never resolve a
    // canceled file dialog. A subsequent tap must still be able to reopen it.
    if (selection.canceled) return;
    const asset = selection.assets[0];
    if (busy.current || activePhotoKey.current !== photoKey) {
      selection.assets.forEach((item) => releasePickerUrl(item.uri));
      return;
    }
    if (!asset?.uri) {
      setError('No photo was selected. Please choose an image.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 20 * 1024 * 1024) {
      releasePickerUrl(asset.uri);
      setError('Choose a photo smaller than 20 MB.');
      return;
    }
    if ((asset.type && asset.type !== 'image') ||
      (asset.mimeType && !asset.mimeType.startsWith('image/'))) {
      releasePickerUrl(asset.uri);
      setError('Choose an image, not a video or document.');
      return;
    }

    busy.current = true;
    setIsSaving(true);
    let encodedUri: string | undefined;
    try {
      // Store a bounded, durable JPEG, not a temporary picker/cache URI.
      // This also keeps native AsyncStorage entries below their size limit.
      const scale = Math.min(
        1,
        900 / (asset.width || 900),
        1200 / (asset.height || 1200),
      );
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width: Math.max(1, Math.round((asset.width || 900) * scale)) });
      const encoded = await (async () => {
        try {
          const image = await context.renderAsync();
          return await image.saveAsync({
            format: SaveFormat.JPEG,
            compress: 0.65,
            base64: true,
          });
        } catch {
          throw new Error('This image could not be read or converted. Choose a JPEG, PNG, or another photo supported by your device.');
        }
      })();
      encodedUri = encoded.uri;
      if (!encoded.base64) throw new Error('Could not read that photo.');
      const uri = `data:image/jpeg;base64,${encoded.base64}`;
      if (uri.length > MAX_STORED_LENGTH) {
        throw new Error('This photo is too large to save. Please choose a smaller image.');
      }
      // Commit before changing the preview. A failed replace keeps the old photo.
      try {
        await AsyncStorage.setItem(photoKey, uri);
      } catch {
        throw new Error('Could not save the photo on this device. Free some space and try again.');
      }
      if (activePhotoKey.current === photoKey) {
        setPhotoUri(uri);
        return uri;
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save that photo. Please try another image.',
      );
    } finally {
      releasePickerUrl(asset.uri);
      releasePickerUrl(encodedUri);
      busy.current = false;
      setIsSaving(false);
    }
  }, [isLoading, photoKey]);

  const removePhoto = useCallback(async () => {
    if (busy.current || isLoading) return;
    busy.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await AsyncStorage.removeItem(photoKey);
      setPhotoUri(null);
    } catch {
      setError('Could not remove the photo. Please try again.');
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }, [isLoading, photoKey]);

  const removePhotoForPlant = useCallback(
    async (plantId: string) => {
      if (busy.current || isLoading) {
        throw new Error('Wait for the photo to finish loading or saving, then try again.');
      }
      busy.current = true;
      setIsSaving(true);
      setError(null);
      try {
        await AsyncStorage.removeItem(photoKeyForPlant(plantId));
        if (identity?.id === plantId) setPhotoUri(null);
      } catch {
        throw new Error('Could not remove the saved plant photo. Please try again.');
      } finally {
        busy.current = false;
        setIsSaving(false);
      }
    },
    [identity?.id, isLoading, photoKeyForPlant],
  );

  const restorePhotoForPlant = useCallback(
    async (plantId: string, uri: string) => {
      try {
        await AsyncStorage.setItem(photoKeyForPlant(plantId), uri);
        if (identity?.id === plantId) setPhotoUri(uri);
      } catch {
        throw new Error('Could not restore the saved plant photo.');
      }
    },
    [identity?.id, photoKeyForPlant],
  );

  const value = useMemo(
    () => ({
      photoUri,
      isLoading,
      isSaving,
      error,
      pickPhoto,
      removePhoto,
      removePhotoForPlant,
      restorePhotoForPlant,
    }),
    [
      photoUri,
      isLoading,
      isSaving,
      error,
      pickPhoto,
      removePhoto,
      removePhotoForPlant,
      restorePhotoForPlant,
    ],
  );

  return createElement(PlantPhotoContext.Provider, { value }, children);
}

export function usePlantPhoto() {
  const context = useContext(PlantPhotoContext);
  if (!context) {
    throw new Error('usePlantPhoto must be used within PlantPhotoProvider');
  }
  return context;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Keep photos separate from care records so replacing a photo never resets care.
const PHOTO_KEY = 'plant-pal-photo-v1';
const MAX_STORED_LENGTH = 1_500_000;
export type PlantPhotoSource = 'library' | 'camera';

interface PlantPhotoValue {
  photoUri: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  pickPhoto: (source?: PlantPhotoSource) => Promise<void>;
  removePhoto: () => Promise<void>;
}

const PlantPhotoContext = createContext<PlantPhotoValue | null>(null);

export function PlantPhotoProvider({ children }: { children: ReactNode }) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PHOTO_KEY)
      .then((saved) => {
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
  }, []);

  const pickPhoto = useCallback(async (source: PlantPhotoSource = 'library') => {
    if (busy.current || isLoading) return;
    setError(null);

    // Launch directly from the tap, not an effect or after a permission await.
    // Modern system photo pickers grant access only to the selected image and
    // do not require broad access to the user's photo library.
    let selection: ImagePicker.ImagePickerResult;
    try {
      const options: Parameters<typeof ImagePicker.launchImageLibraryAsync>[0] = {
        mediaTypes: ['images'],
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
      setError('Could not open your photo library. Please try again.');
      return;
    }
    // Do not mark the chooser itself busy: some web browsers never resolve a
    // canceled file dialog. A subsequent tap must still be able to reopen it.
    if (selection.canceled || busy.current) return;
    const asset = selection.assets[0];
    if (!asset?.uri) {
      setError('No photo was selected. Please choose an image.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 20 * 1024 * 1024) {
      setError('Choose a photo smaller than 20 MB.');
      return;
    }

    busy.current = true;
    setIsSaving(true);
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
      const image = await context.renderAsync();
      const encoded = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.65,
        base64: true,
      });
      if (!encoded.base64) throw new Error('Could not read that photo.');
      const uri = `data:image/jpeg;base64,${encoded.base64}`;
      if (uri.length > MAX_STORED_LENGTH) {
        throw new Error('This photo is too large to save. Please choose a smaller image.');
      }
      // Commit before changing the preview. A failed replace keeps the old photo.
      try {
        await AsyncStorage.setItem(PHOTO_KEY, uri);
      } catch {
        throw new Error('Could not save the photo on this device. Free some space and try again.');
      }
      setPhotoUri(uri);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save that photo. Please try another image.',
      );
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }, [isLoading]);

  const removePhoto = useCallback(async () => {
    if (busy.current || isLoading) return;
    busy.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await AsyncStorage.removeItem(PHOTO_KEY);
      setPhotoUri(null);
    } catch {
      setError('Could not remove the photo. Please try again.');
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }, [isLoading]);

  const value = useMemo(
    () => ({ photoUri, isLoading, isSaving, error, pickPhoto, removePhoto }),
    [photoUri, isLoading, isSaving, error, pickPhoto, removePhoto],
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

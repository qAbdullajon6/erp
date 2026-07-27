import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File, Directory, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import { usePodDraftStore, type PodDraftPhoto } from '@/store/pod-draft-store';

/** Wide enough for a legible proof-of-delivery photo, small enough that a driver
 * on a weak connection won't dread the eventual upload — 1600px / 70% JPEG
 * quality is the same ballpark most fleet apps compress to. */
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.7;
/** Metadata only, captured best-effort — a POD photo shouldn't be blocked on a
 * slow GPS fix, so this gives up quickly and just omits location rather than
 * making the driver wait. */
const LOCATION_TIMEOUT_MS = 4000;

function podDraftsDirectory(): Directory {
  const dir = new Directory(Paths.document, 'pod-drafts');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

async function getBestEffortLocation(): Promise<{ latitude: number; longitude: number } | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;

  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);
    if (!result) return null;
    return { latitude: result.coords.latitude, longitude: result.coords.longitude };
  } catch {
    return null;
  }
}

async function processAndStore(pickedUri: string, dispatchId: string): Promise<PodDraftPhoto> {
  const manipulated = await manipulateAsync(pickedUri, [{ resize: { width: MAX_WIDTH } }], {
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  const sourceFile = new File(manipulated.uri);
  const destFile = new File(podDraftsDirectory(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  await sourceFile.copy(destFile);

  const location = await getBestEffortLocation();

  const photo: PodDraftPhoto = {
    id: destFile.uri,
    uri: destFile.uri,
    width: manipulated.width,
    height: manipulated.height,
    fileSizeBytes: destFile.size,
    capturedAt: new Date().toISOString(),
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
  };

  usePodDraftStore.getState().addPhoto(dispatchId, photo);
  return photo;
}

export async function capturePodPhotoFromCamera(dispatchId: string): Promise<PodDraftPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled) return null;

  return processAndStore(result.assets[0].uri, dispatchId);
}

export async function capturePodPhotosFromLibrary(dispatchId: string): Promise<PodDraftPhoto[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
  });
  if (result.canceled) return [];

  const photos: PodDraftPhoto[] = [];
  for (const asset of result.assets) {
    photos.push(await processAndStore(asset.uri, dispatchId));
  }
  return photos;
}

export function deletePodDraftPhoto(dispatchId: string, photo: PodDraftPhoto) {
  usePodDraftStore.getState().removePhoto(dispatchId, photo.id);
  const file = new File(photo.uri);
  if (file.exists) file.delete();
}

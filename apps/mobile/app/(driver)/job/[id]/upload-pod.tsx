import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Camera, ImagePlus, MapPin, MapPinOff, Trash2 } from 'lucide-react-native';
import { Button, EmptyState, Header } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { usePodDraftStore, type PodDraftPhoto } from '@/store/pod-draft-store';
import { capturePodPhotoFromCamera, capturePodPhotosFromLibrary, deletePodDraftPhoto } from '@/services/pod/pod-capture';
import { formatScheduled } from '@/features/jobs/lib/format';
import { PodUnavailableNotice } from '@/features/pod/components/pod-unavailable-notice';

// Stable reference — `state.photosByDispatch[id] ?? []` would otherwise hand
// zustand's useSyncExternalStore a NEW array on every single read, which never
// compares equal to the previous snapshot and triggers an infinite render loop
// (verified live: this exact bug threw "Maximum update depth exceeded" before
// the fallback was hoisted out to a module-level constant).
const EMPTY_PHOTOS: PodDraftPhoto[] = [];

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PhotoThumbnail({ photo, dispatchId }: { photo: PodDraftPhoto; dispatchId: string }) {
  return (
    <View className="w-[31%] gap-1.5">
      <View className="relative">
        <Image source={{ uri: photo.uri }} className="aspect-square w-full rounded-lg" resizeMode="cover" />
        <Pressable
          onPress={() => deletePodDraftPhoto(dispatchId, photo)}
          accessibilityLabel="Delete photo"
          className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60"
        >
          <Trash2 color="white" size={13} />
        </Pressable>
      </View>
      <View className="flex-row items-center gap-1">
        {photo.latitude !== null ? (
          <MapPin color={colors.success} size={10} />
        ) : (
          <MapPinOff color={colors.mutedForeground} size={10} />
        )}
        <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
          {formatScheduled(photo.capturedAt)}
        </Text>
      </View>
      {photo.fileSizeBytes !== null && (
        <Text className="text-[10px] text-muted-foreground">{formatFileSize(photo.fileSizeBytes)}</Text>
      )}
    </View>
  );
}

export default function UploadPodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const photos = usePodDraftStore((state) => state.photosByDispatch[id] ?? EMPTY_PHOTOS);
  const [isCapturing, setIsCapturing] = useState(false);

  const runCapture = async (fn: () => Promise<unknown>) => {
    setIsCapturing(true);
    try {
      await fn();
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Header title="Upload proof of delivery" subtitle={`${photos.length} photo${photos.length === 1 ? '' : 's'}`} showBack />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2">
        <PodUnavailableNotice />

        {photos.length === 0 ? (
          <EmptyState
            icon={<ImagePlus color={colors.mutedForeground} size={28} />}
            title="No photos yet"
            description="Capture or choose photos below — they're compressed and saved on your device with the time and location they were taken."
          />
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {photos.map((photo) => (
              <PhotoThumbnail key={photo.id} photo={photo} dispatchId={id} />
            ))}
          </View>
        )}

        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            loading={isCapturing}
            onPress={() => runCapture(() => capturePodPhotoFromCamera(id))}
          >
            <Camera color={colors.foreground} size={16} />
            <Text className="ml-2 font-display text-sm font-semibold text-foreground">Camera</Text>
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            loading={isCapturing}
            onPress={() => runCapture(() => capturePodPhotosFromLibrary(id))}
          >
            <ImagePlus color={colors.foreground} size={16} />
            <Text className="ml-2 font-display text-sm font-semibold text-foreground">Photo library</Text>
          </Button>
        </View>

        <Button
          label={photos.length > 0 ? `Upload ${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'Upload'}
          disabled
          className="mt-2"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

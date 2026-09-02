export const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"] as const;

export type StagedImageState = {
  draft: string | null;
  saved: string | null;
};

export function isSupportedImageMimeType(value: string | null | undefined) {
  return Boolean(value && SUPPORTED_IMAGE_MIME_TYPES.includes(value as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]));
}

export function emptyStagedImage(saved: string | null = null): StagedImageState {
  return { draft: null, saved };
}

export function selectStagedImage(state: StagedImageState, dataUrl: string): StagedImageState {
  return { ...state, draft: dataUrl };
}

export function confirmStagedImage(state: StagedImageState): StagedImageState {
  return { draft: null, saved: state.draft ?? state.saved };
}

export function cancelStagedImage(state: StagedImageState): StagedImageState {
  return { ...state, draft: null };
}

export function removeStagedImage(): StagedImageState {
  return { draft: null, saved: null };
}

export function previewStagedImage(state: StagedImageState) {
  return state.draft ?? state.saved;
}

export function isStagedImageDirty(state: StagedImageState) {
  return Boolean(state.draft && state.draft !== state.saved);
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isSupportedImageMimeType(file.type)) {
      reject(new Error("unsupported-image-type"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("image-read-failed"));
    };
    reader.onerror = () => reject(new Error("image-read-failed"));
    reader.readAsDataURL(file);
  });
}

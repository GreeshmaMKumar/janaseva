import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  if (!header || !base64) {
    throw new Error('Invalid image data URL provided for Storage upload.');
  }
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function uploadComplaintEvidenceToStorage(params: {
  citizenUid: string;
  complaintId: string;
  dataUrl: string;
  kind: 'evidence' | 'resolution';
}): Promise<{
  evidenceUrl: string;
  storagePath: string;
  usedFallbackInline: boolean;
  storageWarning?: string;
}> {
  if (!params.dataUrl) {
    return { evidenceUrl: '', storagePath: '', usedFallbackInline: false };
  }

  // Already an HTTPS Storage URL
  if (params.dataUrl.startsWith('https://')) {
    return { evidenceUrl: params.dataUrl, storagePath: '', usedFallbackInline: false };
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authenticated Firebase user required to upload evidence to Firebase Storage.');
  }

  const safeUid = params.citizenUid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const safeComplaintId = params.complaintId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const storagePath = `complaints/${safeUid}/${safeComplaintId}/${params.kind}_${Date.now()}.jpg`;
  const storageRef = ref(storage, storagePath);

  try {
    const blob = dataUrlToBlob(params.dataUrl);
    await uploadBytes(storageRef, blob, {
      contentType: blob.type || 'image/jpeg',
      customMetadata: {
        uploadedByUid: currentUser.uid,
        complaintId: safeComplaintId,
        kind: params.kind,
      },
    });
    const downloadUrl = await getDownloadURL(storageRef);
    console.info(`[JANASEVA Storage] Uploaded ${params.kind} image to ${storagePath}`);
    return {
      evidenceUrl: downloadUrl,
      storagePath,
      usedFallbackInline: false,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[JANASEVA Storage] Upload to ${storagePath} failed (${msg}). Falling back to inline compressed evidence so complaint submission is not blocked.`
    );
    return {
      evidenceUrl: '',
      storagePath,
      usedFallbackInline: true,
      storageWarning: msg,
    };
  }
}

import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera'
import { IS_NATIVE } from '@/lib/native'

// Native front-camera selfie capture. Returns a Blob so it can flow into
// the same upload path the web <input type="file" capture="user"> uses.
// Callers should first check `IS_NATIVE`; on web use the file input.
export async function captureNativeSelfie(): Promise<Blob> {
  if (!IS_NATIVE) {
    throw new Error('captureNativeSelfie called on non-native runtime')
  }
  const perm = await Camera.checkPermissions()
  if (perm.camera !== 'granted') {
    const req = await Camera.requestPermissions({ permissions: ['camera'] })
    if (req.camera !== 'granted') {
      throw new Error('Camera permission was denied.')
    }
  }
  const photo = await Camera.getPhoto({
    quality: 70,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    direction: CameraDirection.Front,
    correctOrientation: true,
    // Avoid the OS "Save to Photos" dialog. We only want the bytes.
    saveToGallery: false,
  })
  if (!photo.base64String) {
    throw new Error('Camera returned no image data.')
  }
  const mime = 'image/' + (photo.format ?? 'jpeg')
  return base64ToBlob(photo.base64String, mime)
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

import { deleteUnreferencedMediaUrls } from "@genealogiq/services/media-storage"

export async function deleteBlobs(urls: (string | null | undefined)[]) {
  await deleteUnreferencedMediaUrls(urls)
}

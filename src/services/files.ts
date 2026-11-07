import { Capacitor } from "@capacitor/core";
import { FileOpener } from "@capawesome-team/capacitor-file-opener";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import { showToast } from "./toast";

export interface FilePayload {
  /** Plain text content (CSV, JSON...). */
  text?: string;
  /** Base64 encoded binary content (XLSX, PDF...). */
  base64?: string;
}

interface SaveTarget {
  directory: Directory;
  path: (fileName: string) => string;
  label: string;
}

const TARGETS: SaveTarget[] = [
  {
    directory: Directory.ExternalStorage,
    path: fileName => `Download/${fileName}`,
    label: "Downloads"
  },
  {
    directory: Directory.Documents,
    path: fileName => `MaxLedger/${fileName}`,
    label: "Documents/MaxLedger"
  }
];

function toBlobPart(payload: FilePayload): BlobPart {
  if (payload.base64 !== undefined) {
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes as BlobPart;
  }

  return payload.text ?? "";
}

function uriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

async function openSavedFile(uri: string, mimeType: string): Promise<void> {
  try {
    await FileOpener.openFile({ path: uriToPath(uri), mimeType });
  } catch (error) {
    console.warn("Could not open file:", error);
    showToast(
      "No app found to open this file. Use Share, or open it from your Files app."
    );
  }
}

async function shareSavedFile(uri: string): Promise<void> {
  try {
    await Share.share({
      title: "MaxLedger Export",
      text: "Your MaxLedger export",
      files: [uri],
      dialogTitle: "Share file"
    });
  } catch (error) {
    // Closing the share sheet is not an error.
    console.warn("Share closed:", error);
  }
}

async function writeTo(
  target: SaveTarget,
  fileName: string,
  payload: FilePayload,
  mimeType: string
): Promise<boolean> {
  try {
    const result = await Filesystem.writeFile({
      path: target.path(fileName),
      data: payload.base64 ?? payload.text ?? "",
      directory: target.directory,
      recursive: true,
      ...(payload.base64 !== undefined ? {} : { encoding: Encoding.UTF8 })
    });

    showToast(`Saved to ${target.label}: ${fileName}`, {
      actions: [
        { label: "Open", onClick: () => openSavedFile(result.uri, mimeType) },
        { label: "Share", onClick: () => shareSavedFile(result.uri) }
      ]
    });

    return true;
  } catch (error) {
    console.warn(`Could not save to ${target.label}:`, error);

    return false;
  }
}

/**
 * Saves a file straight to the device (Downloads, then Documents) without
 * opening the share sheet. If storage is not writable it falls back to the
 * share sheet so an export never silently fails. In a browser it downloads
 * the file normally.
 */
export async function saveFileToDevice(
  fileName: string,
  payload: FilePayload,
  mimeType: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([toBlobPart(payload)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Downloaded: ${fileName}`);

    return;
  }

  if (await writeTo(TARGETS[0], fileName, payload, mimeType)) return;

  // Older Android versions may need the storage permission first.
  try {
    await Filesystem.requestPermissions();
  } catch {
    // Not supported / already decided; carry on with the fallbacks.
  }

  if (await writeTo(TARGETS[0], fileName, payload, mimeType)) return;
  if (await writeTo(TARGETS[1], fileName, payload, mimeType)) return;

  const file = await Filesystem.writeFile({
    path: fileName,
    data: payload.base64 ?? payload.text ?? "",
    directory: Directory.Cache,
    ...(payload.base64 !== undefined ? {} : { encoding: Encoding.UTF8 })
  });

  await Share.share({
    title: "MaxLedger Export",
    text: "Your MaxLedger export",
    files: [file.uri],
    dialogTitle: "Save or share file"
  });
}

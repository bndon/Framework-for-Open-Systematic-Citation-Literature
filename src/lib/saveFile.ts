import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeExportFile } from "./api";

function browserDownload(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ask where to save, then write a text file. Returns the path (or the file name for a plain
 * browser download), or null if the user cancelled.
 */
export async function saveTextFile(
  defaultName: string,
  content: string,
  filter: { name: string; extensions: string[] },
  mime = "text/plain"
): Promise<string | null> {
  let target: string | null = null;
  try {
    target = await saveDialog({ defaultPath: defaultName, filters: [filter] });
  } catch {
    // no native dialog available (running in a plain browser): fall back to a download
    browserDownload(defaultName, content, mime);
    return defaultName;
  }
  if (!target) return null;
  await writeExportFile(target, new TextEncoder().encode(content));
  return target;
}

/** Read a text file the user picks (BibTeX, RIS, ...). Returns null if cancelled. */
export async function pickTextFile(extensions: string[]): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.map((e) => "." + e).join(",");
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, text: await f.text() });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}


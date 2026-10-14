/**
 * lib/pending-files.ts — the composer's attachment queue.
 *   npx tsx scripts/test-pending-files.ts
 */
import assert from "node:assert/strict";
import { MAX_PENDING_FILES, isSendableFile, mergePendingFiles } from "../lib/pending-files";

const file = (name: string, type: string, size = 1000, lastModified = 1_700_000_000_000) =>
  new File([new Uint8Array(size)], name, { type, lastModified });

// What may go
assert.equal(isSendableFile(file("a.jpg", "image/jpeg")), true);
assert.equal(isSendableFile(file("a.heic", "image/heic")), true, "a phone photo is resized client-side");
assert.equal(isSendableFile(file("a.mp4", "video/mp4")), true);
assert.equal(isSendableFile(file("a.bmp", "image/bmp")), false, "the server would refuse it");
assert.equal(isSendableFile(file("a.webm", "video/webm")), false);
assert.equal(isSendableFile(file("a.pdf", "application/pdf")), false);

// A plain batch goes in, in order
{
  const r = mergePendingFiles([], [file("a.jpg", "image/jpeg"), file("b.png", "image/png")]);
  assert.deepEqual(r.next.map((f) => f.name), ["a.jpg", "b.png"]);
  assert.equal(r.skipped, false);
  assert.equal(r.full, false);
}

// Something that isn't a photo or video is skipped, and the rest still go
{
  const r = mergePendingFiles([], [file("a.pdf", "application/pdf"), file("b.png", "image/png")]);
  assert.deepEqual(r.next.map((f) => f.name), ["b.png"]);
  assert.equal(r.skipped, true);
}

// The cap cuts the batch short and says so
{
  const many = Array.from({ length: MAX_PENDING_FILES + 2 }, (_, i) => file(`p${i}.jpg`, "image/jpeg", 100 + i));
  const r = mergePendingFiles([], many);
  assert.equal(r.next.length, MAX_PENDING_FILES);
  assert.equal(r.full, true);
}

// A full queue stays the same array (callers compare by reference to skip a re-render)
{
  const current = Array.from({ length: MAX_PENDING_FILES }, (_, i) => file(`p${i}.jpg`, "image/jpeg", 100 + i));
  const r = mergePendingFiles(current, [file("z.jpg", "image/jpeg")]);
  assert.equal(r.next, current);
  assert.equal(r.full, true);
}

// The same photo twice — picked again, or dropped then pasted — stages once
{
  const a = file("IMG_1.jpg", "image/jpeg", 4321);
  const again = file("IMG_1.jpg", "image/jpeg", 4321);
  const r = mergePendingFiles([a], [again, file("IMG_2.jpg", "image/jpeg", 999)]);
  assert.deepEqual(r.next.map((f) => f.name), ["IMG_1.jpg", "IMG_2.jpg"]);
  assert.equal(r.full, false, "a duplicate does not count against the cap");
  assert.equal(r.skipped, false, "a duplicate is not a wrong kind of file");
  const same = mergePendingFiles([a], [again]);
  assert.equal(same.next.length, 1, "nothing new");
}

// Two different screenshots pasted the same minute share a name but not a size
{
  const r = mergePendingFiles([file("Pasted 2026-10-14 09.15.png", "image/png", 5000)], [file("Pasted 2026-10-14 09.15.png", "image/png", 7000)]);
  assert.equal(r.next.length, 2);
}

console.log("pending-files: all assertions passed");

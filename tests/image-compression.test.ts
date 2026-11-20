import test from 'node:test';
import assert from 'node:assert/strict';
import { compressImage } from '../src/lib/imageCompression';

test('Image Compression Utility: gracefully handles environment and option parameters', async () => {
  // In Node.js environment without DOM, compressImage resolves with the file
  const buffer = Buffer.from('mock-image-bytes');
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const mockFile = new File([blob], 'test-camera-photo.jpg', { type: 'image/jpeg' });

  const result = await compressImage(mockFile, {
    maxWidth: 1600,
    maxHeight: 2000,
    quality: 0.85,
  });

  assert.ok(result);
  assert.strictEqual(result.file.name, 'test-camera-photo.jpg');
  assert.strictEqual(result.file.type, 'image/jpeg');
});

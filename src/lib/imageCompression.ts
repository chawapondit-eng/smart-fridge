/**
 * Client-Side Image Compression & Resizing Utility
 * บีบอัดและปรับขนาดรูปภาพอัตโนมัติฝั่ง Client ด้วย HTML5 Canvas
 * 
 * ประโยชน์:
 * 1. รองรับรูปถ่ายจากกล้องมือถือจริง (5MB - 15MB+) ให้เล็กลงเหลือ ~100KB - 500KB
 * 2. ป้องกันข้อผิดพลาด HTTP 413 Payload Too Large ของ Vercel / Cloud Serverless
 * 3. ป้องกันปัญหา "ขนาดรูปภาพต้องไม่เกิน 2MB" เมื่อเพิ่มวัตถุดิบ
 * 4. รักษาความคมชัดของตัวหนังสือและรายละเอียดสำหรับ OCR และการแสดงผล
 */

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
}

export interface CompressResult {
  file: File;
  dataUrl: string;
  size: number;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.85,
    mimeType = 'image/jpeg',
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return resolve({
        file,
        dataUrl: '',
        size: file.size,
        width: 0,
        height: 0,
      });
    }

    if (!file.type.startsWith('image/')) {
      return reject(new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ'));
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้ กรุณาลองใหม่อีกครั้ง'));
    };

    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) {
        return reject(new Error('ไม่พบข้อมูลรูปภาพ'));
      }

      const img = new Image();

      img.onerror = () => {
        reject(new Error('รูปแบบรูปภาพไม่ถูกต้อง หรือไฟล์เสียหาย'));
      };

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // คำนวณขนาดใหม่โดยรักษาอัตราส่วนเดิม (Aspect Ratio)
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback หากอุปกรณ์ไม่รองรับ 2D context
          return resolve({
            file,
            dataUrl: src,
            size: file.size,
            width: img.width,
            height: img.height,
          });
        }

        // วาดภาพลง Canvas ด้วยการปรับความคมชัด
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // แปลงเป็น Data URL
        const dataUrl = canvas.toDataURL(mimeType, quality);

        // แปลงเป็น Blob / File
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve({
                file,
                dataUrl,
                size: file.size,
                width,
                height,
              });
            }

            const cleanFileName = file.name
              ? file.name.replace(/\.[^/.]+$/, '') + '.jpg'
              : 'camera-photo.jpg';

            const compressedFile = new File([blob], cleanFileName, {
              type: mimeType,
              lastModified: Date.now(),
            });

            resolve({
              file: compressedFile,
              dataUrl,
              size: blob.size,
              width,
              height,
            });
          },
          mimeType,
          quality
        );
      };

      img.src = src;
    };

    reader.readAsDataURL(file);
  });
}

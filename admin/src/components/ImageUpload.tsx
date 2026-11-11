import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Upload } from 'antd';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../lib/api';
import type { Media } from '../lib/types';

/** Form-compatible (value/onChange) single image picker that uploads to the local media library. */
export default function ImageUpload({
  value,
  onChange,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  preview = 'wide',
}: {
  value?: string;
  onChange?: (url: string) => void;
  /** File types the picker offers; the API accepts the same set for every image. */
  accept?: string;
  /** "wide" (banners, logos) or "square" (favicon, avatars) preview shape. */
  preview?: 'wide' | 'square';
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const box: CSSProperties = preview === 'square' ? { width: 72, height: 72 } : { width: 120, height: 68 };

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const m = await api.post<Media>('/api/admin/media', fd);
      onChange?.(m.url);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'آپلود ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {value ? (
        <img src={value} alt="" style={{ ...box, objectFit: preview === 'square' ? 'contain' : 'cover', borderRadius: 8, background: '#eee' }} />
      ) : (
        <div style={{ ...box, borderRadius: 8, background: '#f0f0f0', display: 'grid', placeItems: 'center', color: '#999', fontSize: 12 }}>
          بدون تصویر
        </div>
      )}
      <Upload
        accept={accept}
        showUploadList={false}
        beforeUpload={(f) => {
          void upload(f);
          return false;
        }}
      >
        <Button icon={<UploadOutlined />} loading={busy}>
          {value ? 'تغییر' : 'آپلود'}
        </Button>
      </Upload>
      {value && <Button danger icon={<DeleteOutlined />} onClick={() => onChange?.('')} />}
    </div>
  );
}

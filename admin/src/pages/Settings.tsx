import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, InputNumber, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toAscii } from '../lib/format';

type Values = {
  'site.name.fa': string;
  'site.name.en': string;
  'site.description.fa': string;
  'site.description.en': string;
  'shop.shipping_cost': number;
  'shop.low_stock_threshold': number;
  'site.shop3d_enabled': boolean;
  'site.assistant_enabled': boolean;
  'site.map_enabled': boolean;
  'site.map_tile_url': string;
  'site.map_center_lat': number;
  'site.map_center_lng': number;
  'site.map_zoom': number;
};

const DEFAULT_TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function SettingsPage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canEdit = can('settings.manage');
  const qc = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, string | null>>('/api/admin/settings') });

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      'site.name.fa': data['site.name.fa'] ?? '',
      'site.name.en': data['site.name.en'] ?? '',
      'site.description.fa': data['site.description.fa'] ?? '',
      'site.description.en': data['site.description.en'] ?? '',
      'shop.shipping_cost': Number(data['shop.shipping_cost'] ?? 0),
      'shop.low_stock_threshold': Number(data['shop.low_stock_threshold'] ?? 5),
      // on unless explicitly turned off (matches the storefront)
      'site.shop3d_enabled': data['site.shop3d_enabled'] !== 'false',
      'site.assistant_enabled': data['site.assistant_enabled'] !== 'false',
      'site.map_enabled': data['site.map_enabled'] === 'true',
      'site.map_tile_url': data['site.map_tile_url'] || DEFAULT_TILE,
      'site.map_center_lat': Number(data['site.map_center_lat'] ?? 35.6892),
      'site.map_center_lng': Number(data['site.map_center_lng'] ?? 51.389),
      'site.map_zoom': Number(data['site.map_zoom'] ?? 12),
    });
  }, [data, form]);

  async function onFinish(v: Values) {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) body[k] = typeof val === 'boolean' ? String(val) : String(val ?? '');
      body['site.map_tile_url'] = toAscii(v['site.map_tile_url'] ?? '').trim() || DEFAULT_TILE;
      await api.put('/api/admin/settings', body);
      message.success('تنظیمات ذخیره شد');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>تنظیمات</h1>
      </div>
      {!canEdit && <Alert type="info" showIcon message="شما اجازه‌ی تغییر تنظیمات را ندارید." style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" onFinish={onFinish} disabled={!canEdit} style={{ maxWidth: 680 }}>
        <Card title="اطلاعات سایت" style={{ marginBottom: 16 }}>
          <Form.Item name="site.name.fa" label="نام فروشگاه (فارسی)">
            <Input />
          </Form.Item>
          <Form.Item name="site.name.en" label="Shop name (English)">
            <Input dir="ltr" />
          </Form.Item>
          <Form.Item name="site.description.fa" label="توضیح کوتاه (فارسی)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="site.description.en" label="Description (English)">
            <Input.TextArea rows={2} dir="ltr" />
          </Form.Item>
        </Card>

        <Card title="فروشگاه" style={{ marginBottom: 16 }}>
          <Form.Item name="shop.shipping_cost" label="هزینه ثابت ارسال (تومان)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="shop.low_stock_threshold" label="آستانه هشدار موجودی کم">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Card>

        <Card title="امکانات فروشگاه" style={{ marginBottom: 16 }}>
          <Form.Item name="site.shop3d_enabled" label="فروشگاه سه‌بعدی" valuePropName="checked" extra="لینک «فروشگاه سه‌بعدی» در نوار دسته‌بندی‌ها نمایش داده می‌شود.">
            <Switch checkedChildren="روشن" unCheckedChildren="خاموش" />
          </Form.Item>
          <Form.Item
            name="site.assistant_enabled"
            label="دستیار فروشگاه (چت)"
            valuePropName="checked"
            extra="دستیار محلی که محصول پیدا می‌کند، بر اساس خریدهای قبلی پیشنهاد می‌دهد و وضعیت سفارش را می‌گوید."
          >
            <Switch checkedChildren="روشن" unCheckedChildren="خاموش" />
          </Form.Item>
        </Card>

        <Card title="آدرس تحویل روی نقشه (OpenStreetMap)" style={{ marginBottom: 16 }}>
          <Form.Item
            name="site.map_enabled"
            label="درخواست آدرس روی نقشه از مشتری"
            valuePropName="checked"
            extra="اگر روشن باشد، هنگام اولین ورود به فروشگاه از مشتری خواسته می‌شود موقعیت تحویل را روی نقشه مشخص کند؛ موقعیت همراه سفارش ذخیره می‌شود. اگر خاموش باشد، هیچ نقشه‌ای نمایش داده نمی‌شود."
          >
            <Switch checkedChildren="روشن" unCheckedChildren="خاموش" />
          </Form.Item>

          <Form.Item
            name="site.map_tile_url"
            label="آدرس کاشی‌های نقشه (Tile URL)"
            extra={
              <>
                پیش‌فرض سرور عمومی OpenStreetMap است که تصاویر نقشه را از اینترنت می‌گیرد. برای اجرای کاملاً محلی، آدرس سرور کاشی داخلی خود را بنویسید
                (با {'{z}/{x}/{y}'}) و متغیر محیطی <b dir="ltr">MAP_TILE_ORIGIN</b> را در فروشگاه (storefront) روی همان origin تنظیم کنید، وگرنه مرورگر
                تصاویر را مسدود می‌کند.
              </>
            }
          >
            <Input dir="ltr" placeholder={DEFAULT_TILE} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Form.Item name="site.map_center_lat" label="عرض جغرافیایی مرکز نقشه">
              <InputNumber min={-90} max={90} step={0.0001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="site.map_center_lng" label="طول جغرافیایی مرکز نقشه">
              <InputNumber min={-180} max={180} step={0.0001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="site.map_zoom" label="بزرگنمایی اولیه (۳ تا ۱۸)">
              <InputNumber min={3} max={18} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Card>

        <Button type="primary" htmlType="submit" loading={saving}>
          ذخیره تنظیمات
        </Button>
      </Form>
    </>
  );
}

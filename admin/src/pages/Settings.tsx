import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, InputNumber, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import ColorField from '../components/ColorField';
import ImageUpload from '../components/ImageUpload';
import { useAuth } from '../lib/auth';
import { toAscii } from '../lib/format';

type Values = {
  'site.name.fa': string;
  'site.name.en': string;
  'site.description.fa': string;
  'site.description.en': string;
  'shop.shipping_cost': number;
  'shop.low_stock_threshold': number;
  'site.logo_url': string;
  'site.favicon_url': string;
  'site.shop3d_enabled': boolean;
  'site.shop3d_login_required': boolean;
  'site.shop3d_daily_minutes': number;
  'site.assistant_enabled': boolean;
  'site.map_enabled': boolean;
  'site.map_tile_url': string;
  'site.map_center_lat': number;
  'site.map_center_lng': number;
  'site.map_zoom': number;
  'site.header_preset': 'brand' | 'dark' | 'light' | 'warm';
  'site.header_height': number;
  'site.header_logo_height': number;
  'site.header_search_width': number;
  'site.header_icon_size': number;
  'site.header_cart_height': number;
  'site.header_bg_color': string;
  'site.header_text_color': string;
  'site.header_accent_color': string;
  'site.strip_enabled': boolean;
  'site.strip_text.fa': string;
  'site.strip_text.en': string;
  'site.strip_note.fa': string;
  'site.strip_note.en': string;
  'site.strip_lang_visible': boolean;
  'site.test_mode_enabled': boolean;
  'site.test_mode_ribbon.fa': string;
  'site.test_mode_ribbon.en': string;
  'site.payment_enabled': boolean;
  'payment.gateway': string;
  'payment.zarinpal.merchant_id': string;
  'payment.zarinpal.sandbox': boolean;
  'payment.zibal.merchant': string;
  'payment.mellat.terminal_id': string;
  'payment.mellat.user_name': string;
  'payment.mellat.user_password': string;
  'payment.mellat.service_url': string;
  'payment.mellat.start_pay_url': string;
};

/** Payment providers offered by the gateway picker (canonical names understood by the API). */
const GATEWAYS = [
  { value: 'BehpardakhtMellat', label: 'به‌پرداخت ملت (بانک ملت)' },
  { value: 'Zarinpal', label: 'زرین‌پال' },
  { value: 'Zibal', label: 'زیبال' },
  { value: 'Offline', label: 'پرداخت در محل (بدون درگاه آنلاین)' },
  { value: 'Fake', label: 'آزمایشی — Fake (فقط برای توسعه)' },
];

/** Header looks offered by the preset picker; picking one also fills its three colours. */
const HEADER_PRESETS = {
  brand: { label: 'سفید و سبز (پیش‌فرض)', bg: '#ffffff', text: '#5c584f', accent: '#28a745' },
  dark: { label: 'تیره', bg: '#1f1e1a', text: '#f1efea', accent: '#28a745' },
  light: { label: 'سفید و آبی', bg: '#ffffff', text: '#1f1e1a', accent: '#1d4ed8' },
  warm: { label: 'کرم و زعفرانی', bg: '#f8f7f4', text: '#46433b', accent: '#d99a0b' },
} as const;

type HeaderPreset = keyof typeof HEADER_PRESETS;

const DEFAULT_TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function SettingsPage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canEdit = can('settings.manage');
  const qc = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, string | null>>('/api/admin/settings') });
  const { data: pay } = useQuery({
    queryKey: ['payment-settings'],
    queryFn: () => api.get<Record<string, string | null>>('/api/admin/payment'),
  });
  const [hasPassword, setHasPassword] = useState(false);
  const gateway = Form.useWatch('payment.gateway', form) as string | undefined;
  // Computed by the API: false while the chosen gateway still misses credentials (checkout is paused then).
  const gatewayReady = pay?.['payment.ready'] !== 'false';

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
      'site.logo_url': data['site.logo_url'] ?? '',
      'site.favicon_url': data['site.favicon_url'] ?? '',
      'site.shop3d_enabled': data['site.shop3d_enabled'] !== 'false',
      'site.shop3d_login_required': data['site.shop3d_login_required'] !== 'false',
      'site.shop3d_daily_minutes': Number(data['site.shop3d_daily_minutes'] ?? 10),
      'site.assistant_enabled': data['site.assistant_enabled'] !== 'false',
      'site.map_enabled': data['site.map_enabled'] === 'true',
      'site.map_tile_url': data['site.map_tile_url'] || DEFAULT_TILE,
      'site.map_center_lat': Number(data['site.map_center_lat'] ?? 35.6892),
      'site.map_center_lng': Number(data['site.map_center_lng'] ?? 51.389),
      'site.map_zoom': Number(data['site.map_zoom'] ?? 12),
      'site.header_preset': (data['site.header_preset'] as HeaderPreset) || 'brand',
      'site.header_height': Number(data['site.header_height'] ?? 60),
      'site.header_logo_height': Number(data['site.header_logo_height'] ?? 40),
      'site.header_search_width': Number(data['site.header_search_width'] ?? 0),
      'site.header_icon_size': Number(data['site.header_icon_size'] ?? 20),
      'site.header_cart_height': Number(data['site.header_cart_height'] ?? 40),
      'site.header_bg_color': data['site.header_bg_color'] || HEADER_PRESETS.brand.bg,
      'site.header_text_color': data['site.header_text_color'] || HEADER_PRESETS.brand.text,
      'site.header_accent_color': data['site.header_accent_color'] || HEADER_PRESETS.brand.accent,
      'site.strip_enabled': data['site.strip_enabled'] !== 'false',
      'site.strip_text.fa': data['site.strip_text.fa'] ?? '',
      'site.strip_text.en': data['site.strip_text.en'] ?? '',
      'site.strip_note.fa': data['site.strip_note.fa'] ?? '',
      'site.strip_note.en': data['site.strip_note.en'] ?? '',
      'site.strip_lang_visible': data['site.strip_lang_visible'] !== 'false',
      'site.test_mode_enabled': data['site.test_mode_enabled'] === 'true',
      'site.test_mode_ribbon.fa': data['site.test_mode_ribbon.fa'] ?? '',
      'site.test_mode_ribbon.en': data['site.test_mode_ribbon.en'] ?? '',
      'site.payment_enabled': data['site.payment_enabled'] !== 'false',
    });
  }, [data, form]);

  useEffect(() => {
    if (!pay) return;
    setHasPassword(pay['payment.mellat.has_password'] === 'true');
    form.setFieldsValue({
      'payment.gateway': pay['payment.gateway'] || 'Fake',
      'payment.zarinpal.merchant_id': pay['payment.zarinpal.merchant_id'] ?? '',
      'payment.zarinpal.sandbox': pay['payment.zarinpal.sandbox'] === 'true',
      'payment.zibal.merchant': pay['payment.zibal.merchant'] ?? '',
      'payment.mellat.terminal_id': pay['payment.mellat.terminal_id'] ?? '',
      'payment.mellat.user_name': pay['payment.mellat.user_name'] ?? '',
      // The stored password never comes back from the server: an empty box means "keep it".
      'payment.mellat.user_password': '',
      'payment.mellat.service_url': pay['payment.mellat.service_url'] ?? '',
      'payment.mellat.start_pay_url': pay['payment.mellat.start_pay_url'] ?? '',
    });
  }, [pay, form]);

  async function onFinish(v: Values) {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      const gatewayBody: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) {
        const str = typeof val === 'boolean' ? String(val) : String(val ?? '');
        if (k.startsWith('payment.')) gatewayBody[k] = str;
        else body[k] = str;
      }
      body['site.map_tile_url'] = toAscii(v['site.map_tile_url'] ?? '').trim() || DEFAULT_TILE;
      // Incomplete gateway credentials are saved with a warning (they no longer fail the save).
      const saved = await api.put<{ warning?: string | null }>('/api/admin/payment', gatewayBody);
      await api.put('/api/admin/settings', body);
      if (saved?.warning) message.warning(saved.warning, 8);
      else message.success('تنظیمات ذخیره شد');
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['payment-settings'] });
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
          <Form.Item
            name="site.logo_url"
            label="لوگوی فروشگاه"
            extra="در هدر، فوتر و تابلوی فروشگاه سه‌بعدی نمایش داده می‌شود. تصویر با پس‌زمینه شفاف یا سفید و نسبت افقی بهتر دیده می‌شود. خالی = حرف اول نام فروشگاه."
          >
            <ImageUpload />
          </Form.Item>
          <Form.Item
            name="site.favicon_url"
            label="فاوآیکون (آیکون تب مرورگر و آیکون اپ موبایل)"
            extra="تصویر مربعی PNG با اندازه ۵۱۲×۵۱۲ پیکسل (مثل آیکون آپ). خالی = آیکون پیش‌فرض فروشگاه. مرورگر فاوآیکون را کش می‌کند؛ با Ctrl+F5 چند دقیقه بعد تفاوت را می‌بینید."
            rules={[
              {
                validator: (_, value?: string) =>
                  !value || /\.(png|jpe?g|webp|gif)$/i.test(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error('برای فاوآیکون یک تصویر PNG (بهتر است) یا JPG/WEBP/GIF انتخاب کنید؛ SVG و ICO پشتیبانی نمی‌شوند.')),
              },
            ]}
          >
            <ImageUpload accept="image/png,image/jpeg,image/webp,image/gif" preview="square" />
          </Form.Item>
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

        <Card title="هدر سایت (اندازه و ظاهر)" style={{ marginBottom: 16 }}>
          <Form.Item
            name="site.header_preset"
            label="قالب رنگی"
            extra="با انتخاب قالب، سه رنگ زیر پر می‌شوند؛ بعد از آن می‌توانید هر رنگ را جدا تغییر دهید."
          >
            <Select
              options={Object.entries(HEADER_PRESETS).map(([value, p]) => ({ value, label: p.label }))}
              onChange={(v: HeaderPreset) => {
                const p = HEADER_PRESETS[v];
                form.setFieldsValue({
                  'site.header_bg_color': p.bg,
                  'site.header_text_color': p.text,
                  'site.header_accent_color': p.accent,
                });
              }}
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <Form.Item name="site.header_bg_color" label="رنگ پس‌زمینه هدر">
              <ColorField />
            </Form.Item>
            <Form.Item name="site.header_text_color" label="رنگ متن و آیکون‌ها">
              <ColorField />
            </Form.Item>
            <Form.Item name="site.header_accent_color" label="رنگ دکمه سبد خرید">
              <ColorField />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Form.Item name="site.header_height" label="ارتفاع نوار اصلی" extra="۴۸ تا ۱۲۰ پیکسل">
              <InputNumber min={48} max={120} precision={0} addonAfter="px" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="site.header_logo_height" label="ارتفاع لوگو" extra="۲۴ تا ۹۶ پیکسل">
              <InputNumber min={24} max={96} precision={0} addonAfter="px" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="site.header_search_width"
              label="عرض کادر جستجو"
              extra="۰ = کشیده تا فضای خالی (پیش‌فرض)"
            >
              <InputNumber min={0} max={900} step={20} precision={0} addonAfter="px" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="site.header_icon_size" label="اندازه آیکون‌ها" extra="حساب، علاقه‌مندی، مقایسه، سبد">
              <InputNumber min={16} max={36} precision={0} addonAfter="px" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="site.header_cart_height" label="ارتفاع دکمه سبد خرید" extra="۳۲ تا ۶۴ پیکسل">
              <InputNumber min={32} max={64} precision={0} addonAfter="px" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Card>

        <Card title="نوار بالای هدر" style={{ marginBottom: 16 }}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="نوار باریک بالای هدر: متن سمت چپ، متن سمت راست و کلید تغییر زبان. می‌توانید آن را کامل خاموش کنید یا متن‌هایش را جایگزین کنید."
          />
          <Form.Item
            name="site.strip_enabled"
            label="نمایش نوار بالای هدر"
            valuePropName="checked"
            extra="با خاموش کردن آن، کل نوار (متن ارسال، پیام کنار آن و کلید زبان) از همه‌ی صفحات حذف می‌شود."
          >
            <Switch checkedChildren="نمایش" unCheckedChildren="مخفی" />
          </Form.Item>
          <Form.Item
            name="site.strip_text.fa"
            label="متن سمت چپ (فارسی)"
            extra="خالی = متن پیش‌فرض «ارسال به سراسر کشور». وقتی «آدرس تحویل روی نقشه» روشن باشد، جای این متن آدرس مشتری نمایش داده می‌شود."
          >
            <Input placeholder="ارسال به سراسر کشور" />
          </Form.Item>
          <Form.Item
            name="site.strip_text.en"
            label="Left text (English)"
            extra="Empty = the built-in «Nationwide shipping»."
          >
            <Input dir="ltr" placeholder="Nationwide shipping" />
          </Form.Item>
          <Form.Item
            name="site.strip_note.fa"
            label="متن سمت راست (فارسی)"
            extra="مثلاً «۰۲۱-۱۲۳۴۵۶۷۸ | پشتیبانی ۹ تا ۲۱». خالی = اولین خط متن پشتیبانی از بخش «متن‌ها»."
          >
            <Input />
          </Form.Item>
          <Form.Item name="site.strip_note.en" label="Right text (English)" extra="Empty = the support text's first line.">
            <Input dir="ltr" />
          </Form.Item>
          <Form.Item
            name="site.strip_lang_visible"
            label="نمایش کلید تغییر زبان"
            valuePropName="checked"
            extra="اگر خاموش باشد، مشتری زبان سایت را عوض نمی‌کند (محتوای هر دو زبان همچنان ذخیره می‌شود)."
          >
            <Switch checkedChildren="نمایش" unCheckedChildren="مخفی" />
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
            name="site.shop3d_login_required"
            label="ورود به فروشگاه سه‌بعدی فقط برای کاربران واردشده"
            valuePropName="checked"
            extra="اگر روشن باشد، مهمان‌ها به‌جای فروشگاه، کارت ورود/ثبت‌نام می‌بینند. اگر خاموش باشد مهمان‌ها هم وارد می‌شوند و محدودیت زمانی برای آن‌ها اعمال نمی‌شود (زمان فقط برای کاربران واردشده شمارش می‌شود)."
          >
            <Switch checkedChildren="الزامی" unCheckedChildren="آزاد" />
          </Form.Item>
          <Form.Item
            name="site.shop3d_daily_minutes"
            label="حداکثر زمان روزانه در فروشگاه سه‌بعدی (دقیقه)"
            extra="۰ یعنی نامحدود. زمان در سرور شمارش می‌شود و هر روز (به وقت تهران، از نیمه‌شب) برای هر کاربر از نو شروع می‌شود. با تمام شدن زمان، فروشگاه سه‌بعدی تا فردا بسته می‌شود."
          >
            <InputNumber min={0} max={1440} precision={0} style={{ width: '100%' }} addonAfter="دقیقه" />
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

        <Card title="پرداخت و فروش" style={{ marginBottom: 16 }}>
          <Form.Item
            name="site.payment_enabled"
            label="فعال بودن پرداخت آنلاین"
            valuePropName="checked"
            extra="اگر خاموش باشد، فروش موقتاً متوقف می‌شود: دکمه‌ی پرداخت در سبد خرید غیرفعال می‌شود، صفحه‌ی پرداخت پیام «فروش موقتاً متوقف شده است» نشان می‌دهد و سرور هم سفارش جدید ثبت نمی‌کند. مشتریان می‌توانند محصولات را ببینند اما سفارش ثبت نمی‌شود. برای تعطیلی موقت فروشگاه یا قطعی درگاه از این گزینه استفاده کنید."
          >
            <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
          </Form.Item>
        </Card>

        <Card title="درگاه پرداخت" style={{ marginBottom: 16 }}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="مشخصات درگاه همین‌جا ذخیره می‌شود و بلافاصله اعمال می‌شود؛ نیازی به ری‌استارت سرور نیست و این مقادیر بر فایل تنظیمات سرور اولویت دارند. رمز درگاه فقط نوشته می‌شود و دیگر نمایش داده نمی‌شود."
          />
          {!gatewayReady && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="این درگاه هنوز کامل تنظیم نشده است؛ تا تکمیل مشخصات، پرداخت در فروشگاه انجام نمی‌شود. مشخصات را ذخیره کنید و دوباره بررسی کنید."
            />
          )}
          <Form.Item
            name="payment.gateway"
            label="درگاه پرداخت فعال"
            extra="پرداخت سفارش‌های جدید از این درگاه انجام می‌شود. اگر مشتری در همان لحظه در حال پرداخت از درگاه قبلی باشد، بازگشت او ممکن است کامل نشود؛ پس بهتر است درگاه را در ساعات کم‌ترافیک عوض کنید و سفارش‌های «در انتظار پرداخت» را یک بار مرور کنید."
          >
            <Select options={GATEWAYS} />
          </Form.Item>

          <Form.Item
            hidden={gateway !== 'BehpardakhtMellat'}
            name="payment.mellat.terminal_id"
            label="شماره ترمینال (Terminal ID)"
            extra="عددی که بانک ملت همراه با فعال‌سازی درگاه اعلام می‌کند."
          >
            <Input dir="ltr" inputMode="numeric" />
          </Form.Item>
          <Form.Item
            hidden={gateway !== 'BehpardakhtMellat'}
            name="payment.mellat.user_name"
            label="نام کاربری درگاه"
            extra="نام کاربری و رمز درگاه را بانک ملت هنگام فعال‌سازی ترمینال می‌دهد؛ با نام کاربری و رمز اینترنت‌بانک یکی نیست."
          >
            <Input dir="ltr" autoComplete="off" />
          </Form.Item>
          <Form.Item
            hidden={gateway !== 'BehpardakhtMellat'}
            name="payment.mellat.user_password"
            label="رمز درگاه"
            extra={
              hasPassword
                ? 'رمز ذخیره شده است. برای تغییر مقدار جدید را وارد کنید؛ خالی گذاشتن این کادر رمز فعلی را حفظ می‌کند.'
                : 'رمز ترمینال را وارد کنید.'
            }
          >
            <Input.Password
              dir="ltr"
              autoComplete="new-password"
              placeholder={hasPassword ? '•••••••• (ذخیره شده)' : ''}
            />
          </Form.Item>
          <Form.Item
            hidden={gateway !== 'BehpardakhtMellat'}
            name="payment.mellat.service_url"
            label="آدرس سرویس بانک (اختیاری)"
            extra="خالی = آدرس پیش‌فرض بانک ملت. فقط اگر پشتیبانی بانک نشانی دیگری داده تغییر دهید."
          >
            <Input dir="ltr" />
          </Form.Item>
          <Form.Item
            hidden={gateway !== 'BehpardakhtMellat'}
            name="payment.mellat.start_pay_url"
            label="آدرس صفحه پرداخت بانک (اختیاری)"
            extra="خالی = آدرس پیش‌فرض بانک ملت."
          >
            <Input dir="ltr" />
          </Form.Item>

          <Form.Item
            hidden={gateway !== 'Zarinpal'}
            name="payment.zarinpal.merchant_id"
            label="شناسه پذیرنده (Merchant ID)"
            extra="۳۶ کاراکتری که از پنل زرین‌پال دریافت می‌کنید."
          >
            <Input dir="ltr" />
          </Form.Item>
          <Form.Item
            hidden={gateway !== 'Zarinpal'}
            name="payment.zarinpal.sandbox"
            label="محیط تست (Sandbox)"
            valuePropName="checked"
            extra="برای اتصال نهایی به پول واقعی خاموش باشد."
          >
            <Switch checkedChildren="تست" unCheckedChildren="عملیاتی" />
          </Form.Item>

          <Form.Item
            hidden={gateway !== 'Zibal'}
            name="payment.zibal.merchant"
            label="کد پذیرنده (Merchant)"
            extra="«zibal» کد پذیرنده‌ی آزمایشی عمومی زیبال است."
          >
            <Input dir="ltr" />
          </Form.Item>

          <Alert
            style={{ display: gateway === 'Offline' || gateway === 'Fake' ? undefined : 'none' }}
            type="warning"
            showIcon
            message={
              gateway === 'Offline'
                ? 'در حالت پرداخت در محل، درگاه آنلاین استفاده نمی‌شود؛ سفارش‌ها «در انتظار پرداخت» می‌مانند تا مدیر آن‌ها را پرداخت‌شده کند.'
                : 'درگاه آزمایشی برای توسعه است: پول واقعی جابه‌جا نمی‌شود و در محیط عملیاتی (Production) پذیرفته نمی‌شود.'
            }
          />
        </Card>

        <Card title="حالت آزمایشی (نسخه نمایشی)" style={{ marginBottom: 16 }}>
          <Form.Item
            name="site.test_mode_enabled"
            label="فعال بودن حالت آزمایشی"
            valuePropName="checked"
            extra="با فعال بودن این گزینه: یک نوار زرد در بالای همه صفحات نمایش داده می‌شود، هنگام ورود پنجره‌ای برای گرفتن شماره موبایل باز می‌شود و در صفحه پرداخت به کاربر گفته می‌شود که خرید واقعی انجام نمی‌شود. شماره‌های ثبت‌شده در بخش «اعلان‌ها» قابل مشاهده است."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="site.test_mode_ribbon.fa"
            label="متن نوار (فارسی)"
            extra="خالی = متن پیش‌فرض «نسخه آزمایشی — خرید واقعی انجام نمی‌شود»."
          >
            <Input />
          </Form.Item>
          <Form.Item name="site.test_mode_ribbon.en" label="Ribbon text (English)" extra="Empty = default text.">
            <Input dir="ltr" />
          </Form.Item>
        </Card>

        <Button type="primary" htmlType="submit" loading={saving}>
          ذخیره تنظیمات
        </Button>
      </Form>
    </>
  );
}

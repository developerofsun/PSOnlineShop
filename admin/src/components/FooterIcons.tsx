import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  FacebookFilled,
  GlobalOutlined,
  InstagramOutlined,
  LinkedinFilled,
  MailOutlined,
  PhoneOutlined,
  SendOutlined,
  TwitterOutlined,
  WhatsAppOutlined,
  YoutubeFilled,
} from '@ant-design/icons';
import type { ComponentType, CSSProperties } from 'react';

const byName: Record<string, ComponentType<{ style?: CSSProperties }>> = {
  // contact items
  phone: PhoneOutlined,
  mail: MailOutlined,
  pin: EnvironmentOutlined,
  clock: ClockCircleOutlined,
  // social networks (Telegram has no brand icon in antd: the paper plane is the closest match)
  instagram: InstagramOutlined,
  telegram: SendOutlined,
  whatsapp: WhatsAppOutlined,
  facebook: FacebookFilled,
  linkedin: LinkedinFilled,
  youtube: YoutubeFilled,
  twitter: TwitterOutlined,
  website: GlobalOutlined,
};

export const CONTACT_ICONS = ['phone', 'mail', 'pin', 'clock'] as const;
export const SOCIAL_NETWORKS = ['instagram', 'telegram', 'whatsapp', 'facebook', 'linkedin', 'youtube', 'twitter', 'website'] as const;

export const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'اینستاگرام',
  telegram: 'تلگرام',
  whatsapp: 'واتس‌اپ',
  facebook: 'فیسبوک',
  linkedin: 'لینکدین',
  youtube: 'یوتیوب',
  twitter: 'ایکس / توییتر',
  website: 'وب‌سایت',
};

export function FooterIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = byName[name] ?? GlobalOutlined;
  return <Icon style={{ fontSize: size }} />;
}

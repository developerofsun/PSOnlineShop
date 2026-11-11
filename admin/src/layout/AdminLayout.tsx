import {
  AppstoreOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Avatar, Badge, Button, Dropdown, Layout, Menu, Space } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ProductSyncStatus } from '../lib/types';

const { Sider, Header, Content } = Layout;

const STOREFRONT_URL = (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:3000/fa';

type Item = NonNullable<MenuProps['items']>[number];

export default function AdminLayout() {
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Imported products waiting for review (shown as a badge and a banner on every page)
  const canProducts = can('products.manage');
  const { data: sync } = useQuery({
    queryKey: ['product-sync'],
    queryFn: () => api.get<ProductSyncStatus>('/api/admin/product-sync'),
    enabled: canProducts,
    refetchInterval: 60000,
  });
  const pendingReview = sync?.pendingReview ?? 0;

  // WordPress-style: dark sidebar with groups. Entries appear only when the user holds the permission.
  const items = useMemo(() => {
    const list: (Item | null)[] = [
      can('dashboard.view') ? { key: '/', icon: <DashboardOutlined />, label: <Link to="/">پیشخوان</Link> } : null,

      can('products.manage', 'categories.manage')
        ? {
            key: 'catalog',
            icon: <ShoppingOutlined />,
            label: 'محصولات',
            children: [
              can('products.manage') ? { key: '/products', label: <Link to="/products">همه محصولات</Link> } : null,
              can('products.manage') ? { key: '/products/new', label: <Link to="/products/new">افزودن محصول</Link> } : null,
              can('products.manage')
                ? {
                    key: '/product-sync',
                    label: (
                      <Link to="/product-sync">
                        همگام‌سازی کیان <Badge count={pendingReview} size="small" />
                      </Link>
                    ),
                  }
                : null,
              can('categories.manage') ? { key: '/categories', icon: <TagsOutlined />, label: <Link to="/categories">دسته‌بندی‌ها</Link> } : null,
            ].filter(Boolean) as Item[],
          }
        : null,

      can('orders.manage') ? { key: '/orders', icon: <ShoppingCartOutlined />, label: <Link to="/orders">سفارش‌ها</Link> } : null,

      can('content.manage')
        ? {
            key: 'content',
            icon: <FileTextOutlined />,
            label: 'محتوا',
            children: [
              { key: '/pages', label: <Link to="/pages">صفحات</Link> },
              { key: '/stories', label: <Link to="/stories">استوری‌ها</Link> },
              { key: '/sliders', label: <Link to="/sliders">اسلایدرها</Link> },
              { key: '/banners', label: <Link to="/banners">بنرها</Link> },
              { key: '/texts', label: <Link to="/texts">متن‌های ثابت</Link> },
              { key: '/footer', label: <Link to="/footer">طراحی پاورقی</Link> },
            ],
          }
        : null,

      can('media.manage') ? { key: '/media', icon: <PictureOutlined />, label: <Link to="/media">رسانه</Link> } : null,

      can('users.manage', 'roles.manage')
        ? {
            key: 'people',
            icon: <TeamOutlined />,
            label: 'کاربران',
            children: [
              can('users.manage') ? { key: '/users', label: <Link to="/users">همه کاربران</Link> } : null,
              can('roles.manage') ? { key: '/roles', icon: <SafetyCertificateOutlined />, label: <Link to="/roles">نقش‌ها و دسترسی‌ها</Link> } : null,
            ].filter(Boolean) as Item[],
          }
        : null,

      can('settings.manage') ? { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">تنظیمات</Link> } : null,
    ];
    return list.filter(Boolean) as Item[];
  }, [can, pendingReview]);

  const selected =
    pathname.startsWith('/products/') && pathname !== '/products/new' ? '/products' : pathname.startsWith('/pages/') && pathname !== '/pages/new' ? '/pages' : pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        width={230}
        collapsible
        breakpoint="lg"
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}
      >
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, padding: '18px 16px', whiteSpace: 'nowrap' }}>
          <AppstoreOutlined /> {!collapsed && 'پیشخوان فروشگاه'}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selected]} defaultOpenKeys={['catalog', 'content', 'people']} items={items} />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,.08)',
          }}
        >
          <a href={STOREFRONT_URL} target="_blank" rel="noreferrer">
            مشاهده فروشگاه ↗
          </a>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'خروج',
                  onClick: () => {
                    logout();
                    nav('/login');
                  },
                },
              ],
            }}
          >
            <Button type="text">
              <Space>
                <Avatar size="small" icon={<UserOutlined />} />
                {user?.fullName}
              </Space>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16 }}>
          {pendingReview > 0 && pathname !== '/product-sync' && !(pathname === '/products' && search.includes('review=1')) && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`${new Intl.NumberFormat('fa-IR').format(pendingReview)} محصول جدید از کیان وارد شده و منتظر بررسی شماست`}
              action={
                <Link to="/products?review=1">
                  <Button size="small">بررسی</Button>
                </Link>
              }
            />
          )}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

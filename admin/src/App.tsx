import { App as AntApp, ConfigProvider, Spin, theme } from 'antd';
import faIR from 'antd/locale/fa_IR';
import { Navigate, Route, Routes } from 'react-router-dom';
import Guard from './components/Guard';
import AdminLayout from './layout/AdminLayout';
import { useAuth } from './lib/auth';
import BannersPage from './pages/Banners';
import CategoriesPage from './pages/Categories';
import DashboardPage from './pages/Dashboard';
import LoginPage from './pages/Login';
import MediaPage from './pages/Media';
import OrdersPage from './pages/Orders';
import PageEditPage from './pages/PageEdit';
import PagesPage from './pages/Pages';
import ProductEditPage from './pages/ProductEdit';
import ProductsPage from './pages/Products';
import RolesPage from './pages/Roles';
import SettingsPage from './pages/Settings';
import SlidersPage from './pages/Sliders';
import StoriesPage from './pages/Stories';
import TextsPage from './pages/Texts';
import UsersPage from './pages/Users';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  return user ? children : <Navigate to="/login" replace />;
}

/** The dashboard for users who may see it, otherwise the first section they are allowed to use. */
function Home() {
  const { can } = useAuth();
  if (can('dashboard.view')) return <DashboardPage />;
  const first: [string, string[]][] = [
    ['/products', ['products.manage']],
    ['/orders', ['orders.manage']],
    ['/pages', ['content.manage']],
    ['/categories', ['categories.manage']],
    ['/users', ['users.manage']],
    ['/roles', ['roles.manage']],
    ['/media', ['media.manage']],
    ['/settings', ['settings.manage']],
  ];
  const target = first.find(([, perms]) => can(...perms));
  return target ? <Navigate to={target[0]} replace /> : <Guard perm="dashboard.view">{null}</Guard>;
}

export default function App() {
  return (
    <ConfigProvider
      direction="rtl"
      locale={faIR}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: { fontFamily: "'Vazirmatn Variable', Vazirmatn, Tahoma, sans-serif", colorPrimary: '#1d4ed8', borderRadius: 8 },
      }}
    >
      <AntApp>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />

            <Route path="products" element={<Guard perm="products.manage"><ProductsPage /></Guard>} />
            <Route path="products/new" element={<Guard perm="products.manage"><ProductEditPage /></Guard>} />
            <Route path="products/:id" element={<Guard perm="products.manage"><ProductEditPage /></Guard>} />
            <Route path="categories" element={<Guard perm="categories.manage"><CategoriesPage /></Guard>} />
            <Route path="orders" element={<Guard perm="orders.manage"><OrdersPage /></Guard>} />

            <Route path="pages" element={<Guard perm="content.manage"><PagesPage /></Guard>} />
            <Route path="pages/new" element={<Guard perm="content.manage"><PageEditPage /></Guard>} />
            <Route path="pages/:id" element={<Guard perm="content.manage"><PageEditPage /></Guard>} />
            <Route path="stories" element={<Guard perm="content.manage"><StoriesPage /></Guard>} />
            <Route path="sliders" element={<Guard perm="content.manage"><SlidersPage /></Guard>} />
            <Route path="banners" element={<Guard perm="content.manage"><BannersPage /></Guard>} />
            <Route path="texts" element={<Guard perm="content.manage"><TextsPage /></Guard>} />
            <Route path="media" element={<Guard perm="media.manage"><MediaPage /></Guard>} />

            <Route path="users" element={<Guard perm="users.manage"><UsersPage /></Guard>} />
            <Route path="roles" element={<Guard perm="roles.manage"><RolesPage /></Guard>} />
            <Route path="settings" element={<Guard perm="settings.manage"><SettingsPage /></Guard>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AntApp>
    </ConfigProvider>
  );
}

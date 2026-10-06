import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: 360, maxWidth: '100%' }} title="ورود به پیشخوان">
        <Form
          layout="vertical"
          onFinish={async (v: { login: string; password: string }) => {
            setBusy(true);
            setError(null);
            try {
              await login(v.login, v.password);
              nav('/');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'خطا در ورود');
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
          <Form.Item name="login" label="نام کاربری یا ایمیل" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="password" label="رمز عبور" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>
            ورود
          </Button>
        </Form>
      </Card>
    </div>
  );
}

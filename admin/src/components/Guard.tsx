import { Result } from 'antd';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';

/** Shows children only when the user holds at least one of the permissions (the API enforces it as well). */
export default function Guard({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { can } = useAuth();
  const list = Array.isArray(perm) ? perm : [perm];
  if (!can(...list)) return <Result status="403" title="۴۰۳" subTitle="شما به این بخش دسترسی ندارید." />;
  return <>{children}</>;
}

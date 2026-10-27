import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { useMe } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { adminApi } from '../api';
import { AdminHeader, InputField, Loading, Modal, Panel, SelectField, StatusPill } from '../ui';
import { fmt, tdClass, thClass } from '../format';

const ROLES = [
  ['staff', 'Staff'],
  ['manager', 'Manager'],
  ['super_admin', 'Super Admin'],
];
const WHAT_THEY_CAN_DO = {
  kitchen: 'Kitchen: orders in the kitchen, sold-out switches.',
  front_desk: 'Front desk: orders, reservations, customers, dine-in bills, enquiries.',
  manager: 'Manager: everything except staff and balance adjustments.',
  super_admin: 'Super Admin: everything, including staff, adjustments and interest runs.',
};
const key = ['admin', 'staff'];

export function StaffPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, error } = useQuery({ queryKey: key, queryFn: ({ signal }) => adminApi.staff(signal) });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);
  if (!data) return <Loading error={error} />;

  const update = async (s, body, msg) => {
    setErr(null);
    try {
      qc.setQueryData(key, await adminApi.updateStaff(s.id, body));
      toast(msg);
    } catch (e) {
      setErr(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Please try again.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Staff & roles"
        intro="Who can sign in to the admin panel and what they can do. Changing someone’s role or suspending them signs them out everywhere."
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            Invite staff
          </Button>
        }
      />
      <ul className="text-secondary grid gap-1 text-sm sm:grid-cols-2">
        {Object.values(WHAT_THEY_CAN_DO).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {err && <Alert tone="error">{err}</Alert>}
      <Panel>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  Name
                </th>
                <th scope="col" className={thClass}>
                  Role
                </th>
                <th scope="col" className={thClass}>
                  Two-factor
                </th>
                <th scope="col" className={thClass}>
                  Last sign-in
                </th>
                <th scope="col" className={thClass}>
                  Status
                </th>
                <th scope="col" className={thClass}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const self = s.id === me?.id;
                return (
                  <tr key={s.id}>
                    <td className={tdClass}>
                      <span className="font-semibold">{s.name}</span>
                      {self && <span className="text-muted"> (you)</span>}
                      <span className="text-muted block text-xs">{s.email}</span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-2">
                        <SelectField
                          label={`Role for ${s.name}`}
                          hideLabel
                          value={s.role}
                          onChange={(v) =>
                            update(
                              s,
                              {
                                role: v,
                                staff_position: v === 'staff' ? (s.staffPosition ?? 'front_desk') : null,
                              },
                              `${s.name} is now ${fmt.label(v)}`,
                            )
                          }
                          options={ROLES}
                          className="w-36"
                        />
                        {s.role === 'staff' && (
                          <SelectField
                            label={`Position for ${s.name}`}
                            hideLabel
                            value={s.staffPosition ?? 'front_desk'}
                            onChange={(v) => update(s, { staff_position: v }, `${s.name}: ${fmt.label(v)}`)}
                            options={[
                              ['kitchen', 'Kitchen'],
                              ['front_desk', 'Front desk'],
                            ]}
                            className="w-36"
                          />
                        )}
                      </div>
                    </td>
                    <td className={tdClass}>
                      {s.twoFactorEnabled ? 'On' : <span className="text-muted">Off</span>}
                    </td>
                    <td className={tdClass}>{fmt.dateTime(s.lastLoginAt)}</td>
                    <td className={tdClass}>
                      <StatusPill
                        status={s.isActive ? 'active' : 'suspended'}
                        label={s.isActive ? 'Active' : 'Suspended'}
                      />
                    </td>
                    <td className={`${tdClass} text-right whitespace-nowrap`}>
                      {!self && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            update(
                              s,
                              { is_active: !s.isActive },
                              s.isActive ? `${s.name} suspended` : `${s.name} reactivated`,
                            )
                          }
                        >
                          {s.isActive ? 'Suspend' : 'Reactivate'}
                        </Button>
                      )}
                      {s.twoFactorEnabled && !self && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            qc.setQueryData(key, await adminApi.resetStaff2fa(s.id));
                            toast(`Two-factor reset for ${s.name}`);
                          }}
                        >
                          Reset 2FA
                        </Button>
                      )}
                      {!s.lastLoginAt && s.isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await adminApi.resendInvite(s.id);
                            toast(`Invitation sent to ${s.email}`);
                          }}
                        >
                          Resend invite
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {adding && (
        <InviteStaff onDone={(list) => qc.setQueryData(key, list)} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function InviteStaff({ onDone, onClose }) {
  const [f, setF] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'staff',
    staff_position: 'front_desk',
  });
  const [errors, setErrors] = useState({});
  return (
    <Modal title="Invite staff" onClose={onClose}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setErrors({});
          try {
            onDone(
              await adminApi.createStaff({
                ...f,
                phone: f.phone || null,
                staff_position: f.role === 'staff' ? f.staff_position : null,
              }),
            );
            toast(`Invitation sent to ${f.email}`);
            onClose();
          } catch (err) {
            setErrors(
              err instanceof ApiError ? { ...err.fields, _: err.message } : { _: 'Please try again.' },
            );
          }
        }}
      >
        <InputField
          label="First name"
          value={f.first_name}
          onChange={(e) => setF({ ...f, first_name: e.target.value })}
          error={errors.first_name}
        />
        <InputField
          label="Last name"
          value={f.last_name}
          onChange={(e) => setF({ ...f, last_name: e.target.value })}
          error={errors.last_name}
        />
        <InputField
          label="Email"
          type="email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          error={errors.email}
          className="sm:col-span-2"
        />
        <InputField
          label="Phone (optional)"
          type="tel"
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
          error={errors.phone}
        />
        <SelectField label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES} />
        {f.role === 'staff' && (
          <SelectField
            label="Position"
            value={f.staff_position}
            onChange={(v) => setF({ ...f, staff_position: v })}
            options={[
              ['front_desk', 'Front desk'],
              ['kitchen', 'Kitchen'],
            ]}
          />
        )}
        <p className="text-secondary text-sm sm:col-span-2">
          {WHAT_THEY_CAN_DO[f.role === 'staff' ? f.staff_position : f.role]} They’ll get an email to choose
          their password (valid 72 hours).
        </p>
        {errors._ && (
          <Alert tone="error" className="sm:col-span-2">
            {errors._}
          </Alert>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit">Send invitation</Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

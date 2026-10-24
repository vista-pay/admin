"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminRoleDefinition, adminApi, apiFetch } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { PERMISSION_CATALOG } from "@/lib/permissions";

type Admin = { id: string; email: string; firstName: string; lastName: string; role: string; roleId: string; roleName: string; isActive: boolean; mfaEnabled: boolean; mustChangePassword?: boolean; lastLoginAt?: string | null; createdAt: string };
type Policy = { id: string; actionKey: string; name: string; description?: string | null; makerCheckerRequired: boolean; minimumApprovers: number; approverRoles: string[]; isActive: boolean };
type AccessResponse = { admins: Admin[]; policies: Policy[] };

const pretty = (v: string) => v.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const GROUPS = [...new Set(PERMISSION_CATALOG.map((p) => p.group))];

const emptyRoleForm = { id: "", name: "", description: "", permissions: [] as string[], reason: "" };

export default function RolesPage() {
  const [data, setData] = useState<AccessResponse | null>(null);
  const [roles, setRoles] = useState<AdminRoleDefinition[]>([]);
  const [tab, setTab] = useState<"admins" | "roles">("admins");
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<Admin | null>(null);
  const [roleModal, setRoleModal] = useState<"create" | "edit" | null>(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", roleId: "", isActive: true, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const [access, roleList] = await Promise.all([apiFetch<AccessResponse>("/admin/access-control"), adminApi.roles()]);
      setData(access.data);
      setRoles(roleList.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load access control");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 6000); return () => clearTimeout(t); }, [toast]);

  const assignableRoles = useMemo(() => roles, [roles]);
  const selectedRole = (id: string) => roles.find((r) => r.id === id);

  async function submitInvite() {
    if (!form.email || !form.roleId || form.firstName.length < 2 || form.lastName.length < 2) return;
    setBusy(true);
    try {
      const res = await adminApi.inviteAdmin({ email: form.email, firstName: form.firstName, lastName: form.lastName, roleId: form.roleId });
      setInvite(false);
      setToast(`Invitation emailed to ${form.email}.${res.data.debugTempPassword ? ` Temp password (dev): ${res.data.debugTempPassword}` : ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not invite administrator"); }
    finally { setBusy(false); }
  }

  async function saveAccess() {
    if (!edit || form.reason.trim().length < 5) return;
    setBusy(true);
    try {
      await adminApi.updateAdminAccess(edit.id, { roleId: form.roleId, isActive: form.isActive, reason: form.reason.trim() });
      setEdit(null);
      setToast("Administrator access updated.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update access"); }
    finally { setBusy(false); }
  }

  async function saveRole() {
    const payload = { name: roleForm.name.trim(), description: roleForm.description.trim() || undefined, permissions: roleForm.permissions };
    if (payload.name.length < 2 || payload.permissions.length === 0) return;
    setBusy(true);
    try {
      if (roleModal === "create") {
        await adminApi.createRole(payload);
        setToast("Role created. You can now invite admins with it.");
      } else {
        if (roleForm.reason.trim().length < 5) { setBusy(false); return; }
        await adminApi.updateRole(roleForm.id, { ...payload, reason: roleForm.reason.trim() });
        setToast("Role updated. Changes apply to signed-in admins immediately.");
      }
      setRoleModal(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save role"); }
    finally { setBusy(false); }
  }

  async function removeRole(role: AdminRoleDefinition) {
    const reason = window.prompt(`Delete the "${role.name}" role? Enter a reason (min 5 characters):`);
    if (!reason || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await adminApi.deleteRole(role.id, reason.trim());
      setToast("Role deleted.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete role"); }
    finally { setBusy(false); }
  }

  function openEdit(a: Admin) { setEdit(a); setForm((x) => ({ ...x, roleId: a.roleId, isActive: a.isActive, reason: "" })); }
  function openInvite() { setInvite(true); setForm({ email: "", firstName: "", lastName: "", roleId: assignableRoles.find((r) => !r.isSystem)?.id ?? assignableRoles.find((r) => r.key === "SUPPORT_ADMIN")?.id ?? "", isActive: true, reason: "" }); }
  function openRoleCreate() { setRoleForm(emptyRoleForm); setRoleModal("create"); }
  function openRoleEdit(role: AdminRoleDefinition) { setRoleForm({ id: role.id, name: role.name, description: role.description ?? "", permissions: role.permissions, reason: "" }); setRoleModal("edit"); }
  function togglePermission(key: string) { setRoleForm((f) => ({ ...f, permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key] })); }

  const editingRole = roleModal === "edit" ? roles.find((r) => r.id === roleForm.id) : undefined;
  const roleFormLocked = editingRole?.key === "SUPER_ADMIN";

  return <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-black">Roles & access</h1><p className="mt-1 text-sm text-slate-600">Configure roles and the tabs they unlock, then invite admins — each gets an emailed temporary password and must change it at first sign-in.</p></div>
      <div className="flex gap-2">
        <button onClick={openRoleCreate} className="rounded-xl border border-blue-600 px-4 py-2.5 text-sm font-bold text-blue-700">▢ &nbsp;New role</button>
        <button onClick={openInvite} disabled={assignableRoles.length === 0} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">♙ &nbsp;Invite admin</button>
      </div>
    </header>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <nav className="mt-4 flex gap-6 border-b text-sm">
      <button onClick={() => setTab("admins")} className={tab === "admins" ? "border-b-2 border-blue-600 py-3 font-bold" : "py-3 text-slate-500"}>Admins ({data?.admins.length ?? 0})</button>
      <button onClick={() => setTab("roles")} className={tab === "roles" ? "border-b-2 border-blue-600 py-3 font-bold" : "py-3 text-slate-500"}>Roles ({roles.length})</button>
      <span className="ml-auto py-3 text-slate-500">Approval policies ({data?.policies.length ?? 0})</span>
    </nav>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      {tab === "admins" ? (
        <section className="self-start overflow-hidden rounded-2xl border bg-white">
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase text-slate-600"><tr>{["Admin", "Role", "2FA", "Last active", "Status"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
            <tbody>{(data?.admins ?? []).map((a) => <tr key={a.id} onClick={() => openEdit(a)} className="cursor-pointer border-t hover:bg-slate-50">
              <td className="px-3 py-3"><b className="block">{a.firstName} {a.lastName}</b><span className="text-xs text-slate-500">{a.email}</span></td>
              <td className="px-3 py-3">{a.roleName ?? pretty(a.role)}{a.mustChangePassword && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Invite pending</span>}</td>
              <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${a.mfaEnabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>● {a.mfaEnabled ? "Email OTP" : "Not set"}</span></td>
              <td className="px-3 py-3">{a.lastLoginAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(a.lastLoginAt)) : "—"}</td>
              <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${a.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>● {a.isActive ? "Active" : "Inactive"}</span></td>
            </tr>)}</tbody>
          </table></div>
        </section>
      ) : (
        <section className="grid gap-4 self-start sm:grid-cols-2">
          {roles.map((role) => <div key={role.id} className="flex flex-col rounded-2xl border bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <b className="text-sm">{role.name}</b>
              {role.isSystem && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Built-in</span>}
            </div>
            <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">{role.description ?? "No description"}</p>
            <p className="mt-3 text-xs text-slate-600">{role.key === "SUPER_ADMIN" ? "All areas" : `${role.permissions.length} areas`} · {role.adminCount} admin{role.adminCount === 1 ? "" : "s"}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => openRoleEdit(role)} disabled={role.key === "SUPER_ADMIN"} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40">{role.key === "SUPER_ADMIN" ? "Locked" : "Edit"}</button>
              {!role.isSystem && <button onClick={() => removeRole(role)} disabled={busy || role.adminCount > 0} title={role.adminCount > 0 ? "Reassign its admins first" : undefined} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-40">Delete</button>}
            </div>
          </div>)}
        </section>
      )}
      <aside className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-black">Approval policies</h2><div className="mt-4 space-y-4">{(data?.policies ?? []).map((p) => <div key={p.id} className="flex gap-3"><div className="min-w-0 flex-1"><b className="block text-sm">{p.name}</b><p className="mt-0.5 text-xs leading-4 text-slate-500">{p.description ?? `${p.approverRoles.map(pretty).join(" or ")} approval`}</p></div><span className={`self-start whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold ${p.minimumApprovers > 1 ? "bg-red-50 text-red-600" : p.makerCheckerRequired ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>● {p.minimumApprovers > 1 ? `${p.minimumApprovers} checkers` : p.makerCheckerRequired ? "Checker" : "Automatic"}</span></div>)}</div></aside>
    </div>

    {(invite || edit) && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6">
      <div className="flex justify-between"><h2 className="text-lg font-black">{invite ? "Invite administrator" : "Update administrator"}</h2><button onClick={() => { setInvite(false); setEdit(null); }} className="text-xl">×</button></div>
      {invite && <>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" className="h-10 rounded-xl border px-3 text-sm" />
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" className="h-10 rounded-xl border px-3 text-sm" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Work email" className="col-span-2 h-10 rounded-xl border px-3 text-sm" />
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">A temporary password is generated and emailed to them automatically. They must change it at first sign-in and will only see the tabs their role grants.</p>
      </>}
      <label className="mt-4 block text-xs font-bold text-slate-600">Role
        <AdminSelect value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} containerClassName="mt-1 w-full">
          {assignableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </AdminSelect>
      </label>
      {form.roleId && <p className="mt-2 text-xs text-slate-500">Grants: {selectedRole(form.roleId)?.key === "SUPER_ADMIN" ? "every area, including role management" : selectedRole(form.roleId)?.permissions.map((k) => PERMISSION_CATALOG.find((p) => p.key === k)?.label ?? k).join(", ")}</p>}
      {edit && <>
        <label className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Account active</label>
        <textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason for access change (min 5 characters)" className="mt-4 w-full rounded-xl border p-3 text-sm" />
      </>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => { setInvite(false); setEdit(null); }} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
        <button disabled={busy || (invite ? !form.email || !form.roleId || form.firstName.length < 2 || form.lastName.length < 2 : form.reason.trim().length < 5)} onClick={invite ? submitInvite : saveAccess} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? "Saving…" : invite ? "Send invitation" : "Save access"}</button>
      </div>
    </div></div>}

    {roleModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
      <div className="flex justify-between"><h2 className="text-lg font-black">{roleModal === "create" ? "Create role" : `Edit role${editingRole?.isSystem ? " (built-in)" : ""}`}</h2><button onClick={() => setRoleModal(null)} className="text-xl">×</button></div>
      <div className="mt-4 grid gap-3">
        <input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Role name (e.g. Growth team)" disabled={roleFormLocked || editingRole?.isSystem} className="h-10 rounded-xl border px-3 text-sm disabled:bg-slate-50" />
        <input value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="Short description" disabled={roleFormLocked} className="h-10 rounded-xl border px-3 text-sm" />
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Tab access</p>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {GROUPS.map((group) => <div key={group} className="rounded-xl border p-3">
          <p className="text-xs font-bold text-slate-700">{group}</p>
          <div className="mt-2 space-y-1.5">
            {PERMISSION_CATALOG.filter((p) => p.group === group).map((perm) => <label key={perm.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={roleFormLocked} checked={roleForm.permissions.includes(perm.key)} onChange={() => togglePermission(perm.key)} />
              {perm.label}
            </label>)}
          </div>
        </div>)}
      </div>
      {roleModal === "edit" && <textarea rows={2} value={roleForm.reason} onChange={(e) => setRoleForm({ ...roleForm, reason: e.target.value })} placeholder="Reason for change (min 5 characters)" className="mt-4 w-full rounded-xl border p-3 text-sm" />}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => setRoleModal(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
        <button disabled={busy || roleFormLocked || roleForm.name.trim().length < 2 || roleForm.permissions.length === 0 || (roleModal === "edit" && roleForm.reason.trim().length < 5)} onClick={saveRole} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? "Saving…" : roleModal === "create" ? "Create role" : "Save role"}</button>
      </div>
    </div></div>}

    {toast && <div className="fixed bottom-5 right-5 z-[90] max-w-md rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl">✓ {toast}</div>}
  </main>;
}

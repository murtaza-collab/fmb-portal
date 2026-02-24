'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AdminUser {
  id: number
  auth_id: string
  full_name: string
  username: string
  user_group_id: number
  status: string
  user_groups?: { name: string }
}

interface UserGroup {
  id: number
  name: string
  status: string
  permissions?: Permission[]
}

interface Permission {
  id: number
  user_group_id: number
  module: string
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_deactivate: boolean
}

const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'mumineen', label: 'Mumineen' },
  { key: 'thaali', label: 'Thaali' },
  { key: 'distribution', label: 'Distribution' },
  { key: 'distributors', label: 'Distributors' },
  { key: 'sectors', label: 'Sectors' },
  { key: 'takhmeem', label: 'Takhmeem' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'users', label: 'Users' },
]

const PERM_KEYS = ['can_view', 'can_add', 'can_edit', 'can_deactivate']
const PERM_LABELS: Record<string, string> = {
  can_view: 'View', can_add: 'Add', can_edit: 'Edit', can_deactivate: 'Deact.'
}

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [groups, setGroups] = useState<UserGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [userForm, setUserForm] = useState({ full_name: '', username: '', password: '', user_group_id: '' })

  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null)
  const [groupName, setGroupName] = useState('')
  const [groupPerms, setGroupPerms] = useState<Record<string, Record<string, boolean>>>({})

  useEffect(() => { fetchUsers(); fetchGroups(); checkIfSuperAdmin() }, [])

  const checkIfSuperAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const { data: adminUser } = await supabase.from('admin_users')
      .select('user_groups(name)').eq('auth_id', session.user.id).single()
    setIsSuperAdmin((adminUser?.user_groups as any)?.name === 'Super Admin')
  }

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase.from('admin_users').select('*, user_groups(name)').order('full_name')
    setUsers(data || [])
    setLoading(false)
  }

  const fetchGroups = async () => {
    const { data } = await supabase.from('user_groups').select('*, permissions(*)').order('name')
    setGroups(data || [])
  }

  const openAddUser = () => {
    setEditingUser(null)
    setUserForm({ full_name: '', username: '', password: '', user_group_id: '' })
    setFormError(''); setShowUserModal(true)
  }

  const openEditUser = (u: AdminUser) => {
    setEditingUser(u)
    setUserForm({ full_name: u.full_name || '', username: u.username || '', password: '', user_group_id: u.user_group_id?.toString() || '' })
    setFormError(''); setShowUserModal(true)
  }

  const handleSaveUser = async () => {
    setFormError('')
    if (!userForm.full_name.trim()) { setFormError('Full name is required'); return }
    if (!userForm.username.trim()) { setFormError('Username is required'); return }
    if (!editingUser && !userForm.password.trim()) { setFormError('Password is required for new users'); return }
    setSaving(true)
    try {
      if (editingUser) {
        await supabase.from('admin_users').update({
          full_name: userForm.full_name, username: userForm.username,
          user_group_id: userForm.user_group_id ? parseInt(userForm.user_group_id) : null,
        }).eq('id', editingUser.id)
        if (isSuperAdmin && userForm.password.trim()) {
          const res = await fetch('/api/admin/change-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auth_id: editingUser.auth_id, new_password: userForm.password.trim() })
          })
          const result = await res.json()
          if (!res.ok) { setFormError(result.error || 'Password change failed'); setSaving(false); return }
        }
      } else {
        const email = `${userForm.username}@fmb.internal`
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email, password: userForm.password,
          options: { data: { username: userForm.username } }
        })
        if (authError) { setFormError(authError.message); setSaving(false); return }
        await supabase.from('admin_users').insert({
          auth_id: authData.user?.id, full_name: userForm.full_name,
          username: userForm.username,
          user_group_id: userForm.user_group_id ? parseInt(userForm.user_group_id) : null,
          status: 'active'
        })
      }
      await fetchUsers(); setShowUserModal(false)
    } catch (e: any) { setFormError(e.message || 'Something went wrong') }
    setSaving(false)
  }

  const toggleUserStatus = async (u: AdminUser) => {
    await supabase.from('admin_users').update({ status: u.status === 'active' ? 'inactive' : 'active' }).eq('id', u.id)
    await fetchUsers()
  }

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Delete "${u.full_name}"? This cannot be undone.`)) return
    await supabase.from('admin_users').delete().eq('id', u.id)
    await fetchUsers()
  }

  const initPerms = (): Record<string, Record<string, boolean>> => {
    const p: Record<string, Record<string, boolean>> = {}
    MODULES.forEach(m => { p[m.key] = { can_view: false, can_add: false, can_edit: false, can_deactivate: false } })
    return p
  }

  const openAddGroup = () => {
    setEditingGroup(null); setGroupName(''); setGroupPerms(initPerms()); setFormError(''); setShowGroupModal(true)
  }

  const openEditGroup = (g: UserGroup) => {
    setEditingGroup(g); setGroupName(g.name)
    const p = initPerms()
    ;(g.permissions || []).forEach(perm => {
      if (p[perm.module]) p[perm.module] = { can_view: perm.can_view, can_add: perm.can_add, can_edit: perm.can_edit, can_deactivate: perm.can_deactivate }
    })
    setGroupPerms(p); setFormError(''); setShowGroupModal(true)
  }

  const togglePerm = (module: string, perm: string) => {
    setGroupPerms(prev => ({ ...prev, [module]: { ...prev[module], [perm]: !prev[module][perm] } }))
  }

  const toggleAllModule = (module: string) => {
    const allOn = Object.values(groupPerms[module]).every(v => v)
    setGroupPerms(prev => ({ ...prev, [module]: { can_view: !allOn, can_add: !allOn, can_edit: !allOn, can_deactivate: !allOn } }))
  }

  const toggleAllPermission = (perm: string) => {
    const allOn = MODULES.every(m => groupPerms[m.key][perm])
    const updated = { ...groupPerms }
    MODULES.forEach(m => { updated[m.key] = { ...updated[m.key], [perm]: !allOn } })
    setGroupPerms(updated)
  }

  const handleSaveGroup = async () => {
    if (!groupName.trim()) { setFormError('Group name is required'); return }
    setSaving(true)
    let groupId: number
    if (editingGroup) {
      await supabase.from('user_groups').update({ name: groupName }).eq('id', editingGroup.id)
      groupId = editingGroup.id
      await supabase.from('permissions').delete().eq('user_group_id', groupId)
    } else {
      const { data } = await supabase.from('user_groups').insert({ name: groupName, status: 'active' }).select('id').single()
      groupId = data!.id
    }
    const rows = MODULES.map(m => ({
      user_group_id: groupId, module: m.key,
      can_view: groupPerms[m.key].can_view, can_add: groupPerms[m.key].can_add,
      can_edit: groupPerms[m.key].can_edit, can_deactivate: groupPerms[m.key].can_deactivate,
    }))
    await supabase.from('permissions').insert(rows)
    await fetchGroups(); setShowGroupModal(false); setSaving(false)
  }

  const toggleGroupStatus = async (g: UserGroup) => {
    await supabase.from('user_groups').update({ status: g.status === 'active' ? 'inactive' : 'active' }).eq('id', g.id)
    await fetchGroups()
  }

  const deleteGroup = async (g: UserGroup) => {
    if (!confirm(`Delete group "${g.name}"? This cannot be undone.`)) return
    await supabase.from('permissions').delete().eq('user_group_id', g.id)
    await supabase.from('user_groups').delete().eq('id', g.id)
    await fetchGroups()
  }

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h4 className="mb-0">Users</h4>
          <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Manage admin users and user groups</p>
        </div>
        {activeTab === 'users'
          ? <button className="btn btn-primary btn-sm" onClick={openAddUser}>+ Add User</button>
          : <button className="btn btn-primary btn-sm" onClick={openAddGroup}>+ Add Group</button>}
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Users', value: users.length, color: '#364574' },
          { label: 'Active', value: users.filter(u => u.status === 'active').length, color: '#0ab39c' },
          { label: 'User Groups', value: groups.length, color: '#f7b84b' },
        ].map((s, i) => (
          <div key={i} className="col-4 col-md-3">
            <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <div className="card-body p-3">
                <p className="text-muted mb-1" style={{ fontSize: '12px' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color, fontSize: '22px' }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')} style={{ fontSize: '13px' }}>Admin Users</button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')} style={{ fontSize: '13px' }}>Groups & Permissions</button>
        </li>
      </ul>

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            <div className="mb-3">
              <input type="text" className="form-control form-control-sm" placeholder="Search users..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ maxWidth: '300px', width: '100%' }} />
            </div>
            {loading
              ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
              : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead style={{ background: '#f8f9fa' }}>
                      <tr>
                        {['#', 'Full Name', 'Username', 'Group', 'Status', 'Actions'].map(h => (
                          <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => (
                        <tr key={u.id}>
                          <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                          <td style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>{u.full_name}</td>
                          <td style={{ fontSize: '13px' }}>{u.username}</td>
                          <td style={{ fontSize: '13px' }}>{u.user_groups?.name || '—'}</td>
                          <td>
                            <span className={`badge ${u.status === 'active' ? 'bg-success' : 'bg-secondary'}`}
                              style={{ fontSize: '11px' }}>{u.status}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn btn-sm btn-outline-primary me-1"
                              style={{ fontSize: '12px' }} onClick={() => openEditUser(u)}>Edit</button>
                            <button
                              className={`btn btn-sm me-1 ${u.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                              style={{ fontSize: '12px' }} onClick={() => toggleUserStatus(u)}>
                              {u.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="btn btn-sm btn-outline-danger"
                              style={{ fontSize: '12px' }} onClick={() => deleteUser(u)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={6} className="text-center text-muted py-4">No users found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      )}

      {/* GROUPS TAB */}
      {activeTab === 'groups' && (
        <div className="d-flex flex-column gap-3">
          {groups.map(g => (
            <div key={g.id} className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <h6 className="mb-0 fw-semibold">{g.name}</h6>
                    <small className="text-muted">{(g.permissions || []).filter(p => p.can_view).length} modules accessible</small>
                  </div>
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <span className={`badge ${g.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>{g.status}</span>
                    <button className="btn btn-sm btn-outline-primary" style={{ fontSize: '12px' }} onClick={() => openEditGroup(g)}>Edit</button>
                    <button className={`btn btn-sm ${g.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                      style={{ fontSize: '12px' }} onClick={() => toggleGroupStatus(g)}>
                      {g.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-sm btn-outline-danger" style={{ fontSize: '12px' }} onClick={() => deleteGroup(g)}>Delete</button>
                  </div>
                </div>
                {/* Permissions table — scrollable on mobile */}
                <div className="table-responsive">
                  <table className="table table-sm mb-0" style={{ fontSize: '12px', minWidth: '320px' }}>
                    <thead style={{ background: '#f8f9fa' }}>
                      <tr>
                        <th style={{ color: '#6c757d' }}>Module</th>
                        {PERM_KEYS.map(k => (
                          <th key={k} style={{ color: '#6c757d', textAlign: 'center' }}>{PERM_LABELS[k]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map(m => {
                        const perm = (g.permissions || []).find(p => p.module === m.key)
                        return (
                          <tr key={m.key}>
                            <td style={{ fontWeight: 500 }}>{m.label}</td>
                            {PERM_KEYS.map(k => (
                              <td key={k} style={{ textAlign: 'center' }}>
                                {perm?.[k as keyof Permission]
                                  ? <span style={{ color: '#0ab39c', fontWeight: 700 }}>✓</span>
                                  : <span style={{ color: '#dee2e6' }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
          {groups.length === 0 && <div className="text-center text-muted py-4">No groups found</div>}
        </div>
      )}

      {/* USER MODAL */}
      {showUserModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowUserModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingUser ? 'Edit User' : 'Add User'}</h5>
                <button className="btn-close" onClick={() => setShowUserModal(false)} />
              </div>
              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {formError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{formError}</div>}
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Full Name *</label>
                    <input type="text" className="form-control form-control-sm" value={userForm.full_name}
                      onChange={(e) => setUserForm(p => ({ ...p, full_name: e.target.value }))} />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Username *</label>
                    <input type="text" className="form-control form-control-sm" value={userForm.username}
                      onChange={(e) => setUserForm(p => ({ ...p, username: e.target.value }))} />
                  </div>
                  <div className="col-12 col-sm-6">
                    {(!editingUser || isSuperAdmin) && (
                      <>
                        <label className="form-label" style={{ fontSize: '13px' }}>
                          Password {editingUser ? '(leave blank to keep)' : '*'}
                        </label>
                        <input type="password" className="form-control form-control-sm" value={userForm.password}
                          onChange={(e) => setUserForm(p => ({ ...p, password: e.target.value }))}
                          placeholder={editingUser ? 'Leave blank to keep' : 'Enter password'} />
                        {editingUser && isSuperAdmin && (
                          <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '4px' }}>🔒 Super Admin only</div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>User Group</label>
                    <select className="form-select form-select-sm" value={userForm.user_group_id}
                      onChange={(e) => setUserForm(p => ({ ...p, user_group_id: e.target.value }))}>
                      <option value="">Select group</option>
                      {groups.filter(g => g.status === 'active').map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowUserModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveUser} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GROUP MODAL */}
      {showGroupModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowGroupModal(false)}>
          <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingGroup ? 'Edit Group' : 'Add Group'}</h5>
                <button className="btn-close" onClick={() => setShowGroupModal(false)} />
              </div>
              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {formError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{formError}</div>}
                <div className="mb-3">
                  <label className="form-label" style={{ fontSize: '13px' }}>Group Name *</label>
                  <input type="text" className="form-control form-control-sm" value={groupName}
                    onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Manager, Viewer"
                    style={{ maxWidth: '300px', width: '100%' }} />
                </div>
                <label className="form-label" style={{ fontSize: '13px' }}>Module Permissions</label>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0" style={{ fontSize: '13px', minWidth: '360px' }}>
                    <thead style={{ background: '#f8f9fa' }}>
                      <tr>
                        <th style={{ width: '130px' }}>Module</th>
                        {PERM_KEYS.map(k => (
                          <th key={k} style={{ textAlign: 'center', cursor: 'pointer' }}
                            onClick={() => toggleAllPermission(k)}>
                            {PERM_LABELS[k]}
                            <div style={{ fontSize: '10px', color: '#0d6efd' }}>all</div>
                          </th>
                        ))}
                        <th style={{ textAlign: 'center' }}>
                          All
                          <div style={{ fontSize: '10px', color: '#6c757d' }}>row</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map(m => (
                        <tr key={m.key}>
                          <td style={{ fontWeight: 500 }}>{m.label}</td>
                          {PERM_KEYS.map(k => (
                            <td key={k} style={{ textAlign: 'center' }}>
                              <input type="checkbox"
                                checked={groupPerms[m.key]?.[k] || false}
                                onChange={() => togglePerm(m.key, k)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                            </td>
                          ))}
                          <td style={{ textAlign: 'center' }}>
                            <input type="checkbox"
                              checked={Object.values(groupPerms[m.key] || {}).every(v => v)}
                              onChange={() => toggleAllModule(m.key)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowGroupModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveGroup} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Group'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
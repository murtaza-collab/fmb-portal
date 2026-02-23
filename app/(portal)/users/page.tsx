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
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [groups, setGroups] = useState<UserGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showUserModal, setShowUserModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users')
  const [formError, setFormError] = useState('')

  const [userForm, setUserForm] = useState({
    full_name: '', username: '', password: '', user_group_id: ''
  })
  const [groupForm, setGroupForm] = useState({ name: '' })

  useEffect(() => { fetchUsers(); fetchGroups() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('admin_users')
      .select('*, user_groups(name)')
      .order('full_name')
    setUsers(data || [])
    setLoading(false)
  }

  const fetchGroups = async () => {
    const { data } = await supabase
      .from('user_groups')
      .select('*')
      .order('name')
    setGroups(data || [])
  }

  const openAddUser = () => {
    setEditingUser(null)
    setUserForm({ full_name: '', username: '', password: '', user_group_id: '' })
    setFormError('')
    setShowUserModal(true)
  }

  const openEditUser = (u: AdminUser) => {
    setEditingUser(u)
    setUserForm({ full_name: u.full_name || '', username: u.username || '', password: '', user_group_id: u.user_group_id?.toString() || '' })
    setFormError('')
    setShowUserModal(true)
  }

  const handleSaveUser = async () => {
    setFormError('')
    if (!userForm.full_name.trim()) { setFormError('Full name is required'); return }
    if (!userForm.username.trim()) { setFormError('Username is required'); return }
    if (!editingUser && !userForm.password.trim()) { setFormError('Password is required for new users'); return }

    setSaving(true)
    try {
      if (editingUser) {
        // Update admin_users record
        await supabase.from('admin_users').update({
          full_name: userForm.full_name,
          username: userForm.username,
          user_group_id: userForm.user_group_id ? parseInt(userForm.user_group_id) : null,
        }).eq('id', editingUser.id)

        // Update password if provided
        if (userForm.password.trim()) {
          await supabase.auth.admin?.updateUserById(editingUser.auth_id, {
            password: userForm.password
          })
        }
      } else {
        // Create auth user
        const email = `${userForm.username}@fmb.internal`
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password: userForm.password,
          options: { data: { username: userForm.username } }
        })

        if (authError) { setFormError(authError.message); setSaving(false); return }

        // Create admin_users record
        await supabase.from('admin_users').insert({
          auth_id: authData.user?.id,
          full_name: userForm.full_name,
          username: userForm.username,
          user_group_id: userForm.user_group_id ? parseInt(userForm.user_group_id) : null,
          status: 'active'
        })
      }

      await fetchUsers()
      setShowUserModal(false)
    } catch (e: any) {
      setFormError(e.message || 'Something went wrong')
    }
    setSaving(false)
  }

  const toggleUserStatus = async (u: AdminUser) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active'
    await supabase.from('admin_users').update({ status: newStatus }).eq('id', u.id)
    await fetchUsers()
  }

  const openAddGroup = () => {
    setEditingGroup(null)
    setGroupForm({ name: '' })
    setFormError('')
    setShowGroupModal(true)
  }

  const openEditGroup = (g: UserGroup) => {
    setEditingGroup(g)
    setGroupForm({ name: g.name })
    setFormError('')
    setShowGroupModal(true)
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) { setFormError('Group name is required'); return }
    setSaving(true)
    if (editingGroup) {
      await supabase.from('user_groups').update({ name: groupForm.name }).eq('id', editingGroup.id)
    } else {
      await supabase.from('user_groups').insert({ name: groupForm.name, status: 'active' })
    }
    await fetchGroups()
    setShowGroupModal(false)
    setSaving(false)
  }

  const toggleGroupStatus = async (g: UserGroup) => {
    const newStatus = g.status === 'active' ? 'inactive' : 'active'
    await supabase.from('user_groups').update({ status: newStatus }).eq('id', g.id)
    await fetchGroups()
  }

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
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
          <div key={i} className="col-md-3">
            <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <div className="card-body p-3">
                <p className="text-muted mb-1" style={{ fontSize: '13px' }}>{s.label}</p>
                <h4 className="mb-0" style={{ color: s.color }}>{s.value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Admin Users</button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>User Groups</button>
        </li>
      </ul>

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            <div className="mb-3">
              <input type="text" className="form-control" placeholder="Search users..."
                value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: '300px' }} />
            </div>
            {loading ? <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div> : (
              <table className="table table-hover mb-0">
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>{['#', 'Full Name', 'Username', 'Group', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, i) => (
                    <tr key={u.id}>
                      <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                      <td style={{ fontSize: '14px' }}>{u.full_name}</td>
                      <td style={{ fontSize: '13px' }}>{u.username}</td>
                      <td style={{ fontSize: '13px' }}>{u.user_groups?.name || '—'}</td>
                      <td>
                        <span className={`badge ${u.status === 'active' ? 'bg-success' : 'bg-secondary'}`}
                          style={{ fontSize: '11px' }}>{u.status}</span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-outline-primary me-1" style={{ fontSize: '12px' }} onClick={() => openEditUser(u)}>Edit</button>
                        <button className={`btn btn-sm ${u.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                          style={{ fontSize: '12px' }} onClick={() => toggleUserStatus(u)}>
                          {u.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-muted py-4">No users found</td></tr>
                  )}
                </tbody>
              </table>
            )}
            <div className="mt-2"><small className="text-muted">{filteredUsers.length} users</small></div>
          </div>
        </div>
      )}

      {/* GROUPS TAB */}
      {activeTab === 'groups' && (
        <div className="card" style={{ border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: '10px' }}>
          <div className="card-body">
            <table className="table table-hover mb-0">
              <thead style={{ background: '#f8f9fa' }}>
                <tr>{['#', 'Group Name', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ fontSize: '13px', color: '#6c757d', fontWeight: 600 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={g.id}>
                    <td style={{ fontSize: '13px', color: '#6c757d' }}>{i + 1}</td>
                    <td style={{ fontSize: '14px' }}>{g.name}</td>
                    <td>
                      <span className={`badge ${g.status === 'active' ? 'bg-success' : 'bg-secondary'}`}
                        style={{ fontSize: '11px' }}>{g.status}</span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline-primary me-1" style={{ fontSize: '12px' }} onClick={() => openEditGroup(g)}>Edit</button>
                      <button className={`btn btn-sm ${g.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                        style={{ fontSize: '12px' }} onClick={() => toggleGroupStatus(g)}>
                        {g.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {groups.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-muted py-4">No groups found</td></tr>
                )}
              </tbody>
            </table>
            <div className="mt-2"><small className="text-muted">{groups.length} groups</small></div>
          </div>
        </div>
      )}

      {/* USER MODAL */}
      {showUserModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingUser ? 'Edit User' : 'Add User'}</h5>
                <button className="btn-close" onClick={() => setShowUserModal(false)} />
              </div>
              <div className="modal-body">
                {formError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{formError}</div>}
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>Full Name *</label>
                    <input type="text" className="form-control form-control-sm" value={userForm.full_name}
                      onChange={(e) => setUserForm(prev => ({ ...prev, full_name: e.target.value }))}
                      placeholder="Enter full name" />
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>Username *</label>
                    <input type="text" className="form-control form-control-sm" value={userForm.username}
                      onChange={(e) => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="Enter username" />
                  </div>
                  <div className="col-6">
                    <label className="form-label" style={{ fontSize: '13px' }}>
                      Password {editingUser ? '(leave blank to keep)' : '*'}
                    </label>
                    <input type="password" className="form-control form-control-sm" value={userForm.password}
                      onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={editingUser ? 'Leave blank to keep' : 'Enter password'} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '13px' }}>User Group</label>
                    <select className="form-select form-select-sm" value={userForm.user_group_id}
                      onChange={(e) => setUserForm(prev => ({ ...prev, user_group_id: e.target.value }))}>
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
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingGroup ? 'Edit Group' : 'Add Group'}</h5>
                <button className="btn-close" onClick={() => setShowGroupModal(false)} />
              </div>
              <div className="modal-body">
                {formError && <div className="alert alert-danger py-2" style={{ fontSize: '13px' }}>{formError}</div>}
                <label className="form-label" style={{ fontSize: '13px' }}>Group Name *</label>
                <input type="text" className="form-control form-control-sm" value={groupForm.name}
                  onChange={(e) => setGroupForm({ name: e.target.value })}
                  placeholder="e.g. Admin, Manager, Viewer" autoFocus />
              </div>
              <div className="modal-footer">
                <button className="btn btn-light btn-sm" onClick={() => setShowGroupModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveGroup} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Notification {
  id: number
  title: string
  message: string
  type: string
  category: string
  is_read: boolean
  created_at: string
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    loadNotifications()
    
    // Real-time subscription
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => loadNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    setNotifications(data || [])
    setUnreadCount(data?.filter(n => !n.is_read).length || 0)
  }

  const markAsRead = async (id: number) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    loadNotifications()
  }

  const markAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false)
    loadNotifications()
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }

  return (
    <div className="position-relative">
      <button
        className="btn btn-link position-relative"
        onClick={() => setShowDropdown(!showDropdown)}
        style={{ 
          color: 'var(--bs-body-color)', 
          fontSize: '20px',
          padding: '8px',
          borderRadius: '8px'
        }}
      >
        <i className="bi bi-bell"></i>
        {unreadCount > 0 && (
          <span 
            className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" 
            style={{ 
              fontSize: '10px', 
              minWidth: '18px', 
              height: '18px',
              lineHeight: '18px',
              padding: '0'
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div 
            className="position-absolute end-0 mt-2" 
            style={{ 
              width: '380px', 
              zIndex: 1000,
              background: 'var(--bs-body-bg)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              maxHeight: '500px',
              overflow: 'hidden',
              border: '1px solid var(--bs-border-color)'
            }}
          >
            <div 
              className="d-flex justify-content-between align-items-center p-3" 
              style={{ borderBottom: '1px solid var(--bs-border-color)' }}
            >
              <h6 className="mb-0 fw-bold">Notifications</h6>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="btn btn-sm btn-link"
                  style={{ fontSize: '12px', color: '#364574' }}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
              {notifications.length === 0 ? (
                <div className="text-center py-4" style={{ color: 'var(--bs-secondary-color)' }}>
                  <i className="bi bi-bell-slash fs-3 d-block mb-2"></i>
                  <small>No notifications</small>
                </div>
              ) : (
                notifications.map(notification => (
                  <div
                    key={notification.id}
                    onClick={() => markAsRead(notification.id)}
                    className={`p-3 border-bottom ${!notification.is_read ? 'bg-primary bg-opacity-10' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex gap-2">
                      <div 
                        className={`rounded-circle d-flex align-items-center justify-content-center 
                          ${notification.type === 'success' ? 'bg-success' : 
                            notification.type === 'warning' ? 'bg-warning' : 
                            notification.type === 'error' ? 'bg-danger' : 'bg-info'}`} 
                        style={{ width: '32px', height: '32px', flexShrink: 0 }}
                      >
                        <i 
                          className={`bi ${
                            notification.category === 'thaali' ? 'bi-cup-hot' :
                            notification.category === 'stop_request' ? 'bi-pause-circle' :
                            notification.category === 'address' ? 'bi-geo-alt' :
                            'bi-bell'
                          } text-white`} 
                          style={{ fontSize: '14px' }}
                        ></i>
                      </div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between">
                          <h6 
                            className="mb-1" 
                            style={{ fontSize: '13px', fontWeight: notification.is_read ? 400 : 600 }}
                          >
                            {notification.title}
                          </h6>
                          {!notification.is_read && (
                            <span className="badge bg-primary" style={{ fontSize: '9px' }}>NEW</span>
                          )}
                        </div>
                        <p 
                          className="mb-1" 
                          style={{ fontSize: '12px', color: 'var(--bs-secondary-color)' }}
                        >
                          {notification.message}
                        </p>
                        <small style={{ fontSize: '11px', color: 'var(--bs-secondary-color)' }}>
                          {formatTime(notification.created_at)}
                        </small>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div 
            className="position-fixed inset-0" 
            onClick={() => setShowDropdown(false)} 
            style={{ zIndex: 999 }} 
          />
        </>
      )}
    </div>
  )
}
// app/(portal)/settings/kitchen/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function KitchenSettingsPage() {
  // ✅ State for BOTH cutoff settings
  const [customizationCutoffHours, setCustomizationCutoffHours] = useState('36');
  const [stopThaaliCutoffHours, setStopThaaliCutoffHours] = useState('48');
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kitchen_settings')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'customization_cutoff_hours',
          'stop_thaali_cutoff_hours'
        ]);

      if (error) throw error;

      if (data && data.length > 0) {
        const customization = data.find((d) => d.setting_key === 'customization_cutoff_hours');
        const stopThaali = data.find((d) => d.setting_key === 'stop_thaali_cutoff_hours');
        
        if (customization) setCustomizationCutoffHours(customization.setting_value);
        if (stopThaali) setStopThaaliCutoffHours(stopThaali.setting_value);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to load: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const customHours = parseInt(customizationCutoffHours, 10);
      const stopHours = parseInt(stopThaaliCutoffHours, 10);

      if (isNaN(customHours) || customHours < 1 || customHours > 168) {
        throw new Error('Customization hours must be 1-168');
      }
      if (isNaN(stopHours) || stopHours < 1 || stopHours > 168) {
        throw new Error('Stop thaali hours must be 1-168');
      }

      // Save both settings
      await supabase.from('kitchen_settings').upsert({ 
        setting_key: 'customization_cutoff_hours',
        setting_value: customHours.toString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });

      await supabase.from('kitchen_settings').upsert({ 
        setting_key: 'stop_thaali_cutoff_hours',
        setting_value: stopHours.toString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });

      setMessage({ type: 'success', text: '✅ All settings saved!' });
      await loadSettings();
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const quickSelectHours = [24, 36, 48, 60, 72, 96];

  const formatHoursDisplay = (hours: string) => {
    const h = parseInt(hours, 10);
    const days = Math.floor(h / 24);
    const remainder = h % 24;
    
    if (days > 0 && remainder === 0) return `${days} day${days > 1 ? 's' : ''} before`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} and ${remainder}h before`;
    return `${remainder} hours before`;
  };

  if (loading) return <div className="p-4"><div className="spinner-border" /></div>;

  return (
    <div className="container-fluid p-4">
      <div className="row mb-4">
        <div className="col-12">
          <h2 className="h4 mb-0">
            <i className="bi bi-cup-hot me-2"></i>
            Kitchen Settings
          </h2>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} mb-4`}>
          {message.text}
        </div>
      )}

      {/* Customization Cutoff */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">
            <i className="bi bi-tune me-2"></i>
            Customization Cutoff
          </h5>
        </div>
        <div className="card-body p-4">
          <p className="text-muted mb-3">
            Hours before delivery for customization requests.
          </p>

          <div className="mb-3">
            <label className="form-label fw-bold">QUICK SELECT</label>
            <div className="d-flex gap-2 flex-wrap">
              {quickSelectHours.map((hours) => (
                <button
                  key={hours}
                  onClick={() => setCustomizationCutoffHours(hours.toString())}
                  className={`btn px-4 py-2 rounded-pill ${
                    customizationCutoffHours === hours.toString()
                      ? 'btn-primary'
                      : 'btn-outline-secondary'
                  }`}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold">OR ENTER CUSTOM HOURS</label>
            <div className="input-group" style={{ maxWidth: '300px' }}>
              <input
                type="number"
                className="form-control"
                value={customizationCutoffHours}
                onChange={(e) => setCustomizationCutoffHours(e.target.value)}
                min="1"
                max="168"
              />
              <span className="input-group-text">hours</span>
            </div>
          </div>

          <div className="alert alert-info mb-0">
            <strong>Current: {customizationCutoffHours} hours</strong> 
            <span className="ms-2">({formatHoursDisplay(customizationCutoffHours)})</span>
          </div>
        </div>
      </div>

      {/* Stop Thaali Cutoff */}
      <div className="card mb-4">
        <div className="card-header bg-success text-white">
          <h5 className="mb-0">
            <i className="bi bi-pause-circle me-2"></i>
            Stop Thaali Cutoff
          </h5>
        </div>
        <div className="card-body p-4">
          <p className="text-muted mb-3">
            Hours before delivery for stop thaali requests.
          </p>

          <div className="mb-3">
            <label className="form-label fw-bold">QUICK SELECT</label>
            <div className="d-flex gap-2 flex-wrap">
              {quickSelectHours.map((hours) => (
                <button
                  key={hours}
                  onClick={() => setStopThaaliCutoffHours(hours.toString())}
                  className={`btn px-4 py-2 rounded-pill ${
                    stopThaaliCutoffHours === hours.toString()
                      ? 'btn-success'
                      : 'btn-outline-secondary'
                  }`}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold">OR ENTER CUSTOM HOURS</label>
            <div className="input-group" style={{ maxWidth: '300px' }}>
              <input
                type="number"
                className="form-control"
                value={stopThaaliCutoffHours}
                onChange={(e) => setStopThaaliCutoffHours(e.target.value)}
                min="1"
                max="168"
              />
              <span className="input-group-text">hours</span>
            </div>
          </div>

          <div className="alert alert-info mb-0">
            <strong>Current: {stopThaaliCutoffHours} hours</strong> 
            <span className="ms-2">({formatHoursDisplay(stopThaaliCutoffHours)})</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        className="btn btn-primary btn-lg w-100"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save All Cutoff Settings'}
      </button>
    </div>
  );
}
'use client'

import { useEffect } from 'react'

export default function PrivacyPolicyPage() {
  // Force light theme - override parent layout
  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', 'light')
    document.body.style.backgroundColor = '#fff'
    document.body.style.color = '#212529'
    
    return () => {
      // Cleanup when leaving page
      document.documentElement.removeAttribute('data-bs-theme')
    }
  }, [])

  return (
    <div className="container py-5" style={{ maxWidth: '800px' }}>
      <h1 className="mb-4 text-primary">
        Faiz ul Mawaid Il Burhaniyah App — Privacy Policy
      </h1>
      <p className="text-muted mb-4">Last Updated: March 2026</p>
      
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <h5 className="text-primary mb-3">1. Information We Collect</h5>
          <p>We collect the following information to provide our community services:</p>
          <ul>
            <li><strong>Personal Information:</strong> Name, SF#, ITS#, email, phone number, address</li>
            <li><strong>Family Information:</strong> Details of family members for household management</li>
            <li><strong>Thaali Preferences:</strong> Customization requests and stop/resume preferences</li>
            <li><strong>Usage Data:</strong> App activity and interaction with thaali distribution system</li>
          </ul>

          <h5 className="text-primary mb-3 mt-4">2. How We Use Your Data</h5>
          <p>Your data is used solely for:</p>
          <ul>
            <li>Authenticating your account and managing access</li>
            <li>Processing thaali distribution requests</li>
            <li>Managing your profile and family members</li>
            <li>Sending community updates (if you opt-in)</li>
            <li>Improving our services</li>
          </ul>

          <h5 className="text-primary mb-3 mt-4">3. Data Storage & Security</h5>
          <ul>
            <li>All data is stored securely in Supabase (PostgreSQL database with encryption at rest)</li>
            <li>Access is restricted to authorized FMB administrators only</li>
            <li>We use industry-standard security measures to protect your data</li>
            <li>Data is never sold or shared with third parties</li>
          </ul>

          <h5 className="text-primary mb-3 mt-4">4. Your Rights</h5>
          <p>You have the right to:</p>
          <ul>
            <li>Access and review your personal data</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your account (contact administrator)</li>
            <li>Export your data in a readable format</li>
          </ul>

          <h5 className="text-primary mb-3 mt-4">5. Data Retention</h5>
          <p>We retain your data as long as you are an active member of the FMB community. Upon request or membership termination, we will delete or anonymize your personal data within 30 days.</p>

          <h5 className="text-primary mb-3 mt-4">6. Children's Privacy</h5>
          <p>Our app is intended for community members of all ages. We collect minimal information about children (name, date of birth) solely for thaali distribution purposes. Parents/guardians are responsible for managing children's information.</p>

          <h5 className="text-primary mb-3 mt-4">7. Changes to This Policy</h5>
          <p>We may update this privacy policy from time to time. Significant changes will be communicated to users via the app or email.</p>

          <h5 className="text-primary mb-3 mt-4">8. Contact Us</h5>
          <p>For privacy concerns or questions, contact:</p>
          <p className="mb-0">
            <strong>Email:</strong> fmb.amb.52@gmail.com<br/>
            <strong>Organization:</strong> Faiz ul Mawaid Il Burhaniyah (FMB)
          </p>
        </div>
      </div>

      <footer className="text-center text-muted mt-5 mb-3">
        <small>© 2026 Faiz ul Mawaid Il Burhaniyah Community Welfare Organization</small>
      </footer>
    </div>
  )
}
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-6 text-foreground">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mb-8 text-xs uppercase tracking-wide text-muted-foreground">
        Flax HR · Health &amp; Beyond Food Pvt. Ltd · Effective 12 September 2026
      </p>

      <Section title="Who we are">
        Flax HR is a private HR application operated by Health &amp; Beyond Food
        Pvt. Ltd (Flax) for its own employees at Flax outlets across Mumbai,
        Bangalore and Goa. The app is not distributed publicly; access is
        limited to onboarded staff.
      </Section>

      <Section title="What we collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>Your employee profile: name, employee code, phone, email, designation, outlet, home address, emergency contact.</li>
          <li>Attendance: punch-in/out timestamps, GPS coordinates at the time of punch, selfie photo when required, device information.</li>
          <li>Payroll: monthly salary, deductions, leave and overtime balances.</li>
          <li>Discipline: cards issued, grievances raised, performance reviews.</li>
          <li>Push notification token (Firebase Cloud Messaging) so the app can alert you to shift reminders, card alerts and leave decisions.</li>
        </ul>
      </Section>

      <Section title="Why we collect it">
        Only to run our own HR operations — payroll, attendance verification,
        performance management and statutory compliance. Location and selfie
        are used strictly to verify a genuine, on-site punch.
      </Section>

      <Section title="How we store it">
        Data lives in our Supabase project (region: ap-south-1, Mumbai).
        Access is role-scoped via row-level security. Selfies are stored in a
        private Supabase Storage bucket. We do not sell or share data with
        third parties for marketing.
      </Section>

      <Section title="Third-party services">
        <ul className="ml-5 list-disc space-y-1">
          <li>Supabase (PostgreSQL, Auth, Storage)</li>
          <li>Cloudflare (web hosting, R2 object storage)</li>
          <li>Firebase Cloud Messaging (Android push notifications)</li>
          <li>Resend (transactional email)</li>
          <li>Slack (internal HR alerts, no personal data leaves the workspace)</li>
        </ul>
      </Section>

      <Section title="Your rights">
        You may ask HR (hr@flaxitup.com) at any time to see, correct or
        permanently delete your data. On exit, records are retained only for
        the statutory period required by Indian labour and tax law, then
        deleted.
      </Section>

      <Section title="Contact">
        Email <a className="text-primary underline" href="mailto:hr@flaxitup.com">hr@flaxitup.com</a> or write to
        Health &amp; Beyond Food Pvt. Ltd, Lower Parel (West), Mumbai.
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </section>
  )
}

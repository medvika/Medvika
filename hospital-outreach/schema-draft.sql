-- Draft-only hospital outreach staging schema.
-- NOT applied to production. Execute only after admin access review.
create table if not exists public.medvika_outreach_contacts (
 id uuid primary key default gen_random_uuid(),
 hospital_name text not null check(length(trim(hospital_name))>1),
 email text not null,
 city text,
 campaign_name text not null default 'UP Hospitals Website Outreach',
 status text not null default 'unapproved' check(status in ('unapproved','approved','excluded','unsubscribed')),
 opt_out_at timestamptz,
 source text not null default 'hospital list upload',
 crm_lead_id uuid references public.medvika_leads(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint outreach_contact_email_basic check(email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
create unique index if not exists medvika_outreach_unique_campaign_email
 on public.medvika_outreach_contacts (campaign_name,lower(email));
create table if not exists public.medvika_outreach_events (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid not null references public.medvika_outreach_contacts(id) on delete cascade,
 event_type text not null check(event_type in ('imported','reviewed','approved','excluded','unsubscribed','note')),
 note text, created_at timestamptz not null default now()
);
alter table public.medvika_outreach_contacts enable row level security;
alter table public.medvika_outreach_events enable row level security;
revoke all on public.medvika_outreach_contacts from anon,authenticated;
revoke all on public.medvika_outreach_events from anon,authenticated;
-- No anon/authenticated RLS policies. Secure server side operations only.
-- NO MAIL SENDING functions, triggers, or schedules are defined here.

-- Draft-only outreach schema. Not applied to production automatically.
create table if not exists public.medvika_hospital_outreach_contacts (
 id uuid primary key default gen_random_uuid(),
 hospital_name text not null check (length(trim(hospital_name)) between 2 and 200),
 email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 city text,
 source text not null default 'hospital_csv_review',
 website text,
 inhouse_pharmacy boolean,
 verified_website boolean not null default false,
 review_status text not null default 'pending' check(review_status in ('pending','eligible','ineligible','unsubscribed')),
 email_draft_subject text,
 email_draft_body text,
 lead_id uuid references public.medvika_leads(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint unique_outreach_email unique(email)
);
create table if not exists public.medvika_hospital_outreach_events (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid not null references public.medvika_hospital_outreach_contacts(id) on delete cascade,
 event_type text not null check(event_type in ('imported','reviewed','draft_edited','unsubscribed')),
 note text,
 created_at timestamptz not null default now()
);
alter table public.medvika_hospital_outreach_contacts enable row level security;
alter table public.medvika_hospital_outreach_events enable row level security;
revoke all on public.medvika_hospital_outreach_contacts from public,anon,authenticated;
revoke all on public.medvika_hospital_outreach_events from public,anon,authenticated;
-- No anon/authenticated policies. Server-side authenticated and allowlisted admin API uses service role.
-- Deliberately no send queue, SMTP integration, or scheduled sending.

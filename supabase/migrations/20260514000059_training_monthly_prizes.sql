-- Training prizes: the top 3 each month win.
--
-- Monthly points = points from modules passed that month (same rule as the
-- all-time board: best score + 50 first try + 25 on time). Ties go to whoever
-- reached the total first. Prizes are editable (seeded ₹2,000 / ₹1,000 /
-- ₹500 + a gift). Admins mark each month's prizes as paid; that record is
-- kept even if scores move later.
--
-- Also: café photos for the "Our outlets" lesson, and the outlet league
-- (the Operations team's monthly outlet scorecards) for everyone.

create table if not exists training.prizes (
  rank   smallint primary key check (rank between 1 and 3),
  title  text not null
);
alter table training.prizes enable row level security;

insert into training.prizes (rank, title) values
  (1, '₹2,000 + gift'), (2, '₹1,000 + gift'), (3, '₹500 + gift')
on conflict (rank) do nothing;

create table if not exists training.prize_payouts (
  month       date not null,
  rank        smallint not null check (rank between 1 and 3),
  employee_id uuid not null references core.employees(id) on delete cascade,
  points      integer not null,
  prize       text not null,
  paid_at     timestamptz not null default now(),
  paid_by     uuid,
  primary key (month, rank)
);
alter table training.prize_payouts enable row level security;

-- Monthly board: every employee with points in the month, ranked.
create or replace function training.month_board(p_month date)
returns table (employee_id uuid, points int, passed int, rk int)
language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  with m as (
    select date_trunc('month', p_month)::date f, (date_trunc('month', p_month) + interval '1 month')::date t
  ), x as (
    select a.employee_id,
           sum(training.assignment_points(a, mo.pass_mark))::int points,
           count(*)::int passed,
           max(a.passed_at) last_pass
    from training.assignments a
    join training.modules mo on mo.id = a.module_id
    join core.employees e on e.id = a.employee_id and e.is_active and e.deleted_at is null
    cross join m
    where a.status = 'passed' and a.passed_at >= m.f and a.passed_at < m.t
    group by a.employee_id
  )
  select employee_id, points, passed,
         (row_number() over (order by points desc, last_pass asc))::int
  from x where points > 0
$$;

-- For employees: this month's prizes, top 10 (first name + initial), and me.
create or replace function public.training_month_prizes(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Kolkata')::date))::date;
  v_me uuid := training.me();
begin
  return jsonb_build_object(
    'month', v_month,
    'ends', (v_month + interval '1 month' - interval '1 day')::date,
    'prizes', (select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'title', title) order by rank), '[]'::jsonb) from training.prizes),
    'me', (select jsonb_build_object('rank', b.rk, 'points', b.points) from training.month_board(v_month) b where b.employee_id = v_me),
    'board', (select coalesce(jsonb_agg(jsonb_build_object(
                'rank', b.rk, 'points', b.points, 'me', b.employee_id = v_me,
                'name', split_part(e.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(e.full_name, ' ', 2), ''), 1) || '.', ''),
                'outlet', coalesce(o.display_name, o.name)) order by b.rk), '[]'::jsonb)
              from training.month_board(v_month) b
              join core.employees e on e.id = b.employee_id
              left join public.flax_outlets o on o.id = e.outlet_id
              where b.rk <= 10));
end $$;

-- For admins / viewers: the month's top 3 with full names and payout status.
create or replace function public.training_month_winners(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path to 'training', 'core', 'public' as $$
declare v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Kolkata')::date))::date;
begin
  perform training.require_viewer();
  return jsonb_build_object(
    'month', v_month,
    'prizes', (select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'title', title) order by rank), '[]'::jsonb) from training.prizes),
    'winners', (select coalesce(jsonb_agg(jsonb_build_object(
                  'rank', b.rk, 'employee_id', e.id, 'name', e.full_name, 'employee_code', e.employee_code,
                  'outlet', coalesce(o.display_name, o.name), 'points', b.points, 'passed', b.passed,
                  'prize', p.title,
                  'paid_at', po.paid_at, 'paid_to', pe.full_name) order by b.rk), '[]'::jsonb)
                from training.month_board(v_month) b
                join core.employees e on e.id = b.employee_id
                left join public.flax_outlets o on o.id = e.outlet_id
                left join training.prizes p on p.rank = b.rk
                left join training.prize_payouts po on po.month = v_month and po.rank = b.rk
                left join core.employees pe on pe.id = po.employee_id
                where b.rk <= 3),
    'paid', (select coalesce(jsonb_agg(jsonb_build_object('rank', po.rank, 'name', e.full_name, 'points', po.points,
               'prize', po.prize, 'paid_at', po.paid_at) order by po.rank), '[]'::jsonb)
             from training.prize_payouts po join core.employees e on e.id = po.employee_id
             where po.month = v_month));
end $$;

create or replace function public.training_mark_prize_paid(p_month date, p_rank int, p_paid boolean)
returns void language plpgsql security definer set search_path to 'training', 'core', 'public' as $$
declare v_month date := date_trunc('month', p_month)::date; b record; v_prize text;
begin
  perform training.require_admin();
  if not p_paid then
    delete from training.prize_payouts where month = v_month and rank = p_rank;
    return;
  end if;
  select * into b from training.month_board(v_month) x where x.rk = p_rank;
  if b.employee_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select title into v_prize from training.prizes where rank = p_rank;
  insert into training.prize_payouts (month, rank, employee_id, points, prize, paid_by)
  values (v_month, p_rank, b.employee_id, b.points, coalesce(v_prize, ''), auth.uid())
  on conflict (month, rank) do update set employee_id = excluded.employee_id, points = excluded.points,
    prize = excluded.prize, paid_at = now(), paid_by = excluded.paid_by;
end $$;

create or replace function public.training_save_prizes(p_first text, p_second text, p_third text)
returns void language plpgsql security definer set search_path to 'training', 'public' as $$
begin
  perform training.require_admin();
  insert into training.prizes (rank, title) values (1, p_first), (2, p_second), (3, p_third)
  on conflict (rank) do update set title = excluded.title;
end $$;

do $$
declare f text;
begin
  foreach f in array array['training_month_prizes(date)', 'training_month_winners(date)',
                           'training_mark_prize_paid(date, int, boolean)', 'training_save_prizes(text, text, text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Outlet league: the Operations team's monthly outlet scorecards
-- (public.flax_outlet_scorecards, period_type = 'month'), last N months, for
-- everyone. Rank, outlet, composite score, grade, rating and complaints;
-- revenue is left out.
create or replace function public.training_outlet_league(p_months int default 2)
returns jsonb language sql stable security definer set search_path to 'training', 'core', 'public' as $$
  with months as (
    select distinct period_key, period_start, status from public.flax_outlet_scorecards
    where period_type = 'month' order by period_start desc limit greatest(1, least(coalesce(p_months, 2), 6))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'month', m.period_key, 'start', m.period_start, 'status', m.status,
      'my_outlet', (select outlet_id from core.employees where id = training.me()),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object(
                  'rank', s.rank, 'outlet_id', s.outlet_id, 'outlet', s.outlet_name, 'score', s.composite,
                  'grade', s.grade, 'rating', round(s.rating, 2), 'complaints', s.complaints, 'eligible', s.eligible)
                order by s.rank nulls last), '[]'::jsonb)
               from public.flax_outlet_scorecards s
               where s.period_type = 'month' and s.period_key = m.period_key))
    order by m.period_start desc), '[]'::jsonb)
  from months m
$$;
revoke all on function public.training_outlet_league(int) from public, anon;
grant execute on function public.training_outlet_league(int) to authenticated;

-- Café photos for "Our outlets", from the Flax website's media (Food
-- Database flax_site_media). Uploads made in Admin are kept.
insert into training.outlet_media (outlet_id, photo_url, note)
select x.outlet_id, x.url, x.note
from (values
  ('fort', 'https://f005.backblazeb2.com/file/flax-website/site/bom-cafe-1/1789886229894-caefeaf1.jpeg', 'Our Mumbai café'),
  ('indiranagar_flax_cafe', 'https://f005.backblazeb2.com/file/flax-website/site/hero-bangalore/1789886135338-bd1ad435.webp', 'Our Bangalore café'),
  ('indiranagar', 'https://f005.backblazeb2.com/file/flax-website/site/blr-g1/1789886428225-cd1ac087.webp', null),
  ('goa', 'https://f005.backblazeb2.com/file/flax-website/site/hero-goa/1789971840056-a518d8ec.webp', 'Our Goa café')
) x(outlet_id, url, note)
join public.flax_outlets o on o.id = x.outlet_id
on conflict (outlet_id) do nothing;

notify pgrst, 'reload schema';

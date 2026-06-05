-- ContratoDB - esquema inicial para Supabase
-- 1. Crear un proyecto en Supabase.
-- 2. Ejecutar este archivo en SQL Editor.
-- 3. Crear tu usuario desde la app o desde Supabase Auth.
-- 4. Marcar tu perfil como docente:
--    update public.profiles set role = 'teacher', full_name = 'Santiago Hernández'
--    where email = 'TU_EMAIL@DOMINIO.COM';

create extension if not exists "pgcrypto";

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#0f766e',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'student' check (role in ('teacher', 'student')),
  team_id uuid references public.teams(id) on delete set null,
  contract_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists contract_accepted_at timestamptz;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text not null default '',
  due_date date not null,
  max_coins integer not null default 0 check (max_coins >= 0),
  status text not null default 'Programada',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  penalty integer not null default 0 check (penalty >= 0),
  feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, delivery_id)
);

with delivery_dupe_map as (
  select duplicate_id, keep_id
  from (
    select
      id as duplicate_id,
      first_value(id) over (partition by sort_order order by created_at, id) as keep_id,
      row_number() over (partition by sort_order order by created_at, id) as row_number
    from public.deliveries
  ) ranked
  where row_number > 1
)
insert into public.payments (student_id, delivery_id, coins, penalty, feedback, created_at, updated_at)
select
  p.student_id,
  d.keep_id,
  p.coins,
  p.penalty,
  p.feedback,
  p.created_at,
  p.updated_at
from public.payments p
join delivery_dupe_map d on d.duplicate_id = p.delivery_id
on conflict (student_id, delivery_id) do update set
  coins = greatest(public.payments.coins, excluded.coins),
  penalty = greatest(public.payments.penalty, excluded.penalty),
  feedback = case
    when public.payments.feedback = '' then excluded.feedback
    when excluded.feedback = '' then public.payments.feedback
    else public.payments.feedback || E'\n' || excluded.feedback
  end,
  updated_at = now();

with delivery_dupe_map as (
  select duplicate_id, keep_id
  from (
    select
      id as duplicate_id,
      first_value(id) over (partition by sort_order order by created_at, id) as keep_id,
      row_number() over (partition by sort_order order by created_at, id) as row_number
    from public.deliveries
  ) ranked
  where row_number > 1
)
delete from public.payments p
using delivery_dupe_map d
where p.delivery_id = d.duplicate_id;

with delivery_dupe_map as (
  select duplicate_id, keep_id
  from (
    select
      id as duplicate_id,
      first_value(id) over (partition by sort_order order by created_at, id) as keep_id,
      row_number() over (partition by sort_order order by created_at, id) as row_number
    from public.deliveries
  ) ranked
  where row_number > 1
)
delete from public.deliveries d
using delivery_dupe_map m
where d.id = m.duplicate_id;

create unique index if not exists deliveries_sort_order_key
on public.deliveries (sort_order);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'student'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_teacher()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

create or replace function public.accept_contract()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_at timestamptz;
begin
  accepted_at := now();

  update public.profiles
  set contract_accepted_at = accepted_at
  where id = auth.uid()
    and role = 'student';

  return accepted_at;
end;
$$;

grant execute on function public.accept_contract() to authenticated;

create or replace function public.delete_student(target_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_teacher() then
    raise exception 'Solo el docente puede eliminar alumnos.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_student_id
      and role = 'student'
  ) then
    raise exception 'Alumno no encontrado.';
  end if;

  delete from auth.users
  where id = target_student_id;
end;
$$;

grant execute on function public.delete_student(uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.deliveries enable row level security;
alter table public.payments enable row level security;

create policy "authenticated can read teams"
on public.teams for select
to authenticated
using (true);

create policy "teachers manage teams"
on public.teams for all
to authenticated
using (public.is_teacher())
with check (public.is_teacher());

create policy "students read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_teacher());

create policy "teachers update profiles"
on public.profiles for update
to authenticated
using (public.is_teacher())
with check (public.is_teacher());

create policy "authenticated can read deliveries"
on public.deliveries for select
to authenticated
using (true);

create policy "teachers manage deliveries"
on public.deliveries for all
to authenticated
using (public.is_teacher())
with check (public.is_teacher());

create policy "students read own payments"
on public.payments for select
to authenticated
using (student_id = auth.uid() or public.is_teacher());

create policy "teachers manage payments"
on public.payments for all
to authenticated
using (public.is_teacher())
with check (public.is_teacher());

insert into public.deliveries (title, details, due_date, max_coins, status, sort_order)
values
  ('Entrega 1 - Presentación del proyecto', 'Rubro, negocio, actores, requerimientos y reglas básicas.', '2026-05-29', 100, 'Cerrada', 1),
  ('Entrega 2 - Modelo conceptual completo', 'Entidades, atributos, relaciones, cardinalidades e integridad.', '2026-06-19', 150, 'Abierta', 2),
  ('Entrega 3 - Modelo relacional y normalización', 'Modelo relacional, claves primarias, foráneas y 3FN.', '2026-07-17', 150, 'Programada', 3),
  ('Entrega 4 - Implementación SQL inicial', 'Tablas, restricciones, integridad referencial y validaciones.', '2026-08-07', 150, 'Programada', 4),
  ('Entrega 5 - Datos de prueba y consultas SQL', 'Carga de datos, consultas básicas, complejas y validación funcional.', '2026-08-21', 150, 'Programada', 5),
  ('Entrega 6 - Integración y revisión técnica', 'Correcciones, consistencia y documentación parcial.', '2026-09-18', 150, 'Programada', 6),
  ('Entrega 7 - Preentrega y defensa técnica', 'Revisión integral, defensa individual, ajustes y autoría.', '2026-10-16', 200, 'Programada', 7),
  ('Entrega final', 'Documentación final, MER, SQL, consultas, datos y defensa.', '2026-10-30', 250, 'Programada', 8)
on conflict (sort_order) do update set
  title = excluded.title,
  details = excluded.details;

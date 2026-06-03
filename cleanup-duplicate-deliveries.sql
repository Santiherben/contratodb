-- Limpia entregas duplicadas creadas por ejecutar varias veces el seed inicial.
-- Conserva una entrega por sort_order, mueve pagos existentes a la entrega conservada
-- y evita nuevos duplicados con un índice único.

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

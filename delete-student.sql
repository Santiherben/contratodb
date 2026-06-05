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

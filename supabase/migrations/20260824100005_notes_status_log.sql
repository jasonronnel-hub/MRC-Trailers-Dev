-- Section 2.5: notes (polymorphic, like ROM's romNotes) and the status audit log.

create table notes (
  id bigint generated always as identity primary key,
  legacy_note_id int,
  entity_type text check (entity_type in ('unit','party','sales_order','dispatch')),
  entity_id bigint not null,
  note_text text not null,
  note_type text,                            -- migrate romNoteTypes labels
  popup boolean default false,               -- must-see warnings (ROM PopUpNote)
  author uuid references auth.users, authored_at timestamptz default now(),
  voided boolean default false
);

create index on notes(entity_type, entity_id);

-- Every status change, who and when (ROM lacks this; we won't).
create table status_log (
  id bigint generated always as identity primary key,
  unit_id bigint references units not null,
  from_status int, to_status int not null,
  changed_by uuid references auth.users, changed_at timestamptz default now(),
  context text                               -- e.g. 'attached to SO-1042'
);

create index on status_log(unit_id);

-- Allow deleting a trip without failing when import flow stamped trip_id on rows.
alter table tf_transactions drop constraint if exists tf_transactions_trip_id_fkey;

alter table tf_transactions
  add constraint tf_transactions_trip_id_fkey
  foreign key (trip_id) references tf_trips(id)
  on delete set null;

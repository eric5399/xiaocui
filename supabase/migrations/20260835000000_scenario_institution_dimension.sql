-- Customer institution is a reporting dimension inside the single operator
-- workspace. It is deliberately separate from organization_id, which remains
-- the RLS/security tenant and is not exposed as a customer-account system.

alter table public.scenarios
  add column if not exists institution_code varchar(6);

alter table public.scenarios
  drop constraint if exists scenarios_institution_code_check;

alter table public.scenarios
  add constraint scenarios_institution_code_check check (
    institution_code is null or institution_code in (
      '000000',
      '110000', '120000', '130000', '140000', '150000',
      '210000', '220000', '230000',
      '310000', '320000', '330000', '340000', '350000', '360000', '370000',
      '410000', '420000', '430000', '440000', '450000', '460000',
      '500000', '510000', '520000', '530000', '540000',
      '610000', '620000', '630000', '640000', '650000',
      '710000', '810000', '820000'
    )
  );

create index if not exists scenarios_organization_institution_idx
  on public.scenarios (organization_id, institution_code);

comment on column public.scenarios.institution_code is
  '单一运营工作区内的客户机构归集维度：000000 为全国，其余为省级行政区划代码。';

-- Gün Kumanda - ERP Supabase projesine eklenen tablolar
-- Yetki: ERP üyeleri (erp_uyeler) + sadece kumanda kullanan ekip (kumanda_uyeler).
-- Kumanda ekibi ERP verilerini (kisiler, islemler...) GÖREMEZ; sadece bu tabloları görür.

create table if not exists public.kumanda_uyeler (
  eposta text primary key,
  ad text,
  ekleyen uuid default auth.uid(),
  eklendi timestamptz not null default now()
);

create or replace function public.kumanda_uye()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null and (
    exists(select 1 from erp_uyeler where kullanici = auth.uid())
    or exists(select 1 from kumanda_uyeler
              where lower(eposta) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
$$;

-- Kaydedilen kumandalar (ortak veritabanı)
create table if not exists public.ir_kumandalar (
  id uuid primary key default gen_random_uuid(),
  kategori text not null default 'diger',
  marka text not null default '',
  model text not null default '',
  notlar text,
  -- Sinyaller: [["Ad","PROTOKOL","HEX",bit] | ["Ad",frekans,[t...]], ...]
  tuslar jsonb not null default '[]'::jsonb,
  -- Ekran düzeni (tuş sırası, renk, genişlik) ve klima ayarları
  duzen jsonb,
  klima jsonb,
  kaynak text not null default 'saha',  -- saha | kopya | tarama | elle | irplus | veritabani
  etiket_foto text,                       -- storage: ir-foto/<yol>
  kisi_id integer references public.kisiler(id) on delete set null,
  calisti_sayisi integer not null default 0,
  silindi boolean not null default false,
  olusturan uuid default auth.uid(),
  olusturan_eposta text default (auth.jwt() ->> 'email'),
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create index if not exists ir_kumandalar_marka_idx on public.ir_kumandalar (kategori, lower(marka));
create index if not exists ir_kumandalar_guncelleme_idx on public.ir_kumandalar (guncelleme);

-- Sahada "bu kumanda çalıştı / çalışmadı" kayıtları
create table if not exists public.ir_saha_kayit (
  id bigint generated always as identity primary key,
  kumanda_id uuid references public.ir_kumandalar(id) on delete cascade,
  veritabani_id text,          -- yerleşik veritabanından ise (ör. tv-123)
  calisti boolean not null,
  notlar text,
  kisi_id integer references public.kisiler(id) on delete set null,
  olusturan uuid default auth.uid(),
  olusturan_eposta text default (auth.jwt() ->> 'email'),
  olusturma timestamptz not null default now()
);

-- Akıllı TV kimlik kartları (model, yazılım, MAC...)
create table if not exists public.tv_kartlari (
  id uuid primary key default gen_random_uuid(),
  kisi_id integer references public.kisiler(id) on delete set null,
  platform text,     -- androidtv | webos | tizen | vestel | sony
  marka text,
  model text,
  yazilim text,
  mac text,
  ip text,
  bilgi jsonb,
  notlar text,
  olusturan uuid default auth.uid(),
  olusturma timestamptz not null default now()
);

-- Güncelleme zamanını otomatik tut
create or replace function public.ir_guncelleme_damgasi()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.guncelleme := now();
  return new;
end $$;
drop trigger if exists ir_kumandalar_guncelleme on public.ir_kumandalar;
create trigger ir_kumandalar_guncelleme before update on public.ir_kumandalar
  for each row execute function public.ir_guncelleme_damgasi();

-- "Çalıştı" sayacını artır
create or replace function public.ir_calisti_artir()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.kumanda_id is not null and new.calisti then
    update ir_kumandalar set calisti_sayisi = calisti_sayisi + 1
     where id = new.kumanda_id;
  end if;
  return new;
end $$;
drop trigger if exists ir_saha_kayit_sayac on public.ir_saha_kayit;
create trigger ir_saha_kayit_sayac after insert on public.ir_saha_kayit
  for each row execute function public.ir_calisti_artir();

-- RLS
alter table public.kumanda_uyeler enable row level security;
alter table public.ir_kumandalar enable row level security;
alter table public.ir_saha_kayit enable row level security;
alter table public.tv_kartlari enable row level security;

drop policy if exists kumanda_uyeler_oku on public.kumanda_uyeler;
create policy kumanda_uyeler_oku on public.kumanda_uyeler
  for select to authenticated using ((select public.kumanda_uye()));
drop policy if exists kumanda_uyeler_yonet on public.kumanda_uyeler;
create policy kumanda_uyeler_yonet on public.kumanda_uyeler
  for all to authenticated using ((select public.erp_uye()))
  with check ((select public.erp_uye()));

drop policy if exists ir_kumandalar_ekip on public.ir_kumandalar;
create policy ir_kumandalar_ekip on public.ir_kumandalar
  for all to authenticated using ((select public.kumanda_uye()))
  with check ((select public.kumanda_uye()));

drop policy if exists ir_saha_kayit_ekip on public.ir_saha_kayit;
create policy ir_saha_kayit_ekip on public.ir_saha_kayit
  for all to authenticated using ((select public.kumanda_uye()))
  with check ((select public.kumanda_uye()));

drop policy if exists tv_kartlari_ekip on public.tv_kartlari;
create policy tv_kartlari_ekip on public.tv_kartlari
  for all to authenticated using ((select public.kumanda_uye()))
  with check ((select public.kumanda_uye()));

revoke all on function public.kumanda_uye() from anon;

-- Etiket fotoğrafları (özel kova)
insert into storage.buckets (id, name, public)
values ('ir-foto', 'ir-foto', false)
on conflict (id) do nothing;

drop policy if exists ir_foto_ekip on storage.objects;
create policy ir_foto_ekip on storage.objects
  for all to authenticated
  using (bucket_id = 'ir-foto' and (select public.kumanda_uye()))
  with check (bucket_id = 'ir-foto' and (select public.kumanda_uye()));

-- Fonksiyon yetkilerini sıkılaştır (anon çağıramasın)
revoke execute on function public.kumanda_uye() from public, anon;
grant execute on function public.kumanda_uye() to authenticated;
revoke execute on function public.ir_calisti_artir() from public, anon, authenticated;
revoke execute on function public.ir_guncelleme_damgasi() from public, anon, authenticated;

-- 2026-11: kumanda kodu (arkasındaki etiket) ve uyumlu modeller
alter table public.ir_kumandalar add column if not exists kumanda_kodu text;
alter table public.ir_kumandalar add column if not exists uyumlu text;

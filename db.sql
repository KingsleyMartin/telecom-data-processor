------------------------------------------
-- TO CREATE ALL THE DATABASE STRUCTURE --
------------------------------------------

BEGIN;

-- Tabla Partner
CREATE TABLE IF NOT EXISTS partner (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- Tabla Address
CREATE TABLE IF NOT EXISTS address (
  id BIGSERIAL PRIMARY KEY,
  address1 TEXT NOT NULL,
  address2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL
);

-- Tabla Customer
CREATE TABLE IF NOT EXISTS customer (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address_id BIGINT NOT NULL
    REFERENCES address(id)
    ON DELETE RESTRICT,
  partner_id BIGINT NOT NULL
    REFERENCES partner(id)
    ON DELETE CASCADE
);

-- Tabla Mapping_Profile
CREATE TABLE IF NOT EXISTS mapping_profile (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NOT NULL
    REFERENCES partner(id)
    ON DELETE CASCADE,
  name TEXT NOT NULL
);

-- Tabla Mapping_Field
CREATE TABLE IF NOT EXISTS mapping_field (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT NOT NULL
    REFERENCES mapping_profile(id)
    ON DELETE CASCADE,
  column_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL
);

COMMIT;



-------------------------------------
-- TO DELETE ALL THE DATABASE DATA --
-------------------------------------

BEGIN;

TRUNCATE TABLE
  customer,
  mapping_field,
  mapping_profile,
  address,
  partner
RESTART IDENTITY
CASCADE;

COMMIT;
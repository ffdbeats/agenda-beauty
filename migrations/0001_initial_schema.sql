-- Agenda Beauty — schema inicial não destrutivo.
-- CREATE TABLE/INDEX IF NOT EXISTS não apaga nem recria tabelas existentes.
-- Antes de aplicar em produção, confira o esquema atual do D1 e faça backup.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS salons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Meu espaço de beleza',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'salon_owner' CHECK (role IN ('salon_owner', 'professional', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_salon_id ON users(salon_id);

CREATE TABLE IF NOT EXISTS professionals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Beleza',
  accent_color TEXT NOT NULL DEFAULT '#a34370',
  work_days TEXT NOT NULL DEFAULT 'Segunda a sexta',
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  prep_minutes INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id)
);

CREATE INDEX IF NOT EXISTS idx_professionals_salon ON professionals(salon_id);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration INTEGER NOT NULL DEFAULT 60 CHECK (duration > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id),
  FOREIGN KEY (professional_id) REFERENCES professionals(id)
);

CREATE INDEX IF NOT EXISTS idx_services_salon_professional ON services(salon_id, professional_id);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id),
  FOREIGN KEY (professional_id) REFERENCES professionals(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_calendar ON appointments(salon_id, professional_id, appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appointments_service ON appointments(salon_id, service_id);

-- Cria o salão de teste somente se o ID 1 ainda não existir.
-- Não modifica nem remove qualquer registro existente.
INSERT OR IGNORE INTO salons (id, name, status)
VALUES (1, 'Meu espaço de beleza', 'active');

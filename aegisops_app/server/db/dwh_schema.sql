-- ═════════════════════════════════════════════════════════════════════
-- AegisOps DWH — Хранилище данных для газотранспортной системы
-- ═════════════════════════════════════════════════════════════════════
--
-- Архитектура: Star Schema с事实 (fact) и измерениями (dimension)
-- Целевая СУБД: PostgreSQL + TimescaleDB
-- Fallback: SQLite (с адаптированным синтаксисом)
-- ═════════════════════════════════════════════════════════════════════

-- ─── DIMENSION TABLES (Измерения) ──────────────────────────────────

-- Измерение: Регионы/Территории
CREATE TABLE IF NOT EXISTS dim_region (
    region_id        SERIAL PRIMARY KEY,
    region_name      TEXT NOT NULL UNIQUE,
    region_code      TEXT,
    territory_type   TEXT DEFAULT 'область',  -- область, район, город
    population       INTEGER DEFAULT 0,
    industrial_zones INTEGER DEFAULT 0,
    gas_network_km   NUMERIC(12,2) DEFAULT 0,
    timezone         TEXT DEFAULT 'Asia/Tashkent',
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Измерение: Потребители газа
CREATE TABLE IF NOT EXISTS dim_consumer (
    consumer_id      SERIAL PRIMARY KEY,
    consumer_name    TEXT NOT NULL,
    consumer_type    TEXT NOT NULL DEFAULT 'бытовой',  -- бытовой, коммунальный, промышленный
    region_id        INTEGER REFERENCES dim_region(region_id),
    address          TEXT,
    connection_date  DATE,
    contract_number  TEXT,
    tariff_category  TEXT DEFAULT 'стандарт',
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Измерение: Время (для ускорения аналитических запросов)
CREATE TABLE IF NOT EXISTS dim_date (
    date_key         INTEGER PRIMARY KEY,  -- формат YYYYMMDD
    full_date        DATE NOT NULL UNIQUE,
    day_of_week      SMALLINT,
    day_name         TEXT,
    day_of_month     SMALLINT,
    day_of_year      SMALLINT,
    week_of_year     SMALLINT,
    month            SMALLINT,
    month_name       TEXT,
    quarter          SMALLINT,
    year             INTEGER,
    is_weekend       BOOLEAN DEFAULT FALSE,
    is_holiday       BOOLEAN DEFAULT FALSE,
    season           TEXT  -- зима, весна, лето, осень
);

-- Измерение: Точки измерения (датчики SCADA)
CREATE TABLE IF NOT EXISTS dim_measurement_point (
    point_id         SERIAL PRIMARY KEY,
    point_name       TEXT NOT NULL,
    point_type       TEXT DEFAULT 'pressure',  -- pressure, flow, temperature, quality
    node_id          TEXT,                     -- OPC UA node ID
    connector_id     INTEGER,
    region_id        INTEGER REFERENCES dim_region(region_id),
    pipeline_segment TEXT,
    latitude         NUMERIC(10,7),
    longitude        NUMERIC(10,7),
    unit_of_measure  TEXT DEFAULT 'MPa',
    max_value        NUMERIC(12,4),
    min_value        NUMERIC(12,4),
    alarm_high       NUMERIC(12,4),
    alarm_low        NUMERIC(12,4),
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Измерение: Тарифы
CREATE TABLE IF NOT EXISTS dim_tariff (
    tariff_id        SERIAL PRIMARY KEY,
    tariff_name      TEXT NOT NULL,
    consumer_type    TEXT NOT NULL,
    region_id        INTEGER REFERENCES dim_region(region_id),
    price_per_1000m3 NUMERIC(12,2) NOT NULL,
    currency         TEXT DEFAULT 'UZS',
    valid_from       DATE NOT NULL,
    valid_to         DATE,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ─── FACT TABLES (Факты) ───────────────────────────────────────────

-- Факт: Потребление газа (почасовые/дневные агрегаты)
CREATE TABLE IF NOT EXISTS fact_gas_consumption (
    id               SERIAL PRIMARY KEY,
    date_key         INTEGER REFERENCES dim_date(date_key),
    consumer_id      INTEGER REFERENCES dim_consumer(consumer_id),
    point_id         INTEGER REFERENCES dim_measurement_point(point_id),
    consumption_m3   NUMERIC(14,4) DEFAULT 0,     -- объём в м³
    consumption_kcm  NUMERIC(14,6) DEFAULT 0,     -- объём в тыс. м³
    peak_flow_m3h    NUMERIC(12,4) DEFAULT 0,     -- пиковый расход м³/ч
    avg_pressure_mpa NUMERIC(8,4) DEFAULT 0,      -- среднее давление МПа
    avg_temperature  NUMERIC(6,2) DEFAULT 0,       -- средняя температура °C
    quality_index    NUMERIC(5,4) DEFAULT 1.0,     -- качество газа (0-1)
    reading_status   TEXT DEFAULT 'normal',        -- normal, estimated, missing
    recorded_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_consumption_date ON fact_gas_consumption(date_key);
CREATE INDEX IF NOT EXISTS idx_fact_consumption_consumer ON fact_gas_consumption(consumer_id);
CREATE INDEX IF NOT EXISTS idx_fact_consumption_region ON fact_gas_consumption(point_id);

-- Факт: Сupply газа (поступление от поставщиков)
CREATE TABLE IF NOT EXISTS fact_gas_supply (
    id               SERIAL PRIMARY KEY,
    date_key         INTEGER REFERENCES dim_date(date_key),
    supplier_name    TEXT NOT NULL,
    source_type      TEXT DEFAULT 'pipeline',      -- pipeline, underground_storage, lng
    region_id        INTEGER REFERENCES dim_region(region_id),
    volume_m3        NUMERIC(14,4) DEFAULT 0,
    volume_kcm       NUMERIC(14,6) DEFAULT 0,
    calorific_value  NUMERIC(8,4) DEFAULT 0,       -- теплота сгорания
    cost_per_1000m3  NUMERIC(12,2) DEFAULT 0,
    quality_grade    TEXT DEFAULT 'GOST',
    recorded_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_supply_date ON fact_gas_supply(date_key);

-- Факт: Баланс газа (агрегированный daily)
CREATE TABLE IF NOT EXISTS fact_gas_balance (
    id               SERIAL PRIMARY KEY,
    date_key         INTEGER REFERENCES dim_date(date_key) NOT NULL,
    region_id        INTEGER REFERENCES dim_region(region_id),
    total_supply_kcm NUMERIC(14,6) DEFAULT 0,     -- всего поступило
    total_demand_kcm NUMERIC(14,6) DEFAULT 0,     -- всего потреблено
    net_balance_kcm  NUMERIC(14,6) DEFAULT 0,     -- баланс (supply - demand)
    losses_kcm       NUMERIC(14,6) DEFAULT 0,     -- технологические потери
    self_use_kcm     NUMERIC(14,6) DEFAULT 0,     -- собственные нужды
    storage_inject   NUMERIC(14,6) DEFAULT 0,     -- закачка в ПХГ
    storage_withdraw NUMERIC(14,6) DEFAULT 0,     -- отбор из ПХГ
    weather_temp_c   NUMERIC(6,2),                -- средняя температура
    weather_desc     TEXT,                         -- погодные условия
    deficit_flag     BOOLEAN DEFAULT FALSE,        -- дефицитный день
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(date_key, region_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_balance_date ON fact_gas_balance(date_key, region_id);
CREATE INDEX IF NOT EXISTS idx_fact_balance_deficit ON fact_gas_balance(deficit_flag) WHERE deficit_flag = TRUE;

-- Факт: Финансовые операции (биллинг)
CREATE TABLE IF NOT EXISTS fact_billing (
    id               SERIAL PRIMARY KEY,
    date_key         INTEGER REFERENCES dim_date(date_key),
    consumer_id      INTEGER REFERENCES dim_consumer(consumer_id),
    tariff_id        INTEGER REFERENCES dim_tariff(tariff_id),
    invoice_number   TEXT,
    consumption_m3   NUMERIC(14,4) DEFAULT 0,
    tariff_rate      NUMERIC(12,2) DEFAULT 0,
    total_amount     NUMERIC(14,2) DEFAULT 0,     -- сумма к оплате
    subsidy_amount   NUMERIC(14,2) DEFAULT 0,     -- субсидия
    paid_amount      NUMERIC(14,2) DEFAULT 0,     -- оплачено
    receivable       NUMERIC(14,2) DEFAULT 0,     -- задолженность
    payment_delay    INTEGER DEFAULT 0,            -- дней просрочки
    payment_status   TEXT DEFAULT 'pending',       -- pending, partial, paid, overdue
    recorded_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_billing_date ON fact_billing(date_key);
CREATE INDEX IF NOT EXISTS idx_fact_billing_consumer ON fact_billing(consumer_id);
CREATE INDEX IF NOT EXISTS idx_fact_billing_status ON fact_billing(payment_status);


-- ─── DATA MARTS (Витрины данных) ───────────────────────────────────

-- Витрина: Ежедневный баланс по регионам (для диспетчерского дашборда)
CREATE OR REPLACE VIEW v_daily_balance_by_region AS
SELECT
    d.full_date,
    COALESCE(r.region_name, 'ВСЕГО') AS region_name,
    SUM(fb.total_supply_kcm) AS supply_kcm,
    SUM(fb.total_demand_kcm) AS demand_kcm,
    SUM(fb.net_balance_kcm) AS balance_kcm,
    SUM(fb.losses_kcm) AS losses_kcm,
    fb.weather_temp_c,
    fb.deficit_flag
FROM fact_gas_balance fb
JOIN dim_date d ON d.date_key = fb.date_key
LEFT JOIN dim_region r ON r.region_id = fb.region_id
GROUP BY d.full_date, r.region_name, fb.weather_temp_c, fb.deficit_flag
ORDER BY d.full_date DESC;

-- Витрина: Рейтинг потребителей по задолженности
CREATE OR REPLACE VIEW v_consumer_debt_ranking AS
SELECT
    c.consumer_id,
    c.consumer_name,
    c.consumer_type,
    COALESCE(r.region_name, 'N/A') AS region,
    SUM(b.receivable) AS total_debt,
    SUM(b.total_amount) AS total_billed,
    ROUND(SUM(b.receivable) / NULLIF(SUM(b.total_amount), 0) * 100, 2) AS debt_ratio_pct,
    AVG(b.payment_delay) AS avg_delay_days,
    COUNT(*) AS invoice_count,
    SUM(CASE WHEN b.payment_status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count
FROM dim_consumer c
LEFT JOIN dim_region r ON r.region_id = c.region_id
LEFT JOIN fact_billing b ON b.consumer_id = c.consumer_id
GROUP BY c.consumer_id, c.consumer_name, c.consumer_type, r.region_name
HAVING SUM(b.receivable) > 0
ORDER BY total_debt DESC;

-- Витрина: Потребление по типам за месяц (для финансовых отчётов)
CREATE OR REPLACE VIEW v_monthly_consumption_summary AS
SELECT
    EXTRACT(YEAR FROM d.full_date)::INTEGER AS year,
    EXTRACT(MONTH FROM d.full_date)::INTEGER AS month,
    c.consumer_type,
    COALESCE(r.region_name, 'N/A') AS region,
    SUM(fc.consumption_kcm) AS total_consumption_kcm,
    AVG(fc.consumption_kcm) AS avg_daily_consumption_kcm,
    MAX(fc.peak_flow_m3h) AS max_peak_flow,
    SUM(fb.total_amount) AS total_revenue,
    SUM(fb.subsidy_amount) AS total_subsidy,
    SUM(fb.paid_amount) AS total_paid,
    SUM(fb.receivable) AS total_receivable
FROM fact_gas_consumption fc
JOIN dim_date d ON d.date_key = fc.date_key
JOIN dim_consumer c ON c.consumer_id = fc.consumer_id
LEFT JOIN dim_region r ON r.region_id = c.region_id
LEFT JOIN fact_billing fb ON fb.consumer_id = c.consumer_id
    AND EXTRACT(MONTH FROM d.full_date) = EXTRACT(MONTH FROM fb.recorded_at)
GROUP BY 1, 2, 3, 4
ORDER BY year DESC, month DESC, c.consumer_type;


-- ─── RESULTS TABLE (для хранения прогнозов ML) ─────────────────────

CREATE TABLE IF NOT EXISTS forecast_results (
    id               SERIAL PRIMARY KEY,
    forecast_date    DATE NOT NULL,
    model_name       TEXT NOT NULL,
    metric_name      TEXT NOT NULL,
    predicted_value  NUMERIC(14,6),
    lower_bound      NUMERIC(14,6),
    upper_bound      NUMERIC(14,6),
    actual_value     NUMERIC(14,6),
    error_pct        NUMERIC(8,4),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_metric ON forecast_results(metric_name, forecast_date);


-- ─── TIMESCALEDB: Телеметрия (гипертаблица) ────────────────────────
-- Примечание: эта таблица уже создаётся в MIGRATIONS_TIMESCALE (pg.js)
-- Здесь добавляем дополнительные аналитические индексы

-- Автоматическое сжатие данных старше 30 дней (если TimescaleDB)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    -- Добавляем continuous aggregate для часовой агрегации
    CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', time) AS bucket,
      connector_id,
      node_id,
      metric_name,
      AVG(value) AS avg_value,
      MIN(value) AS min_value,
      MAX(value) AS max_value,
      COUNT(*) AS readings_count
    FROM telemetry_readings
    GROUP BY bucket, connector_id, node_id, metric_name
    WITH NO DATA;

    -- Refresh policy: обновлять каждый час
    SELECT add_retention_policy('telemetry_readings', INTERVAL '90 days');
    SELECT add_continuous_aggregate_policy('telemetry_hourly',
        start_offset => INTERVAL '3 hours',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour');
  END IF;
END $$;

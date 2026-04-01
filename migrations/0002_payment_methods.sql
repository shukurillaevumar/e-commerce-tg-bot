ALTER TABLE payments ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'telegram_stars';
ALTER TABLE payments ADD COLUMN provider_invoice_id TEXT;
ALTER TABLE payments ADD COLUMN provider_currency TEXT;
ALTER TABLE payments ADD COLUMN provider_amount TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_method_invoice ON payments (payment_method, provider_invoice_id);

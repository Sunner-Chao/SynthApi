-- Add a credential-free connectivity probe mode while preserving the existing
-- challenge request behavior for all existing monitors.
ALTER TABLE channel_monitors
    ADD COLUMN IF NOT EXISTS probe_mode VARCHAR(32) NOT NULL DEFAULT 'model_request';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'channel_monitors_probe_mode_check'
          AND conrelid = 'channel_monitors'::regclass
    ) THEN
        ALTER TABLE channel_monitors
            ADD CONSTRAINT channel_monitors_probe_mode_check
            CHECK (probe_mode IN ('model_request', 'connectivity_only'));
    END IF;
END $$;

-- Add password_hash column to usuarios table
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios(estado);

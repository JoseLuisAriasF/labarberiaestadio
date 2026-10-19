-- Fase 1: campos de contacto para notificaciones por email, teléfono y WhatsApp
ALTER TABLE barberos ADD COLUMN IF NOT EXISTS email_real text;
ALTER TABLE barberos ADD COLUMN IF NOT EXISTS telefono_real text;
ALTER TABLE barberos ADD COLUMN IF NOT EXISTS whatsapp text;

-- Actualizar el RPC barbero_actualizar_perfil para aceptar los nuevos campos
CREATE OR REPLACE FUNCTION barbero_actualizar_perfil(
  p_avatar text DEFAULT NULL,
  p_bio text DEFAULT '',
  p_horario jsonb DEFAULT '{}'::jsonb,
  p_especialidades text[] DEFAULT '{}',
  p_yape text DEFAULT NULL,
  p_plin text DEFAULT NULL,
  p_email_real text DEFAULT NULL,
  p_telefono_real text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE barberos SET
    avatar_url = p_avatar,
    bio = p_bio,
    horario_atencion = p_horario,
    especialidades_bestseller = p_especialidades,
    yape_numero = p_yape,
    plin_numero = p_plin,
    email_real = p_email_real,
    telefono_real = p_telefono_real,
    whatsapp = p_whatsapp
  WHERE usuario_id = auth.uid();
END;
$$;

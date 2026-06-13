#!/bin/bash

# Navigate to project directory
cd /home/juan/Escritorio/Programacion/Proyectos/entradas_kermingo

# 1. Check if the current date is past Saturday June 20, 2026
CURRENT_DATE=$(date +%Y%m%d)
END_DATE=20260620

if [ "$CURRENT_DATE" -gt "$END_DATE" ]; then
  echo "Cron job disabled as the event date has passed."
  exit 0
fi

# 2. Run database integrity check
npx tsx check-db-status.ts > /tmp/kermingo-db-check.log 2>&1
CHECK_STATUS=$?

# Setup GUI variables for Hyprland desktop notifications
export DISPLAY=:0
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/1000
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

if [ $CHECK_STATUS -ne 0 ]; then
  # Alert the user!
  ERROR_MSG="La base de datos de Kermingo está caída o fue sobrescrita!"
  if [ $CHECK_STATUS -eq 2 ]; then
    ERROR_MSG="¡DETECTADO! La base de datos fue sobrescrita por las tablas de subtes!"
  fi
  
  echo "🚨 CRITICAL ERROR: $ERROR_MSG" >> /tmp/kermingo-db-status.log
  
  # Send desktop notification
  notify-send -u critical "🚨 ALERTA BD KERMINGO" "$ERROR_MSG\nRevisa /tmp/kermingo-db-check.log"
  
  # Optional sound alert if speaker is configured
  paplay /usr/share/sounds/freedesktop/stereo/suspend-error.oga || aplay /usr/share/sounds/alsa/Noise.wav || true
else
  # 3. If check passes, run database backup
  npx tsx backup-db.ts >> /tmp/kermingo-db-status.log 2>&1
  echo "✓ Backup completed at $(date)" >> /tmp/kermingo-db-status.log
fi

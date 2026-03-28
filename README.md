# ⚔️ AOE2 ELO Dashboard — aoe-ferkus

Dashboard para seguimiento de ELO de Age of Empires II entre amigos.

## ¿Qué hace?

- Muestra la evolución de ELO a lo largo del tiempo para cada jugador
- Soporta múltiples modos de juego (1v1 y TG)
- Se actualiza automáticamente una vez al día al abrir el dashboard
- Filtros por jugador, modo y rango de fechas
- Historial completo desde julio 2025

## Cómo funciona

Al abrir el dashboard, el navegador del usuario fetchea directamente la API de aoe2companion con un delay entre requests para no saturarla. Los datos se guardan en Upstash (Redis) via un endpoint en Vercel. El historial se acumula día a día automáticamente.

```
NAVEGADOR
   ↓ (una vez por día, al abrir el dashboard)
API de aoe2companion
   ↓
/api/cron  →  Upstash Redis (Vercel KV)
                   ↓
              /api/data  →  Dashboard
```

## Estructura del proyecto

```
aoe_ferkus/
├── index.html        # Estructura de la página
├── styles.css        # Estilos (tema medieval oscuro)
├── script.js         # Lógica del dashboard, fetch de ELO y gráficos
├── vercel.json       # Configuración del proyecto Vercel
└── api/
    ├── cron.js       # Endpoint que guarda los datos en la base de datos
    └── data.js       # Endpoint que el dashboard consulta para obtener el historial
```

## Tecnologías

- **Frontend:** HTML, CSS, JavaScript, Chart.js
- **Backend:** Vercel Serverless Functions
- **Base de datos:** Upstash Redis (via Vercel Storage)
- **Fuente de datos:** [aoe2companion.com API](https://data.aoe2companion.com)
- **Deploy:** Vercel (automático al pushear a `main`)

## Variables de entorno (configuradas en Vercel)

| Variable | Descripción |
|---|---|
| `KV_REST_API_URL` | URL de la base de datos Upstash (generada automáticamente al crear el KV) |
| `KV_REST_API_TOKEN` | Token de acceso a Upstash (generado automáticamente) |
| `CRON_SECRET` | Clave secreta para proteger el endpoint `/api/cron` |

## Jugadores tracked

Los Steam IDs están hardcodeados en `script.js` y `api/cron.js`. Para agregar o quitar jugadores, editá el array `PLAYERS` en ambos archivos.

## Actualización de datos

Los datos se fetchean automáticamente **una vez por día** cuando alguien abre el dashboard. El navegador guarda en `localStorage` la fecha de la última actualización para no repetir el fetch innecesariamente.

Para forzar una actualización manual, pegá esto en la consola del navegador:
```javascript
localStorage.removeItem("elo_ultima_actualizacion")
location.reload()
```

## Migración de historial

Si necesitás importar datos históricos desde un CSV de Google Sheets, usá el script `migrar_historial.js` desde la consola del navegador. El CSV debe tener las columnas: `Fecha, Steam ID, Nombre, Modo, ELO, Rank, Partidas, Winrate, Racha, Drops`.

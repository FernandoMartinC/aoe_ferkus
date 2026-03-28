[README.md](https://github.com/user-attachments/files/26318885/README.md)
# ⚔️ AOE2 ELO Dashboard — aoe-ferkus

Dashboard para seguimiento de ELO de Age of Empires II entre amigos.

## ¿Qué hace?

- Muestra la evolución de ELO a lo largo del tiempo para cada jugador
- Soporta múltiples modos de juego (1v1 y TG)
- Se actualiza automáticamente cada hora
- Filtros por jugador, modo y rango de fechas

## Estructura del proyecto

```
aoe_ferkus/
├── index.html        # Estructura de la página
├── styles.css        # Estilos (tema medieval oscuro)
├── script.js         # Lógica del dashboard y gráficos
├── vercel.json       # Configuración del cron job (cada hora)
└── api/
    ├── cron.js       # Obtiene ELO de la API y guarda en la base de datos
    └── data.js       # Endpoint que el dashboard consulta para obtener los datos
```

## Tecnologías

- **Frontend:** HTML, CSS, JavaScript, Chart.js
- **Backend:** Vercel Serverless Functions
- **Base de datos:** Upstash Redis (via Vercel)
- **Fuente de datos:** [aoe2companion.com API](https://data.aoe2companion.com)
- **Deploy:** Vercel (automático al pushear a `main`)

## Variables de entorno (configuradas en Vercel)

| Variable | Descripción |
|---|---|
| `KV_REST_API_URL` | URL de la base de datos Upstash (generada automáticamente) |
| `KV_REST_API_TOKEN` | Token de acceso a Upstash (generado automáticamente) |
| `CRON_SECRET` | Clave secreta para proteger el endpoint del cron |

## Jugadores tracked

Los Steam IDs están configurados en `api/cron.js`. Para agregar o quitar jugadores, editá el array `PLAYERS` en ese archivo.

## Cómo funciona el cron

El archivo `vercel.json` le dice a Vercel que ejecute `/api/cron` cada hora (`0 * * * *`). Ese endpoint:
1. Consulta la API de AOE2 por cada jugador y modo
2. Parsea el ELO, rank, winrate, racha y drops
3. Guarda los datos en Upstash Redis

El dashboard llama a `/api/data` para obtener el historial completo y renderizarlo.

# Horas de estudio

App simple para registrar horas de estudio por ramo y por persona, con cronómetro, bitácora y progreso.

## Funciones

- **Cuentas**: cada persona crea su cuenta (usuario y contraseña) y registra solo sus propias horas. Todas las personas con sesión iniciada ven el progreso de todas.
- **Cronómetro**: elige persona y ramo, inicia, pausa y detén. Al detener se pide un título y una descripción de lo estudiado, y el tiempo se suma al ramo. El tiempo sigue corriendo aunque recargues la página.
- **Registro manual** de sesiones (horas y minutos).
- **Mínimo de horas al día** por persona: barra de avance del día, días cumplidos (verde) o no cumplidos (rojo) y racha de días seguidos. Si no cumpliste tu mínimo ayer, al entrar aparece una **animación de castigo**.
- **Metas**: pruebas y trabajos con fecha y ramo; muestra cuántos días faltan, las horas estudiadas desde que se agregó y se pueden marcar como listas.
- **Progreso por persona**: horas totales, actividad de los últimos 7 días y avance por ramo (contra la meta, si la tiene).
- **Ramos**: horas totales y quién ha estudiado más.
- **Bitácora**: todas las sesiones con su título y descripción, con filtros por persona y ramo.
- **Ramos y cuenta**: ramos compartidos (con color y meta de horas opcional; solo quien creó un ramo puede borrarlo), tu mínimo diario y la lista de personas.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre http://localhost:3000. En local los datos se guardan en `.data/db.json`.

## Despliegue en Vercel

1. Sube esta carpeta a un repositorio de GitHub e impórtalo en [vercel.com/new](https://vercel.com/new) (o ejecuta `npx vercel`).
2. En el proyecto de Vercel, ve a **Storage → Create Database → Upstash for Redis** (plan gratuito) y conéctala al proyecto. Esto agrega automáticamente las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. Vuelve a desplegar (**Deployments → Redeploy**).

También funciona con una base de Upstash creada por fuera: define `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en las variables de entorno.

Opcional: define `AUTH_SECRET` (cualquier texto largo y aleatorio) para firmar las sesiones. Si no existe, se usa el token de Upstash.

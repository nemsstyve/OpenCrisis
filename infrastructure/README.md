# Infrastructure OpenCrisis

## Architecture 3 VMs sur Otarie

| VM | IP | Rôle |
|---|---|---|
| VM1 | 192.168.2.33 | Stack OpenCrisis (Nginx, React, Node.js, PostgreSQL, Redis) |
| VM2 | 192.168.2.213 | OpenCTI (Elasticsearch, MinIO, RabbitMQ, Redis, Platform) |
| VM3 | 192.168.2.5 | Monitoring (Uptime Kuma) |

## VM1 — OpenCrisis
- Docker Compose : `docker-compose.yml` à la racine
- HTTPS avec certificats auto-signés dans `certs/`
- Nginx reverse proxy sur port 443/80

## VM2 — OpenCTI
- URL : http://192.168.2.213:8080
- Stack complète OpenCTI 6.x
- Token API : configuré dans `.env` de VM1

## VM3 — Uptime Kuma
- URL : http://192.168.2.5:3001/status/opencrisis
- 3 sondes actives (OpenCrisis, Backend API, OpenCTI)
- Status page publique

# VM3 — Uptime Kuma

## Accès
- URL monitoring : http://192.168.2.5:3001
- Status page publique : http://192.168.2.5:3001/status/opencrisis

## Sondes configurées
| Sonde | URL | Intervalle |
|---|---|---|
| OpenCrisis Frontend | https://192.168.2.33 | 60s |
| OpenCrisis API | https://192.168.2.33/api/health | 60s |
| OpenCTI | http://192.168.2.213:8080 | 60s |

## Déploiement
\`\`\`bash
docker run -d \
  --restart=always \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --name uptime-kuma \
  louislam/uptime-kuma:1
\`\`\`

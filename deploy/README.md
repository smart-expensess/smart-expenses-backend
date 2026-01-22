# Smart Expenses Deployment

This folder mirrors the production deployment setup used on the server.

- `docker-compose.yml` runs Postgres + backend + frontend (services + networks)
- Reverse proxy config lives in `/opt/reverse-proxy/nginx/default.conf` on the server

To deploy:
1) copy/update compose + env files
2) `docker compose up -d --build`

# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
# The proxy CA secret is optional outside managed cloud environments.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true; else npm ci --strict-ssl=true; fi
COPY --chown=node:node . .
# Prisma validates schema environment variables while generating the client.
# This password-free placeholder is used only for compilation; no database is contacted.
RUN chmod 755 /app && DATABASE_URL=postgresql://build@localhost:5432/build npm run build
ENV NODE_ENV=production PORT=3001
USER node
EXPOSE 3001
CMD ["npm","start"]

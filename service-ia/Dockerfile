FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY sql ./sql
COPY proposition-proto ./proposition-proto
COPY src ./src

# cree les tables puis demarre le service
CMD ["sh", "-c", "npx tsx src/init-db.ts && npx tsx src/index.ts"]
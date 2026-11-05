FROM node:20-alpine AS build
WORKDIR /app
COPY gateway/package*.json ./
RUN npm install
COPY gateway/tsconfig.json ./
COPY gateway/src ./src
COPY proto ./proto
ENV PROTO_DIR=/app/proto
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY gateway/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/proto ./proto
ENV PROTO_DIR=/app/proto
USER node
CMD ["npm", "start"]

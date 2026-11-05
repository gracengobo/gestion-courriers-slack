FROM node:20-alpine AS build
WORKDIR /app/service-notification
COPY service-notification/package.json service-notification/package-lock.json ./
RUN npm ci
COPY service-notification/prisma ./prisma
RUN npx prisma generate
COPY service-notification/tsconfig.json ./
COPY service-notification/src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/service-notification
COPY service-notification/package.json service-notification/package-lock.json ./
RUN npm ci
COPY --from=build /app/service-notification/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/service-notification/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/service-notification/dist ./dist
COPY service-notification/prisma ./prisma
COPY commun /app/commun
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

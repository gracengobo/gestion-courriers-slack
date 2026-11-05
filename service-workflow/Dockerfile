FROM node:20-alpine AS build
WORKDIR /app/service-workflow
COPY service-workflow/package.json service-workflow/package-lock.json ./
RUN npm ci
COPY service-workflow/prisma ./prisma
RUN npx prisma generate
COPY service-workflow/tsconfig.json ./
COPY service-workflow/src ./src
COPY service-workflow/proto ./proto
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/service-workflow
COPY service-workflow/package.json service-workflow/package-lock.json ./
RUN npm ci
COPY --from=build /app/service-workflow/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/service-workflow/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/service-workflow/dist ./dist
COPY service-workflow/prisma ./prisma
COPY service-workflow/proto ./proto
EXPOSE 50052
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS prisma-cli
WORKDIR /prisma-cli
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev \
  && npm install prisma@^6.5.0 --no-save \
  && npx prisma generate

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=prisma-cli /prisma-cli/node_modules /app/prisma-cli/node_modules
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
COPY docker/seed-admin.mjs /app/docker/seed-admin.mjs

RUN chmod +x /app/docker/entrypoint.sh \
  && mkdir -p /data \
  && chown -R nextjs:nodejs /data /app/docker /app/prisma-cli

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/app/docker/entrypoint.sh"]
